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
const summaryWs = wb.addWorksheet("賽事摘要", { views: [{ state: "frozen", ySplit: 2 }] });

ws.columns = [
  { key: "race", width: 22 },
  { key: "name", width: 12 },
  { key: "amount", width: 12 },
  { key: "paid", width: 8 },
  { key: "registered", width: 9 },
  { key: "paid_date", width: 14 },
  { key: "size", width: 10 },
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
      size: p?.size ?? "",
      note: p?.note ?? "",
    });
  }
}

// ---- 標題 ----
ws.mergeCells("A1:H1");
const title = ws.getCell("A1");
title.value = "賽程收款明細表";
title.font = { bold: true, size: 18, color: { argb: "FF1F3864" } };
title.alignment = { vertical: "middle" };
ws.getRow(1).height = 26;

// ---- 總計區（公式，自動算）----
const amountRange = `C${DATA_START}:C${DATA_END}`;
const paidRange = `D${DATA_START}:D${DATA_END}`;
const raceRange = `A${DATA_START}:A${DATA_END}`;
const registeredRange = `E${DATA_START}:E${DATA_END}`;
const raceSheetRange = `'收款明細'!$A$${DATA_START}:$A$${DATA_END}`;
const amountSheetRange = `'收款明細'!$C$${DATA_START}:$C$${DATA_END}`;
const paidSheetRange = `'收款明細'!$D$${DATA_START}:$D$${DATA_END}`;
const registeredSheetRange = `'收款明細'!$E$${DATA_START}:$E$${DATA_END}`;
ws.getCell("A2").value = "總金額";
ws.getCell("B2").value = { formula: `SUM(${amountRange})` };
ws.getCell("C2").value = "已收";
ws.getCell("D2").value = { formula: `SUMIF(${paidRange},"是",${amountRange})` };
ws.getCell("E2").value = "未收";
ws.getCell("F2").value = { formula: `B2-D2` };
ws.getCell("A3").value = "篩選後金額";
ws.getCell("B3").value = { formula: `SUBTOTAL(109,${amountRange})` };
ws.getCell("C3").value = "（用下方「賽事」欄的篩選箭頭選某場，這格就只算那場）";
ws.getCell("G2").value = "指定賽事";
ws.getCell("H2").value = races[0]?.race_name ?? "";
ws.getCell("G3").value = "該賽事總額";
ws.getCell("H3").value = { formula: `IF($H$2="","",SUMIF(${raceRange},$H$2,${amountRange}))` };
ws.getCell("G4").value = "已收 / 未收";
ws.getCell("H4").value = {
  formula: `IF($H$2="","",TEXT(SUMIFS(${amountRange},${raceRange},$H$2,${paidRange},"是"),"#,##0")&" / "&TEXT(SUMIF(${raceRange},$H$2,${amountRange})-SUMIFS(${amountRange},${raceRange},$H$2,${paidRange},"是"),"#,##0"))`,
};
for (const addr of ["A2", "C2", "E2", "A3", "G2", "G3", "G4"]) {
  ws.getCell(addr).font = { bold: true, color: { argb: "FF1F3864" } };
}
for (const addr of ["B2", "D2", "F2", "B3", "H3"]) {
  ws.getCell(addr).font = { bold: true, size: 12 };
  ws.getCell(addr).numFmt = "#,##0";
}
ws.getCell("H4").font = { bold: true, size: 11 };
ws.getCell("C3").font = { italic: true, color: { argb: "FF888888" }, size: 9 };
ws.getCell("H2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F0D8" } };
ws.getCell("H2").border = {
  top: { style: "thin", color: { argb: "FFD6C48A" } },
  left: { style: "thin", color: { argb: "FFD6C48A" } },
  bottom: { style: "thin", color: { argb: "FFD6C48A" } },
  right: { style: "thin", color: { argb: "FFD6C48A" } },
};

// ---- 表頭 ----
const headers = ["賽事", "姓名", "報名金額", "已付", "已報名", "付款日", "衣服尺寸", "備註"];
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
  row.getCell(7).value = r.size;
  row.getCell(7).alignment = { horizontal: "center" };
  row.getCell(8).value = r.note;
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

ws.getCell("H2").dataValidation = {
  type: "list",
  allowBlank: true,
  formulae: ["'賽事摘要'!$A$3:$A$200"],
};

// ---- 紅綠上色：已付=是 綠、否 紅 ----
ws.addConditionalFormatting({
  ref: `D${DATA_START}:D${DATA_END}`,
  rules: [
    { type: "cellIs", operator: "equal", priority: 1, formulae: ['"是"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD7F0D7" } } } },
    { type: "cellIs", operator: "equal", priority: 2, formulae: ['"否"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFAD7D7" } } } },
  ],
});

// ---- 篩選 ----
ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: 8 } };

// ---- 賽事摘要工作表：自動依賽事分開彙總 ----
summaryWs.columns = [
  { key: "race", width: 26 },
  { key: "total", width: 12 },
  { key: "received", width: 12 },
  { key: "unpaid", width: 12 },
  { key: "paid_count", width: 10 },
  { key: "unpaid_count", width: 10 },
  { key: "registered_count", width: 12 },
];

summaryWs.mergeCells("A1:G1");
summaryWs.getCell("A1").value = "多賽事收款摘要";
summaryWs.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1F3864" } };
summaryWs.getCell("A1").alignment = { vertical: "middle" };
summaryWs.getRow(1).height = 24;

["賽事", "總額", "已收", "未收", "已付人數", "未付人數", "已報名人數"].forEach((label, index) => {
  const cell = summaryWs.getCell(2, index + 1);
  cell.value = label;
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5597" } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
});

summaryWs.getCell("A3").value = {
  formula: `SORT(UNIQUE(FILTER(${raceSheetRange},${raceSheetRange}<>"","")))`,
};

for (let row = 3; row <= 200; row++) {
  summaryWs.getCell(`B${row}`).value = { formula: `IF(A${row}="","",SUMIF(${raceSheetRange},A${row},${amountSheetRange}))` };
  summaryWs.getCell(`C${row}`).value = { formula: `IF(A${row}="","",SUMIFS(${amountSheetRange},${raceSheetRange},A${row},${paidSheetRange},"是"))` };
  summaryWs.getCell(`D${row}`).value = { formula: `IF(A${row}="","",B${row}-C${row})` };
  summaryWs.getCell(`E${row}`).value = { formula: `IF(A${row}="","",COUNTIFS(${raceSheetRange},A${row},${paidSheetRange},"是"))` };
  summaryWs.getCell(`F${row}`).value = { formula: `IF(A${row}="","",COUNTIFS(${raceSheetRange},A${row},${paidSheetRange},"否"))` };
  summaryWs.getCell(`G${row}`).value = { formula: `IF(A${row}="","",COUNTIFS(${raceSheetRange},A${row},${registeredSheetRange},"是"))` };
}

for (const col of ["B", "C", "D"]) {
  summaryWs.getColumn(col).numFmt = "#,##0";
}

await wb.xlsx.writeFile(paths.out);
console.log(`已產出可編輯 Excel：${paths.out}（${rows.length} 筆）。之後直接在 Excel 編輯即可。`);
