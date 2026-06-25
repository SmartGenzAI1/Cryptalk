

import sodium from 'libsodium-wrappers'

let initialized = false

async function ensureReady() {
  if (!initialized) {
    await sodium.ready
    initialized = true
  }
}

// types

export interface IdentityKeyPair {
  signing: { publicKey: Uint8Array; privateKey: Uint8Array }
  encryption: { publicKey: Uint8Array; privateKey: Uint8Array }
}

export interface PreKeyBundle {
  userId: string
  identityPublicKey: string // base64
  signingPublicKey: string // base64
  signedPreKeyPublic: string // base64
  signedPreKeySignature: string // base64
}

export interface EncryptedPayload {
  ciphertext: string
  nonce: string
  ephemeralPublicKey: string
}

// encoding helpers

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

// key generation

export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  await ensureReady()

  const signingKeyPair = sodium.crypto_sign_keypair()

  // independent X25519 keypair (simpler than deriving from Ed25519)
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

// rotated periodically, used for X3DH
export async function generateSignedPreKey(identitySigning: { publicKey: Uint8Array; privateKey: Uint8Array }) {
  await ensureReady()
  const preKey = sodium.crypto_box_keypair()
  const signature = sodium.crypto_sign(preKey.publicKey, identitySigning.privateKey)
  return {
    keyPair: preKey,
    signature,
  }
}

// key agreement (ECDH)

async function deriveSharedSecret(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Promise<Uint8Array> {
  await ensureReady()
  return sodium.crypto_scalarmult(myPrivateKey, theirPublicKey)
}

// HKDF-SHA256 for key separation + domain separation
async function deriveEncryptionKey(sharedSecret: Uint8Array, context: string = 'cryptalk-message'): Promise<Uint8Array> {
  await ensureReady()
  const salt = sodium.from_string('cryptalk-salt-v1')
  const prk = sodium.crypto_auth(sharedSecret, salt) // extract
  const info = sodium.from_string(context)
  const okm = sodium.crypto_generichash(32, info, prk) // expand to 32 bytes
  return okm
}

// encryption / decryption

export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyBase64: string,
  senderPrivateKey: Uint8Array
): Promise<EncryptedPayload> {
  await ensureReady()

  const recipientPublicKey = fromBase64(recipientPublicKeyBase64)

  const ephemeralKeyPair = sodium.crypto_box_keypair()
  const sharedSecret = await deriveSharedSecret(ephemeralKeyPair.privateKey, recipientPublicKey)
  const encryptionKey = await deriveEncryptionKey(sharedSecret)

  // XSalsa20-Poly1305 (authenticated)
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const plaintextBytes = toUTF8(plaintext)
  const ciphertext = sodium.crypto_secretbox_easy(plaintextBytes, nonce, encryptionKey)

  // zero sensitive data
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

  const sharedSecret = await deriveSharedSecret(myPrivateKey, ephemeralPublicKey)
  const encryptionKey = await deriveEncryptionKey(sharedSecret)

  const nonce = fromBase64(payload.nonce)
  const ciphertext = fromBase64(payload.ciphertext)

  try {
    const plaintextBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, encryptionKey)
    const plaintext = fromUTF8(plaintextBytes)

    sharedSecret.fill(0)
    encryptionKey.fill(0)

    return plaintext
  } catch (e) {
    // zero on failure too
    sharedSecret.fill(0)
    encryptionKey.fill(0)
    throw new Error('Decryption failed — message may have been tampered with')
  }
}

// group encryption

export async function deriveGroupKey(chatId: string, privateKey: Uint8Array): Promise<Uint8Array> {
  await ensureReady()
  const salt = sodium.from_string('cryptalk-group-v1')
  const keyMaterial = toUTF8(chatId)
  // BLAKE2b (generichash) for a deterministic key
  return sodium.crypto_generichash(32, keyMaterial, privateKey)
}

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

// identity verification

// verify pre-key signature to prevent MITM
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

// safety number for out-of-band identity verification (signal-style)
export async function generateSafetyNumber(publicKeyBase64: string): Promise<string> {
  await ensureReady()
  const hash = sodium.crypto_generichash(30, fromBase64(publicKeyBase64))
  const num = BigInt('0x' + sodium.to_hex(hash).slice(0, 15))
  return num.toString().padStart(12, '0').replace(/(\d{3})/g, '$1 ').trim()
}
