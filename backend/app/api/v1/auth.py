
import re
import secrets

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AuthError, ConflictError, ValidationError
from app.core.security import (
    decrypt_field,
    encrypt_field,
    hash_password,
    lookup_hash,
    now_ms,
    validate_password,
    verify_password,
)
from app.models import User, Chat, ChatMember
from app.services.serializers import serialize_user
from datetime import datetime, timezone

router = APIRouter(prefix="/auth", tags=["auth"])
_CONST_AUTH_DELAY = 0.05  # constant-time padding (seconds)
_JITTER_MIN = 0.010  # 10ms
_JITTER_MAX = 0.050  # 50ms

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,30}$")


async def _constant_time_delay():
    """Uniform delay with random jitter so success and failure are indistinguishable."""
    import asyncio
    jitter = secrets.randbelow(int((_JITTER_MAX - _JITTER_MIN) * 1000)) / 1000.0
    await asyncio.sleep(_CONST_AUTH_DELAY + jitter)

def _validate_email(email: str) -> str:
    email = email.lower().strip()
    if not _EMAIL_RE.match(email):
        raise ValidationError("Invalid email format")
    return email

class EmailRegisterRequest(BaseModel):
    email: str = Field(..., max_length=320)
    password: str = Field(..., max_length=200)
    privacy_consent: bool = Field(...)

class UsernameOnboardingRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    name: str = Field("", min_length=0, max_length=50)

class EmailLoginRequest(BaseModel):
    email: str = Field(..., max_length=320)
    password: str = Field(..., max_length=200)

class LegacyLoginRequest(BaseModel):
    username: str = Field(..., max_length=30)
    password: str = Field(..., max_length=200)


from app.services.auth_service import _set_cookie, AuthService

class PasswordResetRequest(BaseModel):
    email: str = Field(..., max_length=320)

class PasswordResetConfirm(BaseModel):
    token: str = Field(..., max_length=200)
    password: str = Field(..., max_length=200)


@router.post("/onboard")
async def set_username(req: UsernameOnboardingRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    from app.core.security import get_current_user_id
    user_id = get_current_user_id(request)

    username = req.username.lower().strip()
    if not _USERNAME_RE.match(username):
        raise ValidationError("Username must be 3-30 chars: letters, numbers, underscores")

    name = (req.name or "").strip()
    if len(name) > 50:
        raise ValidationError("Display name max 50 chars")

    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise ConflictError("Username taken")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise AuthError("Not authenticated")

    if user.is_onboarded:
        raise ValidationError("Already onboarded")

    user.username = username
    user.name = encrypt_field(name)
    user.is_onboarded = True
    user.updated_at = now_ms()

    saved = Chat(
        id=secrets.token_hex(12),
        type="saved",
        title="Saved Messages",
        created_by=user.id,
        created_at=now_ms(),
        updated_at=now_ms(),
    )
    db.add(saved)
    await db.flush()
    db.add(ChatMember(
        id=secrets.token_hex(12),
        chat_id=saved.id,
        user_id=user.id,
        role="owner",
        joined_at=now_ms(),
        last_read_at=now_ms(),
    ))

    _set_cookie(response, user.id)
    return {"user": serialize_user(user, include_email=True)}

@router.post("/login")
async def login_with_email(req: EmailLoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    await _constant_time_delay()
    input_str = (req.email or "").strip()
    if not input_str:
        raise AuthError("Invalid email or password")

    # brute-force check before hitting the DB
    from app.core.brute_force import is_locked, record_failed_attempt, clear_failures
    lower_input = input_str.lower()
    locked, retry_after = await is_locked(lower_input)
    if locked:
        return JSONResponse(
            status_code=429,
            content={"error": "account_locked", "message": "Too many failed attempts. Try again later.", "retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )

    # Search by email (via keyed lookup digest) OR username (case-insensitive)
    result = await db.execute(
        select(User).where(
            (User.email_lookup == lookup_hash(lower_input)) | (User.username == lower_input)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not await verify_password(req.password, user.password_hash or "x" * 64):
        await record_failed_attempt(lower_input)
        raise AuthError("Invalid email or password")

    await clear_failures(lower_input)
    user.is_online = True
    if user.last_seen_opt_in:
        user.last_seen = now_ms()
    user.updated_at = now_ms()

    _set_cookie(response, user.id)
    return {"user": serialize_user(user, include_email=True)}

@router.post("/login-legacy", include_in_schema=False)
async def login_legacy(req: LegacyLoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    await _constant_time_delay()
    username = req.username.lower().strip()
    from app.core.brute_force import is_locked, record_failed_attempt, clear_failures
    locked, retry_after = await is_locked(username)
    if locked:
        return JSONResponse(
            status_code=429,
            content={"error": "account_locked", "message": "Too many failed attempts. Try again later.", "retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if not user or not await verify_password(req.password, user.password_hash or "x" * 64):
        await record_failed_attempt(username)
        raise AuthError("Invalid username or password")

    await clear_failures(username)
    user.is_online = True
    if user.last_seen_opt_in:
        user.last_seen = now_ms()
    user.updated_at = now_ms()

    _set_cookie(response, user.id)
    return {"user": serialize_user(user, include_email=True)}

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="__Host-tc_session", path="/")
    response.delete_cookie(key=settings.COOKIE_NAME, path="/")
    return {"ok": True}

@router.post("/register")
async def register_with_email(req: EmailRegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    await _constant_time_delay()
    email = _validate_email(req.email)
    validate_password(req.password)

    if not req.privacy_consent:
        raise ValidationError("You must agree to the privacy policy to create an account")

    existing = await db.execute(
        select(User).where(User.email_lookup == lookup_hash(email))
    )
    if existing.scalar_one_or_none():
        raise ConflictError("If this email is not already registered, you will receive a confirmation")

    user = User(
        id=secrets.token_hex(12),
        email=encrypt_field(email),
        email_lookup=lookup_hash(email),
        password_hash=await hash_password(req.password),
        is_online=True,
        created_at=now_ms(),
        updated_at=now_ms(),
        data_retention_consent=True,
    )
    db.add(user)
    await db.flush()

    if settings.EMAIL_VERIFICATION_ENABLED and settings.has_smtp:
        from app.services.email_service import send_verification_email
        verification_token = secrets.token_urlsafe(48)
        user.email_verification_token = verification_token
        await db.flush()
        name = email.split("@")[0]
        send_verification_email(email, name, verification_token)

    _set_cookie(response, user.id)
    return {"user": serialize_user(user, include_email=True)}


@router.get("/verify-email")
async def verify_email(token: str = "", db: AsyncSession = Depends(get_db)):
    if not token:
        from fastapi.responses import HTMLResponse
        return HTMLResponse("<h2>Invalid verification link</h2>", status_code=400)
    result = await db.execute(select(User).where(User.email_verification_token == token))
    user = result.scalar_one_or_none()
    if not user:
        from fastapi.responses import HTMLResponse
        return HTMLResponse("<h2>Invalid or expired verification link</h2>", status_code=400)
    user.is_email_verified = True
    user.email_verification_token = None
    user.updated_at = now_ms()
    await db.flush()
    from fastapi.responses import HTMLResponse
    return HTMLResponse(
        "<html><body style='background:#0B0F17;color:#fff;font-family:sans-serif;text-align:center;padding:80px 20px;'>"
        "<h1 style='color:#10B981;'>Email Verified</h1>"
        "<p>You can close this tab and return to Cryptalk.</p>"
        "</body></html>"
    )


@router.post("/resend-verification")
async def resend_verification(request: Request, db: AsyncSession = Depends(get_db)):
    from app.core.security import get_current_user_id
    user_id = get_current_user_id(request)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.email:
        raise AuthError("No email on file")
    if user.is_email_verified:
        return {"ok": True, "message": "Already verified"}
    if not settings.EMAIL_VERIFICATION_ENABLED or not settings.has_smtp:
        return {"ok": True, "message": "Email verification is not enabled"}
    from app.services.email_service import send_verification_email
    verification_token = secrets.token_urlsafe(48)
    user.email_verification_token = verification_token
    await db.flush()
    plain_email = decrypt_field(user.email)
    name = decrypt_field(user.name) or plain_email.split("@")[0]
    send_verification_email(plain_email, name, verification_token)
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password(req: PasswordResetRequest, db: AsyncSession = Depends(get_db)):
    email = _validate_email(req.email)
    result = await db.execute(
        select(User).where(User.email_lookup == lookup_hash(email))
    )
    user = result.scalar_one_or_none()
    if not user or not user.email:
        return {"ok": True, "message": "If that email is registered, a reset link has been sent."}
    if not settings.has_smtp:
        return {"ok": True, "message": "Password reset is not available right now."}
    token = secrets.token_urlsafe(48)
    expiry = now_ms() + (60 * 60 * 1000)  # 1 hour
    user.password_reset_token = token
    user.password_reset_expires = expiry
    await db.flush()
    from app.services.email_service import send_password_reset_email
    plain_email = decrypt_field(user.email)
    name = decrypt_field(user.name) or plain_email.split("@")[0]
    send_password_reset_email(plain_email, name, token)
    return {"ok": True, "message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(req: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select as sa_select
    result = await db.execute(select(User).where(User.password_reset_token == req.token))
    user = result.scalar_one_or_none()
    if not user:
        raise ValidationError("Invalid or expired reset token")
    if user.password_reset_expires and now_ms() > user.password_reset_expires:
        raise ValidationError("Reset token has expired")
    validate_password(req.password)
    user.password_hash = await hash_password(req.password)
    user.password_reset_token = None
    user.password_reset_expires = None
    user.updated_at = now_ms()
    await db.flush()
    return {"ok": True, "message": "Password has been reset. You can now sign in."}


@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    from app.core.security import get_optional_user_id
    user_id = get_optional_user_id(request)
    if not user_id:
        return {"user": None}
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return {"user": serialize_user(user, include_email=True) if user else None}
