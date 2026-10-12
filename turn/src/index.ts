interface IceServer {
  urls?: string | string[]
  username?: string
  credential?: string
}

const TTL_SECONDS = 14_400
const BLOCKED_PORT = /:53(?![0-9])/

function urlsOf(value: string | string[] | undefined): string[] {
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value.filter((url) => typeof url === 'string' && !BLOCKED_PORT.test(url))
}

export function originAllowed(origin: string | null, allowedList: string): boolean {
  if (!origin) return false
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  const allowed = allowedList.split(',').map((item) => item.trim()).filter(Boolean)
  return allowed.includes(origin)
}

function cors(origin: string): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  })
}

function reply(body: unknown, status: number, origin: string | null, env: Env): Response {
  const headers = origin && originAllowed(origin, env.ALLOWED_ORIGINS) ? cors(origin) : new Headers()
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    if (request.method === 'OPTIONS') {
      if (!origin || !originAllowed(origin, env.ALLOWED_ORIGINS ?? '')) {
        return new Response(null, { status: 403 })
      }
      return new Response(null, { status: 204, headers: cors(origin) })
    }
    if (request.method !== 'POST') {
      return reply({ error: 'method' }, 405, origin, env)
    }
    if (!originAllowed(origin, env.ALLOWED_ORIGINS ?? '')) {
      return reply({ error: 'origin' }, 403, origin, env)
    }
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
      console.error(JSON.stringify({ message: 'turn worker missing credentials' }))
      return reply({ error: 'unconfigured' }, 503, origin, env)
    }

    const upstream = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      },
    )
    if (!upstream.ok) {
      console.error(JSON.stringify({ message: 'turn credential request failed', status: upstream.status }))
      return reply({ error: 'upstream' }, 502, origin, env)
    }

    const body = (await upstream.json()) as { iceServers?: IceServer[] }
    const iceServers = (body.iceServers ?? [])
      .map((server) => ({ ...server, urls: urlsOf(server.urls) }))
      .filter((server) => server.urls.length > 0)
    console.log(JSON.stringify({ message: 'turn credentials issued', servers: iceServers.length }))
    return reply({ iceServers }, 200, origin, env)
  },
}
