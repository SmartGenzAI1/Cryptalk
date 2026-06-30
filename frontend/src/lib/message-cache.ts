

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

// AES-GCM helper functions for cache encryption
async function getCacheKey(privateKeyBytes: Uint8Array): Promise<CryptoKey> {
  const cryptoObj = (typeof window !== 'undefined' ? window.crypto : (await import('crypto')).webcrypto) as any
  const baseKey = await cryptoObj.subtle.importKey(
    'raw',
    privateKeyBytes,
    'HKDF',
    false,
    ['deriveKey']
  )
  return cryptoObj.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode('cryptalk-local-db-cache'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptData(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const cryptoObj = (typeof window !== 'undefined' ? window.crypto : (await import('crypto')).webcrypto) as any
  const iv = cryptoObj.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const encrypted = await cryptoObj.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )
  
  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer),
  }
}

async function decryptData(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
  const cryptoObj = (typeof window !== 'undefined' ? window.crypto : (await import('crypto')).webcrypto) as any
  
  const base64ToArrayBuffer = (base64: string) => {
    const binary = atob(base64)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  const decrypted = await cryptoObj.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(base64ToArrayBuffer(iv)) },
    key,
    base64ToArrayBuffer(ciphertext)
  )
  return new TextDecoder().decode(decrypted)
}

// cache messages for a chat (replaces existing). keeps last MAX_CACHED_PER_CHAT.
export async function cacheMessages(chatId: string, messages: any[]): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    const { loadIdentityKey } = await import('./key-store')
    const identityKey = await loadIdentityKey()
    
    let cacheKey: CryptoKey | null = null
    if (identityKey?.encryption?.privateKey) {
      cacheKey = await getCacheKey(identityKey.encryption.privateKey)
    }

    const toCache = messages.slice(-MAX_CACHED_PER_CHAT)
    for (const msg of toCache) {
      if (cacheKey) {
        try {
          const payloadStr = JSON.stringify(msg)
          const encrypted = await encryptData(payloadStr, cacheKey)
          store.put({
            id: msg.id,
            chatId,
            createdAt: msg.createdAt,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            encrypted: true,
          })
        } catch (err) {
          console.warn('Failed to encrypt message for caching:', err)
          store.put({ ...msg, chatId })
        }
      } else {
        store.put({ ...msg, chatId })
      }
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

    const { loadIdentityKey } = await import('./key-store')
    const identityKey = await loadIdentityKey()
    
    let cacheKey: CryptoKey | null = null
    if (identityKey?.encryption?.privateKey) {
      cacheKey = await getCacheKey(identityKey.encryption.privateKey)
    }

    return new Promise((resolve) => {
      const req = index.getAll(chatId)
      req.onsuccess = async () => {
        const result = req.result as any[]
        const decryptedList: any[] = []
        for (const item of result) {
          if (item.encrypted && cacheKey) {
            try {
              const decryptedStr = await decryptData(item.ciphertext, item.iv, cacheKey)
              const msg = JSON.parse(decryptedStr)
              decryptedList.push(msg)
            } catch (err) {
              console.warn('Failed to decrypt cached message, skipping:', err)
            }
          } else {
            // plaintext fallback for backward compatibility
            decryptedList.push(item)
          }
        }
        const sorted = decryptedList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
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
        const matches = req.result as any[]
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
