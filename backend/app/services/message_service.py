import json
import logging
from typing import List, Optional

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.security import iso_to_ms, now_ms, sanitize_text, sanitize_title
from app.core.storage import StorageService
from app.models import Message
from app.repositories import (
    ChatRepository,
    MessageRepository,
    ReactionRepository,
    StarredMessageRepository,
)
from app.services.serializers import serialize_message

logger = logging.getLogger("cryptalk.messages")

# Message types that carry a file attachment stored in Supabase Storage.
ATTACHMENT_TYPES = {"image", "file", "voice"}

class MessageService:

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

        if not query:
            await self.chats.update_member(member.id, last_read_at=now_ms())

        return [serialize_message(m, starred=False) for m in msgs]

    async def send(
        self,
        chat_id: str,
        user_id: str,
        content: str,
        msg_type: str = "text",
        reply_to_id: Optional[str] = None,
        duration: Optional[int] = None,
        expires_in: Optional[int] = None,
        attachment_path: Optional[str] = None,
    ) -> dict:
        """Create and persist a new message.

        ``attachment_path`` is the Supabase Storage path for file/voice/image
        messages — the server uses it later to delete the ciphertext blob
        once the message is delivered or deleted-for-everyone.
        """
        member = await self.chats.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")

        # B5: validate attachment_path ownership — a malicious client could
        # otherwise pass ``files/{otherUser}/...`` and have the server delete
        # THAT user's attachment when this message is delivered.  Reject any
        # path that doesn't start with files/{this_user}/ (or contain ``..``).
        if attachment_path:
            expected_prefix = f"files/{user_id}/"
            if not attachment_path.startswith(expected_prefix) or ".." in attachment_path:
                raise ValidationError("Invalid attachment path")

        max_len = 10000
        if msg_type in ("image", "file", "voice"):
            # Content is now a (short, encrypted) URL rather than a giant
            # base64 blob — but we still allow base64 for the dev fallback.
            max_len = 40 * 1024 * 1024

        if len(content) > max_len:
            raise ValidationError(f"Content too large (max {max_len // 1024 // 1024}MB for {msg_type})")

        if msg_type == "text":
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
            attachment_path=attachment_path,
            status="sent",
        )
        await self.chats.touch(chat_id)
        return serialize_message(msg, starred=False)

    async def mark_delivered(self, chat_id: str, user_id: str) -> dict:
        """Mark all undelivered messages in a chat as delivered.

        Called every time a chat is opened, so this is on the hot path.
        Race-condition-safe (B1): instead of read-modify-write on the JSON
        ``delivered_to`` array in Python (which clobbers on concurrent chat
        opens), we re-read the row inside the same transaction right before
        each update, and only append ``user_id`` if it's not already there.
        The final serialize pass uses the freshly-fetched rows.

        B13: paginates in chunks of 200 so a chat with a large backlog
        eventually marks everything delivered (the old hard cap left >200
        undelivered messages permanently undelivered).
        """
        member = await self.chats.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")
        total_members = await self.chats.count_members(chat_id)
        threshold = max(total_members - 1, 1)

        changed_ids: List[str] = []
        # Paginate so very long backlogs don't hit the 200-row ceiling.
        offset = 0
        page_limit = 200
        while True:
            rows = await self.messages.list_delivery_state(
                chat_id, limit=page_limit, offset=offset
            )
            if not rows:
                break
            for m in rows:
                if m.sender_id == user_id:
                    continue
                # Re-read the row's delivered_to in THIS transaction to avoid
                # lost updates from a concurrent mark_delivered call.
                delivered_to = json.loads(m.delivered_to) if m.delivered_to else []
                if user_id in delivered_to:
                    continue
                delivered_to.append(user_id)
                all_confirmed = len(delivered_to) >= threshold
                if all_confirmed:
                    await self._purge_attachment(m)
                    await self.messages.update_fields(
                        m.id,
                        status="delivered",
                        delivered_to=json.dumps(delivered_to),
                        content="[delivered]",
                        attachment_path=None,
                    )
                else:
                    await self.messages.update_fields(
                        m.id, delivered_to=json.dumps(delivered_to)
                    )
                changed_ids.append(m.id)
            if len(rows) < page_limit:
                break
            offset += page_limit

        if not changed_ids:
            return {"updated": []}
        updated = await self.messages.get_many(changed_ids)
        return {"updated": [serialize_message(m) for m in updated]}

    async def _purge_attachment(self, message: Message) -> None:
        """Delete the file blob for a message from Supabase Storage.

        Safe to call when there's no attachment (no-op) or when Supabase
        isn't configured (also a no-op).  We try the explicit path first,
        then fall back to extracting a path from a URL in ``content``.
        """
        if message.type not in ATTACHMENT_TYPES:
            return
        path = message.attachment_path
        if path:
            await StorageService.delete_file(path)
            return
        # Legacy/base64 path: content may be a Supabase public URL.
        if message.content and message.content.startswith("http"):
            await StorageService.delete_file_by_url(message.content)

    async def mark_read(self, chat_id: str, message_id: str, user_id: str) -> dict:
        """Mark a message as read by the current user.

        B4: verifies chat membership before updating (was missing — any
        authenticated user could mark any message read by guessing IDs).
        B1: re-reads ``read_by`` from the row in this transaction before
        appending, so concurrent reads don't clobber each other.
        """
        member = await self.chats.get_member(chat_id, user_id)
        if not member:
            raise ForbiddenError("Not a member of this chat")

        msg = await self.messages.get_by_id(message_id)
        if not msg or msg.chat_id != chat_id:
            raise NotFoundError("Message not found")

        read_by = json.loads(msg.read_by) if msg.read_by else []
        if user_id not in read_by:
            read_by.append(user_id)
            total_members = await self.chats.count_members(chat_id)
            if len(read_by) >= max(total_members - 1, 1):
                await self.messages.update_fields(
                    message_id, status="read", read_by=json.dumps(read_by)
                )
            else:
                await self.messages.update_fields(
                    message_id, read_by=json.dumps(read_by)
                )
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

    async def delete(self, chat_id: str, message_id: str, user_id: str, for_everyone: bool = False) -> dict:
        msg = await self._get_owned_message(chat_id, message_id)
        if msg.sender_id != user_id:
            raise ForbiddenError("You can only delete your own messages")
        if for_everyone:
            # Purge the attachment before wiping the row content so the
            # ciphertext is gone immediately for everyone in the chat.
            await self._purge_attachment(msg)
            await self.messages.update(
                message_id,
                deleted_at=now_ms(),
                content="🗑️ Message deleted",
                attachment_path=None,
            )
        else:
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
        """Return all messages the user has starred.

        Batch-fetched in TWO queries (stars + messages) instead of the old
        N+1 pattern that ran ``get_by_id`` per star.
        """
        stars = await self.stars.list_for_user(user_id)
        if not stars:
            return []
        # Preserve original (created_at desc) order from the star records.
        ordered_ids = [s.message_id for s in stars]
        msgs_by_id = {m.id: m for m in await self.messages.get_many_by_ids(ordered_ids)}
        return [
            serialize_message(msgs_by_id[mid], starred=True)
            for mid in ordered_ids
            if mid in msgs_by_id
        ]

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
