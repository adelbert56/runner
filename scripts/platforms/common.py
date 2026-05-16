"""Shared helpers for official race platform enrichment."""

from __future__ import annotations

import re
from html import unescape
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup


DATE_PATTERN = (
    r"(?:\d{4}|\d{2,3})[./年-]\d{1,2}[./月-]\d{1,2}日?"
    r"|\d{1,2}[./月-]\d{1,2}日?"
)


def has_text(value: object) -> bool:
    return value is not None and str(value).strip() != ""


def host_of(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except ValueError:
        return ""


def absolute_url(url: str, base_url: str) -> str:
    return url if url.startswith(("http://", "https://")) else urljoin(base_url, url)


def compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" ：:　\t\r\n")


def soup_from_html(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def compact_lines(html: str) -> list[str]:
    soup = soup_from_html(html)
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    text = soup.get_text("\n", strip=True)
    return [compact_text(unescape(line)) for line in text.splitlines() if compact_text(line)]


def normalize_date(raw: str, default_year: str = "2026") -> str:
    text = compact_text(raw)
    text = text.replace("年", "/").replace("月", "/").replace("日", "")

    def valid_date(year: int, month: int, day: int) -> str:
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return ""
        return f"{year:04d}-{month:02d}-{day:02d}"

    match = re.search(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", text)
    if match:
        year, month, day = match.groups()
        return valid_date(int(year), int(month), int(day))

    match = re.search(r"(\d{2,3})[./-](\d{1,2})[./-](\d{1,2})", text)
    if match:
        roc_year, month, day = match.groups()
        year = int(roc_year) + 1911 if len(roc_year) == 3 else int(roc_year) + 2000
        return valid_date(year, int(month), int(day))

    match = re.search(r"(\d{1,2})[./-](\d{1,2})", text)
    if match:
        month, day = match.groups()
        return valid_date(int(default_year), int(month), int(day))

    return ""


def date_near_keywords(text: str, keywords: tuple[str, ...], default_year: str) -> str:
    compact = compact_text(text)
    for keyword in keywords:
        pattern = rf"{re.escape(keyword)}.{{0,60}}?({DATE_PATTERN})|({DATE_PATTERN}).{{0,60}}?{re.escape(keyword)}"
        for match in re.finditer(pattern, compact, flags=re.IGNORECASE):
            raw_date = next((group for group in match.groups() if group), "")
            normalized = normalize_date(raw_date, default_year)
            if normalized:
                return normalized
    return ""


def registration_period(text: str, default_year: str) -> tuple[str, str]:
    pattern = (
        rf"(?:報名期間|報名時間|報名日期|報名方式及日期|登記期間|線上報名).{{0,120}}?"
        rf"(?:起)?\s*({DATE_PATTERN}).{{0,40}}?(?:至|到|~|～|-|迄).{{0,40}}?({DATE_PATTERN})"
    )
    match = re.search(pattern, compact_text(text), flags=re.IGNORECASE)
    if not match:
        return "", ""
    return normalize_date(match.group(1), default_year), normalize_date(match.group(2), default_year)


def extract_registration_dates(text: str, race_date: str) -> tuple[str, str]:
    default_year = race_date[:4] if race_date else "2026"
    period_open, period_deadline = registration_period(text, default_year)
    opens_at = date_near_keywords(
        text,
        ("報名開始", "開放報名", "開始報名", "報名時間", "報名期間"),
        default_year,
    )
    deadline = date_near_keywords(
        text,
        ("報名截止", "截止報名", "報名至", "截止日", "額滿為止"),
        default_year,
    )
    return period_open or opens_at, period_deadline or deadline


def find_label_value(lines: list[str], labels: tuple[str, ...]) -> str:
    stop_words = (
        "活動日期", "活動時間", "活動地點", "報名時間", "報名日期", "報名費用",
        "賽事單位", "指導單位", "主辦單位", "承辦單位", "協辦單位", "贊助單位",
        "限制名額", "名額", "參加對象", "活動流程", "項目", "組別", "注意事項", "交通資訊",
    )
    for index, line in enumerate(lines):
        normalized_line = compact_text(line)
        for label in labels:
            if label not in normalized_line:
                continue
            inline = re.sub(rf"^.*?{re.escape(label)}\s*[：: ]*", "", normalized_line).strip()
            if inline and inline != normalized_line:
                return inline
            for candidate in lines[index + 1:index + 5]:
                if any(stop in candidate for stop in stop_words) and candidate not in labels:
                    break
                if candidate and candidate not in labels:
                    return candidate
    return ""


def collect_between(lines: list[str], start_labels: tuple[str, ...], stop_labels: tuple[str, ...]) -> list[str]:
    start_index = -1
    for index, line in enumerate(lines):
        if any(label in line for label in start_labels):
            start_index = index
            break
    if start_index < 0:
        return []

    values: list[str] = []
    for line in lines[start_index + 1:]:
        if any(label in line for label in stop_labels):
            break
        if line:
            values.append(line)
    return values


def extract_money_values(text: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"(?:NT\$|NTD|\$)?\s?\d{2,5}(?:,\d{3})?\s?元?", text)))


def extract_quota_values(text: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"\d{2,6}\s?人", text)))


def first_fee_text(text: str) -> str:
    values = extract_money_values(text)
    if not values:
        return ""
    cleaned = [compact_text(value).replace(" ", "") for value in values[:8]]
    return "、".join(cleaned)


def first_quota_text(text: str) -> str:
    values = extract_quota_values(text)
    if not values:
        return ""
    return "、".join(value.replace(" ", "") for value in values[:8])


def _time_text(value: str) -> str:
    match = re.search(r"([01]?\d|2[0-3])[:：][0-5]\d", value)
    if not match:
        return ""
    hour, minute = match.group(0).replace("：", ":").split(":")
    return f"{int(hour):02d}:{minute}"


def _format_distance_number(km: float) -> str:
    return f"{int(km)}K" if km == int(km) else f"{km:g}K"


def _semantic_distance_label(value: str) -> str:
    match = re.search(r"(\d+(?:\.\d+)?)", value)
    if not match:
        return compact_text(value)
    km = float(match.group(1))
    distance = _format_distance_number(km)
    if km > 43:
        return f"超馬組（{distance}）"
    if km >= 41.5:
        return f"全馬組（{distance}）"
    if km > 21.8:
        return f"超半馬組（{distance}）"
    if km >= 20.5:
        return f"半馬組（{distance}）"
    return distance


def _distance_groups(value: str) -> list[str]:
    text = compact_text(value).replace("Ｋ", "K").replace("ｋ", "k")
    label_pattern = r"(?:挑戰組|休閒組|健走組|健跑組|健康組|親子組|超半馬組|全馬組|身視障組)"
    composite_pattern = rf"{label_pattern}\s*[（(]\s*\d+(?:\.\d+)?\s?(?:K|KM|公里|k|km)\s*[）)]"
    group_pattern = rf"\d+(?:\.\d+)?\s?(?:K|KM|公里|k|km)|半馬|全馬|{label_pattern}"
    groups: list[str] = []
    occupied: list[tuple[int, int]] = []
    for match in re.finditer(composite_pattern, text):
        group = compact_text(match.group(0))
        group = re.sub(r"[（(]\s*", "（", group)
        group = re.sub(r"\s*[）)]", "）", group)
        group = re.sub(r"\s+（", "（", group)
        groups.append(group)
        occupied.append(match.span())
    for match in re.finditer(group_pattern, text):
        if any(start <= match.start() and match.end() <= end for start, end in occupied):
            continue
        group = compact_text(match.group(0)).replace(" ", "")
        if re.search(r"k|km", group, flags=re.IGNORECASE):
            group = _semantic_distance_label(group)
        groups.append(group)
    return list(dict.fromkeys(groups))


def _normalize_distance_label(value: str) -> str:
    distance = compact_text(value).replace(" ", "").upper()
    return re.sub(r"KM$", "K", distance)


def _group_label_from_line(value: str) -> str:
    text = compact_text(value).replace("Ｋ", "K").replace("ｋ", "k")
    match = re.search(
        r"((?:挑戰組|休閒組|健走組|健跑組|健康組|親子組|超半馬組|全馬組|身視障組))\s*[-－]\s*(\d+(?:\.\d+)?\s?(?:K|KM|公里|k|km))",
        text,
    )
    if match:
        group = match.group(1)
        distance = _normalize_distance_label(match.group(2))
        semantic = _semantic_distance_label(distance)
        semantic_prefix = semantic.split("組", 1)[0] if "組" in semantic else ""
        if semantic_prefix and semantic_prefix not in group:
            group = semantic_prefix + "組"
        return f"{group}（{distance}）"
    groups = _distance_groups(text)
    return groups[0] if groups else ""


def _format_start_time(group: str, time: str) -> str:
    return f"{group} 起跑 {time}"


def _start_time_rows_from_column_table(lines: list[str]) -> list[str]:
    rows: list[str] = []
    time_only = re.compile(r"^\s*(?:[01]?\d|2[0-3])[:：][0-5]\d\s*$")
    for index, line in enumerate(lines):
        if line != "起跑時間":
            continue

        groups: list[str] = []
        for candidate in reversed(lines[max(0, index - 12):index]):
            if candidate in {"活動項目", "比賽項目", "競賽項目", "組別"}:
                break
            group = _group_label_from_line(candidate)
            if group:
                groups.append(group)
        groups.reverse()
        if len(groups) < 2:
            continue

        times: list[str] = []
        for candidate in lines[index + 1:index + 1 + len(groups)]:
            if not time_only.match(candidate):
                break
            times.append(_time_text(candidate))
        if len(times) < 2:
            continue

        rows.extend(_format_start_time(group, time) for group, time in zip(groups, times))
        break
    return rows


def _start_time_rows_from_schedule(lines: list[str]) -> list[str]:
    rows: list[str] = []
    time_only = re.compile(r"^\s*([01]?\d|2[0-3])[:：][0-5]\d(?:\s*[~～-]\s*(?:[01]?\d|2[0-3])[:：][0-5]\d)?\s*$")
    start_keywords = ("起跑", "鳴槍", "出發")

    for index, line in enumerate(lines):
        if not time_only.match(line):
            continue
        time = _time_text(line)
        if not time:
            continue
        for event_line in lines[index + 1:index + 3]:
            if not any(keyword in event_line for keyword in start_keywords):
                continue
            for group in _distance_groups(event_line):
                rows.append(_format_start_time(group, time))
            break
    return rows


def extract_start_times(lines: list[str]) -> str:
    table_rows = _start_time_rows_from_column_table(lines)
    if table_rows:
        return "、".join(dict.fromkeys(table_rows[:8]))

    direct = find_label_value(lines, ("開跑時間", "起跑時間", "鳴槍時間", "出發時間", "各組出發"))
    if direct and _time_text(direct):
        return direct

    schedule_rows = _start_time_rows_from_schedule(lines)
    if schedule_rows:
        return "、".join(dict.fromkeys(schedule_rows[:8]))

    grouped: list[str] = []
    current_group = ""
    for index, line in enumerate(lines):
        groups = _distance_groups(line)
        if groups and len(line) <= 32:
            current_group = groups[0]
        if current_group and "起跑" in line:
            for candidate in lines[index + 1:index + 4]:
                time = _time_text(candidate)
                if time:
                    grouped.append(_format_start_time(current_group, time))
                    break
        if len(grouped) >= 8:
            return "、".join(dict.fromkeys(grouped))
    if grouped:
        return "、".join(dict.fromkeys(grouped))

    text = " ".join(lines)
    snippets: list[str] = []
    pattern = r"((?:\d+(?:\.\d+)?\s?(?:K|KM|公里|k|km)|半馬|全馬|挑戰組|休閒組|健走組).{0,30}?(?:起跑|鳴槍|出發).{0,30}?(?:[01]?\d|2[0-3])[:：][0-5]\d)"
    for match in re.finditer(pattern, text, flags=re.IGNORECASE):
        snippet = compact_text(match.group(1)).replace(" ：", " ")
        time = _time_text(snippet)
        groups = _distance_groups(snippet)
        if time and groups:
            snippets.extend(_format_start_time(group, time) for group in groups)
        if len(snippets) >= 8:
            break
    return "、".join(dict.fromkeys(snippets))


def status_from_text(text: str) -> str:
    snippet = compact_text(text[:4000])
    if any(keyword in snippet for keyword in ("停辦", "停賽", "取消辦理", "取消停辦")):
        return "停辦"
    if "額滿" in snippet:
        return "已截止"
    if any(keyword in snippet for keyword in ("報名中", "開放報名", "立即報名", "我要報名")):
        return "報名中"
    if any(keyword in snippet for keyword in ("報名截止", "截止報名", "已截止")):
        return "已截止"
    return ""


def generic_extract(html: str, race: dict) -> dict:
    lines = compact_lines(html)
    text = " ".join(lines)
    opens_at, deadline = extract_registration_dates(text, race.get("race_date", ""))
    return {
        "registration_opens_at": opens_at,
        "registration_deadline": deadline,
        "venue": find_label_value(lines, ("活動地點", "會場地點", "集合地點", "起跑地點", "地點")),
        "start_location": find_label_value(lines, ("活動地點", "會場地點", "集合地點", "起跑地點", "地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": find_label_value(lines, ("承辦單位", "承辦", "協辦單位", "協辦")),
        "fees": first_fee_text(text),
        "quota": first_quota_text(text),
        "start_times": extract_start_times(lines),
        "registration_status": status_from_text(text),
    }


def merge_details(*detail_sets: dict) -> dict:
    merged: dict = {}
    for details in detail_sets:
        for key, value in details.items():
            if has_text(value) and not has_text(merged.get(key)):
                merged[key] = value
    return merged
