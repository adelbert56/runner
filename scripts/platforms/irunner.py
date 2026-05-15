"""Parser for iRunner / 運動筆記報名平台 pages."""

from __future__ import annotations

from .common import compact_lines, find_label_value, generic_extract, merge_details


def extract(html: str, race: dict, url: str) -> dict:
    lines = compact_lines(html)
    text = " ".join(lines)
    details = generic_extract(html, race)

    platform_details = {
        "venue": find_label_value(lines, ("活動會場", "會場", "活動地點", "起跑地點")),
        "start_location": find_label_value(lines, ("活動會場", "會場", "活動地點", "起跑地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": find_label_value(lines, ("承辦單位", "承辦", "協辦單位", "協辦")),
    }

    if "手機號碼快速登入" in text[:1000]:
        platform_details["registration_note"] = "iRunner 報名入口需要登入，已保留官方活動頁作查證。"

    return merge_details(platform_details, details)

