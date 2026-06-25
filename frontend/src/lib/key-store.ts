

import type { IdentityKeyPair } from './crypto'

const DB_NAME = 'cryptalk-keys'
const STORE_NAME = 'keys'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
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
  const key = await get<IdentityKeyPair>(IDENTITY_KEY)
  return key !== null
}

export async function saveIdentityKey(keyPair: IdentityKeyPair): Promise<void> {
  await put(IDENTITY_KEY, keyPair)
}

export async function loadIdentityKey(): Promise<IdentityKeyPair | null> {
  return get<IdentityKeyPair>(IDENTITY_KEY)
}

// wipes all keys — past messages become permanently undecryptable
export async function clearAllKeys(): Promise<void> {
  await del(IDENTITY_KEY)
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  return new Promise((resolve) => {
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve()
  })
}

export async function saveGroupKey(chatId: string, key: Uint8Array): Promise<void> {
  await put(`${GROUP_KEYS_PREFIX}${chatId}`, Array.from(key))
}

export async function loadGroupKey(chatId: string): Promise<Uint8Array | null> {
  const arr = await get<number[]>(`${GROUP_KEYS_PREFIX}${chatId}`)
  if (!arr) return null
  return new Uint8Array(arr)
}

export async function hasGroupKey(chatId: string): Promise<boolean> {
  const arr = await get<number[]>(`${GROUP_KEYS_PREFIX}${chatId}`)
  return arr !== null
}
