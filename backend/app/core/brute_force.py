# per-account brute-force protection on top of the IP rate limiter.
# after MAX_FAILED_ATTEMPTS wrong passwords the account is locked for
# LOCKOUT_SECONDS. state is stored in Redis if configured for multi-process scaling.

import time
from collections import defaultdict
from typing import Dict, Tuple

from app.core.config import settings

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60
FAILURE_WINDOW = LOCKOUT_SECONDS

_failures: Dict[str, list] = defaultdict(list)

_redis_client = None
_redis_init_done = False

def _get_redis():
    global _redis_client, _redis_init_done
    if _redis_init_done:
        return _redis_client
    _redis_init_done = True
    if not settings.has_redis:
        return None
    try:
        import redis
        _redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        _redis_client.ping()
    except Exception:
        _redis_client = None
    return _redis_client


def record_failed_attempt(email: str) -> Tuple[bool, int]:
    key = (email or "").lower().strip()

    rc = _get_redis()
    if rc:
        try:
            count_key = f"bf:count:{key}"
            lock_key = f"bf:lock:{key}"

            count = rc.incr(count_key)
            if count == 1:
                rc.expire(count_key, FAILURE_WINDOW)

            if count >= MAX_FAILED_ATTEMPTS:
                rc.set(lock_key, "1", ex=LOCKOUT_SECONDS)
                rc.delete(count_key)  # reset counter once locked
                return True, LOCKOUT_SECONDS
            return False, 0
        except Exception:
            pass  # fallback to local process memory

    now = time.time()
    cutoff = now - FAILURE_WINDOW
    _failures[key] = [t for t in _failures[key] if t > cutoff]
    _failures[key].append(now)

    if len(_failures[key]) >= MAX_FAILED_ATTEMPTS:
        oldest_in_window = _failures[key][0]
        retry_after = int(LOCKOUT_SECONDS - (now - oldest_in_window))
        return True, max(retry_after, 1)
    return False, 0


def is_locked(email: str) -> Tuple[bool, int]:
    key = (email or "").lower().strip()

    rc = _get_redis()
    if rc:
        try:
            lock_key = f"bf:lock:{key}"
            ttl = rc.ttl(lock_key)
            if ttl > 0:
                return True, ttl
            return False, 0
        except Exception:
            pass

    now = time.time()
    cutoff = now - FAILURE_WINDOW
    _failures[key] = [t for t in _failures[key] if t > cutoff]
    if len(_failures[key]) >= MAX_FAILED_ATTEMPTS:
        oldest = _failures[key][0]
        retry_after = int(LOCKOUT_SECONDS - (now - oldest))
        if retry_after > 0:
            return True, retry_after
        # lockout expired
        _failures[key] = []
    return False, 0


def clear_failures(email: str) -> None:
    key = (email or "").lower().strip()
    rc = _get_redis()
    if rc:
        try:
            rc.delete(f"bf:count:{key}")
            rc.delete(f"bf:lock:{key}")
            return
        except Exception:
            pass
    _failures.pop(key, None)
