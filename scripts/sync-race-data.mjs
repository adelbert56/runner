import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "runner/賽事/賽事資料庫.json");
const target = resolve(root, "site/data/races.json");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`Synced ${source} -> ${target}`);
