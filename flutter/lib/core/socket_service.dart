import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as IO;
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

  IO.Socket? _socket;
  bool _connected = false;
  String? _currentUserId;

  // Track online user IDs
  final Set<String> _onlineUserIds = {};

  bool isUserOnline(String userId) => _onlineUserIds.contains(userId);

  // subscription maps: subId → callback. Map (not List) so removal is O(1)
  int _nextSubId = 0;
  final Map<int, void Function(Map<String, dynamic>)> _messageCallbacks = {};
  final Map<int, void Function(Map<String, dynamic>)> _userStatusCallbacks = {};
  final Map<int, void Function(Map<String, dynamic>)> _typingCallbacks = {};
  final Map<int, void Function(Map<String, dynamic>)> _messageUpdateCallbacks = {};

  bool get isConnected => _connected;
  IO.Socket? get socket => _socket;

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

    _socket = IO.io(ApiConfig.wsUrl, {
      'transports': ['websocket', 'polling'],
      'forceNew': true,
      'reconnection': true,
      'reconnectionAttempts': -1,
      'reconnectionDelay': 1000,
    });

    _socket!.onConnect((_) {
      _connected = true;
      // send session token so backend authenticates the socket. userId here
      // is just for client-side diagnostics, server derives it from the token
      _socket!.emit('identify', {'userId': userId, 'token': token});
      for (final cb in _userStatusCallbacks.values.toList()) {
        cb({'connected': true});
      }
    });

    _socket!.onDisconnect((_) {
      _connected = false;
      for (final cb in _userStatusCallbacks.values.toList()) {
        cb({'connected': false});
      }
    });

    _socket!.on('message', (data) {
      // snapshot to a list so a callback that cancels during iteration
      // doesn't ConcurrentModificationError us
      for (final cb in _messageCallbacks.values.toList()) {
        cb(data as Map<String, dynamic>);
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
        for (final cb in _userStatusCallbacks.values.toList()) {
          cb({'userId': '', 'isOnline': true});
        }
      }
    });

    _socket!.on('user-status', (data) {
      if (data is Map && data['userId'] != null && data['isOnline'] != null) {
        final uid = data['userId'].toString();
        final online = data['isOnline'] as bool;
        if (online) {
          _onlineUserIds.add(uid);
        } else {
          _onlineUserIds.remove(uid);
        }
        for (final cb in _userStatusCallbacks.values.toList()) {
          cb(Map<String, dynamic>.from(data));
        }
      }
    });

    _socket!.on('typing', (data) {
      for (final cb in _typingCallbacks.values.toList()) {
        cb(data as Map<String, dynamic>);
      }
    });

    _socket!.on('message-update', (data) {
      for (final cb in _messageUpdateCallbacks.values.toList()) {
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

  // remove a single subscription. no-op if id unknown. looks up across all
  // four event maps so callers don't track which event they subscribed to.
  void cancelSubscription(int id) {
    _messageCallbacks.remove(id);
    _userStatusCallbacks.remove(id);
    _typingCallbacks.remove(id);
    _messageUpdateCallbacks.remove(id);
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
  }

  void _clearAllForLogout() {
    _messageCallbacks.clear();
    _userStatusCallbacks.clear();
    _typingCallbacks.clear();
    _messageUpdateCallbacks.clear();
    _onlineUserIds.clear();
  }
}
