import pytest


def test_custom_tools_lifecycle(client, auth):
    owner_headers = auth("owner")

    # 1. Fetch templates
    tpl_resp = client.get("/api/ai/tools/templates", headers=owner_headers)
    assert tpl_resp.status_code == 200
    templates = tpl_resp.json()["templates"]
    assert len(templates) >= 4

    # 2. Create custom tool
    tool_payload = {
        "name": "lookup_shipment_eta",
        "displayName": "Lookup Shipment ETA",
        "description": "Look up estimated delivery time and location for a tracking number.",
        "category": "logistics",
        "method": "GET",
        "urlTemplate": "https://api.logistics.com/v1/shipments/{{tracking_id}}",
        "headers": {"Authorization": "Bearer test_token"},
        "parametersSchema": [
            {"name": "tracking_id", "type": "string", "description": "Waybill tracking ID", "required": True}
        ],
        "requiresApproval": False,
        "isActive": True,
    }
    create_resp = client.post("/api/ai/tools", json=tool_payload, headers=owner_headers)
    assert create_resp.status_code == 200
    created = create_resp.json()
    tool_id = created["id"]
    assert created["name"] == "lookup_shipment_eta"

    # 3. List tools
    list_resp = client.get("/api/ai/tools", headers=owner_headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1

    # 4. Sandbox Test execution
    test_resp = client.post(
        "/api/ai/tools/test",
        json={
            "toolId": tool_id,
            "method": "GET",
            "urlTemplate": "https://api.logistics.com/v1/shipments/{{tracking_id}}",
            "testArgs": {"tracking_id": "GIDI-992-ALERT"},
        },
        headers=owner_headers,
    )
    assert test_resp.status_code == 200
    assert test_resp.json()["ok"] is True

    # 5. Toggle active
    toggle_resp = client.post(f"/api/ai/tools/{tool_id}/toggle", json={}, headers=owner_headers)
    assert toggle_resp.status_code == 200
    assert toggle_resp.json()["isActive"] is False

    # 6. Delete tool
    del_resp = client.delete(f"/api/ai/tools/{tool_id}", headers=owner_headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["ok"] is True
