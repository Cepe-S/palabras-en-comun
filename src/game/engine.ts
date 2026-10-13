import { WORDS } from '../data/words'
import {
  MAX_PLAYERS,
  DRAW_MS,
  MAX_NAME_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  MAX_WORD_LENGTH,
  MIN_PLAYERS,
  TOTAL_ROUNDS,
  WORDS_PER_PLAYER,
  WRITING_GRACE_MS,
  WRITING_SECONDS,
  type Action,
  type CountedWord,
  type Ctx,
  type GameState,
  type Player,
  type PublicState,
  type RevealStep,
} from './types'

/* ---------- Texto ---------- */

/** Forma canónica para comparar palabras: minúsculas, sin tildes, sin espacios extra. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function cleanWord(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, MAX_WORD_LENGTH)
}

/** Limpia una lista de palabras: sin vacías, sin repetidas, sin la palabra inicial, máximo 8. */
export function sanitizeWords(words: unknown, prompt: string | null): string[] {
  if (!Array.isArray(words)) return []
  const seen = new Set<string>()
  if (prompt) seen.add(normalize(prompt))
  const out: string[] = []
  for (const raw of words) {
    if (typeof raw !== 'string') continue
    const word = cleanWord(raw)
    const key = normalize(word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(word)
    if (out.length >= WORDS_PER_PLAYER) break
  }
  return out
}

export type AddWordResult = { ok: true; words: string[] } | { ok: false; error: string }

/** Validación al agregar una palabra desde la interfaz. */
export function addWord(words: string[], input: string, prompt: string | null): AddWordResult {
  const word = cleanWord(input)
  const key = normalize(word)
  if (!key) return { ok: false, error: 'Escribí una palabra.' }
  if (words.length >= WORDS_PER_PLAYER) return { ok: false, error: 'Ya tenés las 8 palabras.' }
  if (prompt && key === normalize(prompt)) {
    return { ok: false, error: 'No vale usar la palabra de la ronda.' }
  }
  if (words.some((w) => normalize(w) === key)) {
    return { ok: false, error: 'Ya escribiste esa palabra.' }
  }
  return { ok: true, words: [...words, word] }
}

/* ---------- Puntaje ---------- */

/** Una palabra vale tantos puntos como jugadores la eligieron; si nadie más la eligió, 0. */
export function scoreFor(count: number): number {
  return count > 1 ? count : 0
}

export function computeCounts(submissions: Record<string, string[]>): Map<string, string[]> {
  const counts = new Map<string, string[]>()
  for (const [playerId, words] of Object.entries(submissions)) {
    const keys = new Set(words.map(normalize))
    for (const key of keys) {
      const voters = counts.get(key)
      if (voters) voters.push(playerId)
      else counts.set(key, [playerId])
    }
  }
  return counts
}

/**
 * Arma la cola de revelado. Cada jugador abre un turno; sus palabras ya leídas por
 * jugadores anteriores no se vuelven a leer (van como "ya contadas"), el resto se
 * revela una por una.
 */
export function buildRevealQueue(
  order: string[],
  submissions: Record<string, string[]>,
): RevealStep[] {
  const counts = computeCounts(submissions)
  const revealed = new Set<string>()
  const steps: RevealStep[] = []

  for (const playerId of order) {
    const words = submissions[playerId] ?? []
    const silent: CountedWord[] = []
    const fresh: RevealStep[] = []

    for (const word of words) {
      const key = normalize(word)
      const voters = counts.get(key) ?? [playerId]
      const count = voters.length
      const points = scoreFor(count)
      if (revealed.has(key)) {
        silent.push({ word, count, points })
      } else {
        fresh.push({ kind: 'word', playerId, word, key, count, voters, points })
      }
    }

    steps.push({
      kind: 'turn',
      playerId,
      silent,
      wordCount: words.length,
      points: silent.reduce((sum, w) => sum + w.points, 0),
    })
    for (const step of fresh) {
      if (step.kind === 'word') revealed.add(step.key)
      steps.push(step)
    }
  }
  return steps
}

export function sumPoints(steps: RevealStep[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const step of steps) {
    totals[step.playerId] = (totals[step.playerId] ?? 0) + step.points
  }
  return totals
}

export function totalScore(history: Record<string, number[]>, playerId: string): number {
  return (history[playerId] ?? []).reduce((a, b) => a + b, 0)
}

/** Ids de los ganadores (puede haber empate). */
export function winners(players: Player[], history: Record<string, number[]>): string[] {
  if (players.length === 0) return []
  const scores = players.map((p) => ({ id: p.id, score: totalScore(history, p.id) }))
  const best = Math.max(...scores.map((s) => s.score))
  return scores.filter((s) => s.score === best).map((s) => s.id)
}

/* ---------- Estado ---------- */

/** Nombre de sala: el elegido o, si está vacío, "Sala de <anfitrión>". */
export function resolveRoomName(roomName: string | undefined, hostName: string): string {
  const clean = cleanWord(roomName ?? '').slice(0, MAX_ROOM_NAME_LENGTH)
  return clean || `Sala de ${cleanWord(hostName).slice(0, MAX_NAME_LENGTH)}`
}

export function createGame(hostId: string, hostName: string, roomName?: string): GameState {
  const state: GameState = {
    roomName: resolveRoomName(roomName, hostName),
    phase: 'lobby',
    round: 0,
    hostId,
    players: [],
    word: null,
    usedWords: [],
    endsAt: null,
    submissions: {},
    queue: [],
    cursor: 0,
    history: {},
  }
  return addPlayer(state, hostId, hostName)
}

function freeColor(players: Player[]): number {
  const used = new Set(players.map((p) => p.color))
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i
  return players.length % MAX_PLAYERS
}

function uniqueName(players: Player[], name: string): string {
  const base = cleanWord(name).slice(0, MAX_NAME_LENGTH) || 'Jugador'
  let candidate = base
  let n = 2
  while (players.some((p) => normalize(p.name) === normalize(candidate))) {
    candidate = `${base} ${n++}`
  }
  return candidate
}

function addPlayer(state: GameState, id: string, name: string): GameState {
  const player: Player = {
    id,
    name: uniqueName(state.players, name),
    color: freeColor(state.players),
    connected: true,
    ready: false,
  }
  return { ...state, players: [...state.players, player] }
}

function pickWord(state: GameState, ctx: Ctx): GameState {
  let pool = WORDS.filter((w) => !state.usedWords.includes(w))
  let used = state.usedWords
  if (pool.length === 0) {
    pool = [...WORDS]
    used = []
  }
  const word = pool[Math.floor(ctx.random() * pool.length)]
  return { ...state, word, usedWords: [...used, word] }
}

// La palabra se muestra y el cronómetro arranca en el mismo instante para todos.
function startWordPhase(state: GameState, ctx: Ctx, round: number): GameState {
  return pickWord(
    {
      ...state,
      phase: 'writing',
      round,
      endsAt: ctx.now + DRAW_MS + WRITING_SECONDS * 1000,
      submissions: {},
      queue: [],
      cursor: 0,
      players: state.players.map((p) => ({ ...p, ready: false })),
    },
    ctx,
  )
}

function finishWriting(state: GameState): GameState {
  // El jugador que abre el revelado rota cada ronda para repartir el suspenso.
  const ids = state.players.map((p) => p.id)
  const offset = ids.length ? (state.round - 1) % ids.length : 0
  const order = [...ids.slice(offset), ...ids.slice(0, offset)]
  return {
    ...state,
    phase: 'reveal',
    endsAt: null,
    queue: buildRevealQueue(order, state.submissions),
    cursor: 0,
  }
}

function closeRound(state: GameState): GameState {
  const points = sumPoints(state.queue)
  const history: Record<string, number[]> = { ...state.history }
  for (const p of state.players) {
    history[p.id] = [...(history[p.id] ?? []), points[p.id] ?? 0]
  }
  return { ...state, phase: 'roundSummary', cursor: state.queue.length, history }
}

function everyoneReady(state: GameState): boolean {
  const active = state.players.filter((p) => p.connected)
  return active.length > 0 && active.every((p) => p.ready)
}

export function reduce(state: GameState, action: Action, ctx: Ctx): GameState {
  const isHost = (id: string) => id === state.hostId

  switch (action.type) {
    case 'join': {
      const existing = state.players.find((p) => p.id === action.id)
      if (existing) {
        return {
          ...state,
          players: state.players.map((p) => (p.id === action.id ? { ...p, connected: true } : p)),
        }
      }
      if (state.phase !== 'lobby' || state.players.length >= MAX_PLAYERS) return state
      return addPlayer(state, action.id, action.name)
    }

    case 'disconnect': {
      if (!state.players.some((p) => p.id === action.id)) return state
      if (state.phase === 'lobby' && !isHost(action.id)) {
        return { ...state, players: state.players.filter((p) => p.id !== action.id) }
      }
      const next = {
        ...state,
        players: state.players.map((p) => (p.id === action.id ? { ...p, connected: false } : p)),
      }
      return next.phase === 'writing' && everyoneReady(next) ? finishWriting(next) : next
    }

    case 'start': {
      if (state.phase !== 'lobby' || !isHost(action.by)) return state
      if (state.players.filter((p) => p.connected).length < MIN_PLAYERS) return state
      return startWordPhase({ ...state, history: {}, usedWords: [] }, ctx, 1)
    }

    case 'words': {
      if (state.phase !== 'writing') return state
      if (!state.players.some((p) => p.id === action.id)) return state
      const words = sanitizeWords(action.words, state.word)
      const ready = action.ready ?? undefined
      const next: GameState = {
        ...state,
        submissions: { ...state.submissions, [action.id]: words },
        players:
          ready === undefined
            ? state.players
            : state.players.map((p) => (p.id === action.id ? { ...p, ready } : p)),
      }
      return everyoneReady(next) ? finishWriting(next) : next
    }

    case 'tick': {
      if (state.phase === 'writing' && state.endsAt !== null) {
        if (ctx.now >= state.endsAt + WRITING_GRACE_MS) return finishWriting(state)
      }
      return state
    }

    case 'next': {
      if (!isHost(action.by)) return state
      if (state.phase === 'reveal') {
        return state.cursor >= state.queue.length
          ? closeRound(state)
          : { ...state, cursor: state.cursor + 1 }
      }
      if (state.phase === 'roundSummary') {
        return state.round >= TOTAL_ROUNDS
          ? { ...state, phase: 'final', word: null }
          : startWordPhase(state, ctx, state.round + 1)
      }
      return state
    }

    case 'skipReveal': {
      if (state.phase !== 'reveal' || !isHost(action.by)) return state
      return closeRound(state)
    }

    case 'playAgain': {
      if (state.phase !== 'final' || !isHost(action.by)) return state
      return {
        ...state,
        phase: 'lobby',
        round: 0,
        word: null,
        endsAt: null,
        submissions: {},
        queue: [],
        cursor: 0,
        history: {},
        players: state.players
          .filter((p) => p.connected)
          .map((p) => ({ ...p, ready: false })),
      }
    }
  }
}

/** Vista pública: solo muestra lo ya revelado, nunca las palabras ocultas. */
export function toPublic(state: GameState, now: number): PublicState {
  const steps = state.queue.slice(0, state.cursor)
  return {
    roomName: state.roomName,
    phase: state.phase,
    round: state.round,
    totalRounds: TOTAL_ROUNDS,
    hostId: state.hostId,
    players: state.players,
    word: state.word,
    endsAt: state.endsAt,
    hostNow: now,
    steps,
    totalSteps: state.queue.length,
    history: state.history,
    wordCounts:
      state.phase === 'writing'
        ? Object.fromEntries(Object.entries(state.submissions).map(([id, w]) => [id, w.length]))
        : {},
    roundPoints: sumPoints(steps),
  }
}
