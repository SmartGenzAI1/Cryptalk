# Cryptalk — System Design & Architecture

## Overview

Cryptalk is an end-to-end encrypted, zero-knowledge real-time messaging system built with Python (FastAPI + Socket.IO) on the backend and Next.js 16 (React + Zustand) on the frontend, alongside a Flutter cross-platform client.

```
┌────────────────────────────────────────────────────────┐
│                   Client (Web / Mobile)                │
│   Next.js 16 · Flutter · Socket.IO Client · E2EE Lib   │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / WSS (Cookie Auth)
                            ▼
┌────────────────────────────────────────────────────────┐
│                 Reverse Proxy / Gateway                │
│                 Render / Caddy TLS & CORS              │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
                ▼ :3000                  ▼ :8001
   ┌────────────────────────┐  ┌───────────────────────────┐
   │  Frontend (Next.js)    │  │   Backend (FastAPI+SIO)   │
   │  ────────────────────  │  │   ─────────────────────   │
   │  • E2EE Client Crypto  │  │   • Clean Architecture    │
   │  • Zustand State Store │  │   • Cookie Session Auth   │
   │  • Socket Hook (rejoin)│  │   • Socket.IO Relay Engine│
   └────────────────────────┘  └─────────────┬─────────────┘
                                             │
                                   ┌─────────┴─────────┐
                                   ▼                   ▼
                          ┌─────────────────┐ ┌─────────────────┐
                          │ Supabase PG     │ │ Upstash Redis   │
                          │ (Prod Persistence)│ (Socket Adapter)│
                          └─────────────────┘ └─────────────────┘
```

The server operates on a zero-knowledge model: it stores encrypted ciphertext, public keys, and minimal metadata. Private keys never leave user devices.

---

## 1. Real-Time 3-Stage Delivery Status Engine

The delivery engine manages message progression through three distinct stages across WebSockets and state stores.

### Delivery State Transitions

```
[ Sender Client ]                   [ Server ]                    [ Recipient Client ]
       │                                │                                  │
       │── 1. send-message (Socket.IO) ─►│                                  │
       │                                │── Relay message to room ────────►│
       │◄── 2. message-ack (✓ sent) ────│                                  │
       │                                │◄── 3. message-status (delivered)─│
       │◄── 4. status update (✓✓ deliv) │ (Auto-deletes temp attachments)  │
       │                                │                                  │
       │                                │◄── 5. message-status (read) ─────│
       │◄── 6. status update (✓✓ read) ──│ (Recv views chat room)           │
```

1. **Stage 1 — Sent (`✓`)**:
   - Generated when the sender dispatches a message via `send-message` Socket.IO event.
   - The backend attaches `status: "sent"`, relays the message to the socket room (`chat:{chatId}`), and returns a `message-ack` to the sender.
   - Displayed as a single checkmark (`✓`).

2. **Stage 2 — Delivered (`✓✓`)**:
   - Triggered when a recipient's active socket client receives the relayed `message` event (or drains queued offline messages on reconnect).
   - The recipient sends a `message-status` event with `status: "delivered"`.
   - The server broadcasts the status update to the room and, if an E2EE file attachment is linked to the message, automatically purges the temporary ciphertext storage blob from Supabase.
   - Displayed as a muted double checkmark (`✓✓`).

3. **Stage 3 — Read (`✓✓` Emerald)**:
   - Triggered when the recipient views the active chat window or sends a `mark-read` HTTP/socket request.
   - The backend relays `status: "read"` via `message-status` event to all room participants.
   - The sender's UI updates the message bubble status to an emerald green double checkmark (`✓✓`), updates the `lastMessage` preview in the chat list, and resets unread indicators.

---

## 2. Automatic Socket Room Re-joining & Connection Lifecycle

To maintain seamless real-time state across unstable network conditions, window switching, and device wakes, Cryptalk uses an automatic socket room re-joining pipeline.

```
           ┌──────────────────────────────────────────────┐
           │           Connection Event / Wake            │
           │  (Network return / Tab Focus / Auto-reconnect)│
           └──────────────────────┬───────────────────────┘
                                  │
                                  ▼
           ┌──────────────────────────────────────────────┐
           │        Socket.IO `connect` Listener          │
           └──────────────────────┬───────────────────────┘
                                  │
                                  ▼
           ┌──────────────────────────────────────────────┐
           │  Query Zustand (`useChatStore.activeChatId`) │
           └──────────────────────┬───────────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │ activeChatId exists           │ activeChatId is null
                  ▼                               ▼
   ┌──────────────────────────────┐   ┌───────────────────────────┐
   │ Emit `join-chat` { chatId }  │   │ Wait for user room selection│
   └──────────────┬───────────────┘   └───────────────────────────┘
                  │
                  ▼
   ┌──────────────────────────────┐
   │ Backend verifies membership  │
   │ & places socket in `chat:id` │
   └──────────────┬───────────────┘
                  │
                  ▼
   ┌──────────────────────────────┐
   │ Backend drains offline queue │
   │ Emits `queued-messages`      │
   └──────────────────────────────┘
```

- **Reconnection Policy**: Socket.IO client is configured with `reconnection: true`, `reconnectionAttempts: Infinity`, and a `1000ms` delay.
- **Window & Focus Recovery**: Event listeners on `window.focus` and `window.online` trigger `socket.connect()` if disconnected.
- **State Synchronization**: Upon reconnection, the client inspects `useChatStore.getState().activeChatId`. If an active room exists, it immediately emits `join-chat` with `{ chatId }`.
- **Backend Room Join**: The backend validates user membership via `ChatMember` table before joining the socket to room `chat:{chatId}` (`sio.enter_room`).
- **Offline Queue Draining**: Offline recipients have pending E2EE messages safely buffered in the server's in-memory offline queue. Upon connection, the backend drains the queue and emits `queued-messages`.

---

## 3. Constant-Time Password Verification Security

To protect user authentication against timing side-channel attacks and user enumeration vulnerability:

```
                      ┌────────────────────────────┐
                      │ Login Request (Email/Pass) │
                      └─────────────┬──────────────┘
                                    │
                                    ▼
                      ┌────────────────────────────┐
                      │ Look up User in DB         │
                      └─────────────┬──────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  │ User found & hash valid           │ User missing / invalid hash
                  ▼                                   ▼
   ┌──────────────────────────────┐   ┌──────────────────────────────┐
   │ Compute `hashlib.scrypt`     │   │ Compute dummy `scrypt` hash  │
   │ using stored salt & password │   │ with `_DUMMY_SALT` ("00"*16) │
   └──────────────┬───────────────┘   └──────────────┬───────────────┘
                  │                                  │
                  ▼                                  ▼
   ┌──────────────────────────────┐   ┌──────────────────────────────┐
   │ `hmac.compare_digest`        │   │ Return `False`               │
   │ (Constant-time string check) │   │ (Execution time identical)   │
   └──────────────────────────────┘   └──────────────────────────────┘
```

1. **Scrypt Parameters**: Password derivation uses `scrypt` (`N=16384`, `r=8`, `p=1`, `dklen=64`), adhering to Node.js cryptographic standards.
2. **Dummy Salt Execution**: If a user is not found or the stored password hash is missing/corrupt, `verify_password` executes a dummy `scrypt` hashing operation using `_DUMMY_SALT` ("00"*16). This ensures that login requests take identical CPU time regardless of whether an account exists, thwarting timing-based account enumeration attacks.
3. **Constant-Time Comparison**: Hash validation uses `hmac.compare_digest(derived.hex(), expected_hash)` to prevent byte-by-byte timing attacks during string comparison.

---

## 4. Production Environment Topology & Configuration

```
┌───────────────────────────┐         ┌───────────────────────────┐
│     Vercel (Frontend)     │         │      Render (Backend)    │
│  NEXT_PUBLIC_BACKEND_URL  ├────────►│  SESSION_SECRET           │
│  (Session Cookie Proxy)   │         │  DATABASE_URL (PostgreSQL)│
└───────────────────────────┘         │  CORS_ORIGINS             │
                                      │  REDIS_URL                │
                                      └─────────────┬─────────────┘
                                                    │
                                   ┌────────────────┴────────────────┐
                                   ▼                                 ▼
                      ┌─────────────────────────┐       ┌─────────────────────────┐
                      │  Supabase PostgreSQL    │       │  Upstash Redis Adapter  │
                      │  Row Level Security     │       │  Socket.IO Multi-Node   │
                      └─────────────────────────┘       └─────────────────────────┘
```

### Environment Variables Matrix

| Component | Variable | Purpose | Environment |
|---|---|---|---|
| **Backend** | `SESSION_SECRET` | Secret key for signing HMAC-SHA256 session cookies | Production / Dev |
| **Backend** | `DATABASE_URL` | PostgreSQL connection string (`postgresql+asyncpg://...`) | Production (Supabase) |
| **Backend** | `CORS_ORIGINS` | Permitted frontend origins (e.g. `https://cryptalk.vercel.app`) | Production |
| **Backend** | `COOKIE_SECURE` | Set `true` in production to enforce `Secure` flag on HTTP-only cookies | Production |
| **Backend** | `REDIS_URL` | Upstash Redis connection string for Socket.IO multi-instance adapter | Production |
| **Backend** | `SUPABASE_URL` / `KEY` | Object storage connection details for E2EE encrypted media | Production |
| **Frontend**| `NEXT_PUBLIC_BACKEND_URL` | Absolute URL to production backend service | Production |
| **Frontend**| `NEXT_PUBLIC_BACKEND_PORT`| Port offset for local dev proxy fallback (`8001`) | Development |
