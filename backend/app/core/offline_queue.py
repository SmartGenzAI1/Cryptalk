# offline message queue — holds encrypted messages for users who aren't connected.
# messages queue up, get delivered when the user reconnects, then auto-delete.
# uses Redis if available (multi-process safe), falls back to process-local dict.
# all messages are encrypted ciphertext — server can't read them.

import json
import logging
import time
from collections import defaultdict
from typing import Dict, List

from app.core.config import settings

logger = logging.getLogger("cryptalk.queue")

_local_queue: Dict[str, List[dict]] = defaultdict(list)

_redis = None
_redis_ready = False


async def _get_redis():
    global _redis, _redis_ready
    if _redis_ready:
        return _redis
    _redis_ready = True
    if not settings.has_redis:
        return None
    try:
        import redis.asyncio as _redis_lib
        _redis = _redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
        await _redis.ping()
        logger.info("Offline queue using Redis")
    except Exception:
        _redis = None
    return _redis


async def enqueue(user_id: str, message: dict) -> None:
    message["_queued_at"] = time.time()
    rc = await _get_redis()
    if rc:
        try:
            key = f"oq:{user_id}"
            await rc.rpush(key, json.dumps(message, default=str))
            await rc.ltrim(key, -500, -1)
            await rc.expire(key, settings.OFFLINE_QUEUE_TTL)
            return
        except Exception as e:
            logger.warning("Redis enqueue failed, using local: %s", e)

    _local_queue[user_id].append(message)
    # cap local queue per user to prevent memory exhaustion
    if len(_local_queue[user_id]) > 500:
        _local_queue[user_id] = _local_queue[user_id][-500:]


async def drain(user_id: str) -> List[dict]:
    rc = await _get_redis()
    if rc:
        try:
            key = f"oq:{user_id}"
            pipe = rc.pipeline()
            pipe.lrange(key, 0, -1)
            pipe.delete(key)
            results = await pipe.execute()
            raw_messages = results[0] or []
            now = time.time()
            messages = []
            for raw in raw_messages:
                try:
                    msg = json.loads(raw)
                    queued_at = msg.pop("_queued_at", 0)
                    if now - queued_at < settings.OFFLINE_QUEUE_TTL:
                        messages.append(msg)
                except (json.JSONDecodeError, TypeError):
                    pass
            return messages
        except Exception as e:
            logger.warning("Redis drain failed, using local: %s", e)

    messages = _local_queue.pop(user_id, [])
    now = time.time()
    return [
        {k: v for k, v in m.items() if k != "_queued_at"}
        for m in messages
        if now - m.get("_queued_at", 0) < settings.OFFLINE_QUEUE_TTL
    ]


async def queue_size(user_id: str) -> int:
    rc = await _get_redis()
    if rc:
        try:
            return await rc.llen(f"oq:{user_id}")
        except Exception:
            pass
    return len(_local_queue.get(user_id, []))
