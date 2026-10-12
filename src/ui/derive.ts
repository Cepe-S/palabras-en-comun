import { totalScore } from '../game/engine'
import type { Player, PublicState, RevealStep } from '../game/types'

export function playerById(players: Player[], id: string): Player | undefined {
  return players.find((p) => p.id === id)
}

export interface RoundWord {
  word: string
  count: number
  points: number
}

/** Palabras de cada jugador en la ronda, a partir de los pasos revelados. */
export function roundWordsByPlayer(steps: RevealStep[]): Record<string, RoundWord[]> {
  const out: Record<string, RoundWord[]> = {}
  for (const step of steps) {
    const list = (out[step.playerId] ??= [])
    if (step.kind === 'turn') {
      for (const w of step.silent) list.push({ word: w.word, count: w.count, points: w.points })
    } else {
      list.push({ word: step.word, count: step.count, points: step.points })
    }
  }
  return out
}

export interface BoardEntry {
  player: Player
  total: number
  /** Puntos de la ronda en curso (solo durante el revelado). */
  delta: number
}

/**
 * Puntajes para el marcador. Durante el revelado se suman los pasos ya mostrados;
 * con `hold` el último paso se oculta hasta que termine su animación.
 */
export function buildBoard(state: PublicState, hold: boolean): BoardEntry[] {
  let delta: Record<string, number> = {}
  if (state.phase === 'reveal') {
    const steps = hold ? state.steps.slice(0, -1) : state.steps
    for (const s of steps) delta[s.playerId] = (delta[s.playerId] ?? 0) + s.points
  } else {
    delta = {}
  }
  const entries = state.players.map((player) => {
    const d = delta[player.id] ?? 0
    return { player, total: totalScore(state.history, player.id) + d, delta: d }
  })
  return entries.sort((a, b) => b.total - a.total)
}
