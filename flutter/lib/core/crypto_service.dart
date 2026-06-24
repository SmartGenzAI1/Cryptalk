import 'dart:convert';
import 'dart:typed_data';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class CryptoService {
  static final CryptoService _instance = CryptoService._internal();
  factory CryptoService() => _instance;
  CryptoService._internal();

  final _storage = const FlutterSecureStorage();
  SimpleKeyPair? _keyPair;
  bool _initialized = false;

  bool get isInitialized => _initialized;

  Future<void> init() async {
    if (_initialized) return;

    final privKeyB64 = await _storage.read(key: 'x25519_priv');
    final pubKeyB64 = await _storage.read(key: 'x25519_pub');

    if (privKeyB64 != null && pubKeyB64 != null) {
      _keyPair = SimpleKeyPair(
        SecretKey(base64Decode(privKeyB64)),
        PublicKey(base64Decode(pubKeyB64)),
        type: KeyPairType.x25519,
      );
    } else {
      await generate();
    }
    _initialized = true;
  }

  Future<void> generate() async {
    final algorithm = X25519();
    final pair = await algorithm.newKeyPair();
    final privBytes = await pair.extractPrivateKeyBytes();
    final pubBytes = await pair.extractPublicKey();

    await _storage.write(key: 'x25519_priv', value: base64Encode(privBytes));
    await _storage.write(key: 'x25519_pub', value: base64Encode(pubBytes));

    _keyPair = SimpleKeyPair(
      SecretKey(privBytes),
      PublicKey(pubBytes),
      type: KeyPairType.x25519,
    );
    _initialized = true;
  }

  String get publicKeyBase64 {
    if (_keyPair == null) return '';
    return base64Encode((_keyPair!.publicKey as PublicKey).bytes);
  }

  Future<String> encrypt(String plaintext, String recipientPublicKeyB64) async {
    final x25519 = X25519();
    final chacha = Chacha20Poly1305();
    final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);

    final ephemeralPair = await x25519.newKeyPair();
    final recipientPubKey = PublicKey(base64Decode(recipientPublicKeyB64));

    final sharedSecret = await x25519.sharedSecret(
      keyPair: ephemeralPair,
      remotePublicKey: recipientPubKey,
    );
    final sharedBytes = await sharedSecret.extractBytes();

    final derivedKey = await hkdf.deriveKey(
      SecretKey(sharedBytes),
      nonce: [],
      info: utf8.encode('cryptalk-message'),
    );
    final derivedBytes = await derivedKey.extractBytes();

    final nonce = chacha.nonce;
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

  Future<String> decrypt(String encryptedJson) async {
    try {
      final payload = jsonDecode(encryptedJson);
      if (payload['ciphertext'] == null || payload['ephemeralPublicKey'] == null) {
        return encryptedJson;
      }

      final x25519 = X25519();
      final chacha = Chacha20Poly1305();
      final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);

      final ephemeralPub = PublicKey(base64Decode(payload['ephemeralPublicKey']));
      final sharedSecret = await x25519.sharedSecret(
        keyPair: _keyPair!,
        remotePublicKey: ephemeralPub,
      );
      final sharedBytes = await sharedSecret.extractBytes();

      final derivedKey = await hkdf.deriveKey(
        SecretKey(sharedBytes),
        nonce: [],
        info: utf8.encode('cryptalk-message'),
      );
      final derivedBytes = await derivedKey.extractBytes();

      final secretBox = SecretBox(
        base64Decode(payload['ciphertext']),
        nonce: base64Decode(payload['nonce']),
        mac: Mac(base64Decode(payload['mac'])),
      );

      final plaintext = await chacha.open(
        secretBox,
        secretKey: SecretKey(derivedBytes),
      );

      return utf8.decode(plaintext);
    } catch (_) {
      return encryptedJson;
    }
  }
}
