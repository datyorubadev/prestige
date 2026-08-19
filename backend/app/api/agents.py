import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import Db, get_current_user, get_tenant
from app.config import settings
from app.core.errors import TicketNotFound
from app.core.permissions import TEAM_MANAGE, TEAM_VIEW, has_perm, require_perm
from app.models import Invite, Tenant, TenantMember, User
from app.models.common import InviteRole, Role
from app.services.event_bus import publish_event
from app.services.serializers import agent_dto

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentInvite(BaseModel):
    name: str
    email: str
    role: str = "agent"


class AgentUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    active: bool | None = None
    role: str | None = None
    online: bool | None = None
    inbox_scope: str | None = None


class ScopeUpdate(BaseModel):
    inbox_scope: str


INBOX_SCOPES = ("all", "assigned", "team")


def _membership(db: Db, tenant: Tenant, user_id: str) -> TenantMember | None:
    return (
        db.query(TenantMember)
        .filter(TenantMember.user_id == user_id, TenantMember.tenant_id == tenant.id)
        .first()
    )


def _dto(db: Db, tenant: Tenant, user: User) -> dict:
    return agent_dto(user, membership=_membership(db, tenant, user.id))


@router.get("")
def list_agents(db: Db, user: User = Depends(get_current_user)) -> list[dict]:
    if not user.tenant_id:
        raise HTTPException(status_code=404, detail="Tenant scope not found")
    tenant = db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    users = db.query(User).filter(User.tenant_id == tenant.id).all()
    return [_dto(db, tenant, u) for u in users]


@router.post("")
def invite_agent(body: AgentInvite, db: Db, tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_perm(TEAM_MANAGE))) -> dict:
    email = body.email.lower()
    existing = db.query(User).filter(User.tenant_id == tenant.id, User.email == email).first()
    if existing:
        return _dto(db, tenant, existing)
    token = f"invite-{uuid.uuid4().hex[:8]}"
    db.add(Invite(
        tenant_id=tenant.id, email=email, role=InviteRole.AGENT, token=token,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=settings.invite_expire_days),
    ))
    # The invited member exists in the agent roster immediately (pending state).
    member = User(
        tenant_id=tenant.id, email=email,
        password_hash="", full_name=body.name,
        role=Role.AGENT, is_active=True,
    )
    db.add(member)
    db.flush()
    db.add(TenantMember(
        tenant_id=tenant.id, user_id=member.id,
        role=body.role if body.role in ("owner", "agent") else "agent",
        status="active", inbox_scope="all",
    ))
    db.commit()
    db.refresh(member)
    return _dto(db, tenant, member)


@router.post("/{agent_id}/resend")
def resend_invite(agent_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_perm(TEAM_MANAGE))) -> dict:
    member = db.get(User, agent_id)
    if not member or member.tenant_id != tenant.id:
        raise TicketNotFound("Agent not found")
    token = f"invite-{uuid.uuid4().hex[:8]}"
    db.add(Invite(
        tenant_id=tenant.id, email=member.email, role=InviteRole.AGENT, token=token,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=settings.invite_expire_days),
    ))
    member.last_seen = None  # back to pending
    db.commit()
    db.refresh(member)
    return _dto(db, tenant, member)


@router.delete("/{agent_id}")
def set_agent_active(agent_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                     user: User = Depends(require_perm(TEAM_MANAGE))) -> dict:
    member = db.get(User, agent_id)
    if not member or member.tenant_id != tenant.id:
        raise TicketNotFound("Agent not found")
    if member.role == "owner":
        raise TicketNotFound("Owner cannot be deactivated")
    member.is_active = False
    member.last_seen = None
    membership = (
        db.query(TenantMember)
        .filter(TenantMember.user_id == member.id, TenantMember.tenant_id == tenant.id)
        .first()
    )
    if membership:
        membership.status = "deactivated"
    db.commit()
    db.refresh(member)
    return _dto(db, tenant, member)


@router.patch("/{agent_id}")
@router.put("/{agent_id}")
def update_agent(agent_id: str, body: AgentUpdate, db: Db,
                 tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_perm(TEAM_MANAGE))) -> dict:
    member = db.get(User, agent_id)
    if not member or member.tenant_id != tenant.id:
        raise TicketNotFound("Agent not found")
    if body.name:
        member.full_name = body.name
    if body.color:
        member.color = body.color
    if body.active is not None:
        member.is_active = body.active
    if body.role in ("agent", "owner"):
        member.role = body.role
    if body.online is not None:
        member.last_seen = datetime.utcnow() if body.online else None
    membership = (
        db.query(TenantMember)
        .filter(TenantMember.user_id == member.id, TenantMember.tenant_id == tenant.id)
        .first()
    )
    if membership:
        if body.role in ("agent", "owner"):
            membership.role = body.role
        if body.active is not None:
            membership.status = "active" if body.active else "deactivated"
        if body.inbox_scope in INBOX_SCOPES:
            membership.inbox_scope = body.inbox_scope
    db.commit()
    db.refresh(member)
    return _dto(db, tenant, member)


@router.patch("/me/scope")
@router.put("/me/scope")
def set_my_scope(body: ScopeUpdate, db: Db, tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_perm(TEAM_VIEW))) -> dict:
    """Self-service inbox scope: agents may pick "all" (needs agent scope),
    "assigned", or "team" without admin involvement (P4)."""
    if body.inbox_scope not in INBOX_SCOPES:
        raise TicketNotFound("Invalid inbox scope")
    if body.inbox_scope == "all" and not has_perm(user, TEAM_MANAGE):
        raise TicketNotFound("Only owners may set the full-inbox scope")
    membership = _membership(db, tenant, user.id)
    if not membership:
        membership = TenantMember(tenant_id=tenant.id, user_id=user.id,
                                  role=user.role, status="active", inbox_scope="all")
        db.add(membership)
    membership.inbox_scope = body.inbox_scope
    db.commit()
    return _dto(db, tenant, user)


# ── Presence / Heartbeat ───────────────────────────────────────────

PRESENCE_STATUSES = ("online", "away", "busy", "offline")


class PresenceUpdate(BaseModel):
    status: str


@router.post("/me/heartbeat")
def heartbeat(db: Db, user: User = Depends(get_current_user)) -> dict:
    """Periodic heartbeat — keeps the agent's presence signal alive."""
    user.last_seen = datetime.utcnow()
    if user.presence_status == "offline":
        user.presence_status = "online"
    db.commit()
    publish_event("agent_presence", {
        "user_id": user.id,
        "user_name": user.full_name,
        "online": True,
        "presence_status": user.presence_status,
    })
    return {"ok": True, "last_seen": user.last_seen.isoformat() if user.last_seen else None}


@router.patch("/me/presence")
@router.put("/me/presence")
def set_my_presence(body: PresenceUpdate, db: Db,
                    user: User = Depends(get_current_user)) -> dict:
    """Self-service presence status toggle (online/away/busy/offline)."""
    if body.status not in PRESENCE_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    user.presence_status = body.status
    if body.status == "offline":
        user.last_seen = None
    else:
        user.last_seen = datetime.utcnow()
    db.commit()
    publish_event("agent_presence", {
        "user_id": user.id,
        "user_name": user.full_name,
        "online": body.status != "offline",
        "presence_status": body.status,
    })
    return {"ok": True, "presence_status": user.presence_status}

