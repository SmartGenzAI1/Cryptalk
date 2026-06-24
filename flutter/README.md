# Cryptalk Flutter

Cross-platform client for iOS, Android, macOS, Windows, Linux.

## Quick Start

```bash
cd flutter
flutter pub get
cp .env.example .env  # set BACKEND_URL
flutter run
```

## Environment

```
BACKEND_URL=http://10.0.2.2:8001          # Android emulator
BACKEND_URL=http://localhost:8001          # iOS/desktop
BACKEND_URL=https://cryptalk-backend.onrender.com  # Production

SUPABASE_URL=https://xxx.supabase.co       # Optional
SUPABASE_ANON_KEY=eyJhbG...                # Optional
```

## Build APK

Push a version tag to trigger the GitHub Actions build:
```bash
git tag v1.0.0
git push origin v1.0.0
```

The APK will be available under Releases.

## Architecture

```
lib/
├── main.dart              # Entry + Supabase init
├── app_router.dart        # Auth gate
├── core/
│   ├── api_config.dart    # Backend URL
│   ├── api_client.dart    # HTTP (cookie auth)
│   ├── auth_service.dart  # Login + E2EE init
│   ├── chat_service.dart  # Chats + messages
│   ├── crypto_service.dart # X25519 + ChaCha20-Poly1305
│   ├── models.dart        # Data models
│   ├── socket_service.dart # Socket.IO
│   └── supabase_service.dart # Storage + queries
└── features/
    ├── auth/
    │   ├── auth_screen.dart
    │   └── onboarding_screen.dart
    └── chat/
        ├── chat_list_screen.dart
        ├── chat_view_screen.dart
        └── new_chat_screen.dart
```

## Permissions

- Microphone (voice messages)
- Camera (future photo capture)
- Storage (file sharing)
- Biometric (future lock screen)
- Notifications (push)
- Internet + network state
