// 一次性產生「可直接編輯」的收款 Excel：內建公式、下拉、紅綠上色。
// 之後只在 Excel 編輯該檔即可，總計自動算，不需再跑指令。
// 重跑此腳本會用 收款明細.json 重建並「覆蓋」Excel（會蓋掉你在 Excel 的修改），平常別跑。
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";

const root = resolve(import.meta.dirname, "..");
const paths = {
  source: resolve(root, "runner/賽事/收款明細.json"),
  out: resolve(root, "runner/賽事/收款明細.xlsx"),
};

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (e) {
    console.error(`讀取失敗 ${path}: ${e.message}`);
    return fallback;
  }
}

const source = await readJson(paths.source, { races: [] });
const races = Array.isArray(source?.races) ? source.races : [];

const wb = new ExcelJS.Workbook();
wb.creator = "init-payment-xlsx";
const ws = wb.addWorksheet("收款明細", { views: [{ state: "frozen", ySplit: 5 }] });

ws.columns = [
  { key: "race", width: 22 },
  { key: "name", width: 12 },
  { key: "amount", width: 12 },
  { key: "paid", width: 8 },
  { key: "registered", width: 9 },
  { key: "paid_date", width: 14 },
  { key: "note", width: 22 },
];

const HEADER_ROW = 5;
const DATA_START = 6;
const DATA_END = 500; // 預留空白列給你新增

// 先把資料攤平
const rows = [];
for (const race of races) {
  const payments = Array.isArray(race?.payments) ? race.payments : [];
  for (const p of payments) {
    rows.push({
      race: race?.race_name ?? "",
      name: p?.name ?? "",
      amount: Number(p?.amount) || 0,
      paid: p?.paid === true ? "是" : "否",
      registered: p?.registered === true ? "是" : "否",
      paid_date: p?.paid_date ?? "",
      note: p?.note ?? "",
    });
  }
}

// ---- 標題 ----
ws.mergeCells("A1:G1");
const title = ws.getCell("A1");
title.value = "賽程收款明細表";
title.font = { bold: true, size: 18, color: { argb: "FF1F3864" } };
title.alignment = { vertical: "middle" };
ws.getRow(1).height = 26;

// ---- 總計區（公式，自動算）----
const amountRange = `C${DATA_START}:C${DATA_END}`;
const paidRange = `D${DATA_START}:D${DATA_END}`;
ws.getCell("A2").value = "總金額";
ws.getCell("B2").value = { formula: `SUM(${amountRange})` };
ws.getCell("C2").value = "已收";
ws.getCell("D2").value = { formula: `SUMIF(${paidRange},"是",${amountRange})` };
ws.getCell("E2").value = "未收";
ws.getCell("F2").value = { formula: `B2-D2` };
ws.getCell("A3").value = "篩選後金額";
ws.getCell("B3").value = { formula: `SUBTOTAL(109,${amountRange})` };
ws.getCell("C3").value = "（用下方「賽事」欄的篩選箭頭選某場，這格就只算那場）";
for (const addr of ["A2", "C2", "E2", "A3"]) {
  ws.getCell(addr).font = { bold: true, color: { argb: "FF1F3864" } };
}
for (const addr of ["B2", "D2", "F2", "B3"]) {
  ws.getCell(addr).font = { bold: true, size: 12 };
  ws.getCell(addr).numFmt = "#,##0";
}
ws.getCell("C3").font = { italic: true, color: { argb: "FF888888" }, size: 9 };

// ---- 表頭 ----
const headers = ["賽事", "姓名", "報名金額", "已付", "已報名", "付款日", "備註"];
const hr = ws.getRow(HEADER_ROW);
headers.forEach((h, i) => {
  const c = hr.getCell(i + 1);
  c.value = h;
  c.font = { bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5597" } };
  c.alignment = { horizontal: "center", vertical: "middle" };
});
hr.height = 22;

// ---- 資料列 ----
rows.forEach((r, idx) => {
  const row = ws.getRow(DATA_START + idx);
  row.getCell(1).value = r.race;
  row.getCell(2).value = r.name;
  row.getCell(3).value = r.amount;
  row.getCell(3).numFmt = "#,##0";
  row.getCell(4).value = r.paid;
  row.getCell(5).value = r.registered;
  row.getCell(6).value = r.paid_date;
  row.getCell(4).alignment = { horizontal: "center" };
  row.getCell(5).alignment = { horizontal: "center" };
  row.getCell(7).value = r.note;
});

// ---- 下拉選單：已付 / 已報名 = 是 / 否 ----
for (let r = DATA_START; r <= DATA_END; r++) {
  for (const col of ["D", "E"]) {
    ws.getCell(`${col}${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"是,否"'],
    };
  }
}

// ---- 紅綠上色：已付=是 綠、否 紅 ----
ws.addConditionalFormatting({
  ref: `D${DATA_START}:D${DATA_END}`,
  rules: [
    { type: "cellIs", operator: "equal", priority: 1, formulae: ['"是"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD7F0D7" } } } },
    { type: "cellIs", operator: "equal", priority: 2, formulae: ['"否"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFAD7D7" } } } },
  ],
});

// ---- 篩選 ----
ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: 7 } };

await wb.xlsx.writeFile(paths.out);
console.log(`已產出可編輯 Excel：${paths.out}（${rows.length} 筆）。之後直接在 Excel 編輯即可。`);
