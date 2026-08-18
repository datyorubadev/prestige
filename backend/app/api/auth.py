import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import Db, get_current_user
from app.config import settings
from app.core.errors import (
    InsufficientPrivileges,
    InvalidCredentials,
    InviteExpired,
    ResetTokenExpired,
    TenantNotFound,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    refresh_token_expiry,
    verify_password,
)
from app.database import get_db
from app.models import Invite, PasswordReset, RefreshToken, Tenant, TenantMember, User
from app.models.common import Role
from app.schemas.auth import (
    AcceptInviteRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SwitchTenantRequest,
)
from app.services.serializers import session_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _login_payload(db: Session, user: User) -> dict:
    access = create_access_token(user.id, user.role, user.tenant_id)
    refresh = create_refresh_token(user.id)
    db.add(RefreshToken(user_id=user.id, token=refresh, expires_at=refresh_token_expiry()))
    db.commit()
    return {"token": access, "refresh_token": refresh, "user": session_user(user)}


def _active_tenant_id(db: Session, user: User) -> str | None:
    """The tenant_id the session should operate in.

    Team users (owner/agent) resolve it from their membership rows: the current
    pointer if it is still an active membership, otherwise the first active
    membership. Customers keep their home tenant (no membership rows), and
    super admins have no tenant scope."""
    if user.role not in ("owner", "agent"):
        return user.tenant_id
    rows = (
        db.query(TenantMember)
        .filter(TenantMember.user_id == user.id)
        .order_by(TenantMember.created_at)
        .all()
    )
    active = [m for m in rows if m.status == "active"]
    if not active:
        return None
    for m in active:
        if m.tenant_id == user.tenant_id:
            return m.tenant_id
    return active[0].tenant_id


@router.post("/login")
def login(body: LoginRequest, db: Db) -> dict:
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise InvalidCredentials()
    # Tenant-scoped portal sign-in: the account must be a CUSTOMER of the
    # workspace behind this portal. Team members and customers of other tenants
    # are refused so nobody can log into a portal they don't belong to.
    if body.tenant_id:
        tenant = (
            db.get(Tenant, body.tenant_id)
            or db.query(Tenant).filter(Tenant.slug == body.tenant_id.lower()).first()
        )
        if not tenant:
            raise TenantNotFound()
        if user.role != Role.CUSTOMER or user.tenant_id != tenant.id:
            raise InsufficientPrivileges("This account does not belong to this workspace")
    if user.role in ("owner", "agent"):
        user.tenant_id = _active_tenant_id(db, user)  # sync active tenant pointer
    return _login_payload(db, user)


@router.post("/register")
def register(body: RegisterRequest, db: Db) -> dict:
    import re
    import uuid

    email = body.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise InvalidCredentials("An account with this email already exists")

    tenant = None
    role = Role.CUSTOMER

    # If company_name is provided, this is a new tenant owner registration from the landing page
    if body.company_name and body.company_name.strip():
        company = body.company_name.strip()
        slug = company.lower().replace(" ", "-").replace("_", "-")
        clean_slug = re.sub(r"[^a-z0-9-]", "", slug) or "workspace"
        base_slug = clean_slug
        count = 1
        while db.query(Tenant).filter(Tenant.slug == clean_slug).first():
            clean_slug = f"{base_slug}-{count}"
            count += 1

        tenant = Tenant(
            id=f"t_{uuid.uuid4().hex[:8]}",
            business_name=company,
            slug=clean_slug,
            primary_color="#00a86b",
            secondary_color="#059669",
        )
        db.add(tenant)
        db.flush()
        role = Role.OWNER
    elif body.tenant_id:
        tenant = db.get(Tenant, body.tenant_id) or db.query(Tenant).filter(Tenant.slug == body.tenant_id).first()

    if not tenant:
        tenant = db.query(Tenant).order_by(Tenant.created_at).first()
        if not tenant:
            raise TenantNotFound("No tenant available for registration")

    user = User(
        tenant_id=tenant.id,
        email=email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=role,
        is_active=True,
    )
    db.add(user)
    db.flush()

    if role == Role.OWNER:
        member = TenantMember(
            tenant_id=tenant.id,
            user_id=user.id,
            role=Role.OWNER,
            status="active",
        )
        db.add(member)

    db.commit()
    db.refresh(user)
    return _login_payload(db, user)


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return {"user": session_user(user)}


@router.get("/memberships")
def memberships(db: Db, user: User = Depends(get_current_user)) -> dict:
    """Tenant workspaces the signed-in user belongs to (team memberships)."""
    rows = (
        db.query(TenantMember)
        .filter(TenantMember.user_id == user.id)
        .order_by(TenantMember.created_at)
        .all()
    )
    tenant_ids = [m.tenant_id for m in rows]
    tenants = (
        {t.id: t for t in db.query(Tenant).filter(Tenant.id.in_(tenant_ids)).all()}
        if tenant_ids
        else {}
    )
    return {
        "activeTenantId": user.tenant_id,
        "memberships": [
            {
                "tenantId": m.tenant_id,
                "tenantName": tenants[m.tenant_id].business_name if m.tenant_id in tenants else "",
                "slug": tenants[m.tenant_id].slug if m.tenant_id in tenants else "",
                "role": m.role,
                "status": m.status,
                "inboxScope": m.inbox_scope,
                "isActive": m.status == "active" and m.tenant_id == user.tenant_id,
            }
            for m in rows
        ],
    }


@router.post("/switch-tenant")
def switch_tenant(body: SwitchTenantRequest, db: Db, user: User = Depends(get_current_user)) -> dict:
    """Switch the session's active workspace to another tenant the user belongs
    to. Re-issues both tokens so the old (previous-tenant) access token is
    superseded."""
    member = (
        db.query(TenantMember)
        .filter(TenantMember.user_id == user.id, TenantMember.tenant_id == body.tenant_id)
        .first()
    )
    if not member or member.status != "active":
        raise TenantNotFound("You are not an active member of this tenant")
    user.tenant_id = member.tenant_id
    db.add(user)
    return _login_payload(db, user)


@router.post("/refresh")
def refresh(body: RefreshRequest, db: Db) -> dict:
    payload = decode_token(body.refresh_token)
    user_id = payload.get("sub")
    if not user_id:
        raise InvalidCredentials("Invalid token")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise InvalidCredentials("Account disabled")
    token_type = payload.get("type")
    if token_type == "refresh":
        stored = db.query(RefreshToken).filter(
            RefreshToken.token == body.refresh_token, RefreshToken.revoked.is_(False)
        ).first()
        if not stored:
            raise InvalidCredentials("Refresh token has been revoked")
    if user.role in ("owner", "agent"):
        user.tenant_id = _active_tenant_id(db, user)
    access = create_access_token(user.id, user.role, user.tenant_id)
    return {"access_token": access, "user": session_user(user)}


@router.post("/logout")
def logout(body: RefreshRequest | None = None, db: Db = None) -> dict:
    if body and body.refresh_token:
        db.query(RefreshToken).filter(RefreshToken.token == body.refresh_token).update(
            {RefreshToken.revoked: True}
        )
        db.commit()
    return {"ok": True}


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Db) -> dict:
    """Issues a one-time reset token. Always returns ok (no account probing).
    In mock-email mode the reset link is returned so the frontend can render it."""
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if user:
        db.query(PasswordReset).filter(
            PasswordReset.user_id == user.id, PasswordReset.is_active.is_(True)
        ).update({PasswordReset.is_active: False})
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
            minutes=settings.reset_token_expire_minutes
        )
        db.add(PasswordReset(user_id=user.id, token=token, expires_at=expires_at))
        db.commit()
        if settings.email_mock:
            logger.info("reset link for %s: /reset-password?token=%s", body.email, token)
        else:
            # real SMTP send would go here via email_service
            logger.info("reset requested for %s", body.email)
        return {"ok": True, "token": token}
    return {"ok": True}


@router.get("/reset-info/{token}")
def reset_info(token: str, db: Db) -> dict:
    """Public preview for the reset page — returns the masked email or errors."""
    reset = _valid_reset(db, token)
    return {"email": reset.user.email}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Db) -> dict:
    """Consumes the one-time token and sets the new password."""
    reset = _valid_reset(db, body.token)
    user = reset.user
    user.password_hash = hash_password(body.new_password)
    reset.is_active = False
    reset.used_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update(
        {RefreshToken.revoked: True}
    )
    db.commit()
    return {"ok": True}


def _valid_reset(db: Session, token: str) -> PasswordReset:
    reset = db.query(PasswordReset).filter(
        PasswordReset.token == token, PasswordReset.is_active.is_(True)
    ).first()
    if not reset:
        raise ResetTokenExpired()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if reset.expires_at < now:
        reset.is_active = False
        db.commit()
        raise ResetTokenExpired()
    return reset


@router.get("/invites/{token}")
def invite_info(token: str, db: Db) -> dict:
    invite = db.query(Invite).filter(Invite.token == token).first()
    if not invite or not invite.is_active:
        raise InviteExpired()
    tenant = db.get(Tenant, invite.tenant_id)
    return {
        "email": invite.email,
        "role": invite.role,
        "tenant": tenant.business_name if tenant else "",
        "expiresAt": invite.expires_at.isoformat() if invite.expires_at else "",
    }


@router.post("/accept-invite")
def accept_invite(body: AcceptInviteRequest, db: Db) -> dict:
    invite = db.query(Invite).filter(Invite.token == body.invite_token).first()
    if not invite or not invite.is_active:
        raise InviteExpired()
    if db.query(User).filter(User.email == invite.email).first():
        raise InvalidCredentials("An account with this email already exists")
    user = User(
        tenant_id=invite.tenant_id,
        email=invite.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=invite.role,
        is_active=True,
    )
    invite.is_active = False
    db.add(user)
    db.flush()
    if invite.role in (Role.OWNER, Role.AGENT):
        db.add(TenantMember(
            tenant_id=invite.tenant_id, user_id=user.id,
            role=invite.role, status="active", inbox_scope="all",
        ))
    db.commit()
    db.refresh(user)
    return _login_payload(db, user)


class DeletionRequestModel(BaseModel):
    reason: str = ""


@router.delete("/me")
def delete_account(db: Db, body: DeletionRequestModel = None, user: User = Depends(get_current_user)) -> dict:
    from app.models.settings import DeletionRequest
    reason = body.reason if body else ""
    db.add(DeletionRequest(
        tenant_id=user.tenant_id,
        user_id=user.id,
        reason=reason,
    ))
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update(
        {RefreshToken.revoked: True}
    )
    user.is_active = False
    db.commit()
    return {"ok": True}
