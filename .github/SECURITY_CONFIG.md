# GitHub Security Configuration

## Enable These in Repository Settings

Go to: **Settings > Security & analysis**

### 1. Secret scanning — ENABLE
Detects API keys, tokens, and other secrets accidentally pushed to the repo.

### 2. Private vulnerability reporting — ENABLE
Allows security researchers to report vulnerabilities privately.

### 3. Code quality findings — ENABLE
Automatically detects code quality issues.

## Already Enabled
- ✅ Security advisories
- ✅ Dependabot alerts
- ✅ Code scanning (CodeQL)

## Security Features in Code

- **Password hashing**: scrypt (N=16384, r=8, p=1)
- **Session tokens**: HMAC-SHA256 signed cookies (HTTP-only)
- **Rate limiting**: 10 logins/min, 5 registrations/min, 120 API calls/min
- **Input validation**: Pydantic + regex on all inputs
- **Content sanitization**: control char stripping, length limits
- **E2EE**: X25519 + crypto_secretbox (zero-knowledge server)
- **Ephemeral storage**: message content wiped after delivery
- **SQL injection prevention**: SQLAlchemy parameterized queries
- **No hardcoded secrets**: all secrets via environment variables
