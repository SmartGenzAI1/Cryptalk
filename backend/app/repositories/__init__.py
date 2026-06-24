"""Repository layer — single source of truth for database access.

Each repository encapsulates all SQLAlchemy queries for one domain
entity.  The service layer depends on these interfaces, never on the
ORM directly, which keeps business logic testable and database-agnostic.
"""

import secrets
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import now_ms
from app.models import Chat, ChatMember, Message, Reaction, StarredMessage, User


def _id() -> str:
    """Generate a random 24-char hex ID (matches Prisma's cuid length)."""
    return secrets.token_hex(12)


# ─── User repository ───────────────────────────────────────────────────


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
        q = f"%{query.lower()}%"
        result = await self.db.execute(
            select(User)
            .where(
                User.id != exclude_id,
                (User.username.ilike(q)) | (User.name.ilike(q)),
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


# ─── Chat repository ───────────────────────────────────────────────────


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
        """Return ``(member, chat)`` pairs for all chats the user belongs to."""
        result = await self.db.execute(
            select(ChatMember, Chat)
            .join(Chat, ChatMember.chat_id == Chat.id)
            .options(selectinload(Chat.members).selectinload(ChatMember.user))
            .where(ChatMember.user_id == user_id)
        )
        return list(result.all())

    async def find_direct_chat(self, user_a: str, user_b: str) -> Optional[Chat]:
        """Find an existing 1:1 chat between two users."""
        sub_a = select(ChatMember.chat_id).where(ChatMember.user_id == user_a)
        sub_b = select(ChatMember.chat_id).where(ChatMember.user_id == user_b)
        result = await self.db.execute(
            select(Chat)
            .options(selectinload(Chat.members).selectinload(ChatMember.user))
            .where(Chat.type == "direct", Chat.id.in_(sub_a), Chat.id.in_(sub_b))
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> Chat:
        chat = Chat(id=_id(), created_at=now_ms(), updated_at=now_ms(), **kwargs)
        self.db.add(chat)
        await self.db.flush()
        return chat

    async def add_member(self, chat_id: str, user_id: str, role: str = "member") -> ChatMember:
        member = ChatMember(
            id=_id(), chat_id=chat_id, user_id=user_id, role=role,
            joined_at=now_ms(), last_read_at=now_ms(),
        )
        self.db.add(member)
        await self.db.flush()
        return member

    async def touch(self, chat_id: str) -> None:
        """Update ``updated_at`` to bump the chat in list ordering."""
        await self.db.execute(
            update(Chat).where(Chat.id == chat_id).values(updated_at=now_ms())
        )
        await self.db.flush()

    async def update_member(self, member_id: str, **kwargs) -> None:
        await self.db.execute(
            update(ChatMember).where(ChatMember.id == member_id).values(**kwargs)
        )
        await self.db.flush()


# ─── Message repository ────────────────────────────────────────────────


class MessageRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, message_id: str) -> Optional[Message]:
        result = await self.db.execute(
            select(Message)
            .options(selectinload(Message.sender), selectinload(Message.reactions).selectinload(Reaction.user))
            .where(Message.id == message_id)
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
            stmt = stmt.where(Message.content.ilike(f"%{query}%"))
        stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
        result = await self.db.execute(stmt)
        return list(reversed(result.scalars().all()))

    async def create(self, **kwargs) -> Message:
        msg = Message(id=_id(), created_at=now_ms(), **kwargs)
        self.db.add(msg)
        await self.db.flush()
        # Eager-load relationships for the response
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


# ─── Reaction repository ───────────────────────────────────────────────


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


# ─── Starred message repository ────────────────────────────────────────


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
