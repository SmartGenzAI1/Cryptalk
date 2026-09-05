# Cryptalk — Master Architecture & Technical Context (A-Z Reference)

> **Purpose for AI Agents & Developers**:
> This document is the definitive master context for the **Cryptalk** repository. When beginning a new task or switching agent sessions, read this document to understand the architectural design, security protocols, API contracts, deployment configurations, and known gotchas without spending tokens on discovery.

---

## 1. Executive Summary & Core Philosophy

**Cryptalk** is an ultra-secure, privacy-first, real-time messaging and WebRTC calling platform designed as a modern alternative to Telegram and WhatsApp.

### Foundational Principles
1. **Zero Message Persistence (Relay-Only Architecture)**:
   - **Messages are never stored in the database.**
   - Chat history lives exclusively in client memory / encrypted local storage (localStorage / IndexedDB on web, secure storage on Flutter).
   - The backend acts solely as an authenticated, zero-knowledge WebSocket relay server.
2. **End-to-End Encryption (E2EE)**:
   - Cryptographic key exchange (Signal-inspired X3DH / Double Ratchet with Ed25519 & X25519).
   - Private keys never leave user devices.
   - Voice and video calls are peer-to-peer WebRTC streams protected by DTLS-SRTP.
3. **Dual Authentication (Cookie + Bearer Token)**:
   - Supports both __Host-tc_session (SameSite=Lax, HttpOnly) cookies and Bearer tokens (localStorage.getItem('tc_token')).
   - Necessary for Vercel-to-Render cross-origin deployments where third-party cookies are blocked by modern browsers (Safari ITP, Chrome Privacy Sandbox).
4. **Anti-Surveillance & Minimal Metadata**:
   - Strict Content Security Policy (CSP), anti-fingerprinting headers, automated quota sweeps, and IP masking behind reverse proxies (CF-Connecting-IP / X-Forwarded-For[0]).

---

## 2. Tech Stack & Repository Map

```
cryptalk/
├── frontend/             # Next.js 16 App Router (Web App & PWA)
│   ├── src/
│   │   ├── app/          # Layout, pages, routing
│   │   ├── components/   # UI components, chat window, voice call modal, sidebar
│   │   ├── hooks/        # Real-time useSocket, audio recording, media hooks
│   │   ├── lib/          # api.ts (HTTP client), e2ee.ts, crypto.ts, types.ts
│   │   └── stores/       # Zustand store (chat-store.ts)
│   ├── next.config.ts    # CSP, rewrites, security headers, standalone output
│   └── vercel.json       # Vercel deployment headers & routing
├── backend/              # Python 3.14 + FastAPI + Socket.IO (ASGI)
│   ├── app/
│   │   ├── api/v1/       # auth, chats, chat_management, e2ee, messages, users
│   │   ├── core/         # config, database, rate_limit, security, cleanup
│   │   ├── middleware/   # privacy headers, CORS, rate limiting
│   │   ├── models/       # SQLAlchemy 2.0 ORM models (ephemeral metadata)
│   │   ├── realtime/     # Socket.IO handlers, connection_manager, room dispatch
│   │   ├── repositories/ # Database query access layer (selectinload optimization)
│   │   └── services/     # Business logic & serializers
│   └── alembic/          # Database migrations
└── flutter/              # Flutter 3.44 cross-platform mobile client
    └── lib/              # Models, SocketService, ChatViewScreen, UI tokens
```

### Core Technologies
- **Frontend**: Next.js 16.2.9, React 19, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, Zustand 5, Socket.IO Client 4.8, WebRTC API.
- **Backend**: Python 3.14, FastAPI, python-socketio (ASGI), SQLAlchemy 2.0 (Async), asyncpg, aiosqlite (local dev fallback), Passlib/Scrypt, Cryptography (Fernet/HMAC).
- **Database**: PostgreSQL (Supabase / PgBouncer transaction mode) in production, SQLite (cryptalk_local.db) for local preview/testing.
- **Storage**: Supabase Storage (cryptalk bucket) with 1-hour auto-expiration sweeps.
- **Realtime Infrastructure**: Socket.IO with Upstash Redis adapter for horizontal scaling (in-memory fallback when \REDIS_URL\ is omitted).

---

## 3. Production Deployment Topology

| Component | Production Host | Domain / URL | Notes |
|---|---|---|---|
| **Frontend** | Vercel | \https://cryptalk-three.vercel.app\ | Built with \output: "standalone"\ |
| **Backend** | Render | \https://cryptalk-backend-30yc.onrender.com\ | Python Uvicorn ASGI |
| **Database** | Supabase | PostgreSQL (PgBouncer pooler port 6543) | \statement_cache_size: 0\ required |
| **Storage** | Supabase Storage | cryptalk bucket | Presigned URLs, auto-cleaned |

---

## 4. Authentication & Authorization Flow

### 1. Registration & Onboarding
1. **Register** (\POST /api/auth/register\):
   - Input: \{ "email": "...", "password": "...", "privacy_consent": true }\
   - Scrypt hashes password.
   - Response: \200 OK\ with \{"user": {...}, "token": "<session_token>"}\ and \Set-Cookie: __Host-tc_session=<token>; SameSite=Lax; Path=/; Secure\.
   - Frontend stores token in \localStorage.setItem('tc_token', token)\.
2. **Onboarding** (\POST /api/auth/onboard\):
   - User chooses username and display name.
   - Sets \isOnboarded: true\.
   - Response returns updated user + refreshed token.

### 2. Login (\POST /api/auth/login\)
- Verifies password hash using constant-time comparison.
- Returns \{ "user": {...}, "token": "<session_token>" }\.
- Frontend checks \user.isOnboarded ?? user.is_onboarded\. If false, navigates to the onboard step.

### 3. Logout (\POST /api/auth/logout\)
- Backend sets cookie max age to 0.
- Frontend clears \localStorage.removeItem('tc_token')\, \localStorage.removeItem('zc-currentUser')\, and \localStorage.removeItem('zc-chats')\.

### 4. Dual Auth in HTTP & WebSockets
- **HTTP Requests** (\rontend/src/lib/api.ts\):
  - Attaches \Authorization: Bearer <token>\ from \localStorage\.
  - Also sends cookies via \credentials: 'same-origin'\.
- **WebSocket Handshake** (\rontend/src/hooks/use-socket.ts\):
  - Connects using \uth: { token }\ AND \query: { token }\.
  - Backend \_auth_from_environ\ (\ackend/app/realtime/handlers.py\) checks:
    1. Socket handshake auth payload: \uth.get("token")\
    2. Query string parameter: \?token=...\
    3. \Authorization: Bearer ...\ header
    4. \__Host-tc_session\ or \	c_session\ cookie

---

## 5. Real-Time Socket.IO & WebRTC Architecture

### 1. Room Subscriptions
- Each connected socket joins its user room: \user:{userId}\.
- Active chat rooms: \chat:{chatId}\ (for typing indicators and message updates).

### 2. Message Dispatch Pattern
- **Sender** emits \send-message\ with \{ chatId, message: { content, type, ... } }\.
- Backend validates membership and blocked user lists.
- Backend emits \
eceive-message\ to:
  - \user:{memberId}\ for every other member in the chat.
  - \user:{senderId}\ for multi-tab / multi-device synchronization.

### 3. WebRTC Voice & Video Calling
- Signal events: \call-offer\, \call-answer\, \ice-candidate\, \call-hangup\.
- **Privacy Barrier**: Signals are ONLY relayed if \_share_chat(user_a, user_b)\ returns \True\. Unrelated users cannot ring or spam other users.
- **ICE Candidate Queueing**: \rontend/src/components/chat/voice-call-modal.tsx\ queues incoming ICE candidates until \peerRef.current.remoteDescription\ is set to avoid WebRTC state errors.
- **Call Duration Cap**: Enforces a strict 10-minute maximum call duration (\MAX_CALL_SECONDS = 600\) with automatic hangup and user toast notice.
- **Video Track Lifecycle**: Video \<video>\ elements are mounted upon reaching \callState === 'connected'\, triggering dynamic stream attachment for both local and remote video tracks.

---

## 6. Database Models & SQLAlchemy Async Rules

All models reside in \ackend/app/models/__init__.py\:

1. **\User\**: \id\ (hex 32), encrypted email, username, password hash, avatar color/emoji, E2EE keys (\identityPublicKey\, \signingPublicKey\, \signedPreKeyPublic\, \signedPreKeySignature\).
2. **\Chat\**: \id\ (hex 32), \	ype\ (\direct\, \group\, \channel\, \saved\), \	itle\, \description\, \createdBy\, \createdAt\, \updatedAt\, \expiresAt\.
3. **\ChatMember\**: \chatId\, \userId\, \
ole\ (\owner\, \dmin\, \member\), \lastReadAt\, \pinnedAt\, \muted\, \chatKey\.
4. **\UserBlock\**: Blocker and blocked user IDs.
5. **\Report\**: Abuse and spam reports.

### CRITICAL SQLAlchemy Async Rule (\MissingGreenlet\ Prevention):
In SQLAlchemy 2.0 Async, lazy loading of relationships is prohibited and throws:
\sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called; can't call await_only() here.\

**Rules to Follow**:
1. When querying chats, **always** include eager loading:
   \select(Chat).options(selectinload(Chat.members).selectinload(ChatMember.user))\
2. In serializers (\ackend/app/services/serializers.py\), **never** blindly access \chat.members\. Check \if "members" in chat.__dict__ and chat.members:\ before serializing members.
3. After creating a chat or group, **never** pass the un-loaded entity directly to \serialize_chat\. Instead call \wait self.get_chat(chat.id, user_id)\.

---

## 7. PgBouncer & Database Engine Rules

Supabase transaction pooling (port 6543) requires specific connection settings:
- **\statement_cache_size: 0\**: Disables asyncpg prepared statement cache (MANDATORY for PgBouncer transaction mode).
- **NEVER pass \prepare_threshold: 0\**: \prepare_threshold\ is a Psycopg argument. Passing it to \syncpg\ causes an immediate engine initialization \TypeError\.
- **Dynamic Configuration** (\ackend/app/core/database.py\):
  \\\python
  if not settings.is_postgres:
      _connect_args = {"check_same_thread": False}
  else:
      _connect_args = {"statement_cache_size": 0}
      _engine_kwargs["pool_size"] = 2
      _engine_kwargs["max_overflow"] = 1
      _engine_kwargs["pool_timeout"] = 30
      _engine_kwargs["pool_recycle"] = 300
  \\\

---

## 8. Content Security Policy (CSP) & Permissions Policy

Defined in \rontend/next.config.ts\ and \rontend/vercel.json\:

### 1. \connect-src\
Must include \'self'\, Render backend domain, Supabase domains, and WebSocket protocols:
\\\
connect-src 'self' https://*.onrender.com https://cryptalk-backend-30yc.onrender.com wss://cryptalk-backend-30yc.onrender.com ws: wss: https://*.supabase.co https://*.supabase.in https://*.supabase.com http://localhost:* ws://localhost:*;
\\\

### 2. \Permissions-Policy\
\\\
Permissions-Policy: camera=(self), microphone=(self), geolocation=(), interest-cohort=()
\\\
Never set \camera=(), microphone=()\. Setting empty parentheses completely disables \
avigator.mediaDevices.getUserMedia\ across all browsers, causing WebRTC calling to throw \NotAllowedError\.

### 3. Media & Image Preload Rule
- Do **NOT** add manual \<link rel="preload" href="/logo.png" as="image" ...>\ to \<head>\ in \layout.tsx\.
- Next.js \<Image ... priority />\ serves optimized images via \/_next/image?url=...\. Manual raw image preloads will not be consumed and will trigger Chrome console warnings.

---

## 9. Environment Variables Specification

### Frontend (\rontend/.env.production\ or Vercel Environment Variables)
| Variable | Value | Description |
|---|---|---|
| \NEXT_PUBLIC_BACKEND_URL\ | \https://cryptalk-backend-30yc.onrender.com\ | Production API & WebSocket URL |
| \BACKEND_URL\ | \https://cryptalk-backend-30yc.onrender.com\ | Server-side rewrite destination |
| \NEXT_PUBLIC_APP_URL\ | \https://cryptalk-three.vercel.app\ | Frontend production origin |
| \NEXT_PUBLIC_SUPABASE_URL\ | \https://<project>.supabase.co\ | Supabase storage URL |
| \NEXT_PUBLIC_SUPABASE_ANON_KEY\ | \eyJ...\ | Supabase public anon key |

### Backend (\ackend/.env\ or Render Environment Variables)
| Variable | Value | Description |
|---|---|---|
| \DATABASE_URL\ | \postgresql://postgres:...@...supabase.co:6543/postgres\ | Supabase PgBouncer pooler connection string |
| \SESSION_SECRET\ | 32+ character hex string | Secret for signing session tokens |
| \CORS_ORIGINS\ | \https://cryptalk-three.vercel.app,http://localhost:3000\ | Allowed origins (no wildcards in production) |
| \REDIS_URL\ | \
ediss://...\ | Upstash Redis connection string for Socket.IO scaling |
| \SUPABASE_URL\ | \https://<project>.supabase.co\ | Supabase project URL |
| \SUPABASE_KEY\ | \eyJ...\ | Supabase service role key (for storage quota & cleanup) |
| \SUPABASE_BUCKET\ | cryptalk | Storage bucket name |
| \ENVIRONMENT\ | \production\ | Enables strict production validation |

---

## 10. Local Development & Verification Commands

### 1. Build Verification
\\\powershell
# Frontend production build
cmd /c "npm --prefix frontend run build"

# Backend syntax & import compilation
python -c "import py_compile, glob; [py_compile.compile(f, doraise=True) for f in glob.glob('backend/app/**/*.py', recursive=True)]; print('Backend compilation 100% OK')"
\\\

### 2. Running Local Preview
\\\powershell
# Run Backend (Port 8001)
python -m uvicorn app.main:asgi_app --host 127.0.0.1 --port 8001

# Run Frontend (Port 3000)
cmd /c "node frontend/.next/standalone/server.js"
\\\

### 3. Automated End-to-End Test Suite
\\\powershell
# Tests 13 API endpoints (auth, onboarding, chats, keys, HTML rendering)
python scratch/test_e2e_production.py

# Tests live multi-client Socket.IO & WebRTC signaling
python scratch/test_socket_realtime.py
\\\

---

## 11. Historical Regressions & Solutions Log

| Regression / Issue | Root Cause | Permanent Fix |
|---|---|---|
| **Database Connection Failure** | \prepare_threshold: 0\ passed to \syncpg\ | Removed \prepare_threshold\; set \statement_cache_size: 0\. |
| **Cross-Origin Socket Disconnect** | Vercel blocks WebSocket rewrites; cookies blocked across domains | Accept Bearer token in Socket.IO handshake auth & query parameter. Return \	oken\ in login/register response. |
| **Camera & Microphone Blocked** | \Permissions-Policy: camera=(), microphone=()\ | Changed policy to \camera=(self), microphone=(self)\. |
| **MissingGreenlet on Chat Creation** | Synchronous access to \chat.members\ relationship in async session | Eagerly load with \selectinload\; check \if "members" in chat.__dict__\ in \serializers.py\. |
| **CSP connect-src Blocking Backend** | \
ext.config.ts\ defaulted \ackendUrl\ to \localhost:8001\ in production | Added Render domain fallback & explicitly whitelisted \https://*.onrender.com\ in CSP. |
| **Inverted Audio/Video Toggles** | \	.enabled = !muted; setMuted(!muted)\ evaluated old state | Compute \
extMuted = !muted\, then \	.enabled = !nextMuted; setMuted(nextMuted)\. |
| **Video Stream Black Screen** | \<video>\ rendered only after call connected, missing initial stream ref | Added \useEffect([callState, isVideoCall])\ to re-attach streams when video DOM elements mount. |
| **Preload Console Warning** | \<link rel="preload" href="/logo.png">\ unused by Next.js \<Image priority>\ | Removed manual \<link rel="preload">\ from \<head>\. |
| **Mobile Empty State Trap** | Mobile sidebar hidden when \ctiveChatId\ set; no back arrow in empty state | Added mobile back button in empty state view to clear \ctiveChatId\. |
| **State Leaks on Logout** | \	c_token\ remained in \localStorage\ on logout | Synchronously remove \	c_token\, \zc-currentUser\, and \zc-chats\ in \setCurrentUser(null)\. |
| **CI Pytest Collection Failures** | `aiosqlite` missing in `requirements.txt`; `SESSION_SECRET` < 32 chars in test files; `PytestDeprecationWarning` for unconfigured loop scope | Added `aiosqlite==0.21.0`, configured `pytest.ini` with `asyncio_default_fixture_loop_scope = function`, set `SESSION_SECRET` >= 32 chars in all test fixtures, and aligned CI environment to SQLite fallback. |

---

## 12. Pytest & CI/CD Testing Rules

1. **`pytest.ini` Configuration** (`backend/pytest.ini`):
   - `asyncio_mode = auto`
   - `asyncio_default_fixture_loop_scope = function` (required by `pytest-asyncio >= 0.25.0` to eliminate deprecation warnings)
   - `filterwarnings = ignore::DeprecationWarning`

2. **Session Secret in Tests**:
   - `SESSION_SECRET` must **always** be >= 32 characters in all test files (`tests/conftest.py`, `test_security.py`, `test_api.py`) and CI workflows.
   - `backend/app/core/config.py` raises `RuntimeError` during settings initialization if `len(SESSION_SECRET) < 32`.

3. **CI Database Isolation**:
   - In GitHub Actions CI runners where PostgreSQL is not provisioned, set `DATABASE_URL: ""` to automatically trigger SQLite async (`aiosqlite`) fallback.
   - `aiosqlite` must remain in `backend/requirements.txt`.
