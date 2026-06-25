import 'dart:convert';
import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_client.dart';

/// End-to-end encryption service for Cryptalk.
///
/// Each device owns three long-lived keypairs and one signature:
///   • X25519 **identity** keypair — used for ECDH key agreement.
///   • Ed25519 **signing** keypair  — used to sign the signed prekey (so other
///     clients can verify that the prekey really belongs to us).
///   • X25519 **signed prekey**     — a second X25519 keypair whose public key
///     is signed by the Ed25519 signing key. Uploaded alongside the identity
///     key so other clients can build a prekey bundle.
///   • The Ed25519 **signature** over the signed prekey public key.
///
/// All private bytes live in `FlutterSecureStorage`; only public bytes + the
/// signature are uploaded to the server (`POST /api/keys/upload`).
///
/// The encrypted message format is a JSON blob:
///   `{ ciphertext, nonce, ephemeralPublicKey, mac }`
/// matching the field names the web client reads (`ciphertext`, `nonce`,
/// `ephemeralPublicKey`). The `mac` field is extra (web ignores unknown
/// fields) and is required by Flutter's Chacha20-Poly1305 decrypt path.
///
/// NOTE on cross-client compat: the web client uses libsodium's
/// `crypto_secretbox_easy` (XSalsa20-Poly1305) with a non-standard HKDF
/// (HMAC-SHA256 extract + BLAKE2b expand). Flutter uses Chacha20-Poly1305 with
/// standard HKDF-SHA256 from the `cryptography` package. The JSON *shape*
/// matches, so the key-exchange layer is now interoperable, but a message
/// encrypted by Flutter cannot yet be decrypted by web (and vice versa) until
/// both sides adopt the same symmetric cipher. Flutter↔Flutter works end-to-end.
/// Switching Flutter to a libsodium binding (`sodium_libs` or similar) is the
/// recommended follow-up — out of scope here because the task says not to add
/// new pubspec dependencies.
class CryptoService {
  static final CryptoService _instance = CryptoService._internal();
  factory CryptoService() => _instance;
  CryptoService._internal();

  final _storage = const FlutterSecureStorage();
  final _api = ApiClient();

  // X25519 identity keypair (for ECDH).
  SimpleKeyPair? _identityKeyPair;
  // Ed25519 signing keypair (for signing the prekey).
  SimpleKeyPair? _signingKeyPair;
  // X25519 signed prekey keypair.
  SimpleKeyPair? _signedPreKeyPair;
  // Ed25519 signature over the signed prekey public key.
  List<int>? _signedPreKeySignature;

  bool _initialized = false;

  /// Cache: userId → recipient public-key bundle. The values are the raw
  /// base64 strings exactly as returned by `/api/keys/{userId}`.
  final Map<String, Map<String, String>> _recipientKeyCache = {};

  bool get isInitialized => _initialized;

  /// Load persisted key material from secure storage, or generate a fresh
  /// identity if none exists. Idempotent.
  Future<void> init() async {
    if (_initialized) return;

    final idPriv = await _storage.read(key: 'x25519_identity_priv');
    final idPub = await _storage.read(key: 'x25519_identity_pub');
    final signPriv = await _storage.read(key: 'ed25519_signing_priv');
    final signPub = await _storage.read(key: 'ed25519_signing_pub');
    final spkPriv = await _storage.read(key: 'x25519_signed_prekey_priv');
    final spkPub = await _storage.read(key: 'x25519_signed_prekey_pub');
    final spkSig = await _storage.read(key: 'signed_prekey_signature');

    if (idPriv != null && idPub != null) {
      _identityKeyPair = SimpleKeyPair(
        SecretKey(base64Decode(idPriv)),
        PublicKey(base64Decode(idPub)),
        type: KeyPairType.x25519,
      );
    }
    if (signPriv != null && signPub != null) {
      _signingKeyPair = SimpleKeyPair(
        SecretKey(base64Decode(signPriv)),
        PublicKey(base64Decode(signPub)),
        type: KeyPairType.ed25519,
      );
    }
    if (spkPriv != null && spkPub != null) {
      _signedPreKeyPair = SimpleKeyPair(
        SecretKey(base64Decode(spkPriv)),
        PublicKey(base64Decode(spkPub)),
        type: KeyPairType.x25519,
      );
    }
    if (spkSig != null) {
      _signedPreKeySignature = base64Decode(spkSig);
    }

    // If any of the three keypairs is missing, regenerate everything to keep
    // them consistent (a partial state should never happen in practice, but
    // this avoids subtle bugs if secure storage was partially wiped).
    if (_identityKeyPair == null ||
        _signingKeyPair == null ||
        _signedPreKeyPair == null ||
        _signedPreKeySignature == null) {
      await generate();
    }
    _initialized = true;
  }

  /// Generate a brand-new identity (X25519 + Ed25519 + signed prekey) and
  /// persist all private bytes to secure storage. Overwrites any existing
  /// keys — call only on first run or explicit reset.
  Future<void> generate() async {
    final x25519 = X25519();
    final ed25519 = Ed25519();

    _identityKeyPair = await x25519.newKeyPair();
    _signingKeyPair = await ed25519.newKeyPair();
    _signedPreKeyPair = await x25519.newKeyPair();

    // Sign the signed prekey's public key with the Ed25519 signing private key.
    final spkPub = await _signedPreKeyPair!.extractPublicKey();
    final spkPubBytes = spkPub.bytes;
    final signature = await ed25519.sign(spkPubBytes, keyPair: _signingKeyPair!);
    _signedPreKeySignature = signature.bytes;

    // Persist everything to secure storage.
    final idPriv = await _identityKeyPair!.extractPrivateKeyBytes();
    final idPub = await _identityKeyPair!.extractPublicKey();
    final signPriv = await _signingKeyPair!.extractPrivateKeyBytes();
    final signPub = await _signingKeyPair!.extractPublicKey();
    final spkPriv = await _signedPreKeyPair!.extractPrivateKeyBytes();

    await _storage.write(key: 'x25519_identity_priv', value: base64Encode(idPriv));
    await _storage.write(key: 'x25519_identity_pub', value: base64Encode(idPub.bytes));
    await _storage.write(key: 'ed25519_signing_priv', value: base64Encode(signPriv));
    await _storage.write(key: 'ed25519_signing_pub', value: base64Encode(signPub.bytes));
    await _storage.write(key: 'x25519_signed_prekey_priv', value: base64Encode(spkPriv));
    await _storage.write(key: 'x25519_signed_prekey_pub', value: base64Encode(spkPubBytes));
    await _storage.write(key: 'signed_prekey_signature', value: base64Encode(_signedPreKeySignature!));

    _initialized = true;
  }

  /// X25519 identity public key (for ECDH) — base64-encoded.
  String get identityPublicKeyBase64 {
    if (_identityKeyPair == null) return '';
    return base64Encode((_identityKeyPair!.publicKey as PublicKey).bytes);
  }

  /// Ed25519 signing public key — base64-encoded.
  String get signingPublicKeyBase64 {
    if (_signingKeyPair == null) return '';
    return base64Encode((_signingKeyPair!.publicKey as PublicKey).bytes);
  }

  /// X25519 signed prekey public key — base64-encoded.
  String get signedPreKeyPublicBase64 {
    if (_signedPreKeyPair == null) return '';
    return base64Encode((_signedPreKeyPair!.publicKey as PublicKey).bytes);
  }

  /// Ed25519 signature over the signed prekey public key — base64-encoded.
  String get signedPreKeySignatureBase64 {
    if (_signedPreKeySignature == null) return '';
    return base64Encode(_signedPreKeySignature!);
  }

  /// Fetch the recipient's public-key bundle from `/api/keys/{userId}` and
  /// return their base64-encoded X25519 identity public key (the one used for
  /// ECDH). Returns null if the recipient hasn't set up E2EE yet or the
  /// request fails. Results are cached in-memory for the session.
  Future<String?> getRecipientPublicKey(String userId) async {
    final cached = _recipientKeyCache[userId];
    if (cached != null) return cached['identityPublicKey'];

    try {
      await _api.init();
      final data = await _api.get('/api/keys/$userId');
      final identityPub = data['identity_public_key']?.toString();
      if (identityPub == null || identityPub.isEmpty) return null;
      _recipientKeyCache[userId] = {
        'identityPublicKey': identityPub,
        if (data['signing_public_key'] != null)
          'signingPublicKey': data['signing_public_key'].toString(),
        if (data['signed_prekey_public'] != null)
          'signedPreKeyPublic': data['signed_prekey_public'].toString(),
        if (data['signed_prekey_signature'] != null)
          'signedPreKeySignature': data['signed_prekey_signature'].toString(),
      };
      return identityPub;
    } catch (e) {
      debugPrint('CryptoService.getRecipientPublicKey($userId) failed: $e');
      return null;
    }
  }

  /// Encrypt [plaintext] for a recipient whose X25519 identity public key is
  /// [recipientPublicKeyB64]. Returns a JSON string with the same field names
  /// the web client reads (`ciphertext`, `nonce`, `ephemeralPublicKey`), plus
  /// an extra `mac` field used by Flutter's Chacha20-Poly1305 decrypt path.
  ///
  /// If the crypto service hasn't been initialized yet (L9 guard), the
  /// plaintext is returned unchanged so the message at least sends rather
  /// than crashing the app.
  Future<String> encrypt(String plaintext, String recipientPublicKeyB64) async {
    if (_identityKeyPair == null || recipientPublicKeyB64.isEmpty) {
      debugPrint('CryptoService.encrypt: not initialized or empty recipient key — sending plaintext');
      return plaintext;
    }

    final x25519 = X25519();
    final chacha = Chacha20Poly1305();
    final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);

    // 1. Per-message ephemeral X25519 keypair.
    final ephemeralPair = await x25519.newKeyPair();
    final recipientPubKey = PublicKey(base64Decode(recipientPublicKeyB64));

    // 2. ECDH(ephemeral_priv, recipient_identity_pub) → shared secret.
    final sharedSecret = await x25519.sharedSecret(
      keyPair: ephemeralPair,
      remotePublicKey: recipientPubKey,
    );
    final sharedBytes = await sharedSecret.extractBytes();

    // 3. HKDF-SHA256 → 32-byte symmetric key.
    final derivedKey = await hkdf.deriveKey(
      SecretKey(sharedBytes),
      nonce: [],
      info: utf8.encode('cryptalk-message'),
    );
    final derivedBytes = await derivedKey.extractBytes();

    // 4. Seal with Chacha20-Poly1305 (AEAD). The package generates the nonce.
    final secretBox = await chacha.seal(
      utf8.encode(plaintext),
      secretKey: SecretKey(derivedBytes),
    );

    final ephemeralPub = await ephemeralPair.extractPublicKey();

    return jsonEncode({
      'ciphertext': base64Encode(secretBox.cipherText),
      'nonce': base64Encode(secretBox.nonce),
      'mac': base64Encode(secretBox.mac.bytes),
      'ephemeralPublicKey': base64Encode(ephemeralPub.bytes),
    });
  }

  /// Decrypt a JSON ciphertext payload produced by [encrypt]. The
  /// [senderPublicKey] parameter is currently unused — the sender's ephemeral
  /// public key is embedded in the payload itself. It's retained for a future
  /// signature-verification extension.
  ///
  /// L9 guard: if `_identityKeyPair` is null (init never ran / failed), the
  /// input is returned unchanged and a warning is logged, so the UI shows the
  /// raw ciphertext instead of crashing on a null-deref.
  Future<String> decrypt(String encryptedJson, [String? senderPublicKey]) async {
    if (_identityKeyPair == null) {
      debugPrint('CryptoService.decrypt: not initialized — returning input unchanged');
      return encryptedJson;
    }
    try {
      final payload = jsonDecode(encryptedJson);
      if (payload['ciphertext'] == null ||
          payload['ephemeralPublicKey'] == null) {
        // Not an encrypted payload — return as-is (legacy plaintext, or a
        // sticker name, or a Saved Messages body that was never encrypted).
        return encryptedJson;
      }

      final x25519 = X25519();
      final chacha = Chacha20Poly1305();
      final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);

      final ephemeralPub = PublicKey(base64Decode(payload['ephemeralPublicKey']));

      // ECDH(my_identity_priv, sender_ephemeral_pub) → same shared secret.
      final sharedSecret = await x25519.sharedSecret(
        keyPair: _identityKeyPair!,
        remotePublicKey: ephemeralPub,
      );
      final sharedBytes = await sharedSecret.extractBytes();

      final derivedKey = await hkdf.deriveKey(
        SecretKey(sharedBytes),
        nonce: [],
        info: utf8.encode('cryptalk-message'),
      );
      final derivedBytes = await derivedKey.extractBytes();

      // Some legacy payloads may not have a `mac` (e.g. plain text). The
      // `ciphertext == null` check above filters those out, but be defensive:
      final macBytes = payload['mac'] != null
          ? base64Decode(payload['mac'])
          : List<int>.filled(16, 0);
      final secretBox = SecretBox(
        base64Decode(payload['ciphertext']),
        nonce: base64Decode(payload['nonce']),
        mac: Mac(macBytes),
      );

      final plaintext = await chacha.open(
        secretBox,
        secretKey: SecretKey(derivedBytes),
      );

      return utf8.decode(plaintext);
    } catch (e) {
      // Decryption failed (wrong key, tampered payload, etc.). Return the raw
      // input so the UI can show *something* rather than crash. This also
      // covers legacy plaintext messages that aren't valid JSON.
      return encryptedJson;
    }
  }
}
