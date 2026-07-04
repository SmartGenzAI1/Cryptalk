# ORM models — ephemeral architecture
# only auth, profiles, membership, and social data live in the DB.
# messages are relay-only (WebSocket), never persisted.

from sqlalchemy import Boolean, Column, ForeignKey, Integer, BigInteger, String, Text
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
    is_online = Column("isOnline", Boolean, default=False)
    is_onboarded = Column("isOnboarded", Boolean, default=False)
    last_seen = Column("lastSeen", BigInteger)
    created_at = Column("createdAt", BigInteger)
    updated_at = Column("updatedAt", BigInteger)

    identity_public_key = Column("identityPublicKey", String, nullable=True)
    signing_public_key = Column("signingPublicKey", String, nullable=True)
    signed_prekey_public = Column("signedPreKeyPublic", String, nullable=True)
    signed_prekey_signature = Column("signedPreKeySignature", String, nullable=True)

    # FCM/APNs push token for offline notifications
    push_token = Column("pushToken", String, nullable=True)
    push_platform = Column("pushPlatform", String, nullable=True)  # fcm | apns | web

    memberships = relationship("ChatMember", back_populates="user")
    created_chats = relationship("Chat", back_populates="creator")

class Chat(Base):
    __tablename__ = "Chat"

    id = Column(String, primary_key=True)
    type = Column(String, default="direct")
    title = Column(String, nullable=False)
    description = Column(String, default="")
    created_by = Column("createdBy", String, ForeignKey("User.id"))
    created_at = Column("createdAt", BigInteger)
    updated_at = Column("updatedAt", BigInteger)
    expires_at = Column("expiresAt", BigInteger, nullable=True)
    invite_token = Column("inviteToken", String, nullable=True, index=True)

    members = relationship("ChatMember", back_populates="chat", cascade="all, delete-orphan")
    creator = relationship("User", back_populates="created_chats", foreign_keys=[created_by])

class ChatMember(Base):
    __tablename__ = "ChatMember"

    id = Column(String, primary_key=True)
    chat_id = Column("chatId", String, ForeignKey("Chat.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column("userId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, default="member")  # owner | admin | member
    joined_at = Column("joinedAt", BigInteger)
    last_read_at = Column("lastReadAt", BigInteger)
    pinned_at = Column("pinnedAt", BigInteger, nullable=True)
    muted = Column("muted", Boolean, default=False)
    chat_key = Column("chatKey", String, nullable=True)

    chat = relationship("Chat", back_populates="members")
    user = relationship("User", back_populates="memberships")

class UserBlock(Base):
    __tablename__ = "UserBlock"

    id = Column(String, primary_key=True)
    blocker_id = Column("blockerId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_id = Column("blockedId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column("createdAt", BigInteger)

class UserNickname(Base):
    __tablename__ = "UserNickname"

    id = Column(String, primary_key=True)
    owner_id = Column("ownerId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    target_user_id = Column("targetUserId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    nickname = Column(String, nullable=False)
    created_at = Column("createdAt", BigInteger)

class ConnectionRequest(Base):
    __tablename__ = "ConnectionRequest"

    id = Column(String, primary_key=True)
    from_user_id = Column("fromUserId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    to_user_id = Column("toUserId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, default="pending")
    created_at = Column("createdAt", BigInteger)

class Report(Base):
    __tablename__ = "Report"

    id = Column(String, primary_key=True)
    reporter_id = Column("reporterId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    reported_id = Column("reportedId", String, ForeignKey("User.id", ondelete="CASCADE"), nullable=True)
    chat_id = Column("chatId", String, nullable=True)
    reason = Column(String, nullable=False)
    status = Column(String, default="pending")
    created_at = Column("createdAt", BigInteger)
