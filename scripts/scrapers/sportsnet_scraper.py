"""Scraper for 中華民國路跑協會 (sportsnet.org.tw)."""

import re
import time
import logging

import requests
from bs4 import BeautifulSoup

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import (
    SOURCES, CENTRAL_TAIWAN_COUNTIES, REQUEST_HEADERS,
    REQUEST_TIMEOUT, REQUEST_DELAY, infer_difficulty
)

logger = logging.getLogger(__name__)

BASE_URL = "https://www.sportsnet.org.tw"
SOURCE_NAME = SOURCES["sportsnet"]["name"]
SOURCE_URL = SOURCES["sportsnet"]["url"]

RACE_LIST_URLS = [
    f"{BASE_URL}/race.php",           # popular races
    f"{BASE_URL}/online_reg.php",     # all registration races
]


def _parse_date(raw: str) -> str:
    """Convert various date formats → YYYY-MM-DD."""
    # Try YYYY-MM-DD first
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    # Try MM/DD or MM-DD (assume 2026)
    m = re.search(r"(\d{2})[/-](\d{2})", raw)
    if m:
        return f"2026-{m.group(1)}-{m.group(2)}"
    return ""


def _fetch_race_detail(url: str, session: requests.Session) -> dict:
    """Fetch detail page for county and distance info."""
    try:
        resp = session.get(url, headers=REQUEST_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except requests.RequestException as e:
        logger.warning(f"Detail fetch failed {url}: {e}")
        return {}

    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text()

    # County extraction
    county = ""
    for keyword in CENTRAL_TAIWAN_COUNTIES:
        if keyword in text:
            county = keyword
            break

    # Distance extraction
    distances = re.findall(r"\d+(?:\.\d+)?\s*[Kk][Mm]?", text)
    distances = list(dict.fromkeys(distances))[:5]  # deduplicate, max 5

    return {"county": county, "distances": distances}


def _parse_race_list_page(html: str) -> list[dict]:
    """Parse race list items from a page."""
    soup = BeautifulSoup(html, "html.parser")
    items = []

    # Try different selectors
    candidates = (
        soup.select("li > a[href*='race']")
        or soup.select("ul.race-list li")
        or soup.select("table tr td a")
        or soup.select("a[href*='cid=']")
        or soup.select("a[href*='race_id=']")
    )

    for el in candidates:
        href = el.get("href", "")
        if not href:
            continue
        url = href if href.startswith("http") else BASE_URL + "/" + href.lstrip("/")
        name_text = el.get_text(strip=True)
        if not name_text or len(name_text) < 3:
            continue

        # Extract date from surrounding text
        parent_text = (el.parent or el).get_text()
        date_raw = _parse_date(parent_text)

        items.append({
            "race_name": name_text,
            "race_date": date_raw,
            "detail_url": url,
        })

    return items


def scrape() -> list[dict]:
    """Fetch and parse central Taiwan races from 路跑協會."""
    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)

    raw_items = []
    for list_url in RACE_LIST_URLS:
        logger.info(f"Fetching {list_url}")
        try:
            resp = session.get(list_url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            resp.encoding = "utf-8"
        except requests.RequestException as e:
            logger.warning(f"Failed to fetch {list_url}: {e}")
            continue
        raw_items.extend(_parse_race_list_page(resp.text))
        time.sleep(REQUEST_DELAY)

    races = []
    seen_urls = set()
    for item in raw_items:
        url = item.get("detail_url", "")
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)

        detail = _fetch_race_detail(url, session)
        county = detail.get("county", "")
        if not county:
            continue  # not in central Taiwan

        distances = detail.get("distances", [])
        races.append({
            "race_name": item["race_name"],
            "race_date": item["race_date"],
            "race_county": county,
            "distances": distances,
            "difficulty": infer_difficulty(distances),
            "registration_status": "",
            "registration_link": url,
            "detail_url": url,
            "source": SOURCE_NAME,
            "source_url": list_url,
        })
        time.sleep(REQUEST_DELAY)

    logger.info(f"路跑協會: found {len(races)} central Taiwan races")
    return races
