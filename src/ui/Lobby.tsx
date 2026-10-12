import { useState } from 'preact/hooks'
import { MAX_PLAYERS, MIN_PLAYERS } from '../game/types'
import { roomLink, type Session, type Snapshot } from '../net/room'
import { PlayerToken } from './PlayerToken'
import { Rules } from './Home'

export function Lobby({ snap, session }: { snap: Snapshot; session: Session }) {
  const state = snap.state!
  const [copied, setCopied] = useState(false)
  const connected = state.players.filter((p) => p.connected).length
  const canStart = snap.isHost && connected >= MIN_PLAYERS
  const empty = Math.max(0, MAX_PLAYERS - state.players.length)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomLink(snap.code))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copiá este enlace para invitar a otros jugadores:', roomLink(snap.code))
    }
  }

  return (
    <>
      <section class="card code-card">
        <p class="eyebrow">Código de sala</p>
        <p class="code-card__code" aria-label={`Código ${snap.code.split('').join(' ')}`}>
          {snap.code}
        </p>
        <button class="btn" type="button" onClick={copy}>
          {copied ? '¡Enlace copiado!' : 'Copiar enlace de invitación'}
        </button>
        <p class="hint" style="margin-top:12px;color:var(--ink)">
          Pasales el código o el enlace. Se juega de a {MIN_PLAYERS} a {MAX_PLAYERS} jugadores.
        </p>
      </section>

      <section class="card stack">
        <h2 class="card__title" style="margin:0">
          Jugadores ({state.players.length}/{MAX_PLAYERS})
        </h2>
        <div class="seats">
          {state.players.map((p) => (
            <div class="seat" key={p.id}>
              <PlayerToken player={p} />
              <span class="seat__name">
                {p.name}
                {p.id === snap.playerId ? ' (vos)' : ''}
              </span>
              {p.id === state.hostId && <span class="tag">Anfitrión</span>}
            </div>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <div class="seat seat--empty" key={`e${i}`}>
              Lugar libre
            </div>
          ))}
        </div>

        {snap.isHost ? (
          <div class="stack" style="align-items:flex-start">
            <button
              class="btn btn--primary btn--big"
              type="button"
              disabled={!canStart}
              onClick={() => session.act({ type: 'start' })}
            >
              Empezar partida
            </button>
            {!canStart && <p class="hint">Hacen falta al menos {MIN_PLAYERS} jugadores para empezar.</p>}
          </div>
        ) : (
          <p class="notice">Esperando a que el anfitrión empiece la partida…</p>
        )}
      </section>

      <section class="card card--flat stack">
        <h2 class="card__title" style="margin:0">
          Cómo se juega
        </h2>
        <Rules wide />
      </section>
    </>
  )
}
