# Palabras en común

Juego de mesa de asociación de palabras para jugar en el navegador con amigos.
Es una página 100 % estática: no hay servidor propio. Los jugadores se conectan entre
sí por WebRTC (peer-to-peer) usando [Trystero](https://github.com/dmotz/trystero), que
solo usa relays públicos de Nostr y BitTorrent para el "saludo" inicial.

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
npm run dev        # servidor local
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
- `src/net/transport.ts`: Trystero con Nostr y BitTorrent como respaldo (el anfitrión usa ambos;
  los demás prueban Nostr y suman BitTorrent si no encuentran la sala en unos segundos).
- `src/net/room.ts`: sesión. El **anfitrión es la fuente de verdad**: valida acciones, guarda el
  estado y lo envía a todos. Las palabras ocultas nunca se envían antes de revelarse.
- `src/ui/`: pantallas y componentes de la interfaz.

## Limitaciones conocidas

- Si el anfitrión cierra la pestaña, la partida se pausa. Al volver a abrir el sitio puede
  retomarla con "Volver a la partida" (el estado se guarda en la pestaña) y los demás se reconectan solos.
- Los relays públicos pueden caerse temporalmente, y algunas redes (corporativas, NAT estricto)
  bloquean WebRTC sin servidor TURN. En ese caso probá con otra red o con datos móviles.
- Se recomienda un máximo de 8 jugadores por sala por el rendimiento de la malla P2P.
