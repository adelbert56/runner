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


def test_lap_summary_keeps_compact_ordered_session_evidence() -> None:
    payload = {
        "lapDTOs": [
            _lap("WARMUP", 500, 300, 120),
            _lap("MAIN", 6000, 2820, 147),
            _lap("COOLDOWN", 300, 180, 125),
        ]
    }

    laps = fetch_garmin.summarize_laps(payload)

    assert [(lap["index"], lap["intensity"], lap["distance_km"]) for lap in laps] == [
        (1, "WARMUP", 0.5),
        (2, "MAIN", 6.0),
        (3, "COOLDOWN", 0.3),
    ]
    assert "latitude" not in laps[0]


def test_self_evaluation_normalizes_garmin_tenths() -> None:
    result = fetch_garmin.extract_self_evaluation({"nested": {"directWorkoutFeel": 50, "directWorkoutRpe": 30}})

    assert result == {"feel": 5, "rpe": 3, "source": "garmin-self-evaluation"}


def test_terrain_summary_keeps_slope_evidence_without_route_coordinates() -> None:
    payload = {
        "metricDescriptors": [
            {"key": "directTimestamp"}, {"key": "distance"}, {"key": "altitude"},
            {"key": "heartRate"}, {"key": "speed"}, {"key": "runningCadence"},
        ],
        "activityDetailMetrics": [
            {"metrics": [0, 0, 100, 130, 2.5, 168]},
            {"metrics": [60000, 250, 108, 140, 2.5, 170]},
            {"metrics": [120000, 500, 98, 142, 2.5, 171]},
            {"metrics": [180000, 750, 88, 144, 2.5, 170]},
            {"metrics": [240000, 1000, 82, 145, 2.5, 170]},
        ],
    }

    summary = fetch_garmin.summarize_terrain(payload)

    assert summary and summary["source"] == "garmin-detail-chart"
    assert summary["segments"][0]["direction"] == "uphill"
    assert summary["segments"][1]["direction"] == "downhill"
    assert summary["segments"][0]["pace_per_km"] == "4:00"
    assert "latitude" not in str(summary).lower()
    assert "longitude" not in str(summary).lower()


def test_temperature_uses_detail_average_when_activity_summary_omits_it() -> None:
    temperature, source = fetch_garmin.extract_activity_temperature(
        {"activityId": 42},
        {"summaryDTO": {"averageTemperature": 29.4}},
        None,
    )

    assert temperature == 29.4
    assert source == "garmin-activity-detail"


def test_temperature_can_be_safely_aggregated_from_detail_chart() -> None:
    temperature, source = fetch_garmin.extract_activity_temperature(
        {"activityId": 42},
        None,
        {
            "metricDescriptors": [{"key": "distance"}, {"key": "temperature"}, {"key": "latitude"}],
            "activityDetailMetrics": [{"metrics": [0, 28.2, 24.1]}, {"metrics": [250, 29.0, 24.2]}],
        },
    )

    assert temperature == 28.6
    assert source == "garmin-detail-chart"


def test_legacy_activity_records_keep_distinct_storage_keys() -> None:
    first = fetch_garmin.activity_storage_key({"date": "2026-08-24", "name": "輕鬆跑", "distance_km": 7.45})
    second = fetch_garmin.activity_storage_key({"date": "2026-08-25", "name": "節奏跑", "distance_km": 8.91})

    assert first.startswith("legacy:")
    assert first != second


def test_missing_activity_id_is_explained_without_requesting_route_data() -> None:
    record = fetch_garmin.simplify({
        "startTimeLocal": "2026-08-25 18:30:00",
        "activityName": "舊快照",
        "activityType": {"typeKey": "running"},
        "distance": 8910,
        "duration": 3300,
        "elevationGain": 26,
    })

    assert record["terrain_detail_status"] == "missing-activity-id"
    assert record["avg_temperature_c"] is None
    assert "latitude" not in record
    assert "longitude" not in record
