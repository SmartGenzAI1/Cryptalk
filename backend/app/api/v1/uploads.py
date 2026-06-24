"""File upload endpoints — E2EE ciphertext storage in Supabase.

Flow:
    1. Client encrypts file bytes with the chat's E2EE key (ciphertext).
    2. Client POSTs the ciphertext blob here as multipart/form-data.
    3. We enforce the per-file cap + total storage quota, then store the
       ciphertext in Supabase Storage.
    4. We return ``{ url, path, size, contentType, fileName }``.
    5. Client sends the message with ``content = encrypt(url)``; the URL is
       the only thing the server ever sees, and even that is encrypted at
       rest in the message row.

When Supabase is not configured (local dev), the endpoint returns
``{ fallback: true }`` so the client falls back to embedding the ciphertext
directly in the message content (the legacy base64 path).
"""

import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, File, Header, UploadFile
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.security import get_current_user_id
from app.core.storage import (
    FileTooLargeError,
    QuotaExceededError,
    StorageError,
    StorageService,
)

logger = logging.getLogger("cryptalk.uploads")

router = APIRouter(prefix="/uploads", tags=["uploads"])


def _safe_filename(name: Optional[str]) -> str:
    """Reduce a user-supplied filename to something safe to store.

    Strips path components, keeps the extension, falls back to ``file``.
    """
    if not name:
        return "file"
    # Take last path segment (defends against ``../`` style names).
    base = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    # Keep alphanumerics, dash, underscore, dot only.
    safe = "".join(c if (c.isalnum() or c in "-_.") else "_" for c in base)
    return safe[:80] or "file"


@router.post("")
async def upload_attachment(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    content_length: int = Header(0, alias="content-length"),
):
    """Upload an E2EE-encrypted file blob to Supabase Storage.

    The body should be the *ciphertext* produced by the client's E2EE layer.
    We never see plaintext file content.
    """
    # ─── Dev fallback: no Supabase configured ────────────────────────────
    # The client should embed the ciphertext in the message content directly.
    if not StorageService.is_available():
        return JSONResponse(
            status_code=200,
            content={"fallback": True, "message": "Supabase not configured — use base64 content"},
        )

    # ─── Per-file size cap (Content-Length first for fast reject) ────────
    # ``content_length`` may be 0 if chunked; we re-check after reading.
    if content_length and content_length > settings.MAX_FILE_SIZE_BYTES:
        return JSONResponse(
            status_code=413,
            content={
                "error": "file_too_large",
                "message": f"File exceeds {settings.MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB limit",
                "limit": settings.MAX_FILE_SIZE_BYTES,
            },
        )

    # ─── Read the ciphertext blob (capped at MAX_FILE_SIZE_BYTES) ────────
    # Read in a streaming way with a hard ceiling so a malicious client can't
    # OOM us by streaming gigabytes.
    blob = bytearray()
    remaining = settings.MAX_FILE_SIZE_BYTES + 1  # +1 so we can detect overflow
    while remaining > 0:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        blob.extend(chunk)
        remaining -= len(chunk)
    if remaining <= 0:
        return JSONResponse(
            status_code=413,
            content={
                "error": "file_too_large",
                "message": f"File exceeds {settings.MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB limit",
                "limit": settings.MAX_FILE_SIZE_BYTES,
            },
        )
    data = bytes(blob)
    size = len(data)
    if size == 0:
        return JSONResponse(
            status_code=400, content={"error": "empty_file", "message": "Uploaded file is empty"}
        )

    # ─── Total storage quota check (sums existing bucket usage) ──────────
    try:
        await StorageService.check_quota(size)
    except FileTooLargeError:
        return JSONResponse(
            status_code=413,
            content={
                "error": "file_too_large",
                "message": f"File exceeds {settings.MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB limit",
                "limit": settings.MAX_FILE_SIZE_BYTES,
            },
        )
    except QuotaExceededError:
        return JSONResponse(
            status_code=507,
            content={
                "error": "quota_exceeded",
                "message": "Storage quota reached. Delete old files or upgrade your plan.",
                "quota": settings.STORAGE_QUOTA_BYTES,
            },
        )
    except StorageError as e:
        logger.warning("Quota check failed: %s", e)

    # ─── Upload to Supabase ──────────────────────────────────────────────
    rand_id = secrets.token_hex(8)
    safe_name = _safe_filename(file.filename)
    path = f"files/{user_id}/{rand_id}/{safe_name}"
    content_type = file.content_type or "application/octet-stream"

    url = await StorageService.upload_file(path, data, content_type)
    if not url:
        return JSONResponse(
            status_code=502,
            content={"error": "upload_failed", "message": "Could not upload file to storage"},
        )

    logger.info("Uploaded %d bytes to %s for user %s", size, path, user_id)
    return {
        "url": url,
        "path": path,
        "size": size,
        "contentType": content_type,
        "fileName": safe_name,
        "fallback": False,
    }


@router.get("/quota")
async def get_quota(user_id: str = Depends(get_current_user_id)):
    """Return current storage usage and the configured quota.

    Lets the client show a "X MB of 1 GB used" indicator and warn the user
    before they hit the wall.
    """
    if not StorageService.is_available():
        return {"available": False, "used": 0, "quota": 0, "maxFile": 0}
    used = await StorageService.get_storage_usage()
    return {
        "available": True,
        "used": used,
        "quota": settings.STORAGE_QUOTA_BYTES,
        "maxFile": settings.MAX_FILE_SIZE_BYTES,
    }


@router.delete("")
async def delete_attachment(
    path: str = "",
    user_id: str = Depends(get_current_user_id),
):
    """Delete a single attachment by its bucket path.

    Only the user who owns the path (encoded in ``files/{userId}/...``) may
    delete it.  Used as an escape hatch when a client cancels an upload.
    """
    if not path:
        return JSONResponse(status_code=400, content={"error": "missing_path"})
    # Owner check: path must start with files/{userId}/
    prefix = f"files/{user_id}/"
    if not path.startswith(prefix):
        return JSONResponse(
            status_code=403,
            content={"error": "forbidden", "message": "You can only delete your own files"},
        )
    ok = await StorageService.delete_file(path)
    return {"ok": ok}
