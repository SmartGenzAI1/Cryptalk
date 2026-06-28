# dependency injection — wire repositories and services to FastAPI deps

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories import ChatRepository, UserRepository
from app.services.auth_service import AuthService
from app.services.chat_service import ChatService
from app.services.user_service import UserService


def get_user_repo(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


def get_chat_repo(db: AsyncSession = Depends(get_db)) -> ChatRepository:
    return ChatRepository(db)


def get_auth_service(
    user_repo: UserRepository = Depends(get_user_repo),
    chat_repo: ChatRepository = Depends(get_chat_repo),
) -> AuthService:
    return AuthService(user_repo, chat_repo)


def get_user_service(
    user_repo: UserRepository = Depends(get_user_repo),
) -> UserService:
    return UserService(user_repo)


def get_chat_service(
    chat_repo: ChatRepository = Depends(get_chat_repo),
    user_repo: UserRepository = Depends(get_user_repo),
) -> ChatService:
    return ChatService(chat_repo, user_repo)
