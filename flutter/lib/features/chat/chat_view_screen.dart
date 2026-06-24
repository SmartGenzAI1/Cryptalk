import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:permission_handler/permission_handler.dart';
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
  final _audioPlayer = AudioPlayer();
  List<Message> _messages = [];
  bool _loading = true;
  Timer? _typingTimer;
  bool _isRecording = false;
  int _recordSeconds = 0;
  Timer? _recordTimer;
  final _record = Record();

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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to send: $e')));
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

  Future<void> _startRecording() async {
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Microphone permission denied')));
      }
      return;
    }

    await _record.start();
    setState(() {
      _isRecording = true;
      _recordSeconds = 0;
    });
    _recordTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() => _recordSeconds++);
      if (_recordSeconds >= 60) {
        _stopAndSendVoice();
      }
    });
  }

  Future<void> _stopAndSendVoice() async {
    if (!_isRecording) return;
    final path = await _record.stop();
    _recordTimer?.cancel();
    setState(() => _isRecording = false);

    if (path == null || _recordSeconds < 1) return;

    try {
      final file = File(path);
      final bytes = await file.readAsBytes();
      final base64 = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

      final chatService = context.read<ChatService>();
      final socket = context.read<SocketService>();

      final data = await chatService._api.post('/api/${widget.chat.id}/messages', body: {
        'content': base64,
        'type': 'voice',
        'duration': _recordSeconds,
      });

      if (data['message'] != null) {
        final msg = Message.fromJson(data['message']);
        setState(() => _messages.add(msg));
        socket.sendMessage(widget.chat.id, {
          'id': msg.id,
          'chatId': msg.chatId,
          'senderId': msg.senderId,
          'content': msg.content,
          'type': msg.type,
          'duration': msg.duration,
          'createdAt': msg.createdAt,
          'sender': {'id': msg.sender.id, 'name': msg.sender.name, 'username': msg.sender.username},
        });
        _scrollToBottom();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Voice send failed: $e')));
      }
    }
  }

  void _cancelRecording() async {
    if (_isRecording) {
      await _record.stop();
    }
    _recordTimer?.cancel();
    setState(() {
      _isRecording = false;
      _recordSeconds = 0;
    });
  }

  Future<void> _playVoice(String content, int duration) async {
    try {
      await _audioPlayer.stop();
      // For now, just show duration since we store as hex
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Voice message ($duration s)'), duration: const Duration(seconds: 2)),
        );
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    _typingTimer?.cancel();
    _recordTimer?.cancel();
    _audioPlayer.dispose();
    _record.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final userId = auth.currentUser?.id;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.chat.type == 'saved' ? 'Saved Messages' : widget.chat.title),
        actions: [
          PopupMenuButton(
            itemBuilder: (context) => [
              if (widget.chat.type != 'saved') ...[
                const PopupMenuItem(value: 'invite', child: Text('Invite Link')),
                const PopupMenuItem(value: 'leave', child: Text('Leave Chat')),
                const PopupMenuItem(value: 'delete', child: Text('Delete Chat')),
              ],
            ],
            onSelected: (value) async {
              final chatService = context.read<ChatService>();
              if (value == 'invite') {
                try {
                  final token = await chatService.generateInviteLink(widget.chat.id);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Invite: cryptalk.app/join/$token')),
                    );
                  }
                } catch (_) {}
              } else if (value == 'leave') {
                await chatService.leaveChat(widget.chat.id);
                if (mounted) Navigator.pop(context);
              } else if (value == 'delete') {
                await chatService.deleteChat(widget.chat.id);
                if (mounted) Navigator.pop(context);
              }
            },
          ),
        ],
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
                          return _MessageBubble(
                            message: msg,
                            isOwn: isOwn,
                            onPlayVoice: () => _playVoice(msg.content, msg.duration ?? 0),
                            onDelete: () async {
                              await chatService.deleteMessage(msg.chatId, msg.id, forEveryone: true);
                              setState(() => _messages.removeWhere((m) => m.id == msg.id));
                            },
                          );
                        },
                      ),
          ),
          if (_isRecording)
            Container(
              padding: const EdgeInsets.all(12),
              color: Colors.red.withOpacity(0.1),
              child: Row(
                children: [
                  const Icon(Icons.mic, color: Colors.red),
                  const SizedBox(width: 8),
                  Text('${_recordSeconds}s', style: const TextStyle(fontWeight: FontWeight.bold)),
                  const Spacer(),
                  IconButton(icon: const Icon(Icons.close, color: Colors.red), onPressed: _cancelRecording),
                  IconButton(icon: const Icon(Icons.send, color: Colors.green), onPressed: _stopAndSendVoice),
                ],
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.mic),
                    onPressed: _startRecording,
                  ),
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
  final VoidCallback onPlayVoice;
  final VoidCallback onDelete;

  const _MessageBubble({
    required this.message,
    required this.isOwn,
    required this.onPlayVoice,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isOwn ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: () {
          showModalBottomSheet(
            context: context,
            builder: (context) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (message.type == 'voice')
                  ListTile(leading: const Icon(Icons.play_arrow), title: const Text('Play'), onTap: () { onPlayVoice(); Navigator.pop(context); }),
                if (isOwn)
                  ListTile(leading: const Icon(Icons.delete, color: Colors.red), title: const Text('Delete for everyone'), onTap: () { onDelete(); Navigator.pop(context); }),
              ],
            ),
          );
        },
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
              if (message.type == 'voice')
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(icon: const Icon(Icons.play_arrow), onPressed: onPlayVoice),
                    Text('${message.duration ?? 0}s'),
                  ],
                )
              else if (message.type == 'image' && message.content.startsWith('data:image'))
                Image.network(message.content, width: 200, height: 200, fit: BoxFit.cover)
              else
                Text(
                  message.content,
                  style: TextStyle(color: isOwn ? Colors.white : null, fontSize: 15),
                ),
              const SizedBox(height: 2),
              Text(
                _formatTime(message.createdAt),
                style: TextStyle(fontSize: 10, color: isOwn ? Colors.white70 : Colors.grey),
              ),
            ],
          ),
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
