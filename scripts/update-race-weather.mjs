import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const raceDbPath = resolve(root, "runner/賽事/賽事資料庫.json");
const siteDataPath = resolve(root, "site/data/races.json");
const TODAY = process.env.RUNNER_TODAY || new Date().toISOString().slice(0, 10);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const countyCoordinates = {
  臺中市: { latitude: 24.1477, longitude: 120.6736, label: "臺中市" },
  台中市: { latitude: 24.1477, longitude: 120.6736, label: "臺中市" },
  彰化縣: { latitude: 24.0685, longitude: 120.5575, label: "彰化縣" },
  南投縣: { latitude: 23.9609, longitude: 120.9719, label: "南投縣" },
  苗栗縣: { latitude: 24.5602, longitude: 120.8214, label: "苗栗縣" },
};

function parseDate(value) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(fromText, toText) {
  const from = parseDate(fromText);
  const to = parseDate(toText);
  if (!from || !to) {
    return null;
  }
  return Math.ceil((to - from) / MS_PER_DAY);
}

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function coordinatesForRace(race) {
  const county = race.race_county || "";
  return countyCoordinates[county] || null;
}

function weatherCodeText(code) {
  if ([0].includes(code)) return "晴朗";
  if ([1, 2, 3].includes(code)) return "多雲";
  if ([45, 48].includes(code)) return "有霧";
  if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "降雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "降雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return "天氣待確認";
}

function forecastForDate(payload, race, coord) {
  const dates = payload?.daily?.time || [];
  const index = dates.indexOf(race.race_date);
  if (index < 0) {
    return null;
  }
  const min = payload.daily.temperature_2m_min?.[index];
  const max = payload.daily.temperature_2m_max?.[index];
  const rain = payload.daily.precipitation_probability_max?.[index];
  const wind = payload.daily.wind_speed_10m_max?.[index];
  const code = payload.daily.weather_code?.[index];
  const summary = [
    `${coord.label}縣市預報`,
    weatherCodeText(Number(code)),
    Number.isFinite(min) && Number.isFinite(max) ? `${Math.round(min)}-${Math.round(max)}°C` : "",
    Number.isFinite(rain) ? `降雨機率 ${Math.round(rain)}%` : "",
    Number.isFinite(wind) ? `最大風速 ${Math.round(wind)} km/h` : "",
  ].filter(Boolean).join("，");

  return {
    forecast_for: race.race_date,
    updated_at: new Date().toISOString(),
    source: "Open-Meteo",
    scope: "county",
    location_label: coord.label,
    summary,
    weather_code: Number.isFinite(code) ? code : null,
    temperature_min_c: Number.isFinite(min) ? min : null,
    temperature_max_c: Number.isFinite(max) ? max : null,
    precipitation_probability_max: Number.isFinite(rain) ? rain : null,
    wind_speed_max_kmh: Number.isFinite(wind) ? wind : null,
  };
}

async function fetchForecast(race, coord) {
  const params = new URLSearchParams({
    latitude: String(coord.latitude),
    longitude: String(coord.longitude),
    timezone: "Asia/Taipei",
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "wind_speed_10m_max",
    ].join(","),
    start_date: race.race_date,
    end_date: race.race_date,
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Open-Meteo ${response.status} ${response.statusText}`);
  }
  return forecastForDate(await response.json(), race, coord);
}

async function loadRaces(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

async function main() {
  const races = await loadRaces(raceDbPath);
  let updated = 0;
  let skipped = 0;

  for (const race of races) {
    const daysToRace = daysBetween(TODAY, race.race_date);
    const coord = coordinatesForRace(race);
    if (daysToRace === null || daysToRace < 0 || daysToRace > 7 || !coord) {
      if (race.weather_forecast && daysToRace !== null && (daysToRace < 0 || daysToRace > 7)) {
        delete race.weather_forecast;
        updated += 1;
      }
      continue;
    }
    try {
      const forecast = await fetchForecast(race, coord);
      if (forecast) {
        race.weather_forecast = forecast;
        updated += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      skipped += 1;
      console.warn(`${race.race_name || race.race_id}: ${error.message}`);
    }
  }

  const content = `${JSON.stringify(races, null, 2)}\n`;
  await writeFile(raceDbPath, content, "utf-8");
  await writeFile(siteDataPath, content, "utf-8");
  console.log(`Weather updated: ${updated}, skipped: ${skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
