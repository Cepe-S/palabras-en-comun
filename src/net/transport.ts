import type { Room, TurnServerConfig } from '@trystero-p2p/nostr'
import { sendViaRoutes } from './route'
import { loadTurnConfig, NOSTR_RELAYS } from './turn'

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
      relayConfig?: { urls: string[] }
    },
    roomId: string,
    callbacks?: { onJoinError?: (details: { error: string }) => void },
  ) => Room
  getRelaySockets: () => Record<string, WebSocket>
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
  private _signalingOpen = false
  private closed = false
  private turnReady: Promise<TurnServerConfig[] | undefined>

  constructor(
    private code: string,
    private passive: boolean,
  ) {
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
    try {
      const [mod, turnConfig] = await Promise.all([this.load(name), this.turnReady])
      if (this.closed || this.channels.some((c) => c.name === name)) return
      this.attach(name, mod, turnConfig)
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
      await channel.send(payload, id)
    })
  }

  broadcast(data: string): void {
    for (const peerId of this.routes.keys()) void this.sendTo(peerId, data)
  }

  leave(): void {
    this.closed = true
    if (this.signalingTimer) clearInterval(this.signalingTimer)
    this.signalingTimer = null
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
    const room = mod.joinRoom(
      {
        appId: APP_ID,
        passive: this.passive,
        ...(turnConfig ? { turnConfig } : {}),
        ...(name === 'nostr' ? { relayConfig: { urls: NOSTR_RELAYS } } : {}),
      },
      this.code,
      {
        onJoinError: (details) => this.onFailure(name, String(details.error)),
      },
    )
    const action = room.makeAction<string>('msg')
    action.onMessage = (data, { peerId }) => {
      if (typeof data === 'string') this.onMessage(data, peerId)
    }
    room.onPeerJoin = (peerId) => {
      let set = this.routes.get(peerId)
      const first = !set
      if (!set) this.routes.set(peerId, (set = new Set()))
      set.add(name)
      if (first) this.onPeerJoin(peerId)
    }
    room.onPeerLeave = (peerId) => {
      const set = this.routes.get(peerId)
      if (!set) return
      set.delete(name)
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
    this.watchSockets(() => mod.getRelaySockets())
  }

  private watchSockets(get: () => Record<string, WebSocket>): void {
    this.socketGetters.push(get)
    if (!this.signalingTimer) this.signalingTimer = setInterval(() => this.refreshSignaling(), 500)
    this.refreshSignaling()
  }

  private refreshSignaling(): void {
    let open = false
    for (const get of this.socketGetters) {
      let sockets: Record<string, WebSocket> = {}
      try {
        sockets = get() ?? {}
      } catch {
        continue
      }
      for (const sock of Object.values(sockets)) {
        if (sock?.readyState === 1) open = true
      }
    }
    if (open === this._signalingOpen) return
    this._signalingOpen = open
    this.onSignaling(open)
    if (open && this.signalingTimer) {
      clearInterval(this.signalingTimer)
      this.signalingTimer = null
    }
  }
}
