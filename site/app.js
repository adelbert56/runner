const DEVICE_KEY = "runner-plaza:device-id";
const LEGACY_FAVORITES_KEY = "runner-plaza:favorites";
const DEVICE_ID = getDeviceId();
const FAVORITES_KEY = `runner-plaza:${DEVICE_ID}:favorites`;
const CONTENT_FAVORITES_KEY = `runner-plaza:${DEVICE_ID}:content-favorites`;
const PLAN_KEY = `runner-plaza:${DEVICE_ID}:training-plan`;
const TODAY = "2026-05-15";

const state = {
  races: [],
  county: "all",
  difficulty: "all",
  registration: "all",
  distance: "all",
  month: "all",
  query: "",
  favorites: new Set(),
  contentFavorites: new Set(),
  favoritesOnly: false,
  shoeFavoritesOnly: false,
  newsFavoritesOnly: false,
  trainingRaceKey: "",
  planWeek: 1,
};

const els = {
  raceCount: document.querySelector("#race-count"),
  favoriteCount: document.querySelector("#favorite-count"),
  nextRace: document.querySelector("#next-race"),
  heroNextRace: document.querySelector("#hero-next-race"),
  search: document.querySelector("#race-search"),
  raceList: document.querySelector("#race-list"),
  monthList: document.querySelector("#month-list"),
  resultCount: document.querySelector("#result-count"),
  favoriteFilter: document.querySelector("#favorite-filter"),
  clearFilters: document.querySelector("#clear-filters"),
  countyButtons: document.querySelectorAll("[data-county]"),
  difficultyButtons: document.querySelectorAll("[data-difficulty]"),
  registrationButtons: document.querySelectorAll("[data-registration]"),
  distanceButtons: document.querySelectorAll("[data-distance]"),
  planBuilder: document.querySelector("#plan-builder"),
  planAthlete: document.querySelector("#plan-athlete"),
  planExperience: document.querySelector("#plan-experience"),
  planGoal: document.querySelector("#plan-goal"),
  planFinish: document.querySelector("#plan-finish"),
  planFinishHour: document.querySelector("#plan-finish-hour"),
  planFinishMinute: document.querySelector("#plan-finish-minute"),
  planFinishSecond: document.querySelector("#plan-finish-second"),
  planPace: document.querySelector("#plan-pace"),
  planPaceMinute: document.querySelector("#plan-pace-minute"),
  planPaceSecond: document.querySelector("#plan-pace-second"),
  planRaceDate: document.querySelector("#plan-race-date"),
  planLevel: document.querySelector("#plan-level"),
  planInjury: document.querySelector("#plan-injury"),
  planDays: document.querySelector("#plan-days"),
  planWeeks: document.querySelector("#plan-weeks"),
  planWeeklyKm: document.querySelector("#plan-weekly-km"),
  planLongRun: document.querySelector("#plan-long-run"),
  planLongRunDay: document.querySelector("#plan-long-run-day"),
  planPriority: document.querySelector("#plan-priority"),
  planIntensity: document.querySelector("#plan-intensity"),
  planOutput: document.querySelector("#plan-output"),
  panelLinks: document.querySelectorAll("[data-panel-link]"),
  panels: document.querySelectorAll("[data-panel]"),
  backTop: document.querySelector("#back-top"),
  shoeSort: document.querySelector("#shoe-sort"),
  newsSort: document.querySelector("#news-sort"),
  shoeLimit: document.querySelector("#shoe-limit"),
  newsLimit: document.querySelector("#news-limit"),
  shoeFavoriteFilter: document.querySelector("#shoe-favorite-filter"),
  newsFavoriteFilter: document.querySelector("#news-favorite-filter"),
};

const monthNames = {
  "01": "1月",
  "02": "2月",
  "03": "3月",
  "04": "4月",
  "05": "5月",
  "06": "6月",
  "07": "7月",
  "08": "8月",
  "09": "9月",
  "10": "10月",
  "11": "11月",
  "12": "12月",
};

const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

const difficultyClass = {
  "初級": "beginner",
  "中級": "middle",
  "高級": "hard",
};

const planProfiles = {
  "5k": {
    title: "5K 入門",
    distanceKm: 5,
    longRun: "4-7km",
    focus: "建立連續跑能力",
    benchmark: "能舒服完成 30 分鐘慢跑",
    defaultPace: 420,
  },
  "10k": {
    title: "10K 穩定完賽",
    distanceKm: 10,
    longRun: "7-12km",
    focus: "穩定週跑量與節奏感",
    benchmark: "能舒服完成 60 分鐘慢跑",
    defaultPace: 390,
  },
  half: {
    title: "半馬備賽",
    distanceKm: 21.0975,
    longRun: "12-20km",
    focus: "長跑耐力與補給演練",
    benchmark: "長跑能到 18km 且隔天可正常恢復",
    defaultPace: 405,
  },
  marathon: {
    title: "全馬基礎",
    distanceKm: 42.195,
    longRun: "18-30km",
    focus: "耐力、補給、恢復管理",
    benchmark: "連續 8 週穩定跑量後再拉長跑",
    defaultPace: 420,
  },
};

const levelProfiles = {
  beginner: {
    label: "新手",
    easy: "跑走交替",
    quality: "短加速 6 組",
    note: "覺得喘就改成走跑，不追配速。",
  },
  steady: {
    label: "有規律慢跑",
    easy: "輕鬆跑",
    quality: "節奏跑 15-25 分鐘",
    note: "一週只安排一堂有強度的課。",
  },
  advanced: {
    label: "想加強配速",
    easy: "輕鬆跑加加速跑",
    quality: "間歇或節奏跑",
    note: "快課隔天固定輕鬆跑或休息。",
  },
};

const experienceLabels = {
  rookie: "未滿 6 個月",
  regular: "6 個月以上",
  seasoned: "2 年以上",
};

const injuryLabels = {
  none: "目前無傷",
  tight: "偶爾緊繃",
  recovering: "剛恢復訓練",
};

const intensityLabels = {
  safe: "保守穩定",
  balanced: "均衡進步",
  push: "積極突破",
};

const weekdayLabels = {
  tue: "週二",
  wed: "週三",
  thu: "週四",
  fri: "週五",
  sat: "週六",
  sun: "週日",
};

function getDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) {
      return existing;
    }
    const id = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return "browser";
  }
}

function setActivePanel(panelId, updateHash = true) {
  const nextPanel = [...els.panels].some((panel) => panel.dataset.panel === panelId)
    ? panelId
    : "races";

  els.panels.forEach((panel) => {
    const active = panel.dataset.panel === nextPanel;
    panel.classList.toggle("active", active);
    panel.toggleAttribute("hidden", !active);
  });

  els.panelLinks.forEach((link) => {
    const active = link.dataset.panelLink === nextPanel;
    link.classList.toggle("active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  });

  if (updateHash && window.location.hash !== `#${nextPanel}`) {
    history.pushState(null, "", `#${nextPanel}`);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadFavorites() {
  try {
    const storedValue = localStorage.getItem(FAVORITES_KEY) || localStorage.getItem(LEGACY_FAVORITES_KEY) || "[]";
    const stored = JSON.parse(storedValue);
    state.favorites = new Set(Array.isArray(stored) ? stored : []);
    saveFavorites();
  } catch {
    state.favorites = new Set();
  }
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
}

function loadContentFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem(CONTENT_FAVORITES_KEY) || "[]");
    state.contentFavorites = new Set(Array.isArray(stored) ? stored : []);
  } catch {
    state.contentFavorites = new Set();
  }
}

function saveContentFavorites() {
  localStorage.setItem(CONTENT_FAVORITES_KEY, JSON.stringify([...state.contentFavorites]));
}

function getPlanControls() {
  return [
    ["athlete", els.planAthlete],
    ["experience", els.planExperience],
    ["goal", els.planGoal],
    ["finish", els.planFinish],
    ["pace", els.planPace],
    ["raceDate", els.planRaceDate],
    ["level", els.planLevel],
    ["injury", els.planInjury],
    ["days", els.planDays],
    ["weeks", els.planWeeks],
    ["weeklyKm", els.planWeeklyKm],
    ["longRun", els.planLongRun],
    ["longRunDay", els.planLongRunDay],
    ["priority", els.planPriority],
    ["intensity", els.planIntensity],
  ];
}

function loadPlanSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAN_KEY) || "{}");
    getPlanControls().forEach(([key, control]) => {
      if (control && stored[key]) {
        control.value = normalizeControlValue(control, stored[key]);
      }
    });
    state.trainingRaceKey = stored.trainingRaceKey || "";
    state.planWeek = Number(stored.planWeek) || 1;
  } catch {
    state.trainingRaceKey = "";
    state.planWeek = 1;
  }
}

function savePlanSettings() {
  const payload = getPlanControls().reduce((acc, [key, control]) => {
    if (control) {
      acc[key] = control.value;
    }
    return acc;
  }, {});
  payload.trainingRaceKey = state.trainingRaceKey;
  payload.planWeek = state.planWeek;
  localStorage.setItem(PLAN_KEY, JSON.stringify(payload));
}

function normalizeControlValue(control, value) {
  return value;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function optionRange(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const value = start + index;
    return `<option value="${value}">${pad2(value)}</option>`;
  }).join("");
}

function setupDurationPickers() {
  if (!els.planFinishHour || !els.planPaceMinute) {
    return;
  }
  els.planFinishHour.innerHTML = optionRange(0, 12);
  els.planFinishMinute.innerHTML = optionRange(0, 59);
  els.planFinishSecond.innerHTML = optionRange(0, 59);
  els.planPaceMinute.innerHTML = optionRange(3, 12);
  els.planPaceSecond.innerHTML = optionRange(0, 59);
  syncDurationPickersFromInputs();
}

function syncDurationPickersFromInputs() {
  const finish = parseDurationParts(els.planFinish?.value || "1:05:00");
  const pace = parseDurationParts(els.planPace?.value || "6:30");
  if (els.planFinishHour) {
    els.planFinishHour.value = String(finish.hours);
    els.planFinishMinute.value = String(finish.minutes);
    els.planFinishSecond.value = String(finish.seconds);
  }
  if (els.planPaceMinute) {
    const paceMinutes = pace.hours * 60 + pace.minutes;
    els.planPaceMinute.value = String(clampNumber(paceMinutes || 6, 3, 12));
    els.planPaceSecond.value = String(pace.seconds);
  }
}

function updateDurationInputs() {
  if (els.planFinish) {
    els.planFinish.value = `${Number(els.planFinishHour?.value || 0)}:${pad2(els.planFinishMinute?.value || 0)}:${pad2(els.planFinishSecond?.value || 0)}`;
  }
  if (els.planPace) {
    els.planPace.value = `${Number(els.planPaceMinute?.value || 6)}:${pad2(els.planPaceSecond?.value || 0)}`;
  }
}

function getSelectedGoalProfile() {
  return planProfiles[els.planGoal?.value] || planProfiles["10k"];
}

function setFinishFromSeconds(seconds) {
  const safeSeconds = Math.round(clampNumber(Number(seconds) || 1, 1, 12 * 3600 + 59 * 60 + 59));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const rest = safeSeconds % 60;
  if (els.planFinishHour) {
    els.planFinishHour.value = String(hours);
    els.planFinishMinute.value = String(minutes);
    els.planFinishSecond.value = String(rest);
  }
  if (els.planFinish) {
    els.planFinish.value = `${hours}:${pad2(minutes)}:${pad2(rest)}`;
  }
}

function setPaceFromSeconds(seconds) {
  const safeSeconds = Math.round(clampNumber(Number(seconds) || 390, 3 * 60, 12 * 60 + 59));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  if (els.planPaceMinute) {
    els.planPaceMinute.value = String(minutes);
    els.planPaceSecond.value = String(rest);
  }
  if (els.planPace) {
    els.planPace.value = `${minutes}:${pad2(rest)}`;
  }
}

function syncPaceFromFinish() {
  updateDurationInputs();
  const finishSeconds = parseDuration(els.planFinish?.value);
  const goalProfile = getSelectedGoalProfile();
  if (finishSeconds && goalProfile?.distanceKm) {
    setPaceFromSeconds(finishSeconds / goalProfile.distanceKm);
  }
}

function syncFinishFromPace() {
  updateDurationInputs();
  const paceSeconds = parsePace(els.planPace?.value);
  const goalProfile = getSelectedGoalProfile();
  if (paceSeconds && goalProfile?.distanceKm) {
    setFinishFromSeconds(paceSeconds * goalProfile.distanceKm);
  }
}

function parseDurationParts(value) {
  const parts = String(value || "").split(":").map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return { hours: parts[0], minutes: parts[1], seconds: parts[2] };
  }
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return { hours: 0, minutes: parts[0], seconds: parts[1] };
  }
  return { hours: 0, minutes: 0, seconds: 0 };
}

function formatDateParts(dateText) {
  const [, year = "----", month = "--", day = "--"] =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText) || [];
  const date = new Date(`${year}-${month}-${day}T00:00:00+08:00`);
  const weekday = Number.isNaN(date.getTime()) ? "" : weekdays[date.getDay()];
  return {
    year,
    month,
    monthLabel: monthNames[month] || `${month}月`,
    day,
    weekday,
    full: `${year}/${month}/${day}${weekday ? ` ${weekday}` : ""}`,
  };
}

function monthOf(race) {
  return race.race_date?.slice(5, 7) || "00";
}

function parseDistanceKm(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function maxDistanceKm(race) {
  return Math.max(0, ...(race.distances || []).map(parseDistanceKm));
}

function distanceBucket(race) {
  const maxDistance = maxDistanceKm(race);
  if (maxDistance >= 50) {
    return "ultra";
  }
  if (maxDistance >= 42) {
    return "marathon";
  }
  if (maxDistance >= 21) {
    return "half";
  }
  if (maxDistance >= 10) {
    return "10k";
  }
  return "short";
}

function dateDiffDays(dateText) {
  if (!dateText) {
    return null;
  }
  const today = new Date(`${TODAY}T00:00:00+08:00`);
  const target = new Date(`${dateText}T00:00:00+08:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  return Math.ceil((target - today) / 86400000);
}

function sameDate(a, b) {
  return Boolean(a && b && String(a).slice(0, 10) === String(b).slice(0, 10));
}

function hasSuspiciousRegistrationDates(race) {
  const opensAt = race.registration_opens_at || "";
  const deadline = race.registration_deadline || "";
  const note = `${race.registration_note || ""} ${race.verification_note || ""}`;
  if (sameDate(opensAt, deadline) && !/當日報名|現場報名|單日報名/.test(note)) {
    return true;
  }
  return Boolean(opensAt && deadline && String(opensAt).slice(0, 10) > String(deadline).slice(0, 10));
}

function raceDecisionText(race, registrationTarget) {
  const raceDays = dateDiffDays(race.race_date);
  const deadlineDays = dateDiffDays(race.registration_deadline);
  const displayStatus = getRegistrationDisplayStatus(race);
  const parts = [];

  if (raceDays !== null) {
    parts.push(raceDays >= 0 ? `距賽 ${raceDays} 天` : "賽事已過");
  }

  if (isCancelledRace(race)) {
    parts.push(race.registration_status || "活動停辦");
    parts.push(registrationTarget.url ? "查看公告" : "待補公告");
    return parts.join(" · ");
  }

  if (deadlineDays !== null) {
    if ((displayStatus === "報名中" || displayStatus === "即將截止") && deadlineDays > 0) {
      parts.push(`報名剩 ${deadlineDays} 天`);
    } else if ((displayStatus === "報名中" || displayStatus === "即將截止") && deadlineDays === 0) {
      parts.push("今天截止");
    } else if (displayStatus === "尚未開報") {
      parts.push("尚未開報");
    } else {
      parts.push("報名已截止");
    }
  } else {
    parts.push("截止待確認");
  }

  parts.push(registrationTarget.kind === "official" ? "官方直連" : registrationTarget.url ? "公開資訊" : "待補連結");
  return parts.join(" · ");
}

function registrationBucket(race) {
  const deadlineDays = dateDiffDays(race.registration_deadline);
  const displayStatus = getRegistrationDisplayStatus(race);
  if (isHistoricalRace(race)) {
    return "history";
  }
  if (isCancelledRace(race) || displayStatus === "已截止") {
    return "closed";
  }
  if (displayStatus === "即將截止") {
    return "soon";
  }
  if (displayStatus === "報名中") {
    return "open";
  }
  return "unknown";
}

function getRegistrationDisplayStatus(race) {
  if (isCancelledRace(race)) {
    return race.registration_status || "停辦";
  }

  const opensDays = dateDiffDays(race.registration_opens_at);
  const deadlineDays = dateDiffDays(race.registration_deadline);
  const datesNeedCheck = hasSuspiciousRegistrationDates(race);

  if (deadlineDays !== null && deadlineDays < 0) {
    return "已截止";
  }

  if (opensDays !== null && !datesNeedCheck) {
    if (opensDays > 0) {
      return "尚未開報";
    }
    return deadlineDays !== null && deadlineDays <= 14 ? "即將截止" : "報名中";
  }

  const sourceStatus = race.registration_status || "";
  if (/報名中|開放|開跑|受理/.test(sourceStatus)) {
    return deadlineDays !== null && deadlineDays <= 14 ? "即將截止" : "報名中";
  }
  if (/截止|額滿/.test(sourceStatus)) {
    return deadlineDays !== null && deadlineDays >= 0 ? "即將截止" : "已截止";
  }
  return sourceStatus || "狀態待確認";
}

function getRegistrationStatusClass(race, status) {
  const raceDays = dateDiffDays(race.race_date);
  const deadlineDays = dateDiffDays(race.registration_deadline);

  if (isCancelledRace(race)) {
    return "status-cancelled";
  }
  if (raceDays !== null && raceDays < 0) {
    return "status-expired";
  }
  if (status === "報名中") {
    return deadlineDays !== null && deadlineDays <= 14 ? "status-soon" : "status-open";
  }
  if (status === "即將截止") {
    return "status-soon";
  }
  if (status === "已截止") {
    return "status-closed";
  }
  if (status === "尚未開報") {
    return "status-pending";
  }
  return "status-unknown";
}

function getRaceKey(race) {
  return race.race_id || `${race.race_name}|${race.race_date}`;
}

function sortRaceForBoard(a, b) {
  const aUpcoming = String(a.race_date) >= TODAY;
  const bUpcoming = String(b.race_date) >= TODAY;
  if (aUpcoming !== bUpcoming) {
    return aUpcoming ? -1 : 1;
  }
  return aUpcoming
    ? String(a.race_date).localeCompare(String(b.race_date))
    : String(b.race_date).localeCompare(String(a.race_date));
}

function isHistoricalRace(race) {
  const raceDays = dateDiffDays(race.race_date);
  return raceDays !== null && raceDays < -30;
}

function isFavorite(race) {
  return state.favorites.has(getRaceKey(race));
}

function isSourceLink(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith("running.biji.co");
  } catch {
    return true;
  }
}

function getRegistrationLink(race) {
  const link = race.registration_link || "";
  return link && !isSourceLink(link) ? link : "";
}

function isCancelledRace(race) {
  const text = [
    race.race_name,
    race.registration_status,
    race.registration_note,
    race.verification_note,
  ].filter(Boolean).join(" ");
  return /停辦|停賽|取消|被迫取消|cancel/i.test(text);
}

function getRegistrationTarget(race) {
  const officialLink = getRegistrationLink(race);
  if (officialLink) {
    return { url: officialLink, label: isCancelledRace(race) ? "停辦公告" : "報名網站", kind: "official" };
  }

  const detailLink = race.detail_url || race.source_url || "";
  if (detailLink) {
    return { url: detailLink, label: isCancelledRace(race) ? "停賽資訊" : "賽事資訊", kind: "detail" };
  }

  return { url: "", label: "待補連結", kind: "missing" };
}

function formatShortDate(dateText) {
  const date = formatDateParts(dateText);
  return date.month !== "--" && date.day !== "--" ? `${date.month}/${date.day}` : "";
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatIcsDate(dateText) {
  return dateText.replaceAll("-", "");
}

function escapeIcsText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function buildCalendarDetails(race) {
  const registrationTarget = getRegistrationTarget(race);
  const distances = (race.distances || []).join(" / ");
  const venue = race.venue || race.start_location || race.location || race.race_location || "";
  const organizer = race.organizer || race.host || race.organizer_name || "";
  const fees = race.fees || race.fee || race.registration_fee || "";
  const quota = race.quota || race.participant_limit || "";
  const verifiedAt = race.verified_at || race.last_verified_at || race.data_verified_at || "";
  const description = [
    `縣市：${race.race_county || "待確認"}`,
    venue ? `地點：${venue}` : "",
    `距離：${distances || "待確認"}`,
    `難度：${race.difficulty || "待確認"}`,
    organizer ? `主辦：${organizer}` : "",
    fees ? `費用：${fees}` : "",
    quota ? `名額：${quota}` : "",
    `報名狀態：${race.registration_status || "待確認"}`,
    `開報：${race.registration_opens_at || "待確認"}`,
    `截止：${race.registration_deadline || "待確認"}`,
    verifiedAt ? `資料查證：${verifiedAt}` : "",
    registrationTarget.url ? `${registrationTarget.label}：${registrationTarget.url}` : "報名網站：待補連結",
    !registrationTarget.url && race.facebook_search_url ? `臉書搜尋：${race.facebook_search_url}` : "",
    race.detail_url ? `來源詳情：${race.detail_url}` : "",
  ].filter(Boolean).join("\n");

  return {
    title: race.race_name || "路跑賽事",
    start: race.race_date,
    end: addDays(race.race_date, 1),
    location: venue || race.race_county || "",
    description,
  };
}

function buildCalendarEvent(race) {
  const details = buildCalendarDetails(race);
  const start = formatIcsDate(details.start);
  const end = formatIcsDate(details.end);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Runner Plaza//Race Board//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(getRaceKey(race))}@runner-plaza`,
    `DTSTAMP:${formatIcsDate(TODAY)}T000000Z`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcsText(details.title)}`,
    `LOCATION:${escapeIcsText(details.location)}`,
    `DESCRIPTION:${escapeIcsText(details.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function buildGoogleCalendarUrl(race) {
  const details = buildCalendarDetails(race);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: details.title,
    dates: `${formatIcsDate(details.start)}/${formatIcsDate(details.end)}`,
    details: details.description,
    location: details.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function copyCalendarDetails(race) {
  const details = buildCalendarDetails(race);
  const text = [
    details.title,
    `日期：${details.start}`,
    details.location ? `地點：${details.location}` : "",
    details.description,
  ].filter(Boolean).join("\n");
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function slugifyFileName(value) {
  return String(value || "race")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function downloadCalendarEvent(race) {
  const ics = buildCalendarEvent(race);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${race.race_date}-${slugifyFileName(race.race_name)}.ics`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function goalFromRace(race) {
  const maxDistance = maxDistanceKm(race);
  if (maxDistance >= 42) {
    return "marathon";
  }
  if (maxDistance >= 21) {
    return "half";
  }
  if (maxDistance >= 10) {
    return "10k";
  }
  return "5k";
}

function useRaceForTraining(race) {
  state.trainingRaceKey = getRaceKey(race);
  state.planWeek = 1;
  if (els.planGoal) {
    els.planGoal.value = goalFromRace(race);
  }
  if (els.planRaceDate) {
    els.planRaceDate.value = race.race_date || "";
  }
  if (els.planPriority) {
    els.planPriority.value = "finish";
  }
  savePlanSettings();
  setActivePanel("training");
  renderPlan();
  document.getElementById("training")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getVisibleRaces() {
  const query = state.query.trim().toLowerCase();
  return state.races.filter((race) => {
    const historical = isHistoricalRace(race);
    const matchesCounty = state.county === "all" || race.race_county === state.county;
    const matchesDifficulty = state.difficulty === "all" || race.difficulty === state.difficulty;
    const matchesRegistration = state.registration === "all" || registrationBucket(race) === state.registration;
    const matchesHistoryScope = state.registration === "history" ? historical : !historical;
    const matchesDistance = state.distance === "all" || distanceBucket(race) === state.distance || (state.distance === "marathon" && ["marathon", "ultra"].includes(distanceBucket(race)));
    const matchesMonth = state.month === "all" || monthOf(race) === state.month;
    const matchesFavorite = !state.favoritesOnly || isFavorite(race);
    const haystack = [
      race.race_name,
      race.race_county,
      race.difficulty,
      race.registration_status,
      race.race_date,
      ...(race.distances || []),
    ]
      .join(" ")
      .toLowerCase();
    return (
      matchesCounty &&
      matchesDifficulty &&
      matchesRegistration &&
      matchesHistoryScope &&
      matchesDistance &&
      matchesMonth &&
      matchesFavorite &&
      (!query || haystack.includes(query))
    );
  }).sort(sortRaceForBoard);
}

function renderStats() {
  els.raceCount.textContent = String(state.races.length);
  els.favoriteCount.textContent = String(state.favorites.size);
  const upcoming = state.races.find((race) => race.race_date >= TODAY) || state.races[0];
  if (!upcoming) {
    els.nextRace.textContent = "--";
    if (els.heroNextRace) {
      els.heroNextRace.textContent = "--";
    }
    return;
  }
  const date = formatDateParts(upcoming.race_date);
  els.nextRace.textContent = `${date.month}/${date.day}`;
  if (els.heroNextRace) {
    els.heroNextRace.textContent = date.full.replaceAll("/", ".");
  }
}

function renderMonths() {
  const source = state.races.filter((race) => {
    const historical = isHistoricalRace(race);
    const matchesHistoryScope = state.registration === "history" ? historical : !historical;
    return matchesHistoryScope && (!state.favoritesOnly || isFavorite(race));
  });
  const counts = source.reduce((acc, race) => {
    const month = monthOf(race);
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});

  const total = source.length;
  const buttons = [
    `<button type="button" class="${state.month === "all" ? "active" : ""}" data-month="all"><span>全部</span><span>${total}</span></button>`,
    ...Object.keys(counts)
      .sort()
      .map((month) => {
        const active = state.month === month ? "active" : "";
        return `<button type="button" class="${active}" data-month="${month}"><span>${monthNames[month] || `${month}月`}</span><span>${counts[month]}</span></button>`;
      }),
  ];

  els.monthList.innerHTML = buttons.join("");
  els.monthList.querySelectorAll("[data-month]").forEach((button) => {
    button.addEventListener("click", () => {
      state.month = button.dataset.month;
      render();
    });
  });
}

function renderRaces() {
  const races = getVisibleRaces();
  els.resultCount.textContent = state.favoritesOnly
    ? `收藏清單 ${races.length} 場`
    : state.registration === "history"
      ? `歷史賽事 ${races.length} 場`
    : `目前顯示 ${races.length} 場`;

  if (!races.length) {
    els.raceList.innerHTML = `<div class="empty-state">${state.favoritesOnly ? "還沒有收藏符合條件的賽事。" : "沒有符合條件的賽事。"}</div>`;
    return;
  }

  els.raceList.innerHTML = races
    .map((race) => {
      const key = getRaceKey(race);
      const date = formatDateParts(race.race_date);
      const distances = (race.distances || ["距離待確認"]).join(" / ");
      const status = getRegistrationDisplayStatus(race);
      const statusClass = getRegistrationStatusClass(race, status);
      const difficulty = race.difficulty || "初級";
      const cls = difficultyClass[difficulty] || "";
      const registrationTarget = getRegistrationTarget(race);
      const note = race.registration_note || "未提供官方報名連結，待人工補連結";
      const opensAt = formatShortDate(race.registration_opens_at) || "待確認";
      const deadline = formatShortDate(race.registration_deadline) || "待確認";
      const datesNeedCheck = hasSuspiciousRegistrationDates(race);
      const scheduleOpenText = datesNeedCheck ? "待查證" : opensAt;
      const favorite = isFavorite(race);
      const decision = raceDecisionText(race, registrationTarget);
      const cancelled = isCancelledRace(race);
      const raceDays = dateDiffDays(race.race_date);
      const expired = raceDays !== null && raceDays < 0;
      const canPlanTraining = !cancelled && raceDays !== null && raceDays >= 0;
      const disabledTrainingLabel = cancelled ? "活動停辦" : "賽事已過";
      const venue = race.venue || race.start_location || race.location || race.race_location || "";
      const organizer = race.organizer || race.host || race.organizer_name || "";
      const verifiedAt = race.verified_at || race.last_verified_at || race.data_verified_at || "";
      const factItems = [
        venue ? ["地點", venue] : null,
        organizer ? ["主辦", organizer] : null,
        verifiedAt ? ["查證", formatShortDate(verifiedAt) || verifiedAt] : null,
      ].filter(Boolean);

      return `
        <article class="race-card ${expired ? "race-expired" : ""} ${status === "已截止" ? "registration-closed" : ""}">
          <div class="date-block" aria-label="${escapeHtml(date.full)}">
            <div>
              <span>${escapeHtml(date.year)}</span>
              <strong>${escapeHtml(date.month)}/${escapeHtml(date.day)}</strong>
              <em>${escapeHtml(date.weekday)}</em>
            </div>
          </div>
          <div class="race-main">
            <div class="race-title-row">
              <h3>${escapeHtml(race.race_name)}</h3>
            </div>
            <div class="race-summary-line">
              <span>${escapeHtml(race.race_county)}</span>
              <span class="${cls}">${escapeHtml(difficulty)}</span>
              <span class="race-status ${statusClass}">${escapeHtml(status)}</span>
            </div>
            <p class="race-distance">${escapeHtml(distances)}</p>
            <div class="race-schedule" aria-label="報名時間">
              <span class="${datesNeedCheck ? "schedule-warning" : ""}"><strong>開報</strong>${escapeHtml(scheduleOpenText)}</span>
              <span><strong>截止</strong>${escapeHtml(deadline)}</span>
            </div>
            ${datesNeedCheck ? `<p class="race-data-warning">報名起訖日期邏輯待查證</p>` : ""}
            <div class="race-insight">${escapeHtml(decision)}</div>
            ${
              factItems.length
                ? `<details class="race-detail-panel">
                    <summary>資料來源與場地</summary>
                    <dl>
                      ${factItems.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
                    </dl>
                  </details>`
                : ""
            }
          </div>
          <div class="race-actions">
            <div class="primary-action-row">
              ${
                registrationTarget.url
                  ? `<a class="register-link ${registrationTarget.kind !== "official" ? "fallback" : ""}" href="${escapeHtml(registrationTarget.url)}" target="_blank" rel="noreferrer">${escapeHtml(registrationTarget.label)}</a>`
                  : `<span class="register-link disabled" title="${escapeHtml(note)}">${escapeHtml(registrationTarget.label)}</span>`
              }
              <button
                class="favorite-button icon-button race-favorite ${favorite ? "active" : ""}"
                type="button"
                data-favorite="${escapeHtml(key)}"
                aria-pressed="${favorite ? "true" : "false"}"
                aria-label="${favorite ? "取消收藏" : "加入收藏"}"
                title="${favorite ? "取消收藏" : "加入收藏"}"
              ><span aria-hidden="true">${favorite ? "★" : "☆"}</span></button>
            </div>
            <div class="calendar-menu">
              <button class="calendar-button" type="button" data-calendar-menu="${escapeHtml(key)}" aria-expanded="false">加入行事曆</button>
              <div class="calendar-options" data-calendar-options="${escapeHtml(key)}" hidden>
                <a href="${escapeHtml(buildGoogleCalendarUrl(race))}" target="_blank" rel="noreferrer">Google Calendar</a>
                <button type="button" data-calendar-download="${escapeHtml(key)}">下載 ICS</button>
                <button type="button" data-calendar-copy="${escapeHtml(key)}">複製資訊</button>
              </div>
            </div>
            ${
              canPlanTraining
                ? `<button class="train-button" type="button" data-train-race="${escapeHtml(key)}">用這場排課</button>`
                : `<button class="train-button" type="button" disabled>${escapeHtml(disabledTrainingLabel)}</button>`
            }
            <div class="detail-actions">
              ${!registrationTarget.url && race.facebook_search_url ? `<a class="sub-link" href="${escapeHtml(race.facebook_search_url)}" target="_blank" rel="noreferrer">臉書</a>` : ""}
              ${race.detail_url && registrationTarget.url !== race.detail_url ? `<a class="sub-link" href="${escapeHtml(race.detail_url)}" target="_blank" rel="noreferrer">詳情</a>` : ""}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  els.raceList.querySelectorAll("[data-favorite]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.favorite;
      if (state.favorites.has(key)) {
        state.favorites.delete(key);
      } else {
        state.favorites.add(key);
      }
      saveFavorites();
      renderStats();
      render();
    });
  });

  els.raceList.querySelectorAll("[data-calendar-menu]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.calendarMenu;
      const options = [...els.raceList.querySelectorAll("[data-calendar-options]")]
        .find((menu) => menu.dataset.calendarOptions === key);
      const expanded = button.getAttribute("aria-expanded") === "true";
      els.raceList.querySelectorAll("[data-calendar-options]").forEach((menu) => {
        menu.hidden = true;
      });
      els.raceList.querySelectorAll("[data-calendar-menu]").forEach((control) => {
        control.setAttribute("aria-expanded", "false");
      });
      if (options) {
        options.hidden = expanded;
        button.setAttribute("aria-expanded", expanded ? "false" : "true");
      }
    });
  });

  els.raceList.querySelectorAll("[data-calendar-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const race = state.races.find((item) => getRaceKey(item) === button.dataset.calendarDownload);
      if (race) {
        downloadCalendarEvent(race);
      }
    });
  });

  els.raceList.querySelectorAll("[data-calendar-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const race = state.races.find((item) => getRaceKey(item) === button.dataset.calendarCopy);
      if (race) {
        await copyCalendarDetails(race);
        button.textContent = "已複製";
      }
    });
  });

  els.raceList.querySelectorAll("[data-train-race]").forEach((button) => {
    button.addEventListener("click", () => {
      const race = state.races.find((item) => getRaceKey(item) === button.dataset.trainRace);
      if (race) {
        useRaceForTraining(race);
      }
    });
  });
}

function parsePace(value) {
  const parts = String(value || "").trim().split(":").map(Number);
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (!String(value || "").trim()) {
    return 0;
  }
  return 0;
}

function parseDuration(value) {
  const parts = String(value || "")
    .trim()
    .split(":")
    .map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function formatPace(seconds) {
  const safeSeconds = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${rest}/km`;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(1, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const rest = safeSeconds % 60;
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function paceRange(baseSeconds, slowerFrom, slowerTo) {
  return `${formatPace(baseSeconds + slowerFrom)} - ${formatPace(baseSeconds + slowerTo)}`;
}

function weeksUntilRace(dateText) {
  if (!dateText) {
    return null;
  }
  const today = new Date(`${TODAY}T00:00:00+08:00`);
  const raceDate = new Date(`${dateText}T00:00:00+08:00`);
  if (Number.isNaN(raceDate.getTime()) || raceDate <= today) {
    return null;
  }
  const days = Math.ceil((raceDate - today) / 86400000);
  return {
    days,
    weeks: Math.max(1, Math.ceil(days / 7)),
    label: dateText.replaceAll("-", "/"),
  };
}

function buildProgression(weekCount, raceWindow) {
  if (raceWindow) {
    if (weekCount <= 4) {
      return `距離賽事還有 ${raceWindow.days} 天，採短週期調整，最後 5-7 天降低跑量。`;
    }
    if (weekCount <= 8) {
      return `距離賽事還有 ${raceWindow.days} 天，每 3 週加量後降載 1 週，最後 1 週減量。`;
    }
    return `距離賽事還有 ${raceWindow.days} 天，前段建立跑量，中段進入專項，最後 2 週減量。`;
  }
  if (weekCount === 4) {
    return "前 3 週逐步加量，第 4 週降載 20%。";
  }
  if (weekCount === 8) {
    return "每 3 週加量後 1 週降載，最後一週保留體力。";
  }
  return "前 8 週建立跑量，第 9-10 週高峰，第 11-12 週逐步減量。";
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function goalTrainingTargets(goalProfile, level, weeklyKm, longRunKm, priority, experience, intensity, injury) {
  const distance = goalProfile.distanceKm;
  const levelBoost = level === "advanced" ? 1.25 : level === "beginner" ? 0.85 : 1;
  const priorityBoost = priority === "pb" ? 1.12 : priority === "habit" ? 0.88 : 1;
  const experienceBoost = experience === "seasoned" ? 1.08 : experience === "rookie" ? 0.88 : 1;
  const intensityBoost = intensity === "push" ? 1.08 : intensity === "safe" ? 0.94 : 1;
  const injuryBoost = injury === "recovering" ? 0.82 : injury === "tight" ? 0.92 : 1;
  const baseKm = clampNumber(weeklyKm, 6, 80);
  const rawPeak = Math.max(baseKm * 1.18, distance * 1.4 * levelBoost * priorityBoost * experienceBoost * intensityBoost * injuryBoost);
  const maxPeak = distance >= 42 ? 58 : distance >= 21 ? 42 : distance >= 10 ? 30 : 22;
  const peakKm = Math.round(clampNumber(rawPeak, baseKm, maxPeak));
  const longRunCap = distance >= 42 ? 30 : distance >= 21 ? 20 : distance >= 10 ? 13 : 8;
  const peakLongRun = Math.round(clampNumber(Math.max(longRunKm + 2, distance * 0.78), longRunKm, longRunCap));

  return {
    baseKm: Math.round(baseKm),
    peakKm,
    baseLongRun: Math.round(clampNumber(longRunKm, 3, longRunCap)),
    peakLongRun,
  };
}

function phaseForWeek(weekIndex, weekCount, goalProfile) {
  const taperWeeks = goalProfile.distanceKm >= 21 ? 2 : 1;
  if (weekIndex > weekCount - taperWeeks) {
    return "減量";
  }
  if (weekIndex <= Math.max(2, Math.floor(weekCount * 0.35))) {
    return "打底";
  }
  if (weekIndex <= Math.max(3, Math.floor(weekCount * 0.72))) {
    return "加量";
  }
  return "專項";
}

function buildWeeklyBlocks(weekCount, targets, goalProfile) {
  const safeWeekCount = clampNumber(weekCount, 1, 20);
  return Array.from({ length: safeWeekCount }, (_, index) => {
    const week = index + 1;
    const phase = phaseForWeek(week, safeWeekCount, goalProfile);
    const progress = safeWeekCount === 1 ? 1 : index / (safeWeekCount - 1);
    const recoveryFactor = week % 4 === 0 && phase !== "減量" ? 0.82 : 1;
    const taperFactor = phase === "減量" ? (week === safeWeekCount ? 0.55 : 0.75) : 1;
    const weeklyKm = Math.round((targets.baseKm + (targets.peakKm - targets.baseKm) * progress) * recoveryFactor * taperFactor);
    const longRunKm = Math.round(clampNumber(
      (targets.baseLongRun + (targets.peakLongRun - targets.baseLongRun) * progress) * recoveryFactor * taperFactor,
      3,
      Math.min(targets.peakLongRun, weeklyKm * 0.42),
    ));

    return {
      week,
      phase,
      weeklyKm,
      longRunKm,
      focus: phase === "打底" ? "穩定頻率" : phase === "加量" ? "提高總量" : phase === "專項" ? "接近比賽需求" : "保留體力",
    };
  });
}

function buildRiskNotes(goalProfile, level, dayCount, weekCount, weeklyKm, longRunKm, priority, experience, injury, intensity) {
  const notes = [];
  if (weekCount < 4) {
    notes.push("距離目標賽事太近，這份菜單以維持狀態與安全完賽為主，不硬做高強度。");
  }
  if (goalProfile.distanceKm >= 42 && dayCount <= 3) {
    notes.push("全馬只跑 3 天風險偏高，長跑壓力會集中，建議至少加入 1 天短恢復跑。");
  }
  if (goalProfile.distanceKm >= 21 && weeklyKm < 18) {
    notes.push("目前週跑量偏低，半馬以上目標先求穩定累積，不建議每週都做間歇。");
  }
  if (longRunKm < goalProfile.distanceKm * 0.35 && goalProfile.distanceKm >= 21) {
    notes.push("目前最長跑距離偏短，長跑要逐步增加，避免單週暴增。");
  }
  if (level === "beginner" && priority === "pb") {
    notes.push("新手挑戰 PB 前，先確認連續 4 週無傷穩定訓練。");
  }
  if (experience === "rookie" && goalProfile.distanceKm >= 21) {
    notes.push("跑齡未滿 6 個月就準備半馬以上，長跑距離要保守增加，先以完賽和無傷為主。");
  }
  if (injury === "tight") {
    notes.push("目前偶爾緊繃，強度課後 24 小時內若不適感上升，下一課直接改輕鬆跑。");
  }
  if (injury === "recovering") {
    notes.push("剛恢復訓練，這份菜單會降低高峰跑量與快課刺激，任何疼痛回來都先休息。");
  }
  if (intensity === "push" && weeklyKm < 18) {
    notes.push("週跑量還不高時選積極突破，容易把壓力集中在單次課表，請優先把頻率跑穩。");
  }
  return notes.length ? notes : ["強度日之間至少隔 48 小時；若疼痛改成休息或步行，菜單要讓身體吸收而不是硬撐。"];
}

function buildTrainingSchedule(dayCount, level, priority, currentWeek, easyRange, tempoRange, intervalRange, longRange, longRunDay, intensity, injury) {
  const isCautious = intensity === "safe" || injury === "recovering";
  const longRunLabel = weekdayLabels[longRunDay] || "週日";
  const quality = injury === "recovering"
    ? `有氧穩定跑 20-30 分鐘，${easyRange}`
    : level === "advanced" && priority === "pb" && intensity === "push"
    ? `間歇 4-6 組，${intervalRange}`
    : priority === "habit"
      ? `漸進跑 20 分鐘，最後 5 分鐘接近 ${tempoRange}`
      : `節奏跑 ${isCautious ? "12-18" : "15-25"} 分鐘，${tempoRange}`;
  const recovery = "伸展、肌力或完整休息";
  const easyKm = Math.max(3, Math.round((currentWeek.weeklyKm - currentWeek.longRunKm) / Math.max(2, dayCount - 1)));

  if (dayCount <= 3) {
    return [
      { day: "第 1 跑", type: "輕鬆", work: `${easyKm}km，${easyRange}` },
      { day: "第 2 跑", type: "重點", work: quality },
      { day: longRunLabel, type: "長跑", work: `${currentWeek.longRunKm}km，${longRange}` },
    ];
  }

  const schedule = [
    { day: "週二", type: "輕鬆", work: `${easyKm}km，${easyRange}` },
    { day: "週四", type: "重點", work: quality },
    { day: "週五", type: "恢復", work: dayCount >= 4 ? `短恢復跑 25-35 分鐘，${easyRange}` : recovery },
    { day: longRunLabel, type: "長跑", work: `${currentWeek.longRunKm}km，${longRange}` },
  ];

  if (dayCount >= 5) {
    schedule.splice(2, 0, { day: "週三", type: "補量", work: `${Math.max(3, easyKm - 1)}km 輕鬆跑或跑走，${easyRange}` });
  }

  return schedule;
}

function buildPlanSnapshot() {
  return buildPlan({
    athlete: els.planAthlete?.value,
    experience: els.planExperience?.value,
    goal: els.planGoal?.value,
    level: els.planLevel?.value,
    injury: els.planInjury?.value,
    days: els.planDays?.value,
    weeks: els.planWeeks?.value,
    finishInput: els.planFinish?.value,
    paceInput: els.planPace?.value,
    raceDateInput: els.planRaceDate?.value,
    weeklyKmInput: els.planWeeklyKm?.value,
    longRunInput: els.planLongRun?.value,
    longRunDay: els.planLongRunDay?.value,
    priorityInput: els.planPriority?.value,
    intensity: els.planIntensity?.value,
    selectedWeekInput: state.planWeek,
  });
}

function buildPlan(profileInput) {
  const {
    athlete,
    experience,
    goal,
    level,
    injury,
    days,
    weeks,
    finishInput,
    paceInput,
    raceDateInput,
    weeklyKmInput,
    longRunInput,
    longRunDay,
    priorityInput,
    intensity,
    selectedWeekInput,
  } = profileInput;
  const goalProfile = planProfiles[goal] || planProfiles["10k"];
  const levelProfile = levelProfiles[level] || levelProfiles.steady;
  const dayCount = Number(days);
  const raceWindow = weeksUntilRace(raceDateInput);
  const weekCount = clampNumber(raceWindow ? raceWindow.weeks : Number(weeks), 1, 20);
  const weeklyKm = Number(weeklyKmInput) || 18;
  const longRunKm = Number(longRunInput) || 8;
  const priority = priorityInput || "finish";
  const athleteName = String(athlete || "").trim() || "自訂選手";
  const safeExperience = experience || "regular";
  const safeInjury = injury || "none";
  const safeIntensity = intensity || "safe";
  const safeLongRunDay = longRunDay || "sun";
  const finishSeconds = parseDuration(finishInput);
  const inputPace = parsePace(paceInput);
  const racePace = finishSeconds
    ? finishSeconds / goalProfile.distanceKm
    : inputPace || goalProfile.defaultPace;
  const targetFinish = finishSeconds || racePace * goalProfile.distanceKm;
  const easyRange = paceRange(racePace, 55, 90);
  const longRange = paceRange(racePace, 40, 75);
  const tempoRange = paceRange(racePace, 5, 20);
  const intervalRange = paceRange(racePace, -30, -10);
  const targets = goalTrainingTargets(goalProfile, level, weeklyKm, longRunKm, priority, safeExperience, safeIntensity, safeInjury);
  const weeklyBlocks = buildWeeklyBlocks(weekCount, targets, goalProfile);
  const selectedWeek = clampNumber(Number(selectedWeekInput) || 1, 1, weekCount);
  const currentWeek = weeklyBlocks[selectedWeek - 1];
  const schedule = buildTrainingSchedule(dayCount, level, priority, currentWeek, easyRange, tempoRange, intervalRange, longRange, safeLongRunDay, safeIntensity, safeInjury);
  const riskNotes = buildRiskNotes(goalProfile, level, dayCount, weekCount, weeklyKm, longRunKm, priority, safeExperience, safeInjury, safeIntensity);
  const progression = buildProgression(weekCount, raceWindow);

  return {
    athleteName,
    experience: safeExperience,
    goalProfile,
    levelProfile,
    injury: safeInjury,
    schedule,
    progression,
    weekCount,
    racePace,
    targetFinish,
    easyRange,
    longRange,
    tempoRange,
    intervalRange,
    raceWindow,
    raceDateInput,
    dayCount,
    longRunDay: safeLongRunDay,
    priority,
    intensity: safeIntensity,
    weeklyBlocks,
    currentWeek,
    selectedWeek,
    targets,
    riskNotes,
  };
}

function buildPlanCalendar(plan) {
  const anchor = parseDateAsUtc(plan.raceDateInput || TODAY);
  const start = new Date(anchor.getTime() - (plan.raceWindow ? (plan.weekCount - 1) * 7 * 86400000 : 0));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Runner Plaza//Training Plan//ZH-TW",
    "CALSCALE:GREGORIAN",
  ];

  plan.weeklyBlocks.forEach((week, weekIndex) => {
    const weekStart = new Date(start.getTime() + weekIndex * 7 * 86400000);
    const schedule = buildTrainingSchedule(
      plan.dayCount,
      els.planLevel?.value,
      plan.priority,
      week,
      plan.easyRange,
      plan.tempoRange,
      plan.intervalRange,
      plan.longRange,
      plan.longRunDay,
      plan.intensity,
      plan.injury,
    );
    schedule.forEach((item, itemIndex) => {
      const date = new Date(weekStart.getTime() + itemIndex * 86400000);
      const day = formatUtcIcsDate(date);
      const uid = `${slugifyFileName(plan.athleteName)}-${week.week}-${itemIndex}@runner-plaza`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${escapeIcsText(uid)}`,
        `DTSTAMP:${day}T000000Z`,
        `DTSTART;VALUE=DATE:${day}`,
        `SUMMARY:${escapeIcsText(`第 ${week.week} 週 ${item.type}`)}`,
        `DESCRIPTION:${escapeIcsText(`${item.day}｜${item.work}`)}`,
        "END:VEVENT",
      );
    });
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function buildGarminGuide(plan) {
  const rows = [
    `${plan.athleteName} - ${plan.goalProfile.title}`,
    `完賽目標：${formatDuration(plan.targetFinish)}｜比賽配速：${formatPace(plan.racePace)}｜週數：${plan.weekCount}`,
    "",
    "Garmin Connect 建課摘要",
    "說明：Garmin 手錶要吃到結構化課表，通常需在 Garmin Connect 建立訓練並同步到裝置，或使用 Garmin Training API/第三方平台。這份檔案提供手動建立每週課表的內容。",
    "",
  ];
  plan.weeklyBlocks.forEach((week) => {
    const schedule = buildTrainingSchedule(
      plan.dayCount,
      els.planLevel?.value,
      plan.priority,
      week,
      plan.easyRange,
      plan.tempoRange,
      plan.intervalRange,
      plan.longRange,
      plan.longRunDay,
      plan.intensity,
      plan.injury,
    );
    rows.push(`第 ${week.week} 週｜${week.phase}｜${week.weeklyKm} km｜長跑 ${week.longRunKm} km`);
    schedule.forEach((item) => rows.push(`- ${item.day} ${item.type}：${item.work}`));
    rows.push("");
  });
  return rows.join("\n");
}

function parseDateAsUtc(dateText) {
  const [year, month, day] = String(dateText || TODAY).split("-").map(Number);
  return new Date(Date.UTC(year || 2026, (month || 1) - 1, day || 1));
}

function formatUtcIcsDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function downloadPlanCalendar() {
  const plan = buildPlanSnapshot();
  downloadTextFile(`${slugifyFileName(plan.athleteName)}-training-plan.ics`, buildPlanCalendar(plan), "text/calendar;charset=utf-8");
}

function downloadGarminGuide() {
  const plan = buildPlanSnapshot();
  downloadTextFile(`${slugifyFileName(plan.athleteName)}-garmin-workouts.txt`, buildGarminGuide(plan));
}

function renderPlan() {
  if (!els.planOutput) {
    return;
  }
  const plan = buildPlanSnapshot();
  const {
    athleteName,
    experience,
    goalProfile,
    levelProfile,
    injury,
    schedule,
    progression,
    weekCount,
    racePace,
    targetFinish,
    easyRange,
    longRange,
    tempoRange,
    intervalRange,
    raceWindow,
    dayCount,
    longRunDay,
    priority,
    intensity,
    weeklyBlocks,
    currentWeek,
    selectedWeek,
    targets,
    riskNotes,
  } = plan;

  state.planWeek = selectedWeek;

  const priorityLabel = {
    finish: "穩定完賽",
    pb: "挑戰 PB",
    habit: "建立習慣",
  }[priority] || "穩定完賽";

  const experienceLabel = experienceLabels[experience] || experienceLabels.regular;
  const injuryLabel = injuryLabels[injury] || injuryLabels.none;
  const intensityLabel = intensityLabels[intensity] || intensityLabels.safe;
  const longRunDayLabel = weekdayLabels[longRunDay] || "週日";

  els.planOutput.innerHTML = `
    <div class="plan-hero">
      <div>
        <span>${escapeHtml(athleteName)} · ${escapeHtml(weekCount)} 週自訂菜單</span>
        <strong>${escapeHtml(goalProfile.title)}</strong>
        <p>${escapeHtml(raceWindow ? `賽事 ${raceWindow.label}，剩 ${raceWindow.days} 天` : `目標完賽 ${formatDuration(targetFinish)}`)}</p>
      </div>
      <dl>
        <div><dt>完賽</dt><dd>${escapeHtml(formatDuration(targetFinish))}</dd></div>
        <div><dt>比賽配速</dt><dd>${escapeHtml(formatPace(racePace))}</dd></div>
        <div><dt>目標</dt><dd>${escapeHtml(priorityLabel)}</dd></div>
      </dl>
    </div>
    <div class="training-summary">
      <div><span>目前週跑量</span><strong>${escapeHtml(targets.baseKm)} km</strong></div>
      <div><span>高峰週跑量</span><strong>${escapeHtml(targets.peakKm)} km</strong></div>
      <div><span>目前長跑</span><strong>${escapeHtml(targets.baseLongRun)} km</strong></div>
      <div><span>高峰長跑</span><strong>${escapeHtml(targets.peakLongRun)} km</strong></div>
      <div><span>每週頻率</span><strong>${escapeHtml(dayCount)} 天</strong></div>
      <div><span>長跑日</span><strong>${escapeHtml(longRunDayLabel)}</strong></div>
    </div>
    <div class="profile-summary">
      <div><span>選手</span><strong>${escapeHtml(athleteName)}</strong></div>
      <div><span>跑齡</span><strong>${escapeHtml(experienceLabel)}</strong></div>
      <div><span>傷痛</span><strong>${escapeHtml(injuryLabel)}</strong></div>
      <div><span>強度</span><strong>${escapeHtml(intensityLabel)}</strong></div>
    </div>
    <div class="pace-zones">
      <div><span>輕鬆跑</span><strong>${escapeHtml(easyRange)}</strong></div>
      <div><span>節奏跑</span><strong>${escapeHtml(tempoRange)}</strong></div>
      <div><span>間歇</span><strong>${escapeHtml(intervalRange)}</strong></div>
      <div><span>長跑</span><strong>${escapeHtml(longRange)}</strong></div>
    </div>
    <div class="plan-note">
      <strong>${escapeHtml(goalProfile.focus)}</strong>
      <p>${escapeHtml(progression)} 依照 ${escapeHtml(experienceLabel)}、${escapeHtml(injuryLabel)}、${escapeHtml(intensityLabel)} 調整跑量與強度。${escapeHtml(levelProfile.note)}檢查點：${escapeHtml(goalProfile.benchmark)}。</p>
    </div>
    <div class="plan-export-actions" aria-label="課表匯出">
      <button class="export-button" type="button" data-export-plan="calendar">匯出行事曆</button>
      <button class="export-button" type="button" data-export-plan="garmin">Garmin 建課摘要</button>
    </div>
    <div class="risk-panel">
      <strong>調整提醒</strong>
      <ul>
        ${riskNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
      </ul>
    </div>
    <div class="phase-table" aria-label="週數切換">
      ${weeklyBlocks.map((week) => `
        <button class="${week.week === selectedWeek ? "active" : ""}" type="button" data-plan-week="${escapeHtml(week.week)}">
          <span>第 ${escapeHtml(week.week)} 週 · ${escapeHtml(week.phase)}</span>
          <strong>${escapeHtml(week.weeklyKm)} km</strong>
          <p>長跑 ${escapeHtml(week.longRunKm)} km · ${escapeHtml(week.focus)}</p>
        </button>
      `).join("")}
    </div>
    <div class="plan-week-title">
      <span>第 ${escapeHtml(selectedWeek)} 週執行課表</span>
      <strong>${escapeHtml(currentWeek.weeklyKm)} km / 長跑 ${escapeHtml(currentWeek.longRunKm)} km</strong>
    </div>
    <div class="plan-table" role="table" aria-label="每週課表">
      ${schedule.map((item) => `
        <div class="plan-row" role="row">
          <span>${escapeHtml(item.day)}</span>
          <strong>${escapeHtml(item.type)}</strong>
          <p>${escapeHtml(item.work)}</p>
        </div>
      `).join("")}
    </div>
  `;

  els.planOutput.querySelectorAll("[data-plan-week]").forEach((button) => {
    button.addEventListener("click", () => {
      state.planWeek = Number(button.dataset.planWeek) || 1;
      savePlanSettings();
      renderPlan();
    });
  });
  els.planOutput.querySelector("[data-export-plan='calendar']")?.addEventListener("click", downloadPlanCalendar);
  els.planOutput.querySelector("[data-export-plan='garmin']")?.addEventListener("click", downloadGarminGuide);
}

function setActiveButtons(buttons, dataKey, value) {
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset[dataKey] === value);
  });
}

function sortContentCards(containerSelector, itemSelector, mode) {
  const container = document.querySelector(containerSelector);
  if (!container) {
    return;
  }

  const cards = [...container.querySelectorAll(itemSelector)];
  const sorted = cards.sort((a, b) => {
    if (mode === "oldest") {
      return String(a.dataset.date || "").localeCompare(String(b.dataset.date || ""));
    }
    if (mode === "category") {
      return String(a.dataset.category || "").localeCompare(String(b.dataset.category || ""))
        || String(a.dataset.title || a.textContent || "").localeCompare(String(b.dataset.title || b.textContent || ""));
    }
    return String(b.dataset.date || "").localeCompare(String(a.dataset.date || ""));
  });

  sorted.forEach((card) => container.appendChild(card));
}

function contentFavoriteKey(type, card) {
  return `${type}:${card.dataset.date || ""}:${card.dataset.title || card.textContent.trim()}`;
}

function formatContentDate(date) {
  return String(date || TODAY).replaceAll("-", ".");
}

function contentArticleHtml(item) {
  const type = item.type === "shoe" ? "shoe" : "news";
  const attr = type === "shoe" ? "data-shoe-card" : "data-news-card";
  const category = item.category || (type === "shoe" ? "跑鞋新品" : "跑步新聞");
  const sourceText = item.source ? `${item.source} 來源` : "閱讀來源";
  return `
    <article ${attr} data-auto-content="true" data-date="${escapeHtml(item.date || TODAY)}" data-category="${escapeHtml(category)}" data-title="${escapeHtml(item.title)}">
      <time datetime="${escapeHtml(item.date || TODAY)}">${escapeHtml(formatContentDate(item.date))}</time>
      ${type === "shoe" ? `<span>${escapeHtml(category)}</span>` : ""}
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary)}</p>
      <a class="sub-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(sourceText)}</a>
    </article>
  `;
}

function renderAutoContent(items) {
  const shoes = items.filter((item) => item.type === "shoe");
  const news = items.filter((item) => item.type === "news");
  const shoeContainer = document.querySelector(".shoe-release-list");
  const newsContainer = document.querySelector(".news-list");

  if (shoeContainer && shoes.length) {
    shoeContainer.querySelectorAll("[data-auto-content]").forEach((node) => node.remove());
    shoeContainer.insertAdjacentHTML("afterbegin", shoes.map(contentArticleHtml).join(""));
  }

  if (newsContainer && news.length) {
    newsContainer.querySelectorAll("[data-auto-content]").forEach((node) => node.remove());
    newsContainer.insertAdjacentHTML("afterbegin", news.map(contentArticleHtml).join(""));
  }
}

async function loadPublishedContent() {
  try {
    const response = await fetch("./data/content.json");
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    renderAutoContent(Array.isArray(data.items) ? data.items : []);
  } catch (error) {
    console.info("Published content data not available", error);
  }
}

function isContentFavorite(type, card) {
  return state.contentFavorites.has(contentFavoriteKey(type, card));
}

function decorateContentFavorites(type, containerSelector, itemSelector) {
  document.querySelectorAll(`${containerSelector} ${itemSelector}`).forEach((card) => {
    if (card.querySelector("[data-content-favorite]")) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "favorite-button icon-button content-favorite";
    button.dataset.contentFavorite = contentFavoriteKey(type, card);
    button.dataset.contentType = type;
    button.innerHTML = `<span aria-hidden="true">☆</span>`;
    card.appendChild(button);
  });
}

function updateContentFavoriteButtons() {
  document.querySelectorAll("[data-content-favorite]").forEach((button) => {
    const active = state.contentFavorites.has(button.dataset.contentFavorite);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.setAttribute("aria-label", active ? "取消收藏文章" : "收藏文章");
    button.setAttribute("title", active ? "取消收藏" : "收藏");
    button.querySelector("span").textContent = active ? "★" : "☆";
  });
}

function applyContentLimit(containerSelector, itemSelector, limitValue, favoritesOnly = false, type = "") {
  const cards = [...document.querySelectorAll(`${containerSelector} ${itemSelector}`)];
  const limit = Number(limitValue) || 10;
  let visibleIndex = 0;
  cards.forEach((card) => {
    const blockedByFavorite = favoritesOnly && !isContentFavorite(type, card);
    const blockedByLimit = visibleIndex >= limit;
    card.hidden = blockedByFavorite || blockedByLimit;
    if (!blockedByFavorite) {
      visibleIndex += 1;
    }
  });
}

function updateContentList(type) {
  const config = type === "shoe"
    ? {
      container: ".shoe-release-list",
      item: "[data-shoe-card]",
      sort: els.shoeSort?.value || "newest",
      limit: els.shoeLimit?.value || "10",
      favoritesOnly: state.shoeFavoritesOnly,
      filter: els.shoeFavoriteFilter,
      label: "跑鞋",
    }
    : {
      container: ".news-list",
      item: "[data-news-card]",
      sort: els.newsSort?.value || "newest",
      limit: els.newsLimit?.value || "10",
      favoritesOnly: state.newsFavoritesOnly,
      filter: els.newsFavoriteFilter,
      label: "新聞",
    };

  sortContentCards(config.container, config.item, config.sort);
  applyContentLimit(config.container, config.item, config.limit, config.favoritesOnly, type);
  config.filter?.classList.toggle("active", config.favoritesOnly);
  if (config.filter) {
    config.filter.textContent = config.favoritesOnly ? `顯示全部${config.label}` : "只看收藏";
  }
  updateContentFavoriteButtons();
}

function initContentSorting() {
  decorateContentFavorites("shoe", ".shoe-release-list", "[data-shoe-card]");
  decorateContentFavorites("news", ".news-list", "[data-news-card]");
  updateContentList("shoe");
  updateContentList("news");
}

function render() {
  setActiveButtons(els.countyButtons, "county", state.county);
  setActiveButtons(els.difficultyButtons, "difficulty", state.difficulty);
  setActiveButtons(els.registrationButtons, "registration", state.registration);
  setActiveButtons(els.distanceButtons, "distance", state.distance);
  els.favoriteFilter.classList.toggle("active", state.favoritesOnly);
  els.favoriteFilter.textContent = state.favoritesOnly ? "顯示全部賽事" : "只看收藏";
  renderMonths();
  renderRaces();
}

function bindEvents() {
  els.panelLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setActivePanel(link.dataset.panelLink);
      document.getElementById(link.dataset.panelLink)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  window.addEventListener("hashchange", () => {
    setActivePanel(window.location.hash.replace("#", ""), false);
  });

  if (els.backTop) {
    window.addEventListener("scroll", () => {
      els.backTop.classList.toggle("visible", window.scrollY > 420);
    });
    els.backTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  els.shoeSort?.addEventListener("change", () => {
    updateContentList("shoe");
  });

  els.newsSort?.addEventListener("change", () => {
    updateContentList("news");
  });

  els.shoeLimit?.addEventListener("change", () => {
    updateContentList("shoe");
  });

  els.newsLimit?.addEventListener("change", () => {
    updateContentList("news");
  });

  els.shoeFavoriteFilter?.addEventListener("click", () => {
    state.shoeFavoritesOnly = !state.shoeFavoritesOnly;
    updateContentList("shoe");
  });

  els.newsFavoriteFilter?.addEventListener("click", () => {
    state.newsFavoritesOnly = !state.newsFavoritesOnly;
    updateContentList("news");
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-content-favorite]");
    if (!button) {
      return;
    }
    const key = button.dataset.contentFavorite;
    if (state.contentFavorites.has(key)) {
      state.contentFavorites.delete(key);
    } else {
      state.contentFavorites.add(key);
    }
    saveContentFavorites();
    updateContentList(button.dataset.contentType);
  });

  els.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderRaces();
  });

  els.countyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.county = button.dataset.county;
      render();
    });
  });

  els.difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.difficulty = button.dataset.difficulty;
      render();
    });
  });

  els.registrationButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.registration = button.dataset.registration;
      render();
    });
  });

  els.distanceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.distance = button.dataset.distance;
      render();
    });
  });

  els.favoriteFilter.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    state.month = "all";
    render();
  });

  els.clearFilters.addEventListener("click", () => {
    state.county = "all";
    state.difficulty = "all";
    state.registration = "all";
    state.distance = "all";
    state.month = "all";
    state.query = "";
    state.favoritesOnly = false;
    els.search.value = "";
    render();
  });

  if (els.planBuilder) {
    els.planBuilder.addEventListener("submit", (event) => {
      event.preventDefault();
      updateDurationInputs();
      savePlanSettings();
      renderPlan();
    });
    getPlanControls().forEach(([, control]) => {
      control?.addEventListener("input", () => {
        state.planWeek = 1;
        savePlanSettings();
        renderPlan();
      });
      control?.addEventListener("change", () => {
        state.planWeek = 1;
        if (control === els.planGoal) {
          syncFinishFromPace();
        }
        savePlanSettings();
        renderPlan();
      });
    });
    [els.planFinishHour, els.planFinishMinute, els.planFinishSecond].forEach((control) => {
      control?.addEventListener("change", () => {
        state.planWeek = 1;
        syncPaceFromFinish();
        savePlanSettings();
        renderPlan();
      });
    });
    [els.planPaceMinute, els.planPaceSecond].forEach((control) => {
      control?.addEventListener("change", () => {
        state.planWeek = 1;
        syncFinishFromPace();
        savePlanSettings();
        renderPlan();
      });
    });
  }
}

async function loadRaces() {
  const dataPaths = ["./data/races.json", "../runner/赛事/赛事数据库.json"];
  let lastError;

  for (const path of dataPaths) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Race data request failed: ${response.status}`);
      }
      const races = await response.json();
      state.races = races.sort((a, b) => String(a.race_date).localeCompare(String(b.race_date)));
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Race data request failed");
}

async function init() {
  loadFavorites();
  loadContentFavorites();
  setupDurationPickers();
  bindEvents();
  await loadPublishedContent();
  initContentSorting();
  loadPlanSettings();
  syncDurationPickersFromInputs();
  setActivePanel(window.location.hash.replace("#", "") || "races", false);
  try {
    await loadRaces();
    renderStats();
    render();
    renderPlan();
  } catch (error) {
    console.error(error);
    els.resultCount.textContent = "資料載入失敗";
    els.raceList.innerHTML = `<div class="empty-state">賽事資料無法載入，請確認 site/data/races.json 已部署。</div>`;
  }
}

init();
