import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenant import utcnow


class TenantCustomTool(Base):
    """Tenant-defined dynamic AI tool / action.

    tool_type discriminates between:
      - "api"           : HTTP REST API call (existing behavior)
      - "kyc"           : KYC verification gate (quiz customer, reveal protected fields)
      - "doc_verify"    : Document verification (customer uploads proof, AI validates)
      - "callback"      : Callback/booking scheduler (customer picks time, tool books it)

    config (JSONB) stores type-specific settings:
      api:            { headers, bodyTemplate, responseExtractor }
      kyc:            { dataSourceId, quizFields, protectedFields, passingScore, totalQuestions, referralMessage }
      doc_verify:     { acceptedTypes, matchFields, verificationMessage, failureMessage }
      callback:       { availableSlots, serviceTypes, agents, bufferMinutes, confirmationTemplate }
    """
    __tablename__ = "tenant_custom_tools"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    tool_type: Mapped[str] = mapped_column(String(30), default="api")  # api | kyc | doc_verify | callback
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(40), default="custom")
    config: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSONB — type-specific settings

    # HTTP API fields (only used when tool_type = "api")
    method: Mapped[str] = mapped_column(String(10), default="GET")
    url_template: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    headers: Mapped[str] = mapped_column(Text, default="{}")
    parameters_schema: Mapped[str] = mapped_column(Text, default="[]")
    body_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_extractor: Mapped[str | None] = mapped_column(String(200), nullable=True)

    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    execution_count: Mapped[int] = mapped_column(Integer, default=0)
    last_executed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    tenant: Mapped["Tenant"] = relationship("Tenant", foreign_keys=[tenant_id])  # noqa: F821
