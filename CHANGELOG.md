# Changelog

## [2026.08.20] - 2026-08-20

### Security
- Constant-time password verification with dummy salt execution for non-existent users
- HMAC-SHA256 signed HTTP-only session cookies (SameSite=Lax, Secure in production)
- Brute-force lockout: 5 failed logins trigger 15-minute account suspension
- Cookie-based WebSocket authentication (no self-declared userId)
- Per-user + per-IP rate limiting (10 logins/min, 120 API/min)
- Security headers: X-Frame-Options DENY, HSTS, X-Content-Type-Options, Referrer-Policy
- DTLS-SRTP encryption on WebRTC voice/video calls
- Input sanitization: Pydantic validation, HTML escaping, control char stripping
- SQLAlchemy parameterized queries preventing SQL injection
- Path traversal protection on file uploads (rejects `..` and null bytes)
- Attachment ownership validation before serving downloads
- HTTPS enforcement and HSTS with 2-year max-age

### Features
- WebRTC voice calling with 10-minute connection limit
- WebRTC video calling with 3x ringtone repeat for incoming calls
- WhatsApp and Telegram style media preview for images, video, PDF, and documents
- Send and receive message sound effects
- Read More toggle for messages exceeding 250 characters
- 90-day auto-delete with configurable data retention (privacy mode caps at 90 days)
- Forgot password screen with email-based reset flow
- Email verification system (optional, configurable via EMAIL_VERIFICATION_ENABLED)
- SMTP email service with retry logic and HTML templates (welcome, verification, reset)
- Docker Compose setup for local development (backend + frontend)
- Alembic database migration infrastructure
- Render blueprint (render.yaml) for free-tier deployment
- Neon DB support as primary PostgreSQL option (serverless, free tier)

### Privacy
- 90-day automatic data retention with privacy mode enforcement
- Ephemeral file storage: Supabase blobs wiped on message delivery
- Minimal data collection: no phone number required, email-only auth
- Self-destructing messages (10s to 1 week expiration)
- Expiring groups (auto-delete after 1-7 days)
- Configurable CLEANUP_INTERVAL_SECONDS for privacy tuning
- Account deletion for permanent data wipe
- DNS-over-HTTPS support for ISP resistance
- Privacy mode configuration (PRIVACY_MODE env var)

### Bug Fixes
- Fix real-time message delivery across views, unread badges, and direct messaging
- Fix CORS middleware credentials handling for Vercel and production deployments
- Fix database redeploy URL parsing, mark-read routes, global incoming calls, and avatar fallbacks
- Fix queued-messages listener to fetch offline messages and enable offline input routing
- Fix missing AsyncSession and selectinload imports in repositories
- Fix database startup lifespan resilience and log warning on transient connection failure
- Fix incoming socket/queued messages where senderId matches current user to prevent overwriting plaintext E2EE with ciphertext
- Fix typingUsers array crash by adding fallback to EMPTY_TYPING
- Fix undefined message array errors across React components
- Fix search and connection requests for usernames with leading @ handles
- Fix CORS origins trailing slash stripping
- Fix cookie SameSite=none for cross-domain Vercel-to-Render authentication
- Fix PostgreSQL BigInteger migration for millisecond timestamps
- Fix prepared statement cache disabled for PgBouncer compatibility
- Fix database initialization to use async engine in lifespan
- Fix engine kwargs by removing prepared_statement_cache_size

### Infrastructure
- Backend overhaul with clean architecture (API → Service → Repository)
- Socket.IO reconnection with automatic room re-joining and offline queue draining
- Voice message recording with Web Audio API and client-side E2EE
- File sharing with auto-deletion on delivery (25MB limit, 950MB quota)
- Offline message queue with 24-hour TTL
- Docker hardened Dockerfiles for backend and frontend
- GitHub Actions CI/CD workflows (backend, frontend, Flutter build, CodeQL)
- Supabase file storage integration with ephemeral blobs
- Next.js 16 frontend with Zustand state management
- Flutter cross-platform client (iOS, Android, macOS, Windows, Linux)
