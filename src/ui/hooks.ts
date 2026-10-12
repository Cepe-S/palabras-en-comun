import { useEffect, useState } from 'preact/hooks'

/** Fuerza un re-render cada `ms` milisegundos y devuelve un contador. */
export function useTick(ms: number): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((v) => v + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return n
}
