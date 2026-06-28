# security: scrypt hashing, HMAC tokens, input validation

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

# password hashing
# scrypt params must match node.js crypto.scryptSync defaults
_SCRYPT_N = 16384
_SCRYPT_R = 8
_SCRYPT_P = 1
_KEY_LEN = 64

def hash_password(password: str) -> str:

    salt = os.urandom(16).hex()
    derived = hashlib.scrypt(
        password.encode(),
        salt=salt.encode(),  # node.js passes salt as UTF-8 string, not raw bytes
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_KEY_LEN,
    )
    return f"{salt}:{derived.hex()}"

def verify_password(password: str, stored: str) -> bool:

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

# session tokens

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
    # Embed millisecond expiry timestamp based on cookie settings
    expiry = now_ms() + (settings.COOKIE_MAX_AGE * 1000)
    payload = f"{user_id}:{expiry}"
    return _sign(payload)

def verify_session_token(token: str) -> Optional[str]:
    payload = _verify(token)
    if not payload:
        return None
    try:
        user_id, expiry_str = payload.rsplit(":", 1)
        expiry = int(expiry_str)
        if now_ms() > expiry:
            return None  # Token expired
        return user_id
    except (ValueError, IndexError):
        # Enforce strict validation: invalid or legacy tokens without expiry are rejected
        return None

def get_client_fingerprint(request) -> str:

    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )
    user_agent = request.headers.get("user-agent", "")
    raw = f"{ip}:{user_agent}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]

# date helpers
# prisma stores datetimes as int millis since epoch in sqlite.
# these bridge between int storage and ISO-8601 strings the api layer wants.

def now_ms() -> int:

    return int(datetime.now(timezone.utc).timestamp() * 1000)

def ms_to_iso(ms: Optional[int]) -> str:

    if ms is None:
        return datetime.now(timezone.utc).isoformat()
    if isinstance(ms, str):
        try:
            ms = int(ms)
        except ValueError:
            return ms  # already ISO string
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()

def iso_to_ms(iso_str: str) -> int:

    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except (ValueError, AttributeError):
        return now_ms()

# input validation & sanitization

import re

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,30}$")
_HEX_ID_RE = re.compile(r"^[a-f0-9]{24}$")
_MAX_CONTENT_LENGTH = 10_000
_MAX_TITLE_LENGTH = 100
_MAX_BIO_LENGTH = 500

def escape_like(value: str) -> str:
    # prevent LIKE/ILIKE injection — escape %, _, and \ so they match literally
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

def validate_hex_id(value: str) -> bool:
    if not value or not isinstance(value, str):
        return False
    return bool(_HEX_ID_RE.match(value))

def validate_username(username: str) -> str:
    from app.core.exceptions import ValidationError
    username = (username or "").strip().lower()
    if not _USERNAME_RE.match(username):
        raise ValidationError(
            "Username must be 3-30 chars: letters, numbers, underscores only"
        )
    return username

def validate_password(password: str) -> str:
    from app.core.exceptions import ValidationError
    if not password or len(password) < 6:
        raise ValidationError("Password must be at least 6 characters")
    if len(password) > 200:
        raise ValidationError("Password is too long")
    return password

def sanitize_text(text: str, max_length: int = _MAX_CONTENT_LENGTH) -> str:
    if not text:
        return ""
    # strip control chars but don't HTML-encode — content is E2EE ciphertext,
    # the client decrypts and renders it, server never interprets it as HTML
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    cleaned = re.sub(r"[^\S\n]+", " ", cleaned).strip()
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    return cleaned

def sanitize_title(text: str) -> str:

    return sanitize_text(text, _MAX_TITLE_LENGTH)

def sanitize_bio(text: str) -> str:

    return sanitize_text(text, _MAX_BIO_LENGTH)

# fastapi dependencies

def get_current_user_id(request: Request) -> str:
    token = request.cookies.get(settings.COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise AuthError("Not authenticated")
    user_id = verify_session_token(token)
    if not user_id:
        raise AuthError("Invalid or expired session")
    return user_id

def get_optional_user_id(request: Request) -> Optional[str]:
    token = request.cookies.get(settings.COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    return verify_session_token(token)

# type aliases for DI
CurrentUser = Depends(get_current_user_id)
OptionalUser = Depends(get_optional_user_id)
DbSession = Depends(get_db)
