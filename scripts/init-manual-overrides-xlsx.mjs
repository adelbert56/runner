// 一次性把 runner/賽事/人工補充.json 轉成可直接編輯的 Excel。
// 之後只在 Excel 編輯該檔即可；apply-manual-overrides.mjs 會優先讀 Excel。
// 重跑此腳本會用 人工補充.json 重建並「覆蓋」Excel（會蓋掉你在 Excel 的修改），平常別跑。
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";

const root = resolve(import.meta.dirname, "..");
const paths = {
  source: resolve(root, "runner/賽事/人工補充.json"),
  out: resolve(root, "runner/賽事/人工補充.xlsx"),
};

const FIELDS = [
  ["race_name", "賽事名稱", 32],
  ["race_date", "賽事日期", 12],
  ["registration_status", "報名狀態", 12],
  ["registration_note", "報名備註", 30],
  ["registration_opens_at", "開報日", 12],
  ["registration_deadline", "截止日", 12],
  ["registration_link", "報名連結", 30],
  ["official_event_url", "官方活動頁", 30],
  ["venue", "地點", 24],
  ["start_location", "起跑地點", 24],
  ["organizer", "主辦", 24],
  ["co_organizer", "協辦/承辦", 24],
  ["supervising_organizer", "指導單位", 20],
  ["sponsor", "贊助", 20],
  ["market_organizer", "市集主辦", 20],
  ["fees", "報名費", 30],
  ["quota", "名額", 20],
  ["distances", "距離（用 / 分隔）", 24],
  ["start_times", "開跑時間", 40],
  ["event_time", "活動時間", 20],
  ["verified_at", "查證日期", 12],
  ["verification_note", "查證備註", 40],
];

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (e) {
    console.error(`讀取失敗 ${path}: ${e.message}`);
    return fallback;
  }
}

function cellValue(field, value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (field === "distances" && Array.isArray(value)) {
    return value.join(" / ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

const entries = await readJson(paths.source, []);

const wb = new ExcelJS.Workbook();
wb.creator = "init-manual-overrides-xlsx";
const ws = wb.addWorksheet("人工補充", { views: [{ state: "frozen", ySplit: 1 }] });

ws.columns = FIELDS.map(([key, , width]) => ({ key, width }));
ws.getRow(1).values = FIELDS.map(([, header]) => header);
ws.getRow(1).font = { bold: true };
ws.getRow(1).alignment = { vertical: "middle" };

for (const entry of entries) {
  const row = FIELDS.map(([key]) => cellValue(key, entry[key]));
  ws.addRow(row);
}

ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: FIELDS.length } };

await wb.xlsx.writeFile(paths.out);
console.log(`Wrote ${paths.out} (${entries.length} rows)`);
