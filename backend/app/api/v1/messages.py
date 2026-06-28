# message endpoints — minimal in ephemeral arch.
# messages flow through WebSocket, not HTTP.
# only mark-read (for unread badges) uses HTTP.

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenError
from app.core.security import get_current_user_id, now_ms
from app.repositories import ChatRepository

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("/{chat_id}/mark-read")
async def mark_read(chat_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)
    repo = ChatRepository(db)
    member = await repo.get_member(chat_id, user_id)
    if not member:
        raise ForbiddenError("Not a member of this chat")
    await repo.update_member(member.id, last_read_at=now_ms())
    return {"ok": True}
