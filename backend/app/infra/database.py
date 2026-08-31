"""Database abstraction layer.

Supports:
  - Single PostgreSQL (dev/staging)
  - Read replicas (production scale)
  - PgBouncer session pooling (connection multiplexing)
  - SQLite (local dev fallback)

Env vars:
  DATABASE_URL          Primary connection (required)
  DATABASE_READ_URL     Read replica (optional — falls back to primary)
  DB_POOL_SIZE          Primary pool size (default: 20)
  DB_MAX_OVERFLOW       Burst capacity (default: 30)
  DB_POOL_TIMEOUT       Seconds before connection timeout (default: 10)
  DB_POOL_RECYCLE       Seconds before connection recycle (default: 240)
  DB_PGBOUNCER          Set to "true" when using PgBouncer (uses statement pooling)
"""

from __future__ import annotations

import logging
import os
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool, QueuePool

from app.config import settings

logger = logging.getLogger("prestige.database")


class Base(DeclarativeBase):
    pass


def _build_engine(url: str, *, is_read: bool = False) -> Engine:
    """Create a SQLAlchemy engine with pool settings appropriate for the role.

    - SQLite: no pool (single-writer), just check_same_thread.
    - PostgreSQL with PgBouncer: NullPool (PgBouncer manages connections).
    - PostgreSQL direct: QueuePool with configurable limits.
    """
    is_sqlite = url.startswith("sqlite")

    if is_sqlite:
        return create_engine(url, connect_args={"check_same_thread": False})

    pgbouncer = os.getenv("DB_PGBOUNCER", "").lower() == "true"

    if pgbouncer:
        # PgBouncer in session/statement mode manages its own pool.
        # Using NullPool avoids SQLAlchemy fighting with PgBouncer for connections.
        return create_engine(
            url,
            poolclass=NullPool,
            pool_pre_ping=True,
        )

    pool_size = int(os.getenv("DB_POOL_SIZE", "20"))
    max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "30"))
    pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", "10"))
    pool_recycle = int(os.getenv("DB_POOL_RECYCLE", "240"))

    # Read replicas get a larger pool (more concurrent SELECT queries)
    if is_read:
        pool_size = int(os.getenv("DB_READ_POOL_SIZE", str(pool_size * 2)))
        max_overflow = int(os.getenv("DB_READ_MAX_OVERFLOW", str(max_overflow * 2)))

    return create_engine(
        url,
        poolclass=QueuePool,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        pool_recycle=pool_recycle,
        pool_pre_ping=True,
    )


# ── Primary engine (reads + writes) ────────────────────────────────
engine = _build_engine(settings.database_url)

# ── Read replica (optional — falls back to primary when not configured) ─
_read_url = os.getenv("DATABASE_READ_URL", "")
read_engine = _build_engine(_read_url or settings.database_url, is_read=True) if _read_url else engine

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
ReadSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=read_engine)


def get_db() -> Generator[Session, None, None]:
    """Primary database session (writes + reads). Used by FastAPI dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_read_db() -> Generator[Session, None, None]:
    """Read-only session routed to replica when available.

    Use for dashboard queries, analytics, and list views that don't need
    read-after-write consistency.
    """
    db = ReadSessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_read_session() -> Session:
    """Return a read session (caller must close). For non-FastAPI contexts."""
    return ReadSessionLocal()


# ── Schema migration (existing logic preserved) ────────────────────
# Column additions applied to already-seeded databases (SQLite has no native
# ALTER-IF-MISSING). Each entry is (table, column, DDL type with default).
_SCHEMA_ADDITIONS: dict[str, list[tuple[str, str]]] = {
    "audit_logs": [
        ("ip_address", "VARCHAR(45)"),
        ("device", "VARCHAR(255)"),
        ("result", "VARCHAR(20) DEFAULT 'ok'"),
        ("actor_type", "VARCHAR(20) DEFAULT 'human'"),
        ("target_user_id", "VARCHAR(36)"),
        ("before_state", "TEXT"),
        ("after_state", "TEXT"),
        ("user_agent", "VARCHAR(255)"),
        ("request_id", "VARCHAR(60)"),
    ],
    "channel_settings": [
        ("provider_config", "TEXT DEFAULT '{}'"),
        ("provider_status", "VARCHAR(20) DEFAULT 'disconnected'"),
        ("last_error", "VARCHAR(500)"),
        ("webhook_url", "VARCHAR(500)"),
    ],
    "customers": [
        ("identities", "TEXT DEFAULT '{}'"),
        ("notes", "TEXT"),
        ("tags", "TEXT DEFAULT '[]'"),
        ("is_active", "BOOLEAN DEFAULT TRUE"),
        ("company", "VARCHAR(255)"),
        ("location", "VARCHAR(255)"),
        ("updated_at", "DATETIME"),
    ],
    "faqs": [
        ("tenant_id", "VARCHAR(36)"),
    ],
    "kb_articles": [
        ("created_by", "VARCHAR(36)"),
        ("updated_by", "VARCHAR(36)"),
        ("reviewed_by", "VARCHAR(36)"),
        ("submitted_at", "DATETIME"),
        ("published_at", "DATETIME"),
        ("reject_note", "VARCHAR(500)"),
        ("views", "INTEGER DEFAULT 0"),
        ("helpful_count", "INTEGER DEFAULT 0"),
        ("unhelpful_count", "INTEGER DEFAULT 0"),
        ("updated_at", "DATETIME"),
    ],
    "knowledge_sources": [
        ("created_by", "VARCHAR(36)"),
        ("updated_by", "VARCHAR(36)"),
        ("visibility", "VARCHAR(20) DEFAULT 'internal'"),
    ],
    "messages": [
        ("attachments", "TEXT"),
    ],
    "tenants": [
        ("ai_enabled", "BOOLEAN DEFAULT TRUE"),
        ("ai_tokens_used", "INTEGER DEFAULT 0"),
        ("ai_tokens_limit", "INTEGER DEFAULT 1000000"),
        ("ai_system_prompt", "TEXT"),
        ("timezone", "VARCHAR(64) DEFAULT 'Africa/Lagos'"),
        ("display_image", "VARCHAR(500)"),
    ],
    "tickets": [
        ("team_id", "VARCHAR(36)"),
        ("csat_comment", "VARCHAR(500)"),
        ("display_number", "VARCHAR(32)"),
        ("ai_paused", "BOOLEAN DEFAULT 0"),
    ],
    "tenant_custom_tools": [
        ("body_template", "TEXT"),
        ("response_extractor", "VARCHAR(200)"),
        ("execution_count", "INTEGER DEFAULT 0"),
        ("last_executed_at", "DATETIME"),
    ],
}


def migrate_schema() -> None:
    """Create missing tables + add missing columns so old DBs keep working."""
    import app.models  # noqa: F401
    from app.models import ChannelOutbox

    Base.metadata.create_all(bind=engine)

    if not settings.database_url.startswith("sqlite"):
        return

    with engine.connect() as conn:
        for table, columns in _SCHEMA_ADDITIONS.items():
            existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
            for col, ddl in columns:
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
        conn.commit()

    _ensure_default_channels()
    _ensure_memberships()
    _ensure_teams()
    _ensure_audit_logs()
    _backfill_ticket_numbers()


def _backfill_ticket_numbers() -> None:
    from app.models import Ticket
    from app.services.serializers import generate_ticket_number

    with SessionLocal() as db:
        tickets = (
            db.query(Ticket)
            .filter(Ticket.display_number.is_(None))
            .order_by(Ticket.created_at.asc())
            .all()
        )
        used: set[str] = set()
        for ticket in tickets:
            tenant = ticket.tenant
            if tenant is None:
                continue
            number = generate_ticket_number(db, tenant, ticket.created_at, used)
            ticket.display_number = number
            used.add(number)
        if tickets:
            db.commit()


_DEFAULT_CHANNELS = [
    ("chat", "Website chat", "Embeddable widget on your site"),
    ("whatsapp", "WhatsApp", "Meta Business API"),
    ("portal", "Support portal", "Self-serve help center + tickets"),
    ("email", "Email", "Forward to a shared inbox"),
    ("telegram", "Telegram", "Telegram Bot API"),
    ("sms", "SMS", "Twilio Programmable SMS"),
]


def _ensure_default_channels() -> None:
    from app.models import ChannelSetting, Tenant

    with SessionLocal() as db:
        for tenant in db.query(Tenant).all():
            existing = {c.channel for c in db.query(ChannelSetting).filter(
                ChannelSetting.tenant_id == tenant.id).all()}
            for key, label, detail in _DEFAULT_CHANNELS:
                if key not in existing:
                    db.add(ChannelSetting(
                        tenant_id=tenant.id, channel=key, label=label,
                        enabled=True, connected=False, detail=detail,
                        provider_status="disconnected"))
        db.commit()


def _ensure_memberships() -> None:
    from app.models import TenantMember, User

    with SessionLocal() as db:
        users = (
            db.query(User)
            .filter(User.role.in_(("owner", "agent")), User.tenant_id.is_not(None))
            .all()
        )
        for user in users:
            existing = (
                db.query(TenantMember)
                .filter(
                    TenantMember.user_id == user.id,
                    TenantMember.tenant_id == user.tenant_id,
                )
                .first()
            )
            if not existing:
                db.add(TenantMember(
                    tenant_id=user.tenant_id, user_id=user.id,
                    role=user.role, status="active", inbox_scope="all",
                ))
        db.commit()


DEFAULT_TEAMS = [
    ("t1", "Payments", ["u2", "u3"]),
    ("t1", "Cards & Security", ["u3", "u4"]),
    ("t1", "Escalations", ["u2"]),
]

TICKET_TEAM_HINT = {
    "TK-1042": "Escalations",
    "TK-1041": "Payments",
    "TK-1037": "Payments",
    "TK-1033": "Cards & Security",
    "TK-1030": "Payments",
}


def _ensure_teams() -> None:
    from app.models import Team, TenantMember, Ticket, User

    with SessionLocal() as db:
        for tenant_id, name, member_ids in DEFAULT_TEAMS:
            team = (
                db.query(Team).filter(Team.tenant_id == tenant_id, Team.name == name).first()
            )
            if not team:
                team = Team(tenant_id=tenant_id, name=name)
                db.add(team)
                db.flush()
            for uid in member_ids:
                member = db.get(User, uid)
                if member and member not in team.members:
                    team.members.append(member)
        db.commit()

        team_by_name = {(t.tenant_id, t.name): t for t in db.query(Team).all()}
        for ticket_id, team_name in TICKET_TEAM_HINT.items():
            ticket = db.get(Ticket, ticket_id)
            if ticket and not ticket.team_id:
                team = team_by_name.get((ticket.tenant_id, team_name))
                if team:
                    ticket.team_id = team.id
        db.commit()

        amaka = (
            db.query(TenantMember)
            .filter(TenantMember.user_id == "u2", TenantMember.tenant_id == "t1")
            .first()
        )
        if amaka and amaka.inbox_scope == "all":
            amaka.inbox_scope = "team"
            db.commit()


def _ensure_audit_logs() -> None:
    from app.models import AuditLog, Tenant, User
    from app.models.tenant import utcnow

    with SessionLocal() as db:
        count = db.query(AuditLog).count()
        if count < 5:
            tenant = db.query(Tenant).filter(Tenant.status == "active").first() or db.query(Tenant).first()
            tenant_id = tenant.id if tenant else "t1"
            superadmin = db.query(User).filter(User.role == "super_admin").first()
            owner = db.query(User).filter(User.role == "owner").first()

            INITIAL_LOGS = [
                (tenant_id, superadmin.id if superadmin else "u1", "platform_init", "system", "Prestige multi-tenant security kernel initialized", "127.0.0.1", "macOS · Chrome 124", "ok"),
                (tenant_id, owner.id if owner else "u2", "create_tenant", "tenant", f"Provisioned tenant workspace ({tenant.business_name if tenant else 'NairaWave'})", "102.89.23.11", "Windows 11 · Edge 122", "ok"),
                (tenant_id, owner.id if owner else "u2", "update_settings", "settings", "Configured SLA thresholds: First response < 15m, Resolution < 4h", "102.89.23.11", "Windows 11 · Edge 122", "ok"),
                (tenant_id, owner.id if owner else "u2", "create_custom_tool", "custom_tool", "Installed pre-configured Fintech Transaction Status tool", "102.89.23.11", "Windows 11 · Edge 122", "ok"),
                (tenant_id, superadmin.id if superadmin else "u1", "security_audit", "auth", "System security baseline and session token rotation verified", "197.210.55.82", "Linux · Firefox 125", "ok"),
                (tenant_id, owner.id if owner else "u2", "knowledge_ingest", "kb", "Live crawled and embedded knowledge base documentation", "102.89.23.11", "Windows 11 · Edge 122", "ok"),
            ]
            for tid, uid, action, etype, detail, ip, dev, res in INITIAL_LOGS:
                db.add(AuditLog(
                    tenant_id=tid,
                    user_id=uid,
                    action=action,
                    entity_type=etype,
                    entity_id=tid,
                    detail=detail,
                    ip_address=ip,
                    device=dev,
                    result=res,
                    created_at=utcnow(),
                ))
            db.commit()
