# Cryptalk Backend

Python FastAPI backend with clean/layered architecture, Socket.IO real-time messaging, and built-in security.

## 🏗️ Architecture

```
backend/app/
├── main.py              # ASGI app entry (FastAPI + Socket.IO combined)
├── core/                # Cross-cutting concerns
│   ├── config.py        #   Pydantic Settings (env-driven, 12-factor)
│   ├── database.py      #   Async SQLAlchemy 2.0 engine + sessions
│   ├── security.py      #   scrypt hashing, HMAC tokens, input validation
│   ├── exceptions.py    #   Domain error hierarchy + handlers
│   └── rate_limit.py    #   Sliding-window per-IP rate limiter
├── models/              # SQLAlchemy ORM entities
├── schemas/             # Pydantic request/response DTOs
├── repositories/        # Data access layer (one repo per entity)
│   ├── UserRepository
│   ├── ChatRepository
│   ├── MessageRepository
│   ├── ReactionRepository
│   └── StarredMessageRepository
├── services/            # Business logic layer
│   ├── auth_service.py
│   ├── chat_service.py
│   ├── message_service.py
│   ├── user_service.py
│   ├── serializers.py   # ORM → dict serialization
│   └── deps.py          # Dependency injection factory
├── api/v1/              # Presentation layer (thin controllers)
│   ├── auth.py
│   ├── users.py
│   ├── chats.py
│   └── messages.py
└── realtime/            # WebSocket transport
    ├── connection_manager.py
    └── handlers.py
```

### Layer Responsibilities

| Layer | Responsibility | Knows about |
|---|---|---|
| **API** | HTTP parsing, request validation | Services, Schemas |
| **Service** | Business rules, orchestration | Repositories |
| **Repository** | Database queries | Models, SQLAlchemy |
| **Models** | Table definitions | SQLAlchemy only |
| **Core** | Config, security, DB, exceptions | Nothing domain-specific |

## 🚀 Quick Start

### Prerequisites

- Python 3.12+
- pip

### Install & Run

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:asgi_app --host 0.0.0.0 --port 8001 --reload
```

The database (SQLite) is auto-created on first run. No manual migration needed.

### API Documentation

- **Swagger UI**: `http://localhost:8001/docs`
- **ReDoc**: `http://localhost:8001/redoc`

## 📡 API Endpoints

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create a new account |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | Get current user |

### Users

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users/me` | Get profile |
| `PATCH` | `/api/users/me` | Update profile / settings |
| `GET` | `/api/users/search?q=` | Search users |

### Chats

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/chats` | List all chats (sorted: pinned first) |
| `POST` | `/api/chats` | Create direct / group / channel |
| `GET` | `/api/chats/{id}` | Get chat details |
| `PATCH` | `/api/chats/{id}/settings` | Pin / mute / pin message |

### Messages

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/{chatId}/messages` | List messages (paginated, searchable) |
| `POST` | `/api/{chatId}/messages` | Send message (text/sticker/voice) |
| `PATCH` | `/api/{chatId}/messages?messageId=` | Edit / star message |
| `DELETE` | `/api/{chatId}/messages?messageId=` | Delete message |
| `PUT` | `/api/{chatId}/messages?messageId=` | Toggle reaction |
| `GET` | `/api/messages/starred` | List starred messages |
| `POST` | `/api/messages/forward` | Forward message to chats |

### Realtime (Socket.IO)

| Event | Direction | Description |
|---|---|---|
| `identify` | Client → Server | Register user on connect |
| `join-chat` | Client → Server | Join a chat room |
| `send-message` | Client → Server | Broadcast a new message |
| `typing` | Client → Server | Typing indicator |
| `reaction` | Client → Server | Reaction toggle |
| `message` | Server → Client | New message received |
| `user-status` | Server → Client | Presence update |
| `presence` | Server → Client | Online users list |

## 🔐 Security

- **Password hashing**: scrypt (N=16384, r=8, p=1, 64-byte key)
- **Session tokens**: HMAC-SHA256 signed cookies, HTTP-only, 30-day expiry
- **Rate limiting**: sliding-window per-IP (10 logins/min, 5 registrations/min, 120 API/min)
- **Input validation**: Pydantic schemas + regex validation (username `^[a-zA-Z0-9_]{3,30}$`)
- **Content sanitization**: control char stripping, length limits (10KB messages, 100-char titles)
- **Timing attack prevention**: constant-time password comparison

## ⚙️ Configuration

All settings are environment-driven (twelve-factor compliant). See `.env.example`:

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8001` | Server port |
| `DEBUG` | `False` | Enable debug logging |
| `DB_PATH` | `/home/z/my-project/db/custom.db` | SQLite database path |
| `SESSION_SECRET` | (change me) | HMAC signing secret |
| `COOKIE_NAME` | `tc_session` | Session cookie name |
| `CORS_ORIGINS` | `["*"]` | Allowed CORS origins |

## 🐳 Docker

```bash
docker build -t cryptalk-backend .
docker run -p 8001:8001 -e DB_PATH=/data/cryptalk.db -v cryptalk-data:/data cryptalk-backend
```

## 🧪 Testing

```bash
pip install pytest pytest-asyncio httpx
pytest
```

Services are designed for testability — each receives repositories via constructor injection, making them trivially mockable.

## 📦 Dependencies

- **FastAPI** — async web framework
- **Uvicorn** — ASGI server
- **SQLAlchemy 2.0** — async ORM
- **aiosqlite** — async SQLite driver
- **python-socketio** — WebSocket server
- **Pydantic** + **pydantic-settings** — validation & config
