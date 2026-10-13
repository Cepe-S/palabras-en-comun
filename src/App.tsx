import type { ComponentType } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useState } from 'preact/hooks'
import type { DevHudProps, DevView } from './dev/types'
import {
  clearSaved,
  codeFromHash,
  loadSaved,
  Session,
  type SavedSession,
  type SessionLike,
  type Snapshot,
} from './net/room'
import { Final } from './ui/Final'
import { Home } from './ui/Home'
import { Lobby } from './ui/Lobby'
import { RevealPhase } from './ui/RevealPhase'
import { RoundSummary } from './ui/RoundSummary'
import { Logo, Shell } from './ui/Shell'
import { WritingPhase } from './ui/WritingPhase'

function ConnectScreen({ snap, onLeave }: { snap: Snapshot; onLeave: () => void }) {
  const failed = snap.status === 'rejected' || snap.status === 'notFound' || snap.status === 'offline'
  return (
    <div class="app">
      <div class="home stack" style="gap:20px">
        <div class="row row--center">
          <Logo />
        </div>
        <div class="card stack center" style="padding:32px 20px">
          {!failed && <div class="spinner" role="status" aria-label="Conectando" />}
          <h2>{failed ? 'No pudimos entrar' : `Conectando con la sala ${snap.code}…`}</h2>
          {failed ? (
            <p class="notice notice--bad" role="alert">
              {snap.message}
            </p>
          ) : (
            <>
              <p class="muted">
                Buscando al anfitrión. Puede tardar unos segundos, ¡no cierres la página!
              </p>
              {snap.message && (
                <p class="notice" role="status">
                  {snap.message}
                </p>
              )}
            </>
          )}
          <button class="btn" type="button" onClick={onLeave}>
            {failed ? 'Volver al inicio' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** DevHUD: solo existe en desarrollo; en producción el `import()` se elimina del build. */
function useDevHud(): ComponentType<DevHudProps> | null {
  const [Hud, setHud] = useState<ComponentType<DevHudProps> | null>(null)
  useEffect(() => {
    if (import.meta.env.DEV) void import('./dev/DevHUD').then((m) => setHud(() => m.DevHUD))
  }, [])
  return Hud
}

export function App() {
  const hashCode = useMemo(() => codeFromHash(window.location.hash), [])
  // Al recargar la pestaña se retoma sola la partida guardada (salvo que el enlace apunte a otra sala).
  const [initial] = useState(() => {
    const saved = loadSaved()
    const resume = saved && (!hashCode || hashCode === saved.code)
    return { saved: resume ? null : saved, session: resume && saved ? Session.resume(saved) : null }
  })
  const [session, setSession] = useState<SessionLike | null>(initial.session)
  const [saved, setSaved] = useState<SavedSession | null>(initial.saved)
  const [hold, setHold] = useState(false)

  // Vista de desarrollo (DevHUD): reemplaza a la sesión real sin cerrarla.
  const [devView, setDevView] = useState<DevView | null>(null)
  const Hud = useDevHud()
  const active: SessionLike | null =
    devView?.kind === 'session' ? devView.mock : devView?.kind === 'home' ? null : session

  // La sesión es la fuente de verdad: solo se vuelve a renderizar cuando avisa un cambio.
  const [, rerender] = useState(0)
  useLayoutEffect(() => {
    if (!active) return
    return active.subscribe(() => rerender((n) => n + 1))
  }, [active])
  const snap: Snapshot | null = active?.snapshot ?? null

  const phase = snap?.state?.phase
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [phase])

  const start = (next: Session) => {
    setDevView(null)
    session?.close()
    setHold(false)
    setSession(next)
    setSaved(null)
  }

  const leave = () => {
    if (devView) return setDevView(null)
    session?.leave()
    clearSaved()
    setSession(null)
    setSaved(null)
    setHold(false)
    if (window.location.hash) history.replaceState(null, '', window.location.pathname)
  }

  const retry = () => {
    if (devView || !session || session.snapshot.isHost) return
    const { code, name } = session.snapshot
    start(Session.join(code, name))
  }

  const content = (() => {
    if (!active || !snap) {
      return (
        <Home
          key={devView?.kind === 'home' ? devView.label : 'home'}
          initialCode={hashCode}
          saved={devView ? null : saved}
          devOpenRules={devView?.kind === 'home' && devView.openRules}
          onHost={(name, roomName) => start(Session.host(name, roomName))}
          onJoin={(code, name) => start(Session.join(code, name))}
          onResume={() => saved && start(Session.resume(saved))}
          onForget={() => {
            clearSaved()
            setSaved(null)
          }}
        />
      )
    }

    const state = snap.state
    if (!state || snap.status === 'rejected' || snap.status === 'notFound' || snap.status === 'offline') {
      return <ConnectScreen snap={snap} onLeave={leave} />
    }

    const screen = (() => {
      switch (state.phase) {
        case 'lobby':
          return <Lobby snap={snap} session={active} />
        case 'writing':
          return <WritingPhase key={state.round} snap={snap} session={active} />
        case 'reveal':
          return <RevealPhase snap={snap} session={active} onHold={setHold} />
        case 'roundSummary':
          return <RoundSummary snap={snap} session={active} />
        case 'final':
          return <Final snap={snap} session={active} onLeave={leave} />
      }
    })()

    return (
      <Shell snap={snap} hold={hold} onLeave={leave} onRetry={retry}>
        {screen}
      </Shell>
    )
  })()

  return (
    <>
      {content}
      {Hud && <Hud active={active} devView={devView} onView={setDevView} />}
    </>
  )
}
