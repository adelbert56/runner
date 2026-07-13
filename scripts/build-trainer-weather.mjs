// Build site/data/trainer-weather.json from the CWA (中央氣象署) open data
// "臺灣各縣市鄉鎮未來1週逐12小時天氣預報" dataset (F-D0047-091).
//
// Runs server-side so the CWA API key never reaches the browser — trainer.html
// only fetches the resulting static JSON. Requires CWA_API_KEY (GitHub Actions
// secret in CI; set a local env var or .env for manual runs).
// Usage: node scripts/build-trainer-weather.mjs

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const TARGET = resolve(root, "site/data/trainer-weather.json");
const DATASET_ID = "F-D0047-091";

const COUNTIES = ["臺中市", "彰化縣", "南投縣", "苗栗縣"];

async function resolveApiKey() {
  if (process.env.CWA_API_KEY) return process.env.CWA_API_KEY;
  try {
    const env = await import("node:fs/promises").then((fs) => fs.readFile(resolve(root, ".env"), "utf-8"));
    const match = env.match(/^CWA_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    // no .env — fall through
  }
  return null;
}

function parseCountyForecast(location) {
  const rainEl = location.WeatherElement.find((w) => w.ElementName === "12小時降雨機率");
  const tempEl = location.WeatherElement.find((w) => w.ElementName === "最高溫度");
  const byDate = {};
  const ensure = (date) => (byDate[date] ||= { tmax: null, rain: null, morningRain: null, eveningRain: null });

  (tempEl?.Time || []).forEach((block) => {
    const startHour = block.StartTime.slice(11, 13);
    const date = block.StartTime.slice(0, 10);
    if (startHour !== "06") return;
    const value = Number(block.ElementValue?.[0]?.MaxTemperature);
    if (Number.isFinite(value)) ensure(date).tmax = value;
  });

  (rainEl?.Time || []).forEach((block) => {
    const startHour = block.StartTime.slice(11, 13);
    const endHour = block.EndTime.slice(11, 13);
    // 只處理夜間區塊（18:00→次日06:00）：同時代表「起始日的傍晚」與「結束日的清晨」
    if (startHour !== "18" || endHour !== "06") return;
    const value = Number(block.ElementValue?.[0]?.ProbabilityOfPrecipitation);
    if (!Number.isFinite(value)) return;
    ensure(block.StartTime.slice(0, 10)).eveningRain = value;
    ensure(block.EndTime.slice(0, 10)).morningRain = value;
  });

  Object.values(byDate).forEach((entry) => {
    const values = [entry.morningRain, entry.eveningRain].filter((v) => Number.isFinite(v));
    entry.rain = values.length ? Math.max(...values) : null;
  });

  return byDate;
}

async function main() {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    console.error("CWA_API_KEY not set (env var or .env). Aborting.");
    process.exitCode = 1;
    return;
  }

  const params = new URLSearchParams({ Authorization: apiKey });
  const response = await fetch(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/${DATASET_ID}?${params.toString()}`);
  if (!response.ok) {
    console.error(`CWA API ${response.status} ${response.statusText}`);
    process.exitCode = 1;
    return;
  }
  const payload = await response.json();
  const locations = payload?.records?.Locations?.[0]?.Location || [];

  const counties = {};
  COUNTIES.forEach((name) => {
    const location = locations.find((loc) => loc.LocationName === name);
    if (location) counties[name] = parseCountyForecast(location);
  });

  const output = {
    updatedAt: new Date().toISOString(),
    source: "CWA F-D0047-091",
    counties,
  };
  await writeFile(TARGET, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  console.log(`Trainer weather written to ${TARGET} (${Object.keys(counties).length} counties)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
