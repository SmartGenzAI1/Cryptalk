import 'dart:convert';
import 'dart:typed_data';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class CryptoService {
  static final CryptoService _instance = CryptoService._internal();
  factory CryptoService() => _instance;
  CryptoService._internal();

  final _storage = const FlutterSecureStorage();
  KeyPair? _identityKeyPair;
  KeyPair? _signingKeyPair;

  bool get isInitialized => _identityKeyPair != null;

  Future<void> init() async {
    final privKey = await _storage.read(key: 'identity_priv');
    final pubKey = await _storage.read(key: 'identity_pub');

    if (privKey != null && pubKey != null) {
      _identityKeyPair = KeyPair(
        privateKey: SecretKey(base64Decode(privKey)),
        publicKey: PublicKey(base64Decode(pubKey)),
      );
    } else {
      await generateIdentity();
    }
  }

  Future<void> generateIdentity() async {
    final algorithm = X25519();
    final keyPair = await algorithm.newKeyPair();
    final privKey = await keyPair.privateKey.extractBytes();
    final pubKey = await keyPair.publicKey.extractBytes();

    await _storage.write(key: 'identity_priv', value: base64Encode(privKey));
    await _storage.write(key: 'identity_pub', value: base64Encode(pubKey));

    _identityKeyPair = KeyPair(
      privateKey: SecretKey(privKey),
      publicKey: PublicKey(pubKey),
    );
  }

  String get publicKeyBase64 {
    if (_identityKeyPair == null) return '';
    return base64Encode(_identityKeyPair!.publicKey.bytes);
  }

  Future<String> encrypt(String plaintext, String recipientPublicKeyB64) async {
    final x25519 = X25519();
    final ephemeralKeyPair = await x25519.newKeyPair();

    final recipientPubKey = PublicKey(base64Decode(recipientPublicKeyB64));
    final sharedSecret = await x25519.sharedSecret(
      keyPair: ephemeralKeyPair,
      remotePublicKey: recipientPubKey,
    );

    final sharedBytes = await sharedSecret.extractBytes();
    final encryptionKey = await _deriveKey(sharedBytes);

    final nonce = algorithm.nonce;
    final secretBox = await algorithm.seal(
      utf8.encode(plaintext),
      secretKey: SecretKey(encryptionKey),
    );

    final ephemeralPub = await ephemeralKeyPair.publicKey.extractBytes();

    return jsonEncode({
      'ciphertext': base64Encode(secretBox.cipherText),
      'nonce': base64Encode(secretBox.nonce),
      'ephemeralPublicKey': base64Encode(ephemeralPub),
    });
  }

  Future<String> decrypt(String encryptedJson) async {
    try {
      final payload = jsonDecode(encryptedJson);
      if (payload['ciphertext'] == null) return encryptedJson;

      final x25519 = X25519();
      final ephemeralPub = PublicKey(base64Decode(payload['ephemeralPublicKey']));
      final sharedSecret = await x25519.sharedSecret(
        keyPair: _identityKeyPair!,
        remotePublicKey: ephemeralPub,
      );

      final sharedBytes = await sharedSecret.extractBytes();
      final encryptionKey = await _deriveKey(sharedBytes);

      final secretBox = SecretBox(
        base64Decode(payload['ciphertext']),
        nonce: base64Decode(payload['nonce']),
        mac: Mac.empty,
      );

      final plaintext = await algorithm.open(
        secretBox,
        secretKey: SecretKey(encryptionKey),
      );

      return utf8.decode(plaintext);
    } catch (_) {
      return encryptedJson;
    }
  }

  Future<List<int>> _deriveKey(List<int> sharedSecret) async {
    final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);
    final derived = await hkfx.deriveKey(
      sharedSecret,
      nonce: [],
      info: utf8.encode('cryptalk-message'),
    );
    return await derived.extractBytes();
  }

  Chacha20Poly1305 get algorithm => Chacha20Poly1305();
}

class KeyPair {
  final SecretKey privateKey;
  final PublicKey publicKey;
  KeyPair({required this.privateKey, required this.publicKey});
}
