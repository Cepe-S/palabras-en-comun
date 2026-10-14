/**
 * Base de señalización. Firebase es la implementación real; los tests usan
 * la memoria para no abrir red.
 */

export interface SignalDb {
  /** Resuelve cuando ya se puede leer y escribir. */
  ready(): Promise<void>
  set(path: string, value: unknown): Promise<void>
  /** Crea un hijo con id propio y devuelve ese id. */
  push(path: string, value: unknown): Promise<string>
  remove(path: string): Promise<void>
  onValue(path: string, cb: (value: unknown) => void, onError?: (error: Error) => void): () => void
  onChildAdded(path: string, cb: (key: string, value: unknown) => void, onError?: (error: Error) => void): () => void
}

interface ValueSub {
  kind: 'value'
  path: string
  cb: (value: unknown) => void
}

interface ChildSub {
  kind: 'child'
  path: string
  cb: (key: string, value: unknown) => void
  seen: Set<string>
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value
  return structuredClone(value)
}

/**
 * Árbol en memoria con el mismo orden que Realtime Database: el listener ve
 * el valor actual al suscribirse y cada escritura despierta a quien mira ese
 * camino o uno de sus padres.
 */
export class MemorySignalDb implements SignalDb {
  readonly ops: string[] = []
  private root: Record<string, unknown> = {}
  private subs: Array<ValueSub | ChildSub> = []
  private seq = 0

  ready(): Promise<void> {
    return Promise.resolve()
  }

  subscriptionCount(): number {
    return this.subs.length
  }

  get(path: string): unknown {
    return clone(this.read(path))
  }

  async set(path: string, value: unknown): Promise<void> {
    this.ops.push(`set ${path}`)
    this.write(path, clone(value))
    this.notify(path)
  }

  async push(path: string, value: unknown): Promise<string> {
    const key = `k${++this.seq}`
    await this.set(`${path}/${key}`, value)
    return key
  }

  async remove(path: string): Promise<void> {
    this.ops.push(`remove ${path}`)
    this.write(path, undefined)
    this.notify(path)
  }

  onValue(path: string, cb: (value: unknown) => void): () => void {
    const sub: ValueSub = { kind: 'value', path, cb }
    this.subs.push(sub)
    // El aviso inicial va después de devolver la función para desuscribir,
    // igual que el SDK: si no, el callback no puede guardar esa función.
    queueMicrotask(() => {
      if (!this.subs.includes(sub)) return
      cb(clone(this.read(path)))
    })
    return () => {
      this.subs = this.subs.filter((item) => item !== sub)
    }
  }

  onChildAdded(path: string, cb: (key: string, value: unknown) => void): () => void {
    const sub: ChildSub = { kind: 'child', path, cb, seen: new Set() }
    this.subs.push(sub)
    queueMicrotask(() => {
      if (!this.subs.includes(sub)) return
      this.emitChildren(sub)
    })
    return () => {
      this.subs = this.subs.filter((item) => item !== sub)
    }
  }

  private read(path: string): unknown {
    let node: unknown = this.root
    for (const part of path.split('/')) {
      if (!node || typeof node !== 'object' || !(part in (node as Record<string, unknown>))) return undefined
      node = (node as Record<string, unknown>)[part]
    }
    return node
  }

  private write(path: string, value: unknown): void {
    const parts = path.split('/')
    let node = this.root
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      const next = node[part]
      if (!next || typeof next !== 'object') node[part] = {}
      node = node[part] as Record<string, unknown>
    }
    const leaf = parts[parts.length - 1]
    if (value === undefined) delete node[leaf]
    else node[leaf] = value
  }

  private notify(changed: string): void {
    for (const sub of [...this.subs]) {
      const hit = changed === sub.path || changed.startsWith(`${sub.path}/`) || sub.path.startsWith(`${changed}/`)
      if (!hit) continue
      if (sub.kind === 'value') sub.cb(clone(this.read(sub.path)))
      else this.emitChildren(sub)
    }
  }

  private emitChildren(sub: ChildSub): void {
    const node = this.read(sub.path)
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (sub.seen.has(key)) continue
      sub.seen.add(key)
      sub.cb(key, clone(value))
    }
  }
}
