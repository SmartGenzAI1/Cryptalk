import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limits: Dict[str, Tuple[int, int]] | None = None):
        super().__init__(app)
        self.limits = limits or {
            "/api/auth/login": (10, 60),
            "/api/auth/register": (5, 60),
            "/api/": (120, 60),
        }
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._redis = None

        if settings.has_redis:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.from_url(settings.REDIS_URL)
            except Exception:
                pass

    def _client_key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def _check_redis(self, key: str, max_req: int, window: int) -> Tuple[bool, int]:
        count = await self._redis.incr(key)
        if count == 1:
            await self._redis.expire(key, window)
        if count > max_req:
            ttl = await self._redis.ttl(key)
            return False, max(ttl, 1)
        return True, 0

    def _check_local(self, key: str, max_req: int, window: int) -> Tuple[bool, int]:
        now = time.time()
        cutoff = now - window
        bucket = self._hits[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= max_req:
            retry_after = int(window - (now - bucket[0]))
            return False, max(retry_after, 1)
        bucket.append(now)
        return True, 0

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        client = self._client_key(request)

        for prefix, (max_req, window) in self.limits.items():
            if path.startswith(prefix):
                key = f"rl:{client}:{prefix}"
                if self._redis:
                    allowed, retry_after = await self._check_redis(key, max_req, window)
                else:
                    allowed, retry_after = self._check_local(key, max_req, window)
                if not allowed:
                    return JSONResponse(
                        status_code=429,
                        content={
                            "error": "rate_limited",
                            "message": "Too many requests. Please slow down.",
                            "retry_after": retry_after,
                        },
                        headers={"Retry-After": str(retry_after)},
                    )
                break

        return await call_next(request)
