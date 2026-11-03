import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";
import { compactRaces, strongIdentityTokens } from "./lib/race-dedupe.mjs";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "runner/賽事/賽事資料庫.json");
const target = resolve(root, "site/data/races.json");

function firstSeenDate(race) {
  return String(race.first_seen_at || race.scraped_at || todayInTaipei()).slice(0, 10);
}

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSourceLink(url) {
  const host = hostOf(url);
  return host.endsWith("running.biji.co");
}

function isGenericRegistrationLink(url) {
  if (!hasText(url)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (host === "irunner.biji.co") {
      return path === "" || path === "/irunner" || path === "/list";
    }
    if (host === "signup.lohasnet.tw") {
      return path === "" || path === "/" || path === "/member" || path === "/event/score";
    }
    if (host === "lohasnet.tw") {
      return path === "" || path === "/" || path === "/#/inquiry";
    }
    if (host === "www.focusline.com.tw") {
      return path === "" || path === "/";
    }
    return false;
  } catch {
    return true;
  }
}

function isOfficialDirect(race) {
  return [race.registration_link, race.official_event_url].some((url) => {
    return hasText(url) && !isSourceLink(url) && !isGenericRegistrationLink(url);
  });
}

const today = todayInTaipei();

function raceKey(race) {
  return `${String(race.race_name || "").trim()}||${String(race.race_date || "").slice(0, 10)}`;
}

let races;
try {
  races = JSON.parse(await readFile(source, "utf-8"));
  if (!Array.isArray(races) || races.length === 0) throw new Error("賽事正本不是非空陣列");
} catch (error) {
  console.error(`無法讀取有效賽事正本，保留現有網站資料：${error.message}`);
  process.exit(1);
}

let previousRaces = [];
try {
  previousRaces = JSON.parse(await readFile(target, "utf-8"));
} catch {
  // first run or target doesn't exist yet
}

const { races: uniqueRaces, merges } = compactRaces(races);
if (merges.length) {
  console.warn(`Suppressed ${merges.length} strong-identity duplicate race(s) from site output.`);
}

// Only transfer forecasts when the exact name and date match uniquely on both sides.
const countKeys = (list) => list.reduce((map, race) => map.set(raceKey(race), (map.get(raceKey(race)) || 0) + 1), new Map());
const oldCounts = countKeys(previousRaces);
const newCounts = countKeys(uniqueRaces);
const oldByKey = new Map(previousRaces.map((race) => [raceKey(race), race]));
function forecastTime(race, forecast) {
  if (!forecast || forecast.forecast_for !== String(race.race_date || '').slice(0, 10)) return 0;
  const stamp = Date.parse(forecast.updated_at);
  return Number.isFinite(stamp) ? stamp : 0;
}
const normalized = uniqueRaces.map((race) => ({
  ...race,
  ...(oldCounts.get(raceKey(race)) === 1 && newCounts.get(raceKey(race)) === 1 &&
    forecastTime(race, oldByKey.get(raceKey(race))?.weather_forecast) > forecastTime(race, race.weather_forecast)
    ? { weather_forecast: oldByKey.get(raceKey(race)).weather_forecast } : {}),
  first_seen_at: firstSeenDate(race),
  is_official_direct: isOfficialDirect(race),
}));

await writeFile(source, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");

// Disappearance detection: only run when new data looks plausible (guards against total scraper failure)
const newKeySet = new Set(normalized.map(raceKey));
const newIdentityTokenSet = new Set(normalized.flatMap(strongIdentityTokens));
const disappeared = normalized.length >= 3
  ? previousRaces
      .filter((r) => {
        if (newKeySet.has(raceKey(r))) return false;
        if (strongIdentityTokens(r).some((token) => newIdentityTokenSet.has(token))) return false;
        return String(r.race_date || "").slice(0, 10) >= today;
      })
      .map((r) => r.disappeared_at ? r : { ...r, disappeared_at: today })
  : [];

if (disappeared.length) {
  console.log(`Carrying ${disappeared.length} disappeared upcoming race(s):`, disappeared.map(raceKey));
}

const output = [...normalized, ...disappeared];
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
console.log(`Synced ${normalized.length} races -> ${target}${disappeared.length ? ` (+${disappeared.length} disappeared)` : ""}`);
