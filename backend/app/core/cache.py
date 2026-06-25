# tiny TTL cache for process-local values that are expensive to recompute
# (storage usage, etc.). swap for redis in multi-process.

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
