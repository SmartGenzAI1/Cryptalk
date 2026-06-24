# Cryptalk — Supabase Setup

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for it to provision (2-3 minutes)

## 2. Run the Schema

1. Go to **SQL Editor** in Supabase dashboard
2. Copy the contents of `supabase/schema.sql`
3. Paste and click **Run**
4. All tables, indexes, and RLS policies will be created

## 3. Get Your Credentials

Go to **Settings > API**:
- **Project URL**: `https://xxx.supabase.co`
- **anon public key**: `eyJhbG...`

Go to **Settings > Database**:
- **Connection string**: `postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres`

## 4. Configure Backend (Render)

Set these environment variables in Render:

```
DATABASE_URL=postgresql+asyncpg://postgres:[password]@db.xxx.supabase.co:5432/postgres
SESSION_SECRET=[openssl rand -hex 32]
CORS_ORIGINS=https://your-app.vercel.app
```

## 5. Configure Frontend (Vercel)

Set in Vercel:
```
NEXT_PUBLIC_BACKEND_URL=https://cryptalk-backend.onrender.com
```

## 6. Configure Flutter (.env)

```
BACKEND_URL=https://cryptalk-backend.onrender.com
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
```

## 7. (Optional) Set Up Storage

For media uploads (future feature):

1. Go to **Storage** in Supabase dashboard
2. Create a bucket called `cryptalk`
3. Set it to **Private** (files are encrypted before upload)

## Security

- **Row Level Security (RLS)** is enabled on all tables
- Users can only read their own data and chats they're members of
- Messages are stored as encrypted ciphertext (E2EE)
- Private keys never leave the device
- Supabase anon key is safe to expose (it's public by design, RLS protects data)
