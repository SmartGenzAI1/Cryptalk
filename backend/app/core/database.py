from typing import AsyncGenerator, Dict, Any

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from app.core.config import settings

_connect_args = {}
_engine_kwargs = {
    "echo": settings.DEBUG,
    "pool_pre_ping": True,
}

if settings.is_neon:
    _connect_args = {
        "ssl": "require",
    }
    _engine_kwargs["pool_size"] = settings.NEON_POOL_SIZE
    _engine_kwargs["max_overflow"] = settings.NEON_MAX_OVERFLOW
    _engine_kwargs["pool_timeout"] = 30
    _engine_kwargs["pool_recycle"] = 300
elif not settings.is_postgres:
    _connect_args = {"check_same_thread": False}
    _engine_kwargs["pool_size"] = 5
    _engine_kwargs["max_overflow"] = 10
    _engine_kwargs["pool_timeout"] = 30
    _engine_kwargs["pool_recycle"] = 1800
else:
    # tuned for Render free tier + Supabase pgbouncer in transaction mode
    _connect_args = {
        "statement_cache_size": 0,
    }
    _engine_kwargs["pool_size"] = 10
    _engine_kwargs["max_overflow"] = 20
    _engine_kwargs["pool_timeout"] = 30
    _engine_kwargs["pool_recycle"] = 300

engine = create_async_engine(
    settings.database_url,
    connect_args=_connect_args,
    **_engine_kwargs,
)

if not settings.is_postgres:
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode = WAL")
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("PRAGMA busy_timeout = 5000")
        cursor.close()

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()



async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            if session.is_active:
                await session.commit()
        except Exception:
            if session.is_active:
                await session.rollback()
            raise
        finally:
            await session.close()


async def dispose_engine() -> None:
    await engine.dispose()


async def test_connection() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def get_database_info() -> Dict[str, Any]:
    url = settings.database_url
    db_type = "SQLite"
    if settings.is_neon:
        db_type = "Neon (serverless PostgreSQL)"
    elif settings.is_postgres:
        db_type = "PostgreSQL"

    pool = engine.pool
    status = {
        "database_type": db_type,
        "connected": False,
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
    }
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        status["connected"] = True
    except Exception:
        status["connected"] = False
    return status
