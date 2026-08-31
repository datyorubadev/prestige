"""Escalation rule management (guide §4.3). Owner CRUD; super_admin read-only."""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import Db, get_tenant, require_admin, require_team
from app.core.errors import TicketNotFound
from app.models import EscalationRule, Tenant
from app.services.escalation import evaluate
from app.services.serializers import rule_dto

router = APIRouter(prefix="/rules", tags=["rules"])

PRESET_IDS = {"E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10"}

PRESET_DEFAULTS = {
    "E1": ("Direct human request", "Customer asks to speak to a person", "customer_request", "escalate",
           ["human", "agent", "manager", "representative", "speak to someone", "talk to a person"]),
    "E2": ("High-frustration phrases", "Abusive / frustration keywords incl. Pidgin", "keywords", "escalate",
           ["useless bot", "this bot is stupid", "wetin dey happen", "ole", "thief", "scam", "fraud", "stupid"]),
    "E3": ("Money / legal threat", "Stolen money, lawsuit, CBN, EFCC, police", "keywords", "escalate + priority HIGH",
           ["stole my money", "stolen", "sue", "lawyer", "cbn", "efcc", "police", "report you", "complaint"]),
    "E4": ("Refund / demands", "Refund, compensation, money back", "keywords", "escalate",
           ["refund", "reverse my money", "give me my money back", "compensation", "reversal"]),
    "E5": ("Conversational loop", "Repeated identical customer messages", "conversation_loop", "escalate",
           ["identical ≥2", "near-identical ≥3"]),
    "E6": ("Repeated failed self-service", "Same question 3× with empty retrieval", "repeat_failed_self_service", "escalate + kb_gap",
           ["same question ≥3×", "empty retrieval"]),
    "E7": ("AI low confidence ×2", "LLM refuses twice with low confidence", "confidence_below", "escalate",
           ["confidence < 0.5", "consecutive ≥2"]),
    "E8": ("Negative sentiment burst", "2+ consecutive negative turns", "sentiment_negative", "escalate",
           ["negative turns ≥2"]),
    "E9": ("Security-sensitive content", "Card number, OTP or password in text", "pii_security", "escalate + audit",
           ["card number", "otp", "password"]),
    "E10": ("SLA timeout", "Open ticket, no reply in 60 min", "sla_timeout", "escalate + notify",
            ["open > 60 min", "no agent reply"]),
}

CONDITIONS = {
    "customer_request", "keywords", "conversation_loop", "repeat_failed_self_service",
    "confidence_below", "sentiment_negative", "pii_security", "sla_timeout", "customer_segment",
}


@router.get("")
def list_rules(db: Db, tenant: Tenant = Depends(get_tenant),
               user=Depends(require_team)) -> list[dict]:
    rules = db.query(EscalationRule).filter(EscalationRule.tenant_id == tenant.id) \
        .order_by(EscalationRule.created_at).all()
    return [rule_dto(r) for r in rules]


class RuleTestRequest(BaseModel):
    text: str


@router.post("/test")
def test_rules(body: RuleTestRequest, db: Db, tenant: Tenant = Depends(get_tenant),
               user=Depends(require_team)) -> list[dict]:
    from app.models import Ticket

    probe = Ticket(tenant_id=tenant.id)
    fired = evaluate(db, tenant, probe, body.text)
    return [rule_dto(r) for r in fired]


class RuleCreate(BaseModel):
    name: str = Field(..., min_length=1)
    desc: str = ""
    cond: str = "keywords"
    action: str = "escalate"
    terms: list[str] = []
    enabled: bool = True


@router.post("")
def create_rule(body: RuleCreate, db: Db, tenant: Tenant = Depends(get_tenant),
                user=Depends(require_admin)) -> dict:
    if body.cond not in CONDITIONS:
        raise HTTPException(status_code=400, detail=f"Unknown condition '{body.cond}'")
    max_num = 0
    for r in db.query(EscalationRule).filter(EscalationRule.tenant_id == tenant.id).all():
        try:
            max_num = max(max_num, int(r.id.replace("E", "")) or 0)
        except ValueError:
            pass
    rule = EscalationRule(
        id=f"E{max_num + 1}", tenant_id=tenant.id, name=body.name, desc=body.desc,
        condition_field=body.cond, condition_value=body.action, action=body.action,
        target_role="agent", delay_minutes=0, terms=json.dumps(body.terms),
        is_active=body.enabled, preset=False,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule_dto(rule)


class RuleUpdate(BaseModel):
    name: str | None = None
    desc: str | None = None
    cond: str | None = None
    action: str | None = None
    terms: list[str] | None = None
    enabled: bool | None = None
    reset: bool | None = None


@router.put("/{rule_id}")
def update_rule(rule_id: str, body: RuleUpdate, db: Db,
                tenant: Tenant = Depends(get_tenant),
                user=Depends(require_admin)) -> dict:
    rule = db.get(EscalationRule, rule_id)
    if not rule or rule.tenant_id != tenant.id:
        raise TicketNotFound("Rule not found")
    if body.reset and rule.id in PRESET_DEFAULTS:
        name, desc, cond, action, terms = PRESET_DEFAULTS[rule.id]
        rule.name, rule.desc = name, desc
        rule.condition_field, rule.action = cond, action
        rule.terms = json.dumps(terms)
        rule.is_active = True
        rule.preset = True
    else:
        if body.name is not None:
            rule.name = body.name
        if body.desc is not None:
            rule.desc = body.desc
        if body.cond is not None:
            if body.cond not in CONDITIONS:
                raise HTTPException(status_code=400, detail=f"Unknown condition '{body.cond}'")
            rule.condition_field = body.cond
        if body.action is not None:
            rule.action = body.action
            rule.condition_value = body.action
        if body.terms is not None:
            rule.terms = json.dumps(body.terms)
        if body.enabled is not None:
            rule.is_active = body.enabled
    db.commit()
    db.refresh(rule)
    return rule_dto(rule)


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                user=Depends(require_admin)) -> None:
    rule = db.get(EscalationRule, rule_id)
    if not rule or rule.tenant_id != tenant.id:
        raise TicketNotFound("Rule not found")
    db.delete(rule)
    db.commit()


@router.post("/reset-presets")
def reset_presets(db: Db, tenant: Tenant = Depends(get_tenant),
                  user=Depends(require_admin)) -> list[dict]:
    existing = {r.id: r for r in db.query(EscalationRule).filter(EscalationRule.tenant_id == tenant.id).all()}
    for rid, (name, desc, cond, action, terms) in PRESET_DEFAULTS.items():
        if rid in existing:
            rule = existing[rid]
            rule.name, rule.desc = name, desc
            rule.condition_field, rule.action = cond, action
            rule.condition_value = action
            rule.terms = json.dumps(terms)
            rule.is_active = True
            rule.preset = True
        else:
            db.add(EscalationRule(
                id=rid, tenant_id=tenant.id, name=name, desc=desc,
                condition_field=cond, condition_value=action, action=action,
                target_role="agent", delay_minutes=0, terms=json.dumps(terms),
                is_active=True, preset=True,
            ))
    db.commit()
    rules = db.query(EscalationRule).filter(EscalationRule.tenant_id == tenant.id) \
        .order_by(EscalationRule.created_at).all()
    return [rule_dto(r) for r in rules]
