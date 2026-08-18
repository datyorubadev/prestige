from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import Db, get_current_user, get_tenant, require_admin, require_team
from app.core.errors import ApiError, TicketNotFound
from app.core.permissions import KB_MANAGE, require_perm
from app.core.security import hash_password
from app.models import CannedResponse, Customer, KbArticle, Message, Tenant, Ticket, User
from app.services.serializers import article_dto, canned_dto, format_ticket_number, session_user

router = APIRouter(tags=["kb"])

ARTICLE_STATUSES = ("draft", "pending_review", "published", "archived")

def _check_article_status(status: str) -> str:
    if status not in ARTICLE_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {', '.join(ARTICLE_STATUSES)}")
    return status


# ---------------------------------------------------------------- articles
class ArticleCreate(BaseModel):
    title: str
    content: str = ""
    category: str | None = None
    status: str | None = None


class ArticleUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None
    status: str | None = None


class RejectNote(BaseModel):
    note: str


@router.get("/articles")
def list_articles(db: Db, tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_team),
                  status: str | None = Query(None)) -> list[dict]:
    query = db.query(KbArticle).filter(KbArticle.tenant_id == tenant.id)
    if status:
        query = query.filter(KbArticle.status == status)
    return [article_dto(a) for a in query.all()]


@router.post("/articles")
def create_article(body: ArticleCreate, db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_team)) -> dict:
    from app.core.permissions import KB_MANAGE, has_perm
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required")
    st = "draft"
    if has_perm(user, KB_MANAGE) and body.status:
        st = _check_article_status(body.status)
    article = KbArticle(
        tenant_id=tenant.id, title=title, content=body.content or "",
        category=(body.category or "").strip() or "General",
        status=st,
        created_by=user.id,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return article_dto(article)


@router.get("/articles/{article_id}")
def get_article(article_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                user: User = Depends(require_team)) -> dict:
    article = db.get(KbArticle, article_id)
    if not article or article.tenant_id != tenant.id:
        raise TicketNotFound("Article not found")
    return article_dto(article)


@router.post("/articles/{article_id}/view")
def kb_article_view(article_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                    user: User = Depends(require_team)) -> dict:
    article = db.get(KbArticle, article_id)
    if not article or article.tenant_id != tenant.id:
        raise TicketNotFound("Article not found")
    article.views = (getattr(article, "views", 0) or 0) + 1
    db.commit()
    db.refresh(article)
    return article_dto(article)


class ArticleFeedbackBody(BaseModel):
    helpful: bool


@router.post("/articles/{article_id}/feedback")
def kb_article_feedback(article_id: str, body: ArticleFeedbackBody, db: Db,
                        tenant: Tenant = Depends(get_tenant),
                        user: User = Depends(require_team)) -> dict:
    article = db.get(KbArticle, article_id)
    if not article or article.tenant_id != tenant.id:
        raise TicketNotFound("Article not found")
    if body.helpful:
        article.helpful_count = (getattr(article, "helpful_count", 0) or 0) + 1
    else:
        article.unhelpful_count = (getattr(article, "unhelpful_count", 0) or 0) + 1
    db.commit()
    db.refresh(article)
    return article_dto(article)


@router.put("/articles/{article_id}")
@router.patch("/articles/{article_id}")
def update_article(article_id: str, body: ArticleUpdate, db: Db,
                   tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_team)) -> dict:
    from app.core.permissions import KB_MANAGE, has_perm
    from app.core.errors import InsufficientPrivileges
    article = db.get(KbArticle, article_id)
    if not article or article.tenant_id != tenant.id:
        raise TicketNotFound("Article not found")
    
    can_manage = has_perm(user, KB_MANAGE)
    if not can_manage:
        if article.status != "draft":
            raise InsufficientPrivileges("Agents can only edit drafts")
            
    if body.title is not None:
        article.title = body.title.strip()
    if body.content is not None:
        article.content = body.content
    if body.category is not None:
        article.category = (body.category or "").strip() or "General"
    if body.status is not None:
        if not can_manage and body.status != article.status:
            raise InsufficientPrivileges("Agents cannot change status directly")
        if can_manage:
            article.status = _check_article_status(body.status)
    
    article.updated_by = user.id
    db.commit()
    db.refresh(article)
    return article_dto(article)


@router.post("/articles/{article_id}/submit")
def submit_article(article_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_team)) -> dict:
    from app.core.errors import InsufficientPrivileges
    from datetime import datetime
    article = db.get(KbArticle, article_id)
    if not article or article.tenant_id != tenant.id:
        raise TicketNotFound("Article not found")
    if article.created_by != user.id and user.role == "agent":
        raise InsufficientPrivileges("Can only submit your own drafts")
    if article.status != "draft":
        raise HTTPException(400, "Only drafts can be submitted")
    article.status = "pending_review"
    article.submitted_at = datetime.utcnow()
    db.commit()
    db.refresh(article)
    return article_dto(article)


@router.post("/articles/{article_id}/approve")
def approve_article(article_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                    user: User = Depends(require_perm(KB_MANAGE))) -> dict:
    from datetime import datetime
    article = db.get(KbArticle, article_id)
    if not article or article.tenant_id != tenant.id:
        raise TicketNotFound("Article not found")
    article.status = "published"
    article.published_at = datetime.utcnow()
    article.reviewed_by = user.id
    db.commit()
    db.refresh(article)
    return article_dto(article)


@router.post("/articles/{article_id}/reject")
def reject_article(article_id: str, body: RejectNote, db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(KB_MANAGE))) -> dict:
    article = db.get(KbArticle, article_id)
    if not article or article.tenant_id != tenant.id:
        raise TicketNotFound("Article not found")
    article.status = "draft"
    article.reject_note = body.note
    db.commit()
    db.refresh(article)
    return article_dto(article)


@router.delete("/articles/{article_id}")
def delete_article(article_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(KB_MANAGE))) -> dict:
    article = db.get(KbArticle, article_id)
    if not article or article.tenant_id != tenant.id:
        raise TicketNotFound("Article not found")
    db.delete(article)
    db.commit()
    return {"ok": True, "id": article_id}


# ---------------------------------------------------------------- canned
class CannedCreate(BaseModel):
    label: str
    text: str


class CannedUpdate(BaseModel):
    label: str | None = None
    text: str | None = None


@router.get("/canned")
def list_canned(db: Db, tenant: Tenant = Depends(get_tenant),
                user: User = Depends(require_team)) -> list[dict]:
    return [canned_dto(c) for c in db.query(CannedResponse).filter(CannedResponse.tenant_id == tenant.id).all()]


@router.post("/canned")
def create_canned(body: CannedCreate, db: Db, tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_admin)) -> dict:
    canned = CannedResponse(tenant_id=tenant.id, title=body.label, body=body.text)
    db.add(canned)
    db.commit()
    db.refresh(canned)
    return canned_dto(canned)


@router.put("/canned/{canned_id}")
@router.patch("/canned/{canned_id}")
def update_canned(canned_id: str, body: CannedUpdate, db: Db,
                  tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_admin)) -> dict:
    canned = db.get(CannedResponse, canned_id)
    if not canned or canned.tenant_id != tenant.id:
        raise TicketNotFound("Canned response not found")
    if body.label:
        canned.title = body.label
    if body.text:
        canned.body = body.text
    db.commit()
    db.refresh(canned)
    return canned_dto(canned)


@router.delete("/canned/{canned_id}", status_code=204)
def delete_canned(canned_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_admin)) -> None:
    canned = db.get(CannedResponse, canned_id)
    if not canned or canned.tenant_id != tenant.id:
        raise TicketNotFound("Canned response not found")
    db.delete(canned)
    db.commit()


# ---------------------------------------------------------------- profile
class ProfileUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    password: str | None = None
    color: str | None = None


@router.post("/profile")
def update_profile(body: ProfileUpdate, db: Db, user: User = Depends(get_current_user)) -> dict:
    if body.full_name:
        user.full_name = body.full_name
    if body.email:
        user.email = body.email.lower()
    if body.color:
        user.color = body.color
    if body.password:
        user.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(user)
    return {"user": session_user(user)}


# ---------------------------------------------------------------- past tickets (customer portal)
# ---------------------------------------------------------------- past tickets (customer portal & context rail)
class PastTicketsRequest(BaseModel):
    email: str
    tenant_id: str | None = None
    tenantId: str | None = None


@router.post("/past-tickets")
def past_tickets(body: PastTicketsRequest, db: Db) -> list[dict]:
    tid = body.tenantId or body.tenant_id
    email = body.email.strip().lower() if body.email else ""
    if not tid:
        raise ApiError(
            "VALIDATION_ERROR",
            "tenant_id is required to scope past-ticket lookups",
            400,
        )
    if not email:
        return []

    # Find tenant by ID or slug
    tenant_obj = db.get(Tenant, tid) or db.query(Tenant).filter(Tenant.slug == tid.lower()).first()

    query = db.query(Customer).filter(Customer.email.ilike(email))
    if tenant_obj:
        query = query.filter(Customer.tenant_id == tenant_obj.id)
    customers = query.all()
    customer_ids = [c.id for c in customers]

    if not customer_ids:
        return []

    tickets_query = db.query(Ticket).filter(Ticket.customer_id.in_(customer_ids))
    if tenant_obj:
        tickets_query = tickets_query.filter(Ticket.tenant_id == tenant_obj.id)
    tickets = tickets_query.order_by(Ticket.created_at.desc()).all()

    return [
        {
            "email": body.email,
            "id": t.id,
            "ticketNumber": format_ticket_number(t),
            "subject": t.subject,
            "status": str(t.status.value if hasattr(t.status, "value") else t.status),
            "date": t.created_at.strftime("%b %d") if t.created_at else (t.resolved_at.strftime("%b %d") if t.resolved_at else "Recent"),
            "channel": t.channel or "widget",
            "priority": str(t.priority.value if hasattr(t.priority, "value") else t.priority),
        }
        for t in tickets
    ]


def _get_kb_tenant(db: Db, user: User = Depends(get_current_user)) -> Tenant:
    if user.tenant_id:
        t = db.get(Tenant, user.tenant_id)
        if t:
            return t
    t = db.query(Tenant).filter(Tenant.status == "active").first() or db.query(Tenant).first()
    if t:
        return t
    raise HTTPException(status_code=404, detail="Tenant workspace not found")


# ---------------------------------------------------------------- Auto-Discover FAQs
@router.post("/articles/auto-discover")
def auto_discover_faqs(
    db: Db,
    tenant: Tenant = Depends(_get_kb_tenant),
    user: User = Depends(get_current_user),
) -> dict:
    """Scans resolved customer tickets and automatically generates draft KB articles."""
    tickets = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id)
        .order_by(Ticket.created_at.desc())
        .limit(30)
        .all()
    )

    discovered_count = 0
    new_articles = []

    for t in tickets:
        if not t.subject or len(t.subject.strip()) < 3:
            continue

        resolution_msg = ""
        agent_msgs = [
            m for m in (t.messages or [])
            if m.sender_type in ("human_agent", "ai_bot") and m.body
        ]
        last_agent_msg = agent_msgs[-1] if agent_msgs else None
        if last_agent_msg and last_agent_msg.body and len(last_agent_msg.body.strip()) > 10:
            resolution_msg = last_agent_msg.body.strip()

        if not resolution_msg:
            continue

        clean_title = t.subject.strip()
        existing = db.query(KbArticle).filter(
            KbArticle.tenant_id == tenant.id,
            KbArticle.title.ilike(f"%{clean_title}%"),
        ).first()

        if not existing:
            article = KbArticle(
                tenant_id=tenant.id,
                title=clean_title,
                content=f"### Summary\n\n{resolution_msg}\n\n*Auto-discovered from customer support inquiry `{t.id}`.*",
                category="Auto-Discovered",
                status="draft",
                created_by=user.id,
            )
            db.add(article)
            new_articles.append(article)
            discovered_count += 1

    # Fallback template drafts if tenant has no tickets with agent messages yet
    if discovered_count == 0:
        FALLBACK_FAQS = [
            ("How do I check my transaction and payment status?", "You can check your payment or transfer status by entering your transaction reference ID in the chat widget or account portal.", "Billing & Payments"),
            ("How do I track my active delivery or waybill?", "Enter your tracking waybill number in the support widget or mobile portal to see live transit checkpoints and dispatch rider details.", "Shipping & Logistics"),
            ("What is the refund and reversal turnaround time?", "Standard refunds reflect back in your original payment method within 24 to 48 hours upon approval.", "Refunds"),
            ("How do I update my account contact details?", "Go to Profile Settings in your dashboard or customer portal and click Edit Profile to update your phone and email.", "Account"),
        ]
        for title, content, cat in FALLBACK_FAQS:
            existing = db.query(KbArticle).filter(
                KbArticle.tenant_id == tenant.id,
                KbArticle.title.ilike(f"%{title}%"),
            ).first()
            if not existing:
                article = KbArticle(
                    tenant_id=tenant.id,
                    title=title,
                    content=f"### Overview\n\n{content}\n\n*Auto-discovered draft policy for {tenant.business_name}.*",
                    category=cat,
                    status="draft",
                    created_by=user.id,
                )
                db.add(article)
                new_articles.append(article)
                discovered_count += 1

    if discovered_count > 0:
        db.commit()
        for a in new_articles:
            db.refresh(a)

    return {
        "discovered": discovered_count,
        "articles": [article_dto(a) for a in new_articles],
    }
