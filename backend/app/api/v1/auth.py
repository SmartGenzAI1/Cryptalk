
import re
import secrets

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AuthError, ConflictError, ValidationError
from app.core.security import (
    create_session_token,
    hash_password,
    now_ms,
    validate_password,
    verify_password,
)
from app.models import User, Chat, ChatMember
from app.services.serializers import serialize_user

router = APIRouter(prefix="/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,30}$")

def _validate_email(email: str) -> str:
    email = email.lower().strip()
    if not _EMAIL_RE.match(email):
        raise ValidationError("Invalid email format")
    return email

class EmailRegisterRequest(BaseModel):
    email: str
    password: str

class UsernameOnboardingRequest(BaseModel):
    username: str
    name: str

class EmailLoginRequest(BaseModel):
    email: str
    password: str

class LegacyLoginRequest(BaseModel):
    username: str
    password: str


def _set_cookie(response: Response, user_id: str) -> None:
    token = create_session_token(user_id)
    is_prod = settings.is_postgres
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="none" if is_prod else "lax",
        max_age=settings.COOKIE_MAX_AGE,
        path="/",
    )

@router.post("/register")
async def register_with_email(req: EmailRegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    email = _validate_email(req.email)
    validate_password(req.password)

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise ConflictError("Email already registered")

    user = User(
        id=secrets.token_hex(12),
        email=email,
        password_hash=hash_password(req.password),
        is_online=True,
        last_seen=now_ms(),
        created_at=now_ms(),
        updated_at=now_ms(),
    )
    db.add(user)
    await db.flush()

    token = create_session_token(user.id)
    _set_cookie(response, user.id)
    return {"user": serialize_user(user), "token": token}

@router.post("/onboard")
async def set_username(req: UsernameOnboardingRequest, request: Request, db: AsyncSession = Depends(get_db)):
    from app.core.security import get_current_user_id
    user_id = get_current_user_id(request)

    username = req.username.lower().strip()
    if not _USERNAME_RE.match(username):
        raise ValidationError("Username must be 3-30 chars: letters, numbers, underscores")

    name = req.name.strip()
    if not name or len(name) > 50:
        raise ValidationError("Display name is required (max 50 chars)")

    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise ConflictError("Username taken")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise AuthError("Not authenticated")

    user.username = username
    user.name = name
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

    return {"user": serialize_user(user)}

@router.post("/login")
async def login_with_email(req: EmailLoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    email = _validate_email(req.email)

    # brute-force check before hitting the DB
    from app.core.brute_force import is_locked, record_failed_attempt, clear_failures
    locked, retry_after = is_locked(email)
    if locked:
        return JSONResponse(
            status_code=429,
            content={"error": "account_locked", "message": "Too many failed attempts. Try again later.", "retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.password_hash or "x" * 64):
        record_failed_attempt(email)
        # don't reveal whether the email exists vs password wrong
        raise AuthError("Invalid email or password")

    clear_failures(email)
    user.is_online = True
    user.last_seen = now_ms()
    user.updated_at = now_ms()

    token = create_session_token(user.id)
    _set_cookie(response, user.id)
    return {"user": serialize_user(user), "token": token}

@router.post("/login-legacy", include_in_schema=False)
async def login_legacy(req: LegacyLoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    # kept for seeded demo accounts (alex, sam, priya, marco) that have no email.
    # hidden from openapi — email login is the primary path.
    username = req.username.lower().strip()
    from app.core.brute_force import is_locked, record_failed_attempt, clear_failures
    locked, retry_after = is_locked(username)
    if locked:
        return JSONResponse(
            status_code=429,
            content={"error": "account_locked", "message": "Too many failed attempts. Try again later.", "retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.password_hash or "x" * 64):
        record_failed_attempt(username)
        raise AuthError("Invalid username or password")

    clear_failures(username)
    user.is_online = True
    user.last_seen = now_ms()
    user.updated_at = now_ms()

    token = create_session_token(user.id)
    _set_cookie(response, user.id)
    return {"user": serialize_user(user), "token": token}

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key=settings.COOKIE_NAME, path="/")
    return {"ok": True}

@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    from app.core.security import get_optional_user_id
    user_id = get_optional_user_id(request)
    if not user_id:
        return {"user": None}
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return {"user": serialize_user(user) if user else None}
