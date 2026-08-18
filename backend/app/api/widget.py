import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.deps import Db
from app.database import SessionLocal
from app.models import Ticket, Tenant, Message
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


@router.post("/send")
def widget_send(body: WidgetSendRequest, db: Db) -> dict:
    return chat_service.widget_send(
        db, body.tenantId, body.sessionId, body.text, body.email, body.cust, body.attachments
    )


@router.post("/persist")
def widget_persist(body: WidgetPersistRequest, db: Db) -> dict:
    return chat_service.persist_ai_reply(db, body.ticketId, body.text)


@router.post("/rating")
def widget_rating(body: WidgetRatingRequest, db: Db) -> dict:
    return chat_service.rate_ticket(db, body.ticketId, body.rating, body.comment)


@router.get("/messages")
def widget_messages(ticketId: str, db: Db) -> dict:
    """Public message log for a widget session — lets the chat poll for the
    post-approval AI reply after an agent resolves a HITL interrupt."""
    ticket = db.get(Ticket, ticketId)
    if not ticket:
        return {"messages": []}
    messages = []
    for m in ticket.messages:
        who = (
            "customer"
            if m.sender_type == "customer"
            else "ai" if m.is_bot else "agent"
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
def widget_typing(payload: dict, db: Db) -> dict:
    """Customer-is-typing signal. Publishes a `customer_typing` event that the
    agent workspace picks up through the realtime bus (WS/poll)."""
    ticket_id = str(payload.get("ticketId") or "")
    if not ticket_id:
        return {}
    publish_event("customer_typing", {"ticket_id": ticket_id})
    return {"ok": True}


# ---------------------------------------------------------------- /api/chat SSE
class ChatRequest(BaseModel):
    ticket_id: str
    query: str


def _sse(frame: dict) -> str:
    return f"data: {json.dumps(frame)}\n\n"


async def _chat_stream(ticket_id: str, query: str):
    db = SessionLocal()
    try:
        ticket = db.get(Ticket, ticket_id)
        if not ticket:
            yield _sse({"error": {"code": "NOT_FOUND", "message": "Ticket not found"}})
            return
        tenant_id = ticket.tenant_id
        reply_parts: list[str] = []
        done_frame: dict = {"done": True, "response_by": "ai"}
        async for frame in agent.stream_agent(tenant_id, ticket_id, query):
            if frame.get("token"):
                reply_parts.append(frame["token"])
                yield _sse({"token": frame["token"]})
            elif frame.get("done"):
                done_frame = {k: v for k, v in frame.items() if k != "token"}
                yield _sse(done_frame)
        reply = "".join(reply_parts)
        if reply:
            chat_service.persist_ai_reply(db, ticket_id, reply)
    finally:
        db.close()


@chat_router.post("")
async def chat(body: ChatRequest) -> StreamingResponse:
    return StreamingResponse(_chat_stream(body.ticket_id, body.query),
                             media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
