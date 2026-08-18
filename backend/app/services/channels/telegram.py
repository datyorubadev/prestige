"""Telegram provider — Bot API.

Inbound is supported two ways:
  * webhook: `setWebhook` is NOT called automatically (local dev); the tenant
    points Telegram at `POST /api/webhooks/telegram/{bot_token}`.
  * long-poll: `POST /api/channels/{id}/sync` calls getUpdates via `poll()`.

Outbound: POST /bot{token}/sendMessage { chat_id, text }.
"""

import logging

import requests

from app.services.channels.base import InboundMessage, SendResult

logger = logging.getLogger("prestige.channels.telegram")

API = "https://api.telegram.org"
SECRETS = {"bot_token"}


def _config_error(config: dict) -> str | None:
    if not config.get("bot_token"):
        return "Bot token is required."
    return None


class TelegramProvider:
    key = "telegram"
    label = "Telegram"
    supports_poll = True

    def connect(self, config: dict) -> tuple[bool, str]:
        err = _config_error(config)
        return (False, err) if err else (True, "connected")

    def test(self, config: dict) -> tuple[bool, str]:
        err = _config_error(config)
        if err:
            return False, err
        try:
            resp = requests.get(f"{API}/bot{config['bot_token']}/getMe", timeout=10)
            if resp.status_code == 200:
                user = (resp.json().get("result") or {}).get("username") or "bot"
                return True, f"Connected to @{user}."
            return False, f"Telegram API error {resp.status_code}: {resp.text[:200]}"
        except Exception as exc:  # noqa: BLE001
            return False, f"Could not reach Telegram API: {exc}"

    def send(self, config: dict, target: str, text: str) -> SendResult:
        err = _config_error(config)
        if err:
            return SendResult(ok=False, error=err)
        try:
            resp = requests.post(
                f"{API}/bot{config['bot_token']}/sendMessage",
                json={"chat_id": target, "text": text[:4000]},
                timeout=15,
            )
            if resp.status_code == 200:
                mid = (resp.json().get("result") or {}).get("message_id")
                return SendResult(ok=True, external_id=str(mid) if mid else None)
            return SendResult(ok=False, error=f"Telegram API error {resp.status_code}: {resp.text[:200]}")
        except Exception as exc:  # noqa: BLE001
            logger.warning("telegram send failed", exc_info=True)
            return SendResult(ok=False, error=str(exc))

    def parse_inbound(self, payload: dict) -> InboundMessage | None:
        msg = payload.get("message") or {}
        if not msg:
            return None
        text = str(msg.get("text") or "").strip()
        if not text:
            return None
        chat = msg.get("chat") or {}
        frm = msg.get("from") or {}
        name = " ".join(p for p in (frm.get("first_name"), frm.get("last_name")) if p) or None
        return InboundMessage(
            channel="telegram",
            sender_id=str(chat.get("id") or frm.get("id") or ""),
            sender_name=name,
            text=text,
            external_message_id=str(msg.get("message_id") or "") or None,
            raw=payload,
        )

    def poll(self, config: dict) -> list[InboundMessage]:
        err = _config_error(config)
        if err:
            return []
        out: list[InboundMessage] = []
        try:
            resp = requests.get(
                f"{API}/bot{config['bot_token']}/getUpdates",
                params={"timeout": 2, "limit": 10},
                timeout=15,
            )
            if resp.status_code != 200:
                return []
            for update in resp.json().get("result") or []:
                msg = self.parse_inbound(update)
                if msg:
                    out.append(msg)
        except Exception as exc:  # noqa: BLE001
            logger.warning("telegram poll failed: %s", exc)
        return out


PROVIDER = TelegramProvider()
