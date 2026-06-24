'use client'

/**
 * E2EE file attachment helpers.
 *
 * Flow:
 *   1. Sender reads a File into a base64 data URL.
 *   2. Encrypt that data URL string with `encryptMessageForChat` → JSON ciphertext string.
 *   3. `encryptFileForUpload` UTF-8 encodes that JSON string to bytes (TextEncoder).
 *      The resulting Uint8Array is uploaded as the multipart `file` body to /api/uploads.
 *   4. If the backend is in dev-fallback mode (no Supabase), the sender embeds the JSON
 *      ciphertext string directly in `message.content` (the legacy base64 behaviour).
 *   5. If the backend stored the bytes in Supabase, the sender encrypts the returned URL
 *      string with `encryptMessageForChat` and stores the resulting ciphertext in
 *      `message.content` (with `attachmentPath` pointing to the Supabase object).
 *
 * Recipient rendering:
 *   - Decrypt `message.content` with `decryptMessageForChat` → either a URL (Supabase) or
 *     a `data:` URL (dev fallback) or the literal string "[delivered]" (after the server
 *     wipes content post-delivery).
 *   - If it's an http(s) URL, call `fetchAndDecryptAttachment(url, chatId, chatType)`:
 *       fetch(url) → arrayBuffer → UTF-8 decode → JSON ciphertext string →
 *       decryptMessageForChat → original data URL.
 *   - If it's a `data:` URL, render directly.
 *
 * Note on encoding: the spec mentioned "arrayBuffer → base64 → decrypt", but the
 * ciphertext produced by `encryptMessageForChat` is a JSON string (it is internally
 * `JSON.stringify({ciphertext, nonce, ephemeralPublicKey})`). The natural inverse of
 * step 3's `TextEncoder.encode(jsonString)` is `TextDecoder.decode(bytes) → jsonString`,
 * NOT base64. We therefore UTF-8 decode the bytes and pass the resulting JSON string to
 * `decryptMessageForChat`. This is internally consistent with step 3.
 */

import { encryptMessageForChat, decryptMessageForChat } from './e2ee'

/**
 * Encrypt a base64 data URL for upload. Returns the UTF-8 bytes of the JSON
 * ciphertext string produced by `encryptMessageForChat`.
 *
 * These bytes are what gets POSTed to `/api/uploads` as the multipart `file` body.
 * The server stores them verbatim in Supabase — it can never read the plaintext.
 */
export async function encryptFileForUpload(
  dataUrl: string,
  chatId: string,
  chatType: string,
  recipientUserId?: string,
): Promise<Uint8Array> {
  const ciphertext = await encryptMessageForChat(dataUrl, chatId, chatType, recipientUserId)
  // ciphertext is ASCII-safe (base64 + JSON), so UTF-8 encoding is lossless.
  return new TextEncoder().encode(ciphertext)
}

/**
 * In-memory cache of resolved attachments so re-renders / re-mounts of the
 * same message don't trigger another fetch + decrypt round-trip.
 * Keyed by URL.
 */
const attachmentCache = new Map<string, Promise<string>>()

/**
 * Fetch an attachment URL, decode the body to the JSON ciphertext string,
 * and decrypt it with the chat's E2EE key. Returns the original base64 data URL.
 *
 * Results are cached in a module-level Map so repeated renders of the same
 * message don't refetch.
 */
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
    // Inverse of encryptFileForUpload's TextEncoder step.
    const ciphertextJson = new TextDecoder().decode(bytes)
    return await decryptMessageForChat(ciphertextJson, chatId, chatType)
  })()

  attachmentCache.set(cacheKey, p)

  // If fetching/decryption fails, evict the cache entry so a future render can retry.
  p.catch(() => {
    attachmentCache.delete(cacheKey)
  })

  return p
}

/**
 * Clear the attachment cache (e.g., on logout). Mostly for tests / hygiene.
 */
export function clearAttachmentCache(): void {
  attachmentCache.clear()
}
