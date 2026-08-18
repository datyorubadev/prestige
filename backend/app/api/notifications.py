from fastapi import APIRouter, Depends

from app.api.deps import Db, get_current_user, require_super_admin
from app.core.errors import TicketNotFound
from app.models import AuditLog, Notification, Tenant, User
from app.services.serializers import _relative_time

router = APIRouter(tags=["activity"])

ICON_MAP = {
    "escalation": "alert",
    "ticket_assigned": "ticket",
    "new_reply": "message",
    "suspension": "warning",
    "system": "bell",
}
COLOR_MAP = {
    "escalation": "#d93636",
    "ticket_assigned": "#2563eb",
    "new_reply": "#2563eb",
    "suspension": "#d93636",
    "system": "#00a86b",
}


@router.get("/notifications")
def list_notifications(db: Db, user: User = Depends(get_current_user)) -> list[dict]:
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "ic": ICON_MAP.get(n.type, "bell"),
            "color": COLOR_MAP.get(n.type, "#2563eb"),
            "title": n.title,
            "meta": _relative_time(n.created_at),
            "unread": n.is_read is False,
        }
        for n in notifications
    ]


@router.post("/notifications/read-all")
def read_all_notifications(db: Db, user: User = Depends(get_current_user)) -> dict:
    db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read.is_(False)).update(
        {Notification.is_read: True}
    )
    db.commit()
    return {"ok": True}


@router.patch("/notifications/{notification_id}")
def read_notification(notification_id: str, db: Db, user: User = Depends(get_current_user)) -> dict:
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise TicketNotFound("Notification not found")
    notification.is_read = True
    db.commit()
    return {"ok": True}


@router.get("/audit")
def list_audit(db: Db, user: User = Depends(get_current_user)) -> list[dict]:
    if user.role == "super_admin":
        logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()
    else:
        if not user.tenant_id:
            raise TicketNotFound("Tenant not found")
        logs = (db.query(AuditLog).filter(AuditLog.tenant_id == user.tenant_id)
                .order_by(AuditLog.created_at.desc()).all())
    actors = {u.id: u.role for u in db.query(User).filter(
        User.id.in_({log.user_id for log in logs if log.user_id})).all()}
    return [
        {
            "time": _relative_time(log.created_at),
            "actor": actors.get(log.user_id, "system") if log.user_id else "system",
            "action": log.action,
            "target": log.entity_type or "",
            "detail": log.detail,
            "ip": log.ip_address or "",
            "device": log.device or "",
            "result": log.result or "ok",
        }
        for log in logs
    ]


@router.get("/platform-feed")
def platform_feed(db: Db, user: User = Depends(require_super_admin)) -> list[dict]:
    """Cross-tenant activity for the super-admin dashboard."""
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(20).all()
    return [
        {
            "ic": "zap",
            "color": "#2563eb",
            "title": f"{log.action} · {log.entity_id or ''}",
            "meta": f"{_relative_time(log.created_at)} ago",
        }
        for log in logs
    ]
