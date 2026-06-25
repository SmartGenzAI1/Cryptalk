import 'package:flutter/material.dart';

/// Avatar rendering for both user and chat avatars.
///
/// The backend stores avatar identities as **icon keys** (`'fox'`, `'cat'`,
/// `'bookmark'`, etc.) rather than raw emoji — the web client resolves these
/// to PNG files under `/icons/avatars/<key>.png`. The Flutter app has no
/// equivalent asset bundle, so we resolve keys to unicode emoji via
/// [_avatarEmojiMap]. A best-effort fallback returns the raw value if it
/// already looks like an emoji (legacy data) or a generic 🦊 otherwise.
///
/// Also exposes [colorFor] which maps color names (`'emerald'`, `'violet'`,
/// …) used throughout the API to [Color] constants.
class AvatarIcon extends StatelessWidget {
  final String iconKey;
  final String colorName;
  final double size;
  final bool online;

  const AvatarIcon({
    super.key,
    required this.iconKey,
    this.colorName = 'emerald',
    this.size = 40,
    this.online = false,
  });

  static const Color _kDefaultColor = Color(0xFF10b981);

  /// All color names used by the backend, mapped to Material hex values.
  static const Map<String, Color> _colors = {
    'emerald': Color(0xFF10b981),
    'violet': Color(0xFF8b5cf6),
    'rose': Color(0xFFf43f5e),
    'amber': Color(0xFFf59e0b),
    'cyan': Color(0xFF06b6d4),
    'lime': Color(0xFF84cc16),
    'purple': Color(0xFFa855f7),
    'teal': Color(0xFF14b8a6),
  };

  /// Animal icon keys → unicode emoji. Used for both user avatars and
  /// group/channel/saved chat avatars (the latter via chat-type keys like
  /// `'chat'`, `'groups'`, `'bookmark'`, `'megaphone'`).
  static const Map<String, String> _avatarEmojiMap = {
    // Animals (matches frontend/src/lib/icons.ts AVATAR_ICONS)
    'fox': '🦊',
    'cat': '🐱',
    'dog': '🐶',
    'bird': '🐦',
    'fish': '🐟',
    'lion': '🦁',
    'panda': '🐼',
    'unicorn': '🦄',
    'giraffe': '🦒',
    'elephant': '🐘',
    'rabbit': '🐰',
    'owl': '🦉',
    'bear': '🐻',
    'frog': '🐸',
    'turtle': '🐢',
    'dolphin': '🐬',
    'butterfly': '🦋',
    'dragon': '🐉',
    'dinosaur': '🦕',
    'hedgehog': '🦔',
    'parrot': '🦜',
    'horse': '🐴',
    'cow': '🐄',
    'chicken': '🐔',
    'duck': '🦆',
    'crab': '🦀',
    'octopus': '🐙',
    'jellyfish': '🪼',
    'snail': '🐌',
    'spider': '🕷️',
    'bat': '🦇',
    'deer': '🦌',
    'kangaroo': '🦘',
    'rhinoceros': '🦏',
    'hippopotamus': '🦛',
    'snake': '🐍',
    'lizard': '🦎',
    'chameleon': '🦎',
    'starfish': '⭐',
    'seahorse': ' Seahorse', // no dedicated emoji — falls through to default
    // Chat-type icons (matches frontend CHAT_ICONS)
    'chat': '💬',
    'groups': '👥',
    'megaphone': '📢',
    'bookmark': '🔖',
    'saved': '🔖',
  };

  /// Resolve any stored avatar value to a renderable emoji string.
  /// - Known icon key (e.g. `'fox'`) → mapped emoji.
  /// - Legacy raw emoji (short non-ASCII) → returned as-is.
  /// - Empty / unknown → default 🦊.
  static String resolveEmoji(String? value) {
    if (value == null || value.isEmpty) return '🦊';
    final mapped = _avatarEmojiMap[value];
    if (mapped != null) return mapped;
    // Legacy emoji: short non-ASCII strings stored directly.
    if (value.length <= 4 && RegExp(r'[^\x00-\x7F]').hasMatch(value)) {
      return value;
    }
    return '🦊';
  }

  /// Public alias used by callers that only need the color (without building
  /// a full widget).
  static Color colorFor(String? name) => _colors[name] ?? _kDefaultColor;

  @override
  Widget build(BuildContext context) {
    final color = _colors[colorName] ?? _kDefaultColor;
    final emoji = resolveEmoji(iconKey);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              emoji,
              style: TextStyle(fontSize: size * 0.5, height: 1.0),
              textAlign: TextAlign.center,
            ),
          ),
          if (online)
            Positioned(
              right: -0,
              bottom: -0,
              child: Container(
                width: size * 0.28,
                height: size * 0.28,
                decoration: BoxDecoration(
                  color: const Color(0xFF22c55e),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Theme.of(context).colorScheme.surface,
                    width: 1.5,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
