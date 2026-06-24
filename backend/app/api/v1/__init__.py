from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.chats import router as chats_router
from app.api.v1.e2ee import router as e2ee_router
from app.api.v1.messages import chat_router as messages_chat_router
from app.api.v1.messages import misc_router as messages_misc_router
from app.api.v1.social import router as social_router
from app.api.v1.users import router as users_router

api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(social_router)
api_router.include_router(chats_router)
api_router.include_router(e2ee_router)
api_router.include_router(messages_chat_router)
api_router.include_router(messages_misc_router)
