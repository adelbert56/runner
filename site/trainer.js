// ============================================================
// STORAGE
// ============================================================
const LEGACY_STORAGE_KEY = 'runner-trainer-v1';
const DEVICE_KEY = 'runner-trainer:device-id';
const STORAGE_KEY = `runner-trainer:${getDeviceId()}:v1`;
const PRE_RESTORE_STORAGE_KEY = `${STORAGE_KEY}:pre-restore`;
const RUNNER_REGISTERED_RACES_SUFFIX = ':registered-races';
const PLAN_SCHEMA_VERSION = 10;
const GUIDE_ASSET_VERSION = 3;
const GARMIN_WORKOUT_PAIRING_KEY = 'runner-garmin-workout-pairing-v1';
const SKIP_REASON_LABELS = {
  work: '工作／行程',
  sleep: '睡眠不足',
  weather: '天氣因素',
  fatigue: '疲勞累積',
  pain: '疼痛／不適',
  family: '家庭／突發事件',
  other: '其他'
};
const TRAINING_TYPE_LABELS = Object.freeze({
  recovery: '恢復跑',
  easy: '輕鬆跑',
  tempo: '節奏跑',
  interval: '間歇',
  long: '長跑',
  race: '以賽代訓',
  rest: '休息'
});

function addLocalRegistrationLink() {
  if (!['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) return;
  const nav = document.querySelector('.main-nav');
  if (!nav || nav.querySelector('[data-local-only="registration"]')) return;
  const link = document.createElement('a');
  link.href = '/local/registration/registration.html';
  link.textContent = '📝 報名管理';
  link.setAttribute('data-local-only', 'registration');
  nav.append(link);
}

addLocalRegistrationLink();

function createEmptyData() {
  return { profile: null, plan: [], log: [], checkins: [], assessments: [], adaptationPrompts: {}, dayStatuses: {}, skipReasons: {}, makeupRecords: {}, activityAssignments: {}, planChangeHistory: [], garminAnalysisHistory: [], garminSyncManifest: {}, trainingEvents: [], cycleHistory: [], nextCycleDraft: null, nextCycleCoachContext: null, lastBackupAt: null, safetyHold: null };
}

function getDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const nextId = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, nextId);
    return nextId;
  } catch {
    return 'shared-device';
  }
}

function runnerRaceShortHash(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function runnerRegisteredRaceKeys() {
  const keys = new Set();
  let storageKeys = [];
  try {
    storageKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key) => key?.startsWith('runner-plaza:') && key.endsWith(RUNNER_REGISTERED_RACES_SUFFIX));
  } catch (err) {
    console.warn('runnerRegisteredRaceKeys: localStorage 無法列舉，保留正式課表', err);
    return keys;
  }
  storageKeys.forEach((key) => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(saved)) saved.forEach((raceKey) => keys.add(raceKey));
    } catch (err) {
      console.warn(`runnerRegisteredRaceKeys: ${key} 內容毀損，已略過該筆`, err);
    }
  });
  return keys;
}

function runnerRaceKey(race) {
  const legacyKey = race.race_id || `${race.race_name || ''}|${race.race_date || ''}`;
  return `r:${runnerRaceShortHash(legacyKey)}`;
}

function restoreRaceReplacement(day) {
  if (!day?.raceReplacementBase) return false;
  const status = day.status;
  Object.assign(day, day.raceReplacementBase);
  day.status = status;
  delete day.raceReplacementBase;
  delete day.raceReplacement;
  delete day.raceName;
  delete day.postRaceOf;
  delete day.preRaceTaperOf;
  return true;
}

// 從賽事名稱與 distances 欄位解析最長距離（使用者通常報主項目）；解析不到回傳 0 由呼叫端決定 fallback。
function raceMaxKm(race) {
  const texts = [race?.race_name || '', ...(Array.isArray(race?.distances) ? race.distances : [])];
  let max = 0;
  texts.forEach((text) => {
    const s = String(text);
    if (/全馬|全程馬拉松/.test(s)) max = Math.max(max, 42.195);
    if (/半馬|半程馬拉松/.test(s)) max = Math.max(max, 21.0975);
    (s.match(/([\d.]+)\s*[kK]/g) || []).forEach((token) => {
      const value = parseFloat(token);
      if (value > 0 && value <= 110) max = Math.max(max, value);
    });
  });
  return max;
}

// 賽日包：配速策略 + 補給 + 賽前檢查，填進「以賽代訓」卡片的 steps。
// raceKm 與課表目標距離不同時用 Riegel 公式微調配速；profile/weather 缺資料時仍需能安全回傳。
function raceDayPackageSteps(profile, raceKm, dateStr) {
  const km = Number(raceKm) > 0 ? Number(raceKm) : (GOAL_DIST[profile?.goal] || 10);
  const goalDist = GOAL_DIST[profile?.goal] || km;
  const baseRacePaceSec = Number(profile?.racePaceSec) || 0;
  const adjustedPaceSec = baseRacePaceSec > 0 && goalDist > 0
    ? baseRacePaceSec * Math.pow(km / goalDist, 0.07)
    : baseRacePaceSec;
  const racePace = secToPace(adjustedPaceSec);
  const startPace = adjustedPaceSec > 0 ? secToPace(adjustedPaceSec + 12) : '—';

  const paceSteps = [
    {
      icon: '🚦', title: '配速策略・前 5K', dose: '5 km',
      detail: adjustedPaceSec > 0
        ? `以 ${startPace}/km 起跑（比目標配速慢 10–15 秒），先把身體開順，不搶快。`
        : '先用輕鬆節奏起跑，觀察身體狀況，不搶快。'
    },
    {
      icon: '🎯', title: '配速策略・中段穩定', dose: `${Math.max(0, Math.round((km - 5) * 10) / 10)} km 左右`,
      detail: adjustedPaceSec > 0
        ? `穩定守住目標配速 ${racePace}/km，靠節奏而非硬撐維持。`
        : '找到能撐到終點的穩定節奏，靠體感控制強度。'
    },
    {
      icon: '🏁', title: '配速策略・最後收尾', dose: '依當天狀況',
      detail: '體感許可就逐步收快衝線；若後段明顯疲勞，維持節奏、不硬撐，避免抽筋或受傷。'
    }
  ];

  const fuelSteps = [];
  if (km >= 21) {
    fuelSteps.push({ icon: '🍬', title: '補給・能量膠', dose: '每 40–45 分鐘 1 包', detail: '搭配水或運動飲料吞服，避免空腹一次吃太濃造成腸胃不適。' });
  } else if (km >= 10) {
    fuelSteps.push({ icon: '💧', title: '補給・補給站', dose: '每站小口喝水', detail: `${km} km 通常不需要能量膠，靠補給站水分即可，避免一次喝太多。` });
  } else {
    fuelSteps.push({ icon: '💧', title: '補給・賽前補水', dose: '起跑前', detail: '賽前喝夠水即可，短距離賽事中途不必刻意補給。' });
  }
  let isHot = false;
  try {
    const tmax = Number(trainerWeather?.[dateStr]?.tmax);
    isHot = tmax >= 30 || (dateStr ? isHotSeasonDate(new Date(`${dateStr}T00:00:00`)) : false);
  } catch { /* 天氣資料缺失時忽略高溫提醒，不影響其他 steps */ }
  if (isHot) {
    fuelSteps.push({ icon: '🥵', title: '補給・高溫警示', dose: '每個補給站', detail: '氣溫偏高，見水就喝、可澆頭降溫，配速主動放慢，以完賽安全優先。' });
  }

  const checklistSteps = [
    { icon: '🎽', title: '賽前檢查・裝備', dose: '前一晚', detail: '號碼布、晶片、跑鞋、心率錶都先準備並試穿確認不磨腳。' },
    { icon: '😴', title: '賽前檢查・睡眠', dose: '前一晚', detail: '提早上床，就算睡不著也躺著休息，避免臨時熬夜。' },
    { icon: '🍚', title: '賽前檢查・進食', dose: '起跑前 2 小時完畢', detail: '吃熟悉、好消化的食物，起跑前 2 小時完成進食，避免腸胃不適。' },
    { icon: '⏰', title: '賽前檢查・抵達時間', dose: '起跑前 60–90 分', detail: '提早抵達會場，預留熱身、上廁所與寄物時間，避免臨場匆忙。' }
  ];

  return [...paceSteps, ...fuelSteps, ...checklistSteps];
}

// 賽後恢復窗天數：窗內不排品質課與長跑（前 1–2 天全休、其餘只排短恢復跑）。
// 全馬 7 天、半馬 5 天、10K 級 3 天、短距離 2 天。
function postRaceRecoveryDayCount(km) {
  if (km >= 30) return 7;
  if (km >= 15) return 5;
  if (km >= 8) return 3;
  return 2;
}

function addDaysToDateStr(dateStr, delta) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return localDateStr(date);
}

function flattenPlanDays() {
  const flat = [];
  (appData.plan || []).forEach((week) => (week.days || []).forEach((day) => flat.push(day)));
  return flat;
}

// 依報名賽事「實際日期」比對，不假設賽事一定落在週六/週日：
// 使用者的長跑日可自訂在任何一天，比賽前一天若正好是長跑日才轉為賽前休息。
function applyRegisteredSundayRaceReplacements(races) {
  if (!appData?.profile || !Array.isArray(appData.plan)) return false;
  const raceByDate = new Map();
  races.forEach((race) => {
    const existing = raceByDate.get(race.race_date);
    raceByDate.set(race.race_date, existing
      ? { ...race, race_name: `${existing.race_name || '已報名賽事'}、${race.race_name || '已報名賽事'}` }
      : race);
  });
  const today = todayStr();
  const flat = flattenPlanDays();
  const byDateStr = new Map(flat.map((day) => [day.dateStr, day]));
  let changed = false;
  window.lastRaceIntegrationNotices = [];
  // 通知紀錄跟持久化的 key 綁定，而不是跟當下的 day 物件狀態綁定：
  // 就算課表被其他重排流程（rebuildStoredPlan 等）意外洗掉又重套，同一場賽事也只通知一次。
  appData.raceIntegrationNotifiedKeys = Array.isArray(appData.raceIntegrationNotifiedKeys) ? appData.raceIntegrationNotifiedKeys : [];
  const notifiedKeys = new Set(appData.raceIntegrationNotifiedKeys);

  const validRaceDates = new Set(
    flat.filter((day) => day.dateStr >= today && raceByDate.has(day.dateStr)).map((day) => day.dateStr)
  );

  const registeredDates = new Set(races.map((race) => race.race_date).filter(Boolean));

  // 先還原已不再對應有效賽事的替換（賽事被移除、日期變更等）
  flat.forEach((day) => {
    if (!day.raceReplacementBase) return;
    // 已成為歷史的安排凍結不還原：保留「以賽代訓」紀錄供賽後恢復與賽果自動校準使用
    if (day.dateStr < today) return;
    const isValidRaceDay = day.raceReplacement === 'race' && validRaceDates.has(day.dateStr);
    const isValidPreRaceDay = day.raceReplacement === 'pre-race' && validRaceDates.has(addDaysToDateStr(day.dateStr, 1));
    const isValidPostRaceDay = day.raceReplacement === 'post-race'
      && ((typeof day.postRaceOf === 'string' && day.postRaceOf !== '' && day.postRaceOf < today) || registeredDates.has(day.postRaceOf));
    const isValidPreRaceTaperDay = day.raceReplacement === 'pre-race-taper' && validRaceDates.has(day.preRaceTaperOf);
    if (!isValidRaceDay && !isValidPreRaceDay && !isValidPostRaceDay && !isValidPreRaceTaperDay) {
      const wasRace = day.raceReplacement === 'race';
      const restoredName = day.raceName;
      const restoredDateStr = day.dateStr;
      if (restoreRaceReplacement(day)) {
        changed = true;
        if (wasRace) {
          window.lastRaceIntegrationNotices.push(`「${restoredName || '已報名賽事'}」已從課表移除（賽事取消或改期），該週已還原為一般課表`);
          notifiedKeys.delete(restoredDateStr);
        }
      }
    }
  });

  // 再套用目前有效的賽事替換
  validRaceDates.forEach((dateStr) => {
    const raceDay = byDateStr.get(dateStr);
    const race = raceByDate.get(dateStr);
    const raceName = race?.race_name || '已報名賽事';
    const preRaceDay = byDateStr.get(addDaysToDateStr(dateStr, -1));
    const wasAlreadyRaceDay = raceDay.raceReplacement === 'race';

    if (!(raceDay.raceReplacement === 'race' && raceDay.raceName === raceName)) {
      if (!wasAlreadyRaceDay && !notifiedKeys.has(dateStr)) {
        window.lastRaceIntegrationNotices.push(`已將 ${dateStr}「${raceName}」自動排入課表（以賽代訓，賽前一天調整為休息）`);
        notifiedKeys.add(dateStr);
      }
      if (!raceDay.raceReplacementBase) raceDay.raceReplacementBase = { ...raceDay };
      raceDay.raceReplacement = 'race';
      raceDay.raceName = raceName;
      raceDay.type = 'race';
      raceDay.km = 0;
      raceDay.focus = 'race';
      raceDay.task = `${raceName}｜以賽代訓`;
      raceDay.pace = '依賽程距離與當日狀態執行；不另外補長跑';
      raceDay.hrTarget = '';
      raceDay.steps = raceDayPackageSteps(appData.profile, raceMaxKm(race) || GOAL_DIST[appData.profile?.goal] || 10, dateStr);
      changed = true;
    }

    if (preRaceDay && preRaceDay.type === 'long' && preRaceDay.raceReplacement !== 'pre-race') {
      preRaceDay.raceReplacementBase = { ...preRaceDay };
      preRaceDay.raceReplacement = 'pre-race';
      preRaceDay.type = 'easy';
      preRaceDay.focus = 'recovery';
      preRaceDay.km = 0;
      preRaceDay.task = `賽前休息或 20–30 分鐘輕鬆跑｜明天「${raceName}」以賽代訓，不安排長跑`;
      preRaceDay.pace = '完全休息優先；若跑，維持能輕鬆交談的強度';
      preRaceDay.hrTarget = '';
      preRaceDay.steps = [];
      changed = true;
    }
  });

  // 賽後恢復：比賽後 N 天內不排品質課與長跑（N 依賽事距離）。
  // 只改今天（含）之後的課；已發生的日子凍結。已是 rest 或其他賽事替換日則跳過。
  raceByDate.forEach((race, dateStr) => {
    const raceKm = raceMaxKm(race) || GOAL_DIST[appData.profile?.goal] || 10;
    const recoveryCount = postRaceRecoveryDayCount(raceKm);
    const raceName = race?.race_name || '已報名賽事';
    const fullRestDays = raceKm >= 30 ? 2 : 1;
    for (let offset = 1; offset <= recoveryCount; offset++) {
      const day = byDateStr.get(addDaysToDateStr(dateStr, offset));
      if (!day || day.dateStr < today) continue;
      if (day.type === 'rest' || day.raceReplacement) continue;
      day.raceReplacementBase = { ...day };
      day.raceReplacement = 'post-race';
      day.postRaceOf = dateStr;
      day.raceName = raceName;
      day.hrTarget = '';
      day.steps = [];
      day.focus = 'recovery';
      if (offset <= fullRestDays) {
        day.type = 'rest';
        day.km = 0;
        day.task = `賽後恢復日｜「${raceName}」後第 ${offset} 天，完全休息或 20 分鐘散步`;
        day.pace = '不跑步；伸展、補水、睡眠優先';
      } else {
        const easyKm = Math.min(Number(day.km) || 4, raceKm >= 30 ? 6 : 5);
        day.type = 'easy';
        day.km = easyKm;
        day.task = `賽後恢復跑 ${easyKm} km｜「${raceName}」後第 ${offset} 天，只排恢復強度`;
        day.pace = '很輕鬆、可完整對話；心率偏高就改走路';
      }
      changed = true;
    }
  });

  // B 賽（半馬級以上、非目標賽）賽前減壓：賽前 2–3 天的品質課降為輕鬆短跑，
  // 保留腿感、不留疲勞。C 級小賽（<15K）當成以賽代課，不需要額外減壓。
  // 刻意排在賽後恢復之後：兩場賽事靠很近時，共用的日子讓「上一場的恢復」優先。
  validRaceDates.forEach((dateStr) => {
    const race = raceByDate.get(dateStr);
    if ((raceMaxKm(race) || 0) < 15) return;
    for (let offset = 2; offset <= 3; offset++) {
      const day = byDateStr.get(addDaysToDateStr(dateStr, -offset));
      if (!day || day.dateStr < today) continue;
      if (!['tempo', 'interval'].includes(day.type) || day.raceReplacement || day.status === 'done') continue;
      const taperKm = Math.min(Math.round((Number(day.km) || 6) * 0.6 * 10) / 10, 6);
      day.raceReplacementBase = { ...day };
      day.raceReplacement = 'pre-race-taper';
      day.preRaceTaperOf = dateStr;
      day.type = 'easy';
      day.focus = 'recovery';
      day.km = taperKm;
      day.task = `賽前減壓跑 ${taperKm} km｜「${race?.race_name || '已報名賽事'}」前 ${offset} 天，維持腿感、不做強度`;
      day.pace = '很輕鬆、可完整對話；跑完應該覺得意猶未盡';
      day.hrTarget = '';
      day.steps = [];
      changed = true;
    }
  });

  appData.raceIntegrationNotifiedKeys = [...notifiedKeys];
  return changed;
}

function refreshPlanAfterRaceSync() {
  const tabs = ['week', 'coach', 'checkin', 'progress'];
  const activeTabIndex = [...document.querySelectorAll('.plan-toolbar .tab')].findIndex((button) => button.classList.contains('active'));
  const activeTab = tabs[activeTabIndex] || loadUiState().planTab || 'week';
  const selectedWeek = currentWeek;
  const scrollTop = (document.scrollingElement || document.documentElement).scrollTop;
  renderPlanView();
  currentWeek = Math.min(Math.max(1, selectedWeek), appData.plan.length);
  showView('plan');
  switchPlanTab(activeTab);
  if (activeTab === 'week') jumpToPhaseWeek(currentWeek);
  (document.scrollingElement || document.documentElement).scrollTop = scrollTop;
}

function recordRaceIntegrationLog(messages) {
  if (!messages?.length) return;
  const today = todayStr();
  appData.raceIntegrationLog = Array.isArray(appData.raceIntegrationLog) ? appData.raceIntegrationLog : [];
  const existingTexts = new Set(appData.raceIntegrationLog.map((entry) => entry.text));
  messages.forEach((text) => {
    if (existingTexts.has(text)) return; // 同一則訊息只留一筆，避免重複重建把紀錄洗成一長串一樣的內容
    existingTexts.add(text);
    appData.raceIntegrationLog.unshift({ at: today, text });
  });
  appData.raceIntegrationLog = appData.raceIntegrationLog.slice(0, 20);
  saveData(appData);
}

async function syncRegisteredSundayRaces() {
  const registeredKeys = runnerRegisteredRaceKeys();
  if (!registeredKeys.size) {
    if (applyRegisteredSundayRaceReplacements([])) {
      saveData(appData);
      refreshPlanAfterRaceSync();
      recordRaceIntegrationLog(window.lastRaceIntegrationNotices);
    }
    return;
  }
  try {
    const response = await fetch('./data/races.json', { cache: 'no-cache' });
    if (!response.ok) { console.warn(`syncRegisteredSundayRaces: races.json 回應 ${response.status}`); return; }
    const races = await response.json();
    const cancelledStatuses = new Set(['停辦', '停賽']);
    const registeredRaces = races.filter((race) => (
      registeredKeys.has(runnerRaceKey(race)) && !cancelledStatuses.has(race.registration_status)
    ));
    if (applyRegisteredSundayRaceReplacements(registeredRaces)) {
      saveData(appData);
      refreshPlanAfterRaceSync();
      recordRaceIntegrationLog(window.lastRaceIntegrationNotices);
    }
  } catch (err) {
    console.warn('syncRegisteredSundayRaces: 賽事整合失敗（可能離線）', err);
  }
}

function normalizeDayStatuses(dayStatuses) {
  if (!dayStatuses || typeof dayStatuses !== 'object') return {};
  return Object.fromEntries(
    Object.entries(dayStatuses).filter(([, status]) => status === 'done' || status === 'missed')
  );
}

function normalizeSkipReasons(skipReasons) {
  if (!skipReasons || typeof skipReasons !== 'object') return {};
  return Object.fromEntries(
    Object.entries(skipReasons)
      .filter(([dateStr, reason]) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && reason)
      .map(([dateStr, reason]) => {
        if (typeof reason === 'string') {
          return [dateStr, { code: 'other', noMakeupReason: reason.trim().slice(0, 240) }];
        }
        const code = SKIP_REASON_LABELS[reason?.code] ? reason.code : 'other';
        const noMakeupReason = typeof reason?.noMakeupReason === 'string' ? reason.noMakeupReason.trim().slice(0, 240) : '';
        return [dateStr, { code, noMakeupReason }];
      })
  );
}

function normalizeMakeupRecords(makeupRecords) {
  if (!makeupRecords || typeof makeupRecords !== 'object') return {};
  return Object.fromEntries(
    Object.entries(makeupRecords)
      .filter(([sourceDate, record]) => /^\d{4}-\d{2}-\d{2}$/.test(sourceDate) && /^\d{4}-\d{2}-\d{2}$/.test(record?.targetDate || ''))
      .map(([sourceDate, record]) => [sourceDate, { targetDate: record.targetDate, source: record.source === 'garmin-auto' ? 'garmin-auto' : 'scheduled' }])
  );
}

function normalizeTrainingEvents(trainingEvents) {
  if (!Array.isArray(trainingEvents)) return [];
  return trainingEvents
    .filter((event) => event && typeof event.type === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(event.at || ''))
    .slice(-500)
    .map((event) => ({
      id: String(event.id || `${event.type}-${event.at}`),
      type: event.type,
      at: event.at,
      date: /^\d{4}-\d{2}-\d{2}$/.test(event.date || '') ? event.date : '',
      sourceDate: /^\d{4}-\d{2}-\d{2}$/.test(event.sourceDate || '') ? event.sourceDate : '',
      targetDate: /^\d{4}-\d{2}-\d{2}$/.test(event.targetDate || '') ? event.targetDate : '',
      source: event.source === 'garmin' ? 'garmin' : 'runner',
      detail: typeof event.detail === 'string' ? event.detail.slice(0, 240) : ''
    }));
}

function normalizeActivityAssignments(assignments) {
  if (!assignments || typeof assignments !== 'object') return {};
  return Object.fromEntries(Object.entries(assignments)
    .filter(([activityId, item]) => String(activityId).trim() && /^\d{4}-\d{2}-\d{2}$/.test(item?.targetDate || ''))
    .map(([activityId, item]) => [String(activityId), {
      targetDate: item.targetDate,
      mode: ['same-day', 'makeup', 'extra'].includes(item.mode) ? item.mode : 'same-day',
      source: item.source === 'runner' ? 'runner' : 'auto',
      updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(item.updatedAt || '') ? item.updatedAt : new Date().toISOString()
    }]));
}

function normalizeSafetyHold(safetyHold) {
  if (!safetyHold || typeof safetyHold !== 'object' || !safetyHold.active) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safetyHold.startedOn || '')) return null;
  return {
    active: true,
    startedOn: safetyHold.startedOn,
    reason: typeof safetyHold.reason === 'string' ? safetyHold.reason.slice(0, 240) : '近期有疼痛或異常疲勞，先停止品質與長跑。',
    fatigue: Number.isFinite(Number(safetyHold.fatigue)) ? Number(safetyHold.fatigue) : null
  };
}

function normalizePlanChangeHistory(history) {
  if (!Array.isArray(history)) return [];
  const normalized = history.filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') && Array.isArray(item.changes))
    .slice(-30).map((item) => ({ date: item.date, source: String(item.source || 'system').slice(0, 40), title: String(item.title || '課表已更新').slice(0, 100), changes: item.changes.slice(0, 8).map((change) => String(change).slice(0, 180)) }));
  // Garmin 同步可能跨日補齊同一週資料；歷程只呈現同一結果的最後一次，
  // 避免把同一輪自動校準誤看成多筆不同事件。
  return normalized.reduce((items, item) => {
    const previousIndex = item.source === 'garmin'
      ? items.findIndex((previous) => previous.source === item.source && previous.title === item.title && previous.changes.join('|') === item.changes.join('|'))
      : -1;
    if (previousIndex >= 0) items[previousIndex] = item;
    else items.push(item);
    return items;
  }, []);
}

function normalizeTrainingCheckins(checkins) {
  if (!Array.isArray(checkins)) return [];
  const byWeek = new Map();
  checkins.forEach((item) => {
    const weekNum = Number(item?.weekNum);
    if (!Number.isInteger(weekNum) || weekNum < 1 || !item || typeof item !== 'object') return;
    const candidate = { ...item, weekNum };
    const previous = byWeek.get(weekNum);
    // 同一週只保留最後一次有效評估；正式評估優先於先前的提前／暫定評估。
    if (!previous || (previous.provisional && !candidate.provisional) || (!previous.provisional === !candidate.provisional)) byWeek.set(weekNum, candidate);
  });
  return [...byWeek.values()].sort((a, b) => a.weekNum - b.weekNum);
}

function cloneTrainingValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function cycleGoalName(goal) {
  return ({ '5k10k': '入門 5K/10K', half: '半馬 21K', full: '全馬 42K', rehab: '傷後重建' })[goal] || '訓練';
}

function cycleSummaryFromData(data) {
  const days = (data?.plan || []).flatMap((week) => week.days || []).filter((day) => day.type !== 'rest' && !day.isMakeup);
  const doneDates = new Set([
    ...(data?.log || []).map((entry) => entry?.date),
    ...days.filter((day) => day.status === 'done').map((day) => day.dateStr)
  ].filter(Boolean));
  const missedSessions = days.filter((day) => day.status === 'missed').length;
  const completedSessions = days.filter((day) => doneDates.has(day.dateStr)).length;
  const plannedKm = Math.round(days.reduce((sum, day) => sum + (Number(day.km) || 0), 0) * 10) / 10;
  const actualKm = Math.round((data?.log || []).reduce((sum, entry) => sum + (Number(entry.actualKm) || 0), 0) * 10) / 10;
  const rpes = (data?.log || []).map((entry) => Number(entry.rpe)).filter((value) => value > 0);
  const averageRpe = rpes.length ? Math.round((rpes.reduce((sum, value) => sum + value, 0) / rpes.length) * 10) / 10 : null;
  const startDate = (data?.plan || []).flatMap((week) => week.days || []).map((day) => day.dateStr).filter(Boolean).sort()[0] || null;
  const endDate = (data?.plan || []).flatMap((week) => week.days || []).map((day) => day.dateStr).filter(Boolean).sort().at(-1) || null;
  return {
    startDate,
    endDate,
    plannedWeeks: (data?.plan || []).length,
    plannedSessions: days.length,
    completedSessions,
    missedSessions,
    adherence: days.length ? Math.round((completedSessions / days.length) * 100) : 0,
    plannedKm,
    actualKm,
    averageRpe,
    checkinCount: (data?.checkins || []).length,
    assessmentCount: (data?.assessments || []).length
  };
}

function cycleCoachSummary(profile, summary, archivedAt) {
  const goal = cycleGoalName(profile?.goal);
  const facts = [
    `週期：${goal}，${summary.plannedWeeks} 週`,
    `完成：${summary.completedSessions}/${summary.plannedSessions} 堂（${summary.adherence}%）`,
    `手動紀錄：${summary.actualKm.toFixed(1)} km／計畫 ${summary.plannedKm.toFixed(1)} km`,
    summary.averageRpe ? `平均 RPE：${summary.averageRpe}/10` : '尚無足夠 RPE 紀錄',
    `跳過：${summary.missedSessions} 堂`
  ];
  return {
    archivedAt,
    headline: `${goal}結案摘要`,
    facts,
    text: facts.join('；')
  };
}

function normalizeCycleHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter((cycle) => cycle && cycle.profile && Array.isArray(cycle.plan))
    .slice(-12).map((cycle) => ({
      id: String(cycle.id || `cycle-${cycle.archivedAt || Date.now()}`),
      archivedAt: /^\d{4}-\d{2}-\d{2}T/.test(cycle.archivedAt || '') ? cycle.archivedAt : new Date().toISOString(),
      reason: cycle.reason === 'completed' ? 'completed' : 'restart',
      title: String(cycle.title || `${cycleGoalName(cycle.profile?.goal)}週期`).slice(0, 120),
      profile: cloneTrainingValue(cycle.profile),
      plan: cloneTrainingValue(cycle.plan),
      log: cloneTrainingValue(Array.isArray(cycle.log) ? cycle.log : []),
      checkins: cloneTrainingValue(Array.isArray(cycle.checkins) ? cycle.checkins : []),
      assessments: cloneTrainingValue(Array.isArray(cycle.assessments) ? cycle.assessments : []),
      dayStatuses: cloneTrainingValue(cycle.dayStatuses || {}),
      skipReasons: cloneTrainingValue(cycle.skipReasons || {}),
      makeupRecords: cloneTrainingValue(cycle.makeupRecords || {}),
      activityAssignments: cloneTrainingValue(cycle.activityAssignments || {}),
      planChangeHistory: cloneTrainingValue(Array.isArray(cycle.planChangeHistory) ? cycle.planChangeHistory : []),
      trainingEvents: cloneTrainingValue(Array.isArray(cycle.trainingEvents) ? cycle.trainingEvents : []),
      coachSnapshot: cloneTrainingValue(cycle.coachSnapshot || null),
      summary: cycle.summary && typeof cycle.summary === 'object' ? cycle.summary : cycleSummaryFromData(cycle),
      coachSummary: cycle.coachSummary && typeof cycle.coachSummary === 'object' ? cycle.coachSummary : cycleCoachSummary(cycle.profile, cycle.summary || cycleSummaryFromData(cycle), cycle.archivedAt || new Date().toISOString())
    }));
}

function archiveCurrentCycle(reason = 'restart') {
  if (!appData?.profile || !Array.isArray(appData.plan) || !appData.plan.length) return null;
  const archivedAt = new Date().toISOString();
  const summary = cycleSummaryFromData(appData);
  const title = `${cycleGoalName(appData.profile.goal)} · ${summary.startDate || '未定'} 至 ${summary.endDate || '未定'}`;
  return {
    id: globalThis.crypto?.randomUUID?.() || `cycle-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    archivedAt,
    reason,
    title,
    profile: cloneTrainingValue(appData.profile),
    plan: cloneTrainingValue(appData.plan),
    log: cloneTrainingValue(appData.log || []),
    checkins: cloneTrainingValue(appData.checkins || []),
    assessments: cloneTrainingValue(appData.assessments || []),
    dayStatuses: cloneTrainingValue(appData.dayStatuses || {}),
    skipReasons: cloneTrainingValue(appData.skipReasons || {}),
    makeupRecords: cloneTrainingValue(appData.makeupRecords || {}),
    activityAssignments: cloneTrainingValue(appData.activityAssignments || {}),
    planChangeHistory: cloneTrainingValue(appData.planChangeHistory || []),
    trainingEvents: cloneTrainingValue(appData.trainingEvents || []),
    coachSnapshot: coachReviewData ? {
      updatedAt: coachReviewData.updatedAt || null,
      analyticsUpdatedAt: coachReviewData.analyticsUpdatedAt || null,
      autopilot: cloneTrainingValue(coachReviewData.autopilot || null),
      week: cloneTrainingValue(coachReviewData.week || null),
      history: cloneTrainingValue(Array.isArray(coachReviewData.history) ? coachReviewData.history.slice(-12) : []),
      analyticsRuns: cloneTrainingValue((Array.isArray(coachReviewData.analyticsRuns) ? coachReviewData.analyticsRuns : coachReviewData.runs || []).slice(-80))
    } : null,
    summary,
    coachSummary: cycleCoachSummary(appData.profile, summary, archivedAt)
  };
}

function recordTrainingEvent(type, payload = {}) {
  appData.trainingEvents = normalizeTrainingEvents(appData.trainingEvents);
  appData.trainingEvents.push({
    id: globalThis.crypto?.randomUUID?.() || `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    at: new Date().toISOString(),
    source: payload.source === 'garmin' ? 'garmin' : 'runner',
    ...payload
  });
  appData.trainingEvents = appData.trainingEvents.slice(-500);
}

function collectLegacyDayStatuses(data) {
  const dayStatuses = {};
  (data?.plan || []).forEach(week => (week.days || []).forEach(day => {
    if (day?.dateStr && day.type !== 'rest' && (day.status === 'done' || day.status === 'missed')) {
      dayStatuses[day.dateStr] = day.status;
    }
  }));
  (data?.log || []).forEach(entry => {
    if (entry?.date) {
      dayStatuses[entry.date] = 'done';
    }
  });
  return dayStatuses;
}

function applyStoredDayStatuses(data) {
  const dayStatuses = normalizeDayStatuses(data?.dayStatuses);
  (data?.plan || []).forEach(week => (week.days || []).forEach(day => {
    if (!day?.dateStr) return;
    if (day.type === 'rest') {
      // A prior plan may have used this date for a run. Do not let that stale
      // completed/missed status block a newly generated recovery day.
      delete dayStatuses[day.dateStr];
      day.status = 'upcoming';
      return;
    }
    const savedStatus = dayStatuses[day.dateStr];
    if (savedStatus) {
      day.status = savedStatus;
    }
  }));
  data.dayStatuses = dayStatuses;
  return data;
}

function applyStoredMakeupRecords(data) {
  const makeupRecords = normalizeMakeupRecords(data?.makeupRecords);
  const daysByDate = new Map((data?.plan || []).flatMap((week) => week.days || []).map((day) => [day.dateStr, day]));
  Object.entries(makeupRecords).forEach(([sourceDate, record]) => {
    const sourceDay = daysByDate.get(sourceDate);
    const targetDay = daysByDate.get(record.targetDate);
    if (!sourceDay || !targetDay || (targetDay.type !== 'rest' && !(targetDay.isMakeup && targetDay.makeupOf === sourceDate))) {
      delete makeupRecords[sourceDate];
      return;
    }
    if (targetDay.type === 'rest') applyMakeupAssignment(sourceDay, targetDay);
    sourceDay.status = 'missed';
    data.dayStatuses = normalizeDayStatuses(data.dayStatuses);
    data.dayStatuses[sourceDate] = 'missed';
  });
  data.makeupRecords = makeupRecords;
  return data;
}

function normalizeData(data) {
  const base = createEmptyData();
  const normalized = {
    ...base,
    ...(data || {}),
    profile: data?.profile || null,
    plan: Array.isArray(data?.plan) ? data.plan : [],
    log: Array.isArray(data?.log) ? data.log : [],
    checkins: normalizeTrainingCheckins(data?.checkins),
    assessments: Array.isArray(data?.assessments) ? data.assessments : [],
    adaptationPrompts: data?.adaptationPrompts && typeof data.adaptationPrompts === 'object' ? data.adaptationPrompts : {},
    dayStatuses: normalizeDayStatuses(data?.dayStatuses),
    skipReasons: normalizeSkipReasons(data?.skipReasons),
    makeupRecords: normalizeMakeupRecords(data?.makeupRecords),
    activityAssignments: normalizeActivityAssignments(data?.activityAssignments),
    safetyHold: normalizeSafetyHold(data?.safetyHold),
    planChangeHistory: normalizePlanChangeHistory(data?.planChangeHistory),
    trainingEvents: normalizeTrainingEvents(data?.trainingEvents),
    cycleHistory: normalizeCycleHistory(data?.cycleHistory),
    nextCycleDraft: data?.nextCycleDraft && typeof data.nextCycleDraft === 'object' ? cloneTrainingValue(data.nextCycleDraft) : null,
    nextCycleCoachContext: data?.nextCycleCoachContext && typeof data.nextCycleCoachContext === 'object' ? cloneTrainingValue(data.nextCycleCoachContext) : null
  };
  normalized.dayStatuses = {
    ...collectLegacyDayStatuses(normalized),
    ...normalized.dayStatuses
  };
  return applyStoredMakeupRecords(applyStoredDayStatuses(normalized));
}

function loadData() {
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    if (currentRaw) {
      return normalizeData(JSON.parse(currentRaw));
    }
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const migrated = normalizeData(JSON.parse(legacyRaw));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return createEmptyData();
  } catch {
    return createEmptyData();
  }
}

function saveData(data) {
  const normalized = normalizeData(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  if (data && typeof data === 'object') {
    Object.keys(data).forEach((key) => {
      if (!(key in normalized)) delete data[key];
    });
    Object.assign(data, normalized);
  }
  return normalized;
}

function weekHasMalformedVolume(week) {
  if (!week || !Array.isArray(week.days)) return true;
  const runDays = week.days.filter(day => ['easy', 'tempo', 'interval', 'long'].includes(day.type));
  if (!runDays.length) return false;
  const longDay = runDays.find(day => day.type === 'long');
  const longKm = longDay?.km || 0;
  return runDays.some(day => {
    if (day.type !== 'long' && longKm > 0 && (day.km || 0) >= longKm) return true;
    if (day.type === 'easy' && (day.km || 0) >= Math.max((week.targetKm || 0) * 0.75, 18)) return true;
    if ((day.km || 0) >= (week.targetKm || 0) * 0.9) return true;
    return false;
  });
}

function planHasMalformedTimeline(plan) {
  const dates = new Set();
  return plan.some((week, index) => {
    if (week?.weekNum !== index + 1 || !Array.isArray(week?.days) || week.days.length !== 7) return true;
    return week.days.some((day) => {
      if (!day?.dateStr || dates.has(day.dateStr)) return true;
      dates.add(day.dateStr);
      return false;
    });
  });
}

function planEndsBeforeTargetDate(plan, targetDate) {
  if (!targetDate || !Array.isArray(plan) || !plan.length) return false;
  const lastDate = plan.flatMap((week) => week.days || []).map((day) => day.dateStr).filter(Boolean).sort().at(-1);
  return Boolean(lastDate && lastDate < targetDate);
}

function shouldRebuildSavedPlan(data) {
  if (!data?.profile || !Array.isArray(data.plan) || data.plan.length === 0) return false;
  return data.plan.some(weekHasMalformedVolume) || planHasMalformedTimeline(data.plan);
}

function extendSavedPlanToTarget(data) {
  if (!data?.profile || !planEndsBeforeTargetDate(data.plan, data.profile.targetDate)) return data;
  const regenerated = buildPlan({ ...data.profile, planVersion: PLAN_SCHEMA_VERSION });
  const lastExistingDate = data.plan.flatMap((week) => week.days || []).map((day) => day.dateStr).filter(Boolean).sort().at(-1);
  const missingWeeks = regenerated.filter((week) => (week.days || []).some((day) => day.dateStr > lastExistingDate));
  if (!missingWeeks.length) return data;
  return {
    ...data,
    profile: { ...data.profile, planVersion: PLAN_SCHEMA_VERSION },
    // Keep every existing day, status, manual completion and planned workout.
    // A timeline repair may only append the weeks that were previously absent.
    plan: [...data.plan, ...missingWeeks]
  };
}

function rebuildStoredPlan(data) {
  if (!data?.profile) return data;
  const preservedProfile = { ...data.profile };
  preservedProfile.planVersion = PLAN_SCHEMA_VERSION;
  // buildPlan() 產生全新的 day 物件，賽事整合（raceReplacement）標記只存在舊 plan 的 day 上，
  // 先抓出來，重建完再依日期貼回去，避免每次觸發完整重建都把「以賽代訓」洗掉、重新通知
  const preservedRaceDays = (data.plan || []).flatMap((week) => week.days || []).filter((day) => day.raceReplacementBase);
  const freshPlan = buildPlan(preservedProfile);
  // 只有「還沒跑過」的週才可以整週換成全新產生的內容：只要任何一天已經有
  // done/missed 紀錄，代表跑者已經在這週留下真實歷史，即使觸發重建的是
  // 別週（例如遙遠未來某週跑量算式跑出不合理形狀），也不能連帶把已執行
  // 的過去/當週一起洗掉。
  const oldPlan = Array.isArray(data.plan) ? data.plan : [];
  const mergedPlan = freshPlan.map((freshWeek, index) => {
    const oldWeek = oldPlan[index];
    const oldTouched = oldWeek?.weekNum === freshWeek.weekNum
      && Array.isArray(oldWeek.days) && oldWeek.days.length === freshWeek.days.length
      && oldWeek.days.every((day, dayIndex) => day?.dateStr === freshWeek.days[dayIndex]?.dateStr)
      && oldWeek.days.some((day) => day.status === 'done' || day.status === 'missed');
    return oldTouched ? oldWeek : freshWeek;
  });
  const rebuiltData = applyStoredMakeupRecords(applyStoredDayStatuses({
    ...data,
    plan: mergedPlan
  }));
  if (preservedRaceDays.length) {
    const newDaysByDate = new Map(rebuiltData.plan.flatMap((week) => week.days || []).map((day) => [day.dateStr, day]));
    preservedRaceDays.forEach((oldDay) => {
      const newDay = newDaysByDate.get(oldDay.dateStr);
      if (newDay) Object.assign(newDay, oldDay);
    });
  }
  return {
    ...data,
    profile: preservedProfile,
    plan: rebuiltData.plan,
    log: data.log || [],
    checkins: data.checkins || [],
    assessments: data.assessments || [],
    adaptationPrompts: data.adaptationPrompts || {},
    skipReasons: normalizeSkipReasons(data.skipReasons),
    makeupRecords: normalizeMakeupRecords(rebuiltData.makeupRecords),
    trainingEvents: normalizeTrainingEvents(data.trainingEvents)
  };
}

let appData = loadData();
let setupReturnTab = 'week';

// ============================================================
// VIEW SWITCHING
// ============================================================
const UI_STATE_KEY = 'trainer-ui-state';

function saveUiState(patch) {
  try {
    const current = JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}');
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch (err) { /* localStorage 不可用時直接略過 */ }
}

function loadUiState() {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}');
  } catch (err) {
    return {};
  }
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  saveUiState({ view: name });
}

function renderGoalBrief(goal) {
  const meta = GOAL_META[goal] || GOAL_META.half;
  return `
    <div class="mode-brief">
      <div class="mode-brief-kicker">Mode Brief</div>
      <div class="mode-brief-title">${meta.icon} ${meta.label}</div>
      <div class="mode-brief-copy">${meta.handbook}</div>
      <div class="mode-brief-grid">
        <div class="mode-brief-item"><b>適合誰</b><span>${meta.suitable}</span></div>
        <div class="mode-brief-item"><b>生成重點</b><span>${meta.focus}</span></div>
        <div class="mode-brief-item"><b>手機手冊用途</b><span>${meta.exportUse}</span></div>
      </div>
    </div>`;
}

function renderHeroPanel() {
  const shell = document.getElementById('trainer-hero-shell');
  if (!shell) return;
  const profile = appData.profile;
  const hasPlan = Boolean(profile && appData.plan && appData.plan.length);
  const meta = profile ? (GOAL_META[profile.goal] || GOAL_META.half) : GOAL_META.half;
  const week = hasPlan ? (appData.plan[currentWeek - 1] || appData.plan[0]) : null;
  const totalWeeks = hasPlan ? appData.plan.length : null;
  // 教練規劃存在時，階段名稱以教練分期為準，與週期分頁列一致（避免兩套標籤打架）
  const phaseText = week ? `${(typeof coachPhaseForWeek === 'function' && coachPhaseForWeek(week)?.phase) || week.phaseLabel}` : '建立你的個人手冊';
  const progressText = hasPlan ? `第 ${currentWeek} / ${totalWeeks} 週` : '尚未建立';
  const targetDateText = profile?.targetDate || '先設定模式與比賽日';
  const daysToRace = daysUntilTargetDate(profile?.targetDate);
  const countdownText = daysToRace === null
    ? ''
    : daysToRace > 0
      ? ` · 剩 ${daysToRace} 天`
      : daysToRace === 0
        ? ' · 就是今天！'
        : ' · 已完賽';
  const paceText = profile?.racePaceSec ? `${secToPace(profile.racePaceSec)}/km` : '完成設定後帶入';
  const weeklyTarget = week ? effectiveWeekVolumeTarget(week).display : '依可訓練日生成';
  shell.innerHTML = `
    <div class="trainer-hero-layout">
      <div class="trainer-hero-main">
        <div class="trainer-hero-eyebrow">
          <div class="trainer-hero-kicker">Runner Planner · Active Plan</div>
          ${hasPlan ? `<span class="trainer-hero-phase">${reviewEscape(phaseText)}</span>` : ''}
        </div>
        <h1 class="trainer-hero-title" id="trainer-hero-title">${hasPlan ? meta.label : '建立你的個人訓練計畫'}</h1>
        <p class="trainer-hero-planline">${hasPlan ? `第 ${currentWeek} / ${totalWeeks} 週 · ${reviewEscape(phaseText)}` : '從目標、可訓練日到每日課表，一次建立。'}</p>
        ${hasPlan ? '' : '<p class="trainer-hero-copy">設定目標、可訓練日與目前跑量，建立一份能每天照著執行的個人訓練計畫。</p>'}
        <div class="trainer-hero-stats">
          <div class="trainer-stat">
            <div class="trainer-stat-label">賽事日</div>
            <div class="trainer-stat-value">${hasPlan ? targetDateText : meta.label}</div>
            <div class="trainer-stat-sub">${hasPlan ? (daysToRace === null ? '目標日尚未設定' : daysToRace > 0 ? `距離目標日 ${daysToRace} 天` : daysToRace === 0 ? '就是今天' : '已完賽') : '入門 / 半馬 / 全馬 / 傷後重建'}</div>
          </div>
          <div class="trainer-stat">
            <div class="trainer-stat-label">當週處方</div>
            <div class="trainer-stat-value">${hasPlan ? weeklyTarget : progressText}</div>
            <div class="trainer-stat-sub">${hasPlan ? '正式課表總跑量' : '先完成設定後開始'}</div>
          </div>
          <div class="trainer-stat">
            <div class="trainer-stat-label">配速基準</div>
            <div class="trainer-stat-value">${hasPlan ? paceText : weeklyTarget}</div>
            <div class="trainer-stat-sub">${hasPlan ? '依身體狀態彈性調整' : '會依你的條件自動估算'}</div>
          </div>
        </div>
        ${hasPlan ? '' : `<div class="trainer-hero-points">
          <span class="trainer-point">目標日 ${targetDateText}</span>
          <span class="trainer-point">熱身・主課・收操會分段顯示</span>
          <span class="trainer-point">完成設定後開始追蹤</span>
        </div>`}
      </div>
      <aside class="trainer-hero-side" aria-label="${hasPlan ? '今日課表' : '功能重點'}">
        ${hasPlan ? renderHeroTodayCard() : `
        <div class="trainer-side-card">
          <div class="trainer-side-kicker">Getting Started</div>
          <div class="trainer-side-title">往下填設定，一次生成本週課表</div>
          <div class="trainer-side-list">
            <div class="trainer-side-item"><b>Plan</b><span>節奏 / 長跑 / 恢復分流</span></div>
            <div class="trainer-side-item"><b>Coach</b><span>依 Garmin 實績給下週建議</span></div>
          </div>
        </div>`}
      </aside>
    </div>`;
}

// 台中 7 日預報（open-meteo，免金鑰）；提供清晨／傍晚跑步時段，快取 90 分鐘
let trainerWeather = null;
async function loadTrainerWeather() {
  const CACHE_KEY = 'trainer-weather-cache-v2';
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached?.byDate && Date.now() - cached.at < 90 * 60 * 1000) {
      trainerWeather = cached.byDate;
      return;
    }
  } catch { /* 快取壞掉就直接重抓 */ }
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=24.1477&longitude=120.6736&daily=temperature_2m_max,precipitation_probability_max&hourly=precipitation_probability&timezone=Asia%2FTaipei&forecast_days=7');
    if (!res.ok) return;
    const data = await res.json();
    const hourlyRain = data.hourly?.time?.reduce((map, time, index) => {
      const date = String(time).slice(0, 10);
      const hour = Number(String(time).slice(11, 13));
      if (!map[date]) map[date] = { morning: [], evening: [] };
      const value = data.hourly?.precipitation_probability?.[index];
      if (Number.isFinite(value) && hour >= 5 && hour <= 8) map[date].morning.push(value);
      if (Number.isFinite(value) && hour >= 18 && hour <= 21) map[date].evening.push(value);
      return map;
    }, {}) || {};
    const windowRain = (values) => values?.length ? Math.max(...values) : null;
    const byDate = {};
    (data.daily?.time || []).forEach((date, index) => {
      const windows = hourlyRain[date] || {};
      byDate[date] = {
        tmax: data.daily.temperature_2m_max?.[index] ?? null,
        rain: data.daily.precipitation_probability_max?.[index] ?? null,
        morningRain: windowRain(windows.morning),
        eveningRain: windowRain(windows.evening)
      };
    });
    trainerWeather = byDate;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), byDate }));
  } catch { /* 離線或 API 掛掉：不顯示天氣，不影響課表 */ }
}

function dayWeatherLine(day, { showForRest = false } = {}) {
  const wx = trainerWeather?.[day.dateStr];
  if (!wx || wx.tmax === null) return '';
  if (day.type === 'rest' && !showForRest) return '';
  const hot = wx.tmax >= 30;
  const runWindows = [
    wx.morningRain !== null && wx.morningRain !== undefined ? { label: '清晨', rain: wx.morningRain } : null,
    wx.eveningRain !== null && wx.eveningRain !== undefined ? { label: '傍晚', rain: wx.eveningRain } : null
  ].filter(Boolean);
  const preferredWindow = runWindows.slice().sort((a, b) => a.rain - b.rain)[0] || null;
  const wet = (preferredWindow?.rain ?? wx.rain ?? 0) >= 60;
  const icon = wet ? '🌧' : wx.tmax >= 33 ? '🥵' : hot ? '☀️' : '🌤';
  const rainText = runWindows.length
    ? `${runWindows.map((window) => `${window.label} ${Math.round(window.rain)}%`).join('／')}（全天最高 ${Math.round(wx.rain ?? 0)}%）`
    : wx.rain !== null ? `全天最高 ${Math.round(wx.rain)}%` : '';
  const advice = day.type === 'rest'
    ? ''
    : preferredWindow && preferredWindow.rain < 60 && (wx.rain ?? 0) >= 60
      ? `建議${preferredWindow.label}出發，避開午後陣雨`
    : hot
      ? '建議清晨或傍晚出發，配速放慢、帶水'
      : wet
        ? '雨天路滑：小步幅、避開白線與人孔蓋'
        : '';
  const variant = hot ? 'wx-hot' : wet ? 'wx-rain' : '';
  return `<div class="wx-chip ${variant}"><span class="wx-icon">${icon}</span><span>預報 ${Math.round(wx.tmax)}°C${rainText ? ` · ${rainText}` : ''}${advice ? `<span class="wx-advice">${advice}</span>` : ''}</span></div>`;
}

function daysUntilTargetDate(targetDate) {
  if (!targetDate) return null;
  const target = new Date(`${targetDate}T00:00:00`).getTime();
  const today = new Date(`${todayStr()}T00:00:00`).getTime();
  if (Number.isNaN(target) || Number.isNaN(today)) return null;
  return Math.round((target - today) / 86400000);
}

function findTodayPlanDay() {
  const today = todayStr();
  for (const week of appData.plan || []) {
    const day = (week.days || []).find((item) => item.dateStr === today);
    if (day) return { day: resolveCourse(day, buildContext(), week).course, weekNum: week.weekNum || null };
  }
  return null;
}

function heroTodayStepSummary(step, day) {
  const dose = String(step?.dose || '').replace(/\bNaN(?:\.\d+)?\s*(?:km|公里)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  if (dose) return dose;
  const detail = String(step?.detail || step?.text || '').trim();
  if (!detail) return step?.title === '主課' ? trainingTaskTitle(day) : '';
  return step?.title === '主課'
    ? detail.replace(/。目的：.*$/s, '').replace(/。目標：.*$/s, '')
    : detail;
}

function renderHeroTodayCard() {
  const hit = findTodayPlanDay();
  const typeName = TRAINING_TYPE_LABELS;
  const badgeClass = { easy: 'badge-easy', tempo: 'badge-tempo', interval: 'badge-interval', long: 'badge-long', race: 'badge-long', rest: 'badge-rest' };
  if (!hit) {
    return `
      <div class="trainer-side-card hero-today-card">
        <div class="trainer-side-kicker">Today</div>
        <div class="trainer-side-title">今天不在計畫範圍內</div>
        <div class="trainer-side-copy">計畫尚未開始或已結束；可到課表確認週次，或修改設定重新生成。</div>
        <button class="btn btn-primary hero-today-btn" onclick="goToToday()">📍 查看本週課表</button>
      </div>`;
  }
  const { day } = hit;
  const garminRun = typeof getGarminRunForDate === 'function' ? getGarminRunForDate(day.dateStr) : null;
  const statusText = garminRun
    ? `✓ Garmin 已記錄 ${garminRun.km ? `${garminRun.km} km` : ''}`
    : day.status === 'done'
      ? '✓ 已完成'
      : day.status === 'missed'
        ? '✗ 已跳過'
        : '';
  const detail = day.type === 'rest'
    ? (day.supportBlocks || []).map((block) => block.title).join('・') || '主動恢復 / 完全休息'
    : [day.pace, day.hrTarget].filter(Boolean).join(' · ');
  const steps = day.steps || [];
  const mainStep = steps.find((step) => step.title === '主課');
  const supportingSteps = steps.filter((step) => step !== mainStep);
  const renderHeroStep = (step, isMain = false) => `<div class="hero-today-step${isMain ? ' is-main' : ''}"><b>${reviewEscape(step.title || '')}</b><span${isMain ? ' class="hero-today-main-copy"' : ''}>${reviewEscape(heroTodayStepSummary(step, day))}</span></div>`;
  const stepStrip = mainStep
    ? `<div class="hero-today-steps">${renderHeroStep(mainStep, true)}${supportingSteps.length ? `<div class="hero-today-side-steps">${supportingSteps.map((step) => renderHeroStep(step)).join('')}</div>` : ''}</div>`
    : steps.length
      ? `<div class="hero-today-steps">${steps.map((step) => renderHeroStep(step)).join('')}</div>`
      : '';
  return `
    <div class="trainer-side-card hero-today-card">
      <div class="trainer-side-kicker">Today · ${DOW_NAMES[day.dow]} ${day.dateStr.slice(5)}</div>
      <div class="trainer-side-title"><span class="workout-badge ${day.coachPlan ? 'badge-coach' : (badgeClass[day.type] || 'badge-rest')}">${day.coachPlan ? '📌 教練課表' : (typeName[day.type] || '訓練')}</span> ${reviewEscape(trainingTaskTitle(day))}</div>
      ${detail ? `<div class="trainer-side-copy">${detail}</div>` : ''}
      ${dayWeatherLine(day, { showForRest: true })}
      ${stepStrip}
      ${statusText ? `<div class="trainer-side-metric">${statusText}</div>` : ''}
      <button class="btn btn-primary hero-today-btn" onclick="goToToday()">📍 查看今日課表</button>
    </div>`;
}

function goToToday() {
  if (!document.getElementById('plan-tab-week')) {
    renderPlanView();
    showView('plan');
  }
  switchPlanTab('week');
  const hit = findTodayPlanDay();
  if (hit?.weekNum) {
    jumpToPhaseWeek(hit.weekNum);
  }
  requestAnimationFrame(() => {
    const target = document.querySelector('.day-card.today') || document.getElementById('plan-tab-week');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function renderExerciseFigure(kind) {
  const art = {
    squat: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="60" cy="18" r="8" fill="#f09a57"/><path d="M60 28 L48 44 L56 54 L69 40 Z" fill="#2f7d5a"/><path d="M56 54 L36 60" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M57 54 L78 60" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M52 50 L46 74" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M68 49 L76 74" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M28 60 H92" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    lunge: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="68" cy="16" r="8" fill="#f09a57"/><path d="M67 25 L58 44 L72 54 L82 36 Z" fill="#2f7d5a"/><path d="M58 43 L41 56" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M72 53 L91 56" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M54 52 L44 76" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M76 53 L88 76" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M32 76 H96" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    bridge: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="88" cy="54" r="7" fill="#f09a57"/><path d="M80 53 L63 42 L34 52" stroke="#2f7d5a" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 52 L24 68" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M64 42 L56 68" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M14 68 H104" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    clam: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="86" cy="54" r="7" fill="#f09a57"/><path d="M78 54 L58 48 L34 52" stroke="#2f7d5a" stroke-width="10" stroke-linecap="round"/><path d="M33 53 L22 67" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M55 50 L38 37" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M14 68 H102" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    single_balance: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="60" cy="16" r="8" fill="#f09a57"/><path d="M60 25 L52 46 L60 58 L68 46 Z" fill="#2f7d5a"/><path d="M52 44 L38 52" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M68 44 L83 38" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M60 58 L60 77" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M60 58 L78 67" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M44 78 H76" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    plank: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="92" cy="40" r="7" fill="#f09a57"/><path d="M84 40 L56 44 L28 48" stroke="#2f7d5a" stroke-width="10" stroke-linecap="round"/><path d="M58 44 L52 65" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M34 48 L24 68" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M16 68 H102" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    hip_flexor: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="68" cy="16" r="8" fill="#f09a57"/><path d="M68 26 L58 45 L72 55 L82 37 Z" fill="#2f7d5a"/><path d="M58 44 L42 56" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M72 54 L92 55" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M54 53 L45 76" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M82 54 L82 76" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M32 76 H98" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    glute_stretch: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="82" cy="26" r="7" fill="#f09a57"/><path d="M74 30 L56 42 L44 60" stroke="#2f7d5a" stroke-width="10" stroke-linecap="round"/><path d="M44 60 L27 72" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M58 42 L82 58" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M18 74 H102" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    calf_foot: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <path d="M26 66 C38 50 54 48 66 54 C78 60 87 58 96 52" fill="none" stroke="#2f7d5a" stroke-width="10" stroke-linecap="round"/><path d="M24 70 H98" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/><circle cx="42" cy="46" r="6" fill="#f09a57"/><path d="M48 48 L60 60" stroke="#3e5360" stroke-width="7" stroke-linecap="round"/>
      </svg>`,
    walk: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="60" cy="16" r="8" fill="#f09a57"/><path d="M60 26 L54 45 L64 56 L74 40 Z" fill="#2f7d5a"/><path d="M54 44 L41 52" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M64 44 L79 38" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M58 56 L47 76" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M66 56 L82 72" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M38 78 H88" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    mobility: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="60" cy="16" r="8" fill="#f09a57"/><path d="M60 26 L52 46 L60 58 L68 46 Z" fill="#2f7d5a"/><path d="M52 42 L34 32" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M68 42 L86 32" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M60 58 L47 76" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M60 58 L73 76" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><circle cx="26" cy="28" r="4" fill="#a7c9b6"/><circle cx="94" cy="28" r="4" fill="#a7c9b6"/>
      </svg>`,
    foam_roll: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="84" cy="42" r="7" fill="#f09a57"/><path d="M76 42 L54 48 L36 58" stroke="#2f7d5a" stroke-width="10" stroke-linecap="round"/><path d="M36 58 L22 68" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><rect x="52" y="56" width="26" height="10" rx="5" fill="#efb16d"/><path d="M16 70 H102" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    run_easy: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="66" cy="16" r="8" fill="#f09a57"/><path d="M66 26 L57 44 L67 54 L79 39 Z" fill="#2f7d5a"/><path d="M57 43 L42 51" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M67 43 L83 37" stroke="#2f7d5a" stroke-width="7" stroke-linecap="round"/><path d="M61 55 L49 76" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M69 55 L86 71" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M38 78 H92" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    run_tempo: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="64" cy="15" r="8" fill="#f09a57"/><path d="M64 25 L54 43 L64 53 L78 35 Z" fill="#d96f39"/><path d="M54 42 L37 48" stroke="#d96f39" stroke-width="7" stroke-linecap="round"/><path d="M65 42 L82 33" stroke="#d96f39" stroke-width="7" stroke-linecap="round"/><path d="M59 54 L46 76" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M68 54 L88 66" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M34 78 H94" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
    run_interval: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="63" cy="15" r="8" fill="#f09a57"/><path d="M63 25 L53 41 L65 50 L80 33 Z" fill="#c95533"/><path d="M54 40 L38 43" stroke="#c95533" stroke-width="7" stroke-linecap="round"/><path d="M66 40 L86 30" stroke="#c95533" stroke-width="7" stroke-linecap="round"/><path d="M59 51 L44 76" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M69 51 L90 60" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M34 78 H96" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/><path d="M92 24 l6 0 l-5 5" fill="none" stroke="#c95533" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    stretch: `
      <svg viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
        <circle cx="72" cy="18" r="7" fill="#f09a57"/><path d="M71 26 L56 42 L43 58" stroke="#2f7d5a" stroke-width="10" stroke-linecap="round"/><path d="M43 58 L27 73" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M55 42 L82 50" stroke="#3e5360" stroke-width="8" stroke-linecap="round"/><path d="M18 74 H100" stroke="#d7c6a3" stroke-width="6" stroke-linecap="round"/>
      </svg>`
  };
  return art[kind] || art.mobility;
}

const GUIDE_LIBRARY = {
  warmup: {
    title: '熱身圖解',
    intro: '課表會依當天跑課自動指定低衝擊或品質課啟動版。只做今天指定的四步，不用把每套熱身都做完。',
    cover: {
      src: 'assets/trainer-guides/warmup-cover.png',
      alt: '跑前動態暖身封面圖'
    },
    courses: [{
      title: '輕鬆跑／長跑前｜低衝擊啟動',
      src: 'assets/trainer-guides/warmup-easy-flow.png',
      alt: '輕鬆跑前低衝擊暖身圖解',
      caption: '適合輕鬆跑、恢復跑與長跑前；目標是讓腳踝、髖部與步頻順起來，不把力氣用在熱身。',
      items: ['快走 2 分鐘', '扶牆腳踝活動 10 次 / 邊', '扶牆前後擺腿 10 次 / 邊', '原地踏步高抬膝 30 秒']
    }, {
      title: '節奏／間歇前｜品質課啟動',
      src: 'assets/trainer-guides/warmup-course-flow.png',
      alt: '節奏與間歇課前動態暖身圖解',
      caption: '適合節奏跑與間歇跑；完成時應感覺關節活動順、呼吸微熱，而不是疲累。',
      items: ['腳踝繞圈 30 秒 / 邊', '弓箭步轉體 8 次 / 邊', '原地高抬腿 30 秒', '原地小跳 20 秒（無痛再做）']
    }],
    assets: [
      {
        title: '跑前動態暖身',
        src: 'assets/trainer-guides/warmup-dynamic.png',
        alt: '跑前動態暖身海報',
        caption: '建議在輕鬆跑、節奏跑、長跑前都先做一輪。',
        figures: [['walk','步行暖身'],['calf_foot','小腿動態'],['mobility','髖關節繞圈'],['lunge','弓箭步轉體'],['run_easy','原地高抬腿']],
        items: [
          '腳踝繞圈 30 秒 / 邊',
          '小腿動態伸展 10 次 / 邊',
          '髖關節繞圈 10 次 / 邊',
          '弓箭步轉體 8 次 / 邊',
          '原地高抬腿 30 秒',
          '原地小跳 20 秒（無痛再做）'
        ]
      }
    ]
  },
  cooldown: {
    title: '收操伸展',
    intro: '課表會依當天負荷指定短版恢復或長跑回收版。收操只做到微拉感；疼痛、抽筋或隔天更緊時，下一次要下修。',
    cover: {
      src: 'assets/trainer-guides/cooldown-cover.png',
      alt: '跑後收操伸展封面圖'
    },
    courses: [{
      title: '輕鬆跑／品質課後｜8 分鐘回收',
      src: 'assets/trainer-guides/cooldown-recovery-flow.png',
      alt: '輕鬆跑與品質課後八分鐘收操圖解',
      caption: '適合輕鬆跑、節奏跑、間歇跑後；先把呼吸降下來，再處理髖部、腿後側與臀部。',
      items: ['慢走 + 深呼吸 2 分鐘', '髖屈肌伸展 40 秒 / 邊', '腿後側伸展 40 秒 / 邊', '臀肌伸展 40 秒 / 邊']
    }, {
      title: '長跑後｜12 分鐘下肢回收',
      src: 'assets/trainer-guides/cooldown-course-flow.png',
      alt: '長跑後十二分鐘收操伸展圖解',
      caption: '長跑後優先處理小腿、臀部、髂脛束周邊與足底；每個姿勢只到微拉感，不追求疼痛。',
      items: ['小腿伸展 45 秒 / 邊', '臀肌伸展 45 秒 / 邊', '髂脛束周邊放鬆 1–2 分鐘', '足底按摩 1–2 分鐘']
    }],
    assets: [
      {
        title: '跑後收操伸展',
        src: 'assets/trainer-guides/cooldown-static.png',
        alt: '跑後收操伸展海報',
        caption: '長跑日與節奏課後優先使用，降低臀腿與足底緊繃。',
        figures: [['calf_foot','小腿伸展'],['glute_stretch','臀肌伸展'],['stretch','髂脛束放鬆'],['foam_roll','足底按摩']],
        items: [
          '小腿伸展 45 秒 / 邊',
          '臀肌伸展 45 秒 / 邊',
          '髂脛束周邊放鬆 1-2 分鐘',
          '足底按摩 1-2 分鐘'
        ]
      }
    ]
  },
  strength: {
    title: '肌力動作',
    intro: '課表會依週次與休息日，自動安排 A、B、C 三套輪替。每次只做指定的一套，既能穩定進步，也不會把所有動作硬塞在同一天。',
    cover: {
      src: 'assets/trainer-guides/strength-cover.png',
      alt: '跑者肌力訓練封面圖'
    },
    courses: [{
      title: '肌力 A｜臀腿穩定',
      src: 'assets/trainer-guides/strength-course-flow.png',
      alt: '跑者四項基礎肌力動作圖解',
      caption: '臀腿穩定日：安排在休息日或輕鬆跑後。每個動作做完 3 組後再換下一項。',
      items: ['臀橋 3×12', '分腿蹲 3×8 / 邊', '側棒式 3×30 秒 / 邊', '單腳小腿提踵 3×12 / 邊'],
      drills: [
        { name: '臀橋', dose: '3×12' }, { name: '分腿蹲', dose: '3×8 / 邊' },
        { name: '側棒式', dose: '3×30 秒 / 邊' }, { name: '單腳小腿提踵', dose: '3×12 / 邊' }
      ]
    }, {
      title: '肌力 B｜核心與髖足控制',
      src: 'assets/trainer-guides/strength-course-b-flow.png',
      alt: '跑者四項核心與髖足控制動作圖解',
      caption: '核心控制日：和 A 輪替做。動作過程維持骨盆穩定，無法控制時就減少次數。',
      items: ['死蟲 3×10 / 邊', 'Bird Dog 3×10 / 邊', '蚌殼式 3×15 / 邊', '彈力帶側走 3×10 步 / 邊'],
      drills: [
        { name: '死蟲', dose: '3×10 / 邊' }, { name: 'Bird Dog', dose: '3×10 / 邊' },
        { name: '蚌殼式', dose: '3×15 / 邊' }, { name: '彈力帶側走', dose: '3×10 步 / 邊' }
      ]
    }, {
      title: '肌力 C｜單腳控制與小腿耐受',
      src: 'assets/trainer-guides/strength-course-c-flow.png',
      alt: '跑者四項單腳控制與小腿耐受動作圖解',
      caption: '單腳控制日：把力量轉成穩定落地。先選穩定的矮台，所有單腳動作兩側都要完成。',
      items: ['踏台 Step-up 3×10 / 邊', '單腳羅馬尼亞硬舉 3×8 / 邊', '後跨弓箭步 3×8 / 邊', '靠牆脛前肌抬腳 3×15'],
      drills: [
        { name: '踏台 Step-up', dose: '3×10 / 邊' }, { name: '單腳羅馬尼亞硬舉', dose: '3×8 / 邊' },
        { name: '後跨弓箭步', dose: '3×8 / 邊' }, { name: '靠牆脛前肌抬腳', dose: '3×15' }
      ]
    }],
    assets: [
      {
        title: '跑者肌力訓練 A',
        src: 'assets/trainer-guides/muscle-a.png',
        alt: '跑者肌力訓練A海報',
        caption: '臀腿穩定主軸：臀橋、分腿蹲、側棒式、小腿提踵。',
        figures: [['bridge','臀橋'],['lunge','分腿蹲'],['hip_flexor','羅馬尼亞硬舉'],['plank','側棒式'],['calf_foot','小腿提踵'],['single_balance','單腳站平衡']],
        items: [
          '臀橋 3×12',
          '分腿蹲 3×8 / 邊',
          '羅馬尼亞硬舉 3×8',
          '側棒式 3×30 秒 / 邊',
          '小腿提踵 3×15',
          '單腳站平衡 3×30 秒 / 邊'
        ]
      },
      {
        title: '跑者肌力訓練 B',
        src: 'assets/trainer-guides/muscle-b.png',
        alt: '跑者肌力訓練B海報',
        caption: '核心與足踝主軸：死蟲、Bird Dog、蚌殼式、短足訓練。',
        figures: [['foam_roll','死蟲'],['plank','Bird Dog'],['clam','蚌殼式'],['walk','彈力帶側走'],['calf_foot','脛前肌抬腳'],['calf_foot','短足訓練']],
        items: [
          '死蟲 3×10 / 邊',
          'Bird Dog 3×10 / 邊',
          '蚌殼式 3×15 / 邊',
          '彈力帶側走 3×10 步 / 邊',
          '脛前肌抬腳 3×15',
          '足底短足訓練 3×10'
        ]
      }
    ]
  }
};

// ============================================================
// SETUP VIEW
// ============================================================
function renderSetupView() {
  renderHeroPanel();
  const el = document.getElementById('view-setup');
  const hasExistingPlan = Boolean(appData.profile && appData.plan && appData.plan.length);
  const nextCycleContext = appData.nextCycleCoachContext || appData.profile?.historyContext || null;
  const nextCycleNote = nextCycleContext
    ? `<div class="coach-setting-card" style="margin-bottom:20px"><div class="coach-setting-value">已引用上一週期給教練</div><div class="coach-fineprint">${reviewEscape(nextCycleContext.text || '已選擇歷史訓練摘要。')} 新週期建立後，這份摘要會保留在教練建議中供調整課程時參考。</div><div class="training-status-actions" style="margin-top:10px;justify-content:flex-start"><button class="btn btn-secondary" type="button" onclick="clearHistoryCoachContext()">不引用這份歷史</button></div></div>`
    : '';
  const goalCards = ['5k10k', 'half', 'full', 'rehab'].map(goal => {
    const meta = GOAL_META[goal];
    return `<div class="goal-card" data-goal="${goal}">
      <div class="goal-icon">${meta.icon}</div>
      <div class="goal-name">${meta.label}</div>
      <div class="goal-desc">${meta.cardDesc} · ${meta.minWeeksText}</div>
    </div>`;
  }).join('');
  el.innerHTML = `
<div class="container" style="max-width:820px">
  <div class="card" style="margin-top:24px">
    <div class="card-title">📋 訓練手冊設定</div>
    <p style="font-size:15px;line-height:1.7;color:var(--c-text-muted);margin-bottom:24px">這個功能不是只吐出課表，而是依你的目標、可訓練日、目前跑量與恢復條件，生成一份可放進手機的個人訓練手冊。所有資料只存在您的裝置上。</p>
    ${hasExistingPlan ? `<div style="background:#f3efe5;border-radius:10px;padding:12px 14px;font-size:14px;color:var(--c-text-muted);margin-bottom:20px">你目前已經有一份訓練計畫。改完設定後按「更新訓練手冊」，若只是想回去看原計畫，可直接按「返回目前計畫」。</div>` : ''}
    ${nextCycleNote}

    <!-- 1. Goal -->
    <div class="form-group">
      <div class="form-label">訓練模式</div>
      <div class="goal-grid" id="goal-grid">
        ${goalCards}
      </div>
      <div id="goal-brief">${renderGoalBrief(formState.goal || 'half')}</div>
    </div>

    <!-- 2. Target Date -->
    <div class="form-group">
      <label class="form-label" for="f-date">目標比賽日期</label>
      <input class="form-input" type="date" id="f-date">
      <div id="date-warn" style="font-size:13px;line-height:1.6;color:var(--c-orange);margin-top:8px;display:none"></div>
    </div>

    <!-- 3. Target Time -->
    <div class="form-group">
      <label class="form-label" for="f-target-time">目標完賽時間 (H:MM:SS)</label>
      <input class="form-input" type="text" id="f-target-time" placeholder="例：2:05:00">
    </div>

    <!-- 4. Training Days -->
    <div class="form-group">
      <div class="form-label">訓練日（點一次=訓練日 🔵，再點=長跑日 💙，再點=取消）</div>
      <div class="day-picker" id="day-picker">
        <button class="day-btn" data-dow="0">日</button>
        <button class="day-btn" data-dow="1">一</button>
        <button class="day-btn" data-dow="2">二</button>
        <button class="day-btn" data-dow="3">三</button>
        <button class="day-btn" data-dow="4">四</button>
        <button class="day-btn" data-dow="5">五</button>
        <button class="day-btn" data-dow="6">六</button>
      </div>
      <div class="day-legend">
        <span class="l-train">普通訓練日</span>
        <span class="l-long">長跑日</span>
      </div>
      <div id="day-warn" style="font-size:13px;line-height:1.6;color:var(--c-orange);margin-top:8px;display:none"></div>
    </div>

    <!-- 5. Long Run Max Time -->
    <div class="form-group">
      <label class="form-label" for="f-long-max">長跑日最長可跑時間</label>
      <select class="form-input" id="f-long-max">
        <option value="60">60 分鐘</option>
        <option value="90" selected>90 分鐘</option>
        <option value="120">120 分鐘</option>
        <option value="150">150+ 分鐘</option>
      </select>
    </div>

    <!-- 6. Current Weekly Km -->
    <div class="form-group">
      <label class="form-label" for="f-weekly-km">目前每週跑量 (km)，填 0 表示剛開始</label>
      <input class="form-input" type="number" id="f-weekly-km" min="0" max="200" placeholder="例：25">
    </div>

    <!-- 7. Easy Pace -->
    <div class="form-group">
      <label class="form-label" for="f-easy-pace">輕鬆跑配速 (分:秒/km)</label>
      <input class="form-input" type="text" id="f-easy-pace" placeholder="例：6:30">
    </div>

    <!-- 7b. Body Metrics -->
    <div class="form-group">
      <div class="form-label">身體數據（用於心率區間與負荷評估）</div>
      <div class="log-form-grid">
        <div><label class="form-label" for="f-height">身高 (cm)</label><input class="form-input" type="number" id="f-height" min="120" max="220" placeholder="例：172"></div>
        <div><label class="form-label" for="f-weight">體重 (kg)</label><input class="form-input" type="number" id="f-weight" min="30" max="150" step="0.1" placeholder="例：65"></div>
        <div><label class="form-label" for="f-max-hr">最大心率 (bpm)</label><input class="form-input" type="number" id="f-max-hr" min="140" max="220" placeholder="例：183"></div>
      </div>
      <div class="field-help">最大心率建議用 Garmin 實測最高值＋2 估算（比 220−年齡準）。未填時課表用 185 當保守預設，心率區間會較不準。</div>
    </div>

    <!-- 8. Recent Result -->
    <div class="form-group">
      <label class="form-label" for="f-recent">最近比賽成績（選填，用於校正配速）</label>
      <input class="form-input" type="text" id="f-recent" placeholder="例：10K 54:30">
      <div class="field-help">如果你有近期 5K、10K、半馬成績，這裡可以先快速校正一次配速。更完整的校正建議用後面的「檢測紀錄」。</div>
    </div>

    <!-- 9. Injuries -->
    <div class="form-group">
      <div class="form-label">身體狀況</div>
      <div class="pill-group" id="injury-pills">
        <div class="pill selected" data-injury="none">無傷</div>
        <div class="pill" data-injury="ankle">腳踝</div>
        <div class="pill" data-injury="knee">膝蓋</div>
        <div class="pill" data-injury="plantar">足底筋膜炎</div>
        <div class="pill" data-injury="other">其他</div>
      </div>
    </div>

    <!-- 10. Coach Sync Schedule (advanced/optional — defaults work fine, collapsed to reduce first-time setup weight) -->
    <details class="form-group">
      <summary class="form-label" style="cursor:pointer">⚙️ 進階：Garmin 自動化排程與完成門檻（預設值可直接用，非必填）</summary>
      <div style="margin-top:14px">
        <div class="form-label">教練資料更新</div>
        <p class="field-help" style="margin-top:0">排程會讀取 Garmin 實績並更新教練建議；正式課表不會自動被覆寫。</p>
        <div class="log-form-grid">
          <div><label class="form-label" for="f-coach-sync">檢查頻率</label><select class="form-input" id="f-coach-sync"><option value="manual">只手動更新</option><option value="daily">每天</option><option value="weekly">每週</option></select></div>
          <div><label class="form-label" for="f-coach-time">檢查時間</label><input class="form-input" type="time" id="f-coach-time" value="20:30"></div>
          <div><label class="form-label" for="f-coach-day">每週檢查日</label><select class="form-input" id="f-coach-day"><option value="0" selected>週日</option><option value="1">週一</option><option value="2">週二</option><option value="3">週三</option><option value="4">週四</option><option value="5">週五</option><option value="6">週六</option></select></div>
        </div>
        <div class="field-help">雲端排程設定完成後，儲存訓練手冊會同步更新這些規則；資料更新狀態會顯示在教練建議中。</div>
      </div>
      <div class="form-group" style="margin-top:16px">
        <label class="form-label" for="f-garmin-completion">Garmin 自動完成門檻</label>
        <select class="form-input" id="f-garmin-completion"><option value="50">50%｜恢復期較寬鬆</option><option value="60" selected>60%｜建議預設</option><option value="70">70%｜較嚴謹</option><option value="80">80%｜接近完整課表</option></select>
        <div class="field-help">同步跑量達課表距離的比例（至少 1 km）才會自動完成或認列補跑；手動完成不受影響。</div>
      </div>
    </details>

    <!-- Live Calc -->
    <div class="form-group" id="live-calc-group">
      <div class="form-label">即時評估</div>
      <div class="live-calc">
        <div class="live-calc-grid" id="live-calc-grid">
          <div class="calc-item"><div class="calc-label">訓練週數</div><div class="calc-value" id="calc-weeks">—</div></div>
          <div class="calc-item"><div class="calc-label">目標配速</div><div class="calc-value" id="calc-race-pace">—</div></div>
          <div class="calc-item"><div class="calc-label">節奏跑配速</div><div class="calc-value" id="calc-tempo">—</div></div>
          <div class="calc-item"><div class="calc-label">間歇配速</div><div class="calc-value" id="calc-interval">—</div></div>
          <div class="calc-item"><div class="calc-label">訓練天數/週</div><div class="calc-value" id="calc-days">—</div></div>
          <div class="calc-item"><div class="calc-label">難度評估</div><div class="calc-value" id="calc-difficulty">—</div></div>
          <div class="calc-item"><div class="calc-label">BMI</div><div class="calc-value" id="calc-bmi">—</div></div>
          <div class="calc-item"><div class="calc-label">輕鬆跑上限 (Z2)</div><div class="calc-value" id="calc-easy-hr">—</div></div>
        </div>
      </div>
    </div>

    <button class="btn btn-primary" id="btn-generate" style="width:100%;padding:14px;font-size:16px" disabled>🚀 生成訓練計畫</button>
    ${hasExistingPlan ? `<div class="setup-actions"><button class="btn btn-secondary" type="button" onclick="returnToPlan()">↩ 返回目前計畫</button><button class="btn btn-secondary" type="button" onclick="openCycleManagement()">🗂 週期管理</button></div>` : ''}
  </div>
</div>`;

  initGoalPicker();
  initDayPicker();
  initInjuryPills();
  initLiveCalc();
  document.getElementById('btn-generate').addEventListener('click', generateAndShowPlan);
  document.getElementById('btn-generate').textContent = hasExistingPlan ? '🔄 更新訓練手冊' : '🚀 生成訓練手冊';

  // Pre-fill if returning user
  if (appData.profile || appData.nextCycleDraft) prefillSetupForm(appData.profile || appData.nextCycleDraft);
}

// ============================================================
// FORM STATE
// ============================================================
let formState = {
  goal: null,
  dayState: [0, 0, 0, 0, 0, 0, 0],
  injuries: ['none']
};

const GOAL_DIST = { '5k10k': 10, half: 21.0975, full: 42.195, rehab: 10 };
const MIN_WEEKS = { '5k10k': 8, half: 12, full: 16, rehab: 8 };
const GOAL_NAME = { '5k10k': '入門 5K/10K', half: '半馬 21K', full: '全馬 42K', rehab: '傷後重建' };
const GOAL_META = {
  '5k10k': {
    icon: '🏃',
    label: '入門 5K / 10K',
    cardDesc: '建立規律、先把跑步變成習慣',
    minWeeksText: '建議至少 8 週',
    handbook: '這個模式不是追爆量，而是幫你把每週可完成的跑步節奏、恢復節奏和基礎速度放進手機手冊。',
    suitable: '剛開始跑步、週跑量偏低、想先穩定完賽 5K 或 10K。',
    focus: '課表會優先保留輕鬆跑、跑走銜接與簡單節奏刺激。',
    exportUse: '匯出後適合當每日照表操課的小手冊。'
  },
  half: {
    icon: '🏅',
    label: '半馬 21K',
    cardDesc: '長跑、節奏跑、恢復三者平衡',
    minWeeksText: '建議至少 12 週',
    handbook: '半馬模式的重點是把長跑、一般輕鬆跑、節奏 / 間歇、恢復安排拆開，不讓單一課表把壓力吃滿。',
    suitable: '已有一些週跑量，準備 21K 完賽或穩定推進半馬成績的跑者。',
    focus: '課表會優先管控長跑比例、品質課出現時機、以及賽前 2 週左右的收量。',
    exportUse: '匯出後會更像一份單週半馬備賽手冊，而不是只有距離列表。'
  },
  full: {
    icon: '🏆',
    label: '全馬 42K',
    cardDesc: '週量與長跑耐力優先，配速其次',
    minWeeksText: '建議至少 16 週',
    handbook: '全馬模式的目的不是只把距離乘二，而是讓週跑量、長跑恢復與補給節奏有足夠空間被安排。',
    suitable: '已具備穩定訓練基礎，想把課表當成全馬基礎期或穩定完賽準備。',
    focus: '課表會保守看待 3 天訓練、長跑占比與恢復壓力，不會把所有風險堆到週末。',
    exportUse: '匯出後適合放在手機，當每週執行與自我檢查的全馬手冊。'
  },
  rehab: {
    icon: '🩺',
    label: '傷後重建',
    cardDesc: '先回到可持續，再談速度與距離',
    minWeeksText: '建議至少 8 週',
    handbook: '傷後重建模式的核心不是追里程，而是建立無痛、可恢復、可追蹤的訓練節奏。',
    suitable: '剛恢復訓練、近期有不適、想先回到穩定跑步能力的跑者。',
    focus: '課表會壓低快課出現率，把肌力 / 核心、恢復與自我檢查往前排。',
    exportUse: '匯出後更適合當每日復健式訓練手冊，而不是比賽導向菜單。'
  }
};
const GOAL_RULES = {
  '5k10k': { weeklyGrowth: 0.08, taperWeeks: 2, maxWeeklyKm: 40, longRunShare: 0.3, longRunCapKm: 14, qualityAfterWeeks: 2 },
  half: { weeklyGrowth: 0.07, taperWeeks: 2, maxWeeklyKm: 38, longRunShare: 0.3, longRunCapKm: 18, qualityAfterWeeks: 3 },
  full: { weeklyGrowth: 0.08, taperWeeks: 3, maxWeeklyKm: 70, longRunShare: 0.35, longRunCapKm: 32, qualityAfterWeeks: 3 },
  rehab: { weeklyGrowth: 0.05, taperWeeks: 1, maxWeeklyKm: 28, longRunShare: 0.25, longRunCapKm: 12, qualityAfterWeeks: 99 }
};
const DOW_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const CHECKIN_QUESTIONS = [
  '本週所有訓練都完成了',
  '身體無異常疲勞或疼痛',
  '睡眠品質良好',
  '長跑結束後隔天恢復正常',
  '節奏跑 / 間歇配速達標'
];

// ============================================================
// PACE UTILITIES
// ============================================================
function timeToSec(str) {
  if (!str) return 0;
  const parts = str.trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// 目標完賽時間寬容解析：欄位要求 H:MM:SS，但跑者常打「2:10」代表 2 小時 10 分。
// 兩段式輸入若換算配速快到不合理（<2:30/km，比世界紀錄快），改判讀為 H:MM。
function targetTimeToSec(str, dist) {
  const sec = timeToSec(str);
  if (!sec || !dist) return sec;
  const parts = String(str || '').trim().split(':');
  if (parts.length === 2 && sec / dist < 150) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60;
  }
  return sec;
}

function isValidClockInput(value, allowedLengths = [2, 3]) {
  const parts = String(value || '').trim().split(':');
  if (!allowedLengths.includes(parts.length) || parts.some((part) => !/^\d+$/.test(part))) return false;
  const numbers = parts.map(Number);
  if (!numbers[0] || numbers.slice(1).some((part) => part < 0 || part >= 60)) return false;
  return true;
}

function trainingProfileValidationErrors(profile) {
  const errors = [];
  const trainDays = (profile.dayState || []).filter((state) => state >= 1).length;
  const longDays = (profile.dayState || []).filter((state) => state === 2).length;
  const targetDate = new Date(`${profile.targetDate || ''}T00:00:00`);
  const weeklyKm = Number(profile.weeklyKm);
  const easyPaceSec = timeToSec(profile.easyPace);
  const goalDistance = GOAL_DIST[profile.goal];
  const racePaceSec = goalDistance ? targetTimeToSec(profile.targetTime, goalDistance) / goalDistance : 0;

  if (!goalDistance) errors.push('請選擇訓練模式。');
  if (Number.isNaN(targetDate.getTime())) errors.push('目標比賽日期格式不正確。');
  if (!isValidClockInput(profile.targetTime, [2, 3])) errors.push('目標完賽時間請使用 H:MM 或 H:MM:SS，例如 2:10 或 2:10:00。');
  if (!isValidClockInput(profile.easyPace, [2])) errors.push('輕鬆跑配速請使用 M:SS，例如 7:30。');
  if (!Number.isFinite(weeklyKm) || weeklyKm < 0 || weeklyKm > 200) errors.push('目前每週跑量需介於 0 至 200 km。');
  if (trainDays < 1 || longDays !== 1) errors.push('請至少選擇一個訓練日，且指定一個長跑日。');
  if (!Number.isFinite(easyPaceSec) || easyPaceSec < 120 || easyPaceSec > 1800) errors.push('輕鬆跑配速需介於 2:00 至 30:00／km。');
  if (!Number.isFinite(racePaceSec) || racePaceSec < 90 || racePaceSec > 3600) errors.push('目標時間換算出的配速不合理，請再次確認目標距離與時間。');
  if (profile.maxHr && (profile.maxHr < 140 || profile.maxHr > 220)) errors.push('最大心率請填 140 到 220 bpm，或留白讓我用保守預設。');
  return errors;
}

function localDateStr(date) {
  // toISOString 是 UTC，GMT+8 早上 8 點前會往前挪一天，害課表日期與 Garmin 對應錯位
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return localDateStr(new Date());
}

function guideAssetUrl(src) {
  if (!src) return '';
  const sep = src.includes('?') ? '&' : '?';
  return `${src}${sep}v=${GUIDE_ASSET_VERSION}`;
}

// ============================================================
// HEART-RATE ZONES & SEASON
// ============================================================
const DEFAULT_MAX_HR = 185;

function profileMaxHr(profile) {
  const own = Number(profile?.maxHr);
  if (own >= 140 && own <= 220) return own;
  const coach = Number(coachReviewData?.zones?.maxHr);
  if (coach >= 140 && coach <= 220) return coach;
  return DEFAULT_MAX_HR;
}

// 心率區間單一真相：教練在週報明訂的區間（coachReviewData.zones）優先，
// 其次 Garmin 乳酸閾值，最後才用 %HRmax 推算。避免同一組區間三處各自定義而漂移。
function coachExplicitZones(max) {
  const z = typeof coachReviewData !== 'undefined' ? coachReviewData?.zones : null;
  if (!z) return null;
  const range = (value) => {
    const parts = String(value || '').split(/[–\-—~]/).map((part) => Number(String(part).trim())).filter((num) => num >= 100 && num <= max + 5);
    return parts.length === 2 ? parts : null;
  };
  const easyMax = Number(z.easyMax);
  const steady = range(z.steady);
  const tempo = range(z.tempo);
  const interval = range(z.interval);
  if (!(easyMax >= 100 && easyMax <= max) || !steady || !tempo || !interval) return null;
  return {
    max,
    source: 'coach',
    recoveryMax: Math.round(max * 0.75),
    easyMax,
    steadyLow: steady[0],
    steadyHigh: steady[1],
    tempoLow: tempo[0],
    tempoHigh: tempo[1],
    intervalLow: interval[0],
    intervalHigh: interval[1]
  };
}

function hrZones(profile) {
  const max = profileMaxHr(profile);
  const coachZones = coachExplicitZones(max);
  if (coachZones) return coachZones;
  // Garmin 手錶有估出乳酸閾值心率時優先採用（個人化，比 %HRmax 推算準）：
  // 區間比例取 Friel 式 LTHR 百分比，並以 max 封頂避免高於實測最大心率。
  const lthr = Number(typeof coachReviewData !== 'undefined' ? coachReviewData?.lactateThresholdHr : 0) || 0;
  if (lthr >= 120 && lthr < max) {
    const lpct = (ratio) => Math.min(Math.round(lthr * ratio), max);
    return {
      max,
      source: 'lthr',
      recoveryMax: lpct(0.82),
      easyMax: lpct(0.88),
      steadyLow: lpct(0.88),
      steadyHigh: lpct(0.93),
      tempoLow: lpct(0.96),
      tempoHigh: lpct(1.02),
      intervalLow: lpct(1.03),
      intervalHigh: lpct(1.08)
    };
  }
  // 以 Z2 為輕鬆跑主區：E 上限 = 80% HRmax（Z2 頂），恢復跑再低一階
  const pct = (ratio) => Math.round(max * ratio);
  return {
    max,
    source: 'maxhr',
    recoveryMax: pct(0.75),
    easyMax: pct(0.8),
    steadyLow: pct(0.8),
    steadyHigh: pct(0.84),
    tempoLow: pct(0.85),
    tempoHigh: pct(0.89),
    intervalLow: pct(0.9),
    intervalHigh: pct(0.95)
  };
}

function showHrZones() {
  const profile = appData.profile || {};
  const zones = hrZones(profile);
  const ownMaxHr = Number(profile.maxHr);
  const source = ownMaxHr >= 140 && ownMaxHr <= 220
    ? '你的設定'
    : (Number(coachReviewData?.zones?.maxHr) >= 140 ? 'Garmin 教練資料' : `預設 ${DEFAULT_MAX_HR}（建議到「⚙️ 修改設定」填實測值，區間才準）`);
  // 百分比標籤要跟區間的實際計算基準一致：教練明訂＝直接顯示「教練訂定」；
  // LTHR 模式顯示 %LTHR，否則顯示 %HRmax
  const isCoach = zones.source === 'coach';
  const isLthr = zones.source === 'lthr';
  const pctUnit = isCoach ? '' : isLthr ? 'LTHR' : 'HRmax';
  const rows = [
    ['恢復跑', `≤ ${zones.recoveryMax}`, isCoach ? '教練訂定' : isLthr ? '≤82%' : '≤75%', '很輕鬆，可完整講句子；硬課隔天用', ''],
    ['輕鬆跑 / 長跑', `≤ ${zones.easyMax}`, isCoach ? '教練訂定' : isLthr ? '≤88%' : '≤80%', '可對話的輕鬆有氧，週跑量主體都在這區', 'is-key'],
    ['穩定有氧', `${zones.steadyLow}–${zones.steadyHigh}`, isCoach ? '教練訂定' : isLthr ? '88–93%' : '80–84%', '呼吸變深但可控，存體能不追速度', ''],
    ['節奏跑', `${zones.tempoLow}–${zones.tempoHigh}`, isCoach ? '教練訂定' : isLthr ? '96–102%' : '85–89%', '吃力但穩定，只能講短句', ''],
    ['間歇', `${zones.intervalLow}–${zones.intervalHigh}`, isCoach ? '教練訂定' : isLthr ? '103–108%' : '90–95%', '很硬，趟與趟之間要完整恢復', '']
  ];
  const body = `
    <p style="margin:0 0 10px;font-size:13px;color:var(--c-text-muted)">${isCoach ? `區間直接採用教練在週報明訂的心率區間（單一真相，不再由 %HRmax 各自推算）；最大心率 ${zones.max} bpm。` : isLthr ? `區間以 Garmin 實測乳酸閾值心率 <b style="color:var(--c-text)">${Number(coachReviewData?.lactateThresholdHr)} bpm</b> 推算（比 %HRmax 更個人化）；最大心率 ${zones.max} bpm。` : `最大心率 <b style="color:var(--c-text)">${zones.max} bpm</b>（來源：${source}）。`}跑步時看錶守區間，比守配速可靠——尤其夏天。</p>
    <div class="hr-zone-list">
      ${rows.map(([name, bpm, pctText, desc, cls]) => `
        <div class="hr-zone-row ${cls}">
          <div class="hr-zone-name">${name}${cls ? '<span class="coach-key-badge">主區</span>' : ''}</div>
          <div class="hr-zone-bpm">${bpm} <small>bpm</small></div>
          <div class="hr-zone-meta"><span>${pctText} ${pctUnit}</span><p>${desc}</p></div>
        </div>`).join('')}
    </div>
    <p style="margin:12px 0 0;font-size:12px;color:var(--c-text-muted)">超過區間上限先降速或走 1 分鐘，回落再跑；課表卡上的 HR 上限就是照這張表開的。</p>`;
  showModal('❤️ 心率區間表', body, [{ label: '關閉', primary: true, action: closeModal }]);
}

function isHotSeasonDate(date) {
  const month = date.getMonth() + 1;
  return month >= 6 && month <= 9;
}

function adaptiveEasyPaceSec(profile, date) {
  // 兩層自適應：1) 有 Garmin 資料時用最近 Z2 實跑中位配速當基準（跑者變快課表跟著快）
  //            2) 依課表當週季節加減：夏季 +20 秒高溫稅、涼季 −15 秒涼爽紅利
  let baseSec = profile.easyPaceSec;
  let source = 'setup';
  try {
    const zones = hrZones(profile);
    const records = (typeof coachRunRecords === 'function' ? coachRunRecords() : [])
      .slice(-10)
      .filter((run) => run.hr && run.hr <= zones.easyMax && run.paceSeconds > 0);
    if (records.length >= 3) {
      // 折算成涼爽等效配速當基準，季節加減（下方 seasonAdjust）才不會與夏季實跑重複計算熱壓力
      const paces = records.map((run) => heatAdjustedPaceSec(run)).sort((a, b) => a - b);
      baseSec = paces[Math.floor(paces.length / 2)];
      source = 'garmin';
    }
  } catch (err) { /* 教練資料未解鎖時退回設定值 */ }
  const seasonAdjust = date ? (isHotSeasonDate(date) ? 20 : -15) : 0;
  return { sec: Math.max(baseSec + seasonAdjust, 240), source };
}

function fitnessLevel(profile) {
  const gap = profile.easyPaceSec - profile.racePaceSec;
  if (profile.weeklyKm <= 10 || gap > 120) return 'beginner';
  if (gap > 60) return 'intermediate';
  return 'advanced';
}

function adjustPaceByRecentResult(profile) {
  if (!profile.recentResult) return;
  const match = profile.recentResult.match(/([\d.]+)\s*[kK]\s*(\d+):(\d+)(?::(\d+))?/);
  if (!match) return;
  const dist = parseFloat(match[1]);
  const sec = match[4]
    ? parseInt(match[2], 10) * 3600 + parseInt(match[3], 10) * 60 + parseInt(match[4], 10)
    : parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
  if (!dist || !sec) return;
  const recentPaceSec = sec / dist;
  const derivedEasyPaceSec = recentPaceSec * 1.25;
  if (derivedEasyPaceSec > profile.easyPaceSec) {
    profile.easyPaceSec = derivedEasyPaceSec;
  }
  const goalDist = GOAL_DIST[profile.goal] || 10;
  const ratio = goalDist / dist;
  const impliedRacePaceSec = recentPaceSec * Math.pow(ratio, 0.07);
  if (impliedRacePaceSec < profile.racePaceSec) {
    profile.racePaceSec = impliedRacePaceSec;
    profile.tempoPaceSec = profile.racePaceSec + 12;
    profile.intervalPaceSec = Math.max(profile.racePaceSec - 10, 180);
  }
}

// ============================================================
// SETUP INTERACTIONS
// ============================================================
function initGoalPicker() {
  document.querySelectorAll('.goal-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      formState.goal = card.dataset.goal;
      const brief = document.getElementById('goal-brief');
      if (brief) brief.innerHTML = renderGoalBrief(formState.goal);
      updateGenButton();
      updateLiveCalc();
    });
  });
}

function syncDayButtons() {
  document.querySelectorAll('.day-btn').forEach(btn => {
    const dow = parseInt(btn.dataset.dow, 10);
    btn.classList.toggle('training', formState.dayState[dow] === 1);
    btn.classList.toggle('long-run', formState.dayState[dow] === 2);
  });
}

function validateDays() {
  const warn = document.getElementById('day-warn');
  if (!warn) return;
  const trainDays = formState.dayState.filter(s => s >= 1).length;
  const longDays = formState.dayState.filter(s => s === 2).length;
  if (trainDays > 0 && longDays === 0) {
    warn.textContent = '請點兩下指定一天為長跑日（深藍）';
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}

function initDayPicker() {
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dow = parseInt(btn.dataset.dow, 10);
      const cur = formState.dayState[dow];
      if (cur === 0) {
        formState.dayState[dow] = 1;
      } else if (cur === 1) {
        formState.dayState = formState.dayState.map((s, i) => (i === dow ? 2 : (s === 2 ? 1 : s)));
      } else {
        formState.dayState[dow] = 0;
      }
      syncDayButtons();
      validateDays();
      updateLiveCalc();
      updateGenButton();
    });
  });
}

function initInjuryPills() {
  document.querySelectorAll('.pill[data-injury]').forEach(pill => {
    pill.addEventListener('click', () => {
      const injury = pill.dataset.injury;
      if (injury === 'none') {
        formState.injuries = ['none'];
        document.querySelectorAll('.pill[data-injury]').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
        return;
      }
      formState.injuries = formState.injuries.filter(i => i !== 'none');
      document.querySelector('.pill[data-injury="none"]')?.classList.remove('selected');
      if (formState.injuries.includes(injury)) {
        formState.injuries = formState.injuries.filter(i => i !== injury);
        pill.classList.remove('selected');
      } else {
        formState.injuries.push(injury);
        pill.classList.add('selected');
      }
      if (formState.injuries.length === 0) {
        formState.injuries = ['none'];
        document.querySelector('.pill[data-injury="none"]')?.classList.add('selected');
      }
    });
  });
}

function setCalcCell(id, text, extraClass) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `calc-value${extraClass ? ' ' + extraClass : ''}`;
  const item = el.closest('.calc-item');
  if (item) item.classList.toggle('is-empty', text === '—');
}

function updateLiveCalc() {
  const dateVal = document.getElementById('f-date')?.value;
  const timeVal = document.getElementById('f-target-time')?.value;
  const easyVal = document.getElementById('f-easy-pace')?.value;
  const goal = formState.goal;
  const weeksEl = document.getElementById('calc-weeks');
  const warnEl = document.getElementById('date-warn');
  if (!weeksEl || !warnEl) return;

  if (!dateVal) {
    setCalcCell('calc-weeks', '—');
    warnEl.style.display = 'none';
  } else {
    const diffWeeks = Math.floor((new Date(dateVal) - new Date()) / (1000 * 86400 * 7));
    if (diffWeeks < 0) {
      setCalcCell('calc-weeks', '已過期', 'warn');
      warnEl.textContent = '日期已過，請重新選擇。';
      warnEl.style.display = 'block';
    } else {
      const minWeeks = goal ? MIN_WEEKS[goal] : 8;
      setCalcCell('calc-weeks', `${diffWeeks} 週`, diffWeeks < minWeeks ? 'warn' : 'good');
      if (diffWeeks > 0 && diffWeeks < minWeeks) {
        warnEl.textContent = `⚠️ 建議至少 ${minWeeks} 週，目前只有 ${diffWeeks} 週，計畫會壓縮。`;
        warnEl.style.display = 'block';
      } else if (diffWeeks > 24) {
        warnEl.textContent = `ℹ️ 距離比賽還有 ${diffWeeks} 週，計畫會維持適當強度。`;
        warnEl.style.display = 'block';
      } else {
        warnEl.style.display = 'none';
      }
    }
  }

  const dist = goal ? GOAL_DIST[goal] : 10;
  const timeSec = targetTimeToSec(timeVal, dist);
  let racePaceSec = 0;
  if (timeSec > 0 && dist > 0) {
    racePaceSec = timeSec / dist;
    // 兩段式輸入被判讀為 H:MM 時，直接在配速格回饋系統的理解，使用者才不會誤會
    const reinterpreted = timeSec !== timeToSec(timeVal);
    const readAs = reinterpreted ? `（讀作 ${Math.floor(timeSec / 3600)} 小時 ${Math.round((timeSec % 3600) / 60)} 分）` : '';
    setCalcCell('calc-race-pace', `${secToPace(racePaceSec)}/km${readAs}`, 'good');
    setCalcCell('calc-tempo', `${secToPace(racePaceSec + 12)}/km`, 'good');
    setCalcCell('calc-interval', `${secToPace(Math.max(racePaceSec - 10, 180))}/km`, 'good');
  } else {
    ['calc-race-pace', 'calc-tempo', 'calc-interval'].forEach(id => setCalcCell(id, '—'));
  }

  const trainCount = formState.dayState.filter(s => s >= 1).length;
  setCalcCell('calc-days', trainCount > 0 ? `${trainCount} 天/週` : '—', trainCount > 0 ? 'good' : '');

  const easyPaceSec = timeToSec(easyVal);
  if (racePaceSec > 0 && easyPaceSec > 0) {
    const gap = easyPaceSec - racePaceSec;
    if (gap < 30) {
      setCalcCell('calc-difficulty', '挑戰', 'warn');
    } else if (gap < 90) {
      setCalcCell('calc-difficulty', '適中', 'good');
    } else {
      setCalcCell('calc-difficulty', '保守', 'good');
    }
  } else {
    setCalcCell('calc-difficulty', '—');
  }

  const h = parseFloat(document.getElementById('f-height')?.value) || 0;
  const w = parseFloat(document.getElementById('f-weight')?.value) || 0;
  if (h > 0 && w > 0) {
    const bmi = w / Math.pow(h / 100, 2);
    setCalcCell('calc-bmi', bmi.toFixed(1), bmi >= 18.5 && bmi < 25 ? 'good' : 'warn');
  } else {
    setCalcCell('calc-bmi', '—');
  }
  {
    const maxHrVal = parseInt(document.getElementById('f-max-hr')?.value, 10) || 0;
    if (maxHrVal >= 140 && maxHrVal <= 220) {
      setCalcCell('calc-easy-hr', `≤${Math.round(maxHrVal * 0.8)} bpm`, 'good');
    } else {
      setCalcCell('calc-easy-hr', '—');
    }
  }

  const groupEl = document.getElementById('live-calc-group');
  if (groupEl) {
    const anyVisible = groupEl.querySelectorAll('.calc-item:not(.is-empty)').length > 0;
    groupEl.style.display = anyVisible ? '' : 'none';
  }
}

function initLiveCalc() {
  ['f-date', 'f-target-time', 'f-easy-pace', 'f-weekly-km', 'f-height', 'f-weight', 'f-max-hr'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      updateLiveCalc();
      updateGenButton();
    });
  });
  updateLiveCalc();
}

function updateGenButton() {
  const dateVal = document.getElementById('f-date')?.value;
  const kmVal = document.getElementById('f-weekly-km')?.value;
  const easyVal = document.getElementById('f-easy-pace')?.value;
  const timeVal = document.getElementById('f-target-time')?.value;
  const hasLong = formState.dayState.some(s => s === 2);
  const hasTrain = formState.dayState.some(s => s >= 1);
  const btn = document.getElementById('btn-generate');
  if (btn) {
    btn.disabled = !(formState.goal && dateVal && kmVal !== '' && easyVal && timeVal && hasTrain && hasLong);
  }
}

function prefillSetupForm(profile) {
  formState = {
    goal: profile.goal || null,
    dayState: Array.isArray(profile.dayState) && profile.dayState.length === 7 ? [...profile.dayState] : [0, 0, 0, 0, 0, 0, 0],
    injuries: Array.isArray(profile.injuries) && profile.injuries.length ? [...profile.injuries] : ['none']
  };
  if (profile.goal) {
    document.querySelector(`.goal-card[data-goal="${profile.goal}"]`)?.classList.add('selected');
    const brief = document.getElementById('goal-brief');
    if (brief) brief.innerHTML = renderGoalBrief(profile.goal);
  }
  if (profile.targetDate) document.getElementById('f-date').value = profile.targetDate;
  if (profile.targetTime) document.getElementById('f-target-time').value = profile.targetTime;
  if (profile.maxLongRunMins) document.getElementById('f-long-max').value = String(profile.maxLongRunMins);
  if (profile.weeklyKm !== undefined) document.getElementById('f-weekly-km').value = profile.weeklyKm;
  if (profile.easyPace) document.getElementById('f-easy-pace').value = profile.easyPace;
  if (profile.heightCm) document.getElementById('f-height').value = profile.heightCm;
  if (profile.weightKg) document.getElementById('f-weight').value = profile.weightKg;
  if (profile.maxHr) document.getElementById('f-max-hr').value = profile.maxHr;
  document.getElementById('f-garmin-completion').value = String(garminCompletionPercent(profile));
  if (profile.recentResult) document.getElementById('f-recent').value = profile.recentResult;
  const coachSync = profile.coachSync || {};
  if (coachSync.frequency) document.getElementById('f-coach-sync').value = coachSync.frequency;
  if (coachSync.time) document.getElementById('f-coach-time').value = coachSync.time;
  if (coachSync.day !== undefined) document.getElementById('f-coach-day').value = String(coachSync.day);
  syncDayButtons();
  validateDays();
  document.querySelectorAll('.pill[data-injury]').forEach(p => {
    p.classList.toggle('selected', formState.injuries.includes(p.dataset.injury));
  });
  updateLiveCalc();
  updateGenButton();
}

// ============================================================
// PLAN VIEW
// ============================================================
let currentWeek = 1;
let coachReviewData = null;
let coachReviewLoadState = 'loading';
let registrationRaceData = null;
let registrationRaceLoadState = 'idle';

let selectedTrainingReportActivityId = null;
let selectedTrainingReportLapCategory = null;

const TRAINING_JARGON_ENTRIES = [
  [/恢復跑/, '恢復跑：比輕鬆跑再慢一階，目的只是促進恢復；腿沉、心率偏高時可直接改走跑或休息。'],
  [/輕鬆跑|E\s*跑/, '輕鬆跑（E 跑）：可完整對話的有氧跑，是每週跑量主體；不追配速，炎熱時以心率與體感為準。'],
  [/長跑|LSD/i, '長跑：本週距離最長的一堂，重點是耐力、補水與穩定姿勢；不是每次都要跑快或跑到很累。'],
  [/ST|快步/, 'ST／快步：短時間的漸進加速，練步頻與跑姿，不是衝刺；組間走回或慢跑至呼吸恢復。'],
  [/節奏跑|T\s*配速/, '節奏跑（T 配速）：乳酸閾值強度，吃力但穩定，只能講短句。'],
  [/間歇|I\s*配速/, '間歇（I 配速）：接近最大攝氧量強度，很硬；組間走或慢跑恢復，時間抓跟快跑趟差不多長。'],
  [/法特雷克/, '法特雷克：沒有固定距離或時間的變速跑，依體感自由加速、放鬆，不用照錶算配速。'],
  [/坡跑/, '坡跑：上坡段以動作穩定、力量輸出為主；下坡走或慢跑恢復，動作跑掉或有疼痛就停止。'],
  [/M\s*配速|馬拉松配速/, 'M 配速：預估可在馬拉松維持的穩定配速；它是耐力練習，不是每次長跑都要跑的強度。'],
  [/漸進/, '漸進跑：從輕鬆開始，後段才自然加快；若心率或動作失控，維持原速度即可。']
];

const GUIDE_ACTION_VIDEOS = {
  '快走': 'https://www.youtube.com/watch?v=yaw1N65GEJs',
  '扶牆腳踝活動': 'https://www.youtube.com/watch?v=hMIzP3RcPFw',
  '扶牆前後擺腿': 'https://www.youtube.com/watch?v=naW8u72lOzI',
  '原地踏步高抬膝': 'https://www.youtube.com/watch?v=-fI2BPfeTHI',
  '腳踝繞圈': 'https://www.youtube.com/watch?v=uV0I5adTRXw',
  '弓箭步轉體': 'https://www.youtube.com/watch?v=6bpeLr60Tkc',
  '原地高抬腿': 'https://www.youtube.com/watch?v=IxJ1F4XpV0o',
  '原地小跳': 'https://www.youtube.com/watch?v=jfvDjRWRKn0',
  '小腿動態伸展': 'https://www.youtube.com/watch?v=VQO1HjKaV7w',
  '髖關節繞圈': 'https://www.youtube.com/watch?v=JYqLwajOGjI',
  '慢走 + 深呼吸': 'https://www.youtube.com/watch?v=RfY9CYyTAII',
  '髖屈肌伸展': 'https://www.youtube.com/watch?v=JwvHstw_aPs',
  '腿後側伸展': 'https://www.youtube.com/watch?v=M38dHh6iMzg',
  '臀肌伸展': 'https://www.youtube.com/watch?v=e3DZzHcwk3o',
  '小腿伸展': 'https://www.youtube.com/watch?v=zGLD19PC_Jg',
  '髂脛束周邊放鬆': 'https://www.youtube.com/watch?v=RHi7_atv__k',
  '足底按摩': 'https://www.youtube.com/watch?v=yLQjt5IWHJ4',
  '臀橋': 'https://www.youtube.com/watch?v=caGWe89GpCA',
  '分腿蹲': 'https://www.youtube.com/watch?v=fKRT_1IOCs0',
  '側棒式': 'https://www.youtube.com/watch?v=ovPSZzyNPII',
  '單腳小腿提踵': 'https://www.youtube.com/watch?v=IphGZ8OlfYg',
  '死蟲': 'https://www.youtube.com/watch?v=Afa89jCoKuw',
  'Bird Dog': 'https://www.youtube.com/watch?v=vRYf25I6uYo',
  '蚌殼式': 'https://www.youtube.com/watch?v=cPjI2AoXUdE',
  '彈力帶側走': 'https://www.youtube.com/watch?v=cvfy1kiHY58',
  '踏台 Step-up': 'https://www.youtube.com/watch?v=5_XmhOG7b74',
  '單腳羅馬尼亞硬舉': 'https://www.youtube.com/watch?v=mN-O1pmIdE4',
  '後跨弓箭步': 'https://www.youtube.com/watch?v=gZAQ0lL_sGk',
  '靠牆脛前肌抬腳': 'https://www.youtube.com/watch?v=i5ZNerGK5qs',
  '脛前肌抬腳': 'https://www.youtube.com/watch?v=i5ZNerGK5qs',
  '羅馬尼亞硬舉': 'https://www.youtube.com/watch?v=5u_hQA-r4yk',
  '小腿提踵': 'https://www.youtube.com/watch?v=SVtg-1loH4c',
  '單腳站平衡': 'https://www.youtube.com/watch?v=fbVTXhp6snI',
  '足底短足訓練': 'https://www.youtube.com/watch?v=m1lkcg8p-48'
};

const RUN_COMPANION_PODCASTS = {
  runningStories: { title: '跑步故事', query: '配速之外 Beyond the Pace', length: '適合 45–90 分鐘', detail: '從長跑、運動員生活到地方文化，適合想留在跑步氛圍裡的日子。' },
  runningTraining: { title: '跑步訓練', query: '麒時跑步很簡單', length: '適合熱身／收操', detail: '教練觀點與訓練主題；品質課的主課段仍以配速和呼吸為先。' },
  sportsCulture: { title: '運動與賽事', query: '約跑+ Podcast', length: '適合 45 分鐘以上', detail: '賽事現場、跑者旅程與運動文化，長跑時比較不容易聽膩。' },
  deepTalk: { title: '深度訪談', query: '深度訪談 Podcast', length: '適合長跑前半段', detail: '人物、職涯、創作或社會議題；選一集完整聽完會很有陪跑感。' },
  historyStories: { title: '歷史與知識故事', query: '杞人說故事 輕鬆說歷史', length: '適合輕鬆跑／恢復跑', detail: '故事性強、進入門檻低，適合想讓腦袋換個頻道的日子。' },
  travelAdventure: { title: '旅行與冒險故事', query: '旅行 冒險 Podcast', length: '適合 60 分鐘以上', detail: '把長跑當成一趟移動中的旅行，適合需要景色與故事感的日子。' },
  businessIdeas: { title: '商業與創作想法', query: '商業 創作 Podcast', length: '適合穩定配速跑', detail: '適合想在不追成績的日子，把跑步時間留給新觀點。' },
  lightChat: { title: '喜劇與輕鬆聊天', query: '青春愛消遣 Podcast', length: '適合低強度跑', detail: '不需要費力跟上內容；若笑到呼吸亂掉，就把速度再放慢一點。' }
};

const RUN_COMPANION_MUSIC = {
  lofiRecovery: { title: 'Lo-fi／舒緩電子', query: 'lofi recovery run 140 BPM', tempo: '140–155 BPM', detail: '恢復日用來穩住呼吸，不把身體推進亢奮狀態。' },
  indiePop: { title: 'Indie Pop', query: 'indie pop running 160 BPM', tempo: '155–165 BPM', detail: '旋律感夠、節奏不太壓迫，適合輕鬆跑或長跑前段。' },
  cityPop: { title: 'City Pop／日系流行', query: 'city pop running playlist', tempo: '150–165 BPM', detail: '明亮耐聽，適合想跑得輕鬆又不想太安靜的日子。' },
  funkDisco: { title: 'Funk／Disco', query: 'funk disco running playlist', tempo: '155–170 BPM', detail: '律動明確但不過度刺激，長跑後段也容易維持心情。' },
  movieScores: { title: '電影／遊戲配樂', query: 'movie game soundtrack running playlist', tempo: '彈性節奏', detail: '適合不想一直被固定節拍追趕、又需要故事感的長跑。' },
  easyElectronic: { title: '輕電子／Chill House', query: 'chill house running playlist', tempo: '150–165 BPM', detail: '節拍連續、不太搶戲，適合穩定巡航。' },
  houseDrive: { title: 'House／Dance', query: 'house running 170 BPM playlist', tempo: '165–175 BPM', detail: '適合節奏跑，用穩定拍點幫你把主課守在可控範圍。' },
  popTempo: { title: '流行快歌', query: 'pop running 170 BPM playlist', tempo: '165–175 BPM', detail: '熟悉旋律加上清楚節拍，適合需要一點推力的主課。' },
  rockDrive: { title: '搖滾／Pop Punk', query: 'rock running workout playlist', tempo: '165–180 BPM', detail: '適合需要氣勢的節奏跑、間歇或比賽日。' },
  hipHopDrive: { title: 'Hip-hop Workout', query: 'hip hop running workout playlist', tempo: '165–180 BPM', detail: '重拍感明顯；若你的步頻被帶快，請優先守住課表強度。' },
  electronicFocus: { title: 'Electro／Techno', query: 'electronic techno running workout playlist', tempo: '170–180 BPM', detail: '適合快段與間歇，把注意力放在當下這一組。' },
  drumBass: { title: 'Drum & Bass', query: 'drum and bass running playlist', tempo: '170–180 BPM', detail: '高能量快節奏，適合短快段；恢復段請讓呼吸先降下來。' },
  raceHype: { title: '比賽日熟悉歌單', query: 'race day running motivation playlist', tempo: '依個人習慣', detail: '比賽不要嘗試陌生曲風；熟悉的歌更容易讓你守住自己的節奏。' }
};

const RUN_COMPANION_HISTORY_KEY = 'runner-plaza:companion-podcast-history';
const RUN_COMPANION_MUSIC_HISTORY_KEY = 'runner-plaza:companion-music-history';

// ============================================================
// MODAL
// ============================================================
let modalReturnFocus = null;

document.getElementById('modal')?.addEventListener('click', event => {
  if (event.target === document.getElementById('modal')) closeModal();
});

document.addEventListener('keydown', (event) => {
  const overlay = document.getElementById('modal');
  if (overlay?.classList.contains('open')) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = modalFocusableElements();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    return;
  }

  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
  const tabList = tab?.closest('[role="tablist"]');
  if (!tab || !tabList) return;
  const tabs = [...tabList.querySelectorAll('[role="tab"]')];
  const current = tabs.indexOf(tab);
  if (current < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  const target = tabs[next];
  target.focus();
  target.click();
});

const ASSESSMENT_TYPE_LABEL = {
  test_20min: '20 分鐘測驗',
  race_5k: '5K 測驗',
  race_10k: '10K 測驗',
  race_half: '半馬測驗',
  custom_race: '近期比賽'
};

// ============================================================
// LIVE PACE CALIBRATION
// ============================================================

// ============================================================
// EXPORTS
// ============================================================
let pendingTrainingImport = null;
let pendingTrainingImportInfo = null;

// ============================================================
// INIT
// ============================================================
function init() {
  appData = loadData();
  if (shouldRebuildSavedPlan(appData)) {
    appData = rebuildStoredPlan(appData);
    saveData(appData);
  } else if (planEndsBeforeTargetDate(appData.plan, appData.profile?.targetDate)) {
    appData = extendSavedPlanToTarget(appData);
    saveData(appData);
  } else if (appData.profile && (appData.profile.planVersion || 0) < PLAN_SCHEMA_VERSION) {
    // A schema label alone must never rewrite a runner's existing plan.
    appData.profile.planVersion = PLAN_SCHEMA_VERSION;
    saveData(appData);
  }
  const ui = loadUiState();
  if (appData.profile && appData.plan && appData.plan.length > 0) {
    // renderPlanView() 已經用今天的日期算出真正的 currentWeek；不要在開機時
    // 用「上次瀏覽到哪一週」（ui.week，單純翻頁記憶）覆寫回去。翻頁看其他
    // 週跟「目前實際進行到第幾週」是兩件事，混在同一個變數裡，重新整理
    // 一次就會把提前排課、週評估等判斷全部帶去錯的週。
    renderPlanView();
    if (ui.view === 'setup') {
      renderSetupView();
      showView('setup');
    } else {
      showView('plan');
      if (ui.planTab && ui.planTab !== 'week') switchPlanTab(ui.planTab);
    }
  } else {
    renderSetupView();
    showView('setup');
  }
  applyRacePrefill();
  window.scrollPageTop = () => {
    const el = document.scrollingElement || document.documentElement;
    const start = el.scrollTop;
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* 老環境不支援 options */ }
    // 部分環境 smooth scrollTo 無效：250ms 後沒動就直接跳頂
    setTimeout(() => { if (el.scrollTop >= start && start > 0) el.scrollTop = 0; }, 250);
  };
  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    const syncBackToTop = () => {
      const y = window.scrollY || document.scrollingElement?.scrollTop || 0;
      backToTop.classList.toggle('show', y > 400);
    };
    document.addEventListener('scroll', syncBackToTop, { passive: true, capture: true });
    syncBackToTop();
  }
  loadTrainerWeather().then(() => {
    // 天氣載入後先做出發前調整，週視圖才會直接呈現調整後的今天
    if (typeof runCoachAdaptation === 'function') runCoachAdaptation('weather-ready');
    if (trainerWeather && document.getElementById('plan-tab-week')) {
      jumpToPhaseWeek(currentWeek);
    }
  });
  syncRegisteredSundayRaces();
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith('runner-plaza:') && event.key.endsWith(RUNNER_REGISTERED_RACES_SUFFIX)) {
      syncRegisteredSundayRaces();
    }
  });
}

// 從賽事列表「用這場排課」帶入：trainer.html?goal=half&date=2026-11-15
function applyRacePrefill() {
  const params = new URLSearchParams(window.location.search);
  const goal = params.get('goal');
  const date = params.get('date');
  if (!goal && !date) return;
  renderSetupView();
  showView('setup');
  prefillSetupForm({
    goal: GOAL_META[goal] ? goal : null,
    targetDate: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : ''
  });
  history.replaceState(null, '', 'trainer.html');
}

init();
loadRegistrationRaceCheckpoints();

;
// ============================================================
// 教練週報 — 個人本機預設記住密語，也允許使用者只保留本次頁面
// ============================================================
(function () {
  const PASSPHRASE_STORAGE_KEY = 'coach-review:passphrase';
  const DATA_URL = 'data/training-review.enc.json';
  let unlockedPassphrase = '';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function decrypt(payload, passphrase) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64ToBytes(payload.salt), iterations: payload.kdf.iterations, hash: payload.kdf.hash },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.ct)
    );
    const data = JSON.parse(new TextDecoder().decode(plain));
    // payload.updatedAt 是「這個檔案最後一次成功建置」的日期（Garmin 排程跑一次就會更新一次）；
    // data.updatedAt 是人工週報自己填的日期（通常一週才手動更新一次）。
    // 兩者意義不同，分開存，狀態徽章要判斷「排程有沒有跑」該用前者，不是後者。
    data.syncedAt = payload.updatedAt || null;
    return data;
  }

  function trendSvg(trend) {
    if (!Array.isArray(trend) || trend.length < 2) return '';
    const w = 560, h = 120, pad = 24;
    const kms = trend.map((t) => t.km);
    const max = Math.max(...kms) * 1.15;
    const x = (i) => pad + (i * (w - pad * 2)) / (trend.length - 1);
    const y = (v) => h - pad - (v / max) * (h - pad * 2);
    const pts = kms.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const dots = trend.map((t, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(t.km).toFixed(1)}" r="3.5" fill="currentColor"><title>${esc(t.week)}：${t.km} km / ${t.runs} 次 / 長跑 ${t.longKm} km</title></circle>`
    ).join('');
    const labels = trend.map((t, i) =>
      `<text x="${x(i).toFixed(1)}" y="${h - 6}" font-size="9" text-anchor="middle" opacity="0.65">${esc(t.week.slice(5))}</text>`
    ).join('');
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="週跑量趨勢" style="width:100%;height:auto;color:var(--accent,#2f7a5f)">
      <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
  }

  function render(data) {
    coachReviewData = data;
    coachReviewLoadState = 'ready';
    syncGarminRunsToPlan(data);
    // 校準與出發前調整都經單一 mutation 入口；背景觸發不跳 toast。
    const adaptation = runCoachAdaptation('coach-review-ready');
    if (adaptation.dailyAdvisory && document.getElementById('plan-tab-week')) jumpToPhaseWeek(currentWeek);
    refreshCoachReviewPanels();
  }

  function renderLoading(text) {
    const host = document.getElementById('coach-review-content');
    if (!host) return;
    host.innerHTML = `
      <div class="card" style="margin-top:24px" aria-busy="true">
        <div class="card-title">🔒 教練建議</div>
        <p style="margin:4px 0 0;opacity:0.85" role="status" aria-live="polite">⏳ ${esc(text)}</p>
      </div>`;
  }

  function renderNotice(text) {
    coachReviewLoadState = 'unavailable';
    const host = document.getElementById('coach-review-content');
    if (!host) return;
    host.innerHTML = `
      <div class="card" style="margin-top:24px">
        <div class="card-title">🔒 教練建議</div>
        <p style="margin:4px 0 0;opacity:0.85">${esc(text)}</p>
      </div>`;
  }

  function renderUnlock(payload, wrongKey) {
    coachReviewLoadState = 'locked';
    const host = document.getElementById('coach-review-content');
    if (!host) return;
    host.innerHTML = `
      <div class="card" style="margin-top:24px">
        <div class="card-title">🔒 教練建議</div>
        <p style="margin:4px 0 10px;opacity:0.85">本區塊為加密的個人訓練紀錄。密語預設只保留在目前頁面；若這是你專用且受信任的本機瀏覽器，才可選擇記住。<span role="alert" aria-live="assertive">${wrongKey ? '<br><b style="color:#b3402a">密語不正確，請再試一次。</b>' : ''}</span></p>
        <form id="coach-review-form" style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="password" id="coach-review-pass" placeholder="通關密語" autocomplete="current-password" style="flex:1;min-width:180px;padding:8px 10px" />
          <button type="submit" class="btn btn-primary">解鎖</button>
          <label style="flex-basis:100%;font-size:12px;color:var(--c-text-muted);cursor:pointer"><input type="checkbox" id="coach-review-remember"> 在這台受信任裝置記住密語</label>
        </form>
      </div>`;
    const passInput = document.getElementById('coach-review-pass');
    if (wrongKey) passInput.focus();
    document.getElementById('coach-review-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = passInput.value;
      if (!pass) return;
      try {
        const data = await decrypt(payload, pass);
        unlockedPassphrase = pass;
        if (document.getElementById('coach-review-remember')?.checked) {
          localStorage.setItem(PASSPHRASE_STORAGE_KEY, pass);
        } else {
          localStorage.removeItem(PASSPHRASE_STORAGE_KEY);
        }
        render(data);
      } catch (err) {
        console.warn('coach-review: passphrase decrypt failed', err);
        renderUnlock(payload, true);
      }
    });
  }

  async function init() {
    if (!window.crypto?.subtle) {
      renderNotice('此瀏覽器環境不支援解密（需要 HTTPS 或本機安全環境），無法顯示教練建議。');
      return;
    }
    renderLoading('讀取教練建議中…');
    let payload;
    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (!res.ok) { renderNotice('目前無法讀取教練建議資料，請稍後重新整理。'); return; }
      payload = await res.json();
      if (!payload?.ct || !payload?.salt || !payload?.iv) { renderNotice('教練建議資料格式異常，請稍後重新整理。'); return; }
    } catch (err) {
      console.warn('coach-review: fetch failed', err);
      renderNotice('讀取教練建議失敗（可能離線），請確認網路連線後重新整理。');
      return;
    }
    const savedPassphrase = unlockedPassphrase || localStorage.getItem(PASSPHRASE_STORAGE_KEY);
    if (savedPassphrase) {
      renderLoading('解鎖教練建議中…');
      try {
        unlockedPassphrase = savedPassphrase;
        render(await decrypt(payload, savedPassphrase));
        return;
      } catch (err) {
        console.warn('coach-review: saved passphrase no longer valid', err);
        unlockedPassphrase = '';
        localStorage.removeItem(PASSPHRASE_STORAGE_KEY);
      }
    }
    renderUnlock(payload, false);
  }

  window.lockCoachReview = () => {
    unlockedPassphrase = '';
    localStorage.removeItem(PASSPHRASE_STORAGE_KEY);
    coachReviewData = null;
    coachReviewLoadState = 'loading';
    refreshCoachReviewPanels();
    init();
  };
  window.loadCoachReview = init;

  init();
})();

// Compatibility facade: backup UI stays callable from existing inline controls while
// implementation now belongs to trainer-data.js.
window.exportTrainingData = () => window.TrainerData?.exportData();
window.requestTrainingDataImport = () => window.TrainerData?.requestImport();
window.importTrainingData = (event) => window.TrainerData?.importData(event);
window.applyTrainingDataImport = () => window.TrainerData?.applyImport();
window.restorePreImportSnapshot = () => window.TrainerData?.restorePreImportSnapshot();
window.confirmRestorePreImportSnapshot = () => window.TrainerData?.confirmRestorePreImportSnapshot();
