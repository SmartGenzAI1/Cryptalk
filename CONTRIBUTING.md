# Contributing to Cryptalk

Thank you for your interest in contributing! This guide will help you get started.

## 🛠️ Development Setup

### Prerequisites

- Python 3.12+
- Node.js 20+ or Bun
- Git

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/Cryptalk.git
cd Cryptalk
git remote add upstream https://github.com/SmartGenzAI1/Cryptalk.git
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:asgi_app --host 0.0.0.0 --port 8001 --reload
```

### 3. Frontend

```bash
cd frontend
bun install
bun run dev
```

### 4. Create a Branch

```bash
git checkout -b feat/your-feature-name
```

## 📝 Code Style

### Backend (Python)

- Follow PEP 8
- Use type hints on all functions
- Keep services free of HTTP concerns (no `Request`/`Response` in services)
- One responsibility per file
- Add docstrings to all public functions and classes

### Frontend (TypeScript)

- Use `'use client'` directive for client components
- Prefer shadcn/ui components over custom implementations
- Use Zustand for global state, local `useState` for component state
- Follow the existing file structure (components in `components/chat/`)
- Use the `cn()` utility for conditional classes

### Commits

Use [Conventional Commits](https://conventionalcommits.org/):

```
feat: add message search
fix: resolve avatar loading on mobile
docs: update backend README
refactor: extract message serializer
chore: update dependencies
```

## 🏗️ Architecture Guidelines

- **Backend**: maintain the clean architecture (API → Service → Repository → Model). Don't skip layers.
- **Frontend**: keep components small and focused. Use the Zustand store for shared state.
- **Real-time**: all WebSocket logic goes through the Socket.IO handlers in `realtime/`.
- **Security**: validate all inputs at the API boundary. Never trust client data.

## 🧪 Testing

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
bun run lint
```

## 📤 Submitting Changes

1. Push to your fork
2. Create a Pull Request against `main`
3. Describe what changed and why
4. Link any related issues

## 🐛 Reporting Bugs

Use [GitHub Issues](https://github.com/SmartGenzAI1/Cryptalk/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)
- Environment (OS, browser, Python/Node version)

## 💡 Feature Requests

Open an issue with the `enhancement` label. Describe:
- The problem you're trying to solve
- Your proposed solution
- Alternatives considered

## 📜 Code of Conduct

Be respectful, inclusive, and constructive. Harassment of any kind will not be tolerated.

---

Thank you for contributing to Cryptalk! 🚀

## 🏷️ Good First Issues

Issues labeled `good first issue` are specifically curated for new contributors. They're self-contained, well-scoped, and don't require deep knowledge of the codebase.

### Current good first issues to create:

1. **Add message search highlighting** — when searching in-chat, highlight the matched text in results (frontend only, `message-item.tsx`)
2. **Add typing duration indicator** — show how long ago someone was typing (frontend, `chat-window.tsx`)
3. **Add message copy action** — long-press / context menu "Copy" for text messages (frontend + Flutter)
4. **Add online-last-seen tooltip** — hover over avatar to see "last seen 5 min ago" (frontend, `chat-avatar.tsx`)
5. **Add keyboard shortcuts** — Ctrl+K for search, Esc to close dialogs (frontend)
6. **Add dark/light theme persistence** — remember the user's choice in localStorage (frontend, already using next-themes — just verify)
7. **Add message delete confirmation** — confirm before delete-for-everyone (frontend + Flutter)
8. **Add unread message divider** — "New Messages" line above first unread (frontend, `message-list.tsx`)

## 🔒 Security

Found a vulnerability? **DO NOT open a public issue.** See [SECURITY.md](SECURITY.md) for responsible disclosure.

### Security measures already in place:
- End-to-end encryption (X25519 + ChaCha20-Poly1305)
- Zero-knowledge server (only stores ciphertext + public keys)
- Ephemeral storage (file content wiped after delivery)
- Brute-force protection (5 failed logins → 15-min lockout)
- Per-user rate limiting (IP + user identity)
- Cookie security (httponly, secure in prod, samesite=lax)
- Socket auth at connection time (cookie-based, no self-declared userId)
- Input sanitization (XSS, SQL injection, path traversal)
- Security headers (X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy)
- Path traversal protection on file uploads
- Ownership validation on attachment paths

### Security review checklist for contributors:
- [ ] No hardcoded secrets or tokens
- [ ] No stack traces leaked in error responses
- [ ] All user input sanitized
- [ ] No SQL injection vectors (use SQLAlchemy parametrized queries)
- [ ] No XSS vectors (use `sanitize_text()` for all user content)
- [ ] No CSRF vectors (cookie samesite=lax, no state-changing GET)
- [ ] Rate limiting on all auth endpoints
- [ ] No sensitive data in logs
