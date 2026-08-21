

import type { IdentityKeyPair } from './crypto'

const DB_NAME = 'cryptalk-keys'
const STORE_NAME = 'keys'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

// In-memory cache — keys are never written to localStorage or sessionStorage.
// IndexedDB is used for persistence across page reloads; this cache avoids
// repeated async reads on hot paths.
let _identityKeyCache: IdentityKeyPair | null = null
let _groupKeyCache: Map<string, Uint8Array> = new Map()

function openDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'))
  }
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
    request.onsuccess = () => resolve(request.result)
    request.onblocked = () => {
      dbPromise = null
      // Another tab holds a blocking connection — clear in-memory state
      // and reject so callers know the DB is unavailable.
      _identityKeyCache = null
      _groupKeyCache.clear()
      reject(new Error('IndexedDB open blocked — close other tabs with this app'))
    }
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
  return dbPromise
}

function put(key: string, value: any): Promise<void> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

function get<T>(key: string): Promise<T | null> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  }))
}

function del(key: string): Promise<void> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

// key management

const IDENTITY_KEY = 'identity-keypair'
const GROUP_KEYS_PREFIX = 'group-key-'

export async function hasIdentityKey(): Promise<boolean> {
  try {
    const key = await get<IdentityKeyPair>(IDENTITY_KEY)
    return key !== null
  } catch {
    return false
  }
}

export async function saveIdentityKey(keyPair: IdentityKeyPair): Promise<void> {
  _identityKeyCache = keyPair
  await put(IDENTITY_KEY, keyPair)
}

export async function loadIdentityKey(): Promise<IdentityKeyPair | null> {
  if (_identityKeyCache) return _identityKeyCache
  try {
    const key = await get<IdentityKeyPair>(IDENTITY_KEY)
    if (key) _identityKeyCache = key
    return key
  } catch {
    return null
  }
}

// wipes all keys — past messages become permanently undecryptable
export async function clearAllKeys(): Promise<void> {
  _identityKeyCache = null
  _groupKeyCache.clear()
  try {
    await del(IDENTITY_KEY)
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    return new Promise((resolve) => {
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // silent catch if storage is unavailable
  }
}

export async function saveGroupKey(chatId: string, key: Uint8Array): Promise<void> {
  _groupKeyCache.set(chatId, key)
  await put(`${GROUP_KEYS_PREFIX}${chatId}`, Array.from(key))
}

export async function loadGroupKey(chatId: string): Promise<Uint8Array | null> {
  const cached = _groupKeyCache.get(chatId)
  if (cached) return cached
  try {
    const arr = await get<number[]>(`${GROUP_KEYS_PREFIX}${chatId}`)
    if (!arr) return null
    const key = new Uint8Array(arr)
    _groupKeyCache.set(chatId, key)
    return key
  } catch {
    return null
  }
}

export async function hasGroupKey(chatId: string): Promise<boolean> {
  if (_groupKeyCache.has(chatId)) return true
  try {
    const arr = await get<number[]>(`${GROUP_KEYS_PREFIX}${chatId}`)
    return arr !== null
  } catch {
    return false
  }
}
