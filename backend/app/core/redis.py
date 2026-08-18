"""Shared Redis connection pool.

All modules that need Redis should use ``get_redis()`` instead of creating
their own ``Redis()`` instances.  The pool is process-wide and reused across
threads/async tasks, preventing connection exhaustion at scale.

Falls back to ``None`` when Redis is unavailable so callers can degrade
gracefully (e.g. event bus → in-memory, checkpointer → memory saver).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import redis

logger = logging.getLogger("prestige.redis")

_pool: redis.ConnectionPool | None = None
_client: redis.Redis | None = None
_initialized = False


def get_redis() -> redis.Redis | None:
    """Return a pooled Redis client, or ``None`` if Redis is unreachable."""
    global _pool, _client, _initialized
    if _initialized:
        return _client

    _initialized = True
    try:
        import redis as _redis_mod
        from app.config import settings

        _pool = _redis_mod.ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
            socket_connect_timeout=2,
            socket_timeout=5,
        )
        _client = _redis_mod.Redis(connection_pool=_pool)
        _client.ping()
        logger.info("Redis connection pool ready (%s)", settings.redis_url)
    except Exception:
        _client = None
        _pool = None
        logger.debug("Redis unavailable — running without cache/queue")

    return _client
