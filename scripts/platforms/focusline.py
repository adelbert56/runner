"""Parser for Focusline race registration pages."""

from __future__ import annotations

from .common import compact_lines, find_label_value, generic_extract, merge_details


def extract(html: str, race: dict, url: str) -> dict:
    lines = compact_lines(html)
    details = generic_extract(html, race)
    platform_details = {
        "venue": find_label_value(lines, ("活動地點", "會場", "起跑地點")),
        "start_location": find_label_value(lines, ("活動地點", "會場", "起跑地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": find_label_value(lines, ("承辦單位", "承辦", "協辦單位", "協辦")),
    }
    return merge_details(platform_details, details)

