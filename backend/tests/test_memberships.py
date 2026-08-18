"""Phase 2: tenant membership — workspaces, active-tenant pointer, switch-tenant."""

from app.core.security import hash_password
from app.models import TenantMember, User

PASSWORD = "password123"


def _login(client, email: str) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()


def test_login_resolves_active_tenant(client):
    data = _login(client, "bisi@nairawave.ng")
    assert data["user"]["tenantId"] == "t1"
    data = _login(client, "emeka@gidiexpress.ng")
    assert data["user"]["tenantId"] == "t2"


def test_owner_memberships(client, auth):
    r = client.get("/api/auth/memberships", headers=auth("owner"))
    assert r.status_code == 200
    body = r.json()
    assert body["activeTenantId"] == "t1"
    assert body["memberships"] == [{
        "tenantId": "t1",
        "tenantName": "NairaWave Fintech",
        "slug": "nairawave",
        "role": "owner",
        "status": "active",
        "inboxScope": "all",
        "isActive": True,
    }]


def test_super_admin_has_no_memberships(client, auth):
    r = client.get("/api/auth/memberships", headers=auth("super_admin"))
    assert r.status_code == 200
    assert r.json() == {"activeTenantId": None, "memberships": []}


def test_switch_tenant_to_non_member_rejected(client, auth):
    r = client.post("/api/auth/switch-tenant", json={"tenant_id": "t2"},
                    headers=auth("owner"))
    assert r.status_code == 404  # Bisi only belongs to t1


def test_switch_tenant_rotates_workspace(client, db_session):
    """A user with two memberships can move between workspaces; each switch
    re-issues tokens bound to the new tenant and tenant data follows."""
    u = User(email="tobi@demo.ng", password_hash=hash_password(PASSWORD),
             full_name="Tobi Demo", role="owner", tenant_id="t1", is_active=True)
    db_session.add(u)
    db_session.flush()
    db_session.add(TenantMember(tenant_id="t1", user_id=u.id, role="owner",
                                status="active", inbox_scope="all"))
    db_session.add(TenantMember(tenant_id="t2", user_id=u.id, role="owner",
                                status="active", inbox_scope="all"))
    db_session.commit()

    data = _login(client, "tobi@demo.ng")
    assert data["user"]["tenantId"] == "t1"

    r = client.post("/api/auth/switch-tenant", json={"tenant_id": "t2"})
    assert r.status_code == 401  # no auth header in this call

    headers = {"Authorization": f"Bearer {data['token']}"}
    memberships = client.get("/api/auth/memberships", headers=headers).json()
    assert memberships["activeTenantId"] == "t1"
    assert len(memberships["memberships"]) == 2

    switched = client.post("/api/auth/switch-tenant", json={"tenant_id": "t2"},
                           headers=headers)
    assert switched.status_code == 200, switched.text
    assert switched.json()["user"]["tenantId"] == "t2"
    t2_headers = {"Authorization": f"Bearer {switched.json()['token']}"}

    assert client.get("/api/tenants/t2", headers=t2_headers).status_code == 200
    assert client.get("/api/tenants/t1", headers=t2_headers).status_code == 403

    # switching to a workspace you do not belong to is denied
    denied = client.post("/api/auth/switch-tenant", json={"tenant_id": "t3"},
                         headers=t2_headers)
    assert denied.status_code == 404


def test_impersonation_token_bound_to_membership_owner(client, auth, db_session):
    """Super-admin impersonation resolves the owner via tenant_members and the
    scoped token passes the membership-backed get_tenant."""
    owner_email = "bisi@nairawave.ng"
    r = client.post("/api/impersonate/t1", headers=auth("super_admin"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["email"] == owner_email
    headers = {"Authorization": f"Bearer {body['token']}"}
    assert client.get("/api/tenants/t1", headers=headers).status_code == 200
    assert client.get("/api/tickets", headers=headers).status_code == 200
