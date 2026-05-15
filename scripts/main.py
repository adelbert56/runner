"""Runner Plaza — Race Scraper entry point.

Usage:
    python main.py               # run all scrapers
    python main.py --dry-run     # scrape only, no file writes
    python main.py --source sports_note   # single source
"""

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

# Local imports
sys.path.insert(0, str(Path(__file__).parent))
from config import SOURCES, RACE_DB_JSON
from scrapers import sports_note_scraper, sportsnet_scraper, twttra_scraper
from processors.race_normalizer import normalize_all
from processors.dedup import load_existing, merge, save
from obsidian_writer import write_race_list, append_scrape_log

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("main")

SCRAPER_MAP = {
    "sports_note": sports_note_scraper,
    "sportsnet":   sportsnet_scraper,
    "twttra":      twttra_scraper,
}


def main(dry_run: bool = False, sources: list[str] | None = None) -> None:
    now = datetime.now(tz=timezone.utc).astimezone()
    scrape_date = now.strftime("%Y-%m-%d %H:%M")

    active_sources = sources or [k for k, v in SOURCES.items() if v.get("enabled")]
    errors: list[str] = []
    all_raw: list[dict] = []

    # ── Scrape ──────────────────────────────────────────────────────────────
    for src_key in active_sources:
        scraper = SCRAPER_MAP.get(src_key)
        if not scraper:
            logger.warning(f"Unknown source: {src_key}")
            continue
        try:
            logger.info(f"=== Running {src_key} scraper ===")
            races = scraper.scrape()
            all_raw.extend(races)
            logger.info(f"{src_key}: scraped {len(races)} races")
        except Exception as e:
            msg = f"{src_key}: {e}"
            logger.error(msg, exc_info=True)
            errors.append(msg)

    logger.info(f"Total raw races collected: {len(all_raw)}")

    # ── Normalize ────────────────────────────────────────────────────────────
    normalized = normalize_all(all_raw)
    logger.info(f"After normalization: {len(normalized)} races")

    if dry_run:
        logger.info("[DRY RUN] Skipping file writes.")
        for r in normalized:
            print(f"  {r['race_date']} | {r['race_county']} | {r['race_name']}")
        return

    # ── Merge with existing DB ────────────────────────────────────────────────
    existing = load_existing(RACE_DB_JSON)
    merged_list, added, updated = merge(existing, normalized)
    logger.info(f"DB: +{added} new, ~{updated} updated, {len(merged_list)} total")

    # ── Save JSON DB ─────────────────────────────────────────────────────────
    save(RACE_DB_JSON, merged_list)

    # ── Update Obsidian Markdown ──────────────────────────────────────────────
    write_race_list(merged_list, scrape_date)

    # ── Append scrape log ─────────────────────────────────────────────────────
    append_scrape_log(
        scrape_date=scrape_date,
        added=added,
        updated=updated,
        total=len(merged_list),
        sources=[SOURCES[k]["name"] for k in active_sources if k in SOURCES],
        errors=errors,
    )

    logger.info("=== Done ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Runner Plaza race scraper")
    parser.add_argument("--dry-run", action="store_true", help="Scrape without writing files")
    parser.add_argument(
        "--source", dest="sources", action="append",
        choices=list(SCRAPER_MAP.keys()),
        help="Limit to specific source (repeatable)",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run, sources=args.sources)
