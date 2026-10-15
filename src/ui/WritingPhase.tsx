import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { sfx } from '../audio/engine'
import { useCountdownSound } from '../audio/useAudio'
import { addWord } from '../game/engine'
import { DRAW_MS, WORDS_PER_PLAYER, WRITING_SECONDS } from '../game/types'
import type { SessionLike, Snapshot } from '../net/room'
import { DrawIntro, drawStage, type DrawStage } from './DrawIntro'
import { setDrawStage } from './drawStore'
import { useTick } from './hooks'
import { Timer } from './Timer'

const SYNC_DELAY_MS = 350

export function WritingPhase({ snap, session }: { snap: Snapshot; session: SessionLike }) {
  const state = snap.state!
  const me = state.players.find((p) => p.id === snap.playerId)

  const [draft, setDraft] = useState<string[]>(snap.myWords ?? [])
  const [ready, setReady] = useState(me?.ready ?? false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const touched = useRef(false)
  const sentFinal = useRef(false)
  const latest = useRef({ draft, ready })
  latest.current = { draft, ready }

  useTick(100)
  const rawRemaining = Math.max(0, (state.endsAt ?? 0) - session.now())
  const total = WRITING_SECONDS * 1000
  // Los primeros DRAW_MS son el sorteo animado: el cronómetro arranca recién después.
  const startAt = (state.endsAt ?? 0) - total - DRAW_MS
  const target = drawStage(session.now() - startAt)
  const stage = useDrawTransition(target)
  const intro = stage !== 'done'
  const remaining = Math.min(rawRemaining, total)
  const timeUp = rawRemaining <= 0
  // El bloqueo sigue al reloj, no a la animación: si la animación se atrasa, igual se puede escribir.
  const waiting = target !== 'done'
  const locked = ready || timeUp || waiting
  useCountdownSound(remaining, !waiting && !timeUp, timeUp)

  const send = (words: string[], isReady?: boolean) => {
    clearTimeout(syncTimer.current)
    session.act({ type: 'words', words, ready: isReady })
  }

  // Si el anfitrión nos devuelve palabras guardadas (recarga o reconexión), las recuperamos.
  useEffect(() => {
    if (!touched.current && snap.myWords?.length && latest.current.draft.length === 0) {
      setDraft(snap.myWords)
    }
  }, [snap.myWords])

  // Al terminar el tiempo se entrega lo que haya.
  useEffect(() => {
    if (timeUp && !sentFinal.current) {
      sentFinal.current = true
      setReady(true)
      send(latest.current.draft, true)
    }
  }, [timeUp])

  useEffect(() => () => clearTimeout(syncTimer.current), [])

  const change = (next: string[]) => {
    touched.current = true
    setDraft(next)
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => send(next, latest.current.ready), SYNC_DELAY_MS)
  }

  const add = (e: Event) => {
    e.preventDefault()
    if (locked) return
    const result = addWord(draft, text, state.word)
    if (!result.ok) {
      setError(result.error)
      sfx('interfaz/error')
      return
    }
    // Cada casillero suena un poco más agudo que el anterior.
    sfx('escritura/agregar-palabra', { rate: 0.9 + result.words.length * 0.05 })
    if (result.words.length === WORDS_PER_PLAYER) sfx('escritura/ocho-palabras', { delay: 150 })
    setError('')
    setText('')
    change(result.words)
    inputRef.current?.focus()
  }

  const remove = (index: number) => {
    if (locked) return
    sfx('escritura/quitar-palabra')
    change(draft.filter((_, i) => i !== index))
    inputRef.current?.focus()
  }

  const toggleReady = () => {
    const next = !ready
    sfx(next ? 'escritura/listo' : 'escritura/seguir-editando')
    touched.current = true
    setReady(next)
    send(draft, next)
  }

  const connected = state.players.filter((p) => p.connected)
  const readyCount = connected.filter((p) => (p.id === snap.playerId ? ready : p.ready)).length

  return (
    <>
      <section
        class={`card stack writing ${stage !== 'move' && stage !== 'done' ? 'writing--hidden' : stage === 'move' && !canTransition() ? 'writing--enter' : ''}`}
      >
        <div class="writing__head">
          <div class="writing__word">
            <span class="eyebrow">
              Escribí palabras <span class="hide-sm">relacionadas </span>con
            </span>
            <strong class={stage === 'move' ? 'vt-word' : ''}>{state.word}</strong>
          </div>
          <div class={stage === 'move' ? 'vt-timer' : ''}>
            <Timer remainingMs={remaining} totalMs={total} />
          </div>
        </div>

        <div class="progress" aria-live="polite">
          <span>
            {draft.length}/{WORDS_PER_PLAYER}
          </span>
          <div class="progress__bar">
            <div class="progress__fill" style={`width:${(draft.length / WORDS_PER_PLAYER) * 100}%`} />
          </div>
        </div>

        <ol class="slots" style="list-style:none;margin:0;padding:0">
          {Array.from({ length: WORDS_PER_PLAYER }, (_, i) => {
            const word = draft[i]
            return word ? (
              <li class="slot slot--filled" key={`${i}-${word}`}>
                <span class="slot__n">{i + 1}</span>
                <span class="slot__word" title={word}>
                  {word}
                </span>
                {!locked && (
                  <button
                    type="button"
                    class="slot__remove"
                    data-sfx="none"
                    aria-label={`Quitar ${word}`}
                    onClick={() => remove(i)}
                  >
                    ×
                  </button>
                )}
              </li>
            ) : (
              <li class="slot" key={`e${i}`}>
                <span class="slot__n">{i + 1}</span>
              </li>
            )
          })}
        </ol>

        <form class="stack" style="gap:8px" onSubmit={add}>
          <div class="entry">
            <input
              ref={inputRef}
              class="input"
              value={text}
              disabled={locked}
              maxLength={28}
              autofocus
              autocomplete="off"
              autocapitalize="sentences"
              enterkeyhint="done"
              placeholder={
                waiting
                  ? 'Preparate…'
                  : timeUp
                    ? 'Se acabó el tiempo'
                    : ready
                      ? 'Tus palabras ya fueron entregadas'
                      : 'Escribí una palabra…'
              }
              aria-label="Nueva palabra"
              onInput={(e) => {
                setText((e.target as HTMLInputElement).value)
                setError('')
              }}
            />
            <button class="btn btn--primary" type="submit" data-sfx="none" disabled={locked || !text.trim()}>
              Agregar
            </button>
          </div>
          <p class="error" role="alert">
            {error}
          </p>
        </form>

        <div class="row ready-row" style="justify-content:space-between">
          {timeUp ? (
            <p class="notice">¡Se acabó el tiempo! Esperando el resultado…</p>
          ) : ready ? (
            <>
              <p class="notice">
                Listo. Esperando a los demás ({readyCount}/{connected.length})…
              </p>
              <button class="btn" type="button" data-sfx="none" onClick={toggleReady}>
                Seguir editando
              </button>
            </>
          ) : (
            <>
              <p class="hint">
                {readyCount}/{connected.length} jugadores listos
                {draft.length < WORDS_PER_PLAYER && (
                  <span class="hide-sm"> · Podés entregar antes, pero completá las 8 para más chances.</span>
                )}
              </p>
              <button
                class="btn btn--good btn--big"
                type="button"
                data-sfx="none"
                onClick={toggleReady}
                disabled={draft.length === 0}
              >
                ¡Listo!
              </button>
            </>
          )}
        </div>
      </section>
      {intro && (
        <DrawIntro
          word={state.word ?? ''}
          round={state.round}
          totalRounds={state.totalRounds}
          players={state.players}
          stage={stage}
          startAt={startAt}
          now={() => session.now()}
        />
      )}
    </>
  )
}

function canTransition(): boolean {
  return (
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Sigue la etapa del sorteo y, al pasar de la máquina a la escritura, envuelve el cambio
 * en una View Transition: la palabra y el reloj viajan de la máquina a su lugar.
 */
function useDrawTransition(target: DrawStage): DrawStage {
  const [shown, setShown] = useState<DrawStage>(target)
  // Estado (no ref) para que, al terminar la transición, el efecto se vuelva a evaluar.
  const [busy, setBusy] = useState(false)
  const committed = useRef<(() => void) | null>(null)
  const running = useRef<ViewTransition | null>(null)

  useEffect(() => {
    if (busy) {
      if (target === 'done') running.current?.skipTransition()
      return
    }
    if (target === shown) return
    if (shown === 'landed' && target === 'move' && canTransition()) {
      setBusy(true)
      const vt = document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            committed.current = resolve
            setShown('move')
          }),
      )
      running.current = vt
      vt.finished.finally(() => {
        running.current = null
        setBusy(false)
      })
      return
    }
    setShown(target)
  }, [target, shown, busy])

  useLayoutEffect(() => {
    committed.current?.()
    committed.current = null
    setDrawStage(shown === 'done' ? null : shown)
  }, [shown])

  useEffect(() => () => setDrawStage(null), [])

  return shown
}
