

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
  mac?: string
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

// HKDF-SHA256 for key derivation (RFC 5869)
async function deriveEncryptionKey(sharedSecret: Uint8Array, context: string = 'cryptalk-message'): Promise<Uint8Array> {
  await ensureReady()
  // HKDF-Extract: PRK = HMAC-SHA256(salt, IKM)
  // Standard default salt is hash-length of zeros
  const salt = new Uint8Array(32)
  const prk = sodium.crypto_auth_hmacsha256(sharedSecret, salt)

  // HKDF-Expand: OKM = HMAC-SHA256(PRK, info | 0x01)
  const info = toUTF8(context)
  const infoWithCounter = new Uint8Array(info.length + 1)
  infoWithCounter.set(info, 0)
  infoWithCounter.set([1], info.length)

  const okm = sodium.crypto_auth_hmacsha256(infoWithCounter, prk)
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

  // ChaCha20-Poly1305 IETF uses a 12-byte nonce
  const nonce = sodium.randombytes_buf(12)
  const plaintextBytes = toUTF8(plaintext)
  
  // Encrypt with ChaCha20-Poly1305 (returns ciphertext + 16-byte Poly1305 MAC appended)
  const encrypted = sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
    plaintextBytes,
    null, // no additional authenticated data
    null, // no secret nonce
    nonce,
    encryptionKey
  )
  
  const ciphertext = encrypted.subarray(0, encrypted.length - 16)
  const mac = encrypted.subarray(encrypted.length - 16)

  // clear sensitive memory
  ephemeralKeyPair.privateKey.fill(0)
  sharedSecret.fill(0)
  encryptionKey.fill(0)

  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    mac: toBase64(mac),
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
  const mac = payload.mac ? fromBase64(payload.mac) : new Uint8Array(16)

  // Re-combine ciphertext and MAC for libsodium input
  const combined = new Uint8Array(ciphertext.length + mac.length)
  combined.set(ciphertext, 0)
  combined.set(mac, ciphertext.length)

  try {
    const plaintextBytes = sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
      null,
      combined,
      null,
      nonce,
      encryptionKey
    )
    const plaintext = fromUTF8(plaintextBytes)

    sharedSecret.fill(0)
    encryptionKey.fill(0)

    return plaintext
  } catch (e) {
    sharedSecret.fill(0)
    encryptionKey.fill(0)
    throw new Error('Decryption failed — message may have been tampered with')
  }
}

// group encryption

export async function encryptGroupMessage(
  plaintext: string,
  groupKey: Uint8Array
): Promise<{ ciphertext: string; nonce: string; mac: string }> {
  await ensureReady()
  const nonce = sodium.randombytes_buf(12) // 12-byte nonce for standard IETF ChaCha20-Poly1305
  const encrypted = sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
    toUTF8(plaintext),
    null,
    null,
    nonce,
    groupKey
  )
  const ciphertext = encrypted.subarray(0, encrypted.length - 16)
  const mac = encrypted.subarray(encrypted.length - 16)
  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    mac: toBase64(mac),
  }
}

export async function decryptGroupMessage(
  ciphertext: string,
  nonce: string,
  mac: string,
  groupKey: Uint8Array
): Promise<string> {
  await ensureReady()
  const ciphertextBytes = fromBase64(ciphertext)
  const macBytes = fromBase64(mac)
  const combined = new Uint8Array(ciphertextBytes.length + macBytes.length)
  combined.set(ciphertextBytes, 0)
  combined.set(macBytes, ciphertextBytes.length)

  const plaintextBytes = sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
    null,
    combined,
    null,
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
  const hash = sodium.crypto_generichash(30, fromBase64(publicKeyBase64), null)
  const num = BigInt('0x' + sodium.to_hex(hash).slice(0, 15))
  return num.toString().padStart(12, '0').replace(/(\d{3})/g, '$1 ').trim()
}
