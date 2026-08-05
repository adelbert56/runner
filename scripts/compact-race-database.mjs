import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compactRaces } from "./lib/race-dedupe.mjs";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "runner/賽事/賽事資料庫.json");
const reportPath = resolve(root, "runner/賽事/重複賽事合併報告.json");

const source = JSON.parse(await readFile(sourcePath, "utf-8"));
if (!Array.isArray(source)) throw new Error(`Expected an array in ${sourcePath}`);

const { races, merges } = compactRaces(source);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(sourcePath, `${JSON.stringify(races, null, 2)}\n`, "utf-8");
await writeFile(reportPath, `${JSON.stringify({ generated_at: new Date().toISOString(), source_count: source.length, output_count: races.length, merges }, null, 2)}\n`, "utf-8");
console.log(`Compacted ${source.length} source races -> ${races.length}; merged ${merges.length}.`);
console.log(`Wrote: ${reportPath}`);
