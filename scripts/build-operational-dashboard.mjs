import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const today = process.env.RUNNER_TODAY || new Date().toISOString().slice(0, 10);

const paths = {
  races: resolve(root, "site/data/races.json"),
  qualityQueue: resolve(root, "runner/賽事/待補資料佇列.json"),
  openedGaps: resolve(root, "runner/賽事/開報後待補資料報告.json"),
  dateAnomalies: resolve(root, "runner/賽事/報名日期異常報告.json"),
  tracking: resolve(root, "runner/賽事/爬蟲追蹤計畫.json"),
  contentCandidates: resolve(root, "runner/內容/候選內容.json"),
  contentSourceHealth: resolve(root, "runner/內容/內容來源健康度報告.json"),
  editorialContent: resolve(root, "runner/內容/人工精選內容.json"),
  publishedContent: resolve(root, "site/data/content.json"),
  siteHtml: resolve(root, "site/index.html"),
  platformStabilityMd: resolve(root, "runner/賽事/平台穩定度報告.md"),
  platformStabilityJson: resolve(root, "runner/賽事/平台穩定度報告.json"),
  outputMd: resolve(root, "runner/系統配置/營運儀表板.md"),
  outputJson: resolve(root, "runner/系統配置/營運儀表板.json"),
};

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function parseDate(value) {
  if (!hasText(value)) {
    return null;
  }
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) {
    return null;
  }
  return Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000));
}

function pct(done, total) {
  if (!total) {
    return "0%";
  }
  return `${Math.round((done / total) * 100)}%`;
}

async function readJson(path, fallback = []) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return fallback;
  }
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

function isOfficialDirect(race) {
  if (!hasText(race.registration_link)) {
    return false;
  }
  try {
    return !new URL(race.registration_link).hostname.toLowerCase().endsWith("running.biji.co");
  } catch {
    return false;
  }
}

function hostFromUrl(url) {
  if (!hasText(url)) {
    return "";
  }
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function platformFromRace(race) {
  if (hasText(race.source_platform)) {
    return String(race.source_platform).split(/[、,，/]/)[0].trim();
  }
  const host = hostFromUrl(race.registration_link || race.official_event_url || race.detail_url);
  if (/irunner|biji/.test(host)) return "iRunner";
  if (/lohasnet/.test(host)) return "Lohas";
  if (/ctrun/.test(host)) return "CTRun";
  if (/joinnow/.test(host)) return "JoinNow";
  if (/focusline/.test(host)) return "Focusline";
  if (/bao-ming/.test(host)) return "bao-ming";
  if (/eventgo/.test(host)) return "EventGo";
  return race.source || "未分類";
}

function rowKey(item) {
  return item.race_id || `${item.race_name || ""}|${item.race_date || ""}`;
}

function buildPlatformStability(races, queue, openedGaps, dateAnomalies, tracking) {
  const missingSet = new Set(queue.map(rowKey));
  const openGapSet = new Set(openedGaps.map(rowKey));
  const anomalySet = new Set(dateAnomalies.map(rowKey));
  const dueSet = new Set(tracking.filter((item) => ["due_now", "pre_race_recheck"].includes(item.tracking?.status)).map(rowKey));
  const stats = new Map();

  races.forEach((race) => {
    const platform = platformFromRace(race);
    if (!stats.has(platform)) {
      stats.set(platform, {
        platform,
        total: 0,
        official_direct: 0,
        verified: 0,
        missing: 0,
        opened_gap: 0,
        date_anomaly: 0,
        due_now: 0,
        sample_races: [],
      });
    }
    const item = stats.get(platform);
    const key = rowKey(race);
    item.total += 1;
    item.official_direct += isOfficialDirect(race) ? 1 : 0;
    item.verified += hasText(race.verified_at) ? 1 : 0;
    item.missing += missingSet.has(key) ? 1 : 0;
    item.opened_gap += openGapSet.has(key) ? 1 : 0;
    item.date_anomaly += anomalySet.has(key) ? 1 : 0;
    item.due_now += dueSet.has(key) ? 1 : 0;
    if (item.sample_races.length < 3) {
      item.sample_races.push(race.race_name);
    }
  });

  return [...stats.values()]
    .map((item) => {
      const completeRate = (item.total - item.missing) / item.total;
      const officialRate = item.official_direct / item.total;
      const verifiedRate = item.verified / item.total;
      const cleanDateRate = (item.total - item.date_anomaly) / item.total;
      const score = Math.round((completeRate * 0.35 + officialRate * 0.25 + verifiedRate * 0.25 + cleanDateRate * 0.15) * 100);
      return {
        ...item,
        complete_rate: pct(item.total - item.missing, item.total),
        official_direct_rate: pct(item.official_direct, item.total),
        verified_rate: pct(item.verified, item.total),
        score,
        status: score >= 80 ? "穩定" : score >= 60 ? "可用需觀察" : "需補強",
      };
    })
    .sort((a, b) => b.total - a.total || b.score - a.score || a.platform.localeCompare(b.platform));
}

function registrationState(race, todayDate) {
  if (isCancelledRace(race)) {
    return "停辦";
  }
  const raceDate = parseDate(race.race_date);
  const opensAt = parseDate(race.registration_opens_at);
  const deadline = parseDate(race.registration_deadline);
  if (raceDate && daysBetween(raceDate, todayDate) > 30) {
    return "歷史";
  }
  if (deadline && daysBetween(deadline, todayDate) > 0) {
    return "已截止";
  }
  if (opensAt && daysBetween(todayDate, opensAt) > 0) {
    return "尚未開報";
  }
  if (opensAt && deadline && daysBetween(opensAt, todayDate) >= 0 && daysBetween(todayDate, deadline) >= 0) {
    return "報名中";
  }
  return race.registration_status || "待確認";
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || "未分類";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function countContentCards(html, type) {
  const pattern = type === "shoe" ? /data-shoe-card\b/g : /data-news-card\b/g;
  return [...html.matchAll(pattern)].length;
}

function newestContentDate(html, type) {
  const attr = type === "shoe" ? "data-shoe-card" : "data-news-card";
  const pattern = new RegExp(`<article[^>]*${attr}[^>]*data-date=["']([^"']+)["']`, "gi");
  const dates = [...html.matchAll(pattern)].map((match) => match[1]).filter(Boolean).sort().reverse();
  return dates[0] || "";
}

function contentItemsByType(publishedContent, type) {
  return Array.isArray(publishedContent.items)
    ? publishedContent.items.filter((item) => item.type === type)
    : [];
}

function newestPublishedDate(items) {
  return items.map((item) => item.date).filter(Boolean).sort().reverse()[0] || "";
}

function topEntries(items, count = 8) {
  return items.slice(0, count);
}

function table(rows) {
  if (!rows.length) {
    return "目前沒有項目。\n";
  }
  return rows.join("\n") + "\n";
}

function statusLine(label, value, target, ok) {
  return `| ${label} | ${value} | ${target} | ${ok ? "正常" : "需處理"} |`;
}

function isLaunchBlockingTracking(item) {
  return ["due_now", "pre_race_recheck", "wait_until_open_window"].includes(item.tracking?.status);
}

async function main() {
  const todayDate = parseDate(today);
  const [races, queue, openedGaps, dateAnomalies, tracking, candidates, contentSourceHealth, editorialContent, publishedContent] = await Promise.all([
    readJson(paths.races),
    readJson(paths.qualityQueue),
    readJson(paths.openedGaps),
    readJson(paths.dateAnomalies),
    readJson(paths.tracking),
    readJson(paths.contentCandidates),
    readJson(paths.contentSourceHealth),
    readJson(paths.editorialContent, []),
    readJson(paths.publishedContent, { items: [] }),
  ]);
  const html = await readFile(paths.siteHtml, "utf-8");

  const officialDirectCount = races.filter(isOfficialDirect).length;
  const verifiedCount = races.filter((race) => hasText(race.verified_at)).length;
  const openGapCount = openedGaps.length;
  const dueNow = tracking.filter((item) => ["due_now", "pre_race_recheck"].includes(item.tracking?.status));
  const launchBlockingGaps = queue.filter(isLaunchBlockingTracking);
  const monthly = tracking.filter((item) => item.tracking?.cadence === "monthly_1_15");
  const contentPool = [...candidates, ...editorialContent];
  const candidateByCategory = countBy(contentPool, (item) => item.category);
  const raceStateCounts = countBy(races, (race) => registrationState(race, todayDate));
  const publishedShoes = contentItemsByType(publishedContent, "shoe");
  const publishedNews = contentItemsByType(publishedContent, "news");
  const shoeCards = publishedShoes.length || countContentCards(html, "shoe");
  const newsCards = publishedNews.length || countContentCards(html, "news");
  const platformStability = buildPlatformStability(races, queue, openedGaps, dateAnomalies, tracking);
  const contentSourceWeak = contentSourceHealth.filter((item) => item.status === "需補強");

  const dashboard = {
    generated_at: new Date().toISOString(),
    basis_date: today,
    races: {
      total: races.length,
      follow_up_count: queue.length,
      complete_count: races.length - queue.length,
      complete_rate: pct(races.length - queue.length, races.length),
      launch_blocking_gap_count: launchBlockingGaps.length,
      launch_ready_count: races.length - launchBlockingGaps.length,
      launch_ready_rate: pct(races.length - launchBlockingGaps.length, races.length),
      official_direct_count: officialDirectCount,
      official_direct_rate: pct(officialDirectCount, races.length),
      verified_count: verifiedCount,
      verified_rate: pct(verifiedCount, races.length),
      opened_gap_count: openGapCount,
      date_anomaly_count: dateAnomalies.length,
      due_now_count: dueNow.length,
      monthly_tracking_count: monthly.length,
      state_counts: raceStateCounts,
    },
    content: {
      shoe_cards: shoeCards,
      news_cards: newsCards,
      newest_shoe_date: newestPublishedDate(publishedShoes) || newestContentDate(html, "shoe"),
      newest_news_date: newestPublishedDate(publishedNews) || newestContentDate(html, "news"),
      published_count: Array.isArray(publishedContent.items) ? publishedContent.items.length : 0,
      candidate_count: contentPool.length,
      editorial_count: editorialContent.length,
      candidate_by_category: candidateByCategory,
      source_stable_count: contentSourceHealth.filter((item) => item.status === "穩定").length,
      source_watch_count: contentSourceHealth.filter((item) => item.status === "可用需觀察").length,
      source_weak_count: contentSourceWeak.length,
      source_health: contentSourceHealth,
    },
    platform_stability: {
      stable_count: platformStability.filter((item) => item.status === "穩定").length,
      watch_count: platformStability.filter((item) => item.status === "可用需觀察").length,
      weak_count: platformStability.filter((item) => item.status === "需補強").length,
      items: platformStability,
    },
  };

  const metrics = [
    statusLine("上線可用完整度", dashboard.races.launch_ready_rate, "90% 以上", dashboard.races.launch_ready_count / Math.max(races.length, 1) >= 0.9),
    statusLine("原始資料完整度", dashboard.races.complete_rate, "80% 以上", dashboard.races.complete_count / Math.max(races.length, 1) >= 0.8),
    statusLine("官方直連率", dashboard.races.official_direct_rate, "80% 以上", officialDirectCount / Math.max(races.length, 1) >= 0.8),
    statusLine("已查證比例", dashboard.races.verified_rate, "80% 以上", verifiedCount / Math.max(races.length, 1) >= 0.8),
    statusLine("開報後待補", `${openGapCount} 場`, "0 場", openGapCount === 0),
    statusLine("報名日期異常", `${dateAnomalies.length} 場`, "0 場", dateAnomalies.length === 0),
    statusLine("跑鞋上架量", `${shoeCards} 筆`, "至少 10 筆", shoeCards >= 10),
    statusLine("新聞上架量", `${newsCards} 筆`, "至少 10 筆", newsCards >= 10),
    statusLine("內容候選量", `${contentPool.length} 筆`, "至少 20 筆", contentPool.length >= 20),
    statusLine("內容弱來源", `${contentSourceWeak.length} 個`, "0 個", contentSourceWeak.length === 0),
    statusLine("穩定平台數", `${dashboard.platform_stability.stable_count} 個`, "至少 3 個", dashboard.platform_stability.stable_count >= 3),
  ];

  const nextActions = [];
  if (openGapCount > 0) {
    nextActions.push("優先處理 `runner/賽事/開報後待補資料報告.md`，這些是已開報但資料仍不完整的賽事。");
  }
  if (launchBlockingGaps.length > 0) {
    nextActions.push("上線阻塞待補只看已到追蹤窗口的賽事；遠期尚未開報賽事保留在追蹤計畫，不應人工硬補。");
  }
  if (dateAnomalies.length > 0) {
    nextActions.push("先修 `runner/賽事/報名日期異常報告.md`，日期邏輯錯誤會直接誤導報名狀態。");
  }
  if (dueNow.length > 0) {
    nextActions.push("`runner/賽事/爬蟲追蹤計畫.md` 已把到期項目列入「現在該重爬」；GitHub Actions 會定期自動重查，若重查後仍缺再修平台 parser 或補人工資料。");
  }
  if (officialDirectCount / Math.max(races.length, 1) < 0.8) {
    nextActions.push("官方直連率未達 80% 的賽事已進追蹤節奏；等待自動重查補齊，只有開報後仍缺才人工介入。");
  }
  if (contentPool.length >= 20) {
    nextActions.push("內容候選已由 `npm run content:publish` 自動挑選上架；可抽查 `runner/內容/自動上架內容報告.md` 的來源品質。");
  }
  if (contentSourceWeak.length > 0) {
    nextActions.push("內容來源已有連續失敗項目，先看 `runner/內容/內容來源健康度報告.md`，必要時替換來源 URL 或調整關鍵字。");
  }
  if (!nextActions.length) {
    nextActions.push("目前主要營運指標正常，下一步可做平台 parser 精準度與手機體驗細修。");
  }

  const md = [
    "# 營運儀表板",
    "",
    `產生時間：${dashboard.generated_at}`,
    `追蹤基準日：${today}`,
    "",
    "這份報告把賽事資料品質、爬蟲追蹤、跑鞋與新聞內容量整合在一起，用來判斷下一輪最該補哪裡。",
    "",
    "判斷上線狀態時優先看「上線可用完整度、開報後待補、報名日期異常、內容品質」。原始資料完整度包含遠期尚未開報賽事，適合做長期追蹤，不應單獨視為上線阻塞。",
    "",
    "## 指標",
    "",
    "| 項目 | 目前 | 目標 | 狀態 |",
    "| --- | ---: | ---: | --- |",
    ...metrics,
    "",
    "## 賽事狀態分布",
    "",
    "| 狀態 | 筆數 |",
    "| --- | ---: |",
    ...Object.entries(raceStateCounts).sort((a, b) => b[1] - a[1]).map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "## 內容候選分布",
    "",
    "| 分類 | 筆數 |",
    "| --- | ---: |",
    ...Object.entries(candidateByCategory).sort((a, b) => b[1] - a[1]).map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "## 內容來源健康度",
    "",
    "| 來源 | 狀態 | 候選 | 連續失敗 | 有效權重 |",
    "| --- | --- | ---: | ---: | ---: |",
    ...contentSourceHealth.map((item) => `| ${item.source} | ${item.status} | ${item.candidate_count} | ${item.consecutive_failures} | ${item.effective_priority} |`),
    "",
    "## 平台穩定度",
    "",
    "| 平台 | 狀態 | 分數 | 賽事 | 完整度 | 官方直連 | 已查證 | 待補 | 日期異常 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...platformStability.map((item) => `| ${item.platform} | ${item.status} | ${item.score} | ${item.total} | ${item.complete_rate} | ${item.official_direct_rate} | ${item.verified_rate} | ${item.missing} | ${item.date_anomaly} |`),
    "",
    "## 近期需處理",
    "",
    "### 開報後待補",
    "",
    table(topEntries(openedGaps).map((item) => `- ${item.race_date || item.registration_opens_at || "-"}｜${item.race_name}｜缺：${item.missing.map((missing) => missing.label).join("、")}`)).trim(),
    "",
    "### 報名日期異常",
    "",
    table(topEntries(dateAnomalies).map((item) => `- ${item.race_date || "-"}｜${item.race_name}｜${item.registration_opens_at || "-"} 到 ${item.registration_deadline || "-"}｜${item.anomalies.map((anomaly) => anomaly.label).join("、")}`)).trim(),
    "",
    "### 現在該重爬",
    "",
    table(topEntries(dueNow).map((item) => `- ${item.race_date || "-"}｜${item.race_name}｜${item.tracking?.reason || ""}`)).trim(),
    "",
    "## 下一步",
    "",
    ...nextActions.map((item) => `- ${item}`),
    "",
  ].join("\n");

  await mkdir(dirname(paths.outputMd), { recursive: true });
  await mkdir(dirname(paths.platformStabilityMd), { recursive: true });
  await writeFile(paths.outputMd, `${md}\n`, "utf-8");
  await writeFile(paths.outputJson, `${JSON.stringify(dashboard, null, 2)}\n`, "utf-8");
  await writeFile(paths.platformStabilityJson, `${JSON.stringify({
    generated_at: dashboard.generated_at,
    basis_date: today,
    items: platformStability,
  }, null, 2)}\n`, "utf-8");
  await writeFile(paths.platformStabilityMd, `${[
    "# 平台穩定度報告",
    "",
    `產生時間：${dashboard.generated_at}`,
    `追蹤基準日：${today}`,
    "",
    "分數用完整度、官方直連率、查證率與日期異常加權計算，用來判斷哪個平台 parser 最需要優先補強。",
    "",
    "| 平台 | 狀態 | 分數 | 賽事 | 完整度 | 官方直連 | 已查證 | 待補 | 開報後待補 | 日期異常 | 該重爬 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...platformStability.map((item) => `| ${item.platform} | ${item.status} | ${item.score} | ${item.total} | ${item.complete_rate} | ${item.official_direct_rate} | ${item.verified_rate} | ${item.missing} | ${item.opened_gap} | ${item.date_anomaly} | ${item.due_now} |`),
    "",
  ].join("\n")}\n`, "utf-8");

  console.log(`Operational dashboard: ${paths.outputMd}`);
  console.log(`Race completeness: ${dashboard.races.complete_rate}`);
  console.log(`Content candidates: ${dashboard.content.candidate_count}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
