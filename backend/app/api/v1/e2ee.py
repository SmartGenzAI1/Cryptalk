# public key distribution for E2EE

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional

from app.core.security import get_current_user_id, validate_hex_id
from app.models import UserBlock
from app.repositories import UserRepository
from app.services.deps import get_user_repo

router = APIRouter(prefix="/keys", tags=["e2ee"])


class PublicKeyBundle(BaseModel):
    user_id: str
    identity_public_key: Optional[str] = None  # X25519 (base64)
    signing_public_key: Optional[str] = None    # Ed25519 (base64)
    signed_prekey_public: Optional[str] = None
    signed_prekey_signature: Optional[str] = None


class UploadKeysRequest(BaseModel):
    identity_public_key: str = Field(..., min_length=10, max_length=500)
    signing_public_key: str = Field(..., min_length=10, max_length=500)
    signed_prekey_public: str = Field(..., min_length=10, max_length=500)
    signed_prekey_signature: str = Field(..., min_length=10, max_length=500)


@router.post("/upload")
async def upload_public_keys(
    req: UploadKeysRequest,
    user_id: str = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(get_user_repo),
):
    # private keys never leave the client
    await user_repo.update(
        user_id,
        identity_public_key=req.identity_public_key,
        signing_public_key=req.signing_public_key,
        signed_prekey_public=req.signed_prekey_public,
        signed_prekey_signature=req.signed_prekey_signature,
    )
    return {"ok": True, "message": "Public keys uploaded"}


@router.get("/status/me")
async def my_key_status(
    user_id: str = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(get_user_repo),
):
    user = await user_repo.get_by_id(user_id)
    return {
        "has_keys": bool(user and user.identity_public_key),
        "identity_public_key": user.identity_public_key if user else None,
    }


@router.get("/{target_user_id}")
async def get_public_keys(
    target_user_id: str,
    user_id: str = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(get_user_repo),
):
    if not validate_hex_id(target_user_id):
        from app.core.exceptions import ValidationError
        raise ValidationError("Invalid user ID")
    user = await user_repo.get_by_id(target_user_id)
    if not user:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("User not found")

    from sqlalchemy import select, or_, and_
    block_result = await user_repo.db.execute(
        select(UserBlock).where(
            or_(
                and_(UserBlock.blocker_id == target_user_id, UserBlock.blocked_id == user_id),
            )
        )
    )
    if block_result.scalar_one_or_none():
        from app.core.exceptions import NotFoundError
        raise NotFoundError("User not found")

    return {
        "user_id": user.id,
        "identity_public_key": user.identity_public_key,
        "signing_public_key": user.signing_public_key,
        "signed_prekey_public": user.signed_prekey_public,
        "signed_prekey_signature": user.signed_prekey_signature,
        "has_keys": bool(user.identity_public_key),
    }
