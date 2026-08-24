import { savedWorkspaceView, savedSidebarCollapsed, setSidebarCollapsed, restoreNotifyPreferences, loadRaces, loadPrivateData } from "./registration-data.js";
import { renderAll } from "./registration-render.js";
import { workspaceViewFromHash, wireEvents, resetEntryForm, showStatus, showNotifyStatus } from "./registration-actions.js";

export const DATA_VERSION = "20260714-registration-workspace2";

export const SELECTED_RACE_STORAGE_KEY = "runner.registration.selectedRaceId";

export const WORKSPACE_VIEW_STORAGE_KEY = "runner.registration.workspaceView";

export const NOTIFY_PREFS_STORAGE_KEY = "runner.registration.notifyPrefs";

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "runner.registration.sidebarCollapsed";

export const WORKSPACE_VIEW_HASHES = { "#pending-queue": "overview", "#team-members": "people", "#entries": "entries", "#notifications": "notify" };

export const VIEW_WORKSPACE_HASHES = { overview: "#pending-queue", people: "#team-members", entries: "#entries", notify: "#notifications" };

export const PEOPLE_PAGE_SIZE = 6;

export const ENTRY_GROUP_PAGE_SIZE = 4;

export const state = {
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
  pendingEntryReturn: false,
};

export const els = {
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
  entryAddPerson: document.querySelector("#entry-add-person"),
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

export function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function showToast(message, kind = "success") {
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

export function validatePhoneField() {
  const value = els.personPhone.value.trim();
  const ok = !value || PHONE_PATTERN.test(value);
  if (els.personPhoneError) {
    els.personPhoneError.textContent = ok ? "" : "格式須為 09 開頭共 10 碼數字";
  }
  return ok;
}

export function validateNationalIdField() {
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

export function updateLastSavedIndicator() {
  if (!els.lastSavedIndicator) {
    return;
  }
  const time = formatSavedTime(state.lastKnownUpdatedAt);
  els.lastSavedIndicator.textContent = time ? `已同步・${time}` : "";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function todayString() {
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

export function normalizeMatchValue(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeDistanceValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/(\d)\.\s+(\d)/g, "$1.$2")
    .trim();
}

export function normalizeEntryStatusValue(value) {
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

export function formatMoney(value) {
  const amount = Number(value || 0);
  return amount === 0 ? "新台幣 0 元" : `NT$ ${amount.toLocaleString("zh-TW")}`;
}

export function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isCompactViewport() {
  return globalThis.matchMedia?.("(max-width: 760px)")?.matches ?? false;
}

export async function init() {
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
