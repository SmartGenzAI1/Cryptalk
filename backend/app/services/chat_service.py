"""Chat service — chat listing, creation, and per-user settings."""

from typing import List, Optional

from app.core.config import settings
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.security import ms_to_iso, now_ms, sanitize_text, sanitize_title
from app.models import Chat, ChatMember
from app.repositories import ChatRepository, MessageRepository, UserRepository
from app.services.serializers import serialize_chat


class ChatService:
    """Orchestrates chat operations across user / chat / message repos."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        user_repo: UserRepository,
        message_repo: MessageRepository,
    ):
        self.chats = chat_repo
        self.users = user_repo
        self.messages = message_repo

    async def list_for_user(self, user_id: str) -> List[dict]:
        """Return all chats for a user, sorted pinned-first then by recency."""
        memberships = await self.chats.get_user_chats(user_id)
        result: List[dict] = []

        for member, chat in memberships:
            if hasattr(chat, 'expires_at') and chat.expires_at and chat.expires_at < now_ms():
                continue
            last_msg = await self._last_message(chat.id)
            unread = await self.messages.count_unread(
                chat.id, user_id, member.last_read_at or 0
            )
            result.append((chat, member, last_msg, unread))

        # Sort: pinned first, then by updatedAt (int ms) descending
        result.sort(key=lambda item: (
            item[1].pinned_at is None,
            -(item[0].updated_at or 0),
        ))

        return [
            serialize_chat(chat, member, last_msg, unread)
            for chat, member, last_msg, unread in result
        ]

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
    ) -> dict:
        if chat_type == "direct":
            return await self._create_direct(user_id, member_ids or [])
        return await self._create_group(
            user_id, chat_type, title, description, member_ids or [],
            avatar_emoji, avatar_color, expires_in_days,
        )

    async def _create_direct(self, user_id: str, member_ids: List[str]) -> dict:
        if not member_ids:
            raise ValidationError("A member is required for direct chats")
        other_id = member_ids[0]

        # Reuse existing 1:1 chat if one exists
        existing = await self.chats.find_direct_chat(user_id, other_id)
        if existing:
            member = await self.chats.get_member(existing.id, user_id)
            return serialize_chat(existing, member)

        chat = await self.chats.create(type="direct", title="Direct", created_by=user_id)
        await self.chats.add_member(chat.id, user_id, role="owner")
        await self.chats.add_member(chat.id, other_id, role="member")
        # Reload with members eager-loaded
        chat = await self.chats.get_by_id(chat.id)
        member = await self.chats.get_member(chat.id, user_id)
        return serialize_chat(chat, member)

    async def _create_group(
        self, user_id: str, chat_type: str, title: Optional[str],
        description: Optional[str], member_ids: List[str],
        avatar_emoji: Optional[str], avatar_color: Optional[str],
        expires_in_days: Optional[int] = None,
    ) -> dict:
        title = sanitize_title(title or "")
        if not title:
            raise ValidationError("Title is required for group/channel chats")

        expires_at = None
        if expires_in_days and 1 <= expires_in_days <= 7:
            expires_at = now_ms() + (expires_in_days * 86400 * 1000)

        all_members = list(dict.fromkeys([user_id] + member_ids))
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
            await self.chats.add_member(chat.id, uid, role="owner" if i == 0 else "member")

        chat = await self.chats.get_by_id(chat.id)
        member = await self.chats.get_member(chat.id, user_id)
        return serialize_chat(chat, member)

    async def update_settings(
        self, chat_id: str, user_id: str, action: str,
        value: Optional[bool] = None, message_id: Optional[str] = None,
    ) -> dict:
        member = await self.chats.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")

        if action == "pin":
            await self.chats.update_member(member.id, pinned_at=now_ms() if value else None)
        elif action == "mute":
            await self.chats.update_member(member.id, muted=bool(value))
        elif action == "pinMessage":
            await self.chats.update_member(member.id, pinned_message_id=message_id or None)
        else:
            raise ValidationError(f"Unknown action: {action}")

        return {
            "pinnedAt": ms_to_iso(member.pinned_at) if member.pinned_at else None,
            "muted": bool(member.muted),
            "pinnedMessageId": member.pinned_message_id,
        }

    async def _last_message(self, chat_id: str):
        msgs = await self.messages.list_for_chat(chat_id, limit=1)
        return msgs[0] if msgs else None
