import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const candidatesPath = resolve(root, "runner/内容/候选内容.json");
const editorialPath = resolve(root, "runner/内容/人工精选内容.json");
const outputPath = resolve(root, "site/data/content.json");
const reportPath = resolve(root, "runner/内容/自动上架内容报告.md");
const today = process.env.RUNNER_TODAY || new Date().toISOString().slice(0, 10);

const LIMITS = {
  shoe: 16,
  news: 18,
};

const MIN_SCORE = {
  shoe: 4,
  news: 3,
};

const SUMMARY_RULES = [
  "類別用標籤呈現，摘要不要重複來源名稱。",
  "摘要不使用「重點：」「訓練重點：」「賽事重點：」這種開頭。",
  "跑鞋入門與選鞋邏輯歸入入門專區；跑鞋頁只放新品、定位與評測。",
  "來源描述太籠統時使用決策型摘要，避免硬塞無資訊量文字。",
];

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
  const text = `${item.title || ""} ${item.description || ""}`;
  const hasShoeSignal = /跑鞋|鞋款|鞋底|中底|鞋面|鞋碼|碳板|GTX|GORE|BROOKS GHOST|PEGASUS|GEL-|NIMBUS|KAYANO|MACH|DEVIATE|FAST-R|PHANTASM|NEO VISTA|CLOUDMONSTER/i.test(text);
  const eventOnlySignal = /賽事|報名|馬拉松|半馬|UTMB|開放報名|城市路跑/i.test(text) && !hasShoeSignal;
  if (item.category === "跑鞋新品" && hasShoeSignal && !eventOnlySignal) return "shoe";
  return "news";
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
    date: parseDate(item.checked_at),
    source: item.source,
    category: type === "shoe" ? inferShoeCategory(title) : inferNewsCategory(title, item.description),
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

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
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
    "## 上架規則",
    "",
    ...SUMMARY_RULES.map((rule) => `- ${rule}`),
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
  const raw = await readJson(candidatesPath, []);
  const editorial = await readJson(editorialPath, []);
  const normalized = [...raw, ...editorial].map(toPublishedItem);
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
