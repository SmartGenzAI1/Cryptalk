# Cryptalk Backend

Python FastAPI backend featuring Clean Architecture, Socket.IO real-time event engine, zero-knowledge E2EE support, and production-grade security guarantees.

## Architecture

```
backend/app/
├── main.py              # ASGI application (FastAPI + Socket.IO)
├── core/
│   ├── config.py        # Settings (env-driven configuration)
│   ├── database.py      # Async SQLAlchemy engine + session factory
│   ├── security.py      # scrypt hashing, constant-time verification, HMAC tokens
│   ├── exceptions.py    # Domain error hierarchy
│   ├── rate_limit.py    # Per-IP and per-user rate limiters
│   ├── offline_queue.py # Offline E2EE message buffering & draining
│   └── storage.py      # Encrypted attachment storage & auto-cleanup
├── models/              # ORM entities (User, Chat, ChatMember, Message, etc.)
├── schemas/             # Pydantic DTOs
├── repositories/        # Data access layer (optimized queries)
├── services/            # Business logic (auth, chats, messages, user)
├── api/v1/              # REST HTTP API controllers
│   ├── auth.py          #   email registration, login, onboarding, lockout
│   ├── chats.py         #   chat CRUD, pinning, muting
│   ├── chat_management.py # leave, delete, kick, invite, search, reports
│   ├── messages.py      #   send, edit, delete, react, mark read/delivered
│   ├── social.py        #   connections, blocks, nicknames
│   ├── e2ee.py          #   public key distribution
│   └── users.py         #   profile & user search
└── realtime/            # Socket.IO connection manager & event handlers
    ├── connection_manager.py # Active socket mapping & user tracking
    └── handlers.py      # Event handlers (rooms, relay, status updates)
```

---

## Key Technical Systems

### 1. Real-Time 3-Stage Delivery Status Engine

Messages follow a 3-stage delivery status cycle:

- **Stage 1: `sent` (`✓`)**:
  - Dispatched via `send-message` Socket.IO event.
  - Server sets `status = "sent"`, relays message to room (`chat:{chatId}`), and emits `message-ack` to the sender.
- **Stage 2: `delivered` (`✓✓`)**:
  - Recipient client receives message and sends `message-status` with `status: "delivered"`.
  - Server broadcasts delivery status to the room.
  - **Ephemeral Media Cleanup**: If the message contains an attachment path, the server automatically deletes the temporary encrypted file from storage upon receiving the `delivered` status event.
- **Stage 3: `read` (`✓✓` Emerald)**:
  - Sent when recipient opens the chat room via `message-status` (`status: "read"`) or `/api/chats/{id}/mark-read` HTTP endpoint.
  - Broadcasts `read` status to room participants, updating last message preview and unread counters.

### 2. Automatic Socket Room Re-joining & Connection Lifecycle

The socket server (`app/realtime/handlers.py`) handles dynamic room joining and automatic reconnection:

- **Authentication at Connect**: Connection is authenticated via HTTP-only session cookie or token passed in `auth`. Unauthenticated attempts emit `auth-error` and disconnect.
- **Room Joining (`join-chat`)**: Client requests to join a chat room using `join-chat` with `{ chatId }`. The server verifies `ChatMember` database record before calling `sio.enter_room(sid, f"chat:{chatId}")`.
- **Automatic Re-joining**: When a client reconnects after network interruption, it automatically re-emits `join-chat` for its active `chatId`, seamlessly restoring room listeners without user intervention.
- **Offline Queue Draining**: Messages sent to offline members are stored in `app/core/offline_queue.py`. Upon user connection, `drain_queue(user_id)` retrieves queued messages and emits `queued-messages`.

### 3. Constant-Time Password Verification

Password security is implemented in `app/core/security.py` (`verify_password`) to eliminate timing side-channel attacks and account enumeration:

- **Hashing Algorithm**: Uses `hashlib.scrypt` with parameters `N=16384`, `r=8`, `p=1`, `dklen=64` (matching Node.js `crypto.scryptSync`).
- **Dummy Salt Protection**: When authenticating a non-existent account or evaluating a missing/invalid password hash, `verify_password` performs a dummy `scrypt` computation using `_DUMMY_SALT` (`"00" * 16`). This ensures CPU calculation time is identical whether the user exists or not, mitigating timing-based user enumeration.
- **Constant-Time Comparison**: Hash verification uses `hmac.compare_digest(derived.hex(), expected_hash)` to prevent byte-by-byte timing attacks during string comparison.

---

## Quick Start

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # Configure SESSION_SECRET and DATABASE_URL
uvicorn app.main:asgi_app --host 0.0.0.0 --port 8001 --reload
```

Interactive API documentation available at: `http://localhost:8001/docs`

---

## Production Environment Configuration

| Variable | Type | Description | Example / Recommended |
|---|---|---|---|
| `SESSION_SECRET` | String | 64-char hex key for signing session tokens | `openssl rand -hex 32` |
| `DATABASE_URL` | String | Async PostgreSQL connection string | `postgresql+asyncpg://user:pass@ep-xxx.supabase.co:5432/postgres` |
| `CORS_ORIGINS` | String | Comma-separated list of allowed web origins | `https://cryptalk.vercel.app` |
| `COOKIE_SECURE` | Boolean | Enforce `Secure` attribute on cookies | `true` in production |
| `REDIS_URL` | String | Redis connection string for Socket.IO multi-node adapter | `rediss://default:pass@redis-xxx.upstash.io:6379` |
| `SUPABASE_URL` | String | Supabase project API URL for storage | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | String | Supabase service role key | `eyJhbGciOi...` |

### Deployment on Render

1. Connect repository to [Render.com](https://render.com).
2. Render detects `render.yaml` automatically.
3. Configure secret environment variables in the Render dashboard.
4. Render executes build (`pip install -r requirements.txt`) and runs `uvicorn app.main:asgi_app --host 0.0.0.0 --port $PORT`.

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register | Email + password registration |
| POST | /api/auth/onboard | Set unique username |
| POST | /api/auth/login | Authenticate via email & password |
| POST | /api/auth/logout | Invalidate session cookie |
| GET | /api/auth/me | Retrieve current user profile |

### Chats & Messages
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/chats | List active chats |
| POST | /api/chats | Create direct message or group |
| GET | /api/{chatId}/messages | Fetch paginated chat messages |
| POST | /api/{chatId}/messages | Send message (text, image, voice, file) |
| POST | /api/{chatId}/mark-read | Mark chat messages as read |

---

## Security Audit Summary

- **Constant-Time Verification**: `scrypt` + `_DUMMY_SALT` + `hmac.compare_digest`
- **Session Tokens**: HMAC-SHA256 signed HTTP-only cookies (`SameSite=Lax`, `Secure` in production)
- **Brute-Force Protection**: 5 failed login attempts trigger a 15-minute account lockout
- **Socket Security**: Cookie verification on socket connection handshake (no self-declared `userId`)
- **Zero-Knowledge Storage**: Message contents encrypted client-side; ephemeral file attachments wiped on delivery
