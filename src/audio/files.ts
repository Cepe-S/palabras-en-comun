import { AUDIO_EXTENSIONS } from './catalog'

export interface SoundFile {
  url: string
  /** Extensión del archivo: Howler la usa para saber cómo decodificarlo. */
  format: string
}

// Vite resuelve el glob al compilar: cada archivo de `sonidos/` se publica con su URL.
const urls = import.meta.glob<string>('./sonidos/**/*.{mp3,ogg,opus,webm,m4a,aac,wav,flac}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** Archivos encontrados, por ruta sin extensión (`efectos/revelado/ficha`). Puede haber más de uno por ruta si alguien dejó un duplicado. */
export function indexSoundFiles(paths: Record<string, string>): Map<string, SoundFile[]> {
  const index = new Map<string, SoundFile[]>()
  for (const [path, url] of Object.entries(paths)) {
    const match = /^\.\/sonidos\/(.+)\.([a-z0-9]+)$/i.exec(path)
    if (!match) continue
    const format = match[2].toLowerCase()
    if (!(AUDIO_EXTENSIONS as readonly string[]).includes(format)) continue
    const list = index.get(match[1]) ?? []
    list.push({ url, format })
    index.set(match[1], list)
  }
  return index
}

export const soundFiles = indexSoundFiles(urls)

export function soundFile(path: string): SoundFile | undefined {
  return soundFiles.get(path)?.[0]
}
