import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/models.dart';
import '../../core/ui/avatar.dart';
import '../connections/connections_screen.dart';
import '../../main.dart';

String _maskEmail(String email) {
  final parts = email.split('@');
  if (parts.length != 2) return email;
  final local = parts[0];
  final domain = parts[1];
  if (local.length <= 3) return '${local}****@$domain';
  return '${local.substring(0, 3)}****${local.substring(local.length - 2)}@$domain';
}

// settings screen — grouped sections, no clutter. each action that needs
// input (blocked users, cross-chat search, report) opens its own screen via
// Navigator.push instead of stacking dialogs.
class SettingsScreen extends StatefulWidget {
  final bool isInline;
  final VoidCallback? onClose;

  const SettingsScreen({
    super.key,
    this.isInline = false,
    this.onClose,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final user = auth.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
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
        children: [
          if (user != null) ...[
            _ProfileHeader(user: user),
            const SizedBox(height: 8),
          ],
          _SettingsSection(
            title: 'Account',
            children: [
              ListTile(
                leading: const Icon(Icons.person_outline),
                title: const Text('Edit Profile'),
                subtitle: const Text('Name, bio, avatar'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const ProfileEditScreen()),
                  );
                  if (mounted) await auth.refreshMe();
                },
              ),
              ListTile(
                leading: const Icon(Icons.people_outline),
                title: const Text('Connections'),
                subtitle: const Text('Friends, requests, find people'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const ConnectionsScreen()),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.block_outlined),
                title: const Text('Blocked Users'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const BlockedUsersScreen()),
                ),
              ),
            ],
          ),
          _SettingsSection(
            title: 'Appearance',
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Theme Mode',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: () => auth.setThemeMode(ThemeMode.light),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              decoration: BoxDecoration(
                                color: auth.themeMode == ThemeMode.light
                                    ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.15)
                                    : Theme.of(context).colorScheme.surface,
                                border: Border.all(
                                  color: auth.themeMode == ThemeMode.light
                                      ? Theme.of(context).colorScheme.primary
                                      : Theme.of(context).colorScheme.outlineVariant,
                                  width: 2,
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.wb_sunny_outlined,
                                    size: 18,
                                    color: auth.themeMode == ThemeMode.light
                                        ? Theme.of(context).colorScheme.primary
                                        : null,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Light',
                                    style: TextStyle(
                                      fontWeight: auth.themeMode == ThemeMode.light
                                          ? FontWeight.bold
                                          : FontWeight.normal,
                                      color: auth.themeMode == ThemeMode.light
                                          ? Theme.of(context).colorScheme.primary
                                          : null,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: InkWell(
                            onTap: () => auth.setThemeMode(ThemeMode.dark),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              decoration: BoxDecoration(
                                color: auth.themeMode == ThemeMode.dark
                                    ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.15)
                                    : Theme.of(context).colorScheme.surface,
                                border: Border.all(
                                  color: auth.themeMode == ThemeMode.dark
                                      ? Theme.of(context).colorScheme.primary
                                      : Theme.of(context).colorScheme.outlineVariant,
                                  width: 2,
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.nightlight_round_outlined,
                                    size: 18,
                                    color: auth.themeMode == ThemeMode.dark
                                        ? Theme.of(context).colorScheme.primary
                                        : null,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Dark',
                                    style: TextStyle(
                                      fontWeight: auth.themeMode == ThemeMode.dark
                                          ? FontWeight.bold
                                          : FontWeight.normal,
                                      color: auth.themeMode == ThemeMode.dark
                                          ? Theme.of(context).colorScheme.primary
                                          : null,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Accent Color',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 40,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: [
                          'emerald',
                          'violet',
                          'rose',
                          'amber',
                          'cyan',
                          'lime',
                          'purple',
                          'teal'
                        ].map((colorKey) {
                          final Color colorVal = accentColors[colorKey] ?? const Color(0xFF10B981);
                          final bool isSelected = (user?.accentColor ?? 'emerald') == colorKey;
                          return Padding(
                            padding: const EdgeInsets.only(right: 12),
                            child: GestureDetector(
                              onTap: () async {
                                try {
                                  await auth.updateUserSettings({'accentColor': colorKey});
                                } catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('Failed to update accent color: $e')),
                                    );
                                  }
                                }
                              },
                              child: Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: colorVal,
                                  shape: BoxShape.circle,
                                  border: isSelected
                                      ? Border.all(
                                          color: Theme.of(context).colorScheme.onSurface,
                                          width: 3,
                                        )
                                      : null,
                                  boxShadow: [
                                    BoxShadow(
                                      color: colorVal.withValues(alpha: 0.4),
                                      blurRadius: 4,
                                      offset: const Offset(0, 2),
                                    ),
                                  ],
                                ),
                                child: isSelected
                                    ? const Icon(
                                        Icons.check,
                                        color: Colors.white,
                                        size: 20,
                                      )
                                    : null,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Chat Wallpaper',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(height: 10),
                    GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: 3,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      childAspectRatio: 1.4,
                      children: [
                        'dots',
                        'gradient',
                        'plain',
                        'grid',
                        'waves'
                      ].map((wpKey) {
                        final bool isSelected = (user?.wallpaper ?? 'dots') == wpKey;
                        return InkWell(
                          onTap: () async {
                            try {
                              await auth.updateUserSettings({'wallpaper': wpKey});
                            } catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Failed to update wallpaper: $e')),
                                );
                              }
                            }
                          },
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.surface,
                              border: Border.all(
                                color: isSelected
                                    ? Theme.of(context).colorScheme.primary
                                    : Theme.of(context).colorScheme.outlineVariant,
                                width: isSelected ? 2.5 : 1,
                              ),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Stack(
                              children: [
                                Center(
                                  child: Text(
                                    wpKey.toUpperCase(),
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: isSelected
                                          ? Theme.of(context).colorScheme.primary
                                          : Colors.grey,
                                    ),
                                  ),
                                ),
                                if (isSelected)
                                  Positioned(
                                    top: 4,
                                    right: 4,
                                    child: Icon(
                                      Icons.check_circle,
                                      size: 14,
                                      color: Theme.of(context).colorScheme.primary,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),
            ],
          ),
          _SettingsSection(
            title: 'Preferences',
            children: [
              _PreferencesToggle(
                icon: Icons.notifications_outlined,
                label: 'Notifications',
                description: 'Get notified of new messages',
                prefKey: 'zc-notifications',
                defaultValue: true,
              ),
              _PreferencesToggle(
                icon: Icons.mark_email_read_outlined,
                label: 'Read receipts',
                description: 'Show others you read their messages',
                prefKey: 'zc-readReceipts',
                defaultValue: true,
              ),
              _PreferencesToggle(
                icon: Icons.keyboard_outlined,
                label: 'Typing indicators',
                description: 'Show when you are typing a message',
                prefKey: 'zc-typingIndicators',
                defaultValue: true,
              ),
              _PreferencesToggle(
                icon: Icons.circle_outlined,
                label: 'Online status',
                description: 'Show when you are online',
                prefKey: 'zc-onlineStatus',
                defaultValue: true,
              ),
              _PreferencesToggle(
                icon: Icons.schedule_outlined,
                label: 'Last seen',
                description: 'Show when you were last active',
                prefKey: 'zc-lastSeen',
                defaultValue: true,
              ),
            ],
          ),
          _SettingsSection(
            title: 'Search',
            children: [
              ListTile(
                leading: const Icon(Icons.search),
                title: const Text('Search Messages'),
                subtitle: const Text('Find across all chats'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const CrossChatSearchScreen()),
                ),
              ),
            ],
          ),
          _SettingsSection(
            title: 'More',
            children: [
              ListTile(
                leading: const Icon(Icons.bookmark_outline, color: Colors.teal),
                title: const Text('Saved Messages'),
                subtitle: const Text('Personal cloud & note storage'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  final chatService = context.read<ChatService>();
                  final chats = await chatService.getChats();
                  if (!context.mounted) return;
                  final saved = chats.where((c) => c.type == 'saved').firstOrNull;
                  if (saved != null && context.mounted) {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ChangeNotifierProvider.value(
                          value: context.read<AuthService>(),
                          child: _ChatViewPlaceholder(chatId: saved.id, title: 'Saved Messages'),
                        ),
                      ),
                    );
                  }
                },
              ),
              ListTile(
                leading: const Icon(Icons.shield_outlined, color: Colors.blue),
                title: const Text('Privacy & Security'),
                subtitle: const Text('Manage E2EE & your data'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const PrivacyScreen()),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.info_outline, color: Colors.teal),
                title: const Text('About Cryptalk'),
                subtitle: const Text('Version 2.0 • Premium Details'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AboutScreen()),
                ),
              ),
            ],
          ),
          _SettingsSection(
            title: 'Support',
            children: [
              ListTile(
                leading:
                    const Icon(Icons.report_outlined, color: Colors.orange),
                title: const Text('Report a Problem'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ReportScreen()),
                ),
              ),
            ],
          ),
          _SettingsSection(
            title: 'Sign out',
            children: [
              ListTile(
                leading: const Icon(Icons.logout, color: Colors.red),
                title:
                    const Text('Sign Out', style: TextStyle(color: Colors.red)),
                onTap: () => _confirmSignOut(context, auth),
              ),
              ListTile(
                leading: const Icon(Icons.delete_forever, color: Colors.red),
                title: const Text('Delete Account',
                    style: TextStyle(color: Colors.red)),
                onTap: () => _confirmDeleteAccount(context, auth),
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: Text('Cryptalk v1.0.0',
                  style: TextStyle(color: Colors.grey)),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmSignOut(
      BuildContext context, AuthService auth) async {
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
  }

  Future<void> _confirmDeleteAccount(
      BuildContext context, AuthService auth) async {
    final chatService = context.read<ChatService>();
    final user = auth.currentUser;
    if (user == null) return;

    final controller = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete account?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This permanently deletes all your data. This cannot be undone.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            Text(
              'To confirm, type your username: @${user.username}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                hintText: 'Type username here',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            onPressed: () {
              if (controller.text.trim() == user.username) {
                Navigator.pop(ctx, true);
              }
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (confirmed != true) return;
    try {
      await chatService.deleteAccount();
      await auth.logout();
    } catch (_) {}
  }
}

// profile card at the top of the settings list — large avatar, name, @username
class _ProfileHeader extends StatelessWidget {
  final AppUser user;
  const _ProfileHeader({required this.user});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          AvatarIcon(
            iconKey: user.avatarEmoji,
            colorName: user.avatarColor,
            size: 64,
            seed: user.id,
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.name ?? 'Unknown',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  '@${user.username ?? ''}',
                  style: TextStyle(color: Colors.grey[400]),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if ((user.email ?? '').isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    _maskEmail(user.email!),
                    style: TextStyle(color: Colors.grey[500], fontSize: 12, fontFamily: 'monospace'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// labelled group of listtiles. material 3 has no settings-group widget so
// this is a small helper: title + card-shaped container.
class _SettingsSection extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _SettingsSection({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            title.toUpperCase(),
            style: TextStyle(
              color: Colors.grey[500],
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Material(
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (int i = 0; i < children.length; i++) ...[
                  children[i],
                  if (i < children.length - 1)
                    const Divider(height: 1, indent: 16, endIndent: 0),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ─── edit profile ────────────────────────────────────────────────────────

class ProfileEditScreen extends StatefulWidget {
  const ProfileEditScreen({super.key});

  @override
  State<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends State<ProfileEditScreen> {
  final _nameController = TextEditingController();
  final _bioController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _saving = false;
  String _avatarEmoji = 'fox';
  String _avatarColor = 'emerald';

  static const List<String> _avatarEmojiKeys = [
    'fox', 'cat', 'dog', 'panda', 'lion', 'unicorn',
    'rabbit', 'owl', 'bear', 'frog', 'turtle', 'butterfly',
    'dolphin', 'dragon', 'hedgehog', 'parrot',
  ];

  static const List<String> _avatarColorKeys = [
    'emerald', 'violet', 'rose', 'amber',
    'cyan', 'lime', 'purple', 'teal',
  ];

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthService>().currentUser;
    _nameController.text = user?.name ?? '';
    _bioController.text = user?.bio ?? '';
    _avatarEmoji =
        (user?.avatarEmoji.isNotEmpty ?? false) ? user!.avatarEmoji : 'fox';
    _avatarColor = (user?.avatarColor.isNotEmpty ?? false)
        ? user!.avatarColor
        : 'emerald';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;
    final chatService = context.read<ChatService>();
    final auth = context.read<AuthService>();
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);

    if (mounted) setState(() => _saving = true);
    try {
      await chatService.updateProfile(
            name: _nameController.text.trim(),
            bio: _bioController.text.trim(),
            avatarEmoji: _avatarEmoji,
            avatarColor: _avatarColor,
          );
      // refresh cached user so settings + chat list show the new avatar/name
      await auth.refreshMe();
      navigator.pop();
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content:
              Text('Failed: ${e.toString().replaceFirst('Exception: ', '')}'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
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
                    'Pick your avatar',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Center(
                    child: AvatarIcon(
                      iconKey: _avatarEmoji,
                      colorName: _avatarColor,
                      size: 88,
                      seed: context.read<AuthService>().currentUser?.id,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('Emoji',
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
                      final selected = key == _avatarEmoji;
                      return InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () =>
                            setSheetState(() => _avatarEmoji = key),
                        child: Container(
                          decoration: BoxDecoration(
                            color: selected
                                ? AvatarIcon.colorFor(_avatarColor)
                                    .withValues(alpha: 0.18)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(8),
                            border: selected
                                ? Border.all(
                                    color: AvatarIcon.colorFor(_avatarColor),
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
                      final selected = key == _avatarColor;
                      return GestureDetector(
                        onTap: () =>
                            setSheetState(() => _avatarColor = key),
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: AvatarIcon.colorFor(key),
                            shape: BoxShape.circle,
                            border: selected
                                ? Border.all(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurface,
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
      appBar: AppBar(title: const Text('Edit Profile')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: GestureDetector(
                    onTap: _openAvatarPicker,
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Theme.of(context)
                              .colorScheme
                              .outlineVariant
                              .withValues(alpha: 0.5),
                          width: 2,
                        ),
                      ),
                      padding: const EdgeInsets.all(4),
                      child: AvatarIcon(
                        iconKey: _avatarEmoji,
                        colorName: _avatarColor,
                        size: 96,
                        seed: context.read<AuthService>().currentUser?.id,
                      ),
                    ),
                  ),
                ),
                Center(
                  child: TextButton.icon(
                    onPressed: _openAvatarPicker,
                    icon: const Icon(Icons.edit_outlined, size: 16),
                    label: const Text('Change avatar'),
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    labelText: 'Display Name',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                  textCapitalization: TextCapitalization.words,
                  validator: (v) {
                    final t = (v ?? '').trim();
                    if (t.isEmpty) return 'Display name is required';
                    if (t.length > 50) return 'At most 50 characters';
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _bioController,
                  decoration: const InputDecoration(
                    labelText: 'Bio',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.notes),
                    helperText: 'A short description shown on your profile.',
                  ),
                  maxLines: 3,
                  maxLength: 160,
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                  ),
                  child: _saving
                      ? const SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Save'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── blocked users screen ────────────────────────────────────────────────

class BlockedUsersScreen extends StatefulWidget {
  const BlockedUsersScreen({super.key});

  @override
  State<BlockedUsersScreen> createState() => _BlockedUsersScreenState();
}

class _BlockedUsersScreenState extends State<BlockedUsersScreen> {
  List<AppUser> _blocked = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final blocked = await context.read<ChatService>().getBlockedUsers();
      if (mounted) {
        setState(() {
          _blocked = blocked;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst('Exception: ', '');
          _loading = false;
        });
      }
    }
  }

  Future<void> _unblock(AppUser user) async {
    try {
      await context.read<ChatService>().unblockUser(user.id);
      if (mounted) {
        setState(() => _blocked.removeWhere((u) => u.id == user.id));
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Unblocked @${user.username ?? user.id}'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_loading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_error != null) {
      body = Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off, size: 72, color: Colors.red[300]),
              const SizedBox(height: 16),
              const Text('Could not load blocked users'),
              const SizedBox(height: 16),
              FilledButton.tonalIcon(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    } else if (_blocked.isEmpty) {
      body = Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.check_circle_outline,
                  size: 72, color: Colors.grey[500]),
              const SizedBox(height: 16),
              Text(
                'No blocked users',
                style: TextStyle(color: Colors.grey[400]),
              ),
            ],
          ),
        ),
      );
    } else {
      body = ListView.separated(
        itemCount: _blocked.length,
        separatorBuilder: (_, __) => const Divider(height: 1, indent: 76),
        itemBuilder: (context, index) {
          final u = _blocked[index];
          return ListTile(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            leading: AvatarIcon(
              iconKey: u.avatarEmoji,
              colorName: u.avatarColor,
              size: 48,
              seed: u.id,
            ),
            title: Text(
              u.name ?? 'Unknown',
              style: const TextStyle(fontWeight: FontWeight.w600),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text(
              '@${u.username ?? ''}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: OutlinedButton(
              onPressed: () => _unblock(u),
              child: const Text('Unblock'),
            ),
          );
        },
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Blocked Users')),
      body: body,
    );
  }
}

// ─── cross-chat search screen ────────────────────────────────────────────

class CrossChatSearchScreen extends StatefulWidget {
  const CrossChatSearchScreen({super.key});

  @override
  State<CrossChatSearchScreen> createState() => _CrossChatSearchScreenState();
}

class _CrossChatSearchScreenState extends State<CrossChatSearchScreen> {
  final _controller = TextEditingController();
  List<Map<String, dynamic>> _results = [];
  bool _searching = false;
  bool _searched = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    final query = q.trim();
    if (query.isEmpty) {
      if (mounted) {
        setState(() {
          _results = [];
          _searched = false;
        });
      }
      return;
    }
    if (mounted) setState(() => _searching = true);
    try {
      final results = await context.read<ChatService>().crossChatSearch(query);
      if (mounted) {
        setState(() {
          _results = results;
          _searched = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _results = []);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Search Messages')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _controller,
              onChanged: _search,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search across all chats...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _controller.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear',
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _controller.clear();
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
                          child: Text(
                            _searched ? 'No results' : 'Type to search',
                            style: TextStyle(color: Colors.grey[400]),
                          ),
                        ),
                      )
                    : ListView.separated(
                        itemCount: _results.length,
                        separatorBuilder: (_, __) =>
                            const Divider(height: 1, indent: 16),
                        itemBuilder: (context, index) {
                          final r = _results[index];
                          return ListTile(
                            title: Text(
                              (r['chatTitle'] ?? '(unknown)').toString(),
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            subtitle: Text(
                              (r['content'] ?? '').toString(),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}

// ─── report a problem screen ────────────────────────────────────────────

class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key});

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    if (mounted) setState(() => _sending = true);
    try {
      await context.read<ChatService>().api.post('/api/reports', body: {
        'reason': text,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Report submitted. Thank you!'),
            behavior: SnackBarBehavior.floating,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'Failed: ${e.toString().replaceFirst('Exception: ', '')}'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Report a Problem')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Describe the issue you encountered. The more detail, the better.',
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: Colors.grey[400]),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _controller,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: 'What happened?',
                  alignLabelWithHint: true,
                ),
                maxLines: 6,
                maxLength: 1000,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _sending ? null : _submit,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                ),
                child: _sending
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    :                   const Text('Submit'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── preferences toggle ──────────────────────────────────────────────────

class _PreferencesToggle extends StatefulWidget {
  final IconData icon;
  final String label;
  final String description;
  final String prefKey;
  final bool defaultValue;

  const _PreferencesToggle({
    required this.icon,
    required this.label,
    required this.description,
    required this.prefKey,
    required this.defaultValue,
  });

  @override
  State<_PreferencesToggle> createState() => _PreferencesToggleState();
}

class _PreferencesToggleState extends State<_PreferencesToggle> {
  late bool _value;
  final _storage = const FlutterSecureStorage();

  @override
  void initState() {
    super.initState();
    _value = widget.defaultValue;
    _load();
  }

  Future<void> _load() async {
    final val = await _storage.read(key: widget.prefKey);
    if (mounted) {
      setState(() => _value = val == null ? widget.defaultValue : val == 'true');
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(widget.icon),
      title: Text(widget.label),
      subtitle: Text(widget.description),
      trailing: Switch(
        value: _value,
        onChanged: (v) async {
          await _storage.write(key: widget.prefKey, value: v.toString());
          if (mounted) setState(() => _value = v);
        },
      ),
    );
  }
}

// ─── privacy & security screen ───────────────────────────────────────────

class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthService>();
    final user = auth.currentUser;
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy & Security')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.2),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.lock, color: Theme.of(context).colorScheme.primary, size: 18),
                    const SizedBox(width: 8),
                    Text(
                      'End-to-End Encrypted (E2EE)',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.primary,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Cryptalk encrypts messages client-side using XChaCha20-Poly1305. The keys are stored inside your device and never sent to our servers. Your conversations are completely private.',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[400],
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _SectionHeader(icon: Icons.privacy_tip_outlined, title: 'Privacy Preferences'),
          const SizedBox(height: 8),
          _PreferencesToggle(
            icon: Icons.mark_email_read_outlined,
            label: 'Read receipts',
            description: 'Show others you read their messages',
            prefKey: 'zc-readReceipts',
            defaultValue: true,
          ),
          _PreferencesToggle(
            icon: Icons.keyboard_outlined,
            label: 'Typing indicators',
            description: 'Show when you are typing a message',
            prefKey: 'zc-typingIndicators',
            defaultValue: true,
          ),
          _PreferencesToggle(
            icon: Icons.circle_outlined,
            label: 'Online status',
            description: 'Show when you are online',
            prefKey: 'zc-onlineStatus',
            defaultValue: true,
          ),
          _PreferencesToggle(
            icon: Icons.schedule_outlined,
            label: 'Last seen',
            description: 'Show when you were last active',
            prefKey: 'zc-lastSeen',
            defaultValue: true,
          ),
          const SizedBox(height: 24),
          _SectionHeader(icon: Icons.shield_outlined, title: 'Privacy Policy'),
          _buildPolicyItem(
            'Zero Log Policy',
            'We do not track, index, or store metadata, IP logs, or analytics. Your messages belong to you, and we collect zero user analytical data.',
          ),
          _buildPolicyItem(
            'Server Ephemerality',
            'Delivered messages are instantly wiped from the backend database. Undelivered messages or media attachments are automatically deleted once the self-destruct timers or delivery confirms are finalized.',
          ),
          const SizedBox(height: 24),
          _SectionHeader(icon: Icons.warning_amber_outlined, title: 'Data Actions'),
          const SizedBox(height: 8),
          ListTile(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: Colors.amber.withValues(alpha: 0.3),
                style: BorderStyle.solid,
              ),
            ),
            leading: const Icon(Icons.key, color: Colors.amber),
            title: const Text('Wipe E2EE keys & cache'),
            subtitle: const Text('Log out & wipe local data'),
            onTap: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Clear all E2EE keys?'),
                  content: const Text(
                    'You will lose access to decrypting previous encrypted group/private messages. This cannot be undone.',
                  ),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                    FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: Colors.amber),
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Wipe'),
                    ),
                  ],
                ),
              );
              if (confirmed == true && context.mounted) {
                await auth.logout();
              }
            },
          ),
          const SizedBox(height: 8),
          ListTile(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: Colors.red.withValues(alpha: 0.3),
                style: BorderStyle.solid,
              ),
            ),
            leading: const Icon(Icons.delete_forever, color: Colors.red),
            title: const Text('Delete account'),
            subtitle: const Text('Permanently delete server data'),
            onTap: () => _confirmDeleteAccount(context, auth),
          ),
          const SizedBox(height: 8),
          ListTile(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: Colors.red.shade700.withValues(alpha: 0.5),
                width: 2,
                style: BorderStyle.solid,
              ),
            ),
            leading: Icon(Icons.warning_amber, color: Colors.red.shade700),
            title: Text(
              'Delete My Account Immediately',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: Colors.red.shade700,
              ),
            ),
            subtitle: const Text('Instant full data destruction — no recovery'),
            onTap: () => _confirmImmediateDelete(context, auth),
          ),
        ],
      ),
    );
  }

  Widget _buildPolicyItem(String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            description,
            style: TextStyle(fontSize: 12, color: Colors.grey[400], height: 1.5),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDeleteAccount(BuildContext context, AuthService auth) async {
    final user = auth.currentUser;
    if (user == null) return;
    final controller = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete account?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This permanently deletes all your data. This cannot be undone.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            Text(
              'To confirm, type your username: @${user.username}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                hintText: 'Type username here',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              if (controller.text.trim() == user.username) {
                Navigator.pop(ctx, true);
              }
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (confirmed != true) return;
    try {
      final chatService = context.read<ChatService>();
      await chatService.deleteAccount();
      await auth.logout();
    } catch (_) {}
  }

  Future<void> _confirmImmediateDelete(BuildContext context, AuthService auth) async {
    final user = auth.currentUser;
    if (user == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete account immediately?'),
        content: const Text(
          'This will immediately and permanently destroy ALL your data including messages, files, keys, and profile. This action CANNOT be undone.',
          style: TextStyle(fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.red.shade700,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete Immediately'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final chatService = context.read<ChatService>();
      await chatService.deleteAccount();
      await auth.logout();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Account immediately deleted. All data has been destroyed.'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (_) {}
  }
}

// ─── about screen ────────────────────────────────────────────────────────

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('About Cryptalk')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Center(
            child: Column(
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Colors.teal, Color(0xFF10B981)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.teal.withValues(alpha: 0.3),
                        blurRadius: 16,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Text(
                      'C',
                      style: TextStyle(
                        fontSize: 36,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Cryptalk',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  'Version 2.0.0 • Production',
                  style: TextStyle(fontSize: 12, color: Colors.grey[400]),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.2),
                    ),
                  ),
                  child: Text(
                    'Premium Lifetime License',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.primary,
                      letterSpacing: 1,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Cryptalk is a state-of-the-art secure chat application designed for absolute privacy. Feature-rich, fast, and protected by military-grade client-side encryption.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: Colors.grey[400], height: 1.5),
          ),
          const SizedBox(height: 24),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 2,
            children: [
              _FeatureCard(icon: Icons.lock, title: 'E2EE Crypto', subtitle: 'XChaCha20-Poly1305 secure keys', iconColor: Colors.teal),
              _FeatureCard(icon: Icons.bolt, title: 'Ultra Fast', subtitle: 'Sub-millisecond socket delivery', iconColor: Colors.amber),
              _FeatureCard(icon: Icons.shield_outlined, title: 'Zero Logs', subtitle: 'No tracking or analytics', iconColor: Colors.blue),
              _FeatureCard(icon: Icons.star_outline, title: 'Lottie', subtitle: 'Telegram animated emojis', iconColor: Colors.pink),
            ],
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              border: Border.all(
                color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.2),
              ),
              borderRadius: BorderRadius.circular(12),
              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.05),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.info_outline, size: 16, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(width: 8),
                    Text(
                      'About Us (SmartGenzAI)',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'SmartGenzAI is dedicated to building next-generation secure, private, and surveillance-free communication platforms. We believe privacy is a fundamental human right, not a luxury.',
                  style: TextStyle(fontSize: 12, color: Colors.grey[400], height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.amber.withValues(alpha: 0.2)),
              borderRadius: BorderRadius.circular(12),
              color: Colors.amber.withValues(alpha: 0.05),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.warning_amber, size: 16, color: Colors.amber),
                    const SizedBox(width: 8),
                    Text(
                      'Important Disclaimer',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.amber[700]),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Cryptalk is currently in its early phase of development. While cryptographic and E2EE protocols are active, you may encounter bugs. Please do not use it for critical secrets or store irreplaceable data.',
                  style: TextStyle(fontSize: 12, color: Colors.grey[400], height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Column(
            children: [
              Text(
                'Designed and built for absolute privacy.',
                style: TextStyle(fontSize: 12, color: Colors.grey[500]),
              ),
              const SizedBox(height: 4),
              const Text(
                '© SmartGenzAI. All rights reserved.',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  const _SectionHeader({required this.icon, required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.grey[400]),
        const SizedBox(width: 8),
        Text(
          title.toUpperCase(),
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey[400], letterSpacing: 1),
        ),
      ],
    );
  }
}

class _FeatureCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color iconColor;

  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(12),
        color: Theme.of(context).colorScheme.surface,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: iconColor),
              const SizedBox(width: 6),
              Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 4),
          Text(subtitle, style: TextStyle(fontSize: 10, color: Colors.grey[500])),
        ],
      ),
    );
  }
}

// ─── placeholder for saved messages from settings ────────────────────────
// (minimal — full chat view is in chat_view_screen.dart)

class _ChatViewPlaceholder extends StatelessWidget {
  final String chatId;
  final String title;
  const _ChatViewPlaceholder({required this.chatId, required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: const Center(child: Text('Open this chat from the chat list')),
    );
  }
}
