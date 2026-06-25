import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:flutter/services.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/api_client.dart';
import '../../core/crypto_service.dart';
import '../../core/socket_service.dart';
import '../../core/models.dart';
import '../../core/ui/avatar.dart';

String _basename(String path) {
  final i = path.lastIndexOf('/');
  final j = path.lastIndexOf('\\');
  final idx = i > j ? i : j;
  return idx >= 0 ? path.substring(idx + 1) : path;
}

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

  // socket sub ids — cancelled in dispose so we only remove this screen's
  // listeners
  final List<int> _socketSubIds = [];

  // web-client sticker names ('fox', 'like', ...) → emoji. stickers sent
  // from web render as an icon here instead of the literal string 'fox'.
  // names not in the map (e.g. an emoji from another flutter client) fall
  // through unchanged.
  static const Map<String, String> _stickerEmojiMap = {
    'like': '👍',
    'star': '⭐',
    'gift': '🎁',
    'birthday-cake': '🎂',
    'rocket': '🚀',
    'trophy': '🏆',
    'crown': '👑',
    'diamond': '💎',
    'rainbow': '🌈',
    'sun': '☀️',
    'moon': '🌙',
    'cloud': '☁️',
    'flower': '🌸',
    'mountain': '⛰️',
    'volcano': '🌋',
    'island': '🏝️',
  };

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
      if (mounted)
      setState(() {
        _messages = messages;
        _loading = false;
      });
      _scrollToBottom();
      await chatService.markDelivered(widget.chat.id);
    } catch (_) {
      if (mounted)
      setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _messages.isEmpty) return;
    if (mounted)
    setState(() => _loadingMore = true);
    try {
      final chatService = context.read<ChatService>();
      final firstMsg = _messages.first;
      final older = await chatService.getMessages(widget.chat.id, before: firstMsg.createdAt);
      if (older.isNotEmpty) {
        if (mounted)
        setState(() {
          _messages.insertAll(0, older.reversed);
        });
      }
    } catch (e) { debugPrint('Error: $e'); } finally {
      // guard setState after the async getMessages call
      if (mounted)
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
    _socketSubIds.add(socket.onMessage((data) {
      if (data['chatId'] == widget.chat.id && data['message'] != null) {
        // mounted check — message arriving during a navigation transition
        // would crash on a disposed State
        if (!mounted) return;
        final msg = Message.fromJson(data['message']);
        setState(() => _messages.add(msg));
        _scrollToBottom();
      }
    }));
    _socketSubIds.add(socket.onTyping((data) {
      if (data['chatId'] != widget.chat.id) return;
      if (!mounted) return;
      if (data['isTyping'] == true) {
        final username = data['username'] ?? 'Someone';
        setState(() {
          if (!_typingUsers.contains(username)) _typingUsers.add(username);
        });
        // capture mounted in the delayed callback so setState-after-dispose
        // can't happen if the user navigates away within the 3s window
        Future.delayed(const Duration(seconds: 3), () {
          if (!mounted) return;
          setState(() => _typingUsers.remove(username));
        });
      } else {
        setState(() => _typingUsers.remove(data['username']));
      }
    }));
    _socketSubIds.add(socket.onMessageUpdate((data) {
      if (data['chatId'] == widget.chat.id && data['message'] != null) {
        if (!mounted) return;
        final msg = Message.fromJson(data['message']);
        setState(() {
          final idx = _messages.indexWhere((m) => m.id == msg.id);
          if (idx >= 0) {
            _messages[idx] = msg;
          }
        });
      }
    }));
  }

  // for direct chats: the other member's userId (to fetch their e2ee pub
  // key). null for saved/group chats.
  String? _recipientUserId() {
    if (widget.chat.type != 'direct') return null;
    final auth = context.read<AuthService>();
    final me = auth.currentUser?.id;
    final other = widget.chat.members
        .where((m) => m.user.id != me)
        .firstOrNull;
    return other?.user.id;
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
        chatType: widget.chat.type,
        recipientUserId: _recipientUserId(),
      );
      // mounted check after await
      if (!mounted) return;
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
      if (msg.duration != null) 'duration': msg.duration,
      if (msg.attachmentPath != null) 'attachmentPath': msg.attachmentPath,
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
      if (mounted)
      setState(() {
        _messages[_editingMessageIndex!] = edited;
        _editingMessageIndex = null;
      });
      _inputController.clear();
      _clearDraft();
    } catch (e) { debugPrint('Error: $e'); }
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
    if (!mounted) return;
    setState(() {
      _isRecording = true;
      _recordSeconds = 0;
    });
    _recordTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      // periodic timer can fire after dispose — guard setState
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() => _recordSeconds++);
      if (_recordSeconds >= 60) _stopAndSendVoice();
    });
  }

  Future<void> _stopAndSendVoice() async {
    if (!_isRecording) return;
    final path = await _record.stop();
    _recordTimer?.cancel();
    if (mounted)
    setState(() => _isRecording = false);
    if (path == null || _recordSeconds < 1) return;

    try {
      final file = File(path);
      final bytes = await file.readAsBytes();

      if (bytes.length > kMaxAttachmentBytes) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Voice file exceeds 25MB limit')));
        }
        return;
      }

      final chatService = context.read<ChatService>();
      final socket = context.read<SocketService>();
      final msg = await chatService.sendFileMessage(
        widget.chat.id,
        bytes,
        'voice.m4a',
        type: 'voice',
        contentType: 'audio/m4a',
        duration: _recordSeconds,
        chatType: widget.chat.type,
        recipientUserId: _recipientUserId(),
      );
      if (mounted)
      setState(() => _messages.add(msg));
      socket.sendMessage(widget.chat.id, _messageToJson(msg));
      _scrollToBottom();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (e) { debugPrint('Error: $e'); }
  }

  void _cancelRecording() async {
    if (_isRecording) await _record.stop();
    _recordTimer?.cancel();
    if (mounted)
    setState(() {
      _isRecording = false;
      _recordSeconds = 0;
    });
  }

  Future<void> _sendSticker(String emoji) async {
    try {
      final chatService = context.read<ChatService>();
      final socket = context.read<SocketService>();
      final msg = await chatService.sendMessage(
        widget.chat.id,
        emoji,
        type: 'sticker',
        chatType: widget.chat.type,
        recipientUserId: _recipientUserId(),
      );
      if (mounted)
      setState(() => _messages.add(msg));
      socket.sendMessage(widget.chat.id, _messageToJson(msg));
      _scrollToBottom();
    } catch (e) { debugPrint('Error: $e'); }
  }

  Future<void> _sendReaction(String messageId, String emoji) async {
    try {
      await context.read<ChatService>().toggleReaction(widget.chat.id, messageId, emoji);
    } catch (e) { debugPrint('Error: $e'); }
  }

  Future<void> _deleteMessage(int index, {bool forEveryone = false}) async {
    final msg = _messages[index];
    try {
      await context.read<ChatService>().deleteMessage(msg.chatId, msg.id, forEveryone: forEveryone);
      if (mounted)
      setState(() => _messages.removeAt(index));
    } catch (e) { debugPrint('Error: $e'); }
  }

  Future<void> _pickImage() async {
    final picker = await _imagePicker.pickImage(source: ImageSource.gallery, imageQuality: 70);
    if (picker == null) return;
    final file = File(picker.path);
    final bytes = await file.readAsBytes();

    if (bytes.length > kMaxAttachmentBytes) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('File exceeds 25MB limit')));
      }
      return;
    }

    try {
      final chatService = context.read<ChatService>();
      final socket = context.read<SocketService>();
      final msg = await chatService.sendFileMessage(
        widget.chat.id,
        bytes,
        _basename(picker.path),
        type: 'image',
        contentType: 'image/jpeg',
        chatType: widget.chat.type,
        recipientUserId: _recipientUserId(),
      );
      if (mounted)
      setState(() => _messages.add(msg));
      socket.sendMessage(widget.chat.id, _messageToJson(msg));
      _scrollToBottom();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (e) { debugPrint('Error: $e'); }
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
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                'Stickers',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
            ),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              gridDelegate:
                  const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 5,
                childAspectRatio: 1,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
              ),
              itemCount: _stickers.length,
              itemBuilder: (ctx, index) => InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () {
                  _sendSticker(_stickers[index]);
                  Navigator.pop(sheetCtx);
                },
                child: Center(
                  child: Text(_stickers[index],
                      style: const TextStyle(fontSize: 32)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showSelfDestructPicker() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetCtx) {
        final options = <(int?, String)>[
          (null, 'Off'),
          (10, '10 seconds'),
          (60, '1 minute'),
          (3600, '1 hour'),
          (86400, '1 day'),
          (604800, '1 week'),
        ];
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Text(
                  'Self-destruct timer',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
              ),
              ...options.map((o) {
                final selected = _selfDestructSeconds == o.$1;
                return ListTile(
                  leading: Icon(selected
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked),
                  title: Text(o.$2),
                  onTap: () {
                    setState(() => _selfDestructSeconds = o.$1);
                    Navigator.pop(sheetCtx);
                  },
                );
              }),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  // attachment menu (photo, sticker, self-destruct timer).
  void _showAttachMenu() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetCtx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 12, left: 4),
                child: Text(
                  'Attach',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _AttachOption(
                    icon: Icons.photo_outlined,
                    color: const Color(0xFF8b5cf6),
                    label: 'Photo',
                    onTap: () {
                      Navigator.pop(sheetCtx);
                      _pickImage();
                    },
                  ),
                  _AttachOption(
                    icon: Icons.emoji_emotions_outlined,
                    color: const Color(0xFFf59e0b),
                    label: 'Sticker',
                    onTap: () {
                      Navigator.pop(sheetCtx);
                      _showStickerPicker();
                    },
                  ),
                  _AttachOption(
                    icon: Icons.timer_outlined,
                    color: const Color(0xFF06b6d4),
                    label: 'Self-destruct',
                    badge: _selfDestructSeconds != null,
                    onTap: () {
                      Navigator.pop(sheetCtx);
                      _showSelfDestructPicker();
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // appbar title: for direct chats, the other member's name; else chat title
  String _resolveTitle() {
    final chat = widget.chat;
    if (chat.type == 'saved') return 'Saved Messages';
    if (chat.type == 'direct') {
      final me = context.read<AuthService>().currentUser?.id;
      final other = chat.members
          .where((m) => m.user.id != me)
          .firstOrNull;
      return other?.user.name ?? chat.title;
    }
    return chat.title;
  }

  ({String emoji, String color}) _resolveAvatar() {
    final chat = widget.chat;
    if (chat.type == 'saved') {
      return (emoji: 'bookmark', color: chat.avatarColor);
    }
    if (chat.type == 'direct') {
      final me = context.read<AuthService>().currentUser?.id;
      final other = chat.members
          .where((m) => m.user.id != me)
          .firstOrNull;
      return (
        emoji: other?.user.avatarEmoji ?? chat.avatarEmoji,
        color: other?.user.avatarColor ?? chat.avatarColor,
      );
    }
    return (emoji: chat.avatarEmoji, color: chat.avatarColor);
  }

  String _typingLabel() {
    if (_typingUsers.isEmpty) return '';
    if (_typingUsers.length == 1) return '${_typingUsers[0]} is typing…';
    if (_typingUsers.length == 2) return '${_typingUsers[0]}, ${_typingUsers[1]} are typing…';
    return '${_typingUsers.length} people are typing…';
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _typingTimer?.cancel();
    _recordTimer?.cancel();
    _audioPlayer.dispose();
    _record.dispose();
    // cancel ONLY this screen's socket subs, not every screen's
    final socket = SocketService();
    for (final id in _socketSubIds) {
      socket.cancelSubscription(id);
    }
    _socketSubIds.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final userId = auth.currentUser?.id;
    final chatService = context.read<ChatService>();

    final avatar = _resolveAvatar();
    final title = _resolveTitle();
    final typing = _typingLabel();
    final hasText = _inputController.text.trim().isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: AvatarIcon(
                iconKey: avatar.emoji,
                colorName: avatar.color,
                size: 36,
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (typing.isNotEmpty)
                    Text(
                      typing,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.green[300],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Chat options',
            icon: const Icon(Icons.more_vert),
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
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('cryptalk.app/join/$token'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
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
                  const Icon(Icons.reply, size: 18, color: Colors.grey),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Replying to: ${_replyTo!.content}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Cancel reply',
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () => setState(() => _replyTo = null),
                  ),
                ],
              ),
            ),
          if (_editingMessageIndex != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              color: Colors.blue.withOpacity(0.1),
              child: Row(
                children: [
                  const Icon(Icons.edit, size: 18, color: Colors.blue),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Editing: ${_messages[_editingMessageIndex!].content}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Cancel edit',
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () {
                      setState(() => _editingMessageIndex = null);
                      _inputController.clear();
                    },
                  ),
                ],
              ),
            ),
          Expanded(
            child: Stack(
              children: [
                _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _messages.isEmpty
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(32),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.forum_outlined,
                                      size: 72, color: Colors.grey[500]),
                                  const SizedBox(height: 12),
                                  Text(
                                    'No messages yet',
                                    style: TextStyle(color: Colors.grey[400]),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Say hi 👋',
                                    style: TextStyle(
                                        color: Colors.grey[600],
                                        fontSize: 13),
                                  ),
                                ],
                              ),
                            ),
                          )
                        : ListView.builder(
                            controller: _scrollController,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 8),
                            itemCount: _messages.length,
                            itemBuilder: (context, index) {
                              final msg = _messages[index];
                              final isOwn = msg.senderId == userId;
                              final showDateDivider = index == 0 ||
                                  !_sameDay(_messages[index - 1].createdAt,
                                      msg.createdAt);
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (showDateDivider)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 8),
                                      child: Center(
                                        child: Text(
                                          _formatDate(msg.createdAt),
                                          style: const TextStyle(
                                              fontSize: 12,
                                              color: Colors.grey),
                                        ),
                                      ),
                                    ),
                                  _MessageBubble(
                                    message: msg,
                                    isOwn: isOwn,
                                    showSender: widget.chat.type != 'direct' &&
                                        widget.chat.type != 'saved' &&
                                        !isOwn,
                                    onLongPress: () =>
                                        _showMessageOptions(index),
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
                  Text('${_recordSeconds}s',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Cancel',
                    icon: const Icon(Icons.close, color: Colors.red),
                    onPressed: _cancelRecording,
                  ),
                  IconButton(
                    tooltip: 'Send voice',
                    icon: const Icon(Icons.send, color: Colors.green),
                    onPressed: _stopAndSendVoice,
                  ),
                ],
              ),
            )
          else
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_selfDestructSeconds != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            const Icon(Icons.timer,
                                size: 16, color: Colors.amber),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                'Self-destruct: ${_formatSelfDestruct(_selfDestructSeconds!)}',
                                style: const TextStyle(
                                    fontSize: 12, color: Colors.amber),
                              ),
                            ),
                            TextButton(
                              onPressed: _showSelfDestructPicker,
                              child: const Text('Change'),
                            ),
                            TextButton(
                              onPressed: () => setState(
                                  () => _selfDestructSeconds = null),
                              child: const Text('Off'),
                            ),
                          ],
                        ),
                      ),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        IconButton(
                          tooltip: 'Attach',
                          icon: const Icon(Icons.add),
                          onPressed: _showAttachMenu,
                        ),
                        Expanded(
                          child: TextField(
                            controller: _inputController,
                            onChanged: (v) {
                              _onTypingChanged(v);
                              setState(() {}); // refresh send/mic toggle
                            },
                            minLines: 1,
                            maxLines: 5,
                            textInputAction: TextInputAction.newline,
                            decoration: InputDecoration(
                              hintText: _editingMessageIndex != null
                                  ? 'Edit message...'
                                  : 'Type a message...',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(24),
                              ),
                              filled: true,
                              contentPadding:
                                  const EdgeInsets.symmetric(
                                      horizontal: 16, vertical: 10),
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),
                        if (hasText || _editingMessageIndex != null)
                          IconButton.filled(
                            tooltip: 'Send',
                            onPressed: _sendMessage,
                            icon: Icon(_editingMessageIndex != null
                                ? Icons.check
                                : Icons.send),
                          )
                        else
                          IconButton(
                            tooltip: 'Voice message',
                            icon: const Icon(Icons.mic_none_outlined),
                            onPressed: _startRecording,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  static String _formatSelfDestruct(int seconds) {
    if (seconds < 60) return '${seconds}s';
    if (seconds < 3600) return '${seconds ~/ 60}m';
    if (seconds < 86400) return '${seconds ~/ 3600}h';
    return '${seconds ~/ 86400}d';
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
              _buildContent(),
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

  Widget _buildContent() {
    final t = message.type;
    // e2ee attachments: content is a decrypted url, data url (dev fallback),
    // or '[delivered]' sentinel — _AttachmentView handles fetch+decrypt+cache
    if (t == 'image' || t == 'file' || t == 'voice') {
      return _AttachmentView(message: message, isOwn: isOwn);
    }
    if (t == 'sticker') {
      // stickers from web carry a name ('fox', 'like', 'rocket') not an emoji.
      // map known names to emoji; anything else (emoji from another flutter
      // client, or unknown name) renders as-is
      final emoji = _stickerEmojiMap[message.content] ?? message.content;
      return Text(emoji, style: const TextStyle(fontSize: 48));
    }
    return Text(message.content, style: TextStyle(color: isOwn ? Colors.white : null, fontSize: 15));
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

// renders an e2ee file/image/voice attachment. resolves message.content
// (decrypted url, data url, or '[delivered]' sentinel) to a renderable data
// url: cached value if already resolved; data: url returned as-is (dev
// fallback); '[delivered]' → muted placeholder; otherwise fetch → utf-8 decode
// → decrypt → original data url, then cache.
class _AttachmentView extends StatefulWidget {
  final Message message;
  final bool isOwn;

  const _AttachmentView({required this.message, required this.isOwn});

  @override
  State<_AttachmentView> createState() => _AttachmentViewState();
}

class _AttachmentViewState extends State<_AttachmentView> {
  // per-message-id cache: resolved data url or '[delivered]'/'[error]' sentinel.
  // survives rebuilds so scrolling doesn't refetch
  static final Map<String, String> _cache = {};

  static const _kDelivered = '[delivered]';
  static const _kError = '[error]';

  String? _resolved;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  Future<void> _resolve() async {
    final msg = widget.message;
    final content = msg.content;

    if (_cache.containsKey(msg.id)) {
      if (mounted) {
        setState(() {
          _resolved = _cache[msg.id];
          _loading = false;
        });
      }
      return;
    }

    // server wipes content to '[delivered]' once everyone has received it
    if (content == _kDelivered || content.isEmpty) {
      _cache[msg.id] = _kDelivered;
      if (mounted) {
        setState(() {
          _resolved = _kDelivered;
          _loading = false;
        });
      }
      return;
    }

    // dev fallback: content is already the decrypted data url
    if (content.startsWith('data:')) {
      _cache[msg.id] = content;
      if (mounted) {
        setState(() {
          _resolved = content;
          _loading = false;
        });
      }
      return;
    }

    // prod: content is a (decrypted) supabase url → fetch ciphertext bytes →
    // utf-8 decode → decrypt → original data url
    if (content.startsWith('http://') || content.startsWith('https://')) {
      try {
        final res = await http.get(Uri.parse(content)).timeout(const Duration(seconds: 30));
        if (res.statusCode != 200) {
          _cache[msg.id] = _kError;
          if (mounted) {
            setState(() {
              _resolved = _kError;
              _loading = false;
            });
          }
          return;
        }
        final cipherText = utf8.decode(res.bodyBytes);
        final dataUrl = await CryptoService().decrypt(cipherText);
        _cache[msg.id] = dataUrl;
        if (mounted) {
          setState(() {
            _resolved = dataUrl;
            _loading = false;
          });
        }
      } catch (_) {
        _cache[msg.id] = _kError;
        if (mounted) {
          setState(() {
            _resolved = _kError;
            _loading = false;
          });
        }
      }
      return;
    }

    // unknown format — fall back to displaying the raw content
    _cache[msg.id] = content;
    if (mounted) {
      setState(() {
        _resolved = content;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final msg = widget.message;

    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(12),
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    final data = _resolved ?? '';

    if (data == _kDelivered || data == _kError) {
      return Container(
        padding: const EdgeInsets.all(10),
        constraints: const BoxConstraints(maxWidth: 220),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.05),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_clock, size: 16, color: Colors.grey[400]),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                data == _kError
                    ? 'Failed to load attachment'
                    : 'File no longer available (delivered & wiped)',
                style: TextStyle(fontSize: 12, color: Colors.grey[400], fontStyle: FontStyle.italic),
              ),
            ),
          ],
        ),
      );
    }

    if (msg.type == 'image') {
      // _resolved is either a data: url (common after decrypt) or a plain
      // http(s) url. decode data urls to bytes for Image.memory since
      // Image.network doesn't speak the data: scheme
      if (data.startsWith('data:')) {
        try {
          final commaIdx = data.indexOf(',');
          final b64 = commaIdx >= 0 ? data.substring(commaIdx + 1) : data;
          final bytes = base64Decode(b64);
          return ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.memory(
              bytes,
              width: 220,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                width: 220,
                height: 120,
                color: Colors.black12,
                child: const Icon(Icons.broken_image, size: 32),
              ),
            ),
          );
        } catch (_) {
          return Container(
            width: 220,
            height: 120,
            color: Colors.black12,
            child: const Icon(Icons.broken_image, size: 32),
          );
        }
      }
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          data,
          width: 220,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(
            width: 220,
            height: 120,
            color: Colors.black12,
            child: const Icon(Icons.broken_image, size: 32),
          ),
        ),
      );
    }

    if (msg.type == 'voice') {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.play_arrow, color: widget.isOwn ? Colors.white : null),
          const SizedBox(width: 4),
          Text('${msg.duration ?? 0}s',
              style: TextStyle(color: widget.isOwn ? Colors.white : null)),
        ],
      );
    }

    // generic file attachment
    final name = msg.attachmentPath?.split('/').last ?? 'file';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.insert_drive_file,
            size: 18, color: widget.isOwn ? Colors.white70 : Colors.grey[300]),
        const SizedBox(width: 6),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 180),
          child: Text(
            name,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 13, color: widget.isOwn ? Colors.white : null),
          ),
        ),
      ],
    );
  }
}

// circular attach option used by the attach bottom sheet
class _AttachOption extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final bool badge;
  final VoidCallback onTap;

  const _AttachOption({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
    this.badge = false,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.18),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Icon(icon, color: color, size: 28),
                ),
                if (badge)
                  Positioned(
                    right: -2,
                    top: -2,
                    child: Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        color: color,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Theme.of(context).colorScheme.surface,
                          width: 2,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Text(label,
                style: Theme.of(context).textTheme.labelMedium),
          ],
        ),
      ),
    );
  }
}

