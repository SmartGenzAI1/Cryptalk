# Cryptalk Frontend (Web)

Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui client for Cryptalk.

## Key Technical Features

### 1. Real-Time 3-Stage Delivery Status Engine

The frontend UI updates message delivery status in real-time via Socket.IO events and Zustand store integration:

- **Stage 1: Sent (`✓`)**:
  - Rendered when message is acknowledged by the server (`message-ack`).
  - Represented by a single checkmark icon (`✓`).
- **Stage 2: Delivered (`✓✓`)**:
  - Rendered when recipient receives message (`message-status` event with `status: "delivered"`).
  - Represented by a double checkmark icon (`✓✓`, muted).
- **Stage 3: Read (`✓✓` Emerald)**:
  - Rendered when recipient views active conversation (`message-status` event with `status: "read"` or `markChatMessagesRead`).
  - Represented by an emerald green double checkmark icon (`✓✓`).

#### State Synchronization Flow

```
Socket Event ("message-status") ──► useSocket Hook ──► Zustand Store (chat-store.ts)
                                                            │
                                                            ├─► updateMessageStatus()
                                                            └─► markChatMessagesRead()
                                                                      │
                                                                      ▼
                                                            MessageBubble Component
                                                            (Renders <DeliveryTicks />)
```

### 2. Automatic Socket Room Re-joining & Connection Lifecycle

Managed by the `useSocket` hook (`src/hooks/use-socket.ts`):

- **Automatic Reconnection**: Socket.IO client is configured with `reconnection: true`, infinite retry attempts, and exponential backoff.
- **Window Focus & Online Recovery**: Listens to `window.focus` and `window.online` events to reconnect automatically when the user switches back to the tab or recovers network connectivity.
- **Automatic Room Re-joining**: On every `connect` event, `useSocket` retrieves the active room ID from the store (`useChatStore.getState().activeChatId`) and emits `join-chat` with `{ chatId }`. This re-subscribes the socket to `chat:{chatId}` on the backend without requiring manual room selection.

```ts
socket.on('connect', () => {
  setConnected(true)
  // Auto-rejoin active chat room on connect or reconnect
  const currentActiveId = useChatStore.getState().activeChatId
  if (currentActiveId) {
    socket?.emit('join-chat', { chatId: currentActiveId })
  }
})
```

### 3. Authentication & Security Integration

- **Constant-Time Password Verification**: The client auth screen (`auth-screen.tsx`) authenticates against the backend's constant-time `scrypt` API (`/api/auth/login`), preventing timing side-channel attacks and user enumeration.
- **Cookie-Based Socket Auth**: Sockets connect using HTTP-only session cookies (`withCredentials: true`), preventing client-side token tampering or script extraction.

---

## Structure

```
frontend/src/
├── app/
│   ├── layout.tsx           # Root layout with font & theme providers
│   ├── page.tsx             # Auth gate & chat shell (dynamic import)
│   └── globals.css          # Global styles, wallpaper tokens, animations
├── components/chat/         # Modular chat components
│   ├── auth-screen.tsx      # Email registration & login interface
│   ├── chat-app.tsx         # Main chat application shell
│   ├── chat-list.tsx        # Conversation list with unread counters
│   ├── chat-window.tsx      # Active chat view & message container
│   ├── message-list.tsx     # Message list with unread divider
│   ├── message-item.tsx     # Message bubble with <DeliveryTicks />
│   ├── message-input.tsx    # Message input with voice recorder & file upload
│   └── chat-avatar.tsx      # Custom SVG default avatars
├── hooks/
│   └── use-socket.ts        # Socket.IO connection & auto-rejoin lifecycle hook
├── stores/
│   └── chat-store.ts        # Zustand global store for chats, messages, presence
└── lib/
    ├── api.ts               # HTTP client with cookie credentials
    ├── crypto.ts            # E2EE client crypto primitives (libsodium)
    ├── e2ee.ts              # E2EE encryption orchestration
    ├── message-cache.ts     # IndexedDB local cache for offline viewing
    └── types.ts             # TypeScript definitions
```

---

## Quick Start

```bash
cd frontend
bun install
cp .env.example .env.local
bun run dev
```

---

## Production Environment Configuration

| Variable | Purpose | Value / Example |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Production API & Socket.IO URL | `https://cryptalk-backend.onrender.com` |
| `NEXT_PUBLIC_BACKEND_PORT` | Local dev fallback backend port | `8001` (used when backend URL is empty) |

### Deployment on Vercel

1. Import GitHub repository to [Vercel](https://vercel.com).
2. **Critical Setting**: Set **Root Directory** to `frontend`.
3. Configure `NEXT_PUBLIC_BACKEND_URL` under Environment Variables.
4. Deploy — Vercel executes `bun install` and `next build`.
