"""Owner settings hub (guide §5.19–§5.22): webhooks, API keys, channels,
automations, SLA policies, notification preferences, and voice call-backs."""

import hashlib
import json
import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import Db, get_current_user, get_tenant, require_team
from app.core.errors import TenantNotFound, TicketNotFound
from app.core.permissions import (
    API_KEYS_MANAGE,
    AUTOMATIONS_MANAGE,
    SLA_MANAGE,
    WEBHOOKS_MANAGE,
    require_perm,
)
from app.models import (
    ApiKey,
    AutomationRule,
    AuditLog,
    Message,
    Notification,
    NotificationPreference,
    SlaPolicy,
    SlaSchedule,
    Tenant,
    Ticket,
    User,
    VoiceRequest,
    WebhookDelivery,
    WebhookEndpoint,
)
from app.models.common import MessageSender, NotificationType
from app.services.event_bus import publish_event
from app.services.serializers import (
    _j,
    api_key_dto,
    automation_dto,
    notif_prefs_dto,
    sla_policy_dto,
    sla_schedule_dto,
    webhook_delivery_dto,
    webhook_dto,
)
from app.services import webhooks as webhook_service

router = APIRouter(tags=["settings"])


def _audit(db: Session, tenant: Tenant, user: User, action: str, target: str, detail: str) -> None:
    db.add(AuditLog(tenant_id=tenant.id, user_id=user.id, action=action,
                    entity_type=target, entity_id=target, detail=detail))


def _is_owner(user: User) -> bool:
    return user.role in ("owner", "super_admin")


# ---------------------------------------------------------------- webhooks

@router.get("/webhooks")
def list_webhooks(db: Db, tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_perm(WEBHOOKS_MANAGE))) -> list[dict]:
    hooks = db.query(WebhookEndpoint).filter(WebhookEndpoint.tenant_id == tenant.id).order_by(
        WebhookEndpoint.created_at.desc()).all()
    return [webhook_dto(h) for h in hooks]


@router.post("/webhooks")
def create_webhook(payload: dict, db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(WEBHOOKS_MANAGE))) -> dict:
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Insufficient privileges")
    if not payload.get("name") or not payload.get("url"):
        raise HTTPException(status_code=422, detail="name and url are required")
    hook = WebhookEndpoint(
        tenant_id=tenant.id, name=payload["name"], url=payload["url"],
        secret=payload.get("secret") or secrets.token_hex(16),
        events=json.dumps(payload.get("events", [])),
        is_active=payload.get("active", True),
    )
    db.add(hook)
    _audit(db, tenant, user, "create_webhook", hook.name, f"{hook.url}")
    db.commit()
    publish_event("webhooks_changed", {"endpoint_id": hook.id})
    return webhook_dto(hook)


def _get_hook(db: Session, tenant: Tenant, hook_id: str) -> WebhookEndpoint:
    hook = db.get(WebhookEndpoint, hook_id)
    if not hook or hook.tenant_id != tenant.id:
        raise TicketNotFound("Webhook not found")
    return hook


@router.get("/webhooks/deliveries")
def list_webhook_deliveries(db: Db, tenant: Tenant = Depends(get_tenant),
                            user: User = Depends(require_perm(WEBHOOKS_MANAGE))) -> list[dict]:
    deliveries = db.query(WebhookDelivery).join(
        WebhookEndpoint, WebhookDelivery.endpoint_id == WebhookEndpoint.id
    ).filter(WebhookEndpoint.tenant_id == tenant.id).order_by(
        WebhookDelivery.created_at.desc()).limit(50).all()
    endpoints = {e.id: e for e in db.query(WebhookEndpoint).all()}
    return [webhook_delivery_dto(d, endpoints.get(d.endpoint_id)) for d in deliveries]


@router.post("/webhooks/{hook_id}/test")
def test_webhook(hook_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_perm(WEBHOOKS_MANAGE))) -> dict:
    hook = _get_hook(db, tenant, hook_id)
    result = webhook_service.test_endpoint(db, hook)
    db.commit()
    return result


@router.post("/webhooks/{hook_id}/toggle")
def toggle_webhook(hook_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(WEBHOOKS_MANAGE))) -> dict:
    hook = _get_hook(db, tenant, hook_id)
    hook.is_active = not hook.is_active
    db.commit()
    publish_event("webhooks_changed", {"endpoint_id": hook.id})
    return webhook_dto(hook)


@router.put("/webhooks/{hook_id}")
@router.patch("/webhooks/{hook_id}")
def update_webhook(hook_id: str, payload: dict, db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(WEBHOOKS_MANAGE))) -> dict:
    hook = _get_hook(db, tenant, hook_id)
    if "active" in payload and len(payload) == 1:
        hook.is_active = bool(payload["active"])
    else:
        for key in ("name", "url", "secret"):
            if key in payload:
                setattr(hook, key, payload[key])
        if "events" in payload:
            hook.events = json.dumps(payload["events"])
        if "active" in payload:
            hook.is_active = bool(payload["active"])
    db.commit()
    publish_event("webhooks_changed", {"endpoint_id": hook.id})
    return webhook_dto(hook)


@router.delete("/webhooks/{hook_id}")
def delete_webhook(hook_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(WEBHOOKS_MANAGE))) -> dict:
    hook = _get_hook(db, tenant, hook_id)
    db.delete(hook)
    db.commit()
    publish_event("webhooks_changed", {"endpoint_id": hook_id})
    return {"ok": True}


# ---------------------------------------------------------------- api keys

@router.get("/api-keys")
def list_api_keys(db: Db, tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_perm(API_KEYS_MANAGE))) -> list[dict]:
    keys = db.query(ApiKey).filter(
        ApiKey.tenant_id == tenant.id, ApiKey.is_active.is_(True)).all()
    return [api_key_dto(k) for k in keys]


@router.post("/api-keys")
def create_api_key(payload: dict, db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(API_KEYS_MANAGE))) -> dict:
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Insufficient privileges")
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Key name is required")
    prefix = "pre_" + secrets.token_hex(4)
    secret = secrets.token_urlsafe(24)
    key = ApiKey(tenant_id=tenant.id, name=name, prefix=prefix,
                 key_hash=hashlib.sha256(secret.encode()).hexdigest(),
                 scopes=json.dumps(payload.get("scopes") or ["tickets:read"]))
    db.add(key)
    _audit(db, tenant, user, "create_api_key", name, f"prefix {prefix}")
    db.commit()
    return {**api_key_dto(key), "secret": f"{prefix}.{secret}"}


@router.delete("/api-keys/{key_id}")
def revoke_api_key(key_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(API_KEYS_MANAGE))) -> dict:
    key = db.get(ApiKey, key_id)
    if not key or key.tenant_id != tenant.id:
        raise TicketNotFound("API key not found")
    key.is_active = False
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- automations

@router.get("/automations")
def list_automations(db: Db, tenant: Tenant = Depends(get_tenant),
                     user: User = Depends(require_perm(AUTOMATIONS_MANAGE))) -> list[dict]:
    rules = db.query(AutomationRule).filter(AutomationRule.tenant_id == tenant.id).order_by(
        AutomationRule.order).all()
    return [automation_dto(r) for r in rules]


@router.post("/automations")
def create_automation(payload: dict, db: Db, tenant: Tenant = Depends(get_tenant),
                      user: User = Depends(require_perm(AUTOMATIONS_MANAGE))) -> dict:
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Insufficient privileges")
    if not payload.get("name") or not payload.get("trigger"):
        raise HTTPException(status_code=422, detail="name and trigger are required")
    rules = db.query(AutomationRule).filter(AutomationRule.tenant_id == tenant.id).all()
    max_num = 0
    for r in rules:
        try:
            max_num = max(max_num, int(r.id.replace("AT-", "")))
        except ValueError:
            pass
    rule = AutomationRule(
        tenant_id=tenant.id, name=payload["name"], desc=payload.get("desc", ""),
        is_active=bool(payload.get("enabled", True)), trigger=payload["trigger"],
        condition_match=payload.get("conditionMatch", "all"),
        conditions=json.dumps(payload.get("conditions", [])),
        actions=json.dumps(payload.get("actions", [])),
        interval=json.dumps(payload.get("interval")) if payload.get("interval") else "null",
        order=len(rules) + 1,
        id="AT-" + str(max_num + 1),
    )
    db.add(rule)
    _audit(db, tenant, user, "create_automation", rule.name, f"trigger {rule.trigger}")
    db.commit()
    publish_event("automations_changed", {"rule_id": rule.id})
    return automation_dto(rule)


def _get_automation(db: Session, tenant: Tenant, rule_id: str) -> AutomationRule:
    rule = db.query(AutomationRule).filter(AutomationRule.id.ilike(rule_id)).first()
    if not rule or rule.tenant_id != tenant.id:
        raise TicketNotFound("Automation rule not found")
    return rule


@router.post("/automations/tick")
def run_schedule_tick(db: Db, tenant: Tenant = Depends(get_tenant),
                      user: User = Depends(require_perm(AUTOMATIONS_MANAGE))) -> dict:
    from app.services.automation import run_tick

    return run_tick(db, tenant.id)


@router.post("/automations/log")
@router.get("/automations/log")
def automation_log(db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(AUTOMATIONS_MANAGE))) -> list[dict]:
    logs = db.query(Notification).filter(
        Notification.tenant_id == tenant.id,
        Notification.type == NotificationType.SYSTEM,
        Notification.title.like("%·%"),
    ).order_by(Notification.created_at.desc()).limit(50).all()
    return [
        {
            "id": str(n.id)[:8], "ruleId": n.ticket_id or "", "ruleName": n.title.split("·")[0].strip(),
            "ticketId": n.ticket_id, "action": n.body or "",
            "result": "success" if n.title.split("·")[-1].strip().startswith("success") else
            ("error" if n.title.split("·")[-1].strip().startswith("error") else "skipped"),
            "time": n.created_at.isoformat() if n.created_at else None,
        }
        for n in logs
    ]


@router.post("/automations/{rule_id}/run")
def run_automation_now(rule_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                       user: User = Depends(require_perm(AUTOMATIONS_MANAGE))) -> list[dict]:
    from app.services.automation import run_rule

    rule = _get_automation(db, tenant, rule_id)
    return run_rule(db, tenant.id, rule.id)


@router.post("/automations/{rule_id}/toggle")
def toggle_automation(rule_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                      user: User = Depends(require_perm(AUTOMATIONS_MANAGE))) -> dict:
    rule = _get_automation(db, tenant, rule_id)
    rule.is_active = not rule.is_active
    db.commit()
    publish_event("automations_changed", {"rule_id": rule.id})
    return automation_dto(rule)


@router.put("/automations/{rule_id}")
@router.patch("/automations/{rule_id}")
def update_automation(rule_id: str, payload: dict, db: Db, tenant: Tenant = Depends(get_tenant),
                      user: User = Depends(require_perm(AUTOMATIONS_MANAGE))) -> dict:
    rule = _get_automation(db, tenant, rule_id)
    if "enabled" in payload and len(payload) == 1:
        rule.is_active = bool(payload["enabled"])
    else:
        for key, attr in (("name", "name"), ("desc", "desc"), ("conditionMatch", "condition_match"),
                          ("order", "order")):
            if key in payload:
                setattr(rule, attr, payload[key])
        if "enabled" in payload:
            rule.is_active = bool(payload["enabled"])
        for key in ("conditions", "actions"):
            if key in payload:
                setattr(rule, key, json.dumps(payload[key]))
        if "interval" in payload:
            rule.interval = json.dumps(payload["interval"]) if payload["interval"] else "null"
    db.commit()
    publish_event("automations_changed", {"rule_id": rule.id})
    return automation_dto(rule)


@router.delete("/automations/{rule_id}")
def delete_automation(rule_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                      user: User = Depends(require_perm(AUTOMATIONS_MANAGE))) -> dict:
    rule = _get_automation(db, tenant, rule_id)
    db.delete(rule)
    db.commit()
    publish_event("automations_changed", {"rule_id": rule_id})
    return {"ok": True}


# ---------------------------------------------------------------- SLA

@router.get("/sla")
def list_sla_policies(db: Db, tenant: Tenant = Depends(get_tenant),
                      user: User = Depends(require_perm(SLA_MANAGE))) -> list[dict]:
    policies = db.query(SlaPolicy).filter(SlaPolicy.tenant_id == tenant.id).order_by(
        SlaPolicy.created_at.desc()).all()
    schedules = {s.id: s for s in db.query(SlaSchedule).filter(SlaSchedule.tenant_id == tenant.id).all()}
    return [sla_policy_dto(p, schedules.get(p.schedule_id)) for p in policies]


@router.get("/sla/schedules")
def list_sla_schedules(db: Db, tenant: Tenant = Depends(get_tenant),
                       user: User = Depends(require_perm(SLA_MANAGE))) -> list[dict]:
    schedules = db.query(SlaSchedule).filter(SlaSchedule.tenant_id == tenant.id).all()
    return [sla_schedule_dto(s) for s in schedules]


@router.post("/sla/schedules")
def create_sla_schedule(payload: dict, db: Db, tenant: Tenant = Depends(get_tenant),
                        user: User = Depends(require_perm(SLA_MANAGE))) -> dict:
    schedule = SlaSchedule(tenant_id=tenant.id, name=payload.get("name", "New schedule"),
                           days=json.dumps(payload.get("days", [0, 1, 2, 3, 4, 5, 6])),
                           start=payload.get("start", "09:00"), end=payload.get("end", "17:00"))
    db.add(schedule)
    db.commit()
    return sla_schedule_dto(schedule)


@router.post("/sla")
def create_sla_policy(payload: dict, db: Db, tenant: Tenant = Depends(get_tenant),
                      user: User = Depends(require_perm(SLA_MANAGE))) -> dict:
    policies = db.query(SlaPolicy).filter(SlaPolicy.tenant_id == tenant.id).all()
    max_num = 0
    for p in policies:
        try:
            max_num = max(max_num, int(p.id.replace("SL-", "")))
        except ValueError:
            pass
    policy = SlaPolicy(tenant_id=tenant.id, name=payload.get("name", "New policy"),
                       desc=payload.get("desc", ""), is_active=bool(payload.get("enabled", True)),
                       match=json.dumps(payload.get("match", [])),
                       targets=json.dumps(payload.get("targets", [])),
                       schedule_id=payload.get("scheduleId"),
                       escalations=json.dumps(payload.get("escalations", [])),
                       id="SL-" + str(max_num + 1))
    db.add(policy)
    _audit(db, tenant, user, "create_sla_policy", policy.name, "")
    db.commit()
    publish_event("sla_changed", {"policy_id": policy.id})
    return sla_policy_dto(policy)


def _get_sla_policy(db: Session, tenant: Tenant, policy_id: str) -> SlaPolicy:
    policy = db.query(SlaPolicy).filter(SlaPolicy.id.ilike(policy_id)).first()
    if not policy or policy.tenant_id != tenant.id:
        raise TicketNotFound("SLA policy not found")
    return policy


@router.post("/sla/tick")
def sla_tick(db: Db, tenant: Tenant = Depends(get_tenant),
             user: User = Depends(require_perm(SLA_MANAGE))) -> dict:
    from app.services.automation import run_tick

    return run_tick(db, tenant.id)


@router.put("/sla/{policy_id}")
@router.patch("/sla/{policy_id}")
def update_sla_policy(policy_id: str, payload: dict, db: Db, tenant: Tenant = Depends(get_tenant),
                      user: User = Depends(require_perm(SLA_MANAGE))) -> dict:
    policy = _get_sla_policy(db, tenant, policy_id)
    if "enabled" in payload and len(payload) == 1:
        policy.is_active = bool(payload["enabled"])
    else:
        for key, attr in (("name", "name"), ("desc", "desc"), ("scheduleId", "schedule_id")):
            if key in payload:
                setattr(policy, attr, payload[key])
        if "enabled" in payload:
            policy.is_active = bool(payload["enabled"])
        for key in ("match", "targets", "escalations"):
            if key in payload:
                setattr(policy, key, json.dumps(payload[key]))
    db.commit()
    publish_event("sla_changed", {"policy_id": policy.id})
    return sla_policy_dto(policy)


@router.delete("/sla/{policy_id}")
def delete_sla_policy(policy_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                      user: User = Depends(require_perm(SLA_MANAGE))) -> dict:
    policy = _get_sla_policy(db, tenant, policy_id)
    db.delete(policy)
    db.commit()
    publish_event("sla_changed", {"policy_id": policy_id})
    return {"ok": True}


# ------------------------------------------------------- notification prefs

@router.get("/notifications/preferences")
def get_notif_prefs(db: Db, user: User = Depends(get_current_user)) -> dict:
    prefs = db.query(NotificationPreference).filter(NotificationPreference.user_id == user.id).first()
    if not prefs:
        prefs = NotificationPreference(user_id=user.id)
        db.add(prefs)
        db.commit()
    return notif_prefs_dto(prefs)


@router.put("/notifications/preferences")
@router.patch("/notifications/preferences")
def update_notif_prefs(payload: dict, db: Db, user: User = Depends(get_current_user)) -> dict:
    prefs = db.query(NotificationPreference).filter(NotificationPreference.user_id == user.id).first()
    if not prefs:
        prefs = NotificationPreference(user_id=user.id)
        db.add(prefs)
    if "email" in payload:
        prefs.email = json.dumps(payload["email"])
    if "push" in payload:
        prefs.push = json.dumps(payload["push"])
    if "quietHours" in payload:
        prefs.quiet_hours = json.dumps(payload["quietHours"])
    db.commit()
    return notif_prefs_dto(prefs)


# ---------------------------------------------------------------- voice

@router.post("/voice/request")
def request_voice_call(payload: dict, db: Db, tenant: Tenant = Depends(get_tenant),
                       user: User = Depends(require_team)) -> dict:
    phone = (payload.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=422, detail="phone is required")

    request = VoiceRequest(tenant_id=tenant.id, ticket_id=payload.get("ticketId"),
                           phone=phone, status="requested")
    db.add(request)
    db.flush()
    if payload.get("ticketId"):
        ticket = db.get(Ticket, payload["ticketId"])
        if ticket and ticket.tenant_id == tenant.id:
            db.add(Message(
                ticket_id=ticket.id, sender_type=MessageSender.SYSTEM,
                sender_name="System", body=f"Voice call-back requested → {phone}",
                is_bot=False, is_read=True,
            ))
    db.commit()
    return {"id": request.id, "status": request.status, "phone": phone}

# ---------------------------------------------------------------- business hours

@router.get("/business-hours")
def get_business_hours(db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_team)) -> dict:
    from app.models.settings import BusinessHours
    from app.services.serializers import business_hours_dto
    
    bh = db.query(BusinessHours).filter(BusinessHours.tenant_id == tenant.id).first()
    if not bh:
        bh = BusinessHours(tenant_id=tenant.id)
        db.add(bh)
        db.commit()
    return business_hours_dto(bh)

@router.put("/business-hours")
def update_business_hours(payload: dict, db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(get_current_user)) -> dict:
    from app.models.settings import BusinessHours
    from app.services.serializers import business_hours_dto
    if user.role not in ("owner", "super_admin"):
        from app.core.errors import InsufficientPrivileges
        raise InsufficientPrivileges("Only owners can modify business hours")
        
    bh = db.query(BusinessHours).filter(BusinessHours.tenant_id == tenant.id).first()
    if not bh:
        bh = BusinessHours(tenant_id=tenant.id)
        db.add(bh)
        
    if "timezone" in payload:
        bh.timezone = payload["timezone"]
    if "schedule" in payload:
        bh.schedule = json.dumps(payload["schedule"])
    if "outOfHoursMessage" in payload:
        bh.out_of_hours_message = payload["outOfHoursMessage"]
        
    db.commit()
    return business_hours_dto(bh)


# ---------------------------------------------------------------- tenant settings

@router.get("/tenant")
def get_tenant_settings(db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_team)) -> dict:
    from app.services.serializers import tenant_dto
    return tenant_dto(tenant)


@router.put("/tenant")
def update_tenant_settings(payload: dict, db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_team)) -> dict:
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Only owners can update tenant settings")
    if "botName" in payload:
        tenant.bot_name = str(payload["botName"])
    if "logoUrl" in payload:
        tenant.logo_url = str(payload["logoUrl"]) if payload["logoUrl"] else None
    if "displayImage" in payload:
        tenant.display_image = str(payload["displayImage"]) if payload["displayImage"] else None
    if "tone" in payload:
        tenant.brand_tone = str(payload["tone"])
    if "welcomeMessage" in payload:
        tenant.welcome_message = str(payload["welcomeMessage"])
    if "aiSystemPrompt" in payload:
        tenant.ai_system_prompt = str(payload["aiSystemPrompt"]) if payload["aiSystemPrompt"] else None
    if "primaryColor" in payload or "color" in payload:
        tenant.primary_color = str(payload.get("primaryColor") or payload.get("color"))
    db.commit()
    db.refresh(tenant)
    # Invalidate cached tenant so subsequent reads see the update
    from app.core.cache import tenant_cache
    tenant_cache.invalidate(f"tenant:{tenant.id}")
    from app.services.serializers import tenant_dto
    return tenant_dto(tenant)

