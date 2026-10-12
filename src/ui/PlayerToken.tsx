import type { Player } from '../game/types'

interface Props {
  player: Pick<Player, 'name' | 'color'> & { connected?: boolean }
  size?: 'sm' | 'md' | 'lg'
  badge?: string
}

/** Ficha circular tipo meeple con la inicial del jugador. */
export function PlayerToken({ player, size = 'md', badge }: Props) {
  const initial = player.name.trim().charAt(0).toUpperCase() || '?'
  const cls = [
    'token',
    `c${player.color}`,
    size === 'sm' ? 'token--sm' : size === 'lg' ? 'token--lg' : '',
    player.connected === false ? 'token--off' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span class={cls} aria-hidden="true">
      {initial}
      {badge && <span class="token__badge">{badge}</span>}
    </span>
  )
}
