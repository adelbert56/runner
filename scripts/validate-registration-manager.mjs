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
const registrationActions = await readFile(resolve(root, "local/registration/registration-actions.js"), "utf8");
const registrationRender = await readFile(resolve(root, "local/registration/registration-render.js"), "utf8");
const registrationData = await readFile(resolve(root, "local/registration/registration-data.js"), "utf8");
const registrationCopy = await readFile(resolve(root, "local/registration/registration-copy.js"), "utf8");
const registrationCss = await readFile(resolve(root, "local/registration/registration.css"), "utf8");
const registrationSystemCss = await readFile(resolve(root, "local/registration/registration-system.css"), "utf8");
const registrationSource = [registrationJs, registrationActions, registrationRender, registrationData, registrationCopy].join("\n");

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
    registrationSource.includes("/site/data/races.json") &&
    registrationSource.includes("/api/registration-data"),
  "local registration manager stays outside the public site path while using local server data"
);
assertCheck(
  registrationHtml.includes('id="export-batch-data"') &&
    registrationHtml.includes('id="import-batch-data"') &&
    registrationHtml.includes('id="batch-import-preview"') &&
    registrationSource.includes("downloadBatchWorkbook") &&
    registrationSource.includes("previewBatchImport") &&
    registrationSource.includes("applyBatchImport") &&
    server.includes("/api/registration-batch.xlsx") &&
    server.includes("/api/registration-batch/preview") &&
    server.includes("registrationBatchPreviews"),
  "registration manager exports editable Excel and requires a validated preview before batch apply"
);
assertCheck(
  registrationHtml.includes('id="race-select"') &&
    registrationHtml.includes('id="use-selected-race"') &&
    registrationSource.includes("selectedRaceFromDropdown") &&
    !registrationSource.includes("data-use-race"),
  "registration manager uses a dropdown race picker instead of a long card list"
);
assertCheck(
    registrationSource.includes("hasOpenRegistrationWindow") &&
    registrationSource.includes("workspaceRaceStatus") &&
    registrationSource.includes('status === "已截止" && !hasOpenRegistrationWindow(race)'),
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
    registrationSource.includes("missingPersonFields"),
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
    registrationSource.includes("personSearchText") &&
    registrationSource.includes("entrySearchText") &&
    registrationSource.includes("entryYear") &&
    registrationSource.includes("historySummary") &&
    registrationSource.includes("entryTimeBucket") &&
    registrationSource.includes("paginateItems") &&
    registrationSource.includes("renderPagination") &&
    registrationSource.includes("renderEntriesList") &&
    registrationSource.includes("setWorkspaceView") &&
    registrationSource.includes("renderOverview"),
  "registration manager includes workspace views, overview summary, people search, entry filters, history tabs, history summary, and pagination"
);
assertCheck(
  registrationHtml.includes('id="entry-person-batch"') &&
    registrationHtml.includes("多人快速建立") &&
    registrationSource.includes("renderEntryPersonBatch") &&
    registrationSource.includes("selectedEntryPersonIds"),
  "registration manager supports batch person selection for new entries"
);
assertCheck(
    registrationSource.includes("maskedPhone") &&
    registrationSource.includes("person-row") &&
    registrationSource.includes("目前賽事") &&
    registrationSource.includes("personBasicDataText") &&
    registrationSource.includes("data-copy-person-details") &&
    registrationSource.includes("data-show-person-details") &&
    registrationSource.includes("data-view-scope=\"history\"") &&
    registrationSource.includes("focusRenderedCard"),
  "registration manager masks list contacts, shows and copies full local basic details on demand, keeps history shortcuts, and returns focus after save"
);
assertCheck(
  registrationHtml.includes('class="panel-subtitle"') &&
    registrationHtml.includes('id="people-add"') &&
    registrationSource.includes("people-select-all-page") &&
    registrationSource.includes("els.peopleAdd") &&
    registrationSource.includes("AVATAR_PALETTE") &&
    registrationSource.includes("page-number") &&
    registrationCss.includes("--people-row-columns: 34px") &&
    registrationCss.includes(".person-row-pending.has-pending") &&
    registrationCss.includes(".pagination-controls"),
  "registration people directory keeps its compact table hierarchy, visual status badges, numeric pagination, and direct new-person entry"
);
assertCheck(
  registrationHtml.includes('id="overview-queue-summary"') &&
    registrationHtml.includes('id="people-filter-menu"') &&
    registrationHtml.includes('id="people-filter-gender"') &&
    registrationHtml.includes('id="people-filter-size"') &&
    registrationHtml.includes('id="people-filter-pending"') &&
    registrationSource.includes("workspaceViewFromHash") &&
    registrationSource.includes("data-people-page-size") &&
    registrationSource.includes('option value="50"') &&
    registrationSource.includes('option value="all"') &&
    registrationSource.includes("data-entries-page-size") &&
    registrationSource.includes("entriesPageSize") &&
    registrationSource.includes("PAGE_SIZE_PREFS_STORAGE_KEY") &&
    registrationSource.includes("savePageSizePreferences") &&
    registrationSource.includes("restorePageSizePreferences") &&
    registrationSource.includes("selectAll.indeterminate") &&
    registrationCss.includes(".overview-queue-icon") &&
    registrationCss.includes(".people-filter-popover"),
  "registration pending queue and team directory retain their B2B UI controls, direct workspace hashes, and selection state"
);
assertCheck(
    registrationHtml.includes('id="export-selected-race-payments"') &&
    registrationSource.includes("downloadSelectedRacePaymentCsv") &&
    registrationSource.includes("paymentExportRows") &&
    registrationSource.includes("繳費狀態") &&
    registrationSource.includes("手機末三碼") &&
    registrationSource.includes("phoneLastThree") &&
    registrationSource.includes("text/csv;charset=utf-8") &&
    registrationSource.includes("\\uFEFF"),
  "registration manager exports selected-race payment confirmation CSV"
);
assertCheck(
  registrationHtml.includes('id="export-selected-race-payment-html"') &&
    registrationSource.includes("downloadSelectedRacePaymentHtml") &&
    registrationSource.includes("buildPaymentReminderHtml") &&
    registrationSource.includes("Registration Payment Check") &&
    registrationSource.includes("報名繳費確認表") &&
    registrationSource.includes("text/html;charset=utf-8") &&
    registrationSource.includes("繳費確認截圖") &&
    !registrationSource.includes("催款"),
  "registration manager exports selected-race payment confirmation screenshot HTML"
);
assertCheck(
  registrationSource.includes("participant-summary-card") &&
    registrationSource.includes("preview-status-filter") &&
    registrationSource.includes("paymentAmountPresentation") &&
    registrationSource.includes("正在讀取報名與賽事資料") &&
    registrationSource.includes("資料讀取失敗：") &&
    registrationSource.includes("@media (max-width: 767px)") &&
    registrationSource.includes("safe-area-inset-bottom"),
  "notification preview keeps responsive participant, status, and amount presentation"
);
assertCheck(
  registrationSource.includes("SELECTED_RACE_STORAGE_KEY") &&
    registrationSource.includes("savedSelectedRaceId") &&
    registrationSource.includes("saveSelectedRaceId") &&
    registrationSource.includes("localStorage") &&
    registrationSource.includes("els.raceSelect.value || savedSelectedRaceId()"),
  "registration manager restores the selected race after page refresh"
);
assertCheck(
  registrationHtml.includes('id="overview-work-queue"') &&
    registrationHtml.includes("data-open-pending") &&
    registrationHtml.includes("data-open-unpaid") &&
    !registrationHtml.includes("sidebar-group-preview") &&
    registrationSource.includes("openEntriesForWork") &&
    registrationSource.includes("openNotifyForEntry") &&
    registrationSource.includes("openUnpaidNotifications"),
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
assertCheck(
  registrationHtml.includes('id="person-profile-progress"') &&
    registrationHtml.includes('id="person-required-details"') &&
    registrationHtml.includes('id="entry-workflow"') &&
    registrationSource.includes("updatePersonProfileProgress") &&
    registrationSource.includes("revealPersonRequiredFields") &&
    registrationSource.includes("updateEntryWorkflow") &&
    registrationSource.includes("draft.isPaid && !draft.isRegistered") &&
    registrationSource.includes("els.bulkStatusPaid.checked && !els.bulkStatusRegistered.checked"),
  "registration workflow guides required profile fields and rejects contradictory payment states"
);
assertCheck(
  registrationHtml.includes('id="entries-bulk-mark-registered"') &&
    registrationHtml.includes('id="entries-bulk-mark-paid"') &&
    registrationJs.includes("entriesBulkMarkRegistered") &&
    registrationActions.includes("markSelectedEntriesProgress") &&
    registrationActions.includes("isRegistered: true") &&
    registrationActions.includes("isPaid: true"),
  "registration manager provides safe one-click bulk registration and payment progress actions"
);
assertCheck(
  registrationHtml.includes('registration-system.css') &&
    registrationHtml.includes('role="tablist"') &&
    registrationHtml.includes('role="tab"') &&
    registrationHtml.includes('role="tabpanel"') &&
    registrationSource.includes("aria-selected") &&
    registrationSource.includes("ArrowRight") &&
    registrationSystemCss.includes("Registration workspace system") &&
    registrationSystemCss.includes("--rm-primary"),
  "registration workspace keeps the shared UI system and keyboard-accessible tab semantics"
);

const failed = checks.filter((check) => !check.ok);
checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

if (failed.length) {
  process.exitCode = 1;
}
