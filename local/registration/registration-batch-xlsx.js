import ExcelJS from "exceljs";

const PERSON_SHEET = "團員資料";
const ENTRY_SHEET = "報名紀錄";
const OPTIONS_SHEET = "下拉選單";
const HEADER_FILL = "FF176B4B";
const HEADER_FONT = "FFFFFFFF";
const EDIT_FILL = "FFFFF8E7";
const TITLE_FILL = "FF0F3D2E";
const SUBTITLE_FILL = "FFEAF4EE";
const REFERENCE_FILL = "FFF3F5F4";
const TABLE_HEADER_ROW = 4;
const TABLE_DATA_START_ROW = TABLE_HEADER_ROW + 1;

const personColumns = [
  ["資料ID", "id", 20],
  ["姓名*", "name", 14],
  ["性別*", "gender", 10],
  ["衣服尺寸*", "defaultShirtSize", 12],
  ["手機*", "phone", 16],
  ["身分證號碼*", "nationalId", 16],
  ["出生年月日*", "birthday", 14],
  ["緊急聯絡人*", "emergencyName", 14],
  ["關係*", "emergencyRelationship", 12],
  ["緊急聯絡人手機*", "emergencyPhone", 18],
];

const entryColumns = [
  ["資料ID", "id", 20],
  ["團員資料ID", "personId", 20],
  ["團員姓名*", "personName", 14],
  ["賽事名稱*", "raceName", 28],
  ["賽事日期", "raceDate", 14],
  ["距離/組別", "distance", 14],
  ["縣市", "county", 12],
  ["地點", "location", 22],
  ["報名網址", "registrationUrl", 34],
  ["開放日期", "registrationOpensAt", 14],
  ["截止日期", "registrationDeadline", 14],
  ["衣服尺寸", "shirtSize", 12],
  ["處理狀態", "status", 14],
  ["已報名", "isRegistered", 10],
  ["已繳費", "isPaid", 10],
  ["報名日期", "registrationDate", 14],
  ["報名費", "paidAmount", 12],
  ["繳費日期", "paymentDate", 14],
  ["繳費方式", "paymentMethod", 14],
  ["訂單編號", "orderCode", 18],
  ["匯款末五碼", "transferLastFive", 14],
  ["備註", "notes", 30],
];

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function text(value) {
  return String(value ?? "").trim();
}

function dateText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : raw;
}

function normalizeEntryPart(value) {
  return text(value).replace(/\s+/g, " ").toLowerCase();
}

function normalizeDistanceOption(value) {
  return text(value).replace(/\s+/g, " ").replace(/(\d)\s*[Kk][Mm]\b/g, "$1km");
}

function uniqueDistanceOptions(values) {
  const seen = new Set();
  return values.reduce((options, value) => {
    const label = normalizeDistanceOption(value);
    const key = label.toLowerCase();
    if (label && !seen.has(key)) {
      seen.add(key);
      options.push(label);
    }
    return options;
  }, []).sort((left, right) => left.localeCompare(right, "zh-Hant", { numeric: true }));
}

function entryKey(entry) {
  return [entry.personId, entry.raceDate, normalizeEntryPart(entry.raceName), normalizeEntryPart(entry.distance)].join("|");
}

function excelDate(value) {
  const isoDate = dateText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? new Date(`${isoDate}T00:00:00Z`) : String(value ?? "");
}

function parseYesNo(value, label, errors, rowNumber) {
  const raw = text(value);
  if (!raw) return false;
  if (["是", "true", "1", "y", "yes"].includes(raw.toLowerCase())) return true;
  if (["否", "false", "0", "n", "no"].includes(raw.toLowerCase())) return false;
  errors.push(`${ENTRY_SHEET} 第 ${rowNumber} 列：${label} 請填「是」或「否」。`);
  return false;
}

function numberOrNull(value, label, errors, rowNumber) {
  const raw = text(value);
  if (!raw) return null;
  const result = Number(raw.replaceAll(",", ""));
  if (Number.isFinite(result) && result >= 0) return result;
  errors.push(`${ENTRY_SHEET} 第 ${rowNumber} 列：${label} 必須是 0 或正數。`);
  return null;
}

function styleSheet(sheet, columns, { hiddenColumns = [], title, subtitle } = {}) {
  sheet.views = [{ state: "frozen", ySplit: TABLE_HEADER_ROW, showGridLines: false }];
  sheet.properties.defaultRowHeight = 20;
  sheet.columns = columns.map(([, key, width]) => ({ key, width }));
  const lastColumn = columns.length;
  sheet.mergeCells(1, 1, 1, lastColumn);
  sheet.mergeCells(2, 1, 2, lastColumn);
  sheet.mergeCells(3, 1, 3, lastColumn);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_FILL } };
  sheet.getCell(1, 1).alignment = { vertical: "middle" };
  sheet.getCell(2, 1).value = subtitle;
  sheet.getCell(2, 1).font = { color: { argb: "FF285543" }, italic: true, size: 10 };
  sheet.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTITLE_FILL } };
  sheet.getCell(2, 1).alignment = { vertical: "middle" };
  sheet.getCell(3, 1).value = "淡黃色欄位可編輯；下拉欄位請從選單選取。資料 ID 已隱藏，請勿修改。";
  sheet.getCell(3, 1).font = { color: { argb: "FF66766D" }, size: 9 };
  sheet.getCell(3, 1).alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 20;
  const header = sheet.getRow(TABLE_HEADER_ROW);
  columns.forEach(([label], index) => { header.getCell(index + 1).value = label; });
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  sheet.autoFilter = { from: { row: TABLE_HEADER_ROW, column: 1 }, to: { row: TABLE_HEADER_ROW, column: columns.length } };
  hiddenColumns.forEach((column) => {
    sheet.getColumn(column).hidden = true;
  });
}

function addEditableRows(sheet, count, columns) {
  for (let row = TABLE_DATA_START_ROW; row < TABLE_DATA_START_ROW + count; row += 1) {
    columns.forEach(([, ,], columnIndex) => {
      if (columnIndex > 1 || sheet.name === PERSON_SHEET && columnIndex === 1) {
        sheet.getCell(row, columnIndex + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: EDIT_FILL } };
      } else {
        sheet.getCell(row, columnIndex + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: REFERENCE_FILL } };
      }
    });
  }
}

function addValidations(peopleSheet, entriesSheet, rowCount, distanceLastRow) {
  for (let row = TABLE_DATA_START_ROW; row < TABLE_DATA_START_ROW + rowCount; row += 1) {
    peopleSheet.getCell(`C${row}`).dataValidation = { type: "list", allowBlank: false, formulae: ['"男,女,其他"'] };
    peopleSheet.getCell(`D${row}`).dataValidation = { type: "list", allowBlank: false, formulae: ['"XS,S,M,L,XL,2XL,3XL,4XL"'] };
    entriesSheet.getCell(`F${row}`).dataValidation = { type: "list", allowBlank: true, formulae: [`'${OPTIONS_SHEET}'!$A$2:$A$${distanceLastRow}`] };
    entriesSheet.getCell(`L${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"XS,S,M,L,XL,2XL,3XL,4XL"'] };
    entriesSheet.getCell(`M${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"待報名,待確認,尚未開報,可報名,已報名未繳費,已完成,已截止,停辦,停賽,取消"'] };
    entriesSheet.getCell(`N${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"是,否"'] };
    entriesSheet.getCell(`O${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"是,否"'] };
    entriesSheet.getCell(`S${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"信用卡,ATM轉帳,超商,現金,其他"'] };
  }
}

function formatPopulatedDates(sheet, columns, rowCount) {
  for (let row = TABLE_DATA_START_ROW; row < TABLE_DATA_START_ROW + rowCount; row += 1) {
    columns.forEach((column) => {
      const cell = sheet.getCell(`${column}${row}`);
      if (cell.value instanceof Date) cell.numFmt = "yyyy-mm-dd";
    });
  }
}

export async function createRegistrationBatchWorkbook(payload, { distanceOptions = [] } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Runner 本機報名管理";
  workbook.created = new Date();
  workbook.properties.date1904 = false;

  const guide = workbook.addWorksheet("使用說明");
  guide.views = [{ showGridLines: false }];
  guide.columns = [{ width: 23 }, { width: 98 }];
  guide.getCell("A1").value = "報名管理批次編輯";
  guide.getCell("A1").font = { bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  guide.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_FILL } };
  guide.getCell("A1").alignment = { vertical: "middle" };
  guide.mergeCells("A1:B1");
  guide.getRow(1).height = 34;
  guide.getCell("A2").value = "先編輯兩張資料表，再回到報名管理上傳；系統會先檢查，不會直接覆寫。";
  guide.getCell("A2").font = { color: { argb: "FF285543" }, italic: true };
  guide.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTITLE_FILL } };
  guide.mergeCells("A2:B2");
  guide.getRow(2).height = 24;
  const instructions = [
    ["操作方式", "先匯出此檔，在「團員資料」與「報名紀錄」修改後，回到本機報名管理選擇檔案匯入。系統會先顯示新增、更新、刪除與錯誤摘要，確認後才套用。"],
    ["資料ID", "已隱藏，請勿修改；既有資料靠它判斷更新。新增資料的資料ID請留白。"],
    ["新增報名", "在「報名紀錄」新增列時，填入團員姓名；若是既有團員，系統會自動對應。團員姓名重複時請先在團員資料改成可辨識的名稱。"],
    ["刪除資料", "從工作表刪除既有列，確認套用時就會刪除對應資料；預覽會明確列出刪除數量。"],
    ["必填欄位", "團員資料標示 * 的欄位必填；報名紀錄需有團員姓名與賽事名稱。"],
    ["安全機制", "每次確認匯入前，系統會自動保留上一版 JSON 備份；若資料在預覽後被其他分頁更新，系統會拒絕套用。"],
  ];
  instructions.forEach(([label, description], index) => {
    const row = index + 3;
    guide.getCell(row, 1).value = label;
    guide.getCell(row, 1).font = { bold: true, color: { argb: "FF176B4B" } };
    guide.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F7F3" } };
    guide.getCell(row, 2).value = description;
    guide.getCell(row, 2).alignment = { wrapText: true, vertical: "top" };
    guide.getCell(row, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBFCFB" } };
    guide.getRow(row).height = 38;
  });

  const peopleSheet = workbook.addWorksheet(PERSON_SHEET);
  const entriesSheet = workbook.addWorksheet(ENTRY_SHEET);
  const optionsSheet = workbook.addWorksheet(OPTIONS_SHEET);
  styleSheet(peopleSheet, personColumns, {
    hiddenColumns: [1],
    title: "團員資料｜基本資料主檔",
    subtitle: "先完成團員資料，再到「報名紀錄」維護每一筆賽事。姓名、性別、衣服尺寸與聯絡資訊為必填。",
  });
  styleSheet(entriesSheet, entryColumns, {
    hiddenColumns: [1, 2, 7, 8, 9, 10, 11, 20, 21],
    title: "報名紀錄｜賽事、狀態與繳費",
    subtitle: "以一列代表一位團員的一場報名。核心作業欄位預設顯示；賽事來源與訂單核帳欄已收合，需要時可在 Excel 取消隱藏。",
  });

  const people = Array.isArray(payload.people) ? payload.people : [];
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const allDistanceOptions = uniqueDistanceOptions([...distanceOptions, ...entries.map((entry) => entry.distance)]);
  optionsSheet.getColumn(1).width = 18;
  optionsSheet.getCell("A1").value = "距離／組別";
  allDistanceOptions.forEach((distance, index) => { optionsSheet.getCell(index + 2, 1).value = distance; });
  optionsSheet.state = "veryHidden";
  const peopleById = new Map(people.map((person) => [person.id, person]));
  people.forEach((person) => peopleSheet.addRow(personColumns.reduce((row, [, key]) => ({
    ...row,
    [key]: key === "birthday" ? excelDate(person[key]) : person[key] ?? "",
  }), {})));
  entries.forEach((entry) => {
    const person = peopleById.get(entry.personId) || {};
    entriesSheet.addRow(entryColumns.reduce((row, [, key]) => ({
      ...row,
      [key]: key === "personName" ? person.name || "" : key === "isRegistered" || key === "isPaid" ? (entry[key] ? "是" : "否") : ["raceDate", "registrationOpensAt", "registrationDeadline", "registrationDate", "paymentDate"].includes(key) ? excelDate(entry[key]) : entry[key] ?? "",
    }), {}));
  });

  const editableRows = Math.max(80, people.length + 30, entries.length + 30);
  addEditableRows(peopleSheet, editableRows, personColumns);
  addEditableRows(entriesSheet, editableRows, entryColumns);
  addValidations(peopleSheet, entriesSheet, editableRows, Math.max(2, allDistanceOptions.length + 1));
  ["E", "F", "J"].forEach((column) => peopleSheet.getColumn(column).numFmt = "@");
  ["E", "F", "J", "U"].forEach((column) => entriesSheet.getColumn(column).numFmt = "@");
  entriesSheet.getColumn("Q").numFmt = "#,##0";
  formatPopulatedDates(peopleSheet, ["G"], editableRows);
  formatPopulatedDates(entriesSheet, ["E", "J", "K", "P", "R"], editableRows);
  ["C", "L", "M", "N", "O", "S"].forEach((column) => entriesSheet.getColumn(column).alignment = { horizontal: "center", vertical: "middle" });
  ["C", "D"].forEach((column) => peopleSheet.getColumn(column).alignment = { horizontal: "center", vertical: "middle" });
  ["G", "H", "I", "J", "K", "Q", "R", "S", "T", "U", "V"].forEach((column) => entriesSheet.getColumn(column).outlineLevel = 1);
  entriesSheet.addConditionalFormatting({
    ref: `M${TABLE_DATA_START_ROW}:M${TABLE_DATA_START_ROW + editableRows - 1}`,
    rules: [
      { type: "containsText", operator: "containsText", text: "已完成", style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EEDF" } }, font: { color: { argb: "FF176B4B" } } } },
      { type: "containsText", operator: "containsText", text: "已截止", style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E9E8" } }, font: { color: { argb: "FF5D6A63" } } } },
      { type: "containsText", operator: "containsText", text: "可報名", style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0C9" } }, font: { color: { argb: "FF895B00" } } } },
    ],
  });
  ["N", "O"].forEach((column) => entriesSheet.addConditionalFormatting({
    ref: `${column}${TABLE_DATA_START_ROW}:${column}${TABLE_DATA_START_ROW + editableRows - 1}`,
    rules: [
      { type: "cellIs", operator: "equal", formulae: ['"是"'], style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EEDF" } }, font: { color: { argb: "FF176B4B" } } } },
      { type: "cellIs", operator: "equal", formulae: ['"否"'], style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBE3E1" } }, font: { color: { argb: "FFA33A32" } } } },
    ],
  }));
  return workbook.xlsx.writeBuffer();
}

function worksheetRows(sheet, columns, errors) {
  if (!sheet) {
    errors.push(`找不到「${columns === personColumns ? PERSON_SHEET : ENTRY_SHEET}」工作表。`);
    return [];
  }
  const expected = columns.map(([header]) => header);
  const headers = new Map();
  sheet.getRow(TABLE_HEADER_ROW).eachCell((cell, column) => headers.set(text(cell.value), column));
  const missingHeaders = expected.filter((header) => !headers.has(header));
  if (missingHeaders.length) {
    errors.push(`「${sheet.name}」缺少欄位：${missingHeaders.join("、")}。請使用系統匯出的 Excel。`);
    return [];
  }
  const rows = [];
  for (let rowNumber = TABLE_DATA_START_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = {};
    columns.forEach(([header, key]) => {
      row[key] = sheet.getCell(rowNumber, headers.get(header)).value;
    });
    if (Object.values(row).every((value) => !text(value))) continue;
    rows.push({ rowNumber, row });
  }
  return rows;
}

export async function prepareRegistrationBatchImport(buffer, current, { distanceOptions = [] } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const errors = [];
  const rawPeople = worksheetRows(workbook.getWorksheet(PERSON_SHEET), personColumns, errors);
  const rawEntries = worksheetRows(workbook.getWorksheet(ENTRY_SHEET), entryColumns, errors);
  if (errors.length) return { errors };

  const currentPeople = new Map((current.people || []).map((person) => [person.id, person]));
  const currentEntries = new Map((current.entries || []).map((entry) => [entry.id, entry]));
  const allowedDistanceOptions = new Set(uniqueDistanceOptions([
    ...distanceOptions,
    ...(current.entries || []).map((entry) => entry.distance),
  ]).map((distance) => distance.toLowerCase()));
  const seenPeople = new Set();
  const people = rawPeople.map(({ rowNumber, row }) => {
    const id = text(row.id);
    if (id && !currentPeople.has(id)) errors.push(`${PERSON_SHEET} 第 ${rowNumber} 列：資料ID無法對應既有資料，新增資料請將資料ID留白。`);
    if (id && seenPeople.has(id)) errors.push(`${PERSON_SHEET} 第 ${rowNumber} 列：資料ID重複。`);
    seenPeople.add(id);
    const person = {
      id: id || createId("person"),
      name: text(row.name),
      gender: text(row.gender),
      defaultShirtSize: text(row.defaultShirtSize),
      phone: text(row.phone),
      nationalId: text(row.nationalId),
      birthday: dateText(row.birthday),
      emergencyName: text(row.emergencyName),
      emergencyRelationship: text(row.emergencyRelationship),
      emergencyPhone: text(row.emergencyPhone),
    };
    const required = [["姓名", person.name], ["性別", person.gender], ["衣服尺寸", person.defaultShirtSize], ["手機", person.phone], ["身分證號碼", person.nationalId], ["出生年月日", person.birthday], ["緊急聯絡人", person.emergencyName], ["關係", person.emergencyRelationship], ["緊急聯絡人手機", person.emergencyPhone]];
    const missing = required.filter(([, value]) => !value).map(([label]) => label);
    if (missing.length) errors.push(`${PERSON_SHEET} 第 ${rowNumber} 列：缺少必填欄位 ${missing.join("、")}。`);
    return person;
  });
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const peopleByName = new Map();
  people.forEach((person) => {
    const key = normalizeEntryPart(person.name);
    if (key) peopleByName.set(key, [...(peopleByName.get(key) || []), person]);
  });

  const seenEntries = new Set();
  const entries = rawEntries.map(({ rowNumber, row }) => {
    const entryId = text(row.id);
    if (entryId && !currentEntries.has(entryId)) errors.push(`${ENTRY_SHEET} 第 ${rowNumber} 列：資料ID無法對應既有資料，新增資料請將資料ID留白。`);
    if (entryId && seenEntries.has(entryId)) errors.push(`${ENTRY_SHEET} 第 ${rowNumber} 列：資料ID重複。`);
    seenEntries.add(entryId);
    let personId = text(row.personId);
    const personName = text(row.personName);
    if (!peopleById.has(personId)) {
      const matches = peopleByName.get(normalizeEntryPart(personName)) || [];
      if (matches.length === 1) personId = matches[0].id;
      else errors.push(`${ENTRY_SHEET} 第 ${rowNumber} 列：找不到唯一對應的團員「${personName || "未填"}」。`);
    }
    const entry = {
      id: entryId || createId("entry"),
      personId,
      raceName: text(row.raceName),
      raceDate: dateText(row.raceDate),
      distance: normalizeDistanceOption(row.distance),
      county: text(row.county),
      location: text(row.location),
      registrationUrl: text(row.registrationUrl),
      registrationOpensAt: dateText(row.registrationOpensAt),
      registrationDeadline: dateText(row.registrationDeadline),
      shirtSize: text(row.shirtSize),
      status: text(row.status) || "待報名",
      isRegistered: parseYesNo(row.isRegistered, "已報名", errors, rowNumber),
      isPaid: parseYesNo(row.isPaid, "已繳費", errors, rowNumber),
      registrationDate: dateText(row.registrationDate),
      paidAmount: numberOrNull(row.paidAmount, "報名費", errors, rowNumber),
      paymentDate: dateText(row.paymentDate),
      paymentMethod: text(row.paymentMethod),
      orderCode: text(row.orderCode),
      transferLastFive: text(row.transferLastFive),
      notes: text(row.notes),
      updatedAt: new Date().toISOString(),
    };
    if (!entry.raceName) errors.push(`${ENTRY_SHEET} 第 ${rowNumber} 列：缺少必填欄位 賽事名稱。`);
    if (entry.distance && !allowedDistanceOptions.has(entry.distance.toLowerCase())) {
      errors.push(`${ENTRY_SHEET} 第 ${rowNumber} 列：距離／組別「${entry.distance}」不在系統下拉清單中，請從選單選取。`);
    }
    return entry;
  });
  const duplicateKeys = new Set();
  entries.forEach((entry, index) => {
    const key = entryKey(entry);
    if (duplicateKeys.has(key)) errors.push(`${ENTRY_SHEET} 第 ${rawEntries[index].rowNumber} 列：同一團員、賽事日期、賽事名稱與組別不可重複。`);
    duplicateKeys.add(key);
  });
  if (errors.length) return { errors };

  const countChanges = (items, existing) => ({
    create: items.filter((item) => !existing.has(item.id)).length,
    update: items.filter((item) => existing.has(item.id)).length,
    delete: [...existing.keys()].filter((id) => !items.some((item) => item.id === id)).length,
  });
  return {
    payload: { version: 1, people, entries },
    summary: {
      people: countChanges(people, currentPeople),
      entries: countChanges(entries, currentEntries),
    },
    errors: [],
  };
}
