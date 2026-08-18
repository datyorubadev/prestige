"""Redis-backed cache with in-memory fallback.

At 5M-10M customers per tenant, every request hitting the DB for tenant
settings or KB metadata creates thousands of redundant SELECT queries per
second.  This module provides:

  1. A Redis-backed distributed cache (shared across workers/pods)
  2. An in-memory LRU fallback when Redis is unavailable
  3. Decorators for transparent caching of function results
  4. Cache invalidation helpers

Env vars:
  CACHE_TTL_SECONDS     Default TTL for cached items (default: 60)
  CACHE_MAX_MEMORY      Max items in memory fallback (default: 10000)
  REDIS_CACHE_PREFIX    Key prefix for Redis cache (default: "prestige:cache:")
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from collections import OrderedDict
from typing import Any, Callable

from app.config import settings

logger = logging.getLogger("prestige.cache")

_DEFAULT_TTL = 60
_DEFAULT_MAX_MEMORY = 10_000
_REDIS_PREFIX = "prestige:cache:"


# ── In-memory LRU cache (fallback) ─────────────────────────────────

class LRUCache:
    """Thread-safe LRU cache with per-key TTL. Used when Redis is unavailable."""

    def __init__(self, maxsize: int = _DEFAULT_MAX_MEMORY, default_ttl: float = _DEFAULT_TTL) -> None:
        self._store: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._lock = threading.Lock()
        self._maxsize = maxsize
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
            # Move to end (most recently used)
            self._store.move_to_end(key)
            return value

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        expires = time.monotonic() + (ttl if ttl is not None else self._default_ttl)
        with self._lock:
            if key in self._store:
                del self._store[key]
            elif len(self._store) >= self._maxsize:
                self._store.popitem(last=False)  # evict oldest
            self._store[key] = (expires, value)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> None:
        with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                del self._store[k]

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    @property
    def size(self) -> int:
        return len(self._store)


# ── Unified cache interface ─────────────────────────────────────────

class Cache:
    """Distributed cache with automatic Redis ↔ memory fallback.

    Usage:
        cache = Cache()
        cache.set("tenant:t123", tenant_object, ttl=120)
        obj = cache.get("tenant:t123")
        cache.invalidate("tenant:t123")
    """

    def __init__(self) -> None:
        self._memory = LRUCache(default_ttl=_DEFAULT_TTL)
        self._redis = None
        self._redis_tried = False

    def _get_redis(self):
        if self._redis_tried:
            return self._redis
        self._redis_tried = True
        try:
            from app.core.redis import get_redis
            r = get_redis()
            if r is not None:
                r.ping()
                self._redis = r
                logger.info("Cache: using Redis backend")
            else:
                logger.info("Cache: Redis unavailable, using in-memory fallback")
        except Exception:
            logger.debug("Cache: Redis connection failed, using in-memory fallback")
        return self._redis

    def _redis_key(self, key: str) -> str:
        return f"{_REDIS_PREFIX}{key}"

    def get(self, key: str) -> Any | None:
        """Get a cached value. Checks Redis first, then in-memory."""
        r = self._get_redis()
        if r:
            try:
                raw = r.get(self._redis_key(key))
                if raw is not None:
                    return json.loads(raw)
            except Exception:
                pass
        return self._memory.get(key)

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        """Set a cached value in both Redis and in-memory."""
        ttl = ttl or _DEFAULT_TTL
        # Always write to memory (fast local reads)
        self._memory.set(key, value, ttl)
        # Write to Redis if available (cross-worker sharing)
        r = self._get_redis()
        if r:
            try:
                r.setex(self._redis_key(key), int(ttl), json.dumps(value, default=str))
            except Exception:
                pass

    def invalidate(self, key: str) -> None:
        """Remove a cached key from both backends."""
        self._memory.invalidate(key)
        r = self._get_redis()
        if r:
            try:
                r.delete(self._redis_key(key))
            except Exception:
                pass

    def invalidate_prefix(self, prefix: str) -> None:
        """Remove all keys matching a prefix."""
        self._memory.invalidate_prefix(prefix)
        r = self._get_redis()
        if r:
            try:
                cursor = 0
                pattern = f"{_REDIS_PREFIX}{prefix}*"
                while True:
                    cursor, keys = r.scan(cursor=cursor, match=pattern, count=100)
                    if keys:
                        r.delete(*keys)
                    if cursor == 0:
                        break
            except Exception:
                pass

    def clear(self) -> None:
        """Clear all cached data."""
        self._memory.clear()
        r = self._get_redis()
        if r:
            try:
                cursor = 0
                while True:
                    cursor, keys = r.scan(cursor=cursor, match=f"{_REDIS_PREFIX}*", count=100)
                    if keys:
                        r.delete(*keys)
                    if cursor == 0:
                        break
            except Exception:
                pass


# ── Global instance ──────────────────────────────────────────────────

cache = Cache()


# ── Decorator for transparent function caching ──────────────────────

def cached(ttl: float = _DEFAULT_TTL, prefix: str = ""):
    """Cache a function's return value.

    @cached(ttl=120, prefix="tenant")
    def get_tenant(tenant_id: str) -> Tenant:
        ...

    The cache key is derived from the function name + arguments.
    """
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs) -> Any:
            # Build cache key from function name + args
            key_parts = [prefix or func.__name__] + [str(a) for a in args]
            if kwargs:
                key_parts.append(json.dumps(kwargs, sort_keys=True))
            cache_key = ":".join(key_parts)

            result = cache.get(cache_key)
            if result is not None:
                return result

            result = func(*args, **kwargs)
            if result is not None:
                cache.set(cache_key, result, ttl=ttl)
            return result

        wrapper.invalidate = lambda *a: cache.invalidate(
            ":".join([prefix or func.__name__] + [str(x) for x in a])
        )
        wrapper.invalidate_prefix = lambda p: cache.invalidate_prefix(
            f"{prefix or func.__name__}:{p}"
        )
        return wrapper
    return decorator
