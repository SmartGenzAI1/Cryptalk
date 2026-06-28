# user service — profile, search, settings

from typing import List

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.core.security import sanitize_bio, sanitize_text
from app.repositories import UserRepository
from app.services.serializers import serialize_user


class UserService:
    def __init__(self, user_repo: UserRepository):
        self.users = user_repo

    async def get_me(self, user_id: str) -> dict:
        user = await self.users.get_by_id(user_id)
        return serialize_user(user)

    async def update(self, user_id: str, **kwargs) -> dict:
        patch = {}
        if kwargs.get("name") is not None:
            patch["name"] = sanitize_text(kwargs["name"], max_length=50)
        if kwargs.get("bio") is not None:
            patch["bio"] = sanitize_bio(kwargs["bio"])
        if kwargs.get("avatar_emoji") is not None:
            patch["avatar_emoji"] = kwargs["avatar_emoji"]
        if kwargs.get("avatar_color") is not None:
            if kwargs["avatar_color"] not in settings.AVATAR_COLORS:
                raise ValidationError(f"Invalid avatar color: {kwargs['avatar_color']}")
            patch["avatar_color"] = kwargs["avatar_color"]
        if kwargs.get("accent_color") is not None:
            if kwargs["accent_color"] not in settings.AVATAR_COLORS:
                raise ValidationError(f"Invalid accent color: {kwargs['accent_color']}")
            patch["accent_color"] = kwargs["accent_color"]
        if kwargs.get("wallpaper") is not None:
            if kwargs["wallpaper"] not in settings.WALLPAPERS:
                raise ValidationError(f"Invalid wallpaper: {kwargs['wallpaper']}")
            patch["wallpaper"] = kwargs["wallpaper"]

        if "push_token" in kwargs:
            patch["push_token"] = kwargs["push_token"]
        if "push_platform" in kwargs:
            patch["push_platform"] = kwargs["push_platform"]

        patch["is_online"] = True
        from app.core.security import now_ms
        patch["last_seen"] = now_ms()
        user = await self.users.update(user_id, **patch)
        return serialize_user(user)

    async def search(self, query: str, exclude_id: str) -> List[dict]:
        if not query.strip():
            return []
        users = await self.users.search(query.strip(), exclude_id)
        return [serialize_user(u) for u in users]
