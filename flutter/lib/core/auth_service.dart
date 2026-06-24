import 'api_client.dart';
import 'models.dart';
import 'crypto_service.dart';

class AuthService {
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
    return _currentUser!;
  }

  Future<AppUser> login(String email, String password) async {
    final data = await _api.post('/api/auth/login', body: {
      'email': email,
      'password': password,
    });
    _currentUser = AppUser.fromJson(data['user']);
    return _currentUser!;
  }

  Future<AppUser> onboard(String username, String name) async {
    final data = await _api.post('/api/auth/onboard', body: {
      'username': username,
      'name': name,
    });
    _currentUser = AppUser.fromJson(data['user']);
    return _currentUser!;
  }

  Future<void> logout() async {
    await _api.post('/api/auth/logout');
    _currentUser = null;
  }

  Future<void> initE2EE() async {
    if (!_crypto.isInitialized) {
      await _crypto.init();
    }
    final status = await _api.get('/api/keys/status/me');
    if (status['has_keys'] != true) {
      await _api.post('/api/keys/upload', body: {
        'identity_public_key': _crypto.publicKeyBase64,
        'signing_public_key': _crypto.publicKeyBase64,
        'signed_prekey_public': _crypto.publicKeyBase64,
        'signed_prekey_signature': 'sig',
      });
    }
  }
}
