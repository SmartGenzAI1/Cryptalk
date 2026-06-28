import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/models.dart';
import '../../core/ui/avatar.dart';
import '../../core/socket_service.dart';
import '../../core/animated_emojis.dart';
import 'chat_view_screen.dart';

class ChatInfoScreen extends StatefulWidget {
  final Chat chat;
  final List<Message> messages;
  final bool isInline;
  final VoidCallback? onClose;

  const ChatInfoScreen({
    super.key,
    required this.chat,
    required this.messages,
    this.isInline = false,
    this.onClose,
  });

  @override
  State<ChatInfoScreen> createState() => _ChatInfoScreenState();
}

class _ChatInfoScreenState extends State<ChatInfoScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String _safetyNumber = 'Loading...';
  bool _loadingSafetyNumber = true;
  List<Message> _messages = [];
  bool _loadingMessages = false;

  @override
  void initState() {
    super.initState();
    _messages = widget.messages;
    _tabController = TabController(length: 3, vsync: this);
    _loadSafetyNumber();
    if (_messages.isEmpty) {
      _loadMessages();
    }
  }

  Future<void> _loadMessages() async {
    setState(() => _loadingMessages = true);
    try {
      final chatService = context.read<ChatService>();
      final messages = await chatService.getMessages(widget.chat.id);
      if (mounted) {
        setState(() {
          _messages = messages;
          _loadingMessages = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _loadingMessages = false);
      }
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadSafetyNumber() async {
    final isDirect = widget.chat.type == 'direct';
    if (!isDirect) return;
    
    final currentUser = context.read<AuthService>().currentUser;
    final other = widget.chat.members.where((m) => m.user.id != currentUser?.id).firstOrNull;
    if (other == null) return;

    try {
      final chatService = context.read<ChatService>();
      final otherPubKey = await chatService.getUserEncryptionKey(other.user.id);
      if (otherPubKey != null && otherPubKey.isNotEmpty) {
        final number = _generateSafetyNumber(otherPubKey);
        if (mounted) {
          setState(() {
            _safetyNumber = number;
            _loadingSafetyNumber = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _safetyNumber = 'Not available';
            _loadingSafetyNumber = false;
          });
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _safetyNumber = 'Unable to generate';
          _loadingSafetyNumber = false;
        });
      }
    }
  }

  String _generateSafetyNumber(String otherPubKeyB64) {
    final bytes = utf8.encode(otherPubKeyB64);
    final digest = sha256.convert(bytes);
    
    final buffer = StringBuffer();
    for (final b in digest.bytes) {
      buffer.write(b.toString().padLeft(3, '0'));
    }
    
    final digits = buffer.toString();
    final List<String> blocks = [];
    for (int i = 0; i < digits.length && blocks.length < 6; i += 5) {
      final end = (i + 5 < digits.length) ? i + 5 : digits.length;
      blocks.add(digits.substring(i, end));
    }
    return blocks.join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = context.watch<AuthService>().currentUser;
    final isDirect = widget.chat.type == 'direct';
    final other = isDirect
        ? widget.chat.members.where((m) => m.user.id != currentUser?.id).firstOrNull
        : null;
    
    final socket = context.watch<SocketService>();
    final isOnline = other != null && socket.isUserOnline(other.user.id);

    final mediaMessages = _messages.where((m) => m.type == 'sticker' || m.type == 'image').toList();
    final linksList = _messages.expand((m) {
      final matches = RegExp(r'https?://[^\s]+').allMatches(m.content);
      return matches.map((match) => match.group(0)!);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Info'),
        automaticallyImplyLeading: !widget.isInline,
        actions: widget.isInline
            ? [
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: widget.onClose,
                )
              ]
            : null,
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 16),
        children: [
          Center(
            child: Column(
              children: [
                AvatarIcon(
                  iconKey: widget.chat.type == 'direct'
                      ? (other?.user.avatarEmoji ?? widget.chat.avatarEmoji)
                      : widget.chat.avatarEmoji,
                  colorName: widget.chat.type == 'direct'
                      ? (other?.user.avatarColor ?? widget.chat.avatarColor)
                      : widget.chat.avatarColor,
                  size: 88,
                  online: isDirect ? isOnline : false,
                  seed: widget.chat.type == 'direct'
                      ? other?.user.id
                      : widget.chat.id,
                ),
                const SizedBox(height: 16),
                Text(
                  widget.chat.type == 'direct'
                      ? (other?.user.name ?? widget.chat.title)
                      : widget.chat.title,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  isDirect
                      ? (isOnline ? 'Online' : 'Offline')
                      : widget.chat.type == 'saved'
                          ? 'Your personal cloud'
                          : widget.chat.type == 'channel'
                              ? '${widget.chat.members.length} subscribers'
                              : '${widget.chat.members.length} members',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          if (isDirect && other != null) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.05),
                  border: Border.all(color: Colors.green.withOpacity(0.2)),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.shield_outlined, color: Colors.green, size: 20),
                        SizedBox(width: 8),
                        Text(
                          'End-to-End Encrypted',
                          style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Verify this chat\'s security by comparing the safety number below with ${other.user.name ?? 'the user'}.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey[400]),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        _safetyNumber,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.2,
                          color: Colors.green,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Center(
                      child: Text(
                        'If the numbers match, your chat is secure.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey[500]),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],

          if (widget.chat.description.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Description',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.grey[500],
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 6),
                    Text(widget.chat.description),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],

          TabBar(
            controller: _tabController,
            tabs: const [
              Tab(text: 'Members'),
              Tab(text: 'Media'),
              Tab(text: 'Links'),
            ],
          ),

          SizedBox(
            height: 350,
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildMembersTab(context),
                _buildMediaTab(context, mediaMessages),
                _buildLinksTab(context, linksList),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMembersTab(BuildContext context) {
    final socket = context.watch<SocketService>();
    final currentUser = context.read<AuthService>().currentUser;
    return ListView.builder(
      shrinkWrap: true,
      physics: const ClampingScrollPhysics(),
      itemCount: widget.chat.members.length,
      itemBuilder: (context, index) {
        final m = widget.chat.members[index];
        final u = m.user;
        final isOnline = socket.isUserOnline(u.id);
        final isMe = u.id == currentUser?.id;
        
        return ListTile(
          leading: AvatarIcon(
            iconKey: u.avatarEmoji,
            colorName: u.avatarColor,
            size: 36,
            online: isOnline,
            seed: u.id,
          ),
          title: Row(
            children: [
              Text(isMe ? 'You' : (u.name ?? '')),
              if (m.role == 'owner') ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    'OWNER',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
              ],
            ],
          ),
          subtitle: Text(isOnline ? 'online' : '@${u.username}'),
        );
      },
    );
  }

  Widget _buildMediaTab(BuildContext context, List<Message> media) {
    if (media.isEmpty) {
      return const Center(child: Text('No media yet'));
    }
    return GridView.builder(
      padding: const EdgeInsets.all(12),
      shrinkWrap: true,
      physics: const ClampingScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
      ),
      itemCount: media.length,
      itemBuilder: (context, index) {
        final m = media[index];
        if (m.type == 'image') {
          final content = m.content;
          if (content.startsWith('data:')) {
            try {
              final commaIdx = content.indexOf(',');
              final b64 = commaIdx >= 0 ? content.substring(commaIdx + 1) : content;
              final bytes = base64Decode(b64);
              return ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.memory(bytes, fit: BoxFit.cover),
              );
            } catch (_) {}
          }
          if (content.startsWith('http')) {
            return ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(content, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const Icon(Icons.broken_image)),
            );
          }
          return Container(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.image),
          );
        } else {
          String emoji = m.content;
          if (emoji.startsWith('noto-')) {
            final cp = emoji.substring(5);
            final matched = animatedEmojis.where((e) => e.codepoint == cp).firstOrNull;
            if (matched != null) emoji = matched.char;
          } else {
            emoji = _stickerEmojiMap[emoji] ?? emoji;
          }
          return Container(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(8),
            ),
            alignment: Alignment.center,
            child: Text(emoji, style: const TextStyle(fontSize: 32)),
          );
        }
      },
    );
  }

  Widget _buildLinksTab(BuildContext context, List<String> links) {
    if (links.isEmpty) {
      return const Center(child: Text('No links yet'));
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 8),
      shrinkWrap: true,
      physics: const ClampingScrollPhysics(),
      itemCount: links.length,
      itemBuilder: (context, index) {
        final url = links[index];
        return ListTile(
          leading: const Icon(Icons.link),
          title: Text(
            url,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: Theme.of(context).colorScheme.primary,
              decoration: TextDecoration.underline,
            ),
          ),
          onTap: () {
            // can copy to clipboard or open in browser
          },
        );
      },
    );
  }

  static const Map<String, String> _stickerEmojiMap = {
    'like': '👍', 'star': '⭐', 'gift': '🎁', 'birthday-cake': '🎂',
    'rocket': '🚀', 'trophy': '🏆', 'crown': '👑', 'diamond': '💎',
    'rainbow': '🌈', 'sun': '☀️', 'moon': '🌙', 'cloud': '☁️',
    'flower': '🌸', 'mountain': '⛰️', 'volcano': '🌋', 'island': '🏝️',
  };
}
