export interface AudioSettings {
  /** Música encendida. */
  music: boolean
  /** Efectos encendidos. */
  sfx: boolean
}

export const DEFAULT_SETTINGS: AudioSettings = { music: true, sfx: true }

const KEY = 'pec.audio'

export function parseSettings(raw: string | null): AudioSettings {
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof AudioSettings, unknown>>
    return {
      music: typeof data.music === 'boolean' ? data.music : DEFAULT_SETTINGS.music,
      sfx: typeof data.sfx === 'boolean' ? data.sfx : DEFAULT_SETTINGS.sfx,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function loadSettings(): AudioSettings {
  try {
    return parseSettings(localStorage.getItem(KEY))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Sin almacenamiento (modo privado estricto): la preferencia dura hasta recargar.
  }
}
