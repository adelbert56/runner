import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";

const root = resolve(import.meta.dirname, "..");
const overrideXlsxPath = resolve(root, "runner/賽事/人工補充.xlsx");
const overrideJsonPath = resolve(root, "runner/賽事/人工補充.json");
const raceDbPaths = [
  resolve(root, "runner/賽事/賽事資料庫.json"),
  resolve(root, "site/data/races.json"),
];

// 跟 Excel 表頭一一對應；新增欄位時兩邊都要同步改（init-manual-overrides-xlsx.mjs 也要改）。
const XLSX_FIELDS = [
  "race_name",
  "race_date",
  "registration_status",
  "registration_note",
  "registration_opens_at",
  "registration_deadline",
  "registration_link",
  "official_event_url",
  "venue",
  "start_location",
  "organizer",
  "co_organizer",
  "supervising_organizer",
  "sponsor",
  "market_organizer",
  "fees",
  "quota",
  "distances",
  "start_times",
  "event_time",
  "verified_at",
  "verification_note",
];

async function fileExists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

function parseXlsxCell(field, value) {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value).trim();
  if (!text) {
    return "";
  }
  if (field === "distances") {
    return text.split("/").map((item) => item.trim()).filter(Boolean);
  }
  // Some races store start_times as an object (e.g. {"42km":"06:00"})
  // instead of a delimited string. init-manual-overrides-xlsx.mjs
  // JSON.stringifies those into the cell — parse it back here so the
  // object shape round-trips instead of collapsing into a raw JSON string
  // that downstream string-splitting logic would then mis-parse.
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

async function loadOverrideRows() {
  if (await fileExists(overrideXlsxPath)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(overrideXlsxPath);
    const ws = wb.getWorksheet("人工補充") ?? wb.worksheets[0];
    if (!ws) {
      return [];
    }
    const rows = [];
    for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber += 1) {
      const row = ws.getRow(rowNumber);
      const entry = {};
      XLSX_FIELDS.forEach((field, index) => {
        const value = parseXlsxCell(field, row.getCell(index + 1).value);
        if (value !== "" && !(Array.isArray(value) && value.length === 0)) {
          entry[field] = value;
        }
      });
      if (entry.race_name || entry.race_date) {
        rows.push(entry);
      }
    }
    return rows;
  }
  return loadJson(overrideJsonPath, []);
}

function keyFor(row) {
  return `${String(row.race_name || "").trim()}||${String(row.race_date || "").trim()}`;
}

function normalizedName(value) {
  return String(value || "")
    .trim()
    .replace(/台/g, "臺")
    .replace(/^(?:20\d{2}|1\d{2})\s*/, "")
    .replace(/[\s\-–—_/()（）【】\[\]．.、，,:：'\"「」『』]+/g, "")
    .toLowerCase();
}

function normalizedKeyFor(row) {
  return `${normalizedName(row.race_name)}||${String(row.race_date || "").trim()}`;
}

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function normalizeOverrides(rows) {
  const overrides = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    const normalizedKey = normalizedKeyFor(row);
    if (key === "||") {
      continue;
    }
    const fields = Object.fromEntries(
      Object.entries(row).filter(([field, value]) => {
        return !["race_name", "race_date"].includes(field) && value !== null && value !== "";
      })
    );
    overrides.set(key, fields);
    if (normalizedKey !== "||") {
      overrides.set(normalizedKey, fields);
    }
  }
  return overrides;
}

function applyOverrides(races, overrides) {
  let updatedFields = 0;
  let updatedRaces = 0;
  const next = races.map((race) => {
    const fields = overrides.get(keyFor(race)) || overrides.get(normalizedKeyFor(race));
    if (!fields) {
      return race;
    }
    let changed = false;
    const updated = { ...race };
    for (const [field, value] of Object.entries(fields)) {
      const nextValue = value === "__CLEAR__" ? "" : value;
      if (updated[field] !== nextValue) {
        updated[field] = nextValue;
        updatedFields += 1;
        changed = true;
      }
    }
    if (changed) {
      updatedRaces += 1;
    }
    return updated;
  });
  return { races: next, updatedFields, updatedRaces };
}

async function main() {
  const overrides = normalizeOverrides(await loadOverrideRows());
  if (!overrides.size) {
    console.log("No manual overrides to apply.");
    return;
  }

  for (const path of raceDbPaths) {
    const races = await loadJson(path, []);
    const result = applyOverrides(races, overrides);
    await writeFile(path, `${JSON.stringify(result.races, null, 2)}\n`, "utf-8");
    console.log(`${path}: ${result.updatedRaces} races, ${result.updatedFields} fields updated`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
