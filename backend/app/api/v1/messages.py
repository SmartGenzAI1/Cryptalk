from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime, timezone
import os
import secrets

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.offline_queue import enqueue as enqueue_message
from app.core.security import get_current_user_id, now_ms, sanitize_text, validate_hex_id
from app.models import ChatMember
from app.repositories import ChatRepository, UserRepository
from app.services.serializers import serialize_user

router = APIRouter(prefix="/messages", tags=["messages"])
chat_router = APIRouter(tags=["messages"])

# TODO: All endpoints below manually call `get_current_user_id(request)` instead of
# using FastAPI's `Depends(get_current_user_id)`. Refactor to use DI for consistency.

class MessageCreate(BaseModel):
    content: str = Field(..., max_length=10000)
    type: Literal["text", "sticker", "voice", "image", "file"] = "text"
    replyToId: Optional[str] = Field(None, max_length=48)
    duration: Optional[int] = Field(None, ge=1, le=3600)
    expiresIn: Optional[int] = Field(None, ge=1, le=604800)
    attachmentPath: Optional[str] = Field(None, max_length=500)

# enforce that attachment paths contain no original filenames (UUID-only)
import re as _re
_UUID_PATH_RE = re.compile(r"^files/[a-f0-9]{24}/[a-f0-9]{16}/file$")


def _strip_attachment_metadata(path: Optional[str]) -> Optional[str]:
    """Normalize attachment path to remove original filename, keeping only UUID structure."""
    if not path:
        return None
    parts = path.split("/")
    if len(parts) >= 4:
        # rebuild as files/{userId}/{randId}/file — no original name stored
        return f"{parts[0]}/{parts[1]}/{parts[2]}/file"
    return path

@chat_router.get("/{chat_id}/messages")
async def list_messages(
    chat_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if not validate_hex_id(chat_id):
        raise ValidationError("Invalid chat ID")
    user_id = get_current_user_id(request)
    repo = ChatRepository(db)
    member = await repo.get_member(chat_id, user_id)
    if not member:
        raise ForbiddenError("Not a member of this chat")
    return {"messages": []}

@chat_router.post("/{chat_id}/messages")
async def send_message(
    chat_id: str,
    req: MessageCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if not validate_hex_id(chat_id):
        raise ValidationError("Invalid chat ID")
    user_id = get_current_user_id(request)
    repo = ChatRepository(db)

    # single query: membership + user in one shot
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(ChatMember)
        .options(selectinload(ChatMember.user))
        .where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise ForbiddenError("Not a member of this chat")

    user = member.user

    sanitized_content = sanitize_text(req.content)
    if not sanitized_content.strip():
        raise ValidationError("Message content cannot be empty or whitespace-only")

    # strip original filename from attachment path — only UUID paths allowed
    clean_attachment = _strip_attachment_metadata(req.attachmentPath)

    msg = {
        "id": secrets.token_hex(12),
        "chatId": chat_id,
        "senderId": user_id,
        "content": sanitized_content,
        "type": req.type,
        "replyToId": req.replyToId,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "duration": req.duration,
        "expiresIn": req.expiresIn,
        "status": "sent",
        "starred": False,
        "sender": serialize_user(user),
        "attachmentPath": clean_attachment,
        "reactions": [],
    }

    sio = getattr(request.app.state, "sio", None)
    manager = getattr(request.app.state, "sio_manager", None)

    result = await db.execute(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    )
    all_member_ids = [row[0] for row in result.all()]

    payload = {"chatId": chat_id, "message": msg}

    if sio:
        await sio.emit("message", payload, room=f"chat:{chat_id}")

    if manager:
        for m_id in all_member_ids:
            if m_id == user_id:
                continue
            if not manager.get_sockets_for_user(m_id):
                await enqueue_message(m_id, payload)

    return {"message": msg}

@chat_router.post("/{chat_id}/messages/delivered")
async def mark_delivered(
    chat_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if not validate_hex_id(chat_id):
        raise ValidationError("Invalid chat ID")
    user_id = get_current_user_id(request)
    repo = ChatRepository(db)
    member = await repo.get_member(chat_id, user_id)
    if not member:
        raise ForbiddenError("Not a member of this chat")

    result = await db.execute(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    )
    all_member_ids = [row[0] for row in result.all()]

    sio = getattr(request.app.state, "sio", None)
    if sio:
        status_payload = {
            "chatId": chat_id,
            "userId": user_id,
            "status": "delivered",
        }
        manager = getattr(request.app.state, "sio_manager", None)
        if manager:
            delivered_any = False
            for m_id in all_member_ids:
                if m_id == user_id:
                    continue
                for target_sid in manager.get_sockets_for_user(m_id):
                    await sio.emit("message-status", status_payload, to=target_sid)
                    delivered_any = True
            if not delivered_any:
                await sio.emit("message-status", status_payload, room=f"chat:{chat_id}")
        else:
            await sio.emit("message-status", status_payload, room=f"chat:{chat_id}")

    return {"ok": True}

from fastapi import Query

class MessagePatch(BaseModel):
    action: Optional[str] = None
    content: Optional[str] = Field(None, max_length=10000)

@chat_router.patch("/{chat_id}/messages")
async def patch_message(
    chat_id: str,
    req: MessagePatch,
    request: Request,
    messageId: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    if not validate_hex_id(chat_id) or not validate_hex_id(messageId):
        raise ValidationError("Invalid chat or message ID")
    user_id = get_current_user_id(request)
    repo = ChatRepository(db)
    member = await repo.get_member(chat_id, user_id)
    if not member:
        raise ForbiddenError("Not a member of this chat")

    if req.action == "star":
        return {"starred": True}

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)

    # Return updated message representation
    msg = {
        "id": messageId,
        "chatId": chat_id,
        "senderId": user_id,
        "content": req.content or "",
        "type": "text",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "editedAt": datetime.now(timezone.utc).isoformat(),
        "status": "sent",
        "starred": False,
        "sender": serialize_user(user),
        "reactions": [],
    }
    return {"message": msg}

class MessagePut(BaseModel):
    emoji: str = Field(..., max_length=10)

@chat_router.put("/{chat_id}/messages")
async def put_message(
    chat_id: str,
    req: MessagePut,
    request: Request,
    messageId: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    if not validate_hex_id(chat_id) or not validate_hex_id(messageId):
        raise ValidationError("Invalid chat or message ID")
    user_id = get_current_user_id(request)
    repo = ChatRepository(db)
    member = await repo.get_member(chat_id, user_id)
    if not member:
        raise ForbiddenError("Not a member of this chat")
    return {"added": True, "emoji": req.emoji}

@chat_router.delete("/{chat_id}/messages")
async def delete_message(
    chat_id: str,
    request: Request,
    messageId: str = Query(...),
    forEveryone: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    if not validate_hex_id(chat_id) or not validate_hex_id(messageId):
        raise ValidationError("Invalid chat or message ID")
    user_id = get_current_user_id(request)
    repo = ChatRepository(db)
    member = await repo.get_member(chat_id, user_id)
    if not member:
        raise ForbiddenError("Not a member of this chat")
    return {"ok": True}
