# Security Policy

## 🔒 Reporting a Vulnerability

We take security seriously. If you discover a vulnerability in Cryptalk, please **do not** open a public issue.

### Private Disclosure

1. Go to [GitHub Security Advisories](https://github.com/SmartGenzAI1/Cryptalk/security/advisories/new)
2. Click **"New draft security advisory"**
3. Describe the vulnerability with:
   - Affected component (backend / frontend / realtime)
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

| Stage | Target |
|---|---|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 days |
| Fix or mitigation | Within 30 days (severity-dependent) |

## 🛡️ Security Features

- **Password hashing**: scrypt (N=16384, r=8, p=1)
- **Session tokens**: HMAC-SHA256 signed cookies (HTTP-only, Secure in prod, SameSite=Lax)
- **Rate limiting**: per-user + per-IP sliding window (10 logins/min, 120 API/min)
- **Brute-force lockout**: 5 failed logins → 15-min account lockout (429 + Retry-After)
- **Socket auth**: cookie-verified at WebSocket connection time (no self-declared userId)
- **Input validation**: Pydantic schemas + regex on all inputs
- **Content sanitization**: HTML escaping, control char stripping, length limits
- **SQL injection prevention**: SQLAlchemy parameterized queries throughout
- **Path traversal protection**: rejects `..` and null bytes in upload paths
- **Attachment ownership**: validates `attachment_path` belongs to the sender
- **Security headers**: X-Frame-Options DENY, X-Content-Type-Options nosniff, HSTS, Referrer-Policy
- **Timing attack prevention**: constant-time password comparison
- **E2EE**: X25519 + ChaCha20-Poly1305 (zero-knowledge server, private keys never leave device)
- **Ephemeral storage**: message content + Supabase file blobs wiped after delivery
- **File quotas**: 25MB per file, 950MB total (Supabase free-tier safe)

## 📋 Supported Versions

| Version | Supported |
|---|---|
| latest (main) | ✅ |
| < latest | ❌ |

## 🔐 Best Practices for Self-Hosting

1. **Change the session secret** — set `SESSION_SECRET` to a strong random string
2. **Use HTTPS** — always serve behind TLS (Caddy provides this by default)
3. **Restrict CORS** — set `CORS_ORIGINS` to your specific domain
4. **Use a strong DB password** — if using PostgreSQL instead of SQLite
5. **Keep dependencies updated** — Dependabot will open PRs automatically
