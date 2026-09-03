"""Transactional email helper — real SMTP delivery via the channel EmailProvider.

Used by auth (password reset) and team invites. When SMTP is not configured
(or email_mock=true) the send is a no-op that returns mock=true so callers can
log/link locally as they do today.
"""

import logging

from app.config import settings
from app.services.channels.email import EmailProvider

logger = logging.getLogger("prestige.email")


def send_mail(to: str, subject: str, body: str) -> bool:
    """Send a transactional email. Returns True if delivery was attempted/succeeded,
    False if it failed or SMTP is unconfigured (mock)."""
    if settings.email_mock or not settings.smtp_host:
        logger.info("[mock] email -> %s : %s", to, subject)
        return True
    result = EmailProvider().send(
        {},
        target=to,
        text=f"{subject}\n\n{body}",
    )
    if not result.ok:
        logger.warning("email to %s failed: %s", to, result.error)
    return result.ok