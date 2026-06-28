# realtime connection manager — tracks online users and socket rooms.
# process-local singleton; swap dicts for redis pub/sub in multi-process.

from typing import Dict, Set
import redis
from app.core.config import settings
import logging

logger = logging.getLogger("cryptalk.realtime")

# Shared Redis client (synchronous, with automatic response decoding)
_redis_client = None
if settings.has_redis:
    try:
        _redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception as e:
        logger.warning(f"ConnectionManager failed to connect to Redis: {e}")


class ConnectionManager:
    def __init__(self) -> None:
        # process-local tracking: user_id -> set of socket ids
        self._user_sockets: Dict[str, Set[str]] = {}
        # socket_id -> user_id (reverse lookup for disconnect)
        self._socket_user: Dict[str, str] = {}

    def add(self, sid: str, user_id: str) -> bool:
        # returns True if the user just came online globally (or locally as fallback)
        self._socket_user[sid] = user_id
        is_first_local = False
        if user_id not in self._user_sockets:
            self._user_sockets[user_id] = {sid}
            is_first_local = True
        else:
            self._user_sockets[user_id].add(sid)

        if _redis_client:
            try:
                # Add socket ID to user's socket set in Redis
                _redis_client.sadd(f"online_user:{user_id}", sid)
                # Keep keys alive for 24 hours of inactivity max
                _redis_client.expire(f"online_user:{user_id}", 86400)
                
                # Check if this user was already tracked globally
                was_global_online = _redis_client.sismember("online_users", user_id)
                if not was_global_online:
                    _redis_client.sadd("online_users", user_id)
                    return True
                return False
            except Exception as e:
                logger.error(f"Redis error in ConnectionManager.add: {e}")
                
        return is_first_local

    def remove(self, sid: str) -> str | None:
        # returns the user_id if they're now fully offline globally
        user_id = self._socket_user.pop(sid, None)
        if user_id is None:
            return None
            
        sockets = self._user_sockets.get(user_id)
        if sockets:
            sockets.discard(sid)
            if not sockets:
                del self._user_sockets[user_id]

        if _redis_client:
            try:
                _redis_client.srem(f"online_user:{user_id}", sid)
                # If no more socket connections globally, mark them offline
                if _redis_client.scard(f"online_user:{user_id}") == 0:
                    _redis_client.srem("online_users", user_id)
                    _redis_client.delete(f"online_user:{user_id}")
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

    def is_online(self, user_id: str) -> bool:
        if _redis_client:
            try:
                return bool(_redis_client.sismember("online_users", user_id))
            except Exception as e:
                logger.error(f"Redis error in ConnectionManager.is_online: {e}")
        return user_id in self._user_sockets

    def get_sockets_for_user(self, user_id: str) -> Set[str]:
        # Always return local sockets since we can only send/receive data
        # through connections established with this local process.
        # Note: socketio.AsyncRedisManager handles cross-process broadcasting
        # to rooms and direct sids under the hood.
        return self._user_sockets.get(user_id, set())

    def all_online_user_ids(self) -> Set[str]:
        if _redis_client:
            try:
                members = _redis_client.smembers("online_users")
                return set(members) if members else set()
            except Exception as e:
                logger.error(f"Redis error in ConnectionManager.all_online_user_ids: {e}")
        return set(self._user_sockets.keys())


# process-wide singleton
manager = ConnectionManager()
