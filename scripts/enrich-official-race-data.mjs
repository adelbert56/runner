import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const raceDbPaths = [
  resolve(root, "runner/赛事/赛事数据库.json"),
  resolve(root, "site/data/races.json"),
];
const TODAY = process.env.RUNNER_TODAY || new Date().toISOString().slice(0, 10);
const OVERWRITE = process.argv.includes("--overwrite");

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function raceKey(row) {
  return `${String(row.race_name || "").trim()}||${String(row.race_date || "").trim()}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|td|th|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;/gi, " ");
}

function compactLines(html) {
  return stripHtml(html)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function findAfter(lines, label, stopLabels = []) {
  const index = lines.findIndex((line) => line === label || line.includes(label));
  if (index < 0) {
    return "";
  }
  for (const line of lines.slice(index + 1)) {
    if (stopLabels.some((stop) => line === stop || line.includes(stop))) {
      return "";
    }
    if (line && line !== label) {
      return line;
    }
  }
  return "";
}

function collectBetween(lines, startLabel, stopLabels) {
  const start = lines.findIndex((line) => line === startLabel || line.includes(startLabel));
  if (start < 0) {
    return [];
  }
  const values = [];
  for (const line of lines.slice(start + 1)) {
    if (stopLabels.some((stop) => line === stop || line.includes(stop))) {
      break;
    }
    values.push(line);
  }
  return values;
}

function firstMap(distances, values, suffix = "") {
  return distances
    .map((distance, index) => {
      const value = values[index];
      return hasText(value) ? `${distance} ${value}${suffix}` : "";
    })
    .filter(Boolean)
    .join("、");
}

function extractLohasDetails(html, race) {
  const lines = compactLines(html);
  const distances = (race.distances || []).filter(hasText);
  const feeValues = collectBetween(lines, "報名費用", ["晶片押金", "報名資訊"])
    .map((line) => line.match(/\$?\s*[\d,]+/)?.[0]?.replace(/\s+/g, "") || "")
    .filter(Boolean);
  const quotaValues = collectBetween(lines, "開放名額", ["報名資格", "活動資訊"])
    .map((line) => line.match(/[\d,]+\s*人/)?.[0]?.replace(/\s+/g, "") || "")
    .filter(Boolean);
  const depositValues = collectBetween(lines, "晶片押金", ["報名資訊", "開放名額"])
    .map((line) => line.match(/\$?\s*[\d,]+/)?.[0]?.replace(/\s+/g, "") || "")
    .filter(Boolean);

  const venue = findAfter(lines, "活動地點", ["活動日期", "活動時間", "報名資訊"]);
  const organizer = findAfter(lines, "主辦單位", ["承辦單位", "協辦單位", "贊助單位"]);
  const coOrganizer = findAfter(lines, "承辦單位", ["協辦單位", "贊助單位", "報名平台"]);
  const feeText = firstMap(distances, feeValues);
  const quotaText = firstMap(distances, quotaValues);
  const depositText = depositValues.length ? `晶片押金 ${depositValues[0]}` : "";

  return {
    venue,
    start_location: venue,
    organizer,
    co_organizer: coOrganizer,
    fees: [feeText, depositText].filter(Boolean).join("；"),
    quota: quotaText,
  };
}

function officialUrlFor(race) {
  const url = race.official_event_url || "";
  const host = hostOf(url);
  if (host.endsWith("lohasnet.tw") && !host.startsWith("signup.")) {
    return url;
  }
  return "";
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

function applyEnrichment(race, details, officialUrl) {
  const updated = { ...race };
  const changed = [];
  for (const [field, value] of Object.entries(details)) {
    if (!hasText(value)) {
      continue;
    }
    if (OVERWRITE || !hasText(updated[field])) {
      if (updated[field] !== value) {
        updated[field] = value;
        changed.push(field);
      }
    }
  }
  if (changed.length) {
    updated.official_event_url = officialUrl;
    updated.verified_at = TODAY;
    updated.verification_note = `官方頁自動補資料：${officialUrl}`;
  }
  return { race: updated, changed };
}

async function fetchOfficialDetails(race) {
  const officialUrl = officialUrlFor(race);
  if (!officialUrl) {
    return null;
  }
  const host = hostOf(officialUrl);
  const response = await fetch(officialUrl, {
    headers: {
      "user-agent": "RunnerPlazaDataBot/0.1 (+https://github.com/adelbert56/runner)",
      "accept-language": "zh-TW,zh;q=0.9,en;q=0.7",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  if (host.endsWith("lohasnet.tw")) {
    return { officialUrl, details: extractLohasDetails(html, race) };
  }
  return null;
}

async function enrichPath(path) {
  const races = await loadJson(path);
  let changedRaces = 0;
  let changedFields = 0;
  const next = [];

  for (const race of races) {
    const officialUrl = officialUrlFor(race);
    if (!officialUrl) {
      next.push(race);
      continue;
    }
    const result = await fetchOfficialDetails(race);
    if (!result) {
      next.push(race);
      continue;
    }
    const enriched = applyEnrichment(race, result.details, result.officialUrl);
    next.push(enriched.race);
    if (enriched.changed.length) {
      changedRaces += 1;
      changedFields += enriched.changed.length;
      console.log(`${raceKey(race)}: ${enriched.changed.join(", ")}`);
    }
  }

  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  console.log(`${path}: ${changedRaces} races, ${changedFields} fields enriched`);
}

async function main() {
  for (const path of raceDbPaths) {
    await enrichPath(path);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
