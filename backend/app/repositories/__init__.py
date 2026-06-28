# repository layer — single source of truth for DB access.
# ephemeral arch: only user, chat, and membership queries.
# messages are relay-only, never touch the DB.

import secrets
from typing import List, Optional

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import escape_like, now_ms
from app.models import Chat, ChatMember, User


def _id() -> str:
    return secrets.token_hex(12)


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> Optional[User]:
        username = (username or "").strip().lower()
        if username.startswith("@"):
            username = username[1:]
        result = await self.db.execute(
            select(User).where(User.username == username)
        )
        return result.scalar_one_or_none()

    async def search(self, query: str, exclude_id: str, limit: int = 20) -> List[User]:
        query_clean = (query or "").strip().lower()
        if query_clean.startswith("@"):
            query_clean = query_clean[1:]
        q = f"%{escape_like(query_clean)}%"
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
        result = await self.db.execute(
            select(ChatMember, Chat)
            .join(Chat, ChatMember.chat_id == Chat.id)
            .options(selectinload(Chat.members).selectinload(ChatMember.user))
            .where(ChatMember.user_id == user_id)
        )
        return list(result.all())

    async def find_direct_chat(self, user_a: str, user_b: str) -> Optional[Chat]:
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
        result = await self.db.execute(
            select(func.count(ChatMember.id)).where(ChatMember.chat_id == chat_id)
        )
        return result.scalar() or 0

    async def count_user_groups(self, user_id: str) -> int:
        result = await self.db.execute(
            select(func.count(ChatMember.id))
            .join(Chat, ChatMember.chat_id == Chat.id)
            .where(ChatMember.user_id == user_id, Chat.type == "group")
        )
        return result.scalar() or 0

    async def count_user_channels(self, user_id: str) -> int:
        result = await self.db.execute(
            select(func.count(ChatMember.id))
            .join(Chat, ChatMember.chat_id == Chat.id)
            .where(ChatMember.user_id == user_id, Chat.type == "channel")
        )
        return result.scalar() or 0
