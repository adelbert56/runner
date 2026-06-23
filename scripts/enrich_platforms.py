"""Enrich race records from official registration/event platforms.

This script is intentionally conservative: it only fills empty fields unless a
page clearly says a race is cancelled. Existing manual overrides keep priority.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Callable

import requests

from config import (
    REQUEST_HEADERS,
    REQUEST_RETRIES,
    REQUEST_RETRY_BACKOFF_SECONDS,
    REQUEST_TIMEOUT,
    ROOT_DIR,
    SCRAPE_STATUS_JSON,
)
from http_client import request_text
from platforms import baoming, ctrun, eventgo, focusline, irunner, joinnow, lohas
from platforms.common import generic_extract, has_text, host_of, is_generic_registration_link

logger = logging.getLogger("enrich_platforms")

RACE_DB_JSON = ROOT_DIR / "runner" / "賽事" / "賽事資料庫.json"
SITE_RACE_JSON = ROOT_DIR / "site" / "data" / "races.json"
REPORT_MD = ROOT_DIR / "runner" / "賽事" / "平台爬蟲覆蓋報告.md"

TODAY = datetime.now().strftime("%Y-%m-%d")
ENRICH_FIELDS = (
    "registration_link",
    "registration_opens_at",
    "registration_deadline",
    "cancellation_notice",
    "cancellation_notice_url",
    "venue",
    "start_location",
    "organizer",
    "co_organizer",
    "fees",
    "quota",
    "start_times",
    "registration_status",
    "registration_note",
)
SAFE_AUTO_FIELDS = {
    "registration_link",
    "registration_opens_at",
    "registration_deadline",
    "cancellation_notice",
    "cancellation_notice_url",
    "venue",
    "start_location",
    "organizer",
    "co_organizer",
    "fees",
    "quota",
    "start_times",
    "registration_status",
    "registration_note",
}

PlatformParser = Callable[[str, dict, str], dict]
EXPLICIT_CANCELLATION_PATTERN = re.compile(r"停辦|停賽|取消辦理|取消停辦|活動取消|賽事取消|取消賽事|取消活動")


def inferred_status_from_dates(race: dict) -> str:
    opens_at = str(race.get("registration_opens_at", "")).strip()
    deadline = str(race.get("registration_deadline", "")).strip()
    if opens_at and opens_at > TODAY:
        return "尚未開報"
    if deadline:
        return "已截止" if deadline < TODAY else "報名中"
    if opens_at and opens_at <= TODAY:
        return "報名中"
    return ""


def has_explicit_cancellation_notice(race: dict) -> bool:
    notice = str(race.get("cancellation_notice", "")).strip()
    return bool(notice and EXPLICIT_CANCELLATION_PATTERN.search(notice))


def biji_extract(html: str, race: dict, url: str) -> dict:
    return generic_extract(html, race)


PLATFORMS: list[tuple[str, tuple[str, ...], PlatformParser]] = [
    ("iRunner", ("irunner.biji.co",), irunner.extract),
    ("運動筆記", ("running.biji.co",), biji_extract),
    ("Lohas", ("lohasnet.tw",), lohas.extract),
    ("bao-ming", ("bao-ming.com",), baoming.extract),
    ("EventGo", ("eventgo.tw",), eventgo.extract),
    ("Focusline", ("focusline",), focusline.extract),
    ("CTRun", ("ctrun",), ctrun.extract),
    ("JoinNow", ("joinnow",), joinnow.extract),
]


def platform_for_url(url: str) -> tuple[str, PlatformParser] | tuple[str, None]:
    host = host_of(url)
    if not host:
        return "", None
    for platform, markers, parser in PLATFORMS:
        if any(marker in host for marker in markers):
            return platform, parser
    return "", None


def is_source_url(url: str) -> bool:
    return host_of(url).endswith("running.biji.co")


def has_official_registration_link(race: dict) -> bool:
    for field in ("registration_link", "official_event_url"):
        url = str(race.get(field, "")).strip()
        if has_text(url) and not is_source_url(url) and not is_generic_registration_link(url):
            return True
    return False


def race_key(race: dict) -> str:
    return f"{race.get('race_name', '').strip()}||{race.get('race_date', '').strip()}"


def candidate_urls(race: dict) -> list[str]:
    urls = []
    for field in ("official_event_url", "registration_link", "source_registration_link", "detail_url"):
        url = str(race.get(field, "")).strip()
        if url and url not in urls:
            urls.append(url)
    return urls


def load_races(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def save_races(path: Path, races: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{json.dumps(races, ensure_ascii=False, indent=2)}\n", encoding="utf-8")


def fetch_html(session: requests.Session, url: str) -> str:
    return request_text(
        session,
        url,
        timeout=REQUEST_TIMEOUT,
        retries=REQUEST_RETRIES,
        backoff_seconds=REQUEST_RETRY_BACKOFF_SECONDS,
    )


def should_replace(field: str, current: object, incoming: object, *, preferred: bool = False) -> bool:
    if not has_text(incoming):
        return False
    if field == "registration_link":
        current_text = str(current).strip()
        incoming_text = str(incoming).strip()
        if is_generic_registration_link(incoming_text):
            return False
        if not has_text(current_text):
            return True
        if is_generic_registration_link(current_text):
            return True
        return is_source_url(current_text) and not is_source_url(incoming_text)
    if field == "registration_status":
        incoming_text = str(incoming).strip()
        current_text = str(current).strip()
        unknown_statuses = {"", "未知", "待確認", "報名時間未定"}
        if current_text in unknown_statuses:
            return True
        return incoming_text != current_text
    if field == "start_times":
        current_quality = start_time_quality(current)
        incoming_quality = start_time_quality(incoming)
        if preferred and incoming_quality >= 10 and incoming_quality + 15 >= current_quality:
            return True
        if has_redundant_start_time_rows(current) and incoming_quality >= 20:
            return True
        if current_quality < 10:
            return incoming_quality > current_quality
        return incoming_quality >= current_quality + 10
    if field == "registration_note" and not has_text(current):
        return True
    return not has_text(current) or str(current).strip() in {"未知", "待確認", "報名時間未定"}


def start_time_quality(value: object) -> int:
    if not has_text(value):
        return 0
    if isinstance(value, dict):
        text = " ".join(f"{key} {item}" for key, item in value.items())
    elif isinstance(value, list):
        text = " ".join(str(item) for item in value)
    else:
        text = str(value)
    time_count = len(re.findall(r"([01]?\d|2[0-3])[:：][0-5]\d", text))
    distance_count = len(re.findall(r"\d+(?:\.\d+)?\s?(?:K|KM|公里|km)|半馬|全馬|挑戰組|休閒組|健走組", text, flags=re.IGNORECASE))
    start_bonus = 1 if any(keyword in text for keyword in ("起跑", "鳴槍", "出發")) else 0
    return time_count * 10 + min(distance_count, 8) + start_bonus


def has_redundant_start_time_rows(value: object) -> bool:
    if not has_text(value):
        return False
    rows = re.split(r"[、；;,\n]", str(value))
    groups_by_time: dict[str, list[str]] = {}
    for row in rows:
        time_match = re.search(r"([01]?\d|2[0-3])[:：][0-5]\d", row)
        if not time_match:
            continue
        time = time_match.group(0).replace("：", ":")
        group = row[:time_match.start()].replace("起跑", "").strip()
        groups_by_time.setdefault(time, []).append(group)

    generic_groups = ("挑戰組", "休閒組", "健走組", "健康組")
    for groups in groups_by_time.values():
        has_generic = any(group in generic_groups for group in groups)
        has_distance = any(re.search(r"\d+(?:\.\d+)?\s?(?:K|KM|公里|km)", group, flags=re.IGNORECASE) for group in groups)
        has_composite = any(any(label in group for label in generic_groups) and re.search(r"\d", group) for group in groups)
        if has_generic and has_distance and not has_composite:
            return True
    times_by_group: dict[str, set[str]] = {}
    for time, groups in groups_by_time.items():
        for group in groups:
            times_by_group.setdefault(group, set()).add(time)
    if any(group and len(times) > 1 for group, times in times_by_group.items()):
        return True
    return False


def enrich_race(race: dict, session: requests.Session, *, dry_run: bool = False) -> tuple[dict, list[str], list[str]]:
    updated = dict(race)
    changed: list[str] = []
    errors: list[str] = []
    seen_platforms: list[str] = []
    found_registration_dates = False
    found_cancellation_evidence = False

    for url in candidate_urls(race):
        platform, parser = platform_for_url(url)
        if not platform or parser is None:
            continue
        seen_platforms.append(platform)
        try:
            html = fetch_html(session, url)
            details = parser(html, updated, url)
        except requests.RequestException as error:
            errors.append(f"{platform}: {error}")
            continue
        except Exception as error:
            errors.append(f"{platform}: parse failed ({error})")
            continue

        if has_text(details.get("registration_opens_at")) or has_text(details.get("registration_deadline")):
            found_registration_dates = True
        if has_text(details.get("cancellation_notice")) or has_text(details.get("cancellation_notice_url")):
            found_cancellation_evidence = True

        for field in ENRICH_FIELDS:
            if field not in SAFE_AUTO_FIELDS:
                continue
            preferred = field == "start_times" and url == str(race.get("official_event_url", "")).strip()
            if should_replace(field, updated.get(field), details.get(field), preferred=preferred):
                updated[field] = details[field]
                changed.append(field)

        if has_text(url) and not has_text(updated.get("official_event_url")):
            updated["official_event_url"] = url
            changed.append("official_event_url")

        time.sleep(0.3)

    if seen_platforms:
        platform_text = "、".join(dict.fromkeys(seen_platforms))
        if updated.get("source_platform") != platform_text:
            updated["source_platform"] = platform_text
            changed.append("source_platform")

    official_direct = has_official_registration_link(updated)
    current_link = str(updated.get("registration_link", "")).strip()
    if current_link and is_generic_registration_link(current_link):
        updated["registration_link"] = ""
        changed.append("registration_link")
    if updated.get("is_official_direct") != official_direct:
        updated["is_official_direct"] = official_direct
        changed.append("is_official_direct")

    if not found_cancellation_evidence:
        for field in ("cancellation_notice", "cancellation_notice_url"):
            if has_text(updated.get(field)):
                updated[field] = ""
                changed.append(field)

    if has_text(updated.get("cancellation_notice")) and not has_explicit_cancellation_notice(updated):
        updated["cancellation_notice"] = ""
        changed.append("cancellation_notice")
        if has_text(updated.get("cancellation_notice_url")):
            updated["cancellation_notice_url"] = ""
            changed.append("cancellation_notice_url")

    cancellation_notice = str(updated.get("cancellation_notice", "")).strip()
    cancellation_notice_url = str(updated.get("cancellation_notice_url", "")).strip()
    has_cancellation_evidence = has_explicit_cancellation_notice(updated) and has_text(cancellation_notice_url)

    status_text = str(updated.get("registration_status", "")).strip()
    if has_cancellation_evidence and status_text != "停辦":
        updated["registration_status"] = "停辦"
        changed.append("registration_status")
        status_text = "停辦"

    if status_text == "停辦" and not has_cancellation_evidence:
        has_live_evidence = official_direct or found_registration_dates
        source_platform_text = str(updated.get("source_platform", "")).strip()
        source_only_biji = source_platform_text == "運動筆記"
        inferred_status = inferred_status_from_dates(updated)
        replacement_status = inferred_status or ("待確認" if has_live_evidence or source_only_biji else "")
        if replacement_status and replacement_status != status_text:
            updated["registration_status"] = replacement_status
            changed.append("registration_status")
            status_text = replacement_status
    if status_text == "停辦" and has_cancellation_evidence and not found_registration_dates:
        for field in ("registration_opens_at", "registration_deadline"):
            if has_text(updated.get(field)):
                updated[field] = ""
                changed.append(field)

    if not has_cancellation_evidence:
        inferred_status = inferred_status_from_dates(updated)
        if inferred_status and inferred_status != status_text:
            updated["registration_status"] = inferred_status
            changed.append("registration_status")

    if changed:
        updated["verified_at"] = TODAY
        updated["verification_note"] = f"平台爬蟲自動查證：{updated.get('source_platform', '')}"

    return (race if dry_run else updated), list(dict.fromkeys(changed)), errors


def write_report(stats: dict) -> None:
    lines = [
        "# 平台爬蟲覆蓋報告",
        "",
        f"產生日期：{TODAY}",
        "",
        "## 總覽",
        "",
        f"- 掃描賽事：{stats['total']}",
        f"- 命中支援平台：{stats['matched']}",
        f"- 有欄位更新：{stats['changed_races']}",
        f"- 更新欄位數：{stats['changed_fields']}",
        f"- 抓取或解析錯誤：{len(stats['errors'])}",
        "",
        "## 平台命中",
        "",
        "| 平台 | 筆數 |",
        "| --- | ---: |",
    ]
    for platform, count in stats["platforms"].most_common():
        lines.append(f"| {platform} | {count} |")

    lines.extend(["", "## 錯誤清單", ""])
    if stats["errors"]:
        lines.extend(["| 賽事 | 錯誤 |", "| --- | --- |"])
        for key, error in stats["errors"][:30]:
            lines.append(f"| {key} | {error.replace('|', '／')} |")
    else:
        lines.append("目前沒有錯誤。")

    REPORT_MD.write_text(f"{chr(10).join(lines)}\n", encoding="utf-8")


def update_scrape_status_with_enrichment_errors(stats: dict) -> None:
    """Surface platform enrichment failures to the workflow error reporter."""
    if not stats["errors"]:
        return

    status = {}
    if SCRAPE_STATUS_JSON.exists():
        try:
            status = json.loads(SCRAPE_STATUS_JSON.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            status = {}

    enrichment_errors = [f"{key}: {error}" for key, error in stats["errors"][:30]]
    existing_errors = status.get("errors")
    if not isinstance(existing_errors, list):
        existing_errors = []

    status.update(
        {
            "enrichment_errors": enrichment_errors,
            "has_enrichment_errors": True,
            "has_errors": True,
            "errors": list(dict.fromkeys([*existing_errors, *enrichment_errors])),
        }
    )
    SCRAPE_STATUS_JSON.parent.mkdir(parents=True, exist_ok=True)
    SCRAPE_STATUS_JSON.write_text(f"{json.dumps(status, ensure_ascii=False, indent=2)}\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich races from official registration platforms.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and parse without writing JSON files")
    args = parser.parse_args()

    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)
    races = load_races(RACE_DB_JSON)
    stats = {
        "total": len(races),
        "matched": 0,
        "changed_races": 0,
        "changed_fields": 0,
        "platforms": Counter(),
        "errors": [],
    }

    next_races: list[dict] = []
    for race in races:
        platforms = [platform_for_url(url)[0] for url in candidate_urls(race)]
        platforms = [platform for platform in platforms if platform]
        if platforms:
            stats["matched"] += 1
            stats["platforms"].update(dict.fromkeys(platforms).keys())

        enriched, changed, errors = enrich_race(race, session, dry_run=args.dry_run)
        next_races.append(enriched)
        if changed:
            stats["changed_races"] += 1
            stats["changed_fields"] += len(changed)
            logger.info("%s: %s", race_key(race), ", ".join(changed))
        for error in errors:
            stats["errors"].append((race_key(race), error))

    if not args.dry_run:
        save_races(RACE_DB_JSON, next_races)
        save_races(SITE_RACE_JSON, next_races)
        write_report(stats)
        update_scrape_status_with_enrichment_errors(stats)

    print(f"Races scanned: {stats['total']}")
    print(f"Supported platform hits: {stats['matched']}")
    print(f"Races changed: {stats['changed_races']}")
    print(f"Fields changed: {stats['changed_fields']}")
    print(f"Errors: {len(stats['errors'])}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    main()
