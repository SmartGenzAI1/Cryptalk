import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_config.dart';

// server error from uploadFile — message is server-provided so callers can
// show it directly in a snackbar
class ApiException implements Exception {
  final int statusCode;
  final String message;
  final Map<String, dynamic>? body;

  ApiException(this.statusCode, this.message, {this.body});

  @override
  String toString() => message;
}

String _basename(String path) {
  final i = path.lastIndexOf('/');
  final j = path.lastIndexOf('\\');
  final idx = i > j ? i : j;
  return idx >= 0 ? path.substring(idx + 1) : path;
}

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  final _storage = const FlutterSecureStorage();
  String? _cookie;

  Future<void> init() async {
    _cookie = await _storage.read(key: 'session_cookie');
  }

  Future<void> _persistCookie() async {
    if (_cookie != null) {
      await _storage.write(key: 'session_cookie', value: _cookie);
    }
  }

  void setCookie(String? cookie) => _cookie = cookie;
  String? get cookie => _cookie;

  // bare tc_session value from the cookie, used for socket identify
  String? get sessionToken {
    if (_cookie == null) return null;
    final part = _cookie!.split(';').first;
    final eq = part.indexOf('=');
    return eq >= 0 ? part.substring(eq + 1).trim() : null;
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_cookie != null) 'Cookie': _cookie!,
  };

  Future<Map<String, dynamic>> get(String path) async {
    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}$path'),
        headers: _headers,
      ).timeout(const Duration(seconds: 30));
      _extractCookie(res);
      if (res.statusCode == 401) {
        await _storage.delete(key: 'session_cookie');
        throw Exception('Session expired');
      }
      if (res.statusCode >= 400) {
        final err = jsonDecode(res.body);
        throw Exception(err['detail'] ?? err['message'] ?? 'Request failed (${res.statusCode})');
      }
      return jsonDecode(res.body);
    } catch (e) {
      if (e is Exception) rethrow;
      throw Exception('Network error: $e');
    }
  }

  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body}) async {
    try {
      final res = await http.post(
        Uri.parse('${ApiConfig.baseUrl}$path'),
        headers: _headers,
        body: body != null ? jsonEncode(body) : null,
      ).timeout(const Duration(seconds: 60));
      _extractCookie(res);
      if (res.statusCode >= 400) {
        final err = jsonDecode(res.body);
        throw Exception(err['detail'] ?? err['message'] ?? 'Request failed (${res.statusCode})');
      }
      return jsonDecode(res.body);
    } catch (e) {
      if (e is Exception) rethrow;
      throw Exception('Network error: $e');
    }
  }

  Future<Map<String, dynamic>> patch(String path, {Map<String, dynamic>? body}) async {
    try {
      final res = await http.patch(
        Uri.parse('${ApiConfig.baseUrl}$path'),
        headers: _headers,
        body: body != null ? jsonEncode(body) : null,
      ).timeout(const Duration(seconds: 30));
      _extractCookie(res);
      if (res.statusCode >= 400) {
        final err = jsonDecode(res.body);
        throw Exception(err['detail'] ?? err['message'] ?? 'Request failed (${res.statusCode})');
      }
      return jsonDecode(res.body);
    } catch (e) {
      if (e is Exception) rethrow;
      throw Exception('Network error: $e');
    }
  }

  Future<Map<String, dynamic>> put(String path, {Map<String, dynamic>? body}) async {
    try {
      final res = await http.put(
        Uri.parse('${ApiConfig.baseUrl}$path'),
        headers: _headers,
        body: body != null ? jsonEncode(body) : null,
      ).timeout(const Duration(seconds: 30));
      _extractCookie(res);
      if (res.statusCode >= 400) {
        final err = jsonDecode(res.body);
        throw Exception(err['detail'] ?? err['message'] ?? 'Request failed (${res.statusCode})');
      }
      return jsonDecode(res.body);
    } catch (e) {
      if (e is Exception) rethrow;
      throw Exception('Network error: $e');
    }
  }

  Future<Map<String, dynamic>> delete(String path) async {
    try {
      final res = await http.delete(
        Uri.parse('${ApiConfig.baseUrl}$path'),
        headers: _headers,
      ).timeout(const Duration(seconds: 30));
      _extractCookie(res);
      if (res.statusCode >= 400) {
        final err = jsonDecode(res.body);
        throw Exception(err['detail'] ?? err['message'] ?? 'Request failed (${res.statusCode})');
      }
      return jsonDecode(res.body);
    } catch (e) {
      if (e is Exception) rethrow;
      throw Exception('Network error: $e');
    }
  }

  // uploads ciphertext bytes as multipart `file`. throws ApiException on
  // 4xx/5xx so callers can show the server message in a snackbar.
  Future<Map<String, dynamic>> uploadFile(
    String path,
    Uint8List bytes, {
    String? contentType,
    String? fileName,
  }) async {
    try {
      final uri = Uri.parse('${ApiConfig.baseUrl}/api/uploads');
      final req = http.MultipartRequest('POST', uri);
      if (_cookie != null) req.headers['Cookie'] = _cookie!;

      final name = fileName ?? _basename(path);
      req.files.add(http.MultipartFile.fromBytes(
        'file',
        bytes,
        filename: name,
      ));

      final streamed = await req.send().timeout(const Duration(seconds: 120));
      final res = await http.Response.fromStream(streamed);
      _extractCookie(res);

      Map<String, dynamic> body;
      try {
        body = jsonDecode(res.body) as Map<String, dynamic>;
      } catch (_) {
        body = <String, dynamic>{'message': res.body};
      }

      if (res.statusCode == 401) {
        await _storage.delete(key: 'session_cookie');
        throw ApiException(401, 'Session expired', body: body);
      }
      if (res.statusCode >= 400) {
        final msg = (body['message']?.toString().isNotEmpty ?? false)
            ? body['message'].toString()
            : (body['error']?.toString() ?? 'Upload failed (${res.statusCode})');
        throw ApiException(res.statusCode, msg, body: body);
      }
      return body;
    } on ApiException {
      rethrow;
    } catch (e) {
      if (e is Exception) rethrow;
      throw Exception('Network error: $e');
    }
  }

  void _extractCookie(http.Response res) {
    final setCookie = res.headers['set-cookie'];
    if (setCookie != null) {
      final cookiePart = setCookie.split(';').first;
      if (cookiePart.contains('tc_session')) {
        _cookie = cookiePart;
        _persistCookie();
      }
    }
  }
}
