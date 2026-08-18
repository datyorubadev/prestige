"""Public channel webhook receivers + the demo simulator.

Provider webhooks are unauthenticated by design (platforms don't send our
bearer tokens), so they resolve the tenant through the channel credentials
embedded in each request:
  * WhatsApp  — phone_number_id (event) / verify_token (handshake)
  * Telegram  — bot_token in the URL path
  * Twilio    — the inbound `To` number == configured from_number
  * Email     — the `to` address == configured from_email (mailbox forwarding)

`/webhooks/simulate` is an authenticated endpoint that injects a message
through the same pipeline — the no-credentials demo path for every channel.
"""

import json
import logging

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from app.api.deps import Db, require_admin
from app.core.errors import TicketNotFound
from app.models import ChannelSetting
from app.services.channels.base import InboundMessage
from app.services.channels.ingest import ingest_message
from app.services.channels.simulator import PROVIDER as SIMULATOR
from app.services.channels.whatsapp import PROVIDER as WHATSAPP
from app.services.channels.telegram import PROVIDER as TELEGRAM
from app.services.channels.twilio import PROVIDER as TWILIO
from app.services.channels.email import PROVIDER as EMAIL

logger = logging.getLogger("prestige.channels.webhooks")

router = APIRouter(prefix="/webhooks", tags=["channel-webhooks"])


def _channel_by(db: Db, channel: str, predicate) -> ChannelSetting | None:
    rows = db.query(ChannelSetting).filter(ChannelSetting.channel == channel).all()
    for row in rows:
        try:
            config = json.loads(row.provider_config or "{}")
        except (ValueError, TypeError):
            config = {}
        if predicate(config):
            return row
    return None


def _ingest_or_ack(db: Db, channel: ChannelSetting | None, msg: InboundMessage | None) -> Response:
    if not channel or not msg:
        if msg and not channel:
            logger.warning("no channel found for %s inbound from %s", msg.channel, msg.sender_id)
        return Response(status_code=200, content="ok")
    if not channel.enabled:
        return Response(status_code=200, content="ok")
    try:
        ingest_message(db, channel, msg)
    except Exception as exc:  # noqa: BLE001
        logger.warning("ingest failed for %s: %s", msg.channel, exc)
    return Response(status_code=200, content="ok")


# ---------------------------------------------------------------- whatsapp

@router.get("/whatsapp")
def whatsapp_verify(request: Request, db: Db) -> Response:
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    if mode == "subscribe" and token:
        channel = _channel_by(db, "whatsapp", lambda c: c.get("verify_token") == token)
        if channel:
            return Response(content=str(challenge or ""), media_type="text/plain")
    return Response(status_code=403, content="Verification failed")


@router.post("/whatsapp")
async def whatsapp_event(request: Request, db: Db) -> Response:
    payload = await request.json()
    metadata = {}
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            if value.get("metadata"):
                metadata = value["metadata"]
                break
    msg = WHATSAPP.parse_inbound(payload)
    if msg:
        phone_number_id = metadata.get("phone_number_id")
        channel = _channel_by(db, "whatsapp", lambda c: c.get("phone_number_id") == phone_number_id) \
            if phone_number_id else None
        return _ingest_or_ack(db, channel, msg)
    return Response(status_code=200, content="ok")


# ---------------------------------------------------------------- telegram

@router.post("/telegram/{bot_token}")
async def telegram_event(bot_token: str, request: Request, db: Db) -> Response:
    payload = await request.json()
    msg = TELEGRAM.parse_inbound(payload)
    if not msg:
        return Response(status_code=200, content="ok")
    channel = _channel_by(db, "telegram", lambda c: c.get("bot_token") == bot_token)
    return _ingest_or_ack(db, channel, msg)


# ---------------------------------------------------------------- twilio

@router.post("/twilio")
async def twilio_event(request: Request, db: Db) -> Response:
    form = await request.form()
    payload = {k: v for k, v in form.items()}
    msg = TWILIO.parse_inbound(payload)
    if not msg:
        return Response(status_code=200, content="ok")
    to_number = payload.get("To")
    channel = _channel_by(db, "sms", lambda c: c.get("from_number") == to_number) if to_number else None
    return _ingest_or_ack(db, channel, msg)


# ---------------------------------------------------------------- email

@router.post("/email")
async def email_event(request: Request, db: Db) -> Response:
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        payload = dict(await request.form())
    msg = EMAIL.parse_inbound(payload)
    if not msg:
        return Response(status_code=200, content="ok")
    to_address = str(payload.get("to") or payload.get("To") or "").strip().lower()
    channel = _channel_by(db, "email", lambda c: (c.get("from_email") or "").lower() == to_address) \
        if to_address else None
    return _ingest_or_ack(db, channel, msg)


# ---------------------------------------------------------------- simulate

class SimulateRequest(BaseModel):
    channel: str = "whatsapp"
    from_: str = "demo_customer"
    name: str | None = None
    text: str
    auto_reply: bool | None = None


@router.post("/simulate")
def simulate(body: SimulateRequest, db: Db,
             user=Depends(require_admin)) -> dict:
    channel = db.query(ChannelSetting).filter(
        ChannelSetting.channel == body.channel, ChannelSetting.enabled.is_(True)).first()
    if not channel:
        raise TicketNotFound("No enabled channel matches that key.")
    msg = SIMULATOR.parse_inbound({
        "channel": body.channel,
        "from": body.from_,
        "name": body.name,
        "text": body.text,
    })
    if not msg:
        raise TicketNotFound("Message could not be parsed.")
    return ingest_message(db, channel, msg, auto_reply=body.auto_reply)

