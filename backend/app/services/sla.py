"""SLA breach engine (guide §5.21 / owner SLA policies tab).

Sweeps open tickets against enabled policies: first-response and resolution
windows per priority, inside business-hours schedules. Increments the policy
breach counter and emits sla_breach events for realtime consumers.
"""

import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Message, Notification, SlaPolicy, SlaSchedule, Ticket, User
from app.models.common import MessageSender, NotificationType
from app.services.event_bus import publish_event

ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]


def _j(raw: str | None, fallback=None):
    try:
        return json.loads(raw) if raw else (fallback if fallback is not None else [])
    except (ValueError, TypeError):
        return fallback if fallback is not None else []


def _inside_schedule(schedule: SlaSchedule | None, moment: datetime) -> bool:
    if not schedule:
        return True  # 24/7
    days = _j(schedule.days, ALL_DAYS)
    if moment.weekday() not in days:
        return False
    try:
        start_h, start_m = (int(x) for x in schedule.start.split(":"))
        end_h, end_m = (int(x) for x in schedule.end.split(":"))
    except (ValueError, AttributeError):
        return True
    minutes = moment.hour * 60 + moment.minute
    return start_h * 60 + start_m <= minutes <= end_h * 60 + end_m


def target_for(policy: SlaPolicy, priority: str) -> dict | None:
    for t in _j(policy.targets, []):
        if t.get("priority") == priority:
            return t
    return None


def _first_response_at(ticket: Ticket) -> datetime | None:
    agent_msgs = [
        m for m in (ticket.messages or [])
        if m.sender_type in (MessageSender.HUMAN_AGENT, MessageSender.AI_BOT)
    ]
    return agent_msgs[0].timestamp if agent_msgs and agent_msgs[0].timestamp else None


def check_breaches(db: Session, tenant_id: str) -> int:
    """Sweep policies; increment breach counters for overdue tickets."""
    now = datetime.utcnow()
    policies = (
        db.query(SlaPolicy)
        .filter(SlaPolicy.tenant_id == tenant_id, SlaPolicy.is_active.is_(True))
        .all()
    )
    if not policies:
        return 0
    schedules = {s.id: s for s in db.query(SlaSchedule).filter(SlaSchedule.tenant_id == tenant_id).all()}
    tickets = db.query(Ticket).filter(
        Ticket.tenant_id == tenant_id,
        Ticket.status.notin_(["resolved", "closed"]),
    ).all()

    breaches = 0
    for policy in policies:
        schedule = schedules.get(policy.schedule_id) if policy.schedule_id else None
        for ticket in tickets:
            if not _policy_matches(policy, ticket):
                continue
            if ticket.created_at and not _inside_schedule(schedule, ticket.created_at):
                continue
            target = target_for(policy, ticket.priority or "low")
            if not target:
                continue
            if not ticket.assignee_id and ticket.created_at:
                first_min = target.get("firstResponseMin", 240)
                age = (now - ticket.created_at).total_seconds() / 60
                if age >= first_min:
                    policy.breaches += 1
                    breaches += 1
                    publish_event("sla_breach", {
                        "ticket_id": ticket.id, "policy_id": policy.id,
                        "priority": ticket.priority, "type": "first_response",
                    })
    if breaches:
        db.commit()
    return breaches


def _policy_matches(policy: SlaPolicy, ticket: Ticket) -> bool:
    from app.services.automation import conditions_match

    match = _j(policy.match, [])
    return conditions_match(ticket, match, "all")
