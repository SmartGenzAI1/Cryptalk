import logging
from typing import List, Optional

import secrets
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.security import ms_to_iso, now_ms, sanitize_text, sanitize_title
from app.models import Chat, ChatMember, Report, UserBlock, UserNickname, ConnectionRequest
from app.repositories import ChatRepository, UserRepository
from app.services.serializers import serialize_chat

logger = logging.getLogger("cryptalk.chat_service")

class ChatService:

    def __init__(self, chat_repo: ChatRepository, user_repo: UserRepository):
        self.chats = chat_repo
        self.users = user_repo

    async def list_for_user(self, user_id: str) -> List[dict]:
        memberships = await self.chats.get_user_chats(user_id)
        has_saved = any(chat.type == "saved" for _, chat in memberships)
        if not has_saved:
            try:
                saved = await self.chats.create(
                    type="saved",
                    title="Saved Messages",
                    created_by=user_id,
                )
                await self.chats.add_member(saved.id, user_id, role="owner")
                # refetch memberships
                memberships = await self.chats.get_user_chats(user_id)
            except Exception:
                logger.warning("Failed to create Saved Messages chat for user %s", user_id)

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
        expires_in_days: Optional[int] = None,
        member_keys: Optional[dict] = None,
    ) -> dict:
        if chat_type == "direct":
            return await self._create_direct(user_id, member_ids or [])
        return await self._create_group(
            user_id, chat_type, title, description, member_ids or [],
            expires_in_days, member_keys,
        )

    async def _create_direct(self, user_id: str, member_ids: List[str]) -> dict:
        if not member_ids:
            raise ValidationError("A member is required for direct chats")
        other_id = member_ids[0]

        from sqlalchemy import select, or_, and_
        block_check = await self.chats.db.execute(
            select(UserBlock).where(
                or_(
                    and_(UserBlock.blocker_id == user_id, UserBlock.blocked_id == other_id),
                    and_(UserBlock.blocker_id == other_id, UserBlock.blocked_id == user_id),
                )
            )
        )
        if block_check.scalar_one_or_none():
            raise ValidationError("Cannot create direct chat with this user")

        existing = await self.chats.find_direct_chat(user_id, other_id)
        if existing:
            member = await self.chats.get_member(existing.id, user_id)
            return serialize_chat(existing, member)

        try:
            chat = await self.chats.create(type="direct", title="Direct", created_by=user_id)
            await self.chats.add_member(chat.id, user_id, role="owner")
            await self.chats.add_member(chat.id, other_id, role="member")
            return serialize_chat(chat, await self.chats.get_member(chat.id, user_id))
        except IntegrityError:
            # concurrent creation race — re-query for the chat that won
            existing = await self.chats.find_direct_chat(user_id, other_id)
            if existing:
                member = await self.chats.get_member(existing.id, user_id)
                return serialize_chat(existing, member)
            raise

    async def _create_group(
        self, user_id: str, chat_type: str, title: Optional[str],
        description: Optional[str], member_ids: List[str],
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
            created_by=user_id,
            expires_at=expires_at,
        )

        # batch add all members in one flush instead of N individual flushes
        for i, uid in enumerate(all_members):
            role = "owner" if i == 0 else "member"
            chat_key = member_keys.get(uid) if member_keys else None
            member_obj = ChatMember(
                id=secrets.token_hex(12),
                chat_id=chat.id,
                user_id=uid,
                role=role,
                joined_at=now_ms(),
                last_read_at=now_ms(),
                chat_key=chat_key,
            )
            self.chats.db.add(member_obj)
        await self.chats.db.flush()

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

    async def delete_chat(self, chat_id: str, user_id: str) -> None:
        chat = await self.chats.get_by_id(chat_id)
        if not chat:
            raise ForbiddenError("Chat not found")
        member = await self.chats.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")
        if chat.type == "saved":
            raise ValidationError("Cannot delete Saved Messages")
        if chat.type in ("group", "channel") and member.role != "owner":
            raise ForbiddenError("Only the chat owner can delete a group or channel")
        if chat.type == "direct" and chat.created_by != user_id:
            raise ForbiddenError("Only the chat creator can delete a direct chat")

        db = self.chats.db
        await db.execute(delete(Report).where(Report.chat_id == chat_id))
        await db.execute(delete(ChatMember).where(ChatMember.chat_id == chat_id))
        await db.execute(delete(Chat).where(Chat.id == chat_id))

    @staticmethod
    def validate_message_content(content: object) -> str:
        if not isinstance(content, str):
            raise ValidationError("Message content must be a string")
        cleaned = content.strip()
        if not cleaned:
            raise ValidationError("Message content cannot be empty")
        return cleaned
