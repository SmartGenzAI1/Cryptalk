# chat endpoints — list, create, get, settings

from fastapi import APIRouter, Depends

from app.core.security import get_current_user_id
from app.schemas import ChatCreate, ChatSettingsUpdate
from app.services.chat_service import ChatService
from app.services.deps import get_chat_service

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("")
async def list_chats(
    user_id: str = Depends(get_current_user_id),
    service: ChatService = Depends(get_chat_service),
):
    chats = await service.list_for_user(user_id)
    return {"chats": chats}


@router.post("")
async def create_chat(
    req: ChatCreate,
    user_id: str = Depends(get_current_user_id),
    service: ChatService = Depends(get_chat_service),
):
    chat = await service.create(
        user_id=user_id,
        chat_type=req.type,
        title=req.title,
        description=req.description,
        member_ids=req.member_ids,
        avatar_emoji=req.avatar_emoji,
        avatar_color=req.avatar_color,
        expires_in_days=req.expires_in_days,
        member_keys=req.member_keys,
    )
    return {"chat": chat}


@router.get("/{chat_id}")
async def get_chat(
    chat_id: str,
    user_id: str = Depends(get_current_user_id),
    service: ChatService = Depends(get_chat_service),
):
    return {"chat": await service.get_chat(chat_id, user_id)}


@router.patch("/{chat_id}/settings")
async def update_settings(
    chat_id: str,
    req: ChatSettingsUpdate,
    user_id: str = Depends(get_current_user_id),
    service: ChatService = Depends(get_chat_service),
):
    return await service.update_settings(
        chat_id, user_id, req.action, req.value, req.message_id,
    )
