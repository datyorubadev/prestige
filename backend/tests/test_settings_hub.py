"""Owner settings hub: webhooks, API keys, channels, automations, SLA,
notification preferences, and voice (guide §5.18–§5.21)."""


def test_webhooks_crud(client, auth):
    ow = auth("owner")
    r = client.get("/api/webhooks", headers=ow)
    assert r.status_code == 200
    assert len(r.json()) >= 3

    r = client.post("/api/webhooks", headers=ow, json={
        "name": "Pytest webhook", "url": "https://pytest.example.com/hook",
        "events": ["ticket.created"], "secret": "test-secret"})
    assert r.status_code == 200, r.text
    hook = r.json()
    assert hook["active"] is True

    r = client.post(f"/api/webhooks/{hook['id']}/toggle", headers=ow)
    assert r.status_code == 200
    assert r.json()["active"] is False

    r = client.put(f"/api/webhooks/{hook['id']}", headers=ow,
                   json={"name": "Pytest hook v2", "url": "https://pytest.example.com/v2"})
    assert r.status_code == 200
    assert r.json()["name"] == "Pytest hook v2"

    r = client.delete(f"/api/webhooks/{hook['id']}", headers=ow)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_webhook_deliveries_and_test(client, auth):
    ow = auth("owner")
    r = client.get("/api/webhooks/deliveries", headers=ow)
    assert r.status_code == 200
    assert len(r.json()) >= 5

    r = client.post("/api/webhooks/wh1/test", headers=ow)
    assert r.status_code == 200
    assert r.json()["event"] == "ticket.test"
    assert r.json()["status"] in ("success", "failed")


def test_agent_cannot_manage_webhooks(client, auth):
    ag = auth("agent")
    assert client.post("/api/webhooks", headers=ag, json={
        "name": "x", "url": "https://x", "events": []}).status_code == 403
    assert client.get("/api/webhooks", headers=ag).status_code == 403


def test_api_keys_crud(client, auth):
    ow = auth("owner")
    r = client.get("/api/api-keys", headers=ow)
    assert r.status_code == 200
    assert len(r.json()) == 3

    r = client.post("/api/api-keys", headers=ow, json={"name": "Pytest key", "scopes": ["tickets:read"]})
    assert r.status_code == 200, r.text
    key = r.json()
    assert key["name"] == "Pytest key"
    assert key["revoked"] is False

    r = client.delete(f"/api/api-keys/{key['id']}", headers=ow)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_channels_get_and_patch(client, auth):
    ow = auth("owner")
    r = client.get("/api/channels", headers=ow)
    assert r.status_code == 200
    channels = r.json()
    assert len(channels) >= 4

    r = client.patch("/api/channels/chat", headers=ow, json={"enabled": False})
    assert r.status_code == 200
    assert r.json()["enabled"] is False
    r = client.patch("/api/channels/chat", headers=ow, json={"enabled": True})
    assert r.json()["enabled"] is True


def test_automations_crud_and_run(client, auth):
    ow = auth("owner")
    r = client.get("/api/automations", headers=ow)
    assert r.status_code == 200
    assert len(r.json()) == 5

    r = client.post("/api/automations", headers=ow, json={
        "name": "Pytest automation", "desc": "smoke", "trigger": "ticket_created",
        "conditionMatch": "all", "conditions": [], "actions": [
            {"type": "set_priority", "config": {"value": "high"}}]})
    assert r.status_code == 200, r.text
    rule = r.json()
    assert rule["id"] == "AT-6"

    r = client.post("/api/automations/tick", headers=ow)
    assert r.status_code == 200
    assert "rulesFired" in r.json()

    r = client.get("/api/automations/log", headers=ow)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = client.post(f"/api/automations/{rule['id']}/run", headers=ow)
    assert r.status_code == 200

    r = client.delete(f"/api/automations/{rule['id']}", headers=ow)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_sla_policies_and_schedules(client, auth):
    ow = auth("owner")
    r = client.get("/api/sla", headers=ow)
    assert r.status_code == 200
    assert len(r.json()) == 3

    r = client.get("/api/sla/schedules", headers=ow)
    assert r.status_code == 200
    assert len(r.json()) == 2

    r = client.post("/api/sla", headers=ow, json={
        "name": "Pytest SLA", "desc": "smoke", "enabled": True,
        "match": [{"field": "channel", "op": "eq", "value": "chat"}],
        "targets": [{"priority": "high", "firstResponseMin": 5}],
        "scheduleId": "sched1"})
    assert r.status_code == 200, r.text
    policy = r.json()
    assert policy["id"] == "SL-4"

    r = client.post("/api/sla/tick", headers=ow)
    assert r.status_code == 200
    assert "breaches" in r.json()

    r = client.delete(f"/api/sla/{policy['id']}", headers=ow)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_notification_preferences(client, auth):
    ow = auth("owner")
    r = client.get("/api/notifications/preferences", headers=ow)
    assert r.status_code == 200
    prefs = r.json()
    assert "email" in prefs and "push" in prefs and "quietHours" in prefs

    r = client.put("/api/notifications/preferences", headers=ow,
                   json={"email": {"ticket_assigned": False}, "push": {"escalations": True}})
    assert r.status_code == 200
    assert r.json()["email"]["ticket_assigned"] is False


def test_voice_request(client, auth):
    ow = auth("owner")
    r = client.post("/api/voice/request", headers=ow,
                    json={"phone": "+2348000000000", "ticketId": "TK-1001"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "requested"


def test_tenant_display_image_round_trip(client, auth):
    """Widget cover/display image persists via the tenant settings endpoint and
    is emitted by tenant_dto (the widget-embed public payload)."""
    ow = auth("owner")
    r = client.put("/api/tenant", headers=ow, json={
        "displayImage": "https://cdn.example.com/cover.jpg",
        "logoUrl": "https://cdn.example.com/logo.png",
    })
    assert r.status_code == 200, r.text
    assert r.json()["displayImage"] == "https://cdn.example.com/cover.jpg"
    assert r.json()["logoUrl"] == "https://cdn.example.com/logo.png"

    r = client.get("/api/tenant", headers=ow)
    assert r.status_code == 200
    assert r.json()["displayImage"] == "https://cdn.example.com/cover.jpg"

    r = client.put("/api/tenant", headers=ow, json={"displayImage": None})
    assert r.status_code == 200
    assert r.json()["displayImage"] is None
