# socket.io event handlers — thin wrappers around the connection manager.
# every identify must present a valid session token, otherwise any client
# could claim any userId and receive their messages/presence.

import logging
from datetime import datetime, timezone

import socketio
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.security import now_ms, verify_session_token
from app.models import ChatMember, User
from app.realtime.connection_manager import manager

logger = logging.getLogger("cryptalk.realtime")

_MAX_RELAY_BYTES = 65_536  # 64 KB max per socket payload


def _verify_socket_auth(data: dict) -> str | None:
    # userId in the payload is IGNORED unless it matches the token's user_id —
    # clients can't self-declare identity
    token = (data.get("token") or "").strip()
    if not token:
        return None
    return verify_session_token(token)


def _auth_from_environ(environ: dict) -> str | None:
    # browser sends tc_session cookie automatically with withCredentials:true
    # on the websocket handshake. cookie is httponly so JS can't read it.
    from http.cookies import SimpleCookie

    cookie_header = environ.get("HTTP_COOKIE", "")
    if not cookie_header:
        return None
    jar = SimpleCookie()
    try:
        jar.load(cookie_header)
    except Exception:
        return None
    morsel = jar.get(settings.COOKIE_NAME)
    if not morsel:
        return None
    return verify_session_token(morsel.value)


def register_handlers(sio: socketio.AsyncServer) -> None:

    @sio.event
    async def connect(sid: str, environ: dict) -> bool | None:
        # authenticate at connection time using the cookie header — closes the
        # impersonation hole where any client could claim any userId via identify
        user_id = _auth_from_environ(environ)
        if not user_id:
            logger.warning("Socket %s rejected: no valid session cookie", sid)
            # emit auth-error then let the connection close — client will re-login
            await sio.emit("auth-error", {"message": "Not authenticated"}, to=sid)
            return False  # reject the connection
        manager.add(sid, user_id)
        logger.info("Socket connected: %s (user: %s)", sid, user_id[:8])

        # mark user online and broadcast presence
        async with async_session_factory() as db:
            await db.execute(
                update(User)
                .where(User.id == user_id)
                .values(is_online=True, last_seen=now_ms())
            )
            await db.commit()
        await sio.emit("user-status", {"userId": user_id, "isOnline": True})

        await sio.emit(
            "presence",
            {"users": [{"userId": uid, "isOnline": True} for uid in manager.all_online_user_ids()]},
            to=sid,
        )
        return True

    # `identify` is a no-op for backward compat — auth already happened at connect
    @sio.on("identify")
    async def on_identify(sid: str, data: dict) -> None:
        pass

    @sio.on("join-chat")
    async def on_join_chat(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        chat_id = data.get("chatId")
        if not user_id or not chat_id:
            return
        # verify membership before entering the room
        async with async_session_factory() as db:
            result = await db.execute(
                select(ChatMember).where(
                    ChatMember.chat_id == chat_id, ChatMember.user_id == user_id
                )
            )
            if not result.scalar_one_or_none():
                return
        await sio.enter_room(sid, f"chat:{chat_id}")

    @sio.on("leave-chat")
    async def on_leave_chat(sid: str, data: dict) -> None:
        chat_id = data.get("chatId")
        if chat_id:
            await sio.leave_room(sid, f"chat:{chat_id}")

    @sio.on("send-message")
    async def on_send_message(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat_id = data.get("chatId")
        message = data.get("message")
        if not chat_id or not message:
            return
        import json
        if len(json.dumps(data, default=str)) > _MAX_RELAY_BYTES:
            return
        await sio.emit(
            "message",
            {"chatId": chat_id, "message": message},
            room=f"chat:{chat_id}",
        )

    @sio.on("typing")
    async def on_typing(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat_id = data.get("chatId")
        if not chat_id:
            return
        # inject server-side identity so client can't spoof who's typing
        data["userId"] = user_id
        await sio.emit("typing", data, room=f"chat:{chat_id}", skip_sid=sid)

    @sio.on("message-status")
    async def on_message_status(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat_id = data.get("chatId")
        if not chat_id:
            return
        data["userId"] = user_id
        await sio.emit("message-status", data, room=f"chat:{chat_id}")

    @sio.on("recording")
    async def on_recording(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat_id = data.get("chatId")
        if not chat_id:
            return
        data["userId"] = user_id
        await sio.emit("recording", data, room=f"chat:{chat_id}", skip_sid=sid)

    @sio.on("reaction")
    async def on_reaction(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat_id = data.get("chatId")
        if not chat_id:
            return
        data["userId"] = user_id
        await sio.emit("reaction", data, room=f"chat:{chat_id}")

    @sio.on("message-update")
    async def on_message_update(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat_id = data.get("chatId")
        if not chat_id:
            return
        import json
        if len(json.dumps(data, default=str)) > _MAX_RELAY_BYTES:
            return
        await sio.emit("message-update", data, room=f"chat:{chat_id}")

    @sio.on("chat-updated")
    async def on_chat_updated(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat = data.get("chat")
        member_ids = data.get("memberIds", [])
        # only relay if the sender is actually one of the members
        if user_id not in member_ids:
            return
        for member_id in member_ids:
            for target_sid in manager.get_sockets_for_user(member_id):
                await sio.emit("chat-updated", {"chat": chat}, to=target_sid)

    @sio.event
    async def disconnect(sid: str) -> None:
        offline_user = manager.remove(sid)
        if offline_user:
            try:
                async with async_session_factory() as db:
                    await db.execute(
                        update(User)
                        .where(User.id == offline_user)
                        .values(is_online=False, last_seen=now_ms())
                    )
                    await db.commit()
                await sio.emit("user-status", {"userId": offline_user, "isOnline": False})
            except Exception as e:
                # log instead of swallowing — otherwise user is stuck is_online=True forever
                logger.error("Failed to mark user %s offline on disconnect: %s", offline_user, e)
        logger.info("Socket disconnected: %s", sid)
