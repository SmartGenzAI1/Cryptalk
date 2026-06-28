# background media cleanup — deletes orphaned files from supabase storage.
# runs periodically to catch files where delivery confirmation was lost.
# all files older than FILE_RETENTION_HOURS get purged.

import asyncio
import logging
import time

from app.core.config import settings

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
                logger.warning("Cleanup list failed: %s", res.status_code)
                break

            items = res.json() or []
            now = time.time()

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
                        path = f"files/{name}"
                        ok = await StorageService.delete_file(path)
                        if ok:
                            deleted += 1

            if len(items) < limit:
                break
            offset += limit

    except Exception as e:
        logger.error("Cleanup sweep error: %s", e)

    if deleted:
        logger.info("Cleanup swept %d expired files", deleted)
    return deleted


async def start_cleanup_loop() -> None:
    global _running
    if _running:
        return
    _running = True
    interval = max(settings.FILE_RETENTION_HOURS * 3600 // 6, 600)  # run ~6x per retention period, min 10min
    logger.info("Starting media cleanup loop (every %ds, retention=%dh)", interval, settings.FILE_RETENTION_HOURS)

    while _running:
        try:
            await cleanup_expired_files()
        except Exception as e:
            logger.error("Cleanup loop error: %s", e)
        await asyncio.sleep(interval)


def stop_cleanup_loop() -> None:
    global _running
    _running = False
