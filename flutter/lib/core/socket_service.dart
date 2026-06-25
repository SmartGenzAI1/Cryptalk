import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'api_config.dart';

/// Singleton realtime socket manager.
///
/// Subscriptions are tracked per-caller via integer IDs returned from the
/// `on*` methods. Each screen registers its listeners in `initState` and
/// cancels ONLY its own IDs in `dispose` — this fixes the L3 footgun where
/// `clearCallbacks()` would wipe another screen's listeners.
///
/// The socket `identify` event carries the session `token` (the value of the
/// `tc_session` cookie) so the backend can authenticate the connection (X5
/// fix). The backend derives the userId from the token; the `userId` field in
/// the identify payload is now ignored server-side and kept only for
/// client-side diagnostics.
///
/// `connect(userId, token)` is idempotent for the same user, and tears down /
/// reconnects when the user changes (L10 fix) — e.g. after logout+login as a
/// different account.
class SocketService {
  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;
  SocketService._internal();

  IO.Socket? _socket;
  bool _connected = false;
  String? _currentUserId;

  // Per-event subscription maps: subscriptionId → callback. Using a Map (not
  // a List) so any single ID can be removed in O(1) without disturbing others.
  int _nextSubId = 0;
  final Map<int, void Function(Map<String, dynamic>)> _messageCallbacks = {};
  final Map<int, void Function(Map<String, dynamic>)> _userStatusCallbacks = {};
  final Map<int, void Function(Map<String, dynamic>)> _typingCallbacks = {};
  final Map<int, void Function(Map<String, dynamic>)> _messageUpdateCallbacks = {};

  bool get isConnected => _connected;
  IO.Socket? get socket => _socket;

  /// Connect (or reconnect) the socket for [userId], authenticated via the
  /// session [token] (the value of the `tc_session` cookie).
  ///
  /// - If a socket already exists for the same user and is connected, this is
  ///   a no-op.
  /// - If a socket exists for a *different* user (or in a stale state), it is
  ///   torn down first via [disconnect] before opening a fresh connection
  ///   (L10 fix).
  Future<void> connect(String userId, String token) async {
    if (_socket != null && _currentUserId == userId && _connected) {
      // Already connected as this user — nothing to do.
      return;
    }
    if (_socket != null) {
      // Different user, or stale socket — tear down + clear all subscriptions
      // (the previous user's listeners are no longer relevant).
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
      // X5 fix: send the session token so the backend can authenticate the
      // socket. The backend derives the userId from the token; the userId
      // field here is only for client-side diagnostics and is NOT trusted by
      // the server.
      _socket!.emit('identify', {'userId': userId, 'token': token});
    });

    _socket!.onDisconnect((_) {
      _connected = false;
    });

    _socket!.on('message', (data) {
      // Snapshot to a List first so a callback that calls cancelSubscription
      // during iteration doesn't ConcurrentModificationError us.
      for (final cb in _messageCallbacks.values.toList()) {
        cb(data as Map<String, dynamic>);
      }
    });

    _socket!.on('user-status', (data) {
      for (final cb in _userStatusCallbacks.values.toList()) {
        cb(data as Map<String, dynamic>);
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

  /// Subscribe to inbound `message` events. Returns a subscription ID —
  /// pass it to [cancelSubscription] in your widget's `dispose` to remove
  /// ONLY this callback (L3 fix).
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

  /// Remove a single subscription previously returned from one of the `on*`
  /// methods. Safe to call with an unknown ID (no-op). Looks the ID up across
  /// all four event maps so callers don't need to remember which event they
  /// subscribed to.
  void cancelSubscription(int id) {
    _messageCallbacks.remove(id);
    _userStatusCallbacks.remove(id);
    _typingCallbacks.remove(id);
    _messageUpdateCallbacks.remove(id);
  }

  /// Tear down the socket and clear ALL subscriptions. Only call this on
  /// logout / account deletion / user-switch — NEVER from a per-screen
  /// `dispose()` (that would wipe other screens' listeners, which is the L3
  /// footgun the per-subscription API exists to avoid).
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
  }
}
