import 'package:supabase_flutter/supabase_flutter.dart';
import 'api_config.dart';

class SupabaseService {
  static SupabaseClient? _client;

  static SupabaseClient? get client {
    if (!ApiConfig.hasSupabase) return null;
    _client ??= Supabase.instance.client;
    return _client;
  }

  static bool get isAvailable => client != null;

  static Future<void> uploadFile(String path, List<int> bytes, String contentType) async {
    if (client == null) return;
    await client!.storage.from('cryptalk').uploadBinary(path, bytes, fileOptions: FileOptions(contentType: contentType));
  }

  static String? getFileUrl(String path) {
    if (client == null) return null;
    return client!.storage.from('cryptalk').getPublicUrl(path);
  }

  static Future<List<Map<String, dynamic>>> query(String table, {String? filter, dynamic value}) async {
    if (client == null) return [];
    var q = client!.from(table).select();
    if (filter != null && value != null) {
      q = q.eq(filter, value);
    }
    final data = await q;
    return List<Map<String, dynamic>>.from(data);
  }

  static Future<Map<String, dynamic>?> insert(String table, Map<String, dynamic> data) async {
    if (client == null) return null;
    final result = await client!.from(table).insert(data).select();
    return result.isNotEmpty ? result.first : null;
  }

  static Future<void> update(String table, Map<String, dynamic> data, String filter, dynamic value) async {
    if (client == null) return;
    await client!.from(table).update(data).eq(filter, value);
  }

  static Future<void> delete(String table, String filter, dynamic value) async {
    if (client == null) return;
    await client!.from(table).delete().eq(filter, value);
  }
}
