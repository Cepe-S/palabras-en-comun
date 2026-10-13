import type { SessionLike } from '../net/room'
import type { MockSession } from './MockSession'

/** Qué está mostrando la app en lugar de la sesión real mientras se usa el DevHUD. */
export type DevView =
  | { kind: 'session'; label: string; mock: MockSession }
  | { kind: 'home'; label: string; openRules: boolean }

export interface DevHudProps {
  /** Sesión que se está mostrando ahora (real o simulada). */
  active: SessionLike | null
  devView: DevView | null
  onView: (view: DevView | null) => void
}
