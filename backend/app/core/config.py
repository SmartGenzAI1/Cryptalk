"""Application configuration — type-safe settings via pydantic-settings.

All runtime configuration is read from environment variables with sensible
defaults.  This makes the service twelve-factor compliant and trivially
deployable to any cloud platform.
"""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration loaded from env / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Server ──────────────────────────────────────────────────────────
    APP_NAME: str = "Cryptalk API"
    APP_VERSION: str = "3.0.0"
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    DEBUG: bool = False

    # ── Database ────────────────────────────────────────────────────────
    DB_PATH: str = "/home/z/my-project/db/custom.db"

    # ── Security ────────────────────────────────────────────────────────
    SESSION_SECRET: str = "telegram-clone-secret-key-change-me"
    COOKIE_NAME: str = "tc_session"
    COOKIE_MAX_AGE: int = 60 * 60 * 24 * 30  # 30 days

    # ── CORS ────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = ["*"]

    # ── Realtime ────────────────────────────────────────────────────────
    SOCKETIO_PING_TIMEOUT: int = 60
    SOCKETIO_PING_INTERVAL: int = 25

    # ── Domain defaults ─────────────────────────────────────────────────
    AVATAR_COLORS: List[str] = [
        "emerald", "violet", "rose", "amber",
        "cyan", "lime", "purple", "teal",
    ]
    # Icons8 color-style icon names (https://icons8.com/icon-set/color)
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
        return f"sqlite+aiosqlite:///{self.DB_PATH}"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton — created once per process."""
    return Settings()


settings = get_settings()
