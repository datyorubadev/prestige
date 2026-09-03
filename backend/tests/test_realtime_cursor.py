"""Event-bus cursor semantics: the WS reconnect fix depends on `since(cursor)`
returning every event published AFTER the client's last-seen cursor (including
events published while a socket was down), and `latest_cursor()` returning the
newest buffered id so a fresh connection waits for what comes next."""

import threading

from app.services import event_bus as eb

_counter = 0
_lock = threading.Lock()


def _fresh_ids():
    bus = eb.event_bus
    with bus._lock:
        return list(bus._ids)


def test_events_since_resumes_from_client_cursor():
    """A client that last saw cursor N must receive every event after N."""
    with _lock:
        base = len(_fresh_ids())
    ids = []

    def pub(t):
        return int(eb.event_bus.publish(t, {}, "tenant-x")["request_id"])

    ids.append(pub("first"))
    ids.append(pub("second"))
    ids.append(pub("third"))

    # Simulate a client that read up to `second` (the "last seen" cursor), then
    # disconnected; `third` was published during the gap.
    last_seen = str(ids[1])
    events = eb.events_since(last_seen)
    got = [int(e["request_id"]) for e in events]
    assert ids[2] in got, "event published during the disconnect gap was lost on resume"
    assert got == [ids[2]], f"expected only events after last_seen, got {got}"

    # Fresh connection (no cursor) must NOT replay past events.
    assert eb.events_since(eb.latest_cursor()) == []
