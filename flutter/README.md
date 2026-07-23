# Cryptalk Flutter Client

A high-performance, cross-platform Flutter application for iOS, Android, macOS, Windows, and Linux built for secure, end-to-end encrypted real-time messaging.

## Quick Start

```bash
cd flutter
flutter pub get
cp .env.example .env  # set BACKEND_URL
flutter run
```

## Environment Configuration

Create a `.env` file in the `flutter` root directory with the target server configuration:

```env
BACKEND_URL=http://10.0.2.2:8001          # Android Emulator
BACKEND_URL=http://localhost:8001          # iOS Simulator / Desktop
BACKEND_URL=https://cryptalk-backend.onrender.com  # Production

SUPABASE_URL=https://xxx.supabase.co       # Optional media storage
SUPABASE_ANON_KEY=eyJhbG...                # Optional media storage key
```

## Build & Release APK

Push a semantic version tag to trigger the automated GitHub Actions CI/CD build pipeline:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The compiled release APK will be available under repository GitHub Releases.

---

## Testing & Test Runner Instructions

Cryptalk includes automated unit and widget test suites under the `test/` directory to verify component initialization, data model serialization, and state transition logic.

### Specified Flutter SDK Path

To execute tests using the local Flutter SDK installation, run:

- **PowerShell**:
  ```powershell
  & "C:\Users\owais\Downloads\flutter_windows_3.44.0-stable\flutter\bin\flutter.bat" test
  ```

- **Standard CLI (if Flutter is on system PATH)**:
  ```bash
  flutter test
  ```

### Running Specific Test Suites

- **Widget & Model Tests**:
  ```powershell
  & "C:\Users\owais\Downloads\flutter_windows_3.44.0-stable\flutter\bin\flutter.bat" test test/widget_test.dart
  ```

- **Test Coverage Breakdown**:
  - `CryptalkApp`: Root widget initialization and provider hierarchy integration.
  - `Message Model Tests`: Deserialization of message status delivery stages (`pending`, `sent`, `delivered`, `read`), `replyTo` nesting, and state transitions via `copyWith`.

---

## Design Tokens & Dark Glassmorphism Theme

Cryptalk utilizes a modern Material 3 design system customized with dark glassmorphism aesthetic tokens and dynamic theme accents.

### Dark Glassmorphism Color Palette

| Token | Hex / Color | Light Mode Equivalent | Description |
| :--- | :--- | :--- | :--- |
| **Scaffold Background** | `#0B132B` | `#F8FAFC` | Deep obsidian dark background / Light slate canvas |
| **Surface Base** | `#0F172A` | `#FFFFFF` | Midnight slate surface / Pure white card background |
| **Container Low** | `#1E293B` | `#F8FAFC` | Subtle elevated panels, search bars, inputs |
| **Container Medium** | `#334155` | `#F1F5F9` | Hover states, active items, chip backgrounds |
| **Border / Divider** | `#1E293B` | `#E2E8F0` | Subdued 1px glass borders (`BorderSide`) |

### Accent Color Themes

Users can select from 8 dynamic accent color themes stored in `AuthService` (`accentColors` registry):

- 🟢 **Emerald** (`#10B981`) *(Default)*
- 🟣 **Violet** (`#8B5CF6`)
- 🌹 **Rose** (`#F43F5E`)
- 🟠 **Amber** (`#F59E0B`)
- 🩵 **Cyan** (`#06B6D4`)
- 🍏 **Lime** (`#84CC16`)
- 🔮 **Purple** (`#A855F7`)
- 🪼 **Teal** (`#14B8A6`)

---

## Input Field & Form Component Styling

Form fields and text inputs follow standardized glassmorphism decorations defined in `ThemeData.inputDecorationTheme` (`lib/main.dart`) and custom glass helpers:

### Global Input Field Theme (`InputDecorationTheme`)

- **Shape**: Rounded borders with 16px corner radius (`BorderRadius.circular(16)`).
- **Padding**: Symmetric content padding (`horizontal: 16, vertical: 14`).
- **Fill**: Solid midnight slate (`#0F172A`) in dark mode and pure white (`#FFFFFF`) in light mode.
- **Borders**: 1px subtle borders (`#1E293B` / `#E2E8F0`), transitioning to a 1.5px active accent color highlight on focus (`focusedBorder`).

### Onboarding & Auth Glass Inputs (`_buildGlassInputDecoration`)

- **Backdrop**: Semi-transparent frosted glass backdrop (`Colors.white.withValues(alpha: 0.05)`).
- **Typography & Icons**: Styled labels (`#9CA3AF`), hints (`#4B5563`), and helper text with dynamic accent icon highlights (`#10B981` at 80% opacity).

---

## Premium UI Component Library

### `AvatarIcon` (`lib/core/ui/avatar.dart`)

High-performance, multi-layered user avatar component supporting:

- **Seeded Default SVGs**: 8 custom vector default avatars (`assets/icons/defaults/avatar-1.svg` to `avatar-8.svg`) deterministically assigned via seed/userId hashing algorithms.
- **Preset Animal Avatars**: 40+ animal asset avatars (`fox`, `cat`, `dog`, `lion`, `panda`, `unicorn`, `dragon`, etc.).
- **Chat Type Presets**: Dedicated conversation icons (`chat`, `groups`, `megaphone`, `bookmark`).
- **Legacy Emoji Fallback**: Backward compatibility with legacy unicode emoji characters.
- **Presence Badge**: Real-time online status indicator badge (green `#22C55E` dot with adaptive surface border).

### `AnimatedEmoji` (`lib/core/animated_emojis.dart`)

- Rich collection of animated & high-res emoji rendering for message reactions, tap effects, and chat thread interactions.

### Glass Cards & Containers (`CardThemeData`)

- Flat 0-elevation design with rounded 16px borders and subtle glass outline borders (`#1E293B`).

---

## Flutter & Dart Architecture

Cryptalk Flutter follows a reactive, service-oriented architecture utilizing Provider for dependency injection and state management.

### Layer Breakdown

- **Core Layer (`lib/core/`)**:
  - `api_client.dart`: Standardized HTTP client with cookie and session token authentication.
  - `auth_service.dart`: Authentication state provider, user onboarding, theme preference, and E2EE key initialization.
  - `chat_service.dart`: Chat lifecycle methods (fetching chats/messages, sending messages, pinning/muting chats, marking messages as delivered/read).
  - `crypto_service.dart`: End-to-end encryption engine powered by X25519 key exchange and ChaCha20-Poly1305 payload ciphering.
  - `socket_service.dart`: Singleton WebSocket connection hub managing realtime events, presence, typing indicators, and room subscriptions.
  - `models.dart`: Strongly-typed Dart data models for users, chats, messages, and connection requests.
  - `ui/avatar.dart`: `AvatarIcon` component for render-optimized avatar graphics and presence badges.

- **Feature Layer (`lib/features/`)**:
  - `auth/`: Screens for login, registration, and onboarding profile customization.
  - `chat/`: `chat_list_screen.dart` (responsive chat list & wide-screen split view layout), `chat_view_screen.dart` (realtime message thread view, media playback, reactions, voice recording), `chat_info_screen.dart` (chat metadata, member lists, encryption key verification), and `new_chat_screen.dart` (direct messaging & group/channel creation).
  - `connections/`: User discovery and friend request management.
  - `settings/`: App theme, accent color, chat wallpaper, and security configuration.

- **Responsive Split-View Layout**:
  - On screens ≥ 768px wide (desktop/tablet), the UI automatically transitions to a multi-column desktop workstation layout with a navigation sidebar, dynamic chat list column, inline active conversation window, and contextual side panels (chat info, settings, connections).
  - On mobile devices (< 768px wide), standard stack-based navigation (`Navigator.push`) is used.

---

## Socket Room Re-Joining

Realtime communication is maintained via Socket.IO through `SocketService` (`lib/core/socket_service.dart`):

1. **Idempotent Connection & Identification**:
   - `SocketService.connect(userId, token)` authenticates the connection using session tokens and emits an `identify` event.

2. **Automatic Room Re-Joining**:
   - `SocketService` tracks the currently active conversation room ID (`_activeChatId`).
   - Upon network reconnection or socket reconnect events (`onConnect`), `SocketService` automatically re-emits `join-chat` with `_activeChatId`, guaranteeing that the user seamlessly re-joins their active chat room without missing incoming realtime messages or status updates.

3. **Granular Subscription Lifecycles**:
   - Subscribers register callbacks via `onMessage`, `onMessageUpdate`, `onUserStatus`, and `onTyping`, receiving unique integer subscription IDs.
   - UI widgets cancel only their specific subscription IDs upon `dispose()`, preventing state leaks without tearing down global event channels.

---

## 3-Stage Delivery Checkmarks

Cryptalk provides visual delivery receipts for all outgoing messages sent by the user:

| Stage | Status | Icon | Visual Indicator | Description |
| :--- | :--- | :---: | :--- | :--- |
| **Stage 1** | `sent` | `✓` | Single grey checkmark (`Icons.done`) | Message transmitted to server and stored. |
| **Stage 2** | `delivered` | `✓✓` | Double grey checkmark (`Icons.done_all`) | Message received by recipient's device. |
| **Stage 3** | `read` | `✓✓` | Double primary/colored checkmark (`Icons.done_all`) | Recipient opened and viewed the conversation. |

- **Chat Thread Display**: Integrated into `ChatViewScreen` message bubbles.
- **Chat List Preview Display**: Rendered directly alongside `LastMessage` subtitle previews in `ChatListScreen` for outgoing messages (`senderId == currentUser.id`).
- **Realtime Sync**: Subscribed to socket `message-update` events, causing delivery status icons on both chat preview subtitles and chat threads to update instantaneously.

---

## Core Data Models

Defined in `lib/core/models.dart`:

- **`AppUser`**: User profile state including `id`, `email`, `username`, `name`, `bio`, `avatarColor`, `avatarEmoji`, `isOnline`, `accentColor`, `wallpaper`, `hasE2EEKeys`, and `lastSeen`.
- **`Chat`**: Conversation representation supporting `direct`, `group`, `channel`, and `saved` chat types, along with `unreadCount`, member list (`ChatMember`), `lastMessage`, `pinnedAt`, and `muted` flags.
- **`ChatMember`**: Member profile and role (`admin`/`member`) within a group or channel, including `lastReadAt`.
- **`LastMessage`**: Preview payload stored on `Chat` objects containing `id`, `content`, `type`, `createdAt`, `senderId`, `senderName`, and `status` (`sent` / `delivered` / `read`).
- **`Message`**: Detailed message entity containing `chatId`, `senderId`, `content`, `type` (`text`, `image`, `voice`, `file`, `sticker`), `replyToId`, `editedAt`, `createdAt`, `status`, `starred`, `reactions` list, and `attachmentPath`.
- **`Reaction`**: Emoji reaction entity storing `id`, `emoji`, and reactor `user`.
- **`ConnectionRequest`**: Friend or connection request metadata storing `id`, sender `from`, and `createdAt` timestamp.

---

## Device Permissions

- **Microphone**: Audio recording for voice messages.
- **Camera / Storage**: Image capture and document attachment sharing.
- **Biometrics**: Lock screen authentication (optional feature).
- **Notifications**: Background push notifications.
- **Internet / Network**: Socket & HTTP connectivity.
