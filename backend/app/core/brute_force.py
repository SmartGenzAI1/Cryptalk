# per-account brute-force protection on top of the IP rate limiter.
# after MAX_FAILED_ATTEMPTS wrong passwords the account is locked for
# LOCKOUT_SECONDS. state is in-process (move to redis for multi-process).

import time
from collections import defaultdict
from typing import Dict, Tuple

MAX_FAILED_ATTEMPTS = 5      # lock after 5 wrong passwords
LOCKOUT_SECONDS = 15 * 60    # 15-minute cooldown
# sliding window for counting failures
FAILURE_WINDOW = LOCKOUT_SECONDS

# key = email (lowercased) → list of failure timestamps
_failures: Dict[str, list] = defaultdict(list)


def record_failed_attempt(email: str) -> Tuple[bool, int]:
    # returns (locked, retry_after_seconds)
    key = (email or "").lower().strip()
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
    _failures.pop(key, None)
