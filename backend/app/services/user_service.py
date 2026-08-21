# user service — profile, search, settings

from typing import List

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import encrypt_field, sanitize_bio, sanitize_text
from app.core.security import decrypt_field
from app.repositories import UserRepository
from app.services.serializers import serialize_user
from datetime import datetime, timezone


class UserService:
    def __init__(self, user_repo: UserRepository):
        self.users = user_repo

    async def get_me(self, user_id: str) -> dict:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        await self.users.update(user_id, last_active_at=datetime.now(timezone.utc))
        user = await self.users.get_by_id(user_id)
        user.email = decrypt_field(user.email)
        user.name = decrypt_field(user.name)
        user.bio = decrypt_field(user.bio)
        return serialize_user(user)

    async def update(self, user_id: str, **kwargs) -> dict:
        patch = {}
        if kwargs.get("name") is not None:
            patch["name"] = encrypt_field(sanitize_text(kwargs["name"], max_length=50))
        if kwargs.get("bio") is not None:
            patch["bio"] = encrypt_field(sanitize_bio(kwargs["bio"]))
        if "push_token" in kwargs:
            token = kwargs["push_token"]
            if token is not None:
                token = encrypt_field(sanitize_text(str(token), max_length=500))
            patch["push_token"] = token
        if "push_platform" in kwargs:
            platform = kwargs["push_platform"]
            if platform is not None and platform not in ("fcm", "apns", "web"):
                raise ValidationError("Invalid push platform")
            patch["push_platform"] = platform

        patch["is_online"] = True
        from app.core.security import now_ms
        patch["last_seen"] = now_ms()
        patch["last_active_at"] = datetime.now(timezone.utc)
        user = await self.users.update(user_id, **patch)
        user.email = decrypt_field(user.email)
        user.name = decrypt_field(user.name)
        user.bio = decrypt_field(user.bio)
        return serialize_user(user)

    async def search(self, query: str, exclude_id: str) -> List[dict]:
        if not query.strip():
            return []
        blocked_ids = await self.users.get_blocked_ids(exclude_id)
        users = await self.users.search(query.strip(), exclude_id)
        results = []
        for u in users:
            if u.id in blocked_ids:
                continue
            u.name = decrypt_field(u.name)
            u.bio = decrypt_field(u.bio)
            results.append(serialize_user(u))
        return results
