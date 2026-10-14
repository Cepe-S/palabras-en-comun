/**
 * Director de sonido: decide qué suena a partir de los cambios de estado de la partida.
 *
 * Todo lo que llega por la red (jugadores que entran, cambios de fase, pasos del revelado)
 * suena acá y no en los botones: así todos los dispositivos escuchan lo mismo y el
 * anfitrión no escucha dos veces lo que él mismo dispara. Son funciones puras para poder
 * testearlas sin audio.
 */
import { winners } from '../game/engine'
import { WRITING_SECONDS, type PublicState } from '../game/types'
import type { Snapshot } from '../net/room'
import type { DrawStage } from '../ui/drawStore'
import type { MusicState, SoundCue } from './types'

/** En los últimos 30 s la música de escritura se acelera; en los últimos 10 se corta. */
export const HURRY_MS = 30_000
export const QUIET_MS = 10_000
export const HURRY_RATE = 1.08
/** La música final espera a que termine la fanfarria. */
export const FINAL_MUSIC_DELAY_MS = 3500

const FAILED: Snapshot['status'][] = ['rejected', 'notFound', 'offline']

export function musicFor(snap: Snapshot | null, now: number): MusicState {
  const music: MusicState = { track: null, rate: 1, dim: false, delay: 0 }
  const state = snap?.state
  if (!snap || !state || FAILED.includes(snap.status)) return { ...music, track: 'inicio' }
  music.dim = snap.status === 'hostLost'
  switch (state.phase) {
    case 'lobby':
      return { ...music, track: 'sala' }
    case 'writing': {
      const remaining = (state.endsAt ?? 0) - now
      // Durante el sorteo (y su carga) el cronómetro todavía no arrancó: manda la tragamonedas.
      if (remaining > WRITING_SECONDS * 1000 || remaining <= QUIET_MS) return music
      return { ...music, track: 'escritura', rate: remaining <= HURRY_MS ? HURRY_RATE : 1 }
    }
    case 'reveal':
      return { ...music, track: 'revelado' }
    case 'roundSummary':
      return { ...music, track: 'resumen' }
    case 'final':
      return { ...music, track: 'final', delay: FINAL_MUSIC_DELAY_MS }
  }
}

export function cuesFor(prev: Snapshot | null, next: Snapshot): SoundCue[] {
  // La primera foto de una sesión (o de otra sala) no suena: sería repetir lo que ya pasó.
  if (!prev || prev.code !== next.code || prev.playerId !== next.playerId) return []
  const cues: SoundCue[] = []

  if (prev.status !== next.status) {
    if (next.status === 'hostLost') cues.push({ id: 'conexion/perdida' })
    else if (prev.status === 'hostLost' && next.status === 'connected') cues.push({ id: 'conexion/recuperada' })
    else if (FAILED.includes(next.status)) cues.push({ id: 'conexion/fallida' })
  }

  const a = prev.state
  const b = next.state
  if (!a || !b) return cues

  cues.push(...playerCues(a, b, next.playerId))

  if (a.phase !== b.phase) return [...cues, ...phaseCues(a, b)]

  if (b.phase === 'writing' && a.round === b.round) {
    const others = b.players.filter((p) => p.id !== next.playerId)
    const wasReady = (id: string) => a.players.find((p) => p.id === id)?.ready ?? false
    if (others.some((p) => p.ready && !wasReady(p.id))) cues.push({ id: 'escritura/otro-listo' })
    else if (others.some((p) => (b.wordCounts?.[p.id] ?? 0) > (a.wordCounts?.[p.id] ?? 0))) {
      cues.push({ id: 'escritura/otra-palabra' })
    }
  }

  if (b.phase === 'reveal' && b.steps.length > a.steps.length) {
    const step = b.steps[b.steps.length - 1]
    cues.push({ id: step.kind === 'turn' ? 'revelado/turno' : 'revelado/carta' })
  }

  return cues
}

function playerCues(a: PublicState, b: PublicState, me: string): SoundCue[] {
  const before = new Map(a.players.map((p) => [p.id, p]))
  const after = new Set(b.players.map((p) => p.id))
  const joined = b.players.some((p) => p.id !== me && p.connected && !before.get(p.id)?.connected)
  const left =
    b.players.some((p) => p.id !== me && !p.connected && before.get(p.id)?.connected) ||
    a.players.some((p) => p.id !== me && p.connected && !after.has(p.id))
  const cues: SoundCue[] = []
  if (joined) cues.push({ id: 'sala/entra-jugador' })
  if (left) cues.push({ id: 'sala/sale-jugador', delay: joined ? 250 : 0 })
  return cues
}

function phaseCues(a: PublicState, b: PublicState): SoundCue[] {
  switch (b.phase) {
    case 'reveal':
      return [{ id: 'revelado/inicio' }]
    case 'roundSummary':
      return a.phase === 'reveal' && a.steps.length < a.totalSteps
        ? [{ id: 'revelado/saltar' }, { id: 'resultados/resumen-ronda', delay: 350 }]
        : [{ id: 'resultados/resumen-ronda' }]
    case 'final': {
      const tie = winners(b.players, b.history).length > 1
      return [
        { id: 'resultados/confeti' },
        { id: tie ? 'resultados/fanfarria-empate' : 'resultados/fanfarria', delay: 150 },
        { id: 'resultados/corona', delay: 1300 },
      ]
    }
    // La escritura arranca con el sorteo (ver `drawCues`) y la sala solo cambia la música.
    default:
      return []
  }
}

/** Sonidos de las etapas del sorteo animado. Los clics del carrete los hace la tragamonedas. */
export function drawCues(prev: DrawStage, next: DrawStage): SoundCue[] {
  if (prev === next) return []
  switch (next) {
    case 'loading':
      return prev === null ? [{ id: 'sorteo/redoble-carga' }] : []
    case 'announce':
      return prev === 'loading' ? [{ id: 'sorteo/anuncio' }, { id: 'sorteo/confeti', delay: 250 }] : []
    case 'landed':
      return prev === 'spin' ? [{ id: 'sorteo/premio' }] : []
    case 'move':
      return prev === 'landed' ? [{ id: 'sorteo/traslado' }] : []
    default:
      return []
  }
}
