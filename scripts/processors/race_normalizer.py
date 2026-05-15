"""Normalize raw scraped race entries to a consistent schema."""

import re
import uuid
from datetime import datetime, timezone


_COUNTY_ALIASES = {
    "台中市": "臺中市",
    "南投县": "南投縣",
    "彰化县": "彰化縣",
    "苗栗县": "苗栗縣",
}

_MONTH_SORT = {
    "01": 1, "02": 2, "03": 3, "04": 4, "05": 5, "06": 6,
    "07": 7, "08": 8, "09": 9, "10": 10, "11": 11, "12": 12,
}


def _normalize_county(raw: str) -> str:
    return _COUNTY_ALIASES.get(raw.strip(), raw.strip())


def _normalize_distance(raw: str) -> str:
    """Standardize distance strings: '21K' → '21km', '42.2km' → '42.2km'."""
    cleaned = re.sub(r"\s+", "", raw).lower()
    m = re.match(r"(\d+(?:\.\d+)?)k(?:m)?", cleaned)
    if m:
        val = float(m.group(1))
        if val == int(val):
            return f"{int(val)}km"
        return f"{val}km"
    return raw.strip()


def _infer_reg_status(status_text: str, race_date: str) -> str:
    """Map free-form status text to one of: 報名中 / 已截止 / 未開始 / 未知."""
    if not status_text and race_date:
        try:
            rd = datetime.strptime(race_date, "%Y-%m-%d")
            now = datetime.now()
            if rd < now:
                return "已截止"
            return "未知"
        except ValueError:
            pass
    text = status_text.lower()
    if any(k in text for k in ("截止", "closed", "結束", "已截")):
        return "已截止"
    if any(k in text for k in ("報名中", "開放", "open")):
        return "報名中"
    if any(k in text for k in ("未開", "未开", "not yet")):
        return "未開始"
    return status_text or "未知"


def normalize(raw: dict) -> dict:
    """Normalize a single raw race dict."""
    county = _normalize_county(raw.get("race_county", ""))
    distances = [_normalize_distance(d) for d in raw.get("distances", [])]
    status = _infer_reg_status(
        raw.get("registration_status", ""),
        raw.get("race_date", ""),
    )
    return {
        "race_id": str(uuid.uuid4()),
        "race_name": raw.get("race_name", "").strip(),
        "race_date": raw.get("race_date", ""),
        "race_county": county,
        "distances": distances or ["未知"],
        "difficulty": raw.get("difficulty", "初級"),
        "registration_status": status,
        "registration_link": raw.get("registration_link", ""),
        "registration_note": raw.get("registration_note", ""),
        "registration_opens_at": raw.get("registration_opens_at", ""),
        "registration_deadline": raw.get("registration_deadline", ""),
        "venue": raw.get("venue", ""),
        "start_location": raw.get("start_location", ""),
        "organizer": raw.get("organizer", ""),
        "fees": raw.get("fees", ""),
        "quota": raw.get("quota", ""),
        "verified_at": raw.get("verified_at", ""),
        "verification_note": raw.get("verification_note", ""),
        "source_registration_link": raw.get("source_registration_link", ""),
        "social_links": raw.get("social_links", []),
        "facebook_search_url": raw.get("facebook_search_url", ""),
        "detail_url": raw.get("detail_url", ""),
        "source": raw.get("source", ""),
        "source_url": raw.get("source_url", ""),
        "scraped_at": datetime.now(tz=timezone.utc).isoformat(),
    }


def normalize_all(raw_list: list[dict]) -> list[dict]:
    normalized = []
    for raw in raw_list:
        if not raw.get("race_name") or not raw.get("race_date"):
            continue
        normalized.append(normalize(raw))
    return sorted(normalized, key=lambda r: r["race_date"])
