import { totalScore } from '../game/engine'
import type { Session, Snapshot } from '../net/room'
import { playerById, roundWordsByPlayer } from './derive'
import { PlayerToken } from './PlayerToken'

export function RoundSummary({ snap, session }: { snap: Snapshot; session: Session }) {
  const state = snap.state!
  const words = roundWordsByPlayer(state.steps)
  const lastRound = state.round >= state.totalRounds
  const rows = state.players
    .map((p) => ({
      player: p,
      round: state.history[p.id]?.[state.round - 1] ?? 0,
      total: totalScore(state.history, p.id),
    }))
    .sort((a, b) => b.total - a.total || b.round - a.round)
  const bestRound = Math.max(...rows.map((r) => r.round))

  return (
    <>
      <section class="card stack">
        <div>
          <p class="eyebrow">
            Ronda {state.round} de {state.totalRounds} · {state.word}
          </p>
          <h2>Resultado de la ronda</h2>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Ronda</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, round, total }) => (
              <tr key={player.id} class={round === bestRound && round > 0 ? 'tr--lead' : ''}>
                <td>
                  <span class="who">
                    <PlayerToken player={player} size="sm" />
                    {player.name}
                    {player.id === snap.playerId ? ' (vos)' : ''}
                  </span>
                </td>
                <td>+{round}</td>
                <td>{total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {snap.isHost ? (
          <div class="row row--center">
            <button class="btn btn--primary btn--big" type="button" onClick={() => session.act({ type: 'next' })}>
              {lastRound ? 'Ver resultado final' : `Empezar ronda ${state.round + 1}`}
            </button>
          </div>
        ) : (
          <p class="hint" style="text-align:center">
            Esperando al anfitrión para continuar…
          </p>
        )}
      </section>

      <section class="card card--flat stack">
        <h3 class="card__title" style="margin:0">
          Todas las palabras
        </h3>
        <div>
          {state.players.map((p) => {
            const list = words[p.id] ?? []
            return (
              <div class="player-words" key={p.id}>
                <span class="who">
                  <PlayerToken player={playerById(state.players, p.id) ?? p} size="sm" />
                  {p.name}
                </span>
                <div class="counted" style="justify-content:flex-start">
                  {list.length === 0 && <span class="muted">Sin palabras</span>}
                  {list.map((w) => (
                    <span class={`wchip ${w.points > 0 ? 'wchip--hit' : 'wchip--miss'}`} key={w.word}>
                      {w.word}
                      <span class="wchip__n">{w.points > 0 ? `+${w.points}` : '0'}</span>
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
