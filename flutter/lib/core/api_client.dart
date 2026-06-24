import 'dart:convert';
import 'package:http/http.dart as http;
import 'api_config.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  String? _cookie;

  void setCookie(String? cookie) => _cookie = cookie;
  String? get cookie => _cookie;

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_cookie != null) 'Cookie': _cookie!,
  };

  Future<Map<String, dynamic>> get(String path) async {
    final res = await http.get(
      Uri.parse('${ApiConfig.baseUrl}$path'),
      headers: _headers,
    );
    _extractCookie(res);
    if (res.statusCode >= 400) {
      final err = jsonDecode(res.body);
      throw Exception(err['detail'] ?? err['message'] ?? 'Request failed');
    }
    return jsonDecode(res.body);
  }

  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body}) async {
    final res = await http.post(
      Uri.parse('${ApiConfig.baseUrl}$path'),
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    );
    _extractCookie(res);
    if (res.statusCode >= 400) {
      final err = jsonDecode(res.body);
      throw Exception(err['detail'] ?? err['message'] ?? 'Request failed');
    }
    return jsonDecode(res.body);
  }

  Future<Map<String, dynamic>> patch(String path, {Map<String, dynamic>? body}) async {
    final res = await http.patch(
      Uri.parse('${ApiConfig.baseUrl}$path'),
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    );
    _extractCookie(res);
    if (res.statusCode >= 400) {
      final err = jsonDecode(res.body);
      throw Exception(err['detail'] ?? err['message'] ?? 'Request failed');
    }
    return jsonDecode(res.body);
  }

  Future<Map<String, dynamic>> delete(String path) async {
    final res = await http.delete(
      Uri.parse('${ApiConfig.baseUrl}$path'),
      headers: _headers,
    );
    _extractCookie(res);
    if (res.statusCode >= 400) {
      final err = jsonDecode(res.body);
      throw Exception(err['detail'] ?? err['message'] ?? 'Request failed');
    }
    return jsonDecode(res.body);
  }

  void _extractCookie(http.Response res) {
    final setCookie = res.headers['set-cookie'];
    if (setCookie != null) {
      final cookiePart = setCookie.split(';').first;
      if (cookiePart.contains('tc_session')) {
        _cookie = cookiePart;
      }
    }
  }
}
