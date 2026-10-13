import { useEffect, useState } from 'preact/hooks'
import { HOST_ID } from './mocks'
import { MockSession } from './MockSession'
import { SCENARIOS, type MockOpts, type Scenario } from './mocks'
import type { DevHudProps } from './types'
import './dev.css'

const OPEN_KEY = 'pec.devhud.open'
const GROUPS = ['Pantallas', 'Ventanas', 'Conexión']

/**
 * Panel flotante solo para desarrollo. Se carga con `import()` desde `App.tsx` detrás de
 * `import.meta.env.DEV`, así que no entra al build de producción.
 *
 * Abre cada pantalla/ventana con un click usando una `MockSession` (estado simulado con
 * el motor real) y deja ver o inyectar el estado público a mano.
 */
export function DevHUD({ active, devView, onView }: DevHudProps) {
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) === '1')
  const [role, setRole] = useState<MockOpts['role']>('host')
  const [players, setPlayers] = useState(4)
  const [json, setJson] = useState('')
  const [jsonError, setJsonError] = useState('')

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  }, [open])

  const mock = devView?.kind === 'session' ? devView.mock : null
  const opts: MockOpts = { role, players }

  // Mantiene el editor al día con el estado que se está mostrando.
  useEffect(() => {
    if (!active) return
    const update = () => setJson(JSON.stringify(active.snapshot.state, null, 2) ?? 'null')
    update()
    return active.subscribe(update)
  }, [active])

  const openScenario = (s: Scenario) => {
    setJsonError('')
    if (s.kind === 'home') onView({ kind: 'home', label: s.label, openRules: s.openRules })
    else onView({ kind: 'session', label: s.label, mock: new MockSession(s, opts) })
  }

  const applyJson = () => {
    if (!mock) return
    try {
      mock.inject(JSON.parse(json))
      setJsonError('')
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'JSON inválido')
    }
  }

  const rebuild = (next: MockOpts) => {
    // Cambiar rol o cantidad de jugadores reconstruye el escenario abierto.
    if (devView?.kind === 'session') {
      onView({ ...devView, mock: new MockSession(devView.mock.scenario, next) })
    }
  }

  if (!open) {
    return (
      <button class="devhud-fab" type="button" onClick={() => setOpen(true)} title="Abrir DevHUD">
        DEV
      </button>
    )
  }

  return (
    <aside class="devhud" aria-label="DevHUD">
      <header class="devhud__head">
        <strong>DevHUD</strong>
        <span class="devhud__current">{devView ? devView.label : 'sesión real'}</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar DevHUD">
          ×
        </button>
      </header>

      <div class="devhud__body">
        <section>
          <h4>Opciones del mock</h4>
          <div class="devhud__row">
            {(['host', 'guest'] as const).map((r) => (
              <button
                key={r}
                type="button"
                class={role === r ? 'is-on' : ''}
                onClick={() => {
                  setRole(r)
                  rebuild({ ...opts, role: r })
                }}
              >
                {r === 'host' ? 'Anfitrión' : 'Invitado'}
              </button>
            ))}
            <label>
              Jugadores
              <select
                value={players}
                onChange={(e) => {
                  const n = Number((e.target as HTMLSelectElement).value)
                  setPlayers(n)
                  rebuild({ ...opts, players: n })
                }}
              >
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {GROUPS.map((group) => (
          <section key={group}>
            <h4>{group}</h4>
            <div class="devhud__grid">
              {SCENARIOS.filter((s) => s.group === group).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  class={devView?.label === s.label ? 'is-on' : ''}
                  onClick={() => openScenario(s)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>
        ))}

        {mock && (
          <section>
            <h4>Acciones rápidas</h4>
            <div class="devhud__grid">
              <button type="button" onClick={() => mock.dispatch({ type: 'next', by: HOST_ID })}>
                Siguiente (anfitrión)
              </button>
              <button type="button" onClick={() => mock.othersReady()}>
                Los demás entregan
              </button>
              <button type="button" onClick={() => mock.dispatch({ type: 'skipReveal', by: HOST_ID })}>
                Saltar revelado
              </button>
              <button type="button" onClick={() => mock.reset()}>
                Reiniciar escenario
              </button>
            </div>
          </section>
        )}

        {mock && (
          <section>
            <h4>Estado público (editable)</h4>
            <textarea
              spellcheck={false}
              value={json}
              onInput={(e) => setJson((e.target as HTMLTextAreaElement).value)}
              rows={9}
            />
            <div class="devhud__row">
              <button type="button" onClick={applyJson}>
                Inyectar
              </button>
              <small>La próxima acción vuelve al estado del motor.</small>
            </div>
            {jsonError && <p class="devhud__error">{jsonError}</p>}
          </section>
        )}

        {devView && (
          <button type="button" class="devhud__exit" onClick={() => onView(null)}>
            Volver a la sesión real
          </button>
        )}
      </div>
    </aside>
  )
}
