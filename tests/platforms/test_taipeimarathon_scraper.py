from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from scrapers import taipeimarathon_scraper


def test_parse_registration_window_same_year():
    opens_at, deadline, status = taipeimarathon_scraper._parse_registration_window(
        "6月30日 ~ 10月13日",
        "2026-12-13",
    )

    assert opens_at == "2026-06-30"
    assert deadline == "2026-10-13"
    assert status in {"報名中", "未開始", "已截止"}


def test_parse_registration_window_previous_year_for_january_race():
    opens_at, deadline, _ = taipeimarathon_scraper._parse_registration_window(
        "5月01日 ~ 7月31日",
        "2027-01-09",
    )

    assert opens_at == "2026-05-01"
    assert deadline == "2026-07-31"


def test_parse_race_date_supports_month_rollover():
    first_date, first_month = taipeimarathon_scraper._parse_race_date("12/28 日 06:00", 2026)
    next_date, next_month = taipeimarathon_scraper._parse_race_date("01/09 六 04:00", 2027)

    assert first_date == "2026-12-28"
    assert first_month == 12
    assert next_date == "2027-01-09"
    assert next_month == 1
