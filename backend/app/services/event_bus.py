"""Hybrid event bus: Redis pub/sub for cross-worker broadcast + local deque
for polling/WS consumers.  Falls back to pure in-process when Redis is
unavailable (local dev).  request_id is a monotonic cursor so the polling
fallback (GET /api/events?since=) and WS /ws/events stay in sync."""

import itertools
import json
import logging
import threading
from collections import deque
from typing import Any

logger = logging.getLogger("prestige.event_bus")

_CHANNEL = "prestige:events"


class EventBus:
    """Thread-safe local ring buffer that optionally fans out to Redis."""

    def __init__(self, maxlen: int = 10_000) -> None:
        self._log: deque[dict[str, Any]] = deque(maxlen=maxlen)
        self._counter = itertools.count(1)
        self._lock = threading.Lock()
        self._redis = None  # lazy init
        self._subscriber_started = False

    # ── Redis helpers ────────────────────────────────────────────────

    def _get_redis(self):
        """Return a Redis connection or None if unavailable."""
        if self._redis is not None:
            return self._redis
        try:
            from app.core.redis import get_redis
            r = get_redis()
            if r is None:
                self._redis = False  # sentinel: don't retry
                return None
            self._redis = r
            self._ensure_subscriber()
            return self._redis
        except Exception:
            self._redis = False  # sentinel: don't retry
            logger.debug("Redis unavailable — falling back to in-process event bus")
            return None

    def _ensure_subscriber(self) -> None:
        """Start a background daemon that forwards Redis messages into the
        local deque so polling / WS consumers work without direct Redis
        subscriptions."""
        if self._subscriber_started:
            return
        self._subscriber_started = True

        def _listen():
            try:
                from app.core.redis import get_redis
                sub_redis = get_redis()
                if sub_redis is None:
                    return
                # Use a dedicated connection for the subscription (not from the pool)
                pubsub = sub_redis.pubsub()
                pubsub.subscribe(_CHANNEL)
                for msg in pubsub.listen():
                    if msg["type"] != "message":
                        continue
                    try:
                        event = json.loads(msg["data"])
                        with self._lock:
                            self._log.append(event)
                    except Exception:
                        pass
            except Exception:
                logger.debug("Redis subscriber stopped")

        threading.Thread(target=_listen, daemon=True, name="eventbus-subscriber").start()

    # ── Core API (unchanged) ────────────────────────────────────────

    def publish(self, type_: str, data: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            event = {"type": type_, "request_id": str(next(self._counter)), "data": data}
            self._log.append(event)

        # Fan out to Redis so other workers pick it up
        r = self._get_redis()
        if r:
            try:
                r.publish(_CHANNEL, json.dumps(event))
            except Exception:
                pass

        return event

    def since(self, cursor: str | None) -> list[dict[str, Any]]:
        try:
            floor = int(cursor) if cursor else 0
        except ValueError:
            floor = 0
        with self._lock:
            return [e for e in self._log if int(e["request_id"]) > floor]


event_bus = EventBus()


def publish_event(type_: str, data: dict[str, Any], tenant_id: str | None = None) -> dict[str, Any]:
    event = event_bus.publish(type_, data)
    tid = tenant_id or data.get("tenant_id")
    if tid:
        import threading
        from app.database import SessionLocal
        from app.services.webhooks import deliver_event

        def _async_webhook():
            try:
                with SessionLocal() as db:
                    deliver_event(db, str(tid), type_, data)
            except Exception:
                pass

        threading.Thread(target=_async_webhook, daemon=True).start()
    return event


def events_since(cursor: str | None) -> list[dict[str, Any]]:
    return event_bus.since(cursor)
