"""Serializers — convert ORM objects to plain dicts for the API response.

Keeping all serialization in one place ensures consistent field naming
(camelCase for the API) and prevents leaking internal fields.
"""

import json
from typing import Any, Dict, List, Optional

from app.core.security import ms_to_iso
from app.models import Chat, ChatMember, Message, Reaction, User


def serialize_user(u: Optional[User]) -> Optional[Dict[str, Any]]:
    if u is None:
        return None
    return {
        "id": u.id,
        "email": u.email,
        "username": u.username,
        "name": u.name,
        "bio": u.bio or "",
        "avatarColor": u.avatar_color or "emerald",
        "avatarEmoji": u.avatar_emoji or "fox",
        "isOnline": bool(u.is_online),
        "isOnboarded": bool(u.is_onboarded) if hasattr(u, 'is_onboarded') else True,
        "lastSeen": ms_to_iso(u.last_seen),
        "accentColor": u.accent_color or "emerald",
        "wallpaper": u.wallpaper or "dots",
        "hasE2EEKeys": bool(u.identity_public_key),
    }


def serialize_member(m: ChatMember, users_online: Optional[set] = None) -> Dict[str, Any]:
    data = {
        "id": m.id,
        "role": m.role,
        "user": serialize_user(m.user),
        "lastReadAt": ms_to_iso(m.last_read_at),
    }
    if hasattr(m, "pinned_at"):
        data["pinnedAt"] = ms_to_iso(m.pinned_at) if m.pinned_at else None
    if hasattr(m, "muted"):
        data["muted"] = bool(m.muted)
    return data


def serialize_reaction(r: Reaction) -> Dict[str, Any]:
    return {
        "id": r.id,
        "emoji": r.emoji,
        "user": serialize_user(r.user),
    }


def serialize_message(
    m: Message,
    starred: bool = False,
) -> Dict[str, Any]:
    reply_to = None
    if m.reply_to:
        reply_to = {
            "id": m.reply_to.id,
            "content": m.reply_to.content,
            "type": m.reply_to.type,
            "senderId": m.reply_to.sender_id,
            "senderName": m.reply_to.sender.name if m.reply_to.sender else "",
        }
    return {
        "id": m.id,
        "chatId": m.chat_id,
        "senderId": m.sender_id,
        "content": m.content,
        "type": m.type,
        "replyToId": m.reply_to_id,
        "replyTo": reply_to,
        "editedAt": ms_to_iso(m.edited_at) if m.edited_at else None,
        "createdAt": ms_to_iso(m.created_at),
        "deletedAt": ms_to_iso(m.deleted_at) if m.deleted_at else None,
        "duration": m.duration,
        "expiresIn": m.expires_in,
        "expiresAt": ms_to_iso(m.created_at + (m.expires_in * 1000)) if m.expires_in else None,
        "status": m.status or "sent",
        "readBy": json.loads(m.read_by) if m.read_by else [],
        "starred": starred,
        "sender": serialize_user(m.sender),
        "reactions": [serialize_reaction(r) for r in (m.reactions or [])],
    }


def serialize_chat(
    chat: Chat,
    member: ChatMember,
    last_message: Optional[Message] = None,
    unread_count: int = 0,
) -> Dict[str, Any]:
    return {
        "id": chat.id,
        "type": chat.type,
        "title": chat.title,
        "description": chat.description or "",
        "avatarColor": chat.avatar_color or "emerald",
        "avatarEmoji": chat.avatar_emoji or "chat",
        "createdBy": chat.created_by or "",
        "createdAt": ms_to_iso(chat.created_at),
        "updatedAt": ms_to_iso(chat.updated_at),
        "expiresAt": ms_to_iso(chat.expires_at) if hasattr(chat, 'expires_at') and chat.expires_at else None,
        "lastReadAt": ms_to_iso(member.last_read_at),
        "role": member.role,
        "pinnedAt": ms_to_iso(member.pinned_at) if member.pinned_at else None,
        "muted": bool(member.muted),
        "unreadCount": unread_count,
        "members": [serialize_member(m) for m in (chat.members or [])],
        "lastMessage": _serialize_last_message(last_message),
    }


def _serialize_last_message(msg: Optional[Message]) -> Optional[Dict[str, Any]]:
    if msg is None:
        return None
    return {
        "id": msg.id,
        "content": msg.content,
        "type": msg.type,
        "createdAt": ms_to_iso(msg.created_at),
        "senderId": msg.sender_id,
        "senderName": msg.sender.name if msg.sender else "",
        "duration": msg.duration,
    }
