import { useEffect, useRef, useState } from 'preact/hooks'
import { sfx } from '../audio/engine'

export function Rules() {
  const items = [
    ['Palabra', 'Se sortea una palabra para la ronda.'],
    ['Escribí', 'Tenés 1 minuto y 30 para anotar 8 palabras relacionadas.'],
    ['Coincidí', 'Cada palabra vale tantos puntos como jugadores la escribieron. Si nadie más la puso, vale 0.'],
    ['Suspenso', 'Se revelan las palabras jugador por jugador. Gana quien sume más tras 3 rondas.'],
  ]
  return (
    <div class="rules">
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

function RulesModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div class="modal" onClick={onClose}>
      <div
        class="modal__box card stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rules-title">Cómo se juega</h2>
        <Rules />
        <button ref={closeRef} class="btn btn--primary" type="button" data-sfx="none" onClick={onClose}>
          ¡Entendido!
        </button>
        <p class="hint rules-credit">
          Música de Kevin MacLeod (
          <a href="https://incompetech.com" target="_blank" rel="noopener">
            incompetech.com
          </a>
          ), licencia{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/deed.es" target="_blank" rel="noopener">
            CC BY 4.0
          </a>
          . Efectos de Kenney y Freesound (CC0).
        </p>
      </div>
    </div>
  )
}

/** Botón "?" que abre la ventana con las reglas del juego. */
export function Help({ floating = false, defaultOpen = false }: { floating?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const close = () => {
    sfx('interfaz/cerrar-reglas')
    setOpen(false)
  }
  return (
    <>
      <button
        class={`help-btn ${floating ? 'help-btn--floating' : ''}`}
        type="button"
        data-sfx="interfaz/abrir-reglas"
        aria-label="Cómo se juega"
        title="Cómo se juega"
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && <RulesModal onClose={close} />}
    </>
  )
}
