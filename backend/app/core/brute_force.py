"""Per-account brute-force protection + security headers.

The IP-based rate limiter in ``rate_limit.py`` caps raw request volume, but
an attacker rotating IPs (or behind a NAT) can still brute-force login.
This module adds a per-ACCOUNT failed-attempt counter: after
``MAX_FAILED_ATTEMPTS`` wrong passwords for the same email, the account is
locked for ``LOCKOUT_SECONDS``.

All state is in-process (process-local dict).  In a multi-process deployment
you'd move this to Redis, but the API stays the same.
"""

import time
from collections import defaultdict
from typing import Dict, Tuple

# ─── Config ────────────────────────────────────────────────────────────

MAX_FAILED_ATTEMPTS = 5      # lock after 5 wrong passwords
LOCKOUT_SECONDS = 15 * 60    # 15-minute cooldown
# Sliding window for counting failures — if the 5th failure is older than
# this, we reset the counter instead of locking.
FAILURE_WINDOW = LOCKOUT_SECONDS

# ─── State ────────────────────────────────────────────────────────────

# key = email (lowercased) → list of failure timestamps
_failures: Dict[str, list] = defaultdict(list)


def record_failed_attempt(email: str) -> Tuple[bool, int]:
    """Record a failed login for ``email``.

    Returns ``(locked, retry_after_seconds)``.  ``locked`` is True if this
    attempt just triggered a lockout (or the account was already locked).
    ``retry_after`` is 0 if not locked, or the seconds remaining.
    """
    key = (email or "").lower().strip()
    now = time.time()
    cutoff = now - FAILURE_WINDOW
    # Prune old failures outside the window.
    _failures[key] = [t for t in _failures[key] if t > cutoff]
    _failures[key].append(now)

    if len(_failures[key]) >= MAX_FAILED_ATTEMPTS:
        oldest_in_window = _failures[key][0]
        retry_after = int(LOCKOUT_SECONDS - (now - oldest_in_window))
        return True, max(retry_after, 1)
    return False, 0


def is_locked(email: str) -> Tuple[bool, int]:
    """Check if ``email`` is currently locked out. Returns ``(locked, retry_after)``."""
    key = (email or "").lower().strip()
    now = time.time()
    cutoff = now - FAILURE_WINDOW
    _failures[key] = [t for t in _failures[key] if t > cutoff]
    if len(_failures[key]) >= MAX_FAILED_ATTEMPTS:
        oldest = _failures[key][0]
        retry_after = int(LOCKOUT_SECONDS - (now - oldest))
        if retry_after > 0:
            return True, retry_after
        # Lockout expired — reset.
        _failures[key] = []
    return False, 0


def clear_failures(email: str) -> None:
    """Reset the failure counter after a successful login."""
    key = (email or "").lower().strip()
    _failures.pop(key, None)
