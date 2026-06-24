import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/socket_service.dart';
import '../../core/models.dart';

class ChatViewScreen extends StatefulWidget {
  final Chat chat;

  const ChatViewScreen({super.key, required this.chat});

  @override
  State<ChatViewScreen> createState() => _ChatViewScreenState();
}

class _ChatViewScreenState extends State<ChatViewScreen> {
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  List<Message> _messages = [];
  bool _loading = true;
  Timer? _typingTimer;

  @override
  void initState() {
    super.initState();
    _loadMessages();
    _joinChat();
  }

  Future<void> _loadMessages() async {
    try {
      final chatService = context.read<ChatService>();
      final messages = await chatService.getMessages(widget.chat.id);
      setState(() {
        _messages = messages;
        _loading = false;
      });
      _scrollToBottom();
      await chatService.markDelivered(widget.chat.id);
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _joinChat() {
    final socket = context.read<SocketService>();
    socket.joinChat(widget.chat.id);
    socket.onMessage((data) {
      if (data['chatId'] == widget.chat.id && data['message'] != null) {
        final msg = Message.fromJson(data['message']);
        setState(() => _messages.add(msg));
        _scrollToBottom();
      }
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendMessage() async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;

    _inputController.clear();
    _stopTyping();

    try {
      final chatService = context.read<ChatService>();
      final socket = context.read<SocketService>();
      final msg = await chatService.sendMessage(widget.chat.id, text);
      setState(() => _messages.add(msg));
      socket.sendMessage(widget.chat.id, {
        'id': msg.id,
        'chatId': msg.chatId,
        'senderId': msg.senderId,
        'content': msg.content,
        'type': msg.type,
        'createdAt': msg.createdAt,
        'sender': {
          'id': msg.sender.id,
          'name': msg.sender.name,
          'username': msg.sender.username,
          'avatarColor': msg.sender.avatarColor,
          'avatarEmoji': msg.sender.avatarEmoji,
        },
      });
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to send: $e')),
        );
      }
    }
  }

  void _onTypingChanged(String text) {
    final auth = context.read<AuthService>();
    final socket = context.read<SocketService>();
    final user = auth.currentUser;
    if (user == null) return;

    socket.sendTyping(widget.chat.id, user.id, user.name ?? '', true);
    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(seconds: 2), _stopTyping);
  }

  void _stopTyping() {
    final auth = context.read<AuthService>();
    final socket = context.read<SocketService>();
    final user = auth.currentUser;
    if (user == null) return;
    socket.sendTyping(widget.chat.id, user.id, user.name ?? '', false);
    _typingTimer?.cancel();
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    _typingTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final userId = auth.currentUser?.id;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.chat.type == 'saved'
            ? 'Saved Messages'
            : widget.chat.title),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? const Center(child: Text('No messages yet', style: TextStyle(color: Colors.grey)))
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        itemCount: _messages.length,
                        itemBuilder: (context, index) {
                          final msg = _messages[index];
                          final isOwn = msg.senderId == userId;
                          return _MessageBubble(message: msg, isOwn: isOwn);
                        },
                      ),
          ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _inputController,
                    onChanged: _onTypingChanged,
                    decoration: InputDecoration(
                      hintText: 'Type a message...',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                      filled: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _sendMessage,
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final Message message;
  final bool isOwn;

  const _MessageBubble({required this.message, required this.isOwn});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isOwn ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 2),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: isOwn ? const Color(0xFF10b981) : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: isOwn ? const Radius.circular(16) : Radius.zero,
            bottomRight: isOwn ? Radius.zero : const Radius.circular(16),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              message.content,
              style: TextStyle(
                color: isOwn ? Colors.white : null,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              _formatTime(message.createdAt),
              style: TextStyle(
                fontSize: 10,
                color: isOwn ? Colors.white70 : Colors.grey,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return '';
    }
  }
}
