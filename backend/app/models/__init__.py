# ORM models

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base

class User(Base):
    __tablename__ = "User"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=True, index=True)
    username = Column(String, unique=True, nullable=True, index=True)
    name = Column(String, nullable=True)
    password_hash = Column("passwordHash", String, nullable=False)
    bio = Column(String, default="")
    avatar_color = Column("avatarColor", String, default="emerald")
    avatar_emoji = Column("avatarEmoji", String, default="fox")
    is_online = Column("isOnline", Boolean, default=False)
    is_onboarded = Column("isOnboarded", Boolean, default=False)
    last_seen = Column("lastSeen", Integer)
    accent_color = Column("accentColor", String, default="emerald")
    wallpaper = Column("wallpaper", String, default="dots")
    created_at = Column("createdAt", Integer)
    updated_at = Column("updatedAt", Integer)

    identity_public_key = Column("identityPublicKey", String, nullable=True)
    signing_public_key = Column("signingPublicKey", String, nullable=True)
    signed_prekey_public = Column("signedPreKeyPublic", String, nullable=True)
    signed_prekey_signature = Column("signedPreKeySignature", String, nullable=True)

    memberships = relationship("ChatMember", back_populates="user")
    messages = relationship("Message", back_populates="sender")
    created_chats = relationship("Chat", back_populates="creator")

class Chat(Base):
    __tablename__ = "Chat"

    id = Column(String, primary_key=True)
    type = Column(String, default="direct")
    title = Column(String, nullable=False)
    description = Column(String, default="")
    avatar_color = Column("avatarColor", String, default="emerald")
    avatar_emoji = Column("avatarEmoji", String, default="chat")
    created_by = Column("createdBy", String, ForeignKey("User.id"))
    created_at = Column("createdAt", Integer)
    updated_at = Column("updatedAt", Integer)
    expires_at = Column("expiresAt", Integer, nullable=True)
    invite_token = Column("inviteToken", String, nullable=True, index=True)

    members = relationship("ChatMember", back_populates="chat", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="chat", cascade="all, delete-orphan")
    creator = relationship("User", back_populates="created_chats", foreign_keys=[created_by])

class ChatMember(Base):
    # membership join table — also stores per-user chat preferences
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
    expires_in = Column("expiresIn", Integer, nullable=True)  # seconds; null = no expiration
    status = Column("status", String, default="sent")
    read_by = Column("readBy", Text, nullable=True)
    delivered_to = Column("deliveredTo", Text, nullable=True)
    # path to ciphertext blob in supabase storage ("files/{userId}/{randId}/{file}").
    # server needs this to delete the object when the message is delivered or
    # deleted-for-everyone. file itself is always e2ee ciphertext.
    attachment_path = Column("attachmentPath", String, nullable=True, index=True)

    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User", back_populates="messages", foreign_keys=[sender_id])
    reply_to = relationship("Message", remote_side="Message.id", backref="replies")
    reactions = relationship("Reaction", back_populates="message", cascade="all, delete-orphan")

class Reaction(Base):
    __tablename__ = "Reaction"

    id = Column(String, primary_key=True)
    message_id = Column("messageId", String, ForeignKey("Message.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column("userId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    emoji = Column(String, nullable=False)
    created_at = Column("createdAt", Integer)

    message = relationship("Message", back_populates="reactions")
    user = relationship("User")

class StarredMessage(Base):
    __tablename__ = "StarredMessage"

    id = Column(String, primary_key=True)
    message_id = Column("messageId", String, ForeignKey("Message.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column("userId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    chat_id = Column("chatId", String, nullable=False)
    created_at = Column("createdAt", Integer)

class UserBlock(Base):
    __tablename__ = "UserBlock"

    id = Column(String, primary_key=True)
    blocker_id = Column("blockerId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_id = Column("blockedId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column("createdAt", Integer)

class UserNickname(Base):
    __tablename__ = "UserNickname"

    id = Column(String, primary_key=True)
    owner_id = Column("ownerId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    target_user_id = Column("targetUserId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    nickname = Column(String, nullable=False)
    created_at = Column("createdAt", Integer)

class ConnectionRequest(Base):
    __tablename__ = "ConnectionRequest"

    id = Column(String, primary_key=True)
    from_user_id = Column("fromUserId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    to_user_id = Column("toUserId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, default="pending")
    created_at = Column("createdAt", Integer)

class Report(Base):
    __tablename__ = "Report"

    id = Column(String, primary_key=True)
    reporter_id = Column("reporterId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    reported_id = Column("reportedId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=True)
    chat_id = Column("chatId", String, nullable=True)
    message_id = Column("messageId", String, nullable=True)
    reason = Column(String, nullable=False)
    status = Column(String, default="pending")
    created_at = Column("createdAt", Integer)
