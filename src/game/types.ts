export const TOTAL_ROUNDS = 3
export const WORDS_PER_PLAYER = 8
export const WRITING_SECONDS = 90
/** Sorteo animado de la palabra antes de que arranque el cronómetro (ms). */
/** Al empezar la partida: carga falsa y anuncio, antes del primer sorteo (ms). */
export const START_LOADING_MS = 3000
export const START_ANNOUNCE_MS = 1800
export const START_MS = START_LOADING_MS + START_ANNOUNCE_MS
export const DRAW_SPIN_MS = 4200
export const DRAW_LANDED_MS = 5600
export const DRAW_MS = 6600
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8
export const MAX_WORD_LENGTH = 28
export const MAX_NAME_LENGTH = 14
export const MAX_ROOM_NAME_LENGTH = 30
/** Margen extra (ms) tras `endsAt` para recibir las últimas palabras de los clientes. */
export const WRITING_GRACE_MS = 1500

export type Phase = 'lobby' | 'writing' | 'reveal' | 'roundSummary' | 'final'

export interface Player {
  id: string
  name: string
  /** Índice en la paleta de colores de fichas. */
  color: number
  connected: boolean
  ready: boolean
}

/** Una palabra que ya se leyó antes y que igual suma puntos al jugador. */
export interface CountedWord {
  word: string
  count: number
  points: number
}

/** Inicio del turno de un jugador (puede traer palabras "ya contadas"). */
export interface TurnStep {
  kind: 'turn'
  playerId: string
  silent: CountedWord[]
  /** Cuántas palabras escribió el jugador en la ronda. */
  wordCount: number
  /** Puntos que aporta este paso (suma de las palabras ya contadas). */
  points: number
}

/** Una palabra revelada: cuántos jugadores la eligieron y quiénes. */
export interface WordStep {
  kind: 'word'
  playerId: string
  word: string
  key: string
  count: number
  voters: string[]
  points: number
}

export type RevealStep = TurnStep | WordStep

/** Estado completo, solo vive en el anfitrión. */
export interface GameState {
  roomName: string
  phase: Phase
  round: number
  hostId: string
  players: Player[]
  word: string | null
  usedWords: string[]
  endsAt: number | null
  submissions: Record<string, string[]>
  queue: RevealStep[]
  cursor: number
  /** Puntos por ronda ya cerradas, por jugador. */
  history: Record<string, number[]>
}

/** Lo que se envía a todos los jugadores (sin palabras ocultas). */
export interface PublicState {
  roomName: string
  phase: Phase
  round: number
  totalRounds: number
  hostId: string
  players: Player[]
  word: string | null
  endsAt: number | null
  /** Hora del anfitrión al emitir, para corregir el desfase de reloj. */
  hostNow: number
  /** Pasos del revelado ya mostrados (los ocultos no se envían). */
  steps: RevealStep[]
  totalSteps: number
  history: Record<string, number[]>
  /** Cantidad de palabras que lleva cada jugador en la escritura (sin revelar cuáles). */
  wordCounts: Record<string, number>
  /** Puntos de la ronda actual, según lo revelado hasta ahora. */
  roundPoints: Record<string, number>
}

export type Action =
  | { type: 'join'; id: string; name: string }
  | { type: 'disconnect'; id: string }
  | { type: 'start'; by: string }
  | { type: 'words'; id: string; words: string[]; ready?: boolean }
  | { type: 'tick' }
  | { type: 'next'; by: string }
  | { type: 'skipReveal'; by: string }
  | { type: 'playAgain'; by: string }

export interface Ctx {
  now: number
  random: () => number
}
