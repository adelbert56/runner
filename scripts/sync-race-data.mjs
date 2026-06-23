import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";

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
  is_official_direct: isOfficialDirect(race),
}));

await writeFile(source, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`Synced ${source} -> ${target}`);
