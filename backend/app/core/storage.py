# supabase storage adapter for e2ee file attachments.
# files are ciphertext (client encrypts before upload) so we can't read them.

import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger("cryptalk.storage")


class StorageError(Exception):
    pass


class QuotaExceededError(StorageError):
    pass


class FileTooLargeError(StorageError):
    pass


class StorageService:
    # async wrapper around supabase storage REST API. no-ops when supabase isn't
    # configured so the message layer can fall back to base64-in-content.

    _token: Optional[str] = None
    _token_expires: float = 0.0
    _client: Optional[httpx.AsyncClient] = None

    @classmethod
    def _get_client(cls) -> httpx.AsyncClient:
        # shared client keeps TLS connections alive
        if cls._client is None or cls._client.is_closed:
            cls._client = httpx.AsyncClient(
                timeout=httpx.Timeout(60.0, connect=10.0),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
        return cls._client

    @classmethod
    async def close(cls) -> None:
        if cls._client and not cls._client.is_closed:
            await cls._client.aclose()
        cls._client = None

    # ─── Auth ────────────────────────────────────────────────────────────

    @classmethod
    async def _ensure_token(cls) -> Optional[str]:
        import time

        if not settings.has_supabase:
            return None
        # refresh every 50 min (tokens live ~1h)
        if cls._token and time.time() < cls._token_expires:
            return cls._token
        try:
            client = cls._get_client()
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
            client = cls._get_client()
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
            client = cls._get_client()
            res = await client.delete(
                f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_BUCKET}/{path}",
                headers=cls._headers(token),
            )
            # 200/204 = deleted, 404 = already gone — all fine
            if res.status_code in (200, 204, 404):
                logger.info("Deleted storage object %s", path)
                # invalidate cached usage so next quota check is fresh
                from app.core.cache import cache
                cache.invalidate("storage_usage")
                return True
            logger.warning("Delete failed for %s: %s %s", path, res.status_code, res.text[:200])
        except Exception as e:
            logger.warning("Delete error for %s: %s", path, e)
        return False

    @classmethod
    async def delete_file_by_url(cls, url: str) -> bool:
        path = cls.path_from_url(url)
        if not path:
            return False
        return await cls.delete_file(path)

    @classmethod
    async def get_storage_usage(cls) -> int:
        # cached 60s — listing every object per upload would hammer the api
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
        if not settings.has_supabase:
            return 0
        token = await cls._ensure_token()
        if not token:
            return 0
        total = 0
        offset = 0
        limit = 100
        try:
            client = cls._get_client()
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
