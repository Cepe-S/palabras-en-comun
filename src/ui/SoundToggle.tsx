import type { JSX } from 'preact'
import { audio, sfx } from '../audio/engine'
import type { AudioSettings } from '../audio/settings'
import { useAudioSettings } from '../audio/useAudio'

const OFF_MARK = <path d="M3 3l18 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />

function MusicIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M9 17V5l11-2v12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
      <ellipse cx="6.5" cy="17.5" rx="3" ry="2.5" fill="currentColor" />
      <ellipse cx="17.5" cy="15.5" rx="3" ry="2.5" fill="currentColor" />
      {!on && OFF_MARK}
    </svg>
  )
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      {on ? (
        <path
          d="M16 9a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        />
      ) : (
        <path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
      )}
    </svg>
  )
}

/** Únicos controles de audio: un toque prende o apaga la música, el otro los efectos. */
export function SoundToggle({ floating = false }: { floating?: boolean }) {
  const settings = useAudioSettings()

  const toggle = (key: keyof AudioSettings) => {
    audio.setSettings({ [key]: !settings[key] })
    // Si los efectos quedaron apagados, el engine lo descarta solo.
    sfx('interfaz/interruptor')
  }

  const button = (key: keyof AudioSettings, label: string, icon: JSX.Element) => (
    <button
      class={`help-btn sound__btn ${settings[key] ? '' : 'sound__btn--off'}`}
      type="button"
      data-sfx="none"
      aria-pressed={!settings[key]}
      aria-label={`Silenciar ${label}`}
      title={settings[key] ? `Silenciar ${label}` : `Activar ${label}`}
      onClick={() => toggle(key)}
    >
      {icon}
    </button>
  )

  return (
    <div class={`sound ${floating ? 'sound--floating' : ''}`}>
      {button('music', 'música', <MusicIcon on={settings.music} />)}
      {button('sfx', 'efectos', <SpeakerIcon on={settings.sfx} />)}
    </div>
  )
}
