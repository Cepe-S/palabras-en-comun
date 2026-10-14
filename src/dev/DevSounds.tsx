import { useState } from 'preact/hooks'
import { MUSIC, SFX, type SfxId, type TrackId } from '../audio/catalog'
import { audio, sfx } from '../audio/engine'

const SFX_IDS = Object.keys(SFX) as SfxId[]
const TRACK_IDS = Object.keys(MUSIC) as TrackId[]
const GROUPS = [...new Set(SFX_IDS.map((id) => id.split('/')[0]))]

/** Sección del DevHUD para escuchar cada sonido del catálogo y forzar una música. */
export function DevSounds() {
  const [track, setTrack] = useState<TrackId | null | undefined>(undefined)
  const force = (next: TrackId | null | undefined) => {
    setTrack(next)
    audio.forceMusic(next)
  }

  return (
    <section>
      <h4>Sonidos</h4>
      <p class="devhud__note">Pasá el mouse por un botón para ver cuándo suena. Archivos en src/audio/sonidos/.</p>
      <h5>Música</h5>
      <div class="devhud__grid">
        <button type="button" class={track === undefined ? 'is-on' : ''} onClick={() => force(undefined)}>
          La del juego
        </button>
        <button type="button" class={track === null ? 'is-on' : ''} onClick={() => force(null)}>
          Silencio
        </button>
        {TRACK_IDS.map((id) => (
          <button
            key={id}
            type="button"
            class={track === id ? 'is-on' : ''}
            title={MUSIC[id].when}
            onClick={() => force(id)}
          >
            {id}
          </button>
        ))}
      </div>
      {GROUPS.map((group) => (
        <div key={group}>
          <h5>{group}</h5>
          <div class="devhud__grid">
            {SFX_IDS.filter((id) => id.startsWith(`${group}/`)).map((id) => (
              <button key={id} type="button" title={SFX[id].when} onClick={() => sfx(id)}>
                {id.slice(group.length + 1)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
