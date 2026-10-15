import { reduce, toPublic } from '../game/engine'
import type { Action, GameState, PublicState } from '../game/types'
import type { SessionLike, Snapshot, UiAction } from '../net/room'
import {
  fillWords,
  GUEST_ID,
  HOST_ID,
  mockCtx,
  NAMES,
  type MockOpts,
  type Scenario,
} from './mocks'

type Listener = (snap: Snapshot) => void
type SessionScenario = Extract<Scenario, { kind: 'session' }>

/**
 * Sesión simulada para el DevHUD. Cumple el mismo contrato que `Session`, pero el
 * estado vive en memoria y las acciones pasan por el `reduce` real: los botones de las
 * pantallas funcionan igual que en una partida, sin red.
 */
export class MockSession implements SessionLike {
  snapshot!: Snapshot
  private listeners = new Set<Listener>()
  private game: GameState | null = null

  constructor(
    readonly scenario: SessionScenario,
    readonly opts: MockOpts,
  ) {
    this.reset()
  }

  private get me(): string {
    return this.opts.role === 'host' ? HOST_ID : GUEST_ID
  }

  /** Vuelve al estado inicial del escenario. */
  reset(): void {
    const built = this.scenario.build(this.opts)
    this.game = built.game
    this.snapshot = {
      status: built.status ?? 'connected',
      message: built.message ?? null,
      code: 'DEV42',
      isHost: this.opts.role === 'host',
      playerId: this.me,
      name: NAMES[this.opts.role === 'host' ? 0 : 1],
      state: built.game ? toPublic(built.game, Date.now()) : null,
      clockOffset: 0,
      myWords: built.myWords ?? null,
      strategies: ['dev'],
      reconnecting: built.reconnecting ?? false,
    }
    this.emit()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  now(): number {
    return Date.now()
  }

  act(action: UiAction): void {
    const full: Action =
      action.type === 'words'
        ? { type: 'words', id: this.me, words: action.words, ready: action.ready }
        : { ...action, by: this.me }
    this.dispatch(full)
  }

  /** Aplica una acción del motor tal cual (útil para forzar jugadas de otros). */
  dispatch(action: Action): void {
    if (!this.game) return
    this.game = reduce(this.game, action, mockCtx())
    this.snapshot = { ...this.snapshot, state: toPublic(this.game, Date.now()) }
    this.emit()
  }

  /** Los demás jugadores entregan sus palabras (yo no). */
  othersReady(): void {
    if (!this.game) return
    this.game = fillWords(this.game, [this.me])
    this.snapshot = { ...this.snapshot, state: toPublic(this.game, Date.now()) }
    this.emit()
  }

  /** Reemplaza el estado público por uno a mano. Se pisa con la próxima acción. */
  inject(state: PublicState): void {
    this.snapshot = { ...this.snapshot, state }
    this.emit()
  }

  leave(): void {}
  close(): void {}

  private emit(): void {
    this.listeners.forEach((l) => l(this.snapshot))
  }
}
