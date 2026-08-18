import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenant import utcnow


class Macro(Base):
    """Saved multi-step action sequence (Chatwoot-style).
    
    Actions JSON array: [{"type": "assign_team|assign_agent|set_status|
    set_label|send_message|add_note|set_priority", "value": str}]
    visibility: 'private' (only creator) | 'shared' (whole team)
    """
    __tablename__ = "macros"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(500), default="")
    actions: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of action steps
    visibility: Mapped[str] = mapped_column(String(20), default="shared")  # private | shared
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])  # noqa: F821
