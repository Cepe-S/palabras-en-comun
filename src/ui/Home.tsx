import { useState } from 'preact/hooks'
import { normalizeCode, type SavedSession } from '../net/room'
import { Logo } from './Shell'

interface Props {
  initialCode: string | null
  saved: SavedSession | null
  onHost: (name: string) => void
  onJoin: (code: string, name: string) => void
  onResume: () => void
  onForget: () => void
}

const NAME_KEY = 'pec.name'

export function Rules({ wide = false }: { wide?: boolean }) {
  const items = [
    ['Palabra', 'Se sortea una palabra para la ronda.'],
    ['Escribí', 'Tenés 1 minuto y 30 para anotar 8 palabras relacionadas.'],
    ['Coincidí', 'Cada palabra vale tantos puntos como jugadores la escribieron. Si nadie más la puso, vale 0.'],
    ['Suspenso', 'Se revelan las palabras jugador por jugador. Gana quien sume más tras 3 rondas.'],
  ]
  return (
    <div class={`rules ${wide ? 'rules--wide' : ''}`}>
      {items.map(([title, text], i) => (
        <div class="rule" key={title}>
          <span class="rule__n">{i + 1}</span>
          <div>
            <b>{title}</b>
            <p>{text}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Home({ initialCode, saved, onHost, onJoin, onResume, onForget }: Props) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [code, setCode] = useState(initialCode ?? '')
  const [error, setError] = useState('')

  const cleanName = name.trim()

  const validName = () => {
    if (!cleanName) {
      setError('Poné tu nombre para que los demás te reconozcan.')
      return false
    }
    localStorage.setItem(NAME_KEY, cleanName)
    return true
  }

  const host = () => {
    if (validName()) onHost(cleanName)
  }

  const join = (e: Event) => {
    e.preventDefault()
    if (!validName()) return
    if (code.length !== 5) {
      setError('El código de sala tiene 5 letras o números.')
      return
    }
    onJoin(code, cleanName)
  }

  return (
    <div class="app">
      <div class="home stack" style="gap:20px">
        <div class="hero">
          <div class="row row--center" style="margin-bottom:12px">
            <Logo />
          </div>
          <h1>¿En qué pensamos?</h1>
          <p>Escribí palabras relacionadas y coincidí con tus amigos. ¡Cuantos más coincidan, más puntos!</p>
        </div>

        {saved && (
          <div class="card stack">
            <h2 class="card__title" style="margin:0">
              Partida en curso
            </h2>
            <p class="muted">
              Sala <b>{saved.code}</b> como {saved.name}
              {saved.role === 'host' ? ' (anfitrión)' : ''}.
            </p>
            <div class="row">
              <button class="btn btn--primary" type="button" onClick={onResume}>
                Volver a la partida
              </button>
              <button class="btn btn--ghost" type="button" onClick={onForget}>
                Descartar
              </button>
            </div>
          </div>
        )}

        <div class="card stack">
          <label class="field">
            <span class="field__label">Tu nombre</span>
            <input
              class="input"
              value={name}
              maxLength={16}
              placeholder="Ej: Sofi"
              autocomplete="nickname"
              onInput={(e) => {
                setName((e.target as HTMLInputElement).value)
                setError('')
              }}
            />
          </label>

          {error && (
            <p class="error" role="alert">
              {error}
            </p>
          )}

          <button class="btn btn--primary btn--big" type="button" onClick={host}>
            Crear sala nueva
          </button>

          <div class="divider">o unite a una</div>

          <form class="stack" onSubmit={join}>
            <label class="field">
              <span class="field__label">Código de sala</span>
              <input
                class="input input--code"
                value={code}
                placeholder="ABCDE"
                inputMode="text"
                autocapitalize="characters"
                autocomplete="off"
                maxLength={5}
                onInput={(e) => {
                  setCode(normalizeCode((e.target as HTMLInputElement).value))
                  setError('')
                }}
              />
            </label>
            <button class="btn btn--big" type="submit">
              Unirme
            </button>
          </form>
        </div>

        <div class="card card--flat stack">
          <h2 class="card__title" style="margin:0">
            Cómo se juega
          </h2>
          <Rules />
        </div>
      </div>
    </div>
  )
}
