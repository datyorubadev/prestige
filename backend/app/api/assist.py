"""Staff Agent Assist endpoints (guide §6.x). Same LangGraph agent as the widget
chat, but tenant-authed and exposing HITL approval for interrupt-gated tools."""

import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_

from app.api.deps import Db, require_team
from app.core.errors import TenantNotFound
from app.models import Ticket, User
from app.services import agent
from app.services.serializers import format_ticket_number

router = APIRouter(prefix="/agent/assist", tags=["agent-assist"])


class AssistRequest(BaseModel):
    ticket_id: str
    query: str


class ApproveRequest(BaseModel):
    payload: dict


def _sse(frame: dict) -> str:
    return f"data: {json.dumps(frame)}\n\n"


def _resolve_ticket(db: Db, ticket_id: str) -> Ticket | None:
    """Resolve a ticket by raw id OR human-readable number (e.g.
    NAI20260815561159) so number-based deep links work on every assist endpoint
    — parity with app.api.tickets._get_scoped_ticket."""
    clean = ticket_id.strip()
    ticket = db.get(Ticket, clean)
    if ticket:
        return ticket
    needle = clean.lower()
    ticket = (
        db.query(Ticket)
        .filter(or_(Ticket.id.ilike(needle), Ticket.id.ilike(f"%{clean}%")))
        .first()
    )
    if ticket:
        return ticket
    return next(
        (t for t in db.query(Ticket).all() if format_ticket_number(t).lower() == needle),
        None,
    )


def _ensure_owned(ticket: Ticket, user: User) -> None:
    """Staff agent-assist is tenant-scoped: the caller must belong to the
    ticket's tenant. Super admin only reaches tenant tickets via the audited
    impersonation flow (which presents as the owner), never directly."""
    if user.tenant_id and ticket.tenant_id == user.tenant_id:
        return
    raise TenantNotFound("Ticket not found")


@router.post("")
async def assist(body: AssistRequest, db: Db, user: User = Depends(require_team)) -> StreamingResponse:
    ticket = _resolve_ticket(db, body.ticket_id)
    if not ticket:
        raise TenantNotFound("Ticket not found")
    _ensure_owned(ticket, user)

    async def _stream():
        async for frame in agent.stream_agent(ticket.tenant_id, ticket.id, body.query):
            yield _sse(frame)

    return StreamingResponse(_stream(),
                             media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/{ticket_id}/pending")
async def assist_pending(ticket_id: str, db: Db, user: User = Depends(require_team)) -> dict:
    ticket = _resolve_ticket(db, ticket_id)
    if not ticket:
        raise TenantNotFound("Ticket not found")
    _ensure_owned(ticket, user)
    payload = await agent.pending_approval(ticket.id)
    return {"pending": bool(payload), "payload": payload}


@router.post("/{ticket_id}/approve")
async def assist_approve(ticket_id: str, body: ApproveRequest,
                         db: Db, user: User = Depends(require_team)) -> dict:
    ticket = _resolve_ticket(db, ticket_id)
    if not ticket:
        raise TenantNotFound("Ticket not found")
    _ensure_owned(ticket, user)
    return await agent.resume_agent(ticket.id, body.payload)
