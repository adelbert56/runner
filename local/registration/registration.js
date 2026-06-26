import { findDuplicateEntry } from "./registration-core.js";

const DATA_VERSION = "20260626-registration1";
const SELECTED_RACE_STORAGE_KEY = "runner.registration.selectedRaceId";

const state = {
  races: [],
  filteredRaces: [],
  people: [],
  entries: [],
};

const els = {
  raceSearch: document.querySelector("#race-search"),
  raceSelect: document.querySelector("#race-select"),
  useSelectedRace: document.querySelector("#use-selected-race"),
  exportSelectedRacePayments: document.querySelector("#export-selected-race-payments"),
  exportSelectedRacePaymentHtml: document.querySelector("#export-selected-race-payment-html"),
  racePicker: document.querySelector("#race-picker"),
  peopleList: document.querySelector("#people-list"),
  entriesList: document.querySelector("#entries-list"),
  exportData: document.querySelector("#export-data"),
  importData: document.querySelector("#import-data"),
  entryStatusMessage: document.querySelector("#entry-status-message"),
  summaryRaces: document.querySelector("#summary-races"),
  summaryPeople: document.querySelector("#summary-people"),
  summaryEntries: document.querySelector("#summary-entries"),
  summaryPending: document.querySelector("#summary-pending"),
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
  return new Date().toISOString().slice(0, 10);
}

function normalizeMatchValue(value) {
  return String(value || "").trim().toLowerCase();
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

function dedupeRaceDistances(race) {
  return normalizeArray(race.distances).filter((distance, index, list) => (
    String(distance || "").trim() && list.indexOf(distance) === index
  )).join(" / ");
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

function personLabel(person) {
  const shirt = person.defaultShirtSize ? ` · ${person.defaultShirtSize}` : "";
  return `${person.name}${shirt}`;
}

function selectedPerson() {
  const personId = els.entryPersonId.value;
  return state.people.find((person) => person.id === personId) || null;
}

function currentPayload() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    people: state.people,
    entries: state.entries,
  };
}

async function loadRaces() {
  const response = await fetch(`/site/data/races.json?v=${DATA_VERSION}`, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error("賽事資料讀取失敗");
  }
  const data = await response.json();
  state.races = normalizeArray(data).sort((a, b) => String(a.race_date || "").localeCompare(String(b.race_date || "")));
  state.filteredRaces = state.races;
}

async function loadPrivateData() {
  const response = await fetch("/api/registration-data", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error("本機報名資料讀取失敗");
  }
  const data = await response.json();
  state.people = normalizeArray(data.people).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  state.entries = normalizeArray(data.entries).sort((a, b) => String(a.raceDate || "").localeCompare(String(b.raceDate || "")));
}

async function savePrivateData() {
  const response = await fetch("/api/registration-data", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(currentPayload()),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "儲存失敗");
  }
}

function renderSummary() {
  const pendingCount = state.entries.filter((entry) => !entry.isRegistered || (entry.isRegistered && !entry.isPaid)).length;
  els.summaryRaces.textContent = String(state.races.length);
  els.summaryPeople.textContent = String(state.people.length);
  els.summaryEntries.textContent = String(state.entries.length);
  els.summaryPending.textContent = String(pendingCount);
}

function renderPeopleOptions() {
  const options = ['<option value="">請先選擇人員</option>']
    .concat(state.people.map((person) => (
      `<option value="${escapeHtml(person.id)}">${escapeHtml(personLabel(person))}</option>`
    )));
  els.entryPersonId.innerHTML = options.join("");
}

function renderRacePicker() {
  if (!state.filteredRaces.length) {
    els.raceSelect.innerHTML = '<option value="">找不到符合條件的賽事</option>';
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

function isSameRaceEntry(entry, race) {
  const sameName = normalizeMatchValue(entry.raceName) === normalizeMatchValue(raceName(race));
  const raceDate = String(race.race_date || "").slice(0, 10);
  const sameDate = !raceDate || !entry.raceDate || String(entry.raceDate).slice(0, 10) === raceDate;
  return sameName && sameDate;
}

function renderSelectedRaceSummary(race) {
  if (!race) {
    els.racePicker.innerHTML = '<div class="empty-state">請先選擇賽事</div>';
    return;
  }
  els.racePicker.innerHTML = `
    <article class="race-picker-item compact">
      <h3>${escapeHtml(raceName(race))}</h3>
      <div class="race-picker-meta">
        <span class="meta-pill">${escapeHtml(race.race_date || "日期待補")}</span>
        <span class="meta-pill">${escapeHtml(dedupeRaceDistances(race) || "距離待補")}</span>
        <span class="meta-pill">${escapeHtml(race.registration_status || "狀態待補")}</span>
      </div>
      <p>${escapeHtml(formatRaceLocation(race) || "地點待補")}</p>
      ${race.registration_link ? `<a class="mini-action" href="${escapeHtml(race.registration_link)}" target="_blank" rel="noreferrer">打開報名站</a>` : ""}
    </article>
  `;
}

function renderPeopleList() {
  if (!state.people.length) {
    els.peopleList.innerHTML = '<div class="empty-state">尚未建立人員</div>';
    return;
  }

  els.peopleList.innerHTML = state.people.map((person) => `
    <article class="person-card">
      <h3>${escapeHtml(person.name)}</h3>
      <div class="person-meta">
        ${person.defaultShirtSize ? `<span class="meta-pill">衣服 ${escapeHtml(person.defaultShirtSize)}</span>` : ""}
        ${person.gender ? `<span class="meta-pill">${escapeHtml(person.gender)}</span>` : ""}
        ${person.phone ? `<span class="meta-pill">${escapeHtml(person.phone)}</span>` : ""}
        ${person.nationalId ? `<span class="meta-pill">身分證 ${escapeHtml(String(person.nationalId).slice(-4).padStart(String(person.nationalId).length, "*"))}</span>` : ""}
      </div>
      <p>${escapeHtml(person.emergencyName ? `緊急聯絡：${person.emergencyName} / ${person.emergencyRelationship} / ${person.emergencyPhone}` : "尚無緊急聯絡資料")}</p>
      <div class="card-actions">
        <button class="mini-action" type="button" data-edit-person="${escapeHtml(person.id)}">編輯</button>
        <button class="mini-action" type="button" data-delete-person="${escapeHtml(person.id)}">刪除</button>
      </div>
    </article>
  `).join("");

  els.peopleList.querySelectorAll("[data-edit-person]").forEach((button) => {
    button.addEventListener("click", () => editPerson(button.dataset.editPerson));
  });
  els.peopleList.querySelectorAll("[data-delete-person]").forEach((button) => {
    button.addEventListener("click", () => deletePerson(button.dataset.deletePerson));
  });
}

function statusClass(entry) {
  return entry.isRegistered && entry.isPaid ? "is-complete" : "is-pending";
}

function renderEntriesList() {
  if (!state.entries.length) {
    els.entriesList.innerHTML = '<div class="empty-state">尚未建立報名紀錄</div>';
    return;
  }

  const peopleById = new Map(state.people.map((person) => [person.id, person]));
  els.entriesList.innerHTML = state.entries.map((entry) => {
    const person = peopleById.get(entry.personId);
    const personName = entry.personName || person?.name || "未指定";
    return `
      <article class="entry-card ${statusClass(entry)}">
        <h3>${escapeHtml(entry.raceName || "未命名賽事")}</h3>
        <div class="entry-meta">
          ${entry.raceDate ? `<span class="meta-pill">${escapeHtml(entry.raceDate)}</span>` : ""}
          ${entry.distance ? `<span class="meta-pill">${escapeHtml(entry.distance)}</span>` : ""}
          <span class="meta-pill">${escapeHtml(personName)}</span>
          ${entry.shirtSize ? `<span class="meta-pill">衣服 ${escapeHtml(entry.shirtSize)}</span>` : ""}
          <span class="meta-pill">${escapeHtml(entry.status || "待報名")}</span>
        </div>
        <p>${escapeHtml([entry.county, entry.location].filter(Boolean).join(" · ") || "地點未填")}</p>
        <p>${escapeHtml(`報名: ${entry.isRegistered ? "是" : "否"} / 繳費: ${entry.isPaid ? "是" : "否"}`)}</p>
        <div class="card-actions">
          <button class="mini-action" type="button" data-edit-entry="${escapeHtml(entry.id)}">編輯</button>
          <button class="mini-action" type="button" data-delete-entry="${escapeHtml(entry.id)}">刪除</button>
        </div>
      </article>
    `;
  }).join("");

  els.entriesList.querySelectorAll("[data-edit-entry]").forEach((button) => {
    button.addEventListener("click", () => editEntry(button.dataset.editEntry));
  });
  els.entriesList.querySelectorAll("[data-delete-entry]").forEach((button) => {
    button.addEventListener("click", () => deleteEntry(button.dataset.deleteEntry));
  });
}

function renderAll() {
  renderSummary();
  renderPeopleOptions();
  renderRacePicker();
  renderPeopleList();
  renderEntriesList();
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
}

function fillEntryFromRace(race) {
  els.entryId.value = "";
  els.entryRaceName.value = raceName(race);
  els.entryRaceDate.value = String(race.race_date || "").slice(0, 10);
  els.entryDistance.value = dedupeRaceDistances(race);
  els.entryCounty.value = raceCounty(race);
  els.entryLocation.value = raceLocation(race);
  els.entryRegistrationUrl.value = race.registration_link || "";
  els.entryRegistrationOpensAt.value = String(race.registration_opens_at || "").slice(0, 10);
  els.entryRegistrationDeadline.value = String(race.registration_deadline || "").slice(0, 10);
  els.entryStatus.value = race.registration_status === "未開始" ? "尚未開報" : race.registration_status === "報名中" ? "可報名" : race.registration_status || "待報名";
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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function editEntry(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }
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
  els.entryStatus.value = entry.status || "待報名";
  els.entryIsRegistered.checked = Boolean(entry.isRegistered);
  els.entryIsPaid.checked = Boolean(entry.isPaid);
  els.entryRegistrationDate.value = entry.registrationDate || "";
  els.entryPaidAmount.value = entry.paidAmount ?? "";
  els.entryPaymentDate.value = entry.paymentDate || "";
  els.entryPaymentMethod.value = entry.paymentMethod || "";
  els.entryOrderCode.value = entry.orderCode || "";
  els.entryTransferLastFive.value = entry.transferLastFive || "";
  els.entryNotes.value = entry.notes || "";
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

function collectEntryForm() {
  const person = state.people.find((item) => item.id === els.entryPersonId.value);
  return {
    id: els.entryId.value || createId("entry"),
    personId: els.entryPersonId.value,
    personName: person?.name || "",
    raceName: els.entryRaceName.value.trim(),
    raceDate: els.entryRaceDate.value,
    distance: els.entryDistance.value.trim(),
    county: els.entryCounty.value.trim(),
    location: els.entryLocation.value.trim(),
    registrationUrl: els.entryRegistrationUrl.value.trim(),
    registrationOpensAt: els.entryRegistrationOpensAt.value,
    registrationDeadline: els.entryRegistrationDeadline.value,
    shirtSize: els.entryShirtSize.value,
    status: els.entryStatus.value,
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

function applyRaceSearch() {
  const query = els.raceSearch.value.trim().toLowerCase();
  state.filteredRaces = state.races.filter((race) => {
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
    const location = [entry.county, entry.location].filter(Boolean).join(" · ");
    return `
      <tr class="${statusClassName}">
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(status)}</strong></td>
        <td>${escapeHtml(entry.personName || person.name || "")}</td>
        <td>${escapeHtml(entry.distance || "")}</td>
        <td>${escapeHtml(entry.shirtSize || person.defaultShirtSize || "")}</td>
        <td>${escapeHtml(phoneLastThree(person.phone))}</td>
        <td>${escapeHtml(entry.isRegistered ? "是" : "否")}</td>
        <td>${escapeHtml(entry.isPaid ? "是" : "否")}</td>
        <td>${escapeHtml(entry.paidAmount ?? "")}</td>
        <td>${escapeHtml(entry.paymentMethod || "")}</td>
        <td>${escapeHtml(entry.transferLastFive || "")}</td>
        <td>${escapeHtml(entry.notes || "")}</td>
        <td>${escapeHtml(location)}</td>
      </tr>
    `;
  }).join("");
}

function buildPaymentReminderHtml(race, entries) {
  const paidCount = entries.filter((entry) => entry.isPaid).length;
  const dueCount = entries.filter((entry) => entry.isRegistered && !entry.isPaid).length;
  const notRegisteredCount = entries.filter((entry) => !entry.isRegistered).length;
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
      background:
        radial-gradient(circle at 88% 8%, rgba(209, 236, 214, .72), transparent 30%),
        radial-gradient(circle at 8% 92%, rgba(255, 229, 170, .38), transparent 32%),
        linear-gradient(180deg, #fbf8ef, #f0eadf);
      padding: 28px;
    }
    main {
      max-width: 1280px;
      margin: 0 auto;
      background: rgba(255, 253, 247, .96);
      border: 1px solid rgba(24, 55, 45, .14);
      border-radius: 28px;
      box-shadow: 0 22px 54px rgba(41, 51, 31, .12);
      padding: 28px;
    }
    .header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 18px;
      align-items: start;
      margin-bottom: 22px;
    }
    .eyebrow {
      margin: 0 0 8px;
      color: #0d6245;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: clamp(30px, 4vw, 54px);
      line-height: 1.12;
      color: #102920;
    }
    .subtitle {
      margin: 12px 0 0;
      color: #51685d;
      font-size: 17px;
      line-height: 1.7;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 18px 0 24px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      background: #dff2e2;
      color: #145d43;
      font-weight: 800;
      padding: 8px 12px;
    }
    .stamp {
      min-width: 156px;
      border: 1px solid rgba(13, 98, 69, .16);
      border-radius: 22px;
      background: #eef8ef;
      color: #0d6245;
      padding: 16px;
      text-align: center;
    }
    .stamp span {
      display: block;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .stamp strong {
      display: block;
      margin-top: 8px;
      font-size: 24px;
      line-height: 1;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .summary article {
      border: 1px solid rgba(24, 55, 45, .12);
      border-radius: 18px;
      background: linear-gradient(180deg, #fffdf8, #fbf5e8);
      padding: 14px;
    }
    .summary span {
      display: block;
      color: #587065;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .summary strong {
      display: block;
      color: #073b2b;
      font-size: 34px;
      line-height: 1;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      overflow: hidden;
      border: 1px solid rgba(24, 55, 45, .14);
      border-radius: 18px;
      background: #fffdf8;
    }
    th, td {
      border-bottom: 1px solid rgba(24, 55, 45, .1);
      padding: 13px 12px;
      text-align: left;
      vertical-align: top;
      font-size: 15px;
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
    tr.due td { background: #fff5d6; }
    tr.not-registered td { background: #f4f0e8; color: #60736a; }
    tr.paid td { background: #edf8ef; }
    td strong {
      display: inline-flex;
      border-radius: 999px;
      padding: 5px 9px;
      background: rgba(255, 255, 255, .7);
      color: #0f4f3a;
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
      <article><span>待確認</span><strong>${dueCount}</strong></article>
      <article><span>尚未報名</span><strong>${notRegisteredCount}</strong></article>
      <article><span>已繳費</span><strong>${paidCount}</strong></article>
    </section>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>繳費狀態</th>
          <th>姓名</th>
          <th>距離</th>
          <th>衣服</th>
          <th>手機末三碼</th>
          <th>已報名</th>
          <th>已繳費</th>
          <th>金額</th>
          <th>方式</th>
          <th>後五碼</th>
          <th>備註</th>
          <th>地點</th>
        </tr>
      </thead>
      <tbody>${paymentHtmlRows(entries)}</tbody>
    </table>
    <p class="note">此檔案由本機報名管理產生，僅供隊內報名與繳費核對使用。</p>
  </main>
</body>
</html>`;
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
    showStatus(`目前沒有 ${raceName(race)} 的報名紀錄可匯出。`, "error");
    return;
  }
  const html = buildPaymentReminderHtml(race, entries);
  const filename = `繳費確認截圖-${String(race.race_date || "日期待補").slice(0, 10)}-${safeFilenamePart(raceName(race))}-${todayString()}.html`;
  downloadTextFile(filename, html, "text/html;charset=utf-8");
  showStatus(`已匯出 ${raceName(race)} 繳費確認 HTML，共 ${entries.length} 筆。`, "success");
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
  await persistAndRender(`已儲存 ${person.name}`);
  resetPersonForm();
}

async function onEntrySubmit(event) {
  event.preventDefault();
  const entry = collectEntryForm();
  if (!entry.raceName || !entry.personId) {
    showStatus("賽事與參加人員都必須填寫。", "error");
    return;
  }
  const duplicate = findDuplicateEntry(state.entries, entry);
  if (duplicate) {
    showStatus(`已存在同一人、同一賽事、同一距離的紀錄：${duplicate.raceName}`, "error");
    return;
  }
  state.entries = state.entries.filter((item) => item.id !== entry.id).concat(entry);
  await persistAndRender(`已儲存 ${entry.raceName} 的報名紀錄`);
  resetEntryForm();
}

function wireEvents() {
  els.raceSearch.addEventListener("input", applyRaceSearch);
  els.raceSelect.addEventListener("change", () => {
    saveSelectedRaceId(els.raceSelect.value);
    renderSelectedRaceSummary(selectedRaceFromDropdown());
  });
  els.useSelectedRace.addEventListener("click", () => {
    const race = selectedRaceFromDropdown();
    if (race) {
      fillEntryFromRace(race);
    }
  });
  els.exportSelectedRacePayments.addEventListener("click", downloadSelectedRacePaymentCsv);
  els.exportSelectedRacePaymentHtml.addEventListener("click", downloadSelectedRacePaymentHtml);
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
    if (person && !els.entryShirtSize.value) {
      els.entryShirtSize.value = person.defaultShirtSize || "";
    }
  });
}

async function init() {
  try {
    await Promise.all([loadRaces(), loadPrivateData()]);
    renderAll();
    wireEvents();
    resetEntryForm();
  } catch (error) {
    showStatus(error.message || "初始化失敗", "error");
  }
}

init();
