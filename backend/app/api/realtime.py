import asyncio
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.api.deps import Db, get_current_user, get_tenant
from app.core.security import get_token_payload
from app.database import SessionLocal
from app.models import Message, Tenant, Ticket, User
from app.models.common import MessageSender, TicketStatus
from app.services import agent, chat_service, escalation
from app.services.event_bus import events_since, latest_cursor, publish_event

router = APIRouter(prefix="/api", tags=["realtime"])
ws_router = APIRouter(tags=["realtime-ws"])

log = logging.getLogger(__name__)

AGENT_REPLIES = [
    "Thanks for waiting — I can see your ticket and I'm on it.",
    "I've checked the account and this was an escalation on our side. Let me sort it.",
    "Done — I've fixed this for you. Your money shows as settled now.",
]


def _resolve_user_from_ws(token: str | None, db: Session) -> User | None:
    """Resolve a user from a WebSocket token. Returns None for invalid/missing tokens."""
    if not token:
        return None
    try:
        payload = get_token_payload(token)
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = db.get(User, user_id)
        if not user or not user.is_active:
            return None
        return user
    except Exception:
        return None


@router.get("/events")
def events(
    since: str | None = Query(default=None),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """Authenticated event feed — tenant-scoped for non-super-admins."""
    all_events = events_since(since)
    if user.role == "super_admin":
        return all_events
    if not user.tenant_id:
        return []
    return [e for e in all_events if e.get("tenant_id") == user.tenant_id]


@ws_router.websocket("/ws/events")
async def ws_events(websocket: WebSocket, token: str | None = None, since: str | None = None) -> None:
    await websocket.accept()
    db = SessionLocal()
    try:
        user = _resolve_user_from_ws(token, db)
        if not user:
            await websocket.close(code=4401)
            return
        tenant_id = user.tenant_id
        is_super = user.role == "super_admin"
    finally:
        db.close()

    # Resume from the client's last-seen cursor so events published while the
    # socket was down (e.g. during a tab switch / reconnect) are not lost.
    cursor: str | None = latest_cursor() if since is None else since
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
                # Tenant-scoped filtering for non-super-admins
                if not is_super and event.get("tenant_id") != tenant_id:
                    continue
                await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.warning("ws_events error: %s", exc)


@ws_router.websocket("/ws/chat/{ticket_id}")
async def ws_chat(websocket: WebSocket, ticket_id: str, token: str | None = None) -> None:
    await websocket.accept()
    db = SessionLocal()
    try:
        user = _resolve_user_from_ws(token, db)
        # Load ticket + tenant
        ticket = db.get(Ticket, ticket_id)
        if not ticket:
            await websocket.close(code=4404)
            return
        # Tenant ownership check: user must belong to the ticket's tenant
        if user and user.role != "super_admin":
            if user.tenant_id != ticket.tenant_id:
                await websocket.close(code=4403)
                return
        tenant = db.get(Tenant, ticket.tenant_id)
        agent_name = ticket.assignee.full_name if ticket.assignee else (
            f"{tenant.bot_name} agent" if tenant else "Agent")
    finally:
        db.close()

    cursor: str | None = latest_cursor()
    try:
        while True:
            for event in events_since(cursor):
                cursor = event["request_id"]
                if event.get("type") == "message_created":
                    data = event.get("data") or {}
                    if data.get("ticket_id") == ticket.id and data.get("who") in ("human_agent", "ai"):
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
            attachments = payload.get("attachments") or []
            if not text.strip() and not attachments:
                continue

            # Per-operation session: write message
            db = SessionLocal()
            try:
                ticket = db.get(Ticket, ticket_id)
                if not ticket:
                    break
                msg = Message(
                    ticket_id=ticket.id, sender_type=MessageSender.CUSTOMER,
                    sender_name=ticket.customer.full_name if ticket.customer else "Customer",
                    body=text, is_bot=False, is_read=True,
                    attachments=json.dumps(attachments) if attachments else None,
                )
                db.add(msg)
                ticket.unread = True
                if ticket.status == TicketStatus.OPEN:
                    ticket.status = TicketStatus.IN_PROGRESS
                from app.services.ticket_activity import record
                record(db, ticket.id, ticket.tenant_id,
                       ticket.customer.full_name if ticket.customer else "Customer",
                       "customer_replied",
                       detail=f"Customer message: “{text[:120]}”")
                db.commit()
                db.refresh(msg)
                publish_event("message_created", {"ticket_id": ticket.id, "message_id": msg.id, "who": "customer", "text": text, "attachments": attachments}, tenant_id=tenant.id)
                publish_event("ticket_updated", {"ticket_id": ticket.id, "status": ticket.status}, tenant_id=tenant.id)

                # Check escalation rules / human ownership
                fired = escalation.evaluate(db, tenant, ticket, text)
                if fired or ticket.status == TicketStatus.ESCALATED or getattr(ticket, "ai_paused", False):
                    if fired:
                        escalation.apply(db, tenant, ticket, fired)
                    await websocket.send_text(json.dumps({
                        "who": "system",
                        "text": "Thanks for waiting — one of our support team will reply shortly."
                    }))
                    publish_event("ticket_escalated", {"ticket_id": ticket.id, "status": ticket.status}, tenant_id=tenant.id)
                    continue

                # Stream real AI response from LangGraph agent
                reply_accumulated = []
                needs_approval = False
                try:
                    async for frame in agent.stream_agent(tenant.id, ticket.id, text):
                        if frame.get("token"):
                            reply_accumulated.append(frame["token"])
                            await websocket.send_text(json.dumps({"who": "ai", "text": "".join(reply_accumulated), "token": frame["token"]}))
                        if frame.get("needs_approval"):
                            needs_approval = True
                finally:
                    full_reply = "".join(reply_accumulated)
                    if full_reply:
                        chat_service.persist_ai_reply(db, ticket.id, full_reply)
                if needs_approval:
                    await websocket.send_text(json.dumps({
                        "who": "system",
                        "text": "Your request requires agent confirmation. One moment..."
                    }))
            finally:
                db.close()
    except WebSocketDisconnect:
        pass
