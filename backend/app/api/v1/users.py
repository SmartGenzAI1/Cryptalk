# user endpoints — search, profile, settings

from typing import List

from fastapi import APIRouter, Depends, Query

from app.core.security import get_current_user_id
from app.schemas import UserUpdate
from app.services.deps import get_user_service
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_me(
    user_id: str = Depends(get_current_user_id),
    service: UserService = Depends(get_user_service),
):
    return {"user": await service.get_me(user_id)}


@router.patch("/me")
async def update_me(
    req: UserUpdate,
    user_id: str = Depends(get_current_user_id),
    service: UserService = Depends(get_user_service),
):
    return {"user": await service.update(user_id, **req.model_dump(exclude_none=True))}


@router.get("/search")
async def search_users(
    q: str = Query("", min_length=0),
    user_id: str = Depends(get_current_user_id),
    service: UserService = Depends(get_user_service),
):
    users = await service.search(q, user_id)
    return {"users": users}
