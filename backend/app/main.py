"""Cryptalk backend."""

import logging
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import create_engine, Index

from app.api.v1 import api_router
from app.core.config import settings
from app.core.exceptions import (
    DomainError,
    domain_error_handler,
    unhandled_exception_handler,
)
from app.core.rate_limit import RateLimitMiddleware
from app.models import Base, Message, ChatMember, StarredMessage, UserBlock, ConnectionRequest, Report
from app.realtime.connection_manager import manager
from app.realtime.handlers import register_handlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("cryptalk")

if settings.has_sentry:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
    )
    logger.info("Sentry initialized")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.is_postgres:
        sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    else:
        sync_url = f"sqlite:///{settings.DB_PATH}"
    sync_engine = create_engine(sync_url, echo=False)
    Base.metadata.create_all(sync_engine)
    # Ensure hot-path indexes exist (idempotent — CREATE INDEX IF NOT EXISTS).
    # These cover the queries that run on every chat-open / chat-list / search.
    with sync_engine.connect() as conn:
        from sqlalchemy import text
        # Message.chatId + createdAt desc — powers list_for_chat (the main
        # message-history query) and last_messages_for_chats (chat list).
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_message_chat_created "
            "ON \"Message\" (\"chatId\", \"createdAt\" DESC)"
        ))
        # Message.senderId — powers "messages from user X" lookups.
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_message_sender "
            "ON \"Message\" (\"senderId\")"
        ))
        # StarredMessage.userId — powers list_starred.
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_starred_user "
            "ON \"StarredMessage\" (\"userId\", \"createdAt\" DESC)"
        ))
        # ChatMember.userId — powers get_user_chats (the chat list).
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_chatmember_user "
            "ON \"ChatMember\" (\"userId\")"
        ))
        conn.commit()
    sync_engine.dispose()
    logger.info("Database tables + indexes ensured")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# GZip compression — message lists with base64 content can be large; gzip
# typically cuts response size ~70-80% which matters a lot on mobile.  Only
# compresses responses ≥ 500 bytes (smaller ones aren't worth the CPU).
app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_middleware(
    RateLimitMiddleware,
    limits={
        "/api/auth/login": (10, 60),
        "/api/auth/register": (5, 60),
        "/api/": (120, 60),
    },
)

_cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")] if settings.CORS_ORIGINS != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl and int(cl) > 40 * 1024 * 1024:
        # Uploads enforce their own per-file cap inside the handler (25 MB),
        # so let them through the global guard.
        if not request.url.path.startswith("/api/uploads"):
            return JSONResponse(status_code=413, content={"error": "too_large", "message": "Request body exceeds 40MB limit"})
    return await call_next(request)

app.add_exception_handler(DomainError, domain_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(api_router)


@app.get("/")
async def root():
    return {"status": "ok", "service": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "online_users": len(manager.all_online_user_ids()),
        "redis": settings.has_redis,
        "sentry": settings.has_sentry,
    }


sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_timeout=settings.SOCKETIO_PING_TIMEOUT,
    ping_interval=settings.SOCKETIO_PING_INTERVAL,
)

if settings.has_redis:
    try:
        mgr = socketio.AsyncRedisManager(settings.REDIS_URL)
        sio = socketio.AsyncServer(
            async_mode="asgi",
            client_manager=mgr,
            cors_allowed_origins="*",
            ping_timeout=settings.SOCKETIO_PING_TIMEOUT,
            ping_interval=settings.SOCKETIO_PING_INTERVAL,
        )
        logger.info("Socket.IO using Redis adapter for multi-process scaling")
    except Exception as e:
        logger.warning(f"Redis connection failed, falling back to in-memory: {e}")

register_handlers(sio)

asgi_app = socketio.ASGIApp(sio, app)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:asgi_app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )
