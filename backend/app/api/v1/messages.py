# message endpoints — list, send, edit, delete, react, star, forward

from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from app.core.security import get_current_user_id
from app.schemas import ForwardRequest, MessageCreate, MessageEdit, ReactionToggle
from app.services.deps import get_message_service
from app.services.message_service import MessageService

# messages live under /api/{chat_id}/messages to match the frontend's URL scheme.
# starred + forward endpoints are mounted at /api/messages/*.
chat_router = APIRouter(tags=["messages"])
misc_router = APIRouter(prefix="/messages", tags=["messages"])


# per-chat message endpoints


@chat_router.get("/{chat_id}/messages")
async def list_messages(
    chat_id: str,
    before: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    user_id: str = Depends(get_current_user_id),
    service: MessageService = Depends(get_message_service),
):
    messages = await service.list(chat_id, user_id, before, q, limit)
    return {"messages": messages}


@chat_router.post("/{chat_id}/messages")
async def send_message(
    chat_id: str,
    req: MessageCreate,
    user_id: str = Depends(get_current_user_id),
    service: MessageService = Depends(get_message_service),
):
    msg = await service.send(
        chat_id, user_id, req.content, req.type, req.reply_to_id, req.duration, req.expires_in,
        req.attachment_path,
    )
    return {"message": msg}


@chat_router.post("/{chat_id}/messages/delivered")
async def mark_delivered(
    chat_id: str,
    user_id: str = Depends(get_current_user_id),
    service: MessageService = Depends(get_message_service),
):
    return await service.mark_delivered(chat_id, user_id)


@chat_router.post("/{chat_id}/messages/read")
async def mark_read(
    chat_id: str,
    message_id: str = Query(..., alias="messageId"),
    user_id: str = Depends(get_current_user_id),
    service: MessageService = Depends(get_message_service),
):
    return {"message": await service.mark_read(chat_id, message_id, user_id)}


@chat_router.patch("/{chat_id}/messages")
async def edit_or_star_message(
    chat_id: str,
    req: MessageEdit,
    message_id: str = Query(..., alias="messageId"),
    user_id: str = Depends(get_current_user_id),
    service: MessageService = Depends(get_message_service),
):
    return await service.edit_or_star(chat_id, message_id, user_id, req.content, req.action)


@chat_router.delete("/{chat_id}/messages")
async def delete_message(
    chat_id: str,
    message_id: str = Query(..., alias="messageId"),
    user_id: str = Depends(get_current_user_id),
    service: MessageService = Depends(get_message_service),
    for_everyone: bool = Query(False, alias="forEveryone"),
):
    return await service.delete(chat_id, message_id, user_id, for_everyone)


@chat_router.put("/{chat_id}/messages")
async def toggle_reaction(
    chat_id: str,
    req: ReactionToggle,
    message_id: str = Query(..., alias="messageId"),
    user_id: str = Depends(get_current_user_id),
    service: MessageService = Depends(get_message_service),
):
    return await service.toggle_reaction(chat_id, message_id, user_id, req.emoji)


# cross-chat endpoints


@misc_router.get("/starred")
async def list_starred(
    user_id: str = Depends(get_current_user_id),
    service: MessageService = Depends(get_message_service),
):
    return {"starred": await service.list_starred(user_id)}


@misc_router.post("/forward")
async def forward_message(
    req: ForwardRequest,
    user_id: str = Depends(get_current_user_id),
    service: MessageService = Depends(get_message_service),
):
    forwarded = await service.forward(req.message_id, req.target_chat_ids, user_id)
    return {"forwarded": forwarded}
