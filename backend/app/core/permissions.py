"""Granular role-based permission layer (§5 authority model).

Each route declares the permission it needs via `Depends(require_perm(...))`.
`ROLE_PERMISSIONS` is the single source of truth for what each role may do;
the coarse helpers in api/deps.py (`require_admin`, `require_team`) are derived
from it so there is exactly one table to audit.

Matrix (platform-wide values):
  resource         | super_admin | owner | agent | customer
  dashboard.view   |     X       |   X   |   X   |    —
  tickets.view     |     X       |   X   |   X   |   own only
  tickets.manage   |     X       |   X   |   X   |    —
  customers.view   |     X       |   X   |   X   |    —
  billing.view     |     X       |   X   |   —   |    —
  channels.manage  |     X       |   X   |   —   |    —
  team.view        |     X       |   X   |   X   |    —   (roster/@mentions)
  team.manage      |     X       |   X   |   —   |    —
  ai.configure     |     X       |   X   |   —   |    —
  kb.view          |     X       |   X   |   X   |    —
  kb.manage        |     X       |   X   |   —   |    —
  automations.manage|    X       |   X   |   —   |    —
  sla.manage       |     X       |   X   |   —   |    —
  labels.manage    |     X       |   X   |   X   |    —
  webhooks.manage  |     X       |   X   |   —   |    —
  api_keys.manage  |     X       |   X   |   —   |    —
  platform.admin   |     X       |   —   |   —   |    —

Tenant scope is enforced separately by get_tenant(); this layer answers only
"is this role allowed to perform this action at all". Super admin reaches
tenant data exclusively via the audited impersonation flow.
"""

from typing import Callable

from fastapi import Depends

from app.api.deps import get_current_user
from app.core.errors import InsufficientPrivileges
from app.models import User

# ---- permission identifiers ----
DASHBOARD_VIEW = "dashboard.view"
TICKETS_VIEW = "tickets.view"
TICKETS_MANAGE = "tickets.manage"
CUSTOMERS_VIEW = "customers.view"
BILLING_VIEW = "billing.view"
CHANNELS_MANAGE = "channels.manage"
TEAM_VIEW = "team.view"
TEAM_MANAGE = "team.manage"
AI_CONFIGURE = "ai.configure"
KB_VIEW = "kb.view"
KB_MANAGE = "kb.manage"
AUTOMATIONS_MANAGE = "automations.manage"
SLA_MANAGE = "sla.manage"
LABELS_MANAGE = "labels.manage"
WEBHOOKS_MANAGE = "webhooks.manage"
API_KEYS_MANAGE = "api_keys.manage"
PLATFORM_ADMIN = "platform.admin"
CUSTOMERS_MANAGE = "customers.manage"
KNOWLEDGE_PUBLISH = "knowledge.publish"
ANALYTICS_VIEW = "analytics.view"
AI_USE = "ai.use"
AI_MANAGE = "ai.manage"
BILLING_MANAGE = "billing.manage"
AGENTS_INVITE = "agents.invite"
AGENTS_REMOVE = "agents.remove"
MACROS_USE = "macros.use"
MACROS_MANAGE = "macros.manage"
REPORTS_VIEW = "reports.view"
CUSTOM_FIELDS_MANAGE = "custom_fields.manage"
CONVERSATIONS_VIEW = "conversations.view"
CONVERSATIONS_REPLY = "conversations.reply"

_ALL = {
    DASHBOARD_VIEW, TICKETS_VIEW, TICKETS_MANAGE, CUSTOMERS_VIEW, BILLING_VIEW,
    CHANNELS_MANAGE, TEAM_VIEW, TEAM_MANAGE, AI_CONFIGURE, KB_VIEW, KB_MANAGE,
    AUTOMATIONS_MANAGE, SLA_MANAGE, LABELS_MANAGE, WEBHOOKS_MANAGE, API_KEYS_MANAGE,
    PLATFORM_ADMIN, CUSTOMERS_MANAGE, KNOWLEDGE_PUBLISH, ANALYTICS_VIEW, AI_USE,
    AI_MANAGE, BILLING_MANAGE, AGENTS_INVITE, AGENTS_REMOVE, MACROS_USE, MACROS_MANAGE,
    REPORTS_VIEW, CUSTOM_FIELDS_MANAGE, CONVERSATIONS_VIEW, CONVERSATIONS_REPLY,
}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "super_admin": _ALL,
    "owner": _ALL - {PLATFORM_ADMIN},
    "agent": {
        DASHBOARD_VIEW, TICKETS_VIEW, TICKETS_MANAGE, CUSTOMERS_VIEW,
        TEAM_VIEW, KB_VIEW, LABELS_MANAGE, AI_USE, MACROS_USE, REPORTS_VIEW,
        CONVERSATIONS_VIEW, CONVERSATIONS_REPLY, ANALYTICS_VIEW,
    },
    "customer": {AI_USE},
}

# Role buckets for the legacy coarse guards — derived from the matrix so the
# role→permission table stays the single source of truth. Each discriminator
# permission is held by exactly the intended bucket.
ADMIN_ROLES = frozenset(r for r, perms in ROLE_PERMISSIONS.items() if BILLING_VIEW in perms)
TEAM_ROLES = frozenset(r for r, perms in ROLE_PERMISSIONS.items() if TICKETS_VIEW in perms)
SUPER_ADMIN_ROLES = frozenset(r for r, perms in ROLE_PERMISSIONS.items() if PLATFORM_ADMIN in perms)


def permissions_for(role: str) -> set[str]:
    return ROLE_PERMISSIONS.get(role, set())


def has_perm(user: User, perm: str) -> bool:
    return perm in permissions_for(user.role)


def require_perm(perm: str) -> Callable[[User], User]:
    """Dependency factory: allow only roles holding `perm`."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if not has_perm(user, perm):
            raise InsufficientPrivileges()
        return user

    return checker
