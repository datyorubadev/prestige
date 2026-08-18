from collections.abc import Callable
from typing import Annotated, TypeVar

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.errors import InsufficientPrivileges, InvalidCredentials, TenantNotActive, TenantNotFound, TicketNotFound
from app.core.security import decode_token
from app.database import get_db
from app.models import Tenant, TenantMember, Ticket, User

Db = Annotated[Session, Depends(get_db)]
T = TypeVar("T")


def get_bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise InvalidCredentials("Missing or malformed Authorization header")
    return authorization.split(" ", 1)[1].strip()


def _resolve_user(db: Db, token: str) -> User:
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise InvalidCredentials("Invalid token")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise InvalidCredentials("Account disabled")
    return user


def get_current_user(db: Db, token: str = Depends(get_bearer_token)) -> User:
    return _resolve_user(db, token)


def get_optional_user(db: Db,
                      authorization: Annotated[str | None, Header()] = None) -> User | None:
    """Resolve the caller only when a valid bearer token is present.

    Anonymous requests (no Authorization header) resolve to None — the public
    widget / portal flows keep working without an identity. An invalid or
    expired token also resolves to None; it is never treated as an identity.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        return _resolve_user(db, token)
    except InvalidCredentials:
        return None


def get_active_membership(db: Db, user: User) -> TenantMember | None:
    """The user's membership for their current active tenant (team roles only).

    Returns None for super admins and customers — neither holds a team
    membership row: super admins have no tenant scope at all, and customers
    belong to their home tenant without being team members."""
    if user.role not in ("owner", "agent"):
        return None
    if not user.tenant_id:
        return None
    return (
        db.query(TenantMember)
        .filter(
            TenantMember.user_id == user.id,
            TenantMember.tenant_id == user.tenant_id,
            TenantMember.status == "active",
        )
        .first()
    )


def get_current_membership(db: Db, user: User = Depends(get_current_user)) -> TenantMember:
    """Require an active team membership for the caller's current tenant."""
    membership = get_active_membership(db, user)
    if not membership:
        raise TenantNotFound("No active membership for this tenant")
    return membership


def get_tenant(db: Db, user: User = Depends(get_current_user)) -> Tenant:
    """Resolve the caller's active tenant.

    No fallbacks: a user without a tenant scope (super admin, or any account
    with no active membership) is denied here — the only way super admin
    reaches tenant data is via the audited impersonation flow, which re-issues
    a token under the owner's identity.

    For team roles the active tenant must be backed by an active membership
    row (tenant_members), so a stale token or a removed membership cannot
    access a workspace they no longer belong to.

    Uses a 60s TTL cache to avoid redundant DB reads under high concurrency.
    """
    tenant_id = user.tenant_id
    if not tenant_id:
        raise TenantNotFound("No tenant scope for this account")
    membership = get_active_membership(db, user)
    if user.role in ("owner", "agent") and not membership:
        raise TenantNotFound("No active membership for this tenant")

    # Check cache first
    from app.core.cache import tenant_cache
    cache_key = f"tenant:{tenant_id}"
    cached = tenant_cache.get(cache_key)
    if cached is not None:
        return cached

    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise TenantNotFound()
    tenant_cache.set(cache_key, tenant)
    return tenant


def get_current_tenant_id(user: User = Depends(get_current_user)) -> str | None:
    return user.tenant_id


def get_scoped_ticket(db: Db, tenant: Tenant, ticket_id: str) -> Ticket:
    """Fetch a ticket that belongs to the given tenant — otherwise 404.

    Object-level isolation: a caller in tenant A must never resolve a ticket
    owned by tenant B, even when it can guess the id. Mirrors the guidance
    "Does resource belong to tenant?" in §16 of the auth design."""
    ticket = db.get(Ticket, ticket_id)
    if not ticket or ticket.tenant_id != tenant.id:
        raise TicketNotFound()
    return ticket


def require_roles(*roles: str) -> Callable[[User], User]:
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise InsufficientPrivileges()
        return user

    return checker


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Any tenant-admin permission (owner / super_admin), per the authority matrix."""
    from app.core.permissions import ADMIN_ROLES

    if user.role not in ADMIN_ROLES:
        raise InsufficientPrivileges()
    return user


def require_super_admin(user: User = Depends(get_current_user)) -> User:
    from app.core.permissions import SUPER_ADMIN_ROLES

    if user.role not in SUPER_ADMIN_ROLES:
        raise InsufficientPrivileges()
    return user


def require_team(user: User = Depends(get_current_user)) -> User:
    """Any team-facing permission (owner / agent / super_admin)."""
    from app.core.permissions import TEAM_ROLES

    if user.role not in TEAM_ROLES:
        raise InsufficientPrivileges()
    return user


def get_request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)
