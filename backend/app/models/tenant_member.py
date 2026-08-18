import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenant import utcnow


class TenantMember(Base):
    """Authoritative record of *which tenants a user belongs to* and their role
    inside each one (owner / agent), plus per-tenant inbox scope (P4).

    `users.tenant_id` is the *active* tenant pointer (the workspace currently
    open in the session) and must always correspond to one of these rows for
    team users. Super admins have no membership rows — they reach tenant data
    only via the audited impersonation flow. Customers are not team members and
    have no rows here (their home tenant lives on the users row).
    """

    __tablename__ = "tenant_members"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", name="uq_tenant_member"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="agent")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    inbox_scope: Mapped[str] = mapped_column(String(20), nullable=False, default="all")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    tenant: Mapped["Tenant"] = relationship("Tenant")  # noqa: F821
    user: Mapped["User"] = relationship("User")  # noqa: F821
