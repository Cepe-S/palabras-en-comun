import { useEffect, useRef, useState } from 'preact/hooks'
import { sfx } from '../audio/engine'
import { roomLink } from '../net/room'

export type InviteFeedback = 'copied' | 'shared' | null

const FEEDBACK_MS = 1800

/** En celulares conviene el menú "Compartir" del sistema (WhatsApp, etc.); en compu, copiar. */
export function canShareNatively(): boolean {
  return typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches
}

/** Comparte o copia el enlace de la sala y muestra un aviso breve de cómo salió. */
export function useInvite(code: string, roomName?: string): [InviteFeedback, () => Promise<void>] {
  const [feedback, setFeedback] = useState<InviteFeedback>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const done = (result: Exclude<InviteFeedback, null>) => {
    sfx('interfaz/copiar-enlace')
    setFeedback(result)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS)
  }

  const invite = async () => {
    const url = roomLink(code)
    if (canShareNatively()) {
      try {
        await navigator.share({
          title: 'Palabras en común',
          text: `¡Vení a jugar${roomName ? ` en "${roomName}"` : ''}! Sala ${code}`,
          url,
        })
        return done('shared')
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      done('copied')
    } catch {
      window.prompt('Copiá este enlace para invitar a otros jugadores:', url)
    }
  }

  return [feedback, invite]
}
