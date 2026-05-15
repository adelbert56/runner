"""Scraper for 台灣越野跑協會 (twttra.com)."""

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

BASE_URL = "https://www.twttra.com"
SOURCE_NAME = SOURCES["twttra"]["name"]
SOURCE_URL = SOURCES["twttra"]["url"]


def _fetch_html(url: str, session: requests.Session) -> str:
    try:
        resp = session.get(url, headers=REQUEST_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        resp.encoding = "utf-8"
        return resp.text
    except requests.RequestException as e:
        logger.warning(f"Fetch failed {url}: {e}")
        return ""


def _extract_race_links(html: str) -> list[str]:
    """Find sub-page links that likely contain race events."""
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for a in soup.select("a[href]"):
        href = a["href"]
        text = a.get_text(strip=True)
        # Include links that look like race registration pages
        if any(kw in href + text for kw in ["race", "event", "reg", "賽", "報名", "越野", "挑戰"]):
            url = href if href.startswith("http") else BASE_URL + "/" + href.lstrip("/")
            if url not in links and BASE_URL in url:
                links.append(url)
    return links[:20]  # cap at 20 sub-pages


def _parse_race_page(url: str, html: str) -> dict | None:
    """Extract race info from a single event page."""
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text()

    # County check first
    county = ""
    for kw in CENTRAL_TAIWAN_COUNTIES:
        if kw in text:
            county = kw
            break
    if not county:
        return None

    # Race name: try heading tags
    name = ""
    for tag in ("h1", "h2", "h3"):
        el = soup.find(tag)
        if el and el.get_text(strip=True):
            name = el.get_text(strip=True)
            break
    if not name:
        return None

    # Date
    date_str = ""
    date_matches = re.findall(r"(\d{4})[/-](\d{2})[/-](\d{2})", text)
    if date_matches:
        y, mo, d = date_matches[0]
        date_str = f"{y}-{mo}-{d}"

    # Distances
    distances = re.findall(r"\d+(?:\.\d+)?\s*[Kk][Mm]?", text)
    distances = list(dict.fromkeys(distances))[:5]

    # Registration link
    reg_link = url
    for a in soup.select("a[href]"):
        href = a["href"]
        if any(kw in href for kw in ["reg", "register", "報名", "bao-ming", "irunner"]):
            reg_link = href if href.startswith("http") else BASE_URL + href
            break

    return {
        "race_name": name,
        "race_date": date_str,
        "race_county": county,
        "distances": distances,
        "difficulty": infer_difficulty(distances) if distances else "高級",
        "registration_status": "",
        "registration_link": reg_link,
        "detail_url": url,
        "source": SOURCE_NAME,
        "source_url": SOURCE_URL,
    }


def scrape() -> list[dict]:
    """Fetch and parse central Taiwan trail races from twttra.com."""
    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)

    logger.info(f"Fetching {SOURCE_URL}")
    homepage_html = _fetch_html(SOURCE_URL, session)
    if not homepage_html:
        return []

    race_links = _extract_race_links(homepage_html)
    logger.info(f"twttra.com: found {len(race_links)} sub-page links")

    races = []
    for url in race_links:
        time.sleep(REQUEST_DELAY)
        html = _fetch_html(url, session)
        if not html:
            continue
        race = _parse_race_page(url, html)
        if race:
            races.append(race)

    logger.info(f"twttra.com: found {len(races)} central Taiwan trail races")
    return races
