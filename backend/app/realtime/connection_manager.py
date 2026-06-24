"""Realtime connection manager — tracks online users and socket rooms.

The manager is a process-local singleton.  In a multi-process deployment
you would replace the in-memory dicts with Redis pub/sub, but the
public API of this class stays the same.
"""

from typing import Dict, Set


class ConnectionManager:
    """Tracks socket IDs per user and broadcasts presence updates."""

    def __init__(self) -> None:
        # user_id -> set of socket ids (a user may have multiple tabs open)
        self._user_sockets: Dict[str, Set[str]] = {}
        # socket_id -> user_id (reverse lookup for disconnect)
        self._socket_user: Dict[str, str] = {}

    def add(self, sid: str, user_id: str) -> bool:
        """Register a socket. Returns ``True`` if the user just came online."""
        self._socket_user[sid] = user_id
        if user_id not in self._user_sockets:
            self._user_sockets[user_id] = {sid}
            return True  # newly online
        self._user_sockets[user_id].add(sid)
        return False

    def remove(self, sid: str) -> str | None:
        """Unregister a socket. Returns the user_id if they are now fully offline."""
        user_id = self._socket_user.pop(sid, None)
        if user_id is None:
            return None
        sockets = self._user_sockets.get(user_id)
        if sockets:
            sockets.discard(sid)
            if not sockets:
                del self._user_sockets[user_id]
                return user_id  # now offline
        return None

    def get_user_id(self, sid: str) -> str | None:
        return self._socket_user.get(sid)

    def is_online(self, user_id: str) -> bool:
        return user_id in self._user_sockets

    def get_sockets_for_user(self, user_id: str) -> Set[str]:
        return self._user_sockets.get(user_id, set())

    def all_online_user_ids(self) -> Set[str]:
        return set(self._user_sockets.keys())


# Process-wide singleton
manager = ConnectionManager()
