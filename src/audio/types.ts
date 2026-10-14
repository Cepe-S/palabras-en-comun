import type { SfxId, TrackId } from './catalog'

export interface SfxOptions {
  /** Velocidad de reproducción; también sube o baja el tono (1 = normal). */
  rate?: number
  /** Multiplica el volumen del catálogo. */
  volume?: number
  /** Espera antes de sonar (ms). */
  delay?: number
}

export interface SoundCue extends SfxOptions {
  id: SfxId
}

export interface MusicState {
  track: TrackId | null
  /** Velocidad de la música (1 = normal). */
  rate: number
  /** Baja la música a la mitad (por ejemplo, mientras se perdió la conexión). */
  dim: boolean
  /** Espera antes de arrancar una pista nueva (ms), para dejar sonar una fanfarria. */
  delay: number
}
