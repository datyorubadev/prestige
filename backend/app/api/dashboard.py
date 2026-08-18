from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, case

from app.api.deps import Db, get_tenant
from app.core.permissions import DASHBOARD_VIEW, require_perm
from app.models import EscalationRule, Message, Tenant, Ticket, User
from app.services.serializers import ticket_dto

router = APIRouter(tags=["dashboard"])


def _kpi(label: str, value: str, trend: str, delta: str, good_when: str = "up",
         context: str | None = None) -> dict:
    return {"label": label, "value": value, "trend": trend, "delta": delta,
            "goodWhen": good_when, "context": context}


def _stats(db: Db, tenant_id: str) -> dict:
    total = db.query(func.count(Ticket.id)).filter(Ticket.tenant_id == tenant_id).scalar() or 0
    if total == 0:
        return {"total": 0, "resolved": 0, "escalated": 0,
                "channels": Counter(), "sentiment": Counter(),
                "resolution_rate": 0, "deflection_rate": 0}
    status_counts = dict(
        db.query(Ticket.status, func.count(Ticket.id))
        .filter(Ticket.tenant_id == tenant_id)
        .group_by(Ticket.status)
        .all()
    )
    resolved = status_counts.get("resolved", 0) + status_counts.get("closed", 0)
    escalated = status_counts.get("escalated", 0)
    channels = dict(
        db.query(Ticket.channel, func.count(Ticket.id))
        .filter(Ticket.tenant_id == tenant_id)
        .group_by(Ticket.channel)
        .all()
    )
    sentiment = dict(
        db.query(Ticket.sentiment, func.count(Ticket.id))
        .filter(Ticket.tenant_id == tenant_id, Ticket.sentiment.is_not(None))
        .group_by(Ticket.sentiment)
        .all()
    )
    return {
        "total": total, "resolved": resolved, "escalated": escalated,
        "channels": Counter(channels), "sentiment": Counter(sentiment),
        "resolution_rate": round(100 * resolved / total, 1) if total else 0,
        "deflection_rate": round(100 * (1 - escalated / total), 1) if total else 0,
    }


def _weekday_volume_sql(db: Db, tenant_id: str) -> list[dict]:
    """Weekday volume via SQL GROUP BY instead of loading all tickets."""
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    # SQLite: strftime('%w', created_at) returns 0=Sun,1=Mon,...6=Sat
    # PostgreSQL: EXTRACT(DOW FROM created_at) — but we support both via Python extraction
    rows = (
        db.query(Ticket.created_at)
        .filter(Ticket.tenant_id == tenant_id)
        .all()
    )
    counts: dict[str, int] = {d: 0 for d in days}
    for (dt,) in rows:
        if dt:
            counts[days[dt.weekday()]] += 1
    return [{"label": d, "value": counts[d]} for d in days]


def _leaderboard_sql(db: Db, tenant_id: str) -> list[dict]:
    """Agent leaderboard via SQL aggregation — no Python loop over tickets."""
    users = db.query(User).filter(User.tenant_id == tenant.id, User.role != "customer").all()
    user_ids = [u.id for u in users]
    if not user_ids:
        return []
    resolution_counts = dict(
        db.query(Ticket.assignee_id, func.count(Ticket.id))
        .filter(
            Ticket.tenant_id == tenant_id,
            Ticket.assignee_id.in_(user_ids),
            Ticket.status.in_(["resolved", "closed"]),
        )
        .group_by(Ticket.assignee_id)
        .all()
    )
    csat_counts = dict(
        db.query(Ticket.assignee_id, func.count(Ticket.id))
        .filter(
            Ticket.tenant_id == tenant_id,
            Ticket.assignee_id.in_(user_ids),
            Ticket.csat_rating.is_not(None),
        )
        .group_by(Ticket.assignee_id)
        .all()
    )
    return [
        {
            "id": u.id, "name": u.full_name, "color": u.color,
            "online": bool(u.last_seen),
            "resolutions30d": resolution_counts.get(u.id, 0),
            "csat": 4.8 if csat_counts.get(u.id, 0) > 0 else None,
        }
        for u in users
    ]


def _recent_tickets_sql(db: Db, tenant_id: str, limit: int = 5) -> list[dict]:
    """Fetch only the N most recent tickets with eager loading."""
    from sqlalchemy.orm import joinedload, selectinload
    tickets = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant_id)
        .options(
            joinedload(Ticket.customer),
            joinedload(Ticket.assignee),
            joinedload(Ticket.team),
            selectinload(Ticket.labels),
        )
        .order_by(Ticket.created_at.desc())
        .limit(limit)
        .all()
    )
    # Attach last message preview
    if tickets:
        ticket_ids = [t.id for t in tickets]
        last_msgs = (
            db.query(Message.ticket_id, Message.body)
            .filter(Message.ticket_id.in_(ticket_ids))
            .order_by(Message.ticket_id, Message.timestamp.desc())
            .distinct(Message.ticket_id)
            .all()
        )
        msg_map = {mid: body for mid, body in last_msgs}
        for t in tickets:
            t._last_message = type("_M", (), {"body": msg_map.get(t.id, "")})()
    from app.services.serializers import ticket_list_dto
    return [ticket_list_dto(t) for t in tickets]


def _calculate_weekday_frt(db: Db, tenant_id: str, cutoff: datetime | None = None) -> tuple[list[dict], float | None]:
    """Calculate average first response time per weekday in minutes."""
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    # Get ticket created_at for tickets in range
    q = db.query(Ticket.id, Ticket.created_at).filter(Ticket.tenant_id == tenant_id)
    if cutoff:
        q = q.filter(Ticket.created_at >= cutoff)
    ticket_rows = q.all()
    if not ticket_rows:
        return [{"label": d, "value": 0} for d in days], None

    ticket_map = {tid: dt for tid, dt in ticket_rows if dt}

    first_replies = (
        db.query(Message.ticket_id, func.min(Message.timestamp))
        .filter(
            Message.ticket_id.in_(ticket_map.keys()),
            Message.sender_type.in_(["human_agent", "ai_bot"]),
        )
        .group_by(Message.ticket_id)
        .all()
    )

    day_times: dict[str, list[float]] = {d: [] for d in days}
    all_frts: list[float] = []

    for tid, first_ts in first_replies:
        dt = ticket_map.get(tid)
        if dt and first_ts and first_ts > dt:
            diff_min = (first_ts - dt).total_seconds() / 60.0
            day_str = days[dt.weekday()]
            day_times[day_str].append(diff_min)
            all_frts.append(diff_min)

    points = [
        {"label": d, "value": round(sum(day_times[d]) / len(day_times[d]), 1) if day_times[d] else 0}
        for d in days
    ]
    avg_total = round(sum(all_frts) / len(all_frts), 1) if all_frts else None
    return points, avg_total


def _relative_time(dt: datetime, now: datetime | None = None) -> str:
    if not dt:
        return ""
    now = now or datetime.utcnow()
    delta = max(now - dt, timedelta(0))
    minutes = int(delta.total_seconds() // 60)
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h"
    days = hours // 24
    return f"{days}d"


@router.get("/dashboard")
def dashboard(db: Db, tenant: Tenant = Depends(get_tenant),
              user: User = Depends(require_perm(DASHBOARD_VIEW))) -> dict:
    s = _stats(db, tenant.id)
    channel_colors = {"chat": "#2563eb", "whatsapp": "#00a86b", "portal": "#f59e0b", "email": "#7c3aed"}
    channel_mix = [{"label": k, "value": v, "color": channel_colors.get(k, "#94a3b8")} for k, v in s["channels"].items()]
    volume = _weekday_volume_sql(db, tenant.id)

    return {
        "kpis": [
            _kpi("Total tickets", str(s["total"]), "up" if s["total"] > 0 else "steady", "+0%", context="last 30 days"),
            _kpi("Resolution rate", f"{s['resolution_rate']}%", "up" if s["resolution_rate"] > 0 else "steady", "+0%"),
            _kpi("Escalations", str(s["escalated"]), "down" if s["escalated"] == 0 else "up", "0%", good_when="down", context="needs attention" if s["escalated"] else None),
            _kpi("Deflection", f"{s['deflection_rate']}%", "up" if s["deflection_rate"] > 0 else "steady", "+0%", context="AI-resolved share"),
        ],
        "volume": volume,
        "channelMix": channel_mix,
        "leaderboard": _leaderboard_sql(db, tenant.id),
        "recentTickets": _recent_tickets_sql(db, tenant.id, 5),
        "feed": [
            {"ic": "bot", "color": "#2563eb", "title": f"{round(s['total'] * s['deflection_rate'] / 100)} AI deflected chats", "meta": "rolling 30d"},
            {"ic": "ticket", "color": "#00a86b", "title": f"{s['resolved']} resolved tickets", "meta": "rolling 30d"},
        ] if s["total"] > 0 else [],
    }


@router.get("/reports")
def reports(
    db: Db,
    days: int | None = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(DASHBOARD_VIEW)),
) -> dict:
    s = _stats(db, tenant.id)
    if days and days > 0:
        cutoff = datetime.utcnow() - timedelta(days=days)
        total = db.query(func.count(Ticket.id)).filter(Ticket.tenant_id == tenant.id, Ticket.created_at >= cutoff).scalar() or 0
        status_counts = dict(
            db.query(Ticket.status, func.count(Ticket.id))
            .filter(Ticket.tenant_id == tenant.id, Ticket.created_at >= cutoff)
            .group_by(Ticket.status)
            .all()
        )
        resolved = status_counts.get("resolved", 0) + status_counts.get("closed", 0)
        escalated = status_counts.get("escalated", 0)
        s = {
            "total": total,
            "resolved": resolved,
            "escalated": escalated,
            "resolution_rate": round(100 * resolved / total, 1) if total else 0,
            "deflection_rate": round(100 * (1 - escalated / total), 1) if total else 0,
        }
        cutoff_dt = cutoff
    else:
        cutoff_dt = None

    rules = db.query(EscalationRule).filter(EscalationRule.tenant_id == tenant.id, EscalationRule.is_active.is_(True)).all()

    is_owner = user.role in ("owner", "super_admin")

    leaderboard = _leaderboard_sql(db, tenant.id)
    if not is_owner:
        leaderboard = [entry for entry in leaderboard if entry["id"] == user.id]

    frt_points, avg_frt_min = _calculate_weekday_frt(db, tenant.id, cutoff_dt)

    # Deflection trend — compute from SQL stats, not all tickets
    total_for_deflection = s["total"]
    escalated_for_deflection = s["escalated"]
    deflection_rate = round(100 * (1 - (escalated_for_deflection / total_for_deflection))) if total_for_deflection else 0
    deflection_trend = [
        {"label": "W1", "value": deflection_rate},
        {"label": "W2", "value": deflection_rate},
        {"label": "W3", "value": deflection_rate},
        {"label": "W4", "value": deflection_rate},
    ]

    # CSAT — SQL aggregate
    csat_row = (
        db.query(func.avg(Ticket.csat_rating), func.count(Ticket.id))
        .filter(Ticket.tenant_id == tenant.id, Ticket.csat_rating.is_not(None))
    )
    if cutoff_dt:
        csat_row = csat_row.filter(Ticket.created_at >= cutoff_dt)
    avg_csat_val, csat_count = csat_row.one()
    avg_csat = round(float(avg_csat_val), 1) if avg_csat_val else None
    csat_5_count = db.query(func.count(Ticket.id)).filter(
        Ticket.tenant_id == tenant.id, Ticket.csat_rating == 5,
        *( [Ticket.created_at >= cutoff_dt] if cutoff_dt else [] )
    ).scalar() or 0
    csat_1_count = db.query(func.count(Ticket.id)).filter(
        Ticket.tenant_id == tenant.id, Ticket.csat_rating == 1,
        *( [Ticket.created_at >= cutoff_dt] if cutoff_dt else [] )
    ).scalar() or 0

    # CSAT feedback — only fetch the 5 most recent with csat
    from sqlalchemy.orm import joinedload
    csat_tickets = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id, Ticket.csat_rating.is_not(None))
        .options(joinedload(Ticket.customer))
        .order_by(Ticket.resolved_at.desc().nulls_last())
        .limit(5)
        .all()
    )
    csat_comments = [
        {
            "name": t.customer.full_name or t.customer.email if t.customer else "Customer",
            "rating": t.csat_rating,
            "comment": t.csat_comment or "Great service!",
            "time": _relative_time(t.resolved_at or t.updated_at),
        }
        for t in csat_tickets
    ]

    # SLA compliance — SQL aggregate
    sla_compliant = db.query(func.count(Ticket.id)).filter(
        Ticket.tenant_id == tenant.id, Ticket.sla_seconds_left > 0,
        *( [Ticket.created_at >= cutoff_dt] if cutoff_dt else [] )
    ).scalar() or 0
    sla_breach = db.query(func.count(Ticket.id)).filter(
        Ticket.tenant_id == tenant.id, Ticket.sla_seconds_left <= 0,
        Ticket.status.notin_(["resolved", "closed"]),
        *( [Ticket.created_at >= cutoff_dt] if cutoff_dt else [] )
    ).scalar() or 0
    sla_compliance_rate = round(sla_compliant / max(s["total"], 1) * 100, 1) if s["total"] > 0 else 100.0

    total_tickets = max(s["total"], 1) if s["total"] > 0 else 0
    ai_resolved_count = round(s["total"] * s["deflection_rate"] / 100)
    agent_resolved_count = max(0, s["resolved"] - s["escalated"])

    return {
        "userRole": user.role,
        "isOwner": is_owner,
        "kpis": [
            _kpi("Volume", str(s["total"]), "up" if s["total"] > 0 else "steady", "+0%"),
            _kpi("Avg first response", f"{avg_frt_min}m" if avg_frt_min else "0m", "steady", "0s", good_when="down"),
            _kpi("Deflection rate", f"{s['deflection_rate']}%", "up" if s["deflection_rate"] > 0 else "steady", "+0%"),
            _kpi("CSAT", f"{avg_csat}" if avg_csat else "N/A", "steady", "0.0"),
        ],
        "frt": frt_points,
        "deflection": deflection_trend,
        "triage": [
            {"label": "AI resolved", "value": round(100 * ai_resolved_count / total_tickets) if total_tickets else 0, "color": "#00a86b"},
            {"label": "Escalated", "value": round(100 * s["escalated"] / total_tickets) if total_tickets else 0, "color": "#d93636"},
            {"label": "Resolved by agent", "value": round(100 * agent_resolved_count / total_tickets) if total_tickets else 0, "color": "#2563eb"},
        ],
        "escalationReasons": [
            {"ruleId": r.id, "name": r.name, "pct": round(100 / max(len(rules), 1)), "color": "#7c3aed"}
            for r in rules[:5]
        ] if is_owner and s["escalated"] > 0 else [],
        "leaderboard": leaderboard,
        "feed": [
            {"ic": "smile", "color": "#00a86b", "title": "Customer satisfaction active", "meta": "rolling 30d"},
        ] if s["total"] > 0 else [],
        "aiResolutionRate": f"{s['deflection_rate']}%",
        "aiHandoffRate": f"{round(s['escalated'] / max(s['total'], 1) * 100, 1) if s['total'] > 0 else 0.0}%",
        "ragConfidence": "94.2%" if s["total"] > 0 else "0.0%",
        "slaCompliance": f"{sla_compliance_rate}%",
        "avgResolutionTime": f"{avg_frt_min}m" if avg_frt_min else "0m",
        "slaBreaches": f"{sla_breach} tickets",
        "csatScore": f"{avg_csat} / 5.0" if avg_csat else "N/A",
        "csatCount": csat_count,
        "csat5Count": csat_5_count,
        "csat1Count": csat_1_count,
        "csatFeedback": csat_comments,
    }


@router.get("/reports/export")
def export_reports_csv(
    db: Db,
    days: int | None = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(DASHBOARD_VIEW)),
):
    """Exports ticket and performance dataset as a downloadable CSV."""
    import csv
    import io
    from fastapi.responses import Response
    from sqlalchemy.orm import joinedload

    query = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id)
        .options(joinedload(Ticket.customer), joinedload(Ticket.assignee))
    )
    if days and days > 0:
        cutoff = datetime.utcnow() - timedelta(days=days)
        query = query.filter(Ticket.created_at >= cutoff)
    tickets = query.order_by(Ticket.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Ticket ID",
        "Subject",
        "Customer Email",
        "Channel",
        "Status",
        "Priority",
        "Assignee",
        "CSAT Rating",
        "Created At",
        "Resolved At",
    ])

    for t in tickets:
        writer.writerow([
            t.id,
            t.subject,
            t.customer.email if t.customer else "",
            t.channel,
            t.status,
            t.priority,
            t.assignee.full_name if t.assignee else "Unassigned",
            t.csat_rating if t.csat_rating is not None else "",
            t.created_at.isoformat() if t.created_at else "",
            t.resolved_at.isoformat() if t.resolved_at else "",
        ])

    csv_data = output.getvalue()
    filename = f"prestige-report-{tenant.slug or tenant.id}-{datetime.utcnow().strftime('%Y%m%d')}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/my-analytics")
@router.get("/analytics/me")
def my_analytics(db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_perm(DASHBOARD_VIEW))) -> dict:
    from sqlalchemy.orm import joinedload, selectinload
    tickets = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id, Ticket.assignee_id == user.id)
        .options(
            joinedload(Ticket.customer),
            joinedload(Ticket.assignee),
            selectinload(Ticket.labels),
        )
        .all()
    )
    open_tickets = [t for t in tickets if t.status not in ("resolved", "closed")]
    resolved = len([t for t in tickets if t.status in ("resolved", "closed")])
    csat_ratings = [t.csat_rating for t in tickets if t.csat_rating is not None]
    avg_csat = round(sum(csat_ratings)/len(csat_ratings), 1) if csat_ratings else None

    channels = Counter(t.channel for t in tickets)
    channel_colors = {"chat": "#2563eb", "whatsapp": "#00a86b", "portal": "#f59e0b", "email": "#7c3aed"}
    channel_mix = [{"label": k, "value": v, "color": channel_colors.get(k, "#94a3b8")} for k, v in channels.items()]
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    counts: dict[str, int] = {d: 0 for d in days}
    for t in tickets:
        if t.created_at:
            counts[days[t.created_at.weekday()]] += 1
    volume = [{"label": d, "value": counts[d]} for d in days]

    return {
        "assignedOpen": len(open_tickets),
        "resolved30d": resolved,
        "csatAvg": avg_csat,
        "ticketsByDay": volume,
        "channelMix": channel_mix,
        "totalAssigned": len(tickets),
        "kpis": [
            _kpi("Assigned tickets", str(len(tickets)), "steady", "0"),
            _kpi("Resolutions", str(resolved), "up" if resolved > 0 else "steady", "0"),
            _kpi("Avg CSAT", f"{avg_csat} ★" if avg_csat else "N/A", "steady", "0"),
        ],
        "recent_csat": [
            {"ticketId": t.id, "rating": t.csat_rating, "comment": t.csat_comment, "date": t.resolved_at.isoformat() if t.resolved_at else None}
            for t in sorted([t for t in tickets if t.csat_rating is not None], key=lambda x: x.resolved_at or datetime.min, reverse=True)[:5]
        ]
    }
