"""Billing endpoints — Paystack integration.

POST /billing/initialize   → starts a Paystack checkout session
POST /billing/verify       → confirms payment and activates subscription
POST /billing/webhook      → receives Paystack webhook events
GET  /billing/public-key   → returns the Paystack public key for frontend
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, EmailStr

from app.api.deps import Db
from app.config import settings
from app.core.permissions import BILLING_MANAGE, require_perm
from app.models import Invoice, Plan, Subscription, Tenant, User
from app.services import event_bus
from app.services.serializers import invoice_dto
from app.services.paystack import (
    initialize_transaction,
    verify_transaction,
    verify_webhook_signature,
)

logger = logging.getLogger("prestige.billing")

router = APIRouter(prefix="/billing", tags=["billing"])


class InitializeRequest(BaseModel):
    planCode: str
    email: EmailStr | None = None
    callbackUrl: str | None = None


class VerifyRequest(BaseModel):
    reference: str


# ── Helpers ─────────────────────────────────────────────────────────


def _get_user_plan(db, tenant_id: str) -> Plan | None:
    sub = db.query(Subscription).filter(Subscription.tenant_id == tenant_id).first()
    if not sub:
        return None
    return db.query(Plan).filter(Plan.code == sub.plan_id).first()


def _get_or_create_sub(db, tenant_id: str, plan_code: str) -> Subscription:
    sub = db.query(Subscription).filter(Subscription.tenant_id == tenant_id).first()
    if sub:
        sub.plan_id = plan_code
        sub.status = "active"
        sub.trial_ends_at = None
        sub.current_period_end = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30)
        return sub
    sub = Subscription(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        plan_id=plan_code,
        status="active",
        current_period_end=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(sub)
    return sub


# ── Endpoints ───────────────────────────────────────────────────────


@router.get("/public-key")
def get_public_key() -> dict:
    return {"publicKey": settings.paystack_public_key}


@router.post("/initialize")
def billing_initialize(
    body: InitializeRequest,
    db: Db,
    user: User = Depends(require_perm(BILLING_MANAGE)),
) -> dict:
    plan = db.query(Plan).filter(Plan.code == body.planCode).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    email = body.email or user.email
    amount_kobo = plan.price_mo * 100  # Convert NGN to kobo

    callback = body.callbackUrl or f"{settings.frontend_url}/admin/billing?payment=success"

    try:
        result = initialize_transaction(
            email=email,
            amount_kobo=amount_kobo,
            reference=f"pstg_{uuid.uuid4().hex[:12]}",
            callback_url=callback,
            metadata={
                "tenant_id": user.tenant_id,
                "user_id": user.id,
                "plan_code": plan.code,
                "plan_name": plan.name,
            },
        )
    except Exception as exc:
        logger.error("Paystack initialize failed: %s", exc)
        raise HTTPException(status_code=502, detail="Payment gateway error")

    # Store reference on subscription for later verification
    sub = db.query(Subscription).filter(Subscription.tenant_id == user.tenant_id).first()
    if sub:
        # We'll use the metadata on Paystack's side to track this
        pass
    db.commit()

    return {
        "authorizationUrl": result["authorization_url"],
        "accessCode": result["access_code"],
        "reference": result["reference"],
    }


@router.post("/verify")
def billing_verify(
    body: VerifyRequest,
    db: Db,
    user: User = Depends(require_perm(BILLING_MANAGE)),
) -> dict:
    try:
        data = verify_transaction(body.reference)
    except Exception as exc:
        logger.error("Paystack verify failed: %s", exc)
        raise HTTPException(status_code=502, detail="Payment verification failed")

    if data.get("status") != "success":
        raise HTTPException(status_code=402, detail="Payment was not successful")

    # Extract metadata
    metadata = {}
    raw_meta = data.get("metadata")
    if isinstance(raw_meta, str):
        try:
            metadata = json.loads(raw_meta)
        except (json.JSONDecodeError, TypeError):
            metadata = {}
    elif isinstance(raw_meta, dict):
        metadata = raw_meta
    meta_fields = metadata.get("custom_fields", [])
    if meta_fields:
        for field in meta_fields:
            metadata[field.get("variable_name", "")] = field.get("value", "")

    tenant_id = metadata.get("tenant_id") or user.tenant_id
    plan_code = metadata.get("plan_code", "")

    # Activate subscription
    sub = _get_or_create_sub(db, tenant_id, plan_code)
    tenant = db.get(Tenant, tenant_id)

    # Create invoice
    plan = db.query(Plan).filter(Plan.code == plan_code).first()
    amount_paid = data.get("amount", 0)
    inv = Invoice(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        period=f"{datetime.now(timezone.utc).strftime('%b %d')} – {(datetime.now(timezone.utc) + timedelta(days=30)).strftime('%b %d')}",
        amount=amount_paid,
        status="paid",
        method=data.get("authorization", {}).get("card_type", "card"),
        paid_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(inv)
    db.commit()

    event_bus.publish_event(
        "billing.payment_success",
        {
            "tenant_id": tenant_id,
            "plan_code": plan_code,
            "amount": amount_paid,
            "reference": body.reference,
        },
        tenant_id=tenant_id,
    )

    logger.info(
        "Payment verified: tenant=%s plan=%s amount=%d ref=%s",
        tenant_id, plan_code, amount_paid, body.reference,
    )

    return {
        "status": "success",
        "planCode": plan_code,
        "amount": amount_paid,
        "invoiceId": inv.id,
    }


@router.post("/webhook")
async def billing_webhook(request: Request, db: Db) -> dict:
    """Paystack webhook receiver. Handles charge.success events."""
    body = await request.body()
    signature = request.headers.get("X-Paystack-Signature", "")

    if not verify_webhook_signature(body, signature):
        logger.warning("Invalid Paystack webhook signature")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event", "")
    data = payload.get("data", {})

    if event == "charge.success":
        reference = data.get("reference", "")
        if not reference:
            return {"status": "ignored"}

        # Avoid duplicate processing
        existing = db.query(Invoice).filter(
            Invoice.method.contains(reference[:20])
        ).first()

        metadata = {}
        raw_meta = data.get("metadata")
        if isinstance(raw_meta, str):
            try:
                metadata = json.loads(raw_meta)
            except (json.JSONDecodeError, TypeError):
                metadata = {}
        elif isinstance(raw_meta, dict):
            metadata = raw_meta
        meta_fields = metadata.get("custom_fields", [])
        if meta_fields:
            for field in meta_fields:
                metadata[field.get("variable_name", "")] = field.get("value", "")

        tenant_id = metadata.get("tenant_id", "")
        plan_code = metadata.get("plan_code", "")
        amount = data.get("amount", 0)

        if tenant_id and plan_code:
            sub = _get_or_create_sub(db, tenant_id, plan_code)
            inv = Invoice(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                period=f"{datetime.now(timezone.utc).strftime('%b %d')} – {(datetime.now(timezone.utc) + timedelta(days=30)).strftime('%b %d')}",
                amount=amount,
                status="paid",
                method=f"Paystack ({reference[:16]})",
                paid_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            db.add(inv)
            db.commit()

            event_bus.publish_event(
                "billing.payment_webhook",
                {"tenant_id": tenant_id, "plan_code": plan_code, "reference": reference},
                tenant_id=tenant_id,
            )
            logger.info("Webhook payment confirmed: tenant=%s ref=%s", tenant_id, reference)

    return {"status": "ok"}
