# Cryptalk Frontend — Vercel Environment Variables

Set these EXACTLY in **Vercel Dashboard → cryptalk frontend Project → Settings → Environment Variables**.

| Variable | Value | Environment | Description |
|----------|-------|-------------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | `https://cryptalk-api.onrender.com` | Production | Backend API URL |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | Production | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbG...` | Production | Supabase anonymous key |
| `NEXT_PUBLIC_APP_URL` | `https://cryptalk.vercel.app` | Production | Frontend URL |

## Notes

- All four variables are `NEXT_PUBLIC_*` → they are inlined into the client bundle at build time.
  After changing any of them, you must **redeploy** for changes to take effect.
- Replace `https://xxx.supabase.co` with your real Supabase project URL
  (Supabase Dashboard → Settings → API → Project URL).
- Replace `eyJhbG...` with your real Supabase anon/public key
  (Supabase Dashboard → Settings → API → anon public). This key is safe to expose client-side.
- If the actual deployed Vercel domain differs from `https://cryptalk.vercel.app`,
  update `NEXT_PUBLIC_APP_URL` to match it.
- Local development does not need these vars — see `frontend/.env.example`
  (`NEXT_PUBLIC_BACKEND_PORT=8001` is used locally instead).
