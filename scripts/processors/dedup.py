"""Deduplication logic: merge new races with existing database."""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _dedup_key(race: dict) -> str:
    """Stable key for deduplication: name + date."""
    name = race.get("race_name", "").strip()
    date = race.get("race_date", "").strip()
    return f"{name}||{date}"


def load_existing(db_path: Path) -> dict[str, dict]:
    """Load existing race DB keyed by dedup key."""
    if not db_path.exists():
        return {}
    try:
        with db_path.open(encoding="utf-8") as f:
            records = json.load(f)
        return {_dedup_key(r): r for r in records}
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Could not load existing DB: {e}")
        return {}


def merge(existing: dict[str, dict], new_races: list[dict]) -> tuple[list[dict], int, int]:
    """
    Merge new races into existing.
    Returns (merged_list, added_count, updated_count).
    """
    added = 0
    updated = 0
    merged = dict(existing)  # copy

    for race in new_races:
        key = _dedup_key(race)
        if key not in merged:
            stale_key = next(
                (
                    old_key
                    for old_key, old in merged.items()
                    if old.get("race_name", "").strip() == race.get("race_name", "").strip()
                    and old.get("source") == race.get("source")
                    and old.get("detail_url") == race.get("detail_url")
                ),
                "",
            )
            if stale_key:
                del merged[stale_key]
                updated += 1
            merged[key] = race
            added += 1
        else:
            # Keep most recent scraped_at, update status/link if changed
            old = merged[key]
            if race.get("registration_status") != old.get("registration_status"):
                old["registration_status"] = race["registration_status"]
                updated += 1
            for field in (
                "registration_link",
                "registration_note",
                "registration_opens_at",
                "registration_deadline",
                "venue",
                "start_location",
                "organizer",
                "fees",
                "quota",
                "verified_at",
                "verification_note",
                "source_registration_link",
                "social_links",
                "facebook_search_url",
            ):
                if race.get(field, "") != old.get(field, ""):
                    old[field] = race.get(field, "")
                    updated += 1
            old["scraped_at"] = race["scraped_at"]
            merged[key] = old

    result = sorted(merged.values(), key=lambda r: r.get("race_date", ""))
    return result, added, updated


def save(db_path: Path, races: list[dict]) -> None:
    """Save races to JSON database file."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with db_path.open("w", encoding="utf-8") as f:
        json.dump(races, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved {len(races)} races to {db_path}")
