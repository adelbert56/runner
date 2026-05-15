import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dataPath = resolve(root, "site/data/races.json");
const queuePath = resolve(root, "runner/赛事/待补资料队列.json");
const reportPath = resolve(root, "runner/赛事/资料品质报告.md");

const sourceDomains = ["running.biji.co"];

const fieldGroups = [
  {
    key: "official_registration_link",
    label: "官方報名連結",
    severity: "high",
    hasValue: (race) => Boolean(getOfficialRegistrationLink(race)),
    hint: "補 registration_link，避免只連到運動筆記登入/紀錄頁。",
  },
  {
    key: "registration_opens_at",
    label: "開報時間",
    severity: "medium",
    hasValue: (race) => hasText(race.registration_opens_at),
    hint: "補 registration_opens_at，格式 YYYY-MM-DD。",
  },
  {
    key: "registration_deadline",
    label: "報名截止時間",
    severity: "medium",
    hasValue: (race) => hasText(race.registration_deadline),
    hint: "補 registration_deadline，格式 YYYY-MM-DD。",
  },
  {
    key: "precise_location",
    label: "精確地點",
    severity: "medium",
    hasValue: (race) => firstText(race.venue, race.location, race.race_location, race.start_location, race.address),
    hint: "補 venue 或 start_location，不要只到縣市。",
  },
  {
    key: "organizer",
    label: "主辦單位",
    severity: "medium",
    hasValue: (race) => firstText(race.organizer, race.organizer_name, race.host, race.host_organization),
    hint: "補 organizer 或 host。",
  },
  {
    key: "fees",
    label: "費用",
    severity: "low",
    hasValue: (race) => firstText(race.fees, race.fee, race.price, race.registration_fee),
    hint: "補 fees，可用字串或分組物件。",
  },
  {
    key: "quota",
    label: "名額",
    severity: "low",
    hasValue: (race) => firstText(race.quota, race.participant_limit, race.capacity),
    hint: "補 quota 或 participant_limit。",
  },
  {
    key: "verified_at",
    label: "資料查證時間",
    severity: "low",
    hasValue: (race) => firstText(race.verified_at, race.last_verified_at, race.data_verified_at),
    hint: "補 verified_at，表示人工或爬蟲最後查證日。",
  },
];

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function firstText(...values) {
  return values.some(hasText);
}

function isSourceLink(url) {
  if (!hasText(url)) {
    return false;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    return sourceDomains.some((domain) => host.endsWith(domain));
  } catch {
    return false;
  }
}

function getOfficialRegistrationLink(race) {
  const link = race.registration_link || "";
  return hasText(link) && !isSourceLink(link) ? link : "";
}

function raceKey(race) {
  return race.race_id || `${race.race_name || ""}|${race.race_date || ""}`;
}

function priorityScore(missing) {
  return missing.reduce((score, item) => {
    if (item.severity === "high") {
      return score + 5;
    }
    if (item.severity === "medium") {
      return score + 3;
    }
    return score + 1;
  }, 0);
}

function buildQueueItem(race) {
  const missing = fieldGroups
    .filter((field) => !field.hasValue(race))
    .map(({ key, label, severity, hint }) => ({ key, label, severity, hint }));
  return {
    race_id: race.race_id || "",
    race_name: race.race_name || "",
    race_date: race.race_date || "",
    race_county: race.race_county || "",
    priority_score: priorityScore(missing),
    missing,
    current_links: {
      registration_link: race.registration_link || "",
      detail_url: race.detail_url || "",
      source_registration_link: race.source_registration_link || "",
      facebook_search_url: race.facebook_search_url || "",
    },
    suggested_override: {
      race_name: race.race_name || "",
      race_date: race.race_date || "",
      registration_link: "",
      registration_opens_at: "",
      registration_deadline: "",
      venue: "",
      organizer: "",
      fees: "",
      quota: "",
      verified_at: "",
      verification_note: "",
    },
  };
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function completionRate(total, missingCount) {
  if (!total) {
    return "0%";
  }
  return `${Math.round(((total - missingCount) / total) * 100)}%`;
}

function formatReport(races, queue) {
  const missingByField = Object.fromEntries(fieldGroups.map((field) => [field.key, 0]));
  for (const item of queue) {
    for (const missing of item.missing) {
      missingByField[missing.key] += 1;
    }
  }

  const byCounty = countBy(queue, (item) => item.race_county || "未標縣市");
  const highPriority = queue
    .filter((item) => item.missing.some((missing) => missing.severity === "high"))
    .slice(0, 12);
  const generatedAt = new Date().toISOString();

  return [
    "# 資料品質報告",
    "",
    `產生時間：${generatedAt}`,
    `資料來源：site/data/races.json`,
    "",
    "## 總覽",
    "",
    `- 賽事總數：${races.length}`,
    `- 待補賽事：${queue.length}`,
    `- 完整度：${completionRate(races.length, queue.length)}`,
    "",
    "## 欄位缺漏",
    "",
    "| 欄位 | 缺漏筆數 | 完整度 |",
    "| --- | ---: | ---: |",
    ...fieldGroups.map((field) => `| ${field.label} | ${missingByField[field.key]} | ${completionRate(races.length, missingByField[field.key])} |`),
    "",
    "## 縣市待補量",
    "",
    "| 縣市 | 待補筆數 |",
    "| --- | ---: |",
    ...Object.entries(byCounty)
      .sort((a, b) => b[1] - a[1])
      .map(([county, count]) => `| ${county} | ${count} |`),
    "",
    "## 優先補資料",
    "",
    "| 日期 | 賽事 | 縣市 | 缺漏 |",
    "| --- | --- | --- | --- |",
    ...highPriority.map((item) => `| ${item.race_date} | ${item.race_name} | ${item.race_county} | ${item.missing.map((missing) => missing.label).join("、")} |`),
    "",
    "## 使用方式",
    "",
    "1. 打開 `runner/赛事/待补资料队列.json` 找 priority_score 高的賽事。",
    "2. 用官方網站、報名平台、主辦單位公告或臉書活動頁補資料。",
    "3. 把確認過的欄位寫進 `runner/赛事/人工补充.json`。",
    "4. 重跑爬蟲或資料同步後，再跑 `npm run data:quality` 檢查缺漏是否下降。",
    "",
  ].join("\n");
}

async function main() {
  const raw = await readFile(dataPath, "utf-8");
  const races = JSON.parse(raw);
  const queue = races
    .map(buildQueueItem)
    .filter((item) => item.missing.length)
    .sort((a, b) => b.priority_score - a.priority_score || String(a.race_date).localeCompare(String(b.race_date)) || String(a.race_name).localeCompare(String(b.race_name)));

  await mkdir(dirname(queuePath), { recursive: true });
  await writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf-8");
  await writeFile(reportPath, formatReport(races, queue), "utf-8");

  const highPriority = queue.filter((item) => item.missing.some((missing) => missing.severity === "high")).length;
  console.log(`Races: ${races.length}`);
  console.log(`Needs follow-up: ${queue.length}`);
  console.log(`Missing official registration link: ${highPriority}`);
  console.log(`Wrote: ${queuePath}`);
  console.log(`Wrote: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
