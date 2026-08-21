# cryptalk backend

import logging
import time
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1 import api_router
from app.core.config import settings
from app.core.exceptions import (
    DomainError,
    domain_error_handler,
    unhandled_exception_handler,
)
from app.core.rate_limit import RateLimitMiddleware
from app.middleware.privacy import PrivacyMiddleware
from app.models import Base
from app.realtime.connection_manager import manager
from app.realtime.handlers import register_handlers

_effective_log_level = getattr(logging, settings.MAX_LOG_LEVEL.upper(), logging.WARNING)
if settings.DEBUG and _effective_log_level > logging.INFO:
    _effective_log_level = logging.INFO

import re as _re

logging.basicConfig(
    level=_effective_log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


class _PrivacyFilter(logging.Filter):
    """Redact any PII (emails, usernames, IPs, user IDs) that accidentally reaches loggers."""
    _PATTERNS = [
        (_re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "[EMAIL REDACTED]"),
        (_re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[IP REDACTED]"),
        (_re.compile(r"\buser:\s*[0-9a-f]{8}"), "user: [REDACTED]"),
        (_re.compile(r"\b(?:userId|user_id)[=:]\s*[\"']?[0-9a-f]{8}"), "userId: [REDACTED]"),
    ]

    def __init__(self) -> None:
        super().__init__()

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            for pat, repl in self._PATTERNS:
                record.msg = pat.sub(repl, record.msg)
        return True


logger = logging.getLogger("cryptalk")
logger.addFilter(_PrivacyFilter())

_redis_health_client = None

if settings.has_sentry:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.0,
        profiles_sample_rate=0.0,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.core.database import engine
    from sqlalchemy import text

    logger.info("Database: Supabase PostgreSQL")

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            try:
                await conn.execute(text('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenOptIn" BOOLEAN DEFAULT 0'))
            except Exception:
                pass
            try:
                await conn.execute(text('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "privacySettings" TEXT'))
            except Exception:
                pass
            try:
                await conn.execute(text('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP'))
            except Exception:
                pass
            try:
                await conn.execute(text(
                    'CREATE INDEX IF NOT EXISTS ix_user_last_active_at '
                    'ON "User" ("lastActiveAt")'
                ))
            except Exception:
                pass
            try:
                await conn.execute(text('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dataRetentionConsent" BOOLEAN DEFAULT 0'))
            except Exception:
                pass
            try:
                await conn.execute(text('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailLookup" VARCHAR(64)'))
            except Exception:
                pass
            try:
                await conn.execute(text('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushToken" VARCHAR(1024)'))
            except Exception:
                pass
            try:
                await conn.execute(text('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushPlatform" VARCHAR(16)'))
            except Exception:
                pass
            if settings.is_postgres:
                try:
                    await conn.execute(text('ALTER TABLE "User" ALTER COLUMN "email" TYPE VARCHAR(512)'))
                except Exception:
                    pass

            # one-time backfill: encrypt legacy rows that predate field encryption
            from app.core.security import encrypt_field, lookup_hash
            from app.core.database import async_session_factory
            from app.models import User as UserModel
            from sqlalchemy import or_, select as _sa_select
            try:
                async with async_session_factory() as db:
                    result = await db.execute(
                        _sa_select(UserModel).where(
                            or_(
                                (UserModel.email.isnot(None)) & (UserModel.email_lookup.is_(None)),
                                UserModel.name.notlike("gAAAA%"),
                                UserModel.bio.notlike("gAAAA%"),
                            )
                        )
                    )
                    migrated = 0
                    for u in result.scalars().all():
                        changed = False
                        if u.email and not u.email.startswith("gAAAA"):
                            plain_email = u.email
                            u.email = encrypt_field(plain_email)
                            u.email_lookup = lookup_hash(plain_email)
                            changed = True
                        if u.name and not u.name.startswith("gAAAA"):
                            u.name = encrypt_field(u.name)
                            changed = True
                        if u.bio and not u.bio.startswith("gAAAA"):
                            u.bio = encrypt_field(u.bio)
                            changed = True
                        if getattr(u, "push_token", None) and not u.push_token.startswith("gAAAA"):
                            u.push_token = encrypt_field(u.push_token)
                            changed = True
                        if changed:
                            migrated += 1
                    if migrated:
                        await db.commit()
                        logger.info("Encrypted %d legacy user rows", migrated)
            except Exception:
                logger.warning("Field-encryption backfill skipped (will retry on startup)")

            # Convert standard integer timestamp columns to BIGINT for Postgres compatibility
            if settings.is_postgres:
                for table, col in [
                    ("User", "lastSeen"),
                    ("User", "createdAt"),
                    ("User", "updatedAt"),
                    ("Chat", "createdAt"),
                    ("Chat", "updatedAt"),
                    ("Chat", "expiresAt"),
                    ("ChatMember", "joinedAt"),
                    ("ChatMember", "lastReadAt"),
                    ("ChatMember", "pinnedAt"),
                    ("UserBlock", "createdAt"),
                    ("UserNickname", "createdAt"),
                    ("ConnectionRequest", "createdAt"),
                    ("Report", "createdAt"),
                ]:
                    try:
                        await conn.execute(text(f"ALTER TABLE \"{table}\" ALTER COLUMN \"{col}\" TYPE BIGINT"))
                    except Exception:
                        pass

            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_chatmember_user "
                "ON \"ChatMember\" (\"userId\")"
            ))
        logger.info("Database tables + indexes ensured")
    except Exception:
        logger.error("Database startup initialization skipped (will retry on demand)")

    if settings.has_redis:
        try:
            import redis.asyncio as aioredis
            client = aioredis.from_url(settings.REDIS_URL)
            await client.ping()
            await client.close()
        except Exception as e:
            if settings.is_postgres:
                logger.critical("Redis connection failed in production mode")
                raise RuntimeError("Redis connection failed in production mode")

    # start background media cleanup
    import asyncio
    from app.core.cleanup import start_cleanup_loop, stop_cleanup_loop
    cleanup_task = asyncio.create_task(start_cleanup_loop())
    logger.info(
        "Privacy purge active: users inactive > %d days will be permanently deleted",
        settings.DATA_RETENTION_DAYS,
    )

    yield

    # shutdown
    stop_cleanup_loop()
    cleanup_task.cancel()
    await asyncio.gather(cleanup_task, return_exceptions=True)
    from app.core.storage import StorageService
    await StorageService.close()
    from app.core.database import engine
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# gzip base64 message lists — big wins on mobile
app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_middleware(PrivacyMiddleware)

app.add_middleware(
    RateLimitMiddleware,
    limits={
        "/api/auth/login": (5, 60),
        "/api/auth/register": (3, 300),
        "/api/auth/login-legacy": (5, 60),
        "/health": (10, 60),
        "/api/": (120, 60),
    },
)

_cors_origins_raw = settings.CORS_ORIGINS.strip() if settings.CORS_ORIGINS else ""

if _cors_origins_raw == "*" and settings.is_postgres:
    logger.warning("CORS wildcard '*' is NOT allowed in production — falling back to same-origin")
    _cors_origins_raw = ""

_is_wildcard = _cors_origins_raw == "*"
_cors_origins = [] if _is_wildcard else [
    o.strip().rstrip("/") for o in _cors_origins_raw.split(",") if o.strip()
]

if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )
else:
    # wildcard (dev only) or unset: credentials are never allowed with a wildcard
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if _is_wildcard else [],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] if _is_wildcard else [],
        allow_headers=["Authorization", "Content-Type", "Accept"] if _is_wildcard else [],
    )

@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl:
        try:
            cl_int = int(cl)
        except (ValueError, TypeError):
            return JSONResponse(status_code=400, content={"error": "bad_content_length"})
        if cl_int > 4 * 1024 * 1024:
            # uploads enforce their own cap inside the handler
            if not request.url.path.startswith("/api/uploads"):
                return JSONResponse(status_code=413, content={"error": "too_large", "message": "Request body exceeds 4MB limit"})
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
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), interest-cohort=()"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    response.headers["X-DNS-Prefetch-Control"] = "off"
    response.headers["X-Download-Options"] = "noopen"
    hsts_max = settings.HSTS_MAX_AGE
    if hsts_max > 0:
        response.headers["Strict-Transport-Security"] = f"max-age={hsts_max}; includeSubDomains; preload"
    return response

app.include_router(api_router)


@app.get("/")
async def root():
    return {"status": "ok", "service": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/health")
async def health():
    from app.core.database import engine
    from sqlalchemy import text
    db_ok = False
    redis_ok = True
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        logger.error("Health check: DB connection failed")

    if settings.has_redis:
        global _redis_health_client
        try:
            import redis.asyncio as aioredis
            if _redis_health_client is None:
                _redis_health_client = aioredis.from_url(settings.REDIS_URL)
            await _redis_health_client.ping()
        except Exception:
            logger.error("Health check: Redis connection failed")
            _redis_health_client = None
            redis_ok = False

    healthy = db_ok and redis_ok
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "healthy" if healthy else "unhealthy",
            "database": "connected" if db_ok else "disconnected",
            "version": settings.APP_VERSION,
            "uptime": round(time.time() - _START_TIME, 2),
        },
    )


@app.get("/db-status")
async def db_status():
    if not settings.DEBUG:
        return JSONResponse(status_code=403, content={"error": "only available in DEBUG mode"})
    from app.core.database import get_database_info
    info = await get_database_info()
    return info


# Restrict Socket.IO origins to CORS_ORIGINS settings in production
socketio_cors = "*" if _is_wildcard else _cors_origins

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=socketio_cors,
    ping_timeout=settings.SOCKETIO_PING_TIMEOUT,
    ping_interval=settings.SOCKETIO_PING_INTERVAL,
)

if settings.has_redis:
    try:
        mgr = socketio.AsyncRedisManager(settings.REDIS_URL)
        sio = socketio.AsyncServer(
            async_mode="asgi",
            client_manager=mgr,
            cors_allowed_origins=socketio_cors,
            ping_timeout=settings.SOCKETIO_PING_TIMEOUT,
            ping_interval=settings.SOCKETIO_PING_INTERVAL,
        )
    except Exception as e:
        if settings.is_postgres:
            logger.critical("Redis adapter initialization failed in production")
            raise RuntimeError("Redis adapter initialization failed in production")
        logger.warning("Redis connection failed, falling back to in-memory")

register_handlers(sio)

from app.realtime.handlers import manager
app.state.sio = sio
app.state.sio_manager = manager

asgi_app = socketio.ASGIApp(sio, app)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:asgi_app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=1,
        log_level="warning",
        no_access_log=True,
    )
