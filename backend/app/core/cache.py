"""In-memory TTL cache for frequently accessed, rarely changed entities.

Tenant settings and KB metadata are read on nearly every request but
change only via admin actions.  A short TTL (60s) eliminates thousands
of redundant DB reads per second under high concurrency while staying
eventually consistent.

Thread-safe: uses a simple dict + lock.  Not suitable for multi-process
deployment (each worker has its own cache) — that's fine because the
DB connection pool already handles cross-process consistency.
"""

from __future__ import annotations

import threading
import time
from typing import Any

_DEFAULT_TTL = 60  # seconds


class TTLCache:
    """Minimal dict-based cache with per-key TTL."""

    def __init__(self, default_ttl: float = _DEFAULT_TTL) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()
        self._default_ttl = default_ttl

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires, value = entry
            if time.monotonic() > expires:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        expires = time.monotonic() + (ttl if ttl is not None else self._default_ttl)
        with self._lock:
            self._store[key] = (expires, value)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> None:
        with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                del self._store[k]


# Global instance
tenant_cache = TTLCache(default_ttl=60)
