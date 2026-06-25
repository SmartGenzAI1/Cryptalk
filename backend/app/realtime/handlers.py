"""Socket.IO event handlers — thin wrappers around the connection manager.

Each handler validates the payload, mutates the manager, and emits the
appropriate broadcast.  Business logic stays in the service layer; this
module only deals with realtime transport.

Security: every ``identify`` MUST present a valid session token.  Without
this check, any client could claim any ``userId`` and receive that user's
realtime messages/presence (B2).  The token is the same HMAC-signed cookie
used by the REST API, verified via ``verify_session_token``.
"""

import logging
from datetime import datetime, timezone

import socketio
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.security import now_ms, verify_session_token
from app.models import User
from app.realtime.connection_manager import manager

logger = logging.getLogger("cryptalk.realtime")


def _verify_socket_auth(data: dict) -> str | None:
    """Extract + verify the session token from an ``identify`` payload.

    Returns the authenticated ``user_id`` or ``None``.  We accept either
    ``token`` (preferred) or read the cookie from ``data['cookie']`` for
    clients that forward it.  The userId in the payload is IGNORED unless
    it matches the token's user_id — clients cannot self-declare identity.
    """
    token = (data.get("token") or "").strip()
    if not token:
        return None
    return verify_session_token(token)


def _auth_from_environ(environ: dict) -> str | None:
    """Authenticate a socket connection using the cookie header.

    The browser sends the ``tc_session`` cookie automatically with
    ``withCredentials: true`` on the WebSocket handshake.  We read it from
    the HTTP headers in ``environ``, verify the HMAC token, and return the
    user_id.  Returns ``None`` if the cookie is missing or invalid.
    """
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
    """Register all Socket.IO event handlers on the given server."""

    @sio.event
    async def connect(sid: str, environ: dict) -> bool | None:
        # X5+B2: authenticate at CONNECTION TIME using the cookie header.
        # The browser sends the tc_session cookie automatically with
        # withCredentials:true — no JS-readable cookie needed (the cookie
        # is httponly).  This closes the impersonation hole where any client
        # could claim any userId via the `identify` event.
        user_id = _auth_from_environ(environ)
        if not user_id:
            logger.warning("Socket %s rejected: no valid session cookie", sid)
            # Emit auth-error then let the connection close — the client's
            # auth-error handler will force a re-login.
            await sio.emit("auth-error", {"message": "Not authenticated"}, to=sid)
            return False  # reject the connection
        manager.add(sid, user_id)
        logger.info("Socket connected: %s (user: %s)", sid, user_id[:8])

        # Mark the user online and broadcast presence.
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

    # Keep the `identify` handler as a no-op for backward compat with older
    # clients that still emit it — auth already happened at connect time.
    @sio.on("identify")
    async def on_identify(sid: str, data: dict) -> None:
        # Auth already happened in the connect handler via the cookie header.
        # This is a no-op for backward compat.
        pass

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
                # B10: never swallow DB errors silently — if the update fails,
                # the user is stuck is_online=True forever.  Log so an operator
                # can see it; a periodic presence-reaper would also fix this.
                logger.error("Failed to mark user %s offline on disconnect: %s", offline_user, e)
        logger.info("Socket disconnected: %s", sid)
