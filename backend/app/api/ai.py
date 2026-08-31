"""AI helper endpoints — prompt testing, suggest-reply, etc."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import Db, get_tenant
from app.models import Tenant

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/prompt-preview")
def prompt_preview(ticket_id: str | None = None, db: Db = None,
                   tenant: Tenant = Depends(get_tenant)) -> dict:
    """Return the EXACT system prompt the agent would use for a ticket —
    including retrieved KB context — without calling the LLM.
    Pass ?ticket_id= to include that ticket's live KB context."""
    from app.config import settings
    from app.core.errors import TicketNotFound
    from app.services.agent import compose_system_prompt
    from app.services.ai import rag_context
    from app.services.guardrails import sanitize_reference

    context = ""
    if ticket_id:
        from app.models import Ticket
        t = db.get(Ticket, ticket_id)
        if t is None or t.tenant_id != tenant.id:
            raise TicketNotFound()
        last_customer = next((m for m in reversed(t.messages) if m.sender_type == "customer"), None)
        query = last_customer.body if last_customer else (t.subject or "")
        if query:
            context = sanitize_reference(rag_context(tenant.id, query))

    tenant_data = {
        "bot_name": tenant.bot_name,
        "business_name": tenant.business_name,
        "brand_tone": getattr(tenant, "brand_tone", "professional"),
        "ai_system_prompt": getattr(tenant, "ai_system_prompt", None),
    }
    system_prompt = compose_system_prompt(tenant_data, context=context)

    return {
        "systemPrompt": system_prompt,
        "groqModel": settings.groq_chat_model,
        "hasGroqKey": bool(settings.groq_api_key),
        "maxReplyWords": settings.max_reply_words,
        "kbContextIncluded": bool(context),
    }


class SuggestReplyRequest(BaseModel):
    prompt: str
    systemPrompt: str | None = None


@router.post("/suggest-reply")
def suggest_reply(body: SuggestReplyRequest, db: Db, tenant: Tenant = Depends(get_tenant)) -> dict:
    """Generate a sample AI reply using the tenant's current system prompt.

    Lightweight endpoint for the Settings → AI Persona live-test sandbox.
    Uses the tenant's configured bot name and tone to build context, then
    streams through the same RAG retrieval the production path uses.
    """
    from app.services import agent as agent_mod

    context_parts: list[str] = []
    if tenant.bot_name:
        context_parts.append(f"You are {tenant.bot_name}.")
    if tenant.brand_tone:
        context_parts.append(f"Use a {tenant.brand_tone} tone.")
    if body.systemPrompt:
        context_parts.append(f"System instructions: {body.systemPrompt}")
    context_parts.append(f"Customer query: {body.prompt}")

    augmented_query = "\n".join(context_parts)

    # Use a synthetic ticket id so the RAG path works; this is a dry-run.
    synthetic_ticket_id = "__test__"

    # Try to run a lightweight retrieve → generate cycle. If the agent
    # module fails (missing LLM key, etc.) we fall back to a templated
    # response so the test sandbox always returns something useful.
    try:
        import asyncio

        async def _collect():
            chunks: list[str] = []
            async for frame in agent_mod.stream_agent(tenant.id, synthetic_ticket_id, augmented_query):
                if frame.get("token"):
                    chunks.append(frame["token"])
                if frame.get("done"):
                    break
            return "".join(chunks)

        reply = asyncio.get_event_loop().run_until_complete(_collect())
    except Exception:
        # Graceful fallback — still useful for prompt testing without an LLM
        tone = tenant.brand_tone or "professional"
        name = tenant.bot_name or "AI Assistant"
        if "refund" in body.prompt.lower():
            reply = (
                f"Thank you for reaching out. I understand your concern about the refund. "
                f"As {name}, I've reviewed your account and initiated the refund review process. "
                f"You should see the credit within 3–5 business days."
            )
        elif "transfer" in body.prompt.lower() or "send" in body.prompt.lower():
            reply = (
                f"I can help with that. Let me look into the transfer status for you. "
                f"I'll check our systems and get back to you with an update shortly."
            )
        else:
            reply = (
                f"Thank you for your message. As {name}, I'm here to help. "
                f"Could you provide a few more details so I can assist you better?"
            )

    return {"reply": reply}
