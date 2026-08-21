import logging
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger("cryptalk.rate_limit")


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
                logger.warning("Failed to initialize Redis for rate limiting, falling back to in-memory")

    def _client_key(self, request: Request) -> str:
        real_ip = request.headers.get("x-real-ip", "").strip()
        forwarded = request.headers.get("x-forwarded-for", "")
        ips = [i.strip() for i in forwarded.split(",") if i.strip()]

        # Mitigate x-real-ip spoofing: prefer x-forwarded-for (set by trusted proxy)
        # over x-real-ip which can be set by any client
        if ips:
            ip = ips[-1]
        elif request.client and request.client.host:
            ip = request.client.host
        elif real_ip:
            ip = real_ip
        else:
            ip = "unknown"

        return ip

    def _user_key(self, request: Request) -> str | None:
        token = request.cookies.get("__Host-tc_session") or request.cookies.get(settings.COOKIE_NAME)
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()
        if not token:
            return None
        from app.core.security import verify_session_token
        return verify_session_token(token)

    async def _check_redis(self, key: str, max_req: int, window: int) -> Tuple[bool, int]:
        try:
            count = await self._redis.incr(key)
            if count == 1:
                await self._redis.expire(key, window)
            if count > max_req:
                ttl = await self._redis.ttl(key)
                return False, max(ttl, 1)
            return True, 0
        except Exception:
            logger.warning("Redis error in rate limiter for key %s, falling back to in-memory", key)
            return self._check_local(key, max_req, window)

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

        # housekeeping: purge dead buckets every ~100 requests to cap memory
        if len(self._hits) > 100:
            stale = [k for k, v in self._hits.items() if not v or v[0] < now - window]
            for k in stale:
                del self._hits[k]

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
                # secondary per-user rate limit for authenticated requests
                user_id = self._user_key(request)
                if user_id:
                    user_key = f"rl:user:{user_id}:{prefix}"
                    if self._redis:
                        allowed, retry_after = await self._check_redis(user_key, max_req, window)
                    else:
                        allowed, retry_after = self._check_local(user_key, max_req, window)
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
