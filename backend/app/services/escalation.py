"""Escalation rule engine (guide §2.3, §5.6). Evaluates active rules against a
customer message; applies status/priority/assignment + notifications."""

import json
import re
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import EscalationRule, Message, Notification, Tenant, Ticket, User
from app.models.common import MessageSender, NotificationType, Role, TicketStatus
from app.services.event_bus import publish_event
from app.services.serializers import format_ticket_number

NEGATIVE_RE = re.compile(
    r"\b(angry|furious|upset|dissatisfied|terrible|awful|horrible|frustrat\w*|"
    r"useless|stupid|ridiculous|unacceptable|never again|pathetic|scam\w*|thief|"
    r"ole|wetin dey happen|annoyed|fed up|disappointed)\b",
    re.IGNORECASE,
)


def _rule_terms(rule: EscalationRule) -> list[str]:
    try:
        return json.loads(rule.terms or "[]")
    except (ValueError, TypeError):
        return []


def _recent_customer_texts(ticket: Ticket, n: int) -> list[str]:
    """Last n customer-authored message bodies, oldest→newest."""
    texts = [
        m.body
        for m in (ticket.messages or [])
        if m.sender_type == MessageSender.CUSTOMER
    ]
    return texts[-n:]


def _stateful_hit(rule: EscalationRule, ticket: Ticket, text: str) -> bool:
    """Evaluate stateful triggers (E5–E10) from ticket conversation history."""
    cond = rule.condition_field
    texts = _recent_customer_texts(ticket, 4)
    if cond == "conversation_loop":
        return len(texts) >= 2 and texts[-1].strip() == texts[-2].strip()
    if cond == "repeat_failed_self_service":
        if len(texts) < 3:
            return False
        if len({t.strip()[:60] for t in texts[-3:]}) > 1:
            return False
        from app.services.ai import rag_context

        return not rag_context(ticket.tenant_id, texts[-1])
    if cond == "confidence_below":
        # heuristic: unanswered complex question twice = low-confidence refusal
        return len(texts) >= 2 and len(texts[-1]) > 80 and len({t[:40] for t in texts[-2:]}) == 1
    if cond == "sentiment_negative":
        negatives = sum(1 for t in texts[-2:] if NEGATIVE_RE.search(t))
        return negatives >= 2
    if cond == "sla_timeout":
        return _sla_overdue(ticket)
    return False


def _sla_overdue(ticket: Ticket) -> bool:
    if ticket.status not in ("open", "in_progress"):
        return False
    if ticket.assignee_id:
        return False
    if not ticket.created_at:
        return False
    agent_replies = [
        m for m in ticket.messages
        if m.sender_type in (MessageSender.HUMAN_AGENT, MessageSender.AI_BOT)
    ]
    if agent_replies:
        return False
    return datetime.utcnow() - ticket.created_at > timedelta(minutes=60)


def evaluate(db: Session, tenant: Tenant, ticket: Ticket, text: str) -> list[EscalationRule]:
    """Return active rules whose keywords (or stateful condition) match."""
    lowered = (text or "").lower()
    rules = (
        db.query(EscalationRule)
        .filter(EscalationRule.tenant_id == tenant.id, EscalationRule.is_active.is_(True))
        .all()
    )
    fired: list[EscalationRule] = []
    for rule in rules:
        if rule.condition_field == "customer_segment":
            continue
        if rule.condition_field in ("conversation_loop", "repeat_failed_self_service",
                                   "confidence_below", "sentiment_negative", "sla_timeout"):
            if _stateful_hit(rule, ticket, text):
                fired.append(rule)
            continue
        if any(term.lower() in lowered for term in _rule_terms(rule)):
            fired.append(rule)
    # C1 VIP — a VIP customer always goes to a human.
    if ticket.customer and ticket.customer.is_vip:
        vip = next((r for r in rules if r.condition_field == "customer_segment"), None)
        if vip:
            fired.append(vip)
    return fired


def apply(db: Session, tenant: Tenant, ticket: Ticket, fired: list[EscalationRule],
          note: str | None = None) -> None:
    if not fired:
        return
    ticket.status = TicketStatus.ESCALATED
    ticket.escalated_at = datetime.utcnow()
    if any("HIGH" in (r.action or "").upper() for r in fired):
        ticket.priority = "high"

    db.add(Message(
        ticket_id=ticket.id, sender_type=MessageSender.SYSTEM, sender_name="System",
        body=note or "Escalated · " + " + ".join(r.name for r in fired) +
             (f" · priority HIGH" if any("HIGH" in (r.action or "").upper() for r in fired) else ""),
        is_bot=False, is_read=True,
    ))

    # Trigger stats for the owner-facing rules screen (§4.3).
    for rule in fired:
        rule.trigger_count += 1
        rule.last_fired_ticket_id = ticket.id

    # Route to the first available agent; notify the whole tenant team.
    agents = (
        db.query(User)
        .filter(User.tenant_id == tenant.id, User.role != Role.CUSTOMER, User.is_active.is_(True))
        .order_by(User.last_seen.is_not(None).desc(), User.created_at)
        .all()
    )
    for i, agent in enumerate(agents):
        if ticket.assignee_id is None and i == 0:
            ticket.assignee_id = agent.id
        db.add(Notification(
            tenant_id=tenant.id, user_id=agent.id, type=NotificationType.ESCALATION,
            title=f"Escalation · {format_ticket_number(ticket)}", body=ticket.subject, ticket_id=ticket.id,
        ))
    db.commit()

    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status})
    publish_event("notification", {"ticket_id": ticket.id})


def check_sla_timeouts(db: Session) -> int:
    """Opportunistic SLA sweep: open unassigned tickets with no reply >60 min."""
    rules = (
        db.query(EscalationRule)
        .filter(EscalationRule.condition_field == "sla_timeout",
                EscalationRule.is_active.is_(True))
        .all()
    )
    if not rules:
        return 0
    tenants = {r.tenant_id: r for r in rules}
    overdue = (
        db.query(Ticket)
        .filter(Ticket.status.in_(["open", "in_progress"]),
                Ticket.assignee_id.is_(None),
                Ticket.created_at < datetime.utcnow() - timedelta(minutes=60))
        .all()
    )
    count = 0
    for ticket in overdue:
        rule = tenants.get(ticket.tenant_id)
        if rule and _sla_overdue(ticket):
            apply(db, db.get(Tenant, ticket.tenant_id), ticket, [rule])
            count += 1
    return count
