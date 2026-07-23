import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/models.dart';
import '../../core/ui/avatar.dart';
import '../connections/connections_screen.dart';
import '../../main.dart';

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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete account?'),
        content: const Text(
            'This permanently deletes all your data. This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
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
                    user.email!,
                    style: TextStyle(color: Colors.grey[500], fontSize: 12),
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
                    : const Text('Submit'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
