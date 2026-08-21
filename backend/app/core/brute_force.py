# per-account brute-force protection on top of the IP rate limiter.
# after MAX_FAILED_ATTEMPTS wrong passwords the account is locked for
# LOCKOUT_SECONDS. state is stored in Redis if configured for multi-process scaling.

import logging
import time
from collections import defaultdict
from typing import Dict, Tuple

from app.core.config import settings

logger = logging.getLogger("cryptalk.brute_force")

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60
FAILURE_WINDOW = LOCKOUT_SECONDS

_failures: Dict[str, list] = defaultdict(list)

_redis_client = None
_redis_init_done = False

async def _get_redis():
    global _redis_client, _redis_init_done
    if _redis_init_done:
        return _redis_client
    _redis_init_done = True
    if not settings.has_redis:
        return None
    try:
        import redis.asyncio as aioredis
        _redis_client = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await _redis_client.ping()
    except Exception:
        logger.warning("Failed to initialize Redis for brute-force protection, falling back to in-memory")
        _redis_client = None
    return _redis_client


async def record_failed_attempt(email: str) -> Tuple[bool, int]:
    key = (email or "").lower().strip()

    rc = await _get_redis()
    if rc:
        try:
            count_key = f"bf:count:{key}"
            lock_key = f"bf:lock:{key}"

            count = await rc.incr(count_key)
            if count == 1:
                await rc.expire(count_key, FAILURE_WINDOW)

            if count >= MAX_FAILED_ATTEMPTS:
                await rc.set(lock_key, "1", ex=LOCKOUT_SECONDS)
                await rc.delete(count_key)
                return True, LOCKOUT_SECONDS
            return False, 0
        except Exception:
            logger.warning("Redis error recording failed attempt for %s, falling back to in-memory", key)

    now = time.time()
    cutoff = now - FAILURE_WINDOW
    _failures[key] = [t for t in _failures[key] if t > cutoff]
    _failures[key].append(now)

    if len(_failures[key]) >= MAX_FAILED_ATTEMPTS:
        oldest_in_window = _failures[key][0]
        retry_after = int(LOCKOUT_SECONDS - (now - oldest_in_window))
        return True, max(retry_after, 1)
    return False, 0


async def is_locked(email: str) -> Tuple[bool, int]:
    key = (email or "").lower().strip()

    rc = await _get_redis()
    if rc:
        try:
            lock_key = f"bf:lock:{key}"
            ttl = await rc.ttl(lock_key)
            if ttl > 0:
                return True, ttl
            return False, 0
        except Exception:
            logger.warning("Redis error checking lock for %s, falling back to in-memory", key)

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


async def clear_failures(email: str) -> None:
    key = (email or "").lower().strip()
    rc = await _get_redis()
    if rc:
        try:
            await rc.delete(f"bf:count:{key}")
            await rc.delete(f"bf:lock:{key}")
            return
        except Exception:
            logger.warning("Redis error clearing failures for %s, falling back to in-memory", key)
    _failures.pop(key, None)
