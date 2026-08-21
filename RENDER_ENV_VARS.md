# Cryptalk — Render Environment Variables Guide

Exact, step-by-step instructions for configuring the **cryptalk-api** service on Render.

> **Where to set these:** [dashboard.render.com](https://dashboard.render.com) → your workspace →
> **cryptalk-api** service → **Environment** (left sidebar) → **Add Environment Variable**.
> After adding/changing vars, click **Save Changes** — Render redeploys automatically.
>
> Vars marked `sync: false` in `render.yaml` are **required to be set in the dashboard**
> before the first deploy will succeed. Everything else is pre-filled by the Blueprint.

---

## 1. Minimum required to boot

The app **will not start** without these two:

| Key | Value | Notes |
|---|---|---|
| `SESSION_SECRET` | *(generate — see below)* | Must be ≥ 32 chars or the app raises a RuntimeError on boot (`app/core/config.py:158`) |
| One database URL | *(see Section 3)* | `NEON_DATABASE_URL` **or** `DATABASE_URL`. If neither is set, the app falls back to SQLite (ephemeral on Render — data lost on every deploy) |

### Generate SESSION_SECRET

Run **one** of these locally and paste the output:

```bash
# macOS / Linux / Git Bash / WSL
openssl rand -hex 32
```

```powershell
# Windows PowerShell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
```

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example value: `a3f9c2e81b7d4f6a9c0e5d8b2f7a4c1e9d6b3f8a5c2e7d4b9f6a3c0e5d8b2f7a`

---

## 2. Always-set-in-dashboard variables

| Key | Set in dashboard? | Example / Value |
|---|---|---|
| `SESSION_SECRET` | ✅ Yes — secret | `openssl rand -hex 32` output |
| `NEON_DATABASE_URL` *or* `DATABASE_URL` | ✅ Yes — secret | See Section 3 (set only ONE) |
| `SUPABASE_URL` | ✅ Yes | `https://YOURPROJECT.supabase.co` |
| `SUPABASE_KEY` | ✅ Yes — secret | Supabase service_role key (see Section 4) |
| `SMTP_USER` | ⚙️ Only if email enabled | `you@gmail.com` |
| `SMTP_PASSWORD` | ⚙️ Only if email enabled | Gmail **App Password** (16 chars) — NOT your Gmail password |
| `SMTP_FROM_EMAIL` | ⚙️ Only if email enabled | `you@gmail.com` |
| `REDIS_URL` | ⚙️ Optional | `redis://default:PASSWORD@HOST.upstash.io:6379` |
| `SENTRY_DSN` | ⚙️ Optional | `https://KEY@oXXXX.ingest.sentry.io/ID` |

## 3. Pre-filled by render.yaml (no action needed)

These are already committed in `render.yaml` with safe defaults:

| Key | Value in render.yaml |
|---|---|
| `CORS_ORIGINS` | `https://cryptalk.vercel.app,http://localhost:3000` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USE_TLS` | `true` |
| `EMAIL_VERIFICATION_ENABLED` | `false` |
| `DEBUG` | `false` |
| `PORT` | `10000` |

> **Update `CORS_ORIGINS`** if your frontend URL differs from `https://cryptalk.vercel.app`.
> Format: comma-separated origins, no trailing slashes, no spaces.

---

## 4. Step-by-step: Database (choose ONE)

The app resolves its DB in this priority order (`app/core/config.py:111`):
**`NEON_DATABASE_URL` → `DATABASE_URL` → SQLite fallback.**

### Option A — Neon (recommended, free tier)

1. Go to [neon.tech](https://neon.tech) → sign up → **Create project** (name it `cryptalk`).
2. On the dashboard, copy the connection string from **Connection Details**. It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxxx.us-east-2.aws.neon.tech/cryptalk?sslmode=require
   ```
3. In Render → cryptalk-api → Environment → add:
   - Key: `NEON_DATABASE_URL`
   - Value: paste the string exactly (keep `?sslmode=require`)
4. Leave `DATABASE_URL` empty/unset.

### Option B — Supabase PostgreSQL

1. Go to [supabase.com](https://supabase.com) → your project → **Connect** (top bar).
2. Copy the **connection pooler** string (port `6543`, recommended for serverless/free tiers):
   ```
   postgresql://postgres.PROJECT:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
   (Or the direct string on port `5432`.)
3. In Render → cryptalk-api → Environment → add:
   - Key: `DATABASE_URL`
   - Value: paste the string
4. Leave `NEON_DATABASE_URL` unset.

---

## 5. Step-by-step: Supabase Storage (file uploads)

Required for image/file sharing. Without it, uploads are disabled but chat still works.

1. Open your Supabase project → **Project Settings** → **API**.
2. Copy:
   - **Project URL** → set as `SUPABASE_URL`
   - **service_role** key (*not* the anon key — the backend needs storage write access) → set as `SUPABASE_KEY`
3. Create a storage bucket named `cryptalk` (**Storage** → **New bucket**), or override the name with `SUPABASE_BUCKET`.

---

## 6. Step-by-step: Redis (optional — Upstash)

Needed only for multi-instance Socket.IO scaling + distributed rate limiting. Skip for a single free-tier instance.

1. Go to [upstash.com](https://upstash.com) → **Create Database** (pick a region near Oregon).
2. Under **Connect** → copy the endpoint URL:
   ```
   redis://default:PASSWORD@chosen-host.upstash.io:6379
   ```
3. Set it as `REDIS_URL` in Render.

---

## 7. Step-by-step: Email via Gmail SMTP (optional)

Enables verification/password-reset/welcome emails.

1. Google Account → **Security** → enable **2-Step Verification** (required).
2. Go to [App Passwords](https://myaccount.google.com/apppasswords) → create one for "Cryptalk" → copy the 16-char password.
3. In Render, set:

   | Key | Value |
   |---|---|
   | `SMTP_USER` | `you@gmail.com` |
   | `SMTP_PASSWORD` | the 16-char app password |
   | `SMTP_FROM_EMAIL` | `you@gmail.com` |

   (`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USE_TLS=true` are already set.)
4. To force email verification at registration, change `EMAIL_VERIFICATION_ENABLED` to `true`.
   With `false`, emails send but aren't required to use the app.
5. Email only activates when `SMTP_HOST` + `SMTP_USER` + `SMTP_PASSWORD` are all set (`config.py:147`).

<details>
<summary>Using SendGrid or Brevo instead of Gmail</summary>

Change `SMTP_HOST` in render.yaml (or dashboard):

| Provider | SMTP_HOST | SMTP_USER | SMTP_PASSWORD |
|---|---|---|---|
| SendGrid | `smtp.sendgrid.net` | `apikey` | `SG.xxxxx` |
| Brevo | `smtp-relay.brevo.com` | your Brevo email | your Brevo key |

</details>

---

## 8. Sentry (optional)

1. [sentry.io](https://sentry.io) → **Create project** → platform: **FastAPI**.
2. Copy the DSN → set as `SENTRY_DSN`.

---

## 9. Post-deploy checklist

1. Render dashboard → cryptalk-api → **Events** tab → wait for **Live**.
2. Visit `https://<your-render-url>/health` → expect HTTP 200.
3. Check **Logs** for:
   - ❌ `SESSION_SECRET must be set and at least 32 characters` → fix var #1.
   - ❌ `RuntimeError` mentioning `CHANGE_ME_IN_PRODUCTION` → you didn't set `SESSION_SECRET`.
   - ✅ No traceback + successful uvicorn startup line.
4. From your frontend, register a user and confirm CORS isn't blocked (wrong `CORS_ORIGINS` = browser console CORS error).

### Full variable reference (what the code reads)

All defined in `backend/app/core/config.py`:

`PORT`, `DEBUG`, `DB_PATH`, `NEON_DATABASE_URL`, `SESSION_SECRET`, `COOKIE_NAME`,
`COOKIE_MAX_AGE`, `CORS_ORIGINS`, `REDIS_URL`, `SENTRY_DSN`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_USE_TLS`,
`EMAIL_VERIFICATION_ENABLED`, `WELCOME_CHANNEL_ID`, `SUPABASE_URL`, `SUPABASE_KEY`,
`SUPABASE_BUCKET`, `MAX_FILE_SIZE_BYTES`, `STORAGE_QUOTA_BYTES`, `FILE_RETENTION_HOURS`,
`DATA_RETENTION_DAYS`, `PRIVACY_MODE`, `FORCE_HTTPS` — plus `DATABASE_URL`
(read directly via `os.environ` in the `database_url` property).
