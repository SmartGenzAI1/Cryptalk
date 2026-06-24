"""Auth endpoints — register, login, logout, me."""

from fastapi import APIRouter, Depends, Request, Response

from app.core.security import get_current_user_id
from app.schemas import LoginRequest, RegisterRequest
from app.services.auth_service import AuthService
from app.services.deps import get_auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(
    req: RegisterRequest,
    response: Response,
    service: AuthService = Depends(get_auth_service),
):
    user = await service.register(req.username, req.name, req.password, response)
    return {"user": user}


@router.post("/login")
async def login(
    req: LoginRequest,
    response: Response,
    service: AuthService = Depends(get_auth_service),
):
    user = await service.login(req.username, req.password, response)
    return {"user": user}


@router.post("/logout")
async def logout(
    response: Response,
    service: AuthService = Depends(get_auth_service),
):
    await service.logout(response)
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    from app.core.security import verify_session_token
    from app.core.config import settings
    token = request.cookies.get(settings.COOKIE_NAME)
    if not token:
        return {"user": None}
    user_id = verify_session_token(token)
    if not user_id:
        return {"user": None}
    # Fetch user via service
    from app.services.deps import get_user_service
    # We can't use Depends inside a non-dep function, so do a manual lookup
    from app.core.database import async_session_factory
    from app.repositories import UserRepository
    from app.services.serializers import serialize_user
    async with async_session_factory() as db:
        repo = UserRepository(db)
        user = await repo.get_by_id(user_id)
        return {"user": serialize_user(user) if user else None}
