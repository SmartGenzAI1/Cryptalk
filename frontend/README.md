# Cryptalk Frontend

Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui — the user-facing chat application.

## ✨ Features

- **Real-time messaging** via Socket.IO
- **AI assistant** (Cryptalk AI) for drafting, summarizing, translating
- **Smart replies** — contextual AI suggestions above the input
- **Voice messages** with waveform recording UI
- **Message reactions, replies, edit, delete, star, forward**
- **Stickers** — 30 premium icons8 icons served locally
- **Premium UI/UX** — glassmorphism, spring animations (Framer Motion)
- **Fully responsive** — mobile bottom-nav, desktop three-column layout
- **Dark/light theme** with 8 accent colors and 5 chat wallpapers
- **Connection status indicator** — real-time WebSocket state

## 🏗️ Structure

```
frontend/src/
├── app/
│   ├── layout.tsx           # Root layout (theme, toaster, metadata)
│   ├── page.tsx             # Auth gate → AuthScreen or ChatApp
│   ├── globals.css          # Global styles, wallpapers, animations
│   └── api/ai/              # AI BFF routes (z-ai-web-dev-sdk)
│       ├── assistant/       #   Multi-turn AI chat
│       ├── smart-reply/     #   Reply suggestions
│       ├── summarize/       #   Chat summarization
│       └── translate/       #   Message translation
├── components/
│   ├── chat/                # All chat UI components
│   │   ├── chat-app.tsx     #   Main layout shell
│   │   ├── auth-screen.tsx  #   Login/register screen
│   │   ├── sidebar.tsx      #   Desktop nav rail
│   │   ├── mobile-nav.tsx   #   Mobile bottom navigation
│   │   ├── chat-list.tsx    #   Chat list with pin/mute/search
│   │   ├── chat-window.tsx  #   Active chat view
│   │   ├── message-list.tsx #   Messages with date separators
│   │   ├── message-item.tsx #   Single message (reactions, reply, etc.)
│   │   ├── message-input.tsx#   Input with emoji/sticker/voice
│   │   ├── chat-avatar.tsx  #   Avatar component (local icons)
│   │   ├── ai-assistant-panel.tsx
│   │   ├── chat-info-panel.tsx
│   │   ├── settings-panel.tsx
│   │   ├── profile-dialog.tsx
│   │   ├── new-chat-dialog.tsx
│   │   └── forward-dialog.tsx
│   └── ui/                  # shadcn/ui primitives
├── hooks/
│   ├── use-socket.ts        # Socket.IO client → backend
│   └── use-mobile.ts        # Responsive breakpoint hook
├── stores/
│   └── chat-store.ts        # Zustand global state
└── lib/
    ├── api.ts               # API client (XTransformPort routing)
    ├── icons.ts             # Icon registry + URL resolvers
    ├── types.ts             # Shared TypeScript types
    ├── format.ts            # Date/time formatters
    └── utils.ts             # cn() and helpers
```

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) (recommended) or Node.js 20+
- The backend running on port 8001

### Install & Run

```bash
cd frontend
bun install        # or: npm install
cp .env.example .env.local
bun run dev        # or: npm run dev
```

Open `http://localhost:3000`.

### Lint

```bash
bun run lint      # or: npm run lint
```

## 🎨 Icons

All icons are served locally from `public/icons/` for speed and reliability (no external CDN dependency):

| Category | Count | Path |
|---|---|---|
| Avatar icons (animals) | 40 | `/public/icons/avatars/` |
| Chat type icons | 4 | `/public/icons/chat/` |
| Sticker icons | 30 | `/public/icons/stickers/` |
| UI icons | 6 | `/public/icons/ui/` |

Icons are managed by `src/lib/icons.ts` which provides typed URL resolvers:

```typescript
import { avatarIconUrl, stickerIconUrl } from '@/lib/icons'

avatarIconUrl('fox')     // → /icons/avatars/fox.png
stickerIconUrl('rocket') // → /icons/stickers/rocket.png
```

## 🔌 Backend Connection

The frontend communicates with the Python backend via the Caddy gateway using `XTransformPort` query parameter:

```
GET  /api/chats?XTransformPort=8001  →  routed to Python backend
POST /api/ai/assistant               →  served by Next.js (AI BFF)
```

The API client (`src/lib/api.ts`) handles this automatically.

## 🤖 AI Routes

AI features run as Next.js API routes (BFF pattern) using `z-ai-web-dev-sdk`:

| Route | Description |
|---|---|
| `POST /api/ai/assistant` | Multi-turn AI conversation |
| `POST /api/ai/smart-reply` | Generate 3 reply suggestions |
| `POST /api/ai/summarize` | Summarize a batch of messages |
| `POST /api/ai/translate` | Translate text to target language |

## 📱 Responsive Design

| Breakpoint | Layout |
|---|---|
| `< 768px` (mobile) | Single pane + bottom nav (Chats, Contacts, Channels, AI, Settings) |
| `768-1024px` (tablet) | Icon sidebar + chat list + chat window |
| `> 1024px` (desktop) | Full 3-column: sidebar + list + window + optional panels |

## 🎭 Theming

- **Dark/light mode** via `next-themes`
- **8 accent colors** (emerald, violet, rose, amber, cyan, lime, purple, teal)
- **5 chat wallpapers** (dots, gradient, plain, grid, waves)
- Preferences persisted per-user in the database

## 📦 Key Dependencies

- **Next.js 16** — React framework (App Router)
- **TypeScript 5** — type safety
- **Tailwind CSS 4** — utility-first styling
- **shadcn/ui** — component library (New York style)
- **Framer Motion** — spring physics animations
- **Zustand** — client state management
- **Socket.IO Client** — real-time communication
- **Lucide React** — icon set
- **z-ai-web-dev-sdk** — AI capabilities

## 🐳 Docker

```bash
docker build -t cryptalk-frontend .
docker run -p 3000:3000 cryptalk-frontend
```
