import { useEffect, useRef } from 'preact/hooks'
import { sfx } from '../audio/engine'
import type { PublicState } from '../game/types'
import { buildBoard } from './derive'
import { PlayerToken } from './PlayerToken'
import { WordPie } from './WordPie'

interface Props {
  state: PublicState
  myId: string
  hold: boolean
}

/** Silbido cuando alguien pasa adelante en el marcador durante el revelado. */
function useOvertakeSound(order: string[], active: boolean) {
  const prev = useRef(order)
  const key = order.join()
  useEffect(() => {
    const before = prev.current
    prev.current = order
    if (active && order.some((id, i) => before.includes(id) && before.indexOf(id) > i)) sfx('revelado/sube-puesto')
  }, [key])
}

export function Scoreboard({ state, myId, hold }: Props) {
  const board = buildBoard(state, hold)
  const writing = state.phase === 'writing'
  useOvertakeSound(
    board.map((r) => r.player.id),
    state.phase === 'reveal',
  )
  return (
    <section class="card" aria-label="Marcador">
      <h2 class="card__title board-title">Marcador</h2>
      <ol class={`board ${writing ? 'board--writing' : ''}`} style="list-style:none;margin:0;padding:0">
        {board.map(({ player, total, delta }, i) => (
          <li key={player.id} class={`board__row ${player.id === myId ? 'board__row--me' : ''}`}>
            <span class="board__pos">{i + 1}</span>
            <PlayerToken player={player} size="sm" badge={writing && player.ready ? '✓' : undefined} />
            <span class="board__name">
              {player.name}
              {player.id === myId && <span class="hide-sm"> (vos)</span>}
            </span>
            {writing && <WordPie count={state.wordCounts?.[player.id] ?? 0} color={player.color} />}
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
