import { WORDS_PER_PLAYER } from '../game/types'

const C = 17
const R_OUT = 14.5
const R_IN = 6
const GAP = 0.2 // radianes de separación entre porciones
const DEPTH = 2 // "volumen": sombra dura desplazada, como en las tarjetas

function segment(i: number): string {
  const step = (2 * Math.PI) / WORDS_PER_PLAYER
  const a0 = i * step - Math.PI / 2 + GAP / 2
  const a1 = (i + 1) * step - Math.PI / 2 - GAP / 2
  const pt = (r: number, a: number) =>
    `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`
  return (
    `M${pt(R_OUT, a0)} A${R_OUT} ${R_OUT} 0 0 1 ${pt(R_OUT, a1)} ` +
    `L${pt(R_IN, a1)} A${R_IN} ${R_IN} 0 0 0 ${pt(R_IN, a0)} Z`
  )
}

const PATHS = Array.from({ length: WORDS_PER_PLAYER }, (_, i) => segment(i))

/** Dona de 8 porciones separadas y con volumen: una por cada palabra escrita. */
export function WordPie({ count, color }: { count: number; color: number }) {
  return (
    <svg class="pie" viewBox="0 0 34 36" role="img" aria-label={`${count} de ${WORDS_PER_PLAYER} palabras`}>
      {PATHS.map((d, i) => (
        <path key={`s${i}`} d={d} class="pie__shadow" transform={`translate(0 ${DEPTH})`} />
      ))}
      {PATHS.map((d, i) => (
        <path
          key={i}
          d={d}
          class={i < count ? 'pie__on' : 'pie__off'}
          style={i < count ? `fill:var(--p${color})` : undefined}
        />
      ))}
    </svg>
  )
}
