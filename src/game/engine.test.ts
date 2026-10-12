import { describe, expect, it } from 'vitest'
import {
  addWord,
  buildRevealQueue,
  computeCounts,
  createGame,
  normalize,
  reduce,
  sanitizeWords,
  scoreFor,
  sumPoints,
  toPublic,
  totalScore,
  winners,
} from './engine'
import type { Action, Ctx, GameState } from './types'

const ctx = (now = 0): Ctx => ({ now, random: () => 0 })

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => reduce(s, a, ctx()), state)
}

function lobby(...names: string[]): GameState {
  let s = createGame('host', names[0])
  names.slice(1).forEach((n, i) => {
    s = run(s, { type: 'join', id: `p${i + 1}`, name: n })
  })
  return s
}

describe('normalize', () => {
  it('ignora mayúsculas, tildes y espacios', () => {
    expect(normalize('  CAFÉ   con  Leche ')).toBe('cafe con leche')
    expect(normalize('Niño')).toBe('nino')
  })
})

describe('sanitizeWords / addWord', () => {
  it('quita vacías, repetidas, la palabra inicial y limita a 8', () => {
    const words = ['Arena', 'arena', ' ', 'Sol', 'Playa', 'a', 'b', 'c', 'd', 'e', 'f', 'g']
    const out = sanitizeWords(words, 'playa')
    expect(out).toEqual(['Arena', 'Sol', 'a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('addWord valida repetidas (sin tildes) y la palabra inicial', () => {
    expect(addWord(['Café'], 'cafe', 'Mesa').ok).toBe(false)
    expect(addWord([], 'MESA', 'mesa').ok).toBe(false)
    expect(addWord([], '  ', 'mesa').ok).toBe(false)
    const ok = addWord(['Sol'], ' mar ', 'Playa')
    expect(ok).toEqual({ ok: true, words: ['Sol', 'mar'] })
  })
})

describe('puntaje', () => {
  it('vale la cantidad de jugadores si hay coincidencia y 0 si nadie más la eligió', () => {
    expect(scoreFor(1)).toBe(0)
    expect(scoreFor(2)).toBe(2)
    expect(scoreFor(5)).toBe(5)
  })

  it('cuenta las coincidencias normalizadas por jugador', () => {
    const counts = computeCounts({ a: ['Sol', 'Mar'], b: ['sol'], c: ['SOL', 'Arena'] })
    expect(counts.get('sol')).toEqual(['a', 'b', 'c'])
    expect(counts.get('mar')).toEqual(['a'])
  })
})

describe('cola de revelado', () => {
  const submissions = {
    a: ['Sol', 'Mar', 'Arena'],
    b: ['sol', 'Arena', 'Ola'],
    c: ['Sol', 'Mar'],
  }
  const queue = buildRevealQueue(['a', 'b', 'c'], submissions)

  it('no relee las palabras ya reveladas', () => {
    const words = queue.filter((s) => s.kind === 'word').map((s) => (s.kind === 'word' ? s.word : ''))
    expect(words).toEqual(['Sol', 'Mar', 'Arena', 'Ola'])
  })

  it('las palabras repetidas de turnos siguientes quedan como ya contadas con sus puntos', () => {
    const turnB = queue.find((s) => s.kind === 'turn' && s.playerId === 'b')
    const turnC = queue.find((s) => s.kind === 'turn' && s.playerId === 'c')
    expect(turnB?.kind === 'turn' && turnB.silent.map((w) => w.word)).toEqual(['sol', 'Arena'])
    expect(turnB?.points).toBe(3 + 2)
    expect(turnC?.kind === 'turn' && turnC.points).toBe(3 + 2)
  })

  it('el total por jugador es el mismo sin importar el orden', () => {
    expect(sumPoints(queue)).toEqual({ a: 3 + 2 + 2, b: 3 + 2 + 0, c: 3 + 2 })
    const reversed = sumPoints(buildRevealQueue(['c', 'b', 'a'], submissions))
    expect(reversed).toEqual({ a: 7, b: 5, c: 5 })
  })

  it('la palabra que nadie más eligió vale 0', () => {
    const ola = queue.find((s) => s.kind === 'word' && s.word === 'Ola')
    expect(ola?.points).toBe(0)
    expect(ola?.kind === 'word' && ola.count).toBe(1)
  })
})

describe('flujo de partida', () => {
  it('no deja iniciar con un solo jugador', () => {
    const s = run(lobby('Ana'), { type: 'start', by: 'host' })
    expect(s.phase).toBe('lobby')
  })

  it('solo el anfitrión controla las fases', () => {
    const s0 = lobby('Ana', 'Beto')
    expect(run(s0, { type: 'start', by: 'p1' }).phase).toBe('lobby')
    expect(run(s0, { type: 'start', by: 'host' }).phase).toBe('word')
  })

  it('juega 3 rondas completas y calcula el ganador', () => {
    let s = run(lobby('Ana', 'Beto', 'Cami'), { type: 'start', by: 'host' })
    for (let round = 1; round <= 3; round++) {
      expect(s.phase).toBe('word')
      expect(s.round).toBe(round)
      s = run(s, { type: 'begin', by: 'host' })
      expect(s.phase).toBe('writing')
      s = run(
        s,
        { type: 'words', id: 'host', words: ['uno', 'dos'], ready: true },
        { type: 'words', id: 'p1', words: ['uno', 'tres'], ready: true },
        { type: 'words', id: 'p2', words: ['uno', 'dos'], ready: true },
      )
      expect(s.phase).toBe('reveal')
      while (s.phase === 'reveal') s = run(s, { type: 'next', by: 'host' })
      expect(s.phase).toBe('roundSummary')
      s = run(s, { type: 'next', by: 'host' })
    }
    expect(s.phase).toBe('final')
    // uno x3 = 3, dos x2 = 2, tres x1 = 0
    expect(totalScore(s.history, 'host')).toBe((3 + 2) * 3)
    expect(totalScore(s.history, 'p1')).toBe(3 * 3)
    expect(totalScore(s.history, 'p2')).toBe((3 + 2) * 3)
    expect(winners(s.players, s.history).sort()).toEqual(['host', 'p2'])
  })

  it('termina la escritura al vencer el tiempo (con margen)', () => {
    let s = run(lobby('Ana', 'Beto'), { type: 'start', by: 'host' })
    s = reduce(s, { type: 'begin', by: 'host' }, ctx(1000))
    expect(s.endsAt).toBe(1000 + 90_000)
    expect(reduce(s, { type: 'tick' }, ctx(91_000)).phase).toBe('writing')
    expect(reduce(s, { type: 'tick' }, ctx(93_000)).phase).toBe('reveal')
  })

  it('no cuenta a los desconectados para cerrar la escritura', () => {
    let s = run(lobby('Ana', 'Beto'), { type: 'start', by: 'host' }, { type: 'begin', by: 'host' })
    s = run(s, { type: 'words', id: 'host', words: ['x'], ready: true })
    expect(s.phase).toBe('writing')
    s = run(s, { type: 'disconnect', id: 'p1' })
    expect(s.phase).toBe('reveal')
  })

  it('la vista pública no filtra palabras ocultas', () => {
    let s = run(lobby('Ana', 'Beto'), { type: 'start', by: 'host' }, { type: 'begin', by: 'host' })
    s = run(s, { type: 'words', id: 'host', words: ['secreta'], ready: true })
    expect(JSON.stringify(toPublic(s, 0))).not.toContain('secreta')
  })

  it('no admite jugadores nuevos con la partida en curso, pero sí reconexiones', () => {
    let s = run(lobby('Ana', 'Beto'), { type: 'start', by: 'host' })
    expect(run(s, { type: 'join', id: 'nuevo', name: 'Zeta' }).players).toHaveLength(2)
    s = run(s, { type: 'disconnect', id: 'p1' })
    expect(s.players.find((p) => p.id === 'p1')?.connected).toBe(false)
    s = run(s, { type: 'join', id: 'p1', name: 'Beto' })
    expect(s.players.find((p) => p.id === 'p1')?.connected).toBe(true)
  })

  it('no repite la palabra de la ronda dentro de una partida', () => {
    let s = run(lobby('Ana', 'Beto'), { type: 'start', by: 'host' })
    const seen = new Set([s.word])
    for (let i = 0; i < 5; i++) {
      s = run(s, { type: 'reroll', by: 'host' })
      expect(seen.has(s.word)).toBe(false)
      seen.add(s.word)
    }
  })
})
