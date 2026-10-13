import { WORDS } from "../data/words";
import { createGame, reduce } from "../game/engine";
import { DRAW_MS } from "../game/types";
import type { Action, Ctx, GameState, RevealStep } from "../game/types";
import {
  ICE_MESSAGE,
  NOT_FOUND_MESSAGE,
  OFFLINE_MESSAGE,
  PUBLISHING_MESSAGE,
  type Status,
} from "../net/room";

/* Datos de prueba para el DevHUD. Todo se arma con el motor real (`reduce`), así que
   los estados son los mismos que produciría una partida de verdad. */

export const HOST_ID = "dev-0";
export const GUEST_ID = "dev-1";
export const NAMES = [
  "Anastasia",
  "Bartolomé",
  "Maximiliano",
  "Valentina Sol",
  "Eleonora",
  "Juan Cruz",
  "Guadalupe",
  "Sebastián Luis",
];

/** Listas con coincidencias parciales para ver puntos, ceros y palabras "ya contadas". */
export const WORD_SETS: string[][] = [
  ["Sol", "Mar", "Arena", "Helado", "Calor", "Pileta", "Ojotas", "Ola"],
  ["sol", "Arena", "Heládo", "mar", "Hielo", "Siesta", "Ola", "Playa"],
  [
    "Sol",
    "Mar",
    "Vacaciones",
    "Helado",
    "Playa",
    "Bikini",
    "Protector",
    "Pileta",
  ],
  ["Calor", "Sol", "Playa", "Ola", "Mar", "Ventilador", "Limonada", "Arena"],
];

export interface MockOpts {
  role: "host" | "guest";
  players: number;
}

export interface ScenarioBuild {
  game: GameState | null;
  status?: Status;
  message?: string | null;
  myWords?: string[] | null;
}

type ScenarioBase = { id: string; group: string; label: string };
export type Scenario =
  | (ScenarioBase & {
      kind: "session";
      build: (opts: MockOpts) => ScenarioBuild;
    })
  | (ScenarioBase & { kind: "home"; openRules: boolean });

/** Con esta semilla el sorteo da siempre "Verano" en la primera ronda. */
const VERANO = WORDS.indexOf("Verano");
export const mockCtx = (): Ctx => ({
  now: Date.now(),
  random: () => (VERANO + 0.5) / WORDS.length,
});

const run = (g: GameState, ...actions: Action[]): GameState =>
  actions.reduce((s, a) => reduce(s, a, mockCtx()), g);

export function lobbyGame(opts: MockOpts): GameState {
  let g = createGame(HOST_ID, NAMES[0], "Sala de prueba");
  for (let i = 1; i < opts.players; i++) {
    g = run(g, { type: "join", id: `dev-${i}`, name: NAMES[i] });
  }
  return g;
}

/** Sorteo recién empezado: la escritura todavía no arrancó. */
export const drawGame = (opts: MockOpts) =>
  run(lobbyGame(opts), { type: "start", by: HOST_ID });

/** Escritura en curso (sorteo ya terminado). */
const WRITING_PROGRESS = [0, 3, 8, 5, 1, 6, 2, 7];

export const writingGame = (opts: MockOpts): GameState => {
  const g = drawGame(opts);
  const started: GameState = { ...g, endsAt: (g.endsAt ?? Date.now()) - DRAW_MS };
  // Los demás ya llevan distintas cantidades de palabras, para ver la dona de progreso en distintos estados.
  const me = opts.role === "host" ? HOST_ID : GUEST_ID;
  return started.players.reduce((acc, p, i) => {
    const n = WRITING_PROGRESS[i % WRITING_PROGRESS.length];
    if (p.id === me || n === 0) return acc;
    return run(acc, {
      type: "words",
      id: p.id,
      words: WORD_SETS[0].slice(0, n),
      ready: false,
    });
  }, started);
};

/** Todos entregan sus palabras (lo que cierra la escritura y abre el revelado). */
export function fillWords(
  g: GameState,
  skip: string[] = [],
  offset = 0,
): GameState {
  return g.players.reduce((acc, p, i) => {
    if (skip.includes(p.id)) return acc;
    const words = WORD_SETS[(i + offset) % WORD_SETS.length];
    return run(acc, { type: "words", id: p.id, words, ready: true });
  }, g);
}

export const revealGame = (opts: MockOpts, offset = 0) =>
  fillWords(writingGame(opts), [], offset);

/** Avanza el revelado hasta el paso que elija `pick` (índice de cola + 1 = pasos revelados). */
function revealAt(
  opts: MockOpts,
  pick: (queue: RevealStep[]) => number,
): GameState {
  let g = revealGame(opts);
  const target = Math.max(0, pick(g.queue));
  for (let i = 0; i < target; i++) g = run(g, { type: "next", by: HOST_ID });
  return g;
}

export const summaryGame = (opts: MockOpts) =>
  run(revealGame(opts), { type: "skipReveal", by: HOST_ID });

export function finalGame(opts: MockOpts): GameState {
  let g = writingGame(opts);
  for (let round = 0; round < 3; round++) {
    g = fillWords(g, [], round);
    g = run(
      g,
      { type: "skipReveal", by: HOST_ID },
      { type: "next", by: HOST_ID },
    );
  }
  return g;
}

const session = (
  group: string,
  id: string,
  label: string,
  build: (opts: MockOpts) => ScenarioBuild,
): Scenario => ({ kind: "session", group, id, label, build });

const ofGame =
  (make: (opts: MockOpts) => GameState) =>
  (opts: MockOpts): ScenarioBuild => ({
    game: make(opts),
  });

export const SCENARIOS: Scenario[] = [
  {
    kind: "home",
    group: "Pantallas",
    id: "home",
    label: "Inicio",
    openRules: false,
  },
  session("Pantallas", "lobby", "Sala (lobby)", ofGame(lobbyGame)),
  session("Pantallas", "draw", "Sorteo de palabra", ofGame(drawGame)),
  session("Pantallas", "writing", "Escritura (vacía)", ofGame(writingGame)),
  session("Pantallas", "writing-draft", "Escritura (5 palabras)", (opts) => ({
    game: writingGame(opts),
    myWords: WORD_SETS[1].slice(0, 5),
  })),
  session("Pantallas", "reveal-intro", "Revelado: inicio", (opts) => ({
    game: revealAt(opts, () => 0),
  })),
  session("Pantallas", "reveal-turn", "Revelado: turno", (opts) => ({
    game: revealAt(opts, () => 1),
  })),
  session("Pantallas", "reveal-word", "Revelado: palabra repetida", (opts) => ({
    game: revealAt(
      opts,
      (q) => q.findIndex((s) => s.kind === "word" && s.count > 1) + 1,
    ),
  })),
  session(
    "Pantallas",
    "reveal-zero",
    "Revelado: palabra sin puntos",
    (opts) => ({
      game: revealAt(
        opts,
        (q) => q.findIndex((s) => s.kind === "word" && s.count === 1) + 1,
      ),
    }),
  ),
  session(
    "Pantallas",
    "reveal-silent",
    "Revelado: palabras ya contadas",
    (opts) => ({
      game: revealAt(
        opts,
        (q) => q.findIndex((s) => s.kind === "turn" && s.silent.length > 0) + 1,
      ),
    }),
  ),
  session("Pantallas", "summary", "Resumen de ronda", ofGame(summaryGame)),
  session("Pantallas", "final", "Final", ofGame(finalGame)),

  {
    kind: "home",
    group: "Ventanas",
    id: "rules",
    label: "Reglas (modal)",
    openRules: true,
  },
  session("Ventanas", "host-lost", "Aviso: anfitrión perdido", (opts) => ({
    game: lobbyGame(opts),
    status: "hostLost",
    message: "Se perdió la conexión con el anfitrión.",
  })),

  session("Conexión", "connecting", "Conectando", () => ({
    game: null,
    status: "connecting",
    message: PUBLISHING_MESSAGE,
  })),
  session("Conexión", "not-found", "Sala no encontrada", () => ({
    game: null,
    status: "notFound",
    message: NOT_FOUND_MESSAGE,
  })),
  session("Conexión", "rejected", "Rechazado (partida empezada)", () => ({
    game: null,
    status: "rejected",
    message: "La partida ya empezó. Esperá a la próxima.",
  })),
  session("Conexión", "offline", "Sin relays", () => ({
    game: null,
    status: "offline",
    message: OFFLINE_MESSAGE,
  })),
  session("Conexión", "ice", "Red bloqueada (ICE)", () => ({
    game: null,
    status: "offline",
    message: ICE_MESSAGE,
  })),
];
