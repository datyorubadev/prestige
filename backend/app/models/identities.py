import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenant import utcnow


class CustomerIdentity(Base):
    """Cross-channel customer identity link (§11 identity resolution).
    
    Links channel-specific external IDs (WhatsApp phone, Instagram handle, Email, etc.)
    to a single unified Customer record per tenant.
    """
    __tablename__ = "customer_identities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id: Mapped[str] = mapped_column(String(36), ForeignKey("customers.id"), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(30), nullable=False)  # email | whatsapp | instagram | facebook | sms | widget
    external_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)  # phone number, handle, email
    details: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    customer: Mapped["Customer"] = relationship(back_populates="identities_list")  # noqa: F821
