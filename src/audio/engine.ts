/**
 * Motor de audio. Los efectos usan Howler (cortos, decodificados en memoria, con cambio de
 * tono). La música son temas largos: se reproducen en streaming con un `<audio>` conectado
 * al mismo contexto de Web Audio de Howler, así el silencio general y los fundidos valen
 * para todo y no hace falta decodificar minutos de audio en memoria.
 */
import { Howl, Howler } from 'howler'
import { MUSIC, SFX, sfxFile, trackFile, type SfxId, type TrackId } from './catalog'
import { soundFile } from './files'
import { loadSettings, saveSettings, type AudioSettings } from './settings'
import type { MusicState, SfxOptions } from './types'

/** Nivel general de cada mezcla, sobre el volumen propio de cada sonido del catálogo. */
const MUSIC_LEVEL = 0.6
const SFX_LEVEL = 0.8
const FADE_MS = 800
const HIDDEN_LEVEL = 0.3
const DIM_LEVEL = 0.5
const DUCK_LEVEL = 0.35
/** Los efectos se precargan apenas termina de cargar la página, sin competir con ella. */
const PRELOAD_DELAY_MS = 1200

const SILENCE: MusicState = { track: null, rate: 1, dim: false, delay: 0 }

interface Playing {
  id: TrackId
  el: HTMLAudioElement
  gain: GainNode | null
  fadeTimer?: ReturnType<typeof setInterval>
}

class AudioEngine {
  private settings: AudioSettings = loadSettings()
  private listeners = new Set<(s: AudioSettings) => void>()
  private howls = new Map<SfxId, Howl>()
  private unlocked = false

  private wanted: MusicState = SILENCE
  /** Pista elegida a mano desde el DevHUD; `undefined` = la que pide el juego. */
  private override: TrackId | null | undefined = undefined
  private playing: Playing | null = null
  /** Pistas que se están apagando al cambiar de fase. */
  private leaving = new Set<Playing>()
  private startTimer: ReturnType<typeof setTimeout> | undefined
  private duckUntil = 0
  private duckTimer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    if (typeof window === 'undefined') return
    Howler.autoSuspend = false
    const unlock = () => this.unlock()
    for (const type of ['pointerdown', 'keydown', 'touchend']) {
      window.addEventListener(type, unlock, { capture: true, passive: true })
    }
    document.addEventListener('visibilitychange', () => this.applyMusicLevel())
    const preload = () => setTimeout(() => this.preload(), PRELOAD_DELAY_MS)
    if (document.readyState === 'complete') preload()
    else window.addEventListener('load', preload, { once: true })
  }

  /* ---------- Preferencias ---------- */

  getSettings(): AudioSettings {
    return this.settings
  }

  setSettings(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch }
    saveSettings(this.settings)
    if (!this.settings.sfx) this.howls.forEach((howl) => howl.stop())
    // Los botones de silencio responden en el acto, sin fundido.
    if (!this.settings.music) this.leaving.forEach((p) => this.fadeOutAndStop(p, 0))
    this.applyMusicLevel(0)
    this.listeners.forEach((l) => l(this.settings))
  }

  subscribe(listener: (s: AudioSettings) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /* ---------- Efectos ---------- */

  sfx(id: SfxId, opts: SfxOptions = {}): void {
    if (opts.delay) {
      setTimeout(() => this.sfx(id, { ...opts, delay: 0 }), opts.delay)
      return
    }
    // Antes del primer gesto el navegador no deja sonar nada: mejor perderlo que acumularlo.
    if (!this.canPlay() || !this.settings.sfx) return
    const howl = this.howl(id)
    if (!howl) return
    const def: { volume: number; duck?: boolean } = SFX[id]
    const sound = howl.play()
    howl.volume(Math.min(1, def.volume * (opts.volume ?? 1) * SFX_LEVEL), sound)
    if (opts.rate && opts.rate !== 1) howl.rate(opts.rate, sound)
    if (def.duck) this.duck((howl.duration() || 1.5) * 1000)
  }

  private howl(id: SfxId): Howl | null {
    const cached = this.howls.get(id)
    if (cached) return cached
    const file = soundFile(sfxFile(id))
    if (!file) {
      console.warn(`[audio] Falta el archivo del sonido "${id}" en src/audio/sonidos/efectos/`)
      return null
    }
    const howl = new Howl({
      src: [file.url],
      format: [file.format],
      pool: 8,
      onloaderror: (_, error) => console.warn(`[audio] No se pudo cargar "${id}":`, error),
    })
    this.howls.set(id, howl)
    return howl
  }

  private preload(): void {
    for (const id of Object.keys(SFX) as SfxId[]) this.howl(id)
  }

  private canPlay(): boolean {
    return this.unlocked || navigator.userActivation?.hasBeenActive === true
  }

  private unlock(): void {
    if (this.unlocked) return
    this.unlocked = true
    void Howler.ctx?.resume()
    // Si la música intentó arrancar antes del primer gesto, el navegador la frenó.
    if (this.playing?.el.paused && this.settings.music) void this.playing.el.play().catch(() => {})
  }

  /* ---------- Música ---------- */

  music(state: MusicState): void {
    const prev = this.wanted
    this.wanted = state
    if (this.override !== undefined) return
    if (state.track !== prev.track) this.switchTrack(state.track, state.delay)
    else this.applyMusicLevel()
  }

  /** Solo para el DevHUD: fuerza una pista (`null` = silencio, `undefined` = volver al juego). */
  forceMusic(track: TrackId | null | undefined): void {
    this.override = track
    this.switchTrack(track === undefined ? this.wanted.track : track, 0)
  }

  /** Baja la música un rato (fanfarrias y efectos largos). */
  duck(ms: number): void {
    this.duckUntil = Math.max(this.duckUntil, performance.now() + ms)
    clearTimeout(this.duckTimer)
    this.applyMusicLevel(150)
    this.duckTimer = setTimeout(() => this.applyMusicLevel(600), this.duckUntil - performance.now())
  }

  private switchTrack(track: TrackId | null, delay: number): void {
    if (this.playing?.id === track) return this.applyMusicLevel()
    clearTimeout(this.startTimer)
    if (this.playing) this.fadeOutAndStop(this.playing)
    this.playing = null
    if (!track) return
    if (delay > 0) this.startTimer = setTimeout(() => this.startTrack(track), delay)
    else this.startTrack(track)
  }

  private startTrack(id: TrackId): void {
    const file = soundFile(trackFile(id))
    if (!file) {
      console.warn(`[audio] Falta la música "${id}" en src/audio/sonidos/musica/`)
      return
    }
    const el = new Audio(file.url)
    el.loop = true
    el.preload = 'auto'
    let gain: GainNode | null = null
    const ctx = Howler.ctx
    if (Howler.usingWebAudio && ctx && Howler.masterGain) {
      gain = ctx.createGain()
      gain.gain.value = 0
      ctx.createMediaElementSource(el).connect(gain).connect(Howler.masterGain)
    } else {
      el.volume = 0
    }
    this.playing = { id, el, gain }
    this.applyMusicLevel()
  }

  private musicLevel(id: TrackId): number {
    if (!this.settings.music) return 0
    const game = this.override === undefined ? this.wanted : SILENCE
    let level = MUSIC[id].volume * MUSIC_LEVEL
    if (game.dim) level *= DIM_LEVEL
    if (document.hidden) level *= HIDDEN_LEVEL
    if (performance.now() < this.duckUntil) level *= DUCK_LEVEL
    return level
  }

  private applyMusicLevel(ms = FADE_MS): void {
    const p = this.playing
    if (!p) return
    p.el.playbackRate = this.override === undefined ? this.wanted.rate : 1
    if (!this.settings.music) {
      // Apagada se pausa (no sigue bajando ni decodificando); el chequeo cubre un reencendido durante el fundido.
      this.fade(p, 0, ms, () => !this.settings.music && p.el.pause())
      return
    }
    // Antes del primer gesto el navegador la rechaza: `unlock` la vuelve a intentar.
    if (p.el.paused) void p.el.play().catch(() => {})
    this.fade(p, this.musicLevel(p.id), ms)
  }

  private fade(p: Playing, to: number, ms: number, done?: () => void): void {
    clearInterval(p.fadeTimer)
    if (ms <= 0) {
      if (p.gain) {
        p.gain.gain.cancelScheduledValues(p.gain.context.currentTime)
        p.gain.gain.value = to
      } else {
        p.el.volume = to
      }
      done?.()
      return
    }
    if (p.gain) {
      const now = p.gain.context.currentTime
      p.gain.gain.cancelScheduledValues(now)
      p.gain.gain.setValueAtTime(p.gain.gain.value, now)
      p.gain.gain.linearRampToValueAtTime(to, now + ms / 1000)
      if (done) setTimeout(done, ms + 50)
      return
    }
    // Sin Web Audio: se mueve el volumen del elemento a mano.
    const from = p.el.volume
    const start = performance.now()
    p.fadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / ms)
      p.el.volume = from + (to - from) * t
      if (t === 1) {
        clearInterval(p.fadeTimer)
        done?.()
      }
    }, 40)
  }

  private fadeOutAndStop(p: Playing, ms = FADE_MS): void {
    this.leaving.add(p)
    this.fade(p, 0, ms, () => {
      if (!this.leaving.delete(p)) return
      p.el.pause()
      p.el.removeAttribute('src')
      p.el.load()
      p.gain?.disconnect()
    })
  }
}

export const audio = new AudioEngine()

export function sfx(id: SfxId, opts?: SfxOptions): void {
  audio.sfx(id, opts)
}
