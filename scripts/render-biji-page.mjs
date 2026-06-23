import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0 || index + 1 >= process.argv.length) {
    return "";
  }
  return process.argv[index + 1];
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDate(raw, fallbackYear = "2026") {
  const text = compactText(raw).replace(/年/g, "/").replace(/月/g, "/").replace(/日/g, "");
  const full = text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (full) {
    const [, year, month, day] = full;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const short = text.match(/(\d{1,2})[./-](\d{1,2})/);
  if (short) {
    const [, month, day] = short;
    return `${fallbackYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return "";
}

function extractRegistrationDates(lines, raceDate = "") {
  const defaultYear = raceDate.slice(0, 4) || "2026";
  const joined = lines.join(" ");
  const rangeMatch = joined.match(
    /(?:報名日期|報名時間|報名期間)[^0-9]{0,20}(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}).{0,20}?(?:~|～|至|到|迄|-).{0,20}?(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2})/u,
  );
  if (rangeMatch) {
    return {
      registration_opens_at: normalizeDate(rangeMatch[1], defaultYear),
      registration_deadline: normalizeDate(rangeMatch[2], defaultYear),
    };
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/(報名日期|報名時間|報名期間)/u.test(line)) {
      continue;
    }
    const window = lines.slice(index, index + 6).join(" ");
    const match = window.match(
      /(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}).{0,20}?(?:~|～|至|到|迄|-).{0,20}?(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2})/u,
    );
    if (match) {
      return {
        registration_opens_at: normalizeDate(match[1], defaultYear),
        registration_deadline: normalizeDate(match[2], defaultYear),
      };
    }
  }

  return {
    registration_opens_at: "",
    registration_deadline: "",
  };
}

function detectExecutablePath() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

const url = argValue("--url");
const raceDate = argValue("--race-date");
if (!url) {
  console.error("Missing --url");
  process.exit(1);
}

const executablePath = detectExecutablePath();
if (!executablePath) {
  console.error("No Chrome or Edge executable found.");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
});

try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);

  const data = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const lines = bodyText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const anchors = [...document.querySelectorAll("a[href]")]
      .map((anchor) => ({
        text: (anchor.textContent || "").replace(/\s+/g, " ").trim(),
        href: anchor.href || "",
      }))
      .filter((item) => item.href);

    return {
      title: document.title || "",
      final_url: location.href,
      lines,
      anchors,
    };
  });

  const finalHost = (() => {
    try {
      return new URL(data.final_url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  const authRequired = finalHost.includes("h2u-auth") || /login/i.test(data.final_url);
  const dates = extractRegistrationDates(data.lines, raceDate);
  const registrationLink = data.anchors.find((item) => /signup|register|報名/i.test(`${item.text} ${item.href}`))?.href || "";

  process.stdout.write(
    `${JSON.stringify(
      {
        requested_url: url,
        final_url: data.final_url,
        title: data.title,
        auth_required: authRequired,
        registration_link: registrationLink,
        registration_opens_at: dates.registration_opens_at,
        registration_deadline: dates.registration_deadline,
        lines: data.lines,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await browser.close();
}
