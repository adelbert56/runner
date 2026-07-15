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


def target_from_spec(spec: Any) -> tuple[dict[str, Any], float | None, float | None]:
    if isinstance(spec, dict) and spec.get("kind") == "speed":
        lower, upper = float(spec.get("minMps") or 0), float(spec.get("maxMps") or 0)
        if lower > 0 and upper >= lower:
            return ({"workoutTargetTypeId": TargetType.SPEED_ZONE, "workoutTargetTypeKey": "speed.zone", "displayOrder": TargetType.SPEED_ZONE}, lower, upper)
    if isinstance(spec, dict) and spec.get("kind") == "heart_rate":
        lower, upper = float(spec.get("min") or 0), float(spec.get("max") or 0)
        if lower > 0 and upper >= lower:
            return ({"workoutTargetTypeId": TargetType.HEART_RATE_ZONE, "workoutTargetTypeKey": "heart.rate.zone", "displayOrder": TargetType.HEART_RATE_ZONE}, lower, upper)
    return no_target(), None, None


def step(step_order: int, step_type: int, step_key: str, condition: dict[str, Any], value: float, target_spec: Any = None) -> ExecutableStep:
    target_type, target_one, target_two = target_from_spec(target_spec)
    return ExecutableStep(
        stepOrder=step_order,
        stepType={"stepTypeId": step_type, "stepTypeKey": step_key, "displayOrder": step_type},
        endCondition=condition,
        endConditionValue=value,
        targetType=target_type,
        targetValueOne=target_one,
        targetValueTwo=target_two,
    )


def strides_repeat_group(item: dict[str, Any], step_order: int) -> RepeatGroup | None:
    summary = str(item.get("summary") or "")
    match = re.search(r"ST\s*快步\s*(\d+)\s*[×xX]\s*(\d+)\s*秒", summary, flags=re.IGNORECASE)
    if not match:
        return None
    repetitions, stride_seconds = (int(match.group(1)), int(match.group(2)))
    if repetitions < 1 or stride_seconds < 1:
        return None
    recovery_match = re.search(r"(?:組間|之間|恢復)[^。；;]*?(\d+)\s*秒", summary, flags=re.IGNORECASE)
    recovery_seconds = int(recovery_match.group(1)) if recovery_match else 45
    return RepeatGroup(
        stepOrder=step_order,
        stepType={"stepTypeId": StepType.REPEAT, "stepTypeKey": "repeat", "displayOrder": StepType.REPEAT},
        numberOfIterations=repetitions,
        endCondition=end_condition(ConditionType.ITERATIONS, "iterations"),
        endConditionValue=float(repetitions),
        workoutSteps=[
            step(1, StepType.INTERVAL, "interval", end_condition(ConditionType.TIME, "time"), stride_seconds),
            step(2, StepType.RECOVERY, "recovery", end_condition(ConditionType.TIME, "time"), recovery_seconds),
        ],
    )


STRUCTURED_STEP_TYPES = {
    "warmup": (StepType.WARMUP, "warmup"),
    "main": (StepType.MAIN, "main"),
    "interval": (StepType.INTERVAL, "interval"),
    "recovery": (StepType.RECOVERY, "recovery"),
    "cooldown": (StepType.COOLDOWN, "cooldown"),
}


def structured_executable_step(item: dict[str, Any], step_order: int) -> ExecutableStep:
    kind = str(item.get("kind") or "main")
    step_type, step_key = STRUCTURED_STEP_TYPES.get(kind, STRUCTURED_STEP_TYPES["main"])
    end = item.get("end") if isinstance(item.get("end"), dict) else {}
    end_type = str(end.get("type") or "open")
    raw_value = float(end.get("value") or 0)
    if end_type == "distance" and raw_value > 0:
        condition, value = end_condition(ConditionType.DISTANCE, "distance"), raw_value
    elif end_type == "time" and raw_value > 0:
        condition, value = end_condition(ConditionType.TIME, "time"), raw_value
    else:
        # Garmin needs a concrete end condition.  A short time cap is safer
        # than inventing a distance when the coach gave an open instruction.
        condition, value = end_condition(ConditionType.TIME, "time"), 300
    return step(step_order, step_type, step_key, condition, value, item.get("targetSpec"))


def structured_steps(item: dict[str, Any]) -> list[ExecutableStep | RepeatGroup]:
    supplied = item.get("steps")
    if not isinstance(supplied, list) or not supplied:
        return []
    built: list[ExecutableStep | RepeatGroup] = []
    for order, source in enumerate(supplied, start=1):
        if not isinstance(source, dict):
            continue
        if source.get("kind") != "repeat":
            built.append(structured_executable_step(source, order))
            continue
        children = [child for child in source.get("children", []) if isinstance(child, dict)]
        if not children:
            continue
        repetitions = max(1, min(30, int(float(source.get("repetitions") or source.get("end", {}).get("value") or 1))))
        built.append(RepeatGroup(
            stepOrder=order,
            stepType={"stepTypeId": StepType.REPEAT, "stepTypeKey": "repeat", "displayOrder": StepType.REPEAT},
            numberOfIterations=repetitions,
            endCondition=end_condition(ConditionType.ITERATIONS, "iterations"),
            endConditionValue=float(repetitions),
            workoutSteps=[structured_executable_step(child, child_order) for child_order, child in enumerate(children, start=1)],
        ))
    return built


def structured_steps_note(item: dict[str, Any]) -> str:
    steps = item.get("steps") if isinstance(item.get("steps"), list) else []
    labels = {"warmup": "熱身", "main": "主課", "interval": "快段", "recovery": "恢復", "cooldown": "收操", "repeat": "重複組"}
    rows = []
    for source in steps:
        if not isinstance(source, dict):
            continue
        end = source.get("end") if isinstance(source.get("end"), dict) else {}
        label = str(end.get("label") or "依體感")
        rows.append(f"{labels.get(str(source.get('kind')), '步驟')}｜{label}")
    return "\n".join(rows)


def workout_for(item: dict[str, Any]) -> RunningWorkout:
    km = max(1.0, float(item.get("km") or 0))
    main_km = main_distance_km(item, fallback=km)
    kind = str(item.get("type") or "easy")
    warmup_seconds = 900 if kind in {"tempo", "interval"} else 480
    cooldown_seconds = 600 if kind in {"tempo", "interval", "long"} else 420
    main_type = StepType.INTERVAL if kind == "interval" else StepType.MAIN
    main_key = "interval" if kind == "interval" else "main"
    fallback_steps: list[ExecutableStep | RepeatGroup] = [
        step(1, StepType.WARMUP, "warmup", end_condition(ConditionType.TIME, "time"), warmup_seconds),
        step(2, main_type, main_key, end_condition(ConditionType.DISTANCE, "distance"), round(main_km * 1000)),
    ]
    strides = strides_repeat_group(item, step_order=3)
    if strides:
        fallback_steps.append(strides)
    fallback_steps.append(step(4 if strides else 3, StepType.COOLDOWN, "cooldown", end_condition(ConditionType.TIME, "time"), cooldown_seconds))
    steps = structured_steps(item) or fallback_steps
    estimated = max(1800, int(float(item.get("estimatedDurationSec") or km * 420 + warmup_seconds + cooldown_seconds)))
    summary = str(item.get("summary") or "").strip()
    pace = str(item.get("pace") or "").strip()
    distance_note = f"距離定義：主課 {main_km:g} km；本日總跑量 {km:g} km（用於時間估算）。"
    strides_note = "ST 快步：每次 20 秒，之後 45 秒恢復，依課表重複。" if strides else ""
    structured_note = structured_steps_note(item)
    note = "\n".join(part for part in [structured_note, summary, pace, distance_note, strides_note, "由 Runner 本機同步建立；再次同步會依日期與名稱略過重複項。"] if part)
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
