# Cryptalk Backend

Python FastAPI backend with clean architecture, Socket.IO realtime, and zero-knowledge E2EE.

## Architecture

```
backend/app/
├── main.py              # ASGI app (FastAPI + Socket.IO)
├── core/
│   ├── config.py        # Settings (env-driven, SQLite/PostgreSQL)
│   ├── database.py      # Async SQLAlchemy engine + sessions
│   ├── security.py      # scrypt, HMAC tokens, input validation
│   ├── exceptions.py    # Domain error hierarchy
│   └── rate_limit.py    # Per-IP rate limiter
├── models/              # ORM entities
├── schemas/             # Pydantic DTOs
├── repositories/        # Data access (User, Chat, Message, Reaction, Starred)
├── services/            # Business logic (auth, chat, message, user)
├── api/v1/
│   ├── auth.py          # Email register/login/onboard
│   ├── chats.py         # Chat CRUD + pin/mute
│   ├── chat_management.py # Leave, delete, kick, invite, search, reports, account deletion
│   ├── messages.py      # Send, edit, delete, react, delivery states
│   ├── social.py        # Connections, blocks, nicknames
│   ├── e2ee.py          # Public key distribution
│   └── users.py         # Profile + search
└── realtime/            # Socket.IO manager + handlers
```

## Quick Start

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # set SESSION_SECRET!
uvicorn app.main:asgi_app --host 0.0.0.0 --port 8001 --reload
```

API docs: `http://localhost:8001/docs`

## Database

Supports SQLite (dev) and PostgreSQL/Supabase (prod). Set `DATABASE_URL` for PostgreSQL:

```
DATABASE_URL=postgresql+asyncpg://postgres:password@db.xxx.supabase.co:5432/postgres
```

See [`supabase/README.md`](../supabase/README.md) for schema setup.

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register | Email + password |
| POST | /api/auth/onboard | Set username |
| POST | /api/auth/login | Email login |
| POST | /api/auth/login-legacy | Username login |
| POST | /api/auth/logout | Sign out |
| GET | /api/auth/me | Current user |

### Chats
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/chats | List chats |
| POST | /api/chats | Create direct/group/channel |
| GET | /api/chats/{id} | Chat details |
| PATCH | /api/chats/{id}/settings | Pin/mute |
| POST | /api/chats/{id}/leave | Leave chat |
| DELETE | /api/chats/{id} | Delete chat |
| POST | /api/chats/{id}/kick | Kick member |
| POST | /api/chats/{id}/promote | Change role |
| POST | /api/chats/{id}/transfer | Transfer ownership |
| POST | /api/chats/{id}/invite | Generate invite link |
| POST | /api/chats/join/{token} | Join via invite |

### Messages
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/{chatId}/messages | List (paginated, searchable) |
| POST | /api/{chatId}/messages | Send (text/sticker/voice/image/file) |
| PATCH | /api/{chatId}/messages | Edit / star |
| DELETE | /api/{chatId}/messages | Delete (for me / for everyone) |
| PUT | /api/{chatId}/messages | Toggle reaction |
| POST | /api/{chatId}/messages/delivered | Mark delivered |
| POST | /api/{chatId}/messages/read | Mark read |

### Social
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/social/connections | List connections |
| GET | /api/social/requests | Pending requests |
| POST | /api/social/connect | Send request |
| POST | /api/social/accept/{id} | Accept |
| POST | /api/social/decline/{id} | Decline |
| POST | /api/social/block | Block user |
| POST | /api/social/unblock | Unblock |
| GET | /api/social/blocked | List blocked |
| POST | /api/social/nickname | Set nickname |
| GET | /api/social/nicknames | List nicknames |

### Other
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/search?q= | Cross-chat search |
| POST | /api/reports | Report user/content |
| DELETE | /api/account | Delete account |
| POST | /api/keys/upload | Upload E2EE public keys |
| GET | /api/keys/{userId} | Get user's public keys |

## Security

- scrypt password hashing
- HMAC-SHA256 session tokens
- Rate limiting (10 logins/min, 120 API/min)
- Input sanitization (HTML escaping, length limits)
- Ephemeral storage (content wiped after delivery)
- SQLAlchemy parameterized queries
