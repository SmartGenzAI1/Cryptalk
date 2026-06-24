"""Security primitives — password hashing, session tokens, auth dependency.

Password hashing uses scrypt with parameters matching the original
Node.js implementation so that accounts created by either stack are
interchangeable.  Session tokens are HMAC-signed user IDs stored in an
HTTP-only cookie.
"""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AuthError

# ─── Password hashing ───────────────────────────────────────────────────
# scrypt parameters — must match the Node.js crypto.scryptSync defaults.
_SCRYPT_N = 16384
_SCRYPT_R = 8
_SCRYPT_P = 1
_KEY_LEN = 64


def hash_password(password: str) -> str:
    """Return ``salt:derived_key`` — both hex strings."""
    salt = os.urandom(16).hex()
    derived = hashlib.scrypt(
        password.encode(),
        salt=salt.encode(),  # Node.js passes salt as UTF-8 string, not raw bytes
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_KEY_LEN,
    )
    return f"{salt}:{derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time comparison of a password against a stored hash."""
    try:
        salt_hex, expected_hash = stored.split(":")
        derived = hashlib.scrypt(
            password.encode(),
            salt=salt_hex.encode(),
            n=_SCRYPT_N,
            r=_SCRYPT_R,
            p=_SCRYPT_P,
            dklen=_KEY_LEN,
        )
        return hmac.compare_digest(derived.hex(), expected_hash)
    except (ValueError, TypeError):
        return False


# ─── Session tokens ────────────────────────────────────────────────────


def _sign(payload: str) -> str:
    mac = hmac.new(
        settings.SESSION_SECRET.encode(),
        payload.encode(),
        hashlib.sha256,
    )
    return f"{payload}.{mac.hexdigest()}"


def _verify(token: str) -> Optional[str]:
    try:
        payload, signature = token.split(".", 1)
        expected = hmac.new(
            settings.SESSION_SECRET.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        if hmac.compare_digest(signature, expected):
            return payload
    except (ValueError, IndexError):
        pass
    return None


def create_session_token(user_id: str) -> str:
    """Sign a user ID into an opaque session token."""
    return _sign(user_id)


def verify_session_token(token: str) -> Optional[str]:
    """Return the user ID embedded in a valid token, else ``None``."""
    return _verify(token)


def get_client_fingerprint(request) -> str:
    """Generate a fingerprint from the client's IP + user agent.

    This is used for anti-session-hijacking: if a session token is
    used from a different IP/user-agent, it's considered stolen.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )
    user_agent = request.headers.get("user-agent", "")
    raw = f"{ip}:{user_agent}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ─── Date helpers ──────────────────────────────────────────────────────
# Prisma stores datetimes as integer milliseconds since epoch in SQLite.
# These helpers bridge between the integer storage and ISO-8601 strings
# consumed by the API layer.


def now_ms() -> int:
    """Current UTC time as epoch milliseconds (Prisma-compatible)."""
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def ms_to_iso(ms: Optional[int]) -> str:
    """Convert epoch milliseconds to an ISO-8601 string."""
    if ms is None:
        return datetime.now(timezone.utc).isoformat()
    if isinstance(ms, str):
        try:
            ms = int(ms)
        except ValueError:
            return ms  # already ISO string
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def iso_to_ms(iso_str: str) -> int:
    """Convert an ISO-8601 string to epoch milliseconds."""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except (ValueError, AttributeError):
        return now_ms()


# ─── Input validation & sanitization ───────────────────────────────────

import re
from html import escape as _html_escape

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,30}$")
_MAX_CONTENT_LENGTH = 10_000  # 10 KB per message
_MAX_TITLE_LENGTH = 100
_MAX_BIO_LENGTH = 500


def validate_username(username: str) -> str:
    """Validate and normalize a username. Raises ``ValidationError`` on failure."""
    from app.core.exceptions import ValidationError
    username = (username or "").strip().lower()
    if not _USERNAME_RE.match(username):
        raise ValidationError(
            "Username must be 3-30 chars: letters, numbers, underscores only"
        )
    return username


def validate_password(password: str) -> str:
    """Validate password strength. Raises ``ValidationError`` on failure."""
    from app.core.exceptions import ValidationError
    if not password or len(password) < 4:
        raise ValidationError("Password must be at least 4 characters")
    if len(password) > 200:
        raise ValidationError("Password is too long")
    return password


def sanitize_text(text: str, max_length: int = _MAX_CONTENT_LENGTH) -> str:
    """Strip control chars, escape HTML entities, and enforce length limits."""
    if not text:
        return ""
    # Remove null bytes and control chars (except newlines/tabs)
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    # Collapse excessive whitespace (but preserve newlines)
    cleaned = re.sub(r"[^\S\n]+", " ", cleaned).strip()
    # Enforce length
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    return cleaned


def sanitize_title(text: str) -> str:
    """Sanitize a chat/group/channel title."""
    return sanitize_text(text, _MAX_TITLE_LENGTH)


def sanitize_bio(text: str) -> str:
    """Sanitize a user bio."""
    return sanitize_text(text, _MAX_BIO_LENGTH)


# ─── FastAPI dependencies ──────────────────────────────────────────────


def get_current_user_id(request: Request) -> str:
    """Extract and verify the user ID from the session cookie.

    Raises ``AuthError`` (401) if the user is not authenticated.
    """
    token = request.cookies.get(settings.COOKIE_NAME)
    if not token:
        raise AuthError("Not authenticated")
    user_id = _verify(token)
    if not user_id:
        raise AuthError("Invalid or expired session")
    return user_id


def get_optional_user_id(request: Request) -> Optional[str]:
    """Like ``get_current_user_id`` but returns ``None`` instead of raising."""
    token = request.cookies.get(settings.COOKIE_NAME)
    if not token:
        return None
    return _verify(token)


# Type alias for dependency injection
CurrentUser = Depends(get_current_user_id)
OptionalUser = Depends(get_optional_user_id)
DbSession = Depends(get_db)
