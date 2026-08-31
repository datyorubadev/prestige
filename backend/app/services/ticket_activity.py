"""Centralised ticket-activity logging for the Activity Timeline.

Every meaningful mutation on a ticket should call ``record()`` so the
timeline answers: WHAT happened, WHO did it, and WHEN.
"""

import uuid

from sqlalchemy.orm import Session

from app.models.ticket_event import TicketEvent


def record(
    db: Session,
    ticket_id: str,
    tenant_id: str,
    actor_name: str,
    event_type: str,
    actor_id: str | None = None,
    field: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    detail: str | None = None,
) -> None:
    db.add(TicketEvent(
        ticket_id=ticket_id,
        tenant_id=tenant_id,
        actor_id=actor_id,
        actor_name=actor_name or "System",
        event_type=event_type,
        field=field,
        old_value=(str(old_value)[:500] if old_value is not None else None),
        new_value=(str(new_value)[:500] if new_value is not None else None),
        detail=detail,
    ))
