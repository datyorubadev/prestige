import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.common import TicketPriority, TicketStatus, TicketType
from app.models.tenant import utcnow


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        Index("ix_tickets_tenant_id", "tenant_id"),
        Index("ix_tickets_tenant_status", "tenant_id", "status"),
        Index("ix_tickets_tenant_created", "tenant_id", "created_at"),
        Index("ix_tickets_tenant_updated", "tenant_id", "updated_at"),
        Index("ix_tickets_tenant_assignee", "tenant_id", "assignee_id"),
        Index("ix_tickets_tenant_assignee_status", "tenant_id", "assignee_id", "status"),
        Index("ix_tickets_customer_id", "customer_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)
    assignee_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    team_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("teams.id"), nullable=True, index=True)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Display number: {3-letter tenant prefix}{YYYY}{MM}{DD}{6 unique digits},
    # e.g. NAI20260814786523. Unique per tenant, assigned at creation/backfill.
    display_number: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)

    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    channel: Mapped[str] = mapped_column(String(50), default="widget")
    status: Mapped[TicketStatus] = mapped_column(String(20), default=TicketStatus.OPEN)
    priority: Mapped[TicketPriority] = mapped_column(String(20), default=TicketPriority.LOW)
    ticket_type: Mapped[TicketType] = mapped_column(String(20), default=TicketType.UNCLASSIFIED)
    sentiment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unread: Mapped[bool] = mapped_column(Boolean, default=True)
    sla_seconds_left: Mapped[int | None] = mapped_column(default=3600)

    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_sentiment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    csat_rating: Mapped[int | None] = mapped_column(nullable=True)
    csat_comment: Mapped[str | None] = mapped_column(String(500), nullable=True)

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    tenant: Mapped["Tenant"] = relationship(back_populates="tickets")  # noqa: F821
    customer: Mapped["Customer | None"] = relationship(back_populates="tickets")  # noqa: F821
    assignee: Mapped["User | None"] = relationship(foreign_keys=[assignee_id])  # noqa: F821
    team: Mapped["Team | None"] = relationship(foreign_keys=[team_id])  # noqa: F821
    messages: Mapped[list["Message"]] = relationship(  # noqa: F821
        back_populates="ticket", cascade="all, delete-orphan",
        order_by="Message.timestamp",
    )
    labels: Mapped[list["Label"]] = relationship(  # noqa: F821
        secondary="ticket_labels", back_populates="tickets",
    )
