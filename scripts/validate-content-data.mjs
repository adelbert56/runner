import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const contentPath = resolve(root, "site/data/content.json");
const reportPath = resolve(root, "runner/內容/內容品質報告.md");
const today = process.env.RUNNER_TODAY || new Date().toISOString().slice(0, 10);
const strictMode = process.argv.includes("--strict") || process.env.RUNNER_CONTENT_STRICT === "1";

const MIN_COUNTS = {
  shoe: 10,
  news: 10,
};

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function sentenceKeys(text) {
  return (String(text || "").match(/[^。！？.!?]+[。！？.!?]?/g) || [])
    .map((sentence) => sentence.replace(/[，、；：,.!?！？。;:\s]/g, "").slice(0, 48))
    .filter(Boolean);
}

function itemIssues(item, index, seenUrls) {
  const issues = [];
  const label = item.title || `第 ${index + 1} 筆`;
  const urlKey = normalizeUrl(item.url);
  const summary = String(item.summary || "").trim();
  const keys = sentenceKeys(summary);

  if (!["shoe", "news"].includes(item.type)) {
    issues.push({ severity: "high", label, issue: "類型不是 shoe/news" });
  }
  if (!hasText(item.title) || String(item.title).length < 6) {
    issues.push({ severity: "high", label, issue: "標題缺漏或太短" });
  }
  if (!urlKey) {
    issues.push({ severity: "high", label, issue: "來源 URL 無效" });
  } else if (seenUrls.has(urlKey)) {
    issues.push({ severity: "high", label, issue: "來源 URL 重複" });
  } else {
    seenUrls.add(urlKey);
  }
  if (!hasText(summary) || summary.length < 18) {
    issues.push({ severity: "high", label, issue: "摘要缺漏或太短" });
  }
  if (summary.length > 180) {
    issues.push({ severity: "medium", label, issue: "摘要過長" });
  }
  if (/待代理人|待判斷|國內外各大精選賽事|一手掌握|不漏接/.test(summary)) {
    issues.push({ severity: "high", label, issue: "摘要仍含候選或低資訊量文字" });
  }
  if (keys.length !== new Set(keys).size) {
    issues.push({ severity: "medium", label, issue: "摘要句子重複" });
  }
  if (item.type === "shoe" && !/跑鞋|鞋|競速|越野|防水|緩震|速度|日常|訓練|里程|節奏|碳板/i.test(`${item.title} ${item.category} ${summary}`)) {
    issues.push({ severity: "medium", label, issue: "跑鞋卡缺少明確鞋款或用途訊號" });
  }

  return issues;
}

function buildReport(items, issues, counts) {
  const lines = [
    "# 內容品質報告",
    "",
    `產生時間：${new Date().toISOString()}`,
    `查詢基準日：${today}`,
    "",
    `已上架：${items.length} 筆`,
    `跑鞋：${counts.shoe} 筆；新聞：${counts.news} 筆`,
    "",
  ];

  if (!issues.length) {
    lines.push("目前沒有內容品質問題。", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| 嚴重度 | 內容 | 問題 |", "| --- | --- | --- |");
  for (const issue of issues) {
    lines.push(`| ${issue.severity} | ${String(issue.label).replaceAll("|", "｜")} | ${String(issue.issue).replaceAll("|", "｜")} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const content = JSON.parse(await readFile(contentPath, "utf8"));
  const items = Array.isArray(content.items) ? content.items : [];
  const counts = {
    shoe: items.filter((item) => item.type === "shoe").length,
    news: items.filter((item) => item.type === "news").length,
  };
  const issues = [];
  const seenUrls = new Set();

  if (counts.shoe < MIN_COUNTS.shoe) {
    issues.push({ severity: "high", label: "跑鞋上架量", issue: `跑鞋只有 ${counts.shoe} 筆，低於 ${MIN_COUNTS.shoe} 筆` });
  }
  if (counts.news < MIN_COUNTS.news) {
    issues.push({ severity: "high", label: "新聞上架量", issue: `新聞只有 ${counts.news} 筆，低於 ${MIN_COUNTS.news} 筆` });
  }

  items.forEach((item, index) => {
    issues.push(...itemIssues(item, index, seenUrls));
  });

  await writeFile(reportPath, buildReport(items, issues, counts), "utf8");

  console.log(`Published content: ${items.length}`);
  console.log(`Shoe content: ${counts.shoe}`);
  console.log(`News content: ${counts.news}`);
  console.log(`Content quality issues: ${issues.length}`);
  console.log(`Wrote: ${reportPath}`);

  if (strictMode) {
    const strictIssues = issues.filter((issue) => issue.severity === "high");
    if (strictIssues.length) {
      console.error("Strict content quality gate failed:");
      for (const issue of strictIssues) {
        console.error(`- ${issue.label}: ${issue.issue}`);
      }
      process.exitCode = 1;
    } else {
      console.log("Strict content quality gate: pass");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
