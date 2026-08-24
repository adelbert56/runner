import {
  state,
  els,
  todayString,
  clampNumber,
  escapeHtml,
  PEOPLE_PAGE_SIZE,
  ENTRY_GROUP_PAGE_SIZE,
  normalizeDistanceValue,
  normalizeArray,
  normalizeMatchValue,
  formatMoney,
} from "./registration.js";
import {
  maskedPhone,
  notifyRaceKey,
  notifyRaceLabel,
  overviewStatusTag,
  pendingTone,
  notifyMetaItem,
  notifySummaryFacts,
  notifyIcon,
  notifyCardPreviewSummary,
  isSelectableRace,
  personLabel,
  raceId,
  compactRaceOptionLabel,
  raceCounty,
  formatRaceLocation,
  raceDateTag,
  dedupeRaceDistances,
  isSameRaceEntry,
  raceName,
  workspaceRaceStatus,
  avatarColor,
} from "./registration-copy.js";
import { saveNotifyPreferences, savedSelectedRaceId, saveSelectedRaceId, savePageSizePreferences } from "./registration-data.js";
import {
  syncEntryPersonSelectFromBatch,
  selectedRaceFromDropdown,
  editPerson,
  deletePerson,
  showStatus,
  setWorkspaceView,
  editEntry,
  duplicateEntryToForm,
  deleteEntry,
} from "./registration-actions.js";

export function entryTimeBucket(entry) {
  const raceDate = String(entry.raceDate || "").slice(0, 10);
  if (raceDate && raceDate < todayString()) {
    return "history";
  }
  return "active";
}

export function paginateItems(items, page, pageSize) {
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

export function paginationPageNumbers(page, totalPages) {
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

export function renderPagination(target, kind, pagination) {
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
    ? `<label class="pagination-page-size">每頁顯示<select data-people-page-size aria-label="每頁顯示筆數"><option value="10"${state.peoplePageSize === 10 ? " selected" : ""}>10 筆</option><option value="20"${state.peoplePageSize === 20 ? " selected" : ""}>20 筆</option><option value="30"${state.peoplePageSize === 30 ? " selected" : ""}>30 筆</option><option value="40"${state.peoplePageSize === 40 ? " selected" : ""}>40 筆</option><option value="50"${state.peoplePageSize === 50 ? " selected" : ""}>50 筆</option><option value="all"${state.peoplePageSize === "all" ? " selected" : ""}>全部</option></select></label>`
    : kind === "entries"
      ? `<label class="pagination-page-size">每頁顯示<select data-entries-page-size aria-label="每頁顯示賽事筆數"><option value="5"${state.entriesPageSize === 5 ? " selected" : ""}>5 筆</option><option value="10"${state.entriesPageSize === 10 ? " selected" : ""}>10 筆</option><option value="15"${state.entriesPageSize === 15 ? " selected" : ""}>15 筆</option><option value="20"${state.entriesPageSize === 20 ? " selected" : ""}>20 筆</option><option value="all"${state.entriesPageSize === "all" ? " selected" : ""}>全部</option></select></label>`
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

export function personSearchText(person) {
  return [
    person.name,
    person.phone,
    maskedPhone(person.phone),
    String(person.nationalId || "").slice(-4),
    person.defaultShirtSize,
  ].join(" ").toLowerCase();
}

export function entrySearchText(entry) {
  return [
    entry.raceName,
    entry.personName,
    entry.distance,
    entry.county,
    entry.location,
    entry.status,
  ].join(" ").toLowerCase();
}

export function entryYear(entry) {
  return String(entry.raceDate || "").slice(0, 4) || "未定年";
}

export function personStats(personId) {
  const entries = state.entries.filter((entry) => entry.personId === personId);
  const activeEntries = entries.filter((entry) => entryTimeBucket(entry) === "active");
  const historyEntries = entries.filter((entry) => entryTimeBucket(entry) === "history");
  return {
    active: activeEntries.length,
    history: historyEntries.length,
    pending: activeEntries.filter((entry) => !entry.isRegistered || !entry.isPaid).length,
  };
}

export function historySummary(entries) {
  const historyEntries = entries.filter((entry) => entryTimeBucket(entry) === "history");
  const years = [...new Set(historyEntries.map((entry) => entryYear(entry)).filter(Boolean))];
  const paidCount = historyEntries.filter((entry) => entry.isPaid).length;
  return {
    total: historyEntries.length,
    paidCount,
    years: years.length,
  };
}

export function selectedNotifyRaceKeys() {
  return state.notifySelectedRaceKeys;
}

export function selectedNotifyPersonIds() {
  return state.notifySelectedPersonIds;
}

export function notifySearchText(entry, person) {
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

export function notifyEntryMatchesProgress(entry) {
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

export function filteredNotifyEntries() {
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

export function buildNotifyGroups(entries) {
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

export function renderNotifyPickerLists() {
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

export function renderNotifyPresetOptions() {
  if (!els.notifyPresetSelect) {
    return;
  }
  const currentValue = els.notifyPresetSelect.value;
  const options = ['<option value="">套用常用篩選…</option>']
    .concat(state.notifyPresets.map((preset) => (
      `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`
    )));
  els.notifyPresetSelect.innerHTML = options.join("");
  if (state.notifyPresets.some((preset) => preset.id === currentValue)) {
    els.notifyPresetSelect.value = currentValue;
  }
}

export function renderNotifyWorkspace() {
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

export function renderSummary() {
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

export function renderPeopleOptions() {
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

export function renderEntryPersonBatch() {
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

export function renderRacePicker() {
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

export function renderRaceSelectHints(race) {
  if (!els.raceSelectHints) return;
  if (!race) {
    els.raceSelectHints.innerHTML = "";
    return;
  }
  const location = raceCounty(race) || formatRaceLocation(race);
  const hints = [raceDateTag(race), dedupeRaceDistances(race), location].filter(Boolean);
  els.raceSelectHints.innerHTML = hints.map((hint) => `<span>${escapeHtml(hint)}</span>`).join("");
}

export function distanceOptions(values, selectedValue = "", emptyLabel = "請選擇組別") {
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

export function setEntryDistanceOptions(race, selectedValue = "") {
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

export function raceEntryStats(race) {
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

export function renderSelectedRaceSummary(race) {
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

export function personBasicDataRows(person) {
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

export function personBasicDataText(person) {
  return personBasicDataRows(person)
    .map(([label, value]) => `${label}：${String(value || "").trim() || "未填"}`)
    .join("\n");
}

export function renderPersonBasicDetails(person) {
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

export function renderEntryPersonDetails(person) {
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

export function updatePeopleBulkToolbar() {
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

export function isPeopleFilterActive() {
  return state.peopleFilters.gender !== "all"
    || state.peopleFilters.size !== "all"
    || state.peopleFilters.pending !== "all";
}

export function renderPeopleList() {
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

  const peoplePageSize = state.peoplePageSize === "all"
    ? Math.max(1, sortedPeople.length)
    : Number(state.peoplePageSize) || PEOPLE_PAGE_SIZE;
  if (state.focusPersonId) {
    const focusIndex = sortedPeople.findIndex((person) => person.id === state.focusPersonId);
    if (focusIndex >= 0) {
      state.peoplePage = Math.floor(focusIndex / peoplePageSize) + 1;
    }
  }
  const pagination = paginateItems(sortedPeople, state.peoplePage, peoplePageSize);
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
    state.peoplePageSize = event.target.value === "all" ? "all" : Number(event.target.value) || PEOPLE_PAGE_SIZE;
    state.peoplePage = 1;
    state.focusPersonId = "";
    savePageSizePreferences();
    renderPeopleList();
  });
  updatePeopleBulkToolbar();
}

export function statusClass(entry) {
  return entry.isRegistered && entry.isPaid ? "is-complete" : "is-pending";
}

export function entryGroupKey(entry) {
  return [
    normalizeMatchValue(entry.raceName),
    String(entry.raceDate || "").slice(0, 10),
  ].join("::");
}

export function groupEntriesByRace(entries) {
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

export function uniqueGroupDistances(group) {
  return group.entries.reduce((distances, entry) => {
    const distance = normalizeDistanceValue(entry.distance);
    if (distance && !distances.includes(distance)) {
      distances.push(distance);
    }
    return distances;
  }, []);
}

export function groupDistanceLabel(group) {
  const distances = uniqueGroupDistances(group);
  if (!distances.length) {
    return "";
  }
  if (distances.length <= 3) {
    return distances.join(" / ");
  }
  return `${distances.slice(0, 2).join(" / ")} 等 ${distances.length} 組`;
}

export function renderOverview() {
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

export function updateEntriesBulkToolbar() {
  if (!els.entriesBulkToolbar) {
    return;
  }
  const count = state.selectedEntryIds.size;
  els.entriesBulkToolbar.hidden = count === 0;
  if (count === 0 && els.entriesBulkStatusPanel) {
    els.entriesBulkStatusPanel.hidden = true;
  }
  const countEl = els.entriesBulkToolbar.querySelector(".bulk-toolbar-count");
  if (countEl) {
    countEl.textContent = `已選 ${count} 筆`;
  }
}

export function isEntriesFilterActive() {
  return Boolean(state.entryQuery)
    || Boolean(state.entryFilterPersonId)
    || state.entryFilterProgress !== "all"
    || Boolean(state.entryFilterStatus)
    || state.entryHistoryYear !== "all";
}

export function renderEntriesList() {
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
  const entryPageSize = state.entriesPageSize === "all"
    ? Math.max(1, groupedEntries.length)
    : Number(state.entriesPageSize) || ENTRY_GROUP_PAGE_SIZE;
  if (state.focusEntryId) {
    const focusGroupIndex = groupedEntries.findIndex((group) => group.entries.some((entry) => entry.id === state.focusEntryId));
    if (focusGroupIndex >= 0) {
      state.entriesPage = Math.floor(focusGroupIndex / entryPageSize) + 1;
    }
  }
  const pagination = paginateItems(groupedEntries, state.entriesPage, entryPageSize);
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
                    <button class="mini-action" type="button" data-duplicate-entry="${escapeHtml(entry.id)}">複製</button>
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
  els.entriesList.querySelectorAll("[data-duplicate-entry]").forEach((button) => {
    button.addEventListener("click", () => duplicateEntryToForm(button.dataset.duplicateEntry));
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
  els.entriesPagination.querySelector("[data-entries-page-size]")?.addEventListener("change", (event) => {
    state.entriesPageSize = event.target.value === "all" ? "all" : Number(event.target.value) || ENTRY_GROUP_PAGE_SIZE;
    state.entriesPage = 1;
    state.focusEntryId = "";
    savePageSizePreferences();
    renderEntriesList();
  });
  updateEntriesBulkToolbar();
}

export function renderAll() {
  renderSummary();
  renderPeopleOptions();
  renderEntryPersonBatch();
  renderRacePicker();
  renderOverview();
  renderPeopleList();
  renderEntriesList();
  renderNotifyPickerLists();
  renderNotifyWorkspace();
  renderNotifyPresetOptions();
  setWorkspaceView(state.workspaceView);
  focusRenderedCard();
}

export function focusRenderedCard() {
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

export function renderBatchImportPreview() {
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
