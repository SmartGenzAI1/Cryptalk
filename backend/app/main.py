"""Cryptalk backend."""

import logging
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine

from app.api.v1 import api_router
from app.core.config import settings
from app.core.exceptions import (
    DomainError,
    domain_error_handler,
    unhandled_exception_handler,
)
from app.core.rate_limit import RateLimitMiddleware
from app.models import Base
from app.realtime.connection_manager import manager
from app.realtime.handlers import register_handlers

# ─── Logging ───────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("cryptalk")


# ─── Lifespan — startup & shutdown ─────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup (SQLite auto-creates the file)."""
    sync_url = f"sqlite:///{settings.DB_PATH}"
    sync_engine = create_engine(sync_url, echo=False)
    Base.metadata.create_all(sync_engine)
    sync_engine.dispose()
    logger.info("Database tables ensured")
    yield
    logger.info("Shutting down...")


# ─── FastAPI app ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── Middleware (order matters: outermost first) ───────────────────────
# Rate limiting — protects against brute force & flooding
app.add_middleware(
    RateLimitMiddleware,
    limits={
        "/api/auth/login": (10, 60),       # 10 login attempts / minute
        "/api/auth/register": (5, 60),      # 5 registrations / minute
        "/api/": (120, 60),                 # 120 general API calls / minute
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

# Register exception handlers
app.add_exception_handler(DomainError, domain_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Register API v1 routes
app.include_router(api_router)


# ─── Health checks ─────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"status": "ok", "service": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "online_users": len(manager.all_online_user_ids()),
    }


# ─── Socket.IO server ──────────────────────────────────────────────────
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_timeout=settings.SOCKETIO_PING_TIMEOUT,
    ping_interval=settings.SOCKETIO_PING_INTERVAL,
)
register_handlers(sio)

# Combine FastAPI + Socket.IO into a single ASGI app
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
