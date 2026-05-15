"""Parser for JoinNow event pages."""

from __future__ import annotations

from .common import generic_extract


def extract(html: str, race: dict, url: str) -> dict:
    return generic_extract(html, race)

