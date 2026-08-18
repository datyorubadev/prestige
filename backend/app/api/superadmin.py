"""Super-admin platform console (guide §5.16): tenant lifecycle, plans,
invoices, feature flags, and preset versioning. Every mutation is audited."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import Db, get_current_user, require_admin, require_super_admin
from app.core.errors import InsufficientPrivileges, TenantNotFound
from app.core.permissions import AI_CONFIGURE, has_perm
from app.core.security import create_access_token
from app.models import (
    AuditLog,
    FeatureFlag,
    Plan,
    PresetVersion,
    Subscription,
    Tenant,
    TenantMember,
    User,
)
from app.services.event_bus import publish_event
from app.services.serializers import (
    feature_flag_dto,
    plan_dto,
    preset_version_dto,
    session_user,
    tenant_dto,
)

router = APIRouter(tags=["superadmin"])


def _audit(db: Session, tenant_id: str, user: User, action: str, target: str, detail: str,
           entity_type: str = "tenant", entity_id: str | None = None,
           ip_address: str | None = None, device: str | None = None, result: str = "ok") -> None:
    db.add(AuditLog(tenant_id=tenant_id, user_id=user.id, action=action,
                    entity_type=entity_type, entity_id=entity_id or tenant_id, detail=detail,
                    ip_address=ip_address, device=device, result=result))


@router.get("/tenants")
def list_tenants(db: Db, user: User = Depends(require_super_admin)) -> list[dict]:
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    return [tenant_dto(t) for t in tenants]


@router.post("/tenants")
def create_tenant(payload: dict, db: Db, user: User = Depends(require_super_admin)) -> dict:
    name = (payload.get("name") or "").strip()
    slug = (payload.get("slug") or "").strip().lower().replace(" ", "-")
    email = (payload.get("email") or "").strip().lower()
    plan_code = payload.get("plan") or "starter"
    if not name or not slug or not email:
        raise HTTPException(status_code=422, detail="Business name, slug and email are required")
    if db.query(Tenant).filter((Tenant.slug == slug) | (Tenant.email == email)).first():
        raise HTTPException(status_code=409, detail="Tenant slug or email already in use")
    plan = db.query(Plan).filter(Plan.code == plan_code).first()
    if not plan:
        raise HTTPException(status_code=422, detail="Unknown plan code")
    tenant = Tenant(id="t" + uuid.uuid4().hex[:7], business_name=name, slug=slug, email=email,
                    plan_code=plan_code, status="pending", city=payload.get("city", "Lagos"))
    db.add(tenant)
    db.flush()
    db.add(Subscription(tenant_id=tenant.id, plan_id=plan.id, status="trial"))
    _audit(db, tenant.id, user, "create_tenant", name, "provisioned — pending approval",
           entity_id=tenant.id)
    db.commit()
    publish_event("tenant_status_changed", {"tenant_id": tenant.id, "status": "pending"})
    return tenant_dto(tenant)


@router.get("/tenants/{tenant_id}/public")
def get_tenant_public(tenant_id: str, db: Db) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        tenant = db.query(Tenant).filter(Tenant.slug == tenant_id).first()
    if not tenant:
        tenant = db.query(Tenant).filter(Tenant.status == "active").first()
    if not tenant:
        tenant = db.query(Tenant).first()
    if not tenant:
        raise TenantNotFound()
    return tenant_dto(tenant)


@router.get("/tenants/{tenant_id}")
def get_tenant_detail(tenant_id: str, db: Db, user: User = Depends(get_current_user)) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        tenant = db.query(Tenant).filter(Tenant.slug == tenant_id.lower()).first()
    if not tenant:
        raise TenantNotFound()
    if user.role != "super_admin" and user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Insufficient privileges")
    return tenant_dto(tenant)


def _set_tenant_status(db: Session, user: User, tenant: Tenant, status: str,
                       action: str, detail: str) -> dict:
    tenant.status = status
    if status == "active" and not tenant.onboarded_at:
        tenant.onboarded_at = datetime.utcnow()
    if status == "suspended":
        tenant.suspended_at = datetime.utcnow()
    _audit(db, tenant.id, user, action, tenant.business_name, detail)
    db.commit()
    publish_event("tenant_status_changed", {"tenant_id": tenant.id, "status": status})
    return tenant_dto(tenant)


@router.post("/tenants/{tenant_id}/approve")
def approve_tenant(tenant_id: str, db: Db, user: User = Depends(require_super_admin)) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()
    return _set_tenant_status(db, user, tenant, "active", "approve_tenant",
                              "provisioning completed")


@router.post("/tenants/{tenant_id}/suspend")
def suspend_tenant(tenant_id: str, db: Db, user: User = Depends(require_super_admin)) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()
    return _set_tenant_status(db, user, tenant, "suspended", "suspend_tenant",
                              "manual suspension by platform admin")


@router.post("/tenants/{tenant_id}/reactivate")
def reactivate_tenant(tenant_id: str, db: Db, user: User = Depends(require_super_admin)) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()
    return _set_tenant_status(db, user, tenant, "active", "reactivate_tenant", "after review")


@router.post("/impersonate/{tenant_id}")
def impersonate_tenant(tenant_id: str, db: Db, user: User = Depends(require_super_admin)) -> dict:
    """Issue a short-lived, tenant-scoped access token so a super admin can
    view a tenant workspace as its owner. The impersonation token carries the
    owner's sub, so get_tenant() no longer rejects it with
    "Super admin has no tenant scope". Audited; never refreshable."""
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()
    owner = (
        db.query(User)
        .join(TenantMember, TenantMember.user_id == User.id)
        .filter(
            TenantMember.tenant_id == tenant_id,
            TenantMember.role == "owner",
            TenantMember.status == "active",
            User.is_active.is_(True),
        )
        .order_by(User.created_at)
        .first()
    )
    if not owner:
        raise HTTPException(status_code=422, detail="Tenant has no active owner account")
    owner.tenant_id = tenant_id  # impersonation operates inside this tenant
    token = create_access_token(owner.id, owner.role, owner.tenant_id, impersonation=True)
    _audit(db, tenant.id, user, "impersonate_tenant", tenant.business_name,
           f"viewing workspace as {owner.full_name}", entity_id=tenant.id)
    db.commit()
    return {"token": token, "user": session_user(owner)}


@router.post("/tenants/{tenant_id}/plan")
def change_tenant_plan(payload: dict, tenant_id: str, db: Db,
                       user: User = Depends(require_super_admin)) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()
    code = payload.get("code")
    plan = db.query(Plan).filter(Plan.code == code).first() if code else None
    if not plan:
        raise HTTPException(status_code=422, detail="Unknown plan code")
    tenant.plan_code = code
    sub = db.query(Subscription).filter(Subscription.tenant_id == tenant.id).first()
    if sub:
        sub.plan_id = plan.id
        sub.status = "active"
    else:
        db.add(Subscription(tenant_id=tenant.id, plan_id=plan.id, status="active"))
    _audit(db, tenant.id, user, "change_plan", tenant.business_name,
           f"plan → {code} (platform override)")
    db.commit()
    publish_event("billing_changed", {"tenant_id": tenant.id, "plan_code": code})
    return tenant_dto(tenant)


@router.put("/tenants/{tenant_id}")
@router.patch("/tenants/{tenant_id}")
def update_tenant(tenant_id: str, payload: dict, db: Db,
                  user: User = Depends(require_admin)) -> dict:
    tenant = db.get(Tenant, tenant_id) or db.query(Tenant).filter(Tenant.slug == tenant_id.lower()).first()
    if not tenant:
        raise TenantNotFound()
    if user.role != "super_admin" and user.tenant_id not in (tenant.id, tenant.slug):
        raise HTTPException(status_code=403, detail="Insufficient privileges")
    allowed = {
        "name": "business_name", "city": "city", "status": "status", "plan": "plan_code",
        "color": "primary_color", "tone": "brand_tone", "botName": "bot_name",
        "logoUrl": "logo_url",
        "displayImage": "display_image",
        "welcomeMessage": "welcome_message", "launcherText": "widget_launcher_text",
        "widgetPosition": "widget_position", "escalationMessage": "escalation_message",
        "mobileFullscreen": "mobile_fullscreen", "proactiveTeaser": "proactive_teaser",
        "secondaryColor": "secondary_color",
    }
    ai_fields = {"tone", "botName", "welcomeMessage", "launcherText", "widgetPosition",
                 "escalationMessage", "mobileFullscreen", "proactiveTeaser", "secondaryColor"}
    if ai_fields.intersection(payload) and not has_perm(user, AI_CONFIGURE):
        raise InsufficientPrivileges("AI configuration requires ai.configure")
    changes = []
    for key, attr in allowed.items():
        if key in payload:
            setattr(tenant, attr, payload[key])
            changes.append(key)
    if changes:
        _audit(db, tenant.id, user, "update_tenant", tenant.business_name,
               ", ".join(changes) + " updated")
    db.commit()
    return tenant_dto(tenant)


@router.get("/plans")
def list_plans(db: Db, user: User = Depends(require_super_admin)) -> list[dict]:
    return [plan_dto(p) for p in db.query(Plan).order_by(Plan.price_mo).all()]


def _parse_amount(value) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    digits = "".join(c for c in str(value) if c.isdigit())
    return int(digits) if digits else 0


def _parse_kb_mb(value) -> int:
    """'20 GB' → 20480; '512 MB' → 512; bare number → MB."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    s = str(value).strip().upper()
    if s.endswith("GB"):
        return int(float(s[:-2].strip() or 0) * 1024)
    if s.endswith("MB"):
        return int(float(s[:-2].strip() or 0))
    return _parse_amount(s)


@router.put("/plans/{code}")
@router.patch("/plans/{code}")
def update_plan(code: str, payload: dict, db: Db,
                user: User = Depends(require_super_admin)) -> dict:
    plan = db.query(Plan).filter(Plan.code == code).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if "priceNum" in payload:
        plan.price_mo = _parse_amount(payload["priceNum"])
    elif "price" in payload:
        plan.price_mo = _parse_amount(payload["price"])
    if "kb" in payload:
        plan.kb_quota_mb = _parse_kb_mb(payload["kb"])
    for key, attr in {"name": "name", "agents": "max_agents",
                      "customers": "max_customers", "tag": "tag"}.items():
        if key in payload:
            setattr(plan, attr, payload[key])
    _audit(db, "platform", user, "update_plan_template", plan.name,
           ", ".join(payload.keys()) + " edited", entity_type="plan")
    db.commit()
    publish_event("billing_changed", {"plan_code": plan.code})
    return plan_dto(plan)


@router.get("/feature-flags")
def list_feature_flags(db: Db, user: User = Depends(require_super_admin)) -> list[dict]:
    return [feature_flag_dto(f) for f in db.query(FeatureFlag).order_by(FeatureFlag.key).all()]


@router.put("/feature-flags/{key}")
@router.patch("/feature-flags/{key}")
def update_feature_flag(key: str, payload: dict, db: Db,
                        user: User = Depends(require_super_admin)) -> dict:
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    if "enabled" in payload:
        flag.enabled = bool(payload["enabled"])
    _audit(db, "platform", user, "update_feature_flag", flag.label,
           f"{flag.key} → {'on' if flag.enabled else 'off'}", entity_type="feature_flag")
    db.commit()
    return feature_flag_dto(flag)


@router.get("/presets")
def list_presets(db: Db, user: User = Depends(require_super_admin)) -> list[dict]:
    return [preset_version_dto(p) for p in db.query(PresetVersion).order_by(PresetVersion.created_at.desc()).all()]


@router.post("/presets")
def create_preset(payload: dict, db: Db, user: User = Depends(require_super_admin)) -> dict:
    from app.models import EscalationRule

    rules = db.query(EscalationRule).order_by(EscalationRule.id).all()
    snapshot = [
        {
            "id": r.id, "name": r.name, "preset": r.preset, "enabled": r.is_active,
            "cond": r.condition_field, "action": r.action,
            "terms": json.loads(r.terms or "[]"),
        }
        for r in rules
    ]
    latest = db.query(PresetVersion).order_by(PresetVersion.created_at.desc()).first()
    try:
        major, minor = (latest.version[1:].split(".") if latest else ("1", "0"))
        version = f"v{major}.{int(minor) + 1}"
    except ValueError:
        version = "v1.1"
    preset = PresetVersion(version=version, label=payload.get("label", "Snapshot"),
                           note=payload.get("note"), rules=json.dumps(snapshot),
                           created_by=payload.get("createdBy", user.full_name))
    db.add(preset)
    _audit(db, "platform", user, "create_preset_version", preset.label,
           f"version {version} snapshot", entity_type="preset_version")
    db.commit()
    return preset_version_dto(preset)


@router.post("/presets/{preset_id}/restore")
def restore_preset(preset_id: str, db: Db, user: User = Depends(require_super_admin)) -> dict:
    from app.models import EscalationRule

    preset = db.get(PresetVersion, preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset version not found")
    snapshot = json.loads(preset.rules or "[]")
    for entry in snapshot:
        rule = db.get(EscalationRule, entry.get("id"))
        if rule:
            rule.name = entry.get("name", rule.name)
            rule.condition_field = entry.get("cond", rule.condition_field)
            rule.action = entry.get("action", rule.action)
            rule.terms = json.dumps(entry.get("terms", []))
            rule.is_active = bool(entry.get("enabled", True))
    _audit(db, "platform", user, "restore_preset_version", preset.label,
           f"restored rules from {preset.version}", entity_type="preset_version")
    db.commit()
    return {"ok": True, "restored": len(snapshot)}

@router.post("/tenants/{tenant_id}/toggle-ai")
def toggle_tenant_ai(tenant_id: str, db: Db, user: User = Depends(require_admin)) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()
    if user.role != "super_admin" and user.tenant_id != tenant_id:
        raise InsufficientPrivileges()
    tenant.ai_enabled = not getattr(tenant, "ai_enabled", True)
    _audit(db, tenant.id, user, "toggle_ai", tenant.business_name,
           f"AI turned {'on' if tenant.ai_enabled else 'off'}")
    db.commit()
    return tenant_dto(tenant)


@router.delete("/tenants/{tenant_id}")
def delete_tenant(tenant_id: str, db: Db, user: User = Depends(require_super_admin)) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()
    sub = db.query(Subscription).filter(Subscription.tenant_id == tenant.id, Subscription.status == "active").first()
    if sub:
        raise HTTPException(status_code=400, detail="Cannot delete tenant with active subscription")
    _audit(db, "platform", user, "delete_tenant", tenant.business_name,
           f"deleted tenant {tenant.id}", entity_type="tenant")
    db.delete(tenant)
    db.commit()
    return {"ok": True, "id": tenant_id}


@router.get("/platform/stats")
def platform_stats(db: Db, user: User = Depends(require_super_admin)) -> dict:
    from app.models import Customer, Ticket, User as UserModel
    from app.models.settings import AiUsageLog
    from sqlalchemy import func
    from collections import Counter
    
    total_tenants = db.query(Tenant).count()
    active_tenants = db.query(Tenant).filter(Tenant.status == "active").count()
    suspended_tenants = db.query(Tenant).filter(Tenant.status == "suspended").count()
    total_agents = db.query(UserModel).filter(UserModel.role.in_(["owner", "agent"])).count()
    total_customers = db.query(Customer).count()
    total_tickets = db.query(Ticket).count()
    ai_resolutions = db.query(Ticket).filter(
        Ticket.status.in_(["resolved", "closed"]),
        Ticket.assignee_id.is_(None)
    ).count()
    human_handoffs = db.query(Ticket).filter(
        Ticket.status == "escalated"
    ).count()
    
    plans = db.query(Tenant.plan_code).all()
    plan_dist = Counter(p[0] for p in plans)
    
    token_result = db.query(
        func.sum(AiUsageLog.tokens_in + AiUsageLog.tokens_out)
    ).scalar() or 0
    
    return {
        "totalTenants": total_tenants,
        "activeTenants": active_tenants,
        "suspendedTenants": suspended_tenants,
        "pendingTenants": total_tenants - active_tenants - suspended_tenants,
        "totalAgents": total_agents,
        "totalCustomers": total_customers,
        "totalTickets": total_tickets,
        "aiResolutions": ai_resolutions,
        "humanHandoffs": human_handoffs,
        "aiTokensUsed": token_result,
        "subscriptionDistribution": dict(plan_dist),
    }


@router.get("/platform/usage")
def platform_usage(db: Db, user: User = Depends(require_super_admin)) -> list[dict]:
    from app.models import Customer, Ticket, User as UserModel
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    result = []
    for t in tenants:
        agents = db.query(UserModel).filter(UserModel.tenant_id == t.id, UserModel.role.in_(["owner", "agent"])).count()
        customers = db.query(Customer).filter(Customer.tenant_id == t.id).count()
        tickets = db.query(Ticket).filter(Ticket.tenant_id == t.id).count()
        result.append({
            "tenantId": t.id,
            "name": t.business_name,
            "plan": t.plan_code,
            "status": t.status,
            "agents": agents,
            "customers": customers,
            "tickets": tickets,
            "aiEnabled": getattr(t, 'ai_enabled', True),
            "aiTokensUsed": getattr(t, 'ai_tokens_used', 0),
        })
    return result


@router.post("/tenants/{tenant_id}/toggle-ai")
def toggle_tenant_ai(tenant_id: str, db: Db, user: User = Depends(require_super_admin)) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()
    tenant.ai_enabled = not getattr(tenant, "ai_enabled", True)
    _audit(db, tenant.id, user, "toggle_ai", tenant.business_name,
           f"AI enabled set to {tenant.ai_enabled}")
    db.commit()
    db.refresh(tenant)
    return tenant_dto(tenant)


@router.delete("/tenants/{tenant_id}")
def delete_tenant(tenant_id: str, db: Db, user: User = Depends(require_super_admin)) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()
    
    # Check active paid subscription safety guard
    sub = db.query(Subscription).filter(Subscription.tenant_id == tenant.id, Subscription.status == "active").first()
    if sub and tenant.plan_code != "starter":
        raise HTTPException(status_code=400, detail="Cannot delete tenant with an active paid subscription. Cancel subscription first.")
    
    # Audit before removal
    _audit(db, tenant.id, user, "delete_tenant", tenant.business_name, "hard deletion of tenant workspace")
    
    # Cascade delete tenant records
    from app.models import Customer, Ticket, Message, KnowledgeSource, KbArticle, TenantMember
    db.query(Message).filter(Message.ticket_id.in_(db.query(Ticket.id).filter(Ticket.tenant_id == tenant_id))).delete(synchronize_session=False)
    db.query(Ticket).filter(Ticket.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(Customer).filter(Customer.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(KnowledgeSource).filter(KnowledgeSource.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(KbArticle).filter(KbArticle.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(TenantMember).filter(TenantMember.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(Subscription).filter(Subscription.tenant_id == tenant_id).delete(synchronize_session=False)
    
    db.delete(tenant)
    db.commit()
    return {"ok": True, "tenantId": tenant_id}


class TenantQuotasUpdate(BaseModel):
    ai_tokens_limit: int | None = None
    max_agents: int | None = None
    max_customers: int | None = None
    plan_code: str | None = None


@router.patch("/tenants/{tenant_id}/quotas")
def update_tenant_quotas(
    tenant_id: str,
    body: TenantQuotasUpdate,
    db: Db,
    user: User = Depends(require_super_admin),
) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()

    if body.ai_tokens_limit is not None:
        tenant.ai_tokens_limit = max(0, body.ai_tokens_limit)
    if body.max_agents is not None:
        tenant.max_agents = max(1, body.max_agents)
    if body.max_customers is not None:
        tenant.max_customers = max(1, body.max_customers)
    if body.plan_code is not None:
        tenant.plan_code = body.plan_code.strip().lower()

    _audit(
        db,
        tenant.id,
        user,
        "update_quotas",
        tenant.business_name,
        f"Quotas updated: limit={tenant.ai_tokens_limit}, agents={tenant.max_agents}, plan={tenant.plan_code}",
    )
    db.commit()
    db.refresh(tenant)
    return tenant_dto(tenant)


# In-memory storage for active global system broadcasts
_ACTIVE_BROADCAST: dict | None = None


class BroadcastRequest(BaseModel):
    message: str
    level: str = "info"  # info | warning | danger
    active: bool = True


@router.get("/platform/broadcast")
def get_platform_broadcast() -> dict:
    global _ACTIVE_BROADCAST
    return {"broadcast": _ACTIVE_BROADCAST}


@router.post("/platform/broadcast")
def set_platform_broadcast(
    body: BroadcastRequest,
    db: Db,
    user: User = Depends(require_super_admin),
) -> dict:
    global _ACTIVE_BROADCAST
    if not body.active or not body.message.strip():
        _ACTIVE_BROADCAST = None
        publish_event("platform_broadcast", {"broadcast": None})
        _audit(db, "system", user, "clear_broadcast", "System", "Cleared active system broadcast")
        return {"broadcast": None}

    _ACTIVE_BROADCAST = {
        "message": body.message.strip(),
        "level": body.level,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdBy": user.full_name or user.email,
    }
    publish_event("platform_broadcast", {"broadcast": _ACTIVE_BROADCAST})
    _audit(db, "system", user, "send_broadcast", "System", f"Broadcast ({body.level}): {body.message[:80]}")
    return {"broadcast": _ACTIVE_BROADCAST}


@router.get("/users")
def list_all_users(
    db: Db,
    user: User = Depends(require_super_admin),
) -> list[dict]:
    """List all platform users across all tenants (super admin console)."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    from app.services.serializers import agent_dto
    return [agent_dto(u) for u in users]


@router.post("/users/{user_id}/revoke-sessions")
def revoke_user_sessions(
    user_id: str,
    db: Db,
    user: User = Depends(require_super_admin),
) -> dict:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    revoked_count = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
        .update({"revoked": True})
    )
    _audit(
        db,
        target.tenant_id or "system",
        user,
        "revoke_sessions",
        target.email,
        f"Revoked {revoked_count} active sessions for {target.email}",
    )
    db.commit()
    return {"ok": True, "userId": user_id, "revokedCount": revoked_count}


class ForcePasswordResetRequest(BaseModel):
    temporary_password: str = "Prestige123!"


@router.post("/users/{user_id}/reset-password")
def force_reset_user_password(
    user_id: str,
    body: ForcePasswordResetRequest,
    db: Db,
    user: User = Depends(require_super_admin),
) -> dict:
    from app.core.security import hash_password

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.password_hash = hash_password(body.temporary_password)
    # Revoke old tokens on password reset
    db.query(RefreshToken).filter(RefreshToken.user_id == user_id).update({"revoked": True})
    _audit(
        db,
        target.tenant_id or "system",
        user,
        "force_password_reset",
        target.email,
        f"Forced temporary password reset for {target.email}",
    )
    db.commit()
    return {"ok": True, "userId": user_id, "message": "Password reset successfully"}


