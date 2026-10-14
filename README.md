# Palabras en común

Juego de mesa de asociación de palabras para jugar en el navegador con amigos.
Es una página estática en GitHub Pages. Los jugadores se saludan por Firebase
Realtime Database y, en cuanto el enlace queda armado, la partida viaja solo por
un Data Channel de WebRTC. Si la red no deja un camino directo, se usa el TURN
de Cloudflare.

## Cómo se juega

1. Se sortea una palabra para la ronda.
2. Cada jugador tiene **1 minuto y 30 segundos** para escribir **8 palabras** relacionadas.
3. Cada palabra vale tantos puntos como jugadores la escribieron (5 jugadores = 5 puntos).
   Si nadie más la escribió, vale 0. Se comparan sin tildes ni mayúsculas.
4. Se revelan las palabras jugador por jugador, con las repeticiones para dar suspenso.
   Las palabras que ya se leyeron no se vuelven a leer, pero igual suman puntos.
5. Son **3 rondas**. Gana quien tenga más puntos sumando las tres.

Se juega de 2 a 8 jugadores. El anfitrión crea la sala, comparte el código de 5 caracteres
(o el enlace) y controla el ritmo de la partida.

## Desarrollo

```sh
npm install
npm run dev        # juego en modo dev (http://127.0.0.1:5173, con DevHUD) — correr desde la raíz
npm run dev:turn   # opcional: Worker de credenciales TURN en http://localhost:8787
npm test           # tests de la lógica del juego
npm run build      # genera dist/
```

Para probarlo solo, abrí varias pestañas: cada pestaña es un jugador distinto
(el id de jugador se guarda por pestaña, así que recargar no pierde el lugar).

## Publicar en GitHub Pages

1. Subí el repo a GitHub (rama `main`).
2. En **Settings → Pages**, elegí **Source: GitHub Actions**.
3. Cada push a `main` corre `.github/workflows/deploy.yml`, que testea, compila y publica `dist/`.

`vite.config.ts` usa `base: './'`, por lo que funciona en cualquier subruta
(`https://usuario.github.io/repo/`).

## Arquitectura

- `src/game/engine.ts`: lógica pura y testeada (`reduce`, normalización, puntaje, cola de revelado).
- `src/net/transport.ts`: señalización en Firebase (oferta, respuesta y candidatos ICE
  apenas aparecen). Al conectar, esa escucha se corta. El juego sigue por el Data Channel
  con el anfitrión, que es el único que ofrece.
- `src/net/room.ts`: sesión. El **anfitrión es la fuente de verdad**: valida acciones, guarda el
  estado y lo envía a todos. Las palabras ocultas nunca se envían antes de revelarse.
- `src/ui/`: pantallas y componentes de la interfaz.

## Limitaciones conocidas

- Si el anfitrión cierra la pestaña, la partida se pausa. Al volver a abrir el sitio puede
  retomarla con "Volver a la partida" (el estado se guarda en la pestaña) y los demás se reconectan solos.
- Los relays públicos ya no intervienen. Si Firebase no está configurado, o la red bloquea
  WebRTC y el TURN no responde, la sala no llega a armarse.
- Se recomienda un máximo de 8 jugadores: el anfitrión mantiene un enlace con cada uno.

## Altura mínima en celulares

Con ancho 360 px, todas las pantallas de juego (inicio, sala, palabra, escritura, revelado) entran sin scroll desde **~580 px** de alto. El resumen de ronda y el final (tablas con todos los jugadores) pueden necesitar scroll en pantallas de menos de ~620–900 px según la cantidad de jugadores.
