"""Label library + ticket-label wiring tests (Chatwoot-style, per tenant)."""


def test_labels_list_seeded_with_colors(client, auth):
    r = client.get("/api/labels", headers=auth("owner"))
    assert r.status_code == 200, r.text
    labels = r.json()
    assert labels, "expected seeded label library"
    first = labels[0]
    assert {"id", "tenantId", "name", "color"} <= set(first)
    assert first["color"].startswith("#")


def test_labels_are_tenant_scoped(client, auth):
    r1 = client.get("/api/labels", headers=auth("owner"))
    t1_names = {l["name"] for l in r1.json()}
    r2 = client.post("/api/labels", headers=auth("owner"),
                     json={"name": "MyCustom", "color": "#ff0000"})
    assert r2.status_code == 200, r2.text
    r3 = client.get("/api/labels", headers=auth("owner"))
    names = {l["name"] for l in r3.json()}
    assert names == t1_names | {"MyCustom"}


def test_label_create_patch_delete(client, auth):
    r = client.post("/api/labels", headers=auth("owner"),
                    json={"name": "Vip", "color": "#123456", "description": "Top accounts"})
    assert r.status_code == 200, r.text
    label = r.json()
    assert label["name"] == "Vip"
    assert label["color"] == "#123456"

    r = client.patch(f"/api/labels/{label['id']}", headers=auth("owner"),
                     json={"color": "#abcdef"})
    assert r.status_code == 200, r.text
    assert r.json()["color"] == "#abcdef"

    r = client.delete(f"/api/labels/{label['id']}", headers=auth("owner"))
    assert r.status_code == 200, r.text
    r = client.get(f"/api/labels/{label['id']}", headers=auth("owner"))
    assert r.status_code == 404


def test_label_name_must_be_unique_per_tenant(client, auth):
    client.post("/api/labels", headers=auth("owner"), json={"name": "Dupe"})
    r = client.post("/api/labels", headers=auth("owner"), json={"name": "Dupe"})
    assert r.status_code == 409, r.text


def test_ticket_dto_carries_label_names(client, auth):
    r = client.get("/api/tickets?status=all", headers=auth("owner"))
    assert r.status_code == 200, r.text
    tickets = r.json()
    labeled = [t for t in tickets if t.get("labels")]
    assert labeled, "expected seeded tickets to carry labels"
    assert all(isinstance(n, str) for t in labeled for n in t["labels"])


def test_ticket_labels_filter(client, auth):
    r = client.get("/api/tickets?label=refund", headers=auth("owner"))
    assert r.status_code == 200, r.text
    tickets = r.json()
    assert tickets, "expected at least one refund ticket"
    assert all("refund" in t["labels"] for t in tickets)


def test_ticket_patch_sets_labels(client, auth):
    r = client.get("/api/tickets?status=all", headers=auth("owner"))
    tickets = r.json()
    target = next(t for t in tickets if "refund" not in t["labels"])
    r = client.patch(f"/api/tickets/{target['id']}", headers=auth("owner"),
                     json={"labels": ["refund", "urgent"]})
    assert r.status_code == 200, r.text
    assert set(r.json()["labels"]) == {"refund", "urgent"}


def test_ticket_patch_activity_note_for_status_change(client, auth):
    r = client.get("/api/tickets?status=all", headers=auth("owner"))
    tickets = r.json()
    target = next(t for t in tickets if t["status"] != "resolved")
    r = client.patch(f"/api/tickets/{target['id']}", headers=auth("owner"),
                     json={"status": "resolved"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "resolved"
    r = client.get(f"/api/tickets/{target['id']}", headers=auth("owner"))
    msgs = r.json()["msgs"]
    assert any(m.get("kind") == "note" and "resolved" in m["text"]
               for m in msgs), [m for m in msgs if m.get("kind")]


def test_message_dto_reply_to_and_system_note_contract(client, auth):
    r = client.get("/api/tickets?status=all", headers=auth("owner"))
    target = r.json()[0]["id"]
    r = client.post(f"/api/tickets/{target}/messages", headers=auth("owner"),
                    json={"body": "First reply", "replyTo": {"messageId": "m1", "text": "orig"}})
    assert r.status_code == 200, r.text
    msg = r.json()
    assert msg["replyTo"] == {"author": "", "text": "orig"}
    assert msg["who"] == "human_agent"


def test_delete_ticket(client, auth):
    r = client.post("/api/tickets", headers=auth("owner"),
                    json={"subject": "Delete me", "cust": "Test Customer", "email": "delete@example.com", "text": "Hello"})
    assert r.status_code == 200, r.text
    tid = r.json()["id"]

    r2 = client.post(f"/api/tickets/{tid}/messages", headers=auth("owner"),
                     json={"body": "Internal message", "sender_type": "system"})
    assert r2.status_code == 200, r2.text

    del_res = client.delete(f"/api/tickets/{tid}", headers=auth("owner"))
    assert del_res.status_code == 200, del_res.text
    assert del_res.json()["ok"] is True

    get_res = client.get(f"/api/tickets/{tid}", headers=auth("owner"))
    assert get_res.status_code == 404
