

import {
  generateIdentityKeyPair,
  generateSignedPreKey,
  encryptMessage,
  decryptMessage,
  encryptGroupMessage,
  decryptGroupMessage,
  toBase64,
  fromBase64,
  type EncryptedPayload,
  type IdentityKeyPair,
} from './crypto'
import {
  hasIdentityKey,
  saveIdentityKey,
  loadIdentityKey,
  saveGroupKey,
  loadGroupKey,
  hasGroupKey,
  clearAllKeys,
} from './key-store'
import { apiGet, apiPost } from './api'

export interface E2EEStatus {
  hasLocalKeys: boolean
  hasServerKeys: boolean
  isE2EEEnabled: boolean
}

// generate keys if needed and sync with server (called on app load)
export async function initE2EE(userId: string): Promise<E2EEStatus> {
  let identityKey = await loadIdentityKey()
  let hasLocal = identityKey !== null
  let forceUpload = false

  if (!identityKey) {
    identityKey = await generateIdentityKeyPair()
    await saveIdentityKey(identityKey)
    hasLocal = true
    forceUpload = true
  }

  const serverStatus = await apiGet<{ has_keys: boolean }>('/api/keys/status/me').catch(() => ({ has_keys: false }))

  let keysUploaded = serverStatus.has_keys
  if ((!keysUploaded || forceUpload) && identityKey) {
    try {
      const signedPreKey = await generateSignedPreKey(identityKey.signing)
      await apiPost('/api/keys/upload', {
        identity_public_key: toBase64(identityKey.encryption.publicKey),
        signing_public_key: toBase64(identityKey.signing.publicKey),
        signed_prekey_public: toBase64(signedPreKey.keyPair.publicKey),
        signed_prekey_signature: toBase64(signedPreKey.signature),
      })
      keysUploaded = true
    } catch (e) {
      console.warn('Failed to upload E2EE keys:', e)
    }
  }

  return {
    hasLocalKeys: hasLocal,
    hasServerKeys: keysUploaded,
    isE2EEEnabled: hasLocal && keysUploaded,
  }
}

// fetch recipient's pubkey and encrypt
export async function encryptDirectMessage(
  plaintext: string,
  recipientUserId: string
): Promise<string> {
  const identityKey = await loadIdentityKey()
  if (!identityKey) throw new Error('No identity key — run initE2EE first')

  const recipientKeys = await apiGet<{ identity_public_key: string | null }>(
    `/api/keys/${recipientUserId}`
  )
  if (!recipientKeys.identity_public_key) {
    throw new Error('Recipient has not set up E2EE yet')
  }

  const payload = await encryptMessage(
    plaintext,
    recipientKeys.identity_public_key,
    identityKey.encryption.privateKey
  )

  // stored as JSON string in message.content
  return JSON.stringify(payload)
}

// local private key only — server can't decrypt
export async function decryptDirectMessage(
  encryptedContent: string
): Promise<string> {
  const identityKey = await loadIdentityKey()
  if (!identityKey) throw new Error('No identity key — cannot decrypt')

  // legacy plaintext fallback (pre-E2EE messages)
  try {
    const payload = JSON.parse(encryptedContent) as EncryptedPayload
    if (!payload.ciphertext || !payload.nonce || !payload.ephemeralPublicKey) {
      return encryptedContent
    }
    return await decryptMessage(payload, identityKey.encryption.privateKey)
  } catch (e: any) {
    if (e.message?.includes('Decryption failed')) throw e
    return encryptedContent
  }
}

// shared symmetric group key encryption using group key from local key store
export async function encryptGroupMessageForChat(
  plaintext: string,
  chatId: string
): Promise<string> {
  const identityKey = await loadIdentityKey()
  if (!identityKey) throw new Error('No identity key — run initE2EE first')

  const groupKey = await loadGroupKey(chatId)
  if (!groupKey) {
    throw new Error('Group key not found — chat key must be decrypted first')
  }

  const payload = await encryptGroupMessage(plaintext, groupKey)
  return JSON.stringify({ ...payload, type: 'group' })
}

export async function decryptGroupMessageForChat(
  encryptedContent: string,
  chatId: string
): Promise<string> {
  const identityKey = await loadIdentityKey()
  if (!identityKey) throw new Error('No identity key — cannot decrypt')

  try {
    const payload = JSON.parse(encryptedContent)
    if (!payload.ciphertext || !payload.nonce) {
      return encryptedContent // legacy plaintext
    }

    const groupKey = await loadGroupKey(chatId)
    if (!groupKey) {
      return encryptedContent // legacy fallback if key is missing locally
    }

    // Pass ciphertext, nonce, and mac (defaulting to empty mac if missing)
    return await decryptGroupMessage(
      payload.ciphertext,
      payload.nonce,
      payload.mac || '',
      groupKey
    )
  } catch (e: any) {
    if (e.message?.includes('Decryption failed')) throw e
    return encryptedContent // legacy plaintext
  }
}

// Decrypts group chat keys using our private key and saves them to local IndexedDB
export async function decryptAndStoreChatKeys(chats: any[]): Promise<void> {
  const identityKey = await loadIdentityKey()
  if (!identityKey) return

  for (const chat of chats) {
    if (chat.chatKey && chat.type !== 'direct' && chat.type !== 'saved') {
      try {
        const hasKey = await hasGroupKey(chat.id)
        if (!hasKey) {
          // The chatKey was encrypted by the creator using our public key
          const decryptedKeyBase64 = await decryptDirectMessage(chat.chatKey)
          const groupKeyBytes = fromBase64(decryptedKeyBase64)
          await saveGroupKey(chat.id, groupKeyBytes)
        }
      } catch (e) {
        console.warn(`Failed to decrypt/store group key for chat ${chat.id}:`, e)
      }
    }
  }
}

// dispatch on chat type
export async function encryptMessageForChat(
  plaintext: string,
  chatId: string,
  chatType: string,
  recipientUserId?: string
): Promise<string> {
  // saved messages are local-only, skip e2ee
  if (chatType === 'saved') return plaintext

  if (chatType === 'direct' && recipientUserId) {
    return encryptDirectMessage(plaintext, recipientUserId)
  }

  return encryptGroupMessageForChat(plaintext, chatId)
}

// dispatch on chat type
export async function decryptMessageForChat(
  encryptedContent: string,
  chatId: string,
  chatType: string
): Promise<string> {
  if (chatType === 'saved') return encryptedContent

  if (chatType === 'direct') {
    return decryptDirectMessage(encryptedContent)
  }

  return decryptGroupMessageForChat(encryptedContent, chatId)
}

export function isEncrypted(content: string): boolean {
  try {
    const parsed = JSON.parse(content)
    return !!(parsed.ciphertext && parsed.nonce)
  } catch {
    return false
  }
}

// wipes all local keys — past messages become permanently undecryptable
export async function destroyAllKeys(): Promise<void> {
  await clearAllKeys()
}
