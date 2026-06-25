'use client'

// E2EE file attachment helpers. Upload flow:
//   1. read File as base64 data URL
//   2. encrypt that data URL string with encryptMessageForChat → JSON ciphertext
//   3. UTF-8 encode the ciphertext string to bytes (encryptFileForUpload) and POST to /api/uploads
//   4. dev fallback (no supabase): sender embeds the ciphertext directly in message.content
//   5. supabase path: sender encrypts the returned URL string and stores that in message.content
// Recipient: decrypt message.content → URL (supabase) or data: URL (fallback) or "[delivered]".
// For http(s) URLs call fetchAndDecryptAttachment which fetches bytes, UTF-8 decodes back to JSON ciphertext,
// then decrypts. The natural inverse of step 3's TextEncoder.encode is TextDecoder.decode, NOT base64.

import { encryptMessageForChat, decryptMessageForChat } from './e2ee'

// returns UTF-8 bytes of the JSON ciphertext string; server stores these verbatim and can't read plaintext
export async function encryptFileForUpload(
  dataUrl: string,
  chatId: string,
  chatType: string,
  recipientUserId?: string,
): Promise<Uint8Array> {
  const ciphertext = await encryptMessageForChat(dataUrl, chatId, chatType, recipientUserId)
  // ciphertext is ASCII-safe (base64 + JSON), UTF-8 encoding is lossless
  return new TextEncoder().encode(ciphertext)
}

// in-memory cache so re-renders of the same message don't refetch + decrypt
const attachmentCache = new Map<string, Promise<string>>()

// fetch + decode + decrypt; cached so repeated renders don't refetch
export async function fetchAndDecryptAttachment(
  url: string,
  chatId: string,
  chatType: string,
): Promise<string> {
  const cacheKey = `${chatId}::${chatType}::${url}`
  const existing = attachmentCache.get(cacheKey)
  if (existing) return existing

  const p = (async () => {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Attachment fetch failed (HTTP ${res.status})`)
    }
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    // inverse of encryptFileForUpload's TextEncoder step
    const ciphertextJson = new TextDecoder().decode(bytes)
    return await decryptMessageForChat(ciphertextJson, chatId, chatType)
  })()

  attachmentCache.set(cacheKey, p)

  // evict on failure so a future render can retry
  p.catch(() => {
    attachmentCache.delete(cacheKey)
  })

  return p
}

export function clearAttachmentCache(): void {
  attachmentCache.clear()
}
