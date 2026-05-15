const FAVORITES_KEY = "runner-plaza:favorites";
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
  favoritesOnly: false,
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
  planGoal: document.querySelector("#plan-goal"),
  planFinish: document.querySelector("#plan-finish"),
  planPace: document.querySelector("#plan-pace"),
  planRaceDate: document.querySelector("#plan-race-date"),
  planLevel: document.querySelector("#plan-level"),
  planDays: document.querySelector("#plan-days"),
  planWeeks: document.querySelector("#plan-weeks"),
  planWeeklyKm: document.querySelector("#plan-weekly-km"),
  planLongRun: document.querySelector("#plan-long-run"),
  planPriority: document.querySelector("#plan-priority"),
  planOutput: document.querySelector("#plan-output"),
  panelLinks: document.querySelectorAll("[data-panel-link]"),
  panels: document.querySelectorAll("[data-panel]"),
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
    const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    state.favorites = new Set(Array.isArray(stored) ? stored : []);
  } catch {
    state.favorites = new Set();
  }
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
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

function raceDecisionText(race, registrationTarget) {
  const raceDays = dateDiffDays(race.race_date);
  const deadlineDays = dateDiffDays(race.registration_deadline);
  const parts = [];

  if (raceDays !== null) {
    parts.push(raceDays >= 0 ? `距賽 ${raceDays} 天` : "賽事已過");
  }

  if (deadlineDays !== null) {
    if (deadlineDays > 0) {
      parts.push(`報名剩 ${deadlineDays} 天`);
    } else if (deadlineDays === 0) {
      parts.push("今天截止");
    } else {
      parts.push("報名已截止");
    }
  } else {
    parts.push("截止待確認");
  }

  parts.push(registrationTarget.kind === "official" ? "官方直連" : registrationTarget.url ? "來源入口" : "待補連結");
  return parts.join(" · ");
}

function registrationBucket(race) {
  const status = race.registration_status || "";
  const deadlineDays = dateDiffDays(race.registration_deadline);
  if (status.includes("截止") || (deadlineDays !== null && deadlineDays < 0)) {
    return "closed";
  }
  if (deadlineDays !== null && deadlineDays <= 14 && deadlineDays >= 0) {
    return "soon";
  }
  if (status.includes("報名中") || status.includes("開放") || race.source_registration_link || getRegistrationLink(race)) {
    return "open";
  }
  return "unknown";
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

function getRegistrationTarget(race) {
  const officialLink = getRegistrationLink(race);
  if (officialLink) {
    return { url: officialLink, label: "報名網站", kind: "official" };
  }

  const sourceLink = race.source_registration_link || "";
  if (sourceLink) {
    return { url: sourceLink, label: "報名入口", kind: "source" };
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

function buildCalendarEvent(race) {
  const start = formatIcsDate(race.race_date);
  const end = formatIcsDate(addDays(race.race_date, 1));
  const registrationTarget = getRegistrationTarget(race);
  const distances = (race.distances || []).join(" / ");
  const description = [
    `縣市：${race.race_county || "待確認"}`,
    `距離：${distances || "待確認"}`,
    `難度：${race.difficulty || "待確認"}`,
    `報名狀態：${race.registration_status || "待確認"}`,
    `開報：${race.registration_opens_at || "待確認"}`,
    `截止：${race.registration_deadline || "待確認"}`,
    registrationTarget.url ? `${registrationTarget.label}：${registrationTarget.url}` : "報名網站：待補連結",
    !registrationTarget.url && race.facebook_search_url ? `臉書搜尋：${race.facebook_search_url}` : "",
    race.detail_url ? `來源詳情：${race.detail_url}` : "",
  ].filter(Boolean).join("\n");

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
    `SUMMARY:${escapeIcsText(race.race_name)}`,
    `LOCATION:${escapeIcsText(race.race_county || "")}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
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
  if (els.planGoal) {
    els.planGoal.value = goalFromRace(race);
  }
  if (els.planRaceDate) {
    els.planRaceDate.value = race.race_date || "";
  }
  if (els.planPriority) {
    els.planPriority.value = "finish";
  }
  setActivePanel("training");
  renderPlan();
  document.getElementById("training")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getVisibleRaces() {
  const query = state.query.trim().toLowerCase();
  return state.races.filter((race) => {
    const matchesCounty = state.county === "all" || race.race_county === state.county;
    const matchesDifficulty = state.difficulty === "all" || race.difficulty === state.difficulty;
    const matchesRegistration = state.registration === "all" || registrationBucket(race) === state.registration;
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
  const source = state.favoritesOnly ? state.races.filter((race) => isFavorite(race)) : state.races;
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
      const status = race.registration_status || "狀態待確認";
      const difficulty = race.difficulty || "初級";
      const cls = difficultyClass[difficulty] || "";
      const registrationTarget = getRegistrationTarget(race);
      const note = race.registration_note || "未提供官方報名連結，待人工補連結";
      const opensAt = formatShortDate(race.registration_opens_at) || "待確認";
      const deadline = formatShortDate(race.registration_deadline) || "待確認";
      const favorite = isFavorite(race);
      const decision = raceDecisionText(race, registrationTarget);
      const canPlanTraining = dateDiffDays(race.race_date) !== null && dateDiffDays(race.race_date) >= 0;

      return `
        <article class="race-card">
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
            <dl class="registration-times">
              <div><dt>開報</dt><dd>${escapeHtml(opensAt)}</dd></div>
              <div><dt>截止</dt><dd>${escapeHtml(deadline)}</dd></div>
            </dl>
            <div class="race-meta">
              <span class="pill">${escapeHtml(race.race_county)}</span>
              <span class="pill ${cls}">${escapeHtml(difficulty)}</span>
              <span class="pill">${escapeHtml(status)}</span>
            </div>
            <p>${escapeHtml(distances)}</p>
            <div class="race-insight">${escapeHtml(decision)}</div>
          </div>
          <div class="race-actions">
            ${
              registrationTarget.url
                ? `<a class="register-link ${registrationTarget.kind === "source" ? "fallback" : ""}" href="${escapeHtml(registrationTarget.url)}" target="_blank" rel="noreferrer">${escapeHtml(registrationTarget.label)}</a>`
                : `<span class="register-link disabled" title="${escapeHtml(note)}">${escapeHtml(registrationTarget.label)}</span>`
            }
            <div class="secondary-actions">
              <button
                class="favorite-button ${favorite ? "active" : ""}"
                type="button"
                data-favorite="${escapeHtml(key)}"
                aria-pressed="${favorite ? "true" : "false"}"
              >${favorite ? "已收藏" : "收藏"}</button>
              <button class="calendar-button" type="button" data-calendar="${escapeHtml(key)}">行事曆</button>
            </div>
            ${
              canPlanTraining
                ? `<button class="train-button" type="button" data-train-race="${escapeHtml(key)}">用這場排課</button>`
                : `<button class="train-button" type="button" disabled>賽事已過</button>`
            }
            <div class="detail-actions">
              ${!registrationTarget.url && race.facebook_search_url ? `<a class="sub-link" href="${escapeHtml(race.facebook_search_url)}" target="_blank" rel="noreferrer">臉書</a>` : ""}
              ${race.detail_url ? `<a class="sub-link" href="${escapeHtml(race.detail_url)}" target="_blank" rel="noreferrer">詳情</a>` : ""}
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

  els.raceList.querySelectorAll("[data-calendar]").forEach((button) => {
    button.addEventListener("click", () => {
      const race = state.races.find((item) => getRaceKey(item) === button.dataset.calendar);
      if (race) {
        downloadCalendarEvent(race);
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
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) {
    return 0;
  }
  return Number(match[1]) * 60 + Number(match[2]);
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

function goalTrainingTargets(goalProfile, level, weeklyKm, longRunKm, priority) {
  const distance = goalProfile.distanceKm;
  const levelBoost = level === "advanced" ? 1.25 : level === "beginner" ? 0.85 : 1;
  const priorityBoost = priority === "pb" ? 1.12 : priority === "habit" ? 0.88 : 1;
  const baseKm = clampNumber(weeklyKm, 6, 80);
  const rawPeak = Math.max(baseKm * 1.25, distance * 1.4 * levelBoost * priorityBoost);
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

function buildRiskNotes(goalProfile, level, dayCount, weekCount, weeklyKm, longRunKm, priority) {
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
  return notes.length ? notes : ["強度日之間至少隔 48 小時；若疼痛改成休息或步行，菜單要讓身體吸收而不是硬撐。"];
}

function buildTrainingSchedule(dayCount, level, priority, currentWeek, easyRange, tempoRange, intervalRange, longRange) {
  const quality = level === "advanced" && priority === "pb"
    ? `間歇 4-6 組，${intervalRange}`
    : priority === "habit"
      ? `漸進跑 20 分鐘，最後 5 分鐘接近 ${tempoRange}`
      : `節奏跑 15-25 分鐘，${tempoRange}`;
  const recovery = "伸展、肌力或完整休息";
  const easyKm = Math.max(3, Math.round((currentWeek.weeklyKm - currentWeek.longRunKm) / Math.max(2, dayCount - 1)));

  if (dayCount <= 3) {
    return [
      { day: "第 1 跑", type: "輕鬆", work: `${easyKm}km，${easyRange}` },
      { day: "第 2 跑", type: "重點", work: quality },
      { day: "長跑日", type: "長跑", work: `${currentWeek.longRunKm}km，${longRange}` },
    ];
  }

  const schedule = [
    { day: "週二", type: "輕鬆", work: `${easyKm}km，${easyRange}` },
    { day: "週四", type: "重點", work: quality },
    { day: "週五", type: "恢復", work: dayCount >= 4 ? `短恢復跑 25-35 分鐘，${easyRange}` : recovery },
    { day: "週末", type: "長跑", work: `${currentWeek.longRunKm}km，${longRange}` },
  ];

  if (dayCount >= 5) {
    schedule.splice(2, 0, { day: "週三", type: "補量", work: `${Math.max(3, easyKm - 1)}km 輕鬆跑或跑走，${easyRange}` });
  }

  return schedule;
}

function buildPlan(goal, level, days, weeks, finishInput, paceInput, raceDateInput, weeklyKmInput, longRunInput, priorityInput) {
  const goalProfile = planProfiles[goal] || planProfiles["10k"];
  const levelProfile = levelProfiles[level] || levelProfiles.steady;
  const dayCount = Number(days);
  const raceWindow = weeksUntilRace(raceDateInput);
  const weekCount = clampNumber(raceWindow ? raceWindow.weeks : Number(weeks), 1, 20);
  const weeklyKm = Number(weeklyKmInput) || 18;
  const longRunKm = Number(longRunInput) || 8;
  const priority = priorityInput || "finish";
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
  const targets = goalTrainingTargets(goalProfile, level, weeklyKm, longRunKm, priority);
  const weeklyBlocks = buildWeeklyBlocks(weekCount, targets, goalProfile);
  const currentWeek = weeklyBlocks[0];
  const schedule = buildTrainingSchedule(dayCount, level, priority, currentWeek, easyRange, tempoRange, intervalRange, longRange);
  const riskNotes = buildRiskNotes(goalProfile, level, dayCount, weekCount, weeklyKm, longRunKm, priority);
  const progression = buildProgression(weekCount, raceWindow);

  return {
    goalProfile,
    levelProfile,
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
    priority,
    weeklyBlocks,
    currentWeek,
    targets,
    riskNotes,
  };
}

function renderPlan() {
  if (!els.planOutput) {
    return;
  }
  const {
    goalProfile,
    levelProfile,
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
    priority,
    weeklyBlocks,
    currentWeek,
    targets,
    riskNotes,
  } = buildPlan(
    els.planGoal?.value,
    els.planLevel?.value,
    els.planDays?.value,
    els.planWeeks?.value,
    els.planFinish?.value,
    els.planPace?.value,
    els.planRaceDate?.value,
    els.planWeeklyKm?.value,
    els.planLongRun?.value,
    els.planPriority?.value,
  );

  const priorityLabel = {
    finish: "穩定完賽",
    pb: "挑戰 PB",
    habit: "建立習慣",
  }[priority] || "穩定完賽";

  els.planOutput.innerHTML = `
    <div class="plan-hero">
      <div>
        <span>${escapeHtml(weekCount)} 週計畫</span>
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
    </div>
    <div class="pace-zones">
      <div><span>輕鬆跑</span><strong>${escapeHtml(easyRange)}</strong></div>
      <div><span>節奏跑</span><strong>${escapeHtml(tempoRange)}</strong></div>
      <div><span>間歇</span><strong>${escapeHtml(intervalRange)}</strong></div>
      <div><span>長跑</span><strong>${escapeHtml(longRange)}</strong></div>
    </div>
    <div class="plan-note">
      <strong>${escapeHtml(goalProfile.focus)}</strong>
      <p>${escapeHtml(progression)} ${escapeHtml(goalProfile.focus)}。${escapeHtml(levelProfile.note)}檢查點：${escapeHtml(goalProfile.benchmark)}。</p>
    </div>
    <div class="risk-panel">
      <strong>調整提醒</strong>
      <ul>
        ${riskNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
      </ul>
    </div>
    <div class="phase-table" aria-label="週期安排">
      ${weeklyBlocks.map((week) => `
        <div>
          <span>第 ${escapeHtml(week.week)} 週 · ${escapeHtml(week.phase)}</span>
          <strong>${escapeHtml(week.weeklyKm)} km</strong>
          <p>長跑 ${escapeHtml(week.longRunKm)} km · ${escapeHtml(week.focus)}</p>
        </div>
      `).join("")}
    </div>
    <div class="plan-week-title">
      <span>第 1 週執行課表</span>
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
}

function setActiveButtons(buttons, dataKey, value) {
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset[dataKey] === value);
  });
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
      renderPlan();
    });
    [els.planGoal, els.planLevel, els.planDays, els.planWeeks, els.planFinish, els.planPace, els.planRaceDate, els.planWeeklyKm, els.planLongRun, els.planPriority].forEach((control) => {
      control?.addEventListener("input", renderPlan);
      control?.addEventListener("change", renderPlan);
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
  bindEvents();
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
