import type { PublicState } from '../game/types'
import { buildBoard } from './derive'
import { PlayerToken } from './PlayerToken'

interface Props {
  state: PublicState
  myId: string
  hold: boolean
}

export function Scoreboard({ state, myId, hold }: Props) {
  const board = buildBoard(state, hold)
  const writing = state.phase === 'writing'
  return (
    <section class="card" aria-label="Marcador">
      <h2 class="card__title">Marcador</h2>
      <ol class="board" style="list-style:none;margin:0;padding:0">
        {board.map(({ player, total, delta }, i) => (
          <li key={player.id} class={`board__row ${player.id === myId ? 'board__row--me' : ''}`}>
            <span class="board__pos">{i + 1}</span>
            <PlayerToken player={player} size="sm" badge={writing && player.ready ? '✓' : undefined} />
            <span class="board__name">
              {player.name}
              {player.id === myId ? ' (vos)' : ''}
            </span>
            <span class="board__score">
              {delta > 0 && <span class="board__delta">+{delta}</span>}
              {total}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
