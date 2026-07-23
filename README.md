<div align="center">

<img src="frontend/public/logo.png" width="80" height="80" alt="Cryptalk Logo" />

# Cryptalk

### Private by default. Fast by design.

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.138+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![Flutter](https://img.shields.io/badge/Flutter-3.44+-02569B?logo=flutter&logoColor=white)](https://flutter.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<br/><br/>
<img src="showcase/screenshot_desktop.png" width="800" alt="Cryptalk Desktop Interface" />
<br/><br/>
<img src="showcase/screenshot_mobile.jpg" width="300" alt="Cryptalk Mobile Interface" />
</div>

---

## Features

- **End-to-End Encryption** — X25519 + ChaCha20-Poly1305. Server is zero-knowledge.
- **3-Stage Delivery Engine** — ✓ sent, ✓✓ delivered, ✓✓ read (emerald) real-time state tracking.
- **Auto-Rejoining Socket Lifecycle** — Automatic room re-joining on connect/reconnect and offline queue draining.
- **Constant-Time Password Verification** — scrypt hashing + dummy salt execution for non-existent users + `hmac.compare_digest` timing attack protection.
- **Email Authentication** — Cookie-authenticated sessions without phone number requirements.
- **Voice Messages** — Real recording with Web Audio API, encrypted client-side before transmission.
- **File Sharing** — Images, docs, voice up to 25MB, E2EE ciphertext stored in Supabase, auto-deleted on delivery.
- **Message Reactions, Replies, Edit, Delete for Everyone**
- **Self-Destructing Messages** — Set expiration timer (10s to 1 week).
- **Groups & Channels** — Admin controls, kick, promote, transfer ownership.
- **Expiring Groups** — Auto-delete after 1-7 days.
- **Invite Links** — Shareable token URLs for group joins.
- **Connections** — Find users by username, send/accept requests.
- **Blocking & Nicknames** — Block users, set custom display names.
- **Cross-Chat Search** — Search across all conversations.
- **Report System** — Report users or content for abuse.
- **Account Deletion** — Permanently wipe user data.
- **Draft Messages** — Saved per chat, restored on switch.
- **Unread Divider** — "New Messages" separator line.
- **Animated Stickers** — Lottie-based animated emoji.
- **Custom SVG Avatars** — Unique geometric patterns.
- **Dark/Light Theme** — 8 accent colors, 5 chat wallpapers.
- **Fully Responsive** — Mobile bottom-nav, desktop three-column layout.
- **Cross-Platform Flutter App** — iOS, Android, macOS, Windows, Linux.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Client (Browser / App)               │
│  Next.js Web · Flutter Mobile · WebSocket · E2EE      │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / WSS (Cookie Auth)
                            ▼
┌────────────────────────────────────────────────────────┐
│                    Caddy / Render                      │
│             TLS termination · CORS Gateway             │
└─────────┬─────────────────────────────┬────────────────┘
          │                             │
          ▼ :3000 (Vercel)              ▼ :8001 (Render)
┌──────────────────────┐     ┌──────────────────────────┐
│  Frontend (Next.js)  │     │  Backend (FastAPI+SIO)   │
│  ──────────────────  │     │  ──────────────────────  │
│  • UI components     │     │  • Clean architecture    │
│  • Zustand store     │     │  • API → Service → Repo  │
│  • E2EE client-side  │     │  • Socket.IO realtime    │
│  • Room auto-rejoin  │     │  • Brute-force lockout   │
└──────────────────────┘     └───────────┬──────────────┘
                                         │
                               ┌─────────┴─────────┐
                               ▼                   ▼
                      ┌──────────────┐    ┌──────────────┐
                      │ SQLite (dev) │    │ Supabase PG  │
                      │ / PostgreSQL │    │  (prod)      │
                      └──────────────┘    └──────────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed flow diagrams.

---

## Technical Deep Dives

### Real-Time 3-Stage Delivery Engine

Cryptalk tracks message lifecycle progression across socket rooms and local UI stores:

1. **Sent (`✓`)**: Broadcasted via `send-message` Socket.IO event and acknowledged with `message-ack`.
2. **Delivered (`✓✓`)**: Triggered when recipient client receives message or drains offline queue. Automatically triggers server deletion of single-use encrypted file blobs.
3. **Read (`✓✓` Emerald)**: Triggered when recipient views active conversation window (`mark-read`). Updates sender UI bubble status and unread counters.

### Automatic Socket Room Re-joining

- Client `useSocket` hook configures Socket.IO with `reconnection: true` and listens to `connect`, `window.focus`, and `window.online`.
- Upon connection/reconnection, client reads `useChatStore.getState().activeChatId` and automatically emits `join-chat` with `{ chatId }`.
- Backend validates room membership (`ChatMember`) and joins socket to `chat:{chatId}`. Offline queued messages are drained immediately.

### Constant-Time Password Verification

- Password verification in `app/core/security.py` uses `scrypt` (`N=16384`, `r=8`, `p=1`, `dklen=64`).
- **Dummy Salt Protection**: Non-existent user logins or invalid stored hashes trigger dummy `scrypt` hashing with `_DUMMY_SALT` (`"00" * 16`), enforcing equal CPU execution time and mitigating user enumeration.
- **Constant-Time String Comparison**: Verified using `hmac.compare_digest` to prevent byte extraction side-channel attacks.

---

## Production Environment Configuration

### Backend Environment Variables

| Variable | Required | Description | Example / Recommended Value |
|---|---|---|---|
| `SESSION_SECRET` | Yes | 64-character hex secret for signing session HMAC cookies | `openssl rand -hex 32` |
| `DATABASE_URL` | Yes | Async PostgreSQL connection string | `postgresql+asyncpg://postgres:pass@db.xxx.supabase.co:5432/postgres` |
| `CORS_ORIGINS` | Yes | Allowed frontend origin URLs | `https://cryptalk.vercel.app` |
| `COOKIE_SECURE` | Yes | Enforces `Secure` flag on HTTP-only cookies | `true` in production |
| `REDIS_URL` | Optional | Upstash Redis connection string for Socket.IO multi-node scaling | `rediss://default:pass@redis-xxx.upstash.io:6379` |
| `SUPABASE_URL` | Yes | Supabase API endpoint for file storage | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Yes | Supabase service role key for storage uploads | `eyJhbGciOi...` |

### Frontend Environment Variables

| Variable | Required | Description | Example / Recommended Value |
|---|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Yes | Absolute URL to production backend service | `https://cryptalk-backend.onrender.com` |
| `NEXT_PUBLIC_BACKEND_PORT` | Dev | Fallback local port for development proxy | `8001` |

---

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # set SESSION_SECRET & DATABASE_URL
uvicorn app.main:asgi_app --host 0.0.0.0 --port 8001 --reload
```

### Frontend (Web)

```bash
cd frontend
bun install
cp .env.example .env.local  # set NEXT_PUBLIC_BACKEND_URL
bun run dev
```

### Flutter (Mobile/Desktop)

```bash
cd flutter
flutter pub get
cp .env.example .env  # set BACKEND_URL
flutter run
```

---

## Deployment

### Backend → Render

1. Push repository to GitHub.
2. Create New Blueprint project on [Render.com](https://render.com) — Render auto-detects `render.yaml`.
3. Set environment variables (`SESSION_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`, `COOKIE_SECURE=true`, `SUPABASE_URL`, `SUPABASE_KEY`).
4. Render deploys `uvicorn app.main:asgi_app --host 0.0.0.0 --port $PORT`.

### Frontend → Vercel

1. Import project on [Vercel.com](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Add environment variable `NEXT_PUBLIC_BACKEND_URL`.
4. Deploy — Vercel runs `bun install` and `next build`.

---

## Security Audit Summary

| Feature | Implementation Details |
|---|---|
| Password Hashing | scrypt (N=16384, r=8, p=1, dklen=64) |
| Password Verification | Constant-time execution via `_DUMMY_SALT` on invalid user + `hmac.compare_digest` |
| Session Tokens | HMAC-SHA256 signed HTTP-only cookies (`SameSite=Lax`, `Secure` in prod) |
| Rate Limiting | Per-user + per-IP limiting (10 logins/min, 120 API/min) |
| Brute-Force Protection | 5 failed logins trigger 15-minute account lock |
| Socket Security | Cookie authentication at handshake (no self-declared `userId`) |
| Input Sanitization | Pydantic validation + HTML escaping + control char stripping |
| E2EE Messaging | X25519 + ChaCha20-Poly1305 (zero-knowledge server) |
| Ephemeral Storage | Attachment files wiped automatically from storage on delivery |
| SQL Injection Defense | SQLAlchemy parameterized queries |
| Security Headers | X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy |

---

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture, flow diagrams, security design
- [Backend README](backend/README.md) — API endpoints, Socket.IO handlers, backend security
- [Frontend README](frontend/README.md) — UI components, Zustand state, socket hooks
- [Flutter README](flutter/README.md) — Cross-platform client setup
- [Supabase Setup](supabase/README.md) — PostgreSQL schema & RLS policies

---

## License

MIT — see [LICENSE](LICENSE).
