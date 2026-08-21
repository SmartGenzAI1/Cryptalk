# Neon DB Setup Guide

Neon is a serverless PostgreSQL provider with a generous free tier. This guide walks you through setting up Neon as the database backend for Cryptalk.

## 1. Create a Neon Account

1. Go to [neon.tech](https://neon.tech)
2. Click **Sign Up** (GitHub or email)
3. Verify your email if prompted

## 2. Create a Database

1. From the Neon console, click **Create Project**
2. Choose a project name (e.g., `cryptalk`)
3. Select a region closest to your Render deployment (e.g., `us-east-2`)
4. Click **Create Project**

Neon will create a default database named after your project.

## 3. Get the Connection String

1. In your project dashboard, go to the **Dashboard** tab
2. Under **Connection Details**, select:
   - **Connection string**
   - **Psycopg (SQLAlchemy)**
   - **Pooled connection** (recommended for serverless)
3. Copy the connection string. It looks like:

```
postgresql://neondb_owner:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

## 4. Set the Environment Variable

In your Render dashboard, add a new environment variable:

```
Key:   NEON_DATABASE_URL
Value: postgresql://neondb_owner:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

Or locally in your `.env` file:

```
NEON_DATABASE_URL=postgresql://neondb_owner:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

> **Important:** The `?sslmode=require` parameter is mandatory for Neon connections.

## 5. Run the Initial Migration

Cryptalk uses SQLAlchemy to create tables automatically on startup. When the app starts with `NEON_DATABASE_URL` set, it will:

1. Detect Neon via the URL (`neon.tech` domain) or the `NEON_DATABASE_URL` env var
2. Apply optimized connection settings (small pool, SSL, fast recycle)
3. Create all tables if they don't exist
4. Run any pending ALTER TABLE migrations

No manual migration commands are needed. Just start the app:

```bash
cd backend
python -m uvicorn app.main:asgi_app --host 0.0.0.0 --port 8001
```

## 6. Free Tier Limitations

Neon's free tier includes:

| Resource | Limit |
|---|---|
| Storage | 512 MB |
| Compute | 191.9 compute-hours/month |
| Connections (pooled) | 100 simultaneous |
| Connections (non-pooled) | 20 simultaneous |
| Projects | 1 |
| Branches | 10 |

**Key considerations for Cryptalk:**

- The app is configured with `pool_size=2` and `max_overflow=1` for Neon, well within limits
- Connections are recycled every 5 minutes (`pool_recycle=300`) since Neon suspends idle computes
- The `pool_pre_ping=True` setting ensures stale connections are automatically replaced
- Neon scales to zero when idle — the first query after inactivity may take 1-3 seconds (cold start)

## Troubleshooting

**Connection refused / timeout:**
- Verify `sslmode=require` is in your connection string
- Check that Neon project is not suspended (free tier suspends after inactivity)

**Cold start delays:**
- Neon free tier suspends compute after ~5 minutes of inactivity
- First request will be slower (~1-3s) while Neon wakes up
- This is normal and does not affect subsequent requests

**Too many connections:**
- Neon free tier limits to 20 non-pooled connections
- Cryptalk uses pool_size=2 + max_overflow=1 = max 3 connections per instance
- If deploying multiple Render instances, consider upgrading Neon plan
