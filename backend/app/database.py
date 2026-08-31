from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import QueuePool

from app.config import settings


class Base(DeclarativeBase):
    pass


def _clean_database_url(url: str) -> str:
    if not url or url.startswith("sqlite"):
        return url
    from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
    parsed = urlparse(url)
    if parsed.query:
        # Filter out parameters that psycopg2/libpq rejects (e.g. pgbouncer=true from Prisma snippets)
        allowed_params = {"sslmode", "connect_timeout", "application_name", "target_session_attrs", "options"}
        filtered_query = [(k, v) for k, v in parse_qsl(parsed.query) if k.lower() in allowed_params]
        url = urlunparse(parsed._replace(query=urlencode(filtered_query)))
    return url


_is_sqlite = settings.database_url.startswith("sqlite")
_clean_url = _clean_database_url(settings.database_url)

# ── Connection pool (critical for 20K+ concurrent users) ─────────────
engine = create_engine(
    _clean_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    poolclass=None if _is_sqlite else QueuePool,
    **({} if _is_sqlite else {
        "pool_size": 20,
        "max_overflow": 30,
        "pool_timeout": 10,
        "pool_recycle": 240,
        "pool_pre_ping": True,
    }),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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
        ("edited", "BOOLEAN DEFAULT FALSE"),
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
        ("snoozed_until", "DATETIME"),
        ("merged_into_id", "VARCHAR(36)"),
        ("ai_paused", "BOOLEAN DEFAULT 0"),
        # Note: waiting_for_customer and waiting_internal are string values in TicketStatus Enum, no schema migration needed
    ],
    "tenant_custom_tools": [
        ("body_template", "TEXT"),
        ("response_extractor", "VARCHAR(200)"),
        ("execution_count", "INTEGER DEFAULT 0"),
        ("last_executed_at", "DATETIME"),
        ("tool_type", "VARCHAR(30) DEFAULT 'api'"),
        ("config", "TEXT"),
    ],
    "users": [
        ("presence_status", "VARCHAR(20) DEFAULT 'offline'"),
        ("totp_secret", "VARCHAR(64)"),
        ("totp_enabled", "BOOLEAN DEFAULT FALSE"),
        ("sso_provider", "VARCHAR(50)"),
        ("sso_subject", "VARCHAR(255)"),
    ],
}


def _add_missing_columns_pg(pg_engine) -> None:
    """Add missing columns to existing PostgreSQL tables (idempotent)."""
    with pg_engine.connect() as conn:
        for table, columns in _SCHEMA_ADDITIONS.items():
            existing = {
                row[0].lower() for row in conn.execute(
                    text("SELECT column_name FROM information_schema.columns WHERE table_name = :t"),
                    {"t": table.lower()},
                ).fetchall()
            }
            for col, ddl in columns:
                if col.lower() not in existing:
                    pg_ddl = ddl.replace("DATETIME", "TIMESTAMP")
                    try:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {pg_ddl}"))
                        conn.commit()
                    except Exception:
                        pass


def _ensure_indexes() -> None:
    """Create performance indexes that create_all() won't add to existing tables."""
    _INDEXES = [
        "CREATE INDEX IF NOT EXISTS ix_tickets_tenant_updated ON tickets (tenant_id, updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_tickets_tenant_assignee ON tickets (tenant_id, assignee_id)",
        "CREATE INDEX IF NOT EXISTS ix_tickets_tenant_assignee_status ON tickets (tenant_id, assignee_id, status)",
        "CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON users (tenant_id)",
    ]
    with engine.connect() as conn:
        for ddl in _INDEXES:
            try:
                conn.execute(text(ddl))
            except Exception:
                pass  # Index may already exist or table missing
        conn.commit()


def migrate_schema() -> None:
    """Create missing tables + add missing columns so old DBs keep working.

    Idempotent: create_all for new tables, then PRAGMA/ALTER per column.
    For PostgreSQL behind PgBouncer (Neon pooler), DDL must run in
    AUTOCOMMIT mode — PgBouncer transaction-mode pooling cannot hold
    DDL locks across transaction boundaries.
    """
    import app.models  # noqa: F401  (register all models on Base)
    from app.models import ChannelOutbox

    if _is_sqlite:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            for table, columns in _SCHEMA_ADDITIONS.items():
                existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
                for col, ddl in columns:
                    if col not in existing:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
            conn.commit()
        _ensure_indexes()

        try:
            _ensure_default_channels()
            _ensure_memberships()
            _ensure_teams()
            _ensure_audit_logs()
            _backfill_ticket_numbers()
        except Exception:
            pass  # Skip seed-data on fresh DBs (no demo tenants/users yet)
    else:
        # PostgreSQL behind PgBouncer (Neon): create DDL engine with
        # AUTOCOMMIT + no pooling so each DDL statement commits immediately.
        # Check if tables already exist to skip slow create_all on restarts.
        with engine.connect() as check_conn:
            has_tables = check_conn.execute(
                text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenants')")
            ).scalar()
        if not has_tables:
            ddl_engine = create_engine(
                _clean_url,
                poolclass=None,
                isolation_level="AUTOCOMMIT",
                connect_args={"connect_timeout": 15},
            )
            try:
                Base.metadata.create_all(bind=ddl_engine)
            finally:
                ddl_engine.dispose()
        else:
            _add_missing_columns_pg(engine)
        _ensure_indexes()
        try:
            _ensure_default_channels()
            _ensure_memberships()
            _ensure_teams()
            _ensure_audit_logs()
            _backfill_ticket_numbers()
        except Exception:
            pass  # Skip seed-data on fresh DBs (no demo tenants/users yet)


def _backfill_ticket_numbers() -> None:
    """Assign display numbers ({prefix}{YYYYMMDD}{6 unique digits}) to any
    ticket created before the numbering scheme existed. Idempotent — only rows
    with no display_number are touched."""
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


# Default channel rows per tenant (chat / whatsapp / portal / email / telegram /
# sms). Runs idempotently so older DBs gain the new channels after migration.
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
    """Backfill tenant_members rows for existing team users (owner/agent) from
    their users.tenant_id pointer. Idempotent; customers and super admins are
    deliberately skipped (they hold no team membership)."""
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


# Demo routing teams (P4). Idempotent: created once, members/team_id assigned
# only when unset so later hand-tuning is preserved.
DEFAULT_TEAMS = [
    ("t1", "Payments", ["u2", "u3"]),
    ("t1", "Cards & Security", ["u3", "u4"]),
    ("t1", "Escalations", ["u2"]),
]

# ticket id -> team name for the demo dataset (assigned when unset).
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

        # Demo: Amaka works the Escalations/Payments teams → starts in team scope.
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
