"""Supabase Storage adapter for E2EE file attachments.

Files are uploaded by the client *after* end-to-end encryption, so the bytes
stored here are always ciphertext — Supabase (and the server) cannot read them.

The service also enforces the storage budget so a single chatty deployment
cannot blow through the 1 GB free-tier limit:

* ``MAX_FILE_SIZE_BYTES``  — hard per-file cap (default 25 MB).
* ``STORAGE_QUOTA_BYTES``  — soft total cap (default 950 MB, leaving headroom
  under Supabase's 1 GB free tier).

When a message is delivered (or deleted for everyone) the message service calls
``delete_file``/``delete_file_by_url`` to wipe the object, fulfilling the
"ephemeral storage" promise: the ciphertext is gone from the server too.
"""

import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger("cryptalk.storage")


class StorageError(Exception):
    """Raised when a storage operation fails for a non-transient reason."""


class QuotaExceededError(StorageError):
    """Raised when an upload would push total usage past ``STORAGE_QUOTA_BYTES``."""


class FileTooLargeError(StorageError):
    """Raised when a single file exceeds ``MAX_FILE_SIZE_BYTES``."""


class StorageService:
    """Thin async wrapper around the Supabase Storage REST API.

    All methods are no-ops (returning ``None``/``False``) when Supabase is not
    configured, which lets the message layer fall back to the legacy
    base64-in-content path during local development.
    """

    _token: Optional[str] = None
    _token_expires: float = 0.0

    # ─── Auth ────────────────────────────────────────────────────────────

    @classmethod
    async def _ensure_token(cls) -> Optional[str]:
        """Return a cached API-key bearer token, refreshing if needed."""
        import time

        if not settings.has_supabase:
            return None
        # Refresh every 50 min (Supabase apikey tokens live ~1 h).
        if cls._token and time.time() < cls._token_expires:
            return cls._token
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=apikey",
                    headers={"apikey": settings.SUPABASE_KEY},
                )
            if res.status_code == 200:
                data = res.json()
                cls._token = data.get("access_token")
                cls._token_expires = time.time() + 50 * 60
                return cls._token
            logger.warning("Supabase token fetch failed: %s %s", res.status_code, res.text[:200])
        except Exception as e:
            logger.warning("Supabase token fetch error: %s", e)
        return None

    @classmethod
    def _headers(cls, token: str, content_type: Optional[str] = None) -> dict:
        h = {
            "Authorization": f"Bearer {token}",
            "apikey": settings.SUPABASE_KEY,
        }
        if content_type:
            h["Content-Type"] = content_type
        return h

    # ─── Public API ──────────────────────────────────────────────────────

    @classmethod
    def is_available(cls) -> bool:
        return settings.has_supabase

    @classmethod
    async def upload_file(
        cls,
        path: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> Optional[str]:
        """Upload ``data`` to ``path`` in the configured bucket.

        Returns the public URL on success, or ``None`` on failure / when
        Supabase is not configured.  Enforces the per-file size cap.
        """
        if not settings.has_supabase:
            return None
        if len(data) > settings.MAX_FILE_SIZE_BYTES:
            raise FileTooLargeError(
                f"File is {len(data)} bytes, exceeds {settings.MAX_FILE_SIZE_BYTES} byte cap"
            )
        token = await cls._ensure_token()
        if not token:
            return None
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                res = await client.post(
                    f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_BUCKET}/{path}",
                    headers=cls._headers(token, content_type),
                    content=data,
                )
            if res.status_code in (200, 201):
                return cls.public_url(path)
            logger.warning("Upload failed for %s: %s %s", path, res.status_code, res.text[:200])
        except Exception as e:
            logger.warning("Upload error for %s: %s", path, e)
        return None

    @classmethod
    def public_url(cls, path: str) -> str:
        return f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_BUCKET}/{path}"

    @classmethod
    def path_from_url(cls, url: str) -> Optional[str]:
        """Extract the bucket-relative ``path`` from a public URL.

        Returns ``None`` if the URL does not look like one of ours.
        """
        if not url:
            return None
        marker = f"/storage/v1/object/public/{settings.SUPABASE_BUCKET}/"
        idx = url.find(marker)
        if idx < 0:
            return None
        return url[idx + len(marker):]

    @classmethod
    async def delete_file(cls, path: str) -> bool:
        if not path or not settings.has_supabase:
            return False
        token = await cls._ensure_token()
        if not token:
            return False
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.delete(
                    f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_BUCKET}/{path}",
                    headers=cls._headers(token),
                )
            # 200/204 = deleted, 404 = already gone — all success states for us.
            if res.status_code in (200, 204, 404):
                logger.info("Deleted storage object %s", path)
                # Invalidate the cached usage so the next quota check is fresh.
                from app.core.cache import cache
                cache.invalidate("storage_usage")
                return True
            logger.warning("Delete failed for %s: %s %s", path, res.status_code, res.text[:200])
        except Exception as e:
            logger.warning("Delete error for %s: %s", path, e)
        return False

    @classmethod
    async def delete_file_by_url(cls, url: str) -> bool:
        """Convenience wrapper — extract path from a public URL then delete."""
        path = cls.path_from_url(url)
        if not path:
            return False
        return await cls.delete_file(path)

    @classmethod
    async def get_storage_usage(cls) -> int:
        """Sum the size of every object currently in the bucket.

        Used by the upload endpoint to enforce ``STORAGE_QUOTA_BYTES``.
        Returns 0 if Supabase isn't configured or the listing fails.

        Cached for 60 seconds — listing every object on every upload is O(n)
        and would get slow as the bucket fills.  A 60s window is short enough
        that the quota check stays meaningful but long enough that a burst of
        uploads doesn't hammer the Supabase list API.
        """
        if not settings.has_supabase:
            return 0
        from app.core.cache import cache
        cached = cache.get("storage_usage")
        if cached is not None:
            return cached
        total = await cls._compute_storage_usage()
        cache.set("storage_usage", total, ttl=60.0)
        return total

    @classmethod
    async def _compute_storage_usage(cls) -> int:
        """Uncached bucket-size computation (lists every object)."""
        if not settings.has_supabase:
            return 0
        token = await cls._ensure_token()
        if not token:
            return 0
        total = 0
        offset = 0
        limit = 100
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                while True:
                    res = await client.post(
                        f"{settings.SUPABASE_URL}/storage/v1/object/list/{settings.SUPABASE_BUCKET}",
                        headers=cls._headers(token, "application/json"),
                        json={
                            "prefix": "",
                            "limit": limit,
                            "offset": offset,
                            "sortBy": {"column": "name", "order": "asc"},
                        },
                    )
                    if res.status_code != 200:
                        logger.warning("Storage list failed: %s %s", res.status_code, res.text[:200])
                        break
                    items = res.json() or []
                    for item in items:
                        # ``metadata.size`` holds the object size in bytes.
                        meta = item.get("metadata") or {}
                        total += int(meta.get("size", 0))
                    if len(items) < limit:
                        break
                    offset += limit
        except Exception as e:
            logger.warning("Storage usage error: %s", e)
        return total

    @classmethod
    async def check_quota(cls, additional_bytes: int) -> None:
        """Raise ``QuotaExceededError`` if adding ``additional_bytes`` breaks the cap."""
        if not settings.has_supabase:
            return
        if additional_bytes > settings.MAX_FILE_SIZE_BYTES:
            raise FileTooLargeError(
                f"File is {additional_bytes} bytes, exceeds {settings.MAX_FILE_SIZE_BYTES} byte cap"
            )
        used = await cls.get_storage_usage()
        if used + additional_bytes > settings.STORAGE_QUOTA_BYTES:
            raise QuotaExceededError(
                f"Upload would push storage to {used + additional_bytes} bytes "
                f"(quota is {settings.STORAGE_QUOTA_BYTES})"
            )
