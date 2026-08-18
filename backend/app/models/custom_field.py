import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.tenant import utcnow


class CustomFieldDefinition(Base):
    """Tenant-level field schema definition.
    field_type: text | number | date | dropdown | checkbox | url | email
    applies_to: ticket | customer
    """
    __tablename__ = "custom_field_definitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key: Mapped[str] = mapped_column(String(80), nullable=False)  # snake_case slug
    field_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")
    options: Mapped[str] = mapped_column(Text, default="[]")  # JSON for dropdown choices
    applies_to: Mapped[str] = mapped_column(String(20), default="ticket")  # ticket | customer
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CustomFieldValue(Base):
    """Stored value for a specific field on a specific entity."""
    __tablename__ = "custom_field_values"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    field_def_id: Mapped[str] = mapped_column(String(36), ForeignKey("custom_field_definitions.id"), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)  # ticket | customer
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
