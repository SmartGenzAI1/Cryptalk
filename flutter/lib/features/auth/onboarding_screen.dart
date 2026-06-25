import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/ui/avatar.dart';

/// One-shot profile setup shown after the user has just registered (or logged
/// in to an account that never finished onboarding).
///
/// Design goals:
///   • **Delightful**: large hero avatar, calm explanatory copy, single
///     scrollable column, 48px-tall primary CTA.
///   • **Prefilled**: username suggestion derived from the email local-part,
///     display name defaulting to the same prefix Capitalized.
///   • **One-tap avatar**: tap the avatar (or the "Change avatar" pill) to
///     open a bottom-sheet picker with emoji + color. The selection is
///     persisted via `PATCH /api/users/me` after the main `onboard` call so
///     the backend keeps it.
///   • **No useless overlays**: validation is inline (Form + TextFormField
///     validators). Errors are surfaced via SnackBar only for thrown API
///     exceptions.
///   • **Mobile-first**: SafeArea, 44px+ touch targets, scrollable, fills
///     width, keyboard-friendly `textInputAction`.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _usernameController = TextEditingController();
  final _nameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  String _avatarEmoji = 'fox';
  String _avatarColor = 'emerald';
  bool _avatarChanged = false;

  /// Avatar emoji palette — matches the backend's per-user avatar options
  /// (a curated subset of the icon registry; persisted as the icon key, not
  /// the unicode glyph).
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
    // Prefill sensible defaults from the current user's email so the user
    // can just tap "Start Chatting" without typing anything (when the
    // suggestion is free).
    final user = context.read<AuthService>().currentUser;
    if (user != null) {
      _avatarEmoji = user.avatarEmoji.isNotEmpty ? user.avatarEmoji : 'fox';
      _avatarColor = user.avatarColor.isNotEmpty ? user.avatarColor : 'emerald';
      final email = user.email ?? '';
      final prefix = email.split('@').first.toLowerCase();
      final sanitized = prefix.replaceAll(RegExp(r'[^a-z0-9_]'), '');
      if (sanitized.length >= 3 && sanitized.length <= 20) {
        _usernameController.text = sanitized;
      }
      if (sanitized.isNotEmpty) {
        _nameController.text =
            sanitized[0].toUpperCase() + sanitized.substring(1);
      }
    }
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    final username = _usernameController.text.trim().toLowerCase();
    final name = _nameController.text.trim();

    if (mounted) setState(() => _loading = true);
    try {
      final auth = context.read<AuthService>();
      await auth.onboard(username, name);

      // If the user changed their avatar in the picker, persist it via the
      // profile-update endpoint. Failures are non-fatal (onboarding itself
      // already succeeded) — just log.
      if (_avatarChanged) {
        try {
          await context.read<ChatService>().updateProfile(
                avatarEmoji: _avatarEmoji,
                avatarColor: _avatarColor,
              );
          await auth.refreshMe();
        } catch (_) {
          // Swallow: the user is already onboarded; avatar can be changed
          // later from Settings → Edit Profile.
        }
      }
      // No explicit navigation — AppRouter watches AuthService and will
      // rebuild to ChatListScreen as soon as `isOnboarded` flips true.
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceFirst('Exception: ', '')),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
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
                  const SizedBox(height: 4),
                  Text(
                    'Choose an emoji and a background color.',
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: Colors.grey),
                  ),
                  const SizedBox(height: 16),
                  // Live preview
                  Center(
                    child: AvatarIcon(
                      iconKey: _avatarEmoji,
                      colorName: _avatarColor,
                      size: 88,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Emoji',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 8,
                      childAspectRatio: 1,
                      mainAxisSpacing: 4,
                      crossAxisSpacing: 4,
                    ),
                    itemCount: _avatarEmojiKeys.length,
                    itemBuilder: (ctx, i) {
                      final key = _avatarEmojiKeys[i];
                      final selected = key == _avatarEmoji;
                      return InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () => setSheetState(() {
                          _avatarEmoji = key;
                          _avatarChanged = true;
                        }),
                        child: Container(
                          decoration: BoxDecoration(
                            color: selected
                                ? AvatarIcon.colorFor(_avatarColor)
                                    .withOpacity(0.18)
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
                  Text(
                    'Color',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: _avatarColorKeys.map((key) {
                      final selected = key == _avatarColor;
                      return GestureDetector(
                        onTap: () => setSheetState(() {
                          _avatarColor = key;
                          _avatarChanged = true;
                        }),
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
                  const SizedBox(height: 20),
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
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 12),
                    // Hero avatar preview (tap to change).
                    Center(
                      child: Semantics(
                        button: true,
                        label: 'Change avatar',
                        child: GestureDetector(
                          onTap: _openAvatarPicker,
                          child: Container(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: Theme.of(context)
                                    .colorScheme
                                    .outlineVariant
                                    .withOpacity(0.5),
                                width: 2,
                              ),
                            ),
                            padding: const EdgeInsets.all(4),
                            child: AvatarIcon(
                              iconKey: _avatarEmoji,
                              colorName: _avatarColor,
                              size: 96,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: TextButton.icon(
                        onPressed: _openAvatarPicker,
                        icon: const Icon(Icons.edit_outlined, size: 16),
                        label: const Text('Change avatar'),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Set up your profile',
                      style: Theme.of(context)
                          .textTheme
                          .headlineSmall
                          ?.copyWith(fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Pick a username and display name so friends can find '
                      'you. You can change these later.',
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(color: Colors.grey),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 28),
                    TextFormField(
                      controller: _usernameController,
                      decoration: const InputDecoration(
                        labelText: 'Username',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.alternate_email),
                        prefixText: '@ ',
                        hintText: 'your_username',
                        helperText: 'Letters, numbers, and underscore. 3–20 chars.',
                      ),
                      textCapitalization: TextCapitalization.none,
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                      enableSuggestions: false,
                      validator: (v) {
                        final t = (v ?? '').trim().toLowerCase();
                        if (t.length < 3) return 'At least 3 characters';
                        if (t.length > 20) return 'At most 20 characters';
                        if (!RegExp(r'^[a-z0-9_]+$').hasMatch(t)) {
                          return 'Letters, numbers, and underscore only';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _nameController,
                      decoration: const InputDecoration(
                        labelText: 'Display name',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.person_outline),
                        hintText: 'e.g. Alex Rivera',
                      ),
                      textInputAction: TextInputAction.done,
                      textCapitalization: TextCapitalization.words,
                      validator: (v) {
                        final t = (v ?? '').trim();
                        if (t.isEmpty) return 'Display name is required';
                        if (t.length > 40) return 'At most 40 characters';
                        return null;
                      },
                      onFieldSubmitted: (_) {
                        if (!_loading) _submit();
                      },
                    ),
                    const SizedBox(height: 28),
                    FilledButton(
                      onPressed: _loading ? null : _submit,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(52),
                        textStyle: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      child: _loading
                          ? const SizedBox(
                              height: 22,
                              width: 22,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Start Chatting'),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
