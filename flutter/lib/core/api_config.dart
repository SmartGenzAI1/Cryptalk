class ApiConfig {
  static String baseUrl = 'http://10.0.2.2:8001';
  static String get wsUrl => baseUrl.replaceFirst('http', 'ws');
}
