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

  Future<void> deleteMessage(String chatId, String messageId, {bool forEveryone = false}) async {
    await _api.delete('/api/$chatId/messages?messageId=$messageId${forEveryone ? '&forEveryone=true' : ''}');
  }

  Future<void> markDelivered(String chatId) async {
    await _api.post('/api/$chatId/messages/delivered');
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
}
