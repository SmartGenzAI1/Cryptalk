"""Async database engine and session factory.

Uses SQLAlchemy 2.0 async API with aiosqlite for non-blocking I/O.
The engine is created once and shared across all requests via the
``get_session`` dependency.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from app.core.config import settings

# Async engine — ``check_same_thread`` is required for SQLite
engine = create_async_engine(
    settings.database_url,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},
)

# Session factory bound to the engine
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Declarative base for ORM models
Base = declarative_base()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async DB session.


    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db() -> AsyncSession:
    """Alias for ``get_session`` — conventional name in FastAPI projects."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
