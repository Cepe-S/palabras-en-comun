import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestSession,
  diagnoseSilence,
  GIVE_UP_MS,
  ICE_MESSAGE,
  PUBLISHING_MESSAGE,
  type Session,
} from './room'
import type { Link, StrategyName } from './transport'

class FakeLink implements Link {
  onMessage: (data: string, peerId: string) => void = () => {}
  onPeerJoin: (peerId: string) => void = () => {}
  onPeerLeave: (peerId: string) => void = () => {}
  onFailure: (strategy: StrategyName, error: string) => void = () => {}
  onSignaling: (open: boolean) => void = () => {}
  signalingOpen = false
  strategies: string[] = []
  used: StrategyName[] = []

  use(name: StrategyName): Promise<void> {
    this.used.push(name)
    this.strategies = [...this.used]
    return Promise.resolve()
  }

  sendTo(): Promise<boolean> {
    return Promise.resolve(true)
  }

  broadcast(): void {}

  leave(): void {}

  relay(open: boolean): void {
    this.signalingOpen = open
    this.onSignaling(open)
  }

  join(peerId: string): void {
    this.onPeerJoin(peerId)
  }

  leavePeer(peerId: string): void {
    this.onPeerLeave(peerId)
  }

  receive(peerId: string, data: string): void {
    this.onMessage(data, peerId)
  }

  fail(strategy: StrategyName, error: string): void {
    this.onFailure(strategy, error)
  }
}

function hello(playerId: string, name: string): string {
  return JSON.stringify({ t: 'hello', playerId, name })
}

describe('diagnoseSilence', () => {
  it('espera antes del plazo', () => {
    expect(diagnoseSilence({ elapsedMs: GIVE_UP_MS - 1, relaySeen: true, iceFailed: false })).toBe('wait')
  })

  it('si nunca abrió un relay, el problema es la señalización', () => {
    expect(diagnoseSilence({ elapsedMs: GIVE_UP_MS, relaySeen: false, iceFailed: false })).toBe('offline')
  })

  it('si los relays respondieron y no hubo SDP, la sala no está', () => {
    expect(diagnoseSilence({ elapsedMs: GIVE_UP_MS, relaySeen: true, iceFailed: false })).toBe('notFound')
  })

  it('un fallo de ICE no se disfraza de sala inexistente', () => {
    expect(diagnoseSilence({ elapsedMs: GIVE_UP_MS, relaySeen: true, iceFailed: true })).toBe('ice')
  })
})

describe('sesión con transporte falso', () => {
  let session: Session | null = null

  beforeEach(() => {
    const mem = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => mem.set(key, value),
      removeItem: (key: string) => mem.delete(key),
    })
  })

  afterEach(() => {
    session?.close()
    session = null
    vi.unstubAllGlobals()
  })

  it('anfitrión e invitado abren Nostr y BitTorrent juntos', async () => {
    const hostLink = new FakeLink()
    const guestLink = new FakeLink()
    session = createTestSession('host', 'ABCDE', 'Ana', hostLink)
    const guest = createTestSession('client', 'ABCDE', 'Sol', guestLink)
    await Promise.resolve()
    await Promise.resolve()
    expect(hostLink.used).toEqual(['nostr', 'torrent'])
    expect(guestLink.used).toEqual(['nostr', 'torrent'])
    guest.close()
  })

  it('el anfitrión no figura conectado hasta que un relay abre', () => {
    const link = new FakeLink()
    session = createTestSession('host', 'ABCDE', 'Ana', link)
    expect(session.snapshot.status).toBe('connecting')
    expect(session.snapshot.message).toBe(PUBLISHING_MESSAGE)
    expect(session.snapshot.state?.phase).toBe('lobby')
    link.relay(true)
    expect(session.snapshot.status).toBe('connected')
    expect(session.snapshot.message).toBeNull()
  })

  it('dos saludos del mismo jugador por distintos pares no lo duplican, y uno solo no lo desconecta', () => {
    const link = new FakeLink()
    session = createTestSession('host', 'ABCDE', 'Ana', link)
    link.receive('peer-a', hello('p2', 'Bob'))
    link.receive('peer-b', hello('p2', 'Bob'))
    const bobs = () => session!.snapshot.state!.players.filter((p) => p.id === 'p2')
    expect(bobs()).toHaveLength(1)
    expect(bobs()[0]?.connected).toBe(true)

    link.leavePeer('peer-a')
    expect(bobs()).toHaveLength(1)
    expect(bobs()[0]?.connected).toBe(true)

    link.leavePeer('peer-b')
    expect(bobs()).toHaveLength(0)
  })

  it('un error de ICE deja al invitado buscando y explica la red', () => {
    const link = new FakeLink()
    session = createTestSession('client', 'ABCDE', 'Sol', link)
    link.fail('nostr', 'could not connect to peer abc after exchanging SDP; configure TURN servers')
    expect(session.snapshot.status).toBe('connecting')
    expect(session.snapshot.message).toBe(ICE_MESSAGE)
  })
})
