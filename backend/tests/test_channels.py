"""Channel integrations: connect/disconnect/test/sync, provider webhooks,
the simulator inbound path, and outbound dispatch to the outbox."""

from app.database import SessionLocal
from app.models import ChannelOutbox


def _connect(client, headers, channel, config):
    r = client.post(f"/api/channels/{channel}/connect", headers=headers, json={"config": config})
    assert r.status_code == 200, r.text
    return r.json()


def test_channels_list_has_new_platforms(client, auth):
    ow = auth("owner")
    r = client.get("/api/channels", headers=ow)
    assert r.status_code == 200
    ids = {c["id"] for c in r.json()}
    assert {"chat", "whatsapp", "portal", "email", "telegram", "sms"} <= ids


def test_connect_requires_credentials(client, auth):
    ow = auth("owner")
    data = _connect(client, ow, "whatsapp", {})
    assert data["connected"] is False
    assert data["providerStatus"] == "error"
    assert data["lastError"]


def test_connect_stores_config_and_webhook_url(client, auth):
    ow = auth("owner")
    data = _connect(client, ow, "whatsapp", {
        "access_token": "EAATest",
        "phone_number_id": "111222",
        "verify_token": "vfy123",
        "phone": "+234 800 000 1002",
    })
    assert data["connected"] is True
    assert data["providerStatus"] == "connected"
    assert data["webhookUrl"].endswith("/api/webhooks/whatsapp")
    assert data["configPresent"] is True

    tg = _connect(client, ow, "telegram", {"bot_token": "123:ABC"})
    assert tg["connected"] is True
    assert tg["webhookUrl"].endswith(f"/api/webhooks/telegram/123:ABC")


def test_disconnect_resets_state(client, auth):
    ow = auth("owner")
    _connect(client, ow, "telegram", {"bot_token": "123:ABC"})
    r = client.post("/api/channels/telegram/disconnect", headers=ow)
    assert r.status_code == 200
    assert r.json()["connected"] is False
    assert r.json()["providerStatus"] == "disconnected"


def test_simulator_test_and_embed(client, auth):
    ow = auth("owner")
    r = client.post("/api/channels/chat/test", headers=ow)
    assert r.status_code == 200
    assert r.json()["ok"] is True

    r = client.get("/api/channels/chat/embed", headers=ow)
    assert r.status_code == 200
    assert "/widget-embed?tenantId=nairawave" in r.json()["url"]
    assert "<iframe" in r.json()["code"]


def test_whatsapp_webhook_handshake_and_inbound(client, auth):
    ow = auth("owner")
    _connect(client, ow, "whatsapp", {
        "access_token": "EAATest",
        "phone_number_id": "999000",
        "verify_token": "vfy-xyz",
        "auto_reply": False,
    })

    # Meta verification GET — no auth headers.
    r = client.get("/api/webhooks/whatsapp",
                   params={"hub.mode": "subscribe", "hub.verify_token": "vfy-xyz",
                           "hub.challenge": "challenge-1"})
    assert r.status_code == 200
    assert r.text == "challenge-1"

    r = client.get("/api/webhooks/whatsapp",
                   params={"hub.mode": "subscribe", "hub.verify_token": "wrong",
                           "hub.challenge": "challenge-1"})
    assert r.status_code == 403

    # Inbound message event (public, no auth) → creates a whatsapp ticket.
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "WBA1",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"phone_number_id": "999000"},
                    "contacts": [{"profile": {"name": "Ada Obi"}, "wa_id": "2348011112222"}],
                    "messages": [{"from": "2348011112222", "id": "wamid_1",
                                  "timestamp": "0", "type": "text",
                                  "text": {"body": "My transfer is stuck"}}],
                },
            }],
        }],
    }
    r = client.post("/api/webhooks/whatsapp", json=payload)
    assert r.status_code == 200
    r = client.get("/api/tickets", headers=ow, params={"channel": "whatsapp", "q": "My transfer is stuck"})
    assert r.status_code == 200
    tickets = [t for t in r.json() if "My transfer is stuck" in t.get("subject", "")]
    assert tickets


def test_simulate_reuses_open_ticket(client, auth):
    ow = auth("owner")
    _connect(client, ow, "sms", {"account_sid": "ACx", "auth_token": "abc", "from_number": "+2348000000000"})
    r = client.post("/api/webhooks/simulate", headers=ow, json={
        "channel": "sms", "from_": "+2349000000000", "name": "Ngozi",
        "text": "First message", "auto_reply": False,
    })
    assert r.status_code == 200, r.text
    first = r.json()
    assert first["new"] is True
    assert first["ticket"]["channel"] == "sms"

    r = client.post("/api/webhooks/simulate", headers=ow, json={
        "channel": "sms", "from_": "+2349000000000", "text": "Second message",
        "auto_reply": False,
    })
    assert r.status_code == 200
    second = r.json()
    assert second["new"] is False
    assert second["ticketId"] == first["ticketId"]


def test_agent_reply_dispatches_outbound(client, auth, monkeypatch):
    ow = auth("owner")
    _connect(client, ow, "telegram", {"bot_token": "123:ABC"})
    r = client.post("/api/webhooks/simulate", headers=ow, json={
        "channel": "telegram", "from_": "101", "name": "Demo",
        "text": "Where is my order?", "auto_reply": False,
    })
    ticket_id = r.json()["ticketId"]

    from app.services.channels.base import SendResult
    from app.services.channels import telegram as tg

    calls = []

    def fake_send(config, target, text):
        calls.append((config, target, text))
        return SendResult(ok=True, external_id="tmsg1")

    monkeypatch.setattr(tg.PROVIDER, "send", fake_send)

    r = client.post(f"/api/tickets/{ticket_id}/messages", headers=ow,
                    json={"body": "Your order ships today."})
    assert r.status_code == 200, r.text
    assert calls and calls[0][1] == "101"

    with SessionLocal() as db:
        row = db.query(ChannelOutbox).filter(ChannelOutbox.ticket_id == ticket_id).first()
        assert row is not None
        assert row.status == "sent"
        assert row.provider == "telegram"
        assert row.external_id == "tmsg1"
