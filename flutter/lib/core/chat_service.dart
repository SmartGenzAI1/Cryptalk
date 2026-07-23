import 'dart:convert';
import 'dart:typed_data';
import 'api_client.dart';
import 'models.dart';
import 'crypto_service.dart';

// 25mb client cap, matches server
const int kMaxAttachmentBytes = 25 * 1024 * 1024;

class ChatService {
  final _api = ApiClient();
  final _crypto = CryptoService();

  ApiClient get api => _api;

  Future<List<Chat>> getChats() async {
    final data = await _api.get('/api/chats');
    final chats = (data['chats'] as List).map((c) => Chat.fromJson(c)).toList();
    // Decrypt and store any group chat keys we received
    for (final chat in chats) {
      if (chat.chatKey != null && chat.chatKey!.isNotEmpty) {
        await _crypto.decryptAndStoreGroupKey(chat.id, chat.chatKey!);
      }
    }
    return chats;
  }

  Future<List<Message>> getMessages(String chatId, {int limit = 50, String? before}) async {
    var path = '/api/$chatId/messages?limit=$limit';
    if (before != null) path += '&before=${Uri.encodeComponent(before)}';
    final data = await _api.get(path);
    var messages = (data['messages'] as List).map((m) => Message.fromJson(m)).toList();
    // decrypt returns input as-is for non-ciphertext, so legacy/system msgs still work
    for (final m in messages) {
      m.content = await _crypto.decryptMessage(m.content, chatId);
    }
    return messages;
  }

  /// Creates an optimistic Message object locally with status 'pending' and a temporary ID.
  Message createOptimisticMessage(
    String chatId,
    String content, {
    String type = 'text',
    String? replyToId,
    ReplyTo? replyTo,
    int? expiresIn,
    int? duration,
    AppUser? sender,
    String? tempId,
  }) {
    final id = tempId ?? 'temp_${DateTime.now().millisecondsSinceEpoch}';
    return Message(
      id: id,
      chatId: chatId,
      senderId: sender?.id ?? '',
      content: content,
      type: type,
      replyToId: replyToId,
      replyTo: replyTo,
      createdAt: DateTime.now().toIso8601String(),
      status: 'pending',
      sender: sender ?? AppUser(id: sender?.id ?? '', name: 'You'),
      expiresIn: expiresIn,
      duration: duration,
    );
  }

  /// Replaces an optimistic message (matched by temporary ID [tempId]) in a list with the server ACK message [serverMsg].
  int replaceTempMessage(List<Message> messages, String tempId, Message serverMsg) {
    final index = messages.indexWhere((m) => m.id == tempId);
    if (index != -1) {
      messages[index] = serverMsg;
    }
    return index;
  }

  // send text/sticker. direct chats are e2ee, saved/group are plaintext for now.
  Future<Message> sendMessage(
    String chatId,
    String content, {
    String type = 'text',
    String? replyToId,
    int? expiresIn,
    String? chatType,
    String? recipientUserId,
    String? tempId,
    Message? optimisticMessage,
  }) async {
    try {
      final toStore = await _encryptForChat(content, chatType, recipientUserId, chatId);
      final data = await _api.post('/api/$chatId/messages', body: {
        'content': toStore,
        'type': type,
        if (replyToId != null) 'replyToId': replyToId,
        if (expiresIn != null) 'expiresIn': expiresIn,
        if (tempId != null || optimisticMessage != null)
          'tempId': tempId ?? optimisticMessage?.id,
      });
      var msg = Message.fromJson(data['message']);
      // decrypt own echo so local ui shows plaintext
      msg.content = await _crypto.decryptMessage(msg.content, chatId);
      if (optimisticMessage != null) {
        optimisticMessage.status = msg.status;
      }
      return msg;
    } catch (e) {
      if (optimisticMessage != null) {
        optimisticMessage.status = 'failed';
      }
      rethrow;
    }
  }

  // returns ciphertext json, or plaintext when encryption is skipped (saved,
  // missing recipient key)
  Future<String> _encryptForChat(
    String plaintext,
    String? chatType,
    String? recipientUserId,
    String chatId,
  ) async {
    if (chatType == 'saved') return plaintext;
    if (chatType == 'group') {
      return _crypto.encryptGroup(plaintext, chatId);
    }
    if (recipientUserId == null || recipientUserId.isEmpty) return plaintext;
    final recipientPub = await _crypto.getRecipientPublicKey(recipientUserId);
    if (recipientPub == null || recipientPub.isEmpty) {
      // recipient hasn't set up e2ee yet, fall back to plaintext
      return plaintext;
    }
    return _crypto.encrypt(plaintext, recipientPub);
  }

  // upload flow: encrypt data url → upload ciphertext bytes → encrypt the
  // returned url → send message. dev fallback (no supabase) skips the url step.
  Future<Message> sendFileMessage(
    String chatId,
    Uint8List fileBytes,
    String fileName, {
    String type = 'file',
    String? contentType,
    String? replyToId,
    int? duration,
    int? expiresIn,
    String? chatType,
    String? recipientUserId,
    String? tempId,
    Message? optimisticMessage,
  }) async {
    if (fileBytes.length > kMaxAttachmentBytes) {
      if (optimisticMessage != null) {
        optimisticMessage.status = 'failed';
      }
      throw ApiException(
        413,
        'File exceeds 25MB limit',
        body: {'error': 'file_too_large'},
      );
    }

    try {
      final mime = contentType ?? _guessMime(fileName);
      final b64 = base64Encode(fileBytes);
      final dataUrl = 'data:$mime;base64,$b64';

      // 1+2. encrypt the data url with the recipient's key
      final ciphertext = await _encryptForChat(dataUrl, chatType, recipientUserId, chatId);

      // 3+4. utf-8 encode ciphertext → upload
      final cipherBytes = Uint8List.fromList(utf8.encode(ciphertext));
      final uploadRes = await _api.uploadFile(
        fileName,
        cipherBytes,
        fileName: fileName,
        contentType: contentType,
      );

      final activeTempId = tempId ?? optimisticMessage?.id;

      // 5. dev fallback: no supabase on the server
      if (uploadRes['fallback'] == true) {
        final data = await _api.post('/api/$chatId/messages', body: {
          'content': ciphertext,
          'type': type,
          if (replyToId != null) 'replyToId': replyToId,
          if (duration != null) 'duration': duration,
          if (expiresIn != null) 'expiresIn': expiresIn,
          if (activeTempId != null) 'tempId': activeTempId,
        });
        var msg = Message.fromJson(data['message']);
        msg.content = await _crypto.decryptMessage(msg.content, chatId);
        if (optimisticMessage != null) {
          optimisticMessage.status = msg.status;
        }
        return msg;
      }

      // 6. upload succeeded — encrypt the url too
      final url = uploadRes['url']?.toString() ?? '';
      final path = uploadRes['path']?.toString();
      final encryptedUrl = await _encryptForChat(url, chatType, recipientUserId, chatId);

      final data = await _api.post('/api/$chatId/messages', body: {
        'content': encryptedUrl,
        'type': type,
        if (replyToId != null) 'replyToId': replyToId,
        if (duration != null) 'duration': duration,
        if (expiresIn != null) 'expiresIn': expiresIn,
        if (path != null) 'attachmentPath': path,
        if (activeTempId != null) 'tempId': activeTempId,
      });
      var msg = Message.fromJson(data['message']);
      // decrypt own echo for local display
      msg.content = await _crypto.decryptMessage(msg.content, chatId);
      if (optimisticMessage != null) {
        optimisticMessage.status = msg.status;
      }
      return msg;
    } catch (e) {
      if (optimisticMessage != null) {
        optimisticMessage.status = 'failed';
      }
      rethrow;
    }
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
    try {
      await _api.post('/api/$chatId/messages/delivered');
    } catch (_) {
      // Graceful error handling for offline/network issues
    }
  }

  Future<void> markRead(String chatId, String messageId) async {
    try {
      await _api.post('/api/$chatId/messages/read?messageId=$messageId');
    } catch (_) {
      try {
        await _api.post('/api/$chatId/mark-read');
      } catch (_) {
        // Graceful error handling for offline/network issues
      }
    }
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

  Future<Chat> createGroup({
    required String type, // group or channel
    required String title,
    String? description,
    String? avatarEmoji,
    String? avatarColor,
    required List<String> memberIds,
    int? expiresInDays,
    Map<String, String>? memberKeys,
  }) async {
    final data = await _api.post('/api/chats', body: {
      'type': type,
      'title': title,
      if (description != null) 'description': description,
      if (avatarEmoji != null) 'avatarEmoji': avatarEmoji,
      if (avatarColor != null) 'avatarColor': avatarColor,
      'memberIds': memberIds,
      if (expiresInDays != null) 'expiresInDays': expiresInDays,
      if (memberKeys != null) 'memberKeys': memberKeys,
    });
    return Chat.fromJson(data['chat']);
  }

  Future<String?> getUserEncryptionKey(String userId) async {
    try {
      final data = await _api.get('/api/keys/$userId');
      return data['identity_public_key'];
    } catch (_) {
      return null;
    }
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

  // null fields are omitted — backend treats absent as "no change".
  // accepts the full editable field set (backend takes camelCase or snake).
  Future<void> updateProfile({
    String? name,
    String? bio,
    String? avatarEmoji,
    String? avatarColor,
    String? accentColor,
    String? wallpaper,
  }) async {
    await _api.patch('/api/users/me', body: {
      if (name != null) 'name': name,
      if (bio != null) 'bio': bio,
      if (avatarEmoji != null) 'avatarEmoji': avatarEmoji,
      if (avatarColor != null) 'avatarColor': avatarColor,
      if (accentColor != null) 'accentColor': accentColor,
      if (wallpaper != null) 'wallpaper': wallpaper,
    });
  }
}
