"""Callback / Booking Scheduler tool models.

Flow:
  1. Owner creates callback tool with available_slots, service_types, buffer_minutes
  2. Customer says "I want to book a callback" / "schedule a meeting"
  3. Agent calls callback tool → fetches available slots → presents options
  4. Customer picks a slot → agent books it → confirmation shown
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenant import utcnow


class CallbackSlot(Base):
    """A configurable available time slot for callbacks.

    config stored in TenantCustomTool.config JSON:
    {
        "available_slots": [
            {"day": "monday", "start": "09:00", "end": "17:00"},
            {"day": "tuesday", "start": "09:00", "end": "17:00"}
        ],
        "service_types": ["general_inquiry", "technical_support", "billing"],
        "buffer_minutes": 15,
        "agents": ["Agent A", "Agent B"],
        "timezone": "Africa/Lagos",
        "confirmation_message": "Your callback is confirmed for {date} at {time}. We'll call you at {phone}.",
        "max_advance_days": 14,
        "min_advance_hours": 2
    }
    """
    __tablename__ = "callback_slots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tool_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant_custom_tools.id"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    day_of_week: Mapped[str] = mapped_column(String(15), nullable=False)    # monday, tuesday, etc.
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)      # "09:00"
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)        # "17:00"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    tool = relationship("TenantCustomTool")
    bookings = relationship("CallbackBooking", back_populates="slot", cascade="all, delete-orphan")


class CallbackBooking(Base):
    """A booked callback appointment."""
    __tablename__ = "callback_bookings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tool_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant_custom_tools.id"), nullable=False, index=True)
    slot_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("callback_slots.id"), nullable=True)
    ticket_id: Mapped[str] = mapped_column(String(36), ForeignKey("tickets.id"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)

    customer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(50), nullable=False)
    service_type: Mapped[str] = mapped_column(String(80), default="general_inquiry")
    scheduled_date: Mapped[str] = mapped_column(String(10), nullable=False)   # "2026-08-20"
    scheduled_time: Mapped[str] = mapped_column(String(5), nullable=False)    # "10:00"
    assigned_agent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="confirmed")     # confirmed | completed | cancelled | no_show
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    slot = relationship("CallbackSlot", back_populates="bookings")
