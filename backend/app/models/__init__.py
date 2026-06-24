"""SQLAlchemy ORM models mapped to the existing Prisma SQLite schema.

Date columns use ``Integer`` because Prisma stores datetimes as epoch
milliseconds in SQLite.  The ``ms_to_iso`` helper in ``core.security``
converts these to ISO-8601 strings at the API boundary.
"""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class User(Base):
    """A registered user."""

    __tablename__ = "User"

    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    password_hash = Column("passwordHash", String, nullable=False)
    bio = Column(String, default="")
    avatar_color = Column("avatarColor", String, default="emerald")
    avatar_emoji = Column("avatarEmoji", String, default="🙂")
    is_online = Column("isOnline", Boolean, default=False)
    last_seen = Column("lastSeen", Integer)  # epoch ms
    accent_color = Column("accentColor", String, default="emerald")
    wallpaper = Column("wallpaper", String, default="dots")
    created_at = Column("createdAt", Integer)  # epoch ms
    updated_at = Column("updatedAt", Integer)  # epoch ms

    memberships = relationship("ChatMember", back_populates="user")
    messages = relationship("Message", back_populates="sender")
    created_chats = relationship("Chat", back_populates="creator")


class Chat(Base):
    """A conversation — direct, group, channel, or saved messages."""

    __tablename__ = "Chat"

    id = Column(String, primary_key=True)
    type = Column(String, default="direct")  # direct | group | channel | saved
    title = Column(String, nullable=False)
    description = Column(String, default="")
    avatar_color = Column("avatarColor", String, default="emerald")
    avatar_emoji = Column("avatarEmoji", String, default="💬")
    created_by = Column("createdBy", String, ForeignKey("User.id"))
    created_at = Column("createdAt", Integer)
    updated_at = Column("updatedAt", Integer)

    members = relationship("ChatMember", back_populates="chat", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="chat", cascade="all, delete-orphan")
    creator = relationship("User", back_populates="created_chats", foreign_keys=[created_by])


class ChatMember(Base):
    """Membership join table — also stores per-user chat preferences."""

    __tablename__ = "ChatMember"

    id = Column(String, primary_key=True)
    chat_id = Column("chatId", String, ForeignKey("Chat.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column("userId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, default="member")  # owner | admin | member
    joined_at = Column("joinedAt", Integer)
    last_read_at = Column("lastReadAt", Integer)
    pinned_at = Column("pinnedAt", Integer, nullable=True)
    muted = Column("muted", Boolean, default=False)
    pinned_message_id = Column("pinnedMessageId", String, nullable=True)

    chat = relationship("Chat", back_populates="members")
    user = relationship("User", back_populates="memberships")


class Message(Base):
    """A chat message — text, sticker, voice, image, or system notice."""

    __tablename__ = "Message"

    id = Column(String, primary_key=True)
    chat_id = Column("chatId", String, ForeignKey("Chat.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column("senderId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    type = Column(String, default="text")  # text | system | sticker | image | voice
    reply_to_id = Column("replyToId", String, ForeignKey("Message.id"), nullable=True)
    edited_at = Column("editedAt", Integer, nullable=True)
    created_at = Column("createdAt", Integer, index=True)
    deleted_at = Column("deletedAt", Integer, nullable=True)
    duration = Column(Integer, nullable=True)  # voice message seconds

    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User", back_populates="messages", foreign_keys=[sender_id])
    reply_to = relationship("Message", remote_side="Message.id", backref="replies")
    reactions = relationship("Reaction", back_populates="message", cascade="all, delete-orphan")


class Reaction(Base):
    """An emoji reaction on a message."""

    __tablename__ = "Reaction"

    id = Column(String, primary_key=True)
    message_id = Column("messageId", String, ForeignKey("Message.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column("userId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    emoji = Column(String, nullable=False)
    created_at = Column("createdAt", Integer)

    message = relationship("Message", back_populates="reactions")
    user = relationship("User")


class StarredMessage(Base):
    """A message bookmarked by a user."""

    __tablename__ = "StarredMessage"

    id = Column(String, primary_key=True)
    message_id = Column("messageId", String, ForeignKey("Message.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column("userId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    chat_id = Column("chatId", String, nullable=False)
    created_at = Column("createdAt", Integer)
