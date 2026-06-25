# dependency injection — wire repositories and services to fastapi deps

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories import (
    ChatRepository,
    MessageRepository,
    ReactionRepository,
    StarredMessageRepository,
    UserRepository,
)
from app.services.auth_service import AuthService
from app.services.chat_service import ChatService
from app.services.message_service import MessageService
from app.services.user_service import UserService


# repository factories

def get_user_repo(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


def get_chat_repo(db: AsyncSession = Depends(get_db)) -> ChatRepository:
    return ChatRepository(db)


def get_message_repo(db: AsyncSession = Depends(get_db)) -> MessageRepository:
    return MessageRepository(db)


def get_reaction_repo(db: AsyncSession = Depends(get_db)) -> ReactionRepository:
    return ReactionRepository(db)


def get_star_repo(db: AsyncSession = Depends(get_db)) -> StarredMessageRepository:
    return StarredMessageRepository(db)


# service factories

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
    message_repo: MessageRepository = Depends(get_message_repo),
) -> ChatService:
    return ChatService(chat_repo, user_repo, message_repo)


def get_message_service(
    message_repo: MessageRepository = Depends(get_message_repo),
    chat_repo: ChatRepository = Depends(get_chat_repo),
    reaction_repo: ReactionRepository = Depends(get_reaction_repo),
    star_repo: StarredMessageRepository = Depends(get_star_repo),
) -> MessageService:
    return MessageService(message_repo, chat_repo, reaction_repo, star_repo)
