import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { entryDuplicateKey, findDuplicateEntry, paymentAmountPresentation } from "../local/registration/registration-core.js";
import { createRegistrationBatchWorkbook, prepareRegistrationBatchImport } from "../local/registration/registration-batch-xlsx.js";

const root = resolve(import.meta.dirname, "..");
const checks = [];

function assertCheck(condition, message) {
  checks.push({ ok: Boolean(condition), message });
}

const baseEntry = {
  id: "entry_1",
  personId: "person_a",
  raceDate: "2026-09-20",
  raceName: "仁愛長庚合作聯盟醫院2026永慶盃路跑",
  distance: "10K",
};
const sameEntryDifferentSpacing = {
  id: "entry_2",
  personId: "person_a",
  raceDate: "2026-09-20",
  raceName: " 仁愛長庚合作聯盟醫院2026永慶盃路跑 ",
  distance: " 10k ",
};
const differentDistance = {
  ...sameEntryDifferentSpacing,
  id: "entry_3",
  distance: "3K",
};
const sameIdEdit = {
  ...sameEntryDifferentSpacing,
  id: "entry_1",
};
const registrationBatchFixture = {
  people: [{
    id: "person_batch_fixture",
    name: "批次測試人員",
    gender: "女",
    defaultShirtSize: "M",
    phone: "0912345678",
    nationalId: "A123456789",
    birthday: "1990-01-02",
    emergencyName: "測試聯絡人",
    emergencyRelationship: "家人",
    emergencyPhone: "0987654321",
  }],
  entries: [{
    id: "entry_batch_fixture",
    personId: "person_batch_fixture",
    raceName: "批次測試路跑",
    raceDate: "2026-10-10",
    distance: "10K",
    status: "待報名",
    isRegistered: false,
    isPaid: false,
  }],
};

const server = await readFile(resolve(root, "site/server.mjs"), "utf8");
const gitignore = await readFile(resolve(root, ".gitignore"), "utf8");
const indexHtml = await readFile(resolve(root, "site/index.html"), "utf8");
const appJs = await readFile(resolve(root, "site/app.js"), "utf8");
const readme = await readFile(resolve(root, "README.md"), "utf8");
const registrationHtml = await readFile(resolve(root, "local/registration/registration.html"), "utf8");
const registrationJs = await readFile(resolve(root, "local/registration/registration.js"), "utf8");
const registrationCss = await readFile(resolve(root, "local/registration/registration.css"), "utf8");

assertCheck(
  entryDuplicateKey(baseEntry) === entryDuplicateKey(sameEntryDifferentSpacing),
  "registration duplicate key ignores case and surrounding spaces"
);
assertCheck(
  entryDuplicateKey(baseEntry) !== entryDuplicateKey(differentDistance),
  "registration duplicate key allows the same person to run a different distance"
);
assertCheck(
  findDuplicateEntry([baseEntry], sameEntryDifferentSpacing)?.id === "entry_1",
  "registration manager blocks same person, race date, race name, and distance duplicates"
);
assertCheck(
  findDuplicateEntry([baseEntry], sameIdEdit) === null,
  "registration manager allows editing the same entry"
);
assertCheck(
  paymentAmountPresentation(null).label === "金額未填" &&
    paymentAmountPresentation(0).hint === "金額為 0" &&
    paymentAmountPresentation(120000).label === "NT$ 120,000",
  "payment preview distinguishes missing, zero, and large amounts"
);
const registrationBatchDistanceOptions = ["3km", "5km", "10km", "21km"];
const registrationBatchWorkbook = await createRegistrationBatchWorkbook(registrationBatchFixture, { distanceOptions: registrationBatchDistanceOptions });
const registrationBatchPreview = await prepareRegistrationBatchImport(Buffer.from(registrationBatchWorkbook), registrationBatchFixture, { distanceOptions: registrationBatchDistanceOptions });
assertCheck(
  registrationBatchPreview.errors.length === 0 &&
    registrationBatchPreview.summary.people.update === 1 &&
    registrationBatchPreview.summary.entries.update === 1,
  "registration batch Excel round-trips existing people and entries through preview validation"
);
const registrationBatchWorkbookModel = new ExcelJS.Workbook();
await registrationBatchWorkbookModel.xlsx.load(Buffer.from(registrationBatchWorkbook));
const registrationBatchEntriesSheet = registrationBatchWorkbookModel.getWorksheet("報名紀錄");
assertCheck(
  ["F5", "L5", "M5", "N5", "O5", "S5"].every((address) => registrationBatchEntriesSheet.getCell(address).dataValidation?.formulae?.length) &&
    registrationBatchEntriesSheet.getCell("F5").dataValidation.formulae[0].includes("下拉選單"),
  "registration batch Excel provides dropdowns for distance, shirt size, status, registration, payment, and payment method"
);
assertCheck(
  /allowedLocalHosts/.test(server) && /Registration data is only available/.test(server),
  "registration API is restricted to local host requests"
);
assertCheck(
  /registrationPayloadLimit/.test(server) && /Payload too large/.test(server),
  "registration API rejects oversized payloads"
);
assertCheck(
  gitignore.includes("runner/報名管理/報名管理資料.json"),
  "private registration data file is ignored by git"
);
assertCheck(
  !indexHtml.includes("registration.html"),
  "public site HTML does not hard-link to the local-only registration manager"
);
assertCheck(
  appJs.includes("LOCAL_REGISTRATION_HREF") &&
    appJs.includes("isLocalHost") &&
    appJs.includes("data-local-only"),
  "public app only injects the registration manager entry on local hosts"
);
assertCheck(
  readme.includes("http://localhost:4173/local/registration/registration.html"),
  "README points registration manager users to the local-only URL"
);
assertCheck(
  registrationHtml.includes("/site/styles.css") &&
    registrationJs.includes("/site/data/races.json") &&
    registrationJs.includes("/api/registration-data"),
  "local registration manager stays outside the public site path while using local server data"
);
assertCheck(
  registrationHtml.includes('id="export-batch-data"') &&
    registrationHtml.includes('id="import-batch-data"') &&
    registrationHtml.includes('id="batch-import-preview"') &&
    registrationJs.includes("downloadBatchWorkbook") &&
    registrationJs.includes("previewBatchImport") &&
    registrationJs.includes("applyBatchImport") &&
    server.includes("/api/registration-batch.xlsx") &&
    server.includes("/api/registration-batch/preview") &&
    server.includes("registrationBatchPreviews"),
  "registration manager exports editable Excel and requires a validated preview before batch apply"
);
assertCheck(
  registrationHtml.includes('id="race-select"') &&
    registrationHtml.includes('id="use-selected-race"') &&
    registrationJs.includes("selectedRaceFromDropdown") &&
    !registrationJs.includes("data-use-race"),
  "registration manager uses a dropdown race picker instead of a long card list"
);
assertCheck(
  registrationJs.includes("hasOpenRegistrationWindow") &&
    registrationJs.includes("workspaceRaceStatus") &&
    registrationJs.includes('status === "已截止" && !hasOpenRegistrationWindow(race)'),
  "registration manager keeps a future-deadline race selectable when its source status is stale"
);
assertCheck(
  [
    "person-name",
    "person-gender",
    "person-shirt-size",
    "person-phone",
    "person-national-id",
    "person-birthday",
    "person-emergency-name",
    "person-emergency-relationship",
    "person-emergency-phone",
  ].every((id) => registrationHtml.includes(`id="${id}"`)) &&
    registrationJs.includes("missingPersonFields"),
  "registration person profile includes required identity and emergency-contact fields"
);
assertCheck(
  registrationHtml.includes('id="people-search"') &&
    registrationHtml.includes('id="people-pagination"') &&
    registrationHtml.includes('id="workspace-view-tabs"') &&
    registrationHtml.includes('id="workspace-overview"') &&
    registrationHtml.includes('id="workspace-people"') &&
    registrationHtml.includes('id="workspace-entries"') &&
    registrationHtml.includes('id="overview-selected-race"') &&
    registrationHtml.includes('id="entries-scope-tabs"') &&
    registrationHtml.includes('id="entries-history-summary"') &&
    registrationHtml.includes('id="entries-pagination"') &&
    registrationHtml.includes('id="entries-search"') &&
    registrationHtml.includes('id="entries-filter-year"') &&
    registrationHtml.includes('id="entries-filter-person"') &&
    registrationHtml.includes('id="entries-filter-progress"') &&
    registrationHtml.includes('id="entries-filter-status"') &&
    registrationJs.includes("personSearchText") &&
    registrationJs.includes("entrySearchText") &&
    registrationJs.includes("entryYear") &&
    registrationJs.includes("historySummary") &&
    registrationJs.includes("entryTimeBucket") &&
    registrationJs.includes("paginateItems") &&
    registrationJs.includes("renderPagination") &&
    registrationJs.includes("renderEntriesList") &&
    registrationJs.includes("setWorkspaceView") &&
    registrationJs.includes("renderOverview"),
  "registration manager includes workspace views, overview summary, people search, entry filters, history tabs, history summary, and pagination"
);
assertCheck(
  registrationHtml.includes('id="entry-person-batch"') &&
    registrationHtml.includes("多人快速建立") &&
    registrationJs.includes("renderEntryPersonBatch") &&
    registrationJs.includes("selectedEntryPersonIds"),
  "registration manager supports batch person selection for new entries"
);
assertCheck(
  registrationJs.includes("maskedPhone") &&
    registrationJs.includes("person-row") &&
    registrationJs.includes("目前賽事") &&
    registrationJs.includes("personBasicDataText") &&
    registrationJs.includes("data-copy-person-details") &&
    registrationJs.includes("data-show-person-details") &&
    registrationJs.includes("data-view-scope=\"history\"") &&
    registrationJs.includes("focusRenderedCard"),
  "registration manager masks list contacts, shows and copies full local basic details on demand, keeps history shortcuts, and returns focus after save"
);
assertCheck(
    registrationHtml.includes('id="export-selected-race-payments"') &&
    registrationJs.includes("downloadSelectedRacePaymentCsv") &&
    registrationJs.includes("paymentExportRows") &&
    registrationJs.includes("繳費狀態") &&
    registrationJs.includes("手機末三碼") &&
    registrationJs.includes("phoneLastThree") &&
    registrationJs.includes("text/csv;charset=utf-8") &&
    registrationJs.includes("\\uFEFF"),
  "registration manager exports selected-race payment confirmation CSV"
);
assertCheck(
  registrationHtml.includes('id="export-selected-race-payment-html"') &&
    registrationJs.includes("downloadSelectedRacePaymentHtml") &&
    registrationJs.includes("buildPaymentReminderHtml") &&
    registrationJs.includes("Registration Payment Check") &&
    registrationJs.includes("報名繳費確認表") &&
    registrationJs.includes("text/html;charset=utf-8") &&
    registrationJs.includes("繳費確認截圖") &&
    !registrationJs.includes("催款"),
  "registration manager exports selected-race payment confirmation screenshot HTML"
);
assertCheck(
  registrationJs.includes("participant-summary-card") &&
    registrationJs.includes("preview-status-filter") &&
    registrationJs.includes("paymentAmountPresentation") &&
    registrationJs.includes("正在讀取報名與賽事資料") &&
    registrationJs.includes("資料讀取失敗：") &&
    registrationJs.includes("@media (max-width: 767px)") &&
    registrationJs.includes("safe-area-inset-bottom"),
  "notification preview keeps responsive participant, status, and amount presentation"
);
assertCheck(
  registrationJs.includes("SELECTED_RACE_STORAGE_KEY") &&
    registrationJs.includes("savedSelectedRaceId") &&
    registrationJs.includes("saveSelectedRaceId") &&
    registrationJs.includes("localStorage") &&
    registrationJs.includes("els.raceSelect.value || savedSelectedRaceId()"),
  "registration manager restores the selected race after page refresh"
);
assertCheck(
  registrationHtml.includes('id="overview-work-queue"') &&
    registrationHtml.includes("data-open-pending") &&
    registrationHtml.includes("data-open-unpaid") &&
    !registrationHtml.includes("sidebar-group-preview") &&
    registrationJs.includes("openEntriesForWork") &&
    registrationJs.includes("openNotifyForEntry") &&
    registrationJs.includes("openUnpaidNotifications"),
  "registration workbench routes pending tasks into entries and notifications without duplicate race context"
);
assertCheck(
  registrationHtml.includes("workspace-form-details") &&
    registrationHtml.includes("entry-advanced-fields") &&
    registrationHtml.includes("notify-race-picker") &&
    registrationHtml.includes("notify-people-picker") &&
    registrationCss.includes("grid-template-areas") &&
    registrationCss.includes(".notify-race-picker"),
  "registration workspace layers optional form fields and keeps notification filters integrated horizontally"
);

const failed = checks.filter((check) => !check.ok);
checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

if (failed.length) {
  process.exitCode = 1;
}
