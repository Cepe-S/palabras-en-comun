import type { ComponentChildren } from 'preact'
import type { Snapshot } from '../net/room'
import { Help } from './Help'
import { Scoreboard } from './Scoreboard'
import { SoundToggle } from './SoundToggle'
import { Stepper } from './Stepper'
import { canShareNatively, useInvite } from './useInvite'

interface Props {
  snap: Snapshot
  hold: boolean
  onLeave: () => void
  onRetry: () => void
  children: ComponentChildren
}

export function Logo() {
  return (
    <div class="logo">
      <span class="logo__dots" aria-hidden="true">
        <i class="c0" style="background:var(--p0)" />
        <i class="c1" style="background:var(--p1)" />
        <i class="c2" style="background:var(--p2)" />
      </span>
      <span class="logo__text">Palabras en común</span>
    </div>
  )
}

export function Shell({ snap, hold, onLeave, onRetry, children }: Props) {
  const state = snap.state
  const [feedback, invite] = useInvite(snap.code, state?.roomName)
  const showSide = !!state && ['word', 'writing', 'reveal', 'roundSummary'].includes(state.phase)

  const leave = () => {
    const inGame = state && state.phase !== 'lobby' && state.phase !== 'final'
    const msg = snap.isHost
      ? 'Si salís, se cierra la sala para todos. ¿Salir igual?'
      : '¿Seguro que querés salir de la partida?'
    if (!inGame && !snap.isHost) return onLeave()
    if (window.confirm(msg)) onLeave()
  }

  return (
    <div class="app">
      <header class="topbar">
        <Logo />
        <div class="topbar__right">
          <button
            class="pill pill--code"
            type="button"
            data-sfx="none"
            onClick={invite}
            title={canShareNatively() ? 'Compartir enlace de invitación' : 'Copiar enlace de invitación'}
          >
            {feedback ? (
              feedback === 'shared' ? '¡Compartido!' : '¡Enlace copiado!'
            ) : (
              <>
                {state?.roomName && <span class="pill__name">{state.roomName} · </span>}
                {snap.code}
              </>
            )}
          </button>
          <SoundToggle />
          <Help />
          <button class="btn btn--ghost" type="button" data-sfx="none" onClick={leave}>
            Salir
          </button>
        </div>
      </header>

      {state && <Stepper phase={state.phase} round={state.round} total={state.totalRounds} />}

      {snap.reconnecting && snap.status !== 'hostLost' && (
        <div class="notice stack" role="status">
          <span>{snap.message ?? 'Estamos intentando reconectar…'}</span>
          {!snap.isHost && (
            <div class="row">
              <button class="btn btn--sm" type="button" onClick={onRetry}>
                Reintentar ahora
              </button>
            </div>
          )}
        </div>
      )}

      {snap.message && snap.status !== 'hostLost' && !snap.reconnecting && (
        <div class={`notice ${snap.status === 'connecting' ? '' : 'notice--bad'}`} role="status">
          {snap.message}
        </div>
      )}

      {snap.status === 'hostLost' && (
        <div class="notice notice--bad stack" role="alert">
          <span>{snap.message ?? 'Se perdió la conexión.'} Seguimos intentando reconectar…</span>
          <div class="row">
            <button class="btn btn--sm" type="button" onClick={onRetry}>
              Reintentar ahora
            </button>
          </div>
        </div>
      )}

      <main class={`layout ${showSide ? 'layout--with-side' : ''} ${state?.phase === 'lobby' ? 'layout--lobby' : ''}`}>
        <div class="stage">{children}</div>
        {showSide && state && (
          <aside class="side">
            <Scoreboard state={state} myId={snap.playerId} hold={hold} />
          </aside>
        )}
      </main>
    </div>
  )
}
