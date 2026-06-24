import 'dart:convert';
import 'dart:typed_data';
import 'api_client.dart';
import 'models.dart';
import 'crypto_service.dart';

/// Hard client-side cap matching the server's 25MB per-file limit
/// (`settings.MAX_FILE_SIZE_BYTES`). Files above this are rejected before
/// hitting the network so the user gets immediate feedback.
const int kMaxAttachmentBytes = 25 * 1024 * 1024;

class ChatService {
  final _api = ApiClient();
  final _crypto = CryptoService();

  ApiClient get api => _api;

  Future<List<Chat>> getChats() async {
    final data = await _api.get('/api/chats');
    return (data['chats'] as List).map((c) => Chat.fromJson(c)).toList();
  }

  Future<List<Message>> getMessages(String chatId, {int limit = 50, String? before}) async {
    var path = '/api/$chatId/messages?limit=$limit';
    if (before != null) path += '&before=${Uri.encodeComponent(before)}';
    final data = await _api.get(path);
    var messages = (data['messages'] as List).map((m) => Message.fromJson(m)).toList();
    // Decrypt every message body. CryptoService.decrypt gracefully returns
    // the input unchanged when it isn't valid ciphertext JSON, so legacy
    // plaintext messages still render.
    for (final m in messages) {
      m.content = await _crypto.decrypt(m.content);
    }
    return messages;
  }

  /// Send a plain text or sticker message. The [content] is always
  /// encrypted with the local E2EE key before being persisted.
  Future<Message> sendMessage(String chatId, String content, {String type = 'text', String? replyToId, int? expiresIn}) async {
    final encrypted = await _crypto.encrypt(content, _crypto.publicKeyBase64);
    final data = await _api.post('/api/$chatId/messages', body: {
      'content': encrypted,
      'type': type,
      if (replyToId != null) 'replyToId': replyToId,
      if (expiresIn != null) 'expiresIn': expiresIn,
    });
    var msg = Message.fromJson(data['message']);
    // Decrypt own echo back so the local UI shows the plaintext.
    msg.content = await _crypto.decrypt(msg.content);
    return msg;
  }

  /// Send an E2EE file/image/voice message via the new upload flow.
  ///
  /// Flow:
  ///   1. Build a `data:<mime>;base64,<...>` string from [fileBytes].
  ///   2. Encrypt that data URL with `_crypto.encrypt(...)` → ciphertext JSON.
  ///   3. UTF-8 encode the ciphertext → bytes (ASCII-safe).
  ///   4. `POST /api/uploads` those bytes as multipart `file`.
  ///   5. If `fallback: true` (dev mode, no Supabase): send the message with
  ///      `content = ciphertext` and no `attachmentPath`.
  ///   6. Otherwise: encrypt the returned `url`, send the message with
  ///      `content = encryptedUrl`, `type`, `attachmentPath = path`.
  ///
  /// On 413 (file_too_large) / 507 (quota_exceeded) the underlying
  /// [ApiClient.uploadFile] throws an [ApiException] carrying the server's
  /// `message`; callers should catch it and show it in a SnackBar.
  Future<Message> sendFileMessage(
    String chatId,
    Uint8List fileBytes,
    String fileName, {
    String type = 'file',
    String? contentType,
    String? replyToId,
    int? duration,
    int? expiresIn,
  }) async {
    if (fileBytes.length > kMaxAttachmentBytes) {
      throw ApiException(
        413,
        'File exceeds 25MB limit',
        body: {'error': 'file_too_large'},
      );
    }

    final mime = contentType ?? _guessMime(fileName);
    final b64 = base64Encode(fileBytes);
    final dataUrl = 'data:$mime;base64,$b64';

    // 1+2. Encrypt the data URL.
    final ciphertext = await _crypto.encrypt(dataUrl, _crypto.publicKeyBase64);

    // 3+4. UTF-8 encode ciphertext → upload.
    final cipherBytes = Uint8List.fromList(utf8.encode(ciphertext));
    final uploadRes = await _api.uploadFile(
      fileName,
      cipherBytes,
      fileName: fileName,
      contentType: contentType,
    );

    // 5. Dev fallback: no Supabase configured on the server.
    if (uploadRes['fallback'] == true) {
      final data = await _api.post('/api/$chatId/messages', body: {
        'content': ciphertext,
        'type': type,
        if (replyToId != null) 'replyToId': replyToId,
        if (duration != null) 'duration': duration,
        if (expiresIn != null) 'expiresIn': expiresIn,
      });
      var msg = Message.fromJson(data['message']);
      msg.content = await _crypto.decrypt(msg.content);
      return msg;
    }

    // 6. Upload succeeded — encrypt the URL, send the message.
    final url = uploadRes['url']?.toString() ?? '';
    final path = uploadRes['path']?.toString();
    final encryptedUrl = await _crypto.encrypt(url, _crypto.publicKeyBase64);

    final data = await _api.post('/api/$chatId/messages', body: {
      'content': encryptedUrl,
      'type': type,
      if (replyToId != null) 'replyToId': replyToId,
      if (duration != null) 'duration': duration,
      if (expiresIn != null) 'expiresIn': expiresIn,
      if (path != null) 'attachmentPath': path,
      if (path != null) 'attachment_path': path,
    });
    var msg = Message.fromJson(data['message']);
    // Decrypt own echo (URL or data URL) for local display.
    msg.content = await _crypto.decrypt(msg.content);
    return msg;
  }

  String _guessMime(String fileName) {
    final lower = fileName.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/aac';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.zip')) return 'application/zip';
    return 'application/octet-stream';
  }

  Future<Message> editMessage(String chatId, String messageId, String newContent) async {
    final data = await _api.patch('/api/$chatId/messages?messageId=$messageId', body: {'content': newContent});
    return Message.fromJson(data['message']);
  }

  Future<void> deleteMessage(String chatId, String messageId, {bool forEveryone = false}) async {
    await _api.delete('/api/$chatId/messages?messageId=$messageId${forEveryone ? '&forEveryone=true' : ''}');
  }

  Future<void> toggleReaction(String chatId, String messageId, String emoji) async {
    await _api.put('/api/$chatId/messages?messageId=$messageId', body: {'emoji': emoji});
  }

  Future<void> toggleStar(String chatId, String messageId) async {
    await _api.patch('/api/$chatId/messages?messageId=$messageId', body: {'action': 'star'});
  }

  Future<void> markDelivered(String chatId) async {
    await _api.post('/api/$chatId/messages/delivered');
  }

  Future<void> markRead(String chatId, String messageId) async {
    await _api.post('/api/$chatId/messages/read?messageId=$messageId');
  }

  Future<void> pinChat(String chatId, bool pin) async {
    await _api.patch('/api/chats/$chatId/settings', body: {'action': 'pin', 'value': pin});
  }

  Future<void> muteChat(String chatId, bool mute) async {
    await _api.patch('/api/chats/$chatId/settings', body: {'action': 'mute', 'value': mute});
  }

  Future<void> leaveChat(String chatId) async {
    await _api.post('/api/chats/$chatId/leave');
  }

  Future<void> deleteChat(String chatId) async {
    await _api.delete('/api/chats/$chatId');
  }

  Future<String> generateInviteLink(String chatId) async {
    final data = await _api.post('/api/chats/$chatId/invite');
    return data['token'] ?? '';
  }

  Future<Chat> joinChatByToken(String token) async {
    final data = await _api.post('/api/chats/join/$token');
    return Chat.fromJson(data);
  }

  Future<Chat> createDirectChat(String userId) async {
    final data = await _api.post('/api/chats', body: {'type': 'direct', 'memberIds': [userId]});
    return Chat.fromJson(data['chat']);
  }

  Future<Chat> createGroup(String title, List<String> memberIds, {int? expiresInDays}) async {
    final data = await _api.post('/api/chats', body: {
      'type': 'group',
      'title': title,
      'memberIds': memberIds,
      if (expiresInDays != null) 'expiresInDays': expiresInDays,
    });
    return Chat.fromJson(data['chat']);
  }

  Future<List<AppUser>> searchUsers(String query) async {
    final data = await _api.get('/api/users/search?q=${Uri.encodeComponent(query)}');
    return (data['users'] as List).map((u) => AppUser.fromJson(u)).toList();
  }

  Future<List<Map<String, dynamic>>> crossChatSearch(String query) async {
    final data = await _api.get('/api/search?q=${Uri.encodeComponent(query)}');
    return List<Map<String, dynamic>>.from(data['results']);
  }

  Future<void> blockUser(String userId) async {
    await _api.post('/api/social/block', body: {'user_id': userId});
  }

  Future<void> unblockUser(String userId) async {
    await _api.post('/api/social/unblock', body: {'user_id': userId});
  }

  Future<List<AppUser>> getBlockedUsers() async {
    final data = await _api.get('/api/social/blocked');
    return (data['blocked'] as List).map((u) => AppUser.fromJson(u)).toList();
  }

  Future<void> reportUser(String userId, String reason) async {
    await _api.post('/api/reports', body: {'reported_id': userId, 'reason': reason});
  }

  Future<void> deleteAccount() async {
    await _api.delete('/api/account');
  }

  Future<void> updateProfile({String? name, String? bio}) async {
    await _api.patch('/api/users/me', body: {
      if (name != null) 'name': name,
      if (bio != null) 'bio': bio,
    });
  }
}
