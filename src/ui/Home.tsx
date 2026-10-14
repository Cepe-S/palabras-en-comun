import { useEffect, useRef, useState } from 'preact/hooks'
import { sfx } from '../audio/engine'
import { resolveRoomName } from '../game/engine'
import { MAX_NAME_LENGTH, MAX_ROOM_NAME_LENGTH } from '../game/types'
import { codeFromText, type SavedSession } from '../net/room'
import { Help } from './Help'
import { Logo } from './Shell'
import { SoundToggle } from './SoundToggle'

interface Props {
  /** Código de la sala si se entró con un enlace de invitación. */
  invite: string | null
  saved: SavedSession | null
  onHost: (name: string, roomName: string) => void
  onJoin: (code: string, name: string) => void
  onResume: () => void
  onForget: () => void
  onDismissInvite: () => void
  /** Solo desarrollo (DevHUD): abre la ventana de reglas al montar. */
  devOpenRules?: boolean
}

const NAME_KEY = 'pec.name'

export function Home({ invite, saved, onHost, onJoin, onResume, onForget, onDismissInvite, devOpenRules }: Props) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [roomName, setRoomName] = useState('')
  const [code, setCode] = useState(invite ?? '')
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const enterRef = useRef<HTMLButtonElement>(null)

  const cleanName = name.trim()

  // Con invitación solo falta el nombre: si ya está guardado, alcanza con tocar "Entrar".
  useEffect(() => {
    if (!invite) return
    if (cleanName) enterRef.current?.focus()
    else nameRef.current?.focus()
  }, [invite])

  const fail = (message: string) => {
    setError(message)
    sfx('interfaz/error')
    return false
  }

  const validName = () => {
    if (!cleanName) return fail('Poné tu nombre para que los demás te reconozcan.')
    localStorage.setItem(NAME_KEY, cleanName)
    return true
  }

  const host = () => {
    if (!validName()) return
    sfx('interfaz/boton-principal')
    onHost(cleanName, resolveRoomName(roomName, cleanName))
  }

  const join = (e: Event) => {
    e.preventDefault()
    if (!validName()) return
    if (code.length !== 5) return fail('El código de sala tiene 5 letras o números.')
    sfx('interfaz/boton-principal')
    onJoin(code, cleanName)
  }

  return (
    <div class="app">
      <SoundToggle floating />
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
          {invite && (
            <div class="invite center">
              <p class="eyebrow">Te invitaron a la sala</p>
              <p class="invite__code" aria-label={`Código ${invite.split('').join(' ')}`}>
                {invite}
              </p>
            </div>
          )}

          <label class="field">
            <span class="field__label">Tu nombre</span>
            <input
              ref={nameRef}
              class="input"
              value={name}
              enterkeyhint={invite ? 'go' : 'next'}
              onKeyDown={(e) => invite && e.key === 'Enter' && join(e)}
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

          {invite ? (
            <form class="stack" onSubmit={join}>
              <button ref={enterRef} class="btn btn--primary btn--big" type="submit" data-sfx="none">
                Entrar a la sala
              </button>
              <button class="btn btn--ghost" type="button" onClick={onDismissInvite}>
                Usar otro código o crear una sala
              </button>
            </form>
          ) : (
            <>
              <form class="stack" onSubmit={join}>
                <label class="field">
                  <span class="field__label">Código de sala (o pegá el enlace)</span>
                  <input
                    class="input input--code"
                    value={code}
                    placeholder="ABCDE"
                    inputMode="text"
                    autocapitalize="characters"
                    autocomplete="off"
                    onInput={(e) => {
                      const input = e.target as HTMLInputElement
                      const next = codeFromText(input.value)
                      // Si el código no cambia, Preact no vuelve a pintar: sin esto quedaría el texto pegado.
                      input.value = next
                      setCode(next)
                      setError('')
                    }}
                  />
                </label>
                <button class="btn btn--primary btn--big" type="submit" data-sfx="none">
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

              <button class="btn btn--big" type="button" data-sfx="none" onClick={host}>
                Crear sala nueva
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
