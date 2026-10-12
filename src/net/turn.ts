import type { TurnServerConfig } from '@trystero-p2p/nostr'

/** Relays que reenvían eventos. No incluye relay.layer.systems: limita la tasa en el primer publish. */
export const NOSTR_RELAYS = [
  'wss://relay.novospes.com',
  'wss://relay.nostrmap.net',
  'wss://relay.bitmacro.cloud',
  'wss://relay.grigic.org',
]

const BLOCKED_PORT = /:53(?![0-9])/

interface IceServerJson {
  urls?: string | string[]
  username?: string
  credential?: string
}

function urlsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value.filter((url): url is string => typeof url === 'string')
}

/** Se queda con los URL TURN y descarta el puerto 53, que el navegador no puede usar. */
export function toTurnConfig(iceServers: unknown): TurnServerConfig[] | undefined {
  if (!Array.isArray(iceServers)) return undefined
  const configs: TurnServerConfig[] = []
  for (const item of iceServers) {
    if (!item || typeof item !== 'object') continue
    const server = item as IceServerJson
    const turnUrls = urlsOf(server.urls).filter((url) => /^turns?:/i.test(url) && !BLOCKED_PORT.test(url))
    if (!turnUrls.length) continue
    const config: TurnServerConfig = { urls: turnUrls }
    if (typeof server.username === 'string') config.username = server.username
    if (typeof server.credential === 'string') config.credential = server.credential
    configs.push(config)
  }
  return configs.length ? configs : undefined
}

/** Pide credenciales de corta vida. Sin URL, o si el Worker no responde, se sigue solo con STUN. */
export async function loadTurnConfig(): Promise<TurnServerConfig[] | undefined> {
  const url = import.meta.env.VITE_TURN_URL
  if (!url) return undefined
  try {
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(4000) })
    if (!res.ok) return undefined
    const body = (await res.json()) as { iceServers?: unknown }
    return toTurnConfig(body.iceServers)
  } catch {
    return undefined
  }
}
