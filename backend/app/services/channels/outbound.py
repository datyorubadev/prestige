"""Outbound dispatch — sends agent/AI replies back through the channel provider.

Every reply saved on an external-channel ticket is pushed to the platform and
logged to `channel_outbox`. Built-in channels (widget/portal) are skipped.
"""

import json
import logging

from sqlalchemy.orm import Session

from app.models import ChannelOutbox, ChannelSetting
from app.services.channels.registry import EXTERNAL_CHANNELS, get_provider
from app.services.event_bus import publish_event

logger = logging.getLogger("prestige.channels.outbound")


def _target(db: Session, ticket, channel: str) -> str | None:
    customer = ticket.customer
    if not customer:
        return None
    if channel == "email":
        return customer.email or None
    identities = json.loads(customer.identities or "{}")
    return identities.get(channel) or customer.phone_number or None


def dispatch_outbound(db: Session, ticket, text: str, sender: str = "agent") -> dict | None:
    """Deliver `text` to the ticket's customer on its external channel."""
    if ticket.channel not in EXTERNAL_CHANNELS:
        return None
    channel = db.query(ChannelSetting).filter(
        ChannelSetting.tenant_id == ticket.tenant_id,
        ChannelSetting.channel == ticket.channel).first()
    if not channel or not channel.enabled or not channel.connected:
        return None

    target = _target(db, ticket, ticket.channel)
    if not target:
        logger.warning("no channel target for ticket %s (%s)", ticket.id, ticket.channel)
        return None

    config = json.loads(channel.provider_config or "{}")
    provider = get_provider(ticket.channel)
    result = provider.send(config, target, text)

    db.add(ChannelOutbox(
        tenant_id=ticket.tenant_id, channel=ticket.channel, ticket_id=ticket.id,
        target=target, body=text[:500],
        status="sent" if result.ok else "failed",
        provider=provider.key, external_id=result.external_id, error=result.error,
    ))
    db.commit()
    publish_event("message_sent", {
        "ticket_id": ticket.id, "channel": ticket.channel,
        "ok": result.ok, "external_id": result.external_id,
    })
    return {"ok": result.ok, "externalId": result.external_id, "error": result.error}
