"""Per-tenant label library (Chatwoot-style). Labels carry a name + color and
are applied to tickets by name through /api/tickets PATCH { labels }."""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import Db, get_tenant, require_team
from app.core.errors import LabelConflict, LabelNotFound
from app.models import Label, Tenant, User
from app.services.event_bus import publish_event
from app.services.serializers import label_dto

router = APIRouter(prefix="/labels", tags=["labels"])

DEFAULT_COLORS = ["#0d8f63", "#2563eb", "#7c3aed", "#d93636", "#b98800", "#0891b2", "#db2777", "#ea580c"]


class LabelCreate(BaseModel):
    name: str
    color: str | None = None
    description: str | None = None


class LabelUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    description: str | None = None


def _pick_color(key: str) -> str:
    """Stable deterministic color from a name (same label -> same color)."""
    return DEFAULT_COLORS[sum(ord(c) for c in key) % len(DEFAULT_COLORS)]


def _normalize_color(color: str | None, fallback_key: str = "") -> str:
    if color and color.startswith("#") and len(color) in (4, 7):
        return color
    return _pick_color(fallback_key or color or "label")


def _get_label(db: Db, tenant: Tenant, label_id: str) -> Label:
    label = db.get(Label, label_id)
    if not label or label.tenant_id != tenant.id:
        raise LabelNotFound()
    return label


def _find_by_name(db: Db, tenant: Tenant, name: str) -> Label | None:
    return (
        db.query(Label)
        .filter(Label.tenant_id == tenant.id, Label.name == name)
        .first()
    )


def resolve_or_create(db: Db, tenant: Tenant, name: str) -> Label:
    """Find a label by name in the tenant's library, creating it with a stable
    auto color when it does not exist yet (Chatwoot auto-creates on apply)."""
    label = _find_by_name(db, tenant, name)
    if label:
        return label
    label = Label(id=str(uuid.uuid4()), tenant_id=tenant.id, name=name,
                  color=_pick_color(name))
    db.add(label)
    db.flush()
    return label


@router.get("")
def list_labels(db: Db, tenant: Tenant = Depends(get_tenant),
                user: User = Depends(require_team)) -> list[dict]:
    labels = db.query(Label).filter(Label.tenant_id == tenant.id).order_by(Label.name).all()
    return [label_dto(l) for l in labels]


@router.post("")
def create_label(body: LabelCreate, db: Db, tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_team)) -> dict:
    name = body.name.strip()
    if not name:
        raise LabelNotFound("Label name is required")
    if _find_by_name(db, tenant, name):
        raise LabelConflict()
    label = Label(tenant_id=tenant.id, name=name,
                  color=_normalize_color(body.color, name), description=body.description)
    db.add(label)
    db.commit()
    publish_event("labels_changed", {"tenant_id": tenant.id})
    return label_dto(label)


@router.get("/{label_id}")
def get_label(label_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
              user: User = Depends(require_team)) -> dict:
    return label_dto(_get_label(db, tenant, label_id))


@router.patch("/{label_id}")
@router.put("/{label_id}")
def update_label(label_id: str, body: LabelUpdate, db: Db,
                 tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_team)) -> dict:
    label = _get_label(db, tenant, label_id)
    if body.name is not None and body.name.strip():
        new_name = body.name.strip()
        clash = _find_by_name(db, tenant, new_name)
        if clash and clash.id != label.id:
            raise LabelConflict()
        label.name = new_name
    if body.color is not None:
        label.color = _normalize_color(body.color, label.name)
    if body.description is not None:
        label.description = body.description.strip() or None
    db.commit()
    publish_event("labels_changed", {"tenant_id": tenant.id})
    return label_dto(label)


@router.delete("/{label_id}")
def delete_label(label_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_team)) -> dict:
    label = _get_label(db, tenant, label_id)
    db.delete(label)
    db.commit()
    publish_event("labels_changed", {"tenant_id": tenant.id})
    return {"ok": True}
