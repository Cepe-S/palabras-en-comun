import { useState } from 'preact/hooks'
import { resolveRoomName } from '../game/engine'
import { MAX_NAME_LENGTH, MAX_ROOM_NAME_LENGTH } from '../game/types'
import { normalizeCode, type SavedSession } from '../net/room'
import { Help } from './Help'
import { Logo } from './Shell'

interface Props {
  initialCode: string | null
  saved: SavedSession | null
  onHost: (name: string, roomName: string) => void
  onJoin: (code: string, name: string) => void
  onResume: () => void
  onForget: () => void
  /** Solo desarrollo (DevHUD): abre la ventana de reglas al montar. */
  devOpenRules?: boolean
}

const NAME_KEY = 'pec.name'

export function Home({ initialCode, saved, onHost, onJoin, onResume, onForget, devOpenRules }: Props) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [roomName, setRoomName] = useState('')
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
    if (validName()) onHost(cleanName, resolveRoomName(roomName, cleanName))
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
      <Help floating defaultOpen={devOpenRules} />
      <div class="home stack" style="gap:20px">
        <div class="hero">
          <div class="row row--center" style="margin-bottom:12px">
            <Logo />
          </div>
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
              maxLength={MAX_NAME_LENGTH}
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
            <button class="btn btn--primary btn--big" type="submit">
              Unirme
            </button>
          </form>

          <div class="divider">o creá una sala nueva</div>

          <label class="field">
            <span class="field__label">Nombre de la sala (opcional)</span>
            <input
              class="input"
              value={roomName}
              maxLength={MAX_ROOM_NAME_LENGTH}
              placeholder={resolveRoomName('', cleanName || 'tu nombre')}
              onInput={(e) => setRoomName((e.target as HTMLInputElement).value)}
            />
          </label>

          <button class="btn btn--big" type="button" onClick={host}>
            Crear sala nueva
          </button>
        </div>

      </div>
    </div>
  )
}
