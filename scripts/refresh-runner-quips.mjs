import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";

const root = resolve(import.meta.dirname, "..");
const activePath = resolve(root, "site/data/runner-quips.json");
const backlogPath = resolve(root, "runner/內容/跑者碎念候補.json");
const promoteCount = Number(process.env.RUNNER_QUIP_PROMOTE_COUNT || 2);

function normalizeItems(items) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean))];
}

const [activeRaw, backlogRaw] = await Promise.all([
  readFile(activePath, "utf8"),
  readFile(backlogPath, "utf8"),
]);

const active = JSON.parse(activeRaw);
const backlog = JSON.parse(backlogRaw);
const activeItems = normalizeItems(active.items);
const backlogItems = normalizeItems(backlog.items).filter((item) => !activeItems.includes(item));
const promoted = backlogItems.slice(0, promoteCount);

if (!promoted.length) {
  console.log("Runner quips backlog has no new items to promote.");
  process.exit(0);
}

const nextActive = {
  updated_at: todayInTaipei(),
  items: [...activeItems, ...promoted],
};
const nextBacklog = {
  items: backlogItems.slice(promoted.length),
};

await Promise.all([
  writeFile(activePath, `${JSON.stringify(nextActive, null, 2)}\n`, "utf8"),
  writeFile(backlogPath, `${JSON.stringify(nextBacklog, null, 2)}\n`, "utf8"),
]);

console.log(`Promoted ${promoted.length} runner quips.`);
