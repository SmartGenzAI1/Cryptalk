import 'package:flutter/foundation.dart';
import 'api_client.dart';
import 'models.dart';
import 'crypto_service.dart';
import 'socket_service.dart';

/// Holds the current authenticated [AppUser] and exposes the auth lifecycle
/// methods (login/register/onboard/logout) plus E2EE init.
///
/// Extends [ChangeNotifier] so the [AppRouter] (and any other
/// `context.watch<AuthService>()` consumer) rebuilds whenever the current
/// user changes — without this, navigating `login → onboarding → chat list`
/// would silently break because the router never gets a rebuild signal.
class AuthService extends ChangeNotifier {
  final _api = ApiClient();
  final _crypto = CryptoService();

  AppUser? _currentUser;
  AppUser? get currentUser => _currentUser;

  Future<AppUser?> getMe() async {
    try {
      await _api.init();
      final data = await _api.get('/api/auth/me');
      if (data['user'] != null) {
        _currentUser = AppUser.fromJson(data['user']);
        notifyListeners();
      }
      return _currentUser;
    } catch (_) {
      return null;
    }
  }

  Future<AppUser> register(String email, String password) async {
    final data = await _api.post('/api/auth/register', body: {
      'email': email,
      'password': password,
    });
    _currentUser = AppUser.fromJson(data['user']);
    notifyListeners();
    return _currentUser!;
  }

  Future<AppUser> login(String email, String password) async {
    final data = await _api.post('/api/auth/login', body: {
      'email': email,
      'password': password,
    });
    _currentUser = AppUser.fromJson(data['user']);
    notifyListeners();
    return _currentUser!;
  }

  Future<AppUser> onboard(String username, String name) async {
    final data = await _api.post('/api/auth/onboard', body: {
      'username': username,
      'name': name,
    });
    _currentUser = AppUser.fromJson(data['user']);
    notifyListeners();
    return _currentUser!;
  }

  /// Refresh the cached current user from `/api/auth/me` (e.g. after a
  /// profile update so the UI reflects the new name/avatar).
  Future<void> refreshMe() async {
    await getMe();
  }

  Future<void> logout() async {
    // Tear down the realtime socket before clearing the session — this also
    // wipes every per-screen socket subscription (L3/L10 fix) so a stale
    // listener can't fire after logout.
    try {
      SocketService().disconnect();
    } catch (_) {}
    await _api.post('/api/auth/logout');
    _currentUser = null;
    notifyListeners();
  }

  /// Initialize end-to-end encryption for the current user.
  ///
  /// Generates a proper X25519 identity keypair (for ECDH), an Ed25519
  /// signing keypair (to sign the prekey), and a signed X25519 prekey — then
  /// uploads ALL FOUR public artifacts (`identity_public_key`,
  /// `signing_public_key`, `signed_prekey_public`, `signed_prekey_signature`)
  /// to `/api/keys/upload` so that other clients (web or Flutter) can build a
  /// prekey bundle and encrypt messages to us.
  ///
  /// L2 fix: previously this uploaded the X25519 key as all three "public
  /// keys" and a literal `'sig'` string as the signature, which broke
  /// cross-client E2EE entirely.
  Future<void> initE2EE() async {
    if (!_crypto.isInitialized) {
      await _crypto.init();
    }
    final status = await _api.get('/api/keys/status/me');
    if (status['has_keys'] != true) {
      await _api.post('/api/keys/upload', body: {
        'identity_public_key': _crypto.identityPublicKeyBase64,
        'signing_public_key': _crypto.signingPublicKeyBase64,
        'signed_prekey_public': _crypto.signedPreKeyPublicBase64,
        'signed_prekey_signature': _crypto.signedPreKeySignatureBase64,
      });
    }
  }
}
