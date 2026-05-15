import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const overridePath = resolve(root, "runner/赛事/人工补充.json");
const raceDbPaths = [
  resolve(root, "runner/赛事/赛事数据库.json"),
  resolve(root, "site/data/races.json"),
];

function keyFor(row) {
  return `${String(row.race_name || "").trim()}||${String(row.race_date || "").trim()}`;
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
    if (key === "||") {
      continue;
    }
    const fields = Object.fromEntries(
      Object.entries(row).filter(([field, value]) => {
        return !["race_name", "race_date"].includes(field) && value !== null && value !== "";
      })
    );
    overrides.set(key, fields);
  }
  return overrides;
}

function applyOverrides(races, overrides) {
  let updatedFields = 0;
  let updatedRaces = 0;
  const next = races.map((race) => {
    const fields = overrides.get(keyFor(race));
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
  const overrides = normalizeOverrides(await loadJson(overridePath, []));
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
