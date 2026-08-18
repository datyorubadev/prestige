def test_broadcast_lifecycle(client, auth):
    headers = auth("super_admin")

    # 1. Post broadcast
    res = client.post(
        "/api/platform/broadcast",
        headers=headers,
        json={"message": "Emergency maintenance in 10 minutes", "level": "warning", "active": True},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["broadcast"]["message"] == "Emergency maintenance in 10 minutes"
    assert data["broadcast"]["level"] == "warning"

    # 2. Get active broadcast
    res_get = client.get("/api/platform/broadcast")
    assert res_get.status_code == 200
    assert res_get.json()["broadcast"]["message"] == "Emergency maintenance in 10 minutes"

    # 3. Clear broadcast
    res_clear = client.post(
        "/api/platform/broadcast",
        headers=headers,
        json={"message": "", "active": False},
    )
    assert res_clear.status_code == 200
    assert res_clear.json()["broadcast"] is None


def test_tenant_quota_overrides(client, auth):
    headers = auth("super_admin")
    res = client.patch(
        "/api/tenants/t1/quotas",
        headers=headers,
        json={"ai_tokens_limit": 5000000, "max_agents": 25, "plan_code": "enterprise"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["aiTokensLimit"] == 5000000
    assert data["agents"] == 25
    assert data["plan"] == "enterprise"
