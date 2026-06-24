"""Social — connections, blocking, nicknames."""

import secrets
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, and_, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.security import get_current_user_id, now_ms, sanitize_text
from app.models import User, UserBlock, UserNickname, ConnectionRequest, Chat, ChatMember
from app.services.serializers import serialize_user

router = APIRouter(prefix="/social", tags=["social"])


# ─── Schemas ────────────────────────────────────────────────────────────


class SendConnectionRequest(BaseModel):
    to_username: str


class SetNicknameRequest(BaseModel):
    target_user_id: str
    nickname: str


class BlockRequest(BaseModel):
    user_id: str


# ─── Connections ────────────────────────────────────────────────────────


@router.get("/connections")
async def list_connections(request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    sent = await db.execute(
        select(ConnectionRequest).where(
            ConnectionRequest.from_user_id == uid,
            ConnectionRequest.status == "accepted",
        )
    )
    received = await db.execute(
        select(ConnectionRequest).where(
            ConnectionRequest.to_user_id == uid,
            ConnectionRequest.status == "accepted",
        )
    )
    connected_ids = set()
    for r in sent.scalars().all():
        connected_ids.add(r.to_user_id)
    for r in received.scalars().all():
        connected_ids.add(r.from_user_id)

    users = []
    for cid in connected_ids:
        result = await db.execute(select(User).where(User.id == cid))
        u = result.scalar_one_or_none()
        if u:
            users.append(serialize_user(u))
    return {"connections": users}


@router.get("/requests")
async def list_pending_requests(request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    result = await db.execute(
        select(ConnectionRequest).where(
            ConnectionRequest.to_user_id == uid,
            ConnectionRequest.status == "pending",
        )
    )
    requests = []
    for r in result.scalars().all():
        user_result = await db.execute(select(User).where(User.id == r.from_user_id))
        u = user_result.scalar_one_or_none()
        if u:
            requests.append({"id": r.id, "from": serialize_user(u), "createdAt": r.created_at})
    return {"requests": requests}


@router.post("/connect")
async def send_connection_request(req: SendConnectionRequest, request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    target_result = await db.execute(select(User).where(User.username == req.to_username.lower()))
    target = target_result.scalar_one_or_none()
    if not target:
        raise NotFoundError("User not found")
    if target.id == uid:
        raise ValidationError("Cannot connect with yourself")

    existing = await db.execute(
        select(ConnectionRequest).where(
            or_(
                and_(ConnectionRequest.from_user_id == uid, ConnectionRequest.to_user_id == target.id),
                and_(ConnectionRequest.from_user_id == target.id, ConnectionRequest.to_user_id == uid),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictError("Request already exists or you're already connected")

    conn_req = ConnectionRequest(
        id=secrets.token_hex(12),
        from_user_id=uid,
        to_user_id=target.id,
        status="pending",
        created_at=now_ms(),
    )
    db.add(conn_req)
    return {"ok": True, "message": f"Request sent to @{target.username}"}


@router.post("/accept/{request_id}")
async def accept_connection(request_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    result = await db.execute(select(ConnectionRequest).where(ConnectionRequest.id == request_id))
    conn_req = result.scalar_one_or_none()
    if not conn_req or conn_req.to_user_id != uid:
        raise NotFoundError("Request not found")

    conn_req.status = "accepted"

    existing = await db.execute(
        select(Chat).where(
            Chat.type == "direct",
            Chat.id.in_(select(ChatMember.chat_id).where(ChatMember.user_id == uid)),
            Chat.id.in_(select(ChatMember.chat_id).where(ChatMember.user_id == conn_req.from_user_id)),
        )
    )
    if not existing.scalar_one_or_none():
        chat = Chat(
            id=secrets.token_hex(12),
            type="direct",
            title="Direct",
            created_by=uid,
            created_at=now_ms(),
            updated_at=now_ms(),
        )
        db.add(chat)
        await db.flush()
        db.add(ChatMember(id=secrets.token_hex(12), chat_id=chat.id, user_id=uid, role="owner", joined_at=now_ms(), last_read_at=now_ms()))
        db.add(ChatMember(id=secrets.token_hex(12), chat_id=chat.id, user_id=conn_req.from_user_id, role="member", joined_at=now_ms(), last_read_at=now_ms()))

    return {"ok": True}


@router.post("/decline/{request_id}")
async def decline_connection(request_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    result = await db.execute(select(ConnectionRequest).where(ConnectionRequest.id == request_id))
    conn_req = result.scalar_one_or_none()
    if not conn_req or conn_req.to_user_id != uid:
        raise NotFoundError("Request not found")
    conn_req.status = "declined"
    return {"ok": True}


# ─── Blocking ───────────────────────────────────────────────────────────


@router.post("/block")
async def block_user(req: BlockRequest, request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    if req.user_id == uid:
        raise ValidationError("Cannot block yourself")

    existing = await db.execute(
        select(UserBlock).where(UserBlock.blocker_id == uid, UserBlock.blocked_id == req.user_id)
    )
    if existing.scalar_one_or_none():
        return {"ok": True, "message": "Already blocked"}

    block = UserBlock(
        id=secrets.token_hex(12),
        blocker_id=uid,
        blocked_id=req.user_id,
        created_at=now_ms(),
    )
    db.add(block)
    return {"ok": True, "message": "User blocked"}


@router.post("/unblock")
async def unblock_user(req: BlockRequest, request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    result = await db.execute(
        select(UserBlock).where(UserBlock.blocker_id == uid, UserBlock.blocked_id == req.user_id)
    )
    block = result.scalar_one_or_none()
    if block:
        await db.delete(block)
    return {"ok": True}


@router.get("/blocked")
async def list_blocked(request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    result = await db.execute(select(UserBlock).where(UserBlock.blocker_id == uid))
    blocked_users = []
    for b in result.scalars().all():
        u_result = await db.execute(select(User).where(User.id == b.blocked_id))
        u = u_result.scalar_one_or_none()
        if u:
            blocked_users.append(serialize_user(u))
    return {"blocked": blocked_users}


@router.get("/is-blocked/{user_id}")
async def is_blocked(user_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    result = await db.execute(
        select(UserBlock).where(
            or_(
                and_(UserBlock.blocker_id == uid, UserBlock.blocked_id == user_id),
                and_(UserBlock.blocker_id == user_id, UserBlock.blocked_id == uid),
            )
        )
    )
    block = result.scalar_one_or_none()
    return {
        "blocked": block is not None and block.blocker_id == uid,
        "blockedBy": block is not None and block.blocker_id == user_id,
    }


# ─── Nicknames ──────────────────────────────────────────────────────────


@router.post("/nickname")
async def set_nickname(req: SetNicknameRequest, request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    nickname = sanitize_text(req.nickname, max_length=50)
    if not nickname:
        raise ValidationError("Nickname required")

    result = await db.execute(
        select(UserNickname).where(
            UserNickname.owner_id == uid, UserNickname.target_user_id == req.target_user_id
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.nickname = nickname
    else:
        db.add(UserNickname(
            id=secrets.token_hex(12),
            owner_id=uid,
            target_user_id=req.target_user_id,
            nickname=nickname,
            created_at=now_ms(),
        ))
    return {"ok": True, "nickname": nickname}


@router.delete("/nickname/{target_user_id}")
async def remove_nickname(target_user_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    await db.execute(
        delete(UserNickname).where(
            UserNickname.owner_id == uid, UserNickname.target_user_id == target_user_id
        )
    )
    return {"ok": True}


@router.get("/nicknames")
async def list_nicknames(request: Request, db: AsyncSession = Depends(get_db)):
    uid = get_current_user_id(request)
    result = await db.execute(select(UserNickname).where(UserNickname.owner_id == uid))
    nicknames = {}
    for n in result.scalars().all():
        nicknames[n.target_user_id] = n.nickname
    return {"nicknames": nicknames}
