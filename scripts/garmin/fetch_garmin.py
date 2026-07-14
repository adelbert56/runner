"""Fetch running activities from Garmin Connect into a local JSON file.

Usage:
    uv run python scripts/garmin/fetch_garmin.py            # last 90 days
    uv run python scripts/garmin/fetch_garmin.py --days 365

First run prompts for Garmin Connect email/password (and MFA code if
enabled). Tokens are stored in ~/.garminconnect and reused afterwards,
so credentials are only entered once.

Output: runner/訓練/訓練紀錄.json (gitignored — personal health data,
never committed). Existing records are merged by activityId, so runs
are incremental.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from datetime import date, timedelta
from getpass import getpass
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "runner" / "訓練" / "訓練紀錄.json"
TOKEN_DIR = os.environ.get("GARMIN_TOKENSTORE", "~/.garminconnect")
TOKEN_FILE = "garmin_tokens.json"

RUNNING_TYPE_KEYS = {
    "running",
    "trail_running",
    "track_running",
    "treadmill_running",
    "street_running",
    "indoor_running",
    "virtual_run",
    "ultra_run",
    "obstacle_run",
}


def hydrate_tokenstore_from_env() -> None:
    """Restore a GitHub Secret token into the runner-local token directory."""
    raw_secret = os.environ.get("GARMIN_TOKENSTORE_B64", "").strip()
    if not raw_secret:
        return
    try:
        decoded = base64.b64decode("".join(raw_secret.split()), validate=True)
        json.loads(decoded.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        # Allow a raw JSON token secret too. This keeps the cloud workflow
        # resilient when GitHub Secrets is populated directly from the file.
        try:
            decoded = raw_secret.encode("utf-8")
            json.loads(raw_secret)
        except json.JSONDecodeError as exc:
            raise RuntimeError("GARMIN_TOKENSTORE_B64 is not a valid base64 or JSON Garmin token file") from exc
    token_path = Path(TOKEN_DIR).expanduser()
    token_path.mkdir(parents=True, exist_ok=True)
    (token_path / TOKEN_FILE).write_bytes(decoded)


def login(interactive: bool = True) -> Garmin:
    if Path(TOKEN_DIR).expanduser().exists():
        try:
            client = Garmin()
            client.login(TOKEN_DIR)
            return client
        except (
            GarminConnectAuthenticationError,
            GarminConnectConnectionError,
        ) as exc:
            print(f"既有 token 失效（{exc}），需重新登入", file=sys.stderr)

    if not interactive:
        raise RuntimeError("Garmin token is unavailable or expired; run the sync once interactively to sign in again.")

    print("尚無登入 token，請輸入 Garmin Connect 帳號（只需一次）")
    email = input("Email: ").strip()
    password = getpass("Password: ")
    client = Garmin(
        email=email,
        password=password,
        prompt_mfa=lambda: input("MFA code: ").strip(),
    )
    # login() dumps tokens to TOKEN_DIR automatically on success
    client.login(TOKEN_DIR)
    print(f"登入成功，token 已存至 {TOKEN_DIR}")
    return client


def pace_str(seconds_per_km: float | None) -> str | None:
    if not seconds_per_km or seconds_per_km <= 0:
        return None
    minutes, seconds = divmod(round(seconds_per_km), 60)
    return f"{minutes}:{seconds:02d}"


MAIN_INTENSITY_PRIORITY = (("MAIN",), ("ACTIVE",), ("INTERVAL",))
NON_MAIN_INTENSITIES = {"WARMUP", "COOLDOWN", "RECOVERY", "REST"}


def weighted_average(rows: list[dict], field: str) -> float | None:
    weighted = [
        (float(row.get(field) or 0), float(row.get("duration_min") or row.get("duration") or 0))
        for row in rows
    ]
    weighted = [(value, duration) for value, duration in weighted if value > 0 and duration > 0]
    if not weighted:
        return None
    return round(sum(value * duration for value, duration in weighted) / sum(duration for _, duration in weighted), 1)


def simplify_lap(lap: dict) -> dict:
    distance_m = float(lap.get("distance") or 0)
    duration_s = float(lap.get("duration") or 0)
    return {
        "intensity": str(lap.get("intensityType") or "").upper(),
        "distance_km": round(distance_m / 1000, 3),
        "duration_min": round(duration_s / 60, 2),
        "pace_per_km": pace_str(duration_s / (distance_m / 1000)) if distance_m else None,
        "avg_hr": lap.get("averageHR"),
        "max_hr": lap.get("maxHR"),
        "avg_cadence": lap.get("averageRunCadence"),
    }


def summarize_main_segment(split_payload: dict | None) -> dict | None:
    """Return a quality-only main block when Garmin explicitly labels workout steps.

    Automatic kilometre laps are intentionally not treated as a main block.  A
    main-course score must come from Garmin's warmup/active/recovery/cooldown
    structure, otherwise the coach has no safe basis for separating the run.
    """
    laps = (split_payload or {}).get("lapDTOs") or []
    normalized = [simplify_lap(lap) for lap in laps if isinstance(lap, dict)]
    intensities = {lap["intensity"] for lap in normalized if lap["intensity"]}
    if not intensities.intersection(NON_MAIN_INTENSITIES):
        return None
    # Garmin labels a steady prescribed block as MAIN, while optional strides
    # may be ACTIVE.  Prefer the most specific group so strides never improve
    # or worsen the E-run result; interval-only workouts still fall back to
    # INTERVAL when no MAIN/ACTIVE group exists.
    main_intensities = next(
        (set(group) for group in MAIN_INTENSITY_PRIORITY if intensities.intersection(group)),
        set(),
    )
    main_laps = [lap for lap in normalized if lap["intensity"] in main_intensities]
    distance_km = sum(lap["distance_km"] for lap in main_laps)
    duration_min = sum(lap["duration_min"] for lap in main_laps)
    if not main_laps or distance_km <= 0 or duration_min <= 0:
        return None
    duration_s = duration_min * 60
    return {
        "source": "garmin-workout-steps",
        "lap_count": len(main_laps),
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_min, 1),
        "pace_per_km": pace_str(duration_s / distance_km),
        "avg_hr": weighted_average(main_laps, "avg_hr"),
        "max_hr": max((float(lap.get("max_hr") or 0) for lap in main_laps), default=0) or None,
        "avg_cadence": weighted_average(main_laps, "avg_cadence"),
    }


def simplify(activity: dict, split_payload: dict | None = None) -> dict:
    distance_m = activity.get("distance") or 0
    duration_s = activity.get("duration") or 0
    sec_per_km = (duration_s / (distance_m / 1000)) if distance_m else None
    record = {
        "activityId": activity.get("activityId"),
        "date": (activity.get("startTimeLocal") or "")[:10],
        "startTime": activity.get("startTimeLocal"),
        "name": activity.get("activityName"),
        "type": (activity.get("activityType") or {}).get("typeKey"),
        "distance_km": round(distance_m / 1000, 2) if distance_m else 0,
        "duration_min": round(duration_s / 60, 1) if duration_s else 0,
        "pace_per_km": pace_str(sec_per_km),
        "avg_hr": activity.get("averageHR"),
        "max_hr": activity.get("maxHR"),
        "avg_cadence": activity.get("averageRunningCadenceInStepsPerMinute"),
        "elevation_gain_m": activity.get("elevationGain"),
        "calories": activity.get("calories"),
        "aerobic_te": activity.get("aerobicTrainingEffect"),
        "anaerobic_te": activity.get("anaerobicTrainingEffect"),
        "vo2max": activity.get("vO2MaxValue"),
        "avg_power": activity.get("avgPower"),
        "training_load": activity.get("activityTrainingLoad"),
    }
    main_segment = summarize_main_segment(split_payload)
    if main_segment:
        record["main_segment"] = main_segment
    return record


def load_existing() -> dict[int, dict]:
    if not OUTPUT_PATH.exists():
        return {}
    try:
        data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        return {a["activityId"]: a for a in data.get("activities", [])}
    except (json.JSONDecodeError, KeyError, TypeError):
        print(f"警告：{OUTPUT_PATH} 格式異常，將重建", file=sys.stderr)
        return {}


def main() -> int:
    parser = argparse.ArgumentParser(description="抓取 Garmin 跑步紀錄")
    parser.add_argument("--days", type=int, default=90, help="回溯天數（預設 90）")
    parser.add_argument("--non-interactive", action="store_true", help="排程模式：token 失效時直接失敗，不開啟帳密提示")
    parser.add_argument("--refresh-segments", action="store_true", help="重新抓取範圍內既有活動的課程分段")
    args = parser.parse_args()

    try:
        hydrate_tokenstore_from_env()
        client = login(interactive=not args.non_interactive)
    except RuntimeError as exc:
        print(f"Garmin authentication unavailable: {exc}", file=sys.stderr)
        return 3

    end = date.today()
    start = end - timedelta(days=args.days)
    print(f"抓取 {start} ~ {end} 的活動…")
    activities = client.get_activities_by_date(
        start.isoformat(), end.isoformat()
    )

    running_activities = [
        a for a in activities
        if (a.get("activityType") or {}).get("typeKey") in RUNNING_TYPE_KEYS
    ]
    existing = load_existing()
    runs = []
    for activity in running_activities:
        activity_id = activity.get("activityId")
        # Fetch structured steps for new activities.  Existing legacy records
        # remain valid for volume, but are never silently reinterpreted as a
        # main-course result without Garmin's explicit step labels.
        split_payload = None
        if args.refresh_segments or activity_id not in existing:
            try:
                split_payload = client.get_activity_splits(activity_id)
            except Exception as exc:  # One malformed activity must not block sync.
                print(f"警告：無法讀取活動 {activity_id} 的分段資料（{exc}）", file=sys.stderr)
        record = simplify(activity, split_payload)
        runs.append(record)
    merged = existing
    new_count = sum(1 for r in runs if r["activityId"] not in merged)
    for r in runs:
        previous = merged.get(r["activityId"])
        # A normal daily list response has only whole-activity values.  Keep a
        # previously fetched structured main block until a newer split response
        # explicitly replaces it, rather than regressing the coach to all-run
        # averages on the next scheduled sync.
        if previous and previous.get("main_segment") and not r.get("main_segment"):
            r["main_segment"] = previous["main_segment"]
        merged[r["activityId"]] = r

    records = sorted(merged.values(), key=lambda r: r["startTime"] or "")
    structured_count = sum(1 for record in records if record.get("main_segment"))
    print(f"取得 {len(activities)} 筆活動，其中跑步 {len(runs)} 筆；已保存可辨識主課 {structured_count} 筆")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(
            {
                "updatedAt": date.today().isoformat(),
                "count": len(records),
                "activities": records,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"新增 {new_count} 筆，總計 {len(records)} 筆 → {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
