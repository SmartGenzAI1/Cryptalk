# cryptalk backend

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
    # hot-path indexes (idempotent)
    with sync_engine.connect() as conn:
        from sqlalchemy import text
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_message_chat_created "
            "ON \"Message\" (\"chatId\", \"createdAt\" DESC)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_message_sender "
            "ON \"Message\" (\"senderId\")"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_starred_user "
            "ON \"StarredMessage\" (\"userId\", \"createdAt\" DESC)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_chatmember_user "
            "ON \"ChatMember\" (\"userId\")"
        ))
        conn.commit()
    sync_engine.dispose()
    logger.info("Database tables + indexes ensured")
    yield
    # close pooled supabase http client on shutdown
    from app.core.storage import StorageService
    await StorageService.close()
    logger.info("Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# gzip base64 message lists — big wins on mobile
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
    if cl:
        try:
            cl_int = int(cl)
        except (ValueError, TypeError):
            return JSONResponse(status_code=400, content={"error": "bad_content_length"})
        if cl_int > 40 * 1024 * 1024:
            # uploads enforce their own cap inside the handler
            if not request.url.path.startswith("/api/uploads"):
                return JSONResponse(status_code=413, content={"error": "too_large", "message": "Request body exceeds 40MB limit"})
    return await call_next(request)

app.add_exception_handler(DomainError, domain_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# json 404/405 instead of fastapi's default html
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse as _JSONResponse


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return _JSONResponse(status_code=404, content={"error": "not_found", "message": "Resource not found"})


@app.exception_handler(405)
async def method_not_allowed_handler(request: Request, exc):
    return _JSONResponse(status_code=405, content={"error": "method_not_allowed", "message": "Method not allowed for this endpoint"})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # don't leak pydantic schema internals
    return _JSONResponse(
        status_code=422,
        content={"error": "validation_error", "message": "Invalid request data"},
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # hsts only in prod (https)
    if settings.is_postgres:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    return response

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
