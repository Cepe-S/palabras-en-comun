import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import { sfx } from '../audio/engine'
import type { Player, RevealStep, WordStep } from '../game/types'
import type { SessionLike, Snapshot } from '../net/room'
import { playerById } from './derive'
import { PlayerToken } from './PlayerToken'
import { WordCard } from './WordCard'

const FLIP_MS = 600
const VOTER_MS = 520
const SETTLE_MS = 450
const AUTO_DWELL_MS = 2200
const TURN_MS = 900
/** Cada ficha que aparece suena un grado más arriba en una escala mayor. */
const VOTER_SCALE = [1, 1.122, 1.26, 1.335, 1.498, 1.682, 1.888, 2]
const POINTS_SFX_DELAY_MS = 220

function scoreSound(points: number, count: number, players: number) {
  if (points <= 0) return sfx('revelado/cero-puntos')
  sfx(count >= 3 && count === players ? 'revelado/coincidencia-total' : 'revelado/puntos')
}

interface Props {
  snap: Snapshot
  session: SessionLike
  onHold: (hold: boolean) => void
}

function WordChip({ word, count, points }: { word: string; count: number; points: number }) {
  return (
    <span class={`wchip ${points > 0 ? 'wchip--hit' : 'wchip--miss'}`}>
      {word}
      <span class="wchip__n" title={`${count} jugador${count === 1 ? '' : 'es'}`}>
        ×{count}
      </span>
    </span>
  )
}

/** Revela una palabra: las fichas de quienes la escribieron aparecen una por una. */
function WordReveal({ step, players }: { step: WordStep; players: Player[] }) {
  const [shown, setShown] = useState(0)

  const ordered = [step.playerId, ...step.voters.filter((v) => v !== step.playerId)]
  const owner = playerById(players, step.playerId)

  useEffect(() => {
    setShown(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i <= ordered.length; i++) {
      timers.push(
        setTimeout(
          () => {
            setShown(i)
            sfx('revelado/ficha', { rate: VOTER_SCALE[Math.min(i, VOTER_SCALE.length) - 1] })
          },
          FLIP_MS + (i - 1) * VOTER_MS,
        ),
      )
    }
    timers.push(
      setTimeout(
        () => scoreSound(step.points, step.count, players.length),
        FLIP_MS + (ordered.length - 1) * VOTER_MS + POINTS_SFX_DELAY_MS,
      ),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.key, step.playerId])

  const done = shown >= ordered.length
  return (
    <>
      <WordCard key={`${step.playerId}-${step.key}`} label={`Palabra de ${owner?.name ?? '?'}`} word={step.word} />
      <div class="voters" aria-label="Jugadores que la escribieron">
        {ordered.slice(0, shown).map((id) => {
          const p = playerById(players, id)
          return p ? (
            <div class="voter" key={id}>
              <PlayerToken player={p} />
              <span>{p.name}</span>
            </div>
          ) : null
        })}
      </div>
      <div class="counter" aria-live="polite">
        <span class="counter__n counter__n--bump" key={shown}>
          {shown}
        </span>
        <span class="muted" style="font-size:1.1rem">
          {shown === 1 ? 'jugador la escribió' : 'jugadores la escribieron'}
        </span>
      </div>
      <div style="min-height:52px" class="row row--center">
        {done &&
          (step.points > 0 ? (
            <span class="points-badge">+{step.points} puntos para cada uno</span>
          ) : (
            <span class="points-badge points-badge--zero">Nadie más la escribió · 0 puntos</span>
          ))}
      </div>
    </>
  )
}

export function RevealPhase({ snap, session, onHold }: Props) {
  const state = snap.state!
  const { steps, totalSteps, players } = state
  const cursor = steps.length
  const last: RevealStep | undefined = steps[cursor - 1]
  const [auto, setAuto] = useState(false)
  const [doneAt, setDoneAt] = useState(-1)
  // Una vez terminada la animación de un paso, `doneAt` guarda su posición.
  const done = !last || doneAt === cursor

  // Cuánto dura la animación del paso actual (el marcador espera a que termine).
  useEffect(() => {
    if (!last) return
    const ms = last.kind === 'word' ? FLIP_MS + last.voters.length * VOTER_MS + SETTLE_MS : TURN_MS
    const timers = [setTimeout(() => setDoneAt(cursor), ms)]
    if (last.kind === 'turn' && last.silent.length > 0) {
      timers.push(setTimeout(() => sfx('revelado/ya-contadas'), 250))
      if (last.points > 0) timers.push(setTimeout(() => sfx('revelado/puntos'), TURN_MS))
    }
    return () => timers.forEach(clearTimeout)
  }, [cursor])

  // Layout effect: el marcador se oculta antes de pintar para no adelantar el resultado.
  useLayoutEffect(() => {
    onHold(!done)
  }, [done])
  useEffect(() => () => onHold(false), [])

  // Reproducción automática (solo el anfitrión).
  useEffect(() => {
    if (!snap.isHost || !auto || !done) return
    const t = setTimeout(() => session.act({ type: 'next' }), AUTO_DWELL_MS)
    return () => clearTimeout(t)
  }, [auto, done, cursor, snap.isHost])

  const turnOwner = last ? playerById(players, last.playerId) : undefined

  // Palabras que el jugador del turno actual ya mostró (sin spoilear la que está animándose).
  let log: { word: string; count: number; points: number }[] = []
  if (last) {
    const visible = done ? steps : steps.slice(0, -1)
    const turnIdx = visible.map((s) => s.kind).lastIndexOf('turn')
    for (const s of visible.slice(turnIdx < 0 ? 0 : turnIdx)) {
      if (s.playerId !== last.playerId) continue
      if (s.kind === 'turn') s.silent.forEach((w) => log.push(w))
      else log.push({ word: s.word, count: s.count, points: s.points })
    }
  }

  const nextLabel = cursor === 0 ? 'Empezar revelado' : cursor < totalSteps ? 'Siguiente' : 'Ver resumen'

  return (
    <>
      <section class="card stack reveal-card">
        {!last && (
          <div class="stack center" style="padding:20px 0">
            <p class="eyebrow">Ronda {state.round}</p>
            <h2>¡Hora de revelar!</h2>
            <p class="muted" style="max-width:380px">
              Vamos a leer las palabras de cada jugador, una por una. Cada coincidencia suma puntos.
            </p>
          </div>
        )}

        {last && turnOwner && (
          <div class="reveal-turn" style="justify-content:center">
            <PlayerToken player={turnOwner} />
            Turno de {turnOwner.name}
          </div>
        )}

        {last?.kind === 'turn' && (
          <div class="stack center" key={`turn-${cursor}`}>
            {last.wordCount === 0 ? (
              <p class="muted">No escribió ninguna palabra.</p>
            ) : last.silent.length > 0 ? (
              <>
                <p style="font-weight:700;max-width:440px">
                  Estas palabras suyas ya se leyeron antes, pero también suman:
                </p>
                <div class="counted">
                  {last.silent.map((w) => (
                    <WordChip key={w.word} {...w} />
                  ))}
                </div>
                {done && <span class="points-badge">+{last.points} puntos</span>}
              </>
            ) : (
              <p class="muted">Sus palabras, una por una…</p>
            )}
          </div>
        )}

        {last?.kind === 'word' && (
          <div class="stack center" style="align-items:center" key={`w-${cursor}`}>
            <WordReveal step={last} players={players} />
          </div>
        )}

        {snap.isHost ? (
          <div class="controls">
            <button
              class="btn btn--primary btn--big"
              type="button"
              data-sfx="none"
              disabled={!done}
              onClick={() => session.act({ type: 'next' })}
            >
              {nextLabel}
            </button>
            {cursor > 0 && cursor < totalSteps && (
              <label class="switch">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => {
                    setAuto((e.target as HTMLInputElement).checked)
                    sfx('interfaz/interruptor')
                  }}
                />
                Automático
              </label>
            )}
            <button
              class="btn btn--ghost"
              type="button"
              data-sfx="none"
              onClick={() => session.act({ type: 'skipReveal' })}
            >
              Saltar<span class="hide-sm"> al resumen</span>
            </button>
          </div>
        ) : (
          <p class="hint" style="text-align:center">
            El anfitrión controla el ritmo del revelado.
          </p>
        )}
      </section>

      {log.length > 0 && turnOwner && (
        <section class="card card--flat log reveal-log">
          <h3 class="card__title" style="margin:0">
            Palabras de {turnOwner.name}
          </h3>
          <div class="counted" style="justify-content:flex-start">
            {log.map((w) => (
              <WordChip key={w.word} {...w} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
