import { installNetDebug, netLog } from './debug'
import type { SignalDb } from './signalDb'
import { loadTurnConfig, type TurnServerConfig } from './turn'
import { resolvePeerConnection } from './webrtc'

export type StrategyName = 'firebase'
export const SIGNALING_DOWN = 'signaling-unavailable'

const ROOM_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/

/** ICE `disconnected` a veces se recupera solo. Recién después se abre otro canal. */
const DISCONNECT_GRACE_MS = 1_500
/** Pausa corta para no pisar un cierre que todavía se está propagando. */
const REVIVE_DELAY_MS = 300
/** Si el anfitrión no ofrece en este plazo, se pide otro hueco. */
const OFFER_WAIT_MS = 3_000
const REVIVE_RETRY_MS = 2_000

const STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

export interface Link {
  onMessage: (data: string, peerId: string) => void
  onPeerJoin: (peerId: string) => void
  onPeerLeave: (peerId: string) => void
  onFailure: (strategy: StrategyName, error: string) => void
  onSignaling: (open: boolean) => void
  readonly strategies: readonly string[]
  readonly signalingOpen: boolean
  use(name: StrategyName): Promise<void>
  sendTo(peerId: string, data: string): Promise<boolean>
  broadcast(data: string): void
  /** Reabre la señalización si el canal ya había funcionado y ahora está caído. */
  nudge(): void
  /** Deja de reintentar: el anfitrión cerró la sala a propósito. */
  abandon(): void
  leave(): void
}

interface Peer {
  id: string
  pc: RTCPeerConnection
  dc: RTCDataChannel | null
  remoteSet: boolean
  pending: RTCIceCandidateInit[]
  released: boolean
  left: boolean
  opened: boolean
}

export interface TransportDeps {
  db?: SignalDb
  peerCtor?: typeof RTCPeerConnection
  turn?: Promise<TurnServerConfig[] | undefined>
  selfId?: string
  reviveDelayMs?: number
  disconnectGraceMs?: number
  offerWaitMs?: number
}

/**
 * Señalización por Firebase Realtime Database y tráfico de juego por Data Channel.
 * El anfitrión ofrece; cada invitado responde en su propio hueco. Los candidatos
 * ICE se publican en cuanto aparecen (trickle). Al quedar `connected`, ese par
 * se desuscribe y borra su SDP. El anfitrión sigue escuchando huecos nuevos
 * para que entren más jugadores; esos listeners no llevan mensajes de la partida.
 * Si un canal que ya estaba abierto se corta, el invitado pide otro hueco
 * (`selfId--N`) y el anfitrión le ofrece de nuevo.
 */
export class Transport implements Link {
  onMessage: (data: string, peerId: string) => void = () => {}
  onPeerJoin: (peerId: string) => void = () => {}
  onPeerLeave: (peerId: string) => void = () => {}
  onFailure: (strategy: StrategyName, error: string) => void = () => {}
  onSignaling: (open: boolean) => void = () => {}

  readonly selfId: string
  private db: SignalDb | null = null
  private peers = new Map<string, Peer>()
  private earlyIce = new Map<string, RTCIceCandidateInit[]>()
  private sigUnsubs = new Map<string, Array<() => void>>()
  private unsubs: Array<() => void> = []
  private _strategies: StrategyName[] = []
  private _signalingOpen = false
  private started = false
  private closed = false
  private joined = false
  private answerStarted = false
  private readonly offering = new Set<string>()
  private loggedWebRtc = false
  private readonly turnReady: Promise<TurnServerConfig[] | undefined>
  private serversReady: Promise<RTCIceServer[]> | null = null
  private generation = 0
  private liveSlot = ''
  private hadOpen = false
  private abandoned = false
  private reviving = false
  private reviveTimer: ReturnType<typeof setTimeout> | null = null
  private offerTimer: ReturnType<typeof setTimeout> | null = null
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private code: string,
    private passive: boolean,
    private deps?: TransportDeps,
  ) {
    installNetDebug()
    this.selfId = deps?.selfId ?? crypto.randomUUID()
    this.liveSlot = this.selfId
    this.turnReady = deps?.turn ?? loadTurnConfig()
    netLog('transport', { code, passive, selfId: this.selfId })
  }

  get strategies(): StrategyName[] {
    return this._strategies
  }

  get signalingOpen(): boolean {
    return this._signalingOpen
  }

  async use(name: StrategyName): Promise<void> {
    if (name !== 'firebase' || this.started || this.closed) return
    this.started = true
    if (!ROOM_CODE.test(this.code)) {
      this.fail(SIGNALING_DOWN)
      return
    }
    try {
      this.db = this.deps?.db ?? (await openDefaultDb())
      if (!this.db) {
        this.fail(SIGNALING_DOWN)
        return
      }
      await this.db.ready()
      if (this.closed) return
      this.markSignaling(true)
      if (this.passive) await this.armGuest()
      else await this.armHost()
      if (!this.closed) this._strategies = ['firebase']
    } catch (error) {
      netLog('strategy:fail', { name, error: error instanceof Error ? error.message : String(error) })
      this.fail(SIGNALING_DOWN)
    }
  }

  sendTo(peerId: string, data: string): Promise<boolean> {
    const dc = this.peers.get(peerId)?.dc
    if (!dc || dc.readyState !== 'open') {
      netLog('tx:drop', { peerId, t: msgType(data) })
      return Promise.resolve(false)
    }
    try {
      dc.send(data)
      netLog('tx', { strategy: 'firebase', peerId, bytes: data.length, t: msgType(data) })
      return Promise.resolve(true)
    } catch (error) {
      netLog('tx:fail', {
        peerId,
        t: msgType(data),
        error: error instanceof Error ? error.message : String(error),
      })
      return Promise.resolve(false)
    }
  }

  broadcast(data: string): void {
    for (const peerId of this.peers.keys()) void this.sendTo(peerId, data)
  }

  nudge(): void {
    if (this.closed || this.abandoned || !this.passive || !this.hadOpen) return
    const live = [...this.peers.values()].some((peer) => peer.opened && !peer.left && peer.dc?.readyState === 'open')
    if (live) return
    this.queueRevive(0)
  }

  abandon(): void {
    this.abandoned = true
    this.clearReviveTimers()
  }

  leave(): void {
    if (this.closed) return
    this.closed = true
    this.abandoned = true
    this.clearReviveTimers()
    netLog('transport:leave', { code: this.code })
    for (const stop of this.unsubs) stop()
    this.unsubs = []
    for (const list of this.sigUnsubs.values()) for (const stop of list) stop()
    this.sigUnsubs.clear()
    for (const peer of this.peers.values()) {
      try {
        peer.dc?.close()
      } catch {
        /* ya cerrado */
      }
      try {
        peer.pc.close()
      } catch {
        /* ya cerrado */
      }
    }
    this.peers.clear()
    if (!this.db) return
    const path = this.passive ? this.slot(this.liveSlot || this.selfId) : this.room
    void this.db.remove(path)
  }

  private get room(): string {
    return `rooms/${this.code}`
  }

  private slot(guestId: string): string {
    return `${this.room}/slots/${guestId}`
  }

  private fail(error: string): void {
    this.onFailure('firebase', error)
  }

  private markSignaling(open: boolean): void {
    if (this._signalingOpen === open) return
    this._signalingOpen = open
    netLog('signaling', { open })
    this.onSignaling(open)
  }

  private async armHost(): Promise<void> {
    const db = this.db
    if (!db) return
    await db.set(`${this.room}/hostId`, this.selfId)
    await db.set(`${this.room}/createdAt`, Date.now())
    const stop = db.onChildAdded(`${this.room}/slots`, (guestId) => {
      void this.offerTo(guestId)
    }, (error) => this.fail(error.message))
    this.unsubs.push(stop)
    netLog('strategy:joined', { name: 'firebase', selfId: this.selfId, passive: false })
  }

  private armGuest(): Promise<void> {
    const db = this.db
    if (!db) return Promise.resolve()
    return new Promise((resolve) => {
      const stop = db.onValue(
        `${this.room}/hostId`,
        (value) => {
          if (this.closed) {
            resolve()
            return
          }
          if (typeof value !== 'string') {
            resolve()
            return
          }
          if (this.joined) return
          this.joined = true
          stop()
          netLog('strategy:joined', { name: 'firebase', selfId: this.selfId, passive: true, hostId: value })
          void this.waitOffer(value).then(() => resolve(), () => resolve())
        },
        (error) => {
          this.fail(error.message)
          resolve()
        },
      )
      this.unsubs.push(stop)
    })
  }

  private async waitOffer(hostId: string): Promise<void> {
    const db = this.db
    if (!db || this.closed) return
    this.liveSlot = this.generation === 0 ? this.selfId : `${this.selfId}--${this.generation}`
    const slot = this.slot(this.liveSlot)
    const stopOffer = db.onValue(`${slot}/offer`, (value) => {
      const offer = asSdp(value, 'offer')
      if (!offer) return
      void this.acceptOffer(hostId, offer)
    })
    const stopIce = db.onChildAdded(`${slot}/hostIce`, (_key, value) => {
      this.queueCandidate(hostId, value)
    })
    this.track(hostId, [stopOffer, stopIce])
    await db.set(`${slot}/joined`, Date.now())
  }

  private async offerTo(guestId: string): Promise<void> {
    if (this.closed || this.offering.has(guestId) || guestId === this.selfId) return
    this.offering.add(guestId)
    const db = this.db
    if (!db) return
    const peer = await this.openPeer(guestId)
    if (!peer || this.closed) return
    const slot = this.slot(guestId)
    try {
      const dc = peer.pc.createDataChannel('game', { ordered: true })
      this.bindChannel(guestId, dc)
      const stopAnswer = db.onValue(`${slot}/answer`, (value) => {
        const answer = asSdp(value, 'answer')
        if (!answer) return
        void this.applyRemote(peer, answer)
      })
      const stopIce = db.onChildAdded(`${slot}/guestIce`, (_key, value) => {
        this.queueCandidate(guestId, value)
      })
      this.track(guestId, [stopAnswer, stopIce])
      const offer = await peer.pc.createOffer()
      if (!offer.sdp) throw new Error('sdp vacío')
      await peer.pc.setLocalDescription(offer)
      await db.set(`${slot}/offer`, { type: 'offer', sdp: offer.sdp })
      netLog('sdp', { role: 'host', peerId: guestId, type: 'offer' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/RTCPeerConnection is not a constructor/i.test(message)) this.fail(message)
      else netLog('sdp:fail', { role: 'host', peerId: guestId, error: message })
    }
  }

  private async acceptOffer(hostId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    if (this.closed || this.answerStarted) return
    this.answerStarted = true
    const db = this.db
    if (!db) return
    const peer = await this.openPeer(hostId)
    if (!peer || this.closed) return
    try {
      await this.applyRemote(peer, offer)
      const answer = await peer.pc.createAnswer()
      if (!answer.sdp) throw new Error('sdp vacío')
      await peer.pc.setLocalDescription(answer)
      await db.set(`${this.slot(this.liveSlot)}/answer`, { type: 'answer', sdp: answer.sdp })
      netLog('sdp', { role: 'guest', peerId: hostId, type: 'answer' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/RTCPeerConnection is not a constructor/i.test(message)) this.fail(message)
      else netLog('sdp:fail', { role: 'guest', peerId: hostId, error: message })
    }
  }

  private async openPeer(peerId: string): Promise<Peer | null> {
    const existing = this.peers.get(peerId)
    if (existing) return existing
    const ctor = this.deps?.peerCtor ?? resolvePeerConnection()
    if (!ctor) {
      netLog('webrtc', { strategy: 'firebase', type: typeof globalThis.RTCPeerConnection, source: 'missing' })
      this.fail('RTCPeerConnection is not a constructor')
      return null
    }
    if (!this.loggedWebRtc) {
      this.loggedWebRtc = true
      const source = this.deps?.peerCtor ? 'injected' : ctor === globalThis.RTCPeerConnection ? 'window' : 'iframe'
      netLog('webrtc', { strategy: 'firebase', source })
    }
    const pc = new ctor({ iceServers: await this.servers() })
    const peer: Peer = {
      id: peerId,
      pc,
      dc: null,
      remoteSet: false,
      pending: [],
      released: false,
      left: false,
      opened: false,
    }
    this.peers.set(peerId, peer)
    this.watch(peer)
    return peer
  }

  private servers(): Promise<RTCIceServer[]> {
    this.serversReady ??= this.turnReady.then((turn) => [
      ...STUN,
      ...(turn ?? []).map((server) => ({
        urls: server.urls,
        ...(server.username ? { username: server.username } : {}),
        ...(server.credential ? { credential: server.credential } : {}),
      })),
    ])
    return this.serversReady
  }

  private watch(peer: Peer): void {
    const pc = peer.pc
    pc.addEventListener('icecandidate', (event) => {
      const candidate = (event as RTCPeerConnectionIceEvent).candidate
      if (!candidate) {
        netLog('ice-candidate', { strategy: 'firebase', peerId: peer.id, end: true })
        return
      }
      if (peer.released || !this.db) return
      netLog('ice-candidate', {
        strategy: 'firebase',
        peerId: peer.id,
        type: candidate.type,
        protocol: candidate.protocol,
        address: candidate.address,
        port: candidate.port,
      })
      const side = this.passive ? 'guestIce' : 'hostIce'
      void this.db.push(`${this.signalingSlot(peer.id)}/${side}`, {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      })
    })
    pc.addEventListener('iceconnectionstatechange', () => {
      netLog('pc', {
        strategy: 'firebase',
        peerId: peer.id,
        connection: pc.connectionState,
        ice: pc.iceConnectionState,
        gathering: pc.iceGatheringState,
        signaling: pc.signalingState,
      })
      const ice = pc.iceConnectionState
      if (ice === 'connected' || ice === 'completed') {
        this.clearGrace(peer.id)
        void logSelectedPair(peer.id, pc)
        this.release(peer.id)
      } else if (ice === 'disconnected') {
        if (peer.opened) this.armGrace(peer)
      } else if (ice === 'failed') {
        this.clearGrace(peer.id)
        if (peer.opened) this.dropPeer(peer)
        else {
          this.fail('could not connect to peer after exchanging SDP; check TURN')
          this.release(peer.id)
          this.forget(peer.id)
        }
      }
    })
    pc.addEventListener('icecandidateerror', (event) => {
      const ev = event as RTCPeerConnectionIceErrorEvent
      netLog('ice-error', {
        strategy: 'firebase',
        peerId: peer.id,
        url: ev.url,
        errorCode: ev.errorCode,
        errorText: ev.errorText,
        address: ev.address,
        port: ev.port,
      })
    })
    if (this.passive) {
      pc.addEventListener('datachannel', (event) => {
        this.bindChannel(peer.id, (event as RTCDataChannelEvent).channel)
      })
    }
  }

  private async applyRemote(peer: Peer, desc: RTCSessionDescriptionInit): Promise<void> {
    if (peer.remoteSet) return
    await peer.pc.setRemoteDescription(desc)
    peer.remoteSet = true
    const queued = [...(this.earlyIce.get(peer.id) ?? []), ...peer.pending]
    this.earlyIce.delete(peer.id)
    peer.pending = []
    for (const init of queued) {
      try {
        await peer.pc.addIceCandidate(init)
      } catch (error) {
        netLog('ice-error', {
          strategy: 'firebase',
          peerId: peer.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private queueCandidate(peerId: string, value: unknown): void {
    const init = asCandidate(value)
    if (!init) return
    const peer = this.peers.get(peerId)
    if (!peer || !peer.remoteSet) {
      if (peer) peer.pending.push(init)
      else {
        const list = this.earlyIce.get(peerId) ?? []
        list.push(init)
        this.earlyIce.set(peerId, list)
      }
      return
    }
    void peer.pc.addIceCandidate(init).catch((error: unknown) => {
      netLog('ice-error', {
        strategy: 'firebase',
        peerId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  private bindChannel(peerId: string, dc: RTCDataChannel): void {
    const peer = this.peers.get(peerId)
    if (!peer) return
    peer.dc = dc
    const opened = () => {
      if (peer.opened) return
      peer.opened = true
      this.hadOpen = true
      this.clearOfferWait()
      netLog('peer:join', { strategy: 'firebase', peerId })
      this.onPeerJoin(peerId)
    }
    dc.onopen = opened
    dc.onmessage = (event) => {
      if (typeof event.data === 'string') this.onMessage(event.data, peerId)
    }
    dc.onclose = () => {
      if (peer.left || this.closed) return
      if (peer.opened) this.dropPeer(peer)
      else this.forget(peer.id)
    }
    if (dc.readyState === 'open') opened()
  }

  private track(peerId: string, stops: Array<() => void>): void {
    const list = this.sigUnsubs.get(peerId) ?? []
    list.push(...stops)
    this.sigUnsubs.set(peerId, list)
  }

  /** Corta los listeners de este par y borra oferta, respuesta y candidatos. */
  private release(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (peer?.released) return
    if (peer) peer.released = true
    for (const stop of this.sigUnsubs.get(peerId) ?? []) stop()
    this.sigUnsubs.delete(peerId)
    netLog('signaling:release', { peerId })
    void this.db?.remove(this.signalingSlot(peerId))
  }

  private signalingSlot(peerId: string): string {
    return this.slot(this.passive ? this.liveSlot || this.selfId : peerId)
  }

  private forget(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (!peer || peer.left) return
    peer.left = true
    netLog('peer:leave', { strategy: 'firebase', peerId })
    this.onPeerLeave(peerId)
  }

  /** Cierra un canal que ya había servido y, en el invitado, pide otro hueco. */
  private dropPeer(peer: Peer): void {
    if (peer.left || this.closed) return
    const wasOpen = peer.opened
    peer.left = true
    this.clearGrace(peer.id)
    this.release(peer.id)
    try {
      peer.dc?.close()
    } catch {
      /* ya cerrado */
    }
    try {
      peer.pc.close()
    } catch {
      /* ya cerrado */
    }
    this.peers.delete(peer.id)
    if (!wasOpen) return
    netLog('peer:leave', { strategy: 'firebase', peerId: peer.id, revive: this.passive && !this.abandoned })
    this.onPeerLeave(peer.id)
    if (this.passive && !this.abandoned) this.queueRevive(this.deps?.reviveDelayMs ?? REVIVE_DELAY_MS)
  }

  private armGrace(peer: Peer): void {
    if (this.graceTimers.has(peer.id) || peer.left || this.closed) return
    const wait = this.deps?.disconnectGraceMs ?? DISCONNECT_GRACE_MS
    const timer = setTimeout(() => {
      this.graceTimers.delete(peer.id)
      if (peer.left || this.closed) return
      const ice = peer.pc.iceConnectionState
      if (ice === 'connected' || ice === 'completed') return
      this.dropPeer(peer)
    }, wait)
    this.graceTimers.set(peer.id, timer)
  }

  private clearGrace(peerId: string): void {
    const timer = this.graceTimers.get(peerId)
    if (!timer) return
    clearTimeout(timer)
    this.graceTimers.delete(peerId)
  }

  private queueRevive(delay: number): void {
    if (this.closed || this.abandoned || !this.passive || !this.hadOpen || this.reviveTimer) return
    this.reviveTimer = setTimeout(() => {
      this.reviveTimer = null
      void this.revive()
    }, delay)
  }

  private async revive(): Promise<void> {
    if (this.closed || this.abandoned || !this.passive || this.reviving || !this.hadOpen) return
    this.reviving = true
    try {
      this.clearOfferWait()
      for (const peer of this.peers.values()) {
        peer.left = true
        this.clearGrace(peer.id)
        try {
          peer.dc?.close()
        } catch {
          /* ya cerrado */
        }
        try {
          peer.pc.close()
        } catch {
          /* ya cerrado */
        }
      }
      this.peers.clear()
      for (const list of this.sigUnsubs.values()) for (const stop of list) stop()
      this.sigUnsubs.clear()
      this.answerStarted = false
      if (this.liveSlot) void this.db?.remove(this.slot(this.liveSlot))
      this.generation += 1
      const hostId = await this.readHostId()
      if (this.closed || this.abandoned) return
      if (!hostId) {
        this.queueRevive(REVIVE_RETRY_MS)
        return
      }
      await this.waitOffer(hostId)
      this.armOfferWait()
    } finally {
      this.reviving = false
    }
  }

  private readHostId(): Promise<string | null> {
    const db = this.db
    if (!db || this.closed) return Promise.resolve(null)
    return new Promise((resolve) => {
      const stop = db.onValue(`${this.room}/hostId`, (value) => {
        stop()
        resolve(typeof value === 'string' && value ? value : null)
      })
      this.unsubs.push(stop)
    })
  }

  private armOfferWait(): void {
    this.clearOfferWait()
    const wait = this.deps?.offerWaitMs ?? OFFER_WAIT_MS
    this.offerTimer = setTimeout(() => {
      this.offerTimer = null
      const open = [...this.peers.values()].some((peer) => peer.opened && !peer.left && peer.dc?.readyState === 'open')
      if (!open) void this.revive()
    }, wait)
  }

  private clearOfferWait(): void {
    if (!this.offerTimer) return
    clearTimeout(this.offerTimer)
    this.offerTimer = null
  }

  private clearReviveTimers(): void {
    this.clearOfferWait()
    if (this.reviveTimer) clearTimeout(this.reviveTimer)
    this.reviveTimer = null
    for (const timer of this.graceTimers.values()) clearTimeout(timer)
    this.graceTimers.clear()
  }
}

function asSdp(value: unknown, type: 'offer' | 'answer'): RTCSessionDescriptionInit | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { type?: unknown; sdp?: unknown }
  if (row.type !== type || typeof row.sdp !== 'string' || !row.sdp) return null
  return { type, sdp: row.sdp }
}

function asCandidate(value: unknown): RTCIceCandidateInit | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { candidate?: unknown; sdpMid?: unknown; sdpMLineIndex?: unknown }
  if (typeof row.candidate !== 'string' || !row.candidate) return null
  return {
    candidate: row.candidate,
    sdpMid: typeof row.sdpMid === 'string' ? row.sdpMid : null,
    sdpMLineIndex: typeof row.sdpMLineIndex === 'number' ? row.sdpMLineIndex : null,
  }
}

function msgType(data: string): string {
  try {
    const msg = JSON.parse(data) as { t?: unknown }
    return typeof msg.t === 'string' ? msg.t : 'unknown'
  } catch {
    return 'invalid'
  }
}

async function openDefaultDb(): Promise<SignalDb | null> {
  const { openFirebase } = await import('./firebaseDb')
  return openFirebase()
}

async function logSelectedPair(peerId: string, pc: RTCPeerConnection): Promise<void> {
  try {
    const stats = await pc.getStats()
    let pair: RTCIceCandidatePairStats | undefined
    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') pair = report
    })
    if (!pair) return
    const local = stats.get(pair.localCandidateId)
    const remote = stats.get(pair.remoteCandidateId)
    const side = (report: RTCStats | undefined) => {
      if (!report || (report.type !== 'local-candidate' && report.type !== 'remote-candidate')) return null
      const c = report as RTCStats & {
        candidateType?: string
        protocol?: string
        address?: string
        port?: number
        relayProtocol?: string
      }
      return {
        type: c.candidateType ?? null,
        protocol: c.protocol ?? null,
        address: c.address ?? null,
        port: c.port ?? null,
        relay: c.relayProtocol ?? null,
      }
    }
    netLog('ice-pair', { strategy: 'firebase', peerId, local: side(local), remote: side(remote) })
  } catch (error) {
    netLog('ice-pair', { strategy: 'firebase', peerId, error: error instanceof Error ? error.message : String(error) })
  }
}
