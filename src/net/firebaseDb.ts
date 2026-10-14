import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getDatabase, onChildAdded, onValue, push, ref, remove, set, type Database } from 'firebase/database'
import { netLog } from './debug'
import type { SignalDb } from './signalDb'

export interface FirebasePublicConfig {
  apiKey: string
  authDomain: string
  databaseURL: string
  projectId: string
  appId: string
}

/** La config del cliente es pública; las reglas de la base limitan qué se puede escribir. */
export function readFirebaseConfig(): FirebasePublicConfig | null {
  const env = import.meta.env
  const apiKey = env.VITE_FIREBASE_API_KEY
  const databaseURL = env.VITE_FIREBASE_DATABASE_URL
  const projectId = env.VITE_FIREBASE_PROJECT_ID
  const appId = env.VITE_FIREBASE_APP_ID
  if (!apiKey || !databaseURL || !projectId || !appId) return null
  return {
    apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    databaseURL,
    projectId,
    appId,
  }
}

class FirebaseSignalDb implements SignalDb {
  constructor(private db: Database) {}

  ready(): Promise<void> {
    return new Promise((resolve, reject) => {
      const stop = onValue(
        ref(this.db, '.info/connected'),
        (snap) => {
          if (snap.val() !== true) return
          stop()
          resolve()
        },
        (error) => {
          stop()
          reject(error)
        },
      )
    })
  }

  async set(path: string, value: unknown): Promise<void> {
    await set(ref(this.db, path), value)
  }

  async push(path: string, value: unknown): Promise<string> {
    const child = push(ref(this.db, path))
    await set(child, value)
    return child.key ?? ''
  }

  async remove(path: string): Promise<void> {
    await remove(ref(this.db, path))
  }

  onValue(path: string, cb: (value: unknown) => void, onError?: (error: Error) => void): () => void {
    return onValue(ref(this.db, path), (snap) => cb(snap.val()), (error) => onError?.(error))
  }

  onChildAdded(path: string, cb: (key: string, value: unknown) => void, onError?: (error: Error) => void): () => void {
    return onChildAdded(
      ref(this.db, path),
      (snap) => {
        if (snap.key) cb(snap.key, snap.val())
      },
      (error) => onError?.(error),
    )
  }
}

let singleton: Promise<SignalDb | null> | null = null

export function openFirebase(): Promise<SignalDb | null> {
  singleton ??= connect()
  return singleton
}

async function connect(): Promise<SignalDb | null> {
  const config = readFirebaseConfig()
  if (!config) {
    netLog('firebase', { ok: false, reason: 'sin configuración' })
    return null
  }
  const options: FirebaseOptions = config
  const app = initializeApp(options)
  netLog('firebase', { ok: true, projectId: config.projectId })
  return new FirebaseSignalDb(getDatabase(app))
}
