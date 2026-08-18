import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, or_

from app.api.deps import Db, get_tenant
from app.core.errors import InsufficientPrivileges, TicketNotFound
from app.core.permissions import TICKETS_MANAGE, require_perm
from app.models import AuditLog, Customer, Label, Message, Notification, Team, Tenant, TenantMember, Ticket, User
from app.models.common import MessageSender, NotificationType, TicketStatus, TicketType
from app.services.event_bus import publish_event
from app.services.serializers import ensure_ticket_number, format_ticket_number, message_dto, ticket_dto

_AGENT_ALLOWED_STATUSES = {"open", "in_progress", "waiting_for_customer", "waiting_internal", "resolved"}
_CUSTOMER_ALLOWED_STATUSES = {"open", "closed"}

def _check_status_transition(user_role: str, new_status: str) -> None:
    if user_role == "agent" and new_status not in _AGENT_ALLOWED_STATUSES:
        raise InsufficientPrivileges(f"Agents cannot set status to '{new_status}'")

router = APIRouter(prefix="/tickets", tags=["tickets"])


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
            qry = qry.filter(Ticket.assignee_id == user.id)
        else:
            my_teams = [t for t in user.teams if t.tenant_id == tenant.id]
            team_ids = [t.id for t in my_teams]
            member_ids = {m.id for t in my_teams for m in t.members}
            qry = qry.filter(or_(
                Ticket.team_id.in_(team_ids),
                Ticket.assignee_id.in_(member_ids),
                Ticket.assignee_id.is_(None),
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
        qry = qry.order_by(Ticket.created_at.desc())

    from sqlalchemy.orm import joinedload, selectinload
    qry = qry.options(
        joinedload(Ticket.customer),
        joinedload(Ticket.assignee),
        joinedload(Ticket.team),
        selectinload(Ticket.labels),
        selectinload(Ticket.messages),
    )
    tickets = qry.distinct().all()
    return [ticket_dto(t) for t in tickets]


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
    publish_event("ticket_created", {"ticket_id": ticket.id, "email": email})
    return ticket_dto(ticket)


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
               user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    return ticket_dto(_get_scoped_ticket(db, tenant, ticket_id))


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

    if user.role == "agent":
        membership = db.query(TenantMember).filter(
            TenantMember.user_id == user.id, TenantMember.tenant_id == tenant.id
        ).first()
        if membership and membership.inbox_scope in ("assigned", "own"):
            if ticket.assignee_id != user.id:
                from app.core.errors import InsufficientPrivileges
                raise InsufficientPrivileges("You can only update tickets assigned to you")

    if body.subject:
        ticket.subject = body.subject
    if body.priority and body.priority in ("low", "medium", "high"):
        ticket.priority = body.priority
    if body.status and body.status in TicketStatus.__members__.values():
        if body.status != ticket.status:
            _check_status_transition(user.role, body.status)
            ticket.status = body.status
            db.add(Message(
                ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                sender_name=user.full_name,
                body=f"Status changed to {body.status.replace('_', ' ')}",
                is_bot=False, is_read=True,
            ))
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
            ticket.assignee_id = body.assignee_id
            db.add(Message(
                ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                sender_name=user.full_name,
                body=(f"Assigned to {new_assignee.full_name}"
                      if new_assignee else "Unassigned"),
                is_bot=False, is_read=True,
            ))
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
            ticket.team_id = body.team_id
            db.add(Message(
                ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                sender_name=user.full_name,
                body=(f"Assigned to team {new_team.name}" if new_team else "Removed from team"),
                is_bot=False, is_read=True,
            ))
    if "unread" in patch:
        ticket.unread = body.unread
    if body.labels is not None:
        ticket.labels = _resolve_labels(db, tenant, body.labels)
    if body.label_ids is not None:
        _apply_label_ids(db, tenant, ticket, body.label_ids)
    if body.internal_note:
        db.add(Message(
            ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
            sender_name=user.full_name, body=body.internal_note, is_bot=False, is_read=True,
            attachments=json.dumps(body.internal_note_attachments) if body.internal_note_attachments else None,
        ))
    db.commit()
    db.refresh(ticket)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status})
    return ticket_dto(ticket)


@router.post("/{ticket_id}/messages")
def send_message(ticket_id: str, body: MessageCreate, db: Db,
                 tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    msg = Message(
        ticket_id=ticket.id, sender_id=user.id,
        sender_type=MessageSender.HUMAN_AGENT,
        sender_name=user.full_name, body=body.body, is_bot=False, is_read=body.is_read,
        reply_to=json.dumps(body.reply_to) if body.reply_to else None,
        attachments=json.dumps(body.attachments) if body.attachments else None,
    )
    db.add(msg)
    if ticket.status == TicketStatus.OPEN:
        ticket.status = TicketStatus.IN_PROGRESS
    # Commit before publishing so realtime subscribers who re-fetch (the agent
    # conversation pane does a wholesale refresh on message_created) can see the
    # row — otherwise the optimistic bubble is wiped by the stale fetch.
    db.commit()
    db.refresh(msg)
    publish_event("message_created", {
        "ticket_id": ticket.id,
        "who": "agent",
        "text": body.body,
        "author": user.full_name,
        "attachments": body.attachments or [],
    })
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status})
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
    if body.attachments is not None:
        msg.attachments = json.dumps(body.attachments) if body.attachments else None
    db.commit()
    db.refresh(msg)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status})
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
    db.delete(msg)
    db.commit()
    publish_event("message_deleted", {"ticket_id": ticket.id, "message_id": message_id})
    return {"ok": True}


@router.delete("/{ticket_id}")
def delete_ticket(ticket_id: str, db: Db,
                  tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_perm(TICKETS_MANAGE))) -> dict:
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    subject = ticket.subject
    customer_name = ticket.customer.full_name if ticket.customer else "Guest"
    
    # Audit log entry (§8 Audit Trail)
    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action="delete_ticket",
        target=f"Ticket {ticket.id}",
        entity_type="ticket",
        entity_id=ticket.id,
        detail=f"Ticket '{ticket.id}' ({subject}) deleted by {user.full_name} ({user.role}) for customer {customer_name}",
        result="ok",
    ))
    
    # Cascade delete messages and label links
    for msg in list(ticket.messages):
        db.delete(msg)
    for lbl in list(ticket.labels):
        ticket.labels.remove(lbl)
    
    db.delete(ticket)
    db.commit()
    publish_event("ticket_deleted", {"ticket_id": ticket_id, "tenant_id": tenant.id})
    return {"ok": True, "id": ticket_id}

