from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import Db, get_tenant, require_admin, require_team
from app.core.errors import TicketNotFound
from app.models import CannedResponse, Tenant, User
from app.services.event_bus import publish_event
from app.services.serializers import canned_dto

router = APIRouter(prefix="/canned", tags=["canned"])


class CannedCreate(BaseModel):
    label: str
    text: str


class CannedUpdate(BaseModel):
    label: str | None = None
    text: str | None = None


@router.get("", response_model=list[dict])
@router.get("/", response_model=list[dict], include_in_schema=False)
def list_canned(db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_team)) -> list[dict]:
    items = (
        db.query(CannedResponse)
        .filter(CannedResponse.tenant_id == tenant.id)
        .order_by(CannedResponse.created_at.desc())
        .all()
    )
    return [canned_dto(c) for c in items]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_canned(body: CannedCreate, db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_admin)) -> dict:
    label = body.label.strip()
    if not label or not body.text.strip():
        raise HTTPException(status_code=422, detail="Label and text are required")
    snippet = CannedResponse(
        tenant_id=tenant.id,
        title=label,
        body=body.text.strip(),
    )
    db.add(snippet)
    db.commit()
    db.refresh(snippet)
    publish_event("canned_changed", {"canned_id": snippet.id})
    return canned_dto(snippet)


@router.put("/{canned_id}", response_model=dict)
@router.patch("/{canned_id}", response_model=dict)
def update_canned(canned_id: str, body: CannedUpdate, db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_admin)) -> dict:
    snippet = db.get(CannedResponse, canned_id)
    if not snippet or snippet.tenant_id != tenant.id:
        raise TicketNotFound("Canned response not found")
    if body.label is not None:
        snippet.title = body.label.strip()
    if body.text is not None:
        snippet.body = body.text.strip()
    db.commit()
    db.refresh(snippet)
    publish_event("canned_changed", {"canned_id": snippet.id})
    return canned_dto(snippet)


@router.delete("/{canned_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_canned(canned_id: str, db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_admin)):
    snippet = db.get(CannedResponse, canned_id)
    if not snippet or snippet.tenant_id != tenant.id:
        raise TicketNotFound("Canned response not found")
    db.delete(snippet)
    db.commit()
    publish_event("canned_changed", {"canned_id": canned_id})
    return None
