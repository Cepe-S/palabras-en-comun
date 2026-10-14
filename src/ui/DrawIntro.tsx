import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks'
import { sfx } from '../audio/engine'
import { WORDS } from '../data/words'
import {
  DRAW_LANDED_MS,
  DRAW_MS,
  DRAW_SPIN_MS,
  START_ANNOUNCE_MS,
  START_LOADING_MS,
  WRITING_SECONDS,
  type Player,
} from '../game/types'
import { PlayerToken } from './PlayerToken'
import { Timer } from './Timer'

export type DrawStage = 'loading' | 'announce' | 'spin' | 'landed' | 'move' | 'done'

const ROW_H = 60
const ROWS = 5
/** A toda velocidad pasan cientos de palabras por segundo: el tic se limita a un ritmo audible. */
const REEL_TICK_MIN_MS = 55

/**
 * Etapa según los ms desde que arranca el sorteo (reloj del anfitrión).
 * Los valores negativos son la carga falsa y el anuncio, que solo existen en la ronda 1.
 */
export function drawStage(elapsed: number): DrawStage {
  if (elapsed < -START_ANNOUNCE_MS) return 'loading'
  if (elapsed < 0) return 'announce'
  if (elapsed < DRAW_SPIN_MS) return 'spin'
  if (elapsed < DRAW_LANDED_MS) return 'landed'
  if (elapsed < DRAW_MS) return 'move'
  return 'done'
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const easeOut = (x: number) => 1 - Math.pow(1 - x, 4)

/* ---------- Carga falsa ---------- */

/** Curva de progreso con frenadas y arranques, para que parezca una carga de verdad. */
const LOAD_CURVE: [number, number][] = [
  [0, 0],
  [0.12, 0.18],
  [0.24, 0.21],
  [0.36, 0.47],
  [0.48, 0.52],
  [0.6, 0.78],
  [0.72, 0.97],
  [0.86, 0.99],
  [0.94, 0.99],
  [1, 1],
]

function fakeProgress(t: number): number {
  for (let i = 1; i < LOAD_CURVE.length; i++) {
    const [x1, y1] = LOAD_CURVE[i]
    const [x0, y0] = LOAD_CURVE[i - 1]
    if (t <= x1) return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0)
  }
  return 1
}

/** Debe coincidir con la animación `hop` de styles.css: dura 0.7 s y la ficha cae al 60 %. */
const HOP_MS = 700
const HOP_LAND_MS = 420
const HOP_STAGGER_MS = 90

function useHopSounds(count: number) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const hop = () => {
      for (let i = 0; i < count; i++) {
        const id = setTimeout(() => {
          timers.delete(id)
          sfx('sorteo/salto-ficha', { rate: 1 + i * 0.04, volume: 0.6 })
        }, HOP_LAND_MS + i * HOP_STAGGER_MS)
        timers.add(id)
      }
    }
    hop()
    const loop = setInterval(hop, HOP_MS)
    return () => {
      clearInterval(loop)
      timers.forEach(clearTimeout)
    }
  }, [count])
}

function FakeLoading({ elapsed, players }: { elapsed: number; players: Player[] }) {
  const t = Math.min(1, Math.max(0, elapsed / START_LOADING_MS))
  const pct = Math.round(fakeProgress(t) * 100)
  useHopSounds(players.length)
  return (
    <div class="loadfx" role="status" aria-live="polite">
      <div class="loadfx__tokens" aria-hidden="true">
        {players.map((p, i) => (
          <span key={p.id} class="loadfx__hop" style={`animation-delay:${i * HOP_STAGGER_MS}ms`}>
            <PlayerToken player={p} />
          </span>
        ))}
      </div>
      <p class="loadfx__title">Preparando partida…</p>
      <div class="loadfx__bar" aria-hidden="true">
        <div class="loadfx__fill" style={`width:${pct}%`} />
      </div>
      <p class="loadfx__pct">{pct}%</p>
    </div>
  )
}

/* ---------- Anuncio ---------- */

const CONFETTI = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.2
  const dist = 120 + (i % 5) * 26
  return {
    x: Math.round(Math.cos(angle) * dist),
    y: Math.round(Math.sin(angle) * dist),
    r: (i * 47) % 360,
    c: `var(--p${i % 8})`,
    d: (i % 4) * 0.04,
  }
})

function Announce({ round, total }: { round: number; total: number }) {
  return (
    <div class="announce" role="status">
      <div class="announce__burst" aria-hidden="true">
        {CONFETTI.map((p, i) => (
          <i
            key={i}
            style={`--x:${p.x}px;--y:${p.y}px;--r:${p.r}deg;background:${p.c};animation-delay:${0.25 + p.d}s`}
          />
        ))}
      </div>
      <p class="announce__round">
        Ronda {round} de {total}
      </p>
      <p class="announce__title">
        ¡Que empiece
        <br />
        el sorteo!
      </p>
    </div>
  )
}

/* ---------- Tragamonedas ---------- */

/** Recorre todas las palabras del juego y frena en la elegida. Solo hay unas pocas filas en el DOM. */
function SlotMachine({
  word,
  round,
  landed,
  startAt,
  now,
}: {
  word: string
  round: number
  landed: boolean
  startAt: number
  now: () => number
}) {
  const seq = useMemo(() => [...shuffle(WORDS.filter((w) => w !== word)), word], [word, round])
  const reelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const reel = reelRef.current
    if (!reel) return
    const rows = Array.from(reel.children) as HTMLElement[]
    const target = seq.length - 1
    let raf = 0
    let lastPos = -1
    let lastTs = 0
    let lastBase = -1
    let lastTick = 0
    const frame = () => {
      const t = Math.min(1, Math.max(0, (now() - startAt) / DRAW_SPIN_MS))
      const pos = easeOut(t) * target
      const base = Math.floor(pos)
      const frac = pos - base
      if (base !== lastBase) {
        if (lastBase >= 0 && performance.now() - lastTick >= REEL_TICK_MIN_MS) {
          lastTick = performance.now()
          sfx('sorteo/carrete', { rate: 0.95 + Math.random() * 0.1 })
        }
        lastBase = base
      }
      rows.forEach((row, j) => {
        const k = (((base - 1 + j) % seq.length) + seq.length) % seq.length
        const text = row.firstElementChild as HTMLElement
        if (text.textContent !== seq[k]) text.textContent = seq[k]
        row.style.transform = `translateY(${(j - 1 - frac) * ROW_H}px)`
      })
      const ts = performance.now()
      const speed = lastPos < 0 ? 0 : ((pos - lastPos) * ROW_H * 1000) / Math.max(1, ts - lastTs)
      reel.style.filter = speed > 400 ? `blur(${Math.min(3, speed / 2500).toFixed(2)}px)` : ''
      lastPos = pos
      lastTs = ts
      if (t < 1) raf = requestAnimationFrame(frame)
    }
    frame()
    return () => cancelAnimationFrame(raf)
  }, [seq, startAt])

  return (
    <div class={`slotm ${landed ? 'slotm--landed' : ''}`}>
      <p class="slotm__title">{landed ? '¡La palabra es…!' : 'Sorteando palabra…'}</p>
      <div class="slotm__lights" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} style={`animation-delay:${(i % 2) * 0.25}s`} />
        ))}
      </div>
      <div class="slotm__window">
        <div class="slotm__reel" ref={reelRef} aria-hidden={!landed}>
          {Array.from({ length: ROWS }, (_, j) => (
            <div class={`slotm__row ${landed && j === 1 ? 'slotm__row--win' : ''}`} key={j}>
              <span class="slotm__text" />
            </div>
          ))}
        </div>
        <div class="slotm__line" aria-hidden="true" />
      </div>
      {landed && (
        <div class="slotm__timer">
          <Timer remainingMs={WRITING_SECONDS * 1000} totalMs={WRITING_SECONDS * 1000} />
        </div>
      )}
    </div>
  )
}

export function DrawIntro({
  word,
  round,
  totalRounds,
  players,
  stage,
  startAt,
  now,
}: {
  word: string
  round: number
  totalRounds: number
  players: Player[]
  stage: DrawStage
  startAt: number
  now: () => number
}) {
  if (stage === 'move' || stage === 'done') return null
  return (
    <div class="draw" aria-live="polite">
      {stage === 'loading' && (
        <FakeLoading elapsed={now() - (startAt - START_ANNOUNCE_MS - START_LOADING_MS)} players={players} />
      )}
      {stage === 'announce' && <Announce round={round} total={totalRounds} />}
      {(stage === 'spin' || stage === 'landed') && (
        <SlotMachine word={word} round={round} landed={stage === 'landed'} startAt={startAt} now={now} />
      )}
    </div>
  )
}
