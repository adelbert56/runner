from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from platforms import baoming, focusline, lohas
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


def test_baoming_extract_prefers_structured_sections():
    html = """
    <html>
      <body>
        <div class="page-info">
          <div class="row">
            <h3>主辦單位：</h3>
            <div class="text-break">國立臺灣體育運動大學、財團法人蔡長啓體育基金會</div>
          </div>
        </div>
        <ul>
          <li class="list-group-item d-flex flex-wrap">
            <h6 class="text-dark mt-3">報名起訖：</h6>
            <h6 class="text-dark mt-3">2026-05-08<span> 16:30:00</span> <i></i> 2026-10-23<span> 18:00:00</span></h6>
          </li>
          <li class="list-group-item">
            <h6 class="text-dark mt-3">報名限額：依報名項目上限</h6>
          </li>
        </ul>
        <div class="card css-header1">
          <div class="py-2 px-3">競賽地點</div>
          <div class="card-body"><div class="py-3">國立臺灣體育運動大學田徑場(臺中市北區力行路271號)。</div></div>
        </div>
        <div class="card css-header1">
          <div class="py-2 px-3">承辦單位</div>
          <div class="card-body"><div class="py-3">國立臺灣體育運動大學 運動賽會中心</div></div>
        </div>
        <div class="card css-header1">
          <div class="py-2 px-3">報名辦法</div>
          <div class="card-body">
            <div class="py-3">
              21KM接力組，報名費用為每隊新臺幣2,400元整。
              21KM個人半馬組，報名費用為每人新臺幣600元整。
            </div>
          </div>
        </div>
        <a href="//www.facebook.com/EBBaoming/">伊貝特報名網</a>
        <a href="#reg">馬上報名 Sign Up</a>
      </body>
    </html>
    """.strip()

    details = baoming.extract(html, {"race_date": "2026-11-21"}, "https://bao-ming.com/eb/content/7016#32884")

    assert details["registration_link"] == "https://bao-ming.com/eb/content/7016#reg"
    assert details["registration_opens_at"] == "2026-05-08"
    assert details["registration_deadline"] == "2026-10-23"
    assert details["venue"] == "國立臺灣體育運動大學田徑場(臺中市北區力行路271號)。"
    assert details["start_location"] == "國立臺灣體育運動大學田徑場(臺中市北區力行路271號)。"
    assert details["organizer"] == "國立臺灣體育運動大學、財團法人蔡長啓體育基金會"
    assert details["co_organizer"] == "國立臺灣體育運動大學 運動賽會中心"
    assert details["quota"] == "依報名項目上限"
    assert details["fees"] == "21KM接力組 2400元、21KM個人半馬組 600元"
