"""Per-ticket customer-message burst buffer.

When a customer fires 2-4+ messages in quick succession, the AI must wait for
a quiet window, merge everything, and reply ONCE. widget_send enqueues every
persisted customer message here; the SSE /chat handler drains late arrivals
before generating, and the channels ingest path flushes on a background timer.
"""

import threading


class ChatBuffer:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buffers: dict[str, list[str]] = {}

    def add(self, ticket_id: str, text: str) -> int:
        """Append a message; returns the current burst size for the ticket."""
        if not text or not text.strip():
            return self.size(ticket_id)
        with self._lock:
            buf = self._buffers.setdefault(ticket_id, [])
            buf.append(text.strip())
            return len(buf)

    def drain(self, ticket_id: str) -> list[str]:
        """Remove and return buffered messages (oldest first)."""
        with self._lock:
            return self._buffers.pop(ticket_id, [])

    def size(self, ticket_id: str) -> int:
        with self._lock:
            return len(self._buffers.get(ticket_id, []))


chat_buffer = ChatBuffer()
