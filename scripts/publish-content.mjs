import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const candidatesPath = resolve(root, "runner/内容/候选内容.json");
const outputPath = resolve(root, "site/data/content.json");
const reportPath = resolve(root, "runner/内容/自动上架内容报告.md");
const today = process.env.RUNNER_TODAY || new Date().toISOString().slice(0, 10);

const LIMITS = {
  shoe: 16,
  news: 18,
};

const MIN_SCORE = {
  shoe: 5,
  news: 5,
};

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

function parseDate(value) {
  const text = String(value || "");
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : today;
}

function inferType(item) {
  return item.category === "跑鞋新品" ? "shoe" : "news";
}

function inferShoeCategory(title) {
  if (/碳板|競速|PHANTASM|FAST-R|ELITE|比賽/i.test(title)) return "競速";
  if (/越野|Trail|UTMB|CASCADIA|ULTRAFLY/i.test(title)) return "越野";
  if (/防水|GTX|GORE/i.test(title)) return "防水";
  if (/緩震|厚底|NIMBUS|NEO VISTA|CUMULUS/i.test(title)) return "緩震";
  if (/速度|節奏|TEMPO|MACH|DEVIATE/i.test(title)) return "速度訓練";
  return "跑鞋新品";
}

function cleanSummary(text) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^摘要[:：]\s*/, "")
    .trim();
  if (!cleaned || cleaned.length < 18 || /國內外各大精選賽事|一手掌握|不漏接|預計\s*\d+\s*月份上市/.test(cleaned)) {
    return "";
  }
  const lastSentenceEnd = Math.max(
    cleaned.lastIndexOf("。"),
    cleaned.lastIndexOf("！"),
    cleaned.lastIndexOf("？"),
    cleaned.lastIndexOf("."),
  );
  const limit = 120;
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
    return "";
  }
  const summary = (sentenceEnd > 42 ? clipped.slice(0, sentenceEnd + 1) : clipped).trim();
  return /[。！？.!?]$/.test(summary) ? summary : `${summary}。`;
}

function summarize(item, type) {
  const description = cleanSummary(item.description);
  const title = item.title.replace(/\s+/g, " ").trim();

  if (type === "shoe") {
    const category = inferShoeCategory(title);
    const shoeUse = {
      競速: "適合放在比賽日、節奏跑與間歇課，週跑量還不穩時不要拿來天天穿。",
      越野: "適合山徑、碎石與濕滑路面，先確認鞋底抓地、保護性與自己的路線需求。",
      防水: "適合雨天、通勤慢跑與濕冷環境，夏季長跑要留意悶熱與排汗。",
      緩震: "適合長跑、恢復跑與累積里程，挑選時要看後段穩定，不只看剛試穿的彈感。",
      速度訓練: "適合節奏跑與中長距離配速課，能補上日常鞋與競速鞋之間的空位。",
      跑鞋新品: "先看用途、腳感、穩定、重量與價格，再決定是否放進跑鞋輪替。",
    }[category];
    return `這雙鞋目前以「${category}」定位收錄。${shoeUse}`;
  }

  if (description) {
    if (/賽事|報名|路跑|馬拉松|半馬/i.test(title)) {
      return `賽事重點：${description}可用來判斷報名時程、距離或是否值得排進年度目標。`;
    }
    if (/訓練|間歇|節奏|長跑|配速|課表|恢復/i.test(title)) {
      return `訓練重點：${description}建議對照自己的週跑量、疲勞與目標賽事距離後再採用。`;
    }
    return `重點：${description}已保留和訓練、裝備或賽事決策相關的資訊，方便快速判斷是否深入閱讀。`;
  }

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

function toPublishedItem(item) {
  const type = inferType(item);
  const normalizedUrl = normalizeUrl(item.url);
  const title = String(item.title || "").trim();
  return {
    id: `${type}-${slugify(normalizedUrl || title)}`,
    type,
    title,
    date: parseDate(item.checked_at),
    source: item.source,
    category: type === "shoe" ? inferShoeCategory(title) : item.category,
    summary: summarize(item, type),
    url: item.url,
    score: item.score,
    published_at: today,
    publish_status: "published",
  };
}

function sortItems(items) {
  return items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title);
  });
}

function pick(items, type) {
  const seen = new Set();
  return sortItems(items.filter((item) => item.type === type && item.score >= MIN_SCORE[type]))
    .filter((item) => {
      const key = normalizeUrl(item.url);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, LIMITS[type]);
}

function buildReport(published) {
  const rows = published.map((item) => (
    `| ${item.type === "shoe" ? "跑鞋" : "新聞"} | ${item.score} | ${item.date} | ${item.source} | ${item.title.replace(/\|/g, "／")} | ${item.summary.replace(/\|/g, "／")} | [來源](${item.url}) |`
  ));
  return [
    "# 自動上架內容報告",
    "",
    `產生時間：${new Date().toISOString()}`,
    `查詢基準日：${today}`,
    "",
    "候選內容會依分數、分類與去重規則自動上架到前台。低分、重複或非跑者決策相關內容會留在候選清單。",
    "",
    `已上架：${published.length} 筆`,
    "",
    "| 類型 | 分數 | 日期 | 來源 | 標題 | 摘要 | 連結 |",
    "| --- | ---: | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

async function main() {
  const raw = JSON.parse(await readFile(candidatesPath, "utf8"));
  const normalized = raw.map(toPublishedItem);
  const published = [
    ...pick(normalized, "shoe"),
    ...pick(normalized, "news"),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.score - a.score);

  await mkdir(resolve(root, "site/data"), { recursive: true });
  await mkdir(resolve(root, "runner/内容"), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ generated_at: new Date().toISOString(), items: published }, null, 2)}\n`, "utf8");
  await writeFile(reportPath, buildReport(published), "utf8");
  console.log(`Published content: ${published.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
