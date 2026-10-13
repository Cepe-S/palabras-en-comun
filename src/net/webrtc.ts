/**
 * Algunas extensiones borran `RTCPeerConnection` de la ventana principal para
 * ocultar la IP local, pero el constructor sigue en un iframe nuevo.
 */
export function resolvePeerConnection(): typeof RTCPeerConnection | undefined {
  const direct = fromWindow(typeof globalThis === 'undefined' ? undefined : (globalThis as unknown as Window))
  if (direct) return direct
  if (typeof document === 'undefined') return undefined
  const frame = document.createElement('iframe')
  frame.hidden = true
  frame.setAttribute('aria-hidden', 'true')
  document.documentElement.appendChild(frame)
  try {
    return fromWindow(frame.contentWindow)
  } finally {
    frame.remove()
  }
}

function fromWindow(win: Window | null | undefined): typeof RTCPeerConnection | undefined {
  if (!win) return undefined
  const extra = win as unknown as { RTCPeerConnection?: unknown; webkitRTCPeerConnection?: unknown }
  return constructable(extra.RTCPeerConnection) ?? constructable(extra.webkitRTCPeerConnection)
}

function constructable(ctor: unknown): typeof RTCPeerConnection | undefined {
  if (typeof ctor !== 'function') return undefined
  try {
    const Peer = ctor as typeof RTCPeerConnection
    const pc = new Peer({ iceServers: [] })
    pc.close()
    return Peer
  } catch {
    return undefined
  }
}
