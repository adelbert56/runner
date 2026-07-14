"""Publish a Runner week to the current user's Garmin Connect calendar.

This is intentionally a local, single-user bridge.  It reuses the token store
created by fetch_garmin.py and never receives a Garmin password from Runner.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from garminconnect.workout import (
    ConditionType,
    ExecutableStep,
    RepeatGroup,
    RunningWorkout,
    SportType,
    StepType,
    TargetType,
    WorkoutSegment,
)

from fetch_garmin import login


REPO_ROOT = Path(__file__).resolve().parents[2]
STATUS_PATH = REPO_ROOT / "runner" / "訓練" / "garmin-workout-sync-status.json"


def write_status(status: str, message: str, **extra: Any) -> None:
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": status,
        "message": message,
        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        **extra,
    }
    STATUS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_date(value: Any) -> str:
    date_str = str(value or "")
    datetime.strptime(date_str, "%Y-%m-%d")
    return date_str


def no_target() -> dict[str, Any]:
    return {
        "workoutTargetTypeId": TargetType.NO_TARGET,
        "workoutTargetTypeKey": "no.target",
        "displayOrder": 1,
    }


def end_condition(kind: int, key: str) -> dict[str, Any]:
    return {
        "conditionTypeId": kind,
        "conditionTypeKey": key,
        "displayOrder": kind,
        "displayable": True,
    }


def step(step_order: int, step_type: int, step_key: str, condition: dict[str, Any], value: float) -> ExecutableStep:
    return ExecutableStep(
        stepOrder=step_order,
        stepType={"stepTypeId": step_type, "stepTypeKey": step_key, "displayOrder": step_type},
        endCondition=condition,
        endConditionValue=value,
        targetType=no_target(),
    )


def strides_repeat_group(item: dict[str, Any], step_order: int) -> RepeatGroup | None:
    summary = str(item.get("summary") or "")
    match = re.search(r"ST\s*快步\s*(\d+)\s*[×xX]\s*(\d+)\s*秒", summary, flags=re.IGNORECASE)
    if not match:
        return None
    repetitions, stride_seconds = (int(match.group(1)), int(match.group(2)))
    if repetitions < 1 or stride_seconds < 1:
        return None
    return RepeatGroup(
        stepOrder=step_order,
        stepType={"stepTypeId": StepType.REPEAT, "stepTypeKey": "repeat", "displayOrder": StepType.REPEAT},
        numberOfIterations=repetitions,
        endCondition=end_condition(ConditionType.ITERATIONS, "iterations"),
        endConditionValue=float(repetitions),
        workoutSteps=[
            step(1, StepType.INTERVAL, "interval", end_condition(ConditionType.TIME, "time"), stride_seconds),
            step(2, StepType.RECOVERY, "recovery", end_condition(ConditionType.TIME, "time"), 60),
        ],
    )


def workout_for(item: dict[str, Any]) -> RunningWorkout:
    km = max(1.0, float(item.get("km") or 0))
    main_km = main_distance_km(item, fallback=km)
    kind = str(item.get("type") or "easy")
    warmup_seconds = 900 if kind in {"tempo", "interval"} else 480
    cooldown_seconds = 600 if kind in {"tempo", "interval", "long"} else 420
    main_type = StepType.INTERVAL if kind == "interval" else StepType.MAIN
    main_key = "interval" if kind == "interval" else "main"
    steps: list[ExecutableStep | RepeatGroup] = [
        step(1, StepType.WARMUP, "warmup", end_condition(ConditionType.TIME, "time"), warmup_seconds),
        step(2, main_type, main_key, end_condition(ConditionType.DISTANCE, "distance"), round(main_km * 1000)),
    ]
    strides = strides_repeat_group(item, step_order=3)
    if strides:
        steps.append(strides)
    steps.append(step(4 if strides else 3, StepType.COOLDOWN, "cooldown", end_condition(ConditionType.TIME, "time"), cooldown_seconds))
    estimated = max(1800, int(float(item.get("estimatedDurationSec") or km * 420 + warmup_seconds + cooldown_seconds)))
    summary = str(item.get("summary") or "").strip()
    pace = str(item.get("pace") or "").strip()
    distance_note = f"距離定義：主課 {main_km:g} km；本日總跑量 {km:g} km（用於時間估算）。"
    strides_note = "ST 快步：每次 20 秒，之後 60 秒恢復，依課表重複。" if strides else ""
    note = "\n".join(part for part in [summary, pace, distance_note, strides_note, "由 Runner 本機同步建立；再次同步會依日期與名稱略過重複項。"] if part)
    return RunningWorkout(
        workoutName=str(item["name"]),
        estimatedDurationInSecs=estimated,
        description=note[:512],
        workoutSegments=[
            WorkoutSegment(
                segmentOrder=1,
                sportType={"sportTypeId": SportType.RUNNING, "sportTypeKey": "running", "displayOrder": 1},
                workoutSteps=steps,
            )
        ],
    )


def main_distance_km(item: dict[str, Any], *, fallback: float) -> float:
    supplied = item.get("mainKm")
    if supplied is not None:
        return max(0.1, float(supplied))
    summary = str(item.get("summary") or "")
    match = re.search(r"(?:E\s*跑|恢復跑|長跑|慢跑)\s*(\d+(?:\.\d+)?)\s*(?:km|公里)", summary, flags=re.IGNORECASE)
    return max(0.1, float(match.group(1)) if match else fallback)


def workout_id(response: dict[str, Any]) -> int:
    for key in ("workoutId", "workout_id", "id"):
        if response.get(key) is not None:
            return int(response[key])
    raise RuntimeError("Garmin did not return a workout ID")


def scheduled_workout_ids(api: Any, workouts: list[dict[str, Any]], existing: dict[str, dict[str, Any]]) -> dict[tuple[str, int], int]:
    months = {(datetime.strptime(require_date(item["date"]), "%Y-%m-%d").year, datetime.strptime(require_date(item["date"]), "%Y-%m-%d").month) for item in workouts}
    scheduled: dict[tuple[str, int], int] = {}
    for year, month in months:
        for calendar_item in api.get_scheduled_workouts(year, month).get("calendarItems", []):
            if calendar_item.get("itemType") != "workout" or not calendar_item.get("id") or not calendar_item.get("workoutId"):
                continue
            scheduled[(str(calendar_item.get("date") or ""), int(calendar_item["workoutId"]))] = int(calendar_item["id"])
    return scheduled


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish a Runner week to Garmin Connect")
    parser.add_argument("--input", required=True, help="Runner workout-sync request JSON")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without changing Garmin Connect")
    parser.add_argument("--replace-existing", action="store_true", help="Replace same-named Runner workouts after an explicit correction approval")
    parser.add_argument("--only-date", help="Limit a deliberate replacement to one YYYY-MM-DD workout date")
    args = parser.parse_args()

    try:
        request = json.loads(Path(args.input).read_text(encoding="utf-8"))
        workouts = request.get("workouts")
        if request.get("version") != 1 or not isinstance(workouts, list) or not workouts:
            raise ValueError("Invalid Runner Garmin sync request")
        if len(workouts) > 7:
            raise ValueError("A single Garmin sync request may contain at most seven workouts")
        if args.only_date:
            require_date(args.only_date)
            workouts = [item for item in workouts if isinstance(item, dict) and item.get("date") == args.only_date]
            if not workouts:
                raise ValueError(f"No Runner workout exists on {args.only_date}")
        for item in workouts:
            if not isinstance(item, dict) or not str(item.get("name") or "").strip():
                raise ValueError("Every workout requires a name")
            require_date(item.get("date"))

        if args.dry_run:
            write_status("dry-run", f"Validated {len(workouts)} Runner workouts", workouts=[item["name"] for item in workouts])
            return 0

        write_status("running", f"Preparing {len(workouts)} Garmin workouts", total=len(workouts))
        api = login(interactive=False)
        existing = {str(item.get("workoutName") or ""): item for item in api.get_workouts(limit=100)}
        scheduled = scheduled_workout_ids(api, workouts, existing) if args.replace_existing else {}
        results: list[dict[str, Any]] = []
        for item in workouts:
            name = str(item["name"])
            existing_item = existing.get(name)
            if existing_item and existing_item.get("workoutId") and args.replace_existing:
                current_id = int(existing_item["workoutId"])
                scheduled_id = scheduled.get((require_date(item["date"]), current_id))
                if not scheduled_id:
                    raise RuntimeError(f"Could not find the scheduled Runner workout for {name}; nothing was deleted")
                replacement_id = workout_id(api.upload_running_workout(workout_for(item)))
                api.schedule_workout(replacement_id, require_date(item["date"]))
                api.unschedule_workout(scheduled_id)
                api.delete_workout(current_id)
                current_id = replacement_id
                action = "replaced"
            elif existing_item and existing_item.get("workoutId"):
                current_id = int(existing_item["workoutId"])
                action = "reused"
            else:
                current_id = workout_id(api.upload_running_workout(workout_for(item)))
                action = "created"
            api.schedule_workout(current_id, require_date(item["date"]))
            results.append({"name": name, "date": item["date"], "workoutId": current_id, "action": action})

        write_status("ok", f"已同步 {len(results)} 堂課到 Garmin 行事曆", total=len(results), results=results)
        return 0
    except Exception as exc:  # status is the UI contract for the local helper
        write_status("error", str(exc))
        print(f"Garmin workout sync failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
