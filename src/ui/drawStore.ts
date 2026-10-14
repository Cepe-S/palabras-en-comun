import { useEffect, useState } from 'preact/hooks'

export type DrawStage = 'loading' | 'announce' | 'spin' | 'landed' | 'move' | null

let current: DrawStage = null
const listeners = new Set<(s: DrawStage) => void>()

/** Publica la etapa del sorteo para que el resto de la interfaz (pasos, marcador, fondo) reaccione. */
export function setDrawStage(stage: DrawStage) {
  if (stage === current) return
  current = stage
  if (stage) document.documentElement.dataset.draw = stage
  else delete document.documentElement.dataset.draw
  listeners.forEach((l) => l(stage))
}

export function useDrawStage(): DrawStage {
  const [stage, setStage] = useState<DrawStage>(current)
  useEffect(() => {
    listeners.add(setStage)
    setStage(current)
    return () => {
      listeners.delete(setStage)
    }
  }, [])
  return stage
}
