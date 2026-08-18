"""End-to-end checks for knowledge-source ingestion (guide §6.1): link scraping
with title/description fallbacks, rejection of unreadable pages, and that the
seeded sources are actually chunked + embedded so RAG retrieval can surface them.
"""


class _FakeResp:
    def __init__(self, html, is_redirect=False, headers=None):
        self.html = html
        self.is_redirect = is_redirect
        self.headers = headers or {}
        self.encoding = "utf-8"
        self.apparent_encoding = "utf-8"

    def raise_for_status(self):
        return None

    @property
    def text(self):
        return self.html


GOOD_HTML = """<html><head><title>Transfer Help</title></head><body>
<nav>nav boilerplate</nav>
<h1>Transfers</h1>
<p>Outbound transfers settle in 2-10 minutes on the NIBSS rails. If a transfer is
still processing after 2 hours, report it with the reference so our team can trace
it end to end.</p>
<footer>footer boilerplate</footer>
</body></html>"""

JS_SHELL = """<html><head><title>Loading</title></head><body>
<div id="app"></div><script>window.render()</script>
</body></html>"""

OG_ONLY = """<html><head>
<meta property="og:title" content="Prepaid electricity tokens">
<meta property="og:description" content="Prepaid electricity tokens are vended instantly and sent to your phone by SMS.">
</head><body><div id="app">Loading…</div></body></html>"""


def _patch_fetch(monkeypatch, html):
    from app.services import ingestion

    monkeypatch.setattr(ingestion, "_fetch_safe", lambda url: _FakeResp(html))


def test_link_ingest_scrapes_stores_and_previews(client, auth, monkeypatch):
    _patch_fetch(monkeypatch, GOOD_HTML)
    r = client.post(
        "/api/knowledge/ingest-link",
        headers=auth("owner"),
        json={"url": "https://example.com/help"},
    )
    assert r.status_code == 200, r.text
    dto = r.json()
    assert dto["title"] == "Transfer Help"
    assert dto["chunks"] >= 1
    preview = client.get(f"/api/knowledge/sources/{dto['id']}", headers=auth("owner"))
    assert preview.status_code == 200
    assert "NIBSS" in preview.json()["text"]


def test_link_ingest_uses_og_fallbacks_for_js_pages(client, auth, monkeypatch):
    _patch_fetch(monkeypatch, OG_ONLY)
    r = client.post(
        "/api/knowledge/ingest-link",
        headers=auth("owner"),
        json={"url": "https://example.com/page"},
    )
    assert r.status_code == 200, r.text
    dto = r.json()
    assert dto["title"] == "Prepaid electricity tokens"
    preview = client.get(f"/api/knowledge/sources/{dto['id']}", headers=auth("owner"))
    assert preview.status_code == 200
    assert "electricity" in preview.json()["text"]


def test_link_ingest_rejects_unreadable_page(client, auth, monkeypatch):
    _patch_fetch(monkeypatch, JS_SHELL)
    r = client.post(
        "/api/knowledge/ingest-link",
        headers=auth("owner"),
        json={"url": "https://example.com/spa"},
    )
    assert r.status_code == 400
    assert "No readable text" in r.json()["error"]["message"]


def test_seeded_knowledge_sources_are_embedded_and_retrievable(client, auth):
    from app.services import vector_store

    ids = vector_store.get_collection("t1").get()["ids"]
    assert any(i.startswith("t1:ks1:") for i in ids), "seeded ks1 chunks missing from vector store"
    # query on content unique to the ks1 help-docs source (card holds / pre-auth)
    hits = vector_store.query("t1", "why was my card declined but money deducted", k=6)
    sources = {meta.get("source_id") for _, meta in hits}
    assert "ks1" in sources
