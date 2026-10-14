import { MAX_PLAYERS, MIN_PLAYERS } from '../game/types'
import type { SessionLike, Snapshot } from '../net/room'
import { PlayerToken } from './PlayerToken'
import { canShareNatively, useInvite } from './useInvite'

export function Lobby({ snap, session }: { snap: Snapshot; session: SessionLike }) {
  const state = snap.state!
  const [feedback, invite] = useInvite(snap.code, state.roomName)
  const connected = state.players.filter((p) => p.connected).length
  const canStart = snap.isHost && connected >= MIN_PLAYERS
  const empty = Math.max(0, MAX_PLAYERS - state.players.length)
  const inviteLabel =
    feedback === 'shared'
      ? '¡Enlace compartido!'
      : feedback === 'copied'
        ? '¡Enlace copiado!'
        : canShareNatively()
          ? 'Compartir enlace de invitación'
          : 'Copiar enlace de invitación'

  return (
    <>
      <section class="card code-card">
        <h2 class="code-card__name">{state.roomName}</h2>
        <p class="eyebrow">Código de sala</p>
        <p class="code-card__code" aria-label={`Código ${snap.code.split('').join(' ')}`}>
          {snap.code}
        </p>
        <button class="btn" type="button" data-sfx="none" onClick={invite}>
          {inviteLabel}
        </button>
        <p class="hint hide-sm" style="margin-top:12px;color:var(--ink)">
          Con el enlace entran directo, sin escribir el código. Se juega de a {MIN_PLAYERS} a {MAX_PLAYERS}{' '}
          jugadores.
        </p>
      </section>

      <section class="card stack">
        <h2 class="card__title" style="margin:0">
          Jugadores ({state.players.length}/{MAX_PLAYERS})
        </h2>
        <div class="seats">
          {state.players.map((p) => (
            <div class={`seat ${p.id === snap.playerId ? 'seat--me' : ''}`} key={p.id}>
              <PlayerToken player={p} />
              <span class="seat__name">{p.name}</span>
              {p.id === state.hostId && (
                <span class="seat__host" title="Anfitrión" aria-label="Anfitrión">
                  👑
                </span>
              )}
              {p.id === snap.playerId && <span class="sr-only">(vos)</span>}
            </div>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <div class="seat seat--empty" key={`e${i}`} aria-label="Lugar libre">
              +
            </div>
          ))}
        </div>
      </section>

      {snap.isHost ? (
        <div class="stack" style="align-items:stretch;text-align:center">
          <button
            class="btn btn--primary btn--big"
            style="width:100%;border-radius:var(--radius)"
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
    </>
  )
}
