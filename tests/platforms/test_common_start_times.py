"""Regression tests for extract_start_times() parser paths."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

from platforms.common import extract_start_times


# ── helpers ──────────────────────────────────────────────────────────────────

def _times(result: str) -> list[str]:
    """Split '、'-joined result into a sorted list for order-insensitive comparison."""
    return sorted(result.split("、")) if result else []


# ── column table path ─────────────────────────────────────────────────────────
# Format: group names in rows above "起跑時間", times in rows below.
# Seen on: kktix-style event tables.

def test_column_table_two_groups():
    # Both groups must be in composite label_pattern (label + distance in parens)
    lines = [
        "活動項目",
        "全馬組（42K）",
        "挑戰組（21K）",
        "起跑時間",
        "06:00",
        "06:30",
    ]
    result = _times(extract_start_times(lines))
    assert "全馬組（42K） 起跑 06:00" in result
    assert "挑戰組（21K） 起跑 06:30" in result


# ── schedule path ─────────────────────────────────────────────────────────────
# Format: standalone time line, then group+keyword on the next line.

def test_schedule_time_then_group():
    lines = [
        "06:00",
        "全馬組 起跑",
        "06:30",
        "半馬組 起跑",
    ]
    result = _times(extract_start_times(lines))
    assert len(result) == 2
    assert any("06:00" in r for r in result)
    assert any("06:30" in r for r in result)


# ── inline path (biji.co) ─────────────────────────────────────────────────────
# Format: "組名 AM HH:MM 起跑" all on one line.
# Regression case: 田中馬拉松 was returning only "06:20" before fix.

def test_inline_biji_four_groups():
    lines = [
        "全程馬拉松組 AM 06:20 起跑",
        "半程馬拉松組 AM 06:40 起跑",
        "健跑組 AM 07:15 起跑",
        "友善樂跑組 AM 07:00 起跑",
    ]
    result = _times(extract_start_times(lines))
    assert len(result) == 4
    assert "全程馬拉松組 起跑 06:20" in result
    assert "半程馬拉松組 起跑 06:40" in result
    assert "健跑組 起跑 07:15" in result
    assert "友善樂跑組 起跑 07:00" in result


def test_inline_biji_column_header_does_not_preempt():
    """'起跑時間' column header followed by bare times must not block per-group extraction."""
    lines = [
        "起跑時間",   # structural label — bare "06:20" on next line
        "06:20",
        "06:40",
        "全程馬拉松組 ( 42.195K )",
        "起跑",
        "06:20",
        "半程馬拉松組 ( 22.6K )",
        "起跑",
        "06:40",
    ]
    result = _times(extract_start_times(lines))
    assert any("全程馬拉松組" in r for r in result), f"missing 全程馬拉松組 in {result}"
    assert any("半程馬拉松組" in r for r in result), f"missing 半程馬拉松組 in {result}"


# ── bare-time fallback ────────────────────────────────────────────────────────
# Format: "起跑時間：HH:MM" with no group breakdown — single-distance race.

def test_bare_time_fallback():
    lines = [
        "起跑時間",
        "07:00",
    ]
    result = extract_start_times(lines)
    assert "07:00" in result


# ── no spurious gate/route times ─────────────────────────────────────────────
# Regression: 田中馬 route description embedded "09:40" (gate time) was being picked up.

def test_route_description_time_not_captured():
    # Gate time must be >30 chars from "起跑" in joined text so the snippet regex also misses it.
    # Real-world: grouped loop exits early because per-group sections appear later on the page.
    route = "左轉山腳路一段右轉東彰路直行右轉大社路三段過高鐵站區轉鴻門圳抵社頭織襪園區" \
            "(■09:40關門點,約20.7K)"
    lines = [
        "全馬組（42K）",
        "起跑",
        route,
    ]
    result = extract_start_times(lines)
    assert "09:40" not in result


# ── new group labels recognised ───────────────────────────────────────────────

def test_new_labels_recognised():
    from platforms.common import _distance_groups
    assert _distance_groups("全程馬拉松組") == ["全程馬拉松組"]
    assert _distance_groups("半程馬拉松組") == ["半程馬拉松組"]
    assert _distance_groups("友善樂跑組") == ["友善樂跑組"]
