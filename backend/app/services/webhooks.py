"""Webhook delivery engine (guide §5.19 / owner integrations tab).

Signs payloads with HMAC-SHA256 (X-Prestige-Signature), posts to the endpoint,
and records a WebhookDelivery row per attempt (success / retrying / failed).
"""

import hashlib
import hmac
import json
import time

from sqlalchemy.orm import Session

from app.models import WebhookDelivery, WebhookEndpoint


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
        results.append(_deliver(db, endpoint, event, payload))
    db.commit()
    return results


def _deliver(db: Session, endpoint: WebhookEndpoint, event: str, payload: dict) -> dict:
    body = json.dumps({"event": event, "payload": payload}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    signature = _sign(endpoint.secret, body)
    if signature:
        headers["X-Prestige-Signature"] = signature
    try:
        import requests

        started = time.monotonic()
        resp = requests.post(endpoint.url, data=body, headers=headers, timeout=5)
        duration_ms = int((time.monotonic() - started) * 1000)
        ok = resp.status_code < 400
        db.add(WebhookDelivery(
            endpoint_id=endpoint.id, event=event,
            status="success" if ok else "failed",
            attempts=1, http_status=resp.status_code, duration_ms=duration_ms,
        ))
        return {"endpointId": endpoint.id, "event": event, "status": "success" if ok else "failed",
                "httpStatus": resp.status_code, "durationMs": duration_ms}
    except Exception:
        db.add(WebhookDelivery(
            endpoint_id=endpoint.id, event=event,
            status="failed", attempts=1, http_status=None, duration_ms=0,
        ))
        return {"endpointId": endpoint.id, "event": event, "status": "failed",
                "httpStatus": None, "durationMs": 0}


def test_endpoint(db: Session, endpoint: WebhookEndpoint) -> dict:
    """Manual test (ticket.test) — same signing + delivery path as a real event."""
    return _deliver(db, endpoint, "ticket.test",
                    {"ticket_id": None, "subject": "Webhook connectivity test"})
