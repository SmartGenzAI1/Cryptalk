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

def _scrypt_sync(password: str, salt_hex: str) -> bytes:
    return hashlib.scrypt(
        password.encode(),
        salt=salt_hex.encode(),
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_KEY_LEN,
    )

async def hash_password(password: str) -> str:
    import asyncio
    salt = os.urandom(16).hex()
    derived = await asyncio.to_thread(_scrypt_sync, password, salt)
    return f"{salt}:{derived.hex()}"

_DUMMY_SALT = "00" * 16

async def verify_password(password: str, stored: str | None) -> bool:
    import asyncio
    if not stored or ":" not in stored:
        # Constant-time dummy pass to prevent account enumeration timing attacks
        await asyncio.to_thread(
            _scrypt_sync, (password or ""), _DUMMY_SALT
        )
        return False

    try:
        salt_hex, expected_hash = stored.split(":", 1)
        derived = await asyncio.to_thread(_scrypt_sync, password, salt_hex)
        return hmac.compare_digest(derived.hex(), expected_hash)
    except (ValueError, TypeError):
        await asyncio.to_thread(
            _scrypt_sync, (password or ""), _DUMMY_SALT
        )
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
    # Embed millisecond expiry timestamp + random nonce for single-use tracking
    expiry = now_ms() + (settings.COOKIE_MAX_AGE * 1000)
    nonce = secrets.token_hex(16)  # 32-byte random nonce
    payload = f"{user_id}:{expiry}:{nonce}"
    return _sign(payload)

def verify_session_token(token: str) -> Optional[str]:
    payload = _verify(token)
    if not payload:
        return None
    try:
        parts = payload.split(":")
        if len(parts) != 3:
            return None
        user_id, expiry_str, nonce = parts
        expiry = int(expiry_str)
        if now_ms() > expiry:
            return None  # Token expired
        if len(nonce) < 32:
            return None  # Nonce too short (backward compat: reject legacy tokens)
        return user_id
    except (ValueError, IndexError):
        return None

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
            raise ValueError(f"Cannot convert string '{ms}' to timestamp")
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
    if not password or len(password) < 8:
        raise ValidationError("Password must be at least 8 characters")
    if len(password) > 200:
        raise ValidationError("Password is too long")
    return password

def sanitize_text(text: str, max_length: int = _MAX_CONTENT_LENGTH) -> str:
    if not text:
        return ""
    # strip control chars but don't HTML-encode — content is E2EE ciphertext,
    # the client decrypts and renders it, server never interprets it as HTML
    cleaned = re.sub(r"[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]", "", text)
    cleaned = re.sub(r"[^\S\n]+", " ", cleaned).strip()
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    return cleaned

def sanitize_title(text: str) -> str:

    return sanitize_text(text, _MAX_TITLE_LENGTH)

def sanitize_bio(text: str) -> str:
    return sanitize_text(text, _MAX_BIO_LENGTH)

_DANGEROUS_EXTENSIONS = frozenset({
    "php", "php3", "php4", "php5", "php7", "phtml", "pht", "phps",
    "cgi", "pl", "py", "pyc", "pyo", "sh", "bash", "csh", "ksh",
    "asp", "aspx", "asa", "asax", "ascx", "ashx", "asmx",
    "jsp", "jspx", "jsw", "jsv", "jspf", "jtml",
    "bat", "cmd", "com", "exe", "scr", "pif", "msi", "msp",
    "dll", "sys", "cpl", "hta", "vbs", "vbe", "wsf", "wsh",
    "ps1", "psm1", "psd1", "psc1", "psc2",
    "shtml", "stm", "htaccess", "htpasswd",
    "config", "ini", "env", "htpasswd",
})


def sanitize_filename(filename: str) -> str:
    if not filename:
        return "file"
    # prevent directory traversal, control characters, and malformed names
    clean_name = os.path.basename(filename.replace("\\", "/"))
    clean_name = re.sub(r"[^\w\.\-]", "_", clean_name)
    clean_name = clean_name.lstrip(".")
    # block double extensions that could bypass content-type filtering
    parts = clean_name.split(".")
    if len(parts) > 2:
        ext = parts[-1].lower()
        if ext in _DANGEROUS_EXTENSIONS:
            clean_name = ".".join(parts[:-1])
    return clean_name[:150] or "file"

# fastapi dependencies

def get_current_user_id(request: Request) -> str:
    token = request.cookies.get("__Host-tc_session") or request.cookies.get(settings.COOKIE_NAME)
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
    token = request.cookies.get("__Host-tc_session") or request.cookies.get(settings.COOKIE_NAME)
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

# field-level encryption at rest (Fernet / AES-128-CBC + HMAC)

from cryptography.fernet import Fernet
import base64

_encryption_key_cache = None


def _get_encryption_key():
    global _encryption_key_cache
    if _encryption_key_cache is None:
        key_material = hashlib.pbkdf2_hmac(
            'sha256', settings.SESSION_SECRET.encode(), b'cryptalk-enc-v1', 100000
        )
        _encryption_key_cache = base64.urlsafe_b64encode(key_material[:32])
    return _encryption_key_cache


def encrypt_field(plaintext: str) -> str:
    if not plaintext:
        return plaintext
    f = Fernet(_get_encryption_key())
    return f.encrypt(plaintext.encode()).decode()


def decrypt_field(ciphertext: str) -> str:
    if not ciphertext:
        return ciphertext
    try:
        f = Fernet(_get_encryption_key())
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        return ciphertext


def encrypt_json(data: dict) -> str:
    import json
    return encrypt_field(json.dumps(data))


def decrypt_json(ciphertext: str) -> dict:
    import json
    try:
        return json.loads(decrypt_field(ciphertext))
    except Exception:
        return {}


# deterministic keyed digest for equality lookups on encrypted columns.
# Fernet ciphertext is randomized per call, so encrypted values cannot be
# compared in SQL; equality searches use this keyed hash instead.

_lookup_key_cache = None


def _get_lookup_key() -> bytes:
    global _lookup_key_cache
    if _lookup_key_cache is None:
        _lookup_key_cache = hashlib.pbkdf2_hmac(
            'sha256', settings.SESSION_SECRET.encode(), b'cryptalk-lookup-v1', 100000
        )
    return _lookup_key_cache


def lookup_hash(value: str) -> str:
    if not value:
        return ""
    return hmac.new(
        _get_lookup_key(), value.strip().lower().encode(), hashlib.sha256
    ).hexdigest()
