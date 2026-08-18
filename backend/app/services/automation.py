"""Automation engine (guide §5.20 / owner Automations tab).

Trigger → conditions (all/any) → ordered actions. Evaluates ticket_created /
status_changed / interval rules; manual "run now"; simulated scheduler tick.
"""

import json
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import AutomationRule, Message, Notification, Ticket, User
from app.models.common import MessageSender, NotificationType, Role, TicketStatus
from app.services.event_bus import publish_event
from app.services.serializers import format_ticket_number


def _j(raw: str | None, fallback=None):
    try:
        return json.loads(raw) if raw else (fallback if fallback is not None else [])
    except (ValueError, TypeError):
        return fallback if fallback is not None else []


def _field_value(ticket: Ticket, field: str) -> object:
    mapping = {
        "status": ticket.status,
        "priority": ticket.priority,
        "channel": ticket.channel,
        "type": (ticket.ticket_type or "").lower(),
        "sentiment": (ticket.sentiment or "").lower(),
        "assignee": ticket.assignee_id,
        "segment": "vip" if ticket.customer and ticket.customer.is_vip else None,
    }
    return mapping.get(field)


def conditions_match(ticket: Ticket, conditions: list[dict], match: str = "all") -> bool:
    if not conditions:
        return True
    results = []
    for cond in conditions:
        field = cond.get("field")
        op = cond.get("op")
        value = cond.get("value")
        actual = _field_value(ticket, field)
        if op == "eq":
            ok = str(actual).lower() == str(value).lower() if actual is not None else value is None
        elif op == "in":
            ok = actual is not None and actual in (value or [])
        elif op == "ne":
            ok = actual is not None and str(actual).lower() != str(value).lower()
        elif op == "older_than" and field == "time":
            minutes = _parse_duration(str(value))
            age = (datetime.utcnow() - (ticket.created_at or datetime.utcnow())).total_seconds() / 60
            ok = age >= minutes
        else:
            ok = False
        results.append(ok)
    return all(results) if match == "all" else any(results)


def _parse_duration(raw: str) -> int:
    raw = raw.strip().lower()
    if raw.endswith("h"):
        return int(raw[:-1]) * 60
    if raw.endswith("m"):
        return int(raw[:-1])
    try:
        return int(raw)
    except ValueError:
        return 0


def _agent_name(db: Session, agent_id: str) -> str:
    user = db.get(User, agent_id)
    return user.full_name if user else agent_id


def apply_actions(db: Session, rule: AutomationRule, ticket: Ticket) -> list[dict]:
    logs: list[dict] = []
    for action in _j(rule.actions, []):
        atype = action.get("type")
        config = action.get("config") or {}
        try:
            if atype == "assign_agent":
                agent_id = config.get("agent")
                if agent_id:
                    ticket.assignee_id = agent_id
                    logs.append(("assign_agent", f"→ {_agent_name(db, agent_id)}"))
            elif atype == "set_status":
                status = config.get("status")
                if status:
                    ticket.status = status
                logs.append(("set_status", f"→ {status}"))
            elif atype == "set_priority":
                priority = config.get("priority")
                if priority:
                    ticket.priority = priority
                logs.append(("set_priority", f"→ {priority}"))
            elif atype == "add_note":
                note = config.get("note", "")
                db.add(Message(ticket_id=ticket.id, sender_type=MessageSender.SYSTEM,
                               sender_name="Automation", body=note, is_bot=False, is_read=True))
                logs.append(("add_note", "note added"))
            elif atype == "send_slack":
                channel = config.get("channel", "#channel")
                logs.append(("send_slack", f"→ {channel}"))
            elif atype == "send_email":
                to = config.get("to", "")
                logs.append(("send_email", f"→ {to}"))
            elif atype == "escalate":
                ticket.status = TicketStatus.ESCALATED
                ticket.escalated_at = datetime.utcnow()
                note = config.get("note", "Automation escalation")
                db.add(Message(ticket_id=ticket.id, sender_type=MessageSender.SYSTEM,
                               sender_name="Automation", body=note, is_bot=False, is_read=True))
                logs.append(("escalate", note))
            elif atype == "trigger_webhook":
                logs.append(("trigger_webhook", config.get("url", "")))
            else:
                logs.append((atype or "unknown", "no-op"))
        except Exception:
            logs.append((atype or "unknown", "error"))
    return logs


def _note_as_log(db: Session, rule: AutomationRule, ticket: Ticket, action: str,
                 detail: str, result: str = "success") -> None:
    db.add(Notification(
        tenant_id=rule.tenant_id, user_id=None, type=NotificationType.SYSTEM,
        title=f"{rule.name} · {action}", body=f"{format_ticket_number(ticket)}: {detail} · {result}",
        ticket_id=ticket.id,
    ))


def run_rule(db: Session, tenant_id: str, rule_id: str, only_open: bool = True) -> list[dict]:
    """Manual 'run now': fire the rule against every matching ticket."""
    rule = db.get(AutomationRule, rule_id)
    if not rule or rule.tenant_id != tenant_id or not rule.is_active:
        return []
    tickets = db.query(Ticket).filter(Ticket.tenant_id == tenant_id).all()
    if only_open:
        tickets = [t for t in tickets if t.status not in ("resolved", "closed")]
    fired: list[dict] = []
    for ticket in tickets:
        if not conditions_match(ticket, _j(rule.conditions, []), rule.condition_match):
            continue
        logs = apply_actions(db, rule, ticket)
        rule.run_count += 1
        rule.last_run_at = datetime.utcnow()
        for atype, detail in logs:
            _note_as_log(db, rule, ticket, atype, detail)
        fired.append({
            "id": str(uuid.uuid4())[:8], "ruleId": rule.id, "ruleName": rule.name,
            "ticketId": ticket.id, "action": logs[0][0] if logs else "",
            "result": "success", "time": "just now",
        })
    db.commit()
    publish_event("automations_changed", {"rule_id": rule.id, "ran": True})
    return fired


def run_interval(db: Session, tenant_id: str) -> int:
    """Interval-trigger rules: scan open tickets and fire matching ones."""
    rules = (
        db.query(AutomationRule)
        .filter(AutomationRule.tenant_id == tenant_id,
                AutomationRule.trigger == "interval",
                AutomationRule.is_active.is_(True))
        .all()
    )
    fired = 0
    for rule in rules:
        tickets = db.query(Ticket).filter(
            Ticket.tenant_id == tenant_id,
            Ticket.status.notin_(["resolved", "closed"]),
        ).all()
        for ticket in tickets:
            if conditions_match(ticket, _j(rule.conditions, []), rule.condition_match):
                apply_actions(db, rule, ticket)
                rule.run_count += 1
                rule.last_run_at = datetime.utcnow()
                fired += 1
    if fired:
        db.commit()
        publish_event("automations_changed", {"tick": True})
    return fired


def run_tick(db: Session, tenant_id: str) -> dict:
    """Simulated scheduler tick: interval automations + SLA breach sweep."""
    rules_fired = run_interval(db, tenant_id)
    from app.services.sla import check_breaches

    breaches = check_breaches(db, tenant_id)
    db.commit()
    return {"rulesFired": rules_fired, "breaches": breaches}


def evaluate_trigger(db: Session, tenant: object, ticket: Ticket, event: str) -> None:
    """Fire rules for ticket_created / status_changed / message_received."""
    rules = (
        db.query(AutomationRule)
        .filter(AutomationRule.tenant_id == tenant.id,
                AutomationRule.trigger == event,
                AutomationRule.is_active.is_(True))
        .order_by(AutomationRule.order)
        .all()
    )
    for rule in rules:
        if conditions_match(ticket, _j(rule.conditions, []), rule.condition_match):
            apply_actions(db, rule, ticket)
            rule.run_count += 1
            rule.last_run_at = datetime.utcnow()
    db.commit()
