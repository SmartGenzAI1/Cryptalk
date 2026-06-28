import secrets
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.security import get_current_user_id, now_ms
from app.models import Chat, ChatMember, User, Report

router = APIRouter(tags=["chat-management"])


class KickMemberRequest(BaseModel):
    user_id: str


class PromoteRequest(BaseModel):
    user_id: str
    role: str


class TransferOwnershipRequest(BaseModel):
    new_owner_id: str


class ReportRequest(BaseModel):
    reported_id: str | None = None
    chat_id: str | None = None
    reason: str


@router.post("/chats/{chat_id}/leave")
async def leave_chat(chat_id: str, request: Request = None, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)

    result = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise NotFoundError("Not a member of this chat")

    await db.delete(member)

    chat_result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = chat_result.scalar_one_or_none()
    if chat:
        remaining_result = await db.execute(
            select(ChatMember).where(ChatMember.chat_id == chat_id)
        )
        remaining_members = list(remaining_result.scalars().all())
        if len(remaining_members) == 0:
            await db.execute(delete(Chat).where(Chat.id == chat_id))
        elif member.role == "owner" and remaining_members:
            remaining_members[0].role = "owner"

    return {"ok": True}


@router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, request: Request = None, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)

    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise NotFoundError("Chat not found")

    member_result = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise ForbiddenError("Not a member")

    if chat.type == "saved":
        raise ValidationError("Cannot delete Saved Messages")

    await db.execute(delete(Chat).where(Chat.id == chat_id))
    return {"ok": True}


@router.post("/chats/{chat_id}/kick")
async def kick_member(req: KickMemberRequest, chat_id: str, request: Request = None, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)

    requester = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    )
    requester_member = requester.scalar_one_or_none()
    if not requester_member or requester_member.role not in ("owner", "admin"):
        raise ForbiddenError("Only admins can kick members")

    target = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == req.user_id)
    )
    target_member = target.scalar_one_or_none()
    if not target_member:
        raise NotFoundError("Member not found")
    if target_member.role == "owner":
        raise ForbiddenError("Cannot kick the owner")

    await db.delete(target_member)
    return {"ok": True}


@router.post("/chats/{chat_id}/promote")
async def promote_member(req: PromoteRequest, chat_id: str, request: Request = None, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)

    requester = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    )
    requester_member = requester.scalar_one_or_none()
    if not requester_member or requester_member.role != "owner":
        raise ForbiddenError("Only the owner can change roles")

    if req.role not in ("admin", "member"):
        raise ValidationError("Role must be admin or member")

    target = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == req.user_id)
    )
    target_member = target.scalar_one_or_none()
    if not target_member:
        raise NotFoundError("Member not found")

    target_member.role = req.role
    return {"ok": True, "role": req.role}


@router.post("/chats/{chat_id}/transfer")
async def transfer_ownership(req: TransferOwnershipRequest, chat_id: str, request: Request = None, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)

    owner = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    )
    owner_member = owner.scalar_one_or_none()
    if not owner_member or owner_member.role != "owner":
        raise ForbiddenError("Only the owner can transfer ownership")

    target = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == req.new_owner_id)
    )
    target_member = target.scalar_one_or_none()
    if not target_member:
        raise NotFoundError("Member not found")

    owner_member.role = "admin"
    target_member.role = "owner"

    chat_result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = chat_result.scalar_one_or_none()
    if chat:
        chat.created_by = req.new_owner_id

    return {"ok": True}


@router.post("/chats/{chat_id}/invite")
async def generate_invite_link(chat_id: str, request: Request = None, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)

    member = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    )
    if not member.scalar_one_or_none():
        raise ForbiddenError("Not a member")

    chat_result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = chat_result.scalar_one_or_none()
    if not chat:
        raise NotFoundError("Chat not found")
    if chat.type == "direct":
        raise ValidationError("Direct chats don't support invite links")

    if not chat.invite_token:
        chat.invite_token = secrets.token_urlsafe(16)

    return {"token": chat.invite_token}


@router.post("/chats/join/{token}")
async def join_chat_by_token(token: str, request: Request = None, db: AsyncSession = Depends(get_db)):
    user_id = get_current_user_id(request)

    chat_result = await db.execute(select(Chat).where(Chat.invite_token == token))
    chat = chat_result.scalar_one_or_none()
    if not chat:
        raise NotFoundError("Invalid invite link")

    existing = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat.id, ChatMember.user_id == user_id)
    )
    if existing.scalar_one_or_none():
        return {"ok": True, "chat_id": chat.id, "message": "Already a member"}

    db.add(ChatMember(
        id=secrets.token_hex(12),
        chat_id=chat.id,
        user_id=user_id,
        role="member",
        joined_at=now_ms(),
        last_read_at=now_ms(),
    ))
    return {"ok": True, "chat_id": chat.id}


@router.post("/reports")
async def create_report(req: ReportRequest, request: Request = None, db: AsyncSession = Depends(get_db)):
    from app.core.security import sanitize_text
    user_id = get_current_user_id(request)

    reason = sanitize_text(req.reason, max_length=500)
    if not reason:
        raise ValidationError("Reason required")

    report = Report(
        id=secrets.token_hex(12),
        reporter_id=user_id,
        reported_id=req.reported_id,
        chat_id=req.chat_id,
        reason=reason,
        status="pending",
        created_at=now_ms(),
    )
    db.add(report)
    return {"ok": True, "message": "Report submitted"}


@router.delete("/account")
async def delete_account(request: Request = None, db: AsyncSession = Depends(get_db)):
    from app.models import UserBlock, UserNickname, ConnectionRequest
    user_id = get_current_user_id(request)

    await db.execute(delete(ChatMember).where(ChatMember.user_id == user_id))
    await db.execute(delete(UserBlock).where(UserBlock.blocker_id == user_id))
    await db.execute(delete(UserBlock).where(UserBlock.blocked_id == user_id))
    await db.execute(delete(UserNickname).where(UserNickname.owner_id == user_id))
    await db.execute(delete(UserNickname).where(UserNickname.target_user_id == user_id))
    await db.execute(delete(ConnectionRequest).where(ConnectionRequest.from_user_id == user_id))
    await db.execute(delete(ConnectionRequest).where(ConnectionRequest.to_user_id == user_id))
    await db.execute(delete(Report).where(Report.reporter_id == user_id))

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user:
        user.username = None
        user.name = None
        user.email = None
        user.password_hash = "deleted"
        user.bio = ""
        user.is_online = False
        user.is_onboarded = False
        user.identity_public_key = None
        user.signing_public_key = None
        user.signed_prekey_public = None
        user.signed_prekey_signature = None
        user.push_token = None
        user.push_platform = None

    return {"ok": True, "message": "Account deleted"}
