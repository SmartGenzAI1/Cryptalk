import base64
import httpx
from app.core.config import settings


class StorageService:
    _client = None
    _token = None

    @classmethod
    async def _ensure_token(cls):
        if cls._token:
            return cls._token
        if not settings.has_supabase:
            return None
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=apikey",
                headers={"apikey": settings.SUPABASE_KEY},
            )
            if res.status_code == 200:
                cls._token = res.json().get("access_token")
        return cls._token

    @classmethod
    async def upload_file(cls, path: str, data: bytes, content_type: str = "application/octet-stream") -> str | None:
        if not settings.has_supabase:
            return None
        token = await cls._ensure_token()
        if not token:
            return None
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    f"{settings.SUPABASE_URL}/storage/v1/object/cryptalk/{path}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "apikey": settings.SUPABASE_KEY,
                        "Content-Type": content_type,
                    },
                    content=data,
                )
                if res.status_code in (200, 201):
                    return f"{settings.SUPABASE_URL}/storage/v1/object/public/cryptalk/{path}"
        except Exception:
            pass
        return None

    @classmethod
    async def delete_file(cls, path: str) -> bool:
        if not settings.has_supabase:
            return False
        token = await cls._ensure_token()
        if not token:
            return False
        try:
            async with httpx.AsyncClient() as client:
                res = await client.delete(
                    f"{settings.SUPABASE_URL}/storage/v1/object/cryptalk/{path}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "apikey": settings.SUPABASE_KEY,
                    },
                )
                return res.status_code in (200, 204, 404)
        except Exception:
            return False
