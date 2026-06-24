import 'api_client.dart';
import 'models.dart';
import 'crypto_service.dart';

class ChatService {
  final _api = ApiClient();
  final _crypto = CryptoService();

  Future<List<Chat>> getChats() async {
    final data = await _api.get('/api/chats');
    final chats = (data['chats'] as List).map((c) => Chat.fromJson(c)).toList();
    return chats;
  }

  Future<List<Message>> getMessages(String chatId, {int limit = 50}) async {
    final data = await _api.get('/api/$chatId/messages?limit=$limit');
    var messages = (data['messages'] as List).map((m) => Message.fromJson(m)).toList();
    for (final m in messages) {
      if (m.type == 'text') {
        m.content = await _crypto.decrypt(m.content);
      }
    }
    return messages;
  }

  Future<Message> sendMessage(String chatId, String content, {String type = 'text', int? expiresIn}) async {
    String encrypted = content;
    if (type == 'text') {
      encrypted = await _crypto.encrypt(content, _crypto.publicKeyBase64);
    }
    final data = await _api.post('/api/$chatId/messages', body: {
      'content': encrypted,
      'type': type,
      if (expiresIn != null) 'expiresIn': expiresIn,
    });
    var msg = Message.fromJson(data['message']);
    if (msg.type == 'text') {
      msg.content = await _crypto.decrypt(msg.content);
    }
    return msg;
  }

  Future<Chat> createDirectChat(String userId) async {
    final data = await _api.post('/api/chats', body: {
      'type': 'direct',
      'memberIds': [userId],
    });
    return Chat.fromJson(data['chat']);
  }

  Future<Chat> createGroup(String title, List<String> memberIds, {String? emoji, String? color, int? expiresInDays}) async {
    final data = await _api.post('/api/chats', body: {
      'type': 'group',
      'title': title,
      'memberIds': memberIds,
      if (emoji != null) 'avatarEmoji': emoji,
      if (color != null) 'avatarColor': color,
      if (expiresInDays != null) 'expiresInDays': expiresInDays,
    });
    return Chat.fromJson(data['chat']);
  }

  Future<void> pinChat(String chatId, bool pin) async {
    await _api.patch('/api/chats/$chatId/settings', body: {'action': 'pin', 'value': pin});
  }

  Future<void> muteChat(String chatId, bool mute) async {
    await _api.patch('/api/chats/$chatId/settings', body: {'action': 'mute', 'value': mute});
  }

  Future<void> deleteMessage(String chatId, String messageId) async {
    await _api.delete('/api/$chatId/messages?messageId=$messageId');
  }

  Future<void> markDelivered(String chatId) async {
    await _api.post('/api/$chatId/messages/delivered');
  }

  Future<List<AppUser>> searchUsers(String query) async {
    final data = await _api.get('/api/users/search?q=${Uri.encodeComponent(query)}');
    return (data['users'] as List).map((u) => AppUser.fromJson(u)).toList();
  }
}
