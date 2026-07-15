import { findDuplicateEntry } from "./registration-core.js";

const DATA_VERSION = "20260714-registration-workspace2";
const SELECTED_RACE_STORAGE_KEY = "runner.registration.selectedRaceId";
const WORKSPACE_VIEW_STORAGE_KEY = "runner.registration.workspaceView";
const NOTIFY_PREFS_STORAGE_KEY = "runner.registration.notifyPrefs";
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
  peoplePage: 1,
  entryQuery: "",
  entryScope: "active",
  entryHistoryYear: "all",
  entriesPage: 1,
  entryFilterPersonId: "",
  entryFilterProgress: "all",
  entryFilterStatus: "",
  focusPersonId: "",
  focusEntryId: "",
  workspaceView: "overview",
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
};

const els = {
  raceSearch: document.querySelector("#race-search"),
  raceSelect: document.querySelector("#race-select"),
  useSelectedRace: document.querySelector("#use-selected-race"),
  exportSelectedRacePayments: document.querySelector("#export-selected-race-payments"),
  exportSelectedRacePaymentHtml: document.querySelector("#export-selected-race-payment-html"),
  racePicker: document.querySelector("#race-picker"),
  peopleList: document.querySelector("#people-list"),
  peoplePagination: document.querySelector("#people-pagination"),
  entriesList: document.querySelector("#entries-list"),
  entriesPagination: document.querySelector("#entries-pagination"),
  peopleSearch: document.querySelector("#people-search"),
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
  overviewSelectedRace: document.querySelector("#overview-selected-race"),
  overviewActiveGroups: document.querySelector("#overview-active-groups"),
  exportData: document.querySelector("#export-data"),
  importData: document.querySelector("#import-data"),
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
  personBirthday: document.querySelector("#person-birthday"),
  personNationalId: document.querySelector("#person-national-id"),
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
  return `NT$ ${Number(value || 0).toLocaleString("zh-TW")}`;
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

function isSelectableRace(race) {
  const raceDate = raceDateValue(race);
  if (isClosedRaceStatus(race?.registration_status)) {
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

function renderPagination(target, kind, pagination) {
  if (!target) {
    return;
  }
  if (pagination.total <= 0) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = `
    <button type="button" class="page-button" data-page-kind="${escapeHtml(kind)}" data-page-direction="-1" ${pagination.page <= 1 ? "disabled" : ""}>上一頁</button>
    <span class="pagination-note">第 ${escapeHtml(pagination.page)} / ${escapeHtml(pagination.totalPages)} 頁 · 顯示 ${escapeHtml(pagination.start)}-${escapeHtml(pagination.end)} / ${escapeHtml(pagination.total)}</span>
    <button type="button" class="page-button" data-page-kind="${escapeHtml(kind)}" data-page-direction="1" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>下一頁</button>
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

function setWorkspaceView(view, { scroll = false } = {}) {
  const nextView = ["overview", "people", "entries", "notify"].includes(view) ? view : "overview";
  state.workspaceView = nextView;
  saveWorkspaceView(nextView);
  els.workspaceViews.forEach((panel) => {
    const active = panel.dataset.workspacePanel === nextView;
    panel.hidden = !active;
    panel.classList.toggle("workspace-view-active", active);
  });
  els.workspaceViewTabs?.querySelectorAll("[data-workspace-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.workspaceView === nextView);
  });
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
            ${overviewStatusTag(group.pendingCount ? `待處理 ${group.pendingCount}` : "目前完成", group.pendingCount ? "pending" : "complete")}
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
                <strong>${escapeHtml(entry.paidAmount ? formatMoney(entry.paidAmount) : "NT$ 0")}</strong>
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
  const pendingCount = state.entries.filter((entry) => !entry.isRegistered || (entry.isRegistered && !entry.isPaid)).length;
  const unpaidCount = state.entries.filter((entry) => entry.isRegistered && !entry.isPaid).length;
  els.summaryRaces.textContent = String(state.races.filter(isSelectableRace).length);
  els.summaryPeople.textContent = String(state.people.length);
  els.summaryPending.textContent = String(pendingCount);
  els.summaryUnpaid.textContent = String(unpaidCount);
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
    els.useSelectedRace.disabled = true;
    els.exportSelectedRacePayments.disabled = true;
    els.exportSelectedRacePaymentHtml.disabled = true;
    renderSelectedRaceSummary(null);
    return;
  }

  const previousValue = els.raceSelect.value || savedSelectedRaceId();
  els.raceSelect.innerHTML = state.filteredRaces.map((race) => {
    const label = [
      race.race_date || "日期待補",
      raceName(race),
      dedupeRaceDistances(race) || "距離待補",
    ].join("｜");
    return `<option value="${escapeHtml(raceId(race))}">${escapeHtml(label)}</option>`;
  }).join("");
  const hasPrevious = state.filteredRaces.some((race) => String(raceId(race)) === previousValue);
  els.raceSelect.value = hasPrevious ? previousValue : String(raceId(state.filteredRaces[0]));
  saveSelectedRaceId(els.raceSelect.value);
  els.useSelectedRace.disabled = false;
  els.exportSelectedRacePayments.disabled = false;
  els.exportSelectedRacePaymentHtml.disabled = false;
  renderSelectedRaceSummary(selectedRaceFromDropdown());
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
        ${overviewStatusTag(stats.pendingCount ? "待處理" : "已就緒", stats.pendingCount ? "pending" : "complete")}
      </div>
      <div class="race-picker-meta">
        <span class="meta-pill">${escapeHtml(race.race_date || "日期待補")}</span>
        <span class="meta-pill">${escapeHtml(dedupeRaceDistances(race) || "距離待補")}</span>
        <span class="meta-pill">${escapeHtml(race.registration_status || "狀態待補")}</span>
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

function renderPeopleList() {
  const filteredPeople = state.people.filter((person) => (
    !state.peopleQuery || personSearchText(person).includes(state.peopleQuery)
  ));
  if (!filteredPeople.length) {
    els.peopleList.innerHTML = `<div class="empty-state">${state.people.length ? "查無符合的人員" : "尚未建立人員"}</div>`;
    renderPagination(els.peoplePagination, "people", { total: 0 });
    return;
  }

  if (state.focusPersonId) {
    const focusIndex = filteredPeople.findIndex((person) => person.id === state.focusPersonId);
    if (focusIndex >= 0) {
      state.peoplePage = Math.floor(focusIndex / PEOPLE_PAGE_SIZE) + 1;
    }
  }
  const pagination = paginateItems(filteredPeople, state.peoplePage, PEOPLE_PAGE_SIZE);
  state.peoplePage = pagination.page;

  els.peopleList.innerHTML = pagination.items.map((person) => {
    const stats = personStats(person.id);
    return `
    <article class="person-card${state.focusPersonId === person.id ? " is-focused" : ""}" id="person-card-${escapeHtml(person.id)}">
      <div class="person-main">
        <div class="person-head">
          <div class="overview-card-kicker">
            ${overviewStatusTag(stats.pending ? `待辦 ${stats.pending}` : "名單穩定", stats.pending ? "pending" : "complete")}
          </div>
          <h3>${escapeHtml(person.name)}</h3>
          <div class="person-meta">
            ${stats.active ? `<span class="meta-pill">目前 ${escapeHtml(stats.active)} 場</span>` : ""}
            ${stats.history ? `<span class="meta-pill">歷史 ${escapeHtml(stats.history)} 場</span>` : ""}
            ${stats.pending ? `<span class="meta-pill">未完成 ${escapeHtml(stats.pending)}</span>` : ""}
            ${person.defaultShirtSize ? `<span class="meta-pill">衣服 ${escapeHtml(person.defaultShirtSize)}</span>` : ""}
            ${person.gender ? `<span class="meta-pill">${escapeHtml(person.gender)}</span>` : ""}
            ${person.phone ? `<span class="meta-pill">${escapeHtml(maskedPhone(person.phone))}</span>` : ""}
            ${person.nationalId ? `<span class="meta-pill">身分證 ${escapeHtml(String(person.nationalId).slice(-4).padStart(String(person.nationalId).length, "*"))}</span>` : ""}
          </div>
        </div>
        <p class="person-emergency">${escapeHtml(person.emergencyName ? `緊急聯絡：${person.emergencyName} / ${person.emergencyRelationship} / ${maskedPhone(person.emergencyPhone)}` : "尚無緊急聯絡資料")}</p>
        <div class="person-quick-actions">
          <button class="person-quick-action" type="button" data-view-person="${escapeHtml(person.id)}" data-view-scope="active">查看目前賽事</button>
          <button class="person-quick-action" type="button" data-view-person="${escapeHtml(person.id)}" data-view-scope="history">查看歷史紀錄</button>
        </div>
      </div>
      <div class="card-actions">
        <button class="mini-action" type="button" data-edit-person="${escapeHtml(person.id)}">編輯</button>
        <button class="mini-action" type="button" data-delete-person="${escapeHtml(person.id)}">刪除</button>
      </div>
    </article>
  `;
  }).join("");

  els.peopleList.querySelectorAll("[data-edit-person]").forEach((button) => {
    button.addEventListener("click", () => editPerson(button.dataset.editPerson));
  });
  els.peopleList.querySelectorAll("[data-delete-person]").forEach((button) => {
    button.addEventListener("click", () => deletePerson(button.dataset.deletePerson).catch((error) => showStatus(error.message || "刪除失敗", "error")));
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
              ${overviewStatusTag(stats.pendingCount ? `待完成 ${stats.pendingCount}` : "目前已就緒", stats.pendingCount ? "pending" : "complete")}
              ${overviewStatusTag(selectedRace.registration_status || "狀態待補", "neutral")}
            </div>
            <h3>${escapeHtml(raceName(selectedRace))}</h3>
            <p>${escapeHtml(formatRaceLocation(selectedRace) || "地點待補")}</p>
          </div>
          ${selectedRace.registration_link ? `<div class="overview-race-actions"><a class="mini-action" href="${escapeHtml(selectedRace.registration_link)}" target="_blank" rel="noreferrer">開啟報名站</a></div>` : ""}
        </div>
        <div class="race-picker-meta">
          <span class="meta-pill">${escapeHtml(selectedRace.race_date || "日期待補")}</span>
          <span class="meta-pill">${escapeHtml(dedupeRaceDistances(selectedRace) || "距離待補")}</span>
          <span class="meta-pill">${escapeHtml(`已建立 ${stats.total} 筆`)}</span>
        </div>
        <div class="overview-race-facts">
          <span><b>${escapeHtml(stats.uniquePeople)}</b> 位參加人員</span>
          <span><b>${escapeHtml(stats.registeredCount)}</b> 筆已報名</span>
          <span class="${stats.pendingCount ? "is-warning" : ""}"><b>${escapeHtml(stats.pendingCount)}</b> 筆待處理</span>
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
  els.overviewWorkQueue.innerHTML = pendingEntries.length
    ? pendingEntries.slice(0, 8).map((entry) => {
      const person = peopleById.get(entry.personId);
      const needsSignup = !entry.isRegistered;
      const taskLabel = needsSignup ? "待完成報名" : "待確認繳費";
      return `
        <article class="overview-queue-item ${needsSignup ? "is-signup" : "is-payment"}">
          <div class="overview-queue-status">${escapeHtml(taskLabel)}</div>
          <div class="overview-queue-copy">
            <h3>${escapeHtml(person?.name || "未指派人員")}</h3>
            <p>${escapeHtml(entry.raceName || "未命名賽事")}</p>
            <div class="entry-meta">
              ${entry.raceDate ? `<span class="meta-pill">${escapeHtml(entry.raceDate)}</span>` : ""}
              ${entry.distance ? `<span class="meta-pill">${escapeHtml(entry.distance)}</span>` : ""}
              ${entry.paidAmount ? `<span class="meta-pill">${escapeHtml(formatMoney(entry.paidAmount))}</span>` : ""}
            </div>
          </div>
          <div class="overview-queue-actions">
            <button class="mini-action" type="button" data-open-entry="${escapeHtml(entry.id)}">處理</button>
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
  els.overviewActiveGroups.innerHTML = activeGroups.length
    ? activeGroups.slice(0, 6).map((group) => {
      const pendingCount = group.entries.filter((entry) => !entry.isRegistered || !entry.isPaid).length;
      return `
        <article class="overview-item ${pendingCount ? "is-pending" : ""}">
          <div class="overview-item-head">
            <div>
              <div class="overview-card-kicker">
                ${overviewStatusTag(pendingCount ? `待處理 ${pendingCount}` : "全部完成", pendingCount ? "pending" : "complete")}
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
    }).join("") + (activeGroups.length > 6
      ? `<button class="ghost-action overview-list-more" type="button" data-open-view="entries">查看其餘 ${escapeHtml(activeGroups.length - 6)} 場</button>`
      : "")
    : '<div class="empty-state">尚未建立目前賽事報名。</div>';
}

function renderEntriesList() {
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
      button.classList.toggle("active", button.dataset.entryScope === state.entryScope);
    });
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
              ${overviewStatusTag(pendingCount ? `待處理 ${pendingCount}` : "本組完成", pendingCount ? "pending" : "complete")}
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
        <div class="entry-group-people">
          ${group.entries.map((entry) => {
            const person = peopleById.get(entry.personId);
            const personName = entry.personName || person?.name || "未指定";
            return `
              <section class="entry-person-row ${statusClass(entry)}">
                <div class="entry-person-main">
                  <div class="entry-person-head">
                    <strong>${escapeHtml(personName)}</strong>
                    <div class="entry-meta">
                      ${entry.distance ? `<span class="meta-pill">${escapeHtml(entry.distance)}</span>` : ""}
                      ${entry.shirtSize ? `<span class="meta-pill">衣服 ${escapeHtml(entry.shirtSize)}</span>` : ""}
                      <span class="meta-pill">${escapeHtml(entry.status || "待報名")}</span>
                    </div>
                  </div>
                  <p>${escapeHtml(`報名: ${entry.isRegistered ? "是" : "否"} / 繳費: ${entry.isPaid ? "是" : "否"}`)}</p>
                </div>
                <div class="card-actions">
                  <button class="mini-action" type="button" data-edit-entry="${escapeHtml(entry.id)}">編輯</button>
                  <button class="mini-action" type="button" data-delete-entry="${escapeHtml(entry.id)}">刪除</button>
                </div>
              </section>
            `;
          }).join("")}
        </div>
      </article>
    `;
  }).join("")}
    </section>
  `).join("");

  els.entriesList.querySelectorAll("[data-edit-entry]").forEach((button) => {
    button.addEventListener("click", () => editEntry(button.dataset.editEntry));
  });
  els.entriesList.querySelectorAll("[data-delete-entry]").forEach((button) => {
    button.addEventListener("click", () => deleteEntry(button.dataset.deleteEntry).catch((error) => showStatus(error.message || "刪除失敗", "error")));
  });
  renderPagination(els.entriesPagination, "entries", pagination);
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
  els.entryStatus.value = normalizeEntryStatusValue(race.registration_status);
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
  window.scrollTo({ top: 0, behavior: "smooth" });
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
}

function showNotifyStatus(message, kind = "success") {
  if (!els.notifyStatusMessage) {
    return;
  }
  els.notifyStatusMessage.textContent = message;
  els.notifyStatusMessage.className = `status-message ${kind}`;
}

async function persistAndRender(message) {
  state.people.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  state.entries.sort((a, b) => String(a.raceDate || "").localeCompare(String(b.raceDate || "")) || String(a.raceName || "").localeCompare(String(b.raceName || "")));
  await savePrivateData();
  renderAll();
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
  const coverageRatio = totalEntries ? Math.round((totalRegistered / totalEntries) * 100) : 0;
  const exportLabel = groups.length === 1 ? "匯出此卡片 PNG" : "匯出目前報表 PNG";
  const exportHint = groups.length === 1 ? "開分頁後可直接匯出單人卡片圖片，適合直接傳給報名者。" : "目前為多人總表，匯出時會截取整張報表。";
  const previewSections = groups.map((group) => {
    const statusLabel = group.pendingCount ? `待處理 ${group.pendingCount}` : "已完成";
    const statusTone = group.pendingCount ? "pending" : "complete";
    const amountHint = group.unpaidAmount ? "依未繳費項目合計" : "目前無待收";
    const message = group.pendingCount
      ? `${group.name} 您好，以下整理目前報名與繳費重點，請直接核對，若需要補件或修正再回覆即可。`
      : `${group.name} 您好，目前所有報名與繳費紀錄都已整理完成，請直接確認內容即可。`;
    return `
      <section class="preview-person-section">
        <article class="preview-person-card">
          <div class="preview-person-main">
            <div class="preview-person-ident">
              <div class="preview-avatar">${escapeHtml((group.name || "?").slice(0, 1))}</div>
              <div class="preview-person-copy">
                <div class="preview-person-title-row">
                  <h3>${escapeHtml(group.name)}</h3>
                  <span class="preview-pill ${statusTone}">${escapeHtml(statusLabel)}</span>
                </div>
                <div class="preview-meta-row">
                  ${group.defaultShirtSize ? `<span class="preview-meta-chip">${notifyIcon("shirt")}<span>衣服 ${escapeHtml(group.defaultShirtSize)}</span></span>` : ""}
                  ${group.phone ? `<span class="preview-meta-chip">${notifyIcon("phone")}<span>手機 ${escapeHtml(maskedPhone(group.phone))}</span></span>` : ""}
                </div>
              </div>
            </div>
            <div class="preview-summary-grid">
              <article class="preview-summary-card">
                <div class="preview-summary-head">${notifyIcon("person")}<span>已完成報名</span></div>
                <strong>${escapeHtml(`${group.registeredCount} / ${group.entries.length}`)}</strong>
              </article>
              <article class="preview-summary-card">
                <div class="preview-summary-head">${notifyIcon("stack")}<span>待處理</span></div>
                <strong>${escapeHtml(`${group.pendingCount} 筆`)}</strong>
              </article>
              <article class="preview-summary-card">
                <div class="preview-summary-head">${notifyIcon("race")}<span>檔期</span></div>
                <strong>${escapeHtml(notifyRangeLabel(group))}</strong>
              </article>
            </div>
            <p class="preview-person-message">${escapeHtml(message)}</p>
          </div>
          <aside class="preview-person-side">
            <span class="preview-amount-label">待收金額</span>
            <strong>${escapeHtml(formatMoney(group.unpaidAmount))}</strong>
            <small>${escapeHtml(amountHint)}</small>
          </aside>
        </article>
        <div class="preview-person-body">
          <section class="preview-entry-list">
            ${group.entries.map((entry) => {
              const progressLabel = entry.isPaid ? "已完成" : entry.isRegistered ? "待繳費" : "待報名";
              const progressTone = entry.isPaid ? "complete" : "pending";
              const processLabel = entry.status || (entry.isRegistered ? "已建立報名" : "可報名");
              const amountLabel = entry.paidAmount ? formatMoney(entry.paidAmount) : "金額未填";
              const amountHintText = entry.isPaid ? "費用已確認" : entry.isRegistered ? "待收此筆費用" : "尚未完成報名";
              const entryDate = escapeHtml(formatNotifyRangeDate(String(entry.raceDate || "").slice(0, 10)) || "日期待補");
              const locationLabel = [entry.county, entry.location].filter(Boolean).join(" · ") || "地點待補";
              const noteLabel = entry.notes || "無補充說明";
              return `
                <article class="preview-entry-card ${statusClass(entry)}">
                  <div class="preview-entry-date">
                    <span>${entryDate}</span>
                    <small>${escapeHtml(entry.distance || "未分組")}</small>
                  </div>
                  <div class="preview-entry-main">
                    <div class="preview-entry-head">
                      <h4>${escapeHtml(entry.raceName || "未命名賽事")}</h4>
                      <div class="preview-entry-pills">
                        <span class="preview-pill ${progressTone}">${escapeHtml(progressLabel)}</span>
                        <span class="preview-pill neutral">${escapeHtml(processLabel)}</span>
                      </div>
                    </div>
                    <div class="preview-entry-foot">
                      <p>${escapeHtml(locationLabel)}</p>
                      <p>${escapeHtml(noteLabel)}</p>
                    </div>
                  </div>
                  <div class="preview-entry-amount">
                    <strong>${escapeHtml(amountLabel)}</strong>
                    <small>${escapeHtml(amountHintText)}</small>
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
      --primary-dark: #083b2d;
      --primary-soft: #eaf3ef;
      --blue: #245b89;
      --blue-soft: #f1f6fb;
      --warning: #c87500;
      --warning-dark: #9a4b00;
      --warning-soft: #fff3dc;
      --warning-border: #f5d69d;
      --text-main: #102a27;
      --text-strong: #082f2a;
      --text-muted: #657a73;
      --text-light: #8a9b96;
      --border: #dfe8e4;
      --border-soft: #e8efec;
      --page-bg: #f6f9f8;
      --card-bg: #ffffff;
      --shadow-soft: 0 6px 18px rgba(15, 60, 45, 0.06);
      --shadow-card: 0 8px 24px rgba(20, 60, 90, 0.06);
      --radius-xl: 24px;
      --radius-lg: 20px;
      --radius-md: 14px;
      --line: #e8efec;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", Arial, sans-serif;
      color: var(--text-main);
      background:
        radial-gradient(circle at 10% 4%, rgba(228, 240, 232, .72), transparent 24%),
        radial-gradient(circle at 96% 8%, rgba(255, 243, 220, .55), transparent 18%),
        linear-gradient(180deg, var(--page-bg) 0%, #fbfcfb 100%);
      padding: 28px 16px 64px;
    }
    main { width: min(${singlePersonMode ? 1320 : 1360}px, 100%); margin: 0 auto; }
    .utility-bar {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 14px;
    }
    .utility-bar p {
      margin: 0;
      color: var(--text-muted);
      font-size: 13px;
    }
    .utility-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .utility-actions button {
      border: 0;
      border-radius: 999px;
      min-height: 42px;
      padding: 0 18px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .utility-actions button.primary {
      background: var(--primary);
      color: white;
      box-shadow: 0 14px 24px rgba(15, 76, 58, .14);
    }
    .utility-actions button.secondary {
      background: rgba(255,255,255,.82);
      color: var(--primary);
      border: 1px solid var(--border);
    }
    .utility-status {
      min-height: 20px;
      color: var(--text-muted);
      font-size: 12px;
      text-align: right;
    }
    .hero {
      border-radius: var(--radius-xl);
      background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(251,252,251,.98));
      color: var(--text-main);
      padding: 24px 28px 22px;
      box-shadow: var(--shadow-card);
      border: 1px solid var(--border-soft);
      margin-bottom: 22px;
    }
    .hero p, .hero h1, .hero small { margin: 0; }
    .hero p { font-size: 13px; color: var(--primary); font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .hero h1 { font-size: clamp(32px, 4vw, 44px); margin-top: 10px; letter-spacing: -.02em; color: var(--primary-dark); }
    .hero small { display: block; margin-top: 10px; color: var(--text-muted); font-size: 14px; }
    .hero-stats {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 14px;
      margin-top: 20px;
    }
    .hero-stat {
      border-radius: 18px;
      background: #ffffff;
      border: 1px solid var(--border-soft);
      padding: 14px 16px;
      box-shadow: var(--shadow-soft);
    }
    .hero-stat span {
      display: block;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 6px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .hero-stat strong {
      display: block;
      font-size: 28px;
      line-height: 1;
      color: var(--primary-dark);
    }
    .report-sheet {
      background: rgba(255,255,255,.985);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-card);
      overflow: hidden;
      backdrop-filter: blur(6px);
    }
    .sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 22px;
      border-bottom: 1px solid var(--border-soft);
      background: linear-gradient(180deg, #ffffff, #f8fbfa);
    }
    .sheet-head h2 {
      margin: 0;
      font-size: 20px;
      color: var(--primary-dark);
    }
    .sheet-head p {
      margin: 4px 0 0;
      color: var(--text-muted);
      font-size: 13px;
    }
    .sheet-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0 14px;
      border-radius: 999px;
      background: #ffffff;
      border: 1px solid var(--border-soft);
      color: var(--primary);
      font-weight: 800;
      font-size: 13px;
      white-space: nowrap;
    }
    .report-export-root { background: transparent; }
    .preview-person-section {
      padding: 22px;
    }
    .preview-person-section + .preview-person-section {
      border-top: 1px solid var(--line);
    }
    .report-sheet.is-multi .preview-person-section {
      padding: 26px 28px 30px;
      background:
        linear-gradient(180deg, rgba(248, 251, 250, .84) 0%, rgba(255, 255, 255, .96) 22%, rgba(255, 255, 255, 1) 100%);
    }
    .report-sheet.is-multi .preview-person-section + .preview-person-section {
      border-top: 1px solid #edf2f0;
    }
    .preview-person-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 240px;
      gap: 18px;
      padding: 22px;
      border: 1px solid var(--border-soft);
      border-radius: 22px;
      background: linear-gradient(180deg, #ffffff 0%, #fbfdfc 100%);
      box-shadow: var(--shadow-soft);
    }
    .report-sheet.is-multi .preview-person-card {
      border-radius: 26px;
      border-color: #eaf1ee;
      box-shadow: none;
      background: linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(252,253,252,.98) 100%);
    }
    .preview-person-main {
      display: grid;
      gap: 14px;
      align-content: start;
      min-width: 0;
    }
    .preview-person-ident {
      display: flex;
      gap: 18px;
      align-items: center;
      min-width: 0;
    }
    .preview-avatar {
      width: 60px;
      height: 60px;
      border-radius: 18px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      font-size: 28px;
      font-weight: 900;
      box-shadow: 0 14px 24px rgba(15, 76, 58, .16);
      flex: 0 0 auto;
    }
    .preview-person-copy {
      min-width: 0;
      display: grid;
      gap: 10px;
    }
    .preview-person-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .preview-person-title-row h3 {
      margin: 0;
      font-size: clamp(30px, 3vw, 40px);
      color: var(--text-strong);
      line-height: 1.08;
      letter-spacing: -.02em;
    }
    .preview-meta-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      color: #425a53;
      font-size: 0.94rem;
    }
    .preview-meta-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .preview-meta-chip .notify-icon {
      color: var(--primary);
    }
    .preview-summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .preview-summary-card {
      min-height: 78px;
      padding: 12px 14px;
      border: 1px solid #e6efea;
      border-radius: 14px;
      background: #f8fbf9;
      display: grid;
      gap: 8px;
      align-content: start;
    }
    .preview-summary-card.is-wide {
      grid-column: 1 / -1;
      min-height: 0;
    }
    .preview-summary-head {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #71857f;
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .preview-summary-card strong {
      color: var(--text-main);
      font-size: 1rem;
      line-height: 1.35;
      letter-spacing: -0.01em;
      word-break: break-word;
    }
    .preview-person-side {
      min-width: 0;
      padding: 20px;
      border: 1px solid #dcebe1;
      border-radius: 18px;
      background: linear-gradient(145deg, #f5fbf7 0%, #ecf7f0 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
    }
    .preview-amount-label {
      font-size: 0.82rem;
      color: var(--text-muted);
      font-weight: 700;
    }
    .preview-person-side strong {
      color: var(--primary);
      font-size: clamp(1.9rem, 2.5vw, 2.65rem);
      line-height: 1.02;
      letter-spacing: -.02em;
    }
    .preview-person-side small {
      color: var(--text-muted);
      font-size: 0.88rem;
    }
    .preview-person-body {
      display: grid;
      gap: 12px;
      padding-top: 12px;
    }
    .report-sheet.is-multi .preview-person-body {
      padding-top: 14px;
      padding-left: 0;
      gap: 12px;
    }
    .preview-person-message {
      margin: 0;
      padding: 10px 12px;
      border-left: 3px solid #d5ac62;
      color: #5c5140;
      background: #fffaf1;
      border-radius: 0 10px 10px 0;
      font-size: 0.88rem;
      line-height: 1.55;
    }
    .preview-brief-panel {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr);
      gap: 16px;
      padding: 20px 22px;
      border-radius: var(--radius-lg);
      background: #fffaf3;
      border: 1px solid #f1dfc3;
    }
    .preview-brief-icon {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #fff0d8;
      color: var(--warning);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .preview-brief-icon .notify-icon,
    .preview-brief-icon svg {
      width: 22px;
      height: 22px;
    }
    .preview-brief-panel span {
      display: block;
      color: var(--warning);
      font-size: 1rem;
      font-weight: 900;
      margin-bottom: 6px;
    }
    .preview-brief-panel p {
      margin: 0;
      font-size: 0.97rem;
      line-height: 1.72;
      color: #5f3a16;
    }
    .preview-entry-list {
      display: grid;
      gap: 10px;
    }
    .report-sheet.is-multi .preview-entry-list {
      gap: 10px;
    }
    .preview-entry-card {
      border: 1px solid var(--border-soft);
      border-radius: 14px;
      background: var(--card-bg);
      overflow: hidden;
      box-shadow: var(--shadow-soft);
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr) 148px;
      gap: 0;
      align-items: stretch;
    }
    .preview-entry-card.is-pending {
      border-color: #f0dfb9;
      background: linear-gradient(180deg, #fffdfa 0%, #fff7ea 100%);
    }
    .preview-entry-card.is-complete {
      background: linear-gradient(180deg, #fcfefd 0%, #f6fbf7 100%);
    }
    .report-sheet.is-multi .preview-entry-card {
      border-radius: 16px;
      box-shadow: none;
    }
    .preview-entry-date {
      padding: 14px;
      border-right: 1px solid rgba(232, 239, 236, .92);
      display: grid;
      align-content: start;
      gap: 6px;
      background: rgba(255, 255, 255, .56);
    }
    .preview-entry-date span {
      display: block;
      color: var(--primary-dark);
      font-size: 1rem;
      font-weight: 900;
      letter-spacing: -.02em;
    }
    .preview-entry-date small {
      display: block;
      margin-top: 3px;
      color: var(--text-muted);
      font-size: 0.84rem;
      font-weight: 700;
    }
    .preview-entry-amount {
      padding: 14px;
      border-left: 1px solid rgba(232, 239, 236, .92);
      text-align: right;
      white-space: nowrap;
      display: grid;
      align-content: start;
      justify-items: end;
      background: rgba(255, 255, 255, .56);
    }
    .preview-entry-amount strong {
      display: block;
      color: var(--primary);
      font-size: 1.05rem;
      font-weight: 900;
    }
    .preview-entry-amount small {
      display: block;
      margin-top: 4px;
      color: var(--text-muted);
      font-size: 0.8rem;
    }
    .preview-entry-main {
      display: grid;
      gap: 8px;
      padding: 14px 16px;
      min-width: 0;
    }
    .preview-entry-head {
      display: grid;
      gap: 7px;
    }
    .preview-entry-main h4 {
      margin: 0;
      color: var(--text-strong);
      font-size: 1rem;
      line-height: 1.35;
    }
    .preview-entry-pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .preview-entry-foot {
      display: grid;
      gap: 3px;
      color: var(--text-muted);
      font-size: 0.84rem;
      line-height: 1.42;
    }
    .preview-entry-foot p {
      margin: 0;
    }
    .preview-pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 5px 8px;
      font-weight: 800;
      font-size: 12px;
      white-space: nowrap;
      background: var(--blue-soft);
      color: var(--blue);
    }
    .preview-pill.pending { background: var(--warning-soft); color: var(--warning-dark); border: 1px solid var(--warning-border); }
    .preview-pill.complete { background: var(--primary-soft); color: var(--primary); }
    .preview-pill.neutral { background: #eef3f7; color: #496073; }
    @media (max-width: 1080px) {
      .hero-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .preview-person-card { grid-template-columns: 1fr; }
    }
    @media (max-width: 780px) {
      body { padding: 18px 12px 40px; }
      .utility-bar { flex-direction: column; align-items: flex-start; }
      .hero { padding: 24px 22px; }
      .hero-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sheet-head { flex-direction: column; align-items: flex-start; }
      .preview-person-section { padding: 16px; }
      .preview-person-card { padding: 20px; }
      .preview-person-ident { align-items: flex-start; }
      .preview-person-title-row h3 { font-size: 2rem; }
      .preview-summary-grid { grid-template-columns: 1fr; }
      .preview-summary-card.is-wide { grid-column: auto; }
      .preview-person-side { padding: 18px 20px; }
      .preview-entry-card {
        grid-template-columns: 1fr;
      }
      .preview-entry-date,
      .preview-entry-amount {
        border: 0;
        border-bottom: 1px solid rgba(232, 239, 236, .92);
      }
      .preview-entry-amount {
        justify-items: start;
        text-align: left;
        white-space: normal;
        border-top: 1px solid rgba(232, 239, 236, .92);
        border-bottom: 0;
      }
      .report-sheet.is-multi .preview-person-section {
        padding: 18px 16px 22px;
      }
      .report-sheet.is-multi .preview-person-body {
        padding-left: 0;
      }
    }
    @media print {
      body { background: white; padding: 0; }
      .hero, .report-sheet { box-shadow: none; }
      .preview-person-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <div class="utility-bar">
      <p>${escapeHtml(exportHint)}</p>
      <div>
        <div class="utility-actions">
          <button class="primary" type="button" data-export-image>${escapeHtml(exportLabel)}</button>
          <button class="secondary" type="button" data-print-report>列印 / 另存 PDF</button>
        </div>
        <div class="utility-status" data-export-status></div>
      </div>
    </div>
    <header class="hero">
      <p>Runner Registration Notify Desk</p>
      <h1>${escapeHtml(title)}</h1>
      <small>產生時間：${escapeHtml(todayString())} · 已報名覆蓋率 ${coverageRatio}%</small>
      <section class="hero-stats" aria-label="通知摘要">
        <article class="hero-stat"><span>符合人員</span><strong>${groups.length}</strong></article>
        <article class="hero-stat"><span>涉及賽事</span><strong>${uniqueRaceCount}</strong></article>
        <article class="hero-stat"><span>總紀錄</span><strong>${totalEntries}</strong></article>
        <article class="hero-stat"><span>待處理</span><strong>${totalPending}</strong></article>
        <article class="hero-stat"><span>待收總額</span><strong>${escapeHtml(formatMoney(totalUnpaid))}</strong></article>
      </section>
    </header>
    <section class="report-sheet report-export-root ${singlePersonMode ? "is-single" : "is-multi"}" data-export-root>
      <div class="sheet-head">
        <div>
          <h2>${singlePersonMode ? "報名與繳費確認" : "通知總表"}</h2>
          <p>${singlePersonMode ? "已把需確認的項目整理成一則可直接轉傳的通知。" : "以人員為主軸整理待辦與費用，方便逐一轉傳與追蹤。"}</p>
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

function wireEvents() {
  els.raceSearch.addEventListener("input", applyRaceSearch);
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
      setWorkspaceView(button.dataset.workspaceView || "overview", { scroll: true });
    });
  });
  els.peopleSearch.addEventListener("input", () => {
    state.peopleQuery = els.peopleSearch.value.trim().toLowerCase();
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
  els.entriesSearch.addEventListener("input", () => {
    state.entryQuery = els.entriesSearch.value.trim().toLowerCase();
    state.entriesPage = 1;
    renderEntriesList();
  });
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
    const direction = Number(pageButton.dataset.pageDirection || 0);
    if (pageButton.dataset.pageKind === "people") {
      state.peoplePage += direction;
      renderPeopleList();
      return;
    }
    state.entriesPage += direction;
    renderEntriesList();
  });
  els.raceSelect.addEventListener("change", () => {
    saveSelectedRaceId(els.raceSelect.value);
    renderSelectedRaceSummary(selectedRaceFromDropdown());
    renderOverview();
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
  els.notifySearch?.addEventListener("input", () => {
    state.notifyQuery = els.notifySearch.value.trim().toLowerCase();
    renderNotifyWorkspace();
  });
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
    state.workspaceView = savedWorkspaceView();
    restoreNotifyPreferences();
    await Promise.all([loadRaces(), loadPrivateData()]);
    els.notifyScope.value = state.notifyScope;
    els.notifySearch.value = state.notifyQuery;
    els.notifyProgress.value = state.notifyProgress;
    renderAll();
    wireEvents();
    resetEntryForm();
  } catch (error) {
    showStatus(error.message || "初始化失敗", "error");
  }
}

init();
