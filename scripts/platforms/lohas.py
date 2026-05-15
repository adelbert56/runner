"""Parser for Lohas 樂活報名網 official event pages."""

from __future__ import annotations

from .common import (
    collect_between,
    compact_lines,
    find_label_value,
    first_fee_text,
    first_quota_text,
    generic_extract,
    merge_details,
)


def extract(html: str, race: dict, url: str) -> dict:
    lines = compact_lines(html)
    details = generic_extract(html, race)

    fee_block = " ".join(collect_between(lines, ("報名費用", "費用"), ("晶片押金", "報名資訊", "開放名額", "活動資訊")))
    quota_block = " ".join(collect_between(lines, ("開放名額", "限制名額", "名額"), ("報名資格", "活動資訊", "報名費用")))
    deposit_block = " ".join(collect_between(lines, ("晶片押金",), ("報名資訊", "開放名額", "活動資訊")))
    fees = "；".join(value for value in (first_fee_text(fee_block), f"晶片押金 {first_fee_text(deposit_block)}" if first_fee_text(deposit_block) else "") if value)

    platform_details = {
        "venue": find_label_value(lines, ("活動地點", "會場地點", "起跑地點")),
        "start_location": find_label_value(lines, ("活動地點", "會場地點", "起跑地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": find_label_value(lines, ("承辦單位", "承辦")),
        "fees": fees,
        "quota": first_quota_text(quota_block),
    }

    return merge_details(platform_details, details)
