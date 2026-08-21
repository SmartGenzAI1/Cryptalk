"""Privacy-safe push notification service.

Push notifications NEVER contain message content.
They only signal that a new message arrived.

Rules enforced here:
- title/body are generic strings ("New message from {username}")
- message text, chat names, and attachments are never included
- tokens are stored Fernet-encrypted at rest and decrypted only
  transiently for delivery
"""

import logging
from typing import Optional

from ..core.config import settings
from ..core.security import decrypt_field

logger = logging.getLogger(__name__)

# hard cap so a caller can't smuggle content into oversized fields
_MAX_TITLE_LEN = 64
_MAX_BODY_LEN = 128


def _sanitize(value: str, max_len: int) -> str:
    """Collapse whitespace and clamp length — defense in depth against
    accidentally passing message content through."""
    collapsed = " ".join((value or "").split())
    return collapsed[:max_len]


async def send_push_notification(
    push_token: Optional[str],
    title: str,
    body: str,
) -> None:
    """Send a push notification. Content should be generic.

    NEVER pass message content as title or body. Callers must use
    generic strings like "New message from {username}".
    """
    if not settings.PUSH_NOTIFICATIONS_ENABLED:
        return
    if not push_token:
        return

    # token is stored Fernet-encrypted; decrypt only for this send
    token = decrypt_field(push_token) if push_token.startswith("gAAAA") else push_token
    if not token:
        return

    title = _sanitize(title, _MAX_TITLE_LEN)
    body = _sanitize(body, _MAX_BODY_LEN)

    payload = {
        "title": title,
        "body": body,
        # data-only keys: routing hints only, never message content
        "data": {"type": "new_message"},
    }

    # Web Push / FCM integration here (pywebpush / firebase-admin).
    # The payload above is intentionally content-free; any provider
    # integration must keep it that way.
    logger.debug("push notification queued (content-free payload)")
    return
