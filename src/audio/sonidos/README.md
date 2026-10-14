# Sonidos del juego

Todos los sonidos y la música de *Palabras en común* están en esta carpeta, **un archivo por sonido**,
con nombres que dicen cuándo suenan:

```
sonidos/
├── efectos/
│   ├── interfaz/     botones, reglas, errores
│   ├── conexion/     se cae o vuelve el anfitrión
│   ├── sala/         jugadores que entran y salen
│   ├── sorteo/       carga, anuncio y tragamonedas
│   ├── escritura/    agregar palabras, ¡Listo!, cuenta regresiva
│   ├── revelado/     cartas, fichas, puntos
│   └── resultados/   resumen de ronda y final
├── musica/           una pista por momento del juego
├── README.md         esta guía
└── CREDITOS.md       origen y licencia de cada archivo
```

## Cambiar un sonido

1. Buscá el archivo en la tabla de abajo (por ejemplo `revelado/puntos` → `efectos/revelado/puntos.mp3`).
2. Reemplazalo por el nuevo **con el mismo nombre**. No hace falta tocar código.
3. Si el nuevo tiene otra extensión (`.ogg`, `.wav`…), borrá el viejo: tiene que quedar **un solo archivo** por sonido.
4. Corré `npm test`: avisa si falta un archivo, si hay dos para el mismo sonido o si sobra alguno.
5. Anotá de dónde salió en `CREDITOS.md`.

Formatos aceptados: `mp3`, `ogg`, `opus`, `webm`, `m4a`, `aac`, `wav`, `flac`.
Se recomienda **MP3**, que suena en todos los navegadores (Safari no reproduce `ogg`).

Consejos para que el juego suene parejo:

- Efectos cortos, sin silencio al principio (si no, suenan tarde) y en mono.
- Música en bucle: que el final empalme con el principio.
- Para probar sin jugar: en `npm run dev`, el DevHUD (botón **DEV**) tiene una sección **Sonidos**
  con un botón por efecto y por música.

## Ajustar el volumen

Cada sonido tiene su volumen propio en [`../catalog.ts`](../catalog.ts) (`volume`, de 0 a 1).
El balance general entre música y efectos está en `MUSIC_LEVEL` y `SFX_LEVEL` de
[`../engine.ts`](../engine.ts). Los efectos con `duck: true` bajan la música mientras suenan.

Cada jugador solo puede prender o apagar la música (botón 🎵) y los efectos (botón 🔈), desde
la barra de arriba o desde la pantalla de inicio. La elección queda guardada en el navegador.

## Agregar un sonido nuevo

1. Agregá el id en `SFX` (o `MUSIC`) de [`../catalog.ts`](../catalog.ts), con su `when` y su `volume`.
2. Poné el archivo en la carpeta que corresponde al id.
3. Hacelo sonar con `sfx('grupo/nombre')` (de `src/audio/engine.ts`) o, en un botón, con
   `data-sfx="grupo/nombre"`.
4. Sumalo a la tabla de esta guía y a `CREDITOS.md` (`npm test` lo controla).

Los botones suenan solos: los principales con `interfaz/boton-principal` y el resto con
`interfaz/boton-secundario`. `data-sfx="none"` los silencia (se usa cuando el sonido depende del
resultado, como "Agregar", o cuando ya suena otra cosa, como "Siguiente" en el revelado).

## Qué suena y cuándo

### Música (`musica/`)

| Archivo | Cuándo |
| --- | --- |
| `inicio` | Pantalla de inicio y mientras se conecta a una sala. |
| `sala` | Sala de espera. |
| `escritura` | Mientras se escriben las palabras. Se acelera en los últimos 30 segundos y se corta en los últimos 10. |
| `revelado` | Revelado de las palabras (bajo, para que manden los efectos). |
| `resumen` | Resultado de la ronda. |
| `final` | Pantalla final, después de la fanfarria. |

Durante el sorteo de la palabra no hay música: suenan la tragamonedas y sus efectos.

### Efectos (`efectos/`)

| Archivo | Cuándo |
| --- | --- |
| `interfaz/boton-principal` | Botones principales: Unirme, Crear sala, Empezar partida, Volver a la partida, Jugar de nuevo… |
| `interfaz/boton-secundario` | Botones secundarios: Descartar, Reintentar ahora y el resto de los botones comunes. |
| `interfaz/interruptor` | Interruptor "Automático" del revelado y los botones de música y efectos. |
| `interfaz/error` | Algo no se pudo hacer: falta el nombre, el código está incompleto, palabra repetida… |
| `interfaz/copiar-enlace` | Se copió el enlace de invitación. |
| `interfaz/abrir-reglas` | Se abre la ventana "Cómo se juega". |
| `interfaz/cerrar-reglas` | Se cierra la ventana "Cómo se juega". |
| `interfaz/desplegar` | Se abre o cierra la lista "Todas las palabras" del resumen. |
| `interfaz/salir` | El jugador sale de la sala. |
| `conexion/perdida` | Se perdió la conexión con el anfitrión. |
| `conexion/recuperada` | Se recuperó la conexión con el anfitrión. |
| `conexion/fallida` | No se pudo entrar a la sala (no existe, está llena o no hay red). |
| `sala/entra-jugador` | Entra (o vuelve) un jugador a la sala. |
| `sala/sale-jugador` | Un jugador se desconecta. |
| `sorteo/redoble-carga` | "Preparando partida…": redoble mientras se llena la barra. |
| `sorteo/salto-ficha` | Cada ficha que salta en "Preparando partida…". |
| `sorteo/anuncio` | "¡Que empiece el sorteo!". |
| `sorteo/confeti` | Confeti del anuncio del sorteo. |
| `sorteo/carrete` | Cada palabra que pasa por la tragamonedas. |
| `sorteo/premio` | La tragamonedas frena en la palabra elegida. |
| `sorteo/traslado` | La palabra y el reloj viajan a la pantalla de escritura. |
| `escritura/agregar-palabra` | Se agrega una palabra (sube de tono con cada casillero). |
| `escritura/quitar-palabra` | Se quita una palabra con la ×. |
| `escritura/ocho-palabras` | Se completan las 8 palabras. |
| `escritura/listo` | El jugador toca "¡Listo!". |
| `escritura/seguir-editando` | El jugador toca "Seguir editando". |
| `escritura/otro-listo` | Otro jugador entregó sus palabras. |
| `escritura/otra-palabra` | Otro jugador sumó una palabra (muy suave). |
| `escritura/tic-tac` | Cada segundo de los últimos 10. |
| `escritura/tiempo-cumplido` | Se acabó el tiempo. |
| `revelado/inicio` | "¡Hora de revelar!". |
| `revelado/turno` | Empieza el turno de un jugador. |
| `revelado/carta` | Se da vuelta la carta con una palabra. |
| `revelado/ficha` | Aparece la ficha de cada jugador que escribió la palabra (sube de tono con cada una). |
| `revelado/puntos` | La palabra suma puntos. |
| `revelado/coincidencia-total` | Todos los jugadores escribieron la palabra (3 o más). |
| `revelado/cero-puntos` | "Nadie más la escribió · 0 puntos". |
| `revelado/ya-contadas` | Cada palabra "ya contada" de un turno. |
| `revelado/sube-puesto` | Un jugador sube de puesto en el marcador. |
| `revelado/saltar` | El anfitrión salta al resumen. |
| `resultados/resumen-ronda` | Aparece el resultado de la ronda. |
| `resultados/fanfarria` | Fin de la partida con un solo ganador. |
| `resultados/fanfarria-empate` | Fin de la partida con victoria compartida. |
| `resultados/corona` | Aparece la corona del ganador. |
| `resultados/confeti` | Confeti de la pantalla final. |

## Cómo está armado (para programadores)

| Archivo | Qué hace |
| --- | --- |
| `src/audio/catalog.ts` | La lista única de sonidos: id, cuándo suena, volumen. |
| `src/audio/files.ts` | Encuentra los archivos de esta carpeta por su nombre. |
| `src/audio/engine.ts` | Reproduce: efectos con [Howler.js](https://howlerjs.com), música en streaming con fundidos. |
| `src/audio/director.ts` | Decide qué suena según los cambios de la partida (fase, jugadores, revelado). |
| `src/audio/useAudio.ts` | Conecta el director a la sesión y la cuenta regresiva. |
| `src/audio/buttons.ts` | Sonido de todos los botones con un solo listener. |
| `src/ui/SoundToggle.tsx` | Botones 🎵 y 🔈: prenden o apagan la música y los efectos (se guarda en el navegador). |

Lo que llega por la red (alguien entra, cambia la fase, se revela una palabra) suena desde el
director y no desde los botones: así todos escuchan lo mismo y el anfitrión no lo escucha dos veces.
