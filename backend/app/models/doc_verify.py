"""Document Verification tool models.

Flow:
  1. Owner creates doc_verify tool with accepted_types, match_fields config
  2. Customer says "I want to verify my identity" / provides a document
  3. Agent asks customer to upload or provide document details
  4. Agent calls doc_verify tool with document data  →  match_fields checked  →  pass/fail
  5. If passed, agent can proceed with the request; if failed, referral message shown
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, Float
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenant import utcnow


class DocVerifyTemplate(Base):
    """Owner-configured document verification template.

    config stored in TenantCustomTool.config JSON:
    {
        "accepted_types": ["national_id", "passport", "drivers_license"],
        "match_fields": {
            "national_id": ["full_name", "date_of_birth"],
            "passport": ["full_name", "nationality", "expiry_date"],
            "drivers_license": ["full_name", "date_of_birth", "license_class"]
        },
        "verification_message": "Your identity has been verified successfully.",
        "failure_message": "I couldn't verify your identity. Please visit our office with a valid ID."
    }
    """
    __tablename__ = "doc_verify_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tool_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant_custom_tools.id"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    accepted_types: Mapped[str] = mapped_column(Text, default="[]")       # JSON array of doc type slugs
    match_fields: Mapped[str] = mapped_column(Text, default="{}")        # JSON { doc_type: [field_name, ...] }
    verification_message: Mapped[str] = mapped_column(Text, default="Your identity has been verified successfully.")
    failure_message: Mapped[str] = mapped_column(Text, default="I couldn't verify your identity. Please visit our office with a valid ID.")
    requires_manual_review: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    tool = relationship("TenantCustomTool")
    records = relationship("DocVerifyRecord", back_populates="template", cascade="all, delete-orphan")


class DocVerifyRecord(Base):
    """A single document verification attempt."""
    __tablename__ = "doc_verify_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id: Mapped[str] = mapped_column(String(36), ForeignKey("doc_verify_templates.id"), nullable=False, index=True)
    ticket_id: Mapped[str] = mapped_column(String(36), ForeignKey("tickets.id"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)

    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)         # e.g. "national_id", "passport"
    provided_fields: Mapped[str] = mapped_column(Text, default="{}")          # JSON of fields the customer provided
    match_results: Mapped[str] = mapped_column(Text, default="{}")            # JSON { field_name: { expected, provided, matched } }
    score: Mapped[float] = mapped_column(Float, default=0.0)                  # 0.0 - 1.0
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")        # pending | passed | failed | manual_review

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    template = relationship("DocVerifyTemplate", back_populates="records")
