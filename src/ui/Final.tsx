import { totalScore, winners } from '../game/engine'
import { TOTAL_ROUNDS } from '../game/types'
import type { SessionLike, Snapshot } from '../net/room'
import { PlayerToken } from './PlayerToken'

const CONFETTI_COLORS = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)']

function Confetti() {
  return (
    <div class="confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={`left:${(i * 53) % 100}%;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};animation-duration:${3 + (i % 5) * 0.6}s;animation-delay:${(i % 9) * 0.25}s`}
        />
      ))}
    </div>
  )
}

export function Final({ snap, session, onLeave }: { snap: Snapshot; session: SessionLike; onLeave: () => void }) {
  const state = snap.state!
  const winnerIds = winners(state.players, state.history)
  const top = state.players.filter((p) => winnerIds.includes(p.id))
  const rows = state.players
    .map((p) => ({ player: p, rounds: state.history[p.id] ?? [], total: totalScore(state.history, p.id) }))
    .sort((a, b) => b.total - a.total)
  const bestScore = rows[0]?.total ?? 0

  return (
    <>
      <Confetti />
      <section class="card stack center" style="padding:28px 20px">
        <p class="eyebrow">Fin de la partida</p>
        <h2>{top.length > 1 ? '¡Victoria compartida!' : '¡Tenemos ganador!'}</h2>
        <div class="podium">
          {top.map((p) => (
            <div class="podium__item" key={p.id}>
              <span class="podium__crown" aria-hidden="true">
                👑
              </span>
              <PlayerToken player={p} size="lg" />
              <span style="font-size:1.2rem">{p.name}</span>
              <span class="podium__score">{bestScore}</span>
              <span class="muted">puntos</span>
            </div>
          ))}
        </div>
      </section>

      <section class="card stack">
        <h3 class="card__title" style="margin:0">
          Puntaje por ronda
        </h3>
        <table class="table">
          <thead>
            <tr>
              <th>Jugador</th>
              {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
                <th key={i}>R{i + 1}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, rounds, total }) => (
              <tr key={player.id} class={winnerIds.includes(player.id) ? 'tr--lead' : ''}>
                <td>
                  <span class="who">
                    <PlayerToken player={player} size="sm" />
                    {player.name}
                  </span>
                </td>
                {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
                  <td key={i}>{rounds[i] ?? 0}</td>
                ))}
                <td>{total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div class="row row--center">
          {snap.isHost ? (
            <button class="btn btn--primary btn--big" type="button" onClick={() => session.act({ type: 'playAgain' })}>
              Jugar de nuevo
            </button>
          ) : (
            <p class="hint">Esperando al anfitrión para jugar otra vez…</p>
          )}
          <button class="btn" type="button" data-sfx="none" onClick={onLeave}>
            Salir
          </button>
        </div>
      </section>
    </>
  )
}
