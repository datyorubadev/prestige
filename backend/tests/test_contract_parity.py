"""Contract-parity smoke: every frontend mockRoute() head must have a live
backend route, and DTOs must carry the exact keys the frontend types expect."""

HEADERS_EXPECTED = {
    "/api/tenants": ("id", "name", "slug", "email", "status", "plan", "agents",
                     "customers", "kbMb", "volume30d", "color", "tone", "city"),
    "/api/plans": ("code", "name", "price", "priceNum", "agents", "customers", "kb", "tag"),
    "/api/invoices": ("id", "period", "amount", "status", "method"),
    "/api/audit": ("time", "actor", "action", "target", "detail"),
    "/api/agents": ("id", "name", "role", "email", "tickets", "initials", "color"),
    "/api/automations": ("id", "name", "desc", "enabled", "trigger", "conditionMatch",
                         "conditions", "actions", "interval", "order", "runCount", "lastRun", "createdAt"),
    "/api/sla": ("id", "name", "desc", "enabled", "match", "targets", "scheduleId",
                 "schedule", "escalations", "breaches", "createdAt"),
    "/api/webhooks": ("id", "name", "url", "secret", "events", "active", "createdAt"),
    "/api/channels": ("id", "label", "enabled", "connected", "detail", "phone", "address"),
    "/api/api-keys": ("id", "name", "prefix", "scopes", "createdAt", "lastUsed", "revoked"),
    "/api/feature-flags": ("key", "label", "desc", "enabled", "scope"),
    "/api/presets": ("id", "version", "label", "rules", "createdAt", "createdBy", "note"),
    "/api/labels": ("id", "tenantId", "name", "color"),
}

ROUTES_EXPECTED = {
    ("GET", "/api/tenants"), ("POST", "/api/tenants"),
    ("GET", "/api/plans"), ("PATCH", "/api/plans/pro"),
    ("GET", "/api/invoices"), ("GET", "/api/audit"),
    ("GET", "/api/agents"), ("GET", "/api/notifications"),
    ("GET", "/api/webhooks"), ("POST", "/api/webhooks"),
    ("GET", "/api/channels"), ("GET", "/api/api-keys"),
    ("GET", "/api/feature-flags"), ("GET", "/api/presets"),
    ("GET", "/api/automations"), ("GET", "/api/sla"),
    ("GET", "/api/sla/schedules"), ("GET", "/api/tickets"),
    ("GET", "/api/articles"), ("GET", "/api/canned"),
    ("GET", "/api/knowledge/sources"), ("GET", "/api/dashboard"),
    ("GET", "/api/reports"), ("GET", "/api/events"),
    ("GET", "/api/platform-feed"), ("POST", "/api/past-tickets"),
    ("GET", "/api/notifications/preferences"),
    ("GET", "/api/labels"), ("POST", "/api/labels"),
}


def test_mock_route_heads_have_live_routes(client, auth):
    sa = auth("super_admin")
    ow = auth("owner")
    tenant_scoped = {"GET /api/agents", "GET /api/notifications", "GET /api/webhooks",
                     "POST /api/webhooks", "GET /api/channels", "GET /api/api-keys",
                     "GET /api/automations", "GET /api/sla", "GET /api/sla/schedules",
                     "GET /api/notifications/preferences", "GET /api/articles",
                     "GET /api/canned", "GET /api/knowledge/sources", "GET /api/tickets",
                     "GET /api/dashboard", "GET /api/reports", "GET /api/labels",
                     "POST /api/labels"}
    for method, path in sorted(ROUTES_EXPECTED):
        use_owner = f"{method} {path}" in tenant_scoped
        body = None
        if method == "POST" and path == "/api/tenants":
            body = {"name": "ParityCo", "slug": "parityco", "email": "support@parityco.ng",
                    "plan": "starter"}
        elif method == "POST" and path == "/api/past-tickets":
            body = {"email": "demo@nairawave.ng", "tenant_id": "t1"}
        elif method == "POST" and path == "/api/labels":
            body = {"name": "Parity"}
        elif method == "POST" and path == "/api/webhooks":
            body = {"name": "Parity", "url": "https://parity.example.com", "events": []}
        elif method == "PATCH":
            body = {"name": "Pro"}
        r = client.request(method, path, headers=ow if use_owner else sa, json=body)
        assert r.status_code == 200, f"{method} {path} -> {r.status_code} {r.text[:200]}"
        if method == "POST" and path == "/api/tenants":
            client.delete(f"/api/tenants/{r.json()['id']}", headers=sa)
        if method == "POST" and path == "/api/webhooks":
            client.delete(f"/api/webhooks/{r.json()['id']}", headers=ow)


def test_dto_keys_match_frontend_types(client, auth):
    sa = auth("super_admin")
    ow = auth("owner")
    tenant_scoped = {"/api/agents", "/api/notifications", "/api/webhooks", "/api/channels",
                     "/api/api-keys", "/api/automations", "/api/sla", "/api/articles",
                     "/api/canned", "/api/knowledge/sources", "/api/tickets",
                     "/api/dashboard", "/api/reports", "/api/notifications/preferences",
                     "/api/labels"}
    for path, keys in HEADERS_EXPECTED.items():
        r = client.get(path, headers=ow if path in tenant_scoped else sa)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
        body = r.json()
        assert body, f"{path} returned empty list"
        first = body[0]
        for k in keys:
            assert k in first, f"{path} DTO missing {k!r} (has {sorted(first.keys())})"
