"""Centralized Event Engine (§39 Event-Driven Backend).

Emits standardized events for every action (human, AI, customer, system)
and records append-only AuditLog entries with before/after state snapshots.
"""
import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.refresh_token import AuditLog

logger = logging.getLogger(__name__)


def _j(obj: Any) -> str | None:
    if obj is None:
        return None
    if isinstance(obj, str):
        return obj
    try:
        return json.dumps(obj, default=str)
    except Exception:
        return str(obj)


def emit_event(
    db: Session,
    tenant_id: str,
    action: str,
    actor_id: str | None = None,
    actor_type: str = "human",  # human | ai | system | customer
    entity_type: str | None = None,
    entity_id: str | None = None,
    target_user_id: str | None = None,
    before: Any = None,
    after: Any = None,
    detail: Any = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
    result: str = "ok",
) -> AuditLog:
    """Standardized event dispatcher (§23, §24 Audit & Activity System)."""
    audit = AuditLog(
        tenant_id=tenant_id,
        user_id=actor_id,
        actor_type=actor_type,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        target_user_id=target_user_id,
        before_state=_j(before),
        after_state=_j(after),
        detail=_j(detail) or "{}",
        ip_address=ip_address,
        user_agent=user_agent,
        request_id=request_id,
        result=result,
    )
    db.add(audit)
    try:
        db.commit()
        db.refresh(audit)
    except Exception as exc:
        db.rollback()
        logger.error("Failed to commit audit event %s: %s", action, exc)

    return audit
