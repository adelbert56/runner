import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "runner/賽事/賽事資料庫.json");
const target = resolve(root, "site/data/races.json");

function firstSeenDate(race) {
  return String(race.first_seen_at || race.scraped_at || todayInTaipei()).slice(0, 10);
}

let races;
try {
  races = JSON.parse(await readFile(source, "utf-8"));
} catch {
  console.warn(`Source not found: ${source}. Writing empty races.json.`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, "[]\n", "utf-8");
  process.exit(0);
}

const normalized = races.map((race) => ({
  ...race,
  first_seen_at: firstSeenDate(race),
}));

await writeFile(source, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`Synced ${source} -> ${target}`);
