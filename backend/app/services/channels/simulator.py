"""Simulator provider — the built-in / demo backend for channels.

Used for:
  * `chat` and `portal` — no external provider exists; the channel is just a
    toggle + embed snippet and outbound is a no-op.
  * external channels with no credentials — lets the demo loop (connect →
    simulate inbound → reply → outbox) run with zero real accounts.
"""

from app.services.channels.base import InboundMessage, SendResult


class SimulatorProvider:
    key = "simulator"
    label = "Simulator"
    supports_poll = False

    def connect(self, config: dict) -> tuple[bool, str]:
        return True, "connected"

    def test(self, config: dict) -> tuple[bool, str]:
        return True, "Simulator ready — no credentials required."

    def send(self, config: dict, target: str, text: str) -> SendResult:
        return SendResult(ok=True, external_id=f"sim-{abs(hash(text))}")

    def parse_inbound(self, payload: dict) -> InboundMessage | None:
        text = str(payload.get("text") or "").strip()
        sender = str(payload.get("from") or payload.get("sender") or "").strip()
        channel = str(payload.get("channel") or "whatsapp")
        if not text or not sender:
            return None
        return InboundMessage(
            channel=channel,
            sender_id=sender,
            sender_name=str(payload.get("name") or "").strip() or None,
            text=text,
            external_message_id=str(payload.get("message_id") or "") or None,
            raw=payload,
        )


PROVIDER = SimulatorProvider()
