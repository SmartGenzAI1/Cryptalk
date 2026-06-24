# Z-Chat — Scalable Messenger Architecture

A production-grade, real-time messaging platform with a clean layered
backend (Python/FastAPI) and a feature-modular frontend (Next.js).

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                       │
│   Next.js SPA · WebSocket · Responsive (mobile + desktop)    │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS / WSS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Caddy Gateway (port 81)                   │
│   XTransformPort routing · TLS termination · CORS            │
└─────────┬─────────────────────────────┬─────────────────────┘
          │                             │
          ▼ :3000                       ▼ :8001 (?XTransformPort)
┌──────────────────────┐     ┌──────────────────────────────────┐
│  Frontend (Next.js)   │     │     Backend (FastAPI + Socket.IO) │
│  ───────────────────  │     │     ──────────────────────────   │
│  • UI components      │     │  app/api/v1/   Thin controllers   │
│  • Zustand store      │     │  app/services/ Business logic     │
│  • /api/ai/* (BFF)    │     │  app/repos/    Data access        │
│  • z-ai-web-dev-sdk   │     │  app/models/   ORM entities       │
│                       │     │  app/core/     Config/security/db  │
│  frontend/            │     │  app/realtime/ Socket.IO manager   │
└──────────────────────┘     └──────────────┬───────────────────┘
                                            │
                                            ▼
                                   ┌────────────────┐
                                   │   SQLite (Prisma) │
                                   │   db/custom.db    │
                                   └────────────────┘
```

## 📁 Backend Structure (Clean Architecture)

```
backend/
├── app/
│   ├── main.py              # ASGI app entry (FastAPI + Socket.IO)
│   ├── core/                # Cross-cutting concerns
│   │   ├── config.py        #   Pydantic settings (env-driven)
│   │   ├── database.py      #   Async SQLAlchemy engine + sessions
│   │   ├── security.py      #   scrypt hashing, HMAC tokens, deps
│   │   └── exceptions.py    #   Domain error hierarchy + handlers
│   ├── models/              # ORM entities (SQLAlchemy)
│   ├── schemas/             # Pydantic request/response DTOs
│   ├── repositories/        # Data access layer (one per entity)
│   │   ├── UserRepository
│   │   ├── ChatRepository
│   │   ├── MessageRepository
│   │   ├── ReactionRepository
│   │   └── StarredMessageRepository
│   ├── services/            # Business logic layer
│   │   ├── auth_service.py
│   │   ├── chat_service.py
│   │   ├── message_service.py
│   │   ├── user_service.py
│   │   ├── serializers.py   # ORM → dict serialization
│   │   └── deps.py          # DI factory (composition root)
│   ├── api/v1/              # Presentation layer (thin controllers)
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── chats.py
│   │   └── messages.py
│   └── realtime/            # WebSocket transport
│       ├── connection_manager.py
│       └── handlers.py
├── requirements.txt
└── Dockerfile
```

### Layer responsibilities

| Layer        | Responsibility                          | Knows about        |
|--------------|-----------------------------------------|--------------------|
| **API**      | HTTP parsing, request validation        | Services, Schemas  |
| **Service**  | Business rules, orchestration           | Repositories       |
| **Repository**| Database queries                        | Models, SQLAlchemy |
| **Models**   | Table definitions                       | SQLAlchemy only    |
| **Core**     | Config, security, DB, exceptions        | Nothing domain     |

### Why this design?

- **Testable** — Services depend on repository interfaces, easily mocked
- **Scalable** — Each layer can scale independently; repos can swap DBs
- **Maintainable** — Clear separation; no business logic in controllers
- **Future-proof** — Add API v2 without touching v1; swap SQLite for
  PostgreSQL by changing one config line; add Redis for multi-process
  Socket.IO by replacing the connection manager

## 📁 Frontend Structure (Feature-Modular)

```
frontend/src/
├── app/
│   ├── page.tsx             # Root (auth gate)
│   ├── layout.tsx           # Theme + toaster providers
│   └── api/ai/              # AI BFF (z-ai-web-dev-sdk, JS-only)
├── components/
│   ├── chat/                # All chat UI components
│   └── ui/                  # shadcn/ui primitives
├── hooks/
│   ├── use-socket.ts        # Socket.IO client → backend
│   └── use-mobile.ts
├── stores/
│   └── chat-store.ts        # Zustand global state
└── lib/
    ├── api.ts               # API client (XTransformPort)
    ├── ai-actions.ts        # AI + backend action wrappers
    ├── types.ts             # Shared TypeScript types
    └── format.ts            # Date/time helpers
```

## 🚀 Running

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:asgi_app --host 0.0.0.0 --port 8001

# Frontend
cd frontend
bun install
bun run dev
```

## 📊 API Documentation

- Swagger UI:  `http://localhost:8001/docs`
- ReDoc:       `http://localhost:8001/redoc`

## 🔐 Security

- **Passwords**: scrypt (N=16384, r=8, p=1) — matches Node.js implementation
- **Sessions**: HMAC-SHA256 signed cookies (HTTP-only, 30-day expiry)
- **CORS**: Configurable allowlist via `CORS_ORIGINS` env var
- **Validation**: Pydantic schemas on every request body
