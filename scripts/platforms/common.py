"""Shared helpers for official race platform enrichment."""

from __future__ import annotations

import re
from html import unescape
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup


DATE_PATTERN = (
    r"(?:\d{4}|\d{2,3})[./年-]\d{1,2}[./月-]\d{1,2}日?"
    r"|\d{1,2}[./月-]\d{1,2}日?"
)


def has_text(value: object) -> bool:
    return value is not None and str(value).strip() != ""


def host_of(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except ValueError:
        return ""


def absolute_url(url: str, base_url: str) -> str:
    return url if url.startswith(("http://", "https://")) else urljoin(base_url, url)


def compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" ：:　\t\r\n")


def soup_from_html(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def compact_lines(html: str) -> list[str]:
    soup = soup_from_html(html)
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    text = soup.get_text("\n", strip=True)
    return [compact_text(unescape(line)) for line in text.splitlines() if compact_text(line)]


def normalize_date(raw: str, default_year: str = "2026") -> str:
    text = compact_text(raw)
    text = text.replace("年", "/").replace("月", "/").replace("日", "")

    def valid_date(year: int, month: int, day: int) -> str:
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return ""
        return f"{year:04d}-{month:02d}-{day:02d}"

    match = re.search(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", text)
    if match:
        year, month, day = match.groups()
        return valid_date(int(year), int(month), int(day))

    match = re.search(r"(\d{2,3})[./-](\d{1,2})[./-](\d{1,2})", text)
    if match:
        roc_year, month, day = match.groups()
        year = int(roc_year) + 1911 if len(roc_year) == 3 else int(roc_year) + 2000
        return valid_date(year, int(month), int(day))

    match = re.search(r"(\d{1,2})[./-](\d{1,2})", text)
    if match:
        month, day = match.groups()
        return valid_date(int(default_year), int(month), int(day))

    return ""


def date_near_keywords(text: str, keywords: tuple[str, ...], default_year: str) -> str:
    compact = compact_text(text)
    for keyword in keywords:
        pattern = rf"{re.escape(keyword)}.{{0,60}}?({DATE_PATTERN})|({DATE_PATTERN}).{{0,60}}?{re.escape(keyword)}"
        for match in re.finditer(pattern, compact, flags=re.IGNORECASE):
            raw_date = next((group for group in match.groups() if group), "")
            normalized = normalize_date(raw_date, default_year)
            if normalized:
                return normalized
    return ""


def registration_period(text: str, default_year: str) -> tuple[str, str]:
    pattern = (
        rf"(?:報名期間|報名時間|報名日期|報名方式及日期|登記期間|線上報名).{{0,120}}?"
        rf"(?:起)?\s*({DATE_PATTERN}).{{0,40}}?(?:至|到|~|～|-|迄).{{0,40}}?({DATE_PATTERN})"
    )
    match = re.search(pattern, compact_text(text), flags=re.IGNORECASE)
    if not match:
        return "", ""
    return normalize_date(match.group(1), default_year), normalize_date(match.group(2), default_year)


def extract_registration_dates(text: str, race_date: str) -> tuple[str, str]:
    default_year = race_date[:4] if race_date else "2026"
    period_open, period_deadline = registration_period(text, default_year)
    opens_at = date_near_keywords(
        text,
        ("報名開始", "開放報名", "開始報名", "報名時間", "報名期間"),
        default_year,
    )
    deadline = date_near_keywords(
        text,
        ("報名截止", "截止報名", "報名至", "截止日", "額滿為止"),
        default_year,
    )
    return period_open or opens_at, period_deadline or deadline


def find_label_value(lines: list[str], labels: tuple[str, ...]) -> str:
    stop_words = (
        "活動日期", "活動時間", "活動地點", "報名時間", "報名日期", "報名費用",
        "主辦單位", "承辦單位", "協辦單位", "贊助單位", "限制名額", "名額",
        "項目", "組別", "注意事項", "交通資訊",
    )
    for index, line in enumerate(lines):
        normalized_line = compact_text(line)
        for label in labels:
            if label not in normalized_line:
                continue
            inline = re.sub(rf"^.*?{re.escape(label)}\s*[：: ]*", "", normalized_line).strip()
            if inline and inline != normalized_line:
                return inline
            for candidate in lines[index + 1:index + 5]:
                if any(stop in candidate for stop in stop_words) and candidate not in labels:
                    break
                if candidate and candidate not in labels:
                    return candidate
    return ""


def collect_between(lines: list[str], start_labels: tuple[str, ...], stop_labels: tuple[str, ...]) -> list[str]:
    start_index = -1
    for index, line in enumerate(lines):
        if any(label in line for label in start_labels):
            start_index = index
            break
    if start_index < 0:
        return []

    values: list[str] = []
    for line in lines[start_index + 1:]:
        if any(label in line for label in stop_labels):
            break
        if line:
            values.append(line)
    return values


def extract_money_values(text: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"(?:NT\$|NTD|\$)?\s?\d{2,5}(?:,\d{3})?\s?元?", text)))


def extract_quota_values(text: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"\d{2,6}\s?人", text)))


def first_fee_text(text: str) -> str:
    values = extract_money_values(text)
    if not values:
        return ""
    cleaned = [compact_text(value).replace(" ", "") for value in values[:8]]
    return "、".join(cleaned)


def first_quota_text(text: str) -> str:
    values = extract_quota_values(text)
    if not values:
        return ""
    return "、".join(value.replace(" ", "") for value in values[:8])


def status_from_text(text: str) -> str:
    snippet = compact_text(text[:4000])
    if any(keyword in snippet for keyword in ("停辦", "停賽", "取消辦理", "取消停辦")):
        return "停辦"
    if "額滿" in snippet:
        return "已截止"
    if any(keyword in snippet for keyword in ("報名中", "開放報名", "立即報名", "我要報名")):
        return "報名中"
    if any(keyword in snippet for keyword in ("報名截止", "截止報名", "已截止")):
        return "已截止"
    return ""


def generic_extract(html: str, race: dict) -> dict:
    lines = compact_lines(html)
    text = " ".join(lines)
    opens_at, deadline = extract_registration_dates(text, race.get("race_date", ""))
    return {
        "registration_opens_at": opens_at,
        "registration_deadline": deadline,
        "venue": find_label_value(lines, ("活動地點", "會場地點", "集合地點", "起跑地點", "地點")),
        "start_location": find_label_value(lines, ("活動地點", "會場地點", "集合地點", "起跑地點", "地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": find_label_value(lines, ("承辦單位", "承辦", "協辦單位", "協辦")),
        "fees": first_fee_text(text),
        "quota": first_quota_text(text),
        "registration_status": status_from_text(text),
    }


def merge_details(*detail_sets: dict) -> dict:
    merged: dict = {}
    for details in detail_sets:
        for key, value in details.items():
            if has_text(value) and not has_text(merged.get(key)):
                merged[key] = value
    return merged
