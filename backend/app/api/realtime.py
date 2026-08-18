import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.security import get_token_payload
from app.database import SessionLocal
from app.models import Message, Tenant, Ticket, User
from app.models.common import MessageSender, TicketStatus
from app.services import agent, chat_service, escalation
from app.services.event_bus import events_since, publish_event

router = APIRouter(prefix="/api", tags=["realtime"])
ws_router = APIRouter(tags=["realtime-ws"])

AGENT_REPLIES = [
    "Thanks for waiting — I can see your ticket and I'm on it.",
    "I've checked the account and this was an escalation on our side. Let me sort it.",
    "Done — I've fixed this for you. Your money shows as settled now.",
]


def _token_ok(token: str | None) -> bool:
    """Optional-token policy: no token is allowed (public widget / dashboard),
    but a present token must be a valid, unexpired access token — mirroring the
    REST auth layer. Rejected sockets get a 4401/4403 close so the client can
    refresh and reconnect."""
    if not token:
        return True
    return get_token_payload(token).get("type") == "access"


@router.get("/events")
def events(since: str | None = Query(default=None)) -> list[dict]:
    return events_since(since)


@ws_router.websocket("/ws/events")
async def ws_events(websocket: WebSocket, token: str | None = None) -> None:
    await websocket.accept()
    if not _token_ok(token):
        await websocket.close(code=4401)
        return
    cursor: str | None = None
    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=0.5)
            except asyncio.TimeoutError:
                raw = None
            if raw == "ping":
                await websocket.send_text("pong")
            for event in events_since(cursor):
                cursor = event["request_id"]
                await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


@ws_router.websocket("/ws/chat/{ticket_id}")
async def ws_chat(websocket: WebSocket, ticket_id: str, token: str | None = None) -> None:
    await websocket.accept()
    if not _token_ok(token):
        await websocket.close(code=4403)
        return
    # ── Load ticket + tenant once (short-lived session) ──────────────
    db: Session = SessionLocal()
    try:
        ticket = db.get(Ticket, ticket_id)
        if not ticket:
            await websocket.close(code=4404)
            return
        tenant = db.get(Tenant, ticket.tenant_id)
        agent_name = ticket.assignee.full_name if ticket.assignee else (
            f"{tenant.bot_name} agent" if tenant else "Agent")
    finally:
        db.close()  # return connection to pool immediately
    await websocket.send_text(json.dumps({"who": "system", "text": f"{agent_name} joined the conversation"}))

    cursor: str | None = None
    try:
        while True:
            for event in events_since(cursor):
                cursor = event["request_id"]
                if event.get("type") == "message_created":
                    data = event.get("data") or {}
                    if data.get("ticket_id") == ticket.id and data.get("who") in ("human_agent", "ai", "system"):
                        msg = {
                            "who": data["who"],
                            "text": data["text"],
                            "author": data.get("author"),
                        }
                        if data.get("attachments"):
                            msg["attachments"] = data["attachments"]
                        await websocket.send_text(json.dumps(msg))

            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=0.5)
            except asyncio.TimeoutError:
                continue

            if raw == "ping":
                continue
            try:
                payload = json.loads(raw)
            except ValueError:
                continue
            if payload.get("type") != "message":
                continue
            text = str(payload.get("text", ""))[:2000]
            if not text.strip():
                continue

            # ── Per-operation session: write message ─────────────────
            db = SessionLocal()
            try:
                ticket = db.get(Ticket, ticket_id)
                if not ticket:
                    break
                msg = Message(
                    ticket_id=ticket.id, sender_type=MessageSender.CUSTOMER,
                    sender_name=ticket.customer.full_name if ticket.customer else "Customer",
                    body=text, is_bot=False, is_read=True,
                )
                db.add(msg)
                ticket.unread = True
                if ticket.status == TicketStatus.OPEN:
                    ticket.status = TicketStatus.IN_PROGRESS
                db.commit()
                publish_event("message_created", {"ticket_id": ticket.id, "who": "customer", "text": text})
                publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status})

                # Check escalation rules
                fired = escalation.evaluate(db, tenant, ticket, text)
                if fired or ticket.status == TicketStatus.ESCALATED:
                    if fired:
                        escalation.apply(db, tenant, ticket, fired)
                    await websocket.send_text(json.dumps({
                        "who": "system",
                        "text": f"Transferred to {agent_name} — an agent will reply shortly."
                    }))
                    publish_event("ticket_escalated", {"ticket_id": ticket.id, "status": ticket.status})
                    continue

                # Stream real AI response from LangGraph agent
                reply_accumulated = []
                needs_approval = False
                async for frame in agent.stream_agent(tenant.id, ticket.id, text):
                    if frame.get("token"):
                        reply_accumulated.append(frame["token"])
                        await websocket.send_text(json.dumps({"who": "ai", "text": "".join(reply_accumulated), "token": frame["token"]}))
                    if frame.get("needs_approval"):
                        needs_approval = True

                full_reply = "".join(reply_accumulated)
                if full_reply:
                    chat_service.persist_ai_reply(db, ticket.id, full_reply)
                if needs_approval:
                    await websocket.send_text(json.dumps({
                        "who": "system",
                        "text": "Your request requires agent confirmation. One moment..."
                    }))
            finally:
                db.close()  # return connection to pool after each message
    except WebSocketDisconnect:
        pass
