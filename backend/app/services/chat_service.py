import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.errors import TenantNotFound
from app.models import Customer, Message, Tenant, Ticket
from app.models.common import MessageSender
from app.services import escalation
from app.services.event_bus import publish_event
from app.services.serializers import ensure_ticket_number, rule_dto, ticket_dto


def get_or_create_customer(db: Session, tenant: Tenant, email: str | None, cust: str | None) -> Customer:
    if email:
        customer = db.query(Customer).filter(Customer.tenant_id == tenant.id, Customer.email == email.lower()).first()
        if customer:
            return customer
    name = cust or (email.split("@")[0].title() if email else "Guest")
    customer = Customer(tenant_id=tenant.id, email=(email or "").lower(), full_name=name)
    db.add(customer)
    db.flush()
    return customer


def widget_send(db: Session, tenant_id: str, session_id: str | None, text: str,
                email: str | None, cust: str | None, attachments: list[dict] | None = None) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        tenant = db.query(Tenant).filter(Tenant.slug == tenant_id.lower()).first()
    if not tenant:
        raise TenantNotFound()

    ticket = None
    if session_id:
        candidate = db.get(Ticket, session_id)
        if candidate and candidate.tenant_id == tenant.id:
            ticket = candidate
    is_new_ticket = ticket is None
    if ticket is None:
        ticket = Ticket(tenant_id=tenant.id, subject=text[:120] if text else "New Conversation", channel="widget",
                        unread=True, sla_seconds_left=3600)
        ticket.customer = get_or_create_customer(db, tenant, email, cust)
        ensure_ticket_number(db, ticket)
        db.add(ticket)
        db.flush()

    msg = Message(
        ticket_id=ticket.id, sender_type=MessageSender.CUSTOMER,
        sender_name=ticket.customer.full_name if ticket.customer else "Customer",
        body=text, is_bot=False, is_read=True,
        attachments=json.dumps(attachments) if attachments else None,
    )
    db.add(msg)
    ticket.unread = True
    ticket.updated_at = datetime.utcnow()
    db.flush()

    from app.services.ticket_activity import record
    record(db, ticket.id, tenant.id, ticket.customer.full_name if ticket.customer else "Customer",
           "customer_replied" if session_id else "ticket_created",
           detail=f"Customer message: “{text[:120]}”")

    # Burst buffering: register the message so the AI waits for a quiet
    # window and merges rapid-fire messages into one reply.
    from app.services.chat_buffer import chat_buffer
    chat_buffer.add(ticket.id, text)

    fired = escalation.evaluate(db, tenant, ticket, text)
    if fired:
        escalation.apply(db, tenant, ticket, fired)
    else:
        db.commit()
    db.refresh(msg)
    db.refresh(ticket)
    if is_new_ticket:
        publish_event("ticket_created", {"ticket_id": ticket.id, "channel": ticket.channel}, tenant_id=tenant.id)
    publish_event("message_created", {
        "ticket_id": ticket.id,
        "message_id": msg.id,
        "who": "customer",
        "text": text,
        "attachments": attachments or [],
    }, tenant_id=tenant.id)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status}, tenant_id=tenant.id)

    return {
        "ticket": ticket_dto(ticket),
        "sessionId": ticket.id,
        "ticketId": ticket.id,
        "tenantId": tenant.id,
        "fired": [rule_dto(r) for r in fired],
        "escalated": bool(fired) or ticket.status == "escalated",
        "tone": tenant.brand_tone,
    }


def persist_ai_reply(db: Session, ticket_id: str, text: str) -> dict:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise TenantNotFound("Ticket not found")
    # Prevent duplicate consecutive AI messages
    last_msg = ticket.messages[-1] if ticket.messages else None
    if last_msg and last_msg.is_bot and last_msg.body.strip() == text.strip():
        return {"ok": True, "duplicate": True}
    tenant = db.get(Tenant, ticket.tenant_id)
    msg = Message(
        ticket_id=ticket.id, sender_type=MessageSender.AI_BOT,
        sender_name=tenant.bot_name if tenant else "AI Assistant",
        body=text, is_bot=True, is_read=False,
    )
    db.add(msg)
    ticket.unread = True
    ticket.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)
    from app.services.ticket_activity import record
    record(db, ticket.id, ticket.tenant_id,
           tenant.bot_name if tenant else "AI Assistant", "ai_replied",
           detail=f"AI reply: “{text[:120]}”")
    db.commit()
    publish_event("message_created", {"ticket_id": ticket.id, "message_id": msg.id, "who": "ai", "text": text}, tenant_id=ticket.tenant_id)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status}, tenant_id=ticket.tenant_id)
    return {"ok": True}


def rate_ticket(db: Session, ticket_id: str, rating: int, comment: str | None = None) -> dict:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise TenantNotFound("Ticket not found")
    ticket.csat_rating = max(1, min(5, rating))
    if comment is not None:
        ticket.csat_comment = comment[:500]
    from app.services.ticket_activity import record
    record(db, ticket.id, ticket.tenant_id, "Customer", "csat_rated",
           new_value=f"{ticket.csat_rating}/5",
           detail=f"CSAT rated {ticket.csat_rating}/5" + (f' — “{comment[:120]}”' if comment else ""))
    db.commit()
    return {"ok": True}
