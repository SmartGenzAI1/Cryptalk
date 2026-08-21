# service layer — business logic that orchestrates repositories

import logging
import secrets
import time

from fastapi import Response

from app.core.config import settings
from app.core.exceptions import AuthError, ConflictError, ValidationError
from app.core.security import (
    create_session_token,
    decrypt_field,
    encrypt_field,
    hash_password,
    lookup_hash,
    now_ms,
    sanitize_text,
    validate_password,
    validate_username,
    verify_password,
    verify_session_token,
)
from datetime import datetime, timezone
from app.models import Chat, ChatMember
from app.repositories import ChatRepository, UserRepository
from app.services.serializers import serialize_user

logger = logging.getLogger("cryptalk.auth_service")

# token expiry constants
_EMAIL_VERIFICATION_TTL = 24 * 60 * 60 * 1000   # 24 hours in ms
_PASSWORD_RESET_TTL = 60 * 60 * 1000              # 1 hour in ms


class AuthService:
    def __init__(self, user_repo: UserRepository, chat_repo: ChatRepository):
        self.user_repo = user_repo
        self.chat_repo = chat_repo

    async def register(self, username: str, name: str, password: str, response: Response) -> dict:
        username = validate_username(username)
        validate_password(password)
        name = sanitize_text(name, max_length=50) or username
        if await self.user_repo.get_by_username(username):
            raise ConflictError("Username already taken")

        user = await self.user_repo.create(
            username=username,
            name=encrypt_field(name),
            password_hash=await hash_password(password),
            is_online=True,
        )

        # provision a Saved Messages chat for the new user
        saved = await self.chat_repo.create(
            type="saved",
            title="Saved Messages",
            created_by=user.id,
        )
        await self.chat_repo.add_member(saved.id, user.id, role="owner")

        # auto-join the welcome channel, creating it dynamically if missing
        welcome = await self.chat_repo.get_by_id(settings.WELCOME_CHANNEL_ID)
        if not welcome:
            try:
                welcome = await self.chat_repo.create(
                    id=settings.WELCOME_CHANNEL_ID,
                    type="channel",
                    title="Welcome Channel",
                    description="Welcome to Cryptalk! Say hello!",
                    created_by=user.id,
                )
                await self.chat_repo.add_member(welcome.id, user.id, role="owner")
            except Exception:
                logger.warning("Failed to create welcome channel")
                welcome = await self.chat_repo.get_by_id(settings.WELCOME_CHANNEL_ID)

        if welcome:
            existing = await self.chat_repo.get_member(welcome.id, user.id)
            if not existing:
                await self.chat_repo.add_member(welcome.id, user.id, role="member")

        _set_cookie(response, user.id)
        return serialize_user(user, include_email=True)

    async def login(self, username: str, password: str, response: Response) -> dict:
        username = validate_username(username)
        user = await self.user_repo.get_by_username(username)
        stored_hash = user.password_hash if user else None
        password_valid = await verify_password(password, stored_hash)
        if not user or not password_valid:
            raise AuthError("Invalid credentials")

        token = create_session_token(user.id)
        update_kwargs = {"is_online": True}
        if user.last_seen_opt_in:
            update_kwargs["last_seen"] = now_ms()
        await self.user_repo.update(user.id, **update_kwargs)
        user.email = decrypt_field(user.email)
        user.name = decrypt_field(user.name)
        _set_cookie(response, user.id, token)
        return serialize_user(user, include_email=True)

    async def logout(self, response: Response) -> None:
        response.delete_cookie(key="__Host-tc_session", path="/")
        response.delete_cookie(key=settings.COOKIE_NAME, path="/")

    # ── email verification ──────────────────────────────────────────────

    async def send_verification_email(self, user_id: str) -> None:
        from app.services.email_service import send_verification_email as _send
        user = await self.user_repo.get_by_id(user_id)
        if not user or not user.email:
            raise AuthError("No email on file")
        if user.is_email_verified:
            return
        token = secrets.token_urlsafe(48)
        expiry = now_ms() + _EMAIL_VERIFICATION_TTL
        await self.user_repo.update(
            user.id,
            email_verification_token=token,
        )
        plain_email = decrypt_field(user.email)
        plain_name = decrypt_field(user.name)
        _send(plain_email, plain_name or plain_email.split("@")[0], token)

    async def verify_email_token(self, token: str) -> bool:
        from sqlalchemy import select
        from app.core.database import async_session_factory
        async with async_session_factory() as db:
            result = await db.execute(
                select(User).where(User.email_verification_token == token)
            )
            user = result.scalar_one_or_none()
            if not user:
                return False
            user.is_email_verified = True
            user.email_verification_token = None
            user.updated_at = now_ms()
            await db.commit()
            return True

    # ── password reset ──────────────────────────────────────────────────

    async def send_password_reset(self, email: str) -> None:
        """Send a password reset email. Silently no-ops if email not found (prevents enumeration)."""
        from app.services.email_service import send_password_reset_email as _send
        from sqlalchemy import select
        from app.core.database import async_session_factory
        async with async_session_factory() as db:
            result = await db.execute(
                select(User).where(User.email_lookup == lookup_hash(email))
            )
            user = result.scalar_one_or_none()
            if not user or not user.email:
                return
            token = secrets.token_urlsafe(48)
            expiry = now_ms() + _PASSWORD_RESET_TTL
            user.password_reset_token = token
            user.password_reset_expires = expiry
            await db.commit()
            plain_email = decrypt_field(user.email)
            plain_name = decrypt_field(user.name)
            _send(plain_email, plain_name or plain_email.split("@")[0], token)

    async def confirm_password_reset(self, token: str, new_password: str) -> bool:
        from sqlalchemy import select
        from app.core.database import async_session_factory
        validate_password(new_password)
        async with async_session_factory() as db:
            result = await db.execute(
                select(User).where(User.password_reset_token == token)
            )
            user = result.scalar_one_or_none()
            if not user:
                return False
            if user.password_reset_expires and now_ms() > user.password_reset_expires:
                return False
            user.password_hash = await hash_password(new_password)
            user.password_reset_token = None
            user.password_reset_expires = None
            user.updated_at = now_ms()
            await db.commit()
            return True


def _set_cookie(response: Response, user_id: str, token: str | None = None) -> None:
    if token is None:
        token = create_session_token(user_id)
    is_prod = settings.is_postgres
    cookie_name = "__Host-tc_session" if is_prod else "tc_session"
    response.set_cookie(
        key=cookie_name,
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="Strict",
        max_age=settings.COOKIE_MAX_AGE,
        path="/",
    )
