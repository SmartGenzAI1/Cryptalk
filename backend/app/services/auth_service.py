# service layer — business logic that orchestrates repositories

import secrets

from fastapi import Response

from app.core.config import settings
from app.core.exceptions import AuthError, ConflictError
from app.core.security import (
    create_session_token,
    hash_password,
    now_ms,
    sanitize_text,
    validate_password,
    validate_username,
    verify_password,
    verify_session_token,
)
from app.models import Chat, ChatMember
from app.repositories import ChatRepository, UserRepository
from app.services.serializers import serialize_user


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
            name=name,
            password_hash=hash_password(password),
            last_seen=now_ms(),
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
                welcome = await self.chat_repo.get_by_id(settings.WELCOME_CHANNEL_ID)

        if welcome:
            existing = await self.chat_repo.get_member(welcome.id, user.id)
            if not existing:
                await self.chat_repo.add_member(welcome.id, user.id, role="member")

        _set_cookie(response, user.id)
        return serialize_user(user)

    async def login(self, username: str, password: str, response: Response) -> dict:
        username = validate_username(username)
        user = await self.user_repo.get_by_username(username)
        # constant-time comparison even on invalid users
        if not user or not verify_password(password, user.password_hash or "x" * 64):
            raise AuthError("Invalid credentials")

        await self.user_repo.update(user.id, is_online=True, last_seen=now_ms())
        _set_cookie(response, user.id)
        return serialize_user(user)

    async def logout(self, response: Response) -> None:
        response.delete_cookie(key=settings.COOKIE_NAME, path="/")


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
