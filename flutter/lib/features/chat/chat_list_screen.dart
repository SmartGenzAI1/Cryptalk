import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/socket_service.dart';
import '../../core/models.dart';
import '../../core/ui/avatar.dart';
import 'chat_view_screen.dart';
import 'new_chat_screen.dart';
import '../connections/connections_screen.dart';
import '../settings/settings_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  List<Chat> _chats = [];
  bool _loading = true;
  bool _refreshing = false;
  String? _error;
  final _searchController = TextEditingController();

  /// Subscription IDs returned by `SocketService.on*` — cancelled in
  /// `dispose` so we remove ONLY this screen's listeners (L3 fix).
  final List<int> _socketSubIds = [];

  @override
  void initState() {
    super.initState();
    // L7 fix: register socket callbacks ONCE here, not inside `_loadChats`
    // (which runs on every refresh and previously accumulated N copies of
    // each callback per event).
    _initSocket();
    _loadChats();
  }

  Future<void> _initSocket() async {
    final auth = context.read<AuthService>();
    final chatService = context.read<ChatService>();
    final socket = context.read<SocketService>();
    final user = auth.currentUser;
    if (user == null) return;

    // Make sure the cookie is loaded from secure storage before reading the
    // session token out of it.
    await chatService.api.init();
    if (!mounted) return;
    final token = chatService.api.sessionToken;
    if (token == null) return;

    // Register the listeners BEFORE connecting so they're tracked in
    // `_socketSubIds` even if the widget disposes during the connect() call.
    _socketSubIds.add(socket.onMessage((data) {
      if (mounted) _loadChats();
    }));
    _socketSubIds.add(socket.onUserStatus((_) {
      if (mounted) setState(() {});
    }));

    // L10/X5 fix: connect with the session token so the backend can
    // authenticate the socket; reconnect automatically if the user changed.
    await socket.connect(user.id, token);
  }

  Future<void> _loadChats({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loading = true);
    try {
      final chatService = context.read<ChatService>();
      final auth = context.read<AuthService>();
      final chats = await chatService.getChats();
      if (mounted) {
        setState(() {
          _chats = chats;
          _loading = false;
          _error = null;
        });
      }

      // Kick off E2EE init in the background — don't block the UI on it.
      auth.initE2EE();
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    setState(() => _refreshing = true);
    try {
      final chats = await context.read<ChatService>().getChats();
      if (mounted) {
        setState(() {
          _chats = chats;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'Refresh failed: ${e.toString().replaceFirst('Exception: ', '')}'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  String _getDisplayTitle(Chat chat, AppUser? currentUser) {
    if (chat.type == 'saved') return 'Saved Messages';
    if (chat.type == 'direct') {
      final other =
          chat.members.where((m) => m.user.id != currentUser?.id).firstOrNull;
      return other?.user.name ?? chat.title;
    }
    return chat.title;
  }

  String _getDisplaySubtitle(Chat chat, AppUser? currentUser) {
    final last = chat.lastMessage;
    if (last == null) {
      return chat.type == 'direct'
          ? 'Tap to start chatting'
          : (chat.description.isEmpty ? 'No messages yet' : chat.description);
    }
    if (last.type == 'image') return '📷 Photo';
    if (last.type == 'voice') return '🎤 Voice message';
    if (last.type == 'file') return '📎 File';
    if (last.type == 'sticker') return 'Sticker';
    final senderPrefix = chat.type == 'direct'
        ? ''
        : (last.senderId == currentUser?.id ? 'You: ' : '${last.senderName}: ');
    return '$senderPrefix${last.content}';
  }

  @override
  void dispose() {
    // L3 fix: cancel ONLY this screen's socket subscriptions.
    final socket = SocketService();
    for (final id in _socketSubIds) {
      socket.cancelSubscription(id);
    }
    _socketSubIds.clear();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final currentUser = auth.currentUser;
    final query = _searchController.text.toLowerCase();
    final filtered = query.isEmpty
        ? _chats
        : _chats.where((c) {
            final title = _getDisplayTitle(c, currentUser).toLowerCase();
            return title.contains(query);
          }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cryptalk'),
        actions: [
          IconButton(
            tooltip: 'Connections',
            icon: const Icon(Icons.people_outline),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const ConnectionsScreen()),
            ),
          ),
          IconButton(
            tooltip: 'Settings',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              );
              // Refresh in case the user logged out from settings.
              if (mounted) _loadChats(silent: true);
            },
          ),
          PopupMenuButton<String>(
            tooltip: 'More',
            icon: const Icon(Icons.more_vert),
            onSelected: (value) async {
              if (value == 'logout') {
                await auth.logout();
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: 'logout',
                child: ListTile(
                  leading: Icon(Icons.logout, color: Colors.red),
                  title: Text('Sign out',
                      style: TextStyle(color: Colors.red)),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
              ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          await Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const NewChatScreen()),
          );
          if (mounted) _loadChats(silent: true);
        },
        icon: const Icon(Icons.edit_outlined),
        label: const Text('New Chat'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: TextField(
              controller: _searchController,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Search chats...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear',
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          setState(() {});
                        },
                      ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                filled: true,
              ),
            ),
          ),
          Expanded(
            child: _buildBody(filtered, currentUser),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(List<Chat> filtered, AppUser? currentUser) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _ErrorState(
        message: _error!,
        onRetry: () => _loadChats(),
      );
    }
    if (filtered.isEmpty) {
      return _EmptyState(
        hasChats: _chats.isNotEmpty,
        query: _searchController.text,
      );
    }
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.separated(
        // Guarantee the list is scrollable even with 1 item so
        // RefreshIndicator works.
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(vertical: 4),
        itemCount: filtered.length,
        separatorBuilder: (_, __) => const Divider(height: 1, indent: 76),
        itemBuilder: (context, index) {
          final chat = filtered[index];
          final title = _getDisplayTitle(chat, currentUser);
          final subtitle = _getDisplaySubtitle(chat, currentUser);
          final avatarEmoji = chat.type == 'direct'
              ? (chat.members
                      .where((m) => m.user.id != currentUser?.id)
                      .firstOrNull
                      ?.user
                      .avatarEmoji ??
                  chat.avatarEmoji)
              : chat.avatarEmoji;
          final avatarColor = chat.type == 'direct'
              ? (chat.members
                      .where((m) => m.user.id != currentUser?.id)
                      .firstOrNull
                      ?.user
                      .avatarColor ??
                  chat.avatarColor)
              : chat.avatarColor;
          final last = chat.lastMessage;
          return ListTile(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            leading: AvatarIcon(
              iconKey: avatarEmoji,
              colorName: avatarColor,
              size: 48,
            ),
            title: Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                if (last != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text(
                      _formatListTime(last.createdAt),
                      style: const TextStyle(
                        fontSize: 12,
                        color: Colors.grey,
                      ),
                    ),
                  ),
              ],
            ),
            subtitle: Row(
              children: [
                Expanded(
                  child: Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: chat.unreadCount > 0
                          ? null
                          : Colors.grey[400],
                      fontWeight:
                          chat.unreadCount > 0 ? FontWeight.w600 : null,
                    ),
                  ),
                ),
                if (chat.unreadCount > 0)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Badge(
                      label: Text('${chat.unreadCount}'),
                    ),
                  ),
              ],
            ),
            onTap: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ChatViewScreen(chat: chat),
                ),
              );
              if (mounted) _loadChats(silent: true);
            },
          );
        },
      ),
    );
  }
}

String _formatListTime(String iso) {
  try {
    final dt = DateTime.parse(iso);
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inHours < 1) return '${diff.inMinutes}m';
    if (dt.day == now.day) {
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    if (dt.year == now.year) {
      return '${dt.day}/${dt.month}';
    }
    return '${dt.day}/${dt.month}/${dt.year}';
  } catch (_) {
    return '';
  }
}

class _EmptyState extends StatelessWidget {
  final bool hasChats;
  final String query;
  const _EmptyState({required this.hasChats, required this.query});

  @override
  Widget build(BuildContext context) {
    // Different copy for "no chats yet" vs "no search results".
    final filtering = query.isNotEmpty;
    final icon = filtering ? Icons.search_off : Icons.chat_bubble_outline;
    final title = filtering ? 'No matches' : 'No chats yet';
    final body = filtering
        ? 'Try a different search.'
        : 'Tap the button below to start your first conversation.';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 72, color: Colors.grey[500]),
            const SizedBox(height: 16),
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.grey[400],
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              body,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Colors.grey[500]),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off, size: 72, color: Colors.red[300]),
            const SizedBox(height: 16),
            Text(
              'Could not load chats',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.grey),
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 16),
            FilledButton.tonalIcon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
