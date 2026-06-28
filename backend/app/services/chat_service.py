from typing import List, Optional

from app.core.config import settings
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.security import ms_to_iso, now_ms, sanitize_text, sanitize_title
from app.models import Chat, ChatMember
from app.repositories import ChatRepository, UserRepository
from app.services.serializers import serialize_chat

class ChatService:

    def __init__(self, chat_repo: ChatRepository, user_repo: UserRepository):
        self.chats = chat_repo
        self.users = user_repo

    async def list_for_user(self, user_id: str) -> List[dict]:
        memberships = await self.chats.get_user_chats(user_id)
        valid = [
            (member, chat) for member, chat in memberships
            if not (hasattr(chat, 'expires_at') and chat.expires_at and chat.expires_at < now_ms())
        ]
        if not valid:
            return []

        result = []
        for member, chat in valid:
            result.append((chat, member))

        result.sort(key=lambda item: (
            item[1].pinned_at is None,
            -(item[0].updated_at or 0),
        ))

        return [serialize_chat(chat, member) for chat, member in result]

    async def get_chat(self, chat_id: str, user_id: str) -> dict:
        chat = await self.chats.get_by_id(chat_id)
        if not chat:
            raise ForbiddenError("Chat not found")
        member = await self.chats.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")
        return serialize_chat(chat, member)

    async def create(
        self,
        user_id: str,
        chat_type: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        member_ids: Optional[List[str]] = None,
        avatar_emoji: Optional[str] = None,
        avatar_color: Optional[str] = None,
        expires_in_days: Optional[int] = None,
        member_keys: Optional[dict] = None,
    ) -> dict:
        if chat_type == "direct":
            return await self._create_direct(user_id, member_ids or [])
        return await self._create_group(
            user_id, chat_type, title, description, member_ids or [],
            avatar_emoji, avatar_color, expires_in_days, member_keys,
        )

    async def _create_direct(self, user_id: str, member_ids: List[str]) -> dict:
        if not member_ids:
            raise ValidationError("A member is required for direct chats")
        other_id = member_ids[0]

        existing = await self.chats.find_direct_chat(user_id, other_id)
        if existing:
            member = await self.chats.get_member(existing.id, user_id)
            return serialize_chat(existing, member)

        chat = await self.chats.create(type="direct", title="Direct", created_by=user_id)
        await self.chats.add_member(chat.id, user_id, role="owner")
        await self.chats.add_member(chat.id, other_id, role="member")
        chat = await self.chats.get_by_id(chat.id)
        member = await self.chats.get_member(chat.id, user_id)
        return serialize_chat(chat, member)

    async def _create_group(
        self, user_id: str, chat_type: str, title: Optional[str],
        description: Optional[str], member_ids: List[str],
        avatar_emoji: Optional[str], avatar_color: Optional[str],
        expires_in_days: Optional[int] = None,
        member_keys: Optional[dict] = None,
    ) -> dict:
        title = sanitize_title(title or "")
        if not title:
            raise ValidationError("Title is required for group/channel chats")

        # enforce per-user limits
        if chat_type == "group":
            count = await self.chats.count_user_groups(user_id)
            if count >= settings.MAX_GROUPS_PER_USER:
                raise ValidationError(
                    f"You've reached the maximum of {settings.MAX_GROUPS_PER_USER} groups"
                )
        elif chat_type == "channel":
            count = await self.chats.count_user_channels(user_id)
            if count >= settings.MAX_CHANNELS_PER_USER:
                raise ValidationError(
                    f"You've reached the maximum of {settings.MAX_CHANNELS_PER_USER} channels"
                )

        all_members = list(dict.fromkeys([user_id] + member_ids))
        if len(all_members) > settings.MAX_MEMBERS_PER_GROUP:
            raise ValidationError(
                f"Maximum {settings.MAX_MEMBERS_PER_GROUP} members per group"
            )

        expires_at = None
        if expires_in_days and 1 <= expires_in_days <= 7:
            expires_at = now_ms() + (expires_in_days * 86400 * 1000)

        chat = await self.chats.create(
            type=chat_type,
            title=title,
            description=sanitize_text(description or "", max_length=300),
            avatar_emoji=avatar_emoji or (
                settings.CHAT_TYPE_ICONS.get("channel") if chat_type == "channel"
                else settings.CHAT_TYPE_ICONS.get("group")
            ),
            avatar_color=avatar_color or "violet",
            created_by=user_id,
            expires_at=expires_at,
        )
        for i, uid in enumerate(all_members):
            role = "owner" if i == 0 else "member"
            chat_key = member_keys.get(uid) if member_keys else None
            await self.chats.add_member(chat.id, uid, role=role, chat_key=chat_key)

        chat = await self.chats.get_by_id(chat.id)
        member = await self.chats.get_member(chat.id, user_id)
        return serialize_chat(chat, member)

    async def update_settings(
        self, chat_id: str, user_id: str, action: str,
        value: Optional[bool] = None,
    ) -> dict:
        member = await self.chats.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")

        if action == "pin":
            pinned_val = now_ms() if value else None
            await self.chats.update_member(member.id, pinned_at=pinned_val)
            member.pinned_at = pinned_val
        elif action == "mute":
            mute_val = bool(value)
            await self.chats.update_member(member.id, muted=mute_val)
            member.muted = mute_val
        else:
            raise ValidationError(f"Unknown action: {action}")

        return {
            "pinnedAt": ms_to_iso(member.pinned_at) if member.pinned_at else None,
            "muted": bool(member.muted),
        }
