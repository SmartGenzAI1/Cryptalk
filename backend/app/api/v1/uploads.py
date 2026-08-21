# file upload endpoints — e2ee ciphertext storage in supabase.
# client encrypts then POSTs ciphertext; we store it and return a URL.
# when supabase isn't configured we tell the client to fall back to base64.
# Original filenames are NEVER stored; only random UUIDs are used for storage paths.

import logging
import os
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

_ALLOWED_MIME_PREFIXES = (
    "image/",
    "video/",
    "audio/",
    "application/pdf",
    "application/zip",
    "application/x-zip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "text/plain",
    "application/octet-stream",
)


@router.post("")
async def upload_attachment(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    content_length: int = Header(0, alias="content-length"),
):
    # dev fallback: client should embed ciphertext in message content directly
    if not StorageService.is_available():
        return JSONResponse(
            status_code=200,
            content={"fallback": True, "message": "Supabase not configured — use base64 content"},
        )

    # per-file cap (content-length first for fast reject; chunked may send 0)
    if content_length and content_length > settings.MAX_FILE_SIZE_BYTES:
        return JSONResponse(
            status_code=413,
            content={
                "error": "file_too_large",
                "message": f"File exceeds {settings.MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB limit",
                "limit": settings.MAX_FILE_SIZE_BYTES,
            },
        )

    # stream-read with a hard ceiling so a malicious client can't OOM us
    blob = bytearray()
    remaining = settings.MAX_FILE_SIZE_BYTES + 1  # +1 to detect overflow
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

    # validate MIME type against allowlist
    content_type = file.content_type or "application/octet-stream"
    if not any(content_type.startswith(prefix) for prefix in _ALLOWED_MIME_PREFIXES):
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_content_type", "message": "File type not allowed"},
        )

    # total storage quota check
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
    except StorageError:
        return JSONResponse(
            status_code=503,
            content={
                "error": "storage_error",
                "message": "Storage service error",
            },
        )

    # strip file metadata if configured
    if settings.STRIP_FILE_METADATA:
        content_type = "application/octet-stream"
        data = bytes(blob)

    # upload to supabase — use only random IDs, never store original filename
    rand_id = secrets.token_hex(8)
    path = f"files/{rand_id}/blob"

    try:
        url = await StorageService.upload_file(path, data, content_type)
    except StorageError:
        return JSONResponse(
            status_code=503,
            content={"error": "storage_error", "message": "Storage upload failed - fall back to base64"},
        )
    if not url:
        return JSONResponse(
            status_code=503,
            content={"error": "storage_unreachable", "message": "Storage unreachable - fall back to base64"},
        )

    return {
        "url": url,
        "path": path,
        "fallback": False,
    }


@router.get("/quota")
async def get_quota(user_id: str = Depends(get_current_user_id)):
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
    if not path:
        return JSONResponse(status_code=400, content={"error": "missing_path"})
    # ownership + path-traversal defense: path must start with files/{user_id}/,
    # no ".." segments, no null bytes
    prefix = f"files/{user_id}/"
    if not path.startswith(prefix) or ".." in path or "\x00" in path:
        return JSONResponse(
            status_code=403,
            content={"error": "forbidden", "message": "You can only delete your own files"},
        )
    ok = await StorageService.delete_file(path)
    return {"ok": ok}
