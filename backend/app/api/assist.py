"""Staff Agent Assist endpoints (guide §6.x). Same LangGraph agent as the widget
chat, but tenant-authed and exposing HITL approval for interrupt-gated tools."""

import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_

from app.api.deps import Db, get_tenant, require_team
from app.core.errors import TenantNotFound
from app.models import Tenant, Ticket, User
from app.services import agent
from app.services.serializers import format_ticket_number

router = APIRouter(prefix="/agent/assist", tags=["agent-assist"])


class AssistRequest(BaseModel):
    ticket_id: str
    query: str


class ApproveRequest(BaseModel):
    payload: dict


class AnswerRequest(BaseModel):
    answer: str


def _sse(frame: dict) -> str:
    return f"data: {json.dumps(frame)}\n\n"


def _resolve_ticket(db: Db, tenant: Tenant, ticket_id: str) -> Ticket | None:
    """Resolve a ticket by raw id OR human-readable number (e.g.
    NAI20260815561159) so number-based deep links work on every assist endpoint
    — parity with app.api.tickets._get_scoped_ticket."""
    clean = ticket_id.strip()

    # 1. Direct primary key lookup (exact id), tenant-scoped.
    ticket = db.get(Ticket, clean)
    if ticket and ticket.tenant_id == tenant.id:
        return ticket

    # 2. Case-insensitive id / display-number lookup within tenant scope only.
    needle = clean.lower()
    ticket = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id)
        .filter(or_(Ticket.id.ilike(needle), Ticket.id.ilike(f"%{clean}%")))
        .first()
    )
    if ticket:
        return ticket

    # 3. Formatted display-number fallback — still within the tenant scope.
    #    display_number is indexed, so compare directly instead of loading all rows.
    needle_num = needle.lstrip("tck")
    ticket = (
        db.query(Ticket)
        .filter(Ticket.tenant_id == tenant.id)
        .filter(Ticket.display_number.ilike(needle_num))
        .first()
    )
    return ticket


def _ensure_owned(ticket: Ticket, user: User) -> None:
    """Staff agent-assist is tenant-scoped: the caller must belong to the
    ticket's tenant. Super admin only reaches tenant tickets via the audited
    impersonation flow (which presents as the owner), never directly."""
    if user.tenant_id and ticket.tenant_id == user.tenant_id:
        return
    raise TenantNotFound("Ticket not found")


@router.post("")
async def assist(body: AssistRequest, db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_team)) -> StreamingResponse:
    ticket = _resolve_ticket(db, tenant, body.ticket_id)
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
async def assist_pending(ticket_id: str, db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_team)) -> dict:
    ticket = _resolve_ticket(db, tenant, ticket_id)
    if not ticket:
        raise TenantNotFound("Ticket not found")
    _ensure_owned(ticket, user)
    payload = await agent.pending_approval(ticket.id)
    return {"pending": bool(payload), "payload": payload}


@router.post("/{ticket_id}/approve")
async def assist_approve(ticket_id: str, body: ApproveRequest,
                         db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_team)) -> dict:
    ticket = _resolve_ticket(db, tenant, ticket_id)
    if not ticket:
        raise TenantNotFound("Ticket not found")
    _ensure_owned(ticket, user)
    return await agent.resume_agent(ticket.id, body.payload)


@router.post("/{ticket_id}/answer")
async def assist_answer(ticket_id: str, body: AnswerRequest,
                        db: Db, tenant: Tenant = Depends(get_tenant), user: User = Depends(require_team)):
    """Agent answers a KB-gap question (soft human assist). The reply is
    delivered to the customer as the bot's own message. Guard: only works when
    the ticket currently has a pending human_assist interrupt."""
    ticket = _resolve_ticket(db, tenant, ticket_id)
    if not ticket:
        raise TenantNotFound("Ticket not found")
    _ensure_owned(ticket, user)

    pending = await agent.pending_approval(ticket.id)
    if not pending:
        return {"ok": False, "error": "no_pending_assist"}
    if (pending or {}).get("type") != "human_assist":
        return {"ok": False, "error": "not_a_human_assist"}
    answer = (body.answer or "").strip()
    if not answer:
        return {"ok": False, "error": "empty_answer"}
    result = await agent.resume_agent(ticket.id, {"answer": answer})
    return {"ok": result.get("ok", False), "reply": result.get("reply")}
