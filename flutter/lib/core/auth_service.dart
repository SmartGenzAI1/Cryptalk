import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_client.dart';
import 'models.dart';
import 'crypto_service.dart';
import 'socket_service.dart';

// holds current user + auth lifecycle. AppRouter watches currentUser so
// navigation between login/onboarding/chat list happens automatically.
class AuthService extends ChangeNotifier {
  final _api = ApiClient();
  final _crypto = CryptoService();
  final _storage = const FlutterSecureStorage();

  AppUser? _currentUser;
  AppUser? get currentUser => _currentUser;

  ThemeMode _themeMode = ThemeMode.dark;
  ThemeMode get themeMode => _themeMode;

  AuthService() {
    _loadThemeMode();
  }

  Future<void> _loadThemeMode() async {
    try {
      final saved = await _storage.read(key: 'theme_mode');
      if (saved == 'light') {
        _themeMode = ThemeMode.light;
      } else if (saved == 'dark') {
        _themeMode = ThemeMode.dark;
      } else if (saved == 'system') {
        _themeMode = ThemeMode.system;
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    if (_themeMode == mode) return;
    _themeMode = mode;
    notifyListeners();
    try {
      await _storage.write(key: 'theme_mode', value: mode.name);
    } catch (_) {}
  }

  Future<void> updateUserSettings(Map<String, dynamic> patch) async {
    final data = await _api.patch('/api/users/me', body: patch);
    if (data['user'] != null) {
      _currentUser = AppUser.fromJson(data['user']);
      notifyListeners();
    }
  }

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

  Future<void> refreshMe() async {
    await getMe();
  }

  Future<void> logout() async {
    // disconnect socket first so stale listeners can't fire post-logout
    try {
      SocketService().disconnect();
    } catch (_) {}
    await _api.post('/api/auth/logout');
    _currentUser = null;
    notifyListeners();
  }

  // generates identity + signing + signed prekey keypairs and uploads the
  // public artifacts to /api/keys/upload so other clients can encrypt to us
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
