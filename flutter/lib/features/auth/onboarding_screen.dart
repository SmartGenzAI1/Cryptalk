import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/ui/avatar.dart';

// one-shot profile setup shown after register (or login to an account that
// never finished onboarding).
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

  // avatar emoji keys — curated subset of the icon registry
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
    // prefill defaults from the user's email so they can just tap Start
    // Chatting without typing anything
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
      final chatService = context.read<ChatService>();
      await auth.onboard(username, name);

      // if the user changed their avatar in the picker, persist it. failures
      // are non-fatal — onboarding already succeeded, just log
      if (_avatarChanged) {
        try {
          await chatService.updateProfile(
                avatarEmoji: _avatarEmoji,
                avatarColor: _avatarColor,
              );
          await auth.refreshMe();
        } catch (_) {
          // user is already onboarded; avatar can be changed later in settings
        }
      }
      // no explicit navigation — AppRouter watches AuthService and rebuilds to
      // ChatListScreen when isOnboarded flips true
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
      backgroundColor: Colors.transparent,
      showDragHandle: true,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheetState) {
          final currentColor = AvatarIcon.colorFor(_avatarColor);
          return Container(
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A).withValues(alpha: 0.95),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.12),
                width: 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.5),
                  blurRadius: 32,
                  spreadRadius: 4,
                ),
              ],
            ),
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Pick your avatar',
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.pop(sheetCtx),
                          icon: const Icon(Icons.close, color: Colors.grey),
                          visualDensity: VisualDensity.compact,
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Choose an emoji and a background color.',
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(color: Colors.grey[400]),
                    ),
                    const SizedBox(height: 16),
                    // live preview glass card
                    Center(
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: currentColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: currentColor.withValues(alpha: 0.3),
                            width: 1.5,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: currentColor.withValues(alpha: 0.2),
                              blurRadius: 20,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                        child: AvatarIcon(
                          iconKey: _avatarEmoji,
                          colorName: _avatarColor,
                          size: 88,
                          seed: context.read<AuthService>().currentUser?.id,
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Emoji',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: Colors.grey[300],
                          ),
                    ),
                    const SizedBox(height: 8),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 8,
                        childAspectRatio: 1,
                        mainAxisSpacing: 6,
                        crossAxisSpacing: 6,
                      ),
                      itemCount: _avatarEmojiKeys.length,
                      itemBuilder: (ctx, i) {
                        final key = _avatarEmojiKeys[i];
                        final selected = key == _avatarEmoji;
                        return InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () => setSheetState(() {
                            _avatarEmoji = key;
                            _avatarChanged = true;
                          }),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 150),
                            decoration: BoxDecoration(
                              color: selected
                                  ? currentColor.withValues(alpha: 0.25)
                                  : Colors.white.withValues(alpha: 0.04),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: selected
                                    ? currentColor
                                    : Colors.white.withValues(alpha: 0.08),
                                width: selected ? 2 : 1,
                              ),
                              boxShadow: selected
                                  ? [
                                      BoxShadow(
                                        color: currentColor.withValues(alpha: 0.3),
                                        blurRadius: 8,
                                      )
                                    ]
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
                          ?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: Colors.grey[300],
                          ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: _avatarColorKeys.map((key) {
                        final selected = key == _avatarColor;
                        final swatchColor = AvatarIcon.colorFor(key);
                        return GestureDetector(
                          onTap: () => setSheetState(() {
                            _avatarColor = key;
                            _avatarChanged = true;
                          }),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 150),
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: swatchColor,
                              shape: BoxShape.circle,
                              border: selected
                                  ? Border.all(
                                      color: Colors.white,
                                      width: 2.5,
                                    )
                                  : Border.all(
                                      color: Colors.white.withValues(alpha: 0.2),
                                      width: 1,
                                    ),
                              boxShadow: selected
                                  ? [
                                      BoxShadow(
                                        color: swatchColor.withValues(alpha: 0.6),
                                        blurRadius: 10,
                                        spreadRadius: 1,
                                      ),
                                    ]
                                  : null,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 24),
                    GestureDetector(
                      onTap: () => Navigator.pop(sheetCtx),
                      child: Container(
                        height: 48,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xFF10b981), Color(0xFF0d9488)],
                          ),
                          borderRadius: BorderRadius.circular(24),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF10b981).withValues(alpha: 0.35),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        alignment: Alignment.center,
                        child: const Text(
                          'Done',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  InputDecoration _buildGlassInputDecoration({
    required String labelText,
    required IconData prefixIcon,
    String? prefixText,
    String? hintText,
    String? helperText,
  }) {
    return InputDecoration(
      labelText: labelText,
      labelStyle: TextStyle(color: Colors.grey[400]),
      hintText: hintText,
      hintStyle: TextStyle(color: Colors.grey[600]),
      helperText: helperText,
      helperStyle: TextStyle(color: Colors.grey[400], fontSize: 12),
      prefixIcon: Icon(prefixIcon, color: const Color(0xFF10b981).withValues(alpha: 0.8)),
      prefixText: prefixText,
      prefixStyle: const TextStyle(color: Color(0xFF10b981), fontWeight: FontWeight.bold),
      filled: true,
      fillColor: Colors.white.withValues(alpha: 0.05),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.12)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.12)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFF10b981), width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: Colors.redAccent.withValues(alpha: 0.8)),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Colors.redAccent, width: 1.5),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentColor = AvatarIcon.colorFor(_avatarColor);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF0B132B),
              Color(0xFF0F172A),
              Color(0xFF1E1035),
            ],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: Container(
                  padding: const EdgeInsets.all(28),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A).withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.12),
                      width: 1,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.4),
                        blurRadius: 24,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 4),
                        // hero avatar selection (tap to change)
                        Center(
                          child: Semantics(
                            button: true,
                            label: 'Change avatar',
                            child: GestureDetector(
                              onTap: _openAvatarPicker,
                              child: Stack(
                                alignment: Alignment.bottomRight,
                                children: [
                                  Container(
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                        color: currentColor.withValues(alpha: 0.5),
                                        width: 3,
                                      ),
                                      boxShadow: [
                                        BoxShadow(
                                          color: currentColor.withValues(alpha: 0.3),
                                          blurRadius: 18,
                                          spreadRadius: 2,
                                        ),
                                      ],
                                    ),
                                    padding: const EdgeInsets.all(4),
                                    child: AvatarIcon(
                                      iconKey: _avatarEmoji,
                                      colorName: _avatarColor,
                                      size: 96,
                                      seed: context.read<AuthService>().currentUser?.id,
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF10b981),
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                        color: const Color(0xFF0F172A),
                                        width: 2,
                                      ),
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.black.withValues(alpha: 0.3),
                                          blurRadius: 4,
                                        ),
                                      ],
                                    ),
                                    child: const Icon(
                                      Icons.edit,
                                      size: 16,
                                      color: Colors.white,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Center(
                          child: TextButton.icon(
                            onPressed: _openAvatarPicker,
                            icon: const Icon(Icons.edit_outlined, size: 16, color: Color(0xFF10b981)),
                            label: const Text(
                              'Change avatar',
                              style: TextStyle(color: Color(0xFF10b981), fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: 64,
                              height: 6,
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [Color(0xFF10b981), Color(0xFF0d9488)],
                                ),
                                borderRadius: BorderRadius.circular(3),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Choose your username',
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(
                                fontWeight: FontWeight.bold,
                                fontSize: 24,
                                color: Colors.white,
                              ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Pick a username others can search for.',
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(color: Colors.grey[400]),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 28),
                        TextFormField(
                          controller: _usernameController,
                          style: const TextStyle(color: Colors.white),
                          decoration: _buildGlassInputDecoration(
                            labelText: 'Username',
                            prefixIcon: Icons.alternate_email,
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
                        const SizedBox(height: 20),
                        TextFormField(
                          controller: _nameController,
                          style: const TextStyle(color: Colors.white),
                          decoration: _buildGlassInputDecoration(
                            labelText: 'Display name',
                            prefixIcon: Icons.person_outline,
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
                        GestureDetector(
                          onTap: _loading ? null : _submit,
                          child: Container(
                            height: 52,
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [Color(0xFF10b981), Color(0xFF0d9488)],
                              ),
                              borderRadius: BorderRadius.circular(26),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFF10b981).withValues(alpha: 0.35),
                                  blurRadius: 12,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            alignment: Alignment.center,
                            child: _loading
                                ? const SizedBox(
                                    height: 22,
                                    width: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                    ),
                                  )
                                : const Text(
                                    'Start chatting',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
