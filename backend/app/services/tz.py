"""Tenant-timezone helpers.

All timestamps are STORED as naive UTC (project convention). These helpers
convert to the tenant's IANA zone for every user-facing RENDER — CSV/PDF
exports, invoice dates, and anywhere the backend prints an absolute time.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.models.tenant import utcnow

_DEFAULT_TZ = "Africa/Lagos"


def tenant_zone(tenant) -> ZoneInfo:
    name = getattr(tenant, "timezone", None) or _DEFAULT_TZ
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo(_DEFAULT_TZ)


def now_in(tenant) -> datetime:
    """Current wall-clock time in the tenant's zone."""
    return datetime.now(tenant_zone(tenant))


def fmt_in_tz(dt: datetime | None, fmt: str, tenant, default: str = "") -> str:
    """Format a stored UTC-naive datetime in the tenant's zone."""
    if not dt:
        return default
    zone = tenant_zone(tenant)
    aware = dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(zone)
    return aware.strftime(fmt)


def iso_in_tz(dt: datetime | None, tenant) -> str | None:
    if not dt:
        return None
    return dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(tenant_zone(tenant)).isoformat()
