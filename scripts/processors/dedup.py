"""Deduplication logic: merge new races with existing database."""

import json
import logging
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

logger = logging.getLogger(__name__)


def _compact_text(value: str) -> str:
    return " ".join(str(value or "").split()).strip()


def _normalize_url(value: str) -> str:
    raw = _compact_text(value)
    if not raw:
        return ""
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return raw
    if not parsed.scheme or not parsed.netloc:
        return raw

    query_items = [
        (key, item_value)
        for key, item_value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in {"subtitle", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"}
    ]
    query = urlencode(sorted(query_items), doseq=True)
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip("/"), query, ""))


def _non_empty_count(race: dict) -> int:
    return sum(1 for value in race.values() if value not in ("", [], {}, None))


def _race_score(race: dict) -> int:
    return _non_empty_count(race) + len(_compact_text(race.get("race_name", "")))


def _dedup_key(race: dict) -> str:
    """Stable key for deduplication: shared event URLs plus date."""
    date = _compact_text(race.get("race_date", ""))
    county = _compact_text(race.get("race_county", ""))
    distances = sorted({
        _compact_text(distance)
        for distance in (race.get("distances") or [])
        if _compact_text(distance)
    })
    urls = [
        _normalize_url(race.get("official_event_url", "")),
        _normalize_url(race.get("detail_url", "")),
        _normalize_url(race.get("registration_link", "")),
        _normalize_url(race.get("source_registration_link", "")),
    ]
    url_key = "||".join(sorted({url for url in urls if url}))
    if url_key:
        return "||".join([date, county, ",".join(distances), url_key])

    name = _compact_text(race.get("race_name", ""))
    return f"{name}||{date}"


def _merge_race_records(preferred: dict, other: dict) -> dict:
    base = preferred if _race_score(preferred) >= _race_score(other) else other
    extra = other if base is preferred else preferred
    merged = dict(base)

    for field, value in extra.items():
        if field == "race_name":
            continue
        if merged.get(field) in ("", [], {}, None) and value not in ("", [], {}, None):
            merged[field] = value

    preferred_name = _compact_text(preferred.get("race_name", ""))
    other_name = _compact_text(other.get("race_name", ""))
    if preferred_name and other_name:
        merged["race_name"] = preferred_name if len(preferred_name) >= len(other_name) else other_name
    return merged


def load_existing(db_path: Path) -> dict[str, dict]:
    """Load existing race DB keyed by dedup key."""
    if not db_path.exists():
        return {}
    try:
        with db_path.open(encoding="utf-8") as f:
            records = json.load(f)
        existing: dict[str, dict] = {}
        for race in records:
            key = _dedup_key(race)
            if key in existing:
                existing[key] = _merge_race_records(existing[key], race)
            else:
                existing[key] = race
        return existing
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
            race["first_seen_at"] = race.get("first_seen_at") or race.get("scraped_at", "")[:10]
            merged[key] = race
            added += 1
        else:
            # Keep most recent scraped_at, update status/link if changed
            old = _merge_race_records(merged[key], race)
            if race.get("registration_status") != old.get("registration_status"):
                old["registration_status"] = race["registration_status"]
                updated += 1
            for field in (
                "registration_link",
                "official_event_url",
                "registration_note",
                "registration_opens_at",
                "registration_deadline",
                "venue",
                "start_location",
                "organizer",
                "co_organizer",
                "fees",
                "quota",
                "verified_at",
                "verification_note",
                "source_platform",
                "is_official_direct",
                "source_registration_link",
                "social_links",
                "facebook_search_url",
            ):
                if race.get(field, "") != old.get(field, ""):
                    old[field] = race.get(field, "")
                    updated += 1
            old["scraped_at"] = race["scraped_at"]
            old["first_seen_at"] = old.get("first_seen_at") or race.get("first_seen_at") or race.get("scraped_at", "")[:10]
            merged[key] = old

    result = sorted(merged.values(), key=lambda r: r.get("race_date", ""))
    return result, added, updated


def save(db_path: Path, races: list[dict]) -> None:
    """Save races to JSON database file."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with db_path.open("w", encoding="utf-8") as f:
        json.dump(races, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved {len(races)} races to {db_path}")
