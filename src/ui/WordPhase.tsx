import { WORDS_PER_PLAYER, WRITING_SECONDS } from '../game/types'
import type { Session, Snapshot } from '../net/room'
import { WordCard } from './WordCard'

export function WordPhase({ snap, session }: { snap: Snapshot; session: Session }) {
  const state = snap.state!
  const minutes = `${Math.floor(WRITING_SECONDS / 60)}:${String(WRITING_SECONDS % 60).padStart(2, '0')}`
  return (
    <section class="card word-stage" style="padding:28px 20px">
      <p class="eyebrow">
        Ronda {state.round} de {state.totalRounds}
      </p>
      <WordCard key={state.word} label="La palabra es" word={state.word ?? '…'} accent />
      <p style="max-width:420px;font-weight:700">
        Van a tener <b>{minutes}</b> para escribir <b>{WORDS_PER_PLAYER} palabras</b> relacionadas con
        esta. ¡Pensá en lo que escribirían los demás!
      </p>
      {snap.isHost ? (
        <div class="row row--center">
          <button class="btn" type="button" onClick={() => session.act({ type: 'reroll' })}>
            Otra palabra
          </button>
          <button class="btn btn--primary btn--big" type="button" onClick={() => session.act({ type: 'begin' })}>
            ¡Empezar a escribir!
          </button>
        </div>
      ) : (
        <p class="notice">El anfitrión da la salida cuando todos estén listos…</p>
      )}
    </section>
  )
}
