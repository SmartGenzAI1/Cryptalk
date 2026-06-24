"""Tiny TTL cache for process-local values that are expensive to recompute.

We avoid pulling in Redis / memcached for the dev path — the values we cache
(storage-usage summary, rate-limit counters) are per-process and tolerate a
short staleness window.  In a multi-process deployment you'd swap this for
Redis, but the call sites (``cached`` decorator / ``get_cached``) stay the
same.
"""

import time
from typing import Any, Optional


class _TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if time.time() > expires_at:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl: float) -> None:
        self._store[key] = (time.time() + ttl, value)

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)


cache = _TTLCache()
