/**
 * Elige canales en el orden en que se unieron y, si uno rechaza el envío,
 * prueba el siguiente que también tenga a ese par.
 */
export async function sendViaRoutes<S extends string>(
  peerId: string,
  data: string,
  order: readonly S[],
  routes: ReadonlyMap<string, ReadonlySet<S>>,
  send: (strategy: S, peerId: string, data: string) => Promise<void>,
): Promise<boolean> {
  const route = routes.get(peerId)
  if (!route) return false
  for (const name of order) {
    if (!route.has(name)) continue
    try {
      await send(name, peerId, data)
      return true
    } catch {
      /* este canal no aceptó el mensaje; sigue el otro */
    }
  }
  return false
}
