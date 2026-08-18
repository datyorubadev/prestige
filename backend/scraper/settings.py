"""Scrapy project settings for the Prestige live web & documentation crawler.

Loaded when the fallback spider runs (via backend/scrapy.cfg). The spider's own
custom_settings still take precedence for values that matter per-run.
"""
BOT_NAME = "prestige_scraper"

SPIDER_MODULES = ["scraper.spiders"]
NEWSPIDER_MODULE = "scraper.spiders"

USER_AGENT = "Prestige-AI-DocBot/1.0 (+https://prestige.ng)"

ROBOTSTXT_OBEY = False
CONCURRENT_REQUESTS = 4
DOWNLOAD_DELAY = 0.4
AUTOTHROTTLE_ENABLED = True
RETRY_ENABLED = True
RETRY_TIMES = 2

LOG_LEVEL = "WARNING"
