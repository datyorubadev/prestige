"""Email provider — SMTP outbound + IMAP inbound.

Outbound uses the channel's SMTP settings (falls back to the global
`settings.smtp_*`). If no SMTP credentials exist anywhere, the send is logged
to the outbox as a simulated success (mock transport).

Inbound is pull-based: `POST /api/channels/{id}/sync` (or an IMAP poller)
fetches unseen mail from the channel's IMAP inbox. A generic
`POST /api/webhooks/email` JSON receiver is also supported for mail services
that can forward (Mailgun-style).
"""

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr, parseaddr

import requests

from app.config import settings
from app.services.channels.base import InboundMessage, SendResult

logger = logging.getLogger("prestige.channels.email")

SECRETS = {"smtp_pass", "imap_pass"}


def _config_error(config: dict) -> str | None:
    if not config.get("from_email"):
        return "From email is required."
    return None


def _smtp_targets(config: dict) -> tuple[str, int, str | None, str | None]:
    if config.get("smtp_host"):
        return (
            config["smtp_host"],
            int(config.get("smtp_port") or 587),
            config.get("smtp_user") or config.get("from_email"),
            config.get("smtp_pass") or "",
        )
    return settings.smtp_host, settings.smtp_port, settings.smtp_user, settings.smtp_pass


class EmailProvider:
    key = "email"
    label = "Email"
    supports_poll = True

    def connect(self, config: dict) -> tuple[bool, str]:
        err = _config_error(config)
        return (False, err) if err else (True, "connected")

    def test(self, config: dict) -> tuple[bool, str]:
        err = _config_error(config)
        if err:
            return False, err
        host, port, user, password = _smtp_targets(config)
        if not host:
            return True, "No SMTP host configured — using mock transport."
        try:
            with smtplib.SMTP(host, port, timeout=10) as smtp:
                smtp.ehlo()
                if port == 587 or port == 25:
                    smtp.starttls()
                if user:
                    smtp.login(user, password)
            return True, f"SMTP {host}:{port} reachable."
        except Exception as exc:  # noqa: BLE001
            return False, f"SMTP check failed: {exc}"

    def send(self, config: dict, target: str, text: str) -> SendResult:
        err = _config_error(config)
        if err:
            return SendResult(ok=False, error=err)
        host, port, user, password = _smtp_targets(config)
        from_addr = config.get("from_email") or settings.from_email or "noreply@portal.ng"
        msg = EmailMessage()
        msg["From"] = formataddr((config.get("from_name") or "Support", from_addr))
        msg["To"] = target
        msg["Subject"] = "Re: your request" if config.get("reply_subject") else "Support reply"
        msg.set_content(text[:16000])
        if not host:
            return SendResult(ok=True, external_id=None, error="")
        try:
            with smtplib.SMTP(host, port, timeout=15) as smtp:
                smtp.ehlo()
                if port in (587, 25):
                    smtp.starttls()
                if user:
                    smtp.login(user, password)
                smtp.send_message(msg)
            return SendResult(ok=True, external_id=msg["Message-ID"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("email send failed", exc_info=True)
            return SendResult(ok=False, error=str(exc))

    def parse_inbound(self, payload: dict) -> InboundMessage | None:
        sender = str(payload.get("from") or payload.get("From") or "").strip()
        body = str(payload.get("body") or payload.get("stripped-text") or "").strip()
        if not sender or not body:
            return None
        name, addr = parseaddr(sender)
        subject = str(payload.get("subject") or "").strip()
        text = f"{subject}\n{body}" if subject else body
        return InboundMessage(
            channel="email",
            sender_id=(addr or sender).lower(),
            sender_name=name or None,
            text=text,
            external_message_id=str(payload.get("Message-Id") or payload.get("message_id") or "") or None,
            raw=payload,
        )

    def poll(self, config: dict) -> list[InboundMessage]:
        err = _config_error(config)
        if err:
            return []
        import email as _email
        import imaplib
        from email.header import decode_header

        host = config.get("imap_host") or config.get("smtp_host")
        if not host:
            return []
        user = config.get("imap_user") or config.get("smtp_user") or config.get("from_email")
        password = config.get("imap_pass") or config.get("smtp_pass") or ""
        port = int(config.get("imap_port") or 993)

        def _dec(value: str) -> str:
            if not value:
                return ""
            parts = decode_header(value)
            out = []
            for raw, charset in parts:
                try:
                    out.append(raw.decode(charset or "utf-8", errors="replace"))
                except AttributeError:
                    out.append(str(raw))
            return "".join(out).strip()

        try:
            if port == 993:
                conn = imaplib.IMAP4_SSL(host, port)
            else:
                conn = imaplib.IMAP4(host, port)
            conn.login(user, password)
        except Exception as exc:  # noqa: BLE001
            logger.warning("IMAP login failed: %s", exc)
            return []

        out: list[InboundMessage] = []
        try:
            conn.select("INBOX")
            _, data = conn.search(None, "UNSEEN")
            for num in (data[0] or b"").split():
                if len(out) >= 20:
                    break
                _, msg_data = conn.fetch(num, "(RFC822)")
                raw = msg_data[0][1] if msg_data and msg_data[0] else b""
                if not raw:
                    continue
                mail = _email.message_from_bytes(raw)
                _, addr = parseaddr(_dec(mail.get("From", "")))
                body = ""
                if mail.is_multipart():
                    for part in mail.walk():
                        if part.get_content_type() == "text/plain":
                            body = part.get_payload(decode=True) or b""
                            try:
                                body = body.decode(part.get_content_charset() or "utf-8", errors="replace")
                            except (UnicodeDecodeError, AttributeError):
                                body = str(body)
                            break
                else:
                    body = mail.get_payload(decode=True) or b""
                    try:
                        body = body.decode(mail.get_content_charset() or "utf-8", errors="replace")
                    except (UnicodeDecodeError, AttributeError):
                        body = str(body)
                subject = _dec(mail.get("Subject", ""))
                text = f"{subject}\n{body}".strip() if subject else body.strip()
                if addr and text:
                    out.append(InboundMessage(
                        channel="email",
                        sender_id=addr.lower(),
                        sender_name=None,
                        text=text[:16000],
                        external_message_id=str(mail.get("Message-ID") or "") or None,
                    ))
                conn.store(num, "+FLAGS", r"(\Seen)")
        except Exception as exc:  # noqa: BLE001
            logger.warning("IMAP poll failed: %s", exc)
        finally:
            try:
                conn.logout()
            except Exception:  # noqa: BLE001
                pass
        return out


PROVIDER = EmailProvider()
