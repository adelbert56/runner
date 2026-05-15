"""Parser for EventGo event pages."""

from __future__ import annotations

from .common import compact_lines, find_label_value, generic_extract, merge_details


def extract(html: str, race: dict, url: str) -> dict:
    lines = compact_lines(html)
    details = generic_extract(html, race)
    platform_details = {
        "venue": find_label_value(lines, ("活動地點", "地址", "地點")),
        "start_location": find_label_value(lines, ("活動地點", "地址", "地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦", "主辦者")),
        "co_organizer": find_label_value(lines, ("協辦單位", "協辦", "承辦單位", "承辦")),
    }
    return merge_details(platform_details, details)

