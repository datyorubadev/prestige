import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.common import TenantStatus


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    business_name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    city: Mapped[str] = mapped_column(String(120), default="Lagos")

    status: Mapped[TenantStatus] = mapped_column(String(20), default=TenantStatus.PENDING)
    plan_code: Mapped[str] = mapped_column(String(20), default="starter")

    # Brand & widget settings (owner-managed, §5.15)
    bot_name: Mapped[str] = mapped_column(String(100), default="AI Assistant")
    brand_tone: Mapped[str] = mapped_column(String(50), default="professional")
    ai_system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_color: Mapped[str] = mapped_column(String(7), default="#00a86b")
    secondary_color: Mapped[str] = mapped_column(String(7), default="#2563eb")
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    display_image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    welcome_message: Mapped[str] = mapped_column(String(500), default="Hi there! How can we help you today?")
    widget_launcher_text: Mapped[str] = mapped_column(String(40), default="Chat with us")
    widget_position: Mapped[str] = mapped_column(String(20), default="bottom-right")
    proactive_teaser: Mapped[str] = mapped_column(String(200), default="")
    mobile_fullscreen: Mapped[bool] = mapped_column(Boolean, default=True)
    escalation_message: Mapped[str] = mapped_column(
        String(300), default="You're now chatting with a human agent."
    )

    # Quota tracking (usage accounting, addition B)
    max_agents: Mapped[int] = mapped_column(Integer, default=1)
    max_customers: Mapped[int] = mapped_column(Integer, default=500)
    kb_quota_mb: Mapped[int] = mapped_column(Integer, default=2048)
    kb_used_mb: Mapped[int] = mapped_column(Integer, default=0)

    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    # AI usage tracking (addition for production scale)
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    ai_tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    ai_tokens_limit: Mapped[int] = mapped_column(Integer, default=1_000_000)

    users: Mapped[list["User"]] = relationship(back_populates="tenant")  # noqa: F821
    customers: Mapped[list["Customer"]] = relationship(back_populates="tenant")  # noqa: F821
    knowledge_sources: Mapped[list["KnowledgeSource"]] = relationship(back_populates="tenant")  # noqa: F821
    tickets: Mapped[list["Ticket"]] = relationship(back_populates="tenant")  # noqa: F821
    articles: Mapped[list["KbArticle"]] = relationship(back_populates="tenant")  # noqa: F821
    canned: Mapped[list["CannedResponse"]] = relationship(back_populates="tenant")  # noqa: F821
    escalation_rules: Mapped[list["EscalationRule"]] = relationship(back_populates="tenant")  # noqa: F821
