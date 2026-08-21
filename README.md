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

<a href="https://razorpay.me/@CodeChap?amount=kXxURMaXFk%2Bmrv%2B9uGrYpg%3D%3D" target="_blank">
  <img src="https://img.shields.io/badge/💖%20Support%20%26%20Sponsor%20Cryptalk-Donate%20via%20Razorpay-ff69b4?style=for-the-badge&logo=razorpay&logoColor=white" alt="Support & Sponsor Cryptalk" />
</a>

<br/>

<a href="https://razorpay.me/@CodeChap?amount=kXxURMaXFk%2Bmrv%2B9uGrYpg%3D%3D" target="_blank">
  <img src="https://img.shields.io/badge/💳%20Sponsor%20Development-Razorpay-02042B?style=for-the-badge&logo=razorpay&logoColor=3399CC" alt="Donate on Razorpay" />
</a>

<br/><br/>
<img src="showcase/screenshot_desktop.png" width="800" alt="Cryptalk Desktop Interface" />
<br/><br/>
<img src="showcase/screenshot_mobile.jpg" width="300" alt="Cryptalk Mobile Interface" />
</div>

---

## Features

### Privacy & Security
- **End-to-End Encryption** — X25519 + ChaCha20-Poly1305. Server is zero-knowledge.
- **90-Day Auto-Delete** — All message data automatically purged after 90 days (configurable, privacy mode enforced).
- **Self-Destructing Messages** — Set expiration timer (10s to 1 week).
- **Expiring Groups** — Auto-delete after 1-7 days.
- **Minimal Data Collection** — No phone number required. Email-only authentication.
- **Ephemeral File Storage** — Encrypted attachments wiped from Supabase on delivery.
- **Account Deletion** — Permanently wipe all user data.
- **ISP Resistance** — DNS-over-HTTPS, enforced HTTPS with HSTS, and privacy mode configuration.

### Communication
- **WebRTC Voice Calling** — Encrypted voice calls with 10-minute limit and DTLS-SRTP.
- **WebRTC Video Calling** — End-to-end encrypted video with 3x ringtone for incoming calls.
- **Voice Messages** — Real recording with Web Audio API, encrypted client-side before transmission.
- **Message Sound Effects** — Send and receive notification sounds.
- **3-Stage Delivery Engine** — ✓ sent, ✓✓ delivered, ✓✓ read (emerald) real-time state tracking.
- **Auto-Rejoining Socket Lifecycle** — Automatic room re-joining on connect/reconnect and offline queue draining.
- **Offline Message Queue** — Messages queued and delivered when recipient comes online.

### Messaging
- **File Sharing** — Images, docs, voice up to 25MB, E2EE ciphertext stored in Supabase, auto-deleted on delivery.
- **Media Previews** — WhatsApp and Telegram style previews for images, video, PDF, and documents.
- **Message Reactions, Replies, Edit, Delete for Everyone**
- **Read More Toggle** — Long messages collapsed with expandable view (250+ chars).
- **Draft Messages** — Saved per chat, restored on switch.
- **Unread Divider** — "New Messages" separator line.
- **Cross-Chat Search** — Search across all conversations.

### Groups & Social
- **Groups & Channels** — Admin controls, kick, promote, transfer ownership.
- **Invite Links** — Shareable token URLs for group joins.
- **Connections** — Find users by username, send/accept requests.
- **Blocking & Nicknames** — Block users, set custom display names.
- **Report System** — Report users or content for abuse.

### UI & Platform
- **Animated Stickers** — Lottie-based animated emoji.
- **Custom SVG Avatars** — Unique geometric patterns.
- **Dark/Light Theme** — 8 accent colors, 5 chat wallpapers.
- **Fully Responsive** — Mobile bottom-nav, desktop three-column layout.
- **Cross-Platform Flutter App** — iOS, Android, macOS, Windows, Linux.
- **Email Authentication** — Cookie-authenticated sessions without phone number requirements.
- **Forgot Password** — Email-based password reset flow.

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
│                    Render (Free Tier)                   │
│     Backend: FastAPI + Socket.IO · Frontend: Next.js   │
│        TLS termination · CORS · Auto-deploy            │
└─────────┬─────────────────────────────┬────────────────┘
          │                             │
          ▼ :3000                       ▼ :8001
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
                       │  Supabase    │    │  Supabase    │
                       │  PostgreSQL  │    │   Storage    │
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
| `DATABASE_URL` | Yes | Supabase PostgreSQL connection string (the only database) | `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres` |
| `CORS_ORIGINS` | Yes | Allowed frontend origin URLs | `https://your-app.onrender.com` |
| `COOKIE_SECURE` | Yes | Enforces `Secure` flag on HTTP-only cookies | `true` in production |
| `REDIS_URL` | Optional | Upstash Redis connection string for Socket.IO multi-node scaling | `rediss://default:pass@redis-xxx.upstash.io:6379` |
| `SUPABASE_URL` | Yes | Supabase API endpoint for file storage | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Yes | Supabase service role key for storage uploads | `eyJhbGciOi...` |
| `SMTP_HOST` | Optional | SMTP server for email verification and password reset | `smtp.gmail.com` |
| `SMTP_PORT` | Optional | SMTP port (default 587) | `587` |
| `SMTP_USER` | Optional | SMTP username | `you@gmail.com` |
| `SMTP_PASSWORD` | Optional | SMTP app password (not account password) | `your-app-password` |
| `SMTP_FROM_EMAIL` | Optional | Sender email address | `noreply@yourdomain.com` |
| `EMAIL_VERIFICATION_ENABLED` | Optional | Require email verification after registration | `false` |

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

### Full Stack on Render (Free Tier)

Both backend and frontend deploy on Render free tier using the included `render.yaml` blueprint:

1. Push repository to GitHub.
2. Create a new **Blueprint** project on [Render.com](https://render.com) — Render auto-detects `render.yaml`.
3. Set environment variables in the Render dashboard:
   - **Backend**: `SESSION_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`, `SUPABASE_URL`, `SUPABASE_KEY`, `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` (optional)
   - **Frontend**: `BACKEND_URL` is auto-linked from the backend service
4. Render deploys both services with Docker, auto-deploys on commit.

### Backend → Render (Standalone)

1. Create a new **Web Service** on [Render.com](https://render.com).
2. Connect your GitHub repository, set root directory to `backend`.
3. Set environment variables (`SESSION_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`, `COOKIE_SECURE=true`, `SUPABASE_URL`, `SUPABASE_KEY`).
4. Render deploys `uvicorn app.main:asgi_app --host 0.0.0.0 --port $PORT`.

### Frontend → Render (Standalone)

1. Create a new **Web Service** on [Render.com](https://render.com).
2. Connect your GitHub repository, set root directory to `frontend`.
3. Set `BACKEND_URL` to your backend service URL.
4. Render runs `bun install && next build` and serves on port 3000.

### Docker (Local Development)

```bash
docker compose up --build
```

Backend runs on `http://localhost:8001`, frontend on `http://localhost:3000`.

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
| WebRTC Calls | DTLS-SRTP encryption on voice/video calls |

---

## Privacy Features

| Feature | Details |
|---|---|
| Auto-Delete | All messages automatically purged after 90 days (configurable via `DATA_RETENTION_DAYS`) |
| Privacy Mode | Enforces 90-day max retention, disables verbose logging (`PRIVACY_MODE=true`) |
| Self-Destructing Messages | Per-message expiration (10s to 1 week) |
| E2EE | X25519 + ChaCha20-Poly1305; private keys never leave device |
| Ephemeral Files | Supabase blobs wiped immediately after delivery |
| No Phone Required | Email-only authentication |
| ISP Resistance | DNS-over-HTTPS, enforced HTTPS with HSTS (2-year max-age) |
| Account Deletion | Permanent data wipe endpoint |
| Minimal Logging | Configurable `MAX_LOG_LEVEL` (default WARNING in production) |
| Cookie Security | HTTP-only, SameSite=Lax, Secure flag in production |

---

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — Recent changes and version history
- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture, flow diagrams, security design
- [SECURITY.md](SECURITY.md) — Vulnerability reporting and security policy
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines
- [Backend README](backend/README.md) — API endpoints, Socket.IO handlers, backend security
- [Frontend README](frontend/README.md) — UI components, Zustand state, socket hooks
- [Flutter README](flutter/README.md) — Cross-platform client setup
- [Supabase Setup](backend/docs/supabase-setup.md) — Supabase database & storage setup guide
- [Supabase Schema](supabase/README.md) — PostgreSQL schema & RLS policies

---

## License

MIT — see [LICENSE](LICENSE).
