"""Parser for CTRun event pages."""

from __future__ import annotations

import re

from .common import compact_lines, compact_text, generic_extract, merge_details, normalize_date


def _extract_registration_dates(lines: list[str], race_date: str) -> tuple[str, str]:
    default_year = race_date[:4] if race_date else "2026"
    for index, line in enumerate(lines):
        if "報名時間" not in line:
            continue

        window = " ".join(lines[index:index + 4])
        match = re.search(
            r"(\d{4}[/-]\d{1,2}[/-]\d{1,2}).{0,16}?(?:~|～|-|至|迄).{0,16}?(\d{4}[/-]\d{1,2}[/-]\d{1,2})",
            compact_text(window),
        )
        if match:
            return normalize_date(match.group(1), default_year), normalize_date(match.group(2), default_year)
    return "", ""


def extract(html: str, race: dict, url: str) -> dict:
    lines = compact_lines(html)
    details = generic_extract(html, race, url)
    opens_at, deadline = _extract_registration_dates(lines, race.get("race_date", ""))
    return merge_details(
        {
            "registration_opens_at": opens_at,
            "registration_deadline": deadline,
        },
        details,
    )
