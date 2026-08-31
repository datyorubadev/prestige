"""LangGraph agent tests: DB tools, HITL refund interrupt/resume, escalation
handoff, and the no-GROQ-key fallback. The checkpointer is forced to memory in
conftest so no Redis is required."""

import asyncio
from unittest.mock import patch

from app.models import Customer, Message, Tenant, Ticket, User
from app.models.common import TicketStatus
from app.services import agent, chat_service
from app.services.mock_tools import ALL_TOOLS, ALL_TOOLS_BY_NAME, heuristic_tool_results


def _new_ticket(db):
    tenant = db.query(Tenant).first()
    customer = Customer(tenant_id=tenant.id, email="ada@example.com", full_name="Ada Lovelace", is_vip=True)
    db.add(customer)
    db.flush()
    ticket = Ticket(tenant_id=tenant.id, subject="Test ticket", channel="widget", status="open")
    ticket.customer = customer
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return tenant.id, ticket.id


def _ticket_messages(db, ticket_id):
    return db.query(Message).filter(Message.ticket_id == ticket_id).all()


def test_ticket_status_tool(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    result = agent.invoke_agent(tenant_id, ticket_id, "where is my ticket?")
    assert result["reply"]
    tool_text = " ".join(result.get("tool_results") or [])
    assert "ticket_status" in tool_text
    assert ticket_id in tool_text


def test_mock_tools_registry():
    assert len(ALL_TOOLS) == 8
    assert "track_nigerian_waybill_status" in ALL_TOOLS_BY_NAME
    out = ALL_TOOLS_BY_NAME["track_nigerian_waybill_status"].invoke({"waybill_number": "GIDI-992-ALERT"})
    assert "in_transit" in out and "GIDI-992-ALERT" in out


def test_heuristic_tool_results_deterministic():
    hits = heuristic_tool_results("where is my package?")
    assert hits and "track_nigerian_waybill_status" in hits[0]
    assert heuristic_tool_results("hello there") == []


def test_waybill_tool_fires_through_agent(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    result = agent.invoke_agent(tenant_id, ticket_id, "where is my waybill GIDI-992-ALERT")
    tool_text = " ".join(result.get("tool_results") or [])
    assert "track_nigerian_waybill_status" in tool_text
    assert "in_transit" in tool_text


def test_refund_interrupts_then_approve(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    result = agent.invoke_agent(tenant_id, ticket_id, "I want a refund please")
    assert result.get("__interrupt__"), "refund should pause for HITL approval"
    payload = agent._first_interrupt_payload(result["__interrupt__"])
    assert payload["type"] == "initiate_refund"
    assert payload["customer_reply"]

    msgs = _ticket_messages(db_session, ticket_id)
    assert not any("Refund initiated" in m.body for m in msgs), "nothing persisted before approval"

    resumed = asyncio.run(agent.resume_agent(ticket_id, {"approved": True, "note": "ok"}))
    assert resumed["ok"]
    assert "refund" in (resumed["reply"] or "").lower()

    msgs = _ticket_messages(db_session, ticket_id)
    assert any("Refund initiated" in m.body for m in msgs), "approval should execute the refund"
    assert db_session.get(Ticket, ticket_id).status == TicketStatus.IN_PROGRESS


def test_refund_decline(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    result = agent.invoke_agent(tenant_id, ticket_id, "request a refund")
    assert result.get("__interrupt__")

    resumed = asyncio.run(agent.resume_agent(ticket_id, {"approved": False}))
    assert resumed["ok"]
    assert "haven't started a refund" in (resumed["reply"] or "").lower()
    msgs = _ticket_messages(db_session, ticket_id)
    assert not any("Refund initiated" in m.body for m in msgs)


def test_escalate_to_human(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    result = agent.invoke_agent(tenant_id, ticket_id, "I want to talk to a human agent now")
    assert result["reply"]
    assert db_session.get(Ticket, ticket_id).status == TicketStatus.ESCALATED


def test_fallback_without_groq(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    result = agent.invoke_agent(tenant_id, ticket_id, "hello there")
    assert result["reply"]
    assert not result.get("__interrupt__")


def test_pending_and_resume_helpers(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    agent.invoke_agent(tenant_id, ticket_id, "refund me")
    pending = asyncio.run(agent.pending_approval(ticket_id))
    assert pending and pending["type"] == "initiate_refund"

    asyncio.run(agent.resume_agent(ticket_id, {"approved": True}))
    assert asyncio.run(agent.pending_approval(ticket_id)) is None


def _set_agent_online(db, tenant_id):
    a = db.query(User).filter(User.tenant_id == tenant_id, User.role != "customer").first()
    a.presence_status = "online"
    a.last_seen = __import__("datetime").datetime.utcnow()
    db.commit()
    return a


def test_human_assist_interrupts_and_answer_flow(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    _set_agent_online(db_session, tenant_id)

    # Force empty RAG context so routing hits the assist path.
    with patch("app.services.agent.rag_context", return_value=""):
        result = agent.invoke_agent(tenant_id, ticket_id, "what is your return policy for shipments to Lagos?")
    assert result.get("__interrupt__"), "out-of-KB question should pause for human assist"
    payload = agent._first_interrupt_payload(result["__interrupt__"])
    assert payload["type"] == "human_assist"
    assert payload["customer_reply"]

    # Customer hears the holding reply, not a hard escalation yet.
    assert db_session.get(Ticket, ticket_id).status != TicketStatus.ESCALATED

    # Agent answers → delivered back to the customer as the bot's own message.
    resumed = asyncio.run(agent.resume_agent(ticket_id, {"answer": "Returns are accepted within 30 days."}))
    assert resumed["ok"]
    assert asyncio.run(agent.pending_approval(ticket_id)) is None
    msgs = _ticket_messages(db_session, ticket_id)
    assert any("Returns are accepted within 30 days" in m.body and m.is_bot for m in msgs)


def test_human_assist_escalates_when_no_agent_online(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    # Ensure no agent is online → soft assist falls back to a hard escalation.
    for u in db_session.query(User).filter(User.tenant_id == tenant_id, User.role != "customer").all():
        u.presence_status = "offline"
        u.last_seen = None
    db_session.commit()
    with patch("app.services.agent.rag_context", return_value=""):
        result = agent.invoke_agent(tenant_id, ticket_id, "what is your policy on express delivery to Abuja?")
    assert not result.get("__interrupt__")
    assert db_session.get(Ticket, ticket_id).status == TicketStatus.ESCALATED


def test_stream_emits_human_assist_pending_event(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    _set_agent_online(db_session, tenant_id)

    async def _collect():
        frames = []
        with patch("app.services.agent.rag_context", return_value=""):
            async for f in agent.stream_agent(tenant_id, ticket_id, "what happens if I miss my delivery window?"):
                frames.append(f)
        return frames

    frames = asyncio.run(_collect())
    assert any(f.get("human_assist_pending") for f in frames)
    # Holding reply streamed to the customer.
    text = "".join(f.get("token", "") for f in frames)
    assert "check with my team" in text


def test_stream_holds_while_approval_pending(db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    agent.invoke_agent(tenant_id, ticket_id, "refund me")

    async def _collect():
        frames = []
        async for f in agent.stream_agent(tenant_id, ticket_id, "hello there"):
            frames.append(f)
        return frames

    frames = asyncio.run(_collect())
    text = "".join(f.get("token", "") for f in frames)
    assert "One moment" in text
    assert asyncio.run(agent.pending_approval(ticket_id)), "pending approval must stay intact"


def test_widget_chat_streams_sse(client, db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    with client.stream("POST", "/api/chat",
                       json={"ticket_id": ticket_id, "query": "hello there"}) as res:
        assert res.status_code == 200
        body = "".join(res.iter_text())
    assert body.startswith("data: ")
    assert '"done"' in body and '"token"' in body
    assert '"error"' not in body


def test_assist_pending_and_approve(client, auth, db_session):
    tenant_id, ticket_id = _new_ticket(db_session)
    ow = auth("owner")

    r = client.get(f"/api/agent/assist/{ticket_id}/pending", headers=ow)
    assert r.status_code == 200 and r.json()["pending"] is False

    agent.invoke_agent(tenant_id, ticket_id, "give me a refund now")

    r = client.get(f"/api/agent/assist/{ticket_id}/pending", headers=ow)
    assert r.json()["pending"] is True
    assert r.json()["payload"]["type"] == "initiate_refund"

    r = client.post(f"/api/agent/assist/{ticket_id}/approve",
                    headers=ow, json={"payload": {"approved": True}})
    assert r.status_code == 200 and r.json()["ok"]

    r = client.get(f"/api/agent/assist/{ticket_id}/pending", headers=ow)
    assert r.json()["pending"] is False


def test_assist_requires_auth(client):
    r = client.post("/api/agent/assist", json={"ticket_id": "x", "query": "hi"})
    assert r.status_code == 401


def test_widget_messages_endpoint(client, db_session):
    tenant_id, ticket_id = _new_ticket(db_session)

    r = client.get(f"/api/widget/messages?ticketId={ticket_id}")
    assert r.status_code == 200 and r.json()["messages"] == []

    chat_service.persist_ai_reply(db_session, ticket_id, "Hi there — here's your update.")
    r = client.get(f"/api/widget/messages?ticketId={ticket_id}")
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert msgs and msgs[-1]["who"] == "ai" and msgs[-1]["text"] == "Hi there — here's your update."


def test_widget_rapid_consecutive_replies_single_session(client, db_session):
    """Rapid customer replies during one widget session must land on a single
    ticket (one per session, not one per message) with every message persisted —
    the invariant the frontend burst-batching relies on."""
    tenant_id = db_session.query(Tenant).first().id

    r1 = client.post("/api/widget/send", json={
        "tenantId": tenant_id, "text": "Hello, I need help",
        "email": "ada@example.com", "cust": "rapid-cust",
    })
    assert r1.status_code == 200
    session_id = r1.json()["sessionId"]

    # Follow-ups reuse the same session → same ticket.
    r2 = client.post("/api/widget/send", json={
        "tenantId": tenant_id, "sessionId": session_id, "text": "Also a refund",
        "email": "ada@example.com", "cust": "rapid-cust",
    })
    assert r2.status_code == 200 and r2.json()["sessionId"] == session_id
    r3 = client.post("/api/widget/send", json={
        "tenantId": tenant_id, "sessionId": session_id, "text": "And a password reset",
        "email": "ada@example.com", "cust": "rapid-cust",
    })
    assert r3.status_code == 200 and r3.json()["sessionId"] == session_id

    # A single batched burst (frontend joins rapid replies with "\n\n").
    r4 = client.post("/api/widget/send", json={
        "tenantId": tenant_id, "sessionId": session_id,
        "text": "Also a refund\n\nAnd a password reset",
        "email": "ada@example.com", "cust": "rapid-cust",
    })
    assert r4.status_code == 200 and r4.json()["sessionId"] == session_id

    # One ticket for the whole session, all customer text persisted in order.
    assert db_session.get(Ticket, session_id) is not None
    assert db_session.query(Ticket).filter(Ticket.id == session_id).count() == 1
    r = client.get(f"/api/widget/messages?ticketId={session_id}")
    customer_texts = [m["text"] for m in r.json()["messages"] if m["who"] == "customer"]
    assert customer_texts == [
        "Hello, I need help",
        "Also a refund",
        "And a password reset",
        "Also a refund\n\nAnd a password reset",
    ]

    # Persisting the same AI reply twice must not duplicate it.
    first = chat_service.persist_ai_reply(db_session, session_id, "Done — all three sorted.")
    second = chat_service.persist_ai_reply(db_session, session_id, "Done — all three sorted.")
    assert first["ok"] is True
    assert second["duplicate"] is True
    r = client.get(f"/api/widget/messages?ticketId={session_id}")
    ai_texts = [m["text"] for m in r.json()["messages"] if m["who"] == "ai"]
    assert ai_texts == ["Done — all three sorted."]


def test_widget_rating_persists_comment(client, db_session):
    """End-of-chat feedback: rating + optional comment persist on the ticket
    and are clamped/truncated (1–5, ≤500 chars)."""
    tenant_id, ticket_id = _new_ticket(db_session)

    r = client.post("/api/widget/rating", json={
        "ticketId": ticket_id, "rating": 4, "comment": "Fast and friendly.",
    })
    assert r.status_code == 200 and r.json()["ok"] is True

    ticket = db_session.get(Ticket, ticket_id)
    assert ticket.csat_rating == 4
    assert ticket.csat_comment == "Fast and friendly."

    # Out-of-range rating clamps to 5; over-long comment truncates.
    r = client.post("/api/widget/rating", json={
        "ticketId": ticket_id, "rating": 99, "comment": "x" * 600,
    })
    assert r.status_code == 200
    db_session.refresh(ticket)
    assert ticket.csat_rating == 5
    assert len(ticket.csat_comment) == 500

    # Surfaces in the agent-facing ticket DTO.
    from app.services.serializers import ticket_dto
    dto = ticket_dto(db_session.get(Ticket, ticket_id))
    assert dto["csatRating"] == 5
    assert dto["csatComment"] == "x" * 500
