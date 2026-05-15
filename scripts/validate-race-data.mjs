import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dataPath = resolve(root, "site/data/races.json");
const queuePath = resolve(root, "runner/赛事/待补资料队列.json");
const reportPath = resolve(root, "runner/赛事/资料品质报告.md");
const trackingPath = resolve(root, "runner/赛事/爬虫追踪计划.md");
const trackingJsonPath = resolve(root, "runner/赛事/爬虫追踪计划.json");
const openedGapReportPath = resolve(root, "runner/赛事/开报后待补资料报告.md");
const openedGapJsonPath = resolve(root, "runner/赛事/开报后待补资料报告.json");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TODAY = process.env.RUNNER_TODAY || new Date().toISOString().slice(0, 10);

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

function isOfficialDirect(race) {
  if (race.is_official_direct === true) {
    return true;
  }
  return Boolean(getOfficialRegistrationLink(race));
}

function isCancelledRace(race) {
  const text = [
    race.race_name,
    race.registration_status,
    race.registration_note,
    race.verification_note,
  ].filter(hasText).join(" ");
  return /停辦|停賽|取消|被迫取消|cancel/i.test(text);
}

function raceKey(race) {
  return race.race_id || `${race.race_name || ""}|${race.race_date || ""}`;
}

function parseDate(value) {
  if (!hasText(value)) {
    return null;
  }
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  if (!date) {
    return "";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextMonthlyCheckpoint(date) {
  const day = date.getDate();
  const next = new Date(date);

  if (day < 15) {
    next.setDate(15);
    return next;
  }

  next.setMonth(next.getMonth() + 1, 1);
  return next;
}

function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) {
    return null;
  }
  return Math.ceil((toDate - fromDate) / MS_PER_DAY);
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

function trackingPlanForRace(race, missing, todayText = TODAY) {
  const today = parseDate(todayText);
  const raceDate = parseDate(race.race_date);
  const opensAt = parseDate(race.registration_opens_at);
  const deadline = parseDate(race.registration_deadline);
  const hasImportantMissing = missing.some((item) => ["high", "medium"].includes(item.severity));
  const daysToRace = daysBetween(today, raceDate);
  const daysToOpen = daysBetween(today, opensAt);
  const missingLabels = missing.map((item) => item.label).join("、");

  if (isCancelledRace(race)) {
    return {
      status: "cancelled",
      status_label: "停辦/停賽，停止追蹤",
      next_check_date: "",
      cadence: "none",
      reason: missing.length
        ? `活動已停辦或停賽，只需保留查證紀錄。仍缺：${missingLabels}。`
        : "活動已停辦或停賽，不再追地點、費用、名額等商品化欄位。",
    };
  }

  if (!missing.length) {
    return {
      status: "complete",
      status_label: "資料完整",
      next_check_date: "",
      cadence: "none",
      reason: "目前品質檢查欄位都已有資料。",
    };
  }

  if (raceDate && daysToRace < 0) {
    return {
      status: "archive_gap",
      status_label: "賽事已過，低頻補齊",
      next_check_date: todayText,
      cadence: "manual",
      reason: `賽事已過但仍缺：${missingLabels}。除非要補歷史資料，優先度較低。`,
    };
  }

  if (deadline && daysBetween(today, deadline) < 0) {
    return {
      status: "closed_gap",
      status_label: "已截止，低頻補齊",
      next_check_date: todayText,
      cadence: "manual",
      reason: `報名已截止但仍缺：${missingLabels}。保留供歷史資料補齊。`,
    };
  }

  if (opensAt) {
    if (daysToOpen > 14) {
      return {
        status: "wait_until_open_window",
        status_label: "等待接近開報",
        next_check_date: formatDate(addDays(opensAt, -14)),
        cadence: "weekly_near_open",
        reason: `已知開報日 ${formatDate(opensAt)}，開報前 14 天再開始追蹤。`,
      };
    }
    if (daysToOpen >= -30) {
      return {
        status: "due_now",
        status_label: "現在該重爬",
        next_check_date: todayText,
        cadence: "every_3_days",
        reason: `開報窗口已到，應重爬官方報名、地點、主辦、費用與名額。缺：${missingLabels}。`,
      };
    }
    return {
      status: hasImportantMissing ? "due_now" : "monitor_weekly",
      status_label: hasImportantMissing ? "現在該重爬" : "每週追蹤",
      next_check_date: todayText,
      cadence: hasImportantMissing ? "weekly" : "biweekly",
      reason: `開報日已過，仍缺：${missingLabels}。`,
    };
  }

  if (daysToRace !== null) {
    if (daysToRace <= 120) {
      return {
        status: "due_now",
        status_label: "現在該重爬",
        next_check_date: todayText,
        cadence: "weekly",
        reason: `距離賽事 ${daysToRace} 天且開報日未知，應每週追蹤報名頁是否釋出。`,
      };
    }
    if (daysToRace <= 240) {
      return {
        status: "monitor_monthly",
        status_label: "每月追蹤",
        next_check_date: formatDate(nextMonthlyCheckpoint(today)),
        cadence: "monthly_1_15",
        reason: `距離賽事 ${daysToRace} 天，可能尚未釋出完整資訊，先固定每月 1 號與 15 號檢查。`,
      };
    }
    return {
      status: "wait_future",
      status_label: "未來再查",
      next_check_date: formatDate(addDays(raceDate, -180)),
      cadence: "future",
      reason: `距離賽事 ${daysToRace} 天，先排到賽前約 180 天再追。`,
    };
  }

  return {
    status: "due_now",
    status_label: "現在該重爬",
    next_check_date: todayText,
    cadence: "weekly",
    reason: `缺賽事日期或追蹤基準，需人工確認。缺：${missingLabels}。`,
  };
}

function buildQueueItem(race) {
  const rawMissing = fieldGroups
    .filter((field) => !field.hasValue(race))
    .map(({ key, label, severity, hint }) => ({ key, label, severity, hint }));
  const missing = isCancelledRace(race)
    ? rawMissing.filter((item) => item.key === "verified_at")
    : rawMissing;
  const tracking = trackingPlanForRace(race, missing);
  return {
    race_id: race.race_id || "",
    race_name: race.race_name || "",
    race_date: race.race_date || "",
    race_county: race.race_county || "",
    registration_opens_at: race.registration_opens_at || "",
    registration_deadline: race.registration_deadline || "",
    registration_status: race.registration_status || "",
    source_platform: race.source_platform || race.source || "",
    is_official_direct: isOfficialDirect(race),
    priority_score: priorityScore(missing),
    tracking,
    missing,
    current_links: {
      registration_link: race.registration_link || "",
      official_event_url: race.official_event_url || "",
      detail_url: race.detail_url || "",
      source_registration_link: race.source_registration_link || "",
      facebook_search_url: race.facebook_search_url || "",
    },
    suggested_override: {
      race_name: race.race_name || "",
      race_date: race.race_date || "",
      registration_link: "",
      official_event_url: "",
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

function openedGapItems(queue, todayText = TODAY) {
  const today = parseDate(todayText);
  return queue
    .filter((item) => {
      const opensAt = parseDate(item.registration_opens_at);
      if (!opensAt || daysBetween(opensAt, today) < 0) {
        return false;
      }
      if (item.tracking.status === "cancelled" || item.tracking.status === "archive_gap") {
        return false;
      }
      return item.missing.some((missing) => ["high", "medium"].includes(missing.severity));
    })
    .sort((a, b) => {
      const deadlineCompare = String(a.registration_deadline || "9999-99-99").localeCompare(String(b.registration_deadline || "9999-99-99"));
      return deadlineCompare || b.priority_score - a.priority_score || String(a.race_date).localeCompare(String(b.race_date));
    });
}

function gapAction(item) {
  if (item.missing.some((missing) => missing.key === "official_registration_link")) {
    return "先找官方報名或活動頁，避免只留運動筆記。";
  }
  if (item.current_links.registration_link || item.current_links.official_event_url) {
    return "官方頁已存在，人工查欄位或為此平台新增專用解析器。";
  }
  return "用賽事名稱搜尋官方頁與粉專公告。";
}

function formatOpenedGapReport(items) {
  const generatedAt = new Date().toISOString();
  const lines = [
    "# 開報後待補資料報告",
    "",
    `產生時間：${generatedAt}`,
    `追蹤基準日：${TODAY}`,
    "",
    "這份報告只列「開報日已經開始，但官方資料仍補不齊」的賽事。這些才是需要優先人工查證或新增專用爬蟲的平台。",
    "",
    `目前共 ${items.length} 場。`,
    "",
    "| 開報 | 截止 | 賽事 | 縣市 | 狀態 | 缺漏 | 官方/報名頁 | 建議 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of items) {
    const link = item.current_links.official_event_url || item.current_links.registration_link || item.current_links.detail_url || item.current_links.facebook_search_url || "";
    lines.push([
      item.registration_opens_at || "-",
      item.registration_deadline || "-",
      item.race_name,
      item.race_county,
      item.registration_status || "-",
      item.missing.map((missing) => missing.label).join("、"),
      link || "待搜尋",
      gapAction(item),
    ].map((value) => String(value).replaceAll("|", "｜")).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
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

function trackingSummary(queue) {
  return countBy(queue, (item) => item.tracking.status_label || "未分類");
}

function formatReport(races, queue) {
  const missingByField = Object.fromEntries(fieldGroups.map((field) => [field.key, 0]));
  for (const item of queue) {
    for (const missing of item.missing) {
      missingByField[missing.key] += 1;
    }
  }

  const byCounty = countBy(queue, (item) => item.race_county || "未標縣市");
  const byTracking = trackingSummary(queue);
  const highPriority = queue
    .filter((item) => item.missing.some((missing) => missing.severity === "high"))
    .slice(0, 12);
  const dueNow = queue
    .filter((item) => item.tracking.status === "due_now")
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
    "## 追蹤節奏",
    "",
    "| 狀態 | 筆數 |",
    "| --- | ---: |",
    ...Object.entries(byTracking)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => `| ${status} | ${count} |`),
    "",
    "## 現在該重爬",
    "",
    "| 日期 | 賽事 | 縣市 | 下次檢查 | 原因 |",
    "| --- | --- | --- | --- | --- |",
    ...dueNow.map((item) => `| ${item.race_date} | ${item.race_name} | ${item.race_county} | ${item.tracking.next_check_date} | ${item.tracking.reason} |`),
    "",
    "## 優先補資料",
    "",
    "| 日期 | 賽事 | 縣市 | 缺漏 |",
    "| --- | --- | --- | --- |",
    ...highPriority.map((item) => `| ${item.race_date} | ${item.race_name} | ${item.race_county} | ${item.missing.map((missing) => missing.label).join("、")} |`),
    "",
    "## 使用方式",
    "",
    "1. 先看 `runner/赛事/爬虫追踪计划.md`，依「現在該重爬」與「等待接近開報」安排爬蟲。",
    "2. 爬蟲抓不到但人工查到的欄位，寫進 `runner/赛事/人工补充.json`。",
    "3. 跑 `npm run data:refresh` 套用人工補充並重產報告。",
    "4. 賽事只公布日期時，不急著人工補完；讓追蹤排程在開報窗口前後提醒重查。",
    "",
  ].join("\n");
}

function formatTrackingPlan(queue) {
  const generatedAt = new Date().toISOString();
  const sections = [
    ["due_now", "現在該重爬"],
    ["wait_until_open_window", "等待接近開報"],
    ["monitor_monthly", "每月追蹤"],
    ["wait_future", "未來再查"],
    ["cancelled", "停辦/停賽，停止追蹤"],
    ["closed_gap", "已截止，低頻補齊"],
    ["archive_gap", "賽事已過，低頻補齊"],
  ];

  const lines = [
    "# 爬蟲追蹤計畫",
    "",
    `產生時間：${generatedAt}`,
    `追蹤基準日：${TODAY}`,
    "",
    "這份清單不是要求一次補完資料，而是依賽事資料公開節奏安排重查。很多賽事會先公布日期，等接近開報才補上報名頁、地點、主辦、費用與名額。",
    "",
  ];

  for (const [status, title] of sections) {
    const items = queue.filter((item) => item.tracking.status === status);
    lines.push(`## ${title}`, "");
    if (!items.length) {
      lines.push("目前沒有賽事。", "");
      continue;
    }
    lines.push("| 下次檢查 | 日期 | 賽事 | 縣市 | 節奏 | 缺漏 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const item of items.slice(0, 30)) {
      lines.push(`| ${item.tracking.next_check_date || "-"} | ${item.race_date} | ${item.race_name} | ${item.race_county} | ${item.tracking.cadence} | ${item.missing.map((missing) => missing.label).join("、")} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
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
  await writeFile(trackingPath, formatTrackingPlan(queue), "utf-8");
  const openedGaps = openedGapItems(queue);
  await writeFile(openedGapReportPath, formatOpenedGapReport(openedGaps), "utf-8");
  await writeFile(openedGapJsonPath, `${JSON.stringify(openedGaps, null, 2)}\n`, "utf-8");
  await writeFile(trackingJsonPath, `${JSON.stringify(queue.map((item) => ({
    race_id: item.race_id,
    race_name: item.race_name,
    race_date: item.race_date,
    race_county: item.race_county,
    source_platform: item.source_platform,
    is_official_direct: item.is_official_direct,
    priority_score: item.priority_score,
    tracking: item.tracking,
    missing: item.missing.map((missing) => missing.key),
    current_links: item.current_links,
  })), null, 2)}\n`, "utf-8");

  const highPriority = queue.filter((item) => item.missing.some((missing) => missing.severity === "high")).length;
  const dueNow = queue.filter((item) => item.tracking.status === "due_now").length;
  console.log(`Races: ${races.length}`);
  console.log(`Needs follow-up: ${queue.length}`);
  console.log(`Due to crawl now: ${dueNow}`);
  console.log(`Opened registration gaps: ${openedGaps.length}`);
  console.log(`Missing official registration link: ${highPriority}`);
  console.log(`Wrote: ${queuePath}`);
  console.log(`Wrote: ${reportPath}`);
  console.log(`Wrote: ${trackingPath}`);
  console.log(`Wrote: ${openedGapReportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
