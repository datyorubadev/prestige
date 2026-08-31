"""Webhook delivery engine (guide §5.19 / owner integrations tab).

Signs payloads with HMAC-SHA256 (X-Prestige-Signature), posts to the endpoint,
and records a WebhookDelivery row per attempt (success / retrying / failed).

Failed deliveries are retried up to 3 times with exponential backoff
(1s → 2s → 4s) before being marked permanently failed.
"""

import hashlib
import hmac
import json
import logging
import time

from sqlalchemy.orm import Session

from app.models import WebhookDelivery, WebhookEndpoint

logger = logging.getLogger("prestige.webhooks")

MAX_RETRIES = 3
BACKOFF_BASE = 1.0  # seconds; 1 → 2 → 4


def _sign(secret: str, payload: bytes) -> str:
    if not secret:
        return ""
    digest = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def deliver_event(db: Session, tenant_id: str, event: str, payload: dict) -> list[dict]:
    """Fire `event` to every active endpoint of the tenant subscribed to it."""
    endpoints = (
        db.query(WebhookEndpoint)
        .filter(WebhookEndpoint.tenant_id == tenant_id, WebhookEndpoint.is_active.is_(True))
        .all()
    )
    results: list[dict] = []
    for endpoint in endpoints:
        try:
            events = json.loads(endpoint.events or "[]")
        except (ValueError, TypeError):
            events = []
        if event not in events:
            continue
        results.append(_deliver_with_retry(db, endpoint, event, payload))
    db.commit()
    return results


def _attempt_delivery(db: Session, endpoint: WebhookEndpoint, event: str,
                      payload: dict) -> tuple[dict, int]:
    """Single HTTP attempt. Returns (result_dict, attempt_number).

    attempt_number is always 1 for the first call — the retry wrapper
    increments it on re-delivery.
    """
    body = json.dumps({"event": event, "payload": payload}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    signature = _sign(endpoint.secret, body)
    if signature:
        headers["X-Prestige-Signature"] = signature
    try:
        import requests

        started = time.monotonic()
        resp = requests.post(endpoint.url, data=body, headers=headers, timeout=8)
        duration_ms = int((time.monotonic() - started) * 1000)
        ok = resp.status_code < 400
        status = "success" if ok else "retrying"
        return {
            "endpointId": endpoint.id,
            "event": event,
            "status": status,
            "httpStatus": resp.status_code,
            "durationMs": duration_ms,
        }, resp.status_code if ok else 0
    except Exception:
        return {
            "endpointId": endpoint.id,
            "event": event,
            "status": "retrying",
            "httpStatus": None,
            "durationMs": 0,
        }, 0


def _deliver_with_retry(db: Session, endpoint: WebhookEndpoint, event: str,
                        payload: dict) -> dict:
    """Deliver with up to MAX_RETRIES attempts and exponential backoff."""
    last_result: dict = {}
    last_http = 0

    for attempt in range(1, MAX_RETRIES + 1):
        result, http_status = _attempt_delivery(db, endpoint, event, payload)
        last_result = result
        last_http = http_status

        if http_status >= 400 or http_status == 0:
            # Record the retrying attempt
            db.add(WebhookDelivery(
                endpoint_id=endpoint.id, event=event,
                status="retrying" if attempt < MAX_RETRIES else "failed",
                attempts=attempt, http_status=http_status or None,
                duration_ms=result.get("durationMs", 0),
            ))
            if attempt < MAX_RETRIES:
                wait = BACKOFF_BASE * (2 ** (attempt - 1))
                logger.info(
                    "Webhook %s attempt %d/%d failed (status=%s), retrying in %.1fs",
                    endpoint.id, attempt, MAX_RETRIES, http_status or "timeout", wait,
                )
                time.sleep(wait)
        else:
            # Success
            db.add(WebhookDelivery(
                endpoint_id=endpoint.id, event=event,
                status="success", attempts=attempt,
                http_status=http_status,
                duration_ms=result.get("durationMs", 0),
            ))
            result["attempts"] = attempt
            return result

    # All retries exhausted
    last_result["attempts"] = MAX_RETRIES
    return last_result


def test_endpoint(db: Session, endpoint: WebhookEndpoint) -> dict:
    """Manual test (ticket.test) — same signing + delivery path as a real event."""
    return _deliver_with_retry(db, endpoint, "ticket.test",
                               {"ticket_id": None, "subject": "Webhook connectivity test"})
