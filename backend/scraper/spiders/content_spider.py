"""Scrapy fallback spider for the live web & documentation crawler.

Used by app/services/crawler.crawl_with_scrapy when plain HTTP + BeautifulSoup
can't reach a target (bot blocks, JS shells, tricky redirects). Follows
same-host internal links up to max_pages and yields {"url", "content"} items.

Can also be run standalone:
    python -m scrapy runspider scraper/spiders/content_spider.py \
        -a start_urls='["https://example.com/docs"]' -a max_pages=15 -O out.jsonl
"""
import json
import re
from urllib.parse import urlparse

import scrapy

SKIP_EXTENSIONS = re.compile(
    r"\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|pdf|docx?|xlsx?|pptx?|zip|tar|gz|7z|"
    r"css|js|mjs|json|xml|rss|atom|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm|mov)$",
    re.IGNORECASE,
)


class ContentSpider(scrapy.Spider):
    name = "content_spider"

    custom_settings = {
        "ROBOTSTXT_OBEY": False,
        "USER_AGENT": "Prestige-AI-DocBot/1.0 (+https://prestige.ng)",
        "CONCURRENT_REQUESTS": 4,
        "DOWNLOAD_DELAY": 0.4,
        "AUTOTHROTTLE_ENABLED": True,
        "RETRY_ENABLED": True,
        "RETRY_TIMES": 2,
        "LOG_LEVEL": "WARNING",
    }

    def __init__(self, start_urls=None, max_pages=15, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if isinstance(start_urls, str):
            try:
                start_urls = json.loads(start_urls)
            except json.JSONDecodeError:
                start_urls = [start_urls]
        self.start_urls = start_urls or []
        self.max_pages = int(max_pages or 15)
        self.visited = set()
        self.base_netloc = urlparse(self.start_urls[0]).netloc if self.start_urls else None

    def parse(self, response):
        if response.url in self.visited:
            return
        self.visited.add(response.url)
        yield {"url": response.url, "content": response.text}
        if len(self.visited) >= self.max_pages:
            return
        for href in response.css("a::attr(href)").getall():
            href = (href or "").strip().split("#")[0]
            if not href or href.startswith(("javascript:", "mailto:", "tel:", "data:")):
                continue
            full = response.urljoin(href)
            parsed = urlparse(full)
            if parsed.netloc != self.base_netloc or parsed.scheme not in ("http", "https"):
                continue
            if SKIP_EXTENSIONS.search(parsed.path):
                continue
            if full not in self.visited:
                yield scrapy.Request(full, callback=self.parse)
