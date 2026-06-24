# Cryptalk Flutter

Cross-platform mobile + desktop client for Cryptalk. Built with Flutter — one codebase for iOS, Android, macOS, Windows, Linux, and Web.

## Quick Start

```bash
cd flutter
flutter pub get
cp .env.example .env  # set your backend URL
flutter run
```

## Configuration

Edit `.env`:
```
BACKEND_URL=http://10.0.2.2:8001  # Android emulator
BACKEND_URL=http://localhost:8001  # iOS simulator / desktop
BACKEND_URL=https://api.cryptalk.app  # Production
```

## Features

- Email authentication + username onboarding
- Real-time messaging via Socket.IO
- End-to-end encryption (X25519 + ChaCha20-Poly1305)
- Private keys stored in OS keychain (flutter_secure_storage)
- 1:1 chats, group chats, expiring groups (1-7 days)
- Connections system (find users, send/accept requests)
- Blocking + custom nicknames
- Lottie animated stickers
- Custom SVG default avatars

## Architecture

```
lib/
├── main.dart                  # App entry + theme
├── app_router.dart            # Auth gate
├── core/
│   ├── api_config.dart        # Backend URL
│   ├── api_client.dart        # HTTP client (cookie-based auth)
│   ├── auth_service.dart      # Auth + E2EE init
│   ├── chat_service.dart      # Chats + messages
│   ├── crypto_service.dart    # E2EE: X25519, ChaCha20-Poly1305
│   ├── models.dart            # Data models
│   └── socket_service.dart    # Socket.IO client
└── features/
    ├── auth/
    │   ├── auth_screen.dart   # Email login/register
    │   └── onboarding_screen.dart  # Username selection
    └── chat/
        ├── chat_list_screen.dart   # Chat list
        ├── chat_view_screen.dart   # Messages
        └── new_chat_screen.dart    # User search + new chat
```

## Dependencies

- `http` — REST API client
- `socket_io_client` — real-time messaging
- `cryptography` — E2EE (X25519, ChaCha20-Poly1305)
- `flutter_secure_storage` — key storage (keychain/keystore)
- `lottie` — animated stickers
- `flutter_svg` — SVG avatar rendering
- `go_router` — navigation
- `provider` — state management
