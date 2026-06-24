import os
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Cryptalk API"
    APP_VERSION: str = "3.0.0"
    HOST: str = "0.0.0.0"
    PORT: int = int(os.environ.get("PORT", "8001"))
    DEBUG: bool = False

    DB_PATH: str = os.environ.get("DB_PATH", "./db/cryptalk.db")

    SESSION_SECRET: str = os.environ.get("SESSION_SECRET", "")
    COOKIE_NAME: str = "tc_session"
    COOKIE_MAX_AGE: int = 2592000

    CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "*")

    SOCKETIO_PING_TIMEOUT: int = 60
    SOCKETIO_PING_INTERVAL: int = 25

    # Redis (Upstash) — for Socket.IO scaling + rate limiting
    # Format: redis://default:password@host:port
    REDIS_URL: str = os.environ.get("REDIS_URL", "")

    # Sentry
    SENTRY_DSN: str = os.environ.get("SENTRY_DSN", "")

    # Supabase (for storage)
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")
    SUPABASE_BUCKET: str = os.environ.get("SUPABASE_BUCKET", "cryptalk")

    # File storage limits — sized for Supabase free tier (1 GB total).
    # Per-file cap keeps any single upload reasonable (matches Telegram's free tier).
    MAX_FILE_SIZE_BYTES: int = int(os.environ.get("MAX_FILE_SIZE_BYTES", 25 * 1024 * 1024))
    # Total storage budget we enforce server-side (leaves headroom under 1 GB).
    STORAGE_QUOTA_BYTES: int = int(os.environ.get("STORAGE_QUOTA_BYTES", 950 * 1024 * 1024))
    # Files older than this (with no live message) are considered orphaned and
    # eligible for cleanup. 24 h gives recipients plenty of time to come online.
    FILE_RETENTION_HOURS: int = int(os.environ.get("FILE_RETENTION_HOURS", 24))

    AVATAR_COLORS: List[str] = [
        "emerald", "violet", "rose", "amber",
        "cyan", "lime", "purple", "teal",
    ]
    AVATAR_ICONS: List[str] = [
        "fox", "cat", "dog", "bird", "fish", "lion", "panda", "unicorn",
        "giraffe", "elephant", "rabbit", "owl", "bear", "frog", "turtle",
        "dolphin", "butterfly", "dragon", "dinosaur", "hedgehog", "parrot",
        "horse", "cow", "chicken", "duck", "crab", "octopus", "jellyfish",
        "snail", "spider", "bat", "deer", "kangaroo", "rhinoceros",
        "hippopotamus", "snake", "lizard", "chameleon", "starfish", "seahorse",
    ]
    CHAT_TYPE_ICONS: dict = {
        "direct": "chat",
        "group": "groups",
        "channel": "megaphone",
        "saved": "bookmark",
    }
    WALLPAPERS: List[str] = ["dots", "gradient", "plain", "grid", "waves"]

    @property
    def database_url(self) -> str:
        raw = os.environ.get("DATABASE_URL", "")
        if raw.startswith("postgresql"):
            if raw.startswith("postgresql://") and not raw.startswith("postgresql+"):
                return raw.replace("postgresql://", "postgresql+asyncpg://", 1)
            return raw
        return f"sqlite+aiosqlite:///{self.DB_PATH}"

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    @property
    def has_redis(self) -> bool:
        return bool(self.REDIS_URL)

    @property
    def has_sentry(self) -> bool:
        return bool(self.SENTRY_DSN)

    @property
    def has_supabase(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_KEY)

    def validate(self) -> None:
        if not self.SESSION_SECRET:
            raise RuntimeError(
                "SESSION_SECRET must be set. Generate one with: openssl rand -hex 32"
            )


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.validate()
    return s


settings = get_settings()
