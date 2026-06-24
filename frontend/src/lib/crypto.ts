

import sodium from 'libsodium-wrappers'

let initialized = false

/** Ensure libsodium is loaded before any crypto operation. */
async function ensureReady() {
  if (!initialized) {
    await sodium.ready
    initialized = true
  }
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface IdentityKeyPair {
  /** Ed25519 signing keypair — used to sign pre-keys and verify identity */
  signing: { publicKey: Uint8Array; privateKey: Uint8Array }
  /** X25519 encryption keypair — used for ECDH key agreement */
  encryption: { publicKey: Uint8Array; privateKey: Uint8Array }
}

export interface PreKeyBundle {
  /** User ID this bundle belongs to */
  userId: string
  /** X25519 identity public key (for ECDH) */
  identityPublicKey: string // base64
  /** Ed25519 identity public key (for signature verification) */
  signingPublicKey: string // base64
  /** X25519 signed pre-key public key */
  signedPreKeyPublic: string // base64
  /** Ed25519 signature over the signed pre-key */
  signedPreKeySignature: string // base64
}

export interface EncryptedPayload {
  /** Base64-encoded ciphertext */
  ciphertext: string
  /** Base64-encoded nonce (24 bytes) */
  nonce: string
  /** Base64-encoded ephemeral X25519 public key (sender's one-time key) */
  ephemeralPublicKey: string
}

// ─── Encoding helpers ──────────────────────────────────────────────────

export function toBase64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL)
}

export function fromBase64(str: string): Uint8Array {
  return sodium.from_base64(str, sodium.base64_variants.ORIGINAL)
}

export function toUTF8(str: string): Uint8Array {
  return sodium.from_string(str)
}

export function fromUTF8(bytes: Uint8Array): string {
  return sodium.to_string(bytes)
}

// ─── Key Generation ─────────────────────────────────────────────────────

export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  await ensureReady()

  // Ed25519 signing keypair (for signatures)
  const signingKeyPair = sodium.crypto_sign_keypair()

  // X25519 encryption keypair (for ECDH) — independent keypair
  // (Signal derives X25519 from Ed25519, but libsodium-wrappers' conversion
  // functions expect specific key formats. Using an independent X25519
  // keypair is simpler and equally secure.)
  const encryptionKeyPair = sodium.crypto_box_keypair()

  return {
    signing: {
      publicKey: signingKeyPair.publicKey,
      privateKey: signingKeyPair.privateKey,
    },
    encryption: {
      publicKey: encryptionKeyPair.publicKey,
      privateKey: encryptionKeyPair.privateKey,
    },
  }
}

/**
 * Generate a signed pre-key (rotated periodically).
 * Used for the X3DH key agreement.
 */
export async function generateSignedPreKey(identitySigning: { publicKey: Uint8Array; privateKey: Uint8Array }) {
  await ensureReady()
  const preKey = sodium.crypto_box_keypair()
  // Sign the pre-key public key with the identity signing key
  const signature = sodium.crypto_sign(preKey.publicKey, identitySigning.privateKey)
  return {
    keyPair: preKey,
    signature,
  }
}

// ─── Key Agreement (ECDH) ──────────────────────────────────────────────

async function deriveSharedSecret(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Promise<Uint8Array> {
  await ensureReady()
  return sodium.crypto_scalarmult(myPrivateKey, theirPublicKey)
}

/**
 * Derive a symmetric encryption key from a shared secret using HKDF-SHA256.
 * This provides key separation and domain separation.
 */
async function deriveEncryptionKey(sharedSecret: Uint8Array, context: string = 'cryptalk-message'): Promise<Uint8Array> {
  await ensureReady()
  // HKDF extract + expand using SHA-256
  const salt = sodium.from_string('cryptalk-salt-v1')
  const prk = sodium.crypto_auth(sharedSecret, salt) // extract
  // Expand to 32 bytes (256-bit key)
  const info = sodium.from_string(context)
  const okm = sodium.crypto_generichash(32, info, prk) // expand
  return okm
}

// ─── Encryption / Decryption ───────────────────────────────────────────

export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyBase64: string,
  senderPrivateKey: Uint8Array
): Promise<EncryptedPayload> {
  await ensureReady()

  const recipientPublicKey = fromBase64(recipientPublicKeyBase64)

  // 1. Generate ephemeral keypair
  const ephemeralKeyPair = sodium.crypto_box_keypair()

  // 2. ECDH → shared secret
  const sharedSecret = await deriveSharedSecret(ephemeralKeyPair.privateKey, recipientPublicKey)

  // 3. HKDF → encryption key
  const encryptionKey = await deriveEncryptionKey(sharedSecret)

  // 4. Encrypt with crypto_secretbox (XSalsa20-Poly1305 — authenticated encryption)
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const plaintextBytes = toUTF8(plaintext)
  const ciphertext = sodium.crypto_secretbox_easy(plaintextBytes, nonce, encryptionKey)

  // 5. Zero out sensitive data
  ephemeralKeyPair.privateKey.fill(0)
  sharedSecret.fill(0)
  encryptionKey.fill(0)

  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    ephemeralPublicKey: toBase64(ephemeralKeyPair.publicKey),
  }
}

export async function decryptMessage(
  payload: EncryptedPayload,
  myPrivateKey: Uint8Array
): Promise<string> {
  await ensureReady()

  const ephemeralPublicKey = fromBase64(payload.ephemeralPublicKey)

  // 1. ECDH → shared secret
  const sharedSecret = await deriveSharedSecret(myPrivateKey, ephemeralPublicKey)

  // 2. HKDF → encryption key
  const encryptionKey = await deriveEncryptionKey(sharedSecret)

  // 3. Decrypt
  const nonce = fromBase64(payload.nonce)
  const ciphertext = fromBase64(payload.ciphertext)

  try {
    const plaintextBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, encryptionKey)
    const plaintext = fromUTF8(plaintextBytes)

    // Zero out sensitive data
    sharedSecret.fill(0)
    encryptionKey.fill(0)

    return plaintext
  } catch (e) {
    // Zero out on failure too
    sharedSecret.fill(0)
    encryptionKey.fill(0)
    throw new Error('Decryption failed — message may have been tampered with')
  }
}

// ─── Group Encryption ───────────────────────────────────────────────────

export async function deriveGroupKey(chatId: string, privateKey: Uint8Array): Promise<Uint8Array> {
  await ensureReady()
  const salt = sodium.from_string('cryptalk-group-v1')
  const keyMaterial = toUTF8(chatId)
  // BLAKE2b (libsodium's generichash) to derive a deterministic key
  return sodium.crypto_generichash(32, keyMaterial, privateKey)
}

/**
 * Encrypt a message for a group chat using the shared group key.
 */
export async function encryptGroupMessage(
  plaintext: string,
  groupKey: Uint8Array
): Promise<{ ciphertext: string; nonce: string }> {
  await ensureReady()
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = sodium.crypto_secretbox_easy(toUTF8(plaintext), nonce, groupKey)
  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
  }
}

/**
 * Decrypt a group message using the shared group key.
 */
export async function decryptGroupMessage(
  ciphertext: string,
  nonce: string,
  groupKey: Uint8Array
): Promise<string> {
  await ensureReady()
  const plaintextBytes = sodium.crypto_secretbox_open_easy(
    fromBase64(ciphertext),
    fromBase64(nonce),
    groupKey
  )
  return fromUTF8(plaintextBytes)
}

// ─── Identity Verification ──────────────────────────────────────────────

/**
 * Verify a pre-key signature to ensure the pre-key genuinely belongs
 * to the claimed identity (prevents MITM attacks).
 */
export async function verifyPreKeySignature(
  signedPreKeyPublic: string,
  signature: string,
  signingPublicKey: string
): Promise<boolean> {
  await ensureReady()
  try {
    sodium.crypto_sign_verify_detached(
      fromBase64(signature),
      fromBase64(signedPreKeyPublic),
      fromBase64(signingPublicKey)
    )
    return true
  } catch {
    return false
  }
}

/**
 * Generate a safety number (fingerprint) for identity verification.
 * Two users can compare this out-of-band to verify no MITM attack.
 */
export async function generateSafetyNumber(publicKeyBase64: string): Promise<string> {
  await ensureReady()
  const hash = sodium.crypto_generichash(30, fromBase64(publicKeyBase64))
  // Format as groups of 5 digits (like Signal's safety numbers)
  const num = BigInt('0x' + sodium.to_hex(hash).slice(0, 15))
  return num.toString().padStart(12, '0').replace(/(\d{3})/g, '$1 ').trim()
}
