import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, or_

from app.api.deps import Db, get_tenant
from app.core.errors import InsufficientPrivileges, TicketNotFound
from app.core.permissions import TICKETS_MANAGE, require_perm
from app.models import AuditLog, Customer, Label, Message, Notification, Team, Tenant, TenantMember, Ticket, User
from app.models.ticket_event import TicketEvent
from app.models.common import MessageSender, NotificationType, TicketStatus, TicketType
from app.services.event_bus import publish_event
from app.services.serializers import ensure_ticket_number, format_ticket_number, message_dto, ticket_dto, ticket_list_dto

_AGENT_ALLOWED_STATUSES = {"open", "in_progress", "waiting_for_customer", "waiting_internal", "resolved", "escalated"}
_CUSTOMER_ALLOWED_STATUSES = {"open", "closed"}

def _check_status_transition(user_role: str, new_status: str) -> None:
    if user_role == "agent" and new_status not in _AGENT_ALLOWED_STATUSES:
        raise InsufficientPrivileges(f"Agents cannot set status to '{new_status}'")


def _log_ticket_event(db, ticket, user, event_type, field=None, old_value=None, new_value=None, detail=None):
    from app.services.ticket_activity import record
    record(db, ticket.id, ticket.tenant_id, user.full_name, event_type,
           actor_id=user.id, field=field, old_value=old_value,
           new_value=new_value, detail=detail)

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get("/count")
def ticket_count(
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(TICKETS_MANAGE)),
    status: str | None = Query(default=None),
) -> dict:
    """Lightweight badge-count endpoint — returns just the total, no ticket rows."""
    from sqlalchemy import func
    qry = db.query(func.count(Ticket.id)).filter(Ticket.tenant_id == tenant.id)
    if status and status != "all":
        if status == "open":
            qry = qry.filter(Ticket.status.notin_(["resolved", "closed"]))
        else:
            qry = qry.filter(Ticket.status == status)
    return {"count": qry.scalar() or 0}


class TicketUpdate(BaseModel):
    assignee_id: str | None = None
    team_id: str | None = None
    status: str | None = None
    priority: str | None = None
    subject: str | None = None
    labels: list[str] | None = None
    label_ids: list[str] | None = None
    unread: bool | None = None
    internal_note: str | None = None
    internal_note_attachments: list[dict] | None = None
    ai_paused: bool | None = None  # hand the thread back to the bot / take over


class TicketCreate(BaseModel):
    subject: str
    email: str
    cust: str | None = None
    phone: str | None = None
    channel: str = "portal"
    priority: str = "medium"
    type: str = "inquiry"
    text: str = ""


class MessageCreate(BaseModel):
    body: str
    sender_type: str = "human_agent"
    is_read: bool = True
    reply_to: dict | None = Field(default=None, alias="replyTo")
    attachments: list[dict] | None = None


def _get_scoped_ticket(db: Db, tenant: Tenant, ticket_id: str) -> Ticket:
    clean_id = ticket_id.strip()

    # 1. Direct primary key lookup (exact id)
    ticket = db.get(Ticket, clean_id)
    if ticket and (not tenant or ticket.tenant_id == tenant.id):
        return ticket

    # 2. Case-insensitive id / display-number lookup within tenant scope only.
    #    Object-level isolation: a caller in tenant A must never resolve a
    #    ticket owned by tenant B, even by guessing its id.
    query = db.query(Ticket)
    if tenant:
        query = query.filter(Ticket.tenant_id == tenant.id)
    needle = clean_id.lower()
    ticket = query.filter(
        or_(
            Ticket.id.ilike(needle),
            Ticket.id.ilike(f"%{clean_id}%"),
            Ticket.subject.ilike(f"%{clean_id}%"),
        )
    ).first()

    # 3. Formatted display-number fallback: ticket numbers like NAI20260814786523
    #    are stored in ticket.display_number, but for resilience resolve via the
    #    serializer too — still within the tenant scope only.
    if not ticket:
        needle_num = needle.lstrip("tck")
        ticket = next(
            (
                t
                for t in query.all()
                if (format_ticket_number(t).lower() == needle
                    or (t.display_number or "").lower() == needle_num)
            ),
            None,
        )

    if not ticket:
        raise TicketNotFound(f"Ticket '{ticket_id}' not found")
    return ticket


def _resolve_labels(db: Db, tenant: Tenant, names: list[str]) -> list[Label]:
    from app.api.labels import resolve_or_create

    out: list[Label] = []
    for name in names:
        label = resolve_or_create(db, tenant, name.strip())
        if label:
            out.append(label)
    return out


def _apply_label_ids(db: Db, tenant: Tenant, ticket: Ticket, label_ids: list[str]) -> None:
    if label_ids is None:
        return
    labels = (
        db.query(Label).filter(Label.tenant_id == tenant.id, Label.id.in_(label_ids)).all()
    )
    ticket.labels = labels


@router.get("")
def list_tickets(
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(TICKETS_MANAGE)),
    status: str | None = Query(default=None),
    assignee: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    channel: str | None = Query(default=None),
    label: str | None = Query(default=None),
    q: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    mine: bool = Query(default=False),
    unassigned: bool = Query(default=False),
    escalated: bool = Query(default=False),
    resolved: bool = Query(default=False),
    mentions: bool = Query(default=False),
    unread_only: bool = Query(default=False),
    team: str | None = Query(default=None),
) -> list[dict]:
    if user.role == "super_admin":
        qry = db.query(Ticket)
    else:
        qry = db.query(Ticket).filter(Ticket.tenant_id == tenant.id)
    # P4 inbox scoping: agents bound to "assigned"/"team" only see their slice.
    membership = (
        db.query(TenantMember)
        .filter(TenantMember.user_id == user.id, TenantMember.tenant_id == tenant.id)
        .first()
    )
    if user.role == "agent" and membership and membership.inbox_scope in ("assigned", "own", "team"):
        if membership.inbox_scope in ("assigned", "own"):
            qry = qry.filter(or_(Ticket.assignee_id == user.id, Ticket.status == "escalated"))
        else:
            my_teams = [t for t in user.teams if t.tenant_id == tenant.id]
            team_ids = [t.id for t in my_teams]
            member_ids = {m.id for t in my_teams for m in t.members}
            qry = qry.filter(or_(
                Ticket.team_id.in_(team_ids),
                Ticket.assignee_id.in_(member_ids),
                Ticket.assignee_id.is_(None),
                Ticket.status == "escalated",
            ))
    if status and status != "all":
        qry = qry.filter(Ticket.status == status)
    if priority:
        qry = qry.filter(Ticket.priority == priority)
    if channel:
        qry = qry.filter(Ticket.channel == channel)
    if assignee:
        if assignee == "__unassigned__":
            qry = qry.filter(Ticket.assignee_id.is_(None))
        else:
            qry = qry.filter(Ticket.assignee_id == assignee)
    if team:
        if team == "__none__":
            qry = qry.filter(Ticket.team_id.is_(None))
        else:
            qry = qry.filter(Ticket.team_id == team)
    if unassigned:
        qry = qry.filter(
            Ticket.assignee_id.is_(None),
            Ticket.status.notin_(["resolved", "closed"]),
        )
    if escalated:
        qry = qry.filter(Ticket.status == "escalated")
    if resolved:
        qry = qry.filter(Ticket.status.in_(["resolved", "closed"]))
    if mine:
        qry = qry.filter(Ticket.assignee_id == user.id)
    if unread_only:
        qry = qry.filter(Ticket.unread.is_(True))
    if label:
        qry = qry.join(Ticket.labels).filter(Label.name == label)
    if mentions and user.full_name:
        # A ticket is "mentioning" the agent when an internal note (system
        # message) references @Full Name (Chatwoot @mention parity).
        qry = qry.join(Ticket.messages).filter(
            Message.sender_type == "system",
            Message.body.like(f"%@{user.full_name}%"),
        )
    if q and q.strip():
        needle = f"%{q.strip()}%"
        qry = qry.outerjoin(Ticket.customer).filter(
            or_(
                Ticket.subject.ilike(needle),
                Ticket.id.ilike(needle),
                Customer.full_name.ilike(needle),
                Customer.email.ilike(needle),
            )
        )
    if sort == "oldest":
        qry = qry.order_by(Ticket.created_at.asc())
    elif sort == "priority":
        rank = case(
            (Ticket.priority == "high", 3),
            (Ticket.priority == "medium", 2),
            else_=1,
        )
        qry = qry.order_by(rank.desc())
    elif sort == "sla":
        qry = qry.order_by(Ticket.sla_seconds_left.asc().nulls_last())
    elif sort == "subject":
        qry = qry.order_by(Ticket.subject.asc())
    else:
        # Default: most recently active tickets first (bubbles tickets
        # with new messages to the top of the inbox).
        qry = qry.order_by(Ticket.updated_at.desc())

    from sqlalchemy.orm import joinedload, selectinload
    from sqlalchemy import func, literal_column
    qry = qry.options(
        joinedload(Ticket.customer),
        joinedload(Ticket.assignee),
        joinedload(Ticket.team),
        selectinload(Ticket.labels),
    )
    tickets = qry.distinct().all()

    # Efficiently fetch last message per ticket in a single query instead of
    # loading ALL messages via selectinload (the #1 perf killer).
    if tickets:
        ticket_ids = [t.id for t in tickets]
        subq = (
            db.query(
                Message.ticket_id,
                Message.body,
                Message.timestamp,
                func.row_number().over(
                    partition_by=Message.ticket_id,
                    order_by=Message.timestamp.desc(),
                ).label("rn"),
            )
            .filter(Message.ticket_id.in_(ticket_ids))
            .subquery()
        )
        last_msgs = (
            db.query(subq.c.ticket_id, subq.c.body, subq.c.timestamp)
            .filter(subq.c.rn == 1)
            .all()
        )
        last_msg_map: dict[str, tuple[str, datetime]] = {}
        for tid, body, ts in last_msgs:
            last_msg_map[tid] = (body, ts)
        # Attach as a lightweight attribute so ticket_list_dto can read it.
        for t in tickets:
            item = last_msg_map.get(t.id)
            if item:
                t._last_message = type("_M", (), {"body": item[0], "timestamp": item[1]})()
            else:
                t._last_message = None

    return [ticket_list_dto(t) for t in tickets]


@router.post("")
def create_ticket(body: TicketCreate, db: Db, tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    email = body.email.strip().lower()
    customer = (
        db.query(Customer)
        .filter(Customer.tenant_id == tenant.id, Customer.email == email)
        .first()
    )
    if not customer:
        customer = Customer(tenant_id=tenant.id, email=email,
                            full_name=(body.cust or "").strip() or None,
                            phone_number=body.phone)
        db.add(customer)
        db.flush()
    channel = body.channel if body.channel in ("chat", "whatsapp", "portal", "email") else "portal"
    priority = body.priority if body.priority in ("low", "medium", "high") else "medium"
    ticket_type = body.type if body.type in TicketType.__members__.values() else TicketType.UNCLASSIFIED
    import random
    now = datetime.utcnow()
    date_str = now.strftime("%Y%m%d")
    rand_str = f"{random.randint(100000, 999999)}"
    ticket_id = f"TCK{date_str}{rand_str}"
    ticket = Ticket(id=ticket_id, tenant_id=tenant.id, customer_id=customer.id,
                    subject=body.subject.strip(), channel=channel,
                    priority=priority, ticket_type=ticket_type, unread=True)
    ensure_ticket_number(db, ticket)
    db.add(ticket)
    db.flush()
    db.add(Message(
        ticket_id=ticket.id, sender_id=None, sender_type=MessageSender.CUSTOMER,
        sender_name=customer.full_name or email, body=body.text.strip() or "No details provided.",
        is_bot=False, is_read=True,
    ))
    db.commit()
    db.refresh(ticket)
    _log_ticket_event(db, ticket, user, "ticket_created",
                      detail=f"Ticket created via {channel} for {customer.full_name or email} — “{ticket.subject}”")
    db.commit()
    publish_event("ticket_created", {"ticket_id": ticket.id, "email": email, "channel": channel}, tenant_id=tenant.id)
    return ticket_dto(ticket)


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
               user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    from sqlalchemy.orm import joinedload, selectinload
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    # Eager-load relationships to avoid N+1 lazy-load cascade (5 extra queries).
    db.refresh(ticket, ["customer", "assignee", "team"])
    _ = ticket.labels
    _ = ticket.messages
    return ticket_dto(ticket)


@router.get("/{ticket_id}/messages")
def get_messages(ticket_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_perm(TICKETS_MANAGE))) -> list[dict]:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    return [message_dto(m) for m in ticket.messages]


@router.get("/{ticket_id}/assist")
def get_assist(ticket_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
               user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict | None:
    return ticket_dto(_get_scoped_ticket(db, tenant, ticket_id))["assist"]


@router.patch("/{ticket_id}")
def update_ticket(ticket_id: str, body: TicketUpdate, db: Db,
                  tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    patch = body.model_dump(exclude_unset=True)
    _new_system_msgs: list[Message] = []
    _escalated = False
    _assigned_to_id: str | None = None

    if user.role == "agent":
        membership = db.query(TenantMember).filter(
            TenantMember.user_id == user.id, TenantMember.tenant_id == tenant.id
        ).first()
        if membership and membership.inbox_scope in ("assigned", "own"):
            if ticket.assignee_id != user.id and ticket.status != "escalated":
                from app.core.errors import InsufficientPrivileges
                raise InsufficientPrivileges("You can only update tickets assigned to you")

    if body.subject:
        ticket.subject = body.subject
    if body.priority and body.priority in ("low", "medium", "high"):
        if body.priority != ticket.priority:
            _log_ticket_event(db, ticket, user, "priority_changed",
                              field="priority", old_value=ticket.priority, new_value=body.priority)
            ticket.priority = body.priority
    if body.status and body.status in TicketStatus.__members__.values():
        if body.status != ticket.status:
            _check_status_transition(user.role, body.status)
            old_status = ticket.status
            ticket.status = body.status
            _log_ticket_event(db, ticket, user, "status_changed",
                              field="status", old_value=old_status, new_value=body.status)
            _status_msg = Message(
                ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                sender_name=user.full_name,
                body=f"Status changed to {body.status.replace('_', ' ')}",
                is_bot=False, is_read=True,
            )
            db.add(_status_msg)
            _new_system_msgs.append(_status_msg)
            if body.status == "escalated":
                _escalated = True
                ticket.escalated_at = datetime.utcnow()
                if not ticket.ai_summary:
                    last_cust_msg = next(
                        (m.body for m in reversed(ticket.messages or []) if m.sender_type == MessageSender.CUSTOMER),
                        None,
                    )
                    ticket.ai_summary = f"Escalated by {user.full_name} — “{(last_cust_msg or ticket.subject)[:140]}”"
                    ticket.ai_sentiment = "Manual escalation"
        if body.status in ("resolved", "closed"):
            ticket.resolved_at = ticket.resolved_at or datetime.utcnow()
    if "assignee_id" in patch:
        new_assignee = None
        if body.assignee_id:
            if user.role == "agent":
                my_team_member_ids = {m.id for t in user.teams if t.tenant_id == tenant.id for m in t.members}
                my_team_member_ids.add(user.id)
                if body.assignee_id not in my_team_member_ids:
                    from app.core.errors import InsufficientPrivileges
                    raise InsufficientPrivileges("Agents can only assign to their own team members")
            new_assignee = db.get(User, body.assignee_id)
            if not new_assignee or new_assignee.tenant_id != tenant.id:
                raise TicketNotFound("Assignee not found in this tenant")
        if ticket.assignee_id != body.assignee_id:
            old_assignee_name = ticket.assignee.full_name if ticket.assignee else "Unassigned"
            ticket.assignee_id = body.assignee_id
            new_name = new_assignee.full_name if new_assignee else "Unassigned"
            _log_ticket_event(db, ticket, user, "assignee_changed",
                              field="assignee", old_value=old_assignee_name, new_value=new_name)
            _assign_msg = Message(
                ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                sender_name=user.full_name,
                body=(f"Assigned to {new_assignee.full_name}"
                      if new_assignee else "Unassigned"),
                is_bot=False, is_read=True,
            )
            db.add(_assign_msg)
            _new_system_msgs.append(_assign_msg)
            _assigned_to_id = body.assignee_id
        if new_assignee and new_assignee.id != user.id:
            db.add(Notification(
                tenant_id=tenant.id, user_id=new_assignee.id, type=NotificationType.TICKET_ASSIGNED,
                title=f"Ticket {format_ticket_number(ticket)} assigned to you", body=ticket.subject,
                ticket_id=ticket.id,
            ))
    if "team_id" in patch:
        new_team = None
        if body.team_id:
            new_team = db.get(Team, body.team_id)
            if not new_team or new_team.tenant_id != tenant.id:
                raise TicketNotFound("Team not found")
        if ticket.team_id != body.team_id:
            old_team_name = ticket.team.name if ticket.team else "No team"
            ticket.team_id = body.team_id
            _log_ticket_event(db, ticket, user, "team_changed",
                              field="team", old_value=old_team_name,
                              new_value=new_team.name if new_team else "No team")
            _team_msg = Message(
                ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                sender_name=user.full_name,
                body=(f"Assigned to team {new_team.name}" if new_team else "Removed from team"),
                is_bot=False, is_read=True,
            )
            db.add(_team_msg)
            _new_system_msgs.append(_team_msg)
    if "unread" in patch:
        ticket.unread = body.unread
    if "ai_paused" in patch and body.ai_paused is not None:
        new_val = bool(body.ai_paused)
        if bool(getattr(ticket, "ai_paused", False)) != new_val:
            ticket.ai_paused = new_val
            _log_ticket_event(db, ticket, user, "ai_control",
                              field="ai_paused",
                              old_value="off" if new_val else "on",
                              new_value="on" if new_val else "off",
                              detail=("AI paused — human took over the conversation"
                                      if new_val else
                                      f"AI re-enabled by {user.full_name} — the bot will reply again"))
            _ai_msg = Message(
                ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                sender_name=user.full_name,
                body=("AI assistant paused — a human agent is handling this conversation."
                      if new_val else
                      f"AI assistant re-enabled by {user.full_name}."),
                is_bot=False, is_read=True,
            )
            db.add(_ai_msg)
            _new_system_msgs.append(_ai_msg)
            publish_event("ticket_updated", {"ticket_id": ticket.id}, tenant_id=tenant.id)
    if body.labels is not None or body.label_ids is not None:
        old_labels = ", ".join(sorted(l.name for l in ticket.labels)) or "none"
        if body.labels is not None:
            ticket.labels = _resolve_labels(db, tenant, body.labels)
        if body.label_ids is not None:
            _apply_label_ids(db, tenant, ticket, body.label_ids)
        new_labels = ", ".join(sorted(l.name for l in ticket.labels)) or "none"
        if new_labels != old_labels:
            _log_ticket_event(db, ticket, user, "label_changed",
                              field="labels", old_value=old_labels, new_value=new_labels)
    if body.internal_note:
        _note_msg = Message(
            ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
            sender_name=user.full_name, body=body.internal_note, is_bot=False, is_read=True,
            attachments=json.dumps(body.internal_note_attachments) if body.internal_note_attachments else None,
        )
        db.add(_note_msg)
        _new_system_msgs.append(_note_msg)
        _log_ticket_event(db, ticket, user, "note_added",
                          detail=f"Internal note: \u201c{body.internal_note[:120]}\u201d")
    db.commit()
    db.refresh(ticket)
    for _sys_msg in _new_system_msgs:
        db.refresh(_sys_msg)
        publish_event("message_created", {
            "ticket_id": ticket.id, "message_id": _sys_msg.id,
            "who": "system", "text": _sys_msg.body,
            "author": _sys_msg.sender_name, "kind": "note",
        }, tenant_id=tenant.id)
    if _escalated:
        publish_event("ticket_escalated", {
            "ticket_id": ticket.id,
            "status": "escalated",
            "priority": ticket.priority,
            "assist": {
                "reason": ticket.ai_sentiment or "AI triage",
                "summary": ticket.ai_summary or "",
                "chunks": [],
                "suggest": "",
            },
        }, tenant_id=tenant.id)
    if _assigned_to_id is not None:
        publish_event("ticket_assigned", {
            "ticket_id": ticket.id, "assignee_id": _assigned_to_id,
            "assigned_by": user.id, "assigned_by_name": user.full_name,
        }, tenant_id=tenant.id)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status}, tenant_id=tenant.id)
    return ticket_dto(ticket)


@router.post("/{ticket_id}/messages")
def send_message(ticket_id: str, body: MessageCreate, db: Db,
                 tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    # Map frontend sender_type to enum — "system" for internal notes,
    # "human_agent" for regular replies.
    sender_type_str = body.sender_type if body.sender_type in ("system", "human_agent") else "human_agent"
    sender_type_enum = MessageSender(sender_type_str)
    msg = Message(
        ticket_id=ticket.id, sender_id=user.id,
        sender_type=sender_type_enum,
        sender_name=user.full_name, body=body.body, is_bot=False, is_read=body.is_read,
        reply_to=json.dumps(body.reply_to) if body.reply_to else None,
        attachments=json.dumps(body.attachments) if body.attachments else None,
    )
    db.add(msg)
    if ticket.status == TicketStatus.OPEN:
        ticket.status = TicketStatus.IN_PROGRESS
    # Human ownership: an actual agent reply hands the conversation from AI
    # to the human for good — the bot stays quiet until re-enabled.
    if sender_type_enum == MessageSender.HUMAN_AGENT and not getattr(ticket, "ai_paused", False):
        ticket.ai_paused = True
        _log_ticket_event(db, ticket, user, "ai_control",
                          field="ai_paused", old_value="on", new_value="off",
                          detail=f"AI paused — {user.full_name} replied and took over the conversation")
    # Bump updated_at so the ticket bubbles to the top of inboxes sorted
    # by most-recent-activity (the default sort).
    ticket.updated_at = datetime.utcnow()
    # Commit before publishing so realtime subscribers who re-fetch (the agent
    # conversation pane does a wholesale refresh on message_created) can see the
    # row — otherwise the optimistic bubble is wiped by the stale fetch.
    db.commit()
    db.refresh(msg)
    _log_ticket_event(db, ticket, user,
                      "note_added" if sender_type_enum == MessageSender.SYSTEM else "reply_added",
                      detail=("Internal note: " if sender_type_enum == MessageSender.SYSTEM else "Reply: ")
                      + f"\u201c{body.body[:120]}\u201d")
    event_data: dict = {
        "ticket_id": ticket.id,
        "message_id": msg.id,
        "who": sender_type_str,
        "text": body.body,
        "author": user.full_name,
        "attachments": body.attachments or [],
    }
    if sender_type_enum == MessageSender.SYSTEM:
        event_data["kind"] = "note"
    publish_event("message_created", event_data, tenant_id=tenant.id)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status}, tenant_id=tenant.id)
    from app.services.channels.outbound import dispatch_outbound

    dispatch_outbound(db, ticket, body.body, "agent")
    return message_dto(msg)


class MessageUpdate(BaseModel):
    body: str
    attachments: list[dict] | None = None


@router.put("/{ticket_id}/messages/{message_id}")
@router.patch("/{ticket_id}/messages/{message_id}")
def update_message(ticket_id: str, message_id: str, body: MessageUpdate, db: Db,
                   tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    msg = db.get(Message, message_id)
    if not msg or msg.ticket_id != ticket.id:
        raise TicketNotFound("Message not found")
    msg.body = body.body
    msg.edited = True
    if body.attachments is not None:
        msg.attachments = json.dumps(body.attachments) if body.attachments else None
    db.commit()
    db.refresh(msg)
    _log_ticket_event(db, ticket, user, "message_edited",
                      detail=f'Message edited: "{body.body[:120]}"')
    publish_event("message_updated", {
        "ticket_id": ticket.id, "message_id": message_id,
        "body": body.body, "edited": True,
    }, tenant_id=tenant.id)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status}, tenant_id=tenant.id)
    return message_dto(msg)


@router.delete("/{ticket_id}/messages/{message_id}")
def delete_message(ticket_id: str, message_id: str, db: Db,
                   tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    msg = db.get(Message, message_id)
    if not msg or msg.ticket_id != ticket.id:
        raise TicketNotFound("Message not found")
    if msg.sender_type != MessageSender.HUMAN_AGENT:
        raise TicketNotFound("Only agent messages can be deleted")
    deleted_body = msg.body[:120] if msg.body else ""
    db.delete(msg)
    db.commit()
    _log_ticket_event(db, ticket, user, "message_deleted",
                      detail=f'Message deleted: "{deleted_body}"')
    publish_event("message_deleted", {"ticket_id": ticket.id, "message_id": message_id}, tenant_id=tenant.id)
    return {"ok": True}


@router.delete("/{ticket_id}")
def delete_ticket(ticket_id: str, db: Db,
                  tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    subject = ticket.subject
    customer_name = ticket.customer.full_name if ticket.customer else "Guest"
    canonical_id = str(ticket.id)
    
    # Audit log entry (§8 Audit Trail)
    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action="delete_ticket",
        entity_type="ticket",
        entity_id=canonical_id,
        detail=f"Ticket '{canonical_id}' ({subject}) deleted by {user.full_name} ({user.role}) for customer {customer_name}",
        result="ok",
    ))
    
    # Cascade clean up all foreign key references before deleting ticket
    from app.models.callback import CallbackBooking
    from app.models.doc_verify import DocVerifyRecord
    from app.models.kyc import KYCVerificationSession

    db.query(TicketEvent).filter(TicketEvent.ticket_id == canonical_id).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.ticket_id == canonical_id).delete(synchronize_session=False)
    db.query(CallbackBooking).filter(CallbackBooking.ticket_id == canonical_id).delete(synchronize_session=False)
    db.query(DocVerifyRecord).filter(DocVerifyRecord.ticket_id == canonical_id).delete(synchronize_session=False)
    db.query(KYCVerificationSession).filter(KYCVerificationSession.ticket_id == canonical_id).delete(synchronize_session=False)
    db.query(Ticket).filter(Ticket.merged_into_id == canonical_id).update({Ticket.merged_into_id: None}, synchronize_session=False)

    for msg in list(ticket.messages):
        db.delete(msg)
    ticket.labels.clear()
    
    db.delete(ticket)
    db.commit()
    publish_event("ticket_deleted", {"ticket_id": canonical_id, "tenant_id": tenant.id}, tenant_id=tenant.id)
    return {"ok": True, "id": canonical_id}


# ── Snooze / Remind ──────────────────────────────────────────────

class SnoozeRequest(BaseModel):
    until: str  # ISO datetime string


@router.post("/{ticket_id}/snooze")
def snooze_ticket(ticket_id: str, body: SnoozeRequest, db: Db,
                  tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    from dateutil.parser import isoparse
    until_dt = isoparse(body.until)
    ticket.snoozed_until = until_dt
    _log_ticket_event(db, ticket, user, "snoozed",
                      field="snoozed_until", new_value=body.until,
                      detail=f"Snoozed until {until_dt.strftime('%b %d, %Y %I:%M %p')}")
    db.add(Message(
        ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
        sender_name=user.full_name,
        body=f"Snoozed until {until_dt.strftime('%b %d, %Y %I:%M %p')}",
        is_bot=False, is_read=True,
    ))
    db.commit()
    db.refresh(ticket)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status}, tenant_id=tenant.id)
    return ticket_dto(ticket)


@router.post("/{ticket_id}/unsnooze")
def unsnooze_ticket(ticket_id: str, db: Db,
                    tenant: Tenant = Depends(get_tenant),
                    user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    old = ticket.snoozed_until
    ticket.snoozed_until = None
    _log_ticket_event(db, ticket, user, "unsnoozed",
                      field="snoozed_until", old_value=str(old) if old else None, new_value=None)
    db.commit()
    db.refresh(ticket)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status}, tenant_id=tenant.id)
    return ticket_dto(ticket)


# ── Merge ────────────────────────────────────────────────────────

class MergeRequest(BaseModel):
    primary_ticket_id: str | None = None  # legacy single-merge field
    merge_ids: list[str] = Field(default_factory=list)  # tickets folded INTO this one


@router.post("/{ticket_id}/merge")
def merge_ticket(ticket_id: str, body: MergeRequest, db: Db,
                 tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    primary = _get_scoped_ticket(db, tenant, ticket_id)

    # Accept the current ticket as PRIMARY and fold every listed ticket into
    # it. Legacy callers that passed primary_ticket_id still work.
    secondary_ids = [i for i in body.merge_ids if i]
    if body.primary_ticket_id:
        secondary_ids.append(body.primary_ticket_id)
    secondary_ids = [i for i in dict.fromkeys(secondary_ids) if i != primary.id]
    if not secondary_ids:
        raise TicketNotFound("No tickets selected to merge")

    merged_numbers: list[str] = []
    for sec_id in secondary_ids:
        sec = _get_scoped_ticket(db, tenant, sec_id)
        # Move messages from secondary to primary
        for msg in sec.messages:
            msg.ticket_id = primary.id
        # Transfer labels
        for lbl in sec.labels:
            if lbl not in primary.labels:
                primary.labels.append(lbl)
        sec.merged_into_id = primary.id
        sec.status = "closed"
        num = format_ticket_number(sec)
        merged_numbers.append(num)
        _log_ticket_event(db, primary, user, "ticket_merged",
                          detail=f"Ticket {num} merged into this conversation")
        _log_ticket_event(db, sec, user, "ticket_merged_away",
                          detail=f"Merged into ticket {format_ticket_number(primary)} — this conversation is closed")
        db.add(Message(
            ticket_id=primary.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
            sender_name=user.full_name,
            body=f"Ticket {num} was merged into this conversation",
            is_bot=False, is_read=True,
        ))

    db.commit()
    db.refresh(primary)
    publish_event("ticket_updated", {"ticket_id": primary.id, "status": primary.status}, tenant_id=tenant.id)
    for sid in secondary_ids:
        publish_event("ticket_updated", {"ticket_id": sid}, tenant_id=tenant.id)
    return {"ticket": ticket_dto(primary), "merged_count": len(merged_numbers), "merged": merged_numbers}


# ── Activity Timeline ────────────────────────────────────────────

@router.get("/{ticket_id}/events")
def get_ticket_events(ticket_id: str, db: Db,
                      tenant: Tenant = Depends(get_tenant),
                      user: User = Depends(require_perm(TICKETS_MANAGE))) -> list[dict]:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    events = (
        db.query(TicketEvent)
        .filter(TicketEvent.ticket_id == ticket.id)
        .order_by(TicketEvent.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": e.id,
            "eventType": e.event_type,
            "field": e.field,
            "oldValue": e.old_value,
            "newValue": e.new_value,
            "detail": e.detail,
            "actorName": e.actor_name,
            "actorId": e.actor_id,
            "createdAt": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]


# ── Agent Collision / Presence ───────────────────────────────────

class PresenceRequest(BaseModel):
    action: str  # "enter" or "leave"


@router.post("/{ticket_id}/presence")
def ticket_presence(ticket_id: str, body: PresenceRequest, db: Db,
                    tenant: Tenant = Depends(get_tenant),
                    user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    publish_event("ticket_presence", {
        "ticket_id": ticket.id,
        "user_id": user.id,
        "user_name": user.full_name,
        "action": body.action,
    }, tenant_id=tenant.id)
    return {"ok": True}

