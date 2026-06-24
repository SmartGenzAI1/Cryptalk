

import {
  generateIdentityKeyPair,
  generateSignedPreKey,
  encryptMessage,
  decryptMessage,
  deriveGroupKey,
  encryptGroupMessage,
  decryptGroupMessage,
  toBase64,
  type EncryptedPayload,
} from './crypto'
import {
  hasIdentityKey,
  saveIdentityKey,
  loadIdentityKey,
  saveGroupKey,
  loadGroupKey,
  hasGroupKey,
  clearAllKeys,
  type IdentityKeyPair,
} from './key-store'
import { apiGet, apiPost } from './api'

export interface E2EEStatus {
  /** Does this device have identity keys? */
  hasLocalKeys: boolean
  /** Has the server received our public keys? */
  hasServerKeys: boolean
  /** Is E2EE fully active for this user? */
  isE2EEEnabled: boolean
}

/**
 * Initialize E2EE for the current user.
 * Called on app load — generates keys if needed and syncs with server.
 */
export async function initE2EE(userId: string): Promise<E2EEStatus> {
  // 1. Check for local identity keys
  let identityKey = await loadIdentityKey()
  let hasLocal = identityKey !== null

  // 2. If no local keys, generate them
  if (!identityKey) {
    identityKey = await generateIdentityKeyPair()
    await saveIdentityKey(identityKey)
    hasLocal = true
  }

  // 3. Check server key status
  const serverStatus = await apiGet<{ has_keys: boolean }>('/api/keys/status/me').catch(() => ({ has_keys: false }))

  // 4. If server doesn't have our keys, upload them
  let keysUploaded = serverStatus.has_keys
  if (!keysUploaded && identityKey) {
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

/**
 * Encrypt a message for a direct (1:1) chat.
 * Fetches the recipient's public key from the server and encrypts.
 */
export async function encryptDirectMessage(
  plaintext: string,
  recipientUserId: string
): Promise<string> {
  const identityKey = await loadIdentityKey()
  if (!identityKey) throw new Error('No identity key — run initE2EE first')

  // Fetch recipient's public keys
  const recipientKeys = await apiGet<{ identity_public_key: string | null }>(
    `/api/keys/${recipientUserId}`
  )
  if (!recipientKeys.identity_public_key) {
    throw new Error('Recipient has not set up E2EE yet')
  }

  // Encrypt
  const payload = await encryptMessage(
    plaintext,
    recipientKeys.identity_public_key,
    identityKey.encryption.privateKey
  )

  // Return as JSON string — stored in message.content
  return JSON.stringify(payload)
}

/**
 * Decrypt a direct message.
 * Uses the local private key — the server cannot do this.
 */
export async function decryptDirectMessage(
  encryptedContent: string
): Promise<string> {
  const identityKey = await loadIdentityKey()
  if (!identityKey) throw new Error('No identity key — cannot decrypt')

  // Handle legacy plaintext messages (before E2EE was enabled)
  try {
    const payload = JSON.parse(encryptedContent) as EncryptedPayload
    if (!payload.ciphertext || !payload.nonce || !payload.ephemeralPublicKey) {
      // Not an encrypted payload — return as-is (legacy message)
      return encryptedContent
    }
    return await decryptMessage(payload, identityKey.encryption.privateKey)
  } catch (e: any) {
    if (e.message?.includes('Decryption failed')) throw e
    // JSON parse failed — it's a legacy plaintext message
    return encryptedContent
  }
}

/**
 * Encrypt a message for a group chat.
 * Uses a per-chat shared key derived from the chat ID.
 */
export async function encryptGroupMessageForChat(
  plaintext: string,
  chatId: string
): Promise<string> {
  const identityKey = await loadIdentityKey()
  if (!identityKey) throw new Error('No identity key — run initE2EE first')

  // Get or derive the group key
  let groupKey = await loadGroupKey(chatId)
  if (!groupKey) {
    groupKey = await deriveGroupKey(chatId, identityKey.encryption.privateKey)
    await saveGroupKey(chatId, groupKey)
  }

  const payload = await encryptGroupMessage(plaintext, groupKey)
  return JSON.stringify({ ...payload, type: 'group' })
}

/**
 * Decrypt a group message.
 */
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

    let groupKey = await loadGroupKey(chatId)
    if (!groupKey) {
      groupKey = await deriveGroupKey(chatId, identityKey.encryption.privateKey)
      await saveGroupKey(chatId, groupKey)
    }

    return await decryptGroupMessage(payload.ciphertext, payload.nonce, groupKey)
  } catch (e: any) {
    if (e.message?.includes('Decryption failed')) throw e
    return encryptedContent // legacy plaintext
  }
}

/**
 * Encrypt a message — automatically detects direct vs group chat.
 */
export async function encryptMessageForChat(
  plaintext: string,
  chatId: string,
  chatType: string,
  recipientUserId?: string
): Promise<string> {
  // Saved messages and channels don't need E2EE (only you can see them)
  if (chatType === 'saved') return plaintext

  if (chatType === 'direct' && recipientUserId) {
    return encryptDirectMessage(plaintext, recipientUserId)
  }

  // Group / channel: use group encryption
  return encryptGroupMessageForChat(plaintext, chatId)
}

/**
 * Decrypt a message — automatically detects direct vs group.
 */
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

/**
 * Check if a message appears to be encrypted.
 */
export function isEncrypted(content: string): boolean {
  try {
    const parsed = JSON.parse(content)
    return !!(parsed.ciphertext && parsed.nonce)
  } catch {
    return false
  }
}

/**
 * Clear all E2EE keys (on logout or account deletion).
 * This makes all past messages permanently undecryptable.
 */
export async function destroyAllKeys(): Promise<void> {
  await clearAllKeys()
}
