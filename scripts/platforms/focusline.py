"""Parser for Focusline race registration pages."""

from __future__ import annotations

import json
from datetime import datetime
from urllib.parse import urlparse

import requests

from config import REQUEST_HEADERS, REQUEST_RETRIES, REQUEST_RETRY_BACKOFF_SECONDS, REQUEST_TIMEOUT
from http_client import request_text

_session = requests.Session()
_session.headers.update(REQUEST_HEADERS)

from .common import compact_lines, find_label_value, generic_extract, merge_details, normalize_date


def _event_code_from_url(url: str) -> str:
    path = urlparse(url).path.strip("/")
    if not path:
        return ""
    return path.split("/", 1)[0]


def _status_from_label(label: str, opens_at: str, deadline: str) -> str:
    text = str(label or "").strip()
    if "報名中" in text:
        return "報名中"
    if "未開始" in text or "即將開放" in text:
        return "未開始"
    if "截止" in text or "額滿" in text:
        return "已截止"
    if opens_at and deadline:
        today = normalize_date(datetime.now().strftime("%Y-%m-%d"))
        if opens_at > today:
            return "未開始"
        if deadline < today:
            return "已截止"
        return "報名中"
    return ""


def _quota_text(value: object) -> str:
    if value in (None, ""):
        return ""
    try:
        count = int(value)
    except (TypeError, ValueError):
        return ""
    return f"{count:,}人"


def _load_api_details(url: str) -> dict:
    event_code = _event_code_from_url(url)
    if not event_code:
        return {}
    api_url = f"https://www.focusline.com.tw/api/act/{event_code}"
    session = _session
    try:
        text = request_text(
            session,
            api_url,
            timeout=REQUEST_TIMEOUT,
            retries=REQUEST_RETRIES,
            backoff_seconds=REQUEST_RETRY_BACKOFF_SECONDS,
        )
        payload = json.loads(text)
    except Exception:
        return {}

    register = payload.get("register") or {}
    opens_at = normalize_date(str(register.get("start", "")).split("T", 1)[0])
    deadline = normalize_date(str(register.get("end", "")).split("T", 1)[0])
    return {
        "venue": str(payload.get("location", "")).strip(),
        "start_location": str(payload.get("location", "")).strip(),
        "registration_opens_at": opens_at,
        "registration_deadline": deadline,
        "registration_status": _status_from_label(payload.get("displayLabel", ""), opens_at, deadline),
        "quota": _quota_text(payload.get("maxPeople")),
    }


def extract(html: str, race: dict, url: str) -> dict:
    lines = compact_lines(html)
    details = generic_extract(html, race, url)
    api_details = _load_api_details(url)
    platform_details = {
        "venue": find_label_value(lines, ("活動地點", "會場", "起跑地點")),
        "start_location": find_label_value(lines, ("活動地點", "會場", "起跑地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": find_label_value(lines, ("承辦單位", "承辦", "協辦單位", "協辦")),
    }
    return merge_details(platform_details, api_details, details)
