"""AI reply generation. Phase 4 ships a keyword heuristic; Phase 5 swaps the
body to Groq + RAG retrieval when GROQ_API_KEY is configured. The LangGraph
agent (app.services.agent) reuses rag_context + _heuristic_reply from here."""

import logging
from time import perf_counter

from app.config import settings
from app.services import guardrails, vector_store

logger = logging.getLogger("prestige.ai")

# ── Singleton LLM: reuse HTTP connection pool across requests ─────────
# ChatGroq creates a new httpx client per instantiation. At 20K concurrent
# users this means 20K TCP connections to api.groq.com. A single shared
# instance reuses the connection pool (httpx default: 100 connections).
_llm = None


def _get_llm():
    global _llm
    if _llm is None:
        from langchain_groq import ChatGroq
        _llm = ChatGroq(
            model=settings.groq_chat_model,
            api_key=settings.groq_api_key,
            temperature=0.3,
        )
    return _llm


def _groq_reply(system: str, user: str) -> str:
    """Invoke Groq LLM and log request/response details for observability."""
    logger.info("Groq request started")
    start = perf_counter()
    llm = _get_llm()
    messages = [("system", system), ("human", user)]
    response = llm.invoke(messages)
    duration = perf_counter() - start
    logger.info(
        "Groq request completed", extra={
            "duration_s": duration,
            "response": str(response.content),
        }
    )
    return str(response.content)


def rag_context(tenant_id: str, query: str) -> str:
    """Pull top-k KB chunks for a query and render as a compact context block."""
    from app.database import SessionLocal
    from app.models import Tenant
    db = SessionLocal()
    real_tenant_id = tenant_id
    try:
        tenant = db.get(Tenant, tenant_id) or db.query(Tenant).filter(Tenant.slug == tenant_id.lower()).first()
        if tenant:
            real_tenant_id = tenant.id
    finally:
        db.close()
    hits = vector_store.query(real_tenant_id, query)
    if not hits and real_tenant_id != tenant_id:
        hits = vector_store.query(tenant_id, query)
    if not hits:
        return ""
    return "\n\n".join(
        f"[KB:{meta.get('title', 'source')}] {chunk[:600]}" for chunk, meta in hits
    )


def _heuristic_reply(query: str, business_name: str = "your company") -> str:
    """Keyword-driven fallback so the prototype works without GROQ_API_KEY."""
    q = query.lower()
    if any(k in q for k in ("refund", "money back", "reversal", "compensation")):
        return "I've started a refund review for you. Approved refunds reflect within 24–48 hours, and you'll get an SMS with the reference number."
    if any(k in q for k in ("transfer", "processing", "stuck", "settle")):
        return "Transfers between accounts settle instantly; outbound ones take 2–10 minutes. If it shows 'Processing' past 2 hours, share the reference and I'll trace it end-to-end."
    if any(k in q for k in ("pin", "password change")):
        return "You can reset your transfer PIN under Settings → Security → Transfer PIN, or dial *737*1# on your linked number. Want me to walk you through it?"
    if any(k in q for k in ("card declined", "deducted", "pre-auth", "hold")):
        return "A declined card with a deduction is usually a pre-authorization hold that auto-releases within 48 hours. I can verify the merchant hold for you — just confirm the amount and time."
    if any(k in q for k in ("alert", "notification", "sms")):
        return "Missing alerts are usually alert settings or your registered phone number. Check Profile → Contact and Settings → Notifications — push alerts are typically faster than SMS."
    if any(k in q for k in ("human", "agent", "representative", "someone")):
        return "Of course — I'll transfer you to a human agent who can take ownership right away."
    return (f"Thanks for reaching out! I'm here to help with {business_name} questions — "
            f"transfers, cards, refunds, alerts and more. Could you share a little more detail "
            f"so I can give you a precise answer?")


def generate_reply(tenant, query: str) -> str:
    blocked, reason, cleaned = guardrails.guard_input(query)
    if blocked:
        guardrails.audit_blocked(None, tenant.id, reason)
        return guardrails.REFUSAL
    context = guardrails.sanitize_reference(rag_context(tenant.id, cleaned))
    system = guardrails.hardened_system(
        f"You are the support assistant '{tenant.bot_name}' for {tenant.business_name}. "
        f"Brand tone: {tenant.brand_tone}. "
        "If the customer is frustrated or asks for a human, suggest transferring to a human agent.",
        settings.max_reply_words,
    )
    if context:
        system += "\n" + guardrails.wrap_knowledge_base(context)
    if settings.groq_api_key:
        try:
            reply = _groq_reply(system, guardrails.wrap_user(cleaned))
            reply, flagged = guardrails.guard_output(reply, settings.max_reply_words)
            if flagged:
                return _heuristic_reply(cleaned, tenant.business_name)
            return reply
        except Exception:
            pass

    return _heuristic_reply(cleaned, tenant.business_name)
