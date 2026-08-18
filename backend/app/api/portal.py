from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_

from pydantic import BaseModel

from app.api.deps import Db, get_optional_user
from app.core.errors import ApiError, InsufficientPrivileges, TenantNotFound, TicketNotFound
from app.models import Customer, KbArticle, Message, Tenant, Ticket, User
from app.models.common import MessageSender, Role, TicketStatus, TicketType
from app.services.event_bus import publish_event
from app.services.serializers import article_dto, ensure_ticket_number, format_ticket_number, ticket_dto

router = APIRouter(prefix="/portal", tags=["portal"])

CHANNELS = ("chat", "whatsapp", "portal", "email")
PRIORITIES = ("low", "medium", "high")


class PortalTicketCreate(BaseModel):
    tenantId: str
    email: str
    cust: str | None = None
    phone: str | None = None
    subject: str
    text: str = ""
    channel: str = "portal"
    priority: str = "medium"
    type: str = "inquiry"
    attachments: list[dict] = []


class PortalTicketsRequest(BaseModel):
    tenantId: str
    email: str


class PortalReopenRequest(BaseModel):
    tenantId: str
    email: str


def _get_tenant(db: Db, tenant_id: str) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        tenant = db.query(Tenant).filter(Tenant.slug == tenant_id.lower()).first()
    if not tenant:
        raise TenantNotFound()
    return tenant


def _get_scoped_ticket(db: Db, tenant: Tenant, ticket_id: str) -> Ticket:
    clean_id = ticket_id.strip()
    ticket = db.get(Ticket, clean_id)
    if ticket and ticket.tenant_id == tenant.id:
        return ticket
    # Case-insensitive id / display-number lookup within this tenant only.
    needle = clean_id.lower()
    qry = db.query(Ticket).filter(Ticket.tenant_id == tenant.id)
    ticket = qry.filter(
        or_(
            Ticket.id.ilike(needle),
            Ticket.id.ilike(f"%{clean_id}%"),
        )
    ).first()
    # Display numbers ({prefix}{YYYYMMDD}{6 digits}) are stored in
    # ticket.display_number — resolve them in Python, still tenant-scoped.
    if not ticket:
        ticket = next(
            (
                t
                for t in qry.all()
                if (format_ticket_number(t).lower() == needle
                    or (t.display_number or "").lower() == needle)
            ),
            None,
        )
    if not ticket:
        raise TicketNotFound()
    return ticket


def _enforce_identity(tenant: Tenant, email: str, user: User | None) -> None:
    """Customer isolation hardening: portal endpoints stay anonymous (widget /
    embed flow) when no token is sent, but a caller presenting an identity must
    be a customer account that belongs to this tenant AND whose email matches
    the one in the request. Anything else is denied — a signed-in customer can
    never look up another email's tickets, and team members cannot drive the
    customer portal under their own token."""
    if user is None:
        return
    if user.role != Role.CUSTOMER:
        raise InsufficientPrivileges("Portal access is restricted to customers")
    if user.tenant_id != tenant.id:
        raise InsufficientPrivileges("Account does not belong to this tenant")
    if (user.email or "").strip().lower() != email.strip().lower():
        raise InsufficientPrivileges("Email does not match the authenticated account")


@router.post("/tickets")
def portal_create_ticket(body: PortalTicketCreate, db: Db,
                         user: User | None = Depends(get_optional_user)) -> dict:
    tenant = _get_tenant(db, body.tenantId)
    email = body.email.strip().lower()
    if not email or "@" not in email or "." not in email:
        raise ApiError("VALIDATION_ERROR", "A valid email is required.", 400)
    _enforce_identity(tenant, email, user)
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
    channel = body.channel if body.channel in CHANNELS else "portal"
    priority = body.priority if body.priority in PRIORITIES else "medium"
    ticket_type = body.type if body.type in TicketType.__members__.values() else TicketType.UNCLASSIFIED
    ticket = Ticket(tenant_id=tenant.id, customer_id=customer.id,
                    subject=body.subject.strip(), channel=channel,
                    priority=priority, ticket_type=ticket_type, unread=True)
    ensure_ticket_number(db, ticket)
    db.add(ticket)
    db.flush()
    ticket_text = body.text.strip() or "No details provided."
    db.add(Message(
        ticket_id=ticket.id, sender_id=None, sender_type=MessageSender.CUSTOMER,
        sender_name=customer.full_name or email, body=ticket_text,
        is_bot=False, is_read=True,
        attachments=json.dumps(body.attachments) if body.attachments else None,
    ))
    db.commit()
    publish_event("ticket_created", {"ticket_id": ticket.id, "email": email})
    publish_event("message_created", {
        "ticket_id": ticket.id,
        "who": "customer",
        "text": ticket_text,
        "attachments": body.attachments or [],
    })

    from app.services import agent, chat_service, escalation
    fired = escalation.evaluate(db, tenant, ticket, ticket_text)
    if fired:
        escalation.apply(db, tenant, ticket, fired)
        publish_event("ticket_escalated", {"ticket_id": ticket.id, "status": ticket.status})
    else:
        try:
            res = agent.invoke_agent(tenant.id, ticket.id, ticket_text)
            reply = str(res.get("reply") or "").strip()
            if reply:
                chat_service.persist_ai_reply(db, ticket.id, reply)
        except Exception:  # noqa: BLE001
            pass

    db.refresh(ticket)
    return ticket_dto(ticket)


@router.post("/tickets/list")
def portal_list_tickets(body: PortalTicketsRequest, db: Db,
                        user: User | None = Depends(get_optional_user)) -> list[dict]:
    tenant = _get_tenant(db, body.tenantId)
    email = body.email.strip().lower()
    _enforce_identity(tenant, email, user)
    customers = (
        db.query(Customer)
        .filter(Customer.tenant_id == tenant.id, Customer.email == email)
        .all()
    )
    customer_ids = [c.id for c in customers]
    if not customer_ids:
        return []
    tickets = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id, Ticket.customer_id.in_(customer_ids))
        .order_by(Ticket.created_at.desc())
        .all()
    )
    return [ticket_dto(t) for t in tickets]


@router.post("/tickets/{ticket_id}/reopen")
def portal_reopen_ticket(ticket_id: str, body: PortalReopenRequest, db: Db,
                         user: User | None = Depends(get_optional_user)) -> dict:
    tenant = _get_tenant(db, body.tenantId)
    _enforce_identity(tenant, body.email, user)
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    customer = ticket.customer
    if not customer or customer.email.lower() != body.email.strip().lower():
        raise TicketNotFound("Ticket not found for this email")
    ticket.status = TicketStatus.OPEN
    ticket.resolved_at = None
    ticket.unread = True
    db.commit()
    db.refresh(ticket)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status})
    return ticket_dto(ticket)


@router.get("/articles")
def portal_articles(db: Db, tenantId: str = Query(...)) -> list[dict]:
    tenant = _get_tenant(db, tenantId)
    articles = (
        db.query(KbArticle)
        .filter(KbArticle.tenant_id == tenant.id, KbArticle.status == "published")
        .all()
    )
    return [article_dto(a) for a in articles]


class ArticleFeedbackRequest(BaseModel):
    helpful: bool


@router.post("/articles/{article_id}/view")
def portal_article_view(article_id: str, db: Db) -> dict:
    article = db.get(KbArticle, article_id)
    if not article:
        raise TicketNotFound("Article not found")
    article.views = (getattr(article, "views", 0) or 0) + 1
    db.commit()
    db.refresh(article)
    return article_dto(article)


@router.post("/articles/{article_id}/feedback")
def portal_article_feedback(article_id: str, body: ArticleFeedbackRequest, db: Db) -> dict:
    article = db.get(KbArticle, article_id)
    if not article:
        raise TicketNotFound("Article not found")
    if body.helpful:
        article.helpful_count = (getattr(article, "helpful_count", 0) or 0) + 1
    else:
        article.unhelpful_count = (getattr(article, "unhelpful_count", 0) or 0) + 1
    db.commit()
    db.refresh(article)
    return article_dto(article)


class PortalReplyRequest(BaseModel):
    tenantId: str
    email: str
    text: str
    attachments: list[dict] = []


@router.post("/tickets/{ticket_id}/reply")
def portal_reply_ticket(ticket_id: str, body: PortalReplyRequest, db: Db,
                        user: User | None = Depends(get_optional_user)) -> dict:
    tenant = _get_tenant(db, body.tenantId)
    email = body.email.strip().lower()
    _enforce_identity(tenant, email, user)
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    if not ticket.customer or ticket.customer.email.lower() != email:
        raise TicketNotFound("Ticket not found for this email")

    ticket.unread = True
    if ticket.status in (TicketStatus.RESOLVED, TicketStatus.CLOSED):
        ticket.status = TicketStatus.OPEN
        ticket.resolved_at = None

    text = body.text.strip()
    msg = Message(
        ticket_id=ticket.id, sender_id=None, sender_type=MessageSender.CUSTOMER,
        sender_name=ticket.customer.full_name or email, body=text,
        is_bot=False, is_read=True,
        attachments=json.dumps(body.attachments) if body.attachments else None,
    )
    db.add(msg)
    db.commit()
    publish_event("message_created", {
        "ticket_id": ticket.id,
        "who": "customer",
        "text": text,
        "attachments": body.attachments or [],
    })
    return ticket_dto(ticket)


@router.post("/tickets/{ticket_id}/close")
def portal_close_ticket(ticket_id: str, body: PortalReopenRequest, db: Db,
                        user: User | None = Depends(get_optional_user)) -> dict:
    from datetime import datetime
    tenant = _get_tenant(db, body.tenantId)
    _enforce_identity(tenant, body.email, user)
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    if not ticket.customer or ticket.customer.email.lower() != body.email.strip().lower():
        raise TicketNotFound("Ticket not found for this email")
        
    ticket.status = TicketStatus.CLOSED
    ticket.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(ticket)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status})
    return ticket_dto(ticket)


class PortalCsatRequest(BaseModel):
    tenantId: str
    email: str
    rating: int
    comment: str = ""


@router.post("/tickets/{ticket_id}/csat")
def portal_csat_ticket(ticket_id: str, body: PortalCsatRequest, db: Db,
                       user: User | None = Depends(get_optional_user)) -> dict:
    tenant = _get_tenant(db, body.tenantId)
    _enforce_identity(tenant, body.email, user)
    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    if not ticket.customer or ticket.customer.email.lower() != body.email.strip().lower():
        raise TicketNotFound("Ticket not found for this email")
        
    ticket.csat_rating = body.rating
    ticket.csat_comment = body.comment
    db.commit()
    db.refresh(ticket)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "csat": ticket.csat_rating})
    return ticket_dto(ticket)
