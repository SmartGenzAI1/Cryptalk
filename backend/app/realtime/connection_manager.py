# realtime connection manager — tracks online users and socket rooms.
# process-local singleton; swap dicts for redis pub/sub in multi-process.

from typing import Dict, Set
import redis.asyncio as aioredis
from app.core.config import settings
import logging

logger = logging.getLogger("cryptalk.realtime")

# Shared Redis client (async, with automatic response decoding)
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
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await _redis_client.ping()
    except Exception as e:
        logger.warning(f"ConnectionManager failed to connect to Redis: {e}")
        _redis_client = None
    return _redis_client


class ConnectionManager:
    def __init__(self) -> None:
        # process-local tracking: user_id -> set of socket ids
        self._user_sockets: Dict[str, Set[str]] = {}
        # socket_id -> user_id (reverse lookup for disconnect)
        self._socket_user: Dict[str, str] = {}

    async def add(self, sid: str, user_id: str) -> bool:
        # returns True if the user just came online globally (or locally as fallback)
        self._socket_user[sid] = user_id
        is_first_local = False
        if user_id not in self._user_sockets:
            self._user_sockets[user_id] = {sid}
            is_first_local = True
        else:
            self._user_sockets[user_id].add(sid)

        rc = await _get_redis()
        if rc:
            try:
                # Add socket ID to user's socket set in Redis
                await rc.sadd(f"online_user:{user_id}", sid)
                # Keep keys alive for 24 hours of inactivity max
                await rc.expire(f"online_user:{user_id}", 86400)

                # Check if this user was already tracked globally
                was_global_online = await rc.sismember("online_users", user_id)
                if not was_global_online:
                    await rc.sadd("online_users", user_id)
                    return True
                return False
            except Exception as e:
                logger.error(f"Redis error in ConnectionManager.add: {e}")

        return is_first_local

    async def remove(self, sid: str) -> str | None:
        # returns the user_id if they're now fully offline globally
        user_id = self._socket_user.pop(sid, None)
        if user_id is None:
            return None

        sockets = self._user_sockets.get(user_id)
        if sockets:
            sockets.discard(sid)
            if not sockets:
                del self._user_sockets[user_id]

        rc = await _get_redis()
        if rc:
            try:
                await rc.srem(f"online_user:{user_id}", sid)
                # If no more socket connections globally, mark them offline
                if await rc.scard(f"online_user:{user_id}") == 0:
                    await rc.srem("online_users", user_id)
                    await rc.delete(f"online_user:{user_id}")
                    return user_id
                return None
            except Exception as e:
                logger.error(f"Redis error in ConnectionManager.remove: {e}")

        # Fallback to local state if no Redis or Redis failed
        if sockets is not None and not sockets:
            return user_id
        return None

    def get_user_id(self, sid: str) -> str | None:
        return self._socket_user.get(sid)

    async def is_online(self, user_id: str) -> bool:
        rc = await _get_redis()
        if rc:
            try:
                return bool(await rc.sismember("online_users", user_id))
            except Exception as e:
                logger.error(f"Redis error in ConnectionManager.is_online: {e}")
        return user_id in self._user_sockets

    def get_sockets_for_user(self, user_id: str) -> Set[str]:
        # Always return local sockets since we can only send/receive data
        # through connections established with this local process.
        # Note: socketio.AsyncRedisManager handles cross-process broadcasting
        # to rooms and direct sids under the hood.
        return self._user_sockets.get(user_id, set())

    async def all_online_user_ids(self) -> Set[str]:
        rc = await _get_redis()
        if rc:
            try:
                members = await rc.smembers("online_users")
                return set(members) if members else set()
            except Exception as e:
                logger.error(f"Redis error in ConnectionManager.all_online_user_ids: {e}")
        return set(self._user_sockets.keys())


# process-wide singleton
manager = ConnectionManager()
