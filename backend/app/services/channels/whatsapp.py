"""WhatsApp provider — Meta Cloud (Graph) API.

Webhook: the tenant's `webhook_url` points at `POST /api/webhooks/whatsapp`.
Meta calls `GET` first (hub.mode/hub.verify_token/hub.challenge) — that GET is
served by the same route with `hub.verify_token` resolving the tenant channel.

Outbound uses the per-phone-number messages endpoint:
  POST /{phone_number_id}/messages  { messaging_product, to, text }
"""

import logging

import requests

from app.services.channels.base import InboundMessage, SendResult

logger = logging.getLogger("prestige.channels.whatsapp")

GRAPH_BASE = "https://graph.facebook.com/v20.0"
SECRETS = {"access_token", "verify_token"}


def _config_error(config: dict) -> str | None:
    if not config.get("access_token"):
        return "Access token is required."
    if not config.get("phone_number_id"):
        return "Phone number ID is required."
    if not config.get("verify_token"):
        return "Webhook verify token is required."
    return None


class WhatsAppProvider:
    key = "whatsapp"
    label = "WhatsApp"
    supports_poll = False

    def connect(self, config: dict) -> tuple[bool, str]:
        err = _config_error(config)
        return (False, err) if err else (True, "connected")

    def test(self, config: dict) -> tuple[bool, str]:
        err = _config_error(config)
        if err:
            return False, err
        try:
            resp = requests.get(
                f"{GRAPH_BASE}/{config['phone_number_id']}",
                params={"access_token": config["access_token"]},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                name = data.get("display_phone_number") or data.get("id")
                return True, f"Connected to WhatsApp number {name}."
            return False, f"Meta API error {resp.status_code}: {resp.text[:200]}"
        except Exception as exc:  # noqa: BLE001
            return False, f"Could not reach Meta API: {exc}"

    def send(self, config: dict, target: str, text: str) -> SendResult:
        err = _config_error(config)
        if err:
            return SendResult(ok=False, error=err)
        try:
            resp = requests.post(
                f"{GRAPH_BASE}/{config['phone_number_id']}/messages",
                headers={"Authorization": f"Bearer {config['access_token']}"},
                json={
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": target,
                    "type": "text",
                    "text": {"body": text[:4000]},
                },
                timeout=15,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                ext = None
                for m in data.get("messages") or []:
                    ext = m.get("id")
                return SendResult(ok=True, external_id=ext)
            return SendResult(ok=False, error=f"Meta API error {resp.status_code}: {resp.text[:200]}")
        except Exception as exc:  # noqa: BLE001
            logger.warning("whatsapp send failed", exc_info=True)
            return SendResult(ok=False, error=str(exc))

    def parse_inbound(self, payload: dict) -> InboundMessage | None:
        if payload.get("object") != "whatsapp_business_account":
            return None
        for entry in payload.get("entry") or []:
            for change in entry.get("changes") or []:
                value = change.get("value") or {}
                msgs = value.get("messages") or []
                if not msgs:
                    continue
                contacts = value.get("contacts") or []
                msg = msgs[0]
                text = ""
                if msg.get("type") == "text":
                    text = str((msg.get("text") or {}).get("body") or "").strip()
                elif msg.get("type") == "button":
                    text = str((msg.get("button") or {}).get("text") or "").strip()
                if not text:
                    continue
                name = None
                if contacts:
                    name = (contacts[0].get("profile") or {}).get("name")
                return InboundMessage(
                    channel="whatsapp",
                    sender_id=str(msg.get("from") or ""),
                    sender_name=name,
                    text=text,
                    external_message_id=str(msg.get("id") or "") or None,
                    raw=payload,
                )
        return None


PROVIDER = WhatsAppProvider()
