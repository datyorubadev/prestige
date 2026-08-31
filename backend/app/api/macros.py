import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import Db, get_tenant, require_team
from app.core.errors import TicketNotFound, InsufficientPrivileges
from app.core.permissions import MACROS_MANAGE, MACROS_USE, require_perm
from app.models import Macro, Tenant, Ticket, User, Message, Team
from app.models.common import MessageSender, TicketStatus
from app.services.serializers import macro_dto
from app.services.event_bus import publish_event
from app.api.tickets import _get_scoped_ticket, _check_status_transition

router = APIRouter(prefix="/macros", tags=["macros"])


class MacroCreate(BaseModel):
    name: str
    description: str = ""
    actions: list[dict] = []
    visibility: str = "shared"


class MacroUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    actions: list[dict] | None = None
    visibility: str | None = None
    is_active: bool | None = None


@router.get("")
def list_macros(
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(MACROS_USE)),
) -> list[dict]:
    macros = db.query(Macro).filter(
        Macro.tenant_id == tenant.id, Macro.is_active.is_(True)
    ).all()
    # Filter private macros not owned by this user
    return [
        macro_dto(m)
        for m in macros
        if m.visibility == "shared" or m.created_by == user.id
    ]


@router.post("")
def create_macro(
    body: MacroCreate,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(MACROS_MANAGE)),
) -> dict:
    macro = Macro(
        tenant_id=tenant.id,
        name=body.name,
        description=body.description,
        actions=json.dumps(body.actions),
        visibility=body.visibility,
        created_by=user.id,
        is_active=True,
    )
    db.add(macro)
    db.commit()
    db.refresh(macro)
    return macro_dto(macro)


@router.patch("/{macro_id}")
def update_macro(
    macro_id: str,
    body: MacroUpdate,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(MACROS_MANAGE)),
) -> dict:
    macro = db.get(Macro, macro_id)
    if not macro or macro.tenant_id != tenant.id:
        raise TicketNotFound("Macro not found")
    if macro.visibility == "private" and macro.created_by != user.id:
        raise InsufficientPrivileges("Cannot edit another user's private macro")

    if body.name is not None:
        macro.name = body.name
    if body.description is not None:
        macro.description = body.description
    if body.actions is not None:
        macro.actions = json.dumps(body.actions)
    if body.visibility is not None:
        macro.visibility = body.visibility
    if body.is_active is not None:
        macro.is_active = body.is_active
    db.commit()
    db.refresh(macro)
    return macro_dto(macro)


@router.delete("/{macro_id}")
def delete_macro(
    macro_id: str,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(MACROS_MANAGE)),
) -> dict:
    macro = db.get(Macro, macro_id)
    if not macro or macro.tenant_id != tenant.id:
        raise TicketNotFound("Macro not found")
    if macro.visibility == "private" and macro.created_by != user.id:
        raise InsufficientPrivileges("Cannot delete another user's private macro")
    macro.is_active = False
    db.commit()
    return {"ok": True}


@router.post("/{macro_id}/run/{ticket_id}")
def run_macro(
    macro_id: str,
    ticket_id: str,
    db: Db,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(require_perm(MACROS_USE)),
) -> dict:
    macro = db.get(Macro, macro_id)
    if not macro or macro.tenant_id != tenant.id or not macro.is_active:
        raise TicketNotFound("Macro not found or inactive")
    if macro.visibility == "private" and macro.created_by != user.id:
        raise InsufficientPrivileges("Cannot run another user's private macro")

    ticket = _get_scoped_ticket(db, tenant, ticket_id)
    actions = json.loads(macro.actions)

    for act in actions:
        atype = act.get("type")
        val = act.get("value")
        if not atype or not val:
            continue

        if atype == "assign_team":
            team = db.get(Team, val)
            if team and team.tenant_id == tenant.id:
                ticket.team_id = val
                db.add(Message(
                    ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                    sender_name=user.full_name, body=f"Macro: Assigned to team {team.name}",
                    is_bot=False, is_read=True,
                ))

        elif atype == "assign_agent":
            agent = db.get(User, val)
            if agent and agent.tenant_id == tenant.id:
                ticket.assignee_id = val
                db.add(Message(
                    ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                    sender_name=user.full_name, body=f"Macro: Assigned to {agent.full_name}",
                    is_bot=False, is_read=True,
                ))

        elif atype == "set_status":
            if val in TicketStatus.__members__.values() and val != ticket.status:
                _check_status_transition(user.role, val)
                ticket.status = val
                db.add(Message(
                    ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                    sender_name=user.full_name, body=f"Macro: Status set to {val.replace('_', ' ')}",
                    is_bot=False, is_read=True,
                ))

        elif atype == "set_label":
            from app.api.labels import resolve_or_create
            label = resolve_or_create(db, tenant, val)
            if label and label not in ticket.labels:
                ticket.labels.append(label)
                db.add(Message(
                    ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                    sender_name=user.full_name, body=f"Macro: Added label {label.name}",
                    is_bot=False, is_read=True,
                ))

        elif atype == "send_message":
            msg = Message(
                ticket_id=ticket.id, sender_id=user.id,
                sender_type=MessageSender.HUMAN_AGENT,
                sender_name=user.full_name, body=val, is_bot=False, is_read=True
            )
            db.add(msg)
            db.flush()
            db.refresh(msg)
            publish_event("message_created", {"ticket_id": ticket.id, "message_id": msg.id, "who": "human_agent", "text": val})

        elif atype == "add_note":
            db.add(Message(
                ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                sender_name=user.full_name, body=val, is_bot=False, is_read=True
            ))

        elif atype == "set_priority":
            if val in ("low", "medium", "high"):
                ticket.priority = val
                db.add(Message(
                    ticket_id=ticket.id, sender_id=user.id, sender_type=MessageSender.SYSTEM,
                    sender_name=user.full_name, body=f"Macro: Priority set to {val}",
                    is_bot=False, is_read=True,
                ))

    macro.run_count += 1
    db.commit()
    db.refresh(ticket)
    publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status})
    return {"ok": True}
