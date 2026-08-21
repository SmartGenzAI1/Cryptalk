# ORM models — ephemeral architecture
# only auth, profiles, membership, and social data live in the DB.
# messages are relay-only (WebSocket), never persisted.

from sqlalchemy import (
    Boolean, Column, ForeignKey, Integer, BigInteger, String, Text,
    UniqueConstraint, Index, DateTime,
)
from sqlalchemy.orm import relationship
from sqlalchemy import JSON as SAJSON

from app.core.database import Base


class User(Base):
    __tablename__ = "User"

    id = Column(String(32), primary_key=True)
    # email is stored Fernet-encrypted; emailLookup holds a keyed HMAC-SHA256
    # digest of the normalized address for equality lookups (never plaintext)
    email = Column(String(512), unique=True, nullable=True, index=True)
    email_lookup = Column("emailLookup", String(64), unique=True, nullable=True, index=True)
    username = Column(String(30), unique=True, nullable=True, index=True)
    name = Column(String(100), nullable=True)
    password_hash = Column("passwordHash", String(256), nullable=False)
    bio = Column(String(500), default="")
    avatar = Column(String(512), nullable=True)
    is_online = Column("isOnline", Boolean, default=False)
    is_onboarded = Column("isOnboarded", Boolean, default=False)
    last_seen = Column("lastSeen", BigInteger)
    created_at = Column("createdAt", BigInteger)
    updated_at = Column("updatedAt", BigInteger)
    last_active_at = Column("lastActiveAt", DateTime, nullable=True, index=True)

    identity_public_key = Column("identityPublicKey", String(1024), nullable=True)
    signing_public_key = Column("signingPublicKey", String(1024), nullable=True)
    signed_prekey_public = Column("signedPreKeyPublic", String(2048), nullable=True)
    signed_prekey_signature = Column("signedPreKeySignature", String(1024), nullable=True)

    # push notification registration (token stored Fernet-encrypted)
    push_token = Column("pushToken", String(1024), nullable=True)
    push_platform = Column("pushPlatform", String(16), nullable=True)

    # email verification & password reset
    is_email_verified = Column("isEmailVerified", Boolean, default=False)
    email_verification_token = Column("emailVerificationToken", String(128), nullable=True, index=True)
    password_reset_token = Column("passwordResetToken", String(128), nullable=True, index=True)
    password_reset_expires = Column("passwordResetExpires", BigInteger, nullable=True)

    # opt-in privacy fields
    last_seen_opt_in = Column("lastSeenOptIn", Boolean, default=False)
    privacy_settings = Column("privacySettings", SAJSON, nullable=True)
    data_retention_consent = Column("dataRetentionConsent", Boolean, default=False)

    memberships = relationship("ChatMember", back_populates="user")
    created_chats = relationship("Chat", back_populates="creator")


class Chat(Base):
    __tablename__ = "Chat"

    id = Column(String(32), primary_key=True)
    type = Column(String(20), default="direct")
    title = Column(String(200), nullable=False)
    description = Column(String(500), default="")
    created_by = Column("createdBy", String(32), ForeignKey("User.id", ondelete="SET NULL"))
    created_at = Column("createdAt", BigInteger)
    updated_at = Column("updatedAt", BigInteger)
    expires_at = Column("expiresAt", BigInteger, nullable=True)
    invite_token = Column("inviteToken", String(64), nullable=True, index=True)
    invite_token_expiry = Column("inviteTokenExpiry", BigInteger, nullable=True)

    members = relationship("ChatMember", back_populates="chat", cascade="all, delete-orphan")
    creator = relationship("User", back_populates="created_chats", foreign_keys=[created_by])


class ChatMember(Base):
    __tablename__ = "ChatMember"
    __table_args__ = (
        UniqueConstraint("chatId", "userId", name="uq_chat_member"),
    )

    id = Column(String(32), primary_key=True)
    chat_id = Column("chatId", String(32), ForeignKey("Chat.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column("userId", String(32), ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), default="member")  # owner | admin | member
    joined_at = Column("joinedAt", BigInteger)
    last_read_at = Column("lastReadAt", BigInteger)
    pinned_at = Column("pinnedAt", BigInteger, nullable=True)
    muted = Column("muted", Boolean, default=False)
    chat_key = Column("chatKey", String(2048), nullable=True)

    chat = relationship("Chat", back_populates="members")
    user = relationship("User", back_populates="memberships")


class UserBlock(Base):
    __tablename__ = "UserBlock"
    __table_args__ = (
        UniqueConstraint("blockerId", "blockedId", name="uq_user_block"),
    )

    id = Column(String(32), primary_key=True)
    blocker_id = Column("blockerId", String(32), ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_id = Column("blockedId", String(32), ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column("createdAt", BigInteger)


class UserNickname(Base):
    __tablename__ = "UserNickname"
    __table_args__ = (
        UniqueConstraint("ownerId", "targetUserId", name="uq_user_nickname"),
        Index("ix_usernickname_target", "targetUserId"),
    )

    id = Column(String(32), primary_key=True)
    owner_id = Column("ownerId", String(32), ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    target_user_id = Column("targetUserId", String(32), ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    nickname = Column(String(100), nullable=False)
    created_at = Column("createdAt", BigInteger)


class ConnectionRequest(Base):
    __tablename__ = "ConnectionRequest"
    __table_args__ = (
        UniqueConstraint("fromUserId", "toUserId", name="uq_connection_request"),
        Index("ix_connectionrequest_status", "status"),
    )

    id = Column(String(32), primary_key=True)
    from_user_id = Column("fromUserId", String(32), ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    to_user_id = Column("toUserId", String(32), ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), default="pending")
    created_at = Column("createdAt", BigInteger)


class Report(Base):
    __tablename__ = "Report"
    __table_args__ = (
        Index("ix_report_status", "status"),
        Index("ix_report_reported", "reportedId"),
    )

    id = Column(String(32), primary_key=True)
    reporter_id = Column("reporterId", String(32), ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    reported_id = Column("reportedId", String(32), ForeignKey("User.id", ondelete="CASCADE"), nullable=True)
    chat_id = Column("chatId", String(32), nullable=True)
    reason = Column(String(1000), nullable=False)
    status = Column(String(20), default="pending")
    created_at = Column("createdAt", BigInteger)
