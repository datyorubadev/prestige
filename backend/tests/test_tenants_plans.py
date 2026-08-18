"""Super-admin tenant lifecycle + plan/invoice DTO contract (guide §5.16)."""


def test_tenant_dto_keys(client, auth):
    r = client.get("/api/tenants", headers=auth("super_admin"))
    ten = r.json()[0]
    for k in ("id", "name", "slug", "email", "status", "plan", "agents", "customers",
              "kbMb", "volume30d", "color", "tone", "city"):
        assert k in ten, f"tenant_dto missing {k}"


def test_tenant_create_and_approve(client, auth):
    sa = auth("super_admin")
    r = client.post("/api/tenants", headers=sa, json={
        "name": "PytestCo Plc", "slug": "pytestco", "email": "support@pytestco.ng", "plan": "starter"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "pending"
    tid = body["id"]

    r = client.post(f"/api/tenants/{tid}/approve", headers=sa)
    assert r.status_code == 200
    assert r.json()["status"] == "active"

    r = client.post(f"/api/tenants/{tid}/plan", headers=sa, json={"code": "pro"})
    assert r.status_code == 200
    assert r.json()["plan"] == "pro"

    r = client.post(f"/api/tenants/{tid}/suspend", headers=sa)
    assert r.status_code == 200
    assert r.json()["status"] == "suspended"

    r = client.post(f"/api/tenants/{tid}/reactivate", headers=sa)
    assert r.status_code == 200
    assert r.json()["status"] == "active"

    r = client.patch(f"/api/tenants/{tid}", headers=sa, json={"city": "Lagos"})
    assert r.status_code == 200
    assert r.json()["city"] == "Lagos"


def test_tenant_create_rejects_duplicate_slug(client, auth):
    r = client.post("/api/tenants", headers=auth("super_admin"),
                    json={"name": "Dup", "slug": "nairawave", "email": "dup@x.ng", "plan": "starter"})
    assert r.status_code == 409


def test_plan_dto_matches_frontend_contract(client, auth):
    r = client.get("/api/plans", headers=auth("super_admin"))
    assert r.status_code == 200
    plans = r.json()
    assert len(plans) == 3
    for p in plans:
        for k in ("code", "name", "price", "priceNum", "agents", "customers", "kb", "tag"):
            assert k in p, f"plan_dto missing {k}"
        assert isinstance(p["price"], str) and p["price"].startswith("\u20a6")
        assert isinstance(p["priceNum"], int)
        assert isinstance(p["kb"], str) and p["kb"].endswith("GB")
        assert p["tag"]
    pro = next(p for p in plans if p["code"] == "pro")
    assert (pro["price"], pro["priceNum"], pro["kb"], pro["tag"]) == (
        "\u20a645,000", 45000, "20 GB", "Popular")


def test_plan_update_accepts_frontend_patch(client, auth):
    sa = auth("super_admin")
    r = client.patch("/api/plans/pro", headers=sa,
                     json={"priceNum": 55000, "price": "\u20a655,000",
                           "agents": 6, "customers": 6000, "kb": "25 GB"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["priceNum"] == 55000
    assert p["price"] == "\u20a655,000"
    assert p["kb"] == "25 GB"
    assert p["kbQuotaMb"] == 25600
    assert p["agents"] == 6

    r = client.patch("/api/plans/pro", headers=sa,
                     json={"price": "\u20a645,000", "kb": "20 GB",
                           "agents": 5, "customers": 5000})
    assert r.status_code == 200
    p = r.json()
    assert p["priceNum"] == 45000 and p["kb"] == "20 GB"


def test_plan_update_rejects_unknown_plan(client, auth):
    r = client.patch("/api/plans/nope", headers=auth("super_admin"), json={"price": 1})
    assert r.status_code == 404


def test_invoice_dto_matches_frontend_contract(client, auth):
    r = client.get("/api/invoices", headers=auth("super_admin"))
    assert r.status_code == 200
    invoices = r.json()
    assert len(invoices) >= 4
    for inv in invoices:
        for k in ("id", "period", "amount", "status", "method"):
            assert k in inv, f"invoice_dto missing {k}"
        assert isinstance(inv["amount"], str) and inv["amount"].startswith("\u20a6")
        assert inv["period"]
        assert inv["method"]
