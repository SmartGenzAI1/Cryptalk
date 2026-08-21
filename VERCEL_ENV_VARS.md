# Cryptalk Frontend — Vercel Environment Variables

Set these EXACTLY in **Vercel Dashboard → cryptalk frontend Project → Settings → Environment Variables**.

| Variable | Value | Environment | Scope | Description |
|----------|-------|-------------|-------|-------------|
| `BACKEND_URL` | `https://cryptalk-backend-30yc.onrender.com` | Production | Server (not public) | Backend URL for Next.js rewrite proxy |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | Production | Client (public) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbG...` | Production | Client (public) | Supabase anonymous key |
| `NEXT_PUBLIC_APP_URL` | `https://cryptalk-three.vercel.app` | Production | Client (public) | Frontend URL |

## Notes

- `BACKEND_URL` is **server-side only** — it is NOT exposed to the browser.
  It tells Next.js rewrites where to proxy `/api/*` and `/socket.io/*` requests.
- The three `NEXT_PUBLIC_*` variables are inlined into the client bundle at build time.
  After changing any of them, you must **redeploy** for changes to take effect.
- **Do NOT set `NEXT_PUBLIC_BACKEND_URL`** — the frontend no longer makes direct
  cross-origin calls. All requests go through the Next.js rewrite proxy (same-origin).
- Replace `https://xxx.supabase.co` with your real Supabase project URL
  (Supabase Dashboard → Settings → API → Project URL).
- Replace `eyJhbG...` with your real Supabase anon/public key
  (Supabase Dashboard → Settings → API → anon public). This key is safe to expose client-side.
- If the actual deployed Vercel domain differs, update `NEXT_PUBLIC_APP_URL` to match.
- Local development does not need these vars — rewrites auto-proxy to `localhost:8001`.
