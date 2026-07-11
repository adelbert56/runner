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


def is_running_biji_url(url: str) -> bool:
    host = host_of(url)
    return host == "running.biji.co" or host == "www.running.biji.co"


def is_generic_registration_link(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return True
    host = parsed.netloc.lower()
    path = parsed.path.rstrip("/").lower()
    if not host:
        return True
    if host.endswith("google.com") and "/calendar/event" in path:
        return True
    if host == "irunner.biji.co":
        return path in {"", "/irunner", "/list"}
    if host == "signup.lohasnet.tw":
        return path in {"", "/", "/member", "/event/score"}
    if host == "lohasnet.tw":
        return path in {"", "/", "/#/inquiry"}
    if host == "www.focusline.com.tw":
        return path in {"", "/"}
    return False


def compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" ：:　\t\r\n")


def soup_from_html(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def extract_registration_link(html: str, base_url: str) -> str:
    soup = soup_from_html(html)
    keywords = ("報名", "我要報名", "立即報名", "線上報名", "signup", "register", "registration")
    preferred_tokens = ("signup", "register", "reg", "personal", "step1", "entry")
    candidates: list[str] = []
    preferred: list[str] = []

    for anchor in soup.select("a[href]"):
        href = anchor.get("href", "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = absolute_url(href, base_url)
        if is_running_biji_url(absolute):
            continue
        if is_generic_registration_link(absolute):
            continue
        text = compact_text(anchor.get_text(" ", strip=True)).lower()
        target = f"{text} {absolute.lower()}"
        if not any(keyword in target for keyword in keywords):
            continue
        if absolute not in candidates:
            candidates.append(absolute)
        if any(token in absolute.lower() for token in preferred_tokens) and absolute not in preferred:
            preferred.append(absolute)

    if preferred:
        return preferred[0]
    return candidates[0] if candidates else ""


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
    explicit = re.findall(r"(?:NT\$|NTD|\$)\s*\d{2,5}(?:,\d{3})?|\d{2,5}(?:,\d{3})?\s*元", text, flags=re.IGNORECASE)
    if explicit:
        return list(dict.fromkeys(compact_text(value) for value in explicit if compact_text(value)))
    if "費用" not in text and "報名費" not in text:
        return []
    fallback = re.findall(r"\b\d{2,5}(?:,\d{3})?\b", text)
    return list(dict.fromkeys(value for value in fallback if len(value.replace(",", "")) >= 3))


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
    label_pattern = r"(?:全程馬拉松組|半程馬拉松組|友善樂跑組|挑戰組|休閒組|健走組|健跑組|健康組|親子組|超半馬組|全馬組|身視障組)"
    composite_pattern = rf"{label_pattern}\s*[（(]\s*\d+(?:\.\d+)?\s?(?:K|KM|公里|k|km)\s*[）)]"
    # Organizers invent arbitrary group names (競賽組、簡單組、疾疾如風組、玄天戰神組...) that
    # never appear in `label_pattern`. Without this fallback, an unrecognized group silently
    # disappears while its start time is still picked up elsewhere, shifting every later
    # group/time pairing by one — the root cause behind repeated "wrong distance next to
    # wrong time" bugs. Any "<1-6 hanzi>組（distance）" is accepted generically.
    # Some organizers prefix the group name with a short wave/category code
    # (e.g. "EP全馬組"). Capture that prefix too instead of only matching from
    # the CJK "組" label, otherwise the code silently drops off the label.
    generic_composite_pattern = r"(?:[A-Za-z]{1,4})?[一-鿿]{1,6}組\s*[（(]\s*\d+(?:\.\d+)?\s?(?:K|KM|公里|k|km)\s*[）)]"
    group_pattern = rf"\d+(?:\.\d+)?\s?(?:K|KM|公里|k|km)|全程馬拉松|半程馬拉松|半馬|全馬|{label_pattern}"
    groups: list[str] = []
    occupied: list[tuple[int, int]] = []
    # generic_composite_pattern first: it's a superset of composite_pattern
    # (same label length bound, plus an optional ASCII prefix like "EP"), so
    # trying it first lets the fuller match claim the span before the
    # narrower whitelist pattern can grab a redundant, prefix-stripped copy.
    for pattern in (generic_composite_pattern, composite_pattern):
        for match in re.finditer(pattern, text):
            if any(start <= match.start() and match.end() <= end for start, end in occupied):
                continue
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
        elif group in ("全程馬拉松", "半程馬拉松"):
            group = "全馬" if group == "全程馬拉松" else "半馬"
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


def _start_time_rows_from_grouped_schedule(lines: list[str]) -> list[str]:
    rows: list[str] = []
    time_only = re.compile(r"^\s*([01]?\d|2[0-3])[:：][0-5]\d(?:\s*[~～-]\s*(?:[01]?\d|2[0-3])[:：][0-5]\d)?\s*$")
    start_keywords = ("起跑", "鳴槍", "出發")

    for index, line in enumerate(lines):
        if not time_only.match(line):
            continue
        time = _time_text(line)
        if not time:
            continue

        groups: list[str] = []
        found_start_line = False
        for candidate in lines[index + 1:index + 6]:
            if time_only.match(candidate):
                break
            if any(keyword in candidate for keyword in start_keywords):
                found_start_line = True
                break
            groups.extend(_distance_groups(candidate))

        if found_start_line and groups:
            rows.extend(_format_start_time(group, time) for group in dict.fromkeys(groups))
    return rows


def _start_time_rows_from_labeled_blocks(lines: list[str]) -> list[str]:
    """Handle accordion/table layouts where each group is its own block, but
    the group label and its time can appear in either order depending on the
    source site — group-then-time (biji.co: '競賽組（9K）'/'起跑'/'06:10') or
    time-then-group ('06:30'/'全馬組'/'半程馬拉松'/'選手起跑').

    The older forward/backward-only scanners assume one fixed order, so they
    silently grab a *neighboring* block's label or time when the real source
    uses the other order — shifting every pairing by one and dropping the
    last block. This instead treats it as nearest-neighbor matching: each
    group anchor pairs with whichever unused time-only line is closest to it
    by line distance, regardless of direction.
    """
    time_only = re.compile(r"^\s*([01]?\d|2[0-3])[:：][0-5]\d(?:\s*[~～-]\s*(?:[01]?\d|2[0-3])[:：][0-5]\d)?\s*$")
    anchors: list[tuple[int, str]] = []
    time_lines: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        if time_only.match(line):
            time = _time_text(line)
            if time:
                time_lines.append((index, time))
            continue
        groups = _distance_groups(line)
        if len(groups) == 1 and len(line) <= 24:
            anchors.append((index, groups[0]))
    if len(anchors) < 2 or not time_lines:
        return []

    candidates = sorted(
        (
            (abs(anchor_index - time_index), anchor_position, time_position)
            for anchor_position, (anchor_index, _group) in enumerate(anchors)
            for time_position, (time_index, _time) in enumerate(time_lines)
            if abs(anchor_index - time_index) <= 6
        ),
        key=lambda item: item[0],
    )
    assigned_time_for_anchor: dict[int, str] = {}
    used_times: set[int] = set()
    used_anchors: set[int] = set()
    for _distance, anchor_position, time_position in candidates:
        if anchor_position in used_anchors or time_position in used_times:
            continue
        assigned_time_for_anchor[anchor_position] = time_lines[time_position][1]
        used_anchors.add(anchor_position)
        used_times.add(time_position)

    rows = [
        _format_start_time(group, assigned_time_for_anchor[position])
        for position, (_index, group) in enumerate(anchors)
        if position in assigned_time_for_anchor
    ]
    return rows if len(rows) >= 2 else []


def _start_time_rows_from_inline(lines: list[str]) -> list[str]:
    """Handle lines where group name, time, and start keyword appear together (e.g. biji.co '組名 AM HH:MM 起跑')."""
    rows: list[str] = []
    start_keywords = ("起跑", "鳴槍", "出發")
    for line in lines:
        if not any(kw in line for kw in start_keywords):
            continue
        time = _time_text(line)
        if not time:
            continue
        groups = _distance_groups(line)
        for group in groups:
            rows.append(_format_start_time(group, time))
    return rows


def extract_start_times(lines: list[str]) -> str:
    table_rows = _start_time_rows_from_column_table(lines)
    if table_rows:
        return "、".join(dict.fromkeys(table_rows[:8]))

    direct = find_label_value(lines, ("開跑時間", "起跑時間", "鳴槍時間", "出發時間", "各組出發"))
    # Only return direct immediately when it carries group context, not just a bare time.
    # A bare time (e.g. "06:20") from a column header should fall through to richer parsers.
    direct_has_group = direct and _time_text(direct) and _distance_groups(direct)
    if direct_has_group:
        return direct

    # Try both the narrow-window scanner and the nearest-neighbor block
    # matcher, then keep whichever found more rows. A narrow-window scanner
    # can return a non-empty but silently *incomplete* result (e.g. it finds
    # 2 of 3 groups because the 3rd's start-keyword sits just outside its
    # look-ahead window) — taking the first non-empty result unconditionally
    # would lock in that incomplete answer instead of the more complete one.
    schedule_rows = _start_time_rows_from_schedule(lines)
    labeled_block_rows = _start_time_rows_from_labeled_blocks(lines)
    if schedule_rows or labeled_block_rows:
        best_rows = labeled_block_rows if len(labeled_block_rows) > len(schedule_rows) else schedule_rows
        return "、".join(dict.fromkeys(best_rows[:8]))

    grouped_schedule_rows = _start_time_rows_from_grouped_schedule(lines)
    if grouped_schedule_rows:
        return "、".join(dict.fromkeys(grouped_schedule_rows[:8]))

    inline_rows = _start_time_rows_from_inline(lines)
    if inline_rows:
        return "、".join(dict.fromkeys(inline_rows[:8]))

    grouped: list[str] = []
    current_group = ""
    _structural_labels = {"起跑時間", "開跑時間", "出發時間", "鳴槍時間", "各組出發", "起跑地點"}
    for index, line in enumerate(lines):
        groups = _distance_groups(line)
        if groups and len(line) <= 32:
            current_group = groups[0]
        if current_group and "起跑" in line and line not in _structural_labels:
            for candidate in lines[index + 1:index + 4]:
                time = _time_text(candidate)
                # Reject times buried in long lines (route descriptions, gate times, etc.)
                if time and len(candidate) <= 20:
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
    if snippets:
        return "、".join(dict.fromkeys(snippets))
    # Last resort: bare time from label (e.g. "起跑時間: 06:20" with no group info)
    return direct if (direct and _time_text(direct)) else ""


def status_from_text(text: str) -> str:
    snippet = compact_text(text[:4000])
    if "額滿" in snippet:
        return "已截止"
    if any(keyword in snippet for keyword in ("報名中", "開放報名", "立即報名", "我要報名")):
        return "報名中"
    if any(keyword in snippet for keyword in ("報名截止", "截止報名", "已截止")):
        return "已截止"
    return ""


def cancellation_notice(lines: list[str]) -> str:
    explicit_phrases = ("停辦", "停賽", "取消辦理", "取消停辦", "活動取消", "賽事取消", "取消賽事", "取消活動")
    conditional_markers = ("如遇", "若遇", "有權決定是否取消", "得取消", "宣布停止上課", "延期", "擇期", "改用其他替代路線")
    generic_reject_markers = (
        "違反下列規定者",
        "取消活動成績",
        "停辦資訊",
        "停辦賽事",
        "因不可抗力因素停辦",
        "若為主辦單位之因素停辦",
        "延期或停辦",
        "活動延期或停辦",
        "停辦（或延辦）",
        "停辦(或延辦)",
        "暫停賽",
        "停賽指示",
        "為什麼賽事延期或停辦",
        "拿不到錢",
        "安心退費",
        "退費",
    )
    for line in lines:
        snippet = compact_text(line)
        if not snippet:
            continue
        if any(marker in snippet for marker in conditional_markers):
            continue
        if any(marker in snippet for marker in generic_reject_markers):
            continue
        if re.match(r"^(停辦公告|停賽公告|活動停辦|賽事停辦|活動取消|賽事取消|\(?停辦\)?|\(?停賽\)?)", snippet):
            return snippet
        if any(keyword in snippet for keyword in explicit_phrases) and len(snippet) <= 80:
            return snippet
    return ""


def generic_extract(html: str, race: dict, source_url: str = "") -> dict:
    lines = compact_lines(html)
    text = " ".join(lines)
    opens_at, deadline = extract_registration_dates(text, race.get("race_date", ""))
    cancel_notice = cancellation_notice(lines)
    fee_block = " ".join(collect_between(lines, ("報名費用", "費用"), ("晶片押金", "開放名額", "限制名額", "名額", "活動資訊", "競賽獎勵", "報名資訊")))
    quota_block = " ".join(collect_between(lines, ("開放名額", "限制名額", "名額"), ("報名資格", "活動資訊", "報名費用", "費用", "活動路線")))
    return {
        "registration_link": extract_registration_link(html, race.get("official_event_url", "") or race.get("registration_link", "") or race.get("detail_url", "")),
        "registration_opens_at": opens_at,
        "registration_deadline": deadline,
        "venue": find_label_value(lines, ("活動地點", "會場地點", "集合地點", "起跑地點", "地點")),
        "start_location": find_label_value(lines, ("活動地點", "會場地點", "集合地點", "起跑地點", "地點")),
        "organizer": find_label_value(lines, ("主辦單位", "主辦")),
        "co_organizer": find_label_value(lines, ("承辦單位", "承辦", "協辦單位", "協辦")),
        "fees": first_fee_text(fee_block),
        "quota": first_quota_text(quota_block),
        "start_times": extract_start_times(lines),
        "registration_status": status_from_text(text),
        "cancellation_notice": cancel_notice,
        "cancellation_notice_url": source_url if cancel_notice and source_url else "",
    }


def merge_details(*detail_sets: dict) -> dict:
    merged: dict = {}
    for details in detail_sets:
        for key, value in details.items():
            if has_text(value) and not has_text(merged.get(key)):
                merged[key] = value
    return merged
