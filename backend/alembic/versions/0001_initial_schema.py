"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "User",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("email", sa.String(254), unique=True, nullable=True, index=True),
        sa.Column("username", sa.String(30), unique=True, nullable=True, index=True),
        sa.Column("name", sa.String(100), nullable=True),
        sa.Column("passwordHash", sa.String(256), nullable=False),
        sa.Column("bio", sa.String(500), server_default=""),
        sa.Column("isOnline", sa.Boolean(), server_default=sa.text("0")),
        sa.Column("isOnboarded", sa.Boolean(), server_default=sa.text("0")),
        sa.Column("lastSeen", sa.BigInteger(), nullable=True),
        sa.Column("createdAt", sa.BigInteger(), nullable=True),
        sa.Column("updatedAt", sa.BigInteger(), nullable=True),
        sa.Column("identityPublicKey", sa.String(1024), nullable=True),
        sa.Column("signingPublicKey", sa.String(1024), nullable=True),
        sa.Column("signedPreKeyPublic", sa.String(2048), nullable=True),
        sa.Column("signedPreKeySignature", sa.String(1024), nullable=True),
        sa.Column("pushToken", sa.String(512), nullable=True),
        sa.Column("pushPlatform", sa.String(16), nullable=True),
    )

    op.create_table(
        "Chat",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("type", sa.String(20), server_default="direct"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.String(500), server_default=""),
        sa.Column("createdBy", sa.String(32), sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("createdAt", sa.BigInteger(), nullable=True),
        sa.Column("updatedAt", sa.BigInteger(), nullable=True),
        sa.Column("expiresAt", sa.BigInteger(), nullable=True),
        sa.Column("inviteToken", sa.String(64), nullable=True, index=True),
        sa.Column("inviteTokenExpiry", sa.BigInteger(), nullable=True),
    )

    op.create_table(
        "ChatMember",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("chatId", sa.String(32), sa.ForeignKey("Chat.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("userId", sa.String(32), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.String(20), server_default="member"),
        sa.Column("joinedAt", sa.BigInteger(), nullable=True),
        sa.Column("lastReadAt", sa.BigInteger(), nullable=True),
        sa.Column("pinnedAt", sa.BigInteger(), nullable=True),
        sa.Column("muted", sa.Boolean(), server_default=sa.text("0")),
        sa.Column("chatKey", sa.String(2048), nullable=True),
        sa.UniqueConstraint("chatId", "userId", name="uq_chat_member"),
    )

    op.create_table(
        "UserBlock",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("blockerId", sa.String(32), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("blockedId", sa.String(32), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("createdAt", sa.BigInteger(), nullable=True),
        sa.UniqueConstraint("blockerId", "blockedId", name="uq_user_block"),
    )

    op.create_table(
        "UserNickname",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("ownerId", sa.String(32), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("targetUserId", sa.String(32), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nickname", sa.String(100), nullable=False),
        sa.Column("createdAt", sa.BigInteger(), nullable=True),
        sa.UniqueConstraint("ownerId", "targetUserId", name="uq_user_nickname"),
        sa.Index("ix_usernickname_target", "targetUserId"),
    )

    op.create_table(
        "ConnectionRequest",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("fromUserId", sa.String(32), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("toUserId", sa.String(32), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("createdAt", sa.BigInteger(), nullable=True),
        sa.UniqueConstraint("fromUserId", "toUserId", name="uq_connection_request"),
        sa.Index("ix_connectionrequest_status", "status"),
    )

    op.create_table(
        "Report",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("reporterId", sa.String(32), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("reportedId", sa.String(32), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=True),
        sa.Column("chatId", sa.String(32), nullable=True),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("createdAt", sa.BigInteger(), nullable=True),
        sa.Index("ix_report_status", "status"),
        sa.Index("ix_report_reported", "reportedId"),
    )


def downgrade() -> None:
    op.drop_table("Report")
    op.drop_table("ConnectionRequest")
    op.drop_table("UserNickname")
    op.drop_table("UserBlock")
    op.drop_table("ChatMember")
    op.drop_table("Chat")
    op.drop_table("User")
