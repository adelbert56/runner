"""Scraper for 跑者廣場全國賽會 (taipeimarathon.org.tw/contest.aspx)."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import (  # noqa: E402
    CENTRAL_TAIWAN_COUNTIES,
    REQUEST_HEADERS,
    REQUEST_RETRIES,
    REQUEST_RETRY_BACKOFF_SECONDS,
    REQUEST_TIMEOUT,
    SOURCES,
    infer_difficulty,
    is_running_event,
)
from http_client import request_text  # noqa: E402

logger = logging.getLogger(__name__)

SOURCE_NAME = SOURCES["taipeimarathon"]["name"]
SOURCE_URL = SOURCES["taipeimarathon"]["url"]

COUNTY_KEYWORDS = (
    ("臺中市", ("臺中市", "台中市", "臺中", "台中")),
    ("南投縣", ("南投縣", "南投县", "南投")),
    ("彰化縣", ("彰化縣", "彰化县", "彰化")),
    ("苗栗縣", ("苗栗縣", "苗栗县", "苗栗")),
)


def _compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _infer_county(place: str) -> str:
    text = _compact_text(place)
    for county, keywords in COUNTY_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return county
    return ""


def _parse_race_date(raw: str, year: int) -> tuple[str, int]:
    match = re.search(r"(\d{1,2})/(\d{1,2})", raw)
    if not match:
        return "", 0
    month = int(match.group(1))
    day = int(match.group(2))
    return f"{year:04d}-{month:02d}-{day:02d}", month


def _infer_registration_date(month: int, day: int, race_date: str) -> str:
    if not race_date:
        return ""
    race_year = int(race_date[:4])
    race_month = int(race_date[5:7])
    year = race_year - 1 if month > race_month else race_year
    return f"{year:04d}-{month:02d}-{day:02d}"


def _parse_registration_window(raw: str, race_date: str) -> tuple[str, str, str]:
    text = _compact_text(raw)
    if not text:
        return "", "", ""
    if "已截止" in text:
        return "", "", "已截止"

    match = re.search(r"(\d{1,2})月(\d{1,2})日\s*(?:~|～|-|至)\s*(\d{1,2})月(\d{1,2})日", text)
    if not match:
        return "", "", text

    opens_at = _infer_registration_date(int(match.group(1)), int(match.group(2)), race_date)
    deadline = _infer_registration_date(int(match.group(3)), int(match.group(4)), race_date)
    today = datetime.now().strftime("%Y-%m-%d")
    if opens_at and opens_at > today:
        status = "未開始"
    elif deadline and deadline < today:
        status = "已截止"
    else:
        status = "報名中"
    return opens_at, deadline, status


def _extract_distances(distance_cell: BeautifulSoup) -> tuple[list[str], str, str]:
    distances: list[str] = []
    fees: list[str] = []
    quotas: list[str] = []

    for button in distance_cell.select("button"):
        distance = _compact_text(button.get_text(" ", strip=True))
        title = button.get("title", "").replace("<br/>", "\n").replace("<br>", "\n")
        if distance:
            distances.append(distance)

        fee_match = re.search(r"費用[:：]\s*([0-9,]+)", title)
        if fee_match and distance:
            fees.append(f"{distance} {fee_match.group(1)}元")

        quota_match = re.search(r"限額[:：]\s*(?:共)?\s*([0-9,]+)\s*人?", title)
        if quota_match and distance:
            quotas.append(f"{distance} {quota_match.group(1)}人")

    if not distances:
        text = _compact_text(distance_cell.get_text(" ", strip=True))
        if text:
            distances = [item.strip() for item in re.split(r"[、,/]", text) if item.strip()]

    return distances, "、".join(fees), "、".join(quotas)


def _absolute_link(href: str) -> str:
    if not href:
        return ""
    return urljoin(SOURCE_URL, href)


def _looks_usable_link(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return bool(host and "taipeimarathon.org.tw" not in host)


def scrape() -> list[dict]:
    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)

    logger.info("Fetching %s", SOURCE_URL)
    try:
        html = request_text(
            session,
            SOURCE_URL,
            timeout=REQUEST_TIMEOUT,
            retries=REQUEST_RETRIES,
            backoff_seconds=REQUEST_RETRY_BACKOFF_SECONDS,
        )
    except requests.RequestException as error:
        logger.error("Failed to fetch 跑者廣場全國賽會: %s", error)
        return []

    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("#GridView1")
    if table is None:
        logger.warning("No GridView1 table found on 跑者廣場全國賽會")
        return []

    races: list[dict] = []
    current_year = datetime.now().year
    previous_month = 0

    for row in table.select("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) < 8:
            continue

        name_cell = cells[1]
        link_el = name_cell.select_one("a[href]")
        race_name = _compact_text(name_cell.get_text(" ", strip=True))
        if not race_name:
            continue

        date_text = _compact_text(cells[3].get_text(" ", strip=True))
        base_year = current_year
        provisional_date, month = _parse_race_date(date_text, base_year)
        if not provisional_date:
            continue
        if previous_month and month < previous_month:
            current_year += 1
        previous_month = month
        race_date, _ = _parse_race_date(date_text, current_year)

        venue = _compact_text(cells[4].get_text(" ", strip=True))
        county = _infer_county(venue)
        if county not in CENTRAL_TAIWAN_COUNTIES:
            continue

        distances, fees, quota = _extract_distances(cells[5])
        if not is_running_event(race_name, distances):
            continue

        organizer = _compact_text(cells[6].get_text(" ", strip=True))
        registration_text = _compact_text(cells[7].get_text(" ", strip=True))
        opens_at, deadline, status = _parse_registration_window(registration_text, race_date)

        link = _absolute_link(link_el.get("href", "").strip()) if link_el else ""
        official_event_url = link if _looks_usable_link(link) else ""
        registration_link = official_event_url

        races.append(
            {
                "race_name": race_name,
                "race_date": race_date,
                "race_county": county,
                "distances": distances or ["未知"],
                "difficulty": infer_difficulty(distances),
                "registration_status": status,
                "registration_link": registration_link,
                "official_event_url": official_event_url,
                "registration_opens_at": opens_at,
                "registration_deadline": deadline,
                "venue": venue,
                "start_location": venue,
                "organizer": organizer,
                "fees": fees,
                "quota": quota,
                "is_official_direct": bool(official_event_url),
                "detail_url": link,
                "source": SOURCE_NAME,
                "source_url": SOURCE_URL,
            }
        )

    logger.info("跑者廣場全國賽會: found %s central Taiwan races", len(races))
    return races
