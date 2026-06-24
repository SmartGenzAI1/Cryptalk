import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_config.dart';

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
