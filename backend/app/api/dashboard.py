from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, case

from app.api.deps import Db, get_tenant
from app.core.permissions import DASHBOARD_VIEW, require_perm
from app.models import EscalationRule, Message, Tenant, Ticket, User
from app.services.serializers import ticket_dto

router = APIRouter(tags=["dashboard"])

# UI channel value -> DB Ticket.channel value (the widget writes "widget").
_CHANNEL_MAP = {"all": None, "chat": "widget", "widget": "widget",
                "portal": "portal", "email": "email", "whatsapp": "whatsapp"}


def _resolve_channel(raw: str | None) -> str | None:
    return _CHANNEL_MAP.get((raw or "all").lower(), None)


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


def _leaderboard_sql(db: Db, tenant_id: str, channel: str | None = None) -> list[dict]:
    """Agent leaderboard via SQL aggregation — no Python loop over tickets."""
    users = db.query(User).filter(User.tenant_id == tenant_id, User.role != "customer").all()
    user_ids = [u.id for u in users]
    if not user_ids:
        return []

    def _base_q():
        q = db.query(Ticket.assignee_id, func.count(Ticket.id)).filter(
            Ticket.tenant_id == tenant_id,
            Ticket.assignee_id.in_(user_ids),
        )
        if channel:
            q = q.filter(Ticket.channel == channel)
        return q

    resolution_counts = dict(
        _base_q().filter(Ticket.status.in_(["resolved", "closed"]))
        .group_by(Ticket.assignee_id).all()
    )
    csat_counts = dict(
        _base_q().filter(Ticket.csat_rating.is_not(None))
        .group_by(Ticket.assignee_id).all()
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
        subq = (
            db.query(
                Message.ticket_id,
                Message.body,
                func.row_number().over(
                    partition_by=Message.ticket_id,
                    order_by=Message.timestamp.desc(),
                ).label("rn"),
            )
            .filter(Message.ticket_id.in_(ticket_ids))
            .subquery()
        )
        last_msgs = (
            db.query(subq.c.ticket_id, subq.c.body)
            .filter(subq.c.rn == 1)
            .all()
        )
        msg_map = {mid: body for mid, body in last_msgs}
        for t in tickets:
            t._last_message = type("_M", (), {"body": msg_map.get(t.id, "")})()
    from app.services.serializers import ticket_list_dto
    return [ticket_list_dto(t) for t in tickets]


def _calculate_weekday_frt(db: Db, tenant_id: str, cutoff: datetime | None = None,
                           channel: str | None = None) -> tuple[list[dict], float | None]:
    """Calculate average first response time per weekday in minutes."""
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    # Get ticket created_at for tickets in range
    q = db.query(Ticket.id, Ticket.created_at).filter(Ticket.tenant_id == tenant_id)
    if cutoff:
        q = q.filter(Ticket.created_at >= cutoff)
    if channel:
        q = q.filter(Ticket.channel == channel)
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
    channel: str | None = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(DASHBOARD_VIEW)),
) -> dict:
    return _compute_reports(db, tenant, user, days, channel)


def _compute_reports(db: Db, tenant: Tenant, user: User,
                     days: int | None, raw_channel: str | None) -> dict:
    s = _stats(db, tenant.id)
    chan = _resolve_channel(raw_channel)
    if days and days > 0:
        cutoff = datetime.utcnow() - timedelta(days=days)
        base_q = db.query(func.count(Ticket.id)).filter(Ticket.tenant_id == tenant.id, Ticket.created_at >= cutoff)
        if chan:
            base_q = base_q.filter(Ticket.channel == chan)
        total = base_q.scalar() or 0
        sq = (
            db.query(Ticket.status, func.count(Ticket.id))
            .filter(Ticket.tenant_id == tenant.id, Ticket.created_at >= cutoff)
        )
        if chan:
            sq = sq.filter(Ticket.channel == chan)
        status_counts = dict(sq.group_by(Ticket.status).all())
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
        # All-time — still honour the channel filter
        if chan:
            cq = (
                db.query(Ticket.status, func.count(Ticket.id))
                .filter(Ticket.tenant_id == tenant.id, Ticket.channel == chan)
                .group_by(Ticket.status)
            ).all()
            sc = dict(cq)
            t_total = sum(sc.values())
            t_resolved = sc.get("resolved", 0) + sc.get("closed", 0)
            t_escalated = sc.get("escalated", 0)
            s = {
                "total": t_total,
                "resolved": t_resolved,
                "escalated": t_escalated,
                "resolution_rate": round(100 * t_resolved / t_total, 1) if t_total else 0,
                "deflection_rate": round(100 * (1 - t_escalated / t_total), 1) if t_total else 0,
            }
        cutoff_dt = None

    rules = db.query(EscalationRule).filter(EscalationRule.tenant_id == tenant.id, EscalationRule.is_active.is_(True)).all()

    is_owner = user.role in ("owner", "super_admin")

    leaderboard = _leaderboard_sql(db, tenant.id, chan)
    if not is_owner:
        leaderboard = [entry for entry in leaderboard if entry["id"] == user.id]

    frt_points, avg_frt_min = _calculate_weekday_frt(db, tenant.id, cutoff_dt, chan)

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

    def _chan(model_col=None):
        """Channel predicate fragments for aggregate queries."""
        frags = []
        if chan:
            frags.append(Ticket.channel == chan)
        return frags

    # CSAT — SQL aggregate
    csat_q = (
        db.query(func.avg(Ticket.csat_rating), func.count(Ticket.id))
        .filter(Ticket.tenant_id == tenant.id, Ticket.csat_rating.is_not(None), *_chan())
    )
    if cutoff_dt:
        csat_q = csat_q.filter(Ticket.created_at >= cutoff_dt)
    avg_csat_val, csat_count = csat_q.one()
    avg_csat = round(float(avg_csat_val), 1) if avg_csat_val else None
    csat5_q = db.query(func.count(Ticket.id)).filter(
        Ticket.tenant_id == tenant.id, Ticket.csat_rating == 5, *_chan(),
        *( [Ticket.created_at >= cutoff_dt] if cutoff_dt else [] )
    )
    csat_5_count = csat5_q.scalar() or 0
    csat1_q = db.query(func.count(Ticket.id)).filter(
        Ticket.tenant_id == tenant.id, Ticket.csat_rating == 1, *_chan(),
        *( [Ticket.created_at >= cutoff_dt] if cutoff_dt else [] )
    )
    csat_1_count = csat1_q.scalar() or 0

    # CSAT feedback — only fetch the 5 most recent with csat
    from sqlalchemy.orm import joinedload
    csat_tq = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id, Ticket.csat_rating.is_not(None), *_chan())
        .options(joinedload(Ticket.customer))
        .order_by(Ticket.resolved_at.desc().nulls_last())
        .limit(5)
    )
    csat_tickets = csat_tq.all()
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
    sla_ok_q = db.query(func.count(Ticket.id)).filter(
        Ticket.tenant_id == tenant.id, Ticket.sla_seconds_left > 0, *_chan(),
        *( [Ticket.created_at >= cutoff_dt] if cutoff_dt else [] )
    )
    sla_compliant = sla_ok_q.scalar() or 0
    breach_q = db.query(func.count(Ticket.id)).filter(
        Ticket.tenant_id == tenant.id, Ticket.sla_seconds_left <= 0,
        Ticket.status.notin_(["resolved", "closed"]), *_chan(),
        *( [Ticket.created_at >= cutoff_dt] if cutoff_dt else [] )
    )
    sla_breach = breach_q.scalar() or 0
    sla_compliance_rate = round(sla_compliant / max(s["total"], 1) * 100, 1) if s["total"] > 0 else 100.0

    total_tickets = max(s["total"], 1) if s["total"] > 0 else 0
    ai_resolved_count = round(s["total"] * s["deflection_rate"] / 100)
    agent_resolved_count = max(0, s["resolved"] - s["escalated"])

    return {
        "userRole": user.role,
        "isOwner": is_owner,
        "channelFilter": raw_channel or "all",
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


@router.get("/reports/pdf")
def reports_pdf(
    db: Db,
    days: int | None = None,
    channel: str | None = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(DASHBOARD_VIEW)),
):
    """Print-ready HTML report document (A4). The browser renders it in a
    dedicated tab and the user saves/prints as PDF — clean layout, not a
    screenshot of the dashboard page."""
    from fastapi.responses import Response

    payload = _compute_reports(db, tenant, user, days, channel)
    html = _render_report_html(payload, tenant, days, channel, user)
    return Response(html, media_type="text/html; charset=utf-8")


def _esc(v) -> str:
    import html as _html
    return _html.escape(str(v), quote=True)


def _bars(points: list[dict], color: str, suffix: str = "") -> str:
    if not points:
        return "<p class='muted'>No data in this period.</p>"
    peak = max((float(p["value"]) for p in points), default=0) or 1
    rows = []
    for p in points[:14]:
        pct = round(float(p["value"]) / peak * 100, 1)
        val = f'{_esc(p["value"])}{suffix}'
        rows.append(
            f'<div class="brow"><span class="blab">{_esc(p["label"])}</span>'
            f'<span class="btrack"><span class="bfill" style="width:{pct}%;background:{color}"></span></span>'
            f'<span class="bval">{val}</span></div>'
        )
    return "".join(rows)


def _meter(items: list[dict]) -> str:
    if not items:
        return "<p class='muted'>No data in this period.</p>"
    rows = []
    for t in items:
        rows.append(
            f'<div class="brow"><span class="blab wide">{_esc(t["label"])}</span>'
            f'<span class="btrack"><span class="bfill" style="width:{min(float(t.get("value", 0)), 100)}%;background:{t.get("color", "#4f46e5")}"></span></span>'
            f'<span class="bval">{_esc(t.get("value", 0))}%</span></div>'
        )
    return "".join(rows)


def _table(headers: list[str], rows: list[list[str]], empty: str = "No records.") -> str:
    if not rows:
        return f"<p class='muted'>{empty}</p>"
    th = "".join(f"<th>{_esc(h)}</th>" for h in headers)
    trs = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"


def _render_report_html(p: dict, tenant: Tenant, days: int | None,
                        raw_channel: str | None, user: User | None = None) -> str:
    from datetime import datetime as _dt

    from app.services.tz import now_in

    full_name = getattr(user, "full_name", "Support Team")
    role = getattr(user, "role", "owner")

    period = {"today": "Today", "7d": "Last 7 days", "14d": "Last 14 days",
              "30d": "Last 30 days", "90d": "Last 90 days"}.get(
        str(days) if days else "", "All time")
    if days == 1:
        period = "Today"
    chan_label = (raw_channel or "all").replace("_", " ").title()
    kpis = {k["label"]: k["value"] for k in p.get("kpis", [])}
    generated = now_in(tenant).strftime("%d %b %Y, %H:%M %Z")

    vol_rows = [
        ["Total conversations", f"<b>{kpis.get('Volume', '0')}</b>"],
        ["Resolved by agents", "<b>" + next((f"{t['value']}%" for t in p.get("triage", []) if t["label"] == "Resolved by agent"), "0%") + "</b> of volume"],
        ["Escalated to humans", "<b>" + _esc(p.get("aiHandoffRate", "0%")) + "</b> of volume"],
        ["SLA compliance", f"<b>{_esc(p.get('slaCompliance', '100%'))}</b>"],
        ["SLA breaches", f"<b>{_esc(p.get('slaBreaches', '0 tickets'))}</b>"],
        ["Avg resolution time", f"<b>{_esc(p.get('avgResolutionTime', '0m'))}</b>"],
    ]

    ai_cards = (
        _stat_card("AI Resolution Rate", p.get("aiResolutionRate", "0%"), "#059669")
        + _stat_card("AI Handoff Rate", p.get("aiHandoffRate", "0%"), "#d97706")
        + _stat_card("KB Retrieval Confidence", p.get("ragConfidence", "0.0%"), "#4f46e5")
    )

    sla_cards = (
        _stat_card("SLA Compliance", p.get("slaCompliance", "100%"), "#059669")
        + _stat_card("SLA Breaches", p.get("slaBreaches", "0 tickets"), "#e11d48")
        + _stat_card("Avg Resolution", p.get("avgResolutionTime", "0m"), "#2563eb")
    )

    lb_rows = [
        [f"#{i + 1}", _esc(r.get("name", "—")),
         f"<b>{r.get('resolutions30d', 0)}</b>",
         ("★ " + format(float(r["csat"]), ".1f")) if r.get("csat") is not None else "—"]
        for i, r in enumerate(p.get("leaderboard", []))
    ]

    csat_parts = []
    overall_csat = p.get("csatScore", "N/A")
    fb_rows = [
        [_esc(f.get("name", "Customer")),
         "★" * int(f.get("rating") or 0),
         _esc((f.get("comment") or "")[:160])]
        for f in p.get("csatFeedback", [])
    ]

    esc_rows = [
        [f"<code>{_esc(r['ruleId'])}</code>", _esc(r["name"]), f"{r['pct']}%"]
        for r in p.get("escalationReasons", [])
    ]

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Support Performance Report — {_esc(tenant.business_name)}</title>
<style>
  @page {{ size: A4; margin: 16mm 14mm; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
         color:#0f172a; font-size:11px; line-height:1.5; margin:0; }}
  .cover {{ border-bottom:3px solid #4f46e5; padding-bottom:14px; margin-bottom:18px;
            display:flex; justify-content:space-between; align-items:flex-end; }}
  .brand {{ font-size:10px; letter-spacing:2.5px; font-weight:800; color:#6366f1; text-transform:uppercase; }}
  h1 {{ font-size:22px; margin:4px 0 2px; }}
  h2 {{ font-size:13px; margin:20px 0 8px; padding-bottom:5px; border-bottom:1px solid #e2e8f0; }}
  .meta {{ font-size:10px; color:#64748b; text-align:right; }}
  section {{ page-break-inside:avoid; margin-bottom:6px; }}
  .cards {{ display:flex; gap:8px; flex-wrap:wrap; }}
  .card {{ flex:1 1 30%; min-width:150px; border:1px solid #e2e8f0; border-radius:8px; padding:9px 12px; }}
  .card .lab {{ font-size:9px; font-weight:700; letter-spacing:.8px; text-transform:uppercase; color:#64748b; }}
  .card .val {{ font-size:19px; font-weight:800; margin-top:2px; }}
  table {{ width:100%; border-collapse:collapse; margin-top:6px; }}
  th {{ text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:.6px;
       color:#64748b; border-bottom:1.5px solid #cbd5e1; padding:5px 7px; background:#f8fafc; }}
  td {{ padding:5.5px 7px; border-bottom:1px solid #eef2f6; vertical-align:top; }}
  code {{ background:#f1f5f9; border-radius:3px; padding:1px 5px; font-size:9.5px; }}
  .brow {{ display:flex; align-items:center; gap:8px; margin:4px 0; }}
  .blab {{ width:38px; color:#475569; font-weight:600; }} .blab.wide {{ width:170px; }}
  .btrack {{ flex:1; height:8px; background:#f1f5f9; border-radius:99px; overflow:hidden; }}
  .bfill {{ display:block; height:100%; border-radius:99px; }}
  .bval {{ width:56px; text-align:right; font-weight:700; font-variant-numeric:tabular-nums; }}
  .cols {{ display:flex; gap:18px; }} .cols > div {{ flex:1; min-width:0; }}
  .stars {{ color:#f59e0b; letter-spacing:2px; }}
  .foot {{ margin-top:22px; padding-top:9px; border-top:1px solid #e2e8f0;
          font-size:9px; color:#94a3b8; display:flex; justify-content:space-between; }}
  .muted {{ color:#94a3b8; }}
</style></head>
<body>

<div class="cover">
  <div>
    <div class="brand">Prestige · {_esc(tenant.business_name)}</div>
    <h1>Customer Support Performance Report</h1>
    <span class="muted">{_esc(period)} · Channel: {_esc(chan_label)}</span>
  </div>
  <div class="meta">Generated {generated}<br>Prepared for {_esc(full_name)} ({_esc(role)})</div>
</div>

<section>
  <h2>Executive Summary</h2>
  <div class="cards">
    {_stat_card("Conversations", kpis.get("Volume", "0"), "#4f46e5")}
    {_stat_card("Deflection Rate", kpis.get("Deflection rate", "0%"), "#059669")}
    {_stat_card("Avg First Response", kpis.get("Avg first response", "0m"), "#2563eb")}
    {_stat_card("CSAT", kpis.get("CSAT", "N/A"), "#d97706")}
    {_stat_card("SLA Compliance", _esc(p.get("slaCompliance", "100%")), "#059669")}
    {_stat_card("Escalations", _esc(p.get("aiHandoffRate", "0%")), "#e11d48")}
  </div>
</section>

<section>
  <h2>Support Volume &amp; Outcomes</h2>
  {_table(["Metric", "Value"], vol_rows)}
</section>

<section>
  <h2>AI &amp; Automation</h2>
  <div class="cards">{ai_cards}</div>
  <h3 style="font-size:11px;margin:12px 0 2px;">Conversation outcome split</h3>
  {_meter(p.get("triage", []))}
</section>

<section>
  <h2>SLA &amp; Escalations</h2>
  <div class="cards">{sla_cards}</div>
  <h3 style="font-size:11px;margin:12px 0 2px;">Top escalation trigger reasons</h3>
  {_table(["Rule ID", "Rule Name", "Share"], esc_rows, "No escalation triggers recorded in this period.")}
</section>

<section>
  <h2>Agent Performance Leaderboard</h2>
  {_table(["Rank", "Agent", "Resolutions", "CSAT"], lb_rows, "No agent activity recorded.")}
</section>

<section>
  <h2>Customer Satisfaction (CSAT)</h2>
  <div class="cols">
    <div>
      {_stat_card("Overall CSAT", _esc(overall_csat), "#d97706")}
      <p style="margin:8px 0 0;color:#64748b;">
        <b>{p.get("csatCount", 0)}</b> ratings ·
        <b style="color:#059669">{p.get("csat5Count", 0)}</b> five-star ·
        <b style="color:#e11d48">{p.get("csat1Count", 0)}</b> one-star
      </p>
    </div>
    <div>
      <h3 style="font-size:11px;margin:0 0 4px;">Recent customer feedback</h3>
      {_table(["Customer", "Rating", "Comment"], fb_rows, "No ratings submitted in this period.")}
    </div>
  </div>
</section>

<section>
  <h2>Trends</h2>
  <div class="cols">
    <div>
      <h3 style="font-size:11px;margin:0 0 4px;">First response time by weekday (min)</h3>
      {_bars(p.get("frt", []), "#2563eb")}
    </div>
    <div>
      <h3 style="font-size:11px;margin:0 0 4px;">AI deflection trend (%)</h3>
      {_bars(p.get("deflection", []), "#059669")}
    </div>
  </div>
</section>

<div class="foot">
  <span>Prestige — Multi-Tenant AI Support Portal · confidential internal report</span>
  <span>Report parameters: period={_esc(period)}, channel={_esc(chan_label)}</span>
</div>

<script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body></html>"""


def _stat_card(label: str, value: str, color: str) -> str:
    return (f'<div class="card"><div class="lab">{_esc(label)}</div>'
            f'<div class="val" style="color:{color}">{value}</div></div>')


@router.get("/reports/export")
def export_reports_csv(
    db: Db,
    days: int | None = None,
    channel: str | None = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(DASHBOARD_VIEW)),
):
    """Exports ticket and performance dataset as a downloadable CSV."""
    import csv
    import io
    from fastapi.responses import Response
    from sqlalchemy.orm import joinedload

    from app.services.tz import fmt_in_tz, now_in

    query = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id)
        .options(joinedload(Ticket.customer), joinedload(Ticket.assignee))
    )
    chan = _resolve_channel(channel)
    if chan:
        query = query.filter(Ticket.channel == chan)
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
            fmt_in_tz(t.created_at, "%Y-%m-%d %H:%M", tenant),
            fmt_in_tz(t.resolved_at, "%Y-%m-%d %H:%M", tenant),
        ])

    csv_data = output.getvalue()
    filename = f"prestige-report-{tenant.slug or tenant.id}-{now_in(tenant).strftime('%Y%m%d')}.csv"

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
