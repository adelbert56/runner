import { findDuplicateEntry, paymentAmountPresentation } from "./registration-core.js";
import {
  WORKSPACE_VIEW_HASHES,
  VIEW_WORKSPACE_HASHES,
  state,
  els,
  normalizeMatchValue,
  normalizeArray,
  normalizeDistanceValue,
  normalizeEntryStatusValue,
  showToast,
  todayString,
  escapeHtml,
  formatMoney,
  validatePhoneField,
  validateNationalIdField,
  createId,
  debounce,
} from "./registration.js";
import {
  notifyRaceKey,
  raceId,
  raceName,
  raceCounty,
  raceLocation,
  formatRaceLocation,
  workspaceRaceStatus,
  isSelectableRace,
  dedupeRaceDistances,
  isClosedRaceStatus,
  notifyRangeLabel,
  maskedPhone,
  formatNotifyRangeDate,
  isSameRaceEntry,
  notifyCardMessage,
} from "./registration-copy.js";
import {
  saveWorkspaceView,
  persistAndRender,
  selectedPerson,
  loadPrivateData,
  currentPayload,
  collectPersonForm,
  missingPersonFields,
  collectEntryDraft,
  selectedEntryPersonIds,
  setSidebarCollapsed,
  saveSelectedRaceId,
  saveNotifyPresets,
} from "./registration-data.js";
import {
  entryTimeBucket,
  renderPeopleOptions,
  renderEntriesList,
  renderNotifyPickerLists,
  renderNotifyWorkspace,
  setEntryDistanceOptions,
  renderEntryPersonBatch,
  renderRacePicker,
  renderOverview,
  renderBatchImportPreview,
  renderAll,
  personBasicDataText,
  groupEntriesByRace,
  buildNotifyGroups,
  filteredNotifyEntries,
  statusClass,
  renderPeopleList,
  renderSelectedRaceSummary,
  renderRaceSelectHints,
  updatePeopleBulkToolbar,
  renderNotifyPresetOptions,
} from "./registration-render.js";

let notifyStatusClearTimer = null;

export function workspaceViewFromHash() {
  return WORKSPACE_VIEW_HASHES[window.location.hash] || "";
}

export function setWorkspaceView(view, { scroll = false, syncHash = false } = {}) {
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

export function openEntriesForWork(entryId = "", progress = "all") {
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

export function openNotifyForEntry(entryId) {
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

export function openUnpaidNotifications() {
  state.notifySelectedRaceKeys = new Set();
  state.notifySelectedPersonIds = new Set();
  state.notifyProgress = "unpaid";
  setWorkspaceView("notify", { scroll: true });
  els.notifyProgress.value = state.notifyProgress;
  renderNotifyPickerLists();
  renderNotifyWorkspace();
}

export function syncEntryPersonSelectFromBatch() {
  const [firstPersonId = ""] = [...state.entryBatchPersonIds];
  els.entryPersonId.value = firstPersonId;
}

export function selectedRaceFromDropdown() {
  return state.races.find((race) => String(raceId(race)) === els.raceSelect.value) || null;
}

export function raceByNameAndDate(name, date) {
  const normalizedName = normalizeMatchValue(name);
  const normalizedDate = String(date || "").slice(0, 10);
  return state.races.find((race) => (
    normalizeMatchValue(raceName(race)) === normalizedName
    && String(race.race_date || "").slice(0, 10) === normalizedDate
  )) || null;
}

export async function bulkDeleteSelectedPeople() {
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

export function bulkCopySelectedPeople() {
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

export async function bulkDeleteSelectedEntries() {
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

export async function applyBulkEntryStatus() {
  const ids = [...state.selectedEntryIds];
  if (!ids.length) {
    return;
  }
  const amount = els.bulkStatusAmount.value.trim();
  const date = els.bulkStatusDate.value;
  const method = els.bulkStatusMethod.value;
  state.entries = state.entries.map((entry) => {
    if (!ids.includes(entry.id)) {
      return entry;
    }
    return {
      ...entry,
      isRegistered: els.bulkStatusRegistered.checked,
      isPaid: els.bulkStatusPaid.checked,
      paidAmount: amount ? Number(amount) : entry.paidAmount,
      paymentDate: date || entry.paymentDate,
      paymentMethod: method || entry.paymentMethod,
    };
  });
  els.entriesBulkStatusPanel.hidden = true;
  await persistAndRender(`已更新 ${ids.length} 筆報名狀態`);
}

export function resetPersonForm() {
  els.personForm.reset();
  els.personId.value = "";
}

export function resetEntryForm() {
  const defaultStatus = "待報名";
  els.entryForm.reset();
  els.entryId.value = "";
  els.entryStatus.value = defaultStatus;
  state.entryBatchPersonIds = new Set();
  setEntryDistanceOptions(null, "");
  renderEntryPersonBatch();
}

export function fillEntryFromRace(race) {
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

export function editPerson(personId) {
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

export function editEntry(entryId) {
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

export function duplicateEntryToForm(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }
  state.entryScope = entryTimeBucket(entry);
  state.entryBatchPersonIds = new Set();
  const matchedRace = raceByNameAndDate(entry.raceName, entry.raceDate);
  setEntryDistanceOptions(matchedRace, entry.distance || "");
  els.entryId.value = "";
  els.entryRaceName.value = entry.raceName || "";
  els.entryPersonId.value = "";
  els.entryRaceDate.value = entry.raceDate || "";
  els.entryDistance.value = entry.distance || "";
  els.entryCounty.value = entry.county || "";
  els.entryLocation.value = entry.location || "";
  els.entryRegistrationUrl.value = entry.registrationUrl || "";
  els.entryRegistrationOpensAt.value = entry.registrationOpensAt || "";
  els.entryRegistrationDeadline.value = entry.registrationDeadline || "";
  els.entryShirtSize.value = entry.shirtSize || "";
  els.entryStatus.value = normalizeEntryStatusValue(entry.status);
  els.entryIsRegistered.checked = false;
  els.entryIsPaid.checked = false;
  els.entryRegistrationDate.value = "";
  els.entryPaidAmount.value = "";
  els.entryPaymentDate.value = "";
  els.entryPaymentMethod.value = "";
  els.entryOrderCode.value = "";
  els.entryTransferLastFive.value = "";
  els.entryNotes.value = entry.notes || "";
  renderEntryPersonBatch();
  setWorkspaceView("entries", { scroll: true });
  showStatus(`已複製「${entry.raceName}」的報名內容，請選擇人員後儲存`, "success");
}

export async function deletePerson(personId) {
  if (state.entries.some((entry) => entry.personId === personId)) {
    showStatus("這位人員還有報名紀錄，請先刪除相關紀錄。", "error");
    return;
  }
  state.people = state.people.filter((person) => person.id !== personId);
  await persistAndRender("已刪除人員");
}

export async function deleteEntry(entryId) {
  state.entries = state.entries.filter((entry) => entry.id !== entryId);
  await persistAndRender("已刪除報名紀錄");
}

export function showStatus(message, kind = "success") {
  els.entryStatusMessage.textContent = message;
  els.entryStatusMessage.className = `status-message ${kind}`;
  showToast(message, kind);
}

export function showNotifyStatus(message, kind = "success") {
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

export function applyRaceSearch() {
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

export function downloadBackup() {
  const blob = new Blob([JSON.stringify(currentPayload(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `報名管理備份-${todayString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showStatus("已下載備份檔", "success");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function responseMessage(response, fallback) {
  const body = await response.json().catch(() => null);
  if (body?.message) return body.message;
  const text = await response.text().catch(() => "");
  return text || fallback;
}

export async function downloadBatchWorkbook() {
  const response = await fetch("/api/registration-batch.xlsx", { cache: "no-cache" });
  if (!response.ok) throw new Error(await responseMessage(response, "Excel 匯出失敗"));
  downloadBlob(await response.blob(), `報名管理批次編輯-${todayString()}.xlsx`);
}

export async function previewBatchImport(file) {
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

export async function applyBatchImport() {
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

export function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function safeFilenamePart(value) {
  return String(value || "未命名賽事").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
}

export function phoneLastThree(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.slice(-3).padStart(Math.min(3, digits.length), "*") : "";
}

export function paymentReminderStatus(entry) {
  if (entry.isPaid) {
    return "已繳費";
  }
  if (entry.isRegistered) {
    return "待確認";
  }
  return "尚未報名";
}

export function paymentExportRows(entries) {
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

export function paymentHtmlRows(entries) {
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

export function buildPaymentReminderHtml(race, entries) {
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

export function buildNotifyPreviewHtml(groups, title = "通知卡片預覽") {
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

export function openPreviewWindow(html, title = "預覽") {
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

export function downloadSelectedRacePaymentCsv() {
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

export function downloadSelectedRacePaymentHtml() {
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

export function openNotifyPreview(groups, title = "通知卡片預覽") {
  if (!groups.length) {
    throw new Error("目前篩選條件下沒有可預覽的通知卡片。");
  }
  openPreviewWindow(buildNotifyPreviewHtml(groups, title), title);
}

export async function copyNotifyBatch(groups) {
  if (!groups.length) {
    throw new Error("目前篩選條件下沒有可複製的通知內容。");
  }
  const text = groups.map((group) => notifyCardMessage(group)).join("\n\n----------------\n\n");
  await navigator.clipboard.writeText(text);
}

export async function importBackup(file) {
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

export async function onPersonSubmit(event) {
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
  const returningToEntry = state.pendingEntryReturn;
  state.pendingEntryReturn = false;
  state.focusPersonId = returningToEntry ? "" : person.id;
  await persistAndRender(`已儲存 ${person.name}`);
  resetPersonForm();
  if (returningToEntry) {
    state.entryBatchPersonIds = new Set([person.id]);
    els.entryPersonId.value = person.id;
    renderEntryPersonBatch();
    if (person.defaultShirtSize && !els.entryShirtSize.value) {
      els.entryShirtSize.value = person.defaultShirtSize;
    }
    setWorkspaceView("entries", { scroll: true });
    els.entryForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export async function onEntrySubmit(event) {
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

export function syncBackToTop() {
  const visible = window.scrollY > 360;
  els.backToTop?.classList.toggle("is-visible", visible);
  els.backToTop?.setAttribute("aria-hidden", String(!visible));
}

export function wireEvents() {
  els.raceSearch.addEventListener("input", applyRaceSearch);
  els.personPhone.addEventListener("blur", validatePhoneField);
  els.personNationalId.addEventListener("blur", validateNationalIdField);
  els.peopleBulkToEntry?.addEventListener("click", () => {
    if (!state.selectedPersonIds.size) {
      showStatus("請先勾選人員", "error");
      return;
    }
    state.entryBatchPersonIds = new Set(state.selectedPersonIds);
    syncEntryPersonSelectFromBatch();
    renderEntryPersonBatch();
    state.selectedPersonIds.clear();
    updatePeopleBulkToolbar();
    setWorkspaceView("entries", { scroll: true });
  });
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
  els.entriesBulkStatus?.addEventListener("click", () => {
    els.entriesBulkStatusPanel.hidden = !els.entriesBulkStatusPanel.hidden;
  });
  els.bulkStatusApply?.addEventListener("click", () => {
    applyBulkEntryStatus().catch((error) => showStatus(error.message || "批次更新狀態失敗", "error"));
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
    if (!els.entryId.value && !els.entryRaceName.value.trim()) {
      const race = selectedRaceFromDropdown();
      if (race) {
        fillEntryFromRace(race);
      }
    }
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
  els.notifyPresetSave?.addEventListener("click", () => {
    const name = window.prompt("命名這組篩選", "");
    if (!name || !name.trim()) {
      return;
    }
    const preset = {
      id: createId("notifyPreset"),
      name: name.trim(),
      scope: state.notifyScope,
      progress: state.notifyProgress,
      query: state.notifyQuery,
      selectedRaceKeys: [...state.notifySelectedRaceKeys],
      selectedPersonIds: [...state.notifySelectedPersonIds],
    };
    state.notifyPresets.push(preset);
    saveNotifyPresets(state.notifyPresets);
    renderNotifyPresetOptions();
    showNotifyStatus(`已儲存篩選：${preset.name}`, "success");
  });
  els.notifyPresetSelect?.addEventListener("change", () => {
    const presetId = els.notifyPresetSelect.value;
    if (!presetId) {
      return;
    }
    const preset = state.notifyPresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    state.notifyScope = preset.scope || "active";
    state.notifyProgress = preset.progress || "all";
    state.notifyQuery = preset.query || "";
    state.notifySelectedRaceKeys = new Set(normalizeArray(preset.selectedRaceKeys));
    state.notifySelectedPersonIds = new Set(normalizeArray(preset.selectedPersonIds));
    els.notifyScope.value = state.notifyScope;
    els.notifyProgress.value = state.notifyProgress;
    els.notifySearch.value = state.notifyQuery;
    renderNotifyPickerLists();
    renderNotifyWorkspace();
  });
  els.notifyPresetDelete?.addEventListener("click", () => {
    const presetId = els.notifyPresetSelect?.value;
    if (!presetId) {
      return;
    }
    const preset = state.notifyPresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    if (!window.confirm(`確定刪除篩選「${preset.name}」？此動作無法復原。`)) {
      return;
    }
    state.notifyPresets = state.notifyPresets.filter((item) => item.id !== presetId);
    saveNotifyPresets(state.notifyPresets);
    renderNotifyPresetOptions();
    els.notifyPresetSelect.value = "";
    showNotifyStatus(`已刪除篩選：${preset.name}`, "success");
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
  els.entryAddPerson?.addEventListener("click", () => {
    state.pendingEntryReturn = true;
    resetPersonForm();
    setWorkspaceView("people");
    els.personForm.scrollIntoView({ behavior: "smooth", block: "start" });
    els.personName.focus({ preventScroll: true });
  });
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
