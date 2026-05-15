"""Apply manually verified race fields after scraping."""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _key(race: dict) -> str:
    return f"{race.get('race_name', '').strip()}||{race.get('race_date', '').strip()}"


def load_overrides(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    try:
        with path.open(encoding="utf-8") as f:
            rows = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Could not load manual overrides: {e}")
        return {}

    overrides: dict[str, dict] = {}
    for row in rows:
        race_name = row.get("race_name", "").strip()
        race_date = row.get("race_date", "").strip()
        if not race_name or not race_date:
            continue
        fields = {k: v for k, v in row.items() if k not in {"race_name", "race_date"}}
        overrides[f"{race_name}||{race_date}"] = fields
    return overrides


def apply_overrides(races: list[dict], overrides: dict[str, dict]) -> int:
    updated = 0
    for race in races:
        fields = overrides.get(_key(race))
        if not fields:
            continue
        for field, value in fields.items():
            if value not in (None, "") and race.get(field) != value:
                race[field] = value
                updated += 1
    if updated:
        logger.info(f"Applied {updated} manually verified race fields")
    return updated
