<div align="center">

<img src="frontend/public/logo-small.png" width="80" height="80" alt="Cryptalk Logo" />

# Cryptalk

### Secure real-time messaging, supercharged with AI

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## ✨ Features

- **Real-time messaging** — instant delivery via WebSockets (Socket.IO)
- **AI assistant** — built-in copilot that drafts, summarizes & translates messages
- **Smart replies** — AI-powered contextual reply suggestions
- **Voice messages** — record, waveform preview, and playback
- **Message reactions** — emoji reactions on any message
- **Message starring & forwarding** — bookmark and share messages across chats
- **Chat pinning & muting** — organize your conversations
- **Groups & channels** — broadcast to thousands or chat 1-on-1
- **Presence & typing indicators** — see who's online and typing in real-time
- **Premium UI/UX** — glassmorphism, spring animations, iOS-style design
- **Fully responsive** — mobile bottom-nav, desktop three-column layout
- **Premium icons** — 66 curated icons8 icons served locally
- **Secure** — scrypt password hashing, rate limiting, input sanitization

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Browser (Client)                    │
│         Next.js SPA · WebSocket · Responsive           │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP / WS
                         ▼
┌──────────────────────────────────────────────────────┐
│                 Caddy Gateway (:81)                    │
│      XTransformPort routing · TLS · CORS               │
└──────────┬──────────────────────────┬────────────────┘
           │ :3000                    │ :8001
           ▼                          ▼
┌─────────────────────┐    ┌──────────────────────────┐
│  Frontend (Next.js)  │    │  Backend (FastAPI+SIO)    │
│  ──────────────────  │    │  ──────────────────────  │
│  • UI components     │    │  • Clean architecture     │
│  • Zustand store     │    │  • API → Service → Repo   │
│  • /api/ai/* (BFF)   │    │  • Socket.IO realtime     │
│  • z-ai-web-dev-sdk  │    │  • Rate limiting          │
└─────────────────────┘    └───────────┬──────────────┘
                                       │
                                       ▼
                              ┌────────────────┐
                              │   SQLite (DB)   │
                              └────────────────┘
```

### Backend — Clean / Layered Architecture (Python)

```
backend/app/
├── main.py              # ASGI entry (FastAPI + Socket.IO)
├── core/                # Config, database, security, exceptions, rate limiting
├── models/              # SQLAlchemy ORM entities
├── schemas/             # Pydantic request/response DTOs
├── repositories/        # Data access layer (one repo per entity)
├── services/            # Business logic + serializers + DI factory
├── api/v1/              # Thin HTTP controllers (versioned)
└── realtime/            # Socket.IO connection manager + handlers
```

| Layer | Responsibility | Knows about |
|---|---|---|
| **API** | HTTP parsing, request validation | Services, Schemas |
| **Service** | Business rules, orchestration | Repositories |
| **Repository** | Database queries | Models, SQLAlchemy |
| **Models** | Table definitions | SQLAlchemy only |
| **Core** | Config, security, DB, exceptions | Nothing domain-specific |

### Frontend — Feature-Modular (Next.js + TypeScript)

```
frontend/src/
├── app/                 # Next.js App Router
│   ├── page.tsx         # Auth gate + main entry
│   └── api/ai/          # AI BFF routes (z-ai-web-dev-sdk)
├── components/chat/     # All chat UI components
├── hooks/               # use-socket, use-mobile
├── stores/              # Zustand global state
└── lib/                 # API client, icons, types, utils
```

## 🚀 Quick Start

### Prerequisites

- **Python 3.12+**
- **Node.js 20+** (or [Bun](https://bun.sh))
- **Git**

### 1. Clone

```bash
git clone https://github.com/SmartGenzAI1/Cryptalk.git
cd Cryptalk
```

### 2. Backend Setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # optional but recommended
pip install -r requirements.txt
cp .env.example .env  # configure if needed
uvicorn app.main:asgi_app --host 0.0.0.0 --port 8001 --reload
```

The backend auto-creates the SQLite database on first run. API docs available at `http://localhost:8001/docs`.

### 3. Frontend Setup

```bash
cd frontend
bun install   # or: npm install
cp .env.example .env.local  # configure if needed
bun run dev   # or: npm run dev
```

Open `http://localhost:3000` in your browser.

### 4. Seed Demo Data (optional)

```bash
# From the project root — creates 5 demo users + welcome channel
cd prisma && npx prisma db push   # creates tables
cd ../scripts && npx tsx seed.ts   # seeds demo data
```

**Demo accounts** (password: `password123`): `alex`, `sam`, `priya`, `marco`, `cryptalk-ai`

## 📁 Project Structure

```
Cryptalk/
├── backend/              # Python FastAPI backend
│   ├── app/              # Application source (clean architecture)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── README.md
├── frontend/             # Next.js frontend
│   ├── src/              # TypeScript source
│   ├── public/icons/     # 66 local icons (avatars, stickers, UI)
│   ├── package.json
│   ├── Dockerfile
│   └── README.md
├── prisma/               # Shared database schema (for seeding)
├── scripts/              # Database seed script
├── Caddyfile             # Gateway config (optional, for production)
├── ARCHITECTURE.md       # Detailed architecture docs
├── CONTRIBUTING.md
└── LICENSE
```

## 🔐 Security

| Feature | Implementation |
|---|---|
| **Password hashing** | scrypt (N=16384, r=8, p=1) |
| **Session tokens** | HMAC-SHA256 signed cookies (HTTP-only) |
| **Rate limiting** | 10 logins/min, 5 registrations/min, 120 API calls/min |
| **Input validation** | Pydantic schemas + regex validation on all inputs |
| **Content sanitization** | Control character stripping, length limits (10KB messages) |
| **SQL injection** | SQLAlchemy parameterized queries throughout |

## 🤖 AI Features

The AI capabilities are powered by [z-ai-web-dev-sdk](https://www.npmjs.com/package/z-ai-web-dev-sdk) and run in the Next.js frontend as a Backend-for-Frontend (BFF) layer:

- **Cryptalk AI Assistant** — multi-turn chat for drafting, brainstorming, translating
- **Smart Replies** — 3 contextual reply suggestions above the message input
- **Chat Summarization** — one-click AI summary of any conversation
- **Message Translation** — translate any message to 8 languages

## 📱 Responsive Design

| Viewport | Layout |
|---|---|
| Mobile (<768px) | Single-pane + bottom navigation bar |
| Tablet (768-1024px) | Icon sidebar + chat list + chat window |
| Desktop (>1024px) | Full 3-column with optional info/AI/settings panels |

## 🐳 Docker

```bash
# Backend
cd backend && docker build -t cryptalk-backend . && docker run -p 8001:8001 cryptalk-backend

# Frontend
cd frontend && docker build -t cryptalk-frontend . && docker run -p 3000:3000 cryptalk-frontend
```

## 📖 Documentation

- [Backend README](backend/README.md) — API reference, endpoints, development guide
- [Frontend README](frontend/README.md) — Components, features, development guide
- [Architecture](ARCHITECTURE.md) — Detailed system design document
- **Swagger UI** — `http://localhost:8001/docs` (auto-generated)

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

Made with ✨ by the Cryptalk team

</div>
