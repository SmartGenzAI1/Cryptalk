from typing import AsyncGenerator, Dict, Any

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from app.core.config import settings

_connect_args = {
    "ssl": "require",
}
_engine_kwargs = {
    "echo": settings.DEBUG,
    "pool_pre_ping": True,
    "pool_size": settings.NEON_POOL_SIZE,
    "max_overflow": settings.NEON_MAX_OVERFLOW,
    "pool_timeout": 30,
    "pool_recycle": 300,
}

engine = create_async_engine(
    settings.database_url,
    connect_args=_connect_args,
    **_engine_kwargs,
)

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
    pool = engine.pool
    status = {
        "database_type": "Neon (serverless PostgreSQL)",
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
