# repository layer — single source of truth for db access.
# services depend on these, never on the ORM directly.

import secrets
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import escape_like, now_ms
from app.models import Chat, ChatMember, Message, Reaction, StarredMessage, User


def _id() -> str:
    # 24-char hex id (matches prisma's cuid length)
    return secrets.token_hex(12)


# user repository


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.username == username.lower())
        )
        return result.scalar_one_or_none()

    async def search(self, query: str, exclude_id: str, limit: int = 20) -> List[User]:
        q = f"%{escape_like(query.lower())}%"
        result = await self.db.execute(
            select(User)
            .where(
                User.id != exclude_id,
                (User.username.ilike(q, escape="\\")) | (User.name.ilike(q, escape="\\")),
            )
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, **kwargs) -> User:
        user = User(id=_id(), created_at=now_ms(), updated_at=now_ms(), **kwargs)
        self.db.add(user)
        await self.db.flush()
        return user

    async def update(self, user_id: str, **kwargs) -> Optional[User]:
        kwargs["updated_at"] = now_ms()
        await self.db.execute(
            update(User).where(User.id == user_id).values(**kwargs)
        )
        await self.db.flush()
        return await self.get_by_id(user_id)


# chat repository


class ChatRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, chat_id: str) -> Optional[Chat]:
        result = await self.db.execute(
            select(Chat)
            .options(selectinload(Chat.members).selectinload(ChatMember.user))
            .where(Chat.id == chat_id)
        )
        return result.scalar_one_or_none()

    async def get_member(self, chat_id: str, user_id: str) -> Optional[ChatMember]:
        result = await self.db.execute(
            select(ChatMember).where(
                ChatMember.chat_id == chat_id, ChatMember.user_id == user_id
            )
        )
        return result.scalar_one_or_none()

    async def get_user_chats(self, user_id: str) -> List[tuple]:
        # returns (member, chat) pairs for all chats the user belongs to
        result = await self.db.execute(
            select(ChatMember, Chat)
            .join(Chat, ChatMember.chat_id == Chat.id)
            .options(selectinload(Chat.members).selectinload(ChatMember.user))
            .where(ChatMember.user_id == user_id)
        )
        return list(result.all())

    async def find_direct_chat(self, user_a: str, user_b: str) -> Optional[Chat]:
        # find existing 1:1 chat between two users
        sub_a = select(ChatMember.chat_id).where(ChatMember.user_id == user_a)
        sub_b = select(ChatMember.chat_id).where(ChatMember.user_id == user_b)
        result = await self.db.execute(
            select(Chat)
            .options(selectinload(Chat.members).selectinload(ChatMember.user))
            .where(Chat.type == "direct", Chat.id.in_(sub_a), Chat.id.in_(sub_b))
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> Chat:
        cid = kwargs.pop("id", None) or _id()
        chat = Chat(id=cid, created_at=now_ms(), updated_at=now_ms(), **kwargs)
        self.db.add(chat)
        await self.db.flush()
        return chat

    async def add_member(self, chat_id: str, user_id: str, role: str = "member", chat_key: Optional[str] = None) -> ChatMember:
        member = ChatMember(
            id=_id(), chat_id=chat_id, user_id=user_id, role=role,
            joined_at=now_ms(), last_read_at=now_ms(), chat_key=chat_key,
        )
        self.db.add(member)
        await self.db.flush()
        return member

    async def touch(self, chat_id: str) -> None:
        # bump updated_at for chat-list ordering
        await self.db.execute(
            update(Chat).where(Chat.id == chat_id).values(updated_at=now_ms())
        )
        await self.db.flush()

    async def update_member(self, member_id: str, **kwargs) -> None:
        await self.db.execute(
            update(ChatMember).where(ChatMember.id == member_id).values(**kwargs)
        )
        await self.db.flush()

    async def count_members(self, chat_id: str) -> int:
        # lightweight COUNT(*) — avoids loading member+user rows
        result = await self.db.execute(
            select(func.count(ChatMember.id)).where(ChatMember.chat_id == chat_id)
        )
        return result.scalar() or 0


# message repository


class MessageRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, message_id: str) -> Optional[Message]:
        result = await self.db.execute(
            select(Message)
            .options(
                selectinload(Message.sender),
                selectinload(Message.reactions).selectinload(Reaction.user),
                # reply_to + reply_to.sender must be eager-loaded — the serializer
                # touches them and async sqlalchemy can't lazy-load (MissingGreenlet)
                selectinload(Message.reply_to).selectinload(Message.sender),
            )
            .where(Message.id == message_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def list_for_chat(
        self,
        chat_id: str,
        before: Optional[int] = None,
        query: Optional[str] = None,
        limit: int = 50,
    ) -> List[Message]:
        stmt = (
            select(Message)
            .options(
                selectinload(Message.sender),
                selectinload(Message.reactions).selectinload(Reaction.user),
                selectinload(Message.reply_to).selectinload(Message.sender),
            )
            .where(Message.chat_id == chat_id, Message.deleted_at.is_(None))
        )
        if before is not None:
            stmt = stmt.where(Message.created_at < before)
        if query:
            escaped = escape_like(query)
            stmt = stmt.where(Message.content.ilike(f"%{escaped}%", escape="\\"))
        stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
        result = await self.db.execute(stmt)
        return list(reversed(result.scalars().all()))

    async def create(self, **kwargs) -> Message:
        msg = Message(id=_id(), created_at=now_ms(), **kwargs)
        self.db.add(msg)
        await self.db.flush()
        # eager-load relationships for the response
        return await self.get_by_id(msg.id)

    async def update(self, message_id: str, **kwargs) -> Optional[Message]:
        await self.db.execute(
            update(Message).where(Message.id == message_id).values(**kwargs)
        )
        await self.db.flush()
        return await self.get_by_id(message_id)

    async def soft_delete(self, message_id: str) -> None:
        await self.db.execute(
            update(Message)
            .where(Message.id == message_id)
            .values(deleted_at=now_ms(), content="🗑️ Message deleted")
        )
        await self.db.flush()

    async def count_unread(self, chat_id: str, user_id: str, last_read_at: int) -> int:
        result = await self.db.execute(
            select(func.count(Message.id)).where(
                Message.chat_id == chat_id,
                Message.sender_id != user_id,
                Message.created_at > last_read_at,
                Message.deleted_at.is_(None),
            )
        )
        return result.scalar() or 0

    # performance-optimized methods — fetch only the columns needed for
    # delivery/read-status updates, skipping the eager-loaded relationships.
    # a chat-open used to issue ~400 queries; these bring it down to ~3 + a
    # final batch fetch.

    async def list_delivery_state(self, chat_id: str, limit: int = 200, offset: int = 0) -> List[Message]:
        # fetch only columns needed to compute delivery status. no eager loading —
        # callers only read scalar fields. supports offset for pagination.
        stmt = (
            select(Message)
            .where(Message.chat_id == chat_id, Message.deleted_at.is_(None))
            .order_by(Message.created_at.desc())
            .limit(limit)
            .offset(offset)
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_fields(self, message_id: str, **kwargs) -> None:
        # UPDATE without re-fetching — use when you don't need the row back.
        # the regular update does flush + get_by_id (eager-loads 4 relationships)
        # which is wasteful for batch ops where we re-fetch in one final query.
        await self.db.execute(
            update(Message).where(Message.id == message_id).values(**kwargs)
        )
        await self.db.flush()

    async def get_many(self, message_ids: List[str]) -> List[Message]:
        # fetch multiple messages by ID in one query with full eager loading
        if not message_ids:
            return []
        stmt = (
            select(Message)
            .options(
                selectinload(Message.sender),
                selectinload(Message.reactions).selectinload(Reaction.user),
                selectinload(Message.reply_to).selectinload(Message.sender),
            )
            .where(Message.id.in_(message_ids))
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_many_by_ids(self, message_ids: List[str]) -> List[Message]:
        # like get_many but excludes deleted (for the starred-list path)
        if not message_ids:
            return []
        stmt = (
            select(Message)
            .options(
                selectinload(Message.sender),
                selectinload(Message.reactions).selectinload(Reaction.user),
                selectinload(Message.reply_to).selectinload(Message.sender),
            )
            .where(Message.id.in_(message_ids), Message.deleted_at.is_(None))
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def last_messages_for_chats(self, chat_ids: List[str]) -> dict:
        # batch-fetch the latest non-deleted message per chat in one query.
        # replaces the old N+1 loop that ran list_for_chat(limit=1) per chat.
        # returns {chat_id: Message}
        if not chat_ids:
            return {}
        # subquery: max createdAt per chat (among non-deleted messages)
        latest_subq = (
            select(
                Message.chat_id.label("cid"),
                func.max(Message.created_at).label("max_created"),
            )
            .where(Message.chat_id.in_(chat_ids), Message.deleted_at.is_(None))
            .group_by(Message.chat_id)
            .subquery()
        )
        stmt = (
            select(Message)
            .join(
                latest_subq,
                (Message.chat_id == latest_subq.c.cid)
                & (Message.created_at == latest_subq.c.max_created),
            )
            .options(selectinload(Message.sender))
        )
        result = await self.db.execute(stmt)
        return {m.chat_id: m for m in result.scalars().all()}


# reaction repository


class ReactionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find(self, message_id: str, user_id: str, emoji: str) -> Optional[Reaction]:
        result = await self.db.execute(
            select(Reaction).where(
                Reaction.message_id == message_id,
                Reaction.user_id == user_id,
                Reaction.emoji == emoji,
            )
        )
        return result.scalar_one_or_none()

    async def add(self, message_id: str, user_id: str, emoji: str) -> Reaction:
        reaction = Reaction(
            id=_id(), message_id=message_id, user_id=user_id,
            emoji=emoji, created_at=now_ms(),
        )
        self.db.add(reaction)
        await self.db.flush()
        return reaction

    async def remove(self, reaction: Reaction) -> None:
        await self.db.delete(reaction)
        await self.db.flush()


# starred message repository


class StarredMessageRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find(self, message_id: str, user_id: str) -> Optional[StarredMessage]:
        result = await self.db.execute(
            select(StarredMessage).where(
                StarredMessage.message_id == message_id,
                StarredMessage.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def add(self, message_id: str, user_id: str, chat_id: str) -> StarredMessage:
        star = StarredMessage(
            id=_id(), message_id=message_id, user_id=user_id,
            chat_id=chat_id, created_at=now_ms(),
        )
        self.db.add(star)
        await self.db.flush()
        return star

    async def remove(self, star: StarredMessage) -> None:
        await self.db.delete(star)
        await self.db.flush()

    async def list_for_user(self, user_id: str) -> List[StarredMessage]:
        result = await self.db.execute(
            select(StarredMessage)
            .where(StarredMessage.user_id == user_id)
            .order_by(StarredMessage.created_at.desc())
        )
        return list(result.scalars().all())
