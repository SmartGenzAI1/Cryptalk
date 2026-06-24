"""E2EE key management endpoints — public key distribution.

The server acts as a key directory: it stores users' PUBLIC keys and
serves them to other users for ECDH key agreement. The server NEVER
sees or stores private keys.

Architecture:
    Client A generates keypair → uploads PUBLIC key → server stores it
    Client B requests A's public key → server returns it
    Client B encrypts message with A's public key → server routes ciphertext
    Client A decrypts with PRIVATE key (which never left A's device)
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from app.core.security import get_current_user_id
from app.repositories import UserRepository
from app.services.deps import get_user_repo

router = APIRouter(prefix="/keys", tags=["e2ee"])


class PublicKeyBundle(BaseModel):
    """A user's public key material — safe to share with anyone."""
    user_id: str
    identity_public_key: Optional[str] = None  # X25519 (base64)
    signing_public_key: Optional[str] = None    # Ed25519 (base64)
    signed_prekey_public: Optional[str] = None
    signed_prekey_signature: Optional[str] = None


class UploadKeysRequest(BaseModel):
    """Upload public keys — called once during onboarding."""
    identity_public_key: str
    signing_public_key: str
    signed_prekey_public: str
    signed_prekey_signature: str


@router.post("/upload")
async def upload_public_keys(
    req: UploadKeysRequest,
    user_id: str = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(get_user_repo),
):
    """Upload public keys for E2EE. Private keys NEVER leave the client."""
    await user_repo.update(
        user_id,
        identity_public_key=req.identity_public_key,
        signing_public_key=req.signing_public_key,
        signed_prekey_public=req.signed_prekey_public,
        signed_prekey_signature=req.signed_prekey_signature,
    )
    return {"ok": True, "message": "Public keys uploaded"}


@router.get("/{target_user_id}")
async def get_public_keys(
    target_user_id: str,
    user_id: str = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(get_user_repo),
):
    """Fetch another user's public keys for E2EE key agreement.

    The server returns ONLY public keys — it cannot decrypt any messages.
    """
    user = await user_repo.get_by_id(target_user_id)
    if not user:
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


@router.get("/status/me")
async def my_key_status(
    user_id: str = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(get_user_repo),
):
    """Check if the current user has uploaded their public keys."""
    user = await user_repo.get_by_id(user_id)
    return {
        "has_keys": bool(user and user.identity_public_key),
        "identity_public_key": user.identity_public_key if user else None,
    }
