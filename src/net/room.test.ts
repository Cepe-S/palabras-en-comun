import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type PublicState } from '../game/types'
import {
  codeFromHash,
  codeFromText,
  createTestSession,
  diagnoseSilence,
  GIVE_UP_MS,
  ICE_MESSAGE,
  isIceFailure,
  isWebRtcMissing,
  PUBLISHING_MESSAGE,
  RECONNECT_NOTICE_MS,
  RECONNECTING_MESSAGE,
  roomHash,
  WEBRTC_MESSAGE,
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

  abandoned = false

  nudge(): void {}

  abandon(): void {
    this.abandoned = true
  }

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

  it('si la señalización respondió y no hubo SDP, la sala no está', () => {
    expect(diagnoseSilence({ elapsedMs: GIVE_UP_MS, relaySeen: true, iceFailed: false })).toBe('notFound')
  })

  it('un fallo de ICE no se disfraza de sala inexistente', () => {
    expect(diagnoseSilence({ elapsedMs: GIVE_UP_MS, relaySeen: true, iceFailed: true })).toBe('ice')
  })

  it('sin WebRTC no se confunde con un bloqueo de red', () => {
    expect(isWebRtcMissing('RTCPeerConnection is not a constructor')).toBe(true)
    expect(isIceFailure('RTCPeerConnection is not a constructor')).toBe(false)
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

  it('anfitrión e invitado abren Firebase', async () => {
    const hostLink = new FakeLink()
    const guestLink = new FakeLink()
    session = createTestSession('host', 'ABCDE', 'Ana', hostLink)
    const guest = createTestSession('client', 'ABCDE', 'Sol', guestLink)
    await Promise.resolve()
    await Promise.resolve()
    expect(hostLink.used).toEqual(['firebase'])
    expect(guestLink.used).toEqual(['firebase'])
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

  it('si el navegador no tiene WebRTC, el aviso lo dice y no habla de la red', () => {
    const link = new FakeLink()
    session = createTestSession('host', 'ABCDE', 'Ana', link)
    link.fail('firebase', 'RTCPeerConnection is not a constructor')
    expect(session.snapshot.message).toBe(WEBRTC_MESSAGE)
    link.relay(true)
    expect(session.snapshot.status).toBe('connected')
    expect(session.snapshot.message).toBe(WEBRTC_MESSAGE)
  })

  it('si la conexión ICE falla, el invitado sigue buscando y ve el aviso', () => {
    const link = new FakeLink()
    session = createTestSession('client', 'ABCDE', 'Sol', link)
    link.fail('firebase', 'could not connect to peer abc after exchanging SDP; configure TURN servers')
    expect(session.snapshot.status).toBe('connecting')
    expect(session.snapshot.message).toBe(ICE_MESSAGE)
  })

  it('el anfitrión no se queda con el aviso de red cuando la sala ya está publicada', () => {
    const link = new FakeLink()
    session = createTestSession('host', 'ABCDE', 'Ana', link)
    const error = 'could not connect to peer abc after exchanging SDP; check TURN servers'
    link.fail('firebase', error)
    expect(session.snapshot.message).toBe(ICE_MESSAGE)
    link.relay(true)
    expect(session.snapshot.status).toBe('connected')
    expect(session.snapshot.message).toBeNull()
  })

  it('si la partida ya está conectada, el fallo del otro canal no tapa la mesa', () => {
    const link = new FakeLink()
    session = createTestSession('client', 'ABCDE', 'Sol', link)
    link.receive('host', JSON.stringify({ t: 'state', state: lobbyState() }))
    expect(session.snapshot.status).toBe('connected')
    link.fail('firebase', 'could not connect to peer host after exchanging SDP; check that your TURN server URLs and credentials are reachable by both peers')
    expect(session.snapshot.status).toBe('connected')
    expect(session.snapshot.message).toBeNull()
  })

  it('un silencio breve del anfitrión no corta la partida', () => {
    vi.useFakeTimers()
    try {
      const link = new FakeLink()
      session = createTestSession('client', 'ABCDE', 'Sol', link)
      link.receive('host', JSON.stringify({ t: 'state', state: lobbyState() }))
      vi.advanceTimersByTime(20_000)
      expect(session.snapshot.status).toBe('connected')
      vi.advanceTimersByTime(30_000)
      expect(session.snapshot.status).toBe('hostLost')
    } finally {
      vi.useRealTimers()
    }
  })

  it('un corte breve no avisa y uno largo muestra que se está reconectando', () => {
    vi.useFakeTimers()
    try {
      const link = new FakeLink()
      session = createTestSession('client', 'ABCDE', 'Sol', link)
      link.receive('host', JSON.stringify({ t: 'state', state: lobbyState() }))
      link.leavePeer('host')
      expect(session.snapshot.status).toBe('connected')
      expect(session.snapshot.reconnecting).toBe(false)
      expect(session.snapshot.message).toBeNull()
      vi.advanceTimersByTime(RECONNECT_NOTICE_MS - 1)
      expect(session.snapshot.reconnecting).toBe(false)
      vi.advanceTimersByTime(1)
      expect(session.snapshot.reconnecting).toBe(true)
      expect(session.snapshot.message).toBe(RECONNECTING_MESSAGE)
      vi.advanceTimersByTime(50_000)
      expect(session.snapshot.status).toBe('connected')
      link.receive('host', JSON.stringify({ t: 'state', state: lobbyState() }))
      expect(session.snapshot.reconnecting).toBe(false)
      expect(session.snapshot.message).toBeNull()
      expect(session.snapshot.status).toBe('connected')
    } finally {
      session?.close()
      vi.useRealTimers()
    }
  })

  it('si el anfitrión cierra la sala no sigue reintentando', () => {
    vi.useFakeTimers()
    try {
      const link = new FakeLink()
      session = createTestSession('client', 'ABCDE', 'Sol', link)
      link.receive('host', JSON.stringify({ t: 'state', state: lobbyState() }))
      link.receive('host', JSON.stringify({ t: 'bye' }))
      link.leavePeer('host')
      vi.advanceTimersByTime(RECONNECT_NOTICE_MS + 1_000)
      expect(session.snapshot.status).toBe('hostLost')
      expect(session.snapshot.reconnecting).toBe(false)
      expect(session.snapshot.message).toBe('El anfitrión cerró la sala.')
      expect(link.abandoned).toBe(true)
    } finally {
      session?.close()
      vi.useRealTimers()
    }
  })

  it('si un solo jugador se va, la mesa no avisa reconexión', () => {
    vi.useFakeTimers()
    try {
      const link = new FakeLink()
      session = createTestSession('host', 'ABCDE', 'Ana', link)
      link.relay(true)
      link.join('p1')
      link.receive('p1', hello('sol', 'Sol'))
      link.leavePeer('p1')
      vi.advanceTimersByTime(RECONNECT_NOTICE_MS + 1_000)
      expect(session.snapshot.reconnecting).toBe(false)
      expect(session.snapshot.message).toBeNull()
      expect(session.snapshot.state?.players.some((p) => p.id === 'sol')).toBe(false)
    } finally {
      session?.close()
      vi.useRealTimers()
    }
  })

  it('si se caen todos los canales, el anfitrión avisa cuando la reconexión se demora', () => {
    vi.useFakeTimers()
    try {
      const link = new FakeLink()
      session = createTestSession('host', 'ABCDE', 'Ana', link)
      link.relay(true)
      link.join('p1')
      link.receive('p1', hello('sol', 'Sol'))
      link.join('p2')
      link.receive('p2', hello('luz', 'Luz'))
      link.leavePeer('p1')
      link.leavePeer('p2')
      vi.advanceTimersByTime(RECONNECT_NOTICE_MS - 1)
      expect(session.snapshot.reconnecting).toBe(false)
      vi.advanceTimersByTime(1)
      expect(session.snapshot.status).toBe('connected')
      expect(session.snapshot.reconnecting).toBe(true)
      expect(session.snapshot.message).toBe(RECONNECTING_MESSAGE)
    } finally {
      session?.close()
      vi.useRealTimers()
    }
  })
})

function lobbyState(): PublicState {
  return {
    roomName: 'Sala de Ana',
    phase: 'lobby',
    round: 1,
    totalRounds: 3,
    hostId: 'h',
    players: [{ id: 'h', name: 'Ana', color: 0, connected: true, ready: false }],
    word: null,
    endsAt: null,
    hostNow: Date.now(),
    steps: [],
    totalSteps: 0,
    history: {},
    wordCounts: {},
  roundPoints: {},
  }
}

describe('enlace de sala', () => {
  it('el hash de la sala se lee de vuelta', () => {
    expect(codeFromHash(roomHash('AB2CD'))).toBe('AB2CD')
    expect(codeFromHash('#/sala/ab2cd/')).toBe('AB2CD')
    expect(codeFromHash('#/sala/AB2')).toBeNull()
    expect(codeFromHash('')).toBeNull()
  })

  it('acepta el código solo o el enlace entero pegado en el campo', () => {
    expect(codeFromText('ab-2cd')).toBe('AB2CD')
    expect(codeFromText('https://juego.example/palabras/#/sala/xy3zw')).toBe('XY3ZW')
    expect(codeFromText('Vení a jugar: https://juego.example/#/sala/XY3ZW ¡te espero!')).toBe('XY3ZW')
    expect(codeFromText('AB')).toBe('AB')
  })
})
