import { describe, expect, it } from 'vitest'
import { allSoundFiles, MUSIC, SFX } from './catalog'
import { indexSoundFiles, soundFiles } from './files'
import { DEFAULT_SETTINGS, parseSettings } from './settings'

// Todo lo que hay en la carpeta, con cualquier extensión, para detectar archivos que el juego ignoraría.
const everyFile = Object.keys(import.meta.glob('./sonidos/**/*', { query: '?url', import: 'default', eager: true }))
const docs = import.meta.glob<string>('./sonidos/*.md', { query: '?raw', import: 'default', eager: true })
const readme = docs['./sonidos/README.md'] ?? ''
const credits = docs['./sonidos/CREDITOS.md'] ?? ''

const audioFiles = everyFile.filter((path) => !path.endsWith('.md'))
const expected = allSoundFiles()

describe('archivos de sonido', () => {
  it('cada sonido del catálogo tiene exactamente un archivo', () => {
    const missing = expected.filter((path) => !soundFiles.has(path))
    const duplicated = expected.filter((path) => (soundFiles.get(path)?.length ?? 0) > 1)
    expect(missing, 'faltan archivos').toEqual([])
    expect(duplicated, 'hay más de un archivo para el mismo sonido').toEqual([])
  })

  it('no sobra ningún archivo (todo lo que está en la carpeta se usa)', () => {
    const orphans = [...soundFiles.keys()].filter((path) => !expected.includes(path))
    expect(orphans, 'archivos que no están en catalog.ts').toEqual([])
  })

  it('todos los archivos tienen un formato aceptado', () => {
    const indexed = new Set([...soundFiles.values()].flat().map((f) => f.url))
    const unsupported = audioFiles.filter((path) => !indexSoundFiles({ [path]: path }).size)
    expect(unsupported, 'formatos no aceptados').toEqual([])
    expect(indexed.size).toBe(audioFiles.length)
  })

  it('indexa por ruta sin extensión y detecta duplicados', () => {
    const index = indexSoundFiles({
      './sonidos/efectos/sala/entra-jugador.mp3': 'a.mp3',
      './sonidos/efectos/sala/entra-jugador.OGG': 'b.ogg',
      './sonidos/musica/sala.wav': 'c.wav',
      './sonidos/notas.txt': 'd.txt',
    })
    expect(index.get('efectos/sala/entra-jugador')).toEqual([
      { url: 'a.mp3', format: 'mp3' },
      { url: 'b.ogg', format: 'ogg' },
    ])
    expect(index.get('musica/sala')).toEqual([{ url: 'c.wav', format: 'wav' }])
    expect(index.has('notas')).toBe(false)
  })
})

describe('documentación de sonidos', () => {
  it('el README lista cada sonido del catálogo', () => {
    const ids = [...Object.keys(SFX), ...Object.keys(MUSIC)]
    expect(ids.filter((id) => !readme.includes(`\`${id}\``))).toEqual([])
  })

  it('CREDITOS.md acredita cada archivo', () => {
    expect(expected.filter((path) => !credits.includes(`\`${path}.`))).toEqual([])
  })
})

describe('parseSettings', () => {
  it('usa los valores por defecto si no hay nada guardado o está roto', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('{roto')).toEqual(DEFAULT_SETTINGS)
  })

  it('respeta lo guardado e ignora valores que no son sí/no', () => {
    expect(parseSettings(JSON.stringify({ music: false, sfx: true }))).toEqual({ music: false, sfx: true })
    expect(parseSettings(JSON.stringify({ music: 0.25, sfx: false }))).toEqual({ music: true, sfx: false })
  })
})
