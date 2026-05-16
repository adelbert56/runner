import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const today = process.env.RUNNER_TODAY || new Date().toISOString().slice(0, 10);
const outputDir = resolve(root, "runner/内容");
const jsonPath = resolve(outputDir, "候选内容.json");
const reportPath = resolve(outputDir, "候选内容报告.md");

const sources = [
  {
    name: "運動筆記",
    url: "https://running.biji.co/",
    type: "跑步新聞",
    priority: 5,
  },
  {
    name: "動一動",
    url: "https://www.don1don.com/",
    type: "跑鞋新品 / 跑步專題",
    priority: 5,
  },
  {
    name: "Bounce",
    url: "https://bouncin.net/",
    type: "跑鞋新品",
    priority: 4,
  },
  {
    name: "Women's Health Taiwan",
    url: "https://www.womenshealthmag.com/tw/fitness/",
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
    url: "https://kenlu.net/tag/running/",
    type: "跑鞋評測 / 裝備情報",
    priority: 3,
  },
  {
    name: "KENLU 越野",
    url: "https://kenlu.net/tag/trail-run/",
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
  {
    name: "udn 品牌",
    url: "https://branda.udn.com/branda/index",
    type: "品牌新品 / 運動消費",
    priority: 2,
  },
];

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

function decodeHtml(text) {
  return compact(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function absoluteUrl(href, baseUrl) {
  try {
    const parsed = new URL(href, baseUrl);
    return /^https?:$/.test(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function scoreTitle(title, source) {
  if (blockedKeywords.some((keyword) => title.toLowerCase().includes(keyword.toLowerCase()))) {
    return 0;
  }
  if (!/跑|馬拉松|半馬|跑鞋|慢跑|路跑|越野|HYROX/i.test(title)) {
    return 0;
  }

  const keywordScore = keywords.reduce((sum, keyword) => (
    title.toLowerCase().includes(keyword.toLowerCase()) ? sum + 1 : sum
  ), 0);
  return keywordScore + source.priority;
}

function classify(title) {
  if (/跑鞋|慢跑鞋|碳板|ASICS|Nike|NIKE|Brooks|BROOKS|PUMA|HOKA|Mizuno|New Balance|Cloud/i.test(title)) {
    return "跑鞋新品";
  }
  if (/新手|入門|初跑|跑姿|肌力|心率|乳酸閾值/.test(title)) {
    return "入門知識";
  }
  if (/恢復|伸展|傷|睡眠|疲勞/.test(title)) {
    return "恢復";
  }
  if (/補給|飲食|碳水|蛋白|能量膠/.test(title)) {
    return "補給";
  }
  if (/訓練|間歇|節奏|長跑|半馬|馬拉松/.test(title)) {
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

async function fetchArticleMetadata(item) {
  try {
    const response = await fetch(item.url, {
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "RunnerPlazaContentBot/0.1 (+https://github.com/adelbert56/runner)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return item;
    }
    const html = await response.text();
    const title = extractMetaTitle(html);
    const description = extractMetaDescription(html);
    return {
      ...item,
      title: title && title.length >= 6 ? title : item.title,
      description: description || item.description || "",
      category: classify(title && title.length >= 6 ? title : item.title),
      score: title && title.length >= 6 ? Math.max(item.score, scoreTitle(title, { priority: item.score - 1 })) : item.score,
    };
  } catch {
    return item;
  }
}

function extractLinks(html, source) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html))) {
    const url = absoluteUrl(match[1], source.url);
    const title = compact(match[2]);

    if (!url || url.endsWith("#") || /q=competition|act=info&cid=/i.test(url) || !title || title.length < 6 || title.length > 140) {
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
      suggested_for: "待判斷",
      runner_takeaway: "待代理人摘要",
      publish_status: "candidate",
    });
  }

  return links;
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "RunnerPlazaContentBot/0.1 (+https://github.com/adelbert56/runner)",
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return extractLinks(await response.text(), source);
}

async function enrichTitles(items) {
  const enriched = [];
  for (const item of items.slice(0, 60)) {
    enriched.push(await fetchArticleMetadata(item));
  }
  return enriched;
}

function dedupe(items) {
  const seen = new Set();
  return items
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .filter((item) => {
      const key = item.url.replace(/[?#].*$/, "");
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 40);
}

function buildReport(items, errors) {
  const lines = [
    "# 跑鞋與跑步新聞候選內容",
    "",
    `產生時間：${new Date().toISOString()}`,
    `查詢基準日：${today}`,
    "",
    "這份清單由 GitHub Actions 定期整理，只是候選內容；上架前仍需確認來源、日期與跑者決策價值。",
    "",
    `候選筆數：${items.length}`,
    "",
    "| 分數 | 分類 | 來源 | 標題 | 摘要 | 連結 |",
    "| ---: | --- | --- | --- | --- | --- |",
    ...items.map((item) => `| ${item.score} | ${item.category} | ${item.source} | ${item.title.replace(/\|/g, "／")} | ${(item.description || "").replace(/\|/g, "／")} | [來源](${item.url}) |`),
  ];

  if (errors.length) {
    lines.push("", "## 抓取失敗", "", "| 來源 | 錯誤 |", "| --- | --- |");
    errors.forEach((error) => {
      lines.push(`| ${error.source} | ${String(error.message).replace(/\|/g, "／")} |`);
    });
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const results = [];
  const errors = [];

  for (const source of sources) {
    try {
      results.push(...await fetchSource(source));
    } catch (error) {
      errors.push({ source: source.name, message: error.message });
    }
  }

  let candidates = dedupe(await enrichTitles(results));
  if (!candidates.length && errors.length) {
    try {
      candidates = JSON.parse(await readFile(jsonPath, "utf8"));
      errors.push({ source: "fallback", message: "本次來源抓取失敗，保留上一版候選內容，避免清空前台素材。" });
    } catch {
      // Keep empty candidates when there is no previous file.
    }
  }
  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
  await writeFile(reportPath, buildReport(candidates, errors), "utf8");

  console.log(`Content candidates: ${candidates.length}`);
  if (errors.length) {
    console.log(`Source errors: ${errors.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
