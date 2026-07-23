import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/socket_service.dart';
import '../../core/models.dart';
import '../../core/ui/avatar.dart';
import 'chat_view_screen.dart';
import 'chat_info_screen.dart';
import 'new_chat_screen.dart';
import '../connections/connections_screen.dart';
import '../settings/settings_screen.dart';
import '../../main.dart';

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

  Chat? _activeChat;
  bool _settingsOpen = false;
  bool _connectionsOpen = false;
  bool _infoOpen = false;

  // socket sub ids — cancelled in dispose so we only remove this screen's
  // listeners
  final List<int> _socketSubIds = [];

  @override
  void initState() {
    super.initState();
    // register socket callbacks ONCE here, not inside _loadChats (which runs
    // on every refresh and would accumulate N copies of each callback)
    _initSocket();
    _loadChats();
  }

  Future<void> _initSocket() async {
    final auth = context.read<AuthService>();
    final chatService = context.read<ChatService>();
    final socket = context.read<SocketService>();
    final user = auth.currentUser;
    if (user == null) return;

    // make sure the cookie is loaded from secure storage before reading the
    // session token
    await chatService.api.init();
    if (!mounted) return;
    final token = chatService.api.sessionToken;
    if (token == null) return;

    // register listeners BEFORE connecting so they're tracked even if the
    // widget disposes during connect()
    _socketSubIds.add(socket.onMessage((data) {
      if (mounted) _loadChats();
    }));
    _socketSubIds.add(socket.onMessageUpdate((_) {
      if (mounted) _loadChats(silent: true);
    }));
    _socketSubIds.add(socket.onUserStatus((_) {
      if (mounted) setState(() {});
    }));

    // connect with session token so backend authenticates; reconnect if user changed
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

      // kick off e2ee init in the background — don't block the ui on it
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
    // cancel ONLY this screen's socket subs
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

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 768) {
          return Scaffold(
            body: Row(
              children: [
                // 1. Sidebar (width: 68)
                _buildSidebar(context, auth, currentUser),
                
                // 2. ChatList (width: 360)
                Container(
                  width: 360,
                  decoration: BoxDecoration(
                    border: Border(
                      right: BorderSide(
                        color: Theme.of(context).colorScheme.outlineVariant,
                      ),
                    ),
                  ),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
                        child: Row(
                          children: [
                            Text(
                              'Chats',
                              style: Theme.of(context)
                                  .textTheme
                                  .headlineMedium
                                  ?.copyWith(fontWeight: FontWeight.bold),
                            ),
                            const Spacer(),
                            IconButton(
                              icon: const Icon(Icons.add),
                              tooltip: 'New Chat',
                              onPressed: _showNewChatDialog,
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
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
                              borderRadius: BorderRadius.circular(20),
                            ),
                            contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
                            filled: true,
                          ),
                        ),
                      ),
                      Expanded(
                        child: _buildBody(filtered, currentUser),
                      ),
                    ],
                  ),
                ),
                
                // 3. ChatWindow (Expanded)
                Expanded(
                  child: _activeChat == null
                      ? _buildWelcomePlaceholder(context)
                      : ChatViewScreen(
                          key: ValueKey(_activeChat!.id),
                          chat: _activeChat!,
                          isInline: true,
                          onToggleInfo: () {
                            setState(() {
                              _infoOpen = !_infoOpen;
                              _settingsOpen = false;
                              _connectionsOpen = false;
                            });
                          },
                        ),
                ),
                
                // 4. Side Panels (width: 380)
                if (_infoOpen && _activeChat != null)
                  Container(
                    width: 380,
                    decoration: BoxDecoration(
                      border: Border(
                        left: BorderSide(
                          color: Theme.of(context).colorScheme.outlineVariant,
                        ),
                      ),
                    ),
                    child: ChatInfoScreen(
                      key: ValueKey('info-${_activeChat!.id}'),
                      chat: _activeChat!,
                      messages: const [],
                      isInline: true,
                      onClose: () => setState(() => _infoOpen = false),
                    ),
                  ),
                
                if (_settingsOpen)
                  Container(
                    width: 380,
                    decoration: BoxDecoration(
                      border: Border(
                        left: BorderSide(
                          color: Theme.of(context).colorScheme.outlineVariant,
                        ),
                      ),
                    ),
                    child: SettingsScreen(
                      isInline: true,
                      onClose: () => setState(() => _settingsOpen = false),
                    ),
                  ),
                  
                if (_connectionsOpen)
                  Container(
                    width: 380,
                    decoration: BoxDecoration(
                      border: Border(
                        left: BorderSide(
                          color: Theme.of(context).colorScheme.outlineVariant,
                        ),
                      ),
                    ),
                    child: ConnectionsScreen(
                      isInline: true,
                      onClose: () => setState(() => _connectionsOpen = false),
                    ),
                  ),
              ],
            ),
          );
        } else {
          // Mobile Layout
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
      },
    );
  }

  void _showNewChatDialog() {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 500, maxHeight: 600),
          child: const NewChatScreen(),
        ),
      ),
    ).then((_) {
      if (mounted) _loadChats(silent: true);
    });
  }

  Widget _buildWelcomePlaceholder(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final baseBgColor = isDark ? const Color(0xFF0F171A) : const Color(0xFFF7FCF9);
    final accentColor = accentColors[context.watch<AuthService>().currentUser?.accentColor ?? 'emerald'] ?? const Color(0xFF10B981);
    
    return Container(
      color: baseBgColor,
      child: CustomPaint(
        painter: DotPatternPainter(color: accentColor.withValues(alpha: isDark ? 0.05 : 0.08)),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.08),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    padding: const EdgeInsets.all(12),
                    child: Image.asset(
                      'assets/logo.png',
                      fit: BoxFit.contain,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Welcome to Cryptalk',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Select a chat to start messaging, or create a new one. Your conversations are end-to-end real-time with presence and typing indicators.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Colors.grey[500],
                        ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Text(
                          '⚡ Real-time',
                          style: TextStyle(
                            color: Color(0xFF10B981),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF43F5E).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Text(
                          '😊 Reactions',
                          style: TextStyle(
                            color: Color(0xFFF43F5E),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.amber.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Text(
                          '🎙️ Voice',
                          style: TextStyle(
                            color: Colors.amber,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSidebar(BuildContext context, AuthService auth, AppUser? currentUser) {
    final socket = context.watch<SocketService>();
    final isConnected = socket.isConnected;
    
    return Container(
      width: 68,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        border: Border(
          right: BorderSide(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
        ),
      ),
      child: Column(
        children: [
          const SizedBox(height: 16),
          Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Image.asset(
                  'assets/logo.png',
                  fit: BoxFit.contain,
                ),
              ),
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: isConnected ? const Color(0xFF10B981) : Colors.amber,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Theme.of(context).colorScheme.surfaceContainerLow,
                      width: 2,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          _buildSidebarButton(
            icon: Icons.chat_bubble_outline,
            activeIcon: Icons.chat_bubble,
            isActive: !_settingsOpen && !_connectionsOpen,
            onTap: () {
              setState(() {
                _settingsOpen = false;
                _connectionsOpen = false;
              });
            },
            tooltip: 'Chats',
          ),
          const SizedBox(height: 8),
          _buildSidebarButton(
            icon: Icons.people_outline,
            activeIcon: Icons.people,
            isActive: _connectionsOpen,
            onTap: () {
              setState(() {
                _connectionsOpen = !_connectionsOpen;
                _settingsOpen = false;
              });
            },
            tooltip: 'Connections',
          ),
          const SizedBox(height: 8),
          _buildSidebarButton(
            icon: Icons.campaign_outlined,
            activeIcon: Icons.campaign,
            isActive: false,
            onTap: () {},
            tooltip: 'Channels',
          ),
          const SizedBox(height: 8),
          _buildSidebarButton(
            icon: Icons.bookmark_border,
            activeIcon: Icons.bookmark,
            isActive: false,
            onTap: () {},
            tooltip: 'Saved',
          ),
          const Spacer(),
          _buildSidebarButton(
            icon: Icons.settings_outlined,
            activeIcon: Icons.settings,
            isActive: _settingsOpen,
            onTap: () {
              setState(() {
                _settingsOpen = !_settingsOpen;
                _connectionsOpen = false;
              });
            },
            tooltip: 'Settings',
          ),
          const SizedBox(height: 8),
          IconButton(
            icon: Icon(
              Theme.of(context).brightness == Brightness.dark
                  ? Icons.wb_sunny_outlined
                  : Icons.nightlight_round_outlined,
            ),
            onPressed: () {
              final newMode = Theme.of(context).brightness == Brightness.dark
                  ? ThemeMode.light
                  : ThemeMode.dark;
              auth.setThemeMode(newMode);
            },
            tooltip: 'Toggle Theme',
          ),
          const SizedBox(height: 8),
          if (currentUser != null)
            GestureDetector(
              onTap: () {
                setState(() {
                  _settingsOpen = true;
                  _connectionsOpen = false;
                });
              },
              child: AvatarIcon(
                iconKey: currentUser.avatarEmoji,
                colorName: currentUser.avatarColor,
                size: 36,
                seed: currentUser.id,
              ),
            ),
          const SizedBox(height: 12),
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.red),
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Sign out?'),
                  content: const Text('You will need to sign back in to use Cryptalk.'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Sign out'),
                    ),
                  ],
                ),
              );
              if (confirmed == true) {
                await auth.logout();
              }
            },
            tooltip: 'Sign Out',
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildSidebarButton({
    required IconData icon,
    required IconData activeIcon,
    required bool isActive,
    required VoidCallback onTap,
    required String tooltip,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: isActive
                ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.15)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            isActive ? activeIcon : icon,
            color: isActive
                ? Theme.of(context).colorScheme.primary
                : Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
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

    final pinned = filtered.where((c) => c.pinnedAt != null).toList();
    final regular = filtered.where((c) => c.pinnedAt == null).toList();

    final List<Widget> listItems = [];

    if (pinned.isNotEmpty) {
      listItems.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(
            children: [
              Icon(Icons.push_pin, size: 14, color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: 6),
              Text(
                'PINNED',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.8,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
            ],
          ),
        ),
      );
      for (final chat in pinned) {
        listItems.add(_buildChatTile(chat, currentUser));
      }
      if (regular.isNotEmpty) {
        listItems.add(
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Divider(height: 1),
          ),
        );
      }
    }

    if (regular.isNotEmpty) {
      if (pinned.isNotEmpty) {
        listItems.add(
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Text(
              'ALL CHATS',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.8,
                color: Colors.grey[500],
              ),
            ),
          ),
        );
      }
      for (final chat in regular) {
        listItems.add(_buildChatTile(chat, currentUser));
      }
    }

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(vertical: 4),
        itemCount: listItems.length,
        itemBuilder: (context, index) => listItems[index],
      ),
    );
  }

  Widget _buildStatusIcon(BuildContext context, String status) {
    if (status == 'read') {
      return Icon(
        Icons.done_all,
        size: 15,
        color: Theme.of(context).colorScheme.primary,
      );
    } else if (status == 'delivered') {
      return const Icon(
        Icons.done_all,
        size: 15,
        color: Colors.grey,
      );
    } else {
      return const Icon(
        Icons.done,
        size: 15,
        color: Colors.grey,
      );
    }
  }

  Widget _buildChatTile(Chat chat, AppUser? currentUser) {
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
    final socket = context.read<SocketService>();
    final otherMember = chat.type == 'direct'
        ? chat.members.where((m) => m.user.id != currentUser?.id).firstOrNull
        : null;
    final isOnline = otherMember != null && socket.isUserOnline(otherMember.user.id);

    final isWide = MediaQuery.of(context).size.width >= 768;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      selected: isWide && _activeChat?.id == chat.id,
      selectedTileColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
      leading: AvatarIcon(
        iconKey: avatarEmoji,
        colorName: avatarColor,
        size: 48,
        online: isOnline,
        seed: otherMember?.user.id ?? chat.id,
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
        ],
      ),
      subtitle: Row(
        children: [
          if (last != null && last.senderId == currentUser?.id) ...[
            _buildStatusIcon(context, last.status),
            const SizedBox(width: 4),
          ],
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
        ],
      ),
      trailing: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (last != null)
            Text(
              _formatListTime(last.createdAt),
              style: TextStyle(
                fontSize: 12,
                color: chat.unreadCount > 0 && !chat.muted
                    ? Theme.of(context).colorScheme.primary
                    : Colors.grey,
                fontWeight: chat.unreadCount > 0 ? FontWeight.bold : null,
              ),
            ),
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (chat.muted)
                const Padding(
                  padding: EdgeInsets.only(right: 4),
                  child: Icon(Icons.notifications_off_outlined, size: 14, color: Colors.grey),
                ),
              if (chat.pinnedAt != null)
                const Padding(
                  padding: EdgeInsets.only(right: 4),
                  child: Icon(Icons.push_pin_outlined, size: 14, color: Colors.grey),
                ),
              if (chat.unreadCount > 0)
                Badge(
                  label: Text('${chat.unreadCount}'),
                  backgroundColor: chat.muted ? Colors.grey[500] : Theme.of(context).colorScheme.primary,
                ),
            ],
          ),
        ],
      ),
      onTap: () async {
        if (isWide) {
          setState(() {
            _activeChat = chat;
            _infoOpen = false;
          });
          try {
            await context.read<ChatService>().markDelivered(chat.id);
            _loadChats(silent: true);
          } catch (_) {}
        } else {
          await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => ChatViewScreen(chat: chat),
            ),
          );
          if (mounted) _loadChats(silent: true);
        }
      },
      onLongPress: () => _showChatOptions(chat),
    );
  }

  void _showChatOptions(Chat chat) {
    final chatService = context.read<ChatService>();
    final isPinned = chat.pinnedAt != null;
    final isMuted = chat.muted;

    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                _getDisplayTitle(chat, context.read<AuthService>().currentUser),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const Divider(),
            ListTile(
              leading: Icon(isPinned ? Icons.pin_end : Icons.push_pin_outlined),
              title: Text(isPinned ? 'Unpin chat' : 'Pin chat'),
              onTap: () async {
                Navigator.pop(context);
                try {
                  await chatService.pinChat(chat.id, !isPinned);
                  _loadChats(silent: true);
                } catch (e) {
                  _showError(e.toString());
                }
              },
            ),
            ListTile(
              leading: Icon(isMuted ? Icons.notifications_active_outlined : Icons.notifications_off_outlined),
              title: Text(isMuted ? 'Unmute notifications' : 'Mute notifications'),
              onTap: () async {
                Navigator.pop(context);
                try {
                  await chatService.muteChat(chat.id, !isMuted);
                  _loadChats(silent: true);
                } catch (e) {
                  _showError(e.toString());
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.info_outline),
              title: const Text('View info'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => ChatViewScreen(chat: chat)),
                ).then((_) => _loadChats(silent: true));
              },
            ),
            if (chat.type != 'saved')
              ListTile(
                leading: const Icon(Icons.logout, color: Colors.red),
                title: Text(chat.type == 'direct' ? 'Delete chat' : 'Leave group',
                    style: const TextStyle(color: Colors.red)),
                onTap: () async {
                  Navigator.pop(context);
                  final confirm = await _showConfirmDialog(
                    chat.type == 'direct' ? 'Delete Chat' : 'Leave Group',
                    chat.type == 'direct'
                        ? 'Are you sure you want to delete this chat?'
                        : 'Are you sure you want to leave this group?',
                  );
                  if (confirm == true) {
                    try {
                      if (chat.type == 'direct') {
                        await chatService.deleteChat(chat.id);
                      } else {
                        await chatService.leaveChat(chat.id);
                      }
                      _loadChats(silent: true);
                    } catch (e) {
                      _showError(e.toString());
                    }
                  }
                },
              ),
          ],
        ),
      ),
    );
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg.replaceFirst('Exception: ', '')),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<bool?> _showConfirmDialog(String title, String content) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(content),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm'),
          ),
        ],
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
    // different copy for "no chats yet" vs "no search results"
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
