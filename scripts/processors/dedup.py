"""Deduplication logic: merge new races with existing database."""

import json
import logging
import re
from difflib import SequenceMatcher
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


def _normalize_name(value: str) -> str:
    text = _compact_text(value).replace("台", "臺")
    text = re.sub(r"^(?:20\d{2}|1\d{2})", "", text)
    text = re.sub(r"[\s\-–—_/()（）【】\[\]．.、，,:：'\"「」『』]+", "", text)
    return text.lower()


def _url_tokens(value: str) -> set[str]:
    normalized = _normalize_url(value)
    if not normalized:
        return set()

    tokens = {normalized}
    try:
        parsed = urlsplit(normalized)
    except ValueError:
        return tokens

    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    cid = query.get("cid", "").strip()
    if cid:
        tokens.add(f"cid:{cid}")

    host = parsed.netloc.lower()
    path = parsed.path.strip("/")
    if host == "irunner.biji.co" and path:
        tokens.add(f"irunner:{path.split('/', 1)[0].lower()}")

    if host.endswith("ctrun.com.tw"):
        event_main_id = query.get("EventMain_ID", "").strip()
        if event_main_id:
            tokens.add(f"ctrun-event:{event_main_id}")

    if host.endswith("lohasnet.tw"):
        signup_match = re.search(r"/signup/(\d+)", parsed.path, flags=re.IGNORECASE)
        if signup_match:
            tokens.add(f"lohas-signup:{signup_match.group(1)}")
        slug = path.lower()
        if slug and not slug.startswith("signup"):
            tokens.add(f"lohas-slug:{slug}")

    return tokens


def _identity_tokens(race: dict) -> set[str]:
    tokens: set[str] = set()
    for field in ("official_event_url", "detail_url", "registration_link", "source_registration_link"):
        tokens.update(_url_tokens(race.get(field, "")))
    return tokens


def _distance_tokens(race: dict) -> set[str]:
    tokens: set[str] = set()
    for value in race.get("distances", []) or []:
        text = _compact_text(value).lower()
        if not text:
            continue
        tokens.add(text)
        number_match = re.search(r"(\d+(?:\.\d+)?)", text)
        if number_match:
            tokens.add(number_match.group(1))
    return tokens


def _non_empty_count(race: dict) -> int:
    return sum(1 for value in race.values() if value not in ("", [], {}, None))


def _source_score(race: dict) -> int:
    score = 0
    registration_link = _compact_text(race.get("registration_link", ""))
    official_event_url = _compact_text(race.get("official_event_url", ""))
    detail_url = _compact_text(race.get("detail_url", ""))
    if registration_link and "google.com/calendar/event" not in registration_link:
        score += 3
        if "running.biji.co" not in registration_link:
            score += 2
    if official_event_url and "running.biji.co" not in official_event_url:
        score += 2
    if detail_url:
        score += 1
    if race.get("is_official_direct"):
        score += 2
    return score


def _race_score(race: dict) -> int:
    return _non_empty_count(race) + len(_compact_text(race.get("race_name", ""))) + _source_score(race)


def _status_rank(value: str) -> int:
    text = _compact_text(value)
    if any(keyword in text for keyword in ("停辦", "停賽", "取消")):
        return 4
    if "已截止" in text:
        return 3
    if "報名中" in text:
        return 2
    if "待確認" in text or "未定" in text:
        return 1
    return 0


def _url_score(field: str, value: str) -> int:
    url = _compact_text(value)
    if not url:
        return 0
    score = 1
    if field == "registration_link":
        if "google.com/calendar/event" in url:
            score -= 5
        if "running.biji.co" not in url:
            score += 4
        if any(keyword in url.lower() for keyword in ("signup", "register", "entry", "event")):
            score += 2
    if field in {"official_event_url", "detail_url", "source_registration_link"} and "cid:" in " ".join(_url_tokens(url)):
        score += 2
    return score + len(url) // 40


def _merge_unique_list(primary: object, secondary: object) -> list[str]:
    merged: list[str] = []
    for source in (primary or [], secondary or []):
        for item in source:
            text = _compact_text(item)
            if text and text not in merged:
                merged.append(text)
    return merged


def _distance_km(value: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)", value)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def _merge_distances(primary: object, secondary: object) -> list[str]:
    """Union distances but collapse near-duplicates (e.g. "42km" + "42.195km"
    from two scrape passes of the same race). Without this, distances only
    ever grows and drifts out of sync with start_times/fees, which get
    whole-field-replaced rather than merged."""
    merged = _merge_unique_list(primary, secondary)
    kept: list[tuple[str, float]] = []
    for text in merged:
        km = _distance_km(text)
        if km is None:
            kept.append((text, float("nan")))
            continue
        collided_index = None
        for index, (_, other_km) in enumerate(kept):
            if other_km == other_km and abs(other_km - km) <= 0.3:  # not NaN and close
                collided_index = index
                break
        if collided_index is None:
            kept.append((text, km))
            continue
        # Prefer the more precise / decimal form (e.g. "42.195km" over "42km").
        existing_text, existing_km = kept[collided_index]
        if "." in text and "." not in existing_text:
            kept[collided_index] = (text, km)
    return [text for text, _ in kept]


def _prefer_text(current: object, incoming: object, *, prefer_incoming: bool = False) -> object:
    current_text = _compact_text(current)
    incoming_text = _compact_text(incoming)
    if not incoming_text:
        return current
    if not current_text:
        return incoming
    if prefer_incoming:
        return incoming
    return incoming if len(incoming_text) > len(current_text) else current


def _field_quality_score(field: str, value: object) -> int:
    text = _compact_text(value)
    if not text:
        return 0
    if field == "fees":
        score = text.count("元") * 5 + text.count("$") * 4 + text.count("K") + text.count("km")
        if re.search(r"202\d", text):
            score -= 4
        return score + min(len(text), 80) // 20
    if field == "quota":
        score = text.count("人") * 6 + text.count("K") + text.count("km")
        if "未標示" in text:
            score -= 2
        return score + min(len(text), 80) // 20
    if field == "start_times":
        score = len(re.findall(r"([01]?\d|2[0-3])[:：][0-5]\d", text)) * 8
        score += text.count("起跑") * 2 + text.count("鳴槍") * 2
        return score + min(len(text), 120) // 30
    return 0


def _prefer_field_value(field: str, current: object, incoming: object) -> object:
    if field in {"registration_link", "official_event_url", "detail_url", "source_registration_link"}:
        return incoming if _url_score(field, str(incoming)) > _url_score(field, str(current)) else current
    if field == "registration_status":
        return incoming if _status_rank(str(incoming)) > _status_rank(str(current)) else current
    if field in {"fees", "quota", "start_times"}:
        return incoming if _field_quality_score(field, incoming) > _field_quality_score(field, current) else current
    if field in {"social_links", "distances"}:
        return _merge_unique_list(current, incoming)
    if field == "source_platform":
        return "、".join(_merge_unique_list(str(current or "").split("、"), str(incoming or "").split("、")))
    if field == "is_official_direct":
        return bool(current) or bool(incoming)
    return _prefer_text(current, incoming)


def _is_unconfirmed_status(value: str) -> bool:
    text = _compact_text(value)
    return any(keyword in text for keyword in ("待確認", "未定", "未知", "TBD"))


def _same_event(left: dict, right: dict) -> bool:
    # Same source page (cid/signup id/...) means same event even if the
    # organizer corrected the date between scrapes — check this before the
    # date gate, otherwise a date correction spawns a permanent duplicate.
    if _identity_tokens(left) & _identity_tokens(right):
        return True

    left_county = _compact_text(left.get("race_county", ""))
    right_county = _compact_text(right.get("race_county", ""))
    left_date = _compact_text(left.get("race_date", ""))
    right_date = _compact_text(right.get("race_date", ""))

    if left_date != right_date:
        # Neither side has a reliable date (both are unconfirmed/placeholder
        # scrapes with no shared identity token) — an exact name+county match
        # with overlapping distances is still almost certainly the same
        # event, just scraped before the real date was published anywhere.
        exact_name_match = (
            left_county
            and left_county == right_county
            and _normalize_name(left.get("race_name", "")) == _normalize_name(right.get("race_name", ""))
        )
        if not exact_name_match:
            return False
        if not (_is_unconfirmed_status(left.get("registration_status", "")) or _is_unconfirmed_status(right.get("registration_status", ""))):
            return False
        left_distances = _distance_tokens(left)
        right_distances = _distance_tokens(right)
        return bool(left_distances) and left_distances == right_distances

    if not left_date or not left_county or left_county != right_county:
        return False

    left_name = _normalize_name(left.get("race_name", ""))
    right_name = _normalize_name(right.get("race_name", ""))
    if not left_name or not right_name:
        return False
    if left_name == right_name:
        return True

    if left_name in right_name or right_name in left_name:
        left_distances = _distance_tokens(left)
        right_distances = _distance_tokens(right)
        if not left_distances or not right_distances:
            return True
        if left_distances == right_distances:
            return True
        overlap = len(left_distances & right_distances)
        if overlap >= min(len(left_distances), len(right_distances)):
            return True

    similarity = SequenceMatcher(a=left_name, b=right_name).ratio()
    return similarity >= 0.8


def _primary_key(race: dict) -> str:
    """Stable key for deduplication after fuzzy matching."""
    date = _compact_text(race.get("race_date", ""))
    county = _compact_text(race.get("race_county", ""))
    name = _normalize_name(race.get("race_name", ""))
    return f"{date}||{county}||{name}"


def _merge_race_records(preferred: dict, other: dict) -> dict:
    base = preferred if _race_score(preferred) >= _race_score(other) else other
    extra = other if base is preferred else preferred
    merged = dict(base)

    prefer_extra_fields = _source_score(extra) > _source_score(base)

    merged["distances"] = _merge_distances(base.get("distances"), extra.get("distances"))
    merged["social_links"] = _merge_unique_list(base.get("social_links"), extra.get("social_links"))
    merged["source_platform"] = "、".join(_merge_unique_list(str(base.get("source_platform", "")).split("、"), str(extra.get("source_platform", "")).split("、")))
    merged["is_official_direct"] = bool(base.get("is_official_direct")) or bool(extra.get("is_official_direct"))

    if _status_rank(extra.get("registration_status", "")) > _status_rank(base.get("registration_status", "")):
        merged["registration_status"] = extra.get("registration_status", "")

    for field in ("registration_link", "official_event_url", "detail_url", "source_registration_link"):
        current = merged.get(field, "")
        incoming = extra.get(field, "")
        if _url_score(field, str(incoming)) > _url_score(field, str(current)):
            merged[field] = incoming

    for field in (
        "registration_opens_at",
        "registration_deadline",
        "venue",
        "start_location",
        "organizer",
        "co_organizer",
        "fees",
        "quota",
        "start_times",
        "registration_note",
        "verified_at",
        "verification_note",
    ):
        merged[field] = _prefer_text(merged.get(field), extra.get(field), prefer_incoming=prefer_extra_fields)

    for field in ("source", "source_url", "facebook_search_url"):
        merged[field] = _prefer_text(merged.get(field), extra.get(field))

    for field in ("scraped_at", "first_seen_at"):
        left = _compact_text(base.get(field, ""))
        right = _compact_text(extra.get(field, ""))
        if not left:
            merged[field] = right
        elif not right:
            merged[field] = left
        elif field == "first_seen_at":
            merged[field] = min(left, right)
        else:
            merged[field] = max(left, right)

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
            key = _find_match_key(existing, race)
            if key is None:
                key = _unique_key(existing, race)
                existing[key] = race
            else:
                existing[key] = _merge_race_records(existing[key], race)
        return existing
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Could not load existing DB: {e}")
        return {}


def _find_match_key(records: dict[str, dict], race: dict) -> str | None:
    direct_key = _primary_key(race)
    if direct_key in records and _same_event(records[direct_key], race):
        return direct_key
    for key, existing in records.items():
        if _same_event(existing, race):
            return key
    return None


def _unique_key(records: dict[str, dict], race: dict) -> str:
    key = _primary_key(race)
    if key not in records:
        return key
    suffix = _compact_text(race.get("race_id", "")) or str(len(records) + 1)
    return f"{key}||{suffix}"


def merge(existing: dict[str, dict], new_races: list[dict]) -> tuple[list[dict], int, int]:
    """
    Merge new races into existing.
    Returns (merged_list, added_count, updated_count).
    """
    added = 0
    updated = 0
    merged = dict(existing)  # copy

    for race in new_races:
        key = _find_match_key(merged, race)
        if key is None:
            race["first_seen_at"] = race.get("first_seen_at") or race.get("scraped_at", "")[:10]
            merged[_unique_key(merged, race)] = race
            added += 1
        else:
            # Keep most recent scraped_at, update status/link if changed
            old = _merge_race_records(merged[key], race)
            preferred_status = _prefer_field_value("registration_status", old.get("registration_status", ""), race.get("registration_status", ""))
            if preferred_status != old.get("registration_status"):
                old["registration_status"] = preferred_status
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
                preferred = _prefer_field_value(field, old.get(field, ""), race.get(field, ""))
                if preferred != old.get(field, ""):
                    old[field] = preferred
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
