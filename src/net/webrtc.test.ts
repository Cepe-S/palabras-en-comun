import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolvePeerConnection } from './webrtc'

describe('resolvePeerConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('usa el constructor de la ventana si se puede instanciar', () => {
    class Peer {
      close(): void {}
    }
    vi.stubGlobal('RTCPeerConnection', Peer)
    expect(resolvePeerConnection()).toBe(Peer)
  })

  it('si la ventana no lo tiene, lo toma de un iframe', () => {
    class Peer {
      close(): void {}
    }
    const frame = {
      hidden: false,
      setAttribute(): void {},
      contentWindow: { RTCPeerConnection: Peer },
      remove(): void {},
    }
    vi.stubGlobal('RTCPeerConnection', undefined)
    vi.stubGlobal('document', {
      documentElement: { appendChild(): void {} },
      createElement: () => frame,
    })
    expect(resolvePeerConnection()).toBe(Peer)
  })

  it('si tampoco está en el iframe, no inventa un constructor', () => {
    vi.stubGlobal('RTCPeerConnection', undefined)
    vi.stubGlobal('document', {
      documentElement: { appendChild(): void {} },
      createElement: () => ({
        hidden: false,
        setAttribute(): void {},
        contentWindow: {},
        remove(): void {},
      }),
    })
    expect(resolvePeerConnection()).toBeUndefined()
  })
})
