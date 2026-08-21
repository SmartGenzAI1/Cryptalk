# background cleanup — deletes orphaned files from supabase storage
# and purges stale metadata, sessions, and expired invite links.
# all files older than FILE_RETENTION_HOURS get purged.

import asyncio
import logging
import time

from app.core.config import settings
from app.core.security import now_ms

logger = logging.getLogger("cryptalk.cleanup")

_running = False


async def cleanup_expired_files() -> int:
    from app.core.storage import StorageService
    if not StorageService.is_available():
        return 0

    cutoff_hours = settings.FILE_RETENTION_HOURS
    deleted = 0

    try:
        token = await StorageService._ensure_token()
        if not token:
            return 0

        client = StorageService._get_client()
        offset = 0
        limit = 100

        while True:
            res = await client.post(
                f"{settings.SUPABASE_URL}/storage/v1/object/list/{settings.SUPABASE_BUCKET}",
                headers=StorageService._headers(token, "application/json"),
                json={
                    "prefix": "files/",
                    "limit": limit,
                    "offset": offset,
                    "sortBy": {"column": "created_at", "order": "asc"},
                },
            )
            if res.status_code != 200:
                logger.warning("Cleanup list failed")
                break

            items = res.json() or []
            now = time.time()
            expired_names = []

            for item in items:
                meta = item.get("metadata") or {}
                created_str = item.get("created_at") or meta.get("lastModified", "")
                if not created_str:
                    continue

                try:
                    from datetime import datetime, timezone
                    created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                    age_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600
                except (ValueError, TypeError):
                    continue

                if age_hours >= cutoff_hours:
                    name = item.get("name", "")
                    if name:
                        expired_names.append(name)

            # batch delete all expired files in one request
            if expired_names:
                ok = await StorageService.delete_files(expired_names)
                deleted += len(expired_names) if ok else 0

            if len(items) < limit:
                break
            offset += limit

    except (OSError, Exception) as e:
        if isinstance(e, OSError) or "Name or service not known" in str(e):
            logger.warning("Supabase storage unreachable for cleanup")
        else:
            logger.error("Cleanup sweep error")

    if deleted:
        logger.info("Cleanup swept %d expired files", deleted)
    return deleted


async def purge_inactive_user(user_id: str, session) -> None:
    """Completely destroy ALL data for a single user — full cascade deletion."""
    from sqlalchemy import delete as sa_delete
    from app.models import (
        User, Chat, ChatMember, ConnectionRequest,
        UserBlock, UserNickname, Report,
    )

    # 1. Delete all ChatMember rows for this user
    await session.execute(
        sa_delete(ChatMember).where(ChatMember.user_id == user_id)
    )

    # 2. Delete all ConnectionRequest rows (from or to)
    await session.execute(
        sa_delete(ConnectionRequest).where(
            (ConnectionRequest.from_user_id == user_id)
            | (ConnectionRequest.to_user_id == user_id)
        )
    )

    # 3. Delete all UserBlock rows
    await session.execute(
        sa_delete(UserBlock).where(
            (UserBlock.blocker_id == user_id)
            | (UserBlock.blocked_id == user_id)
        )
    )

    # 4. Delete all UserNickname rows
    await session.execute(
        sa_delete(UserNickname).where(
            (UserNickname.owner_id == user_id)
            | (UserNickname.target_user_id == user_id)
        )
    )

    # 5. Delete all Report rows (where user is reporter or reported)
    await session.execute(
        sa_delete(Report).where(
            (Report.reporter_id == user_id)
            | (Report.reported_id == user_id)
        )
    )

    # 6. Delete any chats owned by this user (saved/direct)
    await session.execute(
        sa_delete(Chat).where(
            (Chat.created_by == user_id)
            & (Chat.type.in_(["saved", "direct"]))
        )
    )

    # 7. Delete the User row itself
    await session.execute(
        sa_delete(User).where(User.id == user_id)
    )

    await session.flush()

    # 8. Delete any files in Supabase storage under this user's path
    from app.core.storage import StorageService
    if StorageService.is_available():
        try:
            token = await StorageService._ensure_token()
            if token:
                client = StorageService._get_client()
                res = await client.post(
                    f"{settings.SUPABASE_URL}/storage/v1/object/list/{settings.SUPABASE_BUCKET}",
                    headers=StorageService._headers(token, "application/json"),
                    json={
                        "prefix": f"files/{user_id}/",
                        "limit": 100,
                        "offset": 0,
                        "sortBy": {"column": "name", "order": "asc"},
                    },
                )
                if res.status_code == 200:
                    items = res.json() or []
                    file_names = [item.get("name", "") for item in items if item.get("name")]
                    if file_names:
                        await StorageService.delete_files(file_names)
        except Exception:
            logger.warning("Failed to purge storage files for user %s", user_id[:8])

    # 9. Drain any queued offline messages for this user
    try:
        from app.core.offline_queue import drain
        await drain(user_id)
    except Exception:
        pass


async def cleanup_all_inactive_users() -> int:
    """Find users inactive > DATA_RETENTION_DAYS and purge them completely."""
    from app.core.database import async_session_factory
    from app.models import User
    from sqlalchemy import select
    from datetime import datetime, timezone, timedelta

    days = settings.DATA_RETENTION_DAYS
    cutoff_ms = now_ms() - (days * 24 * 60 * 60 * 1000)
    cutoff_dt = (datetime.now(timezone.utc) - timedelta(days=days)).replace(tzinfo=None)
    purged_count = 0

    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(User.id).where(
                    ((User.last_active_at.isnot(None)) & (User.last_active_at < cutoff_dt))
                    | ((User.last_active_at.is_(None)) & (User.last_seen < cutoff_ms))
                    | ((User.last_active_at.is_(None)) & (User.last_seen.is_(None)) & (User.created_at < cutoff_ms))
                )
            )
            inactive_ids = [row[0] for row in result.all()]

            for uid in inactive_ids:
                try:
                    await purge_inactive_user(uid, db)
                    await db.commit()
                    purged_count += 1
                    logger.info(
                        "Purged user %s... (inactive > %d days)",
                        uid[:8], days,
                    )
                except Exception:
                    logger.error("Failed to purge user %s", uid[:8])
                    await db.rollback()

    except Exception:
        logger.error("Inactive user cleanup scan failed")
    return purged_count


async def cleanup_stale_connections() -> int:
    from app.realtime.connection_manager import _get_redis
    cleaned = 0
    rc = await _get_redis()
    if not rc:
        return 0
    try:
        online_user_ids = await rc.smembers("online_users")
        if not online_user_ids:
            return 0
        for uid in online_user_ids:
            key = f"online_user:{uid}"
            ttl = await rc.ttl(key)
            if ttl == -2:
                await rc.srem("online_users", uid)
                cleaned += 1
        if cleaned:
            logger.info("Cleaned %d stale online_user entries", cleaned)
    except Exception:
        logger.warning("Stale connection cleanup failed")
    return cleaned


async def cleanup_orphaned_files() -> int:
    from app.core.database import async_session_factory
    from app.core.storage import StorageService
    if not StorageService.is_available():
        return 0
    deleted = 0
    try:
        token = await StorageService._ensure_token()
        if not token:
            return 0
        client = StorageService._get_client()
        offset = 0
        limit = 100
        while True:
            res = await client.post(
                f"{settings.SUPABASE_URL}/storage/v1/object/list/{settings.SUPABASE_BUCKET}",
                headers=StorageService._headers(token, "application/json"),
                json={
                    "prefix": "files/",
                    "limit": limit,
                    "offset": offset,
                    "sortBy": {"column": "name", "order": "asc"},
                },
            )
            if res.status_code != 200:
                break
            items = res.json() or []
            async with async_session_factory() as db:
                from sqlalchemy import select
                from app.models import User
                active_user_ids = set()
                result = await db.execute(select(User.id))
                for row in result.all():
                    active_user_ids.add(row[0])
            orphan_names = []
            for item in items:
                name = item.get("name", "")
                parts = name.split("/")
                if len(parts) >= 2:
                    owner_id = parts[1]
                    if owner_id not in active_user_ids:
                        orphan_names.append(name)
            if orphan_names:
                ok = await StorageService.delete_files(orphan_names)
                deleted += len(orphan_names) if ok else 0
            if len(items) < limit:
                break
            offset += limit
    except Exception:
        logger.warning("Orphaned file cleanup failed")
    if deleted:
        logger.info("Cleaned up %d orphaned files", deleted)
    return deleted


async def cleanup_expired_metadata() -> int:
    """Remove old metadata that is no longer needed (e.g., stale online status, old lastSeen)."""
    from app.core.database import async_session_factory
    from sqlalchemy import text
    retention_ms = settings.DATA_RETENTION_DAYS * 86400 * 1000
    cutoff = int(time.time() * 1000) - retention_ms
    cleaned = 0
    try:
        async with async_session_factory() as db:
            # Reset is_online for users inactive beyond retention period
            result = await db.execute(
                text('UPDATE "User" SET "isOnline" = 0 WHERE "isOnline" = 1 AND "lastSeen" < :cutoff'),
                {"cutoff": cutoff},
            )
            cleaned = result.rowcount
            await db.commit()
        if cleaned:
            logger.info("Reset %d stale online statuses", cleaned)
    except Exception:
        logger.warning("Metadata cleanup failed")
    return cleaned


async def cleanup_expired_sessions() -> int:
    """Clean up expired session data. Sessions use HMAC-signed cookies,
    so we only need to remove stale refresh tokens and temp sessions."""
    from app.core.database import async_session_factory
    from sqlalchemy import text
    max_age_ms = settings.COOKIE_MAX_AGE * 1000
    cutoff = int(time.time() * 1000) - max_age_ms
    cleaned = 0
    try:
        async with async_session_factory() as db:
            # Clear stale connection request statuses for expired tokens
            result = await db.execute(
                text('UPDATE "ConnectionRequest" SET "status" = \'expired\' '
                     'WHERE "status" = \'pending\' AND "createdAt" < :cutoff'),
                {"cutoff": cutoff},
            )
            cleaned = result.rowcount
            await db.commit()
        if cleaned:
            logger.info("Expired %d stale session-related records")
    except Exception:
        logger.warning("Session cleanup failed")
    return cleaned


async def cleanup_expired_invite_links() -> int:
    """Remove invite tokens that have passed their expiry date."""
    from app.core.database import async_session_factory
    from sqlalchemy import text
    now = int(time.time() * 1000)
    cleaned = 0
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                text('UPDATE "Chat" SET "inviteToken" = NULL, "inviteTokenExpiry" = NULL '
                     'WHERE "inviteToken" IS NOT NULL AND "inviteTokenExpiry" IS NOT NULL AND "inviteTokenExpiry" < :now'),
                {"now": now},
            )
            cleaned = result.rowcount
            await db.commit()
        if cleaned:
            logger.info("Cleaned %d expired invite links")
    except Exception:
        logger.warning("Invite link cleanup failed")
    return cleaned


async def cleanup_old_connection_requests() -> int:
    """Remove old rejected or expired connection requests beyond retention."""
    from app.core.database import async_session_factory
    from sqlalchemy import text
    retention_ms = settings.DATA_RETENTION_DAYS * 86400 * 1000
    cutoff = int(time.time() * 1000) - retention_ms
    cleaned = 0
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                text('DELETE FROM "ConnectionRequest" WHERE "status" != \'pending\' AND "createdAt" < :cutoff'),
                {"cutoff": cutoff},
            )
            cleaned = result.rowcount
            await db.commit()
        if cleaned:
            logger.info("Purged %d old connection requests")
    except Exception:
        logger.warning("Connection request cleanup failed")
    return cleaned


async def start_cleanup_loop() -> None:
    global _running
    if _running:
        return
    _running = True
    interval = settings.CLEANUP_INTERVAL_SECONDS or max(settings.FILE_RETENTION_HOURS * 3600 // 6, 600)
    PURGE_INTERVAL = 86400  # 24 hours in seconds
    last_purge_time = 0

    while _running:
        try:
            await cleanup_expired_files()
        except Exception:
            logger.error("File cleanup sweep error")
        try:
            await cleanup_stale_connections()
        except Exception:
            logger.error("Stale connection cleanup error")
        try:
            await cleanup_orphaned_files()
        except Exception:
            logger.error("Orphaned file cleanup error")
        try:
            await cleanup_expired_metadata()
        except Exception:
            logger.error("Metadata cleanup error")
        try:
            await cleanup_expired_sessions()
        except Exception:
            logger.error("Session cleanup error")
        try:
            await cleanup_expired_invite_links()
        except Exception:
            logger.error("Invite link cleanup error")
        try:
            await cleanup_old_connection_requests()
        except Exception:
            logger.error("Connection request cleanup error")

        # Privacy purge: runs every 24 hours
        import time as _time
        now = _time.time()
        if now - last_purge_time >= PURGE_INTERVAL:
            try:
                await cleanup_all_inactive_users()
                last_purge_time = now
            except Exception:
                logger.error("Privacy purge failed")

        await asyncio.sleep(interval)


def stop_cleanup_loop() -> None:
    global _running
    _running = False
