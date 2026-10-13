import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { addWord } from "../game/engine";
import { DRAW_MS, WORDS_PER_PLAYER, WRITING_SECONDS } from "../game/types";
import type { SessionLike, Snapshot } from "../net/room";
import { DrawIntro, drawStage, type IntroRects } from "./DrawIntro";
import { useTick } from "./hooks";
import { Timer } from "./Timer";

const SYNC_DELAY_MS = 350;

export function WritingPhase({
  snap,
  session,
}: {
  snap: Snapshot;
  session: SessionLike;
}) {
  const state = snap.state!;
  const me = state.players.find((p) => p.id === snap.playerId);

  const [draft, setDraft] = useState<string[]>(snap.myWords ?? []);
  const [ready, setReady] = useState(me?.ready ?? false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const touched = useRef(false);
  const sentFinal = useRef(false);
  const latest = useRef({ draft, ready });
  latest.current = { draft, ready };

  useTick(100);
  const rawRemaining = Math.max(0, (state.endsAt ?? 0) - session.now());
  const total = WRITING_SECONDS * 1000;
  // Los primeros DRAW_MS son el sorteo animado: el cronómetro arranca recién después.
  const elapsed = DRAW_MS - (rawRemaining - total);
  const stage = drawStage(elapsed);
  const intro = stage !== "done";
  const remaining = Math.min(rawRemaining, total);
  const timeUp = rawRemaining <= 0;
  const locked = ready || timeUp || intro;

  const wordRef = useRef<HTMLElement>(null);
  const timerRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<IntroRects | null>(null);
  useLayoutEffect(() => {
    if (!intro || !wordRef.current || !timerRef.current) return;
    const word = wordRef.current.getBoundingClientRect();
    const timer = timerRef.current.getBoundingClientRect();
    const wordFont = parseFloat(getComputedStyle(wordRef.current).fontSize);
    setRects((r) =>
      r &&
      r.word.left === word.left &&
      r.word.top === word.top &&
      r.word.width === word.width &&
      r.timer.left === timer.left &&
      r.timer.top === timer.top
        ? r
        : { word, timer, wordFont },
    );
  });

  const send = (words: string[], isReady?: boolean) => {
    clearTimeout(syncTimer.current);
    session.act({ type: "words", words, ready: isReady });
  };

  // Si el anfitrión nos devuelve palabras guardadas (recarga o reconexión), las recuperamos.
  useEffect(() => {
    if (
      !touched.current &&
      snap.myWords?.length &&
      latest.current.draft.length === 0
    ) {
      setDraft(snap.myWords);
    }
  }, [snap.myWords]);

  // Al terminar el tiempo se entrega lo que haya.
  useEffect(() => {
    if (timeUp && !sentFinal.current) {
      sentFinal.current = true;
      setReady(true);
      send(latest.current.draft, true);
    }
  }, [timeUp]);

  useEffect(() => () => clearTimeout(syncTimer.current), []);

  const change = (next: string[]) => {
    touched.current = true;
    setDraft(next);
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(
      () => send(next, latest.current.ready),
      SYNC_DELAY_MS,
    );
  };

  const add = (e: Event) => {
    e.preventDefault();
    if (locked) return;
    const result = addWord(draft, text, state.word);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setText("");
    change(result.words);
    inputRef.current?.focus();
  };

  const remove = (index: number) => {
    if (locked) return;
    change(draft.filter((_, i) => i !== index));
    inputRef.current?.focus();
  };

  const toggleReady = () => {
    const next = !ready;
    touched.current = true;
    setReady(next);
    send(draft, next);
  };

  const connected = state.players.filter((p) => p.connected);
  const readyCount = connected.filter((p) =>
    p.id === snap.playerId ? ready : p.ready,
  ).length;

  return (
    <>
      <section
        class={`card stack writing ${intro ? (stage === "move" ? "writing--enter" : "writing--hidden") : ""}`}
      >
        <div class="writing__head">
          <div class="writing__word">
            <span class="eyebrow">
              Escribí palabras <span class="hide-sm">relacionadas </span>con
            </span>
            <strong ref={wordRef} style={intro ? "visibility:hidden" : ""}>
              {state.word}
            </strong>
          </div>
          <div ref={timerRef} style={intro ? "visibility:hidden" : ""}>
            <Timer remainingMs={remaining} totalMs={total} />
          </div>
        </div>

        <div class="progress" aria-live="polite">
          <span>
            {draft.length}/{WORDS_PER_PLAYER}
          </span>
          <div class="progress__bar">
            <div
              class="progress__fill"
              style={`width:${(draft.length / WORDS_PER_PLAYER) * 100}%`}
            />
          </div>
        </div>

        <ol class="slots" style="list-style:none;margin:0;padding:0">
          {Array.from({ length: WORDS_PER_PLAYER }, (_, i) => {
            const word = draft[i];
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
            );
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
                locked
                  ? "Tus palabras ya fueron entregadas"
                  : "Escribí una palabra…"
              }
              aria-label="Nueva palabra"
              onInput={(e) => {
                setText((e.target as HTMLInputElement).value);
                setError("");
              }}
            />
            <button
              class="btn btn--primary"
              type="submit"
              disabled={locked || !text.trim()}
            >
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
              <button class="btn" type="button" onClick={toggleReady}>
                Seguir editando
              </button>
            </>
          ) : (
            <>
              <p class="hint">
                {readyCount}/{connected.length} jugadores listos
                {draft.length < WORDS_PER_PLAYER && (
                  <span class="hide-sm">
                    {" "}
                    · Podés entregar antes, pero completá las 8 para más
                    chances.
                  </span>
                )}
              </p>
              <button
                class="btn btn--good btn--big"
                type="button"
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
          word={state.word ?? ""}
          round={state.round}
          elapsed={elapsed}
          rects={rects}
        />
      )}
    </>
  );
}
