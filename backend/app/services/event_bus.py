"""Hybrid event bus: Redis pub/sub for cross-worker broadcast + local deque
for polling/WS consumers.  Falls back to pure in-process when Redis is
unavailable (local dev).  request_id is a monotonic cursor so the polling
fallback (GET /api/events?since=) and WS /ws/events stay in sync.

Every published event carries a TOP-LEVEL ``tenant_id`` so realtime.py can
scope the feed per tenant.  It is resolved from the explicit argument, from
``data["tenant_id"]``, or (fallback) via a cached ticket_id lookup.
"""

import itertools
import json
import logging
import queue
import threading
from collections import deque
from typing import Any

logger = logging.getLogger("prestige.event_bus")

_CHANNEL = "prestige:events"

# High-frequency event types must NOT fan out to webhook delivery — one AI
# reply streams dozens of tokens and each used to spawn a thread that opened
# a DB session just to find zero matching webhooks.
_NOISY_WEBHOOK_TYPES = {"ai_token", "ai_typing", "customer_typing"}

# ticket_id -> tenant_id cache (tickets never change tenant; bounded size).
_ticket_tenant: dict[str, str] = {}
_TENANT_CACHE_MAX = 10_000


def _resolve_tenant_for_ticket(ticket_id: str) -> str | None:
    tid = _ticket_tenant.get(ticket_id)
    if tid:
        return tid
    try:
        from app.database import SessionLocal
        from app.models import Ticket

        with SessionLocal() as db:
            t = db.get(Ticket, ticket_id)
            if t is None:
                t = db.query(Ticket).filter((Ticket.id == ticket_id) | (Ticket.ticket_number == ticket_id)).first()
            if t is None:
                return None
            if len(_ticket_tenant) >= _TENANT_CACHE_MAX:
                _ticket_tenant.clear()
            _ticket_tenant[str(t.id)] = str(t.tenant_id)
            if t.ticket_number:
                _ticket_tenant[str(t.ticket_number)] = str(t.tenant_id)
            return str(t.tenant_id)
    except Exception:
        return None


class EventBus:
    """Thread-safe local ring buffer that optionally fans out to Redis."""

    def __init__(self, maxlen: int = 10_000) -> None:
        self._log: deque[dict[str, Any]] = deque(maxlen=maxlen)
        self._ids: deque[int] = deque(maxlen=maxlen)  # parallel int ids for O(log n) cursor seeks
        self._counter = itertools.count(1)
        self._lock = threading.Lock()
        self._redis = None  # lazy init
        self._subscriber_started = False
        self._publisher_queue: "queue.Queue[str | None]" = queue.Queue(maxsize=5_000)
        self._publisher_started = False

    # ── Redis helpers ────────────────────────────────────────────────

    def _start_publisher(self, r) -> None:
        """Background thread owns the Redis publish socket so callers never
        block on a network round-trip (critical: ai_token fires per token)."""
        if self._publisher_started:
            return
        self._publisher_started = True

        def _worker():
            while True:
                msg = self._publisher_queue.get()
                if msg is None:
                    return
                try:
                    r.publish(_CHANNEL, msg)
                except Exception:
                    pass

        threading.Thread(target=_worker, daemon=True, name="eventbus-publisher").start()

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
            self._start_publisher(r)
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
                        # Skip our own echo — the local deque already has it.
                        if event.get("_src") == "local":
                            continue
                        with self._lock:
                            self._log.append(event)
                            self._ids.append(int(event.get("request_id") or 0))
                    except Exception:
                        pass
            except Exception:
                logger.debug("Redis subscriber stopped")

        threading.Thread(target=_listen, daemon=True, name="eventbus-subscriber").start()

    # ── Core API ─────────────────────────────────────────────────────

    def publish(self, type_: str, data: dict[str, Any], tenant_id: str | None = None) -> dict[str, Any]:
        with self._lock:
            event = {"type": type_, "request_id": str(next(self._counter)), "data": data}
            if tenant_id:
                event["tenant_id"] = tenant_id
            self._log.append(event)
            self._ids.append(int(event["request_id"]))

        # Fan out to Redis so OTHER workers pick it up — via the background
        # publisher thread (never block the request/stream on network I/O).
        # "_src":"local" makes the subscriber drop our own echo.
        r = self._get_redis()
        if r:
            try:
                wire = dict(event)
                wire["_src"] = "local"
                self._publisher_queue.put_nowait(json.dumps(wire))
            except queue.Full:
                pass  # drop rather than stall the caller

        return event

    def since(self, cursor: str | None) -> list[dict[str, Any]]:
        try:
            floor = int(cursor) if cursor else 0
        except ValueError:
            floor = 0
        with self._lock:
            if not self._ids or self._ids[-1] <= floor:
                return []
            # request_ids are consecutive integers from our counter; estimate
            # the start index then verify while slicing.  Undershooting is safe
            # (the filter below still drops seen events); this avoids scanning
            # the whole 10k ring on every poll.
            start = max(0, floor - self._ids[0] + 1)
            return [
                e for e in itertools.islice(self._log, start, None)
                if int(e["request_id"]) > floor
            ]


event_bus = EventBus()


def publish_event(type_: str, data: dict[str, Any], tenant_id: str | None = None) -> dict[str, Any]:
    tid = str(tenant_id) if tenant_id else (str(data["tenant_id"]) if data.get("tenant_id") else None)
    if not tid and data.get("ticket_id"):
        resolved = _resolve_tenant_for_ticket(str(data["ticket_id"]))
        if resolved:
            tid = str(resolved)
    if tid and data.get("ticket_id"):
        _ticket_tenant[str(data["ticket_id"])] = str(tid)
    if tid and "tenant_id" not in data:
        data["tenant_id"] = str(tid)
    event = event_bus.publish(type_, data, tid)

    if tid and type_ not in _NOISY_WEBHOOK_TYPES:
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


def latest_cursor() -> str:
    """Cursor of the newest buffered event — new WS connections start here so
    reconnects only receive fresh events instead of replaying the buffer."""
    with event_bus._lock:
        return str(event_bus._ids[-1]) if event_bus._ids else "0"
