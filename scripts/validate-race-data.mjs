import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dataPath = resolve(root, "site/data/races.json");
const queuePath = resolve(root, "runner/賽事/待補資料佇列.json");
const reportPath = resolve(root, "runner/賽事/資料品質報告.md");
const trackingPath = resolve(root, "runner/賽事/爬蟲追蹤計畫.md");
const trackingJsonPath = resolve(root, "runner/賽事/爬蟲追蹤計畫.json");
const openedGapReportPath = resolve(root, "runner/賽事/開報後待補資料報告.md");
const openedGapJsonPath = resolve(root, "runner/賽事/開報後待補資料報告.json");
const dateAnomalyReportPath = resolve(root, "runner/賽事/報名日期異常報告.md");
const dateAnomalyJsonPath = resolve(root, "runner/賽事/報名日期異常報告.json");
const startTimeQualityReportPath = resolve(root, "runner/賽事/起跑時間品質報告.md");
const startTimeQualityJsonPath = resolve(root, "runner/賽事/起跑時間品質報告.json");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TODAY = process.env.RUNNER_TODAY || new Date().toISOString().slice(0, 10);
const strictMode = process.argv.includes("--strict") || process.env.RUNNER_QUALITY_STRICT === "1";

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
    key: "start_times",
    label: "各距離開跑時間",
    severity: "low",
    hasValue: (race) => firstText(race.start_times, race.distance_start_times, race.wave_start_times, race.start_time, race.event_time),
    hint: "補 start_times，可用物件如 {\"21km\":\"06:00\"} 或字串。",
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

const coreFieldGroups = fieldGroups.filter((field) => !field.optional);

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

function registrationDateAnomalies(race) {
  const anomalies = [];
  const opensAt = parseDate(race.registration_opens_at);
  const deadline = parseDate(race.registration_deadline);
  const raceDate = parseDate(race.race_date);
  const note = [
    race.registration_note,
    race.verification_note,
  ].filter(hasText).join(" ");

  if (opensAt && deadline && formatDate(opensAt) === formatDate(deadline) && !/當日報名|現場報名|單日報名/.test(note)) {
    anomalies.push({
      key: "open_equals_deadline",
      label: "開報日與截止日相同",
      hint: "常見原因是把「即日起至截止日」誤解析成同一天；請回官方頁確認起訖。",
    });
  }
  if (opensAt && deadline && opensAt > deadline) {
    anomalies.push({
      key: "open_after_deadline",
      label: "開報日晚於截止日",
      hint: "報名日期順序不合理，需重新查證。",
    });
  }
  if (deadline && raceDate && deadline > raceDate) {
    anomalies.push({
      key: "deadline_after_race",
      label: "截止日晚於賽事日",
      hint: "截止日通常不應晚於賽事日，需確認是否年份解析錯誤。",
    });
  }
  return anomalies;
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

function parseDistanceKm(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function formatDistanceNumber(km) {
  if (!Number.isFinite(km) || km <= 0) {
    return "";
  }
  return Number.isInteger(km) ? `${km}K` : `${Number(km.toFixed(4))}K`;
}

function distanceClassForKm(km) {
  if (!Number.isFinite(km) || km <= 0) {
    return "";
  }
  if (km > 43) {
    return "超馬";
  }
  if (km >= 41.5) {
    return "全馬";
  }
  if (km > 21.8) {
    return "超半馬";
  }
  if (km >= 20.5) {
    return "半馬";
  }
  return formatDistanceNumber(km);
}

function distanceLabelFor(value) {
  const km = parseDistanceKm(value);
  if (!km) {
    return String(value || "").trim();
  }
  const className = distanceClassForKm(km);
  if (["超馬", "全馬", "超半馬", "半馬"].includes(className)) {
    return `${className}（${formatDistanceNumber(km)}）`;
  }
  return className;
}

function rawStartTimeText(race) {
  const value = race.start_times || race.distance_start_times || race.wave_start_times || race.start_time || race.event_time || "";
  if (!hasText(value)) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function normalizeStartTimeRows(value) {
  if (!hasText(value)) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeStartTimeRows(item));
  }
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([group, time]) => hasText(time) ? [{ group: String(group).trim(), time: normalizeClock(time), raw: `${group} ${time}` }] : []);
  }
  return String(value)
    .split(/[、；;,\n]/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const timeMatch = row.match(/([01]?\d|2[0-3])[:：][0-5]\d/);
      const time = timeMatch ? normalizeClock(timeMatch[0]) : "";
      const group = timeMatch
        ? row.slice(0, timeMatch.index).replace(/\s*(?:起跑|鳴槍|出發)\s*$/u, "").trim()
        : row.trim();
      return { group, time, raw: row };
    });
}

function normalizeClock(value) {
  const match = String(value || "").match(/([01]?\d|2[0-3])[:：]([0-5]\d)/);
  if (!match) {
    return "";
  }
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function hasRaceStartKeyword(value) {
  return /起跑|鳴槍|出發|全馬|半馬|超馬|超半馬|挑戰組|健康組|健跑組|健走組|親子組|休閒組|\d+(?:\.\d+)?\s?(?:K|KM|km|公里)/u.test(String(value || ""));
}

function startTimeQualityIssues(race) {
  if (isCancelledRace(race)) {
    return [];
  }
  const rawText = rawStartTimeText(race);
  if (!hasText(rawText)) {
    return [];
  }
  const rows = normalizeStartTimeRows(race.start_times || race.distance_start_times || race.wave_start_times || race.start_time || race.event_time);
  const distances = Array.isArray(race.distances) ? race.distances.filter(hasText) : [];
  const issues = [];
  const clockRows = rows.filter((row) => hasText(row.time));
  const groupRows = clockRows.filter((row) => hasRaceStartKeyword(row.group));
  const suspiciousRows = rows.filter((row) => /關門|完賽|頒獎|典禮|報到|寄物|暖身|結束|集合|開幕/u.test(row.raw) && !/起跑|鳴槍|出發/u.test(row.raw));

  if (rows.length && !clockRows.length) {
    issues.push({
      key: "missing_clock",
      severity: "high",
      label: "起跑時間沒有時刻",
      hint: "start_times 有值但沒有 HH:MM，通常是抓到組名或表格標題。",
    });
  }

  if (distances.length > 1 && clockRows.length === 1 && !hasRaceStartKeyword(clockRows[0].group)) {
    issues.push({
      key: "multi_distance_single_generic_time",
      severity: "medium",
      label: "多距離只有單一泛用時間",
      hint: "可能所有組別同時起跑，也可能只抓到活動時間；請回簡章確認是否要拆各組。",
    });
  }

  if (distances.length > 1 && groupRows.length === 1 && clockRows.length === 1) {
    issues.push({
      key: "multi_distance_one_group_time",
      severity: "medium",
      label: "多距離只抓到一個組別時間",
      hint: "組別數少於距離數，可能漏掉活動時序表或競賽資訊表。",
    });
  }

  if (suspiciousRows.length) {
    issues.push({
      key: "non_start_schedule_text",
      severity: "high",
      label: "疑似抓到非起跑時程",
      hint: `可疑列：${suspiciousRows.map((row) => row.raw).slice(0, 3).join("、")}`,
    });
  }

  const timesByGroup = new Map();
  for (const row of groupRows) {
    const key = row.group.replace(/\s+/g, "");
    if (!key) {
      continue;
    }
    if (!timesByGroup.has(key)) {
      timesByGroup.set(key, new Set());
    }
    timesByGroup.get(key).add(row.time);
  }
  const repeatedGroups = [...timesByGroup.entries()].filter(([, times]) => times.size > 1).map(([group]) => group);
  if (repeatedGroups.length) {
    issues.push({
      key: "same_group_multiple_times",
      severity: "high",
      label: "同一組別出現多個起跑時間",
      hint: `可疑組別：${repeatedGroups.slice(0, 4).join("、")}`,
    });
  }

  const expectedDistanceLabels = distances.map(distanceLabelFor).filter(Boolean);
  if (expectedDistanceLabels.length > 1 && groupRows.length > 1 && groupRows.length < Math.min(expectedDistanceLabels.length, 6)) {
    issues.push({
      key: "group_count_less_than_distance_count",
      severity: "low",
      label: "起跑組別少於距離數",
      hint: `距離：${expectedDistanceLabels.join("、")}；起跑列：${groupRows.map((row) => row.group).join("、")}`,
    });
  }

  return issues;
}

function maxSeverity(issues) {
  const scores = { high: 3, medium: 2, low: 1 };
  return Math.max(0, ...issues.map((issue) => scores[issue.severity] || 0));
}

function strictQualityFailures({ openedGaps, dateAnomalies, startTimeQualityItems }) {
  const highStartTimeIssues = startTimeQualityItems.filter((item) => maxSeverity(item.issues) >= 3);
  const failures = [];

  for (const item of openedGaps) {
    failures.push(`開報後仍缺核心欄位：${item.race_name}（${item.missing.map((missing) => missing.label).join("、")}）`);
  }

  for (const item of dateAnomalies) {
    failures.push(`報名日期異常：${item.race_name}（${item.anomalies.map((issue) => issue.label).join("、")}）`);
  }

  for (const item of highStartTimeIssues) {
    failures.push(`起跑時間高風險：${item.race_name}（${item.issues.filter((issue) => issue.severity === "high").map((issue) => issue.label).join("、")}）`);
  }

  return failures;
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

  if (raceDate && daysToRace >= 0 && daysToRace <= 14) {
    return {
      status: "pre_race_recheck",
      status_label: "賽前 14 天複查",
      next_check_date: todayText,
      cadence: "every_3_days_until_race",
      reason: missing.length
        ? `距離賽事 ${daysToRace} 天，賽前兩週需重查公告、起跑時間、場地、交通與停辦異動。仍缺：${missingLabels}。`
        : `距離賽事 ${daysToRace} 天，即使資料已完整也需重查公告、起跑時間、場地、交通與停辦異動。`,
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
  const rawMissing = coreFieldGroups
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

function formatDateAnomalyReport(items) {
  const generatedAt = new Date().toISOString();
  const lines = [
    "# 報名日期異常報告",
    "",
    `產生時間：${generatedAt}`,
    `追蹤基準日：${TODAY}`,
    "",
    "這份報告列出報名日期邏輯不合理的賽事，例如開報日等於截止日、開報日晚於截止日、截止日晚於賽事日。這類資料不能直接當成正常報名區間顯示。",
    "",
    `目前共 ${items.length} 場。`,
    "",
    "| 賽事日期 | 賽事 | 縣市 | 開報 | 截止 | 異常 | 建議 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of items) {
    lines.push([
      item.race_date || "-",
      item.race_name,
      item.race_county,
      item.registration_opens_at || "-",
      item.registration_deadline || "-",
      item.anomalies.map((anomaly) => anomaly.label).join("、"),
      item.anomalies.map((anomaly) => anomaly.hint).join("；"),
    ].map((value) => String(value).replaceAll("|", "｜")).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatStartTimeQualityReport(items) {
  const generatedAt = new Date().toISOString();
  const lines = [
    "# 起跑時間品質報告",
    "",
    `產生時間：${generatedAt}`,
    `追蹤基準日：${TODAY}`,
    "",
    "這份報告列出 start_times 已有值但品質可疑的賽事，目標是讓爬蟲規則能自動發現「抓到非起跑時程」、「多距離只抓到單一時間」、「同組別多時間」等問題。",
    "",
    `目前共 ${items.length} 場。`,
    "",
    "| 日期 | 賽事 | 距離 | 目前起跑時間 | 問題 | 建議 |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of items) {
    lines.push([
      item.race_date || "-",
      item.race_name,
      item.distances.join(" / ") || "-",
      item.start_times || "-",
      item.issues.map((issue) => issue.label).join("、"),
      item.issues.map((issue) => issue.hint).join("；"),
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
    "1. `runner/賽事/爬蟲追蹤計畫.md` 會依頻率分流：現在該重爬、等待接近開報、每月追蹤、未來再查、低頻補齊。",
    "2. GitHub Actions 會定期執行 `scripts/main.py`、`scripts/enrich_platforms.py`、`npm run data:refresh`，讓待追蹤資料自動重查。",
    "3. 爬蟲重查後仍缺、且已開報或日期異常的項目，再修平台 parser 或寫進 `runner/賽事/人工補充.json`。",
    "4. 賽事只公布日期時，不急著人工補完；讓追蹤排程依既定頻率在開報窗口前後自動重查。",
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
    "這份清單不是要求一次補完資料，而是依賽事資料公開節奏安排自動重查。GitHub Actions 會定期跑賽事爬蟲、官方平台補資料與品質報告；人工補資料只處理開報後仍缺、日期異常或平台解析規則不足的項目。",
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
  const allItems = races
    .map(buildQueueItem)
    .sort((a, b) => b.priority_score - a.priority_score || String(a.race_date).localeCompare(String(b.race_date)) || String(a.race_name).localeCompare(String(b.race_name)));
  const queue = allItems.filter((item) => item.missing.length);
  const trackingItems = allItems.filter((item) => item.missing.length || item.tracking.status === "pre_race_recheck");

  await mkdir(dirname(queuePath), { recursive: true });
  await writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf-8");
  await writeFile(reportPath, formatReport(races, queue), "utf-8");
  await writeFile(trackingPath, formatTrackingPlan(trackingItems), "utf-8");
  const openedGaps = openedGapItems(queue);
  await writeFile(openedGapReportPath, formatOpenedGapReport(openedGaps), "utf-8");
  await writeFile(openedGapJsonPath, `${JSON.stringify(openedGaps, null, 2)}\n`, "utf-8");
  const dateAnomalies = races
    .map((race) => ({
      race_id: race.race_id || "",
      race_name: race.race_name || "",
      race_date: race.race_date || "",
      race_county: race.race_county || "",
      registration_opens_at: race.registration_opens_at || "",
      registration_deadline: race.registration_deadline || "",
      registration_link: race.registration_link || "",
      official_event_url: race.official_event_url || "",
      detail_url: race.detail_url || "",
      anomalies: registrationDateAnomalies(race),
    }))
    .filter((item) => item.anomalies.length)
    .sort((a, b) => String(a.race_date).localeCompare(String(b.race_date)) || String(a.race_name).localeCompare(String(b.race_name)));
  await writeFile(dateAnomalyReportPath, formatDateAnomalyReport(dateAnomalies), "utf-8");
  await writeFile(dateAnomalyJsonPath, `${JSON.stringify(dateAnomalies, null, 2)}\n`, "utf-8");
  const startTimeQualityItems = races
    .map((race) => ({
      race_id: race.race_id || "",
      race_name: race.race_name || "",
      race_date: race.race_date || "",
      race_county: race.race_county || "",
      distances: Array.isArray(race.distances) ? race.distances : [],
      start_times: rawStartTimeText(race),
      registration_link: race.registration_link || "",
      official_event_url: race.official_event_url || "",
      detail_url: race.detail_url || "",
      issues: startTimeQualityIssues(race),
    }))
    .filter((item) => item.issues.length)
    .sort((a, b) => {
      const severity = { high: 3, medium: 2, low: 1 };
      const aScore = Math.max(...a.issues.map((issue) => severity[issue.severity] || 0));
      const bScore = Math.max(...b.issues.map((issue) => severity[issue.severity] || 0));
      return bScore - aScore || String(a.race_date).localeCompare(String(b.race_date)) || String(a.race_name).localeCompare(String(b.race_name));
    });
  await writeFile(startTimeQualityReportPath, formatStartTimeQualityReport(startTimeQualityItems), "utf-8");
  await writeFile(startTimeQualityJsonPath, `${JSON.stringify(startTimeQualityItems, null, 2)}\n`, "utf-8");
  await writeFile(trackingJsonPath, `${JSON.stringify(trackingItems.map((item) => ({
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
  const dueNow = trackingItems.filter((item) => ["due_now", "pre_race_recheck"].includes(item.tracking.status)).length;
  console.log(`Races: ${races.length}`);
  console.log(`Needs follow-up: ${queue.length}`);
  console.log(`Due to crawl now: ${dueNow}`);
  console.log(`Opened registration gaps: ${openedGaps.length}`);
  console.log(`Registration date anomalies: ${dateAnomalies.length}`);
  console.log(`Start time quality issues: ${startTimeQualityItems.length}`);
  console.log(`Missing official registration link: ${highPriority}`);
  console.log(`Wrote: ${queuePath}`);
  console.log(`Wrote: ${reportPath}`);
  console.log(`Wrote: ${trackingPath}`);
  console.log(`Wrote: ${openedGapReportPath}`);
  console.log(`Wrote: ${dateAnomalyReportPath}`);
  console.log(`Wrote: ${startTimeQualityReportPath}`);

  if (strictMode) {
    const strictFailures = strictQualityFailures({ openedGaps, dateAnomalies, startTimeQualityItems });
    if (strictFailures.length) {
      console.error("Strict data quality gate failed:");
      for (const failure of strictFailures) {
        console.error(`- ${failure}`);
      }
      process.exitCode = 1;
    } else {
      console.log("Strict data quality gate: pass");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
