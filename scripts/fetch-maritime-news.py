#!/usr/bin/env python3
"""
fetch-maritime-news.py

Regenerates assets/data/maritime-news.json — a small "Latest maritime
news" list on insights.html. Pulls real headlines from real maritime
trade-press RSS feeds (stdlib only, no dependencies): headline + link
back to the original article + source + publish date. No full-article
scraping — this is aggregation-with-attribution, not republishing.

Sources (checked this session — both are real, standard WordPress RSS
feeds, currently live):
  - gCaptain      https://gcaptain.com/feed/
  - Splash247     https://splash247.com/feed/
Ruled out: Lloyd's List (RSS feed page is subscriber-gated), Maritime
Executive (their /rss.xml just redirects to the homepage, not a feed).

Run on the VPS via cron every ~20-30 min (see deploy.md) — this is a
one-shot fetch-and-write, not a persistent process like fleet-relay.py.

Usage:
    python3 scripts/fetch-maritime-news.py
"""
import json
import os
import time
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

FEEDS = [
    {"url": "https://gcaptain.com/feed/", "source": "gCaptain"},
    {"url": "https://splash247.com/feed/", "source": "Splash247"},
]

MAX_ITEMS = 12
PER_FEED_LIMIT = 10
REQUEST_TIMEOUT_SEC = 15
UA = "Mozilla/5.0 (compatible; MaritimeAffairsNewsFetcher/1.0; +https://maritime-affairs.eu)"

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "data", "maritime-news.json")


def fetch_feed(feed):
    req = urllib.request.Request(feed["url"], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SEC) as r:
        raw = r.read()
    root = ET.fromstring(raw)
    items = []
    for item in root.findall("./channel/item")[:PER_FEED_LIMIT]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date_raw = (item.findtext("pubDate") or "").strip()
        if not title or not link:
            continue
        try:
            pub_dt = parsedate_to_datetime(pub_date_raw)
            pub_ts = int(pub_dt.timestamp())
        except (TypeError, ValueError):
            pub_ts = 0
        items.append({
            "title": title,
            "link": link,
            "source": feed["source"],
            "publishedAt": pub_ts,
        })
    return items


def main():
    all_items = []
    errors = []
    for feed in FEEDS:
        try:
            all_items.extend(fetch_feed(feed))
        except Exception as e:
            errors.append(f"{feed['source']}: {e}")
            print(f"WARNING: failed to fetch {feed['source']} ({feed['url']}): {e}")

    all_items.sort(key=lambda x: x["publishedAt"], reverse=True)
    all_items = all_items[:MAX_ITEMS]

    out = {
        "meta": {
            "title": "Latest maritime news",
            "sources": [f["source"] for f in FEEDS],
            "note": "Headlines and links only, aggregated from real maritime trade-press RSS feeds — not full-article reproduction.",
            "generatedAt": int(time.time()),
            "fetchErrors": errors,
        },
        "items": all_items,
    }

    tmp_path = OUT + ".tmp"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(tmp_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    os.replace(tmp_path, OUT)

    print(f"Wrote {OUT} — {len(all_items)} items from {len(FEEDS) - len(errors)}/{len(FEEDS)} feeds")
    if errors and not all_items:
        raise SystemExit(1)  # all feeds failed — let cron/journal flag it


if __name__ == "__main__":
    main()
