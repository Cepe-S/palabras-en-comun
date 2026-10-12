import { describe, expect, it } from 'vitest'
import { sendViaRoutes } from './route'

describe('sendViaRoutes', () => {
  it('usa el primer canal que tiene al par', async () => {
    const tried: string[] = []
    const ok = await sendViaRoutes(
      'peer',
      'hola',
      ['nostr', 'torrent'],
      new Map([['peer', new Set(['nostr', 'torrent'])]]),
      async (strategy) => {
        tried.push(strategy)
      },
    )
    expect(ok).toBe(true)
    expect(tried).toEqual(['nostr'])
  })

  it('si el primero rechaza el envío, prueba el siguiente', async () => {
    const tried: string[] = []
    const ok = await sendViaRoutes(
      'peer',
      'hola',
      ['nostr', 'torrent'],
      new Map([['peer', new Set(['nostr', 'torrent'])]]),
      async (strategy) => {
        tried.push(strategy)
        if (strategy === 'nostr') throw new Error('caído')
      },
    )
    expect(ok).toBe(true)
    expect(tried).toEqual(['nostr', 'torrent'])
  })

  it('no envía si ese par no está en ninguna ruta', async () => {
    let called = false
    const ok = await sendViaRoutes('nadie', 'hola', ['nostr'], new Map(), async () => {
      called = true
    })
    expect(ok).toBe(false)
    expect(called).toBe(false)
  })

  it('devuelve false si todos los canales fallan', async () => {
    const ok = await sendViaRoutes(
      'peer',
      'hola',
      ['nostr', 'torrent'],
      new Map([['peer', new Set(['nostr', 'torrent'])]]),
      async () => {
        throw new Error('caído')
      },
    )
    expect(ok).toBe(false)
  })
})
