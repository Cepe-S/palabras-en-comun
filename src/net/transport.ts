import type { Room, TurnServerConfig } from '@trystero-p2p/nostr'
import { installNetDebug, netLog, readyName } from './debug'
import { sendViaRoutes } from './route'
import { loadTurnConfig, NOSTR_RELAYS } from './turn'
import { resolvePeerConnection } from './webrtc'

export const APP_ID = 'palabras-en-comun-v1'
export type StrategyName = 'nostr' | 'torrent'

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
  leave(): void
}

interface Channel {
  name: StrategyName
  room: Room
  send: (data: string, target?: string) => Promise<void>
}

interface StrategyModule {
  joinRoom: (
    config: {
      appId: string
      passive?: boolean
      turnConfig?: TurnServerConfig[]
      rtcPolyfill?: typeof RTCPeerConnection
      relayConfig?: { urls: string[] }
    },
    roomId: string,
    callbacks?: { onJoinError?: (details: { error: string }) => void },
  ) => Room
  getRelaySockets: () => Record<string, WebSocket>
  selfId?: string
}

/**
 * Señalización por Nostr y BitTorrent a la vez. Los invitados entran en modo
 * pasivo: solo arman canal con el anfitrión, no entre ellos.
 *
 * El mismo navegador comparte un selfId, así que un par puede aparecer por las
 * dos estrategias. Si el envío por la primera falla, se prueba la otra.
 */
export class Transport implements Link {
  onMessage: (data: string, peerId: string) => void = () => {}
  onPeerJoin: (peerId: string) => void = () => {}
  onPeerLeave: (peerId: string) => void = () => {}
  onFailure: (strategy: StrategyName, error: string) => void = () => {}
  onSignaling: (open: boolean) => void = () => {}

  private channels: Channel[] = []
  private routes = new Map<string, Set<StrategyName>>()
  private pending = new Set<StrategyName>()
  private socketGetters: Array<() => Record<string, WebSocket>> = []
  private signalingTimer: ReturnType<typeof setInterval> | null = null
  private peerTimer: ReturnType<typeof setInterval> | null = null
  private socketState = new Map<string, number>()
  private watchedPeers = new Set<string>()
  private _signalingOpen = false
  private closed = false
  private turnReady: Promise<TurnServerConfig[] | undefined>

  constructor(
    private code: string,
    private passive: boolean,
  ) {
    installNetDebug()
    netLog('transport', { code, passive })
    this.turnReady = loadTurnConfig()
  }

  get strategies(): StrategyName[] {
    return this.channels.map((c) => c.name)
  }

  get signalingOpen(): boolean {
    return this._signalingOpen
  }

  async use(name: StrategyName): Promise<void> {
    if (this.closed || this.pending.has(name) || this.channels.some((c) => c.name === name)) return
    this.pending.add(name)
    netLog('strategy:start', { name })
    try {
      const [mod, turnConfig] = await Promise.all([this.load(name), this.turnReady])
      if (this.closed || this.channels.some((c) => c.name === name)) return
      this.attach(name, mod, turnConfig)
    } catch (error) {
      netLog('strategy:fail', { name, error: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      this.pending.delete(name)
    }
  }

  peers(): string[] {
    return [...this.routes.keys()]
  }

  sendTo(peerId: string, data: string): Promise<boolean> {
    const byName = new Map(this.channels.map((c) => [c.name, c]))
    return sendViaRoutes(peerId, data, this.channels.map((c) => c.name), this.routes, async (name, id, payload) => {
      const channel = byName.get(name)
      if (!channel) throw new Error('missing channel')
      try {
        await channel.send(payload, id)
        netLog('tx', { strategy: name, peerId: id, bytes: payload.length, t: msgType(payload) })
      } catch (error) {
        netLog('tx:fail', {
          strategy: name,
          peerId: id,
          t: msgType(payload),
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    }).then((ok) => {
      if (!ok) netLog('tx:drop', { peerId, t: msgType(data), routes: [...(this.routes.get(peerId) ?? [])] })
      return ok
    })
  }

  broadcast(data: string): void {
    for (const peerId of this.routes.keys()) void this.sendTo(peerId, data)
  }

  leave(): void {
    this.closed = true
    netLog('transport:leave', { code: this.code })
    if (this.signalingTimer) clearInterval(this.signalingTimer)
    this.signalingTimer = null
    if (this.peerTimer) clearInterval(this.peerTimer)
    this.peerTimer = null
    for (const c of this.channels) {
      try {
        c.room.leave()
      } catch {
        /* ya cerrada */
      }
    }
    this.channels = []
    this.routes.clear()
    this.socketGetters = []
  }

  private load(name: StrategyName): Promise<StrategyModule> {
    return name === 'nostr' ? import('@trystero-p2p/nostr') : import('@trystero-p2p/torrent')
  }

  private attach(name: StrategyName, mod: StrategyModule, turnConfig: TurnServerConfig[] | undefined): void {
    const rtcPolyfill = resolvePeerConnection()
    if (!rtcPolyfill) {
      netLog('webrtc', { strategy: name, type: typeof globalThis.RTCPeerConnection, source: 'missing' })
      this.onFailure(name, 'RTCPeerConnection is not a constructor')
      return
    }
    netLog('webrtc', {
      strategy: name,
      source: rtcPolyfill === globalThis.RTCPeerConnection ? 'window' : 'iframe',
    })
    const room = mod.joinRoom(
      {
        appId: APP_ID,
        passive: this.passive,
        rtcPolyfill,
        ...(turnConfig ? { turnConfig } : {}),
        ...(name === 'nostr' ? { relayConfig: { urls: NOSTR_RELAYS } } : {}),
      },
      this.code,
      {
        onJoinError: (details) => {
          const error = String(details.error)
          netLog('join-error', { strategy: name, error })
          this.onFailure(name, error)
        },
      },
    )
    netLog('strategy:joined', {
      name,
      selfId: mod.selfId ?? null,
      passive: this.passive,
      turn: Boolean(turnConfig?.length),
      relays: name === 'nostr' ? NOSTR_RELAYS : null,
    })
    const action = room.makeAction<string>('msg')
    action.onMessage = (data, { peerId }) => {
      if (typeof data === 'string') this.onMessage(data, peerId)
    }
    room.onPeerJoin = (peerId) => {
      let set = this.routes.get(peerId)
      const first = !set
      if (!set) this.routes.set(peerId, (set = new Set()))
      set.add(name)
      netLog('peer:join', { strategy: name, peerId, routes: [...set], first })
      this.watchPeer(name, peerId, room)
      if (first) this.onPeerJoin(peerId)
    }
    room.onPeerLeave = (peerId) => {
      const set = this.routes.get(peerId)
      if (!set) return
      set.delete(name)
      netLog('peer:leave', { strategy: name, peerId, routes: [...set] })
      if (set.size === 0) {
        this.routes.delete(peerId)
        this.onPeerLeave(peerId)
      }
    }
    this.channels.push({
      name,
      room,
      send: (data, target) => action.send(data, target ? { target } : undefined),
    })
    this.watchSockets(name, () => mod.getRelaySockets())
    this.watchPeers(name, room)
  }

  private watchPeers(name: StrategyName, room: Room): void {
    const scan = () => {
      let peers: Record<string, RTCPeerConnection> = {}
      try {
        peers = room.getPeers() ?? {}
      } catch {
        return
      }
      for (const peerId of Object.keys(peers)) this.watchPeer(name, peerId, room)
    }
    scan()
    if (!this.peerTimer) this.peerTimer = setInterval(scan, 500)
  }

  private watchPeer(name: StrategyName, peerId: string, room: Room): void {
    const key = `${name}:${peerId}`
    if (this.watchedPeers.has(key)) return
    const pc = room.getPeers()?.[peerId]
    if (!pc) return
    this.watchedPeers.add(key)
    const snapshot = (why: string) => {
      netLog('pc', {
        strategy: name,
        peerId,
        why,
        connection: pc.connectionState,
        ice: pc.iceConnectionState,
        gathering: pc.iceGatheringState,
        signaling: pc.signalingState,
      })
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        void logSelectedPair(name, peerId, pc)
      }
    }
    snapshot('attach')
    pc.addEventListener('connectionstatechange', () => snapshot('connection'))
    pc.addEventListener('iceconnectionstatechange', () => snapshot('ice'))
    pc.addEventListener('icegatheringstatechange', () => snapshot('gathering'))
    pc.addEventListener('signalingstatechange', () => snapshot('signaling'))
    pc.addEventListener('icecandidate', (ev) => {
      const c = ev.candidate
      if (!c) {
        netLog('ice-candidate', { strategy: name, peerId, end: true })
        return
      }
      netLog('ice-candidate', {
        strategy: name,
        peerId,
        type: c.type,
        protocol: c.protocol,
        tcpType: c.tcpType || null,
        address: c.address,
        port: c.port,
        relatedAddress: c.relatedAddress,
        relatedPort: c.relatedPort,
      })
    })
    pc.addEventListener('icecandidateerror', (ev) => {
      netLog('ice-error', {
        strategy: name,
        peerId,
        url: ev.url,
        errorCode: ev.errorCode,
        errorText: ev.errorText,
        address: ev.address,
        port: ev.port,
      })
    })
  }

  private watchSockets(name: StrategyName, get: () => Record<string, WebSocket>): void {
    this.socketGetters.push(get)
    if (!this.signalingTimer) this.signalingTimer = setInterval(() => this.refreshSignaling(), 500)
    this.refreshSignaling(name)
  }

  private refreshSignaling(strategy?: StrategyName): void {
    let open = false
    for (const get of this.socketGetters) {
      let sockets: Record<string, WebSocket> = {}
      try {
        sockets = get() ?? {}
      } catch (error) {
        netLog('relay:error', { strategy: strategy ?? null, error: error instanceof Error ? error.message : String(error) })
        continue
      }
      for (const [url, sock] of Object.entries(sockets)) {
        const state = sock?.readyState
        if (state === 1) open = true
        if (state == null || this.socketState.get(url) === state) continue
        this.socketState.set(url, state)
        netLog('relay', { url, state: readyName(state) })
      }
    }
    if (open === this._signalingOpen) return
    this._signalingOpen = open
    netLog('signaling', { open })
    this.onSignaling(open)
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

async function logSelectedPair(strategy: string, peerId: string, pc: RTCPeerConnection): Promise<void> {
  try {
    const stats = await pc.getStats()
    let pair: RTCIceCandidatePairStats | undefined
    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
        pair = report
      }
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
      return { type: c.candidateType ?? null, protocol: c.protocol ?? null, address: c.address ?? null, port: c.port ?? null, relay: c.relayProtocol ?? null }
    }
    netLog('ice-pair', { strategy, peerId, local: side(local), remote: side(remote) })
  } catch (error) {
    netLog('ice-pair', { strategy, peerId, error: error instanceof Error ? error.message : String(error) })
  }
}
