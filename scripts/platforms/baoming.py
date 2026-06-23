"""Parser for bao-ming / 伊貝特報名 pages."""

from __future__ import annotations

from .common import compact_lines, find_label_value, generic_extract, merge_details

_BOT_GATE_TITLES = ("安全驗證", "verify", "security check", "access denied")


def _is_bot_gate(html: str) -> bool:
    lower = html[:2000].lower()
    return any(t in lower for t in _BOT_GATE_TITLES)


def extract(html: str, race: dict, url: str) -> dict:
    if _is_bot_gate(html):
        raise ValueError("bot_gate: bao-ming returned a security challenge page")
    lines = compact_lines(html)
    details = generic_extract(html, race, url)
    platform_details = {
        "venue": find_label_value(lines, ("活動地點", "集合地點", "會場", "起跑地點")),
        "start_location": find_label_value(lines, ("活動地點", "集合地點", "會場", "起跑地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": find_label_value(lines, ("承辦單位", "承辦", "協辦單位", "協辦")),
    }
    return merge_details(platform_details, details)
