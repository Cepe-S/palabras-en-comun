/** Registro de conexión. Filtrá la consola por `[pec]`. El historial queda en `window.__pec`. */

export type NetDetail = Record<string, unknown> | string | number | boolean | null

interface PecWindow extends Window {
  __pec?: unknown[][]
}

const history: unknown[][] = []

export function netLog(event: string, detail?: NetDetail): void {
  const row = [new Date().toISOString().slice(11, 23), event, detail ?? null]
  history.push(row)
  if (typeof window !== 'undefined') (window as PecWindow).__pec = history
  if (detail === undefined) console.info('[pec]', event)
  else console.info('[pec]', event, detail)
}

export function installNetDebug(): void {
  if (typeof window === 'undefined') return
  const w = window as PecWindow & { __pecInstalled?: boolean }
  if (w.__pecInstalled) return
  w.__pecInstalled = true
  w.__pec = history
  const nav = navigator as Navigator & {
    connection?: { type?: string; effectiveType?: string; downlink?: number; rtt?: number }
  }
  netLog('env', {
    href: location.href,
    online: navigator.onLine,
    ua: navigator.userAgent,
    connection: nav.connection
      ? {
          type: nav.connection.type ?? null,
          effectiveType: nav.connection.effectiveType ?? null,
          downlink: nav.connection.downlink ?? null,
          rtt: nav.connection.rtt ?? null,
        }
      : null,
  })
  window.addEventListener('online', () => netLog('network', { online: true }))
  window.addEventListener('offline', () => netLog('network', { online: false }))
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason
    netLog('unhandled', reason instanceof Error ? reason.message : String(reason))
  })
}

const READY = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']

export function readyName(state: number | undefined): string {
  return state == null ? 'missing' : (READY[state] ?? String(state))
}
