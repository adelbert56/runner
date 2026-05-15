"""Scraper configuration for Runner Plaza."""

from pathlib import Path

# ─── Paths ───────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent.parent
OBSIDIAN_VAULT = ROOT_DIR / "runner"
RACE_LIST_MD = OBSIDIAN_VAULT / "赛事" / "2026-中部赛事列表.md"
RACE_DB_JSON = OBSIDIAN_VAULT / "赛事" / "赛事数据库.json"
RACE_MANUAL_OVERRIDES_JSON = OBSIDIAN_VAULT / "赛事" / "人工补充.json"
SCRAPE_LOG_MD = OBSIDIAN_VAULT / "赛事" / "爬虫日志.md"

# ─── Central Taiwan counties filter ──────────────────────────────────────────
CENTRAL_TAIWAN_COUNTIES = {
    "臺中市", "台中市",
    "南投縣", "南投县",
    "彰化縣", "彰化县",
    "苗栗縣", "苗栗县",
}

# ─── Source definitions ───────────────────────────────────────────────────────
SOURCES = {
    "sports_note": {
        "name": "運動筆記",
        "url": "https://running.biji.co/index.php?q=competition",
        "enabled": True,
    },
    "sportsnet": {
        "name": "中華民國路跑協會",
        "url": "https://www.sportsnet.org.tw/race.php",
        "enabled": True,
    },
    "twttra": {
        "name": "台灣越野跑協會",
        "url": "https://www.twttra.com/",
        "enabled": True,
    },
}

# ─── HTTP settings ────────────────────────────────────────────────────────────
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
}
REQUEST_TIMEOUT = 30
REQUEST_DELAY = 2  # seconds between requests

# ─── Difficulty mapping ───────────────────────────────────────────────────────
DIFFICULTY_MAP = {
    frozenset({"5K", "3K", "4K", "5k", "3k"}): "初級",
    frozenset({"10K", "9K", "8K", "10k", "9k"}): "初級",
    frozenset({"21K", "21.1km", "半馬", "半马"}): "中級",
    frozenset({"42K", "42.2km", "全馬", "全马", "馬拉松"}): "中級",
    frozenset({"50K", "60K", "100K", "越野", "登山"}): "高級",
}

def infer_difficulty(distances: list[str]) -> str:
    """Infer difficulty from distance list."""
    text = " ".join(distances).upper()
    if any(k in text for k in ("越野", "TRAIL", "登山", "100K", "50K", "60K")):
        return "高級"
    if any(k in text for k in ("42", "全馬")):
        return "中級"
    if any(k in text for k in ("21", "半馬")):
        return "中級"
    if any(k in text for k in ("10K", "9K", "8K")):
        return "初級"
    return "初級"
