"""Tests for the live web & documentation crawler (services/crawler.py)."""

import re

import pytest

from app.services import crawler


class FakeResponse:
    status_code = 200

    def __init__(self, url: str, text: str):
        self.url = url
        self.text = text
        self.headers = {"content-type": "text/html; charset=utf-8"}


class FakeClient:
    def __init__(self, pages: dict[str, str], *args, **kwargs):
        self.pages = pages

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def get(self, url: str) -> FakeResponse:
        body = self.pages.get(url)
        if body is None:
            return FakeResponse(url, "")
        return FakeResponse(url, body)


class FakeTenant:
    id = "tenant-1"


class FakeDb:
    def __init__(self):
        self.added = []
        self.closed = False

    def get(self, *args, **kwargs):
        return FakeTenant()

    def query(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return None

    def add(self, obj):
        self.added.append(obj)

    def refresh(self, obj):
        if not obj.id:
            obj.id = "ks-fake-1"

    def commit(self):
        pass

    def close(self):
        self.closed = True


@pytest.fixture
def fake_io(monkeypatch):
    """Patches out httpx, Chroma and the DB session used by the crawler."""
    captured = {"docs": []}

    def fake_add_docs(tenant_id, ids, texts, metadatas):
        captured["docs"].extend(zip(ids, texts, metadatas))

    def _patch(pages: dict[str, str]):
        monkeypatch.setattr(crawler.httpx, "Client", lambda *a, **k: FakeClient(pages))
        monkeypatch.setattr(crawler.vector_store, "add_docs", fake_add_docs)
        monkeypatch.setattr(crawler, "crawl_with_scrapy", lambda *a, **k: [])
        db = FakeDb()
        monkeypatch.setattr(crawler, "SessionLocal", lambda: db)
        return captured, db

    return _patch


def test_extract_links_filters_assets_and_foreign_hosts():
    html = """
    <a href="/guide/setup">Setup</a>
    <a href="https://example.com/guide/api">API</a>
    <a href="https://example.com/logo.png">Logo</a>
    <a href="https://example.com/docs/guide.pdf">PDF</a>
    <a href="https://docs.example.com/guide/api">Subdomain</a>
    <a href="https://other.com/page">Foreign</a>
    <a href="mailto:hi@example.com">Mail</a>
    <a href="#section">Anchor</a>
    """
    links = crawler.extract_links(html, "https://example.com/docs/index.html")
    assert "https://example.com/guide/setup" in links
    assert "https://example.com/guide/api" in links
    assert not any("logo.png" in l for l in links)
    assert not any(".pdf" in l for l in links)
    assert not any("docs.example.com" in l for l in links)
    assert not any("other.com" in l for l in links)


def test_clean_html_strips_script_and_uppercase_tags():
    html = """
    <HTML><HEAD><TITLE>My Docs</TITLE></HEAD>
    <BODY>
      <SCRIPT>var evil = "x".repeat(1_000);</SCRIPT>
      <NAV>menu link</NAV>
      <FOOTER>copyright 2026</FOOTER>
      <DIV><H1>Welcome</H1><P>Real content here.</P></DIV>
    </BODY></HTML>
    """
    title, text = crawler.clean_html(html)
    assert title == "My Docs"
    assert "Real content here." in text
    assert "Welcome" in text
    assert "evil" not in text
    assert "menu link" not in text
    assert "copyright" not in text


def test_crawl_and_index_site_multi_page(monkeypatch, fake_io):
    pages = {
        "https://docs.example.com/": (
            "<html><head><title>Home</title></head><body>"
            "<p>Welcome to the docs. This is plenty of text for a first page.</p>"
            "<a href='/guide'>Guide</a><a href='/assets/app.css'>CSS</a>"
            "</body></html>"
        ),
        "https://docs.example.com/guide": (
            "<html><head><title>Guide</title></head><body>"
            "<p>The guide has lots of useful words spread across enough sentences.</p>"
            "<a href='/'>Home</a>"
            "</body></html>"
        ),
    }
    captured, db = fake_io(pages)
    result = crawler.crawl_and_index_site("tenant-1", "https://docs.example.com/", max_pages=5)

    assert result["ok"] is True
    assert result["pagesCrawled"] == 2
    assert result["chunksIndexed"] == len(captured["docs"])
    assert result["chunksIndexed"] >= 1
    assert result["totalCharacters"] > 0
    assert len(db.added) == 1
    source = db.added[0]
    assert source.source_type.value == "link"
    assert source.chunk_count == len(captured["docs"])
    assert source.url == "https://docs.example.com/"
    assert db.closed is True
    # Only HTML pages are indexed, never the CSS asset; every chunk is
    # tagged with the source_id so deletion/cleanup can target them.
    assert all(meta["url"] != "https://docs.example.com/assets/app.css" for _, _, meta in captured["docs"])
    assert all(meta["source_id"] == str(source.id) for _, _, meta in captured["docs"])


def test_crawl_and_index_site_returns_ok_false_when_no_content(monkeypatch, fake_io):
    pages = {
        "https://docs.example.com/": "<html><head><title>App</title></head><body><div id='root'></div></body></html>",
    }
    captured, db = fake_io(pages)
    result = crawler.crawl_and_index_site("tenant-1", "https://docs.example.com/", max_pages=5)

    assert result["ok"] is False
    assert result["pagesCrawled"] == 0
    assert result["chunksIndexed"] == 0
    assert "JavaScript" in result["message"]
    assert captured["docs"] == []
    assert db.added == []


def test_crawl_falls_back_to_scrapy_when_page_is_js_shell(monkeypatch, fake_io):
    pages = {
        "https://docs.example.com/": (
            "<html><head><title>App</title></head><body><div id='root'></div></body></html>"
        ),
    }
    captured, db = fake_io(pages)
    monkeypatch.setattr(
        crawler,
        "crawl_with_scrapy",
        lambda url, max_pages=15: [
            (url, "<html><head><title>Real Docs</title></head><body>"
                  "<p>This is the real content rendered only by JavaScript, spread "
                  "across enough words to pass the length filter.</p></body></html>")
        ],
    )
    result = crawler.crawl_and_index_site("tenant-1", "https://docs.example.com/", max_pages=5)

    assert result["ok"] is True
    assert result["pagesCrawled"] == 1
    assert result["chunksIndexed"] == len(captured["docs"])
    assert len(db.added) == 1


def test_chunk_text_respects_chunk_size_and_overlap():
    words = "word " * 1200
    chunks = crawler.chunk_text(words, chunk_size=500, overlap=80)
    assert len(chunks) >= 2
    assert all(len(c.split()) <= 500 for c in chunks)
