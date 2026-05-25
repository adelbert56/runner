import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";

const root = resolve(import.meta.dirname, "..");
const generatedAt = todayInTaipei();
const outputPath = resolve(root, "site/data/automation-health.json");

const workflows = [
  {
    id: "weather-refresh",
    name: "天氣更新",
    schedule: "每日 07:00 Asia/Taipei",
    workflow: ".github/workflows/weather-refresh.yml",
    purpose: "更新 7 天內賽事天氣並部署站台",
  },
  {
    id: "data-refresh",
    name: "賽事爬蟲",
    schedule: "週二、週四 18:00 Asia/Taipei",
    workflow: ".github/workflows/data-refresh.yml",
    purpose: "抓取賽事、補官方資料、同步站台資料並部署",
  },
  {
    id: "content-candidates",
    name: "跑鞋新聞內容",
    schedule: "週一、週三、週五 09:00 Asia/Taipei",
    workflow: ".github/workflows/content-candidates.yml",
    purpose: "整理跑鞋與跑步新聞內容候選並部署",
  },
  {
    id: "runner-quips-refresh",
    name: "跑者碎念",
    schedule: "週一 10:23 Asia/Taipei，含備援",
    workflow: ".github/workflows/runner-quips-refresh.yml",
    purpose: "從候補池補充跑者碎念並部署",
  },
  {
    id: "message-cloud-refresh",
    name: "文字雲留言",
    schedule: "每日 14:17 Asia/Taipei",
    workflow: ".github/workflows/message-cloud-refresh.yml",
    purpose: "整理 GitHub Issue 留言並更新公告頁文字雲",
  },
];

await writeFile(outputPath, `${JSON.stringify({ generated_at: generatedAt, workflows }, null, 2)}\n`, "utf-8");
console.log(`Built automation health data for ${workflows.length} workflows.`);
