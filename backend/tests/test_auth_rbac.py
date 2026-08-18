"""Auth, session, and role-based access control (guide §5.1, §8)."""


def test_login_returns_token_and_user(client):
    r = client.post("/api/auth/login", json={"email": "bisi@nairawave.ng", "password": "password123"})
    assert r.status_code == 200
    body = r.json()
    assert body["token"]
    assert body["user"]["role"] == "owner"


def test_login_wrong_password_is_401(client):
    r = client.post("/api/auth/login", json={"email": "bisi@nairawave.ng", "password": "wrong"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_roundtrip(client, auth):
    r = client.get("/api/auth/me", headers=auth("owner"))
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "bisi@nairawave.ng"


def test_agents_list_for_team(client, auth):
    # super_admin has no tenant scope → 404; owner/agent can list (agent inbox needs it)
    r = client.get("/api/agents", headers=auth("super_admin"))
    assert r.status_code == 404
    assert client.get("/api/agents", headers=auth("owner")).status_code == 200
    assert client.get("/api/agents", headers=auth("agent")).status_code == 200
    assert client.get("/api/agents").status_code == 401


def test_tenant_update_requires_admin(client, auth):
    # owner can update their own tenant; agent/customer/other owners are blocked
    r = client.patch("/api/tenants/t1", headers=auth("owner"), json={"tone": "pidgin"})
    assert r.status_code == 200
    assert r.json()["tone"] == "pidgin"
    assert client.patch("/api/tenants/t1", headers=auth("agent"), json={"tone": "formal"}).status_code == 403
    client.patch("/api/tenants/t1", headers=auth("owner"), json={"tone": "professional"})


def test_platform_feed_super_admin_only(client, auth):
    assert client.get("/api/platform-feed", headers=auth("owner")).status_code == 403
    assert client.get("/api/platform-feed", headers=auth("agent")).status_code == 403
    assert client.get("/api/platform-feed", headers=auth("super_admin")).status_code == 200


def test_past_tickets_requires_tenant_scope(client):
    r = client.post("/api/past-tickets", json={"email": "adaeze@example.com", "tenant_id": "t1"})
    assert r.status_code == 200
    assert len(r.json()) >= 3
    # a tenant_id with no matching customer returns an empty list, not another tenant's data
    r2 = client.post("/api/past-tickets", json={"email": "adaeze@example.com", "tenant_id": "t2"})
    assert r2.status_code == 200
    assert r2.json() == []
    # missing tenant_id is rejected
    assert client.post("/api/past-tickets", json={"email": "adaeze@example.com"}).status_code == 400


def test_tenants_list_super_admin_only(client, auth):
    assert client.get("/api/tenants", headers=auth("owner")).status_code == 403
    assert client.get("/api/tenants", headers=auth("agent")).status_code == 403
    r = client.get("/api/tenants", headers=auth("super_admin"))
    assert r.status_code == 200
    assert len(r.json()) >= 5


def test_knowledge_source_preview_scope(client, auth):
    # owner can preview their own source (gets the DTO + extracted text key)
    r = client.get("/api/knowledge/sources/ks1", headers=auth("owner"))
    assert r.status_code == 200
    assert r.json()["id"] == "ks1"
    assert "text" in r.json()
    # seeded sources carry extractable body text so the preview is never empty
    assert len(r.json()["text"]) > 80
    # cross-tenant source is invisible (404, not a data leak)
    assert client.get("/api/knowledge/sources/ks4", headers=auth("owner")).status_code == 404
    # agents may view KB sources (kb.view) but cannot manage them (kb.manage)
    assert client.get("/api/knowledge/sources/ks1", headers=auth("agent")).status_code == 200
    assert client.post("/api/knowledge/ingest-text", headers=auth("agent"),
                       json={"title": "x", "content": "y"}).status_code == 403
    assert client.get("/api/knowledge/sources/ks1").status_code == 401


def test_owner_self_service_tenant_access(client, auth):
    r = client.get("/api/tenants/t1", headers=auth("owner"))
    assert r.status_code == 200
    assert r.json()["slug"] == "nairawave"


def test_owner_cannot_read_other_tenant(client, auth):
    r = client.get("/api/tenants/t2", headers=auth("owner"))
    assert r.status_code == 403


def test_super_admin_has_no_tenant_scope(client, auth):
    """Strict isolation (§16): a super admin has tenant_id = null and must NOT
    fall back to a demo tenant ("t1"). Every tenant-scoped route denies them;
    the only path to tenant data is the audited impersonation flow."""
    for path in ("/api/dashboard", "/api/tickets", "/api/knowledge/sources",
                 "/api/agents", "/api/channels", "/api/labels"):
        r = client.get(path, headers=auth("super_admin"))
        assert r.status_code == 404, f"{path} -> {r.status_code}"


def test_owner_cannot_fetch_cross_tenant_ticket(client, auth):
    """Object-level isolation: an owner in tenant A must not resolve a ticket
    owned by tenant B, even by guessing its id — 404, never the ticket."""
    r = client.get("/api/tickets/TK-1035", headers=auth("owner"))   # t1 owner → t2 ticket
    assert r.status_code == 404
    r = client.get("/api/tickets/TK-1042", headers=auth("owner2"))  # t2 owner → t1 ticket
    assert r.status_code == 404


def test_owner_can_fetch_own_tenant_ticket(client, auth):
    r = client.get("/api/tickets/TK-1042", headers=auth("owner"))
    assert r.status_code == 200
    assert r.json()["id"] == "TK-1042"


def test_super_admin_sees_platform_wide_invoices(client, auth):
    """Billing matrix: Super Admin = Full across the platform, Owner = own
    tenant, Agent = —. Super admin sees every tenant's invoices."""
    r = client.get("/api/invoices", headers=auth("super_admin"))
    assert r.status_code == 200
    assert len(r.json()) >= 4
    assert client.get("/api/invoices", headers=auth("agent")).status_code == 403
    assert client.get("/api/invoices", headers=auth("owner")).status_code == 200


def test_owner_invoices_are_tenant_scoped(client, auth):
    """Owner billing resolves against their own tenant only — never a shared
    default tenant, and never another tenant's rows."""
    t1_ids = {i["id"] for i in client.get("/api/invoices", headers=auth("owner")).json()}
    assert "INV-0021" in t1_ids  # t1's seeded invoice visible to the t1 owner
    t2_ids = {i["id"] for i in client.get("/api/invoices", headers=auth("owner2")).json()}
    assert not (t1_ids & t2_ids), "tenant A invoices leaked to tenant B"
