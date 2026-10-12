interface Props {
  label: string
  word: string
  accent?: boolean
}

/** Carta grande que se da vuelta al aparecer (se re-anima al cambiar la `key`). */
export function WordCard({ label, word, accent = false }: Props) {
  return (
    <div class={`big-card ${accent ? 'big-card--accent' : ''}`}>
      <div class="big-card__face flip-in">
        <p class="eyebrow">{label}</p>
        <p class="big-card__word">{word}</p>
      </div>
    </div>
  )
}
