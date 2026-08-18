import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.tenant import utcnow


class BackgroundJob(Base):
    """Background tasks & worker executions (§31 Background Jobs Engine).
    
    Tracks pending, processing, completed, and failed tasks with 1-click retries.
    """
    __tablename__ = "background_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(80), nullable=False)  # email_send | rag_ingest | webhook_delivery | sla_check
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending | processing | completed | failed
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON payload
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
