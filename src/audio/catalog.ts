/**
 * Catálogo de sonidos: la única lista de qué suena en el juego.
 *
 * Cada id es la ruta de su archivo dentro de `src/audio/sonidos/`, sin extensión:
 * el efecto `revelado/ficha` es `sonidos/efectos/revelado/ficha.mp3` y la música `sala`
 * es `sonidos/musica/sala.mp3`. Para cambiar un sonido alcanza con reemplazar ese archivo
 * (ver `sonidos/README.md`).
 */

export interface SfxDef {
  /** Cuándo suena (se usa en el README de sonidos y en el DevHUD). */
  when: string
  /** Volumen propio del sonido (0–1). */
  volume: number
  /** Baja la música mientras suena (fanfarrias y otros efectos largos). */
  duck?: boolean
}

export interface TrackDef {
  when: string
  /** Volumen propio de la pista (0–1). */
  volume: number
}

export const SFX = {
  // Interfaz
  'interfaz/boton-principal': {
    when: 'Botones principales: Unirme, Crear sala, Empezar partida, Volver a la partida, Jugar de nuevo…',
    volume: 0.3,
  },
  'interfaz/boton-secundario': {
    when: 'Botones secundarios: Descartar, Reintentar ahora y el resto de los botones comunes.',
    volume: 0.4,
  },
  'interfaz/interruptor': {
    when: 'Interruptor "Automático" del revelado y los botones de música y efectos.',
    volume: 0.3,
  },
  'interfaz/error': {
    when: 'Algo no se pudo hacer: falta el nombre, el código está incompleto, palabra repetida…',
    volume: 0.4,
  },
  'interfaz/copiar-enlace': { when: 'Se copió el enlace de invitación.', volume: 0.45 },
  'interfaz/abrir-reglas': { when: 'Se abre la ventana "Cómo se juega".', volume: 0.8 },
  'interfaz/cerrar-reglas': { when: 'Se cierra la ventana "Cómo se juega".', volume: 0.55 },
  'interfaz/desplegar': { when: 'Se abre o cierra la lista "Todas las palabras" del resumen.', volume: 0.8 },
  'interfaz/salir': { when: 'El jugador sale de la sala.', volume: 0.4 },

  // Conexión
  'conexion/perdida': { when: 'Se perdió la conexión con el anfitrión.', volume: 0.5, duck: true },
  'conexion/recuperada': { when: 'Se recuperó la conexión con el anfitrión.', volume: 0.45 },
  'conexion/fallida': { when: 'No se pudo entrar a la sala (no existe, está llena o no hay red).', volume: 0.45 },

  // Sala de espera
  'sala/entra-jugador': { when: 'Entra (o vuelve) un jugador a la sala.', volume: 0.5 },
  'sala/sale-jugador': { when: 'Un jugador se desconecta.', volume: 0.35 },

  // Sorteo de la palabra
  'sorteo/redoble-carga': { when: '"Preparando partida…": redoble mientras se llena la barra.', volume: 0.65 },
  'sorteo/salto-ficha': { when: 'Cada ficha que salta en "Preparando partida…".', volume: 0.6 },
  'sorteo/anuncio': { when: '"¡Que empiece el sorteo!".', volume: 0.7 },
  'sorteo/confeti': { when: 'Confeti del anuncio del sorteo.', volume: 0.45 },
  'sorteo/carrete': { when: 'Cada palabra que pasa por la tragamonedas.', volume: 0.3 },
  'sorteo/premio': { when: 'La tragamonedas frena en la palabra elegida.', volume: 0.75 },
  'sorteo/traslado': { when: 'La palabra y el reloj viajan a la pantalla de escritura.', volume: 0.5 },

  // Escritura
  'escritura/agregar-palabra': {
    when: 'Se agrega una palabra (sube de tono con cada casillero).',
    volume: 0.55,
  },
  'escritura/quitar-palabra': { when: 'Se quita una palabra con la ×.', volume: 0.5 },
  'escritura/ocho-palabras': { when: 'Se completan las 8 palabras.', volume: 0.45 },
  'escritura/listo': { when: 'El jugador toca "¡Listo!".', volume: 0.9 },
  'escritura/seguir-editando': { when: 'El jugador toca "Seguir editando".', volume: 0.55 },
  'escritura/otro-listo': { when: 'Otro jugador entregó sus palabras.', volume: 0.25 },
  'escritura/otra-palabra': { when: 'Otro jugador sumó una palabra (muy suave).', volume: 0.12 },
  'escritura/tic-tac': { when: 'Cada segundo de los últimos 10.', volume: 0.6 },
  'escritura/tiempo-cumplido': { when: 'Se acabó el tiempo.', volume: 0.5, duck: true },

  // Revelado
  'revelado/inicio': { when: '"¡Hora de revelar!".', volume: 0.55, duck: true },
  'revelado/turno': { when: 'Empieza el turno de un jugador.', volume: 0.7 },
  'revelado/carta': { when: 'Se da vuelta la carta con una palabra.', volume: 0.9 },
  'revelado/ficha': {
    when: 'Aparece la ficha de cada jugador que escribió la palabra (sube de tono con cada una).',
    volume: 0.8,
  },
  'revelado/puntos': { when: 'La palabra suma puntos.', volume: 1 },
  'revelado/coincidencia-total': {
    when: 'Todos los jugadores escribieron la palabra (3 o más).',
    volume: 0.7,
    duck: true,
  },
  'revelado/cero-puntos': { when: '"Nadie más la escribió · 0 puntos".', volume: 0.4 },
  'revelado/ya-contadas': { when: 'Cada palabra "ya contada" de un turno.', volume: 0.3 },
  'revelado/sube-puesto': { when: 'Un jugador sube de puesto en el marcador.', volume: 0.4 },
  'revelado/saltar': { when: 'El anfitrión salta al resumen.', volume: 1 },

  // Resultados
  'resultados/resumen-ronda': { when: 'Aparece el resultado de la ronda.', volume: 0.5, duck: true },
  'resultados/fanfarria': { when: 'Fin de la partida con un solo ganador.', volume: 0.75, duck: true },
  'resultados/fanfarria-empate': { when: 'Fin de la partida con victoria compartida.', volume: 0.8, duck: true },
  'resultados/corona': { when: 'Aparece la corona del ganador.', volume: 0.5 },
  'resultados/confeti': { when: 'Confeti de la pantalla final.', volume: 0.6 },
} as const satisfies Record<string, SfxDef>

export type SfxId = keyof typeof SFX

export const MUSIC = {
  inicio: { when: 'Pantalla de inicio y mientras se conecta a una sala.', volume: 0.45 },
  sala: { when: 'Sala de espera.', volume: 0.45 },
  escritura: {
    when: 'Mientras se escriben las palabras. Se acelera en los últimos 30 segundos y se corta en los últimos 10.',
    volume: 0.35,
  },
  revelado: { when: 'Revelado de las palabras (bajo, para que manden los efectos).', volume: 0.3 },
  resumen: { when: 'Resultado de la ronda.', volume: 0.4 },
  final: { when: 'Pantalla final, después de la fanfarria.', volume: 0.45 },
} as const satisfies Record<string, TrackDef>

export type TrackId = keyof typeof MUSIC

/** Formatos aceptados para los archivos de sonido. MP3 es el recomendado: suena en todos los navegadores. */
export const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'opus', 'webm', 'm4a', 'aac', 'wav', 'flac'] as const

export function sfxFile(id: SfxId): string {
  return `efectos/${id}`
}

export function trackFile(id: TrackId): string {
  return `musica/${id}`
}

/** Todas las rutas (sin extensión) que tienen que existir en `sonidos/`. */
export function allSoundFiles(): string[] {
  return [...(Object.keys(SFX) as SfxId[]).map(sfxFile), ...(Object.keys(MUSIC) as TrackId[]).map(trackFile)]
}
