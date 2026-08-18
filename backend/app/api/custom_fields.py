import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import Db, get_tenant
from app.core.errors import TicketNotFound, InsufficientPrivileges
from app.core.permissions import CUSTOM_FIELDS_MANAGE, TICKETS_VIEW, require_perm
from app.models import CustomFieldDefinition, CustomFieldValue, Tenant, User
from app.services.serializers import custom_field_def_dto, custom_field_value_dto

router = APIRouter(prefix="/custom-fields", tags=["custom_fields"])


class FieldDefCreate(BaseModel):
    name: str
    key: str
    field_type: str = "text"
    options: list[str] = []
    applies_to: str = "ticket"
    required: bool = False
    position: int = 0


class FieldDefUpdate(BaseModel):
    name: str | None = None
    options: list[str] | None = None
    required: bool | None = None
    is_active: bool | None = None
    position: int | None = None


@router.get("")
def list_definitions(
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(TICKETS_VIEW)),
    applies_to: str | None = Query(None, pattern="^(ticket|customer)$"),
) -> list[dict]:
    q = db.query(CustomFieldDefinition).filter(
        CustomFieldDefinition.tenant_id == tenant.id,
        CustomFieldDefinition.is_active.is_(True)
    )
    if applies_to:
        q = q.filter(CustomFieldDefinition.applies_to == applies_to)
    q = q.order_by(CustomFieldDefinition.position.asc(), CustomFieldDefinition.created_at.asc())
    return [custom_field_def_dto(f) for f in q.all()]


@router.post("")
def create_definition(
    body: FieldDefCreate,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOM_FIELDS_MANAGE)),
) -> dict:
    if user.role not in ("owner", "super_admin"):
        raise InsufficientPrivileges()
    if db.query(CustomFieldDefinition).filter(
        CustomFieldDefinition.tenant_id == tenant.id,
        CustomFieldDefinition.key == body.key
    ).first():
        raise HTTPException(status_code=400, detail="Key already exists")

    field_def = CustomFieldDefinition(
        tenant_id=tenant.id,
        name=body.name,
        key=body.key,
        field_type=body.field_type,
        options=json.dumps(body.options),
        applies_to=body.applies_to,
        required=body.required,
        is_active=True,
        position=body.position,
    )
    db.add(field_def)
    db.commit()
    db.refresh(field_def)
    return custom_field_def_dto(field_def)


@router.patch("/{def_id}")
def update_definition(
    def_id: str,
    body: FieldDefUpdate,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOM_FIELDS_MANAGE)),
) -> dict:
    if user.role not in ("owner", "super_admin"):
        raise InsufficientPrivileges()
    field_def = db.get(CustomFieldDefinition, def_id)
    if not field_def or field_def.tenant_id != tenant.id:
        raise TicketNotFound("Field definition not found")

    if body.name is not None:
        field_def.name = body.name
    if body.options is not None:
        field_def.options = json.dumps(body.options)
    if body.required is not None:
        field_def.required = body.required
    if body.is_active is not None:
        field_def.is_active = body.is_active
    if body.position is not None:
        field_def.position = body.position

    db.commit()
    db.refresh(field_def)
    return custom_field_def_dto(field_def)


@router.delete("/{def_id}")
def delete_definition(
    def_id: str,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(CUSTOM_FIELDS_MANAGE)),
) -> dict:
    if user.role not in ("owner", "super_admin"):
        raise InsufficientPrivileges()
    field_def = db.get(CustomFieldDefinition, def_id)
    if not field_def or field_def.tenant_id != tenant.id:
        raise TicketNotFound("Field definition not found")
    field_def.is_active = False
    db.commit()
    return {"ok": True}


@router.get("/values/{entity_type}/{entity_id}")
def get_values(
    entity_type: str,
    entity_id: str,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(TICKETS_VIEW)),
) -> list[dict]:
    values = db.query(CustomFieldValue).filter(
        CustomFieldValue.tenant_id == tenant.id,
        CustomFieldValue.entity_type == entity_type,
        CustomFieldValue.entity_id == entity_id
    ).all()
    return [custom_field_value_dto(v) for v in values]


@router.put("/values/{entity_type}/{entity_id}")
def upsert_values(
    entity_type: str,
    entity_id: str,
    payload: dict[str, str | None],
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(TICKETS_VIEW)),
) -> dict:
    # payload: {field_def_id: "value", ...}
    existing = db.query(CustomFieldValue).filter(
        CustomFieldValue.tenant_id == tenant.id,
        CustomFieldValue.entity_type == entity_type,
        CustomFieldValue.entity_id == entity_id
    ).all()
    existing_map = {v.field_def_id: v for v in existing}

    for def_id, val in payload.items():
        if def_id in existing_map:
            existing_map[def_id].value = val
        else:
            new_val = CustomFieldValue(
                tenant_id=tenant.id,
                field_def_id=def_id,
                entity_id=entity_id,
                entity_type=entity_type,
                value=val
            )
            db.add(new_val)
    db.commit()
    return {"ok": True}
