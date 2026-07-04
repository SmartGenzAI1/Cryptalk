# ORM to dict serializers — ephemeral arch
# no message/reaction serializers since messages don't touch the DB

from typing import Any, Dict, List, Optional

from app.core.security import ms_to_iso
from app.models import Chat, ChatMember, User

def _get_deterministic_avatar(seed: str, is_chat: bool = False) -> tuple[str, str]:
    h = 0
    for char in (seed or "default"):
        h = ord(char) + ((h << 5) - h)
    h = abs(h)
    
    colors = ["emerald", "violet", "rose", "amber", "cyan", "lime", "purple", "teal"]
    color = colors[h % len(colors)]
    
    if is_chat:
        return color, "chat"
        
    icons = [
        "fox", "cat", "dog", "bird", "fish", "lion", "panda", "unicorn",
        "giraffe", "elephant", "rabbit", "owl", "bear", "frog", "turtle",
        "dolphin", "butterfly", "dragon", "dinosaur", "hedgehog", "parrot",
        "horse", "cow", "chicken", "duck", "crab", "octopus", "jellyfish",
    ]
    emoji = icons[(h + 1) % len(icons)]
    return color, emoji

def serialize_user(u: Optional[User]) -> Optional[Dict[str, Any]]:
    if u is None:
        return None
    
    seed = u.username or u.id or "default"
    det_color, det_emoji = _get_deterministic_avatar(seed)
    
    return {
        "id": u.id,
        "email": u.email,
        "username": u.username,
        "name": u.name,
        "bio": u.bio or "",
        "avatarColor": det_color,
        "avatarEmoji": det_emoji,
        "isOnline": bool(u.is_online),
        "isOnboarded": bool(u.is_onboarded) if hasattr(u, 'is_onboarded') else True,
        "lastSeen": ms_to_iso(u.last_seen),
        "accentColor": "emerald",
        "wallpaper": "dots",
        "hasE2EEKeys": bool(u.identity_public_key),
    }

def serialize_member(m: ChatMember) -> Dict[str, Any]:
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

def serialize_chat(
    chat: Chat,
    member: ChatMember,
) -> Dict[str, Any]:
    seed = chat.title or chat.id or "group"
    det_color, det_emoji = _get_deterministic_avatar(seed, is_chat=True)
    if chat.type == "saved":
        det_color, det_emoji = "emerald", "bookmark"
        
    return {
        "id": chat.id,
        "type": chat.type,
        "title": chat.title,
        "description": chat.description or "",
        "avatarColor": det_color,
        "avatarEmoji": det_emoji,
        "createdBy": chat.created_by or "",
        "createdAt": ms_to_iso(chat.created_at),
        "updatedAt": ms_to_iso(chat.updated_at),
        "expiresAt": ms_to_iso(chat.expires_at) if hasattr(chat, 'expires_at') and chat.expires_at else None,
        "lastReadAt": ms_to_iso(member.last_read_at),
        "role": member.role,
        "pinnedAt": ms_to_iso(member.pinned_at) if member.pinned_at else None,
        "muted": bool(member.muted),
        "chatKey": member.chat_key,
        "members": [serialize_member(m) for m in (chat.members or [])],
    }
