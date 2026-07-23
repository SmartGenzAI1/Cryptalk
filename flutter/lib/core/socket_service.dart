import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'api_config.dart';

// singleton realtime socket. subscriptions are tracked per-caller via int
// ids returned from on* methods — each screen registers in initState and
// cancels only its own ids in dispose.
//
// connect() is idempotent for the same user and tears down + reconnects
// when the user changes (e.g. after logout+login as a different account).
class SocketService {
  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;
  SocketService._internal();

  io.Socket? _socket;
  bool _connected = false;
  String? _currentUserId;
  String? _currentToken;
  String? _activeChatId;

  // Track online user IDs matching web app presence model
  final Set<String> _onlineUserIds = {};

  Set<String> get onlineUserIds => Set.unmodifiable(_onlineUserIds);
  bool isUserOnline(String userId) => _onlineUserIds.contains(userId);

  // Receiver-side typing timers: '${chatId}:${userId}' -> Timer
  final Map<String, Timer> _typingTimers = {};

  // subscription maps: subId → callback. Map (not List) so removal is O(1)
  int _nextSubId = 0;
  final Map<int, void Function(Map<String, dynamic>)> _messageCallbacks = {};
  final Map<int, void Function(Map<String, dynamic>)> _userStatusCallbacks = {};
  final Map<int, void Function(Map<String, dynamic>)> _typingCallbacks = {};
  final Map<int, void Function(Map<String, dynamic>)> _messageUpdateCallbacks = {};
  final Map<int, void Function(Map<String, dynamic>)> _messageStatusCallbacks = {};

  bool get isConnected => _connected;
  io.Socket? get socket => _socket;
  String? get currentToken => _currentToken;
  String? get activeChatId => _activeChatId;

  // connect (or reconnect) for userId, authenticated via session token.
  // no-op if already connected as same user; tears down + reconnects if the
  // user changed.
  Future<void> connect(String userId, String token) async {
    if (_socket != null && _currentUserId == userId && _connected) {
      return;
    }
    if (_socket != null) {
      // different user or stale socket — tear down + clear subscriptions
      disconnect();
    }
    _currentUserId = userId;
    _currentToken = token;

    _socket = io.io(ApiConfig.wsUrl, {
      'transports': ['websocket', 'polling'],
      'reconnection': true,
      'reconnectionAttempts': -1,
      'reconnectionDelay': 1000,
      'reconnectionDelayMax': 5000,
    });

    void handleConnect() {
      _connected = true;
      // send session token so backend authenticates the socket. userId here
      // is just for client-side diagnostics, server derives it from the token
      _socket!.emit('identify', {'userId': userId, 'token': token});

      // Automatic room re-joining on connect/reconnect
      if (_activeChatId != null) {
        _socket!.emit('join-chat', {'chatId': _activeChatId});
      }
      for (final cb in _userStatusCallbacks.values.toList()) {
        cb({'connected': true});
      }
    }

    _socket!.onConnect((_) => handleConnect());
    _socket!.on('reconnect', (_) => handleConnect());

    _socket!.onDisconnect((_) {
      _connected = false;
      for (final cb in _userStatusCallbacks.values.toList()) {
        cb({'connected': false});
      }
    });

    _socket!.on('message', (data) {
      if (data is Map) {
        final mapData = Map<String, dynamic>.from(data);
        for (final cb in _messageCallbacks.values.toList()) {
          cb(mapData);
        }
      }
    });

    _socket!.on('presence', (data) {
      if (data is Map && data['users'] is List) {
        _onlineUserIds.clear();
        final usersList = data['users'] as List;
        for (final u in usersList) {
          if (u is Map && u['userId'] != null && u['isOnline'] == true) {
            _onlineUserIds.add(u['userId'].toString());
          }
        }
        final mapData = Map<String, dynamic>.from(data);
        for (final cb in _userStatusCallbacks.values.toList()) {
          cb(mapData);
        }
      }
    });

    _socket!.on('user-status', (data) {
      if (data is Map && data['userId'] != null) {
        final uid = data['userId'].toString();
        final online = data['isOnline'] == true;
        if (online) {
          _onlineUserIds.add(uid);
        } else {
          _onlineUserIds.remove(uid);
        }
        final mapData = Map<String, dynamic>.from(data);
        for (final cb in _userStatusCallbacks.values.toList()) {
          cb(mapData);
        }
      }
    });

    _socket!.on('typing', (data) => _handleTypingOrRecording(data));
    _socket!.on('recording', (data) => _handleTypingOrRecording(data));

    _socket!.on('message-update', (data) {
      if (data is Map) {
        final mapData = Map<String, dynamic>.from(data);
        for (final cb in _messageUpdateCallbacks.values.toList()) {
          cb(mapData);
        }
      }
    });

    _socket!.on('message-status', (data) {
      if (data is Map) {
        final mapData = Map<String, dynamic>.from(data);
        for (final cb in _messageStatusCallbacks.values.toList()) {
          cb(mapData);
        }
      }
    });
  }

  void _handleTypingOrRecording(dynamic data) {
    if (data is! Map) return;
    final mapData = Map<String, dynamic>.from(data);
    final chatId = mapData['chatId']?.toString();
    final userId = mapData['userId']?.toString() ?? mapData['username']?.toString();
    final isTyping = mapData['isTyping'] == true || mapData['isRecording'] == true;

    if (chatId != null && userId != null) {
      final key = '$chatId:$userId';
      _typingTimers[key]?.cancel();
      _typingTimers.remove(key);

      if (isTyping) {
        // receiver-side 3.5s safety typing auto-clear timeout
        _typingTimers[key] = Timer(const Duration(milliseconds: 3500), () {
          _typingTimers.remove(key);
          final clearedData = Map<String, dynamic>.from(mapData)
            ..['isTyping'] = false
            ..['isRecording'] = false;
          for (final cb in _typingCallbacks.values.toList()) {
            cb(clearedData);
          }
        });
      }
    }

    for (final cb in _typingCallbacks.values.toList()) {
      cb(mapData);
    }
  }

  void joinChat(String chatId) {
    if (_activeChatId != null && _activeChatId != chatId) {
      leaveChat(chatId: _activeChatId);
    }
    _activeChatId = chatId;
    _socket?.emit('join-chat', {'chatId': chatId});
  }

  void leaveChat({String? chatId}) {
    final targetId = chatId ?? _activeChatId;
    if (targetId != null) {
      _socket?.emit('leave-chat', {'chatId': targetId});
    }
    if (chatId == null || _activeChatId == chatId) {
      _activeChatId = null;
    }
  }

  void sendMessage(String chatId, Map<String, dynamic> message) {
    _socket?.emit('send-message', {'chatId': chatId, 'message': message});
  }

  void sendMessageStatus(
    String chatId,
    String status, {
    String? messageId,
    String? attachmentPath,
  }) {
    _socket?.emit('message-status', {
      'chatId': chatId,
      'status': status,
      if (messageId != null) 'messageId': messageId,
      if (attachmentPath != null) 'attachmentPath': attachmentPath,
    });
  }

  void sendTyping(String chatId, String userId, String username, bool isTyping) {
    _socket?.emit('typing', {
      'chatId': chatId,
      'userId': userId,
      'username': username,
      'isTyping': isTyping,
    });
  }

  void sendRecording(String chatId, String userId, String username, bool isRecording) {
    _socket?.emit('recording', {
      'chatId': chatId,
      'userId': userId,
      'username': username,
      'isRecording': isRecording,
    });
  }

  // subscribe to message events. returns a sub id — pass it to
  // cancelSubscription in dispose to remove just this callback
  int onMessage(void Function(Map<String, dynamic>) callback) {
    final id = _nextSubId++;
    _messageCallbacks[id] = callback;
    return id;
  }

  int onUserStatus(void Function(Map<String, dynamic>) callback) {
    final id = _nextSubId++;
    _userStatusCallbacks[id] = callback;
    return id;
  }

  int onTyping(void Function(Map<String, dynamic>) callback) {
    final id = _nextSubId++;
    _typingCallbacks[id] = callback;
    return id;
  }

  int onMessageUpdate(void Function(Map<String, dynamic>) callback) {
    final id = _nextSubId++;
    _messageUpdateCallbacks[id] = callback;
    return id;
  }

  int onMessageStatus(void Function(Map<String, dynamic>) callback) {
    final id = _nextSubId++;
    _messageStatusCallbacks[id] = callback;
    return id;
  }

  // remove a single subscription. no-op if id unknown. looks up across all
  // event maps so callers don't track which event they subscribed to.
  void cancelSubscription(int id) {
    _messageCallbacks.remove(id);
    _userStatusCallbacks.remove(id);
    _typingCallbacks.remove(id);
    _messageUpdateCallbacks.remove(id);
    _messageStatusCallbacks.remove(id);
  }

  // tear down socket + clear ALL subscriptions. only call on logout / account
  // deletion / user-switch — NEVER from a per-screen dispose (that would
  // wipe other screens' listeners)
  void disconnect() {
    _clearAllForLogout();
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _connected = false;
    _currentUserId = null;
    _currentToken = null;
    _activeChatId = null;
  }

  void _clearAllForLogout() {
    _messageCallbacks.clear();
    _userStatusCallbacks.clear();
    _typingCallbacks.clear();
    _messageUpdateCallbacks.clear();
    _messageStatusCallbacks.clear();
    _onlineUserIds.clear();

    for (final timer in _typingTimers.values) {
      timer.cancel();
    }
    _typingTimers.clear();
  }
}

