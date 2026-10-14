import { describe, expect, it } from 'vitest'
import { WRITING_SECONDS, type Player, type PublicState, type RevealStep } from '../game/types'
import type { Snapshot } from '../net/room'
import { cuesFor, drawCues, FINAL_MUSIC_DELAY_MS, HURRY_RATE, musicFor } from './director'

const NOW = 1_000_000

const player = (id: string, extra: Partial<Player> = {}): Player => ({
  id,
  name: id,
  color: 0,
  connected: true,
  ready: false,
  ...extra,
})

function state(extra: Partial<PublicState> = {}): PublicState {
  return {
    roomName: 'Sala',
    phase: 'lobby',
    round: 1,
    totalRounds: 3,
    hostId: 'h',
    players: [player('h'), player('me'), player('b')],
    word: null,
    endsAt: null,
    hostNow: NOW,
    steps: [],
    totalSteps: 0,
    history: {},
    wordCounts: {},
    roundPoints: {},
    ...extra,
  }
}

function snap(s: PublicState | null, extra: Partial<Snapshot> = {}): Snapshot {
  return {
    status: 'connected',
    message: null,
    code: 'ABCDE',
    isHost: false,
    playerId: 'me',
    name: 'me',
    state: s,
    clockOffset: 0,
    myWords: null,
    strategies: [],
    ...extra,
  }
}

const ids = (prev: Snapshot | null, next: Snapshot) => cuesFor(prev, next).map((c) => c.id)
const turn: RevealStep = { kind: 'turn', playerId: 'b', silent: [], wordCount: 8, points: 0 }
const word: RevealStep = {
  kind: 'word',
  key: 'sol',
  playerId: 'b',
  word: 'sol',
  voters: ['b', 'me'],
  count: 2,
  points: 2,
}

describe('musicFor', () => {
  it('suena la música de inicio sin partida o si la conexión falló', () => {
    expect(musicFor(null, NOW).track).toBe('inicio')
    expect(musicFor(snap(null, { status: 'connecting' }), NOW).track).toBe('inicio')
    expect(musicFor(snap(state(), { status: 'notFound' }), NOW).track).toBe('inicio')
  })

  it('elige una pista por fase', () => {
    expect(musicFor(snap(state()), NOW).track).toBe('sala')
    expect(musicFor(snap(state({ phase: 'reveal' })), NOW).track).toBe('revelado')
    expect(musicFor(snap(state({ phase: 'roundSummary' })), NOW).track).toBe('resumen')
    expect(musicFor(snap(state({ phase: 'final' })), NOW)).toMatchObject({
      track: 'final',
      delay: FINAL_MUSIC_DELAY_MS,
    })
  })

  it('en la escritura calla durante el sorteo, se acelera al final y se corta en los últimos 10 s', () => {
    const at = (remainingMs: number) => musicFor(snap(state({ phase: 'writing', endsAt: NOW + remainingMs })), NOW)
    expect(at(WRITING_SECONDS * 1000 + 2000).track).toBeNull()
    expect(at(60_000)).toMatchObject({ track: 'escritura', rate: 1 })
    expect(at(20_000)).toMatchObject({ track: 'escritura', rate: HURRY_RATE })
    expect(at(8_000).track).toBeNull()
  })

  it('baja la música si se perdió al anfitrión', () => {
    expect(musicFor(snap(state(), { status: 'hostLost' }), NOW)).toMatchObject({ track: 'sala', dim: true })
  })
})

describe('cuesFor', () => {
  it('no suena nada en la primera foto ni al cambiar de sala', () => {
    expect(ids(null, snap(state({ phase: 'reveal' })))).toEqual([])
    expect(ids(snap(state()), snap(state({ phase: 'reveal' }), { code: 'ZZZZZ' }))).toEqual([])
  })

  it('avisa cuando alguien entra o se va, pero no por uno mismo', () => {
    const before = snap(state())
    expect(ids(before, snap(state({ players: [...before.state!.players, player('c')] })))).toEqual([
      'sala/entra-jugador',
    ])
    expect(ids(before, snap(state({ players: [player('h'), player('me'), player('b', { connected: false })] })))).toEqual([
      'sala/sale-jugador',
    ])
    expect(ids(before, snap(state({ players: [player('h'), player('me')] })))).toEqual(['sala/sale-jugador'])
    expect(ids(before, snap(state({ players: [player('h'), player('me', { connected: false }), player('b')] })))).toEqual(
      [],
    )
  })

  it('suena el estado de la conexión', () => {
    const ok = snap(state())
    const lost = snap(state(), { status: 'hostLost' })
    expect(ids(ok, lost)).toEqual(['conexion/perdida'])
    expect(ids(lost, ok)).toEqual(['conexion/recuperada'])
    expect(ids(ok, snap(state(), { status: 'offline' }))).toEqual(['conexion/fallida'])
  })

  it('suena el comienzo del revelado', () => {
    expect(ids(snap(state({ phase: 'writing' })), snap(state({ phase: 'reveal' })))).toEqual(['revelado/inicio'])
  })

  it('distingue el resumen normal del revelado salteado', () => {
    const reveal = (steps: RevealStep[]) => snap(state({ phase: 'reveal', steps, totalSteps: 2 }))
    const summary = snap(state({ phase: 'roundSummary' }))
    expect(ids(reveal([turn, word]), summary)).toEqual(['resultados/resumen-ronda'])
    expect(ids(reveal([turn]), summary)).toEqual(['revelado/saltar', 'resultados/resumen-ronda'])
  })

  it('el final usa la fanfarria de empate si hay más de un ganador', () => {
    const summary = snap(state({ phase: 'roundSummary' }))
    const final = (history: Record<string, number[]>) => snap(state({ phase: 'final', history }))
    expect(ids(summary, final({ h: [5], me: [3], b: [1] }))).toEqual([
      'resultados/confeti',
      'resultados/fanfarria',
      'resultados/corona',
    ])
    expect(ids(summary, final({ h: [5], me: [5], b: [1] }))).toContain('resultados/fanfarria-empate')
  })

  it('en la escritura avisa cuando otro entrega o suma palabras (no uno mismo)', () => {
    const writing = (extra: Partial<PublicState>) => snap(state({ phase: 'writing', ...extra }))
    const base = writing({})
    const othersReady = writing({ players: [player('h'), player('me'), player('b', { ready: true })] })
    const meReady = writing({ players: [player('h'), player('me', { ready: true }), player('b')] })
    expect(ids(base, othersReady)).toEqual(['escritura/otro-listo'])
    expect(ids(base, meReady)).toEqual([])
    expect(ids(base, writing({ wordCounts: { b: 1 } }))).toEqual(['escritura/otra-palabra'])
    expect(ids(base, writing({ wordCounts: { me: 1 } }))).toEqual([])
  })

  it('cada paso del revelado suena según su tipo', () => {
    const reveal = (steps: RevealStep[]) => snap(state({ phase: 'reveal', steps, totalSteps: 2 }))
    expect(ids(reveal([]), reveal([turn]))).toEqual(['revelado/turno'])
    expect(ids(reveal([turn]), reveal([turn, word]))).toEqual(['revelado/carta'])
    expect(ids(reveal([turn]), reveal([turn]))).toEqual([])
  })
})

describe('drawCues', () => {
  it('suena cada etapa del sorteo una sola vez y en orden', () => {
    expect(drawCues(null, 'loading').map((c) => c.id)).toEqual(['sorteo/redoble-carga'])
    expect(drawCues('loading', 'announce').map((c) => c.id)).toEqual(['sorteo/anuncio', 'sorteo/confeti'])
    expect(drawCues('spin', 'landed').map((c) => c.id)).toEqual(['sorteo/premio'])
    expect(drawCues('landed', 'move').map((c) => c.id)).toEqual(['sorteo/traslado'])
    expect(drawCues('landed', 'landed')).toEqual([])
    expect(drawCues(null, 'landed')).toEqual([])
  })
})
