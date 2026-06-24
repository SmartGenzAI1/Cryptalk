import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:convert';
import 'package:flutter/services.dart';
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
  bool _loadingMore = false;
  Timer? _typingTimer;
  bool _isRecording = false;
  int _recordSeconds = 0;
  Timer? _recordTimer;
  final _record = Record();
  final _imagePicker = ImagePicker();
  Message? _replyTo;
  int? _editingMessageIndex;
  String? _lastReadAt;
  bool _showScrollDown = false;
  List<String> _typingUsers = [];
  int? _selfDestructSeconds;

  static const _stickers = ['👍', '❤️', '🔥', '😂', '🎉', '👏', '🙏', '👋', '⭐', '🚀'];
  static const _reactions = ['👍', '❤️', '🔥', '😂', '😮', '🎉'];
  static const _selfDestructOptions = [10, 60, 3600, 86400, 604800];

  @override
  void initState() {
    super.initState();
    _loadDraft();
    _loadMessages();
    _joinChat();
    _setupSocketListeners();
    _scrollController.addListener(_onScroll);
  }

  void _loadDraft() {
    final draft = _getDraft();
    if (draft.isNotEmpty) _inputController.text = draft;
  }

  String _getDraft() {
    return _readPrefs('draft_${widget.chat.id}') ?? '';
  }

  void _saveDraft(String text) {
    _writePrefs('draft_${widget.chat.id}', text);
  }

  void _clearDraft() {
    _writePrefs('draft_${widget.chat.id}', '');
  }

  String? _readPrefs(String key) {
    return _sharedPrefsCache[key];
  }

  void _writePrefs(String key, String value) {
    _sharedPrefsCache[key] = value;
  }

  static final Map<String, String> _sharedPrefsCache = {};

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

  Future<void> _loadMore() async {
    if (_loadingMore || _messages.isEmpty) return;
    setState(() => _loadingMore = true);
    try {
      final chatService = context.read<ChatService>();
      final firstMsg = _messages.first;
      final older = await chatService.getMessages(widget.chat.id, before: firstMsg.createdAt);
      if (older.isNotEmpty) {
        setState(() {
          _messages.insertAll(0, older.reversed);
        });
      }
    } catch (_) {} finally {
      setState(() => _loadingMore = false);
    }
  }

  void _onScroll() {
    if (_scrollController.position.pixels <= 100 && !_loadingMore) {
      _loadMore();
    }
    final distFromBottom = _scrollController.position.maxScrollExtent - _scrollController.position.pixels;
    setState(() => _showScrollDown = distFromBottom > 400);
  }

  void _joinChat() {
    final socket = context.read<SocketService>();
    socket.joinChat(widget.chat.id);
  }

  void _setupSocketListeners() {
    final socket = context.read<SocketService>();
    socket.onMessage((data) {
      if (data['chatId'] == widget.chat.id && data['message'] != null) {
        final msg = Message.fromJson(data['message']);
        setState(() => _messages.add(msg));
        _scrollToBottom();
      }
    });
    socket.onTyping((data) {
      if (data['chatId'] == widget.chat.id && data['isTyping'] == true) {
        final username = data['username'] ?? 'Someone';
        setState(() {
          if (!_typingUsers.contains(username)) _typingUsers.add(username);
        });
        Future.delayed(const Duration(seconds: 3), () {
          setState(() => _typingUsers.remove(username));
        });
      } else if (data['chatId'] == widget.chat.id) {
        setState(() => _typingUsers.remove(data['username']));
      }
    });
    socket.onMessageUpdate((data) {
      if (data['chatId'] == widget.chat.id && data['message'] != null) {
        final msg = Message.fromJson(data['message']);
        setState(() {
          final idx = _messages.indexWhere((m) => m.id == msg.id);
          if (idx >= 0) {
            _messages[idx] = msg;
          }
        });
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
    if (_editingMessageIndex != null) {
      await _saveEdit();
      return;
    }

    final text = _inputController.text.trim();
    if (text.isEmpty) return;

    _inputController.clear();
    _clearDraft();
    _stopTyping();

    try {
      final chatService = context.read<ChatService>();
      final socket = context.read<SocketService>();
      final msg = await chatService.sendMessage(
        widget.chat.id,
        text,
        replyToId: _replyTo?.id,
        expiresIn: _selfDestructSeconds,
      );
      setState(() {
        _messages.add(msg);
        _replyTo = null;
        _selfDestructSeconds = null;
      });
      socket.sendMessage(widget.chat.id, _messageToJson(msg));
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }
  }

  Map<String, dynamic> _messageToJson(Message msg) {
    return {
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
    };
  }

  Future<void> _saveEdit() async {
    final text = _inputController.text.trim();
    if (text.isEmpty || _editingMessageIndex == null) return;
    final msg = _messages[_editingMessageIndex!];
    try {
      final chatService = context.read<ChatService>();
      final edited = await chatService.editMessage(widget.chat.id, msg.id, text);
      setState(() {
        _messages[_editingMessageIndex!] = edited;
        _editingMessageIndex = null;
      });
      _inputController.clear();
      _clearDraft();
    } catch (_) {}
  }

  void _startEditing(int index) {
    setState(() {
      _editingMessageIndex = index;
      _inputController.text = _messages[index].content;
      _replyTo = null;
    });
    FocusScope.of(context).requestFocus(FocusNode());
  }

  void _onTypingChanged(String text) {
    _saveDraft(text);
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
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Microphone denied')));
      }
      return;
    }
    await _record.start();
    setState(() {
      _isRecording = true;
      _recordSeconds = 0;
    });
    _recordTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      setState(() => _recordSeconds++);
      if (_recordSeconds >= 60) _stopAndSendVoice();
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
      final base64Str = base64Encode(bytes);
      final chatService = context.read<ChatService>();
      final socket = context.read<SocketService>();
      final data = await chatService.api.post('/api/${widget.chat.id}/messages', body: {
        'content': base64Str,
        'type': 'voice',
        'duration': _recordSeconds,
      });
      if (data['message'] != null) {
        final msg = Message.fromJson(data['message']);
        setState(() => _messages.add(msg));
        socket.sendMessage(widget.chat.id, _messageToJson(msg));
        _scrollToBottom();
      }
    } catch (_) {}
  }

  void _cancelRecording() async {
    if (_isRecording) await _record.stop();
    _recordTimer?.cancel();
    setState(() {
      _isRecording = false;
      _recordSeconds = 0;
    });
  }

  Future<void> _sendSticker(String emoji) async {
    try {
      final chatService = context.read<ChatService>();
      final socket = context.read<SocketService>();
      final msg = await chatService.sendMessage(widget.chat.id, emoji, type: 'sticker');
      setState(() => _messages.add(msg));
      socket.sendMessage(widget.chat.id, _messageToJson(msg));
      _scrollToBottom();
    } catch (_) {}
  }

  Future<void> _sendReaction(String messageId, String emoji) async {
    try {
      await context.read<ChatService>().toggleReaction(widget.chat.id, messageId, emoji);
    } catch (_) {}
  }

  Future<void> _deleteMessage(int index, {bool forEveryone = false}) async {
    final msg = _messages[index];
    try {
      await context.read<ChatService>().deleteMessage(msg.chatId, msg.id, forEveryone: forEveryone);
      setState(() => _messages.removeAt(index));
    } catch (_) {}
  }

  Future<void> _pickImage() async {
    final picker = await _imagePicker.pickImage(source: ImageSource.gallery, imageQuality: 70);
    if (picker == null) return;
    final file = File(picker.path);
    final bytes = await file.readAsBytes();
    final base64Str = base64Encode(bytes);
    final dataUrl = 'data:image/jpeg;base64,$base64Str';

    try {
      final chatService = context.read<ChatService>();
      final socket = context.read<SocketService>();
      final data = await chatService.api.post('/api/${widget.chat.id}/messages', body: {
        'content': dataUrl,
        'type': 'image',
      });
      if (data['message'] != null) {
        final msg = Message.fromJson(data['message']);
        setState(() => _messages.add(msg));
        socket.sendMessage(widget.chat.id, _messageToJson(msg));
        _scrollToBottom();
      }
    } catch (_) {}
  }

  void _showMessageOptions(int index) {
    final msg = _messages[index];
    final auth = context.read<AuthService>();
    final isOwn = msg.senderId == auth.currentUser?.id;

    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: _reactions.map((emoji) {
                  return IconButton(
                    icon: Text(emoji, style: const TextStyle(fontSize: 28)),
                    onPressed: () {
                      _sendReaction(msg.id, emoji);
                      Navigator.pop(context);
                    },
                  );
                }).toList(),
              ),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.reply),
              title: const Text('Reply'),
              onTap: () {
                setState(() {
                  _replyTo = msg;
                  _editingMessageIndex = null;
                });
                Navigator.pop(context);
                FocusScope.of(context).requestFocus(FocusNode());
              },
            ),
            ListTile(
              leading: const Icon(Icons.star),
              title: const Text('Star'),
              onTap: () async {
                await context.read<ChatService>().toggleStar(msg.chatId, msg.id);
                if (context.mounted) Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.copy),
              title: const Text('Copy'),
              onTap: () {
                Clipboard.setData(ClipboardData(text: msg.content));
                Navigator.pop(context);
              },
            ),
            if (isOwn) ...[
              ListTile(
                leading: const Icon(Icons.edit),
                title: const Text('Edit'),
                onTap: () {
                  Navigator.pop(context);
                  _startEditing(index);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: const Text('Delete for me'),
                onTap: () {
                  _deleteMessage(index);
                  Navigator.pop(context);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_forever, color: Colors.red),
                title: const Text('Delete for everyone', style: TextStyle(color: Colors.red)),
                onTap: () {
                  _deleteMessage(index, forEveryone: true);
                  Navigator.pop(context);
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _showStickerPicker() {
    showModalBottomSheet(
      context: context,
      builder: (context) => GridView.builder(
        shrinkWrap: true,
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5),
        itemCount: _stickers.length,
        itemBuilder: (context, index) {
          return GestureDetector(
            onTap: () {
              _sendSticker(_stickers[index]);
              Navigator.pop(context);
            },
            child: Center(child: Text(_stickers[index], style: const TextStyle(fontSize: 32))),
          );
        },
      ),
    );
  }

  void _showSelfDestructPicker() {
    showModalBottomSheet(
      context: context,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(padding: EdgeInsets.all(16), child: Text('Self-destruct after', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold))),
          ListTile(title: const Text('Off'), onTap: () { setState(() => _selfDestructSeconds = null); Navigator.pop(context); }),
          ListTile(title: const Text('10 seconds'), onTap: () { setState(() => _selfDestructSeconds = 10); Navigator.pop(context); }),
          ListTile(title: const Text('1 minute'), onTap: () { setState(() => _selfDestructSeconds = 60); Navigator.pop(context); }),
          ListTile(title: const Text('1 hour'), onTap: () { setState(() => _selfDestructSeconds = 3600); Navigator.pop(context); }),
          ListTile(title: const Text('1 day'), onTap: () { setState(() => _selfDestructSeconds = 86400); Navigator.pop(context); }),
          ListTile(title: const Text('1 week'), onTap: () { setState(() => _selfDestructSeconds = 604800); Navigator.pop(context); }),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  @override
  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _typingTimer?.cancel();
    _recordTimer?.cancel();
    _audioPlayer.dispose();
    _record.dispose();
    context.read<SocketService>().clearCallbacks();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final userId = auth.currentUser?.id;
    final chatService = context.read<ChatService>();

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.chat.type == 'saved' ? 'Saved Messages' : widget.chat.title, style: const TextStyle(fontSize: 16)),
            if (_typingUsers.isNotEmpty)
              Text(_typingUsers.length == 1 ? '${_typingUsers[0]} is typing...' : '${_typingUsers.length} typing...',
                  style: TextStyle(fontSize: 12, color: Colors.green[300])),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.emoji_emotions_outlined), onPressed: _showStickerPicker),
          IconButton(icon: const Icon(Icons.image_outlined), onPressed: _pickImage),
          if (_selfDestructSeconds != null)
            IconButton(icon: const Icon(Icons.timer, color: Colors.amber), onPressed: _showSelfDestructPicker),
          PopupMenuButton(
            itemBuilder: (context) => [
              if (widget.chat.type != 'saved') ...[
                const PopupMenuItem(value: 'invite', child: Text('Invite Link')),
                const PopupMenuItem(value: 'pin', child: Text('Pin/Unpin')),
                const PopupMenuItem(value: 'mute', child: Text('Mute/Unmute')),
                const PopupMenuItem(value: 'leave', child: Text('Leave')),
                const PopupMenuItem(value: 'delete', child: Text('Delete Chat')),
              ],
            ],
            onSelected: (value) async {
              if (value == 'invite') {
                final token = await chatService.generateInviteLink(widget.chat.id);
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('cryptalk.app/join/$token')));
              } else if (value == 'pin') {
                await chatService.pinChat(widget.chat.id, true);
              } else if (value == 'mute') {
                await chatService.muteChat(widget.chat.id, true);
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
          if (_replyTo != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: Row(
                children: [
                  Expanded(child: Text('Replying to: ${_replyTo!.content}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13))),
                  IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => setState(() => _replyTo = null)),
                ],
              ),
            ),
          if (_editingMessageIndex != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              color: Colors.blue.withOpacity(0.1),
              child: Row(
                children: [
                  Expanded(child: Text('Editing: ${_messages[_editingMessageIndex!].content}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13))),
                  IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () { setState(() => _editingMessageIndex = null); _inputController.clear(); }),
                ],
              ),
            ),
          Expanded(
            child: Stack(
              children: [
                _loading
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
                              final showDateDivider = index == 0 || !_sameDay(_messages[index - 1].createdAt, msg.createdAt);
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (showDateDivider)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 8),
                                      child: Center(child: Text(_formatDate(msg.createdAt), style: const TextStyle(fontSize: 12, color: Colors.grey))),
                                    ),
                                  _MessageBubble(
                                    message: msg,
                                    isOwn: isOwn,
                                    showSender: widget.chat.type != 'direct' && widget.chat.type != 'saved' && !isOwn,
                                    onLongPress: () => _showMessageOptions(index),
                                    reactions: msg.reactions,
                                  ),
                                ],
                              );
                            },
                          ),
                if (_showScrollDown)
                  Positioned(
                    bottom: 16,
                    right: 16,
                    child: FloatingActionButton(
                      mini: true,
                      onPressed: _scrollToBottom,
                      child: const Icon(Icons.arrow_downward),
                    ),
                  ),
              ],
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
                  IconButton(icon: const Icon(Icons.timer_outlined), onPressed: _showSelfDestructPicker),
                  IconButton(icon: const Icon(Icons.mic), onPressed: _startRecording),
                  Expanded(
                    child: TextField(
                      controller: _inputController,
                      onChanged: _onTypingChanged,
                      decoration: InputDecoration(
                        hintText: _editingMessageIndex != null ? 'Edit message...' : 'Type a message...',
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
                    icon: Icon(_editingMessageIndex != null ? Icons.check : Icons.send),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  bool _sameDay(String a, String b) {
    try {
      return DateTime.parse(a).day == DateTime.parse(b).day;
    } catch (_) {
      return false;
    }
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      final now = DateTime.now();
      if (dt.day == now.day) return 'Today';
      if (dt.day == now.subtract(const Duration(days: 1)).day) return 'Yesterday';
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return '';
    }
  }
}

class _MessageBubble extends StatelessWidget {
  final Message message;
  final bool isOwn;
  final bool showSender;
  final VoidCallback onLongPress;
  final List<Reaction> reactions;

  const _MessageBubble({
    required this.message,
    required this.isOwn,
    this.showSender = false,
    required this.onLongPress,
    this.reactions = const [],
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: onLongPress,
      child: Align(
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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (showSender)
                Text(message.sender.name ?? 'Unknown', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.blue[300])),
              if (message.type == 'voice')
                Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.play_arrow), Text('${message.duration ?? 0}s')])
              else if (message.type == 'sticker')
                Text(message.content, style: const TextStyle(fontSize: 48))
              else if (message.type == 'image' && message.content.startsWith('data:image'))
                ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(message.content, width: 200, fit: BoxFit.cover))
              else
                Text(message.content, style: TextStyle(color: isOwn ? Colors.white : null, fontSize: 15)),
              if (reactions.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Wrap(
                    spacing: 4,
                    children: reactions.map((r) => Text(r.emoji, style: const TextStyle(fontSize: 16))).toList(),
                  ),
                ),
              const SizedBox(height: 2),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (message.editedAt != null) const Text('edited ', style: TextStyle(fontSize: 9, color: Colors.grey)),
                  if (message.expiresIn != null) const Icon(Icons.timer, size: 10, color: Colors.amber),
                  Text(_formatTime(message.createdAt), style: TextStyle(fontSize: 10, color: isOwn ? Colors.white70 : Colors.grey)),
                  if (isOwn) ...[
                    const SizedBox(width: 2),
                    Icon(message.status == 'read' ? Icons.done_all : Icons.done, size: 14, color: message.status == 'read' ? Colors.lightBlue : (isOwn ? Colors.white70 : Colors.grey)),
                  ],
                ],
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

