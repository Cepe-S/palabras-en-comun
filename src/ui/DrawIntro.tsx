import { useEffect, useMemo } from "preact/hooks";
import { WORDS } from "../data/words";
import {
  DRAW_MS,
  DRAW_SPIN_MS,
  DRAW_LANDED_MS,
  WRITING_SECONDS,
} from "../game/types";
import { setDrawStage } from "./drawStore";
import { Timer } from "./Timer";

export interface IntroRects {
  word: DOMRect;
  wordFont: number;
  timer: DOMRect;
}

const REEL_ITEMS = 26;
const REEL_FONT = 30.4; // 1.9rem, igual que las palabras del carrete

/** Etapa del sorteo según los ms transcurridos (se calcula con el reloj del anfitrión). */
export function drawStage(
  elapsed: number,
): "spin" | "landed" | "move" | "done" {
  if (elapsed < DRAW_SPIN_MS) return "spin";
  if (elapsed < DRAW_LANDED_MS) return "landed";
  if (elapsed < DRAW_MS) return "move";
  return "done";
}

function centerShift(rect: DOMRect, cy: number, scale: number): string {
  const dx = window.innerWidth / 2 - (rect.left + rect.width / 2);
  const dy = cy - (rect.top + rect.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

/**
 * Tragamonedas de palabras. La palabra y el reloj se dibujan en el centro y luego
 * viajan hasta su lugar en la pantalla de escritura (rects de los elementos reales).
 */
export function DrawIntro({
  word,
  round,
  elapsed,
  rects,
}: {
  word: string;
  round: number;
  elapsed: number;
  rects: IntroRects | null;
}) {
  const stage = drawStage(elapsed);
  useEffect(() => {
    setDrawStage(stage === "done" ? null : stage);
  }, [stage]);
  useEffect(() => () => setDrawStage(null), []);

  const strip = useMemo(() => {
    const pool = WORDS.filter((w) => w !== word);
    const items: string[] = [];
    let last = "";
    for (let i = 0; i < REEL_ITEMS; i++) {
      let w = pool[Math.floor(Math.random() * pool.length)];
      if (w === last) w = pool[(pool.indexOf(w) + 1) % pool.length];
      items.push(w);
      last = w;
    }
    items.push(word);
    items.push(pool[Math.floor(Math.random() * pool.length)]);
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, round]);

  if (stage === "done") return null;

  const cy = window.innerHeight * 0.4;
  const k = rects
    ? Math.min(
        REEL_FONT / rects.wordFont,
        (window.innerWidth * 0.84) / Math.max(rects.word.width, 1),
      )
    : 1;
  const centered = stage !== "move";

  const wordStyle = rects
    ? `left:${rects.word.left}px;top:${rects.word.top}px;width:${rects.word.width}px;height:${rects.word.height}px;` +
      `transform:${centered ? centerShift(rects.word, cy, k) : "none"};` +
      `opacity:${stage === "spin" ? 0 : 1}`
    : "opacity:0";
  const timerStyle = rects
    ? `left:${rects.timer.left}px;top:${rects.timer.top}px;width:${rects.timer.width}px;height:${rects.timer.height}px;` +
      `transform:${centered ? centerShift(rects.timer, cy + 90 + 16 + rects.timer.height / 2, 1) : "none"};` +
      `opacity:${stage === "spin" ? 0 : 1}`
    : "opacity:0";

  return (
    <div class="draw" aria-live="polite">
      <>
        <div
          class={`slotm ${stage === "move" ? "slotm--out" : ""}`}
          style={`top:${cy}px`}
        >
          <p class="slotm__title">Sorteando palabra…</p>
          <div class="slotm__lights" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} style={`animation-delay:${(i % 2) * 0.25}s`} />
            ))}
          </div>
          <div class="slotm__window">
            <div
              class="slotm__strip"
              style={`--end:${-(REEL_ITEMS - 0) * 60 + 60}px;--spin:${DRAW_SPIN_MS}ms;animation-delay:-${Math.min(elapsed, DRAW_SPIN_MS)}ms`}
            >
              {strip.map((w, i) => (
                <div
                  class={`slotm__item ${i === REEL_ITEMS && stage !== "spin" ? "slotm__item--gone" : ""}`}
                  key={i}
                >
                  {w}
                </div>
              ))}
            </div>
            <div class="slotm__line" aria-hidden="true" />
          </div>
        </div>
      </>

      <strong class={`draw__word`} style={wordStyle}>
        {word}
      </strong>
      <div class="draw__timer" style={timerStyle}>
        <Timer
          remainingMs={WRITING_SECONDS * 1000}
          totalMs={WRITING_SECONDS * 1000}
        />
      </div>
    </div>
  );
}
