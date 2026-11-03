import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from processors.dedup import _same_event, _url_tokens, merge


def test_shared_generic_landing_page_does_not_merge_unrelated_races():
    left = {"race_id": "bc", "race_name": "2027 第八屆BC台灣柏釧公益路跑", "race_date": "2027-02-21", "race_county": "臺中市", "official_event_url": "https://lohasnet.tw/#/", "detail_url": "https://running.biji.co/index.php?q=competition&act=info&cid=13184", "scraped_at": "2026-11-03"}
    right = {"race_id": "wheat", "race_name": "2027 晨曦麥香馬拉松", "race_date": "2027-02-21", "race_county": "臺中市", "official_event_url": "https://lohasnet.tw/#/event", "detail_url": "https://running.biji.co/index.php?q=competition&act=info&cid=13170", "scraped_at": "2026-11-03"}
    assert not _url_tokens(left["official_event_url"])
    assert not _same_event(left, right)
    result, added, _ = merge({"existing": left}, [right])
    assert added == 1 and len(result) == 2


def test_matching_event_id_still_allows_date_correction():
    left = {"race_name": "同場賽事", "race_date": "2027-02-01", "detail_url": "https://running.biji.co/index.php?q=competition&act=info&cid=123"}
    right = {"race_name": "同場賽事", "race_date": "2027-03-01", "detail_url": "https://running.biji.co/index.php?act=info&cid=123&q=competition"}
    assert _same_event(left, right)


def test_different_source_event_ids_override_shared_specific_link():
    left = {"race_name": "活動甲", "race_date": "2027-02-21", "race_county": "臺中市", "registration_link": "https://lohasnet.tw/shared-event", "detail_url": "https://running.biji.co/index.php?cid=13184"}
    right = {"race_name": "活動乙", "race_date": "2027-02-21", "race_county": "臺中市", "registration_link": "https://lohasnet.tw/shared-event", "detail_url": "https://running.biji.co/index.php?cid=13170"}
    assert not _same_event(left, right)
