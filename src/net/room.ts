import { createGame, reduce, toPublic } from '../game/engine'
import { MAX_PLAYERS, type Action, type GameState, type PublicState } from '../game/types'
import { netLog } from './debug'
import { Transport, type Link, type StrategyName } from './transport'

/* ---------- Mensajes ---------- */

type ClientMsg = { t: 'hello'; playerId: string; name: string } | { t: 'act'; action: UiAction }
type HostMsg =
  | { t: 'state'; state: PublicState }
  | { t: 'welcome'; words: string[] }
  | { t: 'rejected'; reason: string }
  | { t: 'bye' }

/** Acciones que dispara la interfaz; el id del jugador lo completa la sesión. */
export type UiAction =
  | { type: 'start' }
  | { type: 'words'; words: string[]; ready?: boolean }
  | { type: 'next' }
  | { type: 'skipReveal' }
  | { type: 'playAgain' }

const ALLOWED: UiAction['type'][] = [
  'start',
  'words',
  'next',
  'skipReveal',
  'playAgain',
]

/* ---------- Estado observable ---------- */

export type Status = 'connecting' | 'connected' | 'hostLost' | 'rejected' | 'notFound' | 'offline'

export const PUBLISHING_MESSAGE = 'Publicando la sala…'
export const ICE_MESSAGE =
  'Tu red bloqueó la conexión directa entre navegadores. Si estás con datos móviles o en una red restringida, probá con Wi-Fi.'
export const WEBRTC_MESSAGE =
  'Este navegador no tiene WebRTC, así que no puede conectar la partida. Desactivá la extensión que lo bloquea o activalo en la configuración del navegador.'
export const OFFLINE_MESSAGE = 'No pudimos contactar a los relays de conexión. Probá con otra red o más tarde.'
export const NOT_FOUND_MESSAGE =
  'No encontramos esa sala. Revisá el código o pedile al anfitrión que la vuelva a abrir.'

/** Más que el backoff de un relay limitado (60 s) y que el gathering de ICE. */
export const GIVE_UP_MS = 75_000

export interface Snapshot {
  status: Status
  message: string | null
  code: string
  isHost: boolean
  playerId: string
  name: string
  state: PublicState | null
  /** Diferencia entre el reloj del anfitrión y el local (ms). */
  clockOffset: number
  /** Palabras que el anfitrión ya tenía guardadas para este jugador (reconexión). */
  myWords: string[] | null
  /** Estrategias de señalización activas (informativo). */
  strategies: string[]
}

export function isWebRtcMissing(error: string): boolean {
  return /RTCPeerConnection is not a constructor/i.test(error)
}

export function isIceFailure(error: string): boolean {
  return !isWebRtcMissing(error) && /could not connect to peer|TURN|ICE|exchanging SDP/i.test(error)
}

/**
 * Qué decir cuando pasó el plazo y todavía no hay canal de datos.
 * `notFound` solo si los relays respondieron y nadie intercambió SDP.
 */
export function diagnoseSilence(input: {
  elapsedMs: number
  relaySeen: boolean
  iceFailed: boolean
}): 'wait' | 'notFound' | 'offline' | 'ice' {
  if (input.elapsedMs < GIVE_UP_MS) return 'wait'
  if (input.iceFailed) return 'ice'
  if (!input.relaySeen) return 'offline'
  return 'notFound'
}

/* ---------- Persistencia por pestaña ---------- */

const KEY_ID = 'pec.playerId'
const KEY_SAVED = 'pec.saved'

export interface SavedSession {
  role: 'host' | 'client'
  code: string
  name: string
  game?: GameState
}

export function getPlayerId(): string {
  let id = sessionStorage.getItem(KEY_ID)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(KEY_ID, id)
  }
  return id
}

export function loadSaved(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(KEY_SAVED)
    return raw ? (JSON.parse(raw) as SavedSession) : null
  } catch {
    return null
  }
}

export function clearSaved(): void {
  sessionStorage.removeItem(KEY_SAVED)
}

function save(data: SavedSession): void {
  try {
    sessionStorage.setItem(KEY_SAVED, JSON.stringify(data))
  } catch {
    /* sin espacio o modo privado: seguimos sin persistir */
  }
}

/* ---------- Códigos de sala ---------- */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
}

/** Parte del enlace que identifica la sala: `#/sala/ABCDE`. */
export function roomHash(code: string): string {
  return `#/sala/${code}`
}

export function roomLink(code: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}${roomHash(code)}`
}

export function codeFromHash(hash: string): string | null {
  const match = /^#\/sala\/([A-Za-z0-9]{5})\/?$/.exec(hash)
  return match ? match[1].toUpperCase() : null
}

/** Lo que alguien escribe o pega en el campo del código: el código solo o el enlace entero. */
export function codeFromText(text: string): string {
  const fromLink = /#\/sala\/([A-Za-z0-9]{5})\b/.exec(text)
  return fromLink ? fromLink[1].toUpperCase() : normalizeCode(text)
}

/* ---------- Sesión ---------- */

const HEARTBEAT_MS = 4000
/**
 * El anfitrión publica el estado cada 4 s. Un silencio más corto puede ser la
 * pestaña en segundo plano o un canal que se trabó y después sigue: no alcanza
 * para declarar la partida perdida. Si el par se va de verdad, eso se avisa al toque.
 */
const HOST_TIMEOUT_MS = 45_000

type Listener = (snap: Snapshot) => void

/**
 * Lo mínimo que necesita la interfaz de una sesión. Permite sustituir la sesión real
 * por una simulada (ver `src/dev/MockSession.ts`) sin tocar las pantallas.
 */
export interface SessionLike {
  readonly snapshot: Snapshot
  subscribe(listener: (snap: Snapshot) => void): () => void
  /** Hora actual alineada con el reloj del anfitrión. */
  now(): number
  act(action: UiAction): void
  leave(): void
  close(): void
}

export class Session implements SessionLike {
  snapshot: Snapshot
  private listeners = new Set<Listener>()
  private transport: Link
  private timers: ReturnType<typeof setInterval>[] = []
  private closed = false

  // Anfitrión
  private game: GameState | null = null
  private peerToPlayer = new Map<string, string>()

  // Cliente
  private hostPeerId: string | null = null
  private lastStateAt = 0
  private startedAt = Date.now()
  private relaySeen = false
  private iceFailed = false
  private iceFailures = new Set<StrategyName>()
  private webRtcMissing = false

  private roomName: string | undefined

  private constructor(
    role: 'host' | 'client',
    code: string,
    name: string,
    game?: GameState,
    link?: Link,
    roomName?: string,
  ) {
    this.roomName = roomName
    const playerId = getPlayerId()
    this.snapshot = {
      status: 'connecting',
      message: null,
      code,
      isHost: role === 'host',
      playerId,
      name,
      state: null,
      clockOffset: 0,
      myWords: null,
      strategies: [],
    }
    this.transport = link ?? new Transport(code, role !== 'host')
    this.transport.onMessage = (data, peerId) => this.onMessage(data, peerId)
    this.transport.onPeerJoin = (peerId) => this.onPeerJoin(peerId)
    this.transport.onPeerLeave = (peerId) => this.onPeerLeave(peerId)
    this.transport.onFailure = (strategy, error) => this.onTransportFailure(strategy, error)
    this.transport.onSignaling = (open) => this.onSignaling(open)

    netLog('session', { role, code, playerId, passive: role !== 'host' })
    if (role === 'host') this.startHost(game)
    else this.startClient()
    this.timers.push(setInterval(() => this.checkLink(), 2000))
  }

  static host(name: string, roomName?: string, resume?: SavedSession): Session {
    return new Session('host', resume?.code ?? generateCode(), name, resume?.game, undefined, roomName)
  }

  static join(code: string, name: string): Session {
    return new Session('client', code, name)
  }

  static resume(saved: SavedSession): Session {
    return saved.role === 'host'
      ? Session.host(saved.name, undefined, saved)
      : Session.join(saved.code, saved.name)
  }

  /** Arma una sesión sobre un transporte falso. Sirve para probar el protocolo sin WebRTC. */
  static openForTest(role: 'host' | 'client', code: string, name: string, link: Link): Session {
    return new Session(role, code, name, undefined, link)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Hora actual alineada con el reloj del anfitrión. */
  now(): number {
    return Date.now() + this.snapshot.clockOffset
  }

  act(action: UiAction): void {
    if (this.snapshot.isHost) {
      this.applyHost(this.toAction(action, this.snapshot.playerId))
    } else {
      this.sendToHost({ t: 'act', action })
    }
  }

  leave(): void {
    if (this.closed) return
    if (this.snapshot.isHost) this.transport.broadcast(JSON.stringify({ t: 'bye' } satisfies HostMsg))
    this.closed = true
    this.timers.forEach(clearInterval)
    this.transport.leave()
    clearSaved()
  }

  /** Cierra sin borrar lo guardado (para recargar o reintentar). */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.timers.forEach(clearInterval)
    this.transport.leave()
  }

  private update(patch: Partial<Snapshot>): void {
    const prev = this.snapshot
    this.snapshot = { ...this.snapshot, ...patch }
    if (patch.status !== undefined && patch.status !== prev.status) {
      netLog('status', { from: prev.status, to: patch.status, message: this.snapshot.message })
    } else if (patch.message !== undefined && patch.message !== prev.message) {
      netLog('status', { status: this.snapshot.status, message: patch.message })
    }
    this.listeners.forEach((l) => l(this.snapshot))
  }

  private connect(): void {
    const strategies: StrategyName[] = ['nostr', 'torrent']
    for (const s of strategies) {
      this.transport
        .use(s)
        .then(() => {
          if (this.closed) return
          this.update({ strategies: [...this.transport.strategies] })
        })
        .catch((error: unknown) => {
          netLog('strategy:unhandled', { strategy: s, error: error instanceof Error ? error.message : String(error) })
        })
    }
  }

  private markHostReady(): void {
    if (!this.snapshot.isHost || this.snapshot.status !== 'connecting') return
    // La sala ya está publicada. Un intento fallido contra un par no significa que la red esté bloqueada.
    this.update({ status: 'connected', message: this.webRtcMissing ? WEBRTC_MESSAGE : null })
  }

  /* ---------- Anfitrión ---------- */

  private startHost(resume?: GameState): void {
    const { playerId, name, code } = this.snapshot
    let game = resume ?? createGame(playerId, name, this.roomName)
    if (resume) {
      // Tras recargar, todos quedan desconectados hasta que vuelvan a saludar.
      game = {
        ...game,
        players: game.players.map((p) => ({ ...p, connected: p.id === game.hostId })),
      }
    }
    this.game = game
    this.update({ state: toPublic(game, Date.now()), message: PUBLISHING_MESSAGE })
    save({ role: 'host', code, name, game })

    this.connect()

    this.timers.push(
      setInterval(() => this.applyHost({ type: 'tick' }), 500),
      setInterval(() => this.publish(), HEARTBEAT_MS),
    )
  }

  private toAction(action: UiAction, playerId: string): Action {
    switch (action.type) {
      case 'words':
        return { type: 'words', id: playerId, words: action.words, ready: action.ready }
      default:
        return { ...action, by: playerId }
    }
  }

  private applyHost(action: Action): void {
    if (!this.game) return
    const next = reduce(this.game, action, { now: Date.now(), random: Math.random })
    if (next === this.game) return
    this.game = next
    save({ role: 'host', code: this.snapshot.code, name: this.snapshot.name, game: next })
    this.publish()
  }

  private publish(): void {
    if (!this.game) return
    const state = toPublic(this.game, Date.now())
    this.update({ state })
    this.transport.broadcast(JSON.stringify({ t: 'state', state } satisfies HostMsg))
  }

  private sendHostMsg(peerId: string, msg: HostMsg): void {
    void this.transport.sendTo(peerId, JSON.stringify(msg))
  }

  private hostOnMessage(data: string, peerId: string): void {
    const game = this.game
    if (!game) return
    let msg: ClientMsg
    try {
      msg = JSON.parse(data) as ClientMsg
    } catch {
      return
    }

    if (msg.t === 'hello') {
      if (typeof msg.playerId !== 'string' || typeof msg.name !== 'string') return
      const known = game.players.some((p) => p.id === msg.playerId)
      if (!known && game.phase !== 'lobby') {
        this.sendHostMsg(peerId, { t: 'rejected', reason: 'La partida ya empezó. Esperá a la próxima.' })
        return
      }
      if (!known && game.players.length >= MAX_PLAYERS) {
        this.sendHostMsg(peerId, { t: 'rejected', reason: 'La sala está llena.' })
        return
      }
      this.peerToPlayer.set(peerId, msg.playerId)
      this.applyHost({ type: 'join', id: msg.playerId, name: msg.name })
      const mine = this.game?.phase === 'writing' ? this.game.submissions[msg.playerId] : undefined
      this.sendHostMsg(peerId, { t: 'welcome', words: mine ?? [] })
      this.sendHostMsg(peerId, { t: 'state', state: toPublic(this.game!, Date.now()) })
      return
    }

    if (msg.t === 'act') {
      const playerId = this.peerToPlayer.get(peerId)
      const action = msg.action
      if (!playerId || !action || !ALLOWED.includes(action.type)) return
      if (action.type === 'words' && !Array.isArray(action.words)) return
      this.applyHost(this.toAction(action, playerId))
    }
  }

  /* ---------- Cliente ---------- */

  private startClient(): void {
    const { code, name } = this.snapshot
    save({ role: 'client', code, name })
    this.connect()

    this.timers.push(
      // Reintenta el saludo hasta recibir el estado de la sala.
      setInterval(() => {
        if (!this.snapshot.state || this.snapshot.status === 'hostLost') this.sayHello()
      }, 2000),
    )
  }

  private sayHello(peerId?: string): void {
    const msg: ClientMsg = { t: 'hello', playerId: this.snapshot.playerId, name: this.snapshot.name }
    const data = JSON.stringify(msg)
    if (peerId) void this.transport.sendTo(peerId, data)
    else this.transport.broadcast(data)
  }

  private sendToHost(msg: ClientMsg): void {
    if (!this.hostPeerId) return
    void this.transport.sendTo(this.hostPeerId, JSON.stringify(msg))
  }

  private checkLink(): void {
    const { status, state } = this.snapshot
    if (this.webRtcMissing || status === 'rejected' || status === 'notFound' || status === 'offline') return
    const diagnosis = diagnoseSilence({
      elapsedMs: Date.now() - this.startedAt,
      relaySeen: this.relaySeen,
      iceFailed: this.iceFailed,
    })

    if (this.snapshot.isHost) {
      if (status === 'connecting' && diagnosis === 'offline') this.update({ message: OFFLINE_MESSAGE })
      return
    }

    if (!state) {
      if (diagnosis === 'notFound') this.update({ status: 'notFound', message: NOT_FOUND_MESSAGE })
      else if (diagnosis === 'offline') this.update({ status: 'offline', message: OFFLINE_MESSAGE })
      else if (diagnosis === 'ice') this.update({ message: ICE_MESSAGE })
      return
    }
    if (status === 'connected' && Date.now() - this.lastStateAt > HOST_TIMEOUT_MS) {
      this.update({ status: 'hostLost', message: 'Se perdió la conexión con el anfitrión.' })
    }
  }

  private clientOnMessage(data: string, peerId: string): void {
    let msg: HostMsg
    try {
      msg = JSON.parse(data) as HostMsg
    } catch {
      return
    }
    switch (msg.t) {
      case 'state': {
        this.hostPeerId = peerId
        this.lastStateAt = Date.now()
        this.update({
          status: 'connected',
          message: null,
          state: msg.state,
          clockOffset: msg.state.hostNow - Date.now(),
          // Las palabras guardadas solo sirven durante la escritura de esa ronda.
          myWords: msg.state.phase === 'writing' ? this.snapshot.myWords : null,
        })
        // En el lobby un corte te saca de la lista: volvemos a anotarnos.
        if (!msg.state.players.some((p) => p.id === this.snapshot.playerId)) this.sayHello(peerId)
        break
      }
      case 'welcome':
        this.update({ myWords: msg.words })
        break
      case 'rejected':
        this.update({ status: 'rejected', message: msg.reason })
        break
      case 'bye':
        if (peerId === this.hostPeerId) {
          this.update({ status: 'hostLost', message: 'El anfitrión cerró la sala.' })
        }
        break
    }
  }

  /* ---------- Eventos de transporte ---------- */

  private onMessage(data: string, peerId: string): void {
    netLog('rx', { peerId, t: msgType(data), bytes: data.length })
    if (this.snapshot.isHost) this.hostOnMessage(data, peerId)
    else this.clientOnMessage(data, peerId)
  }

  private onPeerJoin(peerId: string): void {
    if (this.snapshot.isHost) {
      this.markHostReady()
      return
    }
    if (this.snapshot.status !== 'rejected') this.sayHello(peerId)
  }

  private onPeerLeave(peerId: string): void {
    if (this.snapshot.isHost) {
      const playerId = this.peerToPlayer.get(peerId)
      this.peerToPlayer.delete(peerId)
      if (!playerId) return
      const stillThere = [...this.peerToPlayer.values()].includes(playerId)
      if (!stillThere) this.applyHost({ type: 'disconnect', id: playerId })
    } else if (peerId === this.hostPeerId && this.snapshot.status === 'connected') {
      this.update({ status: 'hostLost', message: 'Se perdió la conexión con el anfitrión.' })
    }
  }

  private onSignaling(open: boolean): void {
    if (!open) return
    this.relaySeen = true
    this.markHostReady()
  }

  private onTransportFailure(strategy: StrategyName, error: string): void {
    netLog('failure', { strategy, error, ice: isIceFailure(error) })
    if (isWebRtcMissing(error)) {
      this.webRtcMissing = true
      this.update({ message: WEBRTC_MESSAGE })
      return
    }
    if (!isIceFailure(error)) return
    this.iceFailed = true
    this.iceFailures.add(strategy)
    const { status } = this.snapshot
    // Un solo canal puede fallar mientras el otro todavía conecta. El aviso aparece
    // cuando los dos fallaron, o al cumplirse el plazo si sigue sin haber partida.
    if (status !== 'connecting' || this.iceFailures.size < 2) return
    this.update({ message: ICE_MESSAGE })
  }
}

/** Arma una sesión sobre un transporte falso. Sirve para probar el protocolo sin WebRTC. */
export function createTestSession(role: 'host' | 'client', code: string, name: string, link: Link): Session {
  return Session.openForTest(role, code, name, link)
}

function msgType(data: string): string {
  try {
    const msg = JSON.parse(data) as { t?: unknown }
    return typeof msg.t === 'string' ? msg.t : 'unknown'
  } catch {
    return 'invalid'
  }
}
