import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";

const root = resolve(import.meta.dirname, "..");
const today = process.env.RUNNER_TODAY || todayInTaipei();
const paths = {
  races: resolve(root, "site/data/races.json"),
  quips: resolve(root, "site/data/runner-quips.json"),
  output: resolve(root, "site/data/announcements.json"),
};

const typePriority = {
  new: 10,
  opening: 20,
  ending: 30,
  closing: 40,
  closed: 50,
  talk: 90,
  notice: 100,
};

const typeMeta = {
  new: { label: "新增賽事", tone: "primary" },
  opening: { label: "報名開始", tone: "blue" },
  ending: { label: "快截止", tone: "warning" },
  closing: { label: "即將截止", tone: "warning" },
  closed: { label: "已截止", tone: "closed" },
  talk: { label: "跑者碎念", tone: "muted" },
  notice: { label: "公告", tone: "muted" },
};

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value) {
  const target = parseDate(value);
  const anchor = parseDate(today);
  if (!target || !anchor) return null;
  return Math.ceil((target - anchor) / 86400000);
}

function dateValue(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function shortDate(value) {
  const text = String(value || "").slice(0, 10);
  const [, month, day] = text.match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
  return month && day ? `${month}/${day}` : "";
}

function isCancelledRace(race) {
  const text = [race.race_name, race.registration_status, race.registration_note, race.verification_note].filter(Boolean).join(" ");
  return /停辦|停賽|取消|被迫取消|cancel/i.test(text);
}

function hasSuspiciousRegistrationDates(race) {
  const opensAt = race.registration_opens_at || "";
  const deadline = race.registration_deadline || "";
  const note = `${race.registration_note || ""} ${race.verification_note || ""}`;
  if (opensAt && deadline && opensAt === deadline && !/當日報名|現場報名|單日報名/.test(note)) return true;
  return Boolean(opensAt && deadline && String(opensAt).slice(0, 10) > String(deadline).slice(0, 10));
}

function displayStatus(race) {
  if (isCancelledRace(race)) return race.registration_status || "停辦";
  const opensDays = daysUntil(race.registration_opens_at);
  const deadlineDays = daysUntil(race.registration_deadline);
  if (deadlineDays !== null && deadlineDays < 0) return "已截止";
  if (opensDays !== null && !hasSuspiciousRegistrationDates(race)) {
    if (opensDays > 0) return "尚未開報";
    return deadlineDays !== null && deadlineDays <= 14 ? "即將截止" : "報名中";
  }
  const sourceStatus = race.registration_status || "";
  if (/報名中|開放|開跑|受理/.test(sourceStatus)) return deadlineDays !== null && deadlineDays <= 14 ? "即將截止" : "報名中";
  if (/截止|額滿/.test(sourceStatus)) return deadlineDays !== null && deadlineDays >= 0 ? "即將截止" : "已截止";
  return sourceStatus || "狀態待確認";
}

function formatRaceTitle(race) {
  const date = shortDate(race.race_date) || "日期待確認";
  const county = race.race_county || "地點待確認";
  return `${date} ${county}｜${race.race_name || "未命名賽事"}`;
}

function raceKey(race) {
  return race.race_id || `${race.race_name || ""}|${race.race_date || ""}`;
}

function normalizeTypes(types) {
  return [...new Set(types)].sort((a, b) => typePriority[a] - typePriority[b]);
}

function priority(item) {
  return Math.min(...item.types.map((type) => typePriority[type] || 100));
}

function rotateDaily(items, count) {
  if (items.length <= count) return items;
  const start = Math.max(0, daysUntil("2026-01-01") || 0) % items.length;
  return Array.from({ length: count }, (_, index) => items[(start + index) % items.length]);
}

const [racesRaw, quipsRaw] = await Promise.all([
  readFile(paths.races, "utf-8"),
  readFile(paths.quips, "utf-8"),
]);

const races = JSON.parse(racesRaw);
const quips = JSON.parse(quipsRaw);
const raceItems = new Map();

function addRaceAnnouncement(race, type, detail) {
  const key = raceKey(race);
  const item = raceItems.get(key) || {
    id: key,
    race_key: key,
    title: formatRaceTitle(race),
    types: [],
    details: [],
    race_date: race.race_date || "",
    first_seen_at: race.first_seen_at || "",
  };
  item.types.push(type);
  if (detail && !item.details.includes(detail)) item.details.push(detail);
  raceItems.set(key, item);
}

const upcoming = races.filter((race) => String(race.race_date || "") >= today && !isCancelledRace(race));
const latestSeenAt = upcoming.reduce((latest, race) => Math.max(latest, dateValue(race.first_seen_at || race.scraped_at)), 0);
const oneDayMs = 24 * 60 * 60 * 1000;
const latestBatchIsFresh = latestSeenAt && dateValue(today) - latestSeenAt <= 14 * oneDayMs;
const latestBatch = latestBatchIsFresh
  ? upcoming.filter((race) => latestSeenAt - dateValue(race.first_seen_at || race.scraped_at) <= oneDayMs)
  : [];

latestBatch
  .filter((race) => displayStatus(race) !== "已截止" || (daysUntil(race.first_seen_at || String(race.scraped_at || "").slice(0, 10)) ?? -999) >= -14)
  .sort((a, b) => dateValue(b.first_seen_at || b.scraped_at) - dateValue(a.first_seen_at || a.scraped_at))
  .slice(0, 4)
  .forEach((race) => {
    const status = displayStatus(race);
    const seen = String(race.first_seen_at || race.scraped_at || "").slice(0, 10).replaceAll("-", "/") || "最新批次";
    addRaceAnnouncement(race, status === "已截止" ? "closed" : "new", `${seen} 收到`);
  });

upcoming
  .filter((race) => {
    const days = daysUntil(race.registration_opens_at);
    return days !== null && days >= 0 && days <= 14;
  })
  .sort((a, b) => String(a.registration_opens_at).localeCompare(String(b.registration_opens_at)))
  .slice(0, 3)
  .forEach((race) => addRaceAnnouncement(race, "opening", `${shortDate(race.registration_opens_at)} 開放報名｜倒數 ${daysUntil(race.registration_opens_at)} 天`));

upcoming
  .filter((race) => {
    const days = daysUntil(race.registration_deadline);
    return days !== null && days >= 0 && days <= 14;
  })
  .sort((a, b) => String(a.registration_deadline).localeCompare(String(b.registration_deadline)))
  .slice(0, 3)
  .forEach((race) => {
    const days = daysUntil(race.registration_deadline);
    addRaceAnnouncement(race, days <= 7 ? "ending" : "closing", `${shortDate(race.registration_deadline)} 截止｜剩 ${days} 天`);
  });

const raceAnnouncements = [...raceItems.values()]
  .map((item) => ({
    ...item,
    types: normalizeTypes(item.types),
  }))
  .sort((a, b) => priority(a) - priority(b) || a.title.localeCompare(b.title, "zh-Hant"));

const quipItems = rotateDaily((Array.isArray(quips.items) ? quips.items : []).filter(Boolean), 2).map((quip, index) => ({
  id: `quip-${today}-${index}`,
  title: quip,
  types: ["talk"],
  details: ["每日更新"],
}));

const items = [...raceAnnouncements, ...quipItems];
const output = {
  generated_at: today,
  retention: {
    closed_notice_days: 14,
    daily_quips: 2,
  },
  type_meta: typeMeta,
  items: items.length ? items : [{ id: `notice-${today}`, title: "目前沒有新的賽事提醒，先把鞋帶綁好等下一輪資料更新。", types: ["notice"], details: [] }],
};

await writeFile(paths.output, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
console.log(`Built ${output.items.length} announcements.`);
