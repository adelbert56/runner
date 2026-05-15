const FAVORITES_KEY = "runner-plaza:favorites";
const TODAY = "2026-05-15";

const state = {
  races: [],
  county: "all",
  difficulty: "all",
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
  planBuilder: document.querySelector("#plan-builder"),
  planGoal: document.querySelector("#plan-goal"),
  planLevel: document.querySelector("#plan-level"),
  planDays: document.querySelector("#plan-days"),
  planWeeks: document.querySelector("#plan-weeks"),
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
    longRun: "4-7km",
    focus: "建立連續跑能力",
    benchmark: "能舒服完成 30 分鐘慢跑",
  },
  "10k": {
    title: "10K 穩定完賽",
    longRun: "7-12km",
    focus: "穩定週跑量與節奏感",
    benchmark: "能舒服完成 60 分鐘慢跑",
  },
  half: {
    title: "半馬備賽",
    longRun: "12-20km",
    focus: "長跑耐力與補給演練",
    benchmark: "長跑能到 18km 且隔天可正常恢復",
  },
  marathon: {
    title: "全馬基礎",
    longRun: "18-30km",
    focus: "耐力、補給、恢復管理",
    benchmark: "連續 8 週穩定跑量後再拉長跑",
  },
};

const levelProfiles = {
  beginner: {
    label: "新手",
    easy: "跑走交替或非常輕鬆跑",
    quality: "短加速 6 組，每組 20 秒",
    note: "覺得喘就改成走跑，不追配速。",
  },
  steady: {
    label: "有規律慢跑",
    easy: "輕鬆跑，能完整講句子",
    quality: "節奏跑 15-25 分鐘",
    note: "一週只安排一堂有強度的課。",
  },
  advanced: {
    label: "想加強配速",
    easy: "輕鬆跑加 6 組加速跑",
    quality: "間歇或節奏跑，總快跑量控制在 20% 內",
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

function getRaceKey(race) {
  return race.race_id || `${race.race_name}|${race.race_date}`;
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
  const registrationLink = getRegistrationLink(race);
  const distances = (race.distances || []).join(" / ");
  const description = [
    `縣市：${race.race_county || "待確認"}`,
    `距離：${distances || "待確認"}`,
    `難度：${race.difficulty || "待確認"}`,
    `報名狀態：${race.registration_status || "待確認"}`,
    `開報：${race.registration_opens_at || "待確認"}`,
    `截止：${race.registration_deadline || "待確認"}`,
    registrationLink ? `報名網站：${registrationLink}` : "報名網站：待補連結",
    race.facebook_search_url ? `臉書搜尋：${race.facebook_search_url}` : "",
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

function getVisibleRaces() {
  const query = state.query.trim().toLowerCase();
  return state.races.filter((race) => {
    const matchesCounty = state.county === "all" || race.race_county === state.county;
    const matchesDifficulty = state.difficulty === "all" || race.difficulty === state.difficulty;
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
      matchesMonth &&
      matchesFavorite &&
      (!query || haystack.includes(query))
    );
  });
}

function renderStats() {
  els.raceCount.textContent = String(state.races.length);
  els.favoriteCount.textContent = String(state.favorites.size);
  const upcoming = state.races.find((race) => race.race_date >= TODAY) || state.races[0];
  if (!upcoming) {
    els.nextRace.textContent = "--";
    els.heroNextRace.textContent = "--";
    return;
  }
  const date = formatDateParts(upcoming.race_date);
  els.nextRace.textContent = `${date.month}/${date.day}`;
  els.heroNextRace.textContent = date.full.replaceAll("/", ".");
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
      const registrationLink = getRegistrationLink(race);
      const note = race.registration_note || "未提供官方報名連結，待人工補連結";
      const opensAt = formatShortDate(race.registration_opens_at) || "待確認";
      const deadline = formatShortDate(race.registration_deadline) || "待確認";
      const favorite = isFavorite(race);

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
          </div>
          <div class="race-actions">
            ${
              registrationLink
                ? `<a class="register-link" href="${escapeHtml(registrationLink)}" target="_blank" rel="noreferrer">報名網站</a>`
                : `<span class="register-link disabled" title="${escapeHtml(note)}">待補連結</span>`
            }
            <button
              class="favorite-button ${favorite ? "active" : ""}"
              type="button"
              data-favorite="${escapeHtml(key)}"
              aria-pressed="${favorite ? "true" : "false"}"
            >${favorite ? "已收藏" : "收藏"}</button>
            <button class="calendar-button" type="button" data-calendar="${escapeHtml(key)}">加入行事曆</button>
            ${!registrationLink && race.facebook_search_url ? `<a class="sub-link" href="${escapeHtml(race.facebook_search_url)}" target="_blank" rel="noreferrer">臉書搜尋</a>` : ""}
            ${race.detail_url ? `<a class="sub-link" href="${escapeHtml(race.detail_url)}" target="_blank" rel="noreferrer">來源詳情</a>` : ""}
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
}

function buildPlan(goal, level, days, weeks) {
  const goalProfile = planProfiles[goal] || planProfiles["10k"];
  const levelProfile = levelProfiles[level] || levelProfiles.steady;
  const dayCount = Number(days);
  const weekCount = Number(weeks);
  const schedule = [
    { day: "週一", work: "休息或 20 分鐘伸展", type: "恢復" },
    { day: "週二", work: levelProfile.quality, type: "重點" },
    { day: "週三", work: dayCount >= 5 ? levelProfile.easy : "休息或散步", type: dayCount >= 5 ? "輕鬆" : "恢復" },
    { day: "週四", work: levelProfile.easy, type: "輕鬆" },
    { day: "週五", work: dayCount >= 4 ? "短恢復跑 25-40 分鐘" : "休息", type: dayCount >= 4 ? "恢復跑" : "恢復" },
    { day: "週六", work: `長跑 ${goalProfile.longRun}`, type: "長跑" },
    { day: "週日", work: dayCount >= 5 ? "恢復跑 30-45 分鐘" : "休息或核心 15 分鐘", type: dayCount >= 5 ? "恢復跑" : "恢復" },
  ];

  const progression = weekCount === 4
    ? "前 3 週逐步加量，第 4 週降載 20%。"
    : weekCount === 8
      ? "每 3 週加量後 1 週降載，最後一週保留體力。"
      : "前 8 週建立跑量，第 9-10 週高峰，第 11-12 週逐步減量。";

  return { goalProfile, levelProfile, schedule, progression, weekCount };
}

function renderPlan() {
  if (!els.planOutput) {
    return;
  }
  const { goalProfile, levelProfile, schedule, progression, weekCount } = buildPlan(
    els.planGoal?.value,
    els.planLevel?.value,
    els.planDays?.value,
    els.planWeeks?.value,
  );

  els.planOutput.innerHTML = `
    <div class="plan-summary">
      <div>
        <span>目標</span>
        <strong>${escapeHtml(goalProfile.title)}</strong>
      </div>
      <div>
        <span>程度</span>
        <strong>${escapeHtml(levelProfile.label)}</strong>
      </div>
      <div>
        <span>週期</span>
        <strong>${escapeHtml(weekCount)} 週</strong>
      </div>
    </div>
    <div class="plan-note">
      <strong>${escapeHtml(goalProfile.focus)}</strong>
      <p>${escapeHtml(progression)} ${escapeHtml(levelProfile.note)}檢查點：${escapeHtml(goalProfile.benchmark)}。</p>
    </div>
    <div class="plan-week">
      ${schedule.map((item) => `
        <article>
          <span>${escapeHtml(item.day)}</span>
          <strong>${escapeHtml(item.type)}</strong>
          <p>${escapeHtml(item.work)}</p>
        </article>
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

  els.favoriteFilter.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    state.month = "all";
    render();
  });

  els.clearFilters.addEventListener("click", () => {
    state.county = "all";
    state.difficulty = "all";
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
    [els.planGoal, els.planLevel, els.planDays, els.planWeeks].forEach((control) => {
      control?.addEventListener("change", renderPlan);
    });
  }
}

async function loadRaces() {
  const response = await fetch("../runner/赛事/赛事数据库.json");
  if (!response.ok) {
    throw new Error(`Race data request failed: ${response.status}`);
  }
  const races = await response.json();
  state.races = races.sort((a, b) => String(a.race_date).localeCompare(String(b.race_date)));
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
    els.raceList.innerHTML = `<div class="empty-state">賽事資料無法載入，請用本機伺服器開啟 site/index.html。</div>`;
  }
}

init();
