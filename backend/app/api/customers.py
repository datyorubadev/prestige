"""Customer management API (§4 Owner, §5 Agent read).

Owners get full CRUD; agents get read + limited update;
customers get own profile only. All queries are tenant-scoped.
"""
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.deps import Db, get_current_user, get_tenant, require_team
from app.core.errors import InsufficientPrivileges, TicketNotFound
from app.core.permissions import CUSTOMERS_MANAGE, CUSTOMERS_VIEW, require_perm
from app.models import Customer, Tenant, Ticket, User
from app.services.serializers import customer_dto, format_ticket_number, ticket_dto
from app.services.tz import fmt_in_tz

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerCreate(BaseModel):
    email: str
    full_name: str | None = None
    phone_number: str | None = None
    company: str | None = None
    location: str | None = None
    notes: str | None = None
    tags: list[str] = []
    is_vip: bool = False


class CustomerUpdate(BaseModel):
    full_name: str | None = None
    phone_number: str | None = None
    company: str | None = None
    location: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    is_vip: bool | None = None
    is_active: bool | None = None


@router.get("/past-tickets")
def get_past_tickets(
    db: Db,
    email: str = Query(...),
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOMERS_VIEW)),
) -> list[dict]:
    clean_email = email.strip().lower()
    if not clean_email:
        return []
    customers = db.query(Customer).filter(
        Customer.tenant_id == tenant.id,
        Customer.email.ilike(clean_email),
    ).all()
    customer_ids = [c.id for c in customers]
    if not customer_ids:
        return []
    tickets = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id, Ticket.customer_id.in_(customer_ids))
        .order_by(Ticket.created_at.desc())
        .all()
    )
    return [
        {
            "id": t.id,
            "ticketNumber": format_ticket_number(t),
            "display_number": format_ticket_number(t),
            "subject": t.subject,
            "date": fmt_in_tz(t.created_at, "%b %d, %Y", tenant) if t.created_at else "Recently",
            "status": t.status,
            "sentiment": t.sentiment or "Neutral",
            "email": t.customer.email if t.customer else clean_email,
        }
        for t in tickets
    ]


@router.get("")
def list_customers(
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOMERS_VIEW)),
    q: str | None = Query(default=None),
    vip_only: bool = Query(default=False),
    active_only: bool = Query(default=True),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, le=200),
) -> dict:
    query = db.query(Customer).filter(Customer.tenant_id == tenant.id)
    if active_only:
        query = query.filter(Customer.is_active.is_(True))
    if vip_only:
        query = query.filter(Customer.is_vip.is_(True))
    if q and q.strip():
        needle = f"%{q.strip()}%"
        from sqlalchemy import or_
        query = query.filter(
            or_(
                Customer.full_name.ilike(needle),
                Customer.email.ilike(needle),
                Customer.company.ilike(needle),
            )
        )
    total = query.count()
    customers = query.order_by(Customer.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {
        "total": total,
        "page": page,
        "perPage": per_page,
        "customers": [customer_dto(c) for c in customers],
    }


@router.post("")
def create_customer(
    body: CustomerCreate,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOMERS_MANAGE)),
) -> dict:
    if user.role == "agent":
        raise InsufficientPrivileges("Only owners can create customers directly")
    email = body.email.strip().lower()
    existing = db.query(Customer).filter(
        Customer.tenant_id == tenant.id, Customer.email == email
    ).first()
    if existing:
        return customer_dto(existing)
    customer = Customer(
        tenant_id=tenant.id,
        email=email,
        full_name=body.full_name,
        phone_number=body.phone_number,
        company=body.company,
        location=body.location,
        notes=body.notes,
        tags=json.dumps(body.tags),
        is_vip=body.is_vip,
        is_active=True,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer_dto(customer)


@router.get("/{customer_id}")
def get_customer(
    customer_id: str,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOMERS_VIEW)),
) -> dict:
    customer = db.get(Customer, customer_id)
    if not customer or customer.tenant_id != tenant.id:
        raise TicketNotFound("Customer not found")
    return customer_dto(customer)


@router.patch("/{customer_id}")
def update_customer(
    customer_id: str,
    body: CustomerUpdate,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOMERS_VIEW)),
) -> dict:
    customer = db.get(Customer, customer_id)
    if not customer or customer.tenant_id != tenant.id:
        raise TicketNotFound("Customer not found")
    # agents can update notes and tags; owners can update everything
    if body.full_name is not None:
        if user.role == "agent":
            raise InsufficientPrivileges("Agents cannot change customer name")
        customer.full_name = body.full_name
    if body.phone_number is not None:
        customer.phone_number = body.phone_number
    if body.company is not None:
        customer.company = body.company
    if body.location is not None:
        customer.location = body.location
    if body.notes is not None:
        customer.notes = body.notes
    if body.tags is not None:
        customer.tags = json.dumps(body.tags)
    if body.is_vip is not None:
        if user.role == "agent":
            raise InsufficientPrivileges("Only owners can change VIP status")
        customer.is_vip = body.is_vip
    if body.is_active is not None:
        if user.role == "agent":
            raise InsufficientPrivileges("Only owners can suspend customers")
        customer.is_active = body.is_active
    db.commit()
    db.refresh(customer)
    return customer_dto(customer)


@router.post("/{customer_id}/suspend")
def suspend_customer(
    customer_id: str,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOMERS_MANAGE)),
) -> dict:
    customer = db.get(Customer, customer_id)
    if not customer or customer.tenant_id != tenant.id:
        raise TicketNotFound("Customer not found")
    customer.is_active = False
    db.commit()
    db.refresh(customer)
    return customer_dto(customer)


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: str,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOMERS_MANAGE)),
) -> dict:
    if user.role not in ("owner", "super_admin"):
        raise InsufficientPrivileges()
    customer = db.get(Customer, customer_id)
    if not customer or customer.tenant_id != tenant.id:
        raise TicketNotFound("Customer not found")
    # soft delete
    customer.is_active = False
    db.commit()
    return {"ok": True, "id": customer_id}


@router.get("/{customer_id}/history")
def customer_history(
    customer_id: str,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOMERS_VIEW)),
) -> dict:
    customer = db.get(Customer, customer_id)
    if not customer or customer.tenant_id != tenant.id:
        raise TicketNotFound("Customer not found")
    tickets = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id, Ticket.customer_id == customer_id)
        .order_by(Ticket.created_at.desc())
        .all()
    )
    return {
        "customer": customer_dto(customer),
        "tickets": [ticket_dto(t) for t in tickets],
    }
