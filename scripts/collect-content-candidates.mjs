import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";

const root = resolve(import.meta.dirname, "..");
const today = process.env.RUNNER_TODAY || todayInTaipei();
const outputDir = resolve(root, "runner/內容");
const jsonPath = resolve(outputDir, "候選內容.json");
const archivePath = resolve(outputDir, "候選內容庫.json");
const reportPath = resolve(outputDir, "候選內容報告.md");
const sourceHealthJsonPath = resolve(outputDir, "內容來源健康度報告.json");
const sourceHealthReportPath = resolve(outputDir, "內容來源健康度報告.md");
const ARCHIVE_RETENTION_DAYS = 183;
const PREFERRED_WINDOW_DAYS = 92;
const ENRICH_LIMIT = 120;
const CANDIDATES_ALL_LIMIT = 400;
const CANDIDATE_OUTPUT_LIMIT = 80;

const sources = [
  {
    name: "運動筆記",
    url: "https://running.biji.co/",
    entryUrls: [
      "https://running.biji.co/",
      "https://running.biji.co/index.php?q=news",
    ],
    type: "跑步新聞 / 跑鞋專題",
    priority: 5,
  },
  {
    name: "動一動",
    url: "https://www.don1don.com/",
    entryUrls: [
      "https://www.don1don.com/",
    ],
    type: "跑鞋新品 / 跑步專題",
    priority: 5,
  },
  {
    name: "Bounce",
    url: "https://bouncin.net/",
    entryUrls: [
      "https://bouncin.net/category/trend",
    ],
    allowUrlPatterns: [
      /\/p\//i,
    ],
    type: "跑鞋新品",
    priority: 4,
  },
  {
    name: "Runner's World",
    url: "https://www.runnersworld.com/",
    entryUrls: [
      "https://www.runnersworld.com/rss/gear.xml",
      "https://www.runnersworld.com/rss/training.xml",
      "https://www.runnersworld.com/gear/",
      "https://www.runnersworld.com/training/",
    ],
    allowUrlPatterns: [
      /\/(gear|training|beginner|news|runners-stories)\/[ag]\d+/i,
    ],
    type: "英文跑鞋評測 / 訓練知識",
    priority: 3,
  },
  {
    name: "Women's Health Taiwan",
    url: "https://www.womenshealthmag.com/tw/fitness/",
    entryUrls: [
      "https://www.womenshealthmag.com/tw/fitness/",
      "https://www.womenshealthmag.com/tw/fashion/equipment/",
    ],
    type: "跑鞋選購 / 健康訓練",
    priority: 3,
  },
  {
    name: "HK01 跑步",
    url: "https://www.hk01.com/channel/跑步",
    type: "跑步裝備 / 跑步知識",
    priority: 3,
  },
  {
    name: "KENLU",
    url: "https://kenlu.net/",
    entryUrls: [
      "https://kenlu.net/",
      "https://kenlu.net/category/review/",
      "https://kenlu.net/category/news/release/",
      "https://kenlu.net/tag/trail-hiking-shoes/",
    ],
    type: "跑鞋評測 / 裝備情報",
    priority: 3,
  },
  {
    name: "KENLU 越野",
    url: "https://kenlu.net/tag/trail-run/",
    entryUrls: [
      "https://kenlu.net/tag/trail-hiking-shoes/",
    ],
    type: "越野跑鞋 / 越野訓練",
    priority: 3,
  },
  {
    name: "運動科學網",
    url: "https://www.sportscience.com.tw/",
    type: "訓練知識 / 運動科學",
    priority: 3,
  },
  {
    name: "IR SPORTS",
    url: "https://irsports.com.tw/",
    type: "路跑活動 / 訓練資訊",
    priority: 2,
  },
];

const sourceByName = new Map(sources.map((source) => [source.name, source]));

const keywords = [
  "跑鞋",
  "慢跑鞋",
  "路跑",
  "跑步",
  "馬拉松",
  "半馬",
  "訓練",
  "新手",
  "入門",
  "跑姿",
  "肌力",
  "心率",
  "乳酸閾值",
  "初跑",
  "輪替",
  "傷痛",
  "恢復",
  "補給",
  "碳板",
  "越野",
  "鞋評",
  "開箱",
  "上市速報",
  "評測",
  "裝備",
  "選鞋",
  "鞋款",
  "實著",
  "新品",
  "ASICS",
  "Nike",
  "NIKE",
  "Brooks",
  "BROOKS",
  "PUMA",
  "HOKA",
  "Mizuno",
  "New Balance",
  "On",
  "Cloud",
  "running",
  "runner",
  "runners",
  "marathon",
  "trail",
  "shoe",
  "shoes",
  "trainer",
  "training",
  "recovery",
  "workout",
  "gear",
  "review",
];

const blockedKeywords = [
  "聯繫資訊",
  "CONTACT",
  "作者",
  "編輯群",
  "商品",
  "Don1Don",
  "饒舌",
  "Sportstyle",
  "甜甜圈",
  "寶可夢",
  "籃球",
  "Kobe",
  "LaMelo",
  "CONVERSE",
  "VANS",
  "Chuck",
  "D+AF",
  "Grace Gift",
  "蕾絲鞋",
  "攀岩",
  "匹克球",
  "內臟脂肪",
  "貝克漢",
  "艾蜜莉",
  "BTS",
  "林書豪",
];

function compact(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

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

function decodeHtml(text) {
  return compact(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function monthNumber(month) {
  const months = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    sept: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  return months[String(month || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 4)]
    || months[String(month || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 3)]
    || "";
}

function normalizeDateText(text) {
  const value = decodeHtml(text);
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    if (iso[2] === "00" || iso[3] === "00") return "";
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const slash = value.match(/\b(20\d{2})[\/.](\d{1,2})[\/.](\d{1,2})\b/);
  if (slash) {
    const month = String(slash[2]).padStart(2, "0");
    const day = String(slash[3]).padStart(2, "0");
    if (month === "00" || day === "00") return "";
    return `${slash[1]}-${month}-${day}`;
  }

  const zh = value.match(/\b(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\b/);
  if (zh) {
    const month = String(zh[2]).padStart(2, "0");
    const day = String(zh[3]).padStart(2, "0");
    if (month === "00" || day === "00") return "";
    return `${zh[1]}-${month}-${day}`;
  }

  const english = value.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/);
  if (english) {
    const month = monthNumber(english[2]);
    return month ? `${english[3]}-${month}-${String(english[1]).padStart(2, "0")}` : "";
  }

  return "";
}

function extractDateText(html) {
  const datePatterns = [
    /<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|article:modified_time|og:updated_time|pubdate|date|datePublished|dateModified)["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["'](?:article:published_time|article:modified_time|og:updated_time|pubdate|date|datePublished|dateModified)["'][^>]*>/i,
    /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /"dateModified"\s*:\s*"([^"]+)"/i,
    /\b20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\b/i,
    /\b20\d{2}[\/.]\d{1,2}[\/.]\d{1,2}\b/i,
    /\b\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+20\d{2}\b/i,
  ];

  for (const pattern of datePatterns) {
    const match = html.match(pattern);
    const date = normalizeDateText(match?.[1] || match?.[0] || "");
    if (date) return date;
  }
  return "";
}

function absoluteUrl(href, baseUrl) {
  try {
    const parsed = new URL(href, baseUrl);
    return /^https?:$/.test(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function extractHref(tag) {
  if (!tag) return "";
  const match = String(tag).match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
  return match?.[1] || match?.[2] || match?.[3] || "";
}

function isAllowedSourceUrl(url, source) {
  if (!url) return false;
  const patterns = Array.isArray(source.allowUrlPatterns) ? source.allowUrlPatterns : null;
  if (!patterns || !patterns.length) {
    return true;
  }
  return patterns.some((pattern) => pattern.test(url));
}

function scoreTitle(title, source) {
  if (blockedKeywords.some((keyword) => title.toLowerCase().includes(keyword.toLowerCase()))) {
    return 0;
  }
  if (!/跑|馬拉松|半馬|跑鞋|慢跑|路跑|越野|HYROX|鞋評|開箱|評測|上市速報|裝備|選鞋|鞋款|實著|新品|running|runner|runners|marathon|trail|shoe|shoes|trainer|training|recovery|workout|gear|review/i.test(title)) {
    return 0;
  }

  const keywordScore = keywords.reduce((sum, keyword) => (
    title.toLowerCase().includes(keyword.toLowerCase()) ? sum + 1 : sum
  ), 0);
  return keywordScore + (source.effectivePriority ?? source.priority);
}

function isGenericTitle(title, source) {
  const normalizedTitle = String(title || "").trim().replace(/\s+/g, " ");
  if (!normalizedTitle) return true;
  if (normalizedTitle === source.name) return true;
  if (source.name === "Bounce" && /^bounce$/i.test(normalizedTitle)) return true;
  if (source.name === "Runner's World" && /(?:^|\s)runner(?:\s|$)|\/\s*runner\s*$/i.test(normalizedTitle)) return true;
  return false;
}

function isCrawlableArticleUrl(url, source) {
  return isAllowedSourceUrl(url, source);
}

function looksBrokenTitle(title) {
  return /(?:\bShouldn|\bWouldn|\bCouldn|\bDidn|\bIsn|\bWasn)\b$/i.test(title)
    || /(?:\|\s*It)$/.test(title)
    || /(?:\bRunner\s*$)/i.test(title);
}

function isRejectedTitle(title, source) {
  if (source.name !== "Runner's World") {
    return false;
  }
  return /(?:gift|gifts|headphones?|earbuds?|earphones?|sunglasses?|glasses|hats?|caps?|treadmill|hydration packs?|hydration pack|heart rate monitors?|heart rate monitor)/i.test(title);
}

function normalizeTitleCandidate(title, source) {
  return decodeHtml(title)
    .replace(/\s*[｜|│]\s*(動一動|Don1Don|Bounce|HK01|Women's Health|運動筆記|Runner's World|Runner).*$/i, "")
    .replace(/\s*-\s*(KENLU.net|Runner's World).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitleCandidates(html) {
  const candidates = [];
  const add = (value) => {
    const candidate = compact(value || "");
    if (candidate) candidates.push(candidate);
  };

  const patterns = [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
    /"headline"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      add(match[1]);
    }
  }

  return candidates;
}

function choosePreferredTitle(html, source, fallbackTitle = "") {
  const candidates = extractTitleCandidates(html);
  if (fallbackTitle) {
    candidates.push(fallbackTitle);
  }

  for (const candidate of candidates) {
    const title = normalizeTitleCandidate(candidate, source);
    if (!title || title.length < 6 || title.length > 140) {
      continue;
    }
    if (isGenericTitle(title, source) || looksBrokenTitle(title) || isRejectedTitle(title, source)) {
      continue;
    }
    return title;
  }

  return normalizeTitleCandidate(fallbackTitle, source);
}

function classify(title) {
  if (/為什麼|怎麼|如何|真的|是否|原理|解析|入門|新手|課表|訓練|跑姿|重量訓練|肌力|恢復|補給|乳酸|心率|傷痛|疼痛|比較省力|效率/i.test(title)) {
    return "入門知識";
  }
  if (/跑鞋|慢跑鞋|碳板|ASICS|Nike|NIKE|Brooks|BROOKS|PUMA|HOKA|Mizuno|New Balance|Cloud|鞋評|開箱|上市速報|評測|裝備|鞋款|實著|新品|running|runner|runners|marathon|trail|shoe|shoes|trainer|training|recovery|workout|gear|review/i.test(title)) {
    return "跑鞋新品";
  }
  if (/新手|入門|初跑|跑姿|肌力|心率|乳酸閾值|how to|beginner|return to running/i.test(title)) {
    return "入門知識";
  }
  if (/恢復|伸展|傷|睡眠|疲勞|recovery|recover|injur|rest|soreness/i.test(title)) {
    return "恢復";
  }
  if (/補給|飲食|碳水|蛋白|能量膠|fuel|nutrition|hydration|gel|electrolyte/i.test(title)) {
    return "補給";
  }
  if (/訓練|間歇|節奏|長跑|半馬|馬拉松|training|workout|speed|tempo|long run|interval|pace|mile/i.test(title)) {
    return "訓練";
  }
  return "跑步新聞";
}

function extractMetaTitle(html) {
  const metaPatterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ];

  for (const pattern of metaPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1])
        .replace(/\s*[｜|│]\s*(動一動|Don1Don|Bounce|HK01|Women's Health|運動筆記).*$/i, "")
        .replace(/^(\d{4})-([a-z])/i, "$1 $2")
        .replace(/\bpanasonic\b/gi, "Panasonic")
        .trim();
    }
  }
  return "";
}

function extractMetaDescription(html) {
  const metaPatterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["'][^>]*>/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of metaPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1])
        .replace(/\s*[｜|│]\s*(動一動|Don1Don|Bounce|HK01|Women's Health|運動筆記).*$/i, "")
        .trim();
    }
  }
  return "";
}

function extractMetaDate(html) {
  return extractDateText(html);
}

const DEFAULT_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

async function fetchArticleMetadata(item) {
  try {
    const response = await fetch(item.url, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return item;
    }
    const html = await response.text();
    const source = sourceByName.get(item.source) || item;
    const title = choosePreferredTitle(html, source, item.title);
    const description = extractMetaDescription(html);
    const articleDate = extractMetaDate(html);
    return {
      ...item,
      title: title && title.length >= 6 ? title : item.title,
      description: description || item.description || "",
      article_date: articleDate || item.article_date || "",
      category: classify(title && title.length >= 6 ? title : item.title),
      score: title && title.length >= 6 ? Math.max(item.score, scoreTitle(title, { priority: item.score - 1 })) : item.score,
    };
  } catch {
    return item;
  }
}

function extractFeedLinks(xml, source) {
  const links = [];
  const itemPattern = /<item\b[\s\S]*?<\/item>/gi;
  const entryPattern = /<entry\b[\s\S]*?<\/entry>/gi;

  const addLink = (url, title) => {
    const absolute = absoluteUrl(url, source.url);
    if (!absolute || absolute.endsWith("#") || !title || title.length < 6 || title.length > 140 || !isCrawlableArticleUrl(absolute, source) || isRejectedTitle(title, source)) {
      return;
    }
    const score = scoreTitle(title, source);
    if (score <= source.priority) {
      return;
    }
    links.push({
      checked_at: today,
      source: source.name,
      source_type: source.type,
      title,
      url: absolute,
      category: classify(title),
      score,
      article_date: "",
      suggested_for: "待判斷",
      runner_takeaway: "待代理人摘要",
      publish_status: "candidate",
    });
  };

  for (const match of xml.matchAll(itemPattern)) {
    const item = match[0];
    const title = compact(item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const url = compact(item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || extractHref(item.match(/<link\b[^>]*\/?>/i)?.[0] || ""));
    if (isGenericTitle(title, source) || isRejectedTitle(title, source) || !isCrawlableArticleUrl(url, source)) {
      continue;
    }
    addLink(url, title);
  }

  for (const match of xml.matchAll(entryPattern)) {
    const entry = match[0];
    const title = compact(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const url = compact(
      extractHref(entry.match(/<link\b[^>]*\/?>/i)?.[0] || "")
      || entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]
      || "",
    );
    if (isGenericTitle(title, source) || isRejectedTitle(title, source) || !isCrawlableArticleUrl(url, source)) {
      continue;
    }
    addLink(url, title);
  }

  return links;
}

function extractLinks(html, source) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html))) {
    const url = absoluteUrl(extractHref(match[0]) || match[1], source.url);
    const title = compact(match[4] || "");

    if (!url || url.endsWith("#") || /q=competition|act=info&cid=/i.test(url) || !title || title.length < 6 || title.length > 140) {
      continue;
    }
    if (isGenericTitle(title, source) || isRejectedTitle(title, source) || !isCrawlableArticleUrl(url, source)) {
      continue;
    }

    const score = scoreTitle(title, source);
    if (score <= source.priority) {
      continue;
    }

    links.push({
      checked_at: today,
      source: source.name,
      source_type: source.type,
      title,
      url,
      category: classify(title),
      score,
      // Prefer extracting a reliable published date from the article page itself.
      // Some listing pages embed unrelated historical timestamps that pollute the timeline.
      article_date: "",
      suggested_for: "待判斷",
      runner_takeaway: "待代理人摘要",
      publish_status: "candidate",
    });
  }

  return links;
}

function sourceEntryUrls(source) {
  const urls = [
    source.url,
    ...(Array.isArray(source.entryUrls) ? source.entryUrls : []),
  ];
  return [...new Set(urls.map((url) => absoluteUrl(url, source.url)).filter(Boolean))];
}

function extractSourceLinks(text, source) {
  if (/<(?:rss|feed|channel|item|entry)\b/i.test(text)) {
    const feedLinks = extractFeedLinks(text, source);
    if (feedLinks.length) {
      return feedLinks;
    }
  }
  return extractLinks(text, source);
}

async function fetchSource(source) {
  const results = [];
  const entryErrors = [];

  for (const entryUrl of sourceEntryUrls(source)) {
    try {
      const response = await fetch(entryUrl, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        entryErrors.push(`${entryUrl}: ${response.status} ${response.statusText}`);
        continue;
      }

      const body = await response.text();
      const entrySource = { ...source, url: entryUrl };
      results.push(...extractSourceLinks(body, entrySource));
    } catch (error) {
      entryErrors.push(`${entryUrl}: ${error.message}`);
    }
  }

  if (!results.length) {
    throw new Error(entryErrors[0] || `No crawlable entry URLs for ${source.name}`);
  }

  return results;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function priorHealthBySource(items) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [item.source, item]));
}

function sourceStatus({ ok, candidateCount, consecutiveFailures }) {
  if (!ok && consecutiveFailures >= 3) {
    return "需補強";
  }
  if (!ok || candidateCount === 0 || consecutiveFailures > 0) {
    return "可用需觀察";
  }
  return "穩定";
}

function effectivePriority(source, priorHealth) {
  const status = priorHealth?.status || "新來源";
  const consecutiveFailures = Number(priorHealth?.consecutive_failures || 0);
  if (status === "穩定") {
    return source.priority + 1;
  }
  if (consecutiveFailures >= 3 || status === "需補強") {
    return Math.max(1, source.priority - 1);
  }
  return source.priority;
}

async function enrichTitles(items) {
  const enriched = [];
  for (const item of items.slice(0, ENRICH_LIMIT)) {
    enriched.push(await fetchArticleMetadata(item));
  }
  return enriched;
}

function dedupe(items, limit = 40) {
  const seen = new Set();
  return items
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .filter((item) => {
      const key = normalizeUrl(item.url);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function parseTaipeiDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function withinDays(value, windowDays) {
  const date = parseTaipeiDate(value);
  if (!date) return false;
  const cutoff = new Date(`${today}T00:00:00+08:00`);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const upperBound = new Date(`${today}T23:59:59+08:00`);
  return date >= cutoff && date <= upperBound;
}

function isPreferredWindowCandidate(item) {
  const dateText = item.article_date || item.checked_at || "";
  return withinDays(dateText, PREFERRED_WINDOW_DAYS);
}

function mergeCandidate(previous, current) {
  const merged = { ...(previous || {}), ...(current || {}) };
  merged.article_date = current.article_date || previous?.article_date || "";
  merged.description = current.description || previous?.description || "";
  merged.source_type = current.source_type || previous?.source_type || "";
  merged.category = current.category || previous?.category || "";
  merged.score = Math.max(Number(previous?.score || 0), Number(current.score || 0));
  merged.checked_at = current.checked_at || previous?.checked_at || today;
  merged.first_seen_at = previous?.first_seen_at || today;
  merged.last_seen_at = today;
  merged.seen_count = Number(previous?.seen_count || 0) + 1;
  return merged;
}

function normalizeArchive(raw) {
  if (Array.isArray(raw)) {
    return { generated_at: new Date().toISOString(), retention_days: ARCHIVE_RETENTION_DAYS, items: raw };
  }
  if (raw && typeof raw === "object" && Array.isArray(raw.items)) {
    return { ...raw, items: raw.items };
  }
  return { generated_at: new Date().toISOString(), retention_days: ARCHIVE_RETENTION_DAYS, items: [] };
}

function applyRetention(items, retentionDays) {
  const cutoff = new Date(`${today}T00:00:00+08:00`);
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return items.filter((item) => {
    const lastSeen = parseTaipeiDate(item.last_seen_at || item.checked_at || "");
    return lastSeen ? lastSeen >= cutoff : true;
  });
}

function buildReport(items, errors) {
  const lines = [
    "# 跑鞋與跑步新聞候選內容",
    "",
    `產生時間：${new Date().toISOString()}`,
    `查詢基準日：${today}`,
    "",
    "這份清單由 GitHub Actions 定期整理，會交由自動上架規則挑選；來源、日期與跑者決策價值會在發布品質檢查中驗證。",
    "",
    `候選筆數：${items.length}`,
    "",
    "| 分數 | 日期 | 分類 | 來源 | 標題 | 摘要 | 連結 |",
    "| ---: | --- | --- | --- | --- | --- | --- |",
    ...items.map((item) => `| ${item.score} | ${item.article_date || item.checked_at} | ${item.category} | ${item.source} | ${item.title.replace(/\|/g, "／")} | ${(item.description || "").replace(/\|/g, "／")} | [來源](${item.url}) |`),
  ];

  if (errors.length) {
    lines.push("", "## 抓取失敗", "", "| 來源 | 錯誤 |", "| --- | --- |");
    errors.forEach((error) => {
      lines.push(`| ${error.source} | ${String(error.message).replace(/\|/g, "／")} |`);
    });
  }

  return `${lines.join("\n")}\n`;
}

function buildSourceHealthReport(items) {
  const lines = [
    "# 內容來源健康度報告",
    "",
    `產生時間：${new Date().toISOString()}`,
    `查詢基準日：${today}`,
    "",
    "這份報告追蹤跑鞋與跑步內容來源的抓取狀態。下一輪候選收集會依狀態調整有效權重：穩定來源加權，連續失敗來源降權。",
    "",
    "| 來源 | 狀態 | 候選 | 連續失敗 | 基礎權重 | 有效權重 | 錯誤 |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...items.map((item) => `| ${item.source} | ${item.status} | ${item.candidate_count} | ${item.consecutive_failures} | ${item.base_priority} | ${item.effective_priority} | ${String(item.error || "-").replaceAll("|", "｜")} |`),
    "",
  ];
  return `${lines.join("\n")}`;
}

async function main() {
  const results = [];
  const errors = [];
  const previousHealth = priorHealthBySource(await readJson(sourceHealthJsonPath, []));
  const runtimeSources = sources.map((source) => ({
    ...source,
    effectivePriority: effectivePriority(source, previousHealth.get(source.name)),
  }));
  const sourceRuns = [];

  for (const source of runtimeSources) {
    try {
      const sourceResults = await fetchSource(source);
      results.push(...sourceResults);
      sourceRuns.push({ source, ok: true, candidateCount: sourceResults.length, error: "" });
    } catch (error) {
      errors.push({ source: source.name, message: error.message });
      sourceRuns.push({ source, ok: false, candidateCount: 0, error: error.message });
    }
  }

  const enrichedCandidates = await enrichTitles(results);
  const preferredCandidates = enrichedCandidates.filter(isPreferredWindowCandidate);
  let candidatesAll = dedupe(preferredCandidates, CANDIDATES_ALL_LIMIT);
  let candidates = candidatesAll.slice(0, CANDIDATE_OUTPUT_LIMIT);
  if (!candidates.length && errors.length) {
    try {
      candidates = JSON.parse(await readFile(jsonPath, "utf8"));
      candidatesAll = candidates;
      errors.push({ source: "fallback", message: "本次來源抓取失敗，保留上一版候選內容，避免清空前台素材。" });
    } catch {
      // Keep empty candidates when there is no previous file.
    }
  }
  await mkdir(outputDir, { recursive: true });

  const previousArchive = normalizeArchive(await readJson(archivePath, null));
  const archiveByUrl = new Map(
    previousArchive.items.map((item) => [normalizeUrl(item.url), item]).filter(([key]) => key),
  );
  for (const item of candidatesAll) {
    const key = normalizeUrl(item.url);
    if (!key) continue;
    archiveByUrl.set(key, mergeCandidate(archiveByUrl.get(key), item));
  }
  const archivedItems = applyRetention([...archiveByUrl.values()], ARCHIVE_RETENTION_DAYS)
    .sort((a, b) => String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")) || b.score - a.score);

  const sourceHealth = sourceRuns.map((run) => {
    const previous = previousHealth.get(run.source.name);
    const consecutiveFailures = run.ok ? 0 : Number(previous?.consecutive_failures || 0) + 1;
    return {
      checked_at: today,
      source: run.source.name,
      url: run.source.url,
      source_type: run.source.type,
      status: sourceStatus({ ok: run.ok, candidateCount: run.candidateCount, consecutiveFailures }),
      ok: run.ok,
      candidate_count: run.candidateCount,
      consecutive_failures: consecutiveFailures,
      base_priority: run.source.priority,
      effective_priority: run.source.effectivePriority,
      error: run.error,
    };
  });
  await writeFile(jsonPath, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
  await writeFile(
    archivePath,
    `${JSON.stringify({ generated_at: new Date().toISOString(), retention_days: ARCHIVE_RETENTION_DAYS, items: archivedItems }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(reportPath, buildReport(candidates, errors), "utf8");
  await writeFile(sourceHealthJsonPath, `${JSON.stringify(sourceHealth, null, 2)}\n`, "utf8");
  await writeFile(sourceHealthReportPath, buildSourceHealthReport(sourceHealth), "utf8");

  console.log(`Content candidates: ${candidates.length}`);
  console.log(`Content archive items: ${archivedItems.length}`);
  console.log(`Content source issues: ${sourceHealth.filter((item) => item.status !== "穩定").length}`);
  if (errors.length) {
    console.log(`Source errors: ${errors.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
