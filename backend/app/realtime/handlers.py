# socket.io event handlers — relay-only ephemeral messaging.
#
# SECURITY MODEL: The server is a dumb relay. All message content is encrypted
# client-side (E2EE) before being sent to the server. The server NEVER stores,
# logs, or inspects plaintext message content. It only sees opaque ciphertext
# blobs and forwards them to the intended recipients. Typing indicators,
# presence events, and reaction metadata intentionally contain NO message
# content — only chat IDs, user IDs, and lightweight status flags.
#
# messages never touch the DB. they go: sender → server relay → recipient(s).
# offline recipients get queued (encrypted) and drain on reconnect.

import json
import logging
import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone

import socketio
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.offline_queue import drain as drain_queue, enqueue as enqueue_message
from app.core.security import decrypt_field, now_ms, validate_hex_id, verify_session_token
from app.models import ChatMember, User, UserBlock
from app.realtime.connection_manager import manager

logger = logging.getLogger("cryptalk.realtime")

_MAX_RELAY_BYTES = 65_536
_WS_MSG_RATE_LIMIT = 30  # max messages per second per socket
_ws_msg_counts: dict[str, list[float]] = defaultdict(list)


def _check_ws_rate(sid: str) -> bool:
    now = time.time()
    bucket = _ws_msg_counts[sid]
    # purge entries older than 1 second
    cutoff = now - 1.0
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= _WS_MSG_RATE_LIMIT:
        return False
    bucket.append(now)
    # periodic cleanup of stale sids
    if len(_ws_msg_counts) > 500:
        stale = [k for k, v in list(_ws_msg_counts.items()) if not v or v[-1] < cutoff - 5]
        for k in stale:
            del _ws_msg_counts[k]
    return True


async def _verify_chat_member(chat_id: str, user_id: str) -> bool:
    async with async_session_factory() as db:
        result = await db.execute(
            select(ChatMember.id).where(
                ChatMember.chat_id == chat_id,
                ChatMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none() is not None


async def _share_chat(user_a: str, user_b: str) -> bool:
    async with async_session_factory() as db:
        result = await db.execute(
            select(ChatMember.chat_id).where(
                ChatMember.user_id == user_a,
                ChatMember.chat_id.in_(
                    select(ChatMember.chat_id).where(ChatMember.user_id == user_b)
                ),
            ).limit(1)
        )
        return result.first() is not None


def _auth_from_environ(environ: dict) -> str | None:
    from http.cookies import SimpleCookie
    cookie_header = environ.get("HTTP_COOKIE", "")
    if not cookie_header:
        return None
    jar = SimpleCookie()
    try:
        jar.load(cookie_header)
    except Exception:
        return None
    morsel = jar.get("__Host-tc_session") or jar.get(settings.COOKIE_NAME)
    if not morsel:
        return None
    return verify_session_token(morsel.value)


def register_handlers(sio: socketio.AsyncServer) -> None:

    @sio.event
    async def connect(sid: str, environ: dict, auth: dict = None) -> bool | None:
        user_id = _auth_from_environ(environ)

        if not user_id:
            if not settings.ANONYMIZE_LOGS:
                logger.warning("Socket rejected: no valid session cookie")
            await sio.emit("auth-error", {"message": "Not authenticated"}, to=sid)
            return False
        await manager.add(sid, user_id)
        await sio.enter_room(sid, f"user:{user_id}")
        if settings.ANONYMIZE_LOGS:
            logger.info("Socket connected")
        else:
            logger.info("Socket connected: %s", sid)

        async with async_session_factory() as db:
            user_result = await db.execute(select(User.last_seen_opt_in).where(User.id == user_id))
            opt_in = user_result.scalar_one_or_none()
            if opt_in:
                await db.execute(
                    update(User)
                    .where(User.id == user_id)
                    .values(is_online=True, last_seen=now_ms())
                )
            else:
                await db.execute(
                    update(User)
                    .where(User.id == user_id)
                    .values(is_online=True)
                )
            await db.commit()
        await sio.emit("user-status", {"userId": user_id, "isOnline": True})

        await sio.emit(
            "presence",
            {"users": [{"userId": uid, "isOnline": True} for uid in await manager.all_online_user_ids()]},
            to=sid,
        )

        # drain any queued messages from while this user was offline
        queued = await drain_queue(user_id)
        if queued:
            await sio.emit("queued-messages", {"messages": queued}, to=sid)
            if not settings.ANONYMIZE_LOGS:
                logger.info("Delivered %d queued messages", len(queued))

            # emit delivery receipts back to the original senders
            seen_sender_chat: set = set()
            for qmsg in queued:
                inner = qmsg.get("message", {})
                sender_id = inner.get("senderId")
                chat_id = qmsg.get("chatId")
                if sender_id and chat_id and (sender_id, chat_id) not in seen_sender_chat:
                    seen_sender_chat.add((sender_id, chat_id))
                    for sender_sid in manager.get_sockets_for_user(sender_id):
                        await sio.emit("message-status", {
                            "chatId": chat_id,
                            "userId": user_id,
                            "status": "delivered",
                        }, to=sender_sid)

        return True

    @sio.on("identify")
    async def on_identify(sid: str, data: dict) -> None:
        pass

    @sio.on("join-chat")
    async def on_join_chat(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        chat_id = data.get("chatId")
        if not user_id or not chat_id or not validate_hex_id(chat_id):
            return
        if not await _verify_chat_member(chat_id, user_id):
            return
        await sio.enter_room(sid, f"chat:{chat_id}")
        if not settings.ANONYMIZE_LOGS:
            logger.info("Socket joined room chat:%s", chat_id)

    @sio.on("leave-chat")
    async def on_leave_chat(sid: str, data: dict) -> None:
        chat_id = data.get("chatId")
        if chat_id and validate_hex_id(chat_id):
            await sio.leave_room(sid, f"chat:{chat_id}")

    @sio.on("send-message")
    async def on_send_message(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        if not _check_ws_rate(sid):
            if not settings.ANONYMIZE_LOGS:
                logger.warning("Socket exceeded WS rate limit, disconnecting")
            await sio.disconnect(sid)
            return
        chat_id = data.get("chatId")
        if not chat_id or not validate_hex_id(chat_id):
            return
        if not await _verify_chat_member(chat_id, user_id):
            await sio.emit("error", {"message": "Not a member of this chat"}, to=sid)
            return
        message = data.get("message")
        if not message or not isinstance(message, dict):
            return
        if len(json.dumps(data, default=str)) > _MAX_RELAY_BYTES:
            return
        # validate content length (opaque ciphertext blob — server never decrypts)
        content = message.get("content")
        if isinstance(content, str) and len(content) > 10000:
            return
        # validate message type
        msg_type = message.get("type", "text")
        if msg_type not in ("text", "sticker", "voice", "image", "file"):
            return

        # preserve existing ID/createdAt if already generated by sender client
        message["id"] = message.get("id") or secrets.token_hex(12)
        message["senderId"] = user_id
        message["createdAt"] = message.get("createdAt") or datetime.now(timezone.utc).isoformat()
        message["status"] = "sent"

        payload = {"chatId": chat_id, "message": message}

        # deliver per-member to guarantee exactly-once per recipient
        delivered_to: set[str] = set()
        async with async_session_factory() as db:
            result = await db.execute(
                select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
            )
            all_member_ids = [row[0] for row in result.all()]

            blocked_result = await db.execute(
                select(UserBlock.blocked_id).where(
                    UserBlock.blocker_id.in_(all_member_ids),
                    UserBlock.blocked_id == user_id,
                )
            )
            blocked_by = {row[0] for row in blocked_result.all()}

        for member_id in all_member_ids:
            if member_id == user_id or member_id in blocked_by or member_id in delivered_to:
                continue
            member_sids = manager.get_sockets_for_user(member_id)
            if member_sids:
                delivered_to.add(member_id)
                for target_sid in member_sids:
                    await sio.emit("message", payload, to=target_sid)
            else:
                await enqueue_message(member_id, payload)

    @sio.on("typing")
    async def on_typing(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        if not _check_ws_rate(sid):
            if not settings.ANONYMIZE_LOGS:
                logger.warning("Socket exceeded WS rate limit, disconnecting")
            await sio.disconnect(sid)
            return
        chat_id = data.get("chatId")
        if not chat_id or not validate_hex_id(chat_id):
            return
        if not await _verify_chat_member(chat_id, user_id):
            return
        is_typing = bool(data.get("isTyping"))
        username = data.get("username", "")
        # never relay or log profile fields in the clear; decode anything
        # that reached the socket encrypted (no-op for client-generated values)
        await sio.emit("typing", {
            "chatId": chat_id,
            "userId": user_id,
            "username": decrypt_field(username) if isinstance(username, str) else "",
            "isTyping": is_typing,
        }, room=f"chat:{chat_id}", skip_sid=sid)

    @sio.on("message-status")
    async def on_message_status(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat_id = data.get("chatId")
        if not chat_id or not validate_hex_id(chat_id):
            return
        if not await _verify_chat_member(chat_id, user_id):
            return
        status = data.get("status")
        if status not in ("delivered", "read"):
            return
        relay = {
            "chatId": chat_id,
            "userId": user_id,
            "status": status,
        }
        last_read_at = data.get("lastReadAt")
        if isinstance(last_read_at, (int, float)):
            relay["lastReadAt"] = last_read_at
        await sio.emit("message-status", relay, room=f"chat:{chat_id}", skip_sid=sid)

        # if this is a delivery confirmation for a file, trigger cleanup
        attachment_path = data.get("attachmentPath")
        if isinstance(attachment_path, str) and attachment_path and status == "delivered":
            if len(attachment_path) <= 500 and ".." not in attachment_path and "\x00" not in attachment_path:
                try:
                    from app.core.storage import StorageService
                    await StorageService.delete_file(attachment_path)
                    logger.info("Auto-deleted delivered attachment: %s", attachment_path)
                except Exception as e:
                    logger.warning("Failed to auto-delete attachment %s: %s", attachment_path, e)

    @sio.on("recording")
    async def on_recording(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat_id = data.get("chatId")
        if not chat_id or not validate_hex_id(chat_id):
            return
        if not await _verify_chat_member(chat_id, user_id):
            return
        is_recording = bool(data.get("isRecording"))
        await sio.emit("recording", {
            "chatId": chat_id,
            "userId": user_id,
            "isRecording": is_recording,
        }, room=f"chat:{chat_id}", skip_sid=sid)

    @sio.on("reaction")
    async def on_reaction(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        if not _check_ws_rate(sid):
            if not settings.ANONYMIZE_LOGS:
                logger.warning("Socket exceeded WS rate limit, disconnecting")
            await sio.disconnect(sid)
            return
        chat_id = data.get("chatId")
        if not chat_id or not validate_hex_id(chat_id):
            return
        if not await _verify_chat_member(chat_id, user_id):
            return
        message_id = data.get("messageId")
        if not message_id or not validate_hex_id(message_id):
            return
        emoji = data.get("emoji")
        if not isinstance(emoji, str) or not emoji or len(emoji) > 10:
            return
        added = data.get("added")
        if not isinstance(added, bool):
            return
        await sio.emit("reaction", {
            "chatId": chat_id,
            "userId": user_id,
            "messageId": message_id,
            "emoji": emoji,
            "added": added,
        }, room=f"chat:{chat_id}", skip_sid=sid)

    @sio.on("message-update")
    async def on_message_update(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat_id = data.get("chatId")
        if not chat_id or not validate_hex_id(chat_id):
            return
        if not await _verify_chat_member(chat_id, user_id):
            await sio.emit("error", {"message": "Not a member of this chat"}, to=sid)
            return
        action = data.get("action")
        if action not in ("edit", "delete"):
            return
        message_obj = data.get("message")
        if not isinstance(message_obj, dict):
            return
        message_id = message_obj.get("id")
        if not message_id or not validate_hex_id(message_id):
            await sio.emit("error", {"message": "Invalid message ID"}, to=sid)
            return
        if len(json.dumps(data, default=str)) > _MAX_RELAY_BYTES:
            await sio.emit("error", {"message": "Message too large"}, to=sid)
            return
        content = message_obj.get("content")
        if isinstance(content, str) and len(content) > 10000:
            await sio.emit("error", {"message": "Content too long"}, to=sid)
            return
        await sio.emit("message-update", {
            "chatId": chat_id,
            "message": message_obj,
            "action": action,
        }, room=f"chat:{chat_id}", skip_sid=sid)

    @sio.on("message-delete")
    async def on_message_delete(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat_id = data.get("chatId")
        message_id = data.get("messageId")
        if not chat_id or not validate_hex_id(chat_id):
            return
        if not await _verify_chat_member(chat_id, user_id):
            await sio.emit("error", {"message": "Not a member of this chat"}, to=sid)
            return
        if not message_id or not validate_hex_id(message_id):
            await sio.emit("error", {"message": "Invalid message ID"}, to=sid)
            return
        sender_id = data.get("senderId")
        is_author = (sender_id == user_id) if sender_id else False
        if not is_author:
            async with async_session_factory() as db:
                result = await db.execute(
                    select(ChatMember.role).where(
                        ChatMember.chat_id == chat_id,
                        ChatMember.user_id == user_id,
                    )
                )
                role = result.scalar_one_or_none()
                if role not in ("owner", "admin"):
                    await sio.emit("error", {"message": "Only the author, admin, or owner can delete messages"}, to=sid)
                    return
        await sio.emit("message-update", {
            "chatId": chat_id,
            "message": {"id": message_id, "chatId": chat_id},
            "action": "delete",
        }, room=f"chat:{chat_id}", skip_sid=sid)

    @sio.on("chat-updated")
    async def on_chat_updated(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        chat = data.get("chat")
        chat_id = data.get("chatId") or (chat.get("id") if isinstance(chat, dict) else None)
        if not chat_id or not validate_hex_id(chat_id):
            return
        if not await _verify_chat_member(chat_id, user_id):
            return
        if len(json.dumps(data, default=str)) > _MAX_RELAY_BYTES:
            return
        async with async_session_factory() as db:
            result = await db.execute(
                select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
            )
            member_ids = [row[0] for row in result.all()]
        for member_id in member_ids:
            if member_id == user_id:
                continue
            for target_sid in manager.get_sockets_for_user(member_id):
                await sio.emit("chat-updated", {"chat": chat, "chatId": chat_id}, to=target_sid)

    @sio.on("call-offer")
    async def on_call_offer(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        target_user_id = data.get("targetUserId")
        if not target_user_id or not validate_hex_id(target_user_id):
            return
        if not await _share_chat(user_id, target_user_id):
            return
        if len(json.dumps(data, default=str)) > _MAX_RELAY_BYTES:
            return
        data["callerUserId"] = user_id
        for target_sid in manager.get_sockets_for_user(target_user_id):
            await sio.emit("call-offer", data, to=target_sid)

    @sio.on("call-answer")
    async def on_call_answer(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        caller_user_id = data.get("callerUserId")
        if not caller_user_id or not validate_hex_id(caller_user_id):
            return
        if not await _share_chat(user_id, caller_user_id):
            return
        if len(json.dumps(data, default=str)) > _MAX_RELAY_BYTES:
            return
        data["answerUserId"] = user_id
        for target_sid in manager.get_sockets_for_user(caller_user_id):
            await sio.emit("call-answer", data, to=target_sid)

    @sio.on("ice-candidate")
    async def on_ice_candidate(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        target_user_id = data.get("targetUserId")
        if not target_user_id or not validate_hex_id(target_user_id):
            return
        if not await _share_chat(user_id, target_user_id):
            return
        if len(json.dumps(data, default=str)) > _MAX_RELAY_BYTES:
            return
        data["senderUserId"] = user_id
        for target_sid in manager.get_sockets_for_user(target_user_id):
            await sio.emit("ice-candidate", data, to=target_sid)

    @sio.on("call-hangup")
    async def on_call_hangup(sid: str, data: dict) -> None:
        user_id = manager.get_user_id(sid)
        if not user_id or not isinstance(data, dict):
            return
        target_user_id = data.get("targetUserId")
        if not target_user_id or not validate_hex_id(target_user_id):
            return
        if not await _share_chat(user_id, target_user_id):
            return
        if len(json.dumps(data, default=str)) > _MAX_RELAY_BYTES:
            return
        data["senderUserId"] = user_id
        for target_sid in manager.get_sockets_for_user(target_user_id):
            await sio.emit("call-hangup", data, to=target_sid)

    @sio.event
    async def disconnect(sid: str) -> None:
        try:
            rooms = sio.get_rooms(sid)
            for room in list(rooms):
                if room != sid:
                    await sio.leave_room(sid, room)
        except Exception:
            pass

        offline_user = await manager.remove(sid)
        if offline_user:
            try:
                async with async_session_factory() as db:
                    user_result = await db.execute(select(User.last_seen_opt_in).where(User.id == offline_user))
                    opt_in = user_result.scalar_one_or_none()
                    if opt_in:
                        await db.execute(
                            update(User)
                            .where(User.id == offline_user)
                            .values(is_online=False, last_seen=now_ms())
                        )
                    else:
                        await db.execute(
                            update(User)
                            .where(User.id == offline_user)
                            .values(is_online=False)
                        )
                    await db.commit()
                await sio.emit("user-status", {"userId": offline_user, "isOnline": False})
            except Exception as e:
                if not settings.ANONYMIZE_LOGS:
                    logger.error("Failed to mark user offline on disconnect: %s", e)
        logger.info("Socket disconnected")
