# Cryptalk — Definitive Environment Variables Guide

Complete reference for every environment variable across all Cryptalk deployment targets.
Verified against `backend/app/core/config.py`, `backend/.env.example`, `frontend/.env.example`,
`flutter/.env.example`, and `render.yaml`.

**Golden rules**

- Never commit `.env` files — `.env.example` files are the only templates in git.
- All `NEXT_PUBLIC_*` variables are inlined into the client bundle **at build time** — redeploy after changing them.
- Secrets (`SESSION_SECRET`, `SUPABASE_KEY`, DB URLs, SMTP password) live **only** in the Render dashboard or local `.env`.

---

## 1. Vercel (Frontend)

Set in **Vercel Dashboard → cryptalk Project → Settings → Environment Variables**.
Root Directory must be set to `frontend`.

| Variable | Value | Required |
|----------|-------|----------|
| NEXT_PUBLIC_BACKEND_URL | https://cryptalk-api.onrender.com | Yes |
| NEXT_PUBLIC_SUPABASE_URL | Your Supabase project URL | Yes |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Your Supabase anon key | Yes |
| NEXT_PUBLIC_APP_URL | https://your-app.vercel.app | Yes |

Notes:

- `NEXT_PUBLIC_BACKEND_URL` must match your Render service name exactly
  (render.yaml defines the backend as `cryptalk-api` → `https://cryptalk-api.onrender.com`).
- `NEXT_PUBLIC_APP_URL` must match your real Vercel domain; it is also what you put in
  the backend's `CORS_ORIGINS`.
- The Supabase **anon** key is safe to expose client-side. Never use the service key here.
- Local development does not need these — see §4 (frontend uses `NEXT_PUBLIC_BACKEND_PORT=8001`).

---

## 2. Render (Backend)

Set in **Render Dashboard → cryptalk-api → Environment** (or via `render.yaml` blueprint).
Variables marked `sync: false` in render.yaml must be entered manually — Render never syncs secrets from git.

| Variable | Value | Required |
|----------|-------|----------|
| SESSION_SECRET | Generate: python -c "import secrets; print(secrets.token_hex(32))" | Yes |
| CORS_ORIGINS | https://your-app.vercel.app | Yes |
| NEON_DATABASE_URL | postgresql://user:pass@ep-xxx.neon.tech/cryptalk?sslmode=require | Yes (or DATABASE_URL) |
| DATABASE_URL | postgresql+asyncpg://user:pass@host/db | Yes (or NEON_DATABASE_URL) |
| SUPABASE_URL | https://xxx.supabase.co | Yes |
| SUPABASE_KEY | your_supabase_service_key | Yes |
| REDIS_URL | rediss://xxx.upstash.io | Optional |
| SMTP_HOST | smtp.gmail.com | Optional |
| SMTP_PORT | 587 | Optional |
| SMTP_USER | your_email@gmail.com | Optional |
| SMTP_PASSWORD | your_app_password | Optional |
| SMTP_FROM_EMAIL | your_email@gmail.com | Optional |
| EMAIL_VERIFICATION_ENABLED | false | Optional |
| DEBUG | false | For production |
| PORT | 10000 | Render default |

### Variable details

#### SESSION_SECRET (required)
- Must be **≥ 32 characters** — the app refuses to boot otherwise (`config.py: validate()`).
- Alternatives: `openssl rand -hex 32` (as documented in `backend/.env.example`).
- Rotating it invalidates all active sessions.

#### CORS_ORIGINS (required)
- Comma-separated list of allowed origins, no trailing slashes:
  `https://cryptalk.vercel.app,http://localhost:3000`
- Must include your production Vercel domain; keep localhost only if you develop against prod.
- Default in render.yaml: `https://cryptalk.vercel.app,http://localhost:3000`.

#### Database — choose ONE (required)
Priority order in code (`database_url` property): `NEON_DATABASE_URL` → `DATABASE_URL` → SQLite fallback.

| Option | Format | Notes |
|--------|--------|-------|
| Neon (recommended, free tier) | `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/cryptalk?sslmode=require` | Pool auto-tuned via `NEON_POOL_SIZE=2`, `NEON_MAX_OVERFLOW=1` to fit Neon's free-tier connection limit |
| Supabase PostgreSQL | `postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres` | Set as `DATABASE_URL` |
| SQLite (local dev only) | unset both; uses `DB_PATH=./db/cryptalk.db` | Automatic |

Any `postgres://` / `postgresql://` URL is automatically converted to `postgresql+asyncpg://` internally.

#### SUPABASE_URL / SUPABASE_KEY (required)
- Used for file storage (images, documents). Get both from **Supabase Dashboard → Settings → API**.
- `SUPABASE_KEY` here is the **service role key** (server-side only — never expose it in the frontend).
- Optional: `SUPABASE_BUCKET` (default `cryptalk`).

#### REDIS_URL (optional)
- Upstash Redis for multi-process Socket.IO scaling + distributed rate limiting.
- Format: `rediss://default:PASSWORD@HOST.upstash.io:6379` (note `rediss://` for TLS).
- Unset = single-process mode, in-memory rate limiting.

#### SMTP block (optional)
Required together for email to work (`has_smtp` checks HOST + USER + PASSWORD):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-app-password      # Gmail App Password, NOT the account password
SMTP_FROM_EMAIL=you@gmail.com
EMAIL_VERIFICATION_ENABLED=false     # true = registration requires email verification
```

Other providers:
- SendGrid: `smtp.sendgrid.net` / user `apikey` / pass `SG.xxxxx`
- Brevo: `smtp-relay.brevo.com` / your Brevo email + key

When `EMAIL_VERIFICATION_ENABLED=true`, frontend and mobile automatically show a
"Verify your email" notice after registration — no extra frontend config needed.

#### DEBUG / PORT
- `DEBUG=false` always in production.
- `PORT=10000` is Render's default; local dev uses `8001` (see §4).

---

## 3. Optional / Advanced (Backend)

All have safe defaults in `backend/app/core/config.py`; set only if you need to override.

| Variable | Default | Purpose |
|----------|---------|---------|
| SENTRY_DSN | *(empty)* | Error tracking — `https://KEY@sentry.io/ID` (sentry.io → FastAPI project) |
| SUPABASE_BUCKET | `cryptalk` | Storage bucket name |
| MAX_FILE_SIZE_BYTES | `26214400` (25 MB) | Per-file upload limit |
| STORAGE_QUOTA_BYTES | `996147200` (~950 MB) | Total storage quota (Supabase free tier = 1 GB) |
| FILE_RETENTION_HOURS | `1` | Auto-delete uploaded files after N hours |
| CLEANUP_INTERVAL_SECONDS | `0` (auto) | Cleanup job interval |
| COOKIE_NAME | `tc_session` | Session cookie name |
| COOKIE_MAX_AGE | `2592000` (30 days) | Hard-capped at 30 days by validation |
| WELCOME_CHANNEL_ID | `welcome-channel` | Auto-join channel for new users |
| PUSH_NOTIFICATIONS_ENABLED | `false` | Push payloads never contain message content |
| DATA_RETENTION_DAYS | `90` | Capped at 90 when PRIVACY_MODE is on |
| PRIVACY_MODE | `true` | Enables privacy caps |
| FORCE_HTTPS | `true` | Redirect HTTP → HTTPS |
| HSTS_MAX_AGE | `63072000` | HSTS header lifetime |

---

## 4. Local Development

### Backend — `backend/.env` (copy from `backend/.env.example`)

```bash
PORT=8001
DEBUG=False
DB_PATH=./db/cryptalk.db          # SQLite default — zero config
SESSION_SECRET=<python -c "import secrets; print(secrets.token_hex(32))">
COOKIE_NAME=tc_session
COOKIE_MAX_AGE=2592000
CORS_ORIGINS=http://localhost:3000
WELCOME_CHANNEL_ID=welcome-channel
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_USE_TLS=true
EMAIL_VERIFICATION_ENABLED=false
```

### Frontend — `frontend/.env.local` (copy from `frontend/.env.example`)

```bash
NEXT_PUBLIC_BACKEND_PORT=8001     # API client appends ?XTransformPort=8001 to requests
# NEXT_PUBLIC_BACKEND_URL=        # leave unset locally — port mode is used instead
# BACKEND_URL=http://localhost:8001   # server-side rewrites only, alternative to above
```

### Mobile — `flutter/.env` (copy from `flutter/.env.example`)

```bash
BACKEND_URL=http://10.0.2.2:8001          # Android emulator → host machine
# BACKEND_URL=https://cryptalk-api.onrender.com   # production build
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```

iOS simulator can use `http://localhost:8001`; physical devices need your LAN IP.

---

## 5. Production Deploy Checklist

1. **Neon** — create project at neon.tech → copy connection string → set `NEON_DATABASE_URL`.
2. **Supabase** — create project → Settings → API → copy Project URL, `anon` key, `service_role` key → create `cryptalk` bucket.
3. **Upstash** (optional) — create Redis DB → copy `rediss://` URL.
4. **Render** — New Blueprint from repo (uses `render.yaml`) → fill all `sync: false` secrets:
   - [ ] `SESSION_SECRET` (≥ 32 chars)
   - [ ] `NEON_DATABASE_URL` *or* `DATABASE_URL`
   - [ ] `SUPABASE_URL` + `SUPABASE_KEY`
   - [ ] `REDIS_URL`, `SENTRY_DSN`, SMTP vars (optional)
   - [ ] Update `CORS_ORIGINS` with your real Vercel domain
5. **Vercel** — import repo, Root Directory = `frontend`, set the four `NEXT_PUBLIC_*` vars from §1.
6. **Redeploy frontend** after any `NEXT_PUBLIC_*` change (build-time inlined).
7. **Verify**: `https://cryptalk-api.onrender.com/health` returns 200 → register a user → send a message → upload a file.

---

## 6. Consistency Matrix

Cross-check of every variable against its source of truth:

| Variable | config.py | backend/.env.example | render.yaml | frontend/.env.example | flutter/.env.example |
|----------|:---------:|:--------------------:|:-----------:|:---------------------:|:--------------------:|
| PORT | ✅ | ✅ (8001) | ✅ (10000) | — | — |
| DEBUG | ✅ | ✅ | ✅ | — | — |
| SESSION_SECRET | ✅ | ✅ | ✅ | — | — |
| CORS_ORIGINS | ✅ | ✅ | ✅ | — | — |
| NEON_DATABASE_URL | ✅ | ✅ | ✅ | — | — |
| DATABASE_URL | ✅ | ✅ | ✅ | — | — |
| SUPABASE_URL / SUPABASE_KEY | ✅ | ✅ | ✅ | — | — |
| SUPABASE_BUCKET | ✅ | — | — | — | — |
| REDIS_URL | ✅ | ✅ | ✅ | — | — |
| SENTRY_DSN | ✅ | ✅ | ✅ | — | — |
| SMTP_* / EMAIL_VERIFICATION_ENABLED | ✅ | ✅ | ✅ | — | — |
| NEXT_PUBLIC_BACKEND_URL | — | — | — | ✅ | — |
| NEXT_PUBLIC_BACKEND_PORT | — | — | — | ✅ | — |
| BACKEND_URL (frontend rewrite) | — | — | ✅ (fromService) | ✅ | — |
| NEXT_PUBLIC_SUPABASE_URL / ANON_KEY | — | — | — | ✅ | — |
| NEXT_PUBLIC_APP_URL | — | — | — | ✅ | — |
| BACKEND_URL (mobile) | — | — | — | — | ✅ |
| SUPABASE_ANON_KEY (mobile) | — | — | — | — | ✅ |

Known intentional differences (not bugs):
- `PORT`: 8001 locally vs 10000 on Render (Render convention).
- Frontend/mobile use the Supabase **anon** key; backend uses the **service** key.
- `NEXT_PUBLIC_SUPABASE_*` / `NEXT_PUBLIC_APP_URL` are reserved for client-side features
  (direct storage uploads, canonical URLs); the backend handles server-side storage with its own keys.
