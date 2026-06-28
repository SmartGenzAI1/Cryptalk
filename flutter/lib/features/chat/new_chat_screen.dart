import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:math' as math;
import 'dart:convert';
import '../../core/chat_service.dart';
import '../../core/auth_service.dart';
import '../../core/crypto_service.dart';
import '../../core/models.dart';
import '../../core/ui/avatar.dart';

// Search for a user by username to start a direct chat or create a group/channel.
class NewChatScreen extends StatefulWidget {
  const NewChatScreen({super.key});

  @override
  State<NewChatScreen> createState() => _NewChatScreenState();
}

class _NewChatScreenState extends State<NewChatScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // Direct chat search state
  final _searchController = TextEditingController();
  List<AppUser> _results = [];
  bool _searching = false;

  // Group creation form state
  final _groupFormKey = GlobalKey<FormState>();
  final _groupNameController = TextEditingController();
  final _groupDescController = TextEditingController();
  String _groupEmoji = 'groups';
  String _groupColor = 'violet';
  bool _isChannel = false;
  int? _expiresInDays; // null, 1, 3, 7
  
  // Group members search & selection state
  final _groupSearchController = TextEditingController();
  List<AppUser> _groupSearchResults = [];
  bool _groupSearching = false;
  final List<AppUser> _selectedMembers = [];
  bool _creating = false;

  static const List<String> _avatarEmojiKeys = [
    'groups', 'megaphone', 'chat', 'fox', 'cat', 'dog', 'panda', 'lion',
    'unicorn', 'rabbit', 'owl', 'bear', 'frog', 'turtle', 'butterfly',
    'dolphin', 'dragon', 'hedgehog', 'parrot',
  ];

  static const List<String> _avatarColorKeys = [
    'emerald', 'violet', 'rose', 'amber',
    'cyan', 'lime', 'purple', 'teal',
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      setState(() {});
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    _groupNameController.dispose();
    _groupDescController.dispose();
    _groupSearchController.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    final q = query.trim();
    if (q.isEmpty) {
      if (mounted) setState(() => _results = []);
      return;
    }
    if (mounted) setState(() => _searching = true);
    try {
      final users = await context.read<ChatService>().searchUsers(q);
      if (mounted) setState(() => _results = users);
    } catch (_) {
      if (mounted) setState(() => _results = []);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _groupSearch(String query) async {
    final q = query.trim();
    if (q.isEmpty) {
      if (mounted) setState(() => _groupSearchResults = []);
      return;
    }
    if (mounted) setState(() => _groupSearching = true);
    try {
      final users = await context.read<ChatService>().searchUsers(q);
      if (mounted) setState(() => _groupSearchResults = users);
    } catch (_) {
      if (mounted) setState(() => _groupSearchResults = []);
    } finally {
      if (mounted) setState(() => _groupSearching = false);
    }
  }

  Future<void> _startChat(AppUser user) async {
    try {
      await context.read<ChatService>().createDirectChat(user.id);
      if (context.mounted) Navigator.pop(context);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: ${e.toString().replaceFirst('Exception: ', '')}'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<void> _createGroupChat() async {
    final form = _groupFormKey.currentState;
    if (form == null || !form.validate()) return;
    if (_selectedMembers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one member')),
      );
      return;
    }

    if (mounted) setState(() => _creating = true);

    try {
      final chatService = context.read<ChatService>();
      final cryptoService = context.read<CryptoService>();

      // 1. Generate secure random 32-byte group key
      final random = math.Random.secure();
      final groupKeyBytes = List<int>.generate(32, (_) => random.nextInt(256));
      final groupKeyB64 = base64Encode(groupKeyBytes);

      // 2. Encrypt the group key for ourselves
      final myPubKeyB64 = cryptoService.identityPublicKeyBase64;
      if (myPubKeyB64.isEmpty) {
        throw Exception('Please configure your identity keys before starting chats');
      }
      final myEncryptedPayload = await cryptoService.encrypt(groupKeyB64, myPubKeyB64);
      
      final Map<String, String> memberKeys = {};
      final myId = context.read<AuthService>().currentUser?.id;
      if (myId != null) {
        memberKeys[myId] = myEncryptedPayload;
      }

      // 3. Encrypt the group key for each selected member
      final memberIds = _selectedMembers.map((u) => u.id).toList();
      for (final uid in memberIds) {
        final pubKey = await chatService.getUserEncryptionKey(uid);
        if (pubKey != null && pubKey.isNotEmpty) {
          final payload = await cryptoService.encrypt(groupKeyB64, pubKey);
          memberKeys[uid] = payload;
        }
      }

      // 4. Send create group request to backend
      final chat = await chatService.createGroup(
        type: _isChannel ? 'channel' : 'group',
        title: _groupNameController.text.trim(),
        description: _groupDescController.text.trim(),
        avatarEmoji: _groupEmoji,
        avatarColor: _groupColor,
        memberIds: memberIds,
        expiresInDays: _expiresInDays,
        memberKeys: memberKeys,
      );

      // 5. Store group key locally
      await cryptoService.saveGroupKey(chat.id, groupKeyB64);

      if (mounted) {
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: ${e.toString().replaceFirst('Exception: ', '')}'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  void _openAvatarPicker() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheetState) {
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Pick group avatar',
                    style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Center(
                    child: AvatarIcon(
                      iconKey: _groupEmoji,
                      colorName: _groupColor,
                      size: 88,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('Icon',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 8,
                      childAspectRatio: 1,
                    ),
                    itemCount: _avatarEmojiKeys.length,
                    itemBuilder: (ctx, i) {
                      final key = _avatarEmojiKeys[i];
                      final selected = key == _groupEmoji;
                      return InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () {
                          setSheetState(() => _groupEmoji = key);
                          setState(() {});
                        },
                        child: Container(
                          decoration: BoxDecoration(
                            color: selected
                                ? AvatarIcon.colorFor(_groupColor)
                                    .withOpacity(0.18)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(8),
                            border: selected
                                ? Border.all(
                                    color: AvatarIcon.colorFor(_groupColor),
                                    width: 2,
                                  )
                                : null,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            AvatarIcon.resolveEmoji(key),
                            style: const TextStyle(fontSize: 22),
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 16),
                  Text('Color',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: _avatarColorKeys.map((key) {
                      final selected = key == _groupColor;
                      return GestureDetector(
                        onTap: () {
                          setSheetState(() => _groupColor = key);
                          setState(() {});
                        },
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: AvatarIcon.colorFor(key),
                            shape: BoxShape.circle,
                            border: selected
                                ? Border.all(
                                    color: AvatarIcon.colorFor(key),
                                    width: 3,
                                  )
                                : null,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => Navigator.pop(sheetCtx),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: const Text('Done'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('New Conversation'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.person_outline), text: 'Direct Chat'),
            Tab(icon: Icon(Icons.people_outline), text: 'Group / Channel'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildDirectTab(),
          _buildGroupTab(),
        ],
      ),
    );
  }

  Widget _buildDirectTab() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _searchController,
            onChanged: _search,
            textInputAction: TextInputAction.search,
            autofocus: true,
            decoration: InputDecoration(
              hintText: 'Search by username...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchController.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear',
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        _search('');
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
          child: _searching
              ? const Center(child: CircularProgressIndicator())
              : _results.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.person_search,
                                size: 72, color: Colors.grey[500]),
                            const SizedBox(height: 16),
                            Text(
                              'Find someone to chat with',
                              style: TextStyle(
                                color: Colors.grey[400],
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Search by username to start a direct chat.',
                              style: TextStyle(color: Colors.grey[500]),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    )
                  : ListView.separated(
                      itemCount: _results.length,
                      separatorBuilder: (_, __) =>
                          const Divider(height: 1, indent: 76),
                      itemBuilder: (context, index) {
                        final user = _results[index];
                        return ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 4),
                          leading: AvatarIcon(
                            iconKey: user.avatarEmoji,
                            colorName: user.avatarColor,
                            size: 48,
                            seed: user.id,
                          ),
                          title: Text(
                            user.name ?? 'Unknown',
                            style: const TextStyle(
                                fontWeight: FontWeight.w600),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            '@${user.username ?? ''}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          onTap: () => _startChat(user),
                        );
                      },
                    ),
        ),
      ],
    );
  }

  Widget _buildGroupTab() {
    return Form(
      key: _groupFormKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GestureDetector(
                onTap: _openAvatarPicker,
                child: Container(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Theme.of(context).colorScheme.outlineVariant.withOpacity(0.5),
                      width: 2,
                    ),
                  ),
                  padding: const EdgeInsets.all(4),
                  child: AvatarIcon(
                    iconKey: _groupEmoji,
                    colorName: _groupColor,
                    size: 64,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  children: [
                    TextFormField(
                      controller: _groupNameController,
                      decoration: InputDecoration(
                        labelText: _isChannel ? 'Channel Name' : 'Group Name',
                        border: const OutlineInputBorder(),
                        hintText: 'e.g. Project Sync',
                      ),
                      validator: (v) {
                        if ((v ?? '').trim().isEmpty) return 'Name is required';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _groupDescController,
                      decoration: const InputDecoration(
                        labelText: 'Description (optional)',
                        border: OutlineInputBorder(),
                        hintText: 'What is this chat about?',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            title: const Text('Read-Only Channel'),
            subtitle: const Text('Only administrators can send messages'),
            value: _isChannel,
            onChanged: (val) {
              setState(() {
                _isChannel = val;
                if (_isChannel) {
                  _groupEmoji = 'megaphone';
                  _groupColor = 'teal';
                } else {
                  _groupEmoji = 'groups';
                  _groupColor = 'violet';
                }
              });
            },
          ),
          const Divider(),
          const SizedBox(height: 8),
          Text(
            'Auto-delete after',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              (label: 'Never', value: null),
              (label: '1 day', value: 1),
              (label: '3 days', value: 3),
              (label: '7 days', value: 7),
            ].map((opt) {
              final isSelected = _expiresInDays == opt.value;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(opt.label),
                  selected: isSelected,
                  onSelected: (_) {
                    setState(() => _expiresInDays = opt.value);
                  },
                ),
              );
            }).toList(),
          ),
          if (_expiresInDays != null) ...[
            const SizedBox(height: 6),
            Text(
              'This ${_isChannel ? 'channel' : 'group'} will be permanently deleted after $_expiresInDays day${_expiresInDays! > 1 ? 's' : ''}.',
              style: const TextStyle(fontSize: 12, color: Colors.amber),
            ),
          ],
          const SizedBox(height: 16),
          const Divider(),
          const SizedBox(height: 8),
          Text(
            'Add Members',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 8),
          if (_selectedMembers.isNotEmpty) ...[
            SizedBox(
              height: 48,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _selectedMembers.length,
                itemBuilder: (context, idx) {
                  final u = _selectedMembers[idx];
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: InputChip(
                      avatar: AvatarIcon(
                        iconKey: u.avatarEmoji,
                        colorName: u.avatarColor,
                        size: 24,
                        seed: u.id,
                      ),
                      label: Text(u.name ?? ''),
                      onDeleted: () {
                        setState(() {
                          _selectedMembers.removeWhere((member) => member.id == u.id);
                        });
                      },
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
          ],
          TextField(
            controller: _groupSearchController,
            onChanged: _groupSearch,
            decoration: InputDecoration(
              hintText: 'Search user by username...',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
            ),
          ),
          const SizedBox(height: 8),
          _groupSearching
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: CircularProgressIndicator(),
                  ),
                )
              : _groupSearchResults.isEmpty
                  ? const SizedBox(height: 8)
                  : ListView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: _groupSearchResults.length,
                      itemBuilder: (context, idx) {
                        final u = _groupSearchResults[idx];
                        final isAlreadySelected = _selectedMembers.any((m) => m.id == u.id);
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: AvatarIcon(
                            iconKey: u.avatarEmoji,
                            colorName: u.avatarColor,
                            size: 40,
                            seed: u.id,
                          ),
                          title: Text(u.name ?? ''),
                          subtitle: Text('@${u.username}'),
                          trailing: Checkbox(
                            value: isAlreadySelected,
                            onChanged: (val) {
                              setState(() {
                                if (val == true) {
                                  if (!isAlreadySelected) _selectedMembers.add(u);
                                } else {
                                  _selectedMembers.removeWhere((m) => m.id == u.id);
                                }
                              });
                            },
                          ),
                        );
                      },
                    ),
          const SizedBox(height: 24),
          GestureDetector(
            onTap: _creating ? null : _createGroupChat,
            child: Container(
              height: 52,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF10b981), Color(0xFF0d9488)],
                ),
                borderRadius: BorderRadius.circular(26),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF10b981).withOpacity(0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: _creating
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : Text(
                      _isChannel ? 'Create Channel' : 'Create Group',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
