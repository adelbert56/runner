"""Scraper for 運動筆記 (running.biji.co) — main race data source."""

import re
import time
import logging
from dataclasses import dataclass, field
from urllib.parse import quote, urljoin, urlparse

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

BASE_URL = "https://running.biji.co"
SOURCE_NAME = SOURCES["sports_note"]["name"]
SOURCE_URL = SOURCES["sports_note"]["url"]


@dataclass
class RaceEntry:
    race_name: str
    race_date: str          # YYYY-MM-DD
    race_county: str
    distances: list[str] = field(default_factory=list)
    difficulty: str = "初級"
    registration_status: str = ""
    registration_link: str = ""
    registration_note: str = ""
    registration_opens_at: str = ""
    registration_deadline: str = ""
    source_registration_link: str = ""
    social_links: list[str] = field(default_factory=list)
    facebook_search_url: str = ""
    detail_url: str = ""
    source: str = SOURCE_NAME
    source_url: str = ""


def _infer_year_from_name(race_name: str, fallback: str = "2026") -> str:
    """Use the year in the race title when the source list only shows month/day."""
    match = re.search(r"(20\d{2})", race_name)
    return match.group(1) if match else fallback


def _parse_date(raw: str, race_name: str = "") -> str:
    """Convert '05-10 (週 六)' and a race title into 'YYYY-05-10'."""
    m = re.search(r"(\d{2})-(\d{2})", raw)
    if not m:
        return ""
    return f"{_infer_year_from_name(race_name)}-{m.group(1)}-{m.group(2)}"


def _normalize_scraped_date(raw: str, default_year: str = "2026") -> str:
    """Normalize scraped dates to YYYY-MM-DD when possible."""
    text = re.sub(r"\s+", "", raw)
    text = text.replace("年", "/").replace("月", "/").replace("日", "")

    def valid_date(year: int, month: int, day: int) -> str:
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return ""
        return f"{year}-{month:02d}-{day:02d}"

    m = re.search(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", text)
    if m:
        year, month, day = m.groups()
        return valid_date(int(year), int(month), int(day))

    m = re.search(r"(\d{2,3})[./-](\d{1,2})[./-](\d{1,2})", text)
    if m:
        roc_year, month, day = m.groups()
        year = int(roc_year) + 1911 if len(roc_year) == 3 else int(roc_year) + 2000
        return valid_date(year, int(month), int(day))

    m = re.search(r"(\d{1,2})[./-](\d{1,2})", text)
    if m:
        month, day = m.groups()
        return valid_date(int(default_year), int(month), int(day))

    return ""


def _extract_date_near_keywords(text: str, keywords: tuple[str, ...], default_year: str) -> str:
    """Find a date near registration-related keywords."""
    date_pattern = (
        r"(?:\d{4}|\d{2,3})[./年-]\d{1,2}[./月-]\d{1,2}日?"
        r"|\d{1,2}[./月-]\d{1,2}日?"
    )
    compact = re.sub(r"\s+", " ", text)

    for keyword in keywords:
        escaped_keyword = re.escape(keyword)
        pattern = rf"{escaped_keyword}.{{0,40}}?({date_pattern})|({date_pattern}).{{0,40}}?{escaped_keyword}"
        for match in re.finditer(pattern, compact, flags=re.IGNORECASE):
            raw_date = next((g for g in match.groups() if g), "")
            normalized = _normalize_scraped_date(raw_date, default_year=default_year)
            if normalized:
                return normalized
    return ""


def _extract_registration_period(text: str, default_year: str) -> tuple[str, str]:
    """Extract date ranges like '報名期間 5/1 至 6/1'."""
    date_pattern = (
        r"(?:\d{4}|\d{2,3})[./年-]\d{1,2}[./月-]\d{1,2}日?"
        r"|\d{1,2}[./月-]\d{1,2}日?"
    )
    range_pattern = (
        rf"(?:報名期間|報名時間|報名日期|登記期間).{{0,40}}?"
        rf"({date_pattern}).{{0,20}}?(?:至|到|~|～).{{0,20}}?({date_pattern})"
    )
    match = re.search(range_pattern, re.sub(r"\s+", " ", text), flags=re.IGNORECASE)
    if not match:
        return "", ""
    opens_at = _normalize_scraped_date(match.group(1), default_year)
    deadline = _normalize_scraped_date(match.group(2), default_year)
    return opens_at, deadline


def _extract_registration_dates(text: str, race_date: str) -> tuple[str, str]:
    """Extract registration open and deadline dates from detail page text."""
    default_year = race_date[:4] if race_date else "2026"
    open_keywords = (
        "報名開始", "開放報名", "開始報名", "報名時間", "報名期間",
        "登記開始", "開放登記", "registration starts", "registration opens",
    )
    deadline_keywords = (
        "報名截止", "截止報名", "報名至", "截止日", "登記截止",
        "registration deadline", "deadline",
    )
    opens_at = _extract_date_near_keywords(text, open_keywords, default_year)
    deadline = _extract_date_near_keywords(text, deadline_keywords, default_year)
    period_open, period_deadline = _extract_registration_period(text, default_year)
    opens_at = opens_at or period_open
    deadline = deadline or period_deadline
    return opens_at, deadline


def _normalize_county(raw: str) -> str:
    """Normalize county names to traditional Chinese."""
    mapping = {
        "台中市": "臺中市",
        "南投县": "南投縣",
        "彰化县": "彰化縣",
        "苗栗县": "苗栗縣",
    }
    return mapping.get(raw.strip(), raw.strip())


def _is_central_taiwan(county: str) -> bool:
    return _normalize_county(county) in CENTRAL_TAIWAN_COUNTIES


def _extract_distances(item_soup) -> list[str]:
    """Extract distance tags from a race item."""
    distances = []
    # Real selectors: div.event-item.event_item
    for span in item_soup.select("div.event-item, span.category, span.distance, .distance-tag"):
        text = span.get_text(strip=True)
        if text:
            distances.append(text)
    if not distances:
        text = item_soup.get_text()
        found = re.findall(r"\d+(?:\.\d+)?[Kk][Mm]?", text)
        distances = list(dict.fromkeys(found))
    return distances


def _extract_source_registration_link(item_soup, cid: str) -> str:
    """Extract the source-site registration link from list rows."""
    for a in item_soup.select("a[href]"):
        href = a["href"]
        if "form_comp_record" in href or "register" in href.lower():
            return href if href.startswith("http") else BASE_URL + href
    if cid:
        return f"{BASE_URL}/index.php?q=competition&act=info&cid={cid}"
    return ""


def _is_running_biji_url(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return host.endswith("running.biji.co") or host.endswith("biji.co")


def _is_ignored_external_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    if host.endswith("google.com") and "calendar" in path:
        return True
    return False


def _is_facebook_url(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return host.endswith("facebook.com") or host.endswith("fb.com")


def _is_generic_facebook_url(url: str) -> bool:
    path = urlparse(url).path.lower().strip("/")
    generic_pages = {
        "sportsnote",
        "running.school.tw",
    }
    return path in generic_pages


def _extract_facebook_links(soup: BeautifulSoup | None, detail_url: str) -> list[str]:
    """Extract public Facebook links from the source detail page."""
    if soup is None:
        return []
    links: list[str] = []
    for a in soup.select("a[href]"):
        href = a.get("href", "").strip()
        if not href:
            continue
        absolute = urljoin(detail_url, href)
        if _is_facebook_url(absolute) and not _is_generic_facebook_url(absolute) and absolute not in links:
            links.append(absolute)
    return links[:5]


def _facebook_mobile_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.netloc.lower().endswith("facebook.com"):
        return parsed._replace(netloc="mbasic.facebook.com").geturl()
    return url


def _fetch_facebook_text(links: list[str], session: requests.Session) -> str:
    """Best-effort fetch for public Facebook pages/posts."""
    texts: list[str] = []
    for link in links[:3]:
        for url in (link, _facebook_mobile_url(link)):
            try:
                resp = session.get(url, headers=REQUEST_HEADERS, timeout=REQUEST_TIMEOUT)
                if resp.status_code >= 400:
                    continue
                soup = BeautifulSoup(resp.text, "html.parser")
                text = soup.get_text(" ", strip=True)
                if "登入" in text[:200] or "Log in" in text[:200]:
                    continue
                if text:
                    texts.append(text)
                    break
            except requests.RequestException as e:
                logger.debug(f"Facebook fetch failed {url}: {e}")
    return " ".join(texts)


def _looks_like_registration_link(text: str, href: str) -> bool:
    target = f"{text} {href}".lower()
    keywords = (
        "報名", "报名", "線上報名", "我要報名", "立即報名",
        "registration", "register", "signup", "sign-up", "entry",
    )
    return any(keyword.lower() in target for keyword in keywords)


def _fetch_detail_soup(detail_url: str, session: requests.Session) -> tuple[BeautifulSoup | None, str]:
    if not detail_url:
        return None, "未提供賽事詳情頁"

    try:
        resp = session.get(detail_url, headers=REQUEST_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except requests.RequestException as e:
        logger.warning(f"Failed to fetch detail page {detail_url}: {e}")
        return None, "賽事詳情頁讀取失敗"

    return BeautifulSoup(resp.text, "html.parser"), ""


def _extract_official_registration_link(
    detail_url: str,
    soup: BeautifulSoup | None,
    fetch_error: str = "",
) -> tuple[str, str]:
    """Return an external registration URL when the detail page exposes one."""
    if not detail_url:
        return "", "未提供賽事詳情頁，待人工補報名連結"
    if soup is None:
        return "", f"{fetch_error or '賽事詳情頁讀取失敗'}，待人工補報名連結"

    candidates: list[str] = []

    for a in soup.select("a[href]"):
        href = a.get("href", "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(detail_url, href)
        if _is_running_biji_url(absolute):
            continue
        if _is_ignored_external_url(absolute):
            continue
        text = a.get_text(" ", strip=True)
        if _looks_like_registration_link(text, absolute):
            candidates.append(absolute)

    if candidates:
        return candidates[0], ""

    return "", "未在來源頁找到官方報名連結，待人工補報名連結"


def scrape() -> list[dict]:
    """Fetch and parse all central Taiwan races from 運動筆記."""
    logger.info(f"Fetching {SOURCE_URL}")
    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)

    try:
        resp = session.get(
            SOURCE_URL,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except requests.RequestException as e:
        logger.error(f"Failed to fetch 運動筆記: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    # Select all non-header rows from competition list
    all_rows = soup.select("div.competition-list-row")
    items = [r for r in all_rows if "list-title" not in " ".join(r.get("class", []))]

    if not items:
        logger.warning("No race items found — site structure may have changed.")
        logger.debug(f"Page snippet:\n{soup.get_text()[:500]}")
        return []

    races = []
    for item in items:
        # ─── County / location ─────────────────────────────────────────────
        # ─── County / location ─────────────────────────────────────────────
        county_el = item.select_one("div.competition-place")
        if not county_el:
            continue
        county = _normalize_county(county_el.get_text(strip=True))
        if not _is_central_taiwan(county):
            continue

        # ─── Race name & detail URL ────────────────────────────────────────
        name_el = (
            item.select_one("div.competition-name a")
            or item.select_one("a[href*='cid=']")
        )
        if not name_el:
            continue
        race_name = name_el.get_text(strip=True)
        href = name_el.get("href", "")
        cid_match = re.search(r"cid=(\d+)", href)
        cid = cid_match.group(1) if cid_match else ""
        detail_url = (BASE_URL + href) if href.startswith("/") else href

        # ─── Date ─────────────────────────────────────────────────────────
        date_el = item.select_one("div.competition-date-title")
        race_date = _parse_date(date_el.get_text(strip=True), race_name) if date_el else ""

        # ─── Distances ────────────────────────────────────────────────────
        distances = _extract_distances(item)

        # ─── Registration status ──────────────────────────────────────────
        status_el = item.select_one("div.competition-status")
        status = status_el.get_text(strip=True) if status_el else ""

        # ─── Registration link ────────────────────────────────────────────
        source_reg_link = _extract_source_registration_link(item, cid)
        detail_soup, detail_error = _fetch_detail_soup(detail_url, session)
        facebook_links = _extract_facebook_links(detail_soup, detail_url)
        official_reg_link, reg_note = _extract_official_registration_link(
            detail_url,
            detail_soup,
            detail_error,
        )
        detail_text = detail_soup.get_text(" ", strip=True) if detail_soup else ""
        opens_at, deadline = _extract_registration_dates(detail_text, race_date)
        if facebook_links and (not opens_at or not deadline):
            facebook_text = _fetch_facebook_text(facebook_links, session)
            fb_opens_at, fb_deadline = _extract_registration_dates(facebook_text, race_date)
            opens_at = opens_at or fb_opens_at
            deadline = deadline or fb_deadline

        entry = RaceEntry(
            race_name=race_name,
            race_date=race_date,
            race_county=county,
            distances=distances,
            difficulty=infer_difficulty(distances),
            registration_status=status,
            registration_link=official_reg_link,
            registration_note=reg_note,
            registration_opens_at=opens_at,
            registration_deadline=deadline,
            source_registration_link=source_reg_link,
            social_links=facebook_links,
            facebook_search_url=f"https://www.facebook.com/search/top?q={quote(race_name)}",
            detail_url=detail_url,
            source_url=SOURCE_URL,
        )
        races.append(entry.__dict__)
        time.sleep(0.1)  # be gentle

    logger.info(f"運動筆記: found {len(races)} central Taiwan races")
    return races
