import { describe, expect, it } from 'vitest'
import { MockSession } from './MockSession'
import { SCENARIOS } from './mocks'

describe('escenarios del DevHUD', () => {
  const sessions = SCENARIOS.filter((s) => s.kind === 'session')

  for (const role of ['host', 'guest'] as const) {
    for (const players of [2, 8]) {
      it(`todos se arman con ${players} jugadores como ${role}`, () => {
        for (const s of sessions) {
          const mock = new MockSession(s, { role, players })
          const { state, status } = mock.snapshot
          expect(state !== null || status !== 'connected', s.id).toBe(true)
        }
      })
    }
  }

  it('cada pantalla cae en la fase esperada', () => {
    const phase = (id: string) => {
      const s = sessions.find((x) => x.id === id)!
      return new MockSession(s, { role: 'host', players: 4 }).snapshot.state?.phase
    }
    expect(phase('lobby')).toBe('lobby')
    expect(phase('writing')).toBe('writing')
    expect(phase('reveal-word')).toBe('reveal')
    expect(phase('summary')).toBe('roundSummary')
    expect(phase('final')).toBe('final')
  })

  it('el revelado muestra el tipo de paso pedido', () => {
    const last = (id: string) => {
      const s = sessions.find((x) => x.id === id)!
      const steps = new MockSession(s, { role: 'host', players: 4 }).snapshot.state!.steps
      return steps[steps.length - 1]
    }
    expect(last('reveal-word')).toMatchObject({ kind: 'word' })
    expect(last('reveal-zero')).toMatchObject({ kind: 'word', points: 0 })
    expect(last('reveal-silent')).toMatchObject({ kind: 'turn' })
  })

  it('las acciones pasan por el motor real y los invitados no controlan la partida', () => {
    const lobby = sessions.find((x) => x.id === 'lobby')!
    const guest = new MockSession(lobby, { role: 'guest', players: 3 })
    guest.act({ type: 'start' })
    expect(guest.snapshot.state?.phase).toBe('lobby')
    const host = new MockSession(lobby, { role: 'host', players: 3 })
    host.act({ type: 'start' })
    expect(host.snapshot.state?.phase).toBe('writing')
  })
})
