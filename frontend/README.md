# Cryptalk Frontend (Web)

Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui.

## Features

- End-to-end encryption (X25519 + ChaCha20-Poly1305)
- Real-time messaging via Socket.IO
- Email authentication + username onboarding
- Voice messages with Web Audio API
- File sharing (images, docs up to 40MB, encrypted)
- Message reactions, replies, edit, delete for everyone
- Self-destructing messages (10s to 1 week)
- Delivery states (✓ ✓✓ ✓✓ read)
- Groups, channels, expiring groups (1-7 days)
- Invite links, connections, blocking, nicknames
- Cross-chat search
- Lottie animated stickers
- Custom SVG default avatars
- Dark/light theme, 8 accent colors, 5 wallpapers
- Mobile bottom-nav + desktop three-column
- Draft messages (localStorage per chat)
- Unread message divider
- Connection status indicator
- E2EE safety numbers (identity verification)
- Smart caching (IndexedDB, 1000 msgs/chat)
- Code splitting + lazy loading

## Structure

```
frontend/src/
├── app/
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Auth gate (dynamic import)
│   └── globals.css          # Styles, animations, wallpapers
├── components/chat/         # All chat components
│   ├── auth-screen.tsx      # Email login/register
│   ├── chat-app.tsx         # Main shell (lazy panels)
│   ├── chat-list.tsx        # Chat list + search
│   ├── chat-window.tsx      # Active chat view
│   ├── message-list.tsx     # Messages + unread divider
│   ├── message-item.tsx     # Bubble (memo'd)
│   ├── message-input.tsx    # Input + voice + file + stickers
│   ├── chat-avatar.tsx      # SVG default + icon avatars
│   ├── connections-panel.tsx
│   ├── settings-panel.tsx
│   ├── chat-info-panel.tsx
│   ├── profile-dialog.tsx
│   ├── new-chat-dialog.tsx
│   ├── forward-dialog.tsx
│   ├── animated-sticker.tsx # Lottie player
│   └── mobile-nav.tsx       # Bottom nav
├── hooks/
│   └── use-socket.ts        # Socket.IO client
├── stores/
│   └── chat-store.ts        # Zustand
└── lib/
    ├── api.ts               # HTTP client
    ├── actions.ts           # API wrappers
    ├── crypto.ts            # E2EE primitives (libsodium)
    ├── e2ee.ts              # Encryption orchestration
    ├── key-store.ts         # IndexedDB key persistence
    ├── message-cache.ts     # IndexedDB message cache
    ├── icons.ts             # Icon registry
    ├── animated-stickers.ts # Lottie sticker registry
    └── types.ts             # Shared types
```

## Quick Start

```bash
cd frontend
bun install
cp .env.example .env.local
bun run dev
```

## Environment

```
# Local dev (with Caddy gateway)
NEXT_PUBLIC_BACKEND_PORT=8001

# Production (Vercel + Render)
NEXT_PUBLIC_BACKEND_URL=https://cryptalk-backend.onrender.com
```

No secrets on the frontend. All crypto is client-side.
