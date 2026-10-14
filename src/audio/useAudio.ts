import { useEffect, useRef, useState } from 'preact/hooks'
import type { SessionLike, Snapshot } from '../net/room'
import { useDrawStage, type DrawStage } from '../ui/drawStore'
import { cuesFor, drawCues, musicFor } from './director'
import { audio, sfx } from './engine'
import type { AudioSettings } from './settings'

/** La música de escritura depende del reloj (se acelera y se corta), así que se revisa seguido. */
const MUSIC_POLL_MS = 500

/** Conecta el director a la sesión que se está mostrando: música por fase y sonidos de red. */
export function useAudioDirector(session: SessionLike | null): void {
  useEffect(() => {
    const update = () => audio.music(musicFor(session?.snapshot ?? null, session ? session.now() : Date.now()))
    update()
    if (!session) return
    let prev: Snapshot | null = session.snapshot
    const unsubscribe = session.subscribe((snap) => {
      for (const cue of cuesFor(prev, snap)) sfx(cue.id, cue)
      prev = snap
      update()
    })
    const poll = setInterval(update, MUSIC_POLL_MS)
    return () => {
      unsubscribe()
      clearInterval(poll)
    }
  }, [session])

  const draw = useDrawStage()
  const prevDraw = useRef<DrawStage>(draw)
  useEffect(() => {
    for (const cue of drawCues(prevDraw.current, draw)) sfx(cue.id, cue)
    prevDraw.current = draw
  }, [draw])
}

export function useAudioSettings(): AudioSettings {
  const [settings, setSettings] = useState(audio.getSettings())
  useEffect(() => audio.subscribe(setSettings), [])
  return settings
}

/** Tic-tac en los últimos 10 segundos y chicharra al terminar (solo si se vio terminar). */
export function useCountdownSound(remainingMs: number, running: boolean, timeUp: boolean): void {
  const seconds = Math.ceil(remainingMs / 1000)
  useEffect(() => {
    if (running && seconds > 0 && seconds <= 10) sfx('escritura/tic-tac', { rate: seconds % 2 ? 1 : 0.85 })
  }, [seconds, running])

  const wasTimeUp = useRef(timeUp)
  useEffect(() => {
    if (timeUp && !wasTimeUp.current) sfx('escritura/tiempo-cumplido')
    wasTimeUp.current = timeUp
  }, [timeUp])
}
