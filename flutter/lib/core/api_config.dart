import 'package:flutter_dotenv/flutter_dotenv.dart';

class ApiConfig {
  static String baseUrl = dotenv.env['BACKEND_URL'] ?? 'http://10.0.2.2:8001';
  static String get wsUrl => baseUrl.replaceFirst('http', 'ws');

  static String? supabaseUrl = dotenv.env['SUPABASE_URL'];
  static String? supabaseAnonKey = dotenv.env['SUPABASE_ANON_KEY'];

  static bool get hasSupabase =>
      supabaseUrl != null && supabaseUrl!.isNotEmpty &&
      supabaseAnonKey != null && supabaseAnonKey!.isNotEmpty;

  static int get defaultTimeoutSeconds =>
      int.tryParse(dotenv.env['API_TIMEOUT_SECONDS'] ?? '') ?? 30;
  static int get uploadTimeoutSeconds =>
      int.tryParse(dotenv.env['API_UPLOAD_TIMEOUT_SECONDS'] ?? '') ?? 120;
}
