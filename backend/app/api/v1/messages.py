from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import secrets

from app.core.database import get_db
from app.core.exceptions import ForbiddenError
from app.core.security import get_current_user_id, now_ms
from app.repositories import ChatRepository, UserRepository
from app.services.serializers import serialize_user

router = APIRouter(prefix="/messages", tags=["messages"])
chat_router = APIRouter(tags=["messages"])

class MessageCreate(BaseModel):
    content: str
    type: str = "text"
    replyToId: Optional[str] = None
    duration: Optional[int] = None
    expiresIn: Optional[int] = None
    attachmentPath: Optional[str] = None

@chat_router.get("/{chat_id}/messages")
async def list_messages(
    chat_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
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
    user_id = get_current_user_id(request)
    repo = ChatRepository(db)
    member = await repo.get_member(chat_id, user_id)
    if not member:
        raise ForbiddenError("Not a member of this chat")

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)

    msg = {
        "id": secrets.token_hex(12),
        "chatId": chat_id,
        "senderId": user_id,
        "content": req.content,
        "type": req.type,
        "replyToId": req.replyToId,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "duration": req.duration,
        "expiresIn": req.expiresIn,
        "status": "sent",
        "starred": False,
        "sender": serialize_user(user),
        "reactions": [],
    }
    return {"message": msg}

@chat_router.post("/{chat_id}/messages/delivered")
async def mark_delivered(
    chat_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user_id = get_current_user_id(request)
    repo = ChatRepository(db)
    member = await repo.get_member(chat_id, user_id)
    if not member:
        raise ForbiddenError("Not a member of this chat")
    return {"ok": True}

@router.post("/{chat_id}/mark-read")
async def mark_read(chat_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)
    repo = ChatRepository(db)
    member = await repo.get_member(chat_id, user_id)
    if not member:
        raise ForbiddenError("Not a member of this chat")
    await repo.update_member(member.id, last_read_at=now_ms())
    return {"ok": True}
