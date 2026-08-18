"""Inbound ingest pipeline — external channel messages → tickets.

Every provider webhook (and the simulator) funnels through `ingest_message`:
  1. resolve the tenant via the ChannelSetting,
  2. resolve-or-create the Customer by channel identity,
  3. reuse an open ticket on that channel or create a new one,
  4. store the message, run escalation rules,
  5. optionally auto-reply with the AI agent and dispatch the reply outbound.
"""

import json
import logging

from sqlalchemy.orm import Session

from app.models import ChannelSetting, Customer, Message, Tenant, Ticket
from app.models.common import MessageSender
from app.services import agent, escalation
from app.services.channels.base import InboundMessage
from app.services.channels.outbound import dispatch_outbound
from app.services.channels.registry import get_provider
from app.services.event_bus import publish_event
from app.services.serializers import ensure_ticket_number, rule_dto, ticket_dto

logger = logging.getLogger("prestige.channels.ingest")


def get_or_create_customer_by_identity(db: Session, tenant: Tenant, channel: str,
                                       sender_id: str, sender_name: str | None) -> Customer:
    sender_id = (sender_id or "").strip()
    if channel == "email":
        customer = db.query(Customer).filter(
            Customer.tenant_id == tenant.id, Customer.email == sender_id.lower()).first()
        if customer:
            return customer
    else:
        for customer in tenant.customers:
            identities = json.loads(customer.identities or "{}")
            if identities.get(channel) == sender_id:
                return customer
    customer = Customer(
        tenant_id=tenant.id,
        email=sender_id.lower() if channel == "email" else "",
        full_name=sender_name or "Guest",
        identities=json.dumps({channel: sender_id}),
    )
    db.add(customer)
    db.flush()
    return customer


def find_open_ticket(db: Session, tenant: Tenant, customer: Customer, channel: str) -> Ticket | None:
    open_statuses = {"open", "in_progress", "escalated"}
    for t in customer.tickets:
        if t.tenant_id == tenant.id and t.channel == channel and t.status in open_statuses:
            return t
    return None


def auto_reply_enabled(config: dict) -> bool:
    return bool(config.get("auto_reply", True))


def ingest_message(db: Session, channel: ChannelSetting, msg: InboundMessage,
                   auto_reply: bool | None = None) -> dict:
    tenant = db.get(Tenant, channel.tenant_id)
    if not tenant:
        return {"ticket": None, "error": "Tenant not found"}

    customer = get_or_create_customer_by_identity(db, tenant, msg.channel, msg.sender_id, msg.sender_name)

    ticket = find_open_ticket(db, tenant, customer, msg.channel)
    is_new = ticket is None
    if ticket is None:
        ticket = Ticket(tenant_id=tenant.id, subject=msg.text[:120], channel=msg.channel,
                        unread=True, sla_seconds_left=3600)
        ticket.customer = customer
        ensure_ticket_number(db, ticket)
        db.add(ticket)
        db.flush()
        publish_event("ticket_created", {"ticket_id": ticket.id, "channel": msg.channel})

    db.add(Message(
        ticket_id=ticket.id, sender_type=MessageSender.CUSTOMER,
        sender_name=customer.full_name or "Customer",
        body=msg.text, is_bot=False, is_read=True,
        external_id=msg.external_message_id,
    ))
    ticket.unread = True
    db.flush()
    publish_event("message_created", {"ticket_id": ticket.id, "who": "customer", "text": msg.text, "channel": msg.channel})

    fired = escalation.evaluate(db, tenant, ticket, msg.text)
    if fired:
        escalation.apply(db, tenant, ticket, fired)
        publish_event("ticket_escalated", {"ticket_id": ticket.id, "status": ticket.status})
    else:
        db.commit()
    db.refresh(ticket)

    replied = False
    reply = ""
    config = json.loads(channel.provider_config or "{}")
    should_reply = auto_reply if auto_reply is not None else auto_reply_enabled(config)
    if should_reply and not fired:
        try:
            result = agent.invoke_agent(tenant.id, ticket.id, msg.text)
            reply = str(result.get("reply") or "").strip()
            if reply and not result.get("interrupts"):
                db.add(Message(
                    ticket_id=ticket.id, sender_type=MessageSender.AI_BOT,
                    sender_name=tenant.bot_name or "AI Assistant",
                    body=reply, is_bot=True, is_read=False,
                ))
                ticket.unread = True
                db.commit()
                publish_event("message_created", {"ticket_id": ticket.id, "who": "ai", "text": reply, "channel": msg.channel})
                publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status})
                dispatch_outbound(db, ticket, reply, "ai")
                replied = True
        except Exception as exc:  # noqa: BLE001
            logger.warning("channel auto-reply failed: %s", exc)
            db.rollback()

    db.refresh(ticket)
    publish_event("channel_message", {
        "ticket_id": ticket.id, "channel": msg.channel, "replied": replied,
    })
    return {
        "ticket": ticket_dto(ticket),
        "ticketId": ticket.id,
        "new": is_new,
        "fired": [rule_dto(r) for r in fired],
        "replied": replied,
    }
