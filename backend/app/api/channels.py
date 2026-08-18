"""Channel management (guide §5.22): connect / disconnect / test / sync + embed.

External channels (whatsapp / telegram / sms / email) store per-tenant provider
credentials in `provider_config` and expose a public webhook URL. Built-in
channels (chat / portal) need no credentials — the chat channel additionally
surfaces the copy-paste widget embed snippet.
"""

import json

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.api.deps import Db, get_tenant
from app.config import settings
from app.core.errors import TicketNotFound
from app.core.permissions import CHANNELS_MANAGE, require_perm
from app.models import ChannelSetting, Tenant, User
from app.services.channels.ingest import ingest_message
from app.services.channels.registry import BUILTIN_CHANNELS, get_provider
from app.services.event_bus import publish_event
from app.services.serializers import channel_dto

router = APIRouter(prefix="/channels", tags=["channels"])


def _get_channel(db: Db, tenant: Tenant, channel_id: str) -> ChannelSetting:
    channel = db.query(ChannelSetting).filter(
        ChannelSetting.tenant_id == tenant.id, ChannelSetting.channel == channel_id).first()
    if not channel:
        raise TicketNotFound("Channel not found")
    return channel


def _webhook_url(request: Request, channel: str, config: dict) -> str:
    base = str(request.base_url).rstrip("/")
    if channel == "whatsapp":
        return f"{base}/api/webhooks/whatsapp"
    if channel == "telegram":
        return f"{base}/api/webhooks/telegram/{config.get('bot_token', '')}"
    if channel == "sms":
        return f"{base}/api/webhooks/twilio"
    if channel == "email":
        return f"{base}/api/webhooks/email"
    return ""


# ---------------------------------------------------------------- list

@router.get("")
def list_channels(db: Db, tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_perm(CHANNELS_MANAGE))) -> list[dict]:
    channels = db.query(ChannelSetting).filter(ChannelSetting.tenant_id == tenant.id).all()
    return [channel_dto(c) for c in channels]


# ---------------------------------------------------------------- update

class ChannelUpdate(BaseModel):
    label: str | None = None
    enabled: bool | None = None
    connected: bool | None = None
    detail: str | None = None
    phone: str | None = None
    address: str | None = None


@router.put("/{channel_id}")
@router.patch("/{channel_id}")
def update_channel(channel_id: str, body: ChannelUpdate, db: Db,
                   tenant: Tenant = Depends(get_tenant),
                   user: User = Depends(require_perm(CHANNELS_MANAGE))) -> dict:
    channel = _get_channel(db, tenant, channel_id)
    patch = body.model_dump(exclude_unset=True)
    for key, value in patch.items():
        setattr(channel, key, value)
    db.commit()
    publish_event("settings_changed", {"channel_id": channel.id})
    return channel_dto(channel)


# ---------------------------------------------------------------- connect

class ChannelConnect(BaseModel):
    """Provider credentials + optional flags. Keys are provider-specific
    (see each provider's `connect`): e.g. whatsapp → access_token,
    phone_number_id, verify_token; telegram → bot_token; sms → account_sid,
    auth_token, from_number; email → from_email, smtp_*/imap_*."""

    config: dict = {}


@router.post("/{channel_id}/connect")
def connect_channel(channel_id: str, body: ChannelConnect, request: Request, db: Db,
                    tenant: Tenant = Depends(get_tenant),
                    user: User = Depends(require_perm(CHANNELS_MANAGE))) -> dict:
    channel = _get_channel(db, tenant, channel_id)
    config = {k: (str(v).strip() if isinstance(v, str) else v) for k, v in body.config.items() if v}
    channel.provider_config = json.dumps(config)
    channel.webhook_url = _webhook_url(request, channel_id, config)
    channel.enabled = True

    if channel_id in BUILTIN_CHANNELS:
        channel.connected = True
        channel.provider_status = "connected"
        channel.last_error = None
    else:
        ok, status = get_provider(channel_id).connect(config)
        channel.connected = ok
        channel.provider_status = status if ok else "error"
        channel.last_error = None if ok else status
    db.commit()
    publish_event("settings_changed", {"channel_id": channel.id})
    return channel_dto(channel)


@router.post("/{channel_id}/disconnect")
def disconnect_channel(channel_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                       user: User = Depends(require_perm(CHANNELS_MANAGE))) -> dict:
    channel = _get_channel(db, tenant, channel_id)
    channel.connected = False
    channel.provider_status = "disconnected"
    channel.last_error = None
    db.commit()
    publish_event("settings_changed", {"channel_id": channel.id})
    return channel_dto(channel)


# ---------------------------------------------------------------- test

class ChannelTest(BaseModel):
    """Optional credential overrides — validate entered fields before saving.
    When omitted, the saved `provider_config` is tested."""

    config: dict | None = None


@router.post("/{channel_id}/test")
def test_channel(channel_id: str, db: Db, body: ChannelTest | None = None,
                 tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_perm(CHANNELS_MANAGE))) -> dict:
    channel = _get_channel(db, tenant, channel_id)
    config = body.config if body and body.config is not None else json.loads(channel.provider_config or "{}")
    ok, message = get_provider(channel_id).test(config)
    if ok:
        channel.connected = True
        channel.provider_status = "connected"
        channel.last_error = None
    else:
        channel.connected = False
        channel.provider_status = "error"
        channel.last_error = message
    db.commit()
    publish_event("settings_changed", {"channel_id": channel.id})
    return {"ok": ok, "message": message}


# ---------------------------------------------------------------- sync (poll)

@router.post("/{channel_id}/sync")
def sync_channel(channel_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                 user: User = Depends(require_perm(CHANNELS_MANAGE))) -> dict:
    channel = _get_channel(db, tenant, channel_id)
    provider = get_provider(channel_id)
    if not provider.supports_poll:
        return {"ok": False, "message": f"{channel.label} does not support polling."}
    config = json.loads(channel.provider_config or "{}")
    messages = provider.poll(config)
    count = 0
    for msg in messages:
        ingest_message(db, channel, msg)
        count += 1
    return {"ok": True, "ingested": count}


# ---------------------------------------------------------------- embed

@router.get("/{channel_id}/embed")
def channel_embed(channel_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                  user: User = Depends(require_perm(CHANNELS_MANAGE))) -> dict:
    channel = _get_channel(db, tenant, channel_id)
    if channel_id == "chat":
        url = f"{settings.frontend_url.rstrip('/')}/widget-embed?tenantId={tenant.slug}"
        code = (
            f'<iframe src="{url}" title="{channel.label}" width="100%" height="100%" '
            f'style="border:0;min-height:600px"></iframe>'
        )
        return {"url": url, "code": code}
    return {"url": channel.webhook_url or "", "code": channel.webhook_url or ""}
