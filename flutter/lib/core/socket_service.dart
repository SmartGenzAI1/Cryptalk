import 'dart:convert';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'api_config.dart';

class SocketService {
  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;
  SocketService._internal();

  IO.Socket? _socket;
  bool _connected = false;

  bool get isConnected => _connected;
  IO.Socket? get socket => _socket;

  void connect(String userId, String username) {
    if (_socket != null) return;

    _socket = IO.io(ApiConfig.wsUrl, {
      'transports': ['websocket', 'polling'],
      'forceNew': true,
      'reconnection': true,
      'reconnectionAttempts': -1,
      'reconnectionDelay': 1000,
    });

    _socket!.onConnect((_) {
      _connected = true;
      _socket!.emit('identify', {'userId': userId, 'username': username});
    });

    _socket!.onDisconnect((_) {
      _connected = false;
    });
  }

  void joinChat(String chatId) {
    _socket?.emit('join-chat', {'chatId': chatId});
  }

  void sendMessage(String chatId, Map<String, dynamic> message) {
    _socket?.emit('send-message', {'chatId': chatId, 'message': message});
  }

  void sendTyping(String chatId, String userId, String username, bool isTyping) {
    _socket?.emit('typing', {
      'chatId': chatId,
      'userId': userId,
      'username': username,
      'isTyping': isTyping,
    });
  }

  void onMessage(void Function(Map<String, dynamic>) callback) {
    _socket?.on('message', (data) => callback(data as Map<String, dynamic>));
  }

  void onUserStatus(void Function(Map<String, dynamic>) callback) {
    _socket?.on('user-status', (data) => callback(data as Map<String, dynamic>));
  }

  void onTyping(void Function(Map<String, dynamic>) callback) {
    _socket?.on('typing', (data) => callback(data as Map<String, dynamic>));
  }

  void onMessageUpdate(void Function(Map<String, dynamic>) callback) {
    _socket?.on('message-update', (data) => callback(data as Map<String, dynamic>));
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _connected = false;
  }
}
