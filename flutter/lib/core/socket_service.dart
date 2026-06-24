import 'dart:async';
import 'dart:convert';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'api_config.dart';

class SocketService {
  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;
  SocketService._internal();

  IO.Socket? _socket;
  bool _connected = false;
  final List<void Function(Map<String, dynamic>)> _messageCallbacks = [];
  final List<void Function(Map<String, dynamic>)> _userStatusCallbacks = [];
  final List<void Function(Map<String, dynamic>)> _typingCallbacks = [];
  final List<void Function(Map<String, dynamic>)> _messageUpdateCallbacks = [];

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

    _socket!.on('message', (data) {
      for (final cb in _messageCallbacks) {
        cb(data as Map<String, dynamic>);
      }
    });

    _socket!.on('user-status', (data) {
      for (final cb in _userStatusCallbacks) {
        cb(data as Map<String, dynamic>);
      }
    });

    _socket!.on('typing', (data) {
      for (final cb in _typingCallbacks) {
        cb(data as Map<String, dynamic>);
      }
    });

    _socket!.on('message-update', (data) {
      for (final cb in _messageUpdateCallbacks) {
        cb(data as Map<String, dynamic>);
      }
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
    _messageCallbacks.add(callback);
  }

  void onUserStatus(void Function(Map<String, dynamic>) callback) {
    _userStatusCallbacks.add(callback);
  }

  void onTyping(void Function(Map<String, dynamic>) callback) {
    _typingCallbacks.add(callback);
  }

  void onMessageUpdate(void Function(Map<String, dynamic>) callback) {
    _messageUpdateCallbacks.add(callback);
  }

  void clearCallbacks() {
    _messageCallbacks.clear();
    _userStatusCallbacks.clear();
    _typingCallbacks.clear();
    _messageUpdateCallbacks.clear();
  }

  void disconnect() {
    clearCallbacks();
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _connected = false;
  }
}
