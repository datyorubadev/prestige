"""Paystack payment gateway service.

Handles transaction initialization, verification, and webhook signature
validation for the Paystack payment platform.
"""

import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

import requests

from app.config import settings

logger = logging.getLogger("prestige.paystack")

PAYSTACK_API = settings.paystack_base_url


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.paystack_secret_key}",
        "Content-Type": "application/json",
    }


def initialize_transaction(
    email: str,
    amount_kobo: int,
    plan_code: str | None = None,
    reference: str | None = None,
    callback_url: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Initialize a Paystack transaction.

    Args:
        email: Customer email address.
        amount_kobo: Amount in kobo (NGN × 100).
        plan_code: Optional Paystack plan code for subscriptions.
        reference: Unique reference; auto-generated if not provided.
        callback_url: Redirect URL after payment.
        metadata: Extra metadata dict passed through to Paystack.

    Returns:
        dict with keys: authorization_url, access_code, reference
    """
    if not reference:
        reference = f"pstg_{uuid.uuid4().hex[:12]}"

    payload: dict = {
        "email": email,
        "amount": str(amount_kobo),
        "reference": reference,
    }
    if plan_code:
        payload["plan"] = plan_code
    if callback_url:
        payload["callback_url"] = callback_url
    if metadata:
        payload["metadata"] = json.dumps(metadata)

    resp = requests.post(
        f"{PAYSTACK_API}/transaction/initialize",
        headers=_headers(),
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("status"):
        raise ValueError(data.get("message", "Paystack initialize failed"))
    return data["data"]


def verify_transaction(reference: str) -> dict:
    """Verify a Paystack transaction by reference.

    Returns the full data dict from Paystack on success.
    Raises ValueError if the transaction failed or was not found.
    """
    resp = requests.get(
        f"{PAYSTACK_API}/transaction/verify/{reference}",
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("status"):
        raise ValueError(data.get("message", "Paystack verify failed"))
    return data["data"]


def verify_webhook_signature(payload_body: bytes, signature: str) -> bool:
    """Validate the X-Paystack-Signature header using HMAC-SHA512.

    FAILS CLOSED: if no webhook secret is configured, the signature is
    rejected. This prevents forged payment webhooks in misconfigured deploys.
    """
    secret = settings.paystack_webhook_secret
    if not secret:
        logger.warning("Paystack webhook secret not configured — rejecting signature")
        return False
    computed = hmac.new(
        secret.encode("utf-8"), payload_body, hashlib.sha512
    ).hexdigest()
    return hmac.compare_digest(computed, signature)
