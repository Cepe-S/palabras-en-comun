const R = 38
const C = 2 * Math.PI * R

function fmt(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Timer({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const ratio = Math.max(0, Math.min(1, remainingMs / totalMs))
  const low = remainingMs <= 10_000
  return (
    <div class={`timer ${low ? 'timer--low' : ''}`} role="timer" aria-label={`Quedan ${fmt(remainingMs)}`}>
      <svg viewBox="0 0 90 90" aria-hidden="true">
        <circle class="timer__track" cx="45" cy="45" r={R} />
        <circle
          class="timer__bar"
          cx="45"
          cy="45"
          r={R}
          stroke-dasharray={C}
          stroke-dashoffset={C * (1 - ratio)}
        />
      </svg>
      <span class="timer__label">{fmt(remainingMs)}</span>
    </div>
  )
}
