

const DB_NAME = 'cryptalk-cache'
const STORE_NAME = 'messages'
const DB_VERSION = 2
const MAX_CACHED_PER_CHAT = 1000

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      let store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      } else {
        store = request.transaction!.objectStore(STORE_NAME)
      }
      if (!store.indexNames.contains('chatId')) {
        store.createIndex('chatId', 'chatId', { unique: false })
      }
    }
  })
  return dbPromise
}

interface CachedMessage {
  id: string
  chatId: string
  content: string
  type: string
  senderId: string
  createdAt: string
  [key: string]: any
}

// cache messages for a chat (replaces existing). keeps last MAX_CACHED_PER_CHAT.
export async function cacheMessages(chatId: string, messages: any[]): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    const allKeys = await new Promise<IDBValidKey[]>((resolve) => {
      const req = store.getAllKeys()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve([])
    })

    const toCache = messages.slice(-MAX_CACHED_PER_CHAT)
    for (const msg of toCache) {
      store.put({ ...msg, chatId })
    }

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch (e) {
    console.warn('Failed to cache messages:', e)
  }
}

// load cached messages instantly from IndexedDB (no network)
export async function loadCachedMessages(chatId: string): Promise<any[]> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('chatId')

    return new Promise((resolve) => {
      const req = index.getAll(chatId)
      req.onsuccess = () => {
        const result = req.result as CachedMessage[]
        const sorted = result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        resolve(sorted)
      }
      req.onerror = () => resolve([])
    })
  } catch (e) {
    console.warn('Failed to load cached messages:', e)
    return []
  }
}

// clear cached messages for one chat (or all if no chatId)
export async function clearChatCache(chatId?: string): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    if (chatId) {
      const index = store.index('chatId')
      const req = index.getAll(chatId)
      req.onsuccess = () => {
        const matches = req.result as CachedMessage[]
        for (const msg of matches) {
          store.delete(msg.id)
        }
      }
    } else {
      store.clear()
    }
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve()
    })
  } catch (e) {
    console.warn('Failed to clear cache:', e)
  }
}
