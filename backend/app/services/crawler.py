"""Live Web & Documentation Crawler (§6.1 / §6.5).

Recursively crawls target documentation sites, parses HTML into clean markdown,
generates semantic chunks, and indexes into Chroma vector store in real-time.

Parsing uses BeautifulSoup (html.parser) for robust, malformed-HTML-tolerant
extraction. If a target only serves a JavaScript shell (SPA / Notion / Zendesk
/ React docs) or blocks plain HTTP fetches, the crawler falls back to a Scrapy
spider run as an isolated subprocess (scraper/spiders/content_spider.py).
"""
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

from app.database import SessionLocal
from app.models import KnowledgeSource, Tenant
from app.models.common import KnowledgeType
from app.services import vector_store

logger = logging.getLogger(__name__)

# Tags whose content is never useful for the knowledge base.
SKIP_TAGS = frozenset(("script", "style", "nav", "footer", "header", "noscript",
                       "iframe", "form", "button", "svg", "aside", "select", "template"))
# Tags that introduce a line break between blocks.
BLOCK_TAGS = frozenset(("p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "div", "table",
                        "tr", "td", "th", "section", "article", "blockquote", "pre"))
# Link targets that are binary assets or otherwise not crawlable pages.
SKIP_EXTENSIONS = re.compile(
    r"\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|pdf|docx?|xlsx?|pptx?|zip|tar|gz|7z|"
    r"css|js|mjs|json|xml|rss|atom|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm|mov)$",
    re.IGNORECASE,
)
# Max characters of page text to index per page (prevents monster pages).
MAX_PAGE_CHARS = 60_000

# User-Agents. A descriptive bot UA is allowed by Wikipedia, ReadTheDocs and most
# docs portals; a browser UA is used as a retry for sites that blanket-block bots.
BOT_UA = "Prestige-AI-DocBot/1.0 (+https://prestige.ng)"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
CRAWL_HEADERS = {
    "User-Agent": BOT_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _fetch(client: httpx.Client, url: str) -> httpx.Response:
    """GET with the bot UA; retry with a browser UA when the bot UA is blocked."""
    resp = client.get(url)
    if resp.status_code in (403, 429) and resp.request.headers.get("User-Agent") == BOT_UA:
        resp = client.get(url, headers={"User-Agent": BROWSER_UA})
    return resp


def clean_html(html: str) -> tuple[str, str]:
    """Extract a title and readable text from HTML using BeautifulSoup."""
    soup = BeautifulSoup(html, "html.parser")
    title_el = soup.find("title")
    title = title_el.get_text(strip=True) if title_el else "Documentation Page"

    for tag in soup.find_all(tuple(SKIP_TAGS)):
        tag.decompose()
    for el in soup.find_all("head"):
        el.decompose()
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for tag in soup.find_all(tuple(BLOCK_TAGS)):
        tag.append("\n")

    text = soup.get_text(separator=" ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return title, text


def extract_links(html: str, base_url: str) -> list[str]:
    """Find same-host internal links in an HTML document using BeautifulSoup."""
    soup = BeautifulSoup(html, "html.parser")
    base_netloc = urllib.parse.urlparse(base_url).netloc
    links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip().split("#")[0]
        if not href or href.startswith(("javascript:", "mailto:", "tel:", "data:")):
            continue
        full_url = urllib.parse.urljoin(base_url, href)
        parsed = urllib.parse.urlparse(full_url)
        if parsed.netloc != base_netloc or parsed.scheme not in ("http", "https"):
            continue
        if SKIP_EXTENSIONS.search(parsed.path):
            continue
        links.add(full_url)
    return list(links)


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 80) -> list[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i:i + chunk_size]
        chunks.append(" ".join(chunk_words))
        if i + chunk_size >= len(words):
            break
        i += chunk_size - overlap
    return chunks or [text]


def crawl_site(start_url: str, max_pages: int = 15) -> list[tuple[str, str]]:
    """Breadth-first crawl using httpx + BeautifulSoup. Returns (url, html) pairs."""
    visited = set()
    queue = [start_url]
    results = []

    with httpx.Client(timeout=15.0, follow_redirects=True, headers=CRAWL_HEADERS) as client:
        while queue and len(results) < max_pages:
            url = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)

            try:
                resp = _fetch(client, url)
                if resp.status_code != 200:
                    continue
                content_type = (resp.headers.get("content-type") or "").lower()
                if content_type and not any(t in content_type for t in ("text/html", "application/xhtml+xml")):
                    continue

                html = resp.text
                results.append((url, html))

                # Find more internal links
                for link in extract_links(html, url):
                    if link not in visited and link not in queue:
                        queue.append(link)
            except Exception as e:
                logger.warning("Failed crawling URL %s: %s", url, e)
                continue

    return results


def crawl_with_scrapy(start_url: str, max_pages: int = 15) -> list[tuple[str, str]]:
    """Fallback crawl via the Scrapy content spider in an isolated subprocess.

    Used when BeautifulSoup + plain HTTP can't reach a target (bot blocks,
    redirects, JS shells). Returns (url, html) pairs just like crawl_site.
    """
    spider_path = Path(__file__).resolve().parents[2] / "scraper" / "spiders" / "content_spider.py"
    backend_dir = Path(__file__).resolve().parents[2]
    if not spider_path.exists():
        logger.warning("Scrapy spider not found at %s", spider_path)
        return []

    fd, out_path = tempfile.mkstemp(suffix=".jsonl")
    os.close(fd)
    try:
        cmd = [
            sys.executable, "-m", "scrapy", "runspider", str(spider_path),
            "-a", f"start_urls={json.dumps([start_url])}",
            "-a", f"max_pages={max_pages}",
            "-s", "LOG_LEVEL=WARNING",
            "-s", "ROBOTSTXT_OBEY=0",
            "-O", out_path,
        ]
        proc = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=240, cwd=str(backend_dir),
        )
        if proc.returncode != 0:
            logger.warning("Scrapy crawl failed: %s", (proc.stderr or proc.stdout)[-800:])
            return []

        pages = []
        with open(out_path, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                pages.append((item.get("url", ""), item.get("content", "")))
        return pages
    except Exception as exc:
        logger.warning("Scrapy fallback failed for %s: %s", start_url, exc)
        return []
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def crawl_and_index_site(tenant_id: str, start_url: str, max_pages: int = 15) -> dict:
    """Crawl a website starting at start_url and index text chunks into Chroma."""
    pages = crawl_site(start_url, max_pages)

    usable: list[tuple[str, str, str]] = []
    for url, html in pages:
        title, text = clean_html(html)
        if len(text) < 50:
            continue
        if len(text) > MAX_PAGE_CHARS:
            text = text[:MAX_PAGE_CHARS]
        usable.append((url, title, text))

    if not usable:
        # Plain HTTP + BeautifulSoup wasn't enough (JS shell / bot-blocked).
        # Fall back to the Scrapy spider for a more capable fetch pass.
        for url, html in crawl_with_scrapy(start_url, max_pages):
            title, text = clean_html(html)
            if len(text) < 50:
                continue
            if len(text) > MAX_PAGE_CHARS:
                text = text[:MAX_PAGE_CHARS]
            usable.append((url, title, text))

    if not usable:
        return {
            "ok": False,
            "startUrl": start_url,
            "pagesCrawled": 0,
            "chunksIndexed": 0,
            "totalCharacters": 0,
            "message": (
                "No usable content found on that site. It may be a JavaScript-rendered app "
                "(e.g. a Notion, Zendesk or React docs site) or it blocks automated "
                "fetching. Try pasting the specific help article URL under the \"Link\" "
                "option instead."
            ),
        }

    all_chunks = []
    all_metas = []
    for url, title, text in usable:
        chunks = chunk_text(text)
        for ch in chunks:
            all_chunks.append(ch)
            all_metas.append({
                "source": url,
                "title": title,
                "tenant_id": tenant_id,
                "type": "crawled_doc",
            })

    # Record in knowledge sources table, then index into Chroma using the
    # same shape as ingestion.py so deletion/cleanup works by source_id.
    db = SessionLocal()
    try:
        tenant = db.get(Tenant, tenant_id) or db.query(Tenant).filter(Tenant.slug == tenant_id).first()
        if not tenant:
            raise RuntimeError(f"Tenant {tenant_id!r} not found while recording crawled source.")

        host = urllib.parse.urlparse(start_url).netloc
        body_text = "\n\n".join(all_chunks)
        ks = KnowledgeSource(
            tenant_id=tenant.id,
            source_type=KnowledgeType.LINK,
            source_name=f"Crawled: {host}",
            title=f"Crawled: {host}",
            url=start_url,
            size_kb=max(1, len(body_text.encode("utf-8")) // 1024),
            text=body_text,
            chunk_count=len(all_chunks),
            status="ready",
            vector_collection_id=vector_store.collection_name(tenant.id),
        )
        db.add(ks)
        db.commit()
        db.refresh(ks)

        try:
            ids = [f"{tenant.id}:{ks.id}:{i}" for i in range(len(all_chunks))]
            metas = [
                {
                    "source_id": str(ks.id),
                    "title": meta["title"],
                    "source_type": KnowledgeType.LINK,
                    "url": meta["source"],
                    "chunk": i,
                }
                for i, meta in enumerate(all_metas)
            ]
            vector_store.add_docs(tenant.id, ids, all_chunks, metas)
        except Exception as e:
            logger.warning("Chroma insertion failed during crawl: %s", e)
    except Exception as exc:
        logger.warning("Failed to record crawled source for %s: %s", start_url, exc)
    finally:
        db.close()

    return {
        "ok": True,
        "startUrl": start_url,
        "pagesCrawled": len(usable),
        "chunksIndexed": len(all_chunks),
        "totalCharacters": sum(len(c) for c in all_chunks),
    }
