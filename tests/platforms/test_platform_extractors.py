from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from platforms import focusline, lohas


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
