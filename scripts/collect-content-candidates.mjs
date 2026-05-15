import { mkdir, writeFile } from "node:fs/promises";
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

function absoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

function scoreTitle(title, source) {
  if (blockedKeywords.some((keyword) => title.toLowerCase().includes(keyword.toLowerCase()))) {
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

function extractLinks(html, source) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html))) {
    const url = absoluteUrl(match[1], source.url);
    const title = compact(match[2]);

    if (!url || url.endsWith("#") || !title || title.length < 6 || title.length > 80) {
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
    "| 分數 | 分類 | 來源 | 標題 | 連結 |",
    "| ---: | --- | --- | --- | --- |",
    ...items.map((item) => `| ${item.score} | ${item.category} | ${item.source} | ${item.title.replace(/\|/g, "／")} | [來源](${item.url}) |`),
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

  const candidates = dedupe(results);
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
