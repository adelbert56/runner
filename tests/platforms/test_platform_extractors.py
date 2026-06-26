from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from platforms import focusline, lohas
from platforms.common import extract_start_times


def test_focusline_extract_uses_api_payload(monkeypatch):
    payload = """
    {
      "location": "臺中市和平區梨山賓館",
      "register": {
        "start": "2026-05-01T00:00:00",
        "end": "2026-06-30T23:59:59"
      },
      "displayLabel": "正在報名中",
      "maxPeople": 3318
    }
    """.strip()

    monkeypatch.setattr(focusline, "request_text", lambda *args, **kwargs: payload)

    details = focusline.extract("<html><body></body></html>", {}, "https://www.focusline.com.tw/260823KM")

    assert details["venue"] == "臺中市和平區梨山賓館"
    assert details["registration_opens_at"] == "2026-05-01"
    assert details["registration_deadline"] == "2026-06-30"
    assert details["registration_status"] == "報名中"
    assert details["quota"] == "3,318人"


def test_lohas_extract_reads_signup_countdown_deadline():
    html = """
    <html>
      <body>
        <script>
          $('#timercount').countdown('2026-09-30 23:59:59', function(event) {});
        </script>
      </body>
    </html>
    """.strip()

    details = lohas.extract(html, {}, "https://signup.lohasnet.tw/signup/4261")

    assert details["registration_deadline"] == "2026-09-30"


def test_lohas_extract_prefers_signup_deadline_and_live_status(monkeypatch):
    event_html = """
    <html>
      <body>
        <a href="https://signup.lohasnet.tw/signup/4240">我要報名</a>
        <div>報名截止</div>
        <div>組別</div>
        <div>全馬組</div><div>(42K)</div>
        <div>半馬組</div><div>(21K)</div>
        <div>挑戰組</div><div>(13K)</div>
        <div>樂活組</div><div>(5K)</div>
        <div>報名費用</div>
        <div>1,400</div><div>1,300</div><div>1,000</div><div>800</div>
        <div>開放名額</div>
        <div>1,500 人</div><div>1,500 人</div><div>1,000 人</div><div>1,000 人</div>
        <div>起跑時間</div>
        <div>06:00</div><div>06:10</div><div>06:20</div><div>06:30</div>
      </body>
    </html>
    """.strip()
    signup_html = """
    <script>
      $('#timercount').countdown('2099-10-11 23:59:59', function(event) {});
    </script>
    """.strip()

    monkeypatch.setattr(lohas, "request_text", lambda *args, **kwargs: signup_html)

    details = lohas.extract(event_html, {}, "https://lohasnet.tw/BNM40thMarathon2026/")

    assert details["registration_link"] == "https://signup.lohasnet.tw/signup/4240"
    assert details["registration_deadline"] == "2099-10-11"
    assert details["registration_status"] == "報名中"
    assert details["fees"] == "42K 1400元、21K 1300元、13K 1000元、5K 800元"
    assert details["quota"] == "42K 1,500人、21K 1,500人、13K 1,000人、5K 1,000人"
    assert details["start_times"] == "全馬組(42K) 起跑 06:00、半馬組(21K) 起跑 06:10、挑戰組(13K) 起跑 06:20、樂活組(5K) 起跑 06:30"


def test_extract_start_times_handles_grouped_schedule_rows():
    lines = [
        "07：30",
        "路跑組(10公里 )",
        "健康組(6公里)",
        "選手起跑",
        "07：45",
        "趣味組(3公里)",
        "選手起跑",
        "09：30",
        "頒獎",
    ]

    assert extract_start_times(lines) == "10K 起跑 07:30、6K 起跑 07:30、3K 起跑 07:45"
