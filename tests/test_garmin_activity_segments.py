from __future__ import annotations

import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "garmin" / "fetch_garmin.py"
SPEC = importlib.util.spec_from_file_location("fetch_garmin", MODULE_PATH)
fetch_garmin = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(fetch_garmin)


def _lap(intensity: str, distance: float, duration: float, hr: int) -> dict:
    return {
        "intensityType": intensity,
        "distance": distance,
        "duration": duration,
        "averageHR": hr,
        "maxHR": hr + 5,
        "averageRunCadence": 170,
    }


def test_main_segment_excludes_warmup_recovery_and_cooldown() -> None:
    payload = {
        "lapDTOs": [
            _lap("WARMUP", 500, 300, 120),
            _lap("ACTIVE", 6000, 2700, 145),
            _lap("RECOVERY", 100, 60, 130),
            _lap("COOLDOWN", 400, 240, 125),
        ]
    }

    main = fetch_garmin.summarize_main_segment(payload)

    assert main == {
        "source": "garmin-workout-steps",
        "lap_count": 1,
        "distance_km": 6.0,
        "duration_min": 45.0,
        "pace_per_km": "7:30",
        "avg_hr": 145.0,
        "max_hr": 150.0,
        "avg_cadence": 170.0,
    }


def test_main_segment_prefers_main_over_optional_active_strides() -> None:
    payload = {
        "lapDTOs": [
            _lap("WARMUP", 500, 300, 120),
            _lap("MAIN", 6000, 2820, 147),
            _lap("ACTIVE", 240, 80, 160),
            _lap("RECOVERY", 300, 180, 135),
            _lap("COOLDOWN", 300, 180, 125),
        ]
    }

    main = fetch_garmin.summarize_main_segment(payload)

    assert main["distance_km"] == 6.0
    assert main["pace_per_km"] == "7:50"
    assert main["avg_hr"] == 147.0


def test_automatic_laps_are_not_misclassified_as_a_main_course() -> None:
    payload = {"lapDTOs": [_lap("INTERVAL", 1000, 480, 140), _lap("INTERVAL", 1000, 470, 142)]}

    assert fetch_garmin.summarize_main_segment(payload) is None
