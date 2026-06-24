"""Socket.IO event handlers — thin wrappers around the connection manager.

Each handler validates the payload, mutates the manager, and emits the
appropriate broadcast.  Business logic stays in the service layer; this
module only deals with realtime transport.
"""

import logging
from datetime import datetime, timezone

import socketio

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.security import now_ms
from app.models import User
from app.realtime.connection_manager import manager
from sqlalchemy import select, update

logger = logging.getLogger("zchat.realtime")


def register_handlers(sio: socketio.AsyncServer) -> None:
    """Register all Socket.IO event handlers on the given server."""

    @sio.event
    async def connect(sid: str, environ: dict) -> None:
        logger.info("Socket connected: %s", sid)

    @sio.on("identify")
    async def on_identify(sid: str, data: dict) -> None:
        user_id = data.get("userId")
        if not user_id:
            return
        newly_online = manager.add(sid, user_id)

        if newly_online:
            # Persist online status and notify everyone
            async with async_session_factory() as db:
                await db.execute(
                    update(User)
                    .where(User.id == user_id)
                    .values(is_online=True, last_seen=now_ms())
                )
                await db.commit()
            await sio.emit("user-status", {"userId": user_id, "isOnline": True})

        # Send current presence list to the newly connected client
        await sio.emit(
            "presence",
            {"users": [{"userId": uid, "isOnline": True} for uid in manager.all_online_user_ids()]},
            to=sid,
        )

    @sio.on("join-chat")
    async def on_join_chat(sid: str, data: dict) -> None:
        chat_id = data.get("chatId")
        if chat_id:
            await sio.enter_room(sid, f"chat:{chat_id}")

    @sio.on("leave-chat")
    async def on_leave_chat(sid: str, data: dict) -> None:
        chat_id = data.get("chatId")
        if chat_id:
            await sio.leave_room(sid, f"chat:{chat_id}")

    @sio.on("send-message")
    async def on_send_message(sid: str, data: dict) -> None:
        chat_id = data.get("chatId")
        message = data.get("message")
        if chat_id and message:
            await sio.emit(
                "message",
                {"chatId": chat_id, "message": message},
                room=f"chat:{chat_id}",
            )

    @sio.on("typing")
    async def on_typing(sid: str, data: dict) -> None:
        chat_id = data.get("chatId")
        if chat_id:
            await sio.emit("typing", data, room=f"chat:{chat_id}", skip_sid=sid)

    @sio.on("message-status")
    async def on_message_status(sid: str, data: dict) -> None:
        """Broadcast message delivery/read status updates."""
        chat_id = data.get("chatId")
        if chat_id:
            await sio.emit("message-status", data, room=f"chat:{chat_id}")

    @sio.on("recording")
    async def on_recording(sid: str, data: dict) -> None:
        """Voice recording indicator."""
        chat_id = data.get("chatId")
        if chat_id:
            await sio.emit("recording", data, room=f"chat:{chat_id}", skip_sid=sid)

    @sio.on("reaction")
    async def on_reaction(sid: str, data: dict) -> None:
        chat_id = data.get("chatId")
        if chat_id:
            await sio.emit("reaction", data, room=f"chat:{chat_id}")

    @sio.on("message-update")
    async def on_message_update(sid: str, data: dict) -> None:
        chat_id = data.get("chatId")
        if chat_id:
            await sio.emit("message-update", data, room=f"chat:{chat_id}")

    @sio.on("chat-updated")
    async def on_chat_updated(sid: str, data: dict) -> None:
        chat = data.get("chat")
        for member_id in data.get("memberIds", []):
            for target_sid in manager.get_sockets_for_user(member_id):
                await sio.emit("chat-updated", {"chat": chat}, to=target_sid)

    @sio.event
    async def disconnect(sid: str) -> None:
        offline_user = manager.remove(sid)
        if offline_user:
            async with async_session_factory() as db:
                await db.execute(
                    update(User)
                    .where(User.id == offline_user)
                    .values(is_online=False, last_seen=now_ms())
                )
                await db.commit()
            await sio.emit("user-status", {"userId": offline_user, "isOnline": False})
        logger.info("Socket disconnected: %s", sid)
