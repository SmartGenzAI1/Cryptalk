"""Message service — send, edit, delete, react, star, forward, search."""

from typing import List, Optional

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.security import iso_to_ms, now_ms, sanitize_text, sanitize_title
from app.models import Message
from app.repositories import (
    ChatRepository,
    MessageRepository,
    ReactionRepository,
    StarredMessageRepository,
)
from app.services.serializers import serialize_message


class MessageService:
    """All message-related business logic."""

    def __init__(
        self,
        message_repo: MessageRepository,
        chat_repo: ChatRepository,
        reaction_repo: ReactionRepository,
        star_repo: StarredMessageRepository,
    ):
        self.messages = message_repo
        self.chats = chat_repo
        self.reactions = reaction_repo
        self.stars = star_repo

    async def list(
        self,
        chat_id: str,
        user_id: str,
        before: Optional[str] = None,
        query: Optional[str] = None,
        limit: int = 50,
    ) -> List[dict]:
        """List messages in a chat. Marks the chat as read when not searching."""
        member = await self.chats.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")

        before_ms = iso_to_ms(before) if before else None
        msgs = await self.messages.list_for_chat(chat_id, before_ms, query, limit)

        # Mark read only during normal browsing (not search)
        if not query:
            await self.chats.update_member(member.id, last_read_at=now_ms())

        result = []
        for m in msgs:
            star = await self.stars.find(m.id, user_id)
            result.append(serialize_message(m, starred=star is not None))
        return result

    async def send(
        self,
        chat_id: str,
        user_id: str,
        content: str,
        msg_type: str = "text",
        reply_to_id: Optional[str] = None,
        duration: Optional[int] = None,
        expires_in: Optional[int] = None,
    ) -> dict:
        """Create and persist a new message."""
        member = await self.chats.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")
        content = sanitize_text(content)
        if not content:
            raise ValidationError("Content is required")

        msg = await self.messages.create(
            chat_id=chat_id,
            sender_id=user_id,
            content=content,
            type=msg_type or "text",
            reply_to_id=reply_to_id or None,
            duration=duration if isinstance(duration, int) else None,
            expires_in=expires_in if isinstance(expires_in, int) and expires_in > 0 else None,
            status="sent",
        )
        await self.chats.touch(chat_id)
        return serialize_message(msg, starred=False)

    async def mark_delivered(self, chat_id: str, user_id: str) -> dict:
        """Mark all messages in a chat as delivered (recipient opened the chat)."""
        member = await self.chats.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")
        messages = await self.messages.list_for_chat(chat_id, limit=200)
        updated = []
        for m in messages:
            if m.sender_id != user_id and m.status == "sent":
                m = await self.messages.update(m.id, status="delivered")
                updated.append(serialize_message(m))
        return {"updated": updated}

    async def mark_read(self, chat_id: str, message_id: str, user_id: str) -> dict:
        """Mark a message as read by the current user."""
        import json
        msg = await self.messages.get_by_id(message_id)
        if not msg or msg.chat_id != chat_id:
            raise NotFoundError("Message not found")

        read_by = json.loads(msg.read_by) if msg.read_by else []
        if user_id not in read_by:
            read_by.append(user_id)
            # If all members have read it, update status to 'read'
            members = await self.chats.get_by_id(chat_id)
            total_members = len(members.members) if members else 1
            if len(read_by) >= total_members - 1:  # -1 for sender
                await self.messages.update(message_id, status="read", read_by=json.dumps(read_by))
            else:
                await self.messages.update(message_id, read_by=json.dumps(read_by))
            msg = await self.messages.get_by_id(message_id)
        return serialize_message(msg)

    async def edit_or_star(
        self, chat_id: str, message_id: str, user_id: str,
        content: Optional[str] = None, action: Optional[str] = None,
    ) -> dict:
        """Edit a message (sender only) or toggle its star (any member)."""
        msg = await self._get_owned_message(chat_id, message_id)

        if action == "star":
            return await self._toggle_star(message_id, user_id, chat_id)

        # Edit path
        if msg.sender_id != user_id:
            raise ForbiddenError("You can only edit your own messages")
        content = sanitize_text(content)
        if not content:
            raise ValidationError("Content is required")
        msg = await self.messages.update(message_id, content=content, edited_at=now_ms())
        star = await self.stars.find(message_id, user_id)
        return serialize_message(msg, starred=star is not None)

    async def delete(self, chat_id: str, message_id: str, user_id: str) -> dict:
        """Soft-delete a message (sender only)."""
        msg = await self._get_owned_message(chat_id, message_id)
        if msg.sender_id != user_id:
            raise ForbiddenError("You can only delete your own messages")
        await self.messages.soft_delete(message_id)
        return {"ok": True}

    async def toggle_reaction(
        self, chat_id: str, message_id: str, user_id: str, emoji: str,
    ) -> dict:
        """Add or remove an emoji reaction."""
        msg = await self._get_owned_message(chat_id, message_id)
        existing = await self.reactions.find(message_id, user_id, emoji)
        if existing:
            await self.reactions.remove(existing)
            return {"added": False, "emoji": emoji}
        await self.reactions.add(message_id, user_id, emoji)
        return {"added": True, "emoji": emoji}

    async def forward(
        self, message_id: str, target_chat_ids: List[str], user_id: str,
    ) -> List[dict]:
        """Copy a message into one or more target chats."""
        original = await self.messages.get_by_id(message_id)
        if not original:
            raise NotFoundError("Message not found")

        forwarded = []
        for chat_id in target_chat_ids:
            member = await self.chats.get_member(chat_id, user_id)
            if not member:
                continue
            msg = await self.messages.create(
                chat_id=chat_id,
                sender_id=user_id,
                content=original.content,
                type=original.type,
                duration=original.duration,
            )
            await self.chats.touch(chat_id)
            forwarded.append({"chatId": chat_id, "message": serialize_message(msg, starred=False)})
        return forwarded

    async def list_starred(self, user_id: str) -> List[dict]:
        """Return all messages the user has starred."""
        stars = await self.stars.list_for_user(user_id)
        result = []
        for s in stars:
            msg = await self.messages.get_by_id(s.message_id)
            if msg and not msg.deleted_at:
                result.append(serialize_message(msg, starred=True))
        return result

    async def _toggle_star(self, message_id: str, user_id: str, chat_id: str) -> dict:
        existing = await self.stars.find(message_id, user_id)
        if existing:
            await self.stars.remove(existing)
            return {"starred": False}
        await self.stars.add(message_id, user_id, chat_id)
        return {"starred": True}

    async def _get_owned_message(self, chat_id: str, message_id: str) -> Message:
        """Fetch a message, validating it belongs to the given chat."""
        msg = await self.messages.get_by_id(message_id)
        if not msg or msg.chat_id != chat_id:
            raise NotFoundError("Message not found")
        return msg
