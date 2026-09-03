"""Widget + chat-SSE endpoints.

Public-facing routes that power the customer widget.  Routes are open but
scoped by tenant id / ticket id (a uuid4 capability token): callers cannot
fabricate AI replies or read arbitrary transcripts without knowing one.
"""

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.deps import Db
from app.database import SessionLocal
from app.models import Ticket
from app.services import agent, chat_service
from app.services.event_bus import publish_event

router = APIRouter(prefix="/widget", tags=["widget"])
chat_router = APIRouter(prefix="/chat", tags=["chat"])


class WidgetSendRequest(BaseModel):
    tenantId: str
    sessionId: str | None = None
    text: str
    email: str | None = None
    cust: str | None = None
    stream: bool = False
    attachments: list[dict] = []


class WidgetPersistRequest(BaseModel):
    ticketId: str
    text: str


class WidgetRatingRequest(BaseModel):
    ticketId: str
    rating: int
    comment: str | None = None


class WidgetTypingRequest(BaseModel):
    ticketId: str


@router.post("/send")
def widget_send(body: WidgetSendRequest, db: Db) -> dict:
    return chat_service.widget_send(
        db, body.tenantId, body.sessionId, body.text, body.email, body.cust, body.attachments
    )


@router.post("/persist")
def widget_persist(body: WidgetPersistRequest, db: Db) -> dict:
    ticket = db.get(Ticket, body.ticketId)
    if not ticket:
        return {"ok": False}
    return chat_service.persist_ai_reply(db, body.ticketId, body.text)


@router.post("/rating")
def widget_rating(body: WidgetRatingRequest, db: Db) -> dict:
    ticket = db.get(Ticket, body.ticketId)
    if not ticket:
        return {"ok": False}
    return chat_service.rate_ticket(db, body.ticketId, body.rating, body.comment)


@router.get("/messages")
def widget_messages(ticketId: str, db: Db) -> dict:
    """Message log for a widget session."""
    ticket = db.get(Ticket, ticketId)
    if not ticket:
        return {"messages": []}
    messages = []
    for m in ticket.messages:
        if m.sender_type == "system":
            # Internal notes are private to staff — never surface on the widget.
            continue
        who = (
            "customer"
            if m.sender_type == "customer"
            else "ai" if m.is_bot else "human_agent"
        )
        att_list = []
        if m.attachments:
            try:
                att_list = json.loads(m.attachments) if isinstance(m.attachments, str) else m.attachments
            except Exception:
                att_list = []
        messages.append({
            "who": who,
            "text": m.body,
            "attachments": att_list,
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
        })
    return {"messages": messages}


@router.post("/typing")
def widget_typing(payload: WidgetTypingRequest) -> dict:
    """Customer-is-typing signal."""
    ticket_id = payload.ticketId
    if not ticket_id:
        return {}
    publish_event("customer_typing", {"ticket_id": ticket_id})
    return {"ok": True}


# ── /api/chat SSE ────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    ticket_id: str
    query: str


def _sse(frame: dict) -> str:
    return f"data: {json.dumps(frame)}\n\n"


async def _chat_stream(ticket_id: str, query: str):
    db = SessionLocal()
    reply_parts: list[str] = []
    try:
        ticket = db.get(Ticket, ticket_id)
        if not ticket:
            yield _sse({"error": {"code": "NOT_FOUND", "message": "Ticket not found"}})
            return
        tenant_id = ticket.tenant_id

        # ── Burst buffering ──────────────────────────────────────────
        # The customer may have fired 2-4 messages in quick succession.
        # Wait out a short quiet window and merge everything into ONE
        # prompt so the AI answers once instead of machine-gunning replies.
        import asyncio

        from app.config import settings as _settings
        from app.services.chat_buffer import chat_buffer

        chat_buffer.add(ticket_id, query)  # register this message too
        window = max(1, int(getattr(_settings, "ai_buffer_seconds", 5)))
        waited = 0.0
        while waited < window:
            await asyncio.sleep(0.5)
            waited += 0.5
            if chat_buffer.size(ticket_id) == 0 and waited >= 2.0:
                # Nothing new for 2s — no point waiting the full window.
                break
        parts = chat_buffer.drain(ticket_id) or [query]
        # De-duplicate while preserving order (query itself was re-added).
        seen: set[str] = set()
        merged_parts = []
        for p in parts:
            key = p.strip().lower()
            if key and key not in seen:
                seen.add(key)
                merged_parts.append(p)
        merged_query = "\n".join(merged_parts)
        if len(merged_parts) > 1:
            yield _sse({"merged": len(merged_parts),
                        "info": f"Merged {len(merged_parts)} messages into one reply"})

        done_frame: dict = {"done": True, "response_by": "ai"}
        async for frame in agent.stream_agent(tenant_id, ticket_id, merged_query):
            if frame.get("token"):
                reply_parts.append(frame["token"])
                yield _sse({"token": frame["token"]})
            elif frame.get("done"):
                done_frame = {k: v for k, v in frame.items() if k != "token"}
                yield _sse(done_frame)
    finally:
        reply = "".join(reply_parts)
        if reply:
            chat_service.persist_ai_reply(db, ticket_id, reply)
        db.close()


@chat_router.post("")
async def chat(body: ChatRequest) -> StreamingResponse:
    return StreamingResponse(_chat_stream(body.ticket_id, body.query),
                             media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
