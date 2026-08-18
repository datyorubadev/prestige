"""Channel provider contract + normalized inbound message.

Every external channel (whatsapp / telegram / sms / email) plugs in behind
the same interface so the ingest + outbound pipelines are provider-agnostic.
The simulator provider backs the built-in chat/portal channels and provides a
no-credentials demo path for the external ones.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class InboundMessage:
    """A message received on an external channel, normalized for ingest."""

    channel: str
    sender_id: str  # external identity: wa_id / tg chat id / phone / email
    text: str
    sender_name: str | None = None
    external_message_id: str | None = None
    raw: dict[str, Any] | None = field(default=None)


@dataclass
class SendResult:
    ok: bool
    external_id: str | None = None
    error: str | None = None


class ChannelProvider(Protocol):
    key: str
    label: str
    supports_poll: bool

    def connect(self, config: dict) -> tuple[bool, str]:
        """Validate/persist connection state for `config`. Returns (ok, status)."""
        ...

    def test(self, config: dict) -> tuple[bool, str]:
        """Reach out to the provider to verify credentials. Returns (ok, detail)."""
        ...

    def send(self, config: dict, target: str, text: str) -> SendResult:
        """Deliver `text` to `target` through the provider."""
        ...

    def parse_inbound(self, payload: dict) -> InboundMessage | None:
        """Convert a provider webhook payload into a normalized InboundMessage."""
        ...

    def poll(self, config: dict) -> list[InboundMessage]:
        """Fetch pending inbound messages (IMAP / long-poll). Defaults to none."""
        return []
