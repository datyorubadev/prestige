"""Permission-matrix tests (P3): the granular layer declared in
app/core/permissions.py. Covers the agent role against owner-only resources and
confirms agent-allowed reads still work. Owner/super_admin access to the same
routes is exercised by test_settings_hub.py and test_auth_rbac.py."""


def test_agent_can_view_team_resources(client, auth):
    ag = auth("agent")
    assert client.get("/api/dashboard", headers=ag).status_code == 200
    assert client.get("/api/tickets", headers=ag).status_code == 200
    assert client.get("/api/agents", headers=ag).status_code == 200
    assert client.get("/api/labels", headers=ag).status_code == 200
    assert client.get("/api/knowledge/sources", headers=ag).status_code == 200
    assert client.get("/api/knowledge/sources/ks1", headers=ag).status_code == 200


def test_agent_blocked_from_owner_settings(client, auth):
    ag = auth("agent")
    for path in ("/api/webhooks", "/api/webhooks/deliveries",
                 "/api/api-keys", "/api/automations", "/api/automations/log",
                 "/api/sla", "/api/sla/schedules"):
        assert client.get(path, headers=ag).status_code == 403, path
    assert client.post("/api/webhooks", headers=ag,
                       json={"name": "x", "url": "https://x", "events": []}).status_code == 403
    assert client.post("/api/api-keys", headers=ag,
                       json={"name": "x"}).status_code == 403


def test_agent_blocked_from_channels(client, auth):
    ag = auth("agent")
    assert client.get("/api/channels", headers=ag).status_code == 403
    assert client.patch("/api/channels/chat", headers=ag,
                        json={"enabled": False}).status_code == 403


def test_agent_blocked_from_billing(client, auth):
    ag = auth("agent")
    assert client.get("/api/invoices", headers=ag).status_code == 403


def test_agent_blocked_from_team_management(client, auth):
    ag = auth("agent")
    assert client.post("/api/agents", headers=ag,
                       json={"name": "x", "email": "x@example.com", "role": "agent"}).status_code == 403
    assert client.patch("/api/agents/u2", headers=ag,
                        json={"name": "Nope"}).status_code == 403
    assert client.delete("/api/agents/u2", headers=ag).status_code == 403


def test_agent_cannot_mutate_knowledge_base(client, auth):
    ag = auth("agent")
    assert client.post("/api/knowledge/ingest-text", headers=ag,
                       json={"title": "x", "content": "y"}).status_code == 403
    assert client.delete("/api/knowledge/sources/ks1", headers=ag).status_code == 403


def test_owner_retains_owner_settings_access(client, auth):
    ow = auth("owner")
    for path in ("/api/webhooks", "/api/webhooks/deliveries",
                 "/api/api-keys", "/api/automations", "/api/automations/log",
                 "/api/sla", "/api/sla/schedules", "/api/channels", "/api/invoices"):
        assert client.get(path, headers=ow).status_code == 200, path


def test_unauthenticated_blocked(client):
    for path in ("/api/webhooks", "/api/api-keys", "/api/invoices"):
        assert client.get(path).status_code == 401, path
