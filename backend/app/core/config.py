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

    # Neon DB (serverless PostgreSQL) — the only database option
    NEON_DATABASE_URL: str = os.environ.get("NEON_DATABASE_URL", "")
    NEON_POOL_SIZE: int = 2
    NEON_MAX_OVERFLOW: int = 1
    NEON_SSL_MODE: str = "require"

    SESSION_SECRET: str = os.environ.get("SESSION_SECRET", "CHANGE_ME_IN_PRODUCTION")
    COOKIE_NAME: str = "tc_session"
    COOKIE_MAX_AGE: int = 2592000  # 30 days

    # cleanup intervals (seconds) — configurable for privacy tuning
    CLEANUP_INTERVAL_SECONDS: int = int(os.environ.get("CLEANUP_INTERVAL_SECONDS", 0))  # 0 = auto

    CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "http://localhost:3000")

    SOCKETIO_PING_TIMEOUT: int = 60
    SOCKETIO_PING_INTERVAL: int = 25

    # redis (upstash) — socket.io scaling + rate limiting
    REDIS_URL: str = os.environ.get("REDIS_URL", "")

    # sentry
    SENTRY_DSN: str = os.environ.get("SENTRY_DSN", "")

    # email (SMTP)
    SMTP_HOST: str = os.environ.get("SMTP_HOST", "")
    SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USER: str = os.environ.get("SMTP_USER", "")
    SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "")
    SMTP_FROM_EMAIL: str = os.environ.get("SMTP_FROM_EMAIL", "")
    SMTP_USE_TLS: bool = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"
    EMAIL_VERIFICATION_ENABLED: bool = os.environ.get("EMAIL_VERIFICATION_ENABLED", "false").lower() == "true"

    WELCOME_CHANNEL_ID: str = os.environ.get("WELCOME_CHANNEL_ID", "welcome-channel")

    # supabase (for storage)
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")
    SUPABASE_BUCKET: str = os.environ.get("SUPABASE_BUCKET", "cryptalk")

    # file storage limits — sized for supabase free tier (1 GB total)
    MAX_FILE_SIZE_BYTES: int = int(os.environ.get("MAX_FILE_SIZE_BYTES", 25 * 1024 * 1024))
    STORAGE_QUOTA_BYTES: int = int(os.environ.get("STORAGE_QUOTA_BYTES", 950 * 1024 * 1024))
    FILE_RETENTION_HOURS: int = int(os.environ.get("FILE_RETENTION_HOURS", 1))

    MAX_GROUPS_PER_USER: int = 50
    MAX_CHANNELS_PER_USER: int = 20
    MAX_MEMBERS_PER_GROUP: int = 256

    OFFLINE_QUEUE_TTL: int = 86400  # 24h in seconds

    # push notifications — payloads must never contain message content
    PUSH_NOTIFICATIONS_ENABLED: bool = os.environ.get("PUSH_NOTIFICATIONS_ENABLED", "false").lower() in ("true", "1", "yes")

    # privacy settings
    DATA_RETENTION_DAYS: int = int(os.environ.get("DATA_RETENTION_DAYS", 90))
    MAX_LOG_LEVEL: str = os.environ.get("MAX_LOG_LEVEL", "WARNING")
    PRIVACY_MODE: bool = os.environ.get("PRIVACY_MODE", "true").lower() in ("true", "1", "yes")

    # minimal data collection
    MINIMAL_DATA_COLLECTION: bool = os.environ.get("MINIMAL_DATA_COLLECTION", "true").lower() in ("true", "1", "yes")
    ANONYMIZE_LOGS: bool = os.environ.get("ANONYMIZE_LOGS", "true").lower() in ("true", "1", "yes")
    STRIP_FILE_METADATA: bool = os.environ.get("STRIP_FILE_METADATA", "true").lower() in ("true", "1", "yes")

    # anti-surveillance
    ENABLE_DNS_OVER_HTTPS: bool = os.environ.get("ENABLE_DNS_OVER_HTTPS", "true").lower() in ("true", "1", "yes")
    FORCE_HTTPS: bool = os.environ.get("FORCE_HTTPS", "true").lower() in ("true", "1", "yes")
    HSTS_MAX_AGE: int = int(os.environ.get("HSTS_MAX_AGE", "63072000"))

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
        neon_raw = self.NEON_DATABASE_URL.strip()
        if not neon_raw:
            raise RuntimeError(
                "NEON_DATABASE_URL is required. Get one at neon.tech — free tier works great. "
                "Example: postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/cryptalk?sslmode=require"
            )
        if neon_raw.startswith("postgresql://") and not neon_raw.startswith("postgresql+"):
            return neon_raw.replace("postgresql://", "postgresql+asyncpg://", 1)
        if neon_raw.startswith("postgres://"):
            return neon_raw.replace("postgres://", "postgresql+asyncpg://", 1)
        return neon_raw

    @property
    def is_postgres(self) -> bool:
        return True  # always True — Neon is PostgreSQL

    @property
    def is_neon(self) -> bool:
        return True  # always True — Neon is the only DB option

    @property
    def has_redis(self) -> bool:
        return bool(self.REDIS_URL)

    @property
    def has_sentry(self) -> bool:
        return bool(self.SENTRY_DSN)

    @property
    def has_smtp(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_USER and self.SMTP_PASSWORD)

    @property
    def has_supabase(self) -> bool:
        url = (self.SUPABASE_URL or "").strip()
        key = (self.SUPABASE_KEY or "").strip()
        if not url or not key or "dummy" in url.lower() or not (url.startswith("http://") or url.startswith("https://")):
            return False
        return True

    def validate(self) -> None:
        if not self.SESSION_SECRET or len(self.SESSION_SECRET) < 32:
            raise RuntimeError(
                "SESSION_SECRET must be set and at least 32 characters. Generate one with: openssl rand -hex 32"
            )
        assert self.SESSION_SECRET != "CHANGE_ME_IN_PRODUCTION", "SESSION_SECRET must be changed from the default sentinel"
        if self.COOKIE_MAX_AGE > 2592000:
            self.COOKIE_MAX_AGE = 2592000
        if self.PRIVACY_MODE and self.DATA_RETENTION_DAYS > 90:
            self.DATA_RETENTION_DAYS = 90
        if not self.NEON_DATABASE_URL.strip():
            raise RuntimeError(
                "NEON_DATABASE_URL is required. Get one free at neon.tech"
            )
        if self.SENTRY_DSN and not (self.SENTRY_DSN.startswith("http://") or self.SENTRY_DSN.startswith("https://")):
            raise RuntimeError("SENTRY_DSN must be a valid HTTP/HTTPS URL.")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.validate()
    return s


settings = get_settings()
