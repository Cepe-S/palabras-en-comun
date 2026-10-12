import { useEffect, useMemo, useState } from 'preact/hooks'
import {
  clearSaved,
  codeFromHash,
  loadSaved,
  Session,
  type SavedSession,
  type Snapshot,
} from './net/room'
import { Final } from './ui/Final'
import { Home } from './ui/Home'
import { Lobby } from './ui/Lobby'
import { RevealPhase } from './ui/RevealPhase'
import { RoundSummary } from './ui/RoundSummary'
import { Logo, Shell } from './ui/Shell'
import { WordPhase } from './ui/WordPhase'
import { WritingPhase } from './ui/WritingPhase'

function ConnectScreen({ snap, onLeave }: { snap: Snapshot; onLeave: () => void }) {
  const failed = snap.status === 'rejected' || snap.status === 'notFound'
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
            <p class="muted">
              Buscando al anfitrión. Puede tardar unos segundos, ¡no cierres la página!
            </p>
          )}
          <button class="btn" type="button" onClick={onLeave}>
            {failed ? 'Volver al inicio' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const hashCode = useMemo(() => codeFromHash(window.location.hash), [])
  // Al recargar la pestaña se retoma sola la partida guardada (salvo que el enlace apunte a otra sala).
  const [initial] = useState(() => {
    const saved = loadSaved()
    const resume = saved && (!hashCode || hashCode === saved.code)
    return { saved: resume ? null : saved, session: resume && saved ? Session.resume(saved) : null }
  })
  const [session, setSession] = useState<Session | null>(initial.session)
  const [snap, setSnap] = useState<Snapshot | null>(initial.session?.snapshot ?? null)
  const [saved, setSaved] = useState<SavedSession | null>(initial.saved)
  const [hold, setHold] = useState(false)

  useEffect(() => {
    if (!session) return
    setSnap(session.snapshot)
    return session.subscribe(setSnap)
  }, [session])

  const phase = snap?.state?.phase
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [phase])

  const start = (next: Session) => {
    session?.close()
    setHold(false)
    setSession(next)
    setSnap(next.snapshot)
    setSaved(null)
  }

  const leave = () => {
    session?.leave()
    clearSaved()
    setSession(null)
    setSnap(null)
    setSaved(null)
    setHold(false)
    if (window.location.hash) history.replaceState(null, '', window.location.pathname)
  }

  const retry = () => {
    if (!session || session.snapshot.isHost) return
    const { code, name } = session.snapshot
    start(Session.join(code, name))
  }

  if (!session || !snap) {
    return (
      <Home
        initialCode={hashCode}
        saved={saved}
        onHost={(name) => start(Session.host(name))}
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
  if (!state || snap.status === 'rejected' || snap.status === 'notFound') {
    return <ConnectScreen snap={snap} onLeave={leave} />
  }

  const screen = (() => {
    switch (state.phase) {
      case 'lobby':
        return <Lobby snap={snap} session={session} />
      case 'word':
        return <WordPhase snap={snap} session={session} />
      case 'writing':
        return <WritingPhase key={state.round} snap={snap} session={session} />
      case 'reveal':
        return <RevealPhase snap={snap} session={session} onHold={setHold} />
      case 'roundSummary':
        return <RoundSummary snap={snap} session={session} />
      case 'final':
        return <Final snap={snap} session={session} onLeave={leave} />
    }
  })()

  return (
    <Shell snap={snap} hold={hold} onLeave={leave} onRetry={retry}>
      {screen}
    </Shell>
  )
}
