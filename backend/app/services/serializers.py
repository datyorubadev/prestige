"""ORM -> frontend DTO serializers. Field names follow frontend/src/lib/types.ts."""

import hashlib
import json
import random
import re
import uuid
from datetime import datetime

from app.models import (
    ApiKey,
    AutomationRule,
    CannedResponse,
    ChannelSetting,
    EscalationRule,
    FeatureFlag,
    Invoice,
    KbArticle,
    KnowledgeSource,
    Label,
    Message,
    NotificationPreference,
    Plan,
    PresetVersion,
    SlaPolicy,
    SlaSchedule,
    Subscription,
    Tenant,
    Ticket,
    User,
    WebhookDelivery,
    WebhookEndpoint,
)


def _j(raw: str | None, fallback=None):
    if not raw:
        return fallback if fallback is not None else ([] if fallback is None else fallback)
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return fallback if fallback is not None else []


def initials_of(name: str) -> str:
    parts = [p for p in name.split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def session_user(user: User) -> dict:
    tz = None
    try:
        if user.tenant_id:
            from app.database import SessionLocal
            from app.models import Tenant
            with SessionLocal() as _db:
                t = _db.get(Tenant, user.tenant_id)
                tz = getattr(t, "timezone", None)
    except Exception:
        tz = None
    return {
        "id": user.id,
        "email": user.email,
        "fullName": user.full_name,
        "role": user.role,
        "tenantId": user.tenant_id,
        "initials": initials_of(user.full_name),
        "color": user.color,
        "timezone": tz or "Africa/Lagos",
    }


def _relative_time(dt: datetime, now: datetime | None = None) -> str:
    if not dt:
        return ""
    now = now or datetime.utcnow()
    delta = max(now - dt, __import__("datetime").timedelta(0))
    minutes = int(delta.total_seconds() // 60)
    if minutes < 1:
        return "Just now"
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h"
    days = hours // 24
    return f"{days}d"


def message_dto(msg: Message) -> dict:
    dto = {
        "id": msg.id,
        "who": msg.sender_type,
        "text": msg.body,
        "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
    }
    # Always include the author name so the frontend can display per-message
    # attribution instead of relying on the ticket's current assignee.
    if msg.sender_name:
        dto["author"] = msg.sender_name
    # Internal notes are stored with sender_type=SYSTEM. The agent workspace
    # renders those as dashed, author-attributed note bubbles (kind: "note"),
    # so map the raw enum to the frontend's note shape here.
    if msg.sender_type == "system":
        dto["who"] = "human_agent"
        dto["kind"] = "note"
    if msg.reply_to:
        try:
            quoted = json.loads(msg.reply_to)
            dto["replyTo"] = {"author": str(quoted.get("author", "")), "text": str(quoted.get("text", ""))}
        except (ValueError, TypeError):
            dto["replyTo"] = None
    if getattr(msg, "attachments", None):
        try:
            dto["attachments"] = json.loads(msg.attachments)
        except (ValueError, TypeError):
            dto["attachments"] = []
    else:
        dto["attachments"] = []
    if getattr(msg, "edited", False):
        dto["edited"] = True
    return dto


def label_dto(label: Label) -> dict:
    return {
        "id": label.id,
        "tenantId": label.tenant_id,
        "name": label.name,
        "color": label.color,
        "description": label.description or "",
        "createdAt": label.created_at.isoformat() if label.created_at else None,
    }


def tenant_ticket_prefix(tenant) -> str:
    """3 letters picked from the tenant name, uppercased (e.g. 'Nairawave' ->
    'NAI'). Falls back to the slug, then 'SUP', so the prefix is always exactly
    3 A-Z letters."""
    name = re.sub(r"[^A-Za-z]", "", getattr(tenant, "business_name", "") or "")
    if len(name) >= 3:
        return name[:3].upper()
    slug = re.sub(r"[^A-Za-z]", "", getattr(tenant, "slug", "") or "")
    return (slug.upper() + "SUP")[:3]


def build_ticket_number(prefix: str, created_at: datetime | None, suffix: str) -> str:
    dt = created_at or datetime.utcnow()
    return f"{prefix}{dt.strftime('%Y%m%d')}{suffix}"


def generate_ticket_number(db, tenant, created_at: datetime | None = None,
                           used: set[str] | None = None) -> str:
    """{3-letter tenant prefix}{YYYY}{MM}{DD}{6 random digits}. The 6 digits are
    guaranteed unique across the tenant by probing the tickets table (and the
    caller's `used` set when backfilling) before returning."""
    prefix = tenant_ticket_prefix(tenant)
    dt = created_at or datetime.utcnow()
    # Flush so any display numbers assigned earlier in this (uncommitted)
    # transaction are visible to the uniqueness probe below (autoflush=False).
    db.flush()
    taken = set(used) if used else set()
    for _ in range(100):
        suffix = f"{random.randint(0, 999999):06d}"
        number = build_ticket_number(prefix, dt, suffix)
        if number in taken:
            continue
        if not db.query(Ticket).filter(Ticket.display_number == number).first():
            taken.add(number)
            return number
    digest = hashlib.md5(f"{uuid.uuid4()}{random.random()}".encode("utf-8")).hexdigest()
    suffix = str(int(digest[:8], 16) % 1000000).zfill(6)
    return build_ticket_number(prefix, dt, suffix)


def ensure_ticket_number(db, ticket, used: set[str] | None = None) -> str:
    """Assign (and persist to the ticket row) a unique display number. Idempotent:
    returns the existing number when one is already set."""
    if getattr(ticket, "display_number", None):
        return ticket.display_number
    tenant = ticket.tenant or db.get(Tenant, ticket.tenant_id)
    number = generate_ticket_number(db, tenant, ticket.created_at, used)
    ticket.display_number = number
    return number


def format_ticket_number(ticket) -> str:
    """The ticket's display number. Stored value wins; otherwise a deterministic
    fallback derived from the raw id (stable across restarts)."""
    if getattr(ticket, "display_number", None):
        return ticket.display_number
    tenant = ticket.tenant
    prefix = tenant_ticket_prefix(tenant) if tenant else "SUP"
    dt = ticket.created_at or datetime.utcnow()
    digest = hashlib.md5(ticket.id.encode("utf-8")).hexdigest()
    suffix = str(int(digest[:8], 16) % 1000000).zfill(6)
    return build_ticket_number(prefix, dt, suffix)


def _ticket_base(ticket: Ticket, now: datetime | None = None) -> dict:
    """Shared fields between list and detail DTOs."""
    customer = ticket.customer
    assignee_name = ticket.assignee.full_name if ticket.assignee else None
    sla = None
    if ticket.sla_seconds_left is not None:
        sla = "overdue" if ticket.sla_seconds_left < 0 else f"{int(ticket.sla_seconds_left // 60)}m left"
    elif ticket.status in ("open", "in_progress", "escalated"):
        sla = "1h left"
    last_msg = getattr(ticket, "_last_message", None)
    if last_msg is None and getattr(ticket, "messages", None):
        last_msg = ticket.messages[-1] if ticket.messages else None

    last_msg_ts = getattr(last_msg, "timestamp", None)
    candidates = [ticket.created_at, ticket.updated_at]
    if last_msg_ts:
        candidates.append(last_msg_ts)
    last_active = max((d for d in candidates if d is not None), default=ticket.created_at)

    return {
        "id": ticket.id,
        "ticketNumber": format_ticket_number(ticket),
        "subject": ticket.subject,
        "cust": customer.full_name if customer else "Guest",
        "email": customer.email if customer else "",
        "phone": customer.phone_number or "" if customer else "",
        "channel": ticket.channel,
        "status": ticket.status,
        "priority": ticket.priority,
        "type": ticket.ticket_type.lower(),
        "sentiment": ticket.sentiment or "Neutral",
        "time": _relative_time(last_active, now),
        "createdAt": _relative_time(ticket.created_at, now),
        "unread": ticket.unread,
        "sla": sla,
        "assignee": assignee_name,
        "assigneeId": ticket.assignee_id,
        "teamId": ticket.team_id,
        "teamName": ticket.team.name if ticket.team else None,
        "labels": [lbl.name for lbl in sorted(ticket.labels, key=lambda x: x.name)],
        "assist": ticket_assist(ticket),
        "csatRating": ticket.csat_rating,
        "csatComment": ticket.csat_comment,
        "snoozedUntil": ticket.snoozed_until.isoformat() if getattr(ticket, "snoozed_until", None) else None,
        "mergedIntoId": getattr(ticket, "merged_into_id", None),
        "aiPaused": bool(getattr(ticket, "ai_paused", False)),
    }


def ticket_list_dto(ticket: Ticket, now: datetime | None = None) -> dict:
    """Lightweight DTO for list endpoints — no messages loaded."""
    dto = _ticket_base(ticket, now)
    # Preview comes from the pre-loaded last_message relationship (see list query).
    last_msg = getattr(ticket, "_last_message", None)
    if last_msg is None and getattr(ticket, "messages", None):
        # Fallback: if messages were accidentally loaded, use the last one.
        last_msg = ticket.messages[-1] if ticket.messages else None
    dto["preview"] = last_msg.body[:120] if last_msg and getattr(last_msg, "body", None) else ticket.subject
    return dto


def ticket_dto(ticket: Ticket, now: datetime | None = None) -> dict:
    """Full DTO for single-ticket detail — includes all messages."""
    dto = _ticket_base(ticket, now)
    messages = list(ticket.messages) if ticket.messages else []
    last_msg = messages[-1] if messages else None
    dto["preview"] = last_msg.body[:120] if last_msg and getattr(last_msg, "body", None) else ticket.subject
    dto["msgs"] = [message_dto(m) for m in messages]
    if last_msg and getattr(last_msg, "timestamp", None):
        candidates = [ticket.created_at, ticket.updated_at, last_msg.timestamp]
        last_active = max((d for d in candidates if d is not None), default=ticket.created_at)
        dto["time"] = _relative_time(last_active, now)
    return dto


def ticket_assist(ticket: Ticket) -> dict | None:
    if not (ticket.ai_summary or ticket.ai_sentiment):
        return None
    return {
        "reason": ticket.ai_sentiment or "AI triage",
        "summary": ticket.ai_summary or "",
        "chunks": [],
        "suggest": "",
    }


def tenant_dto(tenant: Tenant) -> dict:
    agents_online = sum(
        1 for u in (tenant.users or [])
        if getattr(u, "presence_status", "offline") in ("online", "away") and u.is_active
    )
    return {
        "id": tenant.id,
        "name": tenant.business_name,
        "slug": tenant.slug,
        "email": tenant.email,
        "status": tenant.status,
        "plan": tenant.plan_code,
        "agents": tenant.max_agents,
        "customers": tenant.max_customers,
        "kbMb": tenant.kb_used_mb,
        "volume30d": len(tenant.tickets),
        "color": tenant.primary_color,
        "tone": tenant.brand_tone,
        "city": tenant.city,
        "timezone": getattr(tenant, "timezone", None) or "Africa/Lagos",
        "botName": tenant.bot_name,
        "logoUrl": tenant.logo_url,
        "displayImage": getattr(tenant, "display_image", None),
        "welcomeMessage": tenant.welcome_message,
        "launcherText": tenant.widget_launcher_text,
        "widgetPosition": tenant.widget_position,
        "escalationMessage": tenant.escalation_message,
        "mobileFullscreen": tenant.mobile_fullscreen,
        "proactiveTeaser": tenant.proactive_teaser,
        "secondaryColor": tenant.secondary_color,
        "aiEnabled": getattr(tenant, "ai_enabled", True),
        "aiTokensUsed": getattr(tenant, "ai_tokens_used", 0),
        "aiTokensLimit": getattr(tenant, "ai_tokens_limit", 1000000),
        "aiSystemPrompt": getattr(tenant, "ai_system_prompt", None),
        "agentsOnline": agents_online,
    }


def agent_dto(user: User, membership=None) -> dict:
    tickets = [t for t in user.tenant.tickets if t.assignee_id == user.id] if user.tenant else []
    return {
        "id": user.id,
        "name": user.full_name,
        "role": user.role,
        "online": bool(user.last_seen),
        "email": user.email,
        "tickets": len(tickets),
        "initials": initials_of(user.full_name),
        "color": user.color,
        "resolutions30d": len([t for t in tickets if t.status in ("resolved", "closed")]),
        "csat": None,
        "invitePending": not user.last_seen,
        "tenantId": user.tenant_id,
        "active": user.is_active,
        "inboxScope": (membership.inbox_scope if membership else "all"),
        "presenceStatus": getattr(user, "presence_status", "offline"),
    }


def canned_dto(canned: CannedResponse) -> dict:
    return {"id": canned.id, "label": canned.title, "text": canned.body}


def rule_dto(rule: EscalationRule) -> dict:
    import json as _json

    try:
        terms = _json.loads(rule.terms or "[]")
    except (ValueError, TypeError):
        terms = []
    return {
        "id": rule.id,
        "name": rule.name,
        "desc": rule.desc,
        "preset": rule.preset,
        "enabled": rule.is_active,
        "cond": rule.condition_field,
        "action": rule.action,
        "terms": terms,
        "trigger": rule.trigger_count,
        "lastFired": rule.last_fired_ticket_id,
    }

def article_dto(article: KbArticle) -> dict:
    body = article.content or ""
    snippet = body[:120]
    views = getattr(article, "views", 0) or 0
    helpful_count = getattr(article, "helpful_count", 0) or 0
    unhelpful_count = getattr(article, "unhelpful_count", 0) or 0
    total_feedback = helpful_count + unhelpful_count
    helpful_pct = round((helpful_count / total_feedback) * 100) if total_feedback > 0 else 0
    return {
        "id": article.id,
        "tenantId": article.tenant_id,
        "title": article.title or "",
        "snippet": snippet,
        "content": body,
        "body": body,
        "category": article.category or "General",
        "status": article.status or "draft",
        "createdBy": article.created_by,
        "updatedBy": getattr(article, "updated_by", None),
        "createdAt": article.created_at.isoformat() if getattr(article, "created_at", None) else None,
        "views": views,
        "helpful": helpful_pct,
        "helpfulCount": helpful_count,
        "unhelpfulCount": unhelpful_count,
    }


def knowledge_source_dto(ks: KnowledgeSource) -> dict:
    return {
        "id": ks.id,
        "tenantId": ks.tenant_id,
        "type": ks.source_type.lower(),
        "title": ks.source_name,
        "url": ks.url,
        "sizeKb": ks.size_kb,
        "status": ks.status,
        "chunks": ks.chunk_count,
        "createdAt": ks.created_at.strftime("%b %d") if ks.created_at else "",
    }


def _naira(amount: int) -> str:
    return f"₦{amount:,}"


def canned_dto(crd: CannedResponse) -> dict:
    title = crd.title.strip()
    label = title if title.startswith("/") else f"/{title}"
    return {
        "id": crd.id,
        "label": label,
        "text": crd.body,
        "createdAt": crd.created_at.isoformat() if crd.created_at else None,
    }


def plan_dto(plan: Plan) -> dict:
    mb = plan.kb_quota_mb
    kb_label = f"{mb // 1024} GB" if mb and mb % 1024 == 0 else f"{mb} MB"
    return {
        "id": plan.id,
        "code": plan.code,
        "name": plan.name,
        "price": _naira(plan.price_mo),
        "priceNum": plan.price_mo,
        "agents": plan.max_agents,
        "customers": plan.max_customers,
        "kb": kb_label,
        "tag": plan.tag or "Standard",
        "kbQuotaMb": mb,
        "features": _j(plan.features, []),
    }


def invoice_dto(inv: Invoice) -> dict:
    return {
        "id": inv.id,
        "period": inv.period,
        "amount": _naira(inv.amount),
        "status": inv.status,
        "method": inv.method,
        "tenantId": inv.tenant_id,
        "issuedAt": inv.issued_at.isoformat() if inv.issued_at else None,
        "paidAt": inv.paid_at.isoformat() if inv.paid_at else None,
    }


def webhook_dto(hook: WebhookEndpoint) -> dict:
    return {
        "id": hook.id,
        "name": hook.name,
        "url": hook.url,
        "secret": hook.secret,
        "events": _j(hook.events, []),
        "active": hook.is_active,
        "createdAt": hook.created_at.isoformat() if hook.created_at else None,
    }


def webhook_delivery_dto(delivery: WebhookDelivery, endpoint: WebhookEndpoint | None) -> dict:
    return {
        "id": delivery.id,
        "endpointId": delivery.endpoint_id,
        "endpointName": endpoint.name if endpoint else "deleted",
        "event": delivery.event,
        "status": delivery.status,
        "attempts": delivery.attempts,
        "httpStatus": delivery.http_status,
        "durationMs": delivery.duration_ms,
        "time": delivery.created_at.isoformat() if delivery.created_at else None,
    }


def automation_dto(rule: AutomationRule) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "desc": rule.desc,
        "enabled": rule.is_active,
        "trigger": rule.trigger,
        "conditionMatch": rule.condition_match,
        "conditions": _j(rule.conditions, []),
        "actions": _j(rule.actions, []),
        "interval": _j(rule.interval, None),
        "order": rule.order,
        "runCount": rule.run_count,
        "lastRun": rule.last_run_at.isoformat() if rule.last_run_at else None,
        "createdAt": rule.created_at.isoformat() if rule.created_at else None,
    }


def sla_policy_dto(policy: SlaPolicy, schedule: SlaSchedule | None = None) -> dict:
    return {
        "id": policy.id,
        "name": policy.name,
        "desc": policy.desc,
        "enabled": policy.is_active,
        "match": _j(policy.match, []),
        "targets": _j(policy.targets, []),
        "scheduleId": policy.schedule_id,
        "schedule": sla_schedule_dto(schedule) if schedule else None,
        "escalations": _j(policy.escalations, []),
        "breaches": policy.breaches,
        "createdAt": policy.created_at.isoformat() if policy.created_at else None,
    }


def sla_schedule_dto(schedule: SlaSchedule) -> dict:
    return {
        "id": schedule.id,
        "name": schedule.name,
        "days": _j(schedule.days, []),
        "start": schedule.start,
        "end": schedule.end,
    }


def api_key_dto(key: ApiKey) -> dict:
    return {
        "id": key.id,
        "name": key.name,
        "prefix": key.prefix,
        "scopes": _j(key.scopes, []),
        "createdAt": key.created_at.isoformat() if key.created_at else None,
        "lastUsed": key.last_used_at.isoformat() if key.last_used_at else None,
        "revoked": not key.is_active,
    }


def channel_dto(channel: ChannelSetting) -> dict:
    return {
        "id": channel.channel,
        "label": channel.label,
        "enabled": channel.enabled,
        "connected": channel.connected,
        "detail": channel.detail,
        "phone": channel.phone,
        "address": channel.address,
        "providerStatus": channel.provider_status or ("connected" if channel.connected else "disconnected"),
        "lastError": channel.last_error,
        "webhookUrl": channel.webhook_url,
        "configPresent": bool(json.loads(channel.provider_config or "{}")),
    }


def feature_flag_dto(flag: FeatureFlag) -> dict:
    return {
        "key": flag.key,
        "label": flag.label,
        "desc": flag.desc,
        "enabled": flag.enabled,
        "scope": flag.scope,
    }


def preset_version_dto(preset: PresetVersion) -> dict:
    return {
        "id": preset.id,
        "version": preset.version,
        "label": preset.label,
        "rules": _j(preset.rules, []),
        "createdAt": preset.created_at.isoformat() if preset.created_at else None,
        "createdBy": preset.created_by,
        "note": preset.note,
    }


def notif_prefs_dto(prefs: NotificationPreference) -> dict:
    return {
        "email": _j(prefs.email, {}),
        "push": _j(prefs.push, {}),
        "quietHours": _j(prefs.quiet_hours, {"enabled": False, "start": "22:00", "end": "08:00"}),
    }


def subscription_dto(sub: Subscription, plan: Plan | None) -> dict:
    return {
        "id": sub.id,
        "plan": plan_dto(plan) if plan else None,
        "status": sub.status,
        "trialEndsAt": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "currentPeriodEnd": sub.current_period_end.isoformat() if sub.current_period_end else None,
    }


def customer_dto(customer) -> dict:
    return {
        "id": customer.id,
        "tenantId": customer.tenant_id,
        "email": customer.email,
        "fullName": customer.full_name or "",
        "phone": customer.phone_number or "",
        "company": getattr(customer, "company", ""),
        "location": getattr(customer, "location", ""),
        "notes": getattr(customer, "notes", ""),
        "tags": _j(getattr(customer, "tags", "[]"), []),
        "isVip": bool(customer.is_vip),
        "isActive": bool(getattr(customer, "is_active", True)),
        "accountNumber": customer.account_number or "",
        "ticketCount": len(customer.tickets) if hasattr(customer, "tickets") else 0,
        "createdAt": customer.created_at.isoformat() if customer.created_at else None,
    }


def macro_dto(macro) -> dict:
    return {
        "id": macro.id,
        "tenantId": macro.tenant_id,
        "name": macro.name,
        "description": macro.description,
        "actions": _j(macro.actions, []),
        "visibility": macro.visibility,
        "createdBy": macro.created_by,
        "runCount": macro.run_count,
        "isActive": macro.is_active,
        "createdAt": macro.created_at.isoformat() if macro.created_at else None,
    }


def custom_field_def_dto(field_def) -> dict:
    return {
        "id": field_def.id,
        "tenantId": field_def.tenant_id,
        "name": field_def.name,
        "key": field_def.key,
        "fieldType": field_def.field_type,
        "options": _j(field_def.options, []),
        "appliesTo": field_def.applies_to,
        "required": field_def.required,
        "isActive": field_def.is_active,
        "position": field_def.position,
    }


def custom_field_value_dto(val) -> dict:
    return {
        "id": val.id,
        "fieldDefId": val.field_def_id,
        "entityId": val.entity_id,
        "entityType": val.entity_type,
        "value": val.value,
    }


def business_hours_dto(bh) -> dict:
    return {
        "id": bh.id,
        "tenantId": bh.tenant_id,
        "timezone": bh.timezone,
        "schedule": _j(bh.schedule, {}),
        "outOfHoursMessage": bh.out_of_hours_message,
    }


def ai_usage_dto(log) -> dict:
    return {
        "id": log.id,
        "tenantId": log.tenant_id,
        "ticketId": log.ticket_id,
        "tokensIn": log.tokens_in,
        "tokensOut": log.tokens_out,
        "model": log.model,
        "resolved": log.resolved,
        "createdAt": log.created_at.isoformat() if log.created_at else None,
    }
