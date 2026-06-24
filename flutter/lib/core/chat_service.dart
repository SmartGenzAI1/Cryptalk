import 'api_client.dart';
import 'models.dart';
import 'crypto_service.dart';

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
    for (final m in messages) {
      if (m.type == 'text' || m.type == 'image' || m.type == 'file' || m.type == 'voice') {
        m.content = await _crypto.decrypt(m.content);
      }
    }
    return messages;
  }

  Future<Message> sendMessage(String chatId, String content, {String type = 'text', String? replyToId, int? expiresIn}) async {
    String encrypted = content;
    if (type == 'text') {
      encrypted = await _crypto.encrypt(content, _crypto.publicKeyBase64);
    }
    final data = await _api.post('/api/$chatId/messages', body: {
      'content': encrypted,
      'type': type,
      if (replyToId != null) 'replyToId': replyToId,
      if (expiresIn != null) 'expiresIn': expiresIn,
    });
    var msg = Message.fromJson(data['message']);
    if (msg.type == 'text') {
      msg.content = await _crypto.decrypt(msg.content);
    }
    return msg;
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
