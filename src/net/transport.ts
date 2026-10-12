import type { Room } from '@trystero-p2p/nostr'

export const APP_ID = 'palabras-en-comun-v1'
export type StrategyName = 'nostr' | 'torrent'

interface Channel {
  name: StrategyName
  room: Room
  send: (data: string, target?: string) => void
}

/**
 * Capa de transporte sobre Trystero. Puede usar varias estrategias de señalización a
 * la vez (Nostr y BitTorrent): los mensajes salen por la primera ruta disponible de
 * cada par, y los eventos de entrada/salida se unifican.
 *
 * Los mensajes viajan como texto JSON.
 */
export class Transport {
  onMessage: (data: string, peerId: string) => void = () => {}
  onPeerJoin: (peerId: string) => void = () => {}
  onPeerLeave: (peerId: string) => void = () => {}
  onFailure: (strategy: StrategyName, error: string) => void = () => {}

  private channels: Channel[] = []
  private routes = new Map<string, Set<StrategyName>>()
  private closed = false

  constructor(private code: string) {}

  get strategies(): StrategyName[] {
    return this.channels.map((c) => c.name)
  }

  async use(name: StrategyName): Promise<void> {
    if (this.closed || this.channels.some((c) => c.name === name)) return
    const mod =
      name === 'nostr' ? await import('@trystero-p2p/nostr') : await import('@trystero-p2p/torrent')
    if (this.closed) return

    const room = mod.joinRoom({ appId: APP_ID }, this.code, {
      onJoinError: (details) => this.onFailure(name, String(details.error)),
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
      send: (data, target) => {
        action.send(data, target ? { target } : undefined).catch(() => {})
      },
    })
  }

  peers(): string[] {
    return [...this.routes.keys()]
  }

  sendTo(peerId: string, data: string): void {
    const route = this.routes.get(peerId)
    if (!route) return
    const channel = this.channels.find((c) => route.has(c.name))
    channel?.send(data, peerId)
  }

  broadcast(data: string): void {
    for (const peerId of this.routes.keys()) this.sendTo(peerId, data)
  }

  leave(): void {
    this.closed = true
    for (const c of this.channels) {
      try {
        c.room.leave()
      } catch {
        /* ya cerrada */
      }
    }
    this.channels = []
    this.routes.clear()
  }
}
