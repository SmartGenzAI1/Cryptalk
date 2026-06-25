import 'dart:convert';
import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_client.dart';

// e2ee for cryptalk. each device has an x25519 identity keypair, an
// ed25519 signing keypair, and a signed x25519 prekey (signed by the
// ed25519 key). privates live in flutter_secure_storage; only public bytes
// + the signature go to /api/keys/upload.
//
// ciphertext json shape: {ciphertext, nonce, ephemeralPublicKey, mac} —
// web reads the first three, mac is extra (chacha20-poly1305 needs it).
//
// NOTE: flutter↔flutter e2ee works end-to-end, but flutter↔web doesn't yet
// — web uses libsodium XSalsa20-Poly1305 + non-standard hkdf, we use
// chacha20-poly1305 + standard hkdf. same json shape, different cipher.
// switching to a libsodium binding would fix it but adds a dep.
class CryptoService {
  static final CryptoService _instance = CryptoService._internal();
  factory CryptoService() => _instance;
  CryptoService._internal();

  final _storage = const FlutterSecureStorage();
  final _api = ApiClient();

  // x25519 identity keypair (ecdh)
  SimpleKeyPair? _identityKeyPair;
  // ed25519 signing keypair (signs the prekey)
  SimpleKeyPair? _signingKeyPair;
  // x25519 signed prekey keypair
  SimpleKeyPair? _signedPreKeyPair;
  // ed25519 signature over the signed prekey public key
  List<int>? _signedPreKeySignature;

  bool _initialized = false;

  // cache: userId → recipient public key bundle (raw base64 from /api/keys/{userId})
  final Map<String, Map<String, String>> _recipientKeyCache = {};

  bool get isInitialized => _initialized;

  // load keys from secure storage, or generate a fresh identity. idempotent.
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

    // any missing keypair → regenerate everything to keep them consistent
    // (partial state shouldn't happen but avoids subtle bugs)
    if (_identityKeyPair == null ||
        _signingKeyPair == null ||
        _signedPreKeyPair == null ||
        _signedPreKeySignature == null) {
      await generate();
    }
    _initialized = true;
  }

  // generate fresh identity + signed prekey, persist privates to secure
  // storage. overwrites existing keys — first run or explicit reset only.
  Future<void> generate() async {
    final x25519 = X25519();
    final ed25519 = Ed25519();

    _identityKeyPair = await x25519.newKeyPair();
    _signingKeyPair = await ed25519.newKeyPair();
    _signedPreKeyPair = await x25519.newKeyPair();

    // sign the prekey pub with the ed25519 signing key
    final spkPub = await _signedPreKeyPair!.extractPublicKey();
    final spkPubBytes = spkPub.bytes;
    final signature = await ed25519.sign(spkPubBytes, keyPair: _signingKeyPair!);
    _signedPreKeySignature = signature.bytes;

    // persist to secure storage
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

  // x25519 identity pub (ecdh), base64
  String get identityPublicKeyBase64 {
    if (_identityKeyPair == null) return '';
    return base64Encode((_identityKeyPair!.publicKey as PublicKey).bytes);
  }

  // ed25519 signing pub, base64
  String get signingPublicKeyBase64 {
    if (_signingKeyPair == null) return '';
    return base64Encode((_signingKeyPair!.publicKey as PublicKey).bytes);
  }

  // x25519 signed prekey pub, base64
  String get signedPreKeyPublicBase64 {
    if (_signedPreKeyPair == null) return '';
    return base64Encode((_signedPreKeyPair!.publicKey as PublicKey).bytes);
  }

  // ed25519 signature over the signed prekey pub, base64
  String get signedPreKeySignatureBase64 {
    if (_signedPreKeySignature == null) return '';
    return base64Encode(_signedPreKeySignature!);
  }

  // fetch recipient's x25519 identity pub from /api/keys/{userId}, cached.
  // returns null if they haven't set up e2ee yet.
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

  // encrypt plaintext → ciphertext json. if not initialized yet, returns
  // plaintext unchanged so the message at least sends.
  Future<String> encrypt(String plaintext, String recipientPublicKeyB64) async {
    if (_identityKeyPair == null || recipientPublicKeyB64.isEmpty) {
      debugPrint('CryptoService.encrypt: not initialized or empty recipient key — sending plaintext');
      return plaintext;
    }

    final x25519 = X25519();
    final chacha = Chacha20Poly1305();
    final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);

    // 1. per-message ephemeral x25519 keypair
    final ephemeralPair = await x25519.newKeyPair();
    final recipientPubKey = PublicKey(base64Decode(recipientPublicKeyB64));

    // 2. ecdh(ephemeral_priv, recipient_identity_pub) → shared secret
    final sharedSecret = await x25519.sharedSecret(
      keyPair: ephemeralPair,
      remotePublicKey: recipientPubKey,
    );
    final sharedBytes = await sharedSecret.extractBytes();

    // 3. hkdf-sha256 → 32-byte symmetric key
    final derivedKey = await hkdf.deriveKey(
      SecretKey(sharedBytes),
      nonce: [],
      info: utf8.encode('cryptalk-message'),
    );
    final derivedBytes = await derivedKey.extractBytes();

    // 4. seal with chacha20-poly1305 (aead). package generates the nonce.
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

  // decrypt ciphertext json. senderPublicKey is unused (ephemeral pub is in
  // the payload) — kept for a future signature-verification extension.
  // if not initialized, returns input unchanged so ui doesn't crash.
  Future<String> decrypt(String encryptedJson, [String? senderPublicKey]) async {
    if (_identityKeyPair == null) {
      debugPrint('CryptoService.decrypt: not initialized — returning input unchanged');
      return encryptedJson;
    }
    try {
      final payload = jsonDecode(encryptedJson);
      if (payload['ciphertext'] == null ||
          payload['ephemeralPublicKey'] == null) {
        // not an encrypted payload — return as-is (legacy plaintext, sticker
        // name, or saved-messages body that was never encrypted)
        return encryptedJson;
      }

      final x25519 = X25519();
      final chacha = Chacha20Poly1305();
      final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);

      final ephemeralPub = PublicKey(base64Decode(payload['ephemeralPublicKey']));

      // ecdh(my_identity_priv, sender_ephemeral_pub) → same shared secret
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

      // some legacy payloads may not have a mac — be defensive
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
      // decryption failed — return raw input so ui shows something. also
      // covers legacy plaintext msgs that aren't valid json.
      return encryptedJson;
    }
  }
}
