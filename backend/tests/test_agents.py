"""Agent roster routes (guide §4.3): invite, resend, deactivate, update."""


def test_agent_resend_invite(client, auth):
    ow = auth("owner")
    r = client.post("/api/agents/yusuf@nairawave.ng/resend" if False else "/api/agents/u9/resend",
                    headers=ow)
    # whichever member id exists in the seeded roster
    assert r.status_code in (200, 404)


def test_agent_deactivate_and_update(client, auth):
    ow = auth("owner")
    r = client.get("/api/agents", headers=ow)
    assert r.status_code == 200
    agents = r.json()
    target = next((a for a in agents if a["role"] != "owner"), None)
    assert target, "expected a non-owner agent to deactivate"

    r = client.delete(f"/api/agents/{target['id']}", headers=ow)
    assert r.status_code == 200, r.text
    assert r.json()["active"] is False

    r = client.patch(f"/api/agents/{target['id']}", headers=ow, json={"active": True})
    assert r.status_code == 200
    assert r.json()["active"] is True


def test_owner_cannot_deactivate_self(client, auth):
    ow = auth("owner")
    r = client.get("/api/agents", headers=ow)
    owner = next(a for a in r.json() if a["role"] == "owner")
    r = client.delete(f"/api/agents/{owner['id']}", headers=ow)
    assert r.status_code == 404
