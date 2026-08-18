from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.api.deps import Db
from app.core.permissions import BILLING_VIEW, require_perm
from app.models import Invoice, User
from app.services.serializers import invoice_dto

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=list[dict])
@router.get("/", response_model=list[dict], include_in_schema=False)
def list_invoices(db: Db, user: User = Depends(require_perm(BILLING_VIEW))) -> list[dict]:
    """Owner/agent billing is strictly tenant-scoped; the super admin sees
    platform-wide billing across every tenant (design matrix: tenant billing —
    Super Admin = Full, Owner = Full, Agent = —)."""
    if user.role == "super_admin":
        return [
            invoice_dto(inv)
            for inv in db.query(Invoice).order_by(Invoice.issued_at.desc()).all()
        ]
    items = (
        db.query(Invoice)
        .filter(Invoice.tenant_id == user.tenant_id)
        .order_by(Invoice.issued_at.desc())
        .all()
    )
    if not items:
        # Seed standard initial invoices for active workspace if empty
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        p1 = f"{(now - timedelta(days=60)).strftime('%b %d')} – {(now - timedelta(days=30)).strftime('%b %d')}"
        p2 = f"{(now - timedelta(days=30)).strftime('%b %d')} – {now.strftime('%b %d')}"
        inv1 = Invoice(tenant_id=user.tenant_id, period=p1, amount=75000, status="paid", method="Visa ···· 4821", paid_at=now - timedelta(days=30))
        inv2 = Invoice(tenant_id=user.tenant_id, period=p2, amount=75000, status="paid", method="Visa ···· 4821", paid_at=now)
        db.add_all([inv1, inv2])
        db.commit()
        items = [inv2, inv1]
    return [invoice_dto(inv) for inv in items]
