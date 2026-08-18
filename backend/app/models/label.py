import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenant import utcnow


class TicketLabelLink(Base):
    """Many-to-many link table between tickets and the per-tenant label
    library (Chatwoot-style). Both sides use string UUIDs so the row is
    addressable even before the FK objects are flushed."""

    __tablename__ = "ticket_labels"

    ticket_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True
    )
    label_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Label(Base):
    """Per-tenant label library. Tickets reference labels by name through the
    association table; colors are stored here so chips render consistently
    across the queue, the workspace and the filter (Chatwoot parity)."""

    __tablename__ = "labels"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_label_tenant_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#2563eb")
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    tickets: Mapped[list["Ticket"]] = relationship(  # noqa: F821
        secondary="ticket_labels", back_populates="labels",
    )
