import 'package:flutter/material.dart';

// avatar rendering. backend stores avatar as an icon key ('fox', 'cat',
// 'bookmark', ...) rather than emoji — web resolves them to /icons/avatars/*.png
// but flutter has no asset bundle, so we map keys to unicode emoji here.
// falls through to the raw value if it already looks like an emoji (legacy)
// or to 🦊 otherwise.
//
// also exposes colorFor which maps the api's color names to Color constants.
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

  // color names → material hex values
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

  // icon keys → unicode emoji. covers user avatars + chat-type icons
  // ('chat', 'groups', 'bookmark', 'megaphone')
  static const Map<String, String> _avatarEmojiMap = {
    // animals (matches frontend AVATAR_ICONS)
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
    'seahorse': ' Seahorse', // no dedicated emoji
    // chat-type icons (matches frontend CHAT_ICONS)
    'chat': '💬',
    'groups': '👥',
    'megaphone': '📢',
    'bookmark': '🔖',
    'saved': '🔖',
  };

  // resolve any stored avatar value to a renderable emoji.
  // known key → mapped emoji. legacy short non-ascii → as-is. else 🦊.
  static String resolveEmoji(String? value) {
    if (value == null || value.isEmpty) return '🦊';
    final mapped = _avatarEmojiMap[value];
    if (mapped != null) return mapped;
    // legacy emoji: short non-ascii strings stored directly
    if (value.length <= 4 && RegExp(r'[^\x00-\x7F]').hasMatch(value)) {
      return value;
    }
    return '🦊';
  }

  // alias for callers that only need the color, no widget
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
