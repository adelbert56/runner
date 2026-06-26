"""Parser for Lohas 樂活報名網 official event pages."""

from __future__ import annotations

import re
from urllib.parse import urljoin

import requests

from config import REQUEST_HEADERS, REQUEST_RETRIES, REQUEST_RETRY_BACKOFF_SECONDS, REQUEST_TIMEOUT
from http_client import request_text

from .common import (
    collect_between,
    compact_lines,
    compact_text,
    find_label_value,
    first_fee_text,
    first_quota_text,
    generic_extract,
    merge_details,
    normalize_date,
)


def _countdown_deadline(html: str) -> str:
    match = re.search(r"countdown\('(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}'", html)
    if not match:
        return ""
    return normalize_date(match.group(1))


def _signup_link(html: str, base_url: str) -> str:
    match = re.search(r"https://signup\.lohasnet\.tw/signup/\d+", html)
    if match:
        return match.group(0)
    match = re.search(r'href=["\'](/signup/\d+)["\']', html)
    if match:
        return urljoin(base_url, match.group(1))
    return ""


def _load_signup_deadline(signup_url: str) -> str:
    if not signup_url:
        return ""
    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)
    try:
        html = request_text(
            session,
            signup_url,
            timeout=REQUEST_TIMEOUT,
            retries=REQUEST_RETRIES,
            backoff_seconds=REQUEST_RETRY_BACKOFF_SECONDS,
        )
    except Exception:
        return ""
    return _countdown_deadline(html)


def _extract_group_labels(lines: list[str]) -> list[str]:
    try:
        start = lines.index("組別")
    except ValueError:
        return []

    labels: list[str] = []
    index = start + 1
    while index + 1 < len(lines):
        name = compact_text(lines[index])
        distance = compact_text(lines[index + 1])
        if name in {"報名費用", "開放名額", "活動資訊", "報名資訊"}:
            break
        if not distance.startswith("("):
            index += 1
            continue
        labels.append(f"{name}{distance}")
        index += 2
    return labels


def _matrix_values(lines: list[str], title: str, count: int) -> list[str]:
    if not count:
        return []
    try:
        start = lines.index(title)
    except ValueError:
        return []
    values: list[str] = []
    for candidate in lines[start + 1:start + 1 + count]:
        value = compact_text(candidate)
        if value:
            values.append(value)
    return values if len(values) == count else []


def _grouped_money_text(labels: list[str], values: list[str]) -> str:
    rows: list[str] = []
    for label, value in zip(labels, values):
        distance = re.search(r"\(([^)]+)\)", label)
        distance_text = distance.group(1) if distance else label
        amount = value.replace(",", "")
        if amount.isdigit():
            rows.append(f"{distance_text} {int(amount)}元")
    return "、".join(rows)


def _grouped_quota_text(labels: list[str], values: list[str]) -> str:
    rows: list[str] = []
    for label, value in zip(labels, values):
        distance = re.search(r"\(([^)]+)\)", label)
        distance_text = distance.group(1) if distance else label
        quota = compact_text(value).replace(" ", "")
        if quota:
            rows.append(f"{distance_text} {quota}")
    return "、".join(rows)


def _grouped_start_time_text(labels: list[str], values: list[str]) -> str:
    rows: list[str] = []
    for label, value in zip(labels, values):
        time = compact_text(value).replace("：", ":")
        if not re.match(r"^\d{1,2}:\d{2}$", time):
            continue
        rows.append(f"{label} 起跑 {time.zfill(5)}")
    return "、".join(rows)


def _registration_period(html: str) -> tuple[str, str]:
    """Extract opens_at and deadline from Lohas period text.

    Matches: 自 2026 年 06 月 15 日 11:00 起 至 2026 年 09 月 30 日 23:59 止
    """
    match = re.search(
        r"自\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日[^起]*起[^至]*至\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日",
        html,
        re.DOTALL,
    )
    if not match:
        return "", ""
    y1, m1, d1, y2, m2, d2 = match.groups()
    return f"{y1}-{int(m1):02d}-{int(d1):02d}", f"{y2}-{int(m2):02d}-{int(d2):02d}"


def extract(html: str, race: dict, url: str) -> dict:
    lines = compact_lines(html)
    details = generic_extract(html, race, url)
    labels = _extract_group_labels(lines)

    fee_block = " ".join(collect_between(lines, ("報名費用", "費用"), ("晶片押金", "報名資訊", "開放名額", "活動資訊")))
    quota_block = " ".join(collect_between(lines, ("開放名額", "限制名額", "名額"), ("報名資格", "活動資訊", "報名費用")))
    deposit_block = " ".join(collect_between(lines, ("晶片押金",), ("報名資訊", "開放名額", "活動資訊")))
    grouped_fees = _grouped_money_text(labels, _matrix_values(lines, "報名費用", len(labels)))
    grouped_quota = _grouped_quota_text(labels, _matrix_values(lines, "開放名額", len(labels)))
    grouped_start_times = _grouped_start_time_text(labels, _matrix_values(lines, "起跑時間", len(labels)))
    fees = "；".join(value for value in (grouped_fees or first_fee_text(fee_block), f"晶片押金 {first_fee_text(deposit_block)}" if first_fee_text(deposit_block) else "") if value)

    opens_at, period_deadline = _registration_period(html)
    deadline = period_deadline or _load_signup_deadline(_signup_link(html, url)) or _countdown_deadline(html)

    platform_details = {
        "venue": find_label_value(lines, ("活動地點", "會場地點", "起跑地點")),
        "start_location": find_label_value(lines, ("活動地點", "會場地點", "起跑地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": find_label_value(lines, ("承辦單位", "承辦")),
        "fees": fees,
        "quota": grouped_quota or first_quota_text(quota_block),
        "registration_opens_at": opens_at,
        "registration_deadline": deadline,
        "registration_link": _signup_link(html, url),
        "start_times": grouped_start_times,
    }

    return merge_details(platform_details, details)
