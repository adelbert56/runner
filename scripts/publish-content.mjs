import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";

const root = resolve(import.meta.dirname, "..");
const candidatesPath = resolve(root, "runner/內容/候選內容.json");
const candidatesArchivePath = resolve(root, "runner/內容/候選內容庫.json");
const editorialPath = resolve(root, "runner/內容/人工精選內容.json");
const outputPath = resolve(root, "site/data/content.json");
const reportPath = resolve(root, "runner/內容/自動上架內容報告.md");
const today = process.env.RUNNER_TODAY || todayInTaipei();
const ARCHIVE_RETENTION_DAYS = 183;
const PUBLISH_WINDOW_DAYS = 92;

const LIMITS = {
  shoe: 30,
  news: 40,
};

const MIN_PUBLISHED = {
  shoe: 10,
  news: 10,
};

const MIN_SCORE = {
  shoe: 4,
  news: 3,
};

const MAX_ENGLISH_NEWS = 6;

const SUMMARY_RULES = [
  "類別用標籤呈現，摘要不要重複來源名稱。",
  "摘要不使用「重點：」「訓練重點：」「賽事重點：」這種開頭。",
  "跑鞋入門與選鞋邏輯歸入入門專區；跑鞋頁只放新品、定位與評測。",
  "來源描述太籠統時使用決策型摘要，避免硬塞無資訊量文字。",
];

const ENGLISH_SOURCE_PATTERNS = [/Runner's World/i, /runnersworld\.com/i];

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(url || "").replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^\p{Script=Han}a-z0-9]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseTaipeiDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeIsoDate(value) {
  const text = String(value || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  return parseTaipeiDate(text) ? text : "";
}

function parseDate(value) {
  return normalizeIsoDate(value) || today;
}

function stableContentDate(item) {
  return normalizeIsoDate(item.article_date)
    || normalizeIsoDate(item.first_seen_at)
    || normalizeIsoDate(item.checked_at);
}

function withinDays(value, windowDays) {
  const date = parseTaipeiDate(normalizeIsoDate(value));
  if (!date) return false;
  const cutoff = new Date(`${today}T00:00:00+08:00`);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const upperBound = new Date(`${today}T23:59:59+08:00`);
  return date >= cutoff && date <= upperBound;
}

function withinRetention(item, retentionDays) {
  const cutoff = new Date(`${today}T00:00:00+08:00`);
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const lastSeen = parseTaipeiDate(item.last_seen_at || item.checked_at || item.article_date || "");
  return lastSeen ? lastSeen >= cutoff : true;
}

function inferType(item) {
  const text = `${item.title || ""} ${item.description || ""}`;
  const hasShoeSignal = /跑鞋|鞋款|鞋底|中底|鞋面|鞋碼|碳板|GTX|GORE|BROOKS GHOST|PEGASUS|GEL-|NIMBUS|KAYANO|MACH|DEVIATE|FAST-R|PHANTASM|NEO VISTA|CLOUDMONSTER/i.test(text);
  const eventOnlySignal = /賽事|報名|馬拉松|半馬|UTMB|開放報名|城市路跑/i.test(text) && !hasShoeSignal;
  if (item.category === "跑鞋新品" && hasShoeSignal && !eventOnlySignal) return "shoe";
  return "news";
}

function isEnglishNewsItem(item) {
  const source = String(item.source || "");
  const url = String(item.url || "");
  return /Runner's World/i.test(source) || /runnersworld\.com/i.test(url);
}

function contentLanguageRank(item) {
  if (item.type === "news" && isEnglishNewsItem(item)) {
    return 1;
  }
  return 0;
}

function sourceLanguageRank(item) {
  const sourceText = `${item.source || ""} ${item.url || ""}`;
  return ENGLISH_SOURCE_PATTERNS.some((pattern) => pattern.test(sourceText)) ? 1 : 0;
}

function publishedPreference(item) {
  return {
    languageRank: sourceLanguageRank(item),
    originRank: sourceOriginRank(item.source_origin),
    score: Number(item.score || 0),
    typeRank: item.type === "shoe" ? 0 : 1,
    dateValue: parseTaipeiDate(item.date || item.published_at || "")?.getTime() || 0,
    title: String(item.title || ""),
    source: String(item.source || ""),
  };
}

function comparePublishedItems(a, b) {
  const left = publishedPreference(a);
  const right = publishedPreference(b);
  return (
    left.languageRank - right.languageRank
    || right.originRank - left.originRank
    || right.score - left.score
    || left.typeRank - right.typeRank
    || right.dateValue - left.dateValue
    || left.source.localeCompare(right.source)
    || left.title.localeCompare(right.title)
  );
}

function inferShoeCategory(title) {
  if (/碳板|競速|PHANTASM|FAST-R|ELITE|比賽/i.test(title)) return "競速";
  if (/越野|Trail|UTMB|CASCADIA|ULTRAFLY/i.test(title)) return "越野";
  if (/防水|GTX|GORE/i.test(title)) return "防水";
  if (/緩震|厚底|NIMBUS|NEO VISTA|CUMULUS|CLOUDMONSTER/i.test(title)) return "長距離緩震";
  if (/速度|節奏|TEMPO|MACH|DEVIATE/i.test(title)) return "速度訓練";
  if (/GHOST|PEGASUS|日常|慢跑/i.test(title)) return "日常訓練";
  return "跑鞋新品";
}

function inferNewsCategory(title, description = "") {
  const text = `${title} ${description}`;
  if (/賽事|報名|城市路跑|開放報名|完賽/i.test(title)) return "賽事資訊";
  if (/新手|入門|初跑|跑姿|肌力|心率|乳酸閾值|跑步經濟性|跑者知識/i.test(text)) return "入門知識";
  if (/恢復|傷|睡眠|疲勞|伸展|保養|防曬|肌膚|休息/i.test(text)) return "恢復保養";
  if (/補給|飲食|碳水|蛋白|能量膠|水分|電解質/i.test(text)) return "補給";
  if (/跑鞋|鞋款|裝備|Nike|ASICS|Brooks|HOKA|PUMA|New Balance|Mizuno|On Cloud/i.test(text)) return "跑鞋裝備";
  if (/訓練|間歇|節奏|長跑|配速|課表|週跑量|跑量|肌力|坡跑/i.test(text)) return "訓練";
  if (/賽事|報名|馬拉松|半馬|城市路跑|開放報名|完賽/i.test(text)) return "賽事資訊";
  return "跑步新聞";
}

function cleanSummary(text) {
  let cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^摘要[:：]\s*/, "")
    .trim();
  cleaned = dedupeSentences(cleaned);
  if (!cleaned || cleaned.length < 18 || /國內外各大精選賽事|一手掌握|不漏接|預計\s*\d+\s*月份上市/.test(cleaned)) {
    return "";
  }
  const lastSentenceEnd = Math.max(
    cleaned.lastIndexOf("。"),
    cleaned.lastIndexOf("！"),
    cleaned.lastIndexOf("？"),
    cleaned.lastIndexOf("."),
  );
  const limit = 150;
  if (cleaned.length <= limit) {
    if (lastSentenceEnd < 0 && cleaned.length > 70) {
      return "";
    }
    return /[。！？.!?]$/.test(cleaned) ? cleaned : `${cleaned}。`;
  }
  const clipped = cleaned.slice(0, limit);
  const sentenceEnd = Math.max(
    clipped.lastIndexOf("。"),
    clipped.lastIndexOf("！"),
    clipped.lastIndexOf("？"),
    clipped.lastIndexOf("."),
  );
  if (sentenceEnd <= 42) {
    return `${clipped.replace(/[，、；：\s]+$/g, "").trim()}...`;
  }
  const summary = (sentenceEnd > 42 ? clipped.slice(0, sentenceEnd + 1) : clipped).trim();
  return /[。！？.!?]$/.test(summary) ? summary : `${summary}。`;
}

function dedupeSentences(text) {
  const pieces = String(text || "").match(/[^。！？.!?]+[。！？.!?]?/g) || [];
  const seen = new Set();
  const deduped = [];

  for (const piece of pieces) {
    const sentence = piece.trim();
    if (!sentence) continue;
    const key = sentence
      .replace(/[，、；：,.!?！？。;:\s]/g, "")
      .slice(0, 48);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(sentence);
  }

  return deduped.join("");
}

function summarize(item, type) {
  const title = item.title.replace(/\s+/g, " ").trim();
  const newsCategory = inferNewsCategory(title, item.description);

  if (type === "shoe") {
    const shoeSummary = summarizeShoeTitle(title);
    if (shoeSummary) return shoeSummary;
    const category = inferShoeCategory(title);
    const shoeUse = {
      競速: "適合放在比賽日、節奏跑與間歇課，週跑量還不穩時不要拿來天天穿。",
      越野: "適合山徑、碎石與濕滑路面，先確認鞋底抓地、保護性與自己的路線需求。",
      防水: "適合雨天、通勤慢跑與濕冷環境，夏季長跑要留意悶熱與排汗。",
      長距離緩震: "適合長跑、恢復跑與累積里程，挑選時要看後段穩定，不只看剛試穿的彈感。",
      速度訓練: "適合節奏跑與中長距離配速課，能補上日常鞋與競速鞋之間的空位。",
      日常訓練: "適合輕鬆跑、恢復跑與日常累積里程，是多數跑者第一雙主力鞋的優先選項。",
      跑鞋新品: "先看用途、腳感、穩定、重量與價格，再決定是否放進跑鞋輪替。",
    }[category];
    return `這雙鞋目前以「${category}」定位收錄。${shoeUse}`;
  }

  const titleSummary = summarizeNewsTitle(title, newsCategory);
  if (titleSummary) return titleSummary;

  if (/訓練|間歇|節奏|長跑|半馬|馬拉松/i.test(title)) {
    return "這篇適合作為課表調整參考。重點不是照抄強度，而是確認自己目前週跑量、恢復能力與目標賽事距離。";
  }
  if (/恢復|傷|睡眠|疲勞|伸展/i.test(title)) {
    return "恢復內容適合放在強度課後檢查。若疼痛持續或影響步態，應優先休息或尋求專業評估。";
  }
  if (/補給|飲食|碳水|蛋白|能量膠/i.test(title)) {
    return "補給文章可用於長跑與比賽前演練。不要比賽當天第一次嘗試新補給，避免腸胃或配速失控。";
  }
  return "跑步新聞已收錄，保留對訓練、裝備或賽事決策有幫助的重點，方便跑者快速判斷是否需要深入閱讀。";
}

function summarizeShoeTitle(title) {
  if (/GHOST 18/i.test(title)) {
    return "Ghost 18 偏日常穩定與舒適里程，適合新手、恢復跑、通勤慢跑與想找一雙主力訓練鞋的跑者。";
  }
  if (/PEGASUS 42/i.test(title)) {
    return "Pegasus 42 延續日常訓練鞋定位，適合輕鬆跑、一般配速課與想用一雙鞋處理多數里程的跑者。";
  }
  if (/MACH 7/i.test(title)) {
    return "Mach 7 偏輕量與速度訓練，適合已能穩定慢跑、想把節奏跑或中長距離配速課跑得更俐落的跑者。";
  }
  if (/壽命|更換時機/.test(title)) {
    return "跑鞋壽命要看里程、鞋底磨耗、中底回彈與身體反應。若開始疼痛或支撐明顯下降，就該評估輪替或汰換。";
  }
  if (/總結2026上半年|adidas|冠軍跑鞋/.test(title)) {
    return "年度跑鞋整理適合用來掌握新品方向，但購買前仍要回到用途、腳感、訓練課表與預算判斷。";
  }
  return "";
}

function summarizeNewsTitle(title, category) {
  if (/Panasonic|城市路跑|開放報名/.test(title)) {
    return "台北城市路跑屬於秋季城市賽事，可當作 10K、親子同跑或下半年恢復比賽節奏的目標。先確認距離、報名期限與交通安排。";
  }
  if (/富士山|FUJI|UTMF|越野/.test(title)) {
    return "富士山周邊賽事從公路馬到長距離越野都有，重點不是只看距離，而是爬升、補給、旅跑成本與自身山徑經驗是否匹配。";
  }
  if (/Alice Finot|歐洲紀錄/.test(title)) {
    return "菁英跑者移地訓練的價值在於紀律、恢復與長期目標管理。一般跑者可借鏡訓練節奏，不必照抄強度。";
  }
  if (/防曬|保養|肌膚/.test(title)) {
    return "戶外跑步除了課表，也要管理防曬、清潔與跑後恢復。長時間晨跑或午後跑者，應把保養納入訓練流程。";
  }
  if (/HYROX|重訓|健身/.test(title)) {
    return "HYROX 類型訓練提醒跑者：肌力、動作控制與心肺耐力會互相影響。想提升表現，不能只堆跑量。";
  }
  if (/金字塔|低強度|馬拉松|跑量/.test(title)) {
    return "馬拉松進步不只靠高強度，穩定低強度跑量才是地基。安排課表時，要先確保恢復能力跟得上。";
  }
  if (/跑步姿勢|跑姿/.test(title)) {
    return "跑姿沒有單一完美答案，重點是降低過度用力與受傷風險。可先從步頻、落地位置與身體放鬆度檢查。";
  }
  if (/停滯不前|去跑步/.test(title)) {
    return "這類跑步故事適合當作入門動機參考。真正執行時，先從低門檻頻率與可持續習慣開始。";
  }
  if (/世界紀錄|課表硬/.test(title)) {
    return "菁英課表可看結構，不宜照抄強度。一般跑者應先確認基礎跑量、肌力與恢復能力。";
  }
  if (/初半馬|學員故事/.test(title)) {
    return "初半馬故事適合作為新手備賽參考，重點在循序累積、穩定完成課表與避免臨時硬拉長跑。";
  }
  if (category === "賽事資訊") {
    return "這篇屬於賽事資訊，可用來判斷報名時程、距離組別、交通與是否值得排進年度目標。";
  }
  return "";
}

function toPublishedItem(item) {
  const type = inferType(item);
  const normalizedUrl = normalizeUrl(item.url);
  const title = String(item.title || "").trim();
  return {
    id: `${type}-${slugify(normalizedUrl || title)}`,
    type,
    title,
    date: parseDate(stableContentDate(item)),
    source: item.source,
    category: type === "shoe" ? inferShoeCategory(title) : inferNewsCategory(title, item.description),
    summary: summarize(item, type),
    url: item.url,
    score: item.score,
    source_origin: item.source_origin || "candidate",
    published_at: today,
    publish_status: "published",
  };
}

function previousToPublishedItem(item) {
  const type = item.type === "shoe" ? "shoe" : "news";
  const normalizedDate = normalizeIsoDate(item.date || item.published_at);
  return {
    id: item.id || `${type}-${slugify(normalizeUrl(item.url) || item.title)}`,
    type,
    title: String(item.title || "").trim(),
    date: parseDate(normalizedDate),
    source: item.source || "上一版上架內容",
    category: item.category || (type === "shoe" ? inferShoeCategory(item.title || "") : inferNewsCategory(item.title || "", item.summary)),
    summary: cleanSummary(item.summary) || summarize({
      title: item.title || "",
      description: item.summary || "",
    }, type),
    url: item.url,
    score: Math.max(MIN_SCORE[type], Number(item.score || MIN_SCORE[type]) - 1),
    source_origin: "previous_published",
    published_at: normalizeIsoDate(item.published_at) || today,
    publish_status: "published",
  };
}

function mergeArchiveFields(item, archiveByUrl) {
  const archived = archiveByUrl.get(normalizeUrl(item.url)) || {};
  const articleDate = normalizeIsoDate(item.article_date)
    ? item.article_date
    : (normalizeIsoDate(archived.article_date) ? archived.article_date : "");
  return {
    ...archived,
    ...item,
    article_date: articleDate,
    first_seen_at: item.first_seen_at || archived.first_seen_at || item.checked_at || today,
    last_seen_at: item.last_seen_at || archived.last_seen_at || item.checked_at || today,
  };
}

function sortItems(items) {
  return items.sort((a, b) => {
    const languageDiff = contentLanguageRank(a) - contentLanguageRank(b);
    if (languageDiff !== 0) return languageDiff;
    const originDiff = sourceOriginRank(b.source_origin) - sourceOriginRank(a.source_origin);
    if (originDiff !== 0) return originDiff;
    if (b.score !== a.score) return b.score - a.score;
    return String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title);
  });
}

function pick(items, type, limit = LIMITS[type]) {
  const seen = new Set();
  let englishCount = 0;
  const picked = [];

  for (const item of sortItems(items.filter((entry) => entry.type === type && entry.score >= MIN_SCORE[type]))) {
    const key = normalizeUrl(item.url);
    if (!key || seen.has(key)) continue;
    if (type === "news" && isEnglishNewsItem(item) && englishCount >= MAX_ENGLISH_NEWS) {
      continue;
    }
    seen.add(key);
    picked.push(item);
    if (type === "news" && isEnglishNewsItem(item)) {
      englishCount += 1;
    }
    if (picked.length >= limit) {
      break;
    }
  }

  return picked;
}

function fillWithInventory(primary, inventory, type) {
  const picked = pick(primary, type);
  const seen = new Set(picked.map((item) => normalizeUrl(item.url)).filter(Boolean));
  let englishCount = picked.filter((item) => type === "news" && isEnglishNewsItem(item)).length;

  if (picked.length >= MIN_PUBLISHED[type]) {
    return picked;
  }

  const fill = [];
  for (const item of sortItems(inventory.filter((entry) => entry.type === type && entry.score >= MIN_SCORE[type]))) {
    const key = normalizeUrl(item.url);
    if (!key || seen.has(key)) continue;
    if (type === "news" && isEnglishNewsItem(item) && englishCount >= MAX_ENGLISH_NEWS) {
      continue;
    }
    seen.add(key);
    fill.push(item);
    if (type === "news" && isEnglishNewsItem(item)) {
      englishCount += 1;
    }
    if (picked.length + fill.length >= LIMITS[type]) {
      break;
    }
  }

  return [...picked, ...fill];
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function buildReport(published) {
  const rows = published.map((item) => (
    `| ${item.type === "shoe" ? "跑鞋" : "新聞"} | ${item.score} | ${item.date} | ${item.sourceOriginLabel || sourceOriginLabel(item.source_origin)} | ${item.source} | ${item.title.replace(/\|/g, "／")} | ${item.summary.replace(/\|/g, "／")} | [來源](${item.url}) |`
  ));
  const sourceCounts = published.reduce((acc, item) => {
    const key = sourceOriginLabel(item.source_origin);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return [
    "# 自動上架內容報告",
    "",
    `產生時間：${new Date().toISOString()}`,
    `查詢基準日：${today}`,
    "",
    "候選內容會依分數、分類與去重規則自動上架到前台。低分、重複或非跑者決策相關內容會留在候選清單。",
    "",
    "## 上架規則",
    "",
    ...SUMMARY_RULES.map((rule) => `- ${rule}`),
    "",
    `已上架：${published.length} 筆`,
    `自動候選：${sourceCounts["自動候選"] || 0} 筆；上一版庫存補位：${sourceCounts["上一版庫存補位"] || 0} 筆；人工精選：${sourceCounts["人工精選"] || 0} 筆`,
    "",
    "| 類型 | 分數 | 日期 | 上架來源 | 來源 | 標題 | 摘要 | 連結 |",
    "| --- | ---: | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function sourceOriginLabel(origin) {
  if (origin === "editorial") return "人工精選";
  if (origin === "archive") return "半年留存庫";
  if (origin === "previous_published") return "上一版庫存補位";
  return "自動候選";
}

function sourceOriginRank(origin) {
  if (origin === "candidate") return 4;
  if (origin === "editorial") return 3;
  if (origin === "archive") return 2;
  return 1;
}

function mergePublishedRecords(previous, current) {
  if (!previous) {
    return { ...current };
  }
  const preferred = comparePublishedItems(current, previous) < 0 ? current : previous;
  const secondary = preferred === current ? previous : current;
  const sourceAliases = new Set([
    ...(Array.isArray(previous.source_aliases) ? previous.source_aliases : []),
    previous.source,
    ...(Array.isArray(current.source_aliases) ? current.source_aliases : []),
    current.source,
  ].filter(Boolean));
  return {
    ...secondary,
    ...preferred,
    title: preferred.title || secondary.title || "",
    summary: preferred.summary || secondary.summary || "",
    category: preferred.category || secondary.category || "",
    score: Math.max(Number(previous.score || 0), Number(current.score || 0)),
    source_origin: preferred.source_origin || secondary.source_origin || "candidate",
    published_at: preferred.published_at || secondary.published_at || today,
    source_aliases: [...sourceAliases],
  };
}

function dedupePublishedRecords(items) {
  const merged = new Map();
  for (const item of items) {
    const key = normalizeUrl(item.url);
    if (!key) continue;
    merged.set(key, mergePublishedRecords(merged.get(key), item));
  }
  return [...merged.values()].sort(comparePublishedItems);
}

async function main() {
  const raw = (await readJson(candidatesPath, [])).map((item) => ({ ...item, source_origin: "candidate" }));
  const editorial = (await readJson(editorialPath, [])).map((item) => ({ ...item, source_origin: "editorial" }));
  const previousContent = await readJson(outputPath, { items: [] });
  const archiveRaw = await readJson(candidatesArchivePath, { items: [] });
  const archiveItems = Array.isArray(archiveRaw?.items) ? archiveRaw.items : (Array.isArray(archiveRaw) ? archiveRaw : []);
  const archiveByUrl = new Map(
    archiveItems.map((item) => [normalizeUrl(item.url), item]).filter(([key]) => key),
  );
  const normalized = raw
    .map((item) => mergeArchiveFields(item, archiveByUrl))
    .filter((item) => withinDays(stableContentDate(item), PUBLISH_WINDOW_DAYS))
    .map(toPublishedItem);
  const previousInventory = (Array.isArray(previousContent.items) ? previousContent.items : [])
    .filter((item) => withinDays(item.date || item.published_at, PUBLISH_WINDOW_DAYS))
    .map(previousToPublishedItem);
  const archiveInventory = archiveItems
    .filter((item) => withinRetention(item, ARCHIVE_RETENTION_DAYS) && withinDays(stableContentDate(item), PUBLISH_WINDOW_DAYS))
    .map((item) => ({ ...item, source_origin: "archive" }))
    .map(toPublishedItem)
    .map((item) => ({
      ...item,
      score: Math.max(MIN_SCORE[item.type], Number(item.score || MIN_SCORE[item.type]) - 1),
    }));
  const editorialInventory = editorial
    .filter((item) => withinDays(stableContentDate(item), PUBLISH_WINDOW_DAYS))
    .map(toPublishedItem)
    .map((item) => ({
    ...item,
    score: Math.max(MIN_SCORE[item.type], Number(item.score || MIN_SCORE[item.type]) - 2),
  }));
  const inventory = dedupePublishedRecords([...normalized, ...archiveInventory, ...previousInventory, ...editorialInventory]);
  const published = [
    ...fillWithInventory(inventory, inventory, "shoe"),
    ...fillWithInventory(inventory, inventory, "news"),
  ].sort((a, b) => {
    const typeDiff = a.type.localeCompare(b.type);
    if (typeDiff !== 0) return typeDiff;
    const languageDiff = contentLanguageRank(a) - contentLanguageRank(b);
    if (languageDiff !== 0) return languageDiff;
    const originDiff = sourceOriginRank(b.source_origin) - sourceOriginRank(a.source_origin);
    if (originDiff !== 0) return originDiff;
    const dateDiff = String(b.date).localeCompare(String(a.date));
    if (dateDiff !== 0) return dateDiff;
    return b.score - a.score;
  });

  await mkdir(resolve(root, "site/data"), { recursive: true });
  await mkdir(resolve(root, "runner/內容"), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ generated_at: new Date().toISOString(), items: published }, null, 2)}\n`, "utf8");
  await writeFile(reportPath, buildReport(published), "utf8");
  console.log(`Published content: ${published.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
