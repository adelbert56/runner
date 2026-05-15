"""Debug: inspect real HTML of sportsnet + twttra."""
import requests
from bs4 import BeautifulSoup

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def debug_site(name, url, max_links=12):
    print(f"\n{'='*60}")
    print(f"  {name}: {url}")
    print('='*60)
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.encoding = "utf-8"
        print(f"Status: {resp.status_code}")
    except Exception as e:
        print(f"FAILED: {e}")
        return

    soup = BeautifulSoup(resp.text, "html.parser")

    # Show elements with race/event/list/comp in class
    print("\n--- Elements with race/event/list/comp class ---")
    seen = set()
    for el in soup.find_all(True):
        cls = " ".join(el.get("class", []))
        if any(k in cls.lower() for k in ["race","event","list","item","comp","table","activity"]):
            key = f"{el.name}:{cls}"
            if key not in seen:
                seen.add(key)
                txt = el.get_text(strip=True)[:60]
                print(f"  <{el.name} class='{cls}'> {repr(txt)}")

    # First links
    print(f"\n--- First {max_links} a[href] ---")
    for a in soup.select("a[href]")[:max_links]:
        href = a.get("href","")[:70]
        txt = a.get_text(strip=True)[:40]
        print(f"  {href} | {txt}")

    # Tables
    tables = soup.select("table")
    print(f"\n--- Tables found: {len(tables)} ---")
    for i, t in enumerate(tables[:3]):
        rows = t.select("tr")
        print(f"  table[{i}]: {len(rows)} rows, first row: {rows[0].get_text()[:80] if rows else 'empty'}")

debug_site("sportsnet race.php", "https://www.sportsnet.org.tw/race.php")
debug_site("twttra homepage", "https://www.twttra.com/")
debug_site("twttra races", "https://www.twttra.com/races/")
