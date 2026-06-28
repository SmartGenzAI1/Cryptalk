import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class AvatarIcon extends StatelessWidget {
  final String iconKey;
  final String colorName;
  final double size;
  final bool online;
  final String? seed; // Optional seed (like userId) for default avatar generation

  const AvatarIcon({
    super.key,
    required this.iconKey,
    this.colorName = 'emerald',
    this.size = 40,
    this.online = false,
    this.seed,
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

  // Set of preset animal keys
  static const Set<String> _animalKeys = {
    'fox', 'cat', 'dog', 'bird', 'fish', 'lion', 'panda', 'unicorn',
    'giraffe', 'elephant', 'rabbit', 'owl', 'bear', 'frog', 'turtle',
    'dolphin', 'butterfly', 'dragon', 'dinosaur', 'hedgehog', 'parrot',
    'horse', 'cow', 'chicken', 'duck', 'crab', 'octopus', 'jellyfish',
    'snail', 'spider', 'bat', 'deer', 'kangaroo', 'rhinoceros',
    'hippopotamus', 'snake', 'lizard', 'chameleon', 'starfish', 'seahorse',
  };

  // Map of chat preset keys
  static const Map<String, String> _chatKeys = {
    'chat': 'chat',
    'groups': 'groups',
    'megaphone': 'megaphone',
    'bookmark': 'bookmark',
    'saved': 'bookmark',
  };

  // detect legacy emoji values (non-ascii, short strings) stored in the DB
  static bool isLegacyEmoji(String? value) {
    if (value == null || value.isEmpty) return true;
    return value.length <= 4 && RegExp(r'[^\x00-\x7F]').hasMatch(value);
  }

  // alias for callers that only need the color, no widget
  static Color colorFor(String? name) => _colors[name] ?? _kDefaultColor;

  // Hashing logic matching frontend defaultAvatarForUser
  static int _getHash(String seed) {
    int hash = 0;
    for (int i = 0; i < seed.length; i++) {
      hash = (((hash << 5) - hash) + seed.codeUnitAt(i)) & 0xFFFFFFFF;
    }
    return hash.toSigned(32);
  }

  static int _getAvatarIndex(String? seed) {
    if (seed == null || seed.isEmpty) return 1;
    final hash = _getHash(seed);
    return ((hash.abs() % 8) + 8) % 8 + 1; // 1 to 8
  }

  // Resolve legacy emoji fallback for code compatibility
  static String resolveEmoji(String? value) {
    if (value == null || value.isEmpty) return '🦊';
    if (value.length <= 4 && RegExp(r'[^\x00-\x7F]').hasMatch(value)) {
      return value;
    }
    return '🦊';
  }

  @override
  Widget build(BuildContext context) {
    final color = _colors[colorName] ?? _kDefaultColor;
    final cleanKey = iconKey.trim().toLowerCase();
    
    final isAnimal = _animalKeys.contains(cleanKey);
    final isChat = _chatKeys.containsKey(cleanKey);
    final legacy = isLegacyEmoji(iconKey);
    final showDefault = (!isAnimal && !isChat) || legacy;

    Widget avatarWidget;

    // Check if it is a literal legacy emoji string (like 🦊)
    if (legacy && iconKey.isNotEmpty && RegExp(r'[^\x00-\x7F]').hasMatch(iconKey)) {
      avatarWidget = Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Text(
          iconKey,
          style: TextStyle(fontSize: size * 0.5, height: 1.0),
          textAlign: TextAlign.center,
        ),
      );
    } else if (showDefault) {
      // Load default SVG based on seed
      final index = _getAvatarIndex(seed ?? cleanKey);
      avatarWidget = SvgPicture.asset(
        'assets/icons/defaults/avatar-$index.svg',
        width: size,
        height: size,
        fit: BoxFit.cover,
      );
    } else if (isChat) {
      // Load local chat icon over dynamic background color
      final chatIcon = _chatKeys[cleanKey]!;
      avatarWidget = Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
        ),
        padding: EdgeInsets.all(size * 0.22),
        alignment: Alignment.center,
        child: Image.asset(
          'assets/icons/chat/$chatIcon.png',
          width: size * 0.56,
          height: size * 0.56,
          fit: BoxFit.contain,
        ),
      );
    } else {
      // Load local animal icon over dynamic background color
      avatarWidget = Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Image.asset(
          'assets/icons/avatars/$cleanKey.png',
          width: size * 0.72,
          height: size * 0.72,
          fit: BoxFit.contain,
        ),
      );
    }

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(size / 2),
            child: avatarWidget,
          ),
          if (online)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: size * 0.28,
                height: size * 0.28,
                decoration: BoxDecoration(
                  color: const Color(0xFF22C55E),
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
