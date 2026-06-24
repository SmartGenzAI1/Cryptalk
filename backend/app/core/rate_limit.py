"""Per-IP rate limiter."""

import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

class RateLimitMiddleware(BaseHTTPMiddleware):

    def __init__(self, app, limits: Dict[str, Tuple[int, int]] | None = None):
        """
        Args:
            app: The ASGI application to wrap.
            limits: Mapping of path prefix → (max_requests, window_seconds).
                    Defaults to a conservative global limit.
        """
        super().__init__(app)
        self.limits = limits or {
            "/api/auth/login": (10, 60),       # 10 login attempts / minute
            "/api/auth/register": (5, 60),      # 5 registrations / minute
            "/api/": (100, 60),                 # 100 general API calls / minute
        }
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def _client_key(self, request: Request) -> str:
    
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _check(self, key: str, max_req: int, window: int) -> Tuple[bool, int]:
    
        now = time.time()
        cutoff = now - window
        bucket = self._hits[key]

        # Evict expired entries
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

        # Find the matching limit rule (longest prefix match)
        for prefix, (max_req, window) in self.limits.items():
            if path.startswith(prefix):
                key = f"{client}:{prefix}"
                allowed, retry_after = self._check(key, max_req, window)
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
