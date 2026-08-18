import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.tenant import utcnow


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    desc: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    trigger: Mapped[str] = mapped_column(String(30), nullable=False)  # ticket_created, interval, …
    condition_match: Mapped[str] = mapped_column(String(10), default="all")  # all | any
    conditions: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of {field, op, value}
    actions: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of {type, config}
    interval: Mapped[str] = mapped_column(Text, default="null")  # JSON {unit, value} | null
    order: Mapped[int] = mapped_column(Integer, default=0)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SlaPolicy(Base):
    __tablename__ = "sla_policies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    desc: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    match: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of conditions
    targets: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of {priority, firstResponseMin, resolutionMin}
    schedule_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    escalations: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of SlaEscalation
    breaches: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SlaSchedule(Base):
    __tablename__ = "sla_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    days: Mapped[str] = mapped_column(Text, default="[]")  # JSON int array 0..6 (0=Mon)
    start: Mapped[str] = mapped_column(String(8), default="09:00")
    end: Mapped[str] = mapped_column(String(8), default="17:00")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    prefix: Mapped[str] = mapped_column(String(40), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    scopes: Mapped[str] = mapped_column(Text, default="[]")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ChannelSetting(Base):
    __tablename__ = "channel_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    # chat | whatsapp | portal | email | telegram | sms
    label: Mapped[str] = mapped_column(String(60), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    connected: Mapped[bool] = mapped_column(Boolean, default=False)
    detail: Mapped[str] = mapped_column(String(255), default="")
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Provider credentials (JSON) + connection state for external channels.
    provider_config: Mapped[str] = mapped_column(Text, default="{}")
    provider_status: Mapped[str] = mapped_column(String(20), default="disconnected")
    # disconnected | connecting | connected | error
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    webhook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ChannelOutbox(Base):
    """Outbound send log for provider channels (whatsapp/telegram/sms/email).

    One row per attempted delivery. `status` is sent | failed; real adapters
    store the provider's message id in `external_id`, the simulator just logs.
    """

    __tablename__ = "channel_outbox"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    ticket_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    message_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    target: Mapped[str] = mapped_column(String(255), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="sent")  # sent | failed
    provider: Mapped[str] = mapped_column(String(30), default="simulator")
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    desc: Mapped[str] = mapped_column(String(255), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    scope: Mapped[str] = mapped_column(String(20), default="platform")


class PresetVersion(Base):
    __tablename__ = "preset_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    rules: Mapped[str] = mapped_column(Text, default="[]")  # JSON snapshot of escalation rules
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str] = mapped_column(String(60), default="super_admin")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(Text, default="{}")
    push: Mapped[str] = mapped_column(Text, default="{}")
    quiet_hours: Mapped[str] = mapped_column(Text, default='{"enabled": false, "start": "22:00", "end": "08:00"}')


class VoiceRequest(Base):
    __tablename__ = "voice_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    ticket_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="requested")  # requested | scheduled | calling | completed
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class BusinessHours(Base):
    """Per-tenant business hours configuration.
    schedule JSON: {"mon": {"enabled": true, "open": "09:00", "close": "17:00"}, ...}
    """
    __tablename__ = "business_hours"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, unique=True)
    timezone: Mapped[str] = mapped_column(String(60), default="Africa/Lagos")
    schedule: Mapped[str] = mapped_column(Text, default='{"mon":{"enabled":true,"open":"09:00","close":"17:00"},"tue":{"enabled":true,"open":"09:00","close":"17:00"},"wed":{"enabled":true,"open":"09:00","close":"17:00"},"thu":{"enabled":true,"open":"09:00","close":"17:00"},"fri":{"enabled":true,"open":"09:00","close":"17:00"},"sat":{"enabled":false,"open":"10:00","close":"14:00"},"sun":{"enabled":false,"open":"10:00","close":"14:00"}}')
    out_of_hours_message: Mapped[str] = mapped_column(String(500), default="We're currently closed. Leave a message and we'll get back to you.")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AiUsageLog(Base):
    __tablename__ = "ai_usage_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    ticket_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    model: Mapped[str] = mapped_column(String(60), default="")
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DeletionRequest(Base):
    __tablename__ = "deletion_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | completed | rejected
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AiAutonomySetting(Base):
    """Per-tool AI Autonomy controls (§17 AI Autonomy Controls).
    
    Configures whether sensitive tools run fully autonomously or require human approval.
    autonomy_level: 'autonomous' | 'requires_approval' | 'disabled'
    """
    __tablename__ = "ai_autonomy_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    tool_name: Mapped[str] = mapped_column(String(80), nullable=False)
    autonomy_level: Mapped[str] = mapped_column(String(30), default="autonomous")
    min_confidence: Mapped[int] = mapped_column(Integer, default=75)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

