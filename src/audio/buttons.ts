import { SFX, type SfxId } from './catalog'
import { sfx } from './engine'

/**
 * Un solo listener para el sonido de todos los botones:
 * - `.btn--primary` y `.btn--good` → `interfaz/boton-principal`.
 * - Cualquier otro botón → `interfaz/boton-secundario`.
 * - `data-sfx="<id>"` elige otro sonido del catálogo y `data-sfx="none"` lo silencia
 *   (para botones cuyo sonido depende del resultado, como "Agregar", o que ya suenan por otro lado).
 */
export function installButtonSounds(): void {
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, [data-sfx]')
      if (!el || el.closest('.devhud, .devhud-fab')) return
      const custom = el.getAttribute('data-sfx')
      if (custom === 'none') return
      if (custom) {
        if (custom in SFX) sfx(custom as SfxId)
        else console.warn(`[audio] data-sfx="${custom}" no existe en el catálogo`)
        return
      }
      sfx(el.matches('.btn--primary, .btn--good') ? 'interfaz/boton-principal' : 'interfaz/boton-secundario')
    },
    { capture: true },
  )
}
