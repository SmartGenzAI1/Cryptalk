from typing import AsyncGenerator

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
if not settings.is_postgres:
    _connect_args = {"check_same_thread": False}
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

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()



async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
