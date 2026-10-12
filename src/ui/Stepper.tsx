import type { Phase } from '../game/types'

const STEPS = ['Palabra', 'Escribir', 'Revelar']

function activeIndex(phase: Phase): number {
  switch (phase) {
    case 'word':
      return 0
    case 'writing':
      return 1
    case 'reveal':
      return 2
    case 'roundSummary':
      return 3
    default:
      return -1
  }
}

export function Stepper({ phase, round, total }: { phase: Phase; round: number; total: number }) {
  const active = activeIndex(phase)
  if (active < 0) return null
  return (
    <nav class="stepper" aria-label="Progreso de la ronda">
      <span class="pill stepper__round">
        Ronda {round} de {total}
      </span>
      {STEPS.map((label, i) => {
        const cls = i === active ? 'step step--active' : i < active ? 'step step--done' : 'step'
        return (
          <span key={label} class={cls} aria-current={i === active ? 'step' : undefined}>
            <span class="step__n">{i < active ? '✓' : i + 1}</span>
            {label}
          </span>
        )
      })}
    </nav>
  )
}
