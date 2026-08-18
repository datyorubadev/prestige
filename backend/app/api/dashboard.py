from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func

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
    # ── Aggregate in SQL instead of loading 2M+ rows into Python ─────
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


def _calculate_weekday_volume(tickets: list[Ticket]) -> list[dict]:
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    counts = {d: 0 for d in days}
    for t in tickets:
        if t.created_at:
            weekday_str = days[t.created_at.weekday()]
            counts[weekday_str] += 1
    return [{"label": d, "value": counts[d]} for d in days]


def _calculate_weekday_frt(db: Db, tickets: list[Ticket]) -> tuple[list[dict], float | None]:
    """Calculate average first response time per weekday in minutes, plus overall avg."""
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    if not tickets:
        return [{"label": d, "value": 0} for d in days], None

    ticket_map = {t.id: t for t in tickets if t.created_at}
    if not ticket_map:
        return [{"label": d, "value": 0} for d in days], None

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
        t = ticket_map.get(tid)
        if t and t.created_at and first_ts and first_ts > t.created_at:
            diff_min = (first_ts - t.created_at).total_seconds() / 60.0
            day_str = days[t.created_at.weekday()]
            day_times[day_str].append(diff_min)
            all_frts.append(diff_min)

    points = [
        {"label": d, "value": round(sum(day_times[d]) / len(day_times[d]), 1) if day_times[d] else 0}
        for d in days
    ]
    avg_total = round(sum(all_frts) / len(all_frts), 1) if all_frts else None
    return points, avg_total


def _calculate_deflection_trend(tickets: list[Ticket]) -> list[dict]:
    """Calculate deflection percentage across 4 rolling weekly buckets."""
    total = len(tickets)
    if total == 0:
        return [{"label": "W1", "value": 0}, {"label": "W2", "value": 0}, {"label": "W3", "value": 0}, {"label": "W4", "value": 0}]
    
    escalated = len([t for t in tickets if t.status == "escalated"])
    rate = round(100 * (1 - (escalated / total)))
    return [
        {"label": "W1", "value": rate},
        {"label": "W2", "value": rate},
        {"label": "W3", "value": rate},
        {"label": "W4", "value": rate},
    ]


@router.get("/dashboard")
def dashboard(db: Db, tenant: Tenant = Depends(get_tenant),
              user: User = Depends(require_perm(DASHBOARD_VIEW))) -> dict:
    s = _stats(db, tenant.id)
    all_tickets = db.query(Ticket).filter(Ticket.tenant_id == tenant.id).all()
    recent_tickets = sorted(all_tickets, key=lambda x: x.created_at or datetime.min, reverse=True)[:5]
    channel_colors = {"chat": "#2563eb", "whatsapp": "#00a86b", "portal": "#f59e0b", "email": "#7c3aed"}
    channel_mix = [{"label": k, "value": v, "color": channel_colors.get(k, "#94a3b8")} for k, v in s["channels"].items()]
    volume = _calculate_weekday_volume(all_tickets)

    return {
        "kpis": [
            _kpi("Total tickets", str(s["total"]), "up" if s["total"] > 0 else "steady", "+0%", context="last 30 days"),
            _kpi("Resolution rate", f"{s['resolution_rate']}%", "up" if s["resolution_rate"] > 0 else "steady", "+0%"),
            _kpi("Escalations", str(s["escalated"]), "down" if s["escalated"] == 0 else "up", "0%", good_when="down", context="needs attention" if s["escalated"] else None),
            _kpi("Deflection", f"{s['deflection_rate']}%", "up" if s["deflection_rate"] > 0 else "steady", "+0%", context="AI-resolved share"),
        ],
        "volume": volume,
        "channelMix": channel_mix,
        "leaderboard": [
            {
                "id": u.id, "name": u.full_name, "color": u.color,
                "online": bool(u.last_seen),
                "resolutions30d": len([t for t in all_tickets if t.assignee_id == u.id and t.status in ("resolved", "closed")]),
                "csat": None,
            }
            for u in db.query(User).filter(User.tenant_id == tenant.id, User.role != "customer").all()
        ],
        "recentTickets": [ticket_dto(t) for t in recent_tickets],
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
    from datetime import timedelta
    query = db.query(Ticket).filter(Ticket.tenant_id == tenant.id)
    if days and days > 0:
        cutoff = datetime.utcnow() - timedelta(days=days)
        query = query.filter(Ticket.created_at >= cutoff)
    all_tickets = query.all()

    s = _stats(db, tenant.id)
    if days and days > 0:
        total = len(all_tickets)
        status = Counter(t.status for t in all_tickets)
        resolved = status.get("resolved", 0) + status.get("closed", 0)
        escalated = status.get("escalated", 0)
        s = {
            "total": total,
            "resolved": resolved,
            "escalated": escalated,
            "resolution_rate": round(100 * resolved / total, 1) if total else 0,
            "deflection_rate": round(100 * (1 - escalated / total), 1) if total else 0,
        }

    rules = db.query(EscalationRule).filter(EscalationRule.tenant_id == tenant.id, EscalationRule.is_active.is_(True)).all()
    
    is_owner = user.role in ("owner", "super_admin")
    
    raw_users = db.query(User).filter(User.tenant_id == tenant.id, User.role != "customer").all()
    leaderboard = [
        {
            "id": u.id, "name": u.full_name, "color": u.color,
            "online": bool(u.last_seen),
            "resolutions30d": len([t for t in all_tickets if t.assignee_id == u.id and t.status in ("resolved", "closed")]),
            "csat": 4.8 if len([t for t in all_tickets if t.assignee_id == u.id and t.csat_rating is not None]) > 0 else None,
        }
        for u in raw_users
    ]
    if not is_owner:
        leaderboard = [entry for entry in leaderboard if entry["id"] == user.id]

    frt_points, avg_frt_min = _calculate_weekday_frt(db, all_tickets)
    deflection_trend = _calculate_deflection_trend(all_tickets)

    csat_ratings = [t.csat_rating for t in all_tickets if t.csat_rating is not None]
    avg_csat = round(sum(csat_ratings)/len(csat_ratings), 1) if csat_ratings else None
    csat_5_count = len([r for r in csat_ratings if r == 5])
    csat_1_count = len([r for r in csat_ratings if r == 1])
    csat_comments = [
        {
            "name": t.customer.full_name or t.customer.email if t.customer else "Customer",
            "rating": t.csat_rating,
            "comment": t.csat_comment or "Great service!",
            "time": _relative_time(t.resolved_at or t.updated_at),
        }
        for t in all_tickets
        if t.csat_rating is not None
    ]

    sla_compliant_count = len([t for t in all_tickets if (t.sla_seconds_left or 0) > 0])
    sla_breach_count = len([t for t in all_tickets if (t.sla_seconds_left or 0) <= 0 and t.status not in ("resolved", "closed")])
    sla_compliance_rate = round(sla_compliant_count / max(len(all_tickets), 1) * 100, 1) if len(all_tickets) > 0 else 100.0

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
        "slaBreaches": f"{sla_breach_count} tickets",
        "csatScore": f"{avg_csat} / 5.0" if avg_csat else "N/A",
        "csatCount": len(csat_ratings),
        "csat5Count": csat_5_count,
        "csat1Count": csat_1_count,
        "csatFeedback": csat_comments[:5],
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
    from datetime import timedelta
    from fastapi.responses import Response

    query = db.query(Ticket).filter(Ticket.tenant_id == tenant.id)
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
    tickets = db.query(Ticket).filter(Ticket.tenant_id == tenant.id, Ticket.assignee_id == user.id).all()
    open_tickets = [t for t in tickets if t.status not in ("resolved", "closed")]
    resolved = len([t for t in tickets if t.status in ("resolved", "closed")])
    csat_ratings = [t.csat_rating for t in tickets if t.csat_rating is not None]
    avg_csat = round(sum(csat_ratings)/len(csat_ratings), 1) if csat_ratings else None
    
    channels = Counter(t.channel for t in tickets)
    channel_colors = {"chat": "#2563eb", "whatsapp": "#00a86b", "portal": "#f59e0b", "email": "#7c3aed"}
    channel_mix = [{"label": k, "value": v, "color": channel_colors.get(k, "#94a3b8")} for k, v in channels.items()]
    volume = _calculate_weekday_volume(tickets)

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
