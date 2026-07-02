"""Parser for bao-ming / 伊貝特報名 pages."""

from __future__ import annotations

import re
from urllib.parse import urlsplit, urlunsplit

from .common import (
    DATE_PATTERN,
    compact_text,
    extract_registration_dates,
    first_fee_text,
    first_quota_text,
    generic_extract,
    has_text,
    merge_details,
    normalize_date,
    soup_from_html,
)

_BOT_GATE_TITLES = ("安全驗證", "verify", "security check", "access denied")


def _is_bot_gate(html: str) -> bool:
    lower = html[:2000].lower()
    return any(t in lower for t in _BOT_GATE_TITLES)


def _normalize_label(text: str) -> str:
    return compact_text(text).rstrip("：:")


def _usable_value(value: str) -> str:
    text = compact_text(value)
    return "" if text in {"", "尚無資料", "尚未提供", "待公告"} else text


def _section_text_map(html: str) -> dict[str, str]:
    soup = soup_from_html(html)
    sections: dict[str, str] = {}

    for row in soup.select(".page-info .row"):
        label_node = row.select_one("h3")
        if not label_node:
            continue
        label = _normalize_label(label_node.get_text(" ", strip=True))
        value_node = row.select_one(".text-break")
        value = _usable_value(value_node.get_text(" ", strip=True)) if value_node else ""
        if label and value and label not in sections:
            sections[label] = value

    for item in soup.select("li.list-group-item"):
        heading = item.select_one("h6, h5, h4")
        if not heading:
            continue
        label = _normalize_label(heading.get_text(" ", strip=True))
        full_text = compact_text(item.get_text(" ", strip=True))
        value = _usable_value(re.sub(rf"^{re.escape(label)}\s*[：:]?\s*", "", full_text))
        if label and value and label not in sections:
            sections[label] = value

    for card in soup.select(".card.css-header1"):
        label_node = card.select_one(".py-2.px-3")
        body_node = card.select_one(".card-body")
        if not label_node or not body_node:
            continue
        label = _normalize_label(label_node.get_text(" ", strip=True))
        value = _usable_value(body_node.get_text(" ", strip=True))
        if label and value and label not in sections:
            sections[label] = value

    return sections


def _canonical_registration_link(url: str) -> str:
    split = urlsplit(url)
    if not split.scheme or not split.netloc:
        return url
    return urlunsplit((split.scheme, split.netloc, split.path, split.query, "reg"))


def _extract_registration_window(section_text: str, race_date: str) -> tuple[str, str]:
    default_year = race_date[:4] if race_date else "2026"
    match = re.search(
        rf"({DATE_PATTERN}).{{0,30}}?(?:▶|至|到|~|～|-|迄).{{0,30}}?({DATE_PATTERN})",
        section_text,
        flags=re.IGNORECASE,
    )
    if match:
        opens_at = normalize_date(match.group(1), default_year)
        deadline = normalize_date(match.group(2), default_year)
        if opens_at or deadline:
            return opens_at, deadline
    return extract_registration_dates(section_text, race_date)


def _extract_fee_summary(text: str) -> str:
    matches: list[str] = []
    pattern = re.compile(
        r"((?:\d+(?:\.\d+)?\s?(?:K|KM)|全馬組|半馬組|超半馬組|接力組|個人半馬組|挑戰組|樂活組|健康組|健跑組|健走組|親子組)"
        r"[^。；;]{0,18}?)(?:每隊|每人|報名費(?:用)?(?:為)?)?[^0-9]{0,8}?(\d{2,5}(?:,\d{3})?)\s*元",
        flags=re.IGNORECASE,
    )
    for match in pattern.finditer(text):
        label = compact_text(match.group(1)).replace(" ", "")
        amount = match.group(2).replace(",", "")
        if len(label) > 24:
            continue
        matches.append(f"{label} {amount}元")
        if len(matches) >= 8:
            break
    return "、".join(dict.fromkeys(matches))


def extract(html: str, race: dict, url: str) -> dict:
    if _is_bot_gate(html):
        raise ValueError("bot_gate: bao-ming returned a security challenge page")

    details = generic_extract(html, race, url)
    sections = _section_text_map(html)

    registration_window = sections.get("報名起訖", "") or sections.get("報名辦法", "")
    opens_at, deadline = _extract_registration_window(registration_window, race.get("race_date", ""))
    venue = sections.get("競賽地點", "") or sections.get("活動地點", "") or sections.get("會場地點", "")
    quota = sections.get("報名限額", "") or sections.get("限制名額", "")
    fee_summary = _extract_fee_summary(sections.get("報名辦法", ""))

    platform_details = {
        "registration_link": _canonical_registration_link(url),
        "registration_opens_at": opens_at,
        "registration_deadline": deadline,
        "venue": venue,
        "start_location": venue,
        "organizer": sections.get("主辦單位", ""),
        "co_organizer": sections.get("承辦單位", "") or sections.get("協辦單位", ""),
        "quota": quota if has_text(quota) else first_quota_text(sections.get("報名辦法", "")),
        "fees": fee_summary if has_text(fee_summary) else first_fee_text(sections.get("報名辦法", "")),
    }
    generic_allowed = {
        key: value for key, value in details.items()
        if key not in {
            "registration_link",
            "registration_opens_at",
            "registration_deadline",
            "venue",
            "start_location",
            "organizer",
            "co_organizer",
            "quota",
            "fees",
        }
    }
    return merge_details(platform_details, generic_allowed)
