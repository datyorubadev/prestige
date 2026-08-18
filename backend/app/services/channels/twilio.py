"""SMS provider — Twilio Programmable Messaging.

Inbound: Twilio posts form-encoded data (From, To, Body, MessageSid) to
`POST /api/webhooks/twilio`. (Signature validation via X-Twilio-Signature is
left as a production hardening step.)

Outbound: POST /Accounts/{sid}/Messages.json with basic auth.
"""

import logging

import requests

from app.services.channels.base import InboundMessage, SendResult

logger = logging.getLogger("prestige.channels.twilio")

API = "https://api.twilio.com/2010-04-01"
SECRETS = {"account_sid", "auth_token"}


def _config_error(config: dict) -> str | None:
    if not config.get("account_sid"):
        return "Account SID is required."
    if not config.get("auth_token"):
        return "Auth token is required."
    if not config.get("from_number"):
        return "Messaging number is required."
    return None


class TwilioProvider:
    key = "sms"
    label = "SMS"
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
                f"{API}/Accounts/{config['account_sid']}.json",
                auth=(config["account_sid"], config["auth_token"]),
                timeout=10,
            )
            if resp.status_code == 200:
                name = (resp.json().get("friendly_name") or config["account_sid"])
                return True, f"Connected to Twilio account {name}."
            return False, f"Twilio API error {resp.status_code}: {resp.text[:200]}"
        except Exception as exc:  # noqa: BLE001
            return False, f"Could not reach Twilio API: {exc}"

    def send(self, config: dict, target: str, text: str) -> SendResult:
        err = _config_error(config)
        if err:
            return SendResult(ok=False, error=err)
        try:
            resp = requests.post(
                f"{API}/Accounts/{config['account_sid']}/Messages.json",
                auth=(config["account_sid"], config["auth_token"]),
                data={"From": config["from_number"], "To": target, "Body": text[:1600]},
                timeout=15,
            )
            if resp.status_code in (200, 201):
                sid = (resp.json() or {}).get("sid")
                return SendResult(ok=True, external_id=sid)
            return SendResult(ok=False, error=f"Twilio API error {resp.status_code}: {resp.text[:200]}")
        except Exception as exc:  # noqa: BLE001
            logger.warning("twilio send failed", exc_info=True)
            return SendResult(ok=False, error=str(exc))

    def parse_inbound(self, payload: dict) -> InboundMessage | None:
        text = str(payload.get("Body") or "").strip()
        sender = str(payload.get("From") or "").strip()
        if not text or not sender:
            return None
        return InboundMessage(
            channel="sms",
            sender_id=sender,
            sender_name=None,
            text=text,
            external_message_id=str(payload.get("MessageSid") or "") or None,
            raw=payload,
        )


PROVIDER = TwilioProvider()
