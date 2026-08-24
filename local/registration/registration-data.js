import {
  state,
  els,
  DATA_VERSION,
  SELECTED_RACE_STORAGE_KEY,
  WORKSPACE_VIEW_STORAGE_KEY,
  NOTIFY_PREFS_STORAGE_KEY,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  normalizeArray,
  normalizeDistanceValue,
  normalizeEntryStatusValue,
  createId,
  updateLastSavedIndicator,
} from "./registration.js";
import { isSelectableRace } from "./registration-copy.js";
import { renderAll } from "./registration-render.js";
import { showStatus } from "./registration-actions.js";

export function savedSelectedRaceId() {
  try {
    return localStorage.getItem(SELECTED_RACE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveSelectedRaceId(value) {
  try {
    localStorage.setItem(SELECTED_RACE_STORAGE_KEY, String(value || ""));
  } catch {
    // The picker still works if browser storage is unavailable.
  }
}

export function saveWorkspaceView(value) {
  try {
    localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, String(value || "overview"));
  } catch {
    // Workspace switching still works without storage.
  }
}

export function savedWorkspaceView() {
  try {
    return localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY) || "overview";
  } catch {
    return "overview";
  }
}

export function savedSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(collapsed) {
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

export function saveNotifyPreferences() {
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

export function restoreNotifyPreferences() {
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

export function selectedPerson() {
  const personId = els.entryPersonId.value;
  return state.people.find((person) => person.id === personId) || null;
}

export function currentPayload() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    baseUpdatedAt: state.lastKnownUpdatedAt,
    people: state.people,
    entries: state.entries,
  };
}

export async function loadRaces() {
  const response = await fetch(`/site/data/races.json?v=${DATA_VERSION}`, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error("賽事資料讀取失敗");
  }
  const data = await response.json();
  state.races = normalizeArray(data).sort((a, b) => String(a.race_date || "").localeCompare(String(b.race_date || "")));
  state.filteredRaces = state.races.filter(isSelectableRace);
}

export async function loadPrivateData() {
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

export async function savePrivateData() {
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

export async function persistAndRender(message) {
  state.people.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  state.entries.sort((a, b) => String(a.raceDate || "").localeCompare(String(b.raceDate || "")) || String(a.raceName || "").localeCompare(String(b.raceName || "")));
  await savePrivateData();
  renderAll();
  updateLastSavedIndicator();
  showStatus(message, "success");
}

export function collectPersonForm() {
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

export function missingPersonFields(person) {
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

export function collectEntryDraft() {
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

export function selectedEntryPersonIds() {
  if (els.entryId.value) {
    return els.entryPersonId.value ? [els.entryPersonId.value] : [];
  }
  if (state.entryBatchPersonIds.size) {
    return [...state.entryBatchPersonIds];
  }
  return els.entryPersonId.value ? [els.entryPersonId.value] : [];
}
