"""Write scraped race data back into Obsidian Markdown files."""

import re
import logging
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent))
from config import RACE_LIST_MD, SCRAPE_LOG_MD

logger = logging.getLogger(__name__)

STATUS_EMOJI = {
    "報名中": "✅",
    "已截止": "❌",
    "未開始": "⏳",
    "未知": "❓",
}

DIFFICULTY_EMOJI = {
    "初級": "🟢",
    "中級": "🟡",
    "高級": "🔴",
}


def _build_race_table(races: list[dict]) -> str:
    """Build a Markdown table for one month's races."""
    header = "| 賽事名稱 | 日期 | 地點 | 距離 | 難度 | 狀態 | 開報 | 截止 | 報名 |\n"
    sep    = "|--------|------|------|------|------|------|------|------|------|\n"
    rows = []
    for r in races:
        name = r["race_name"]
        date = r["race_date"]
        county = r["race_county"]
        dist = " / ".join(r.get("distances", ["未知"]))
        diff = DIFFICULTY_EMOJI.get(r.get("difficulty", ""), "") + r.get("difficulty", "初級")
        status = STATUS_EMOJI.get(r.get("registration_status", ""), "❓") + r.get("registration_status", "未知")
        opens_at = r.get("registration_opens_at", "") or "待確認"
        deadline = r.get("registration_deadline", "") or "待確認"
        link = r.get("registration_link", "")
        reg_cell = f"[報名]({link})" if link else "待補"
        rows.append(f"| {name} | {date} | {county} | {dist} | {diff} | {status} | {opens_at} | {deadline} | {reg_cell} |")
    return header + sep + "\n".join(rows)


def write_race_list(races: list[dict], scrape_date: str) -> None:
    """Overwrite the Obsidian race list with fresh data."""
    # Group by month
    by_month: dict[str, list[dict]] = defaultdict(list)
    for r in races:
        date = r.get("race_date", "")
        month = date[5:7] if len(date) >= 7 else "00"
        by_month[month].append(r)

    month_names = {
        "01": "1月", "02": "2月", "03": "3月", "04": "4月",
        "05": "5月", "06": "6月", "07": "7月", "08": "8月",
        "09": "9月", "10": "10月", "11": "11月", "12": "12月",
    }

    sections = []
    for month in sorted(by_month.keys()):
        label = month_names.get(month, f"{month}月")
        table = _build_race_table(sorted(by_month[month], key=lambda r: r["race_date"]))
        sections.append(f"## {label}賽事\n\n{table}")

    total = len(races)
    content = (
        "---\n"
        "標題: 中部跑步賽事彙總\n"
        f"更新: {scrape_date}\n"
        "來源: 自動爬蟲\n"
        "狀態: 維護中\n"
        "---\n\n"
        "# 中部跑步賽事彙總\n\n"
        f"> 共 **{total}** 場賽事。最後更新：{scrape_date}\n\n"
        "> 難度：🟢 初級 ｜ 🟡 中級 ｜ 🔴 高級\n"
        "> 狀態：✅ 報名中 ｜ ❌ 已截止 ｜ ⏳ 未開始 ｜ ❓ 未知\n\n"
        + "\n\n".join(sections)
        + "\n\n---\n\n"
        "## 相關連結\n"
        "- [[投稿指南]]\n"
        "- [[标签体系]]\n"
        "- [[爬虫日志]]\n"
    )

    RACE_LIST_MD.parent.mkdir(parents=True, exist_ok=True)
    RACE_LIST_MD.write_text(content, encoding="utf-8")
    logger.info(f"Updated {RACE_LIST_MD} ({total} races)")


def append_scrape_log(
    scrape_date: str,
    added: int,
    updated: int,
    total: int,
    sources: list[str],
    errors: list[str],
) -> None:
    """Append a run summary to 爬虫日志.md."""
    error_section = ""
    if errors:
        error_section = "\n**錯誤**:\n" + "\n".join(f"- {e}" for e in errors)

    entry = (
        f"\n---\n\n"
        f"## {scrape_date}\n\n"
        f"- **新增**: {added} 場\n"
        f"- **更新**: {updated} 場\n"
        f"- **資料庫總計**: {total} 場\n"
        f"- **來源**: {', '.join(sources)}\n"
        f"{error_section}\n"
    )

    SCRAPE_LOG_MD.parent.mkdir(parents=True, exist_ok=True)
    if not SCRAPE_LOG_MD.exists():
        SCRAPE_LOG_MD.write_text(
            "---\n標題: 爬蟲執行日誌\n狀態: 維護中\n---\n\n# 爬蟲執行日誌\n",
            encoding="utf-8"
        )

    with SCRAPE_LOG_MD.open("a", encoding="utf-8") as f:
        f.write(entry)
    logger.info(f"Appended to {SCRAPE_LOG_MD}")
