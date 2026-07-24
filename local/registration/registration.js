import { findDuplicateEntry, paymentAmountPresentation } from "./registration-core.js";

const DATA_VERSION = "20260714-registration-workspace2";
const SELECTED_RACE_STORAGE_KEY = "runner.registration.selectedRaceId";
const WORKSPACE_VIEW_STORAGE_KEY = "runner.registration.workspaceView";
const NOTIFY_PREFS_STORAGE_KEY = "runner.registration.notifyPrefs";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "runner.registration.sidebarCollapsed";
const WORKSPACE_VIEW_HASHES = { "#pending-queue": "overview", "#team-members": "people", "#entries": "entries", "#notifications": "notify" };
const VIEW_WORKSPACE_HASHES = { overview: "#pending-queue", people: "#team-members", entries: "#entries", notify: "#notifications" };
let notifyStatusClearTimer = null;
const PEOPLE_PAGE_SIZE = 6;
const ENTRY_GROUP_PAGE_SIZE = 4;

const state = {
  races: [],
  filteredRaces: [],
  people: [],
  entries: [],
  lastKnownUpdatedAt: null,
  entryBatchPersonIds: new Set(),
  peopleQuery: "",
  peopleSort: "",
  peoplePage: 1,
  peoplePageSize: PEOPLE_PAGE_SIZE,
  peopleFilters: { gender: "all", size: "all", pending: "all" },
  selectedPersonIds: new Set(),
  selectedEntryIds: new Set(),
  entryQuery: "",
  entryScope: "active",
  entryHistoryYear: "all",
  entriesPage: 1,
  entryFilterPersonId: "",
  entryFilterProgress: "all",
  entryFilterStatus: "",
  focusPersonId: "",
  personDetailsId: "",
  entryPersonDetailsEntryId: "",
  focusEntryId: "",
  workspaceView: "overview",
  sidebarCollapsed: false,
  overviewShowAllActive: false,
  overviewShowAllPeople: false,
  notifyScope: "active",
  notifyQuery: "",
  notifyProgress: "all",
  notifySelectedRaceKeys: new Set(),
  notifySelectedPersonIds: new Set(),
  notifyDensity: "compact",
  notifyCollapsedGroups: new Set(),
  notifyWorkspacePrimed: false,
  batchImport: null,
  loadState: "idle",
  loadError: "",
};

const els = {
  raceSearch: document.querySelector("#race-search"),
  raceSelect: document.querySelector("#race-select"),
  raceSelectHints: document.querySelector("#race-select-hints"),
  useSelectedRace: document.querySelector("#use-selected-race"),
  exportSelectedRacePayments: document.querySelector("#export-selected-race-payments"),
  exportSelectedRacePaymentHtml: document.querySelector("#export-selected-race-payment-html"),
  racePicker: document.querySelector("#race-picker"),
  sidebarCollapseToggle: document.querySelector("#sidebar-collapse-toggle"),
  peopleList: document.querySelector("#people-list"),
  peoplePagination: document.querySelector("#people-pagination"),
  peopleBulkToolbar: document.querySelector("#people-bulk-toolbar"),
  peopleBulkCopy: document.querySelector("#people-bulk-copy"),
  peopleBulkDelete: document.querySelector("#people-bulk-delete"),
  peopleBulkClear: document.querySelector("#people-bulk-clear"),
  peopleAdd: document.querySelector("#people-add"),
  backToTop: document.querySelector("#back-to-top"),
  entriesList: document.querySelector("#entries-list"),
  entriesPagination: document.querySelector("#entries-pagination"),
  entriesBulkToolbar: document.querySelector("#entries-bulk-toolbar"),
  entriesBulkDelete: document.querySelector("#entries-bulk-delete"),
  entriesBulkClear: document.querySelector("#entries-bulk-clear"),
  peopleSearch: document.querySelector("#people-search"),
  peopleFilterGender: document.querySelector("#people-filter-gender"),
  peopleFilterSize: document.querySelector("#people-filter-size"),
  peopleFilterPending: document.querySelector("#people-filter-pending"),
  peopleFilterReset: document.querySelector("#people-filter-reset"),
  entriesScopeTabs: document.querySelector("#entries-scope-tabs"),
  entriesHistorySummary: document.querySelector("#entries-history-summary"),
  entriesSearch: document.querySelector("#entries-search"),
  entriesFilterYear: document.querySelector("#entries-filter-year"),
  entriesFilterPerson: document.querySelector("#entries-filter-person"),
  entriesFilterProgress: document.querySelector("#entries-filter-progress"),
  entriesFilterStatus: document.querySelector("#entries-filter-status"),
  entriesFilterReset: document.querySelector("#entries-filter-reset"),
  notifyScope: document.querySelector("#notify-scope"),
  notifySearch: document.querySelector("#notify-search"),
  notifyProgress: document.querySelector("#notify-progress"),
  notifyRaceList: document.querySelector("#notify-race-list"),
  notifyPeopleList: document.querySelector("#notify-people-list"),
  notifyRacesAll: document.querySelector("#notify-races-all"),
  notifyRacesClear: document.querySelector("#notify-races-clear"),
  notifyPeopleAll: document.querySelector("#notify-people-all"),
  notifyPeopleClear: document.querySelector("#notify-people-clear"),
  notifyOpenPreview: document.querySelector("#notify-open-preview"),
  notifyCopyBatch: document.querySelector("#notify-copy-batch"),
  notifyReset: document.querySelector("#notify-reset"),
  notifyDensityComfortable: document.querySelector("#notify-density-comfortable"),
  notifyDensityCompact: document.querySelector("#notify-density-compact"),
  notifyExpandAll: document.querySelector("#notify-expand-all"),
  notifyCollapseAll: document.querySelector("#notify-collapse-all"),
  notifyStatusMessage: document.querySelector("#notify-status-message"),
  notifySummaryPeople: document.querySelector("#notify-summary-people"),
  notifySummaryRaces: document.querySelector("#notify-summary-races"),
  notifySummaryPending: document.querySelector("#notify-summary-pending"),
  notifySummaryUnpaid: document.querySelector("#notify-summary-unpaid"),
  notifyResults: document.querySelector("#notify-results"),
  workspaceViewTabs: document.querySelector("#workspace-view-tabs"),
  workspaceViews: [...document.querySelectorAll("[data-workspace-panel]")],
  overviewWorkQueue: document.querySelector("#overview-work-queue"),
  overviewQueueSummary: document.querySelector("#overview-queue-summary"),
  overviewSelectedRace: document.querySelector("#overview-selected-race"),
  overviewActiveGroups: document.querySelector("#overview-active-groups"),
  overviewToggleActiveGroups: document.querySelector("#overview-toggle-active-groups"),
  exportData: document.querySelector("#export-data"),
  importData: document.querySelector("#import-data"),
  exportBatchData: document.querySelector("#export-batch-data"),
  importBatchData: document.querySelector("#import-batch-data"),
  batchImportPreview: document.querySelector("#batch-import-preview"),
  entryStatusMessage: document.querySelector("#entry-status-message"),
  summaryRaces: document.querySelector("#summary-races"),
  summaryPeople: document.querySelector("#summary-people"),
  summaryPending: document.querySelector("#summary-pending"),
  summaryUnpaid: document.querySelector("#summary-unpaid"),
  personForm: document.querySelector("#person-form"),
  personId: document.querySelector("#person-id"),
  personName: document.querySelector("#person-name"),
  personGender: document.querySelector("#person-gender"),
  personPhone: document.querySelector("#person-phone"),
  personPhoneError: document.querySelector("#person-phone-error"),
  personBirthday: document.querySelector("#person-birthday"),
  personNationalId: document.querySelector("#person-national-id"),
  personNationalIdError: document.querySelector("#person-national-id-error"),
  lastSavedIndicator: document.querySelector("#last-saved-indicator"),
  personShirtSize: document.querySelector("#person-shirt-size"),
  personEmergencyName: document.querySelector("#person-emergency-name"),
  personEmergencyRelationship: document.querySelector("#person-emergency-relationship"),
  personEmergencyPhone: document.querySelector("#person-emergency-phone"),
  personReset: document.querySelector("#person-reset"),
  entryForm: document.querySelector("#entry-form"),
  entryId: document.querySelector("#entry-id"),
  entryRaceName: document.querySelector("#entry-race-name"),
  entryPersonId: document.querySelector("#entry-person-id"),
  entryPersonBatch: document.querySelector("#entry-person-batch"),
  entryRaceDate: document.querySelector("#entry-race-date"),
  entryDistance: document.querySelector("#entry-distance"),
  entryCounty: document.querySelector("#entry-county"),
  entryLocation: document.querySelector("#entry-location"),
  entryRegistrationUrl: document.querySelector("#entry-registration-url"),
  entryRegistrationOpensAt: document.querySelector("#entry-registration-opens-at"),
  entryRegistrationDeadline: document.querySelector("#entry-registration-deadline"),
  entryShirtSize: document.querySelector("#entry-shirt-size"),
  entryStatus: document.querySelector("#entry-status"),
  entryIsRegistered: document.querySelector("#entry-is-registered"),
  entryIsPaid: document.querySelector("#entry-is-paid"),
  entryRegistrationDate: document.querySelector("#entry-registration-date"),
  entryPaidAmount: document.querySelector("#entry-paid-amount"),
  entryPaymentDate: document.querySelector("#entry-payment-date"),
  entryPaymentMethod: document.querySelector("#entry-payment-method"),
  entryOrderCode: document.querySelector("#entry-order-code"),
  entryTransferLastFive: document.querySelector("#entry-transfer-last-five"),
  entryNotes: document.querySelector("#entry-notes"),
  entryReset: document.querySelector("#entry-reset"),
};

function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function showToast(message, kind = "success") {
  if (!message) {
    return;
  }
  let host = document.querySelector("#toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = `toast-item ${kind}`;
  toast.textContent = message;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

const PHONE_PATTERN = /^09\d{8}$/;
const NATIONAL_ID_PATTERN = /^[A-Za-z][12]\d{8}$/;

function validatePhoneField() {
  const value = els.personPhone.value.trim();
  const ok = !value || PHONE_PATTERN.test(value);
  if (els.personPhoneError) {
    els.personPhoneError.textContent = ok ? "" : "格式須為 09 開頭共 10 碼數字";
  }
  return ok;
}

function validateNationalIdField() {
  const value = els.personNationalId.value.trim();
  const ok = !value || NATIONAL_ID_PATTERN.test(value);
  if (els.personNationalIdError) {
    els.personNationalIdError.textContent = ok ? "" : "格式須為 1 位英文字母加 9 碼數字";
  }
  return ok;
}

function formatSavedTime(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function updateLastSavedIndicator() {
  if (!els.lastSavedIndicator) {
    return;
  }
  const time = formatSavedTime(state.lastKnownUpdatedAt);
  els.lastSavedIndicator.textContent = time ? `已同步・${time}` : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function todayString() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function normalizeMatchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDistanceValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/(\d)\.\s+(\d)/g, "$1.$2")
    .trim();
}

function normalizeEntryStatusValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "待報名";
  }
  const mapping = {
    "報名中": "可報名",
    "可報名": "可報名",
    "未開始": "尚未開報",
    "尚未開報": "尚未開報",
    "待確認": "待確認",
    "已報名未繳費": "已報名未繳費",
    "已完成": "已完成",
    "已截止": "已截止",
    "停辦": "停辦",
    "停賽": "停賽",
    "取消": "取消",
    "待報名": "待報名",
  };
  return mapping[raw] || "待報名";
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return amount === 0 ? "新台幣 0 元" : `NT$ ${amount.toLocaleString("zh-TW")}`;
}

function savedSelectedRaceId() {
  try {
    return localStorage.getItem(SELECTED_RACE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveSelectedRaceId(value) {
  try {
    localStorage.setItem(SELECTED_RACE_STORAGE_KEY, String(value || ""));
  } catch {
    // The picker still works if browser storage is unavailable.
  }
}

function saveWorkspaceView(value) {
  try {
    localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, String(value || "overview"));
  } catch {
    // Workspace switching still works without storage.
  }
}

function savedWorkspaceView() {
  try {
    return localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY) || "overview";
  } catch {
    return "overview";
  }
}

function savedSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = Boolean(collapsed);
  document.body.classList.toggle("registration-sidebar-collapsed", state.sidebarCollapsed);
  els.sidebarCollapseToggle?.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  els.sidebarCollapseToggle?.setAttribute("title", state.sidebarCollapsed ? "展開賽事側欄" : "收合賽事側欄");
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(state.sidebarCollapsed));
  } catch {
    // Sidebar preference is non-essential and must not affect registration data.
  }
}

function saveNotifyPreferences() {
  try {
    localStorage.setItem(NOTIFY_PREFS_STORAGE_KEY, JSON.stringify({
      scope: state.notifyScope,
      query: state.notifyQuery,
      progress: state.notifyProgress,
      density: state.notifyDensity,
      selectedRaceKeys: [...state.notifySelectedRaceKeys],
      selectedPersonIds: [...state.notifySelectedPersonIds],
      collapsedGroups: [...state.notifyCollapsedGroups],
      workspacePrimed: state.notifyWorkspacePrimed,
    }));
  } catch {
    // Notify filters still work without storage.
  }
}

function restoreNotifyPreferences() {
  try {
    const raw = localStorage.getItem(NOTIFY_PREFS_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    state.notifyScope = ["active", "all", "history"].includes(parsed.scope) ? parsed.scope : "active";
    state.notifyQuery = String(parsed.query || "").trim().toLowerCase();
    state.notifyProgress = typeof parsed.progress === "string" ? parsed.progress : "all";
    state.notifyDensity = parsed.density === "comfortable" ? "comfortable" : "compact";
    state.notifySelectedRaceKeys = new Set(normalizeArray(parsed.selectedRaceKeys).map((value) => String(value || "")));
    state.notifySelectedPersonIds = new Set(normalizeArray(parsed.selectedPersonIds).map((value) => String(value || "")));
    state.notifyCollapsedGroups = new Set(normalizeArray(parsed.collapsedGroups).map((value) => String(value || "")));
    state.notifyWorkspacePrimed = Boolean(parsed.workspacePrimed);
  } catch {
    // Ignore malformed saved prefs.
  }
}

function dedupeRaceDistances(race) {
  const distances = normalizeArray(race.distances).reduce((items, distance) => {
    const normalized = normalizeDistanceValue(distance);
    if (normalized && !items.includes(normalized)) {
      items.push(normalized);
    }
    return items;
  }, []);
  return distances.join(" / ");
}

function raceId(race) {
  return race.race_id || race.id || race.race_name || race.name || "";
}

function raceName(race) {
  return race.race_name || race.name || "未命名賽事";
}

function compactRaceName(race) {
  return raceName(race)
    .replace(/20\d{2}\s*(?:年)?/g, "")
    .replace(/第[一二三四五六七八九十\d]+屆/g, "")
    .replace(/[〈〉《》「」]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14) || "未命名賽事";
}

function raceDateTag(race) {
  const date = String(race.race_date || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5).replace("-", "/") : "日期待補";
}

function compactRaceOptionLabel(race) {
  return [
    raceDateTag(race),
    compactRaceName(race),
    dedupeRaceDistances(race) || "距離待補",
  ].join("｜");
}

function raceCounty(race) {
  return race.race_county || race.county || "";
}

function raceLocation(race) {
  return race.venue || race.start_location || race.location || "";
}

function formatRaceLocation(race) {
  return [raceCounty(race), raceLocation(race)].filter(Boolean).join(" · ");
}

function raceDateValue(race) {
  return String(race?.race_date || "").slice(0, 10);
}

function isClosedRaceStatus(value) {
  return ["已截止", "停辦", "停賽", "取消"].includes(normalizeEntryStatusValue(value));
}

function hasOpenRegistrationWindow(race) {
  const deadline = String(race?.registration_deadline || "").slice(0, 10);
  return Boolean(deadline && deadline >= todayString());
}

function workspaceRaceStatus(race) {
  if (normalizeEntryStatusValue(race?.registration_status) === "已截止" && hasOpenRegistrationWindow(race)) {
    return "報名中";
  }
  return race?.registration_status || "狀態待補";
}

function isSelectableRace(race) {
  const raceDate = raceDateValue(race);
  const status = normalizeEntryStatusValue(race?.registration_status);
  if (["停辦", "停賽", "取消"].includes(status)) {
    return false;
  }
  if (status === "已截止" && !hasOpenRegistrationWindow(race)) {
    return false;
  }
  return !raceDate || raceDate >= todayString();
}

function personLabel(person) {
  const shirt = person.defaultShirtSize ? ` · ${person.defaultShirtSize}` : "";
  return `${person.name}${shirt}`;
}

function maskedPhone(value, visibleDigits = 3) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  const visible = digits.slice(-Math.max(0, visibleDigits));
  const masked = "*".repeat(Math.max(0, digits.length - visible.length));
  return `${masked}${visible}`;
}

function selectedPerson() {
  const personId = els.entryPersonId.value;
  return state.people.find((person) => person.id === personId) || null;
}

function currentPayload() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    baseUpdatedAt: state.lastKnownUpdatedAt,
    people: state.people,
    entries: state.entries,
  };
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isCompactViewport() {
  return globalThis.matchMedia?.("(max-width: 760px)")?.matches ?? false;
}

function overviewStatusTag(label, tone = "neutral") {
  return `<span class="status-tag status-tag-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function pendingTone(count) {
  if (count >= 2) {
    return "danger";
  }
  return count ? "pending" : "complete";
}

function entryTimeBucket(entry) {
  const raceDate = String(entry.raceDate || "").slice(0, 10);
  if (raceDate && raceDate < todayString()) {
    return "history";
  }
  return "active";
}

function paginateItems(items, page, pageSize) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = clampNumber(Number(page) || 1, 1, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    total,
    totalPages,
    start: total ? start + 1 : 0,
    end: Math.min(start + pageSize, total),
  };
}

function paginationPageNumbers(page, totalPages) {
  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  return [...pages]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b)
    .reduce((list, n) => {
      const prev = list[list.length - 1];
      if (prev !== undefined && n - prev > 1) {
        list.push("…");
      }
      list.push(n);
      return list;
    }, []);
}

function renderPagination(target, kind, pagination) {
  if (!target) {
    return;
  }
  if (pagination.total <= 0) {
    target.innerHTML = "";
    return;
  }
  const numberButtons = paginationPageNumbers(pagination.page, pagination.totalPages)
    .map((n) => (n === "…"
      ? `<span class="page-ellipsis">…</span>`
      : `<button type="button" class="page-number${n === pagination.page ? " is-current" : ""}" data-page-kind="${escapeHtml(kind)}" data-page-set="${n}"${n === pagination.page ? ' aria-current="page"' : ""}>${n}</button>`))
    .join("");
  const pageSizeControl = kind === "people"
    ? `<label class="pagination-page-size">每頁顯示<select data-people-page-size aria-label="每頁顯示筆數"><option value="6"${state.peoplePageSize === 6 ? " selected" : ""}>6 筆</option><option value="12"${state.peoplePageSize === 12 ? " selected" : ""}>12 筆</option><option value="24"${state.peoplePageSize === 24 ? " selected" : ""}>24 筆</option></select></label>`
    : "";
  target.innerHTML = `
    <span class="pagination-status">顯示 ${escapeHtml(pagination.start)}–${escapeHtml(pagination.end)}，共 ${escapeHtml(pagination.total)} 筆</span>
    <span class="pagination-controls">${pageSizeControl}
      <button type="button" class="page-button page-button-icon" data-page-kind="${escapeHtml(kind)}" data-page-set="1" aria-label="第一頁" ${pagination.page <= 1 ? "disabled" : ""}>«</button>
      <button type="button" class="page-button page-button-icon" data-page-kind="${escapeHtml(kind)}" data-page-direction="-1" aria-label="上一頁" ${pagination.page <= 1 ? "disabled" : ""}>‹</button>
      ${numberButtons}
      <button type="button" class="page-button page-button-icon" data-page-kind="${escapeHtml(kind)}" data-page-direction="1" aria-label="下一頁" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>›</button>
      <button type="button" class="page-button page-button-icon" data-page-kind="${escapeHtml(kind)}" data-page-set="${escapeHtml(pagination.totalPages)}" aria-label="最後一頁" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>»</button>
    </span>
  `;
}

function personSearchText(person) {
  return [
    person.name,
    person.phone,
    maskedPhone(person.phone),
    String(person.nationalId || "").slice(-4),
    person.defaultShirtSize,
  ].join(" ").toLowerCase();
}

function entrySearchText(entry) {
  return [
    entry.raceName,
    entry.personName,
    entry.distance,
    entry.county,
    entry.location,
    entry.status,
  ].join(" ").toLowerCase();
}

function entryYear(entry) {
  return String(entry.raceDate || "").slice(0, 4) || "未定年";
}

function personStats(personId) {
  const entries = state.entries.filter((entry) => entry.personId === personId);
  const activeEntries = entries.filter((entry) => entryTimeBucket(entry) === "active");
  const historyEntries = entries.filter((entry) => entryTimeBucket(entry) === "history");
  return {
    active: activeEntries.length,
    history: historyEntries.length,
    pending: activeEntries.filter((entry) => !entry.isRegistered || !entry.isPaid).length,
  };
}

function historySummary(entries) {
  const historyEntries = entries.filter((entry) => entryTimeBucket(entry) === "history");
  const years = [...new Set(historyEntries.map((entry) => entryYear(entry)).filter(Boolean))];
  const paidCount = historyEntries.filter((entry) => entry.isPaid).length;
  return {
    total: historyEntries.length,
    paidCount,
    years: years.length,
  };
}

function workspaceViewFromHash() {
  return WORKSPACE_VIEW_HASHES[window.location.hash] || "";
}

function setWorkspaceView(view, { scroll = false, syncHash = false } = {}) {
  const nextView = ["overview", "people", "entries", "notify"].includes(view) ? view : "overview";
  state.workspaceView = nextView;
  saveWorkspaceView(nextView);
  els.workspaceViews.forEach((panel) => {
    const active = panel.dataset.workspacePanel === nextView;
    panel.hidden = !active;
    panel.classList.toggle("workspace-view-active", active);
  });
  els.workspaceViewTabs?.querySelectorAll("[data-workspace-view]").forEach((button) => {
    const active = button.dataset.workspaceView === nextView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  if (syncHash && VIEW_WORKSPACE_HASHES[nextView] && window.location.hash !== VIEW_WORKSPACE_HASHES[nextView]) {
    window.history.pushState(null, "", VIEW_WORKSPACE_HASHES[nextView]);
  }
  if (scroll) {
    document.querySelector(`#workspace-${nextView}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function openEntriesForWork(entryId = "", progress = "all") {
  const entry = state.entries.find((item) => item.id === entryId);
  state.entryScope = entry ? entryTimeBucket(entry) : "active";
  state.entryHistoryYear = "all";
  state.entryFilterPersonId = "";
  state.entryFilterProgress = progress;
  state.entryFilterStatus = "";
  state.entryQuery = "";
  state.entriesPage = 1;
  state.focusEntryId = entry?.id || "";
  setWorkspaceView("entries", { scroll: true });
  renderPeopleOptions();
  renderEntriesList();
}

function openNotifyForEntry(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) return;
  state.notifySelectedRaceKeys = new Set([notifyRaceKey(entry)]);
  state.notifySelectedPersonIds = new Set(entry.personId ? [entry.personId] : []);
  state.notifyProgress = entry.isRegistered && !entry.isPaid ? "unpaid" : "pending";
  setWorkspaceView("notify", { scroll: true });
  els.notifyProgress.value = state.notifyProgress;
  renderNotifyPickerLists();
  renderNotifyWorkspace();
}

function openUnpaidNotifications() {
  state.notifySelectedRaceKeys = new Set();
  state.notifySelectedPersonIds = new Set();
  state.notifyProgress = "unpaid";
  setWorkspaceView("notify", { scroll: true });
  els.notifyProgress.value = state.notifyProgress;
  renderNotifyPickerLists();
  renderNotifyWorkspace();
}

function notifyRaceKey(entry) {
  return `${normalizeMatchValue(entry.raceName)}::${String(entry.raceDate || "").slice(0, 10)}`;
}

function notifyRaceLabel(entry) {
  const raceDate = String(entry.raceDate || "").slice(0, 10);
  return [raceDate || "日期待補", entry.raceName || "未命名賽事"].join("｜");
}

function selectedNotifyRaceKeys() {
  return state.notifySelectedRaceKeys;
}

function selectedNotifyPersonIds() {
  return state.notifySelectedPersonIds;
}

function notifySearchText(entry, person) {
  return [
    entry.raceName,
    entry.personName,
    person?.name,
    entry.distance,
    entry.county,
    entry.location,
    entry.status,
    entry.notes,
    entry.shirtSize || person?.defaultShirtSize,
  ].join(" ").toLowerCase();
}

function notifyEntryMatchesProgress(entry) {
  if (state.notifyProgress === "pending") {
    return !entry.isRegistered || !entry.isPaid;
  }
  if (state.notifyProgress === "unpaid") {
    return entry.isRegistered && !entry.isPaid;
  }
  if (state.notifyProgress === "registered") {
    return entry.isRegistered;
  }
  if (state.notifyProgress === "unregistered") {
    return !entry.isRegistered;
  }
  if (state.notifyProgress === "complete") {
    return entry.isRegistered && entry.isPaid;
  }
  return true;
}

function filteredNotifyEntries() {
  const peopleById = new Map(state.people.map((person) => [person.id, person]));
  return state.entries.filter((entry) => {
    if (state.notifyScope !== "all" && entryTimeBucket(entry) !== state.notifyScope) {
      return false;
    }
    if (selectedNotifyPersonIds().size && !selectedNotifyPersonIds().has(entry.personId)) {
      return false;
    }
    if (selectedNotifyRaceKeys().size && !selectedNotifyRaceKeys().has(notifyRaceKey(entry))) {
      return false;
    }
    if (!notifyEntryMatchesProgress(entry)) {
      return false;
    }
    if (state.notifyQuery && !notifySearchText(entry, peopleById.get(entry.personId)).includes(state.notifyQuery)) {
      return false;
    }
    return true;
  });
}

function buildNotifyGroups(entries) {
  const peopleById = new Map(state.people.map((person) => [person.id, person]));
  const groups = [];
  const groupMap = new Map();
  entries.forEach((entry) => {
    const key = entry.personId || entry.personName || "unknown";
    if (!groupMap.has(key)) {
      const person = peopleById.get(entry.personId) || {};
      const group = {
        key,
        personId: entry.personId || "",
        name: entry.personName || person.name || "未指定",
        phone: person.phone || "",
        defaultShirtSize: person.defaultShirtSize || "",
        entries: [],
        totalAmount: 0,
        unpaidAmount: 0,
        registeredCount: 0,
        pendingCount: 0,
      };
      groupMap.set(key, group);
      groups.push(group);
    }
    const group = groupMap.get(key);
    group.entries.push(entry);
    group.totalAmount += Number(entry.paidAmount || 0);
    if (entry.isRegistered) {
      group.registeredCount += 1;
    }
    if (!entry.isRegistered || !entry.isPaid) {
      group.pendingCount += 1;
    }
    if (entry.isRegistered && !entry.isPaid) {
      group.unpaidAmount += Number(entry.paidAmount || 0);
    }
  });
  return groups
    .map((group) => ({
      ...group,
      raceCount: new Set(group.entries.map((entry) => notifyRaceKey(entry))).size,
      entries: group.entries.slice().sort((a, b) => `${a.raceDate}|${a.raceName}|${a.distance}`.localeCompare(`${b.raceDate}|${b.raceName}|${b.distance}`, "zh-Hant")),
    }))
    .sort((a, b) => {
      if (b.unpaidAmount !== a.unpaidAmount) return b.unpaidAmount - a.unpaidAmount;
      if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
      return a.name.localeCompare(b.name, "zh-Hant");
    });
}

function notifyCardMessage(group) {
  const lines = group.entries.map((entry, index) => {
    const bits = [
      `${index + 1}. ${entry.raceName || "未命名賽事"}`,
      entry.raceDate ? `日期 ${String(entry.raceDate).slice(0, 10)}` : "",
      entry.distance ? `組別 ${entry.distance}` : "",
      `報名 ${entry.isRegistered ? "已完成" : "未完成"}`,
      `繳費 ${entry.isPaid ? "已完成" : "未完成"}`,
      entry.paidAmount ? `金額 ${formatMoney(entry.paidAmount)}` : "",
      entry.notes ? `備註 ${entry.notes}` : "",
    ].filter(Boolean);
    return bits.join("｜");
  });
  const totals = [
    group.unpaidAmount ? `待收合計：${formatMoney(group.unpaidAmount)}` : "",
    group.pendingCount ? `待處理筆數：${group.pendingCount}` : "目前皆已完成",
  ].filter(Boolean);
  return [
    `${group.name} 您好，`,
    "以下是目前報名狀態整理：",
    ...lines,
    ...totals,
  ].join("\n");
}

function notifyCardPreviewSummary(group) {
  const previewEntries = group.entries.slice(0, 3).map((entry) => {
    const bits = [
      entry.raceDate ? String(entry.raceDate).slice(0, 10) : "日期待補",
      entry.raceName || "未命名賽事",
      entry.distance || "未填組別",
      entry.isPaid ? "已繳費" : entry.isRegistered ? "待繳費" : "待報名",
    ];
    return `• ${bits.join("｜")}`;
  });
  if (group.entries.length > 3) {
    previewEntries.push(`• 其餘 ${group.entries.length - 3} 場請直接開分頁查看摘要表`);
  }
  return [
    `${group.name} 目前共有 ${group.entries.length} 筆紀錄，待處理 ${group.pendingCount} 筆。`,
    group.unpaidAmount ? `待收總額 ${formatMoney(group.unpaidAmount)}。` : "目前沒有待收金額。",
    ...previewEntries,
  ].join("\n");
}

function notifyIcon(name, className = "") {
  const icons = {
    race: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="13" height="11" rx="2"></rect><path d="M6.5 3.5v3M13.5 3.5v3M3.5 8.5h13"></path></svg>',
    record: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="3.5" width="11" height="13" rx="2"></rect><path d="M7.5 8h5M7.5 11h5M7.5 14h4"></path></svg>',
    shirt: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5 10 3l3 2 3 1.5-1.5 3-2.5-1V16H8V8.5l-2.5 1L4 6.5 7 5Z"></path></svg>',
    phone: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.7 4.8c.4-.4 1-.5 1.5-.2l1.6 1c.5.3.7 1 .4 1.5l-.7 1.3a11.5 11.5 0 0 0 2.1 2.1l1.3-.7c.5-.3 1.1-.1 1.5.4l1 1.6c.3.5.2 1.1-.2 1.5l-.7.7c-.7.7-1.7 1-2.7.7-2.3-.7-4.4-2.8-5.1-5.1-.3-1 0-2 .7-2.7l.7-.7Z"></path></svg>',
    stack: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4 4 7l6 3 6-3-6-3Z"></path><path d="M4 10l6 3 6-3"></path><path d="M4 13l6 3 6-3"></path></svg>',
    pending: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="6.5"></circle><path d="M10 6.8v3.7l2.3 1.6"></path></svg>',
    money: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.2" width="13" height="9.6" rx="2"></rect><circle cx="10" cy="10" r="2.1"></circle><path d="M6 8.2h.01M14 11.8h.01"></path></svg>',
    person: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="6.6" r="2.6"></circle><path d="M5.2 15.2c1.3-2 3-3 4.8-3 1.8 0 3.5 1 4.8 3"></path></svg>',
    trophy: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.5h6v2.1c0 2-1.3 3.8-3 4.5-1.7-.7-3-2.5-3-4.5V4.5Z"></path><path d="M6.8 5H4.8c0 2.1.8 3.4 2.4 4M13.2 5h2c0 2.1-.8 3.4-2.4 4M10 11.2v2.3M7.8 15.5h4.4"></path></svg>',
    bell: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4.3a3 3 0 0 0-3 3v1.2c0 .9-.3 1.7-.9 2.4l-.8.9h9.4l-.8-.9a3.6 3.6 0 0 1-.9-2.4V7.3a3 3 0 0 0-3-3Z"></path><path d="M8.5 14.3a1.7 1.7 0 0 0 3 0"></path></svg>',
    open: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 4.5h4v4"></path><path d="M15.3 4.7 9 11"></path><path d="M8.5 5.5h-3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3"></path></svg>',
    copy: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="6.2" width="8.3" height="10" rx="2"></rect><path d="M5.2 13.8H5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2h6.3a2 2 0 0 1 2 2v.2"></path></svg>',
    chevron: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5.5 8 4.5 4.5L14.5 8"></path></svg>',
  };
  return `<span class="notify-icon${className ? ` ${className}` : ""}" aria-hidden="true">${icons[name] || ""}</span>`;
}

function notifyMetaItem(icon, label, value, tone = "default") {
  return `
    <span class="notify-meta-item${tone !== "default" ? ` is-${tone}` : ""}">
      ${notifyIcon(icon)}
      <span>${escapeHtml(label)} ${escapeHtml(value)}</span>
    </span>
  `;
}

function notifySummaryItem(icon, label, value, tone = "default") {
  return `
    <span class="notify-summary-item${tone !== "default" ? ` is-${tone}` : ""}">
      <span class="notify-summary-item-head">
        ${notifyIcon(icon)}
        <span>${escapeHtml(label)}</span>
      </span>
      <b>${escapeHtml(value)}</b>
    </span>
  `;
}

function notifySummaryFacts(group) {
  const facts = [];
  facts.push(notifySummaryItem("person", "報名進度", `${group.registeredCount} / ${group.entries.length}`));
  facts.push(notifySummaryItem("stack", "涵蓋賽事", `${group.raceCount} 場`));
  facts.push(notifySummaryItem("race", "檔期", notifyRangeLabel(group), "date"));
  return facts.join("");
}

function notifyRangeLabel(group) {
  const dated = group.entries
    .map((entry) => String(entry.raceDate || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  if (!dated.length) return "日期待補";
  const first = formatNotifyRangeDate(dated[0]);
  const last = formatNotifyRangeDate(dated[dated.length - 1]);
  if (dated.length === 1 || first === last) return first;
  return `${first} - ${last}`;
}

function formatNotifyRangeDate(dateText) {
  const [year, month, day] = String(dateText || "").slice(0, 10).split("-");
  if (!year || !month || !day) return String(dateText || "");
  return `${month}/${day}`;
}

function renderNotifyPickerLists() {
  const raceEntries = state.entries
    .slice()
    .sort((a, b) => `${a.raceDate}|${a.raceName}`.localeCompare(`${b.raceDate}|${b.raceName}`, "zh-Hant"))
    .reduce((items, entry) => {
      const key = notifyRaceKey(entry);
      if (!items.some((item) => item.key === key)) {
        items.push({ key, label: notifyRaceLabel(entry) });
      }
      return items;
    }, []);
  els.notifyRaceList.innerHTML = raceEntries.length
    ? raceEntries.map((race) => `
      <label class="notify-chip-toggle${state.notifySelectedRaceKeys.has(race.key) ? " active" : ""}">
        <input type="checkbox" value="${escapeHtml(race.key)}" ${state.notifySelectedRaceKeys.has(race.key) ? "checked" : ""}>
        <span>${escapeHtml(race.label)}</span>
      </label>
    `).join("")
    : '<div class="empty-state">尚無賽事資料</div>';
  els.notifyRaceList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.notifySelectedRaceKeys.add(input.value);
      else state.notifySelectedRaceKeys.delete(input.value);
      renderNotifyPickerLists();
      renderNotifyWorkspace();
    });
  });

  els.notifyPeopleList.innerHTML = state.people.length
    ? state.people.map((person) => `
      <label class="notify-chip-toggle${state.notifySelectedPersonIds.has(person.id) ? " active" : ""}">
        <input type="checkbox" value="${escapeHtml(person.id)}" ${state.notifySelectedPersonIds.has(person.id) ? "checked" : ""}>
        <span>${escapeHtml(person.name)}</span>
      </label>
    `).join("")
    : '<div class="empty-state">尚未建立人員</div>';
  els.notifyPeopleList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.notifySelectedPersonIds.add(input.value);
      else state.notifySelectedPersonIds.delete(input.value);
      renderNotifyPickerLists();
      renderNotifyWorkspace();
    });
  });
}

function renderNotifyWorkspace() {
  if (state.loadState === "loading") {
    els.notifyResults.className = `notify-results-shell${state.notifyDensity === "compact" ? " is-compact" : ""}`;
    els.notifyResults.innerHTML = '<div class="empty-state">正在讀取報名與賽事資料…</div>';
    return [];
  }
  if (state.loadState === "error") {
    els.notifyResults.className = `notify-results-shell${state.notifyDensity === "compact" ? " is-compact" : ""}`;
    els.notifyResults.innerHTML = `<div class="empty-state">資料讀取失敗：${escapeHtml(state.loadError || "請重新整理後再試一次。")}</div>`;
    return [];
  }
  const filteredEntries = filteredNotifyEntries();
  const groups = buildNotifyGroups(filteredEntries);
  const uniqueRaceCount = new Set(filteredEntries.map((entry) => notifyRaceKey(entry))).size;
  const unpaidGroups = groups.filter((group) => group.unpaidAmount > 0 || group.pendingCount > 0);
  const unpaidAmount = groups.reduce((sum, group) => sum + group.unpaidAmount, 0);

  els.notifySummaryPeople.textContent = String(groups.length);
  els.notifySummaryRaces.textContent = String(uniqueRaceCount);
  els.notifySummaryPending.textContent = String(unpaidGroups.length);
  els.notifySummaryUnpaid.textContent = formatMoney(unpaidAmount);
  els.notifyDensityComfortable?.classList.toggle("is-active", state.notifyDensity === "comfortable");
  els.notifyDensityCompact?.classList.toggle("is-active", state.notifyDensity === "compact");
  saveNotifyPreferences();

  if (!groups.length) {
    els.notifyResults.className = `notify-results-shell${state.notifyDensity === "compact" ? " is-compact" : ""}`;
    els.notifyResults.innerHTML = `<div class="empty-state">${state.entries.length ? "目前篩選條件下沒有符合的人員卡片" : "尚未建立報名紀錄"}</div>`;
    return groups;
  }

  const validGroupKeys = new Set(groups.map((group) => group.key));
  state.notifyCollapsedGroups = new Set([...state.notifyCollapsedGroups].filter((key) => validGroupKeys.has(key)));
  if (!state.notifyWorkspacePrimed) {
    if (groups.length > 1) {
      state.notifyCollapsedGroups = new Set(groups.map((group) => group.key));
    }
    state.notifyWorkspacePrimed = true;
  }
  els.notifyResults.className = `notify-results-shell${state.notifyDensity === "compact" ? " is-compact" : ""}`;
  els.notifyResults.innerHTML = groups.map((group, index) => `
    <article class="notify-person-card${state.notifyCollapsedGroups.has(group.key) ? " is-collapsed" : ""}">
      <div class="notify-card-head">
        <div class="notify-person-rank">${String(index + 1).padStart(2, "0")}</div>
        <div class="notify-card-main">
          <div class="notify-card-title-row">
            <h3>${escapeHtml(group.name)}</h3>
            ${overviewStatusTag(group.pendingCount ? `待處理 ${group.pendingCount}` : "目前完成", pendingTone(group.pendingCount))}
          </div>
          <div class="notify-card-meta">
            ${group.defaultShirtSize ? notifyMetaItem("shirt", "衣服", group.defaultShirtSize) : ""}
            ${group.phone ? notifyMetaItem("phone", "手機", maskedPhone(group.phone)) : ""}
          </div>
          <div class="notify-card-summaryrow">
            ${notifySummaryFacts(group)}
          </div>
        </div>
        <div class="notify-card-side">
          <div class="notify-card-total">
            <small class="notify-card-total-label">待收金額</small>
            <strong>${escapeHtml(formatMoney(group.unpaidAmount))}</strong>
            <span>${group.unpaidAmount ? "依未繳費項目合計" : "目前無待收"}</span>
          </div>
          <div class="notify-card-toolbar">
            <div class="notify-card-actions">
              <button class="notify-action-button is-secondary" type="button" data-open-notify-person="${escapeHtml(group.key)}">
                ${notifyIcon("open")}
                <span>開分頁</span>
              </button>
              <button class="notify-action-button is-primary" type="button" data-copy-notify-person="${escapeHtml(group.key)}">
                ${notifyIcon("copy")}
                <span>複製通知</span>
              </button>
            </div>
            <button class="notify-card-expand" type="button" data-toggle-notify-group="${escapeHtml(group.key)}">
              ${notifyIcon("chevron")}
              <span>${state.notifyCollapsedGroups.has(group.key) ? "展開" : "收合"}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="notify-card-body">
        <section class="notify-message-panel">
          <div class="notify-message-marker">${notifyIcon("bell")}</div>
          <div class="notify-message-copy">
            <div class="notify-message-head">
              <div class="notify-message-title">
                <div>
                  <span>通知摘要</span>
                  <strong>可直接轉傳給報名者</strong>
                </div>
              </div>
            </div>
            <pre>${escapeHtml(notifyCardPreviewSummary(group))}</pre>
          </div>
        </section>
        <div class="notify-entry-list">
          ${group.entries.map((entry) => `
            <section class="notify-entry-row ${statusClass(entry)}">
              <div class="notify-entry-date">
                <strong>${escapeHtml(String(entry.raceDate || "日期待補").slice(0, 10) || "日期待補")}</strong>
                <span>${escapeHtml(entry.distance || "未分組")}</span>
              </div>
              <div class="notify-entry-main">
                <strong>${escapeHtml(entry.raceName || "未命名賽事")}</strong>
                <div class="entry-meta notify-entry-statuses">
                  <span class="meta-pill">${escapeHtml(entry.isRegistered ? "已報名" : "未報名")}</span>
                  <span class="meta-pill">${escapeHtml(entry.isPaid ? "已繳費" : "未繳費")}</span>
                  <span class="meta-pill">${escapeHtml(entry.status || "待報名")}</span>
                </div>
                <p>${escapeHtml([entry.notes, [entry.county, entry.location].filter(Boolean).join(" · ")].filter(Boolean).join("｜") || "無補充說明")}</p>
              </div>
              <div class="notify-entry-amount">
                <strong>${escapeHtml(formatMoney(entry.paidAmount))}</strong>
                <small>${escapeHtml(entry.isPaid ? "費用已確認" : entry.isRegistered ? "待收此筆費用" : "尚未完成報名" )}</small>
              </div>
            </section>
          `).join("")}
        </div>
      </div>
    </article>
  `).join("");
  return groups;
}

function syncEntryPersonSelectFromBatch() {
  const [firstPersonId = ""] = [...state.entryBatchPersonIds];
  els.entryPersonId.value = firstPersonId;
}

async function loadRaces() {
  const response = await fetch(`/site/data/races.json?v=${DATA_VERSION}`, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error("賽事資料讀取失敗");
  }
  const data = await response.json();
  state.races = normalizeArray(data).sort((a, b) => String(a.race_date || "").localeCompare(String(b.race_date || "")));
  state.filteredRaces = state.races.filter(isSelectableRace);
}

async function loadPrivateData() {
  const response = await fetch("/api/registration-data", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error("本機報名資料讀取失敗");
  }
  const data = await response.json();
  state.people = normalizeArray(data.people).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  state.entries = normalizeArray(data.entries).map((entry) => ({
    ...entry,
    distance: normalizeDistanceValue(entry.distance),
  })).sort((a, b) => String(a.raceDate || "").localeCompare(String(b.raceDate || "")));
  state.lastKnownUpdatedAt = data.updatedAt || null;
}

async function savePrivateData() {
  const response = await fetch("/api/registration-data", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(currentPayload()),
  });
  if (response.status === 409) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "資料已被其他分頁或裝置更新，請重新整理後再試一次。");
  }
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "儲存失敗");
  }
  const result = await response.json().catch(() => null);
  if (result?.updatedAt) state.lastKnownUpdatedAt = result.updatedAt;
}

function renderSummary() {
  const missingSignupCount = state.entries.filter((entry) => !entry.isRegistered).length;
  const awaitingPaymentCount = state.entries.filter((entry) => entry.isRegistered && !entry.isPaid).length;
  const pendingCount = missingSignupCount + awaitingPaymentCount;
  const unpaidCount = awaitingPaymentCount;
  const unpaidTotal = state.entries
    .filter((entry) => entry.isRegistered && !entry.isPaid)
    .reduce((sum, entry) => sum + Number(entry.paidAmount || 0), 0);
  els.summaryRaces.textContent = String(state.races.filter(isSelectableRace).length);
  els.summaryPeople.textContent = String(state.people.length);
  els.summaryPending.textContent = String(pendingCount);
  els.summaryUnpaid.textContent = String(unpaidCount);
  const pendingCaption = document.querySelector("#summary-pending-caption");
  if (pendingCaption) {
    pendingCaption.textContent = pendingCount
      ? `${awaitingPaymentCount}筆繳費確認・${missingSignupCount}筆表單缺漏`
      : "";
  }
  const unpaidCaption = document.querySelector("#summary-unpaid-caption");
  if (unpaidCaption) {
    unpaidCaption.textContent = unpaidCount ? `合計 ${formatMoney(unpaidTotal)}` : "";
  }
}

function renderPeopleOptions() {
  const options = ['<option value="">請先選擇人員</option>']
    .concat(state.people.map((person) => (
      `<option value="${escapeHtml(person.id)}">${escapeHtml(personLabel(person))}</option>`
    )));
  els.entryPersonId.innerHTML = options.join("");
  const filterOptions = ['<option value="">全部人員</option>']
    .concat(state.people.map((person) => (
      `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)}</option>`
    )));
  els.entriesFilterPerson.innerHTML = filterOptions.join("");
  els.entriesFilterPerson.value = state.entryFilterPersonId;
  const yearOptions = ['<option value="all">全部年份</option>']
    .concat([...new Set(state.entries.map((entry) => entryYear(entry)).filter(Boolean))].sort((a, b) => b.localeCompare(a)).map((year) => (
      `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`
    )));
  els.entriesFilterYear.innerHTML = yearOptions.join("");
  els.entriesFilterYear.value = state.entryHistoryYear;
}

function renderEntryPersonBatch() {
  if (!state.people.length) {
    els.entryPersonBatch.innerHTML = '<div class="empty-state">請先建立人員</div>';
    return;
  }
  const editing = Boolean(els.entryId.value);
  els.entryPersonBatch.innerHTML = state.people.map((person) => {
    const active = state.entryBatchPersonIds.has(person.id);
    const disabled = editing && !active;
    return `
      <label class="batch-check${active ? " active" : ""}">
        <input type="checkbox" value="${escapeHtml(person.id)}" ${active ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span>${escapeHtml(person.name)}</span>
      </label>
    `;
  }).join("");
  els.entryPersonBatch.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        state.entryBatchPersonIds.add(input.value);
      } else {
        state.entryBatchPersonIds.delete(input.value);
      }
      syncEntryPersonSelectFromBatch();
      renderEntryPersonBatch();
    });
  });
}

function renderRacePicker() {
  if (!state.filteredRaces.length) {
    els.raceSelect.innerHTML = '<option value="">目前沒有可處理的未開賽賽事</option>';
    if (els.raceSelectHints) els.raceSelectHints.innerHTML = "";
    els.useSelectedRace.disabled = true;
    els.exportSelectedRacePayments.disabled = true;
    els.exportSelectedRacePaymentHtml.disabled = true;
    renderSelectedRaceSummary(null);
    return;
  }

  const previousValue = els.raceSelect.value || savedSelectedRaceId();
  els.raceSelect.innerHTML = state.filteredRaces.map((race) => {
    return `<option value="${escapeHtml(raceId(race))}">${escapeHtml(compactRaceOptionLabel(race))}</option>`;
  }).join("");
  const hasPrevious = state.filteredRaces.some((race) => String(raceId(race)) === previousValue);
  els.raceSelect.value = hasPrevious ? previousValue : String(raceId(state.filteredRaces[0]));
  saveSelectedRaceId(els.raceSelect.value);
  els.useSelectedRace.disabled = false;
  els.exportSelectedRacePayments.disabled = false;
  els.exportSelectedRacePaymentHtml.disabled = false;
  renderSelectedRaceSummary(selectedRaceFromDropdown());
  renderRaceSelectHints(selectedRaceFromDropdown());
}

function renderRaceSelectHints(race) {
  if (!els.raceSelectHints) return;
  if (!race) {
    els.raceSelectHints.innerHTML = "";
    return;
  }
  const location = raceCounty(race) || formatRaceLocation(race);
  const hints = [raceDateTag(race), dedupeRaceDistances(race), location].filter(Boolean);
  els.raceSelectHints.innerHTML = hints.map((hint) => `<span>${escapeHtml(hint)}</span>`).join("");
}

function selectedRaceFromDropdown() {
  return state.races.find((race) => String(raceId(race)) === els.raceSelect.value) || null;
}

function raceByNameAndDate(name, date) {
  const normalizedName = normalizeMatchValue(name);
  const normalizedDate = String(date || "").slice(0, 10);
  return state.races.find((race) => (
    normalizeMatchValue(raceName(race)) === normalizedName
    && String(race.race_date || "").slice(0, 10) === normalizedDate
  )) || null;
}

function distanceOptions(values, selectedValue = "", emptyLabel = "請選擇組別") {
  const normalizedSelected = normalizeDistanceValue(selectedValue);
  const items = normalizeArray(values).map((value) => normalizeDistanceValue(value)).filter(Boolean);
  if (normalizedSelected && !items.includes(normalizedSelected)) {
    items.push(normalizedSelected);
  }
  const firstOption = `<option value="">${escapeHtml(emptyLabel)}</option>`;
  return firstOption + items.map((value) => (
    `<option value="${escapeHtml(value)}" ${value === normalizedSelected ? "selected" : ""}>${escapeHtml(value)}</option>`
  )).join("");
}

function setEntryDistanceOptions(race, selectedValue = "") {
  const distances = race ? normalizeArray(race.distances) : [];
  const hasRaceOptions = distances.some((value) => normalizeDistanceValue(value));
  const normalizedSelected = normalizeDistanceValue(selectedValue);
  els.entryDistance.innerHTML = distanceOptions(
    distances,
    selectedValue,
    hasRaceOptions ? "請選擇組別" : normalizedSelected ? "無組別資料" : "請先帶入賽事"
  );
  els.entryDistance.disabled = !hasRaceOptions && !normalizedSelected;
}

function isSameRaceEntry(entry, race) {
  const sameName = normalizeMatchValue(entry.raceName) === normalizeMatchValue(raceName(race));
  const raceDate = String(race.race_date || "").slice(0, 10);
  const sameDate = !raceDate || !entry.raceDate || String(entry.raceDate).slice(0, 10) === raceDate;
  return sameName && sameDate;
}

function raceEntryStats(race) {
  const entries = race ? state.entries.filter((entry) => isSameRaceEntry(entry, race)) : [];
  const uniquePeople = new Set(entries.map((entry) => entry.personId).filter(Boolean)).size;
  const paidCount = entries.filter((entry) => entry.isPaid).length;
  const registeredCount = entries.filter((entry) => entry.isRegistered).length;
  const pendingCount = entries.filter((entry) => !entry.isRegistered || !entry.isPaid).length;
  return {
    total: entries.length,
    uniquePeople,
    paidCount,
    registeredCount,
    pendingCount,
  };
}

function renderSelectedRaceSummary(race) {
  if (!els.racePicker) return;
  if (!race) {
    els.racePicker.innerHTML = '<div class="empty-state">請先選擇賽事</div>';
    return;
  }
  const stats = raceEntryStats(race);
  els.racePicker.innerHTML = `
    <article class="race-picker-item compact sidebar-race-snapshot">
      <div class="card-title-row">
        <div class="sidebar-race-copy">
          <span class="sidebar-race-label">目前鎖定</span>
          <h3>${escapeHtml(raceName(race))}</h3>
        </div>
        ${overviewStatusTag(stats.pendingCount ? "待處理" : "已就緒", pendingTone(stats.pendingCount))}
      </div>
      <div class="race-picker-meta">
        <span class="meta-pill">${escapeHtml(race.race_date || "日期待補")}</span>
        <span class="meta-pill">${escapeHtml(dedupeRaceDistances(race) || "距離待補")}</span>
        <span class="meta-pill">${escapeHtml(workspaceRaceStatus(race))}</span>
      </div>
      <p class="sidebar-race-location">${escapeHtml(formatRaceLocation(race) || "地點待補")}</p>
      <div class="sidebar-race-stats">
        <div class="sidebar-race-stat">
          <strong>${escapeHtml(String(stats.total))}</strong>
          <span>已建名額</span>
        </div>
        <div class="sidebar-race-stat">
          <strong>${escapeHtml(String(stats.uniquePeople))}</strong>
          <span>參加人員</span>
        </div>
        <div class="sidebar-race-stat">
          <strong>${escapeHtml(String(stats.pendingCount))}</strong>
          <span>待處理</span>
        </div>
      </div>
      ${race.registration_link ? `<a class="mini-action sidebar-race-link" href="${escapeHtml(race.registration_link)}" target="_blank" rel="noreferrer">打開報名站</a>` : ""}
    </article>
  `;
}

function personBasicDataRows(person) {
  return [
    ["姓名", person.name],
    ["性別", person.gender],
    ["衣服尺寸", person.defaultShirtSize],
    ["手機", person.phone],
    ["身分證號碼", person.nationalId],
    ["出生年月日", person.birthday],
    ["緊急聯絡人", person.emergencyName],
    ["關係", person.emergencyRelationship],
    ["緊急聯絡人手機", person.emergencyPhone],
  ];
}

function personBasicDataText(person) {
  return personBasicDataRows(person)
    .map(([label, value]) => `${label}：${String(value || "").trim() || "未填"}`)
    .join("\n");
}

function renderPersonBasicDetails(person) {
  const details = personBasicDataRows(person).map(([label, value]) => `
    <div class="person-basic-detail-item">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(String(value || "").trim() || "未填")}</dd>
    </div>
  `).join("");
  return `
    <section class="person-basic-details" aria-label="${escapeHtml(person.name)} 的基本資料">
      <div class="person-basic-details-head">
        <div>
          <strong>基本資料</strong>
          <span>完整資料僅在本機報名管理中顯示</span>
        </div>
        <button class="secondary-action person-basic-copy" type="button" data-copy-person-details="${escapeHtml(person.id)}">複製基本資料</button>
      </div>
      <dl class="person-basic-details-grid">${details}</dl>
    </section>
  `;
}

function renderEntryPersonDetails(person) {
  const details = personBasicDataRows(person).map(([label, value]) => `
    <div class="entry-person-detail-item">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(String(value || "").trim() || "未填")}</dd>
    </div>
  `).join("");
  return `
    <section class="entry-person-details" aria-label="${escapeHtml(person.name)} 的基本資料">
      <div class="entry-person-details-head">
        <div>
          <strong>${escapeHtml(person.name)} 的基本資料</strong>
          <span>與人員名單即時連動，完整資料只在本機顯示</span>
        </div>
        <button class="secondary-action entry-person-details-copy" type="button" data-copy-person-details="${escapeHtml(person.id)}">複製基本資料</button>
      </div>
      <dl class="entry-person-details-grid">${details}</dl>
    </section>
  `;
}

function updatePeopleBulkToolbar() {
  if (!els.peopleBulkToolbar) {
    return;
  }
  const count = state.selectedPersonIds.size;
  els.peopleBulkToolbar.hidden = count === 0;
  const countEl = els.peopleBulkToolbar.querySelector(".bulk-toolbar-count");
  if (countEl) {
    countEl.textContent = `已選 ${count} 筆`;
  }
}

async function bulkDeleteSelectedPeople() {
  const ids = [...state.selectedPersonIds];
  if (!ids.length) {
    return;
  }
  const blocked = ids.filter((id) => state.entries.some((entry) => entry.personId === id));
  const deletable = ids.filter((id) => !blocked.includes(id));
  if (!deletable.length) {
    showStatus("已選人員都還有報名紀錄，請先刪除相關紀錄。", "error");
    return;
  }
  const names = state.people.filter((person) => deletable.includes(person.id)).map((person) => person.name).join("、");
  if (!window.confirm(`確定刪除 ${deletable.length} 位人員（${names}）？此動作無法復原。`)) {
    return;
  }
  state.people = state.people.filter((person) => !deletable.includes(person.id));
  state.selectedPersonIds.clear();
  const message = blocked.length
    ? `已刪除 ${deletable.length} 位人員，${blocked.length} 位因仍有報名紀錄被略過`
    : `已刪除 ${deletable.length} 位人員`;
  await persistAndRender(message);
}

function bulkCopySelectedPeople() {
  const ids = [...state.selectedPersonIds];
  const selected = state.people.filter((person) => ids.includes(person.id));
  if (!selected.length) {
    showStatus("尚未選取人員。", "error");
    return;
  }
  const text = selected.map((person) => personBasicDataText(person)).join("\n\n");
  navigator.clipboard.writeText(text)
    .then(() => showStatus(`已複製 ${selected.length} 位人員的基本資料`, "success"))
    .catch((error) => showStatus(error.message || "複製失敗", "error"));
}

const AVATAR_PALETTE = ["#1b6a4d", "#1c5f8a", "#a3671a", "#6a3f8a", "#3f6a1c", "#2f6f7d"];

function avatarColor(name) {
  const key = String(name || "?").trim();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function isPeopleFilterActive() {
  return state.peopleFilters.gender !== "all"
    || state.peopleFilters.size !== "all"
    || state.peopleFilters.pending !== "all";
}

function renderPeopleList() {
  if (els.peopleFilterReset) {
    els.peopleFilterReset.hidden = !isPeopleFilterActive();
  }
  state.selectedPersonIds.forEach((id) => {
    if (!state.people.some((person) => person.id === id)) {
      state.selectedPersonIds.delete(id);
    }
  });
  const filteredPeople = state.people.filter((person) => {
    const stats = personStats(person.id);
    return (!state.peopleQuery || personSearchText(person).includes(state.peopleQuery))
      && (state.peopleFilters.gender === "all" || person.gender === state.peopleFilters.gender)
      && (state.peopleFilters.size === "all" || person.defaultShirtSize === state.peopleFilters.size)
      && (state.peopleFilters.pending === "all"
        || (state.peopleFilters.pending === "pending" && stats.pending > 0)
        || (state.peopleFilters.pending === "completed" && stats.pending === 0));
  });
  const sortedPeople = [...filteredPeople].sort((left, right) => {
    const byName = () => String(left.name || "").localeCompare(String(right.name || ""), "zh-Hant");
    if (state.peopleSort === "name") return byName();
    if (state.peopleSort === "name-desc") return byName() * -1;
    if (state.peopleSort === "active-desc") return personStats(right.id).active - personStats(left.id).active || byName();
    if (state.peopleSort === "active-asc") return personStats(left.id).active - personStats(right.id).active || byName();
    if (state.peopleSort === "pending-desc") return personStats(right.id).pending - personStats(left.id).pending || byName();
    if (state.peopleSort === "pending-asc") return personStats(left.id).pending - personStats(right.id).pending || byName();
    return 0;
  });
  if (!sortedPeople.length) {
    els.peopleList.innerHTML = `<div class="empty-state">${state.people.length ? "查無符合的人員" : "尚未建立人員"}</div>`;
    renderPagination(els.peoplePagination, "people", { total: 0 });
    updatePeopleBulkToolbar();
    return;
  }

  if (state.focusPersonId) {
    const focusIndex = sortedPeople.findIndex((person) => person.id === state.focusPersonId);
    if (focusIndex >= 0) {
      state.peoplePage = Math.floor(focusIndex / PEOPLE_PAGE_SIZE) + 1;
    }
  }
  const pagination = paginateItems(sortedPeople, state.peoplePage, state.peoplePageSize);
  state.peoplePage = pagination.page;

  const pageIds = pagination.items.map((person) => person.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => state.selectedPersonIds.has(id));

  const sortHeaderCell = (label, ascValue, descValue) => {
    const direction = state.peopleSort === ascValue ? "asc" : state.peopleSort === descValue ? "desc" : "";
    const sortHint = direction === "asc" ? "目前升冪，點擊改為降冪" : direction === "desc" ? "目前降冪，點擊取消排序" : "點擊排序";
    return `<button type="button" class="person-sort-button${direction ? ` is-${direction}` : ""}" data-people-sort-asc="${escapeHtml(ascValue)}" data-people-sort-desc="${escapeHtml(descValue)}" aria-label="${escapeHtml(`${label}：${sortHint}`)}" title="${escapeHtml(sortHint)}">
        <span>${escapeHtml(label)}</span>
        <svg class="person-sort-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path class="sort-up-path" d="M4.8 6.4 8 3.2l3.2 3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
          <path class="sort-down-path" d="M4.8 9.6 8 12.8l3.2-3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        </svg>
      </button>`;
  };
  els.peopleList.innerHTML = `<div class="person-row person-row-head">
      <span class="person-row-check"><input type="checkbox" id="people-select-all-page" aria-label="全選本頁隊員"${allPageSelected ? " checked" : ""}></span>
      ${sortHeaderCell("隊員資訊", "name", "name-desc")}
      ${sortHeaderCell("目前賽事", "active-asc", "active-desc")}
      ${sortHeaderCell("待處理", "pending-asc", "pending-desc")}
      <span>聯絡資訊</span><span class="person-head-actions">操作</span>
    </div>${pagination.items.map((person) => {
    const stats = personStats(person.id);
    const isShowingDetails = state.personDetailsId === person.id;
    return `
    <article class="person-card person-row${state.focusPersonId === person.id ? " is-focused" : ""}${state.selectedPersonIds.has(person.id) ? " is-selected" : ""}" id="person-card-${escapeHtml(person.id)}">
      <div class="person-row-check">
        <input type="checkbox" class="person-select" value="${escapeHtml(person.id)}" aria-label="選取 ${escapeHtml(person.name)}"${state.selectedPersonIds.has(person.id) ? " checked" : ""}>
      </div>
      <div class="person-row-identity">
        <span class="person-avatar" aria-hidden="true" style="background:${avatarColor(person.name)}">${escapeHtml((person.name || "?").trim().slice(0, 1))}</span>
        <div class="person-identity-text">
          <strong>${escapeHtml(person.name)}</strong>
          <span>${escapeHtml([person.gender, person.defaultShirtSize].filter(Boolean).join(" · ") || "資料待補")}</span>
        </div>
      </div>
      <div class="person-row-stat"><strong>${escapeHtml(stats.active)}</strong><small>場賽事</small></div>
      <div class="person-row-stat person-row-pending${stats.pending ? " has-pending" : " is-clear"}"><strong>${escapeHtml(stats.pending)}</strong><small>${stats.pending ? "筆待處理" : "已全部完成"}</small></div>
      <div class="person-row-contact">
        <span class="person-contact-line"><span class="contact-label">手機</span><span class="contact-value">${escapeHtml(person.phone ? maskedPhone(person.phone) : "未填")}</span></span>
        <span class="person-contact-line"><span class="contact-label">身分證</span><span class="contact-value">${escapeHtml(person.nationalId ? String(person.nationalId).slice(-4).padStart(String(person.nationalId).length, "*") : "未填")}</span></span>
      </div>
      <div class="card-actions person-row-actions">
        <button class="mini-action person-row-icon-action${isShowingDetails ? " is-active" : ""}" type="button" data-show-person-details="${escapeHtml(person.id)}" aria-label="${isShowingDetails ? "收合" : "查看"} ${escapeHtml(person.name)} 的基本資料" title="${isShowingDetails ? "收合基本資料" : "查看基本資料"}"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M2.5 10s2.7-4.5 7.5-4.5S17.5 10 17.5 10s-2.7 4.5-7.5 4.5S2.5 10 2.5 10Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="2.1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
        <button class="mini-action person-row-icon-action" type="button" data-edit-person="${escapeHtml(person.id)}" aria-label="編輯 ${escapeHtml(person.name)}" title="編輯"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m4 14.8.8-3.3L12.7 3.6a1.7 1.7 0 0 1 2.4 2.4l-7.9 7.9-3.2.9Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/><path d="m11.5 4.8 3.7 3.7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
        <details class="person-more-actions"><summary aria-label="更多操作" title="更多操作"><svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="4.5" cy="10" r="1.6" fill="currentColor"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><circle cx="15.5" cy="10" r="1.6" fill="currentColor"/></svg></summary><div class="person-more-menu"><button class="mini-action" type="button" data-view-person="${escapeHtml(person.id)}" data-view-scope="history">歷史紀錄</button><button class="mini-action danger-action" type="button" data-delete-person="${escapeHtml(person.id)}">刪除人員</button></div></details>
      </div>
      ${isShowingDetails ? renderPersonBasicDetails(person) : ""}
    </article>
  `;
  }).join("")}`;

  els.peopleList.querySelectorAll("[data-people-sort-asc]").forEach((button) => {
    button.addEventListener("click", () => {
      const { peopleSortAsc, peopleSortDesc } = button.dataset;
      state.peopleSort = state.peopleSort === peopleSortAsc
        ? peopleSortDesc
        : state.peopleSort === peopleSortDesc ? "" : peopleSortAsc;
      state.peoplePage = 1;
      renderPeopleList();
    });
  });
  els.peopleList.querySelectorAll(".person-select").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedPersonIds.add(checkbox.value);
      } else {
        state.selectedPersonIds.delete(checkbox.value);
      }
      checkbox.closest(".person-row")?.classList.toggle("is-selected", checkbox.checked);
      updatePeopleBulkToolbar();
    });
  });
  const selectAll = els.peopleList.querySelector("#people-select-all-page");
  if (selectAll) {
    selectAll.indeterminate = !allPageSelected && pageIds.some((id) => state.selectedPersonIds.has(id));
  }
  selectAll?.addEventListener("change", (event) => {
    if (event.target.checked) {
      pageIds.forEach((id) => state.selectedPersonIds.add(id));
    } else {
      pageIds.forEach((id) => state.selectedPersonIds.delete(id));
    }
    renderPeopleList();
  });
  els.peopleList.querySelectorAll("[data-edit-person]").forEach((button) => {
    button.addEventListener("click", () => editPerson(button.dataset.editPerson));
  });
  els.peopleList.querySelectorAll("[data-delete-person]").forEach((button) => {
    button.addEventListener("click", () => {
      const personId = button.dataset.deletePerson;
      const person = state.people.find((item) => item.id === personId);
      if (!window.confirm(`確定刪除人員「${person?.name || ""}」？此動作無法復原。`)) {
        return;
      }
      deletePerson(personId).catch((error) => showStatus(error.message || "刪除失敗", "error"));
    });
  });
  els.peopleList.querySelectorAll("[data-show-person-details]").forEach((button) => {
    button.addEventListener("click", () => {
      const personId = button.dataset.showPersonDetails || "";
      state.personDetailsId = state.personDetailsId === personId ? "" : personId;
      renderPeopleList();
    });
  });
  els.peopleList.querySelectorAll("[data-copy-person-details]").forEach((button) => {
    button.addEventListener("click", () => {
      const person = state.people.find((item) => item.id === button.dataset.copyPersonDetails);
      if (!person) {
        showStatus("找不到這位人員的基本資料。", "error");
        return;
      }
      navigator.clipboard.writeText(personBasicDataText(person))
        .then(() => showStatus(`已複製 ${person.name} 的基本資料`, "success"))
        .catch((error) => showStatus(error.message || "複製基本資料失敗", "error"));
    });
  });
  els.peopleList.querySelectorAll("[data-view-person]").forEach((button) => {
    button.addEventListener("click", () => {
      state.entryFilterPersonId = button.dataset.viewPerson || "";
      state.entryScope = button.dataset.viewScope || "active";
      state.entryFilterProgress = "all";
      state.entryFilterStatus = "";
      state.entryQuery = "";
      state.entryHistoryYear = "all";
      state.entriesPage = 1;
      els.entriesFilterPerson.value = state.entryFilterPersonId;
      els.entriesFilterProgress.value = "all";
      els.entriesFilterStatus.value = "";
      els.entriesSearch.value = "";
      els.entriesFilterYear.value = "all";
      setWorkspaceView("entries");
      renderEntriesList();
      document.querySelector("#entries-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  renderPagination(els.peoplePagination, "people", pagination);
  els.peoplePagination.querySelector("[data-people-page-size]")?.addEventListener("change", (event) => {
    state.peoplePageSize = Number(event.target.value) || PEOPLE_PAGE_SIZE;
    state.peoplePage = 1;
    renderPeopleList();
  });
  updatePeopleBulkToolbar();
}

function statusClass(entry) {
  return entry.isRegistered && entry.isPaid ? "is-complete" : "is-pending";
}

function entryGroupKey(entry) {
  return [
    normalizeMatchValue(entry.raceName),
    String(entry.raceDate || "").slice(0, 10),
  ].join("::");
}

function groupEntriesByRace(entries) {
  const groups = [];
  const groupMap = new Map();
  entries.forEach((entry) => {
    const key = entryGroupKey(entry);
    if (!groupMap.has(key)) {
      const group = {
        key,
        raceName: entry.raceName || "未命名賽事",
        raceDate: entry.raceDate || "",
        county: entry.county || "",
        location: entry.location || "",
        entries: [],
      };
      groupMap.set(key, group);
      groups.push(group);
    }
    groupMap.get(key).entries.push(entry);
  });
  return groups;
}

function uniqueGroupDistances(group) {
  return group.entries.reduce((distances, entry) => {
    const distance = normalizeDistanceValue(entry.distance);
    if (distance && !distances.includes(distance)) {
      distances.push(distance);
    }
    return distances;
  }, []);
}

function groupDistanceLabel(group) {
  const distances = uniqueGroupDistances(group);
  if (!distances.length) {
    return "";
  }
  if (distances.length <= 3) {
    return distances.join(" / ");
  }
  return `${distances.slice(0, 2).join(" / ")} 等 ${distances.length} 組`;
}

function renderOverview() {
  const selectedRace = selectedRaceFromDropdown();
  if (!selectedRace) {
    els.overviewSelectedRace.innerHTML = '<div class="empty-state">請先從左側選一場賽事。</div>';
  } else {
    const stats = raceEntryStats(selectedRace);
    els.overviewSelectedRace.innerHTML = `
      <article class="overview-race-card">
        <div class="overview-race-head">
          <div class="overview-race-copy">
            <div class="overview-card-kicker">
              ${overviewStatusTag(stats.pendingCount ? `待完成 ${stats.pendingCount}` : "目前已就緒", pendingTone(stats.pendingCount))}
              ${overviewStatusTag(workspaceRaceStatus(selectedRace), "neutral")}
            </div>
            <h3>${escapeHtml(raceName(selectedRace))}</h3>
            <p>${escapeHtml(formatRaceLocation(selectedRace) || "地點待補")}</p>
          </div>
        </div>
        <div class="race-picker-meta">
          <span class="meta-pill">${escapeHtml(selectedRace.race_date || "日期待補")}</span>
          <span class="meta-pill">${escapeHtml(dedupeRaceDistances(selectedRace) || "距離待補")}</span>
          <span class="meta-pill">${escapeHtml(`已建立 ${stats.total} 筆`)}</span>
        </div>
        <div class="overview-race-side">
          <div class="overview-race-facts">
            <span><b>${escapeHtml(stats.uniquePeople)}</b> 位參加人員</span>
            <span><b>${escapeHtml(stats.registeredCount)}</b> 筆已報名</span>
            <span class="${stats.pendingCount ? "is-warning" : ""}"><b>${escapeHtml(stats.pendingCount)}</b> 筆待處理</span>
          </div>
          ${selectedRace.registration_link ? `<div class="overview-race-actions"><a class="mini-action" href="${escapeHtml(selectedRace.registration_link)}" target="_blank" rel="noreferrer">開啟報名站</a></div>` : ""}
        </div>
      </article>
    `;
  }

  const peopleById = new Map(state.people.map((person) => [person.id, person]));
  const pendingEntries = state.entries
    .filter((entry) => entryTimeBucket(entry) === "active" && (!entry.isRegistered || !entry.isPaid))
    .sort((a, b) => {
      const urgency = Number(a.isRegistered) - Number(b.isRegistered);
      return urgency || String(a.raceDate || "").localeCompare(String(b.raceDate || ""));
    });
  if (els.overviewQueueSummary) {
    els.overviewQueueSummary.textContent = pendingEntries.length
      ? `目前有 ${pendingEntries.length} 個待處理事項`
      : "所有待辦項目都已完成";
  }
  els.overviewWorkQueue.innerHTML = pendingEntries.length
    ? pendingEntries.slice(0, 8).map((entry) => {
      const person = peopleById.get(entry.personId);
      const needsSignup = !entry.isRegistered;
      const taskLabel = needsSignup ? "待完成報名" : "待確認繳費";
      return `
        <article class="overview-queue-item ${needsSignup ? "is-signup" : "is-payment"}">
          <span class="overview-queue-icon" aria-hidden="true">${needsSignup
    ? '<svg viewBox="0 0 20 20"><path d="M10 2.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 6.2v4.1l2.6 1.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"/></svg>'
    : '<svg viewBox="0 0 20 20"><path d="M10 2.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 6.2v4.1l2.6 1.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"/></svg>'}</span>
          <div class="overview-queue-copy">
            <h3>
              ${escapeHtml(person?.name || "未指派人員")}
              <span class="overview-queue-status">${escapeHtml(taskLabel)}</span>
            </h3>
            <p>${escapeHtml(entry.raceName || "未命名賽事")}</p>
            <div class="entry-meta overview-queue-meta">
              ${entry.raceDate ? `<span><svg aria-hidden="true" viewBox="0 0 20 20"><rect x="3.2" y="4.4" width="13.6" height="12.4" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.4 2.8v3.4M13.6 2.8v3.4M3.2 8h13.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>${escapeHtml(entry.raceDate)}</span>` : ""}
              ${entry.distance ? `<span><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 17.2s5-4.5 5-8.7A5 5 0 0 0 5 8.5c0 4.2 5 8.7 5 8.7Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="8.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>${escapeHtml(entry.distance)}</span>` : ""}
            </div>
          </div>
          <div class="overview-queue-actions">
            ${entry.paidAmount ? `<span class="overview-queue-amount">${escapeHtml(formatMoney(entry.paidAmount))}</span>` : ""}
            <button class="mini-action overview-queue-process" type="button" data-open-entry="${escapeHtml(entry.id)}">處理</button>
            <button class="mini-action" type="button" data-open-notify-entry="${escapeHtml(entry.id)}">通知</button>
          </div>
        </article>
      `;
    }).join("") + (pendingEntries.length > 8
      ? `<button class="ghost-action overview-list-more" type="button" data-open-pending>還有 ${escapeHtml(pendingEntries.length - 8)} 筆待辦</button>`
      : "")
    : '<div class="empty-state">目前沒有待處理項目，可以從左側帶入新賽事，或管理既有人員與報名紀錄。</div>';

  const activeGroups = groupEntriesByRace(state.entries.filter((entry) => entryTimeBucket(entry) === "active"))
    .sort((a, b) => String(a.raceDate || "").localeCompare(String(b.raceDate || "")));
  const hasMoreActiveGroups = activeGroups.length > 6;
  if (els.overviewToggleActiveGroups) {
    els.overviewToggleActiveGroups.hidden = !hasMoreActiveGroups;
    els.overviewToggleActiveGroups.setAttribute("aria-expanded", String(state.overviewShowAllActive));
    const defaultVisibleCount = Math.min(6, activeGroups.length);
    els.overviewToggleActiveGroups.textContent = state.overviewShowAllActive
      ? `收合至 ${defaultVisibleCount} 場・已顯示 ${activeGroups.length}／${activeGroups.length} 場`
      : `展開其餘 ${activeGroups.length - defaultVisibleCount} 場・目前 ${defaultVisibleCount}／${activeGroups.length} 場`;
  }
  els.overviewActiveGroups.innerHTML = activeGroups.length
    ? (state.overviewShowAllActive ? activeGroups : activeGroups.slice(0, 6)).map((group) => {
      const pendingCount = group.entries.filter((entry) => !entry.isRegistered || !entry.isPaid).length;
      return `
        <article class="overview-item ${pendingCount ? "is-pending" : ""}">
          <div class="overview-item-head">
            <div>
              <div class="overview-card-kicker">
                ${overviewStatusTag(pendingCount ? `待處理 ${pendingCount}` : "全部完成", pendingTone(pendingCount))}
              </div>
              <h3>${escapeHtml(group.raceName)}</h3>
              <p>${escapeHtml([group.county, group.location].filter(Boolean).join(" · ") || "地點未填")}</p>
            </div>
            <button class="mini-action" type="button" data-open-group="${escapeHtml(group.key)}">查看</button>
          </div>
          <div class="entry-meta">
            ${group.raceDate ? `<span class="meta-pill">${escapeHtml(group.raceDate)}</span>` : ""}
            ${groupDistanceLabel(group) ? `<span class="meta-pill">${escapeHtml(groupDistanceLabel(group))}</span>` : ""}
            <span class="meta-pill">${escapeHtml(`${group.entries.length} 人`)}</span>
            <span class="meta-pill">${escapeHtml(pendingCount ? `未完成 ${pendingCount}` : "全部完成")}</span>
          </div>
        </article>
      `;
    }).join("")
    : '<div class="empty-state">尚未建立目前賽事報名。</div>';
}

function updateEntriesBulkToolbar() {
  if (!els.entriesBulkToolbar) {
    return;
  }
  const count = state.selectedEntryIds.size;
  els.entriesBulkToolbar.hidden = count === 0;
  const countEl = els.entriesBulkToolbar.querySelector(".bulk-toolbar-count");
  if (countEl) {
    countEl.textContent = `已選 ${count} 筆`;
  }
}

async function bulkDeleteSelectedEntries() {
  const ids = [...state.selectedEntryIds];
  if (!ids.length) {
    return;
  }
  if (!window.confirm(`確定刪除已選的 ${ids.length} 筆報名紀錄？此動作無法復原。`)) {
    return;
  }
  state.entries = state.entries.filter((entry) => !ids.includes(entry.id));
  state.selectedEntryIds.clear();
  await persistAndRender(`已刪除 ${ids.length} 筆報名紀錄`);
}

function isEntriesFilterActive() {
  return Boolean(state.entryQuery)
    || Boolean(state.entryFilterPersonId)
    || state.entryFilterProgress !== "all"
    || Boolean(state.entryFilterStatus)
    || state.entryHistoryYear !== "all";
}

function renderEntriesList() {
  if (els.entriesFilterReset) {
    els.entriesFilterReset.hidden = !isEntriesFilterActive();
  }
  state.selectedEntryIds.forEach((id) => {
    if (!state.entries.some((entry) => entry.id === id)) {
      state.selectedEntryIds.delete(id);
    }
  });
  const summary = historySummary(state.entries);
  els.entriesHistorySummary.hidden = state.entryScope === "active";
  els.entriesHistorySummary.innerHTML = state.entryScope === "active" ? "" : `
    <article class="history-summary-card"><span>歷史總場次</span><strong>${escapeHtml(summary.total)}</strong></article>
    <article class="history-summary-card"><span>歷史已繳費</span><strong>${escapeHtml(summary.paidCount)}</strong></article>
    <article class="history-summary-card"><span>參與年份</span><strong>${escapeHtml(summary.years)}</strong></article>
  `;
  const filteredEntries = state.entries.filter((entry) => {
    if (state.entryScope !== "all" && entryTimeBucket(entry) !== state.entryScope) {
      return false;
    }
    if (state.entryHistoryYear !== "all" && entryYear(entry) !== state.entryHistoryYear) {
      return false;
    }
    if (state.entryFilterPersonId && entry.personId !== state.entryFilterPersonId) {
      return false;
    }
    if (state.entryFilterProgress === "pending" && entry.isRegistered && entry.isPaid) {
      return false;
    }
    if (state.entryFilterProgress === "complete" && (!entry.isRegistered || !entry.isPaid)) {
      return false;
    }
    if (state.entryFilterStatus && normalizeEntryStatusValue(entry.status) !== state.entryFilterStatus) {
      return false;
    }
    if (state.entryQuery && !entrySearchText(entry).includes(state.entryQuery)) {
      return false;
    }
    return true;
  });
  if (!filteredEntries.length) {
    els.entriesList.innerHTML = `<div class="empty-state">${state.entries.length ? "查無符合的報名紀錄" : "尚未建立報名紀錄"}</div>`;
    renderPagination(els.entriesPagination, "entries", { total: 0 });
    [...els.entriesScopeTabs.querySelectorAll("[data-entry-scope]")].forEach((button) => {
      const active = button.dataset.entryScope === state.entryScope;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    updateEntriesBulkToolbar();
    return;
  }

  const peopleById = new Map(state.people.map((person) => [person.id, person]));
  const groupedEntries = groupEntriesByRace(filteredEntries);
  if (state.focusEntryId) {
    const focusGroupIndex = groupedEntries.findIndex((group) => group.entries.some((entry) => entry.id === state.focusEntryId));
    if (focusGroupIndex >= 0) {
      state.entriesPage = Math.floor(focusGroupIndex / ENTRY_GROUP_PAGE_SIZE) + 1;
    }
  }
  const pagination = paginateItems(groupedEntries, state.entriesPage, ENTRY_GROUP_PAGE_SIZE);
  state.entriesPage = pagination.page;
  [...els.entriesScopeTabs.querySelectorAll("[data-entry-scope]")].forEach((button) => {
    button.classList.toggle("active", button.dataset.entryScope === state.entryScope);
  });
  const groupedByYear = pagination.items.reduce((map, group) => {
    const year = entryYear(group.entries[0] || {});
    if (!map.has(year)) {
      map.set(year, []);
    }
    map.get(year).push(group);
    return map;
  }, new Map());
  els.entriesList.innerHTML = [...groupedByYear.entries()].map(([year, groups]) => `
    <section class="entry-year-section">
      ${state.entryScope === "history" || state.entryHistoryYear !== "all" ? `<h3 class="entry-year-title">${escapeHtml(year)} 年</h3>` : ""}
      ${groups.map((group) => {
    const pendingCount = group.entries.filter((entry) => !entry.isRegistered || !entry.isPaid).length;
    const participantLabel = `${group.entries.length} 人`;
    const distanceLabel = groupDistanceLabel(group);
    const focused = state.focusEntryId && group.entries.some((entry) => entry.id === state.focusEntryId);
    return `
      <article class="entry-card ${pendingCount ? "is-pending" : "is-complete"}${focused ? " is-focused" : ""}" id="entry-card-${escapeHtml(group.entries[0]?.id || group.key)}">
        <div class="entry-group-header">
          <div>
            <div class="overview-card-kicker">
              ${overviewStatusTag(pendingCount ? `待處理 ${pendingCount}` : "本組完成", pendingTone(pendingCount))}
            </div>
            <h3>${escapeHtml(group.raceName)}</h3>
            <div class="entry-meta">
              ${group.raceDate ? `<span class="meta-pill">${escapeHtml(group.raceDate)}</span>` : ""}
              ${distanceLabel ? `<span class="meta-pill">${escapeHtml(distanceLabel)}</span>` : ""}
              <span class="meta-pill">${escapeHtml(participantLabel)}</span>
              ${pendingCount ? `<span class="meta-pill">未完成 ${escapeHtml(pendingCount)}</span>` : `<span class="meta-pill">全部完成</span>`}
            </div>
          </div>
        </div>
        <p>${escapeHtml([group.county, group.location].filter(Boolean).join(" · ") || "地點未填")}</p>
        <div class="entry-table-wrap">
          <table class="entry-table">
            <thead>
              <tr><th class="entry-table-check"></th><th>姓名</th><th>距離</th><th>衣服</th><th>報名</th><th>繳費</th><th class="entry-table-actions"></th></tr>
            </thead>
            <tbody>
              ${group.entries.map((entry) => {
                const person = peopleById.get(entry.personId);
                const personName = entry.personName || person?.name || "未指定";
                const isShowingPersonDetails = person && state.entryPersonDetailsEntryId === entry.id;
                return `
                <tr class="${statusClass(entry)}">
                  <td class="entry-table-check"><input type="checkbox" class="entry-select" value="${escapeHtml(entry.id)}" aria-label="選取 ${escapeHtml(personName)} 的報名紀錄"${state.selectedEntryIds.has(entry.id) ? " checked" : ""}></td>
                  <td><strong class="avatar-name">${escapeHtml(personName)}</strong></td>
                  <td>${escapeHtml(entry.distance || "—")}</td>
                  <td>${escapeHtml(entry.shirtSize || "—")}</td>
                  <td><span class="status-dot ${entry.isRegistered ? "is-on" : "is-off"}"></span>${entry.isRegistered ? "是" : "否"}</td>
                  <td><span class="status-dot ${entry.isPaid ? "is-on" : "is-off"}"></span>${entry.isPaid ? "是" : "否"}</td>
                  <td class="entry-table-actions">
                    ${person ? `<button class="mini-action${isShowingPersonDetails ? " is-active" : ""}" type="button" data-show-entry-person-details="${escapeHtml(entry.id)}" aria-expanded="${isShowingPersonDetails ? "true" : "false"}">查看</button>` : ""}
                    <button class="mini-action" type="button" data-edit-entry="${escapeHtml(entry.id)}">編輯</button>
                    <button class="mini-action" type="button" data-delete-entry="${escapeHtml(entry.id)}">刪除</button>
                  </td>
                </tr>
                ${isShowingPersonDetails ? `<tr class="entry-person-details-row"><td colspan="7">${renderEntryPersonDetails(person)}</td></tr>` : ""}
              `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }).join("")}
    </section>
  `).join("");

  els.entriesList.querySelectorAll(".entry-select").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedEntryIds.add(checkbox.value);
      } else {
        state.selectedEntryIds.delete(checkbox.value);
      }
      updateEntriesBulkToolbar();
    });
  });
  els.entriesList.querySelectorAll("[data-edit-entry]").forEach((button) => {
    button.addEventListener("click", () => editEntry(button.dataset.editEntry));
  });
  els.entriesList.querySelectorAll("[data-show-entry-person-details]").forEach((button) => {
    button.addEventListener("click", () => {
      const entryId = button.dataset.showEntryPersonDetails || "";
      state.entryPersonDetailsEntryId = state.entryPersonDetailsEntryId === entryId ? "" : entryId;
      renderEntriesList();
    });
  });
  els.entriesList.querySelectorAll("[data-copy-person-details]").forEach((button) => {
    button.addEventListener("click", () => {
      const person = state.people.find((item) => item.id === button.dataset.copyPersonDetails);
      if (!person) {
        showStatus("找不到這位人員的基本資料。", "error");
        return;
      }
      navigator.clipboard.writeText(personBasicDataText(person))
        .then(() => showStatus(`已複製 ${person.name} 的基本資料`, "success"))
        .catch((error) => showStatus(error.message || "複製基本資料失敗", "error"));
    });
  });
  els.entriesList.querySelectorAll("[data-delete-entry]").forEach((button) => {
    button.addEventListener("click", () => {
      const entryId = button.dataset.deleteEntry;
      const entry = state.entries.find((item) => item.id === entryId);
      const label = entry ? `${entry.raceName}（${entry.raceDate || "未定日期"}）` : "這筆報名紀錄";
      if (!window.confirm(`確定刪除「${label}」的報名紀錄？此動作無法復原。`)) {
        return;
      }
      deleteEntry(entryId).catch((error) => showStatus(error.message || "刪除失敗", "error"));
    });
  });
  renderPagination(els.entriesPagination, "entries", pagination);
  updateEntriesBulkToolbar();
}

function renderAll() {
  renderSummary();
  renderPeopleOptions();
  renderEntryPersonBatch();
  renderRacePicker();
  renderOverview();
  renderPeopleList();
  renderEntriesList();
  renderNotifyPickerLists();
  renderNotifyWorkspace();
  setWorkspaceView(state.workspaceView);
  focusRenderedCard();
}

function focusRenderedCard() {
  const personTarget = state.focusPersonId ? document.getElementById(`person-card-${state.focusPersonId}`) : null;
  const entryTarget = state.focusEntryId
    ? document.querySelector(`.entry-card.is-focused`)
    : null;
  const target = personTarget || entryTarget;
  if (!target) {
    state.focusPersonId = "";
    state.focusEntryId = "";
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    target.classList.remove("is-focused");
  }, 1800);
  state.focusPersonId = "";
  state.focusEntryId = "";
}

function resetPersonForm() {
  els.personForm.reset();
  els.personId.value = "";
}

function resetEntryForm() {
  const defaultStatus = "待報名";
  els.entryForm.reset();
  els.entryId.value = "";
  els.entryStatus.value = defaultStatus;
  state.entryBatchPersonIds = new Set();
  setEntryDistanceOptions(null, "");
  renderEntryPersonBatch();
}

function fillEntryFromRace(race) {
  els.entryId.value = "";
  els.entryRaceName.value = raceName(race);
  els.entryRaceDate.value = String(race.race_date || "").slice(0, 10);
  const defaultDistance = normalizeArray(race.distances).map((value) => normalizeDistanceValue(value)).find(Boolean) || "";
  setEntryDistanceOptions(race, defaultDistance);
  els.entryCounty.value = raceCounty(race);
  els.entryLocation.value = raceLocation(race);
  els.entryRegistrationUrl.value = race.registration_link || "";
  els.entryRegistrationOpensAt.value = String(race.registration_opens_at || "").slice(0, 10);
  els.entryRegistrationDeadline.value = String(race.registration_deadline || "").slice(0, 10);
  els.entryStatus.value = normalizeEntryStatusValue(workspaceRaceStatus(race));
  const person = selectedPerson();
  els.entryShirtSize.value = person?.defaultShirtSize || "";
  showStatus(`已帶入 ${raceName(race)} 的基本資料`, "success");
}

function editPerson(personId) {
  const person = state.people.find((item) => item.id === personId);
  if (!person) {
    return;
  }
  els.personId.value = person.id;
  els.personName.value = person.name || "";
  els.personGender.value = person.gender || "";
  els.personPhone.value = person.phone || "";
  els.personBirthday.value = person.birthday || "";
  els.personNationalId.value = person.nationalId || person.idSuffix || "";
  els.personShirtSize.value = person.defaultShirtSize || "";
  els.personEmergencyName.value = person.emergencyName || "";
  els.personEmergencyRelationship.value = person.emergencyRelationship || "";
  els.personEmergencyPhone.value = person.emergencyPhone || "";
  setWorkspaceView("people");
  els.personForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function editEntry(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }
  state.entryScope = entryTimeBucket(entry);
  state.entryBatchPersonIds = new Set([entry.personId]);
  const matchedRace = raceByNameAndDate(entry.raceName, entry.raceDate);
  setEntryDistanceOptions(matchedRace, entry.distance || "");
  els.entryId.value = entry.id;
  els.entryRaceName.value = entry.raceName || "";
  els.entryPersonId.value = entry.personId || "";
  els.entryRaceDate.value = entry.raceDate || "";
  els.entryDistance.value = entry.distance || "";
  els.entryCounty.value = entry.county || "";
  els.entryLocation.value = entry.location || "";
  els.entryRegistrationUrl.value = entry.registrationUrl || "";
  els.entryRegistrationOpensAt.value = entry.registrationOpensAt || "";
  els.entryRegistrationDeadline.value = entry.registrationDeadline || "";
  els.entryShirtSize.value = entry.shirtSize || "";
  els.entryStatus.value = normalizeEntryStatusValue(entry.status);
  els.entryIsRegistered.checked = Boolean(entry.isRegistered);
  els.entryIsPaid.checked = Boolean(entry.isPaid);
  els.entryRegistrationDate.value = entry.registrationDate || "";
  els.entryPaidAmount.value = entry.paidAmount ?? "";
  els.entryPaymentDate.value = entry.paymentDate || "";
  els.entryPaymentMethod.value = entry.paymentMethod || "";
  els.entryOrderCode.value = entry.orderCode || "";
  els.entryTransferLastFive.value = entry.transferLastFive || "";
  els.entryNotes.value = entry.notes || "";
  renderEntryPersonBatch();
  setWorkspaceView("entries");
  showStatus(`正在編輯 ${entry.raceName}`, "success");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deletePerson(personId) {
  if (state.entries.some((entry) => entry.personId === personId)) {
    showStatus("這位人員還有報名紀錄，請先刪除相關紀錄。", "error");
    return;
  }
  state.people = state.people.filter((person) => person.id !== personId);
  await persistAndRender("已刪除人員");
}

async function deleteEntry(entryId) {
  state.entries = state.entries.filter((entry) => entry.id !== entryId);
  await persistAndRender("已刪除報名紀錄");
}

function showStatus(message, kind = "success") {
  els.entryStatusMessage.textContent = message;
  els.entryStatusMessage.className = `status-message ${kind}`;
  showToast(message, kind);
}

function showNotifyStatus(message, kind = "success") {
  if (els.notifyStatusMessage) {
    window.clearTimeout(notifyStatusClearTimer);
    els.notifyStatusMessage.textContent = message;
    els.notifyStatusMessage.className = `status-message ${kind}`;
    notifyStatusClearTimer = window.setTimeout(() => {
      els.notifyStatusMessage.textContent = "";
      els.notifyStatusMessage.className = "status-message";
    }, 3500);
  }
  showToast(message, kind);
}

async function persistAndRender(message) {
  state.people.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  state.entries.sort((a, b) => String(a.raceDate || "").localeCompare(String(b.raceDate || "")) || String(a.raceName || "").localeCompare(String(b.raceName || "")));
  await savePrivateData();
  renderAll();
  updateLastSavedIndicator();
  showStatus(message, "success");
}

function collectPersonForm() {
  return {
    id: els.personId.value || createId("person"),
    name: els.personName.value.trim(),
    gender: els.personGender.value,
    phone: els.personPhone.value.trim(),
    birthday: els.personBirthday.value,
    nationalId: els.personNationalId.value.trim(),
    defaultShirtSize: els.personShirtSize.value,
    emergencyName: els.personEmergencyName.value.trim(),
    emergencyRelationship: els.personEmergencyRelationship.value.trim(),
    emergencyPhone: els.personEmergencyPhone.value.trim(),
  };
}

function missingPersonFields(person) {
  const required = [
    ["姓名", person.name],
    ["性別", person.gender],
    ["衣服尺寸", person.defaultShirtSize],
    ["手機", person.phone],
    ["身分證號碼", person.nationalId],
    ["出生年月日", person.birthday],
    ["緊急聯絡人", person.emergencyName],
    ["關係", person.emergencyRelationship],
    ["緊急聯絡人手機", person.emergencyPhone],
  ];
  return required.filter(([, value]) => !String(value || "").trim()).map(([label]) => label);
}

function collectEntryDraft() {
  return {
    id: els.entryId.value || createId("entry"),
    raceName: els.entryRaceName.value.trim(),
    raceDate: els.entryRaceDate.value,
    distance: normalizeDistanceValue(els.entryDistance.value),
    county: els.entryCounty.value.trim(),
    location: els.entryLocation.value.trim(),
    registrationUrl: els.entryRegistrationUrl.value.trim(),
    registrationOpensAt: els.entryRegistrationOpensAt.value,
    registrationDeadline: els.entryRegistrationDeadline.value,
    shirtSize: els.entryShirtSize.value,
    status: normalizeEntryStatusValue(els.entryStatus.value),
    isRegistered: els.entryIsRegistered.checked,
    isPaid: els.entryIsPaid.checked,
    registrationDate: els.entryRegistrationDate.value,
    paidAmount: els.entryPaidAmount.value ? Number(els.entryPaidAmount.value) : null,
    paymentDate: els.entryPaymentDate.value,
    paymentMethod: els.entryPaymentMethod.value,
    orderCode: els.entryOrderCode.value.trim(),
    transferLastFive: els.entryTransferLastFive.value.trim(),
    notes: els.entryNotes.value.trim(),
    updatedAt: new Date().toISOString(),
  };
}

function selectedEntryPersonIds() {
  if (els.entryId.value) {
    return els.entryPersonId.value ? [els.entryPersonId.value] : [];
  }
  if (state.entryBatchPersonIds.size) {
    return [...state.entryBatchPersonIds];
  }
  return els.entryPersonId.value ? [els.entryPersonId.value] : [];
}

function applyRaceSearch() {
  const query = els.raceSearch.value.trim().toLowerCase();
  state.filteredRaces = state.races.filter((race) => {
    if (!isSelectableRace(race)) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      raceName(race),
      raceCounty(race),
      raceLocation(race),
      dedupeRaceDistances(race),
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
  renderRacePicker();
  renderOverview();
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(currentPayload(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `報名管理備份-${todayString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showStatus("已下載備份檔", "success");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function responseMessage(response, fallback) {
  const body = await response.json().catch(() => null);
  if (body?.message) return body.message;
  const text = await response.text().catch(() => "");
  return text || fallback;
}

function renderBatchImportPreview() {
  if (!els.batchImportPreview) return;
  const batchImport = state.batchImport;
  if (!batchImport) {
    els.batchImportPreview.hidden = true;
    els.batchImportPreview.innerHTML = "";
    return;
  }
  if (batchImport.errors?.length) {
    els.batchImportPreview.hidden = false;
    els.batchImportPreview.className = "batch-import-preview is-error";
    els.batchImportPreview.innerHTML = `
      <strong>Excel 尚未匯入：請先修正 ${escapeHtml(batchImport.errors.length)} 個問題</strong>
      <ul>${batchImport.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>
      <button type="button" class="ghost-action" data-dismiss-batch-preview>關閉</button>
    `;
    return;
  }
  const { people, entries } = batchImport.summary;
  els.batchImportPreview.hidden = false;
  els.batchImportPreview.className = "batch-import-preview";
  els.batchImportPreview.innerHTML = `
    <div class="batch-import-preview-copy">
      <strong>Excel 已完成預檢，尚未寫入資料</strong>
      <span>確認後會一次套用，並自動備份目前資料。</span>
    </div>
    <div class="batch-import-summary">
      <span>團員：新增 ${escapeHtml(people.create)}／更新 ${escapeHtml(people.update)}／刪除 ${escapeHtml(people.delete)}</span>
      <span>報名：新增 ${escapeHtml(entries.create)}／更新 ${escapeHtml(entries.update)}／刪除 ${escapeHtml(entries.delete)}</span>
    </div>
    <div class="batch-import-actions">
      <button type="button" class="primary-action" data-apply-batch-import>確認套用 Excel</button>
      <button type="button" class="ghost-action" data-dismiss-batch-preview>取消</button>
    </div>
  `;
}

async function downloadBatchWorkbook() {
  const response = await fetch("/api/registration-batch.xlsx", { cache: "no-cache" });
  if (!response.ok) throw new Error(await responseMessage(response, "Excel 匯出失敗"));
  downloadBlob(await response.blob(), `報名管理批次編輯-${todayString()}.xlsx`);
}

async function previewBatchImport(file) {
  if (!file) return;
  const response = await fetch("/api/registration-batch/preview", {
    method: "POST",
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    body: file,
  });
  const body = await response.json().catch(() => null);
  if (response.status === 422) {
    state.batchImport = { errors: body?.errors || [body?.message || "Excel 格式需要修正。"] };
    renderBatchImportPreview();
    return;
  }
  if (!response.ok) throw new Error(body?.message || "Excel 預檢失敗");
  state.batchImport = { previewToken: body.previewToken, summary: body.summary };
  renderBatchImportPreview();
}

async function applyBatchImport() {
  if (!state.batchImport?.previewToken) return;
  const response = await fetch("/api/registration-batch/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ previewToken: state.batchImport.previewToken }),
  });
  if (!response.ok) throw new Error(await responseMessage(response, "Excel 匯入失敗"));
  await loadPrivateData();
  state.batchImport = null;
  renderAll();
  renderBatchImportPreview();
  resetPersonForm();
  resetEntryForm();
  showStatus("已完成 Excel 批次匯入，原資料已自動備份", "success");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFilenamePart(value) {
  return String(value || "未命名賽事").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
}

function phoneLastThree(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.slice(-3).padStart(Math.min(3, digits.length), "*") : "";
}

function paymentReminderStatus(entry) {
  if (entry.isPaid) {
    return "已繳費";
  }
  if (entry.isRegistered) {
    return "待確認";
  }
  return "尚未報名";
}

function paymentExportRows(entries) {
  const peopleById = new Map(state.people.map((person) => [person.id, person]));
  const headers = [
    "繳費狀態",
    "日期",
    "賽事名稱",
    "距離/組別",
    "地點",
    "姓名",
    "性別",
    "衣服尺寸",
    "手機末三碼",
    "是否報名",
    "是否繳費",
    "目前狀態",
    "報名日期",
    "繳費金額",
    "繳費日期",
    "付款方式",
    "訂單編號",
    "匯款後五碼",
    "備註",
    "緊急聯絡人",
    "關係",
    "緊急聯絡人手機",
  ];
  const rows = entries.map((entry) => {
    const person = peopleById.get(entry.personId) || {};
    return [
      paymentReminderStatus(entry),
      entry.raceDate,
      entry.raceName,
      entry.distance,
      [entry.county, entry.location].filter(Boolean).join(" · "),
      entry.personName || person.name,
      person.gender,
      entry.shirtSize || person.defaultShirtSize,
      phoneLastThree(person.phone),
      entry.isRegistered ? "是" : "否",
      entry.isPaid ? "是" : "否",
      entry.status,
      entry.registrationDate,
      entry.paidAmount ?? "",
      entry.paymentDate,
      entry.paymentMethod,
      entry.orderCode,
      entry.transferLastFive,
      entry.notes,
      person.emergencyName,
      person.emergencyRelationship,
      person.emergencyPhone,
    ];
  });
  return [headers].concat(rows).map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function paymentHtmlRows(entries) {
  const peopleById = new Map(state.people.map((person) => [person.id, person]));
  return entries.map((entry, index) => {
    const person = peopleById.get(entry.personId) || {};
    const status = paymentReminderStatus(entry);
    const statusClassName = entry.isPaid ? "paid" : entry.isRegistered ? "due" : "not-registered";
    const paymentInfo = entry.isPaid
      ? [entry.paymentMethod || "付款方式待補", entry.transferLastFive ? `末五碼 ${entry.transferLastFive}` : ""].filter(Boolean).join(" · ")
      : entry.isRegistered ? "完成繳費後補登" : "完成報名後確認";
    return `
      <tr class="${statusClassName}">
        <td>${index + 1}</td>
        <td class="person-cell"><strong>${escapeHtml(entry.personName || person.name || "")}</strong><small>手機末三碼 ${escapeHtml(phoneLastThree(person.phone) || "—")}</small></td>
        <td><strong>${escapeHtml(entry.distance || "—")}</strong></td>
        <td>${escapeHtml(entry.shirtSize || person.defaultShirtSize || "")}</td>
        <td class="status-cell"><span class="status-chip">${escapeHtml(status)}</span><small>${escapeHtml(entry.isPaid ? "已完成繳費" : entry.isRegistered ? "待繳此筆費用" : "尚未建立報名")}</small></td>
        <td class="amount-cell">${escapeHtml(entry.paidAmount ? formatMoney(entry.paidAmount) : "—")}</td>
        <td class="payment-cell">${escapeHtml(paymentInfo)}</td>
        <td class="notes-cell">${escapeHtml(entry.notes || "—")}</td>
      </tr>
    `;
  }).join("");
}

function buildPaymentReminderHtml(race, entries) {
  const registeredCount = entries.filter((entry) => entry.isRegistered).length;
  const unpaidCount = entries.filter((entry) => entry.isRegistered && !entry.isPaid).length;
  const paidCount = entries.filter((entry) => entry.isPaid).length;
  const raceDate = String(race.race_date || entries[0]?.raceDate || "日期待補").slice(0, 10);
  const title = `${raceName(race)} 報名繳費確認表`;
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color: #18372d;
      background: #f5efe2;
      font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: linear-gradient(180deg, #f7f5ef, #efe9df);
      padding: 22px;
    }
    main {
      max-width: 1280px;
      margin: 0 auto;
      background: rgba(255, 253, 247, .96);
      border: 1px solid rgba(24, 55, 45, .14);
      border-radius: 24px;
      box-shadow: 0 18px 42px rgba(41, 51, 31, .09);
      padding: 26px;
    }
    .header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      margin-bottom: 18px;
    }
    .eyebrow {
      margin: 0 0 7px;
      color: #0d6245;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: clamp(27px, 3.2vw, 44px);
      line-height: 1.16;
      letter-spacing: -.035em;
      color: #102920;
    }
    .subtitle {
      margin: 9px 0 0;
      color: #51685d;
      font-size: 15px;
      line-height: 1.55;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 14px 0 18px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      background: #dff2e2;
      color: #145d43;
      font-weight: 800;
      padding: 7px 11px;
      font-size: 13px;
    }
    .stamp {
      min-width: 136px;
      border: 1px solid rgba(13, 98, 69, .16);
      border-radius: 16px;
      background: #eef8ef;
      color: #0d6245;
      padding: 13px 15px;
      text-align: center;
    }
    .stamp span {
      display: block;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .stamp strong {
      display: block;
      margin-top: 6px;
      font-size: 19px;
      line-height: 1;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .summary article {
      border: 1px solid rgba(24, 55, 45, .12);
      border-radius: 14px;
      background: #fbfaf6;
      padding: 12px 14px;
    }
    .summary span {
      display: block;
      color: #587065;
      font-weight: 700;
      margin-bottom: 5px;
      font-size: 13px;
    }
    .summary strong {
      display: block;
      color: #073b2b;
      font-size: 29px;
      line-height: 1;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      overflow: hidden;
      border: 1px solid rgba(24, 55, 45, .14);
      border-radius: 16px;
      background: #fffdf8;
    }
    th, td {
      border-bottom: 1px solid rgba(24, 55, 45, .1);
      padding: 12px 11px;
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }
    th {
      position: sticky;
      top: 0;
      background: #145d43;
      color: #fff;
      font-weight: 900;
      white-space: nowrap;
    }
    tr:last-child td { border-bottom: 0; }
    tbody tr:nth-child(even) td { background: #fcfbf7; }
    .person-cell strong {
      display: inline-flex;
      color: #123e30;
    }
    .person-cell small, .status-cell small {
      display: block;
      margin-top: 4px;
      color: #718078;
      font-size: 12px;
    }
    .status-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 5px 8px;
      background: #eef3f0;
      color: #386052;
      font-size: 12px;
      font-weight: 900;
    }
    tr.due .status-chip { background: #fff1d7; color: #9a5900; }
    tr.not-registered .status-chip { background: #f1efea; color: #64736c; }
    tr.paid .status-chip { background: #e5f3e8; color: #176246; }
    .amount-cell { color: #0d5a41; font-weight: 900; white-space: nowrap; }
    .payment-cell, .notes-cell { color: #5c6d64; }
    .notes-cell { max-width: 180px; }
    td strong {
      font-weight: 900;
    }
    .note {
      margin: 18px 0 0;
      color: #60736a;
      font-size: 13px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      main { box-shadow: none; border-radius: 0; }
      th { position: static; }
    }
  </style>
</head>
<body>
  <main>
    <header class="header">
      <div>
        <p class="eyebrow">Registration Payment Check</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">供隊內核對報名與繳費狀態使用，手機僅顯示末三碼。</p>
      </div>
      <aside class="stamp">
        <span>Generated</span>
        <strong>${escapeHtml(todayString())}</strong>
      </aside>
    </header>
    <div class="meta">
      <span class="pill">賽事日期 ${escapeHtml(raceDate)}</span>
      <span class="pill">${escapeHtml(formatRaceLocation(race) || [entries[0]?.county, entries[0]?.location].filter(Boolean).join(" · ") || "地點待補")}</span>
    </div>
    <section class="summary" aria-label="繳費確認摘要">
      <article><span>總筆數</span><strong>${entries.length}</strong></article>
      <article><span>已報名</span><strong>${registeredCount}</strong></article>
      <article><span>待繳費</span><strong>${unpaidCount}</strong></article>
      <article><span>已繳費</span><strong>${paidCount}</strong></article>
    </section>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>報名者</th>
          <th>距離</th>
          <th>衣服</th>
          <th>目前進度</th>
          <th>金額</th>
          <th>付款資訊</th>
          <th>備註</th>
        </tr>
      </thead>
      <tbody>${paymentHtmlRows(entries)}</tbody>
    </table>
    <p class="note">此檔案由本機報名管理產生，僅供隊內報名與繳費核對使用。</p>
  </main>
</body>
</html>`;
}

function buildNotifyPreviewHtml(groups, title = "通知卡片預覽") {
  const singlePersonMode = groups.length === 1;
  const totalEntries = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const totalPending = groups.reduce((sum, group) => sum + group.pendingCount, 0);
  const totalUnpaid = groups.reduce((sum, group) => sum + group.unpaidAmount, 0);
  const uniqueRaceCount = new Set(groups.flatMap((group) => group.entries.map((entry) => notifyRaceKey(entry)))).size;
  const totalRegistered = groups.reduce((sum, group) => sum + group.registeredCount, 0);
  const registeredCoverage = totalEntries ? Math.round((totalRegistered / totalEntries) * 100) : 0;
  const exportLabel = groups.length === 1 ? "匯出通知 PNG" : "匯出總表 PNG";

  function entryPresentation(entry) {
    const rawStatus = String(entry.status || "").trim();
    const knownStatuses = new Set(["", "報名中", "可報名", "未開始", "尚未開報", "待確認", "已報名未繳費", "已完成", "已截止", "停辦", "停賽", "取消", "待報名"]);
    const registration = entry.isRegistered ? "已完成報名" : isClosedRaceStatus(rawStatus) ? "已截止" : "待報名";
    const payment = entry.isPaid ? "已繳費" : entry.isRegistered ? "待繳費" : "尚未繳費";
    const amount = paymentAmountPresentation(entry.paidAmount, entry.isPaid);
    const registrationTone = registration === "已完成報名" ? "is-positive" : registration === "已截止" ? "is-neutral" : "is-warning";
    const paymentTone = payment === "已繳費" ? "is-positive" : payment === "待繳費" ? "is-warning" : "is-neutral";
    const stateText = !knownStatuses.has(rawStatus) ? "狀態待確認" : normalizeEntryStatusValue(rawStatus);
    const stateTone = !knownStatuses.has(rawStatus) ? "is-warning" : isClosedRaceStatus(stateText) ? "is-neutral" : "is-muted";
    const dataIssue = (entry.isPaid && !entry.isRegistered) || !knownStatuses.has(rawStatus);
    return { registration, payment, amount, registrationTone, paymentTone, stateText, stateTone, dataIssue };
  }

  const previewSections = groups.map((group) => {
    const statusLabel = group.pendingCount ? `待處理 ${group.pendingCount}` : "已完成";
    const statusTone = group.pendingCount ? "pending" : "complete";
    const amountHint = group.unpaidAmount ? "依未繳費項目合計" : "目前無待收項目";
    const message = group.pendingCount
      ? `${group.name || "參與者"} 您好，以下為目前需要核對的報名與繳費項目。若需補件或修正，請依原有聯繫流程回覆。`
      : `${group.name || "參與者"} 您好，目前列出的報名與繳費紀錄已整理完成。`;
    const rangeLabel = notifyRangeLabel(group);
    const pendingRegistration = group.entries.filter((entry) => !entry.isRegistered && !isClosedRaceStatus(entry.status)).length;
    const pendingPayment = group.entries.filter((entry) => entry.isRegistered && !entry.isPaid).length;
    return `
      <section class="preview-person-section">
        <article class="participant-summary-card">
          <div class="participant-profile">
            <div class="preview-avatar">${escapeHtml((group.name || "?").slice(0, 1))}</div>
            <div class="participant-profile-copy">
              <div class="participant-title-row"><h3>${escapeHtml(group.name || "姓名待補")}</h3><span class="status-badge ${statusTone === "pending" ? "is-warning" : "is-positive"}">${escapeHtml(statusLabel)}</span></div>
              <dl class="participant-meta">
                <div><dt>衣服尺寸</dt><dd>${escapeHtml(group.defaultShirtSize || "未填")}</dd></div>
                <div><dt>手機</dt><dd>${escapeHtml(maskedPhone(group.phone) || "未填")}</dd></div>
              </dl>
            </div>
          </div>
          <div class="participant-progress">
            <div class="progress-kpi"><span>已完成報名數</span><strong>${escapeHtml(`${group.registeredCount} / ${group.entries.length}`)}</strong></div>
            <div class="progress-kpi"><span>待處理數</span><strong>${escapeHtml(`${group.pendingCount} 筆`)}</strong></div>
            <div class="progress-kpi progress-kpi-range"><span>活動日期區間</span><strong>${escapeHtml(rangeLabel)}</strong></div>
            <p class="participant-message">${escapeHtml(message)}</p>
          </div>
          <aside class="participant-amount">
            <span>待收總金額</span><strong>${escapeHtml(formatMoney(group.unpaidAmount))}</strong><small>${escapeHtml(amountHint)}</small>
          </aside>
        </article>
        <nav class="preview-status-filter" aria-label="目前賽事狀態範圍">
          <span class="filter-label">目前篩選</span>
          <span class="filter-item is-active">全部 ${group.entries.length}</span>
          <span class="filter-item">待報名 ${pendingRegistration}</span>
          <span class="filter-item">待繳費 ${pendingPayment}</span>
          <span class="filter-item">已完成 ${group.entries.filter((entry) => entry.isPaid).length}</span>
        </nav>
        <section class="preview-person-body" aria-label="賽事清單">
          <div class="list-heading"><h4>賽事清單</h4><span>${group.entries.length} 筆紀錄</span></div>
          <div class="preview-entry-list">
            ${group.entries.map((entry) => {
              const item = entryPresentation(entry);
              const entryDate = escapeHtml(formatNotifyRangeDate(String(entry.raceDate || "").slice(0, 10)) || "日期待補");
              const locationLabel = [entry.county, entry.location].filter(Boolean).join(" · ") || "地點待補";
              const noteLabel = entry.notes || "無補充說明";
              return `
                <article class="preview-entry-card ${statusClass(entry)}${item.dataIssue ? " has-data-issue" : ""}">
                  <div class="preview-entry-date">
                    <span>${entryDate}</span>
                    <small>${escapeHtml(entry.distance || "未分組")}</small>
                  </div>
                  <div class="preview-entry-main">
                    <h5>${escapeHtml(entry.raceName || "未命名賽事")}</h5>
                    <p class="entry-location"><span>地點</span>${escapeHtml(locationLabel)}</p>
                    <p class="entry-note"><span>備註</span>${escapeHtml(noteLabel)}</p>
                  </div>
                  <div class="preview-entry-status">
                    <span class="status-badge ${item.registrationTone}">${escapeHtml(item.registration)}</span>
                    <span class="status-badge ${item.paymentTone}">${escapeHtml(item.payment)}</span>
                    <span class="status-badge ${item.stateTone}">${escapeHtml(item.stateText)}</span>
                  </div>
                  <div class="preview-entry-amount ${item.amount.isMissing ? "is-missing" : ""}">
                    <strong>${escapeHtml(item.amount.label)}</strong><small>${escapeHtml(item.amount.hint)}</small>
                  </div>
                </article>
              `;
            }).join("")}
          </section>
        </div>
      </section>
    `;
  }).join("");
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --primary: #0f4c3a;
      --primary-dark: #17332c;
      --primary-soft: #eaf3ef;
      --warning: #a76500;
      --warning-soft: #fff5df;
      --text-main: #17332c;
      --text-muted: #66736f;
      --border: #dce5e1;
      --page-bg: #f4f7f6;
      --card-bg: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", Arial, sans-serif;
      color: var(--text-main);
      background: var(--page-bg);
      padding: 24px 24px 112px;
    }
    main { width: min(1400px, 100%); margin: 0 auto; }
    .utility-bar {
      position: fixed; z-index: 10; left: 0; right: 0; bottom: 0;
      display: flex; justify-content: flex-end; align-items: center; gap: 12px;
      padding: 12px max(24px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
      border-top: 1px solid var(--border); background: rgba(255, 255, 255, .98);
    }
    .utility-actions button {
      border-radius: 8px; min-height: 40px; padding: 0 16px;
      font: inherit;
      font-size: 14px; font-weight: 600;
      cursor: pointer;
    }
    .utility-actions button.primary {
      background: var(--primary);
      color: white;
    }
    .utility-actions button.secondary {
      background: #fff;
      color: var(--primary);
      border: 1px solid var(--border);
    }
    .hero {
      border: 1px solid var(--border); border-radius: 12px; background: var(--card-bg);
      padding: 20px; margin-bottom: 16px;
    }
    .hero p, .hero h1, .hero small { margin: 0; }
    .hero p { font-size: 12px; color: var(--primary); font-weight: 600; }
    .hero h1 { font-size: 26px; line-height: 1.3; margin-top: 6px; color: var(--primary-dark); }
    .hero small { display: block; margin-top: 6px; color: var(--text-muted); font-size: 13px; }
    .hero-stats {
      display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-top: 16px;
    }
    .hero-stat {
      border-radius: 8px; background: #f8faf9; border: 1px solid var(--border); padding: 12px;
    }
    .hero-stat span {
      display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; font-weight: 500;
    }
    .hero-stat strong {
      display: block; font-size: 22px; line-height: 1.2; color: var(--primary-dark);
    }
    .report-sheet {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px;
    }
    .sheet-head {
      display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px;
      border-bottom: 1px solid var(--border);
    }
    .sheet-head h2 { margin: 0; font-size: 17px; font-weight: 600; color: var(--primary-dark); }
    .sheet-head p { margin: 4px 0 0; color: var(--text-muted); font-size: 13px; }
    .sheet-badge {
      display: inline-flex; align-items: center; justify-content: center; min-height: 34px; padding: 0 12px;
      border-radius: 999px; background: #f8faf9; border: 1px solid var(--border); color: var(--primary); font-weight: 600; font-size: 12px; white-space: nowrap;
    }
    .preview-person-section { padding: 20px; }
    .preview-person-section + .preview-person-section { border-top: 1px solid var(--border); }
    .participant-summary-card { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; padding: 20px; border: 1px solid var(--border); border-radius: 12px; }
    .participant-profile { grid-column: span 4; display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
    .preview-avatar {
      width: 56px; height: 56px; border-radius: 12px; display: grid; place-items: center; background: var(--primary); color: white; font-size: 24px; font-weight: 700; flex: 0 0 auto;
    }
    .participant-profile-copy { min-width: 0; }
    .participant-title-row { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; }
    .participant-title-row h3 { margin: 0; font-size: 24px; line-height: 1.25; font-weight: 700; color: var(--primary-dark); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .participant-meta { display: flex; gap: 20px; margin: 14px 0 0; }
    .participant-meta dt, .progress-kpi span, .participant-amount > span { color: var(--text-muted); font-size: 12px; font-weight: 500; }
    .participant-meta dd { margin: 4px 0 0; color: var(--text-main); font-size: 14px; }
    .participant-progress { grid-column: span 5; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .progress-kpi { padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: #fafcfb; }
    .progress-kpi strong { display: block; margin-top: 6px; color: var(--primary-dark); font-size: 18px; line-height: 1.3; }
    .progress-kpi-range { grid-column: 1 / -1; }
    .participant-message { grid-column: 1 / -1; margin: 0; padding: 10px 12px; border-left: 3px solid #d7a84b; background: #fffaf1; color: #6b604e; font-size: 13px; line-height: 1.55; }
    .participant-amount { grid-column: span 3; padding: 18px; border: 1px solid var(--border); border-radius: 8px; background: #f0f7f3; display: flex; flex-direction: column; justify-content: center; }
    .participant-amount strong { margin-top: 8px; color: var(--primary); font-size: 30px; line-height: 1.1; font-weight: 700; white-space: nowrap; }
    .participant-amount small { margin-top: 8px; color: var(--text-muted); font-size: 13px; }
    .status-badge { display: inline-flex; width: max-content; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 500; line-height: 1.25; }
    .status-badge.is-positive { background: var(--primary-soft); color: var(--primary); }
    .status-badge.is-warning { background: var(--warning-soft); color: var(--warning); }
    .status-badge.is-neutral, .status-badge.is-muted { background: #f0f3f2; color: #586762; }
    .preview-status-filter { display: flex; gap: 8px; overflow-x: auto; padding: 16px 0; scrollbar-width: thin; }
    .filter-label { display: inline-flex; align-items: center; color: var(--text-muted); font-size: 13px; white-space: nowrap; }
    .filter-item { display: inline-flex; align-items: center; min-height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: 999px; color: var(--text-muted); background: #fff; white-space: nowrap; font-size: 12px; }
    .filter-item.is-active { border-color: var(--primary); color: #fff; background: var(--primary); }
    .preview-person-body { display: grid; gap: 12px; }
    .list-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .list-heading h4 { margin: 0; font-size: 17px; font-weight: 600; }
    .list-heading span { color: var(--text-muted); font-size: 13px; }
    .preview-entry-list { display: grid; gap: 10px; }
    .preview-entry-card {
      min-height: 104px; display: grid; grid-template-columns: 84px minmax(0, 1fr) 160px 160px; align-items: stretch;
      border: 1px solid var(--border); border-radius: 12px; background: var(--card-bg); overflow: hidden;
    }
    .preview-entry-card.has-data-issue { border-color: #e7c878; }
    .preview-entry-date {
      padding: 16px; border-right: 1px solid var(--border); display: grid; align-content: start; gap: 6px; background: #fafcfb;
    }
    .preview-entry-date span {
      display: block; color: var(--primary-dark); font-size: 15px; font-weight: 600;
    }
    .preview-entry-date small {
      display: block; color: var(--text-muted); font-size: 13px; font-weight: 500;
    }
    .preview-entry-main {
      display: grid; align-content: center; gap: 6px; padding: 14px 18px; min-width: 0;
    }
    .preview-entry-main h5 { margin: 0; color: var(--primary-dark); font-size: 15px; font-weight: 600; line-height: 1.4; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .entry-location, .entry-note { margin: 0; color: var(--text-muted); font-size: 13px; line-height: 1.4; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .entry-location span, .entry-note span { display: inline; margin-right: 6px; color: #55645f; font-weight: 600; }
    .preview-entry-status { border-left: 1px solid var(--border); padding: 14px; display: flex; align-content: center; justify-content: center; flex-direction: column; gap: 6px; }
    .preview-entry-amount { border-left: 1px solid var(--border); padding: 14px; display: grid; align-content: center; justify-items: end; text-align: right; background: #fafcfb; }
    .preview-entry-amount strong { color: var(--primary); font-size: 16px; font-weight: 700; white-space: nowrap; }
    .preview-entry-amount.is-missing strong { color: var(--warning); }
    .preview-entry-amount small { margin-top: 6px; color: var(--text-muted); font-size: 12px; }
    @media (max-width: 1199px) {
      .hero-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .participant-summary-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .participant-profile, .participant-progress, .participant-amount { grid-column: auto; }
      .participant-profile { grid-row: span 2; }
      .participant-amount { grid-column: span 2; }
    }
    @media (max-width: 767px) {
      body { padding: 16px 16px 108px; }
      .utility-bar { justify-content: stretch; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
      .utility-actions { display: grid; grid-template-columns: 1fr 1fr; width: 100%; gap: 8px; }
      .utility-actions button { width: 100%; }
      .hero, .sheet-head, .preview-person-section { padding: 16px; }
      .hero-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sheet-head { flex-direction: column; align-items: flex-start; }
      .participant-summary-card { grid-template-columns: 1fr; padding: 16px; }
      .participant-profile, .participant-progress, .participant-amount { grid-column: auto; grid-row: auto; }
      .participant-progress { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .progress-kpi-range, .participant-message { grid-column: 1 / -1; }
      .participant-amount { min-height: 132px; }
      .preview-entry-card { grid-template-columns: 1fr; min-height: 0; }
      .preview-entry-date, .preview-entry-status, .preview-entry-amount { border: 0; border-bottom: 1px solid var(--border); }
      .preview-entry-date { grid-template-columns: 1fr auto; align-items: baseline; }
      .preview-entry-status { flex-direction: row; flex-wrap: wrap; justify-content: flex-start; }
      .preview-entry-amount { justify-items: start; text-align: left; border-bottom: 0; }
    }
    @media (max-width: 479px) {
      .hero h1 { font-size: 23px; }
      .hero-stats, .participant-progress { grid-template-columns: 1fr; }
      .progress-kpi-range, .participant-message { grid-column: auto; }
    }
    @media print {
      body { background: white; padding: 0; }
      .utility-bar { display: none; }
      .preview-person-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <div class="utility-bar">
      <div class="utility-actions"><button class="secondary" type="button" data-print-report>列印 / 另存 PDF</button><button class="primary" type="button" data-export-image>${escapeHtml(exportLabel)}</button></div>
      <div class="utility-status" data-export-status></div>
    </div>
    <header class="hero">
      <p>報名管理 · 通知確認</p>
      <h1>${escapeHtml(title)}</h1>
      <small>產生時間：${escapeHtml(todayString())} · 已報名覆蓋率 ${registeredCoverage}%</small>
      <section class="hero-stats" aria-label="通知摘要">
        <article class="hero-stat"><span>參與者</span><strong>${groups.length}</strong></article>
        <article class="hero-stat"><span>賽事數</span><strong>${uniqueRaceCount}</strong></article>
        <article class="hero-stat"><span>報名紀錄</span><strong>${totalEntries}</strong></article>
        <article class="hero-stat"><span>待處理</span><strong>${totalPending}</strong></article>
        <article class="hero-stat"><span>待收總額</span><strong>${escapeHtml(formatMoney(totalUnpaid))}</strong></article>
      </section>
    </header>
    <section class="report-sheet report-export-root ${singlePersonMode ? "is-single" : "is-multi"}" data-export-root>
      <div class="sheet-head">
        <div>
          <h2>${singlePersonMode ? "報名與繳費確認" : "通知總表"}</h2>
          <p>${singlePersonMode ? "依既有報名資料整理，金額與狀態均保留原始計算結果。" : "以人員為主軸整理待辦與費用，方便逐一核對。"}</p>
        </div>
        <div class="sheet-badge">${groups.length} 人 / ${totalEntries} 筆</div>
      </div>
      ${previewSections}
    </section>
  </main>
  <script>
    (function () {
      const exportButton = document.querySelector('[data-export-image]');
      const printButton = document.querySelector('[data-print-report]');
      const statusNode = document.querySelector('[data-export-status]');
      const exportRoot = document.querySelector('[data-export-root]');

      function setStatus(message, isError) {
        if (!statusNode) return;
        statusNode.textContent = message || '';
        statusNode.style.color = isError ? '#c0392b' : '#4f5f72';
      }

      async function exportPreviewAsPng() {
        if (!exportRoot) {
          setStatus('找不到可匯出的內容。', true);
          return;
        }
        setStatus('正在產生 PNG...');
        const rect = exportRoot.getBoundingClientRect();
        const width = Math.ceil(rect.width);
        const height = Math.ceil(exportRoot.scrollHeight || rect.height);
        const cloned = exportRoot.cloneNode(true);

        function inlineStyles(sourceNode, clonedNode) {
          if (!(sourceNode instanceof Element) || !(clonedNode instanceof Element)) {
            return;
          }
          const computed = window.getComputedStyle(sourceNode);
          const styleText = Array.from(computed).map((property) => \`\${property}:\${computed.getPropertyValue(property)};\`).join('');
          clonedNode.setAttribute('style', styleText);
          const sourceChildren = Array.from(sourceNode.children);
          const clonedChildren = Array.from(clonedNode.children);
          for (let index = 0; index < sourceChildren.length; index += 1) {
            inlineStyles(sourceChildren[index], clonedChildren[index]);
          }
        }

        inlineStyles(exportRoot, cloned);
        const wrapper = document.createElement('div');
        wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        wrapper.style.width = width + 'px';
        wrapper.style.padding = '20px';
        wrapper.style.background = '#f3f7fb';
        wrapper.appendChild(cloned);
        const serialized = new XMLSerializer().serializeToString(wrapper);
        const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${width + 40}" height="\${height + 40}" viewBox="0 0 \${width + 40} \${height + 40}"><foreignObject width="100%" height="100%">\${serialized}</foreignObject></svg>\`;
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        try {
          const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = reject;
            img.src = url;
          });
          const ratio = Math.max(window.devicePixelRatio || 1, 2);
          const canvas = document.createElement('canvas');
          canvas.width = (width + 40) * ratio;
          canvas.height = (height + 40) * ratio;
          const context = canvas.getContext('2d');
          context.scale(ratio, ratio);
          context.fillStyle = '#f3f7fb';
          context.fillRect(0, 0, width + 40, height + 40);
          context.drawImage(image, 0, 0, width + 40, height + 40);
          const link = document.createElement('a');
          link.download = '${escapeHtml(safeFilenamePart(title))}-' + new Date().toISOString().slice(0, 10) + '.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
          setStatus('PNG 已匯出。');
        } catch (error) {
          setStatus('PNG 匯出失敗，請改用列印另存 PDF。', true);
        } finally {
          if (url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
          }
        }
      }

      exportButton?.addEventListener('click', exportPreviewAsPng);
      printButton?.addEventListener('click', function () { window.print(); });
    }());
  </script>
</body>
</html>`;
}

function openPreviewWindow(html, title = "預覽") {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const previewUrl = URL.createObjectURL(blob);
  const previewWindow = window.open(previewUrl, "_blank");
  if (!previewWindow) {
    throw new Error("新分頁被瀏覽器擋住，請允許此頁開啟分頁後再試一次。");
  }
  previewWindow.addEventListener("beforeunload", () => {
    setTimeout(() => URL.revokeObjectURL(previewUrl), 1000);
  }, { once: true });
}

function downloadSelectedRacePaymentCsv() {
  const race = selectedRaceFromDropdown();
  if (!race) {
    showStatus("請先選擇要匯出的賽事。", "error");
    return;
  }
  const entries = state.entries.filter((entry) => isSameRaceEntry(entry, race));
  if (!entries.length) {
    showStatus(`目前沒有 ${raceName(race)} 的報名紀錄可匯出。`, "error");
    return;
  }
  const csv = `\uFEFF${paymentExportRows(entries)}`;
  const filename = `繳費確認-${String(race.race_date || "日期待補").slice(0, 10)}-${safeFilenamePart(raceName(race))}-${todayString()}.csv`;
  downloadTextFile(filename, csv, "text/csv;charset=utf-8");
  showStatus(`已匯出 ${raceName(race)} 繳費確認 CSV，共 ${entries.length} 筆。`, "success");
}

function downloadSelectedRacePaymentHtml() {
  const race = selectedRaceFromDropdown();
  if (!race) {
    showStatus("請先選擇要匯出的賽事。", "error");
    return;
  }
  const entries = state.entries.filter((entry) => isSameRaceEntry(entry, race));
  if (!entries.length) {
    showStatus(`目前沒有 ${raceName(race)} 的報名紀錄可開啟。`, "error");
    return;
  }
  const html = buildPaymentReminderHtml(race, entries);
  openPreviewWindow(html, `${raceName(race)} 繳費確認`);
  showStatus(`已開啟 ${raceName(race)} 繳費確認截圖分頁，共 ${entries.length} 筆。`, "success");
}

function openNotifyPreview(groups, title = "通知卡片預覽") {
  if (!groups.length) {
    throw new Error("目前篩選條件下沒有可預覽的通知卡片。");
  }
  openPreviewWindow(buildNotifyPreviewHtml(groups, title), title);
}

async function copyNotifyBatch(groups) {
  if (!groups.length) {
    throw new Error("目前篩選條件下沒有可複製的通知內容。");
  }
  const text = groups.map((group) => notifyCardMessage(group)).join("\n\n----------------\n\n");
  await navigator.clipboard.writeText(text);
}

async function importBackup(file) {
  if (!file) {
    return;
  }
  const raw = await file.text();
  const parsed = JSON.parse(raw);
  state.people = normalizeArray(parsed.people);
  state.entries = normalizeArray(parsed.entries);
  await persistAndRender("已匯入備份資料");
  resetPersonForm();
  resetEntryForm();
}

async function onPersonSubmit(event) {
  event.preventDefault();
  const person = collectPersonForm();
  const missing = missingPersonFields(person);
  if (missing.length) {
    showStatus(`人員主檔缺少必填欄位：${missing.join("、")}`, "error");
    return;
  }
  const phoneOk = validatePhoneField();
  const nationalIdOk = validateNationalIdField();
  if (!phoneOk || !nationalIdOk) {
    showStatus("請修正手機或身分證號碼格式後再儲存。", "error");
    return;
  }
  state.people = state.people.filter((item) => item.id !== person.id).concat(person);
  state.focusPersonId = person.id;
  await persistAndRender(`已儲存 ${person.name}`);
  resetPersonForm();
}

async function onEntrySubmit(event) {
  event.preventDefault();
  const draft = collectEntryDraft();
  const personIds = selectedEntryPersonIds();
  if (!draft.raceName || !personIds.length) {
    showStatus("賽事與參加人員都必須填寫。", "error");
    return;
  }
  const nextEntries = [];
  for (const personId of personIds) {
    const person = state.people.find((item) => item.id === personId);
    const entry = {
      ...draft,
      id: els.entryId.value || createId("entry"),
      personId,
      personName: person?.name || "",
      shirtSize: draft.shirtSize || person?.defaultShirtSize || "",
    };
    const duplicate = findDuplicateEntry(state.entries.concat(nextEntries), entry);
    if (duplicate) {
      showStatus(`已存在同一人、同一賽事、同一距離的紀錄：${entry.personName || duplicate.personName || duplicate.personId}`, "error");
      return;
    }
    nextEntries.push(entry);
  }
  const replaceIds = new Set(els.entryId.value ? [els.entryId.value] : []);
  state.entries = state.entries.filter((item) => !replaceIds.has(item.id)).concat(nextEntries);
  state.focusEntryId = nextEntries[0]?.id || "";
  state.entryScope = nextEntries[0] ? entryTimeBucket(nextEntries[0]) : state.entryScope;
  await persistAndRender(`已儲存 ${draft.raceName} 的報名紀錄${nextEntries.length > 1 ? `（${nextEntries.length} 人）` : ""}`);
  resetEntryForm();
}

function syncBackToTop() {
  const visible = window.scrollY > 360;
  els.backToTop?.classList.toggle("is-visible", visible);
  els.backToTop?.setAttribute("aria-hidden", String(!visible));
}

function wireEvents() {
  els.raceSearch.addEventListener("input", applyRaceSearch);
  els.personPhone.addEventListener("blur", validatePhoneField);
  els.personNationalId.addEventListener("blur", validateNationalIdField);
  els.peopleBulkCopy?.addEventListener("click", bulkCopySelectedPeople);
  els.peopleBulkDelete?.addEventListener("click", () => {
    bulkDeleteSelectedPeople().catch((error) => showStatus(error.message || "批次刪除失敗", "error"));
  });
  els.peopleBulkClear?.addEventListener("click", () => {
    state.selectedPersonIds.clear();
    renderPeopleList();
  });
  els.peopleAdd?.addEventListener("click", () => {
    resetPersonForm();
    els.personForm.scrollIntoView({ behavior: "smooth", block: "start" });
    els.personName.focus({ preventScroll: true });
  });
  els.backToTop?.addEventListener("click", () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });
  window.addEventListener("scroll", syncBackToTop, { passive: true });
  syncBackToTop();
  els.entriesBulkDelete?.addEventListener("click", () => {
    bulkDeleteSelectedEntries().catch((error) => showStatus(error.message || "批次刪除失敗", "error"));
  });
  els.entriesBulkClear?.addEventListener("click", () => {
    state.selectedEntryIds.clear();
    renderEntriesList();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    let handled = false;
    document.querySelectorAll("details[open]").forEach((detail) => {
      detail.open = false;
      handled = true;
    });
    if (state.personDetailsId) {
      state.personDetailsId = "";
      renderPeopleList();
      handled = true;
    }
    if (handled) {
      event.stopPropagation();
    }
  });
  [
    els.notifyRacesAll,
    els.notifyRacesClear,
    els.notifyPeopleAll,
    els.notifyPeopleClear,
  ].filter(Boolean).forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });
  els.workspaceViewTabs?.querySelectorAll("[data-workspace-view]").forEach((button) => {
    button.addEventListener("click", () => {
      setWorkspaceView(button.dataset.workspaceView || "overview", { scroll: true, syncHash: true });
    });
  });
  els.workspaceViewTabs?.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...els.workspaceViewTabs.querySelectorAll('[role="tab"]')];
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    nextTab.focus();
    setWorkspaceView(nextTab.dataset.workspaceView || 'overview', { scroll: false, syncHash: true });
  });
  window.addEventListener("hashchange", () => {
    const view = workspaceViewFromHash();
    if (view) setWorkspaceView(view, { scroll: true });
  });
  els.peopleSearch.addEventListener("input", debounce(() => {
    state.peopleQuery = els.peopleSearch.value.trim().toLowerCase();
    state.peoplePage = 1;
    renderPeopleList();
  }, 300));
  [els.peopleFilterGender, els.peopleFilterSize, els.peopleFilterPending].filter(Boolean).forEach((field) => {
    field.addEventListener("change", () => {
      state.peopleFilters = {
        gender: els.peopleFilterGender.value,
        size: els.peopleFilterSize.value,
        pending: els.peopleFilterPending.value,
      };
      state.peoplePage = 1;
      renderPeopleList();
    });
  });
  els.peopleFilterReset?.addEventListener("click", () => {
    state.peopleFilters = { gender: "all", size: "all", pending: "all" };
    els.peopleFilterGender.value = "all";
    els.peopleFilterSize.value = "all";
    els.peopleFilterPending.value = "all";
    document.querySelector("#people-filter-menu").open = false;
    state.peoplePage = 1;
    renderPeopleList();
  });
  els.entriesScopeTabs.querySelectorAll("[data-entry-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      state.entryScope = button.dataset.entryScope || "active";
      state.entriesPage = 1;
      renderEntriesList();
    });
  });
  els.entriesScopeTabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...els.entriesScopeTabs.querySelectorAll('[role="tab"]')];
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    nextTab.focus();
    state.entryScope = nextTab.dataset.entryScope || "active";
    state.entriesPage = 1;
    renderEntriesList();
  });
  els.entriesSearch.addEventListener("input", debounce(() => {
    state.entryQuery = els.entriesSearch.value.trim().toLowerCase();
    state.entriesPage = 1;
    renderEntriesList();
  }, 200));
  els.entriesFilterYear.addEventListener("change", () => {
    state.entryHistoryYear = els.entriesFilterYear.value;
    state.entriesPage = 1;
    renderEntriesList();
  });
  els.entriesFilterPerson.addEventListener("change", () => {
    state.entryFilterPersonId = els.entriesFilterPerson.value;
    state.entriesPage = 1;
    renderEntriesList();
  });
  els.entriesFilterProgress.addEventListener("change", () => {
    state.entryFilterProgress = els.entriesFilterProgress.value;
    state.entriesPage = 1;
    renderEntriesList();
  });
  els.entriesFilterStatus.addEventListener("change", () => {
    state.entryFilterStatus = els.entriesFilterStatus.value;
    state.entriesPage = 1;
    renderEntriesList();
  });
  els.entriesFilterReset.addEventListener("click", () => {
    state.entryQuery = "";
      state.entryFilterPersonId = "";
      state.entryFilterProgress = "all";
      state.entryFilterStatus = "";
      state.entryHistoryYear = "all";
      state.entriesPage = 1;
      els.entriesSearch.value = "";
      els.entriesFilterYear.value = "all";
      els.entriesFilterPerson.value = "";
      els.entriesFilterProgress.value = "all";
    els.entriesFilterStatus.value = "";
    renderEntriesList();
  });
  document.addEventListener("click", (event) => {
    const toggleOverviewActiveButton = event.target.closest("[data-toggle-overview-active]");
    if (toggleOverviewActiveButton) {
      state.overviewShowAllActive = !state.overviewShowAllActive;
      renderOverview();
      return;
    }
    const openPendingButton = event.target.closest("[data-open-pending]");
    if (openPendingButton) {
      openEntriesForWork("", "pending");
      return;
    }
    const openUnpaidButton = event.target.closest("[data-open-unpaid]");
    if (openUnpaidButton) {
      openUnpaidNotifications();
      return;
    }
    const openEntryButton = event.target.closest("[data-open-entry]");
    if (openEntryButton) {
      openEntriesForWork(openEntryButton.dataset.openEntry || "");
      return;
    }
    const openNotifyEntryButton = event.target.closest("[data-open-notify-entry]");
    if (openNotifyEntryButton) {
      openNotifyForEntry(openNotifyEntryButton.dataset.openNotifyEntry || "");
      return;
    }
    const openViewButton = event.target.closest("[data-open-view]");
    if (openViewButton) {
      setWorkspaceView(openViewButton.dataset.openView || "overview", { scroll: true });
      return;
    }
    const openPersonButton = event.target.closest("[data-open-person]");
    if (openPersonButton) {
      state.peopleQuery = "";
      state.peoplePage = 1;
      els.peopleSearch.value = "";
      state.focusPersonId = openPersonButton.dataset.openPerson || "";
      setWorkspaceView("people", { scroll: true });
      renderPeopleList();
      return;
    }
    const openGroupButton = event.target.closest("[data-open-group]");
    if (openGroupButton) {
      const group = groupEntriesByRace(state.entries).find((item) => item.key === openGroupButton.dataset.openGroup);
      openEntriesForWork(group?.entries?.[0]?.id || "");
      return;
    }
    const copyNotifyPersonButton = event.target.closest("[data-copy-notify-person]");
    if (copyNotifyPersonButton) {
      const groups = buildNotifyGroups(filteredNotifyEntries());
      const group = groups.find((item) => item.key === copyNotifyPersonButton.dataset.copyNotifyPerson);
      if (!group) {
        showNotifyStatus("找不到這位人員的通知內容。", "error");
        return;
      }
      navigator.clipboard.writeText(notifyCardMessage(group))
        .then(() => showNotifyStatus(`已複製 ${group.name} 的通知文字`, "success"))
        .catch((error) => showNotifyStatus(error.message || "複製通知失敗", "error"));
      return;
    }
    const openNotifyPersonButton = event.target.closest("[data-open-notify-person]");
    if (openNotifyPersonButton) {
      const groups = buildNotifyGroups(filteredNotifyEntries());
      const group = groups.find((item) => item.key === openNotifyPersonButton.dataset.openNotifyPerson);
      if (!group) {
        showNotifyStatus("找不到這位人員的卡片。", "error");
        return;
      }
      try {
        openNotifyPreview([group], `${group.name} 通知卡片`);
        showNotifyStatus(`已開啟 ${group.name} 的通知卡片分頁`, "success");
      } catch (error) {
        showNotifyStatus(error.message || "開啟分頁失敗", "error");
      }
      return;
    }
    const toggleNotifyGroupButton = event.target.closest("[data-toggle-notify-group]");
    if (toggleNotifyGroupButton) {
      const key = toggleNotifyGroupButton.dataset.toggleNotifyGroup || "";
      if (!key) {
        return;
      }
      if (state.notifyCollapsedGroups.has(key)) state.notifyCollapsedGroups.delete(key);
      else state.notifyCollapsedGroups.add(key);
      renderNotifyWorkspace();
      return;
    }
    const pageButton = event.target.closest("[data-page-kind]");
    if (!pageButton) {
      return;
    }
    const targetPage = pageButton.dataset.pageSet ? Number(pageButton.dataset.pageSet) : null;
    const direction = Number(pageButton.dataset.pageDirection || 0);
    if (pageButton.dataset.pageKind === "people") {
      state.peoplePage = targetPage ?? state.peoplePage + direction;
      renderPeopleList();
      return;
    }
    state.entriesPage = targetPage ?? state.entriesPage + direction;
    renderEntriesList();
  });
  els.raceSelect.addEventListener("change", () => {
    saveSelectedRaceId(els.raceSelect.value);
    renderSelectedRaceSummary(selectedRaceFromDropdown());
    renderRaceSelectHints(selectedRaceFromDropdown());
    renderOverview();
  });
  els.sidebarCollapseToggle?.addEventListener("click", () => {
    setSidebarCollapsed(!state.sidebarCollapsed);
  });
  els.useSelectedRace.addEventListener("click", () => {
    const race = selectedRaceFromDropdown();
    if (race) {
      fillEntryFromRace(race);
      setWorkspaceView("entries", { scroll: true });
    }
  });
  els.exportSelectedRacePayments.addEventListener("click", downloadSelectedRacePaymentCsv);
  els.exportSelectedRacePaymentHtml.addEventListener("click", downloadSelectedRacePaymentHtml);
  els.notifyScope?.addEventListener("change", () => {
    state.notifyScope = els.notifyScope.value;
    renderNotifyWorkspace();
  });
  els.notifySearch?.addEventListener("input", debounce(() => {
    state.notifyQuery = els.notifySearch.value.trim().toLowerCase();
    renderNotifyWorkspace();
  }, 200));
  els.notifyProgress?.addEventListener("change", () => {
    state.notifyProgress = els.notifyProgress.value;
    renderNotifyWorkspace();
  });
  els.notifyRacesAll?.addEventListener("click", () => {
    state.notifySelectedRaceKeys = new Set(state.entries.map((entry) => notifyRaceKey(entry)));
    renderNotifyPickerLists();
    renderNotifyWorkspace();
  });
  els.notifyRacesClear?.addEventListener("click", () => {
    state.notifySelectedRaceKeys = new Set();
    renderNotifyPickerLists();
    renderNotifyWorkspace();
  });
  els.notifyPeopleAll?.addEventListener("click", () => {
    state.notifySelectedPersonIds = new Set(state.people.map((person) => person.id));
    renderNotifyPickerLists();
    renderNotifyWorkspace();
  });
  els.notifyPeopleClear?.addEventListener("click", () => {
    state.notifySelectedPersonIds = new Set();
    renderNotifyPickerLists();
    renderNotifyWorkspace();
  });
  els.notifyOpenPreview?.addEventListener("click", () => {
    try {
      const groups = renderNotifyWorkspace();
      openNotifyPreview(groups, "通知卡片總覽");
      showNotifyStatus(`已開啟通知卡片分頁，共 ${groups.length} 人`, "success");
    } catch (error) {
      showNotifyStatus(error.message || "開啟通知分頁失敗", "error");
    }
  });
  els.notifyCopyBatch?.addEventListener("click", () => {
    const groups = renderNotifyWorkspace();
    copyNotifyBatch(groups)
      .then(() => showNotifyStatus(`已複製 ${groups.length} 人的通知文字`, "success"))
      .catch((error) => showNotifyStatus(error.message || "複製通知失敗", "error"));
  });
  els.notifyReset?.addEventListener("click", () => {
    state.notifyScope = "active";
    state.notifyQuery = "";
    state.notifyProgress = "all";
    state.notifySelectedRaceKeys = new Set();
    state.notifySelectedPersonIds = new Set();
    state.notifyCollapsedGroups = new Set();
    state.notifyDensity = "compact";
    state.notifyWorkspacePrimed = false;
    els.notifyScope.value = "active";
    els.notifySearch.value = "";
    els.notifyProgress.value = "all";
    renderNotifyPickerLists();
    renderNotifyWorkspace();
    showNotifyStatus("已清空通知篩選", "success");
  });
  els.notifyDensityComfortable?.addEventListener("click", () => {
    state.notifyDensity = "comfortable";
    renderNotifyWorkspace();
    showNotifyStatus("已切回一般密度", "success");
  });
  els.notifyDensityCompact?.addEventListener("click", () => {
    state.notifyDensity = "compact";
    renderNotifyWorkspace();
    showNotifyStatus("已切換緊湊密度", "success");
  });
  els.notifyExpandAll?.addEventListener("click", () => {
    state.notifyCollapsedGroups = new Set();
    renderNotifyWorkspace();
    showNotifyStatus("已展開全部人員卡", "success");
  });
  els.notifyCollapseAll?.addEventListener("click", () => {
    const groups = buildNotifyGroups(filteredNotifyEntries());
    state.notifyCollapsedGroups = new Set(groups.map((group) => group.key));
    renderNotifyWorkspace();
    showNotifyStatus("已收合全部人員卡", "success");
  });
  els.exportBatchData?.addEventListener("click", () => {
    downloadBatchWorkbook().then(() => showStatus("已匯出可批次編輯的 Excel", "success")).catch((error) => showStatus(error.message || "Excel 匯出失敗", "error"));
  });
  els.importBatchData?.addEventListener("change", async (event) => {
    try {
      await previewBatchImport(event.target.files?.[0]);
    } catch (error) {
      state.batchImport = null;
      renderBatchImportPreview();
      showStatus(error.message || "Excel 預檢失敗", "error");
    } finally {
      event.target.value = "";
    }
  });
  els.batchImportPreview?.addEventListener("click", (event) => {
    if (event.target.closest("[data-dismiss-batch-preview]")) {
      state.batchImport = null;
      renderBatchImportPreview();
      return;
    }
    if (event.target.closest("[data-apply-batch-import]")) {
      applyBatchImport().catch((error) => showStatus(error.message || "Excel 匯入失敗", "error"));
    }
  });
  els.exportData.addEventListener("click", downloadBackup);
  els.importData.addEventListener("change", async (event) => {
    try {
      await importBackup(event.target.files?.[0]);
      event.target.value = "";
    } catch (error) {
      showStatus(error.message || "匯入失敗", "error");
    }
  });
  els.personForm.addEventListener("submit", (event) => {
    onPersonSubmit(event).catch((error) => showStatus(error.message || "儲存人員失敗", "error"));
  });
  els.entryForm.addEventListener("submit", (event) => {
    onEntrySubmit(event).catch((error) => showStatus(error.message || "儲存報名紀錄失敗", "error"));
  });
  els.personReset.addEventListener("click", resetPersonForm);
  els.entryReset.addEventListener("click", resetEntryForm);
  els.entryPersonId.addEventListener("change", () => {
    const person = selectedPerson();
    if (!els.entryId.value) {
      state.entryBatchPersonIds = els.entryPersonId.value ? new Set([els.entryPersonId.value]) : new Set();
      renderEntryPersonBatch();
    }
    if (person && !els.entryShirtSize.value) {
      els.entryShirtSize.value = person.defaultShirtSize || "";
    }
  });
}

async function init() {
  try {
    state.workspaceView = workspaceViewFromHash() || savedWorkspaceView();
    state.sidebarCollapsed = savedSidebarCollapsed();
    restoreNotifyPreferences();
    state.loadState = "loading";
    await Promise.all([loadRaces(), loadPrivateData()]);
    state.loadState = "ready";
    els.notifyScope.value = state.notifyScope;
    els.notifySearch.value = state.notifyQuery;
    els.notifyProgress.value = state.notifyProgress;
    renderAll();
    updateLastSavedIndicator();
    setSidebarCollapsed(state.sidebarCollapsed);
    wireEvents();
    resetEntryForm();
  } catch (error) {
    state.loadState = "error";
    state.loadError = error.message || "初始化失敗，請重新整理後再試一次。";
    renderAll();
    wireEvents();
    showStatus(state.loadError, "error");
    showNotifyStatus(state.loadError, "error");
  }
}

init();
