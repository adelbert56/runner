"""Parser for Lohas 樂活報名網 official event pages."""

from __future__ import annotations

import re

from .common import (
    collect_between,
    compact_lines,
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

    fee_block = " ".join(collect_between(lines, ("報名費用", "費用"), ("晶片押金", "報名資訊", "開放名額", "活動資訊")))
    quota_block = " ".join(collect_between(lines, ("開放名額", "限制名額", "名額"), ("報名資格", "活動資訊", "報名費用")))
    deposit_block = " ".join(collect_between(lines, ("晶片押金",), ("報名資訊", "開放名額", "活動資訊")))
    fees = "；".join(value for value in (first_fee_text(fee_block), f"晶片押金 {first_fee_text(deposit_block)}" if first_fee_text(deposit_block) else "") if value)

    opens_at, period_deadline = _registration_period(html)
    deadline = period_deadline or _countdown_deadline(html)

    platform_details = {
        "venue": find_label_value(lines, ("活動地點", "會場地點", "起跑地點")),
        "start_location": find_label_value(lines, ("活動地點", "會場地點", "起跑地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": find_label_value(lines, ("承辦單位", "承辦")),
        "fees": fees,
        "quota": first_quota_text(quota_block),
        "registration_opens_at": opens_at,
        "registration_deadline": deadline,
    }

    return merge_details(platform_details, details)
