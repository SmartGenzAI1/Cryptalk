import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/socket_service.dart';
import '../../core/models.dart';
import 'chat_view_screen.dart';
import 'new_chat_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  List<Chat> _chats = [];
  bool _loading = true;
  final _searchController = TextEditingController();
  List<Chat> _filtered = [];

  @override
  void initState() {
    super.initState();
    _loadChats();
    _initSocket();
  }

  Future<void> _loadChats() async {
    try {
      final chatService = context.read<ChatService>();
      final auth = context.read<AuthService>();
      final chats = await chatService.getChats();
      setState(() {
        _chats = chats;
        _filtered = chats;
        _loading = false;
      });

      final user = auth.currentUser;
      if (user != null) {
        final socket = context.read<SocketService>();
        socket.connect(user.id, user.username ?? user.name ?? '');
        socket.onMessage((data) {
          _loadChats();
        });
        socket.onUserStatus((data) {
          setState(() {});
        });
      }

      await auth.initE2EE();
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  void _initSocket() {
    final socket = context.read<SocketService>();
    socket.onMessage((data) {
      _loadChats();
    });
  }

  void _filter(String query) {
    setState(() {
      _filtered = _chats.where((c) {
        final q = query.toLowerCase();
        return c.title.toLowerCase().contains(q) ||
            (c.lastMessage?.content.toLowerCase().contains(q) ?? false);
      }).toList();
    });
  }

  String _getDisplayTitle(Chat chat, AppUser? currentUser) {
    if (chat.type == 'saved') return 'Saved Messages';
    if (chat.type == 'direct') {
      final other = chat.members.where((m) => m.user.id != currentUser?.id).firstOrNull;
      return other?.user.name ?? chat.title;
    }
    return chat.title;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cryptalk'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await auth.logout();
            },
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const NewChatScreen()),
          );
          _loadChats();
        },
        child: const Icon(Icons.edit),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchController,
              onChanged: _filter,
              decoration: InputDecoration(
                hintText: 'Search chats...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
              ),
            ),
          ),
          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_filtered.isEmpty)
            const Expanded(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey),
                    SizedBox(height: 16),
                    Text('No chats yet', style: TextStyle(color: Colors.grey)),
                  ],
                ),
              ),
            )
          else
            Expanded(
              child: ListView.builder(
                itemCount: _filtered.length,
                itemBuilder: (context, index) {
                  final chat = _filtered[index];
                  final title = _getDisplayTitle(chat, auth.currentUser);
                  return ListTile(
                    leading: CircleAvatar(
                      backgroundColor: _getColor(chat.avatarColor),
                      child: Text(_getEmoji(chat, auth.currentUser)),
                    ),
                    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      chat.lastMessage?.content ?? 'No messages yet',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.grey[400]),
                    ),
                    trailing: chat.unreadCount > 0
                        ? Badge(label: Text('${chat.unreadCount}'))
                        : null,
                    onTap: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => ChatViewScreen(chat: chat),
                        ),
                      );
                      _loadChats();
                    },
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  Color _getColor(String colorName) {
    const colors = {
      'emerald': Color(0xFF10b981),
      'violet': Color(0xFF8b5cf6),
      'rose': Color(0xFFf43f5e),
      'amber': Color(0xFFf59e0b),
      'cyan': Color(0xFF06b6d4),
      'lime': Color(0xFF84cc16),
      'purple': Color(0xFFa855f7),
      'teal': Color(0xFF14b8a6),
    };
    return colors[colorName] ?? const Color(0xFF10b981);
  }

  String _getEmoji(Chat chat, AppUser? currentUser) {
    if (chat.type == 'saved') return '🔖';
    if (chat.type == 'direct') {
      final other = chat.members.where((m) => m.user.id != currentUser?.id).firstOrNull;
      return other?.user.avatarEmoji ?? '💬';
    }
    return '👥';
  }
}
