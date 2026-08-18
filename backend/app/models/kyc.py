"""KYC Verification tool models.

Flow:
  1. Owner uploads Excel/CSV via /api/kyc/upload  →  KYCDataSource created
  2. Owner creates KYC tool config (quiz_fields, protected_fields, passing_score)
  3. Agent detects user needs protected data → quizzes them against KYCDataSource rows
  4. Fuzzy match answers  →  score ≥ passing_score  →  pass once, access all protected fields
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, Float
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenant import utcnow


class KYCDataSource(Base):
    """Uploaded customer data file (Excel/CSV) for KYC verification."""
    __tablename__ = "kyc_data_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)           # e.g. "Customer Registry Aug 2026"
    filename: Mapped[str] = mapped_column(String(255), nullable=False)       # original filename
    row_count: Mapped[int] = mapped_column(Integer, default=0)               # number of customer records
    columns: Mapped[str] = mapped_column(Text, default="[]")                # JSON array of column headers
    lookup_key: Mapped[str] = mapped_column(String(80), nullable=False)      # column used to identify customer (e.g. "email", "phone", "account_number")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    tenant = relationship("Tenant", foreign_keys=[tenant_id])
    records = relationship("KYCRecord", back_populates="data_source", cascade="all, delete-orphan")


class KYCRecord(Base):
    """A single customer row from an uploaded KYC data source."""
    __tablename__ = "kyc_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    data_source_id: Mapped[str] = mapped_column(String(36), ForeignKey("kyc_data_sources.id"), nullable=False, index=True)
    lookup_value: Mapped[str] = mapped_column(String(255), nullable=False, index=True)  # normalised lookup key value
    data: Mapped[str] = mapped_column(Text, nullable=False)                  # JSON dict of all columns for this row
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    data_source = relationship("KYCDataSource", back_populates="records")


class KYCVerificationSession(Base):
    """Tracks a KYC quiz session for a customer within a ticket.

    Once passed, the agent can reveal any protected field from the linked data source.
    """
    __tablename__ = "kyc_verification_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id: Mapped[str] = mapped_column(String(36), ForeignKey("tickets.id"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)
    tool_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant_custom_tools.id"), nullable=False)
    data_source_id: Mapped[str] = mapped_column(String(36), ForeignKey("kyc_data_sources.id"), nullable=False)
    record_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("kyc_records.id"), nullable=True)  # matched customer record

    # Quiz state
    lookup_value_used: Mapped[str | None] = mapped_column(String(255), nullable=True)  # what the customer provided to look up
    questions_asked: Mapped[str] = mapped_column(Text, default="[]")     # JSON array of {field, question, answer_given, correct}
    score: Mapped[float] = mapped_column(Float, default=0.0)
    total_questions: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    failed: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")   # pending | in_progress | passed | failed

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    data_source = relationship("KYCDataSource")
    record = relationship("KYCRecord")
