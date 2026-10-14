import { describe, expect, it, vi } from 'vitest'
import { MemorySignalDb } from './signalDb'
import { Transport } from './transport'
import type { TurnServerConfig } from './turn'

class FakeDc {
  readyState: RTCDataChannelState = 'connecting'
  onopen: (() => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 'closed'
    this.onclose?.()
  }

  open(): void {
    this.readyState = 'open'
    this.onopen?.()
  }
}

class FakePc extends EventTarget {
  localDescription: RTCSessionDescriptionInit | null = null
  remoteDescription: RTCSessionDescriptionInit | null = null
  iceConnectionState: RTCIceConnectionState = 'new'
  connectionState: RTCPeerConnectionState = 'new'
  iceGatheringState: RTCIceGatheringState = 'new'
  signalingState: RTCSignalingState = 'stable'
  localChannel: FakeDc | null = null
  added: RTCIceCandidateInit[] = []

  constructor(public config?: RTCConfiguration) {
    super()
    created.push(this)
  }

  createDataChannel(): FakeDc {
    this.localChannel = new FakeDc()
    return this.localChannel
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'offer', sdp: 'v=0 offer' })
  }

  createAnswer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'answer', sdp: 'v=0 answer' })
  }

  async setLocalDescription(desc: RTCLocalSessionDescriptionInit): Promise<void> {
    if (desc.type) this.localDescription = { type: desc.type, sdp: desc.sdp }
    this.iceGatheringState = 'gathering'
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.added.push(candidate)
  }

  close(): void {}

  getStats(): Promise<RTCStatsReport> {
    const empty = {
      forEach() {},
      get() {
        return undefined
      },
    }
    return Promise.resolve(empty as unknown as RTCStatsReport)
  }

  emitCandidate(init: RTCIceCandidateInit): void {
    this.dispatchEvent(Object.assign(new Event('icecandidate'), { candidate: init }))
  }

  setIce(state: RTCIceConnectionState): void {
    this.iceConnectionState = state
    this.dispatchEvent(new Event('iceconnectionstatechange'))
  }
}

const created: FakePc[] = []

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('señalización Firebase', () => {
  it('publica la oferta sin esperar el gathering, reparte candidatos al vuelo y corta Firebase al conectar', async () => {
    created.length = 0
    const db = new MemorySignalDb()
    const turn = deferred<TurnServerConfig[] | undefined>()
    const turnConfig: TurnServerConfig[] = [
      { urls: 'turns:turn.example:443?transport=tcp', username: 'u', credential: 'pw' },
    ]
    const deps = {
      db,
      peerCtor: FakePc as unknown as typeof RTCPeerConnection,
      turn: turn.promise,
    }
    const joins: string[] = []
    const host = new Transport('ABCDE', false, { ...deps, selfId: 'host-1' })
    const guest = new Transport('ABCDE', true, { ...deps, selfId: 'guest-1' })
    host.onPeerJoin = (id) => joins.push(id)

    await host.use('firebase')
    await guest.use('firebase')
    expect(db.get('rooms/ABCDE/hostId')).toBe('host-1')
    expect(db.get('rooms/ABCDE/slots/guest-1/offer')).toBeUndefined()

    await db.push('rooms/ABCDE/slots/guest-1/hostIce', {
      candidate: 'candidate:early',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })

    turn.resolve(turnConfig)
    await vi.waitFor(() => {
      expect(created).toHaveLength(2)
      expect(created[1].remoteDescription?.type).toBe('offer')
      expect(created[0].remoteDescription?.type).toBe('answer')
    })

    expect(created[0].iceGatheringState).toBe('gathering')
    expect(JSON.stringify(created[0].config?.iceServers)).toContain('turns:turn.example:443?transport=tcp')
    expect(JSON.stringify(created[0].config?.iceServers)).toContain('stun:stun.l.google.com:19302')
    expect(created[1].added.map((item) => item.candidate)).toContain('candidate:early')
    expect(joins).toEqual([])

    created[0].emitCandidate({ candidate: 'candidate:live', sdpMid: '0', sdpMLineIndex: 0 })
    await vi.waitFor(() => {
      const ice = db.get('rooms/ABCDE/slots/guest-1/hostIce') as Record<string, { candidate: string }>
      expect(Object.values(ice).some((row) => row.candidate === 'candidate:live')).toBe(true)
    })
    await vi.waitFor(() => {
      expect(created[1].added.map((item) => item.candidate)).toContain('candidate:live')
    })

    created[0].setIce('connected')
    created[1].setIce('connected')
    await vi.waitFor(() => {
      expect(db.get('rooms/ABCDE/slots/guest-1')).toBeUndefined()
    })
    expect(db.subscriptionCount()).toBe(1)

    const ops = db.ops.length
    created[0].emitCandidate({ candidate: 'candidate:late', sdpMid: '0', sdpMLineIndex: 0 })
    await Promise.resolve()
    expect(db.ops.length).toBe(ops)

    created[0].localChannel?.open()
    expect(joins).toEqual(['guest-1'])
    const beforeSend = db.ops.length
    await host.sendTo('guest-1', JSON.stringify({ t: 'state' }))
    expect(created[0].localChannel?.sent).toEqual([JSON.stringify({ t: 'state' })])
    expect(db.ops.length).toBe(beforeSend)

    host.leave()
    guest.leave()
  })
})
