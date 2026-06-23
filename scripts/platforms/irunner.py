"""Parser for iRunner / 運動筆記報名平台 pages."""

from __future__ import annotations

import re

from .common import compact_lines, compact_text, find_label_value, generic_extract, merge_details, normalize_date


def _combine_label_values(lines: list[str], label_groups: tuple[tuple[str, ...], ...]) -> str:
    values: list[str] = []
    for labels in label_groups:
        value = find_label_value(lines, labels)
        if value:
            values.append(value)
    return "；".join(dict.fromkeys(compact_text(value) for value in values if compact_text(value)))


def _extract_registration_dates(lines: list[str], race_date: str) -> tuple[str, str]:
    default_year = race_date[:4] if race_date else "2026"
    for index, line in enumerate(lines):
        if "報名時間" not in line:
            continue

        block = lines[index:index + 8]
        joined = " ".join(block)
        start_match = re.search(r"起\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})(?:\s+\d{1,2}:\d{2}:\d{2})?", joined)
        end_match = re.search(r"迄\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})(?:\s+\d{1,2}:\d{2}:\d{2})?", joined)
        if start_match or end_match:
            return (
                normalize_date(start_match.group(1), default_year) if start_match else "",
                normalize_date(end_match.group(1), default_year) if end_match else "",
            )
    return "", ""


def extract(html: str, race: dict, url: str) -> dict:
    lines = compact_lines(html)
    text = " ".join(lines)
    details = generic_extract(html, race, url)
    opens_at, deadline = _extract_registration_dates(lines, race.get("race_date", ""))

    platform_details = {
        "registration_opens_at": opens_at,
        "registration_deadline": deadline,
        "venue": find_label_value(lines, ("活動會場", "會場", "活動地點", "起跑地點")),
        "start_location": find_label_value(lines, ("活動會場", "會場", "活動地點", "起跑地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": _combine_label_values(
            lines,
            (("承辦單位", "承辦"), ("協辦單位", "協辦")),
        ),
        "supervising_organizer": find_label_value(lines, ("指導單位", "指導")),
        "sponsor": find_label_value(lines, ("贊助單位", "贊助")),
    }

    if "手機號碼快速登入" in text[:1000]:
        platform_details["registration_note"] = "iRunner 報名入口需要登入，已保留官方活動頁作查證。"

    return merge_details(platform_details, details)
