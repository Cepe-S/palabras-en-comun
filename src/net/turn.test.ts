import { describe, expect, it } from 'vitest'
import { toTurnConfig } from './turn'

describe('toTurnConfig', () => {
  it('se queda con TURN y descarta STUN y el puerto 53', () => {
    const config = toTurnConfig([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      {
        urls: [
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turn:turn.cloudflare.com:53?transport=udp',
          'turns:turn.cloudflare.com:5349?transport=tcp',
        ],
        username: 'user',
        credential: 'secret',
      },
      { urls: 'no-es-turn' },
      null,
    ])
    expect(config).toEqual([
      {
        urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:5349?transport=tcp'],
        username: 'user',
        credential: 'secret',
      },
    ])
  })

  it('devuelve undefined si no hay ningún TURN usable', () => {
    expect(toTurnConfig([{ urls: ['stun:stun.l.google.com:19302'] }])).toBeUndefined()
    expect(toTurnConfig('no')).toBeUndefined()
  })
})
