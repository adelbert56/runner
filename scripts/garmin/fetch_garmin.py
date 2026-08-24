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
MAX_LAP_SUMMARY = 64
TERRAIN_SEGMENT_M = 250
MAX_TERRAIN_SEGMENTS = 48


def weighted_average(rows: list[dict], field: str) -> float | None:
    weighted = [
        (float(row.get(field) or 0), float(row.get("duration_min") or row.get("duration") or 0))
        for row in rows
    ]
    weighted = [(value, duration) for value, duration in weighted if value > 0 and duration > 0]
    if not weighted:
        return None
    return round(sum(value * duration for value, duration in weighted) / sum(duration for _, duration in weighted), 1)


def simplify_lap(lap: dict, index: int | None = None) -> dict:
    distance_m = float(lap.get("distance") or 0)
    duration_s = float(lap.get("duration") or 0)
    result = {
        "intensity": str(lap.get("intensityType") or "").upper(),
        "distance_km": round(distance_m / 1000, 3),
        "duration_min": round(duration_s / 60, 2),
        "pace_per_km": pace_str(duration_s / (distance_m / 1000)) if distance_m else None,
        "avg_hr": lap.get("averageHR"),
        "max_hr": lap.get("maxHR"),
        "avg_cadence": lap.get("averageRunCadence"),
    }
    if index is not None:
        result["index"] = index
    return result


def summarize_laps(split_payload: dict | None) -> list[dict]:
    """Keep a compact, privacy-safe lap summary for the session report.

    The report deliberately stores no route, GPS coordinates, or per-second
    stream.  Garmin's workout step/lap fields are enough to explain whether
    warmup, main work, recovery and cooldown were completed as prescribed.
    """
    laps = (split_payload or {}).get("lapDTOs") or []
    return [
        simplify_lap(lap, index)
        for index, lap in enumerate(laps[:MAX_LAP_SUMMARY], start=1)
        if isinstance(lap, dict)
    ]


def _metric_rows(detail_payload: dict | None) -> list[dict]:
    """Read only numeric chart metrics needed for local terrain analysis.

    Garmin's chart schema has changed between devices.  This normalizer accepts
    both descriptor/array and already-keyed shapes, then discards every field
    except time, distance, altitude, HR, speed and cadence.  In particular no
    latitude/longitude or polyline is returned or written to disk.
    """
    if not isinstance(detail_payload, dict):
        return []
    descriptors = detail_payload.get("metricDescriptors") or []
    keys = [str(item.get("key") or item.get("metricKey") or "") if isinstance(item, dict) else str(item) for item in descriptors]
    payload_rows = detail_payload.get("activityDetailMetrics") or detail_payload.get("metrics") or []
    aliases = {
        "distance": {"distance", "distanceinmeters", "sumdistance", "directdistance"},
        "altitude": {"altitude", "elevation", "enhancedaltitude"},
        "time": {"directtimestamp", "timestamp", "timerduration", "elapsedtime"},
        "hr": {"heartrate", "directheartrate"},
        "speed": {"speed", "directspeed"},
        "cadence": {"runningcadence", "directrunningcadence", "runcadence"},
    }
    def value_for(mapping: dict, names: set[str]) -> float | None:
        for key, value in mapping.items():
            normalized = "".join(char for char in str(key).lower() if char.isalnum())
            if normalized in names:
                try:
                    numeric = float(value)
                    return numeric if numeric == numeric else None
                except (TypeError, ValueError):
                    return None
        return None
    rows: list[dict] = []
    for item in payload_rows:
        source = item.get("metrics") if isinstance(item, dict) and isinstance(item.get("metrics"), list) else item
        if isinstance(source, list):
            mapping = {keys[index]: value for index, value in enumerate(source) if index < len(keys)}
        elif isinstance(source, dict):
            mapping = source
        else:
            continue
        row = {field: value_for(mapping, names) for field, names in aliases.items()}
        if row["distance"] is not None and row["altitude"] is not None:
            rows.append(row)
    return rows


def summarize_terrain(detail_payload: dict | None) -> dict | None:
    """Return privacy-safe 250 m slope/pace/HR summary; never route points."""
    rows = _metric_rows(detail_payload)
    if len(rows) < 3:
        return None
    rows.sort(key=lambda row: row["distance"] or 0)
    valid = [row for row in rows if row["distance"] is not None and row["altitude"] is not None]
    if len(valid) < 3 or (valid[-1]["distance"] - valid[0]["distance"]) < TERRAIN_SEGMENT_M:
        return None
    segments: list[dict] = []
    ascent = descent = 0.0
    start_index = 0
    for end_index in range(1, len(valid)):
        first, last = valid[start_index], valid[end_index]
        distance = (last["distance"] or 0) - (first["distance"] or 0)
        if distance < TERRAIN_SEGMENT_M:
            continue
        samples = valid[start_index:end_index + 1]
        delta = (last["altitude"] or 0) - (first["altitude"] or 0)
        grade = round(delta / distance * 100, 1)
        direction = "uphill" if grade >= 2 else "downhill" if grade <= -2 else "flat"
        ascent += max(0, delta)
        descent += max(0, -delta)
        timestamps = [sample["time"] for sample in samples if sample["time"] is not None]
        pace = None
        if len(timestamps) >= 2 and timestamps[-1] > timestamps[0]:
            seconds = timestamps[-1] - timestamps[0]
            # Garmin timestamps are normally ms; tolerate seconds in fixtures.
            if seconds > 10000:
                seconds /= 1000
            pace = pace_str(seconds / (distance / 1000))
        if not pace:
            speeds = [sample["speed"] for sample in samples if sample["speed"] and sample["speed"] > 0]
            if speeds:
                pace = pace_str(1000 / (sum(speeds) / len(speeds)))
        def average(field: str) -> float | None:
            values = [sample[field] for sample in samples if sample[field] and sample[field] > 0]
            return round(sum(values) / len(values), 1) if values else None
        segments.append({
            "start_km": round((first["distance"] or 0) / 1000, 2),
            "end_km": round((last["distance"] or 0) / 1000, 2),
            "direction": direction,
            "grade_pct": grade,
            "pace_per_km": pace,
            "avg_hr": average("hr"),
            "avg_cadence": average("cadence"),
        })
        start_index = end_index
        if len(segments) >= MAX_TERRAIN_SEGMENTS:
            break
    if not segments:
        return None
    return {
        "source": "garmin-detail-chart",
        "segment_m": TERRAIN_SEGMENT_M,
        "sample_count": len(valid),
        "ascent_m": round(ascent, 1),
        "descent_m": round(descent, 1),
        "max_abs_grade_pct": round(max(abs(segment["grade_pct"]) for segment in segments), 1),
        "segments": segments,
    }


def extract_self_evaluation(*payloads: object) -> dict | None:
    """Find Garmin's nested direct workout feel/RPE without storing raw detail data."""
    found: dict[str, object] = {}

    def walk(value: object) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {"directWorkoutFeel", "directWorkoutRpe"}:
                    found[key] = item
                elif isinstance(item, (dict, list)):
                    walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    for payload in payloads:
        walk(payload)
    feel = float(found.get("directWorkoutFeel") or 0)
    rpe = float(found.get("directWorkoutRpe") or 0)
    if feel <= 0 and rpe <= 0:
        return None
    return {
        "feel": round(feel / 10) if feel > 10 else round(feel),
        "rpe": round(rpe / 10) if rpe > 10 else round(rpe),
        "source": "garmin-self-evaluation",
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


def simplify(
    activity: dict,
    split_payload: dict | None = None,
    detail_payload: dict | None = None,
    activity_payload: dict | None = None,
) -> dict:
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
        "avg_temperature_c": activity.get("averageTemperature"),
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
    lap_summary = summarize_laps(split_payload)
    if lap_summary:
        record["lap_summary"] = lap_summary
    terrain_summary = summarize_terrain(detail_payload)
    if terrain_summary:
        record["terrain_summary"] = terrain_summary
    self_evaluation = extract_self_evaluation(activity, activity_payload, detail_payload)
    if self_evaluation:
        record["self_evaluation"] = self_evaluation
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


def load_existing_recovery() -> dict[str, dict]:
    if not OUTPUT_PATH.exists():
        return {}
    try:
        data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        return {r["date"]: r for r in data.get("recovery", []) if r.get("date")}
    except (json.JSONDecodeError, KeyError, TypeError):
        return {}


def _first_number(payload: object, *keys: str) -> float | None:
    """Garmin 的每日摘要欄位名在不同帳號/韌體之間會漂移，取第一個有值的鍵。"""
    if not isinstance(payload, dict):
        return None
    for key in keys:
        value = payload.get(key)
        if isinstance(value, (int, float)) and value > 0:
            return float(value)
    return None


def fetch_recovery_day(client: "Garmin", day: date) -> dict | None:
    """一天份的恢復訊號。任何一個端點失敗都不能讓整趟同步失敗——
    這些是輔助判讀，不是課表的必要條件。"""
    cdate = day.isoformat()
    record: dict = {"date": cdate}

    try:
        sleep = client.get_sleep_data(cdate) or {}
        daily = sleep.get("dailySleepDTO") or {}
        seconds = _first_number(daily, "sleepTimeSeconds")
        if seconds:
            record["sleep_hours"] = round(seconds / 3600, 2)
        scores = daily.get("sleepScores") or {}
        overall = scores.get("overall") if isinstance(scores, dict) else None
        score = _first_number(overall if isinstance(overall, dict) else {}, "value")
        if score:
            record["sleep_score"] = int(score)
    except Exception as exc:
        print(f"警告：無法讀取 {cdate} 的睡眠資料（{exc}）", file=sys.stderr)

    try:
        hrv = client.get_hrv_data(cdate) or {}
        summary = hrv.get("hrvSummary") or {}
        weekly = _first_number(summary, "weeklyAvg")
        overnight = _first_number(summary, "lastNightAvg")
        if weekly:
            record["hrv_weekly_avg"] = int(weekly)
        if overnight:
            record["hrv_overnight_avg"] = int(overnight)
        status = summary.get("status")
        if isinstance(status, str) and status:
            record["hrv_status"] = status
    except Exception as exc:
        print(f"警告：無法讀取 {cdate} 的 HRV 資料（{exc}）", file=sys.stderr)

    try:
        stats = client.get_stats(cdate) or {}
        resting = _first_number(stats, "restingHeartRate")
        if resting:
            record["resting_hr"] = int(resting)
        battery_low = _first_number(stats, "bodyBatteryLowestValue")
        battery_high = _first_number(stats, "bodyBatteryHighestValue")
        if battery_low:
            record["body_battery_low"] = int(battery_low)
        if battery_high:
            record["body_battery_high"] = int(battery_high)
        stress = _first_number(stats, "averageStressLevel")
        if stress:
            record["avg_stress"] = int(stress)
    except Exception as exc:
        print(f"警告：無法讀取 {cdate} 的每日摘要（{exc}）", file=sys.stderr)

    return record if len(record) > 1 else None


def fetch_recovery(client: "Garmin", days: int, existing: dict[str, dict]) -> list[dict]:
    """只補抓還沒有的日子。每天一組 API 呼叫，回溯太長會讓同步變得很慢，
    而恢復訊號本來就只有近期的有判讀價值。"""
    today = date.today()
    collected = dict(existing)
    for offset in range(days):
        day = today - timedelta(days=offset)
        cdate = day.isoformat()
        # 當天的資料可能還沒完整（睡眠要等隔天才結算），所以今天永遠重抓一次。
        if cdate in collected and offset > 0:
            continue
        record = fetch_recovery_day(client, day)
        if record:
            collected[cdate] = record
    return [collected[key] for key in sorted(collected)][-180:]


def main() -> int:
    parser = argparse.ArgumentParser(description="抓取 Garmin 跑步紀錄")
    parser.add_argument("--days", type=int, default=90, help="回溯天數（預設 90）")
    parser.add_argument("--non-interactive", action="store_true", help="排程模式：token 失效時直接失敗，不開啟帳密提示")
    parser.add_argument("--refresh-segments", action="store_true", help="重新抓取範圍內既有活動的課程分段")
    parser.add_argument("--recovery-days", type=int, default=21, help="回溯幾天的睡眠／HRV／body battery（預設 21，設 0 關閉）")
    args = parser.parse_args()

    try:
        hydrate_tokenstore_from_env()
        client = login(interactive=not args.non_interactive)
    except RuntimeError as exc:
        print(f"Garmin authentication unavailable: {exc}", file=sys.stderr)
        return 3

    # Lactate threshold (watch-estimated) gives more accurate training zones
    # than %maxHr; optional — sync must not fail when the endpoint is missing.
    lactate_threshold = None
    try:
        lt = (client.get_lactate_threshold(latest=True) or {}).get(
            "speed_and_heart_rate"
        ) or {}
        lt_hr = lt.get("heartRate")
        if lt_hr:
            lactate_threshold = {
                "heartRate": lt_hr,
                "speed": lt.get("speed"),
                "date": lt.get("calendarDate"),
            }
    except Exception as exc:
        print(f"警告：無法讀取乳酸閾值資料（{exc}）", file=sys.stderr)

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
        split_payload = detail_payload = activity_payload = None
        if args.refresh_segments or activity_id not in existing:
            try:
                split_payload = client.get_activity_splits(activity_id)
            except Exception as exc:  # One malformed activity must not block sync.
                print(f"警告：無法讀取活動 {activity_id} 的分段資料（{exc}）", file=sys.stderr)
            try:
                # Garmin keeps the post-run feel/RPE under summaryDTO, not in
                # the date-list response nor the chart detail endpoint.
                activity_payload = client.get_activity(activity_id)
                detail_payload = client.get_activity_details(activity_id, maxchart=2000, maxpoly=0)
            except Exception as exc:  # Self-evaluation is optional metadata.
                print(f"警告：無法讀取活動 {activity_id} 的完整明細（{exc}）", file=sys.stderr)
        record = simplify(activity, split_payload, detail_payload, activity_payload)
        runs.append(record)
    merged = existing
    new_count = sum(1 for r in runs if r["activityId"] not in merged)
    for r in runs:
        previous = merged.get(r["activityId"])
        # A normal daily list response has only whole-activity values.  Keep a
        # previously fetched structured main block until a newer split response
        # explicitly replaces it, rather than regressing the coach to all-run
        # averages on the next scheduled sync.
        if previous:
            if previous.get("main_segment") and not r.get("main_segment"):
                r["main_segment"] = previous["main_segment"]
            if previous.get("lap_summary") and not r.get("lap_summary"):
                r["lap_summary"] = previous["lap_summary"]
            if previous.get("self_evaluation") and not r.get("self_evaluation"):
                r["self_evaluation"] = previous["self_evaluation"]
            if previous.get("terrain_summary") and not r.get("terrain_summary"):
                r["terrain_summary"] = previous["terrain_summary"]
        merged[r["activityId"]] = r

    recovery: list[dict] = []
    if args.recovery_days > 0:
        print(f"抓取最近 {args.recovery_days} 天的睡眠／HRV／body battery…")
        recovery = fetch_recovery(client, args.recovery_days, load_existing_recovery())
        print(f"恢復訊號 {len(recovery)} 天")
    else:
        recovery = [load_existing_recovery()[key] for key in sorted(load_existing_recovery())]

    records = sorted(merged.values(), key=lambda r: r["startTime"] or "")
    structured_count = sum(1 for record in records if record.get("main_segment"))
    print(f"取得 {len(activities)} 筆活動，其中跑步 {len(runs)} 筆；已保存可辨識主課 {structured_count} 筆")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(
            {
                "updatedAt": date.today().isoformat(),
                "count": len(records),
                "lactateThreshold": lactate_threshold,
                "activities": records,
                "recovery": recovery,
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
