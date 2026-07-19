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

function trainingTypeLabel(type, focus = '') {
  return type === 'easy' && focus === 'recovery'
    ? TRAINING_TYPE_LABELS.recovery
    : TRAINING_TYPE_LABELS[type] || '訓練';
}

function trainingTaskTitle(day) {
  const title = String(day?.task || '').replace(/\bNaN(?:\.\d+)?\s*(?:km|公里)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  const typeLabel = trainingTypeLabel(day?.type, day?.focus);
  if (!title || day?.coachPlan) return title || typeLabel;
  if (day.type === 'easy') {
    return title
      .replace(/^E\s*跑/i, typeLabel)
      .replace(/^有氧穩定跑/, `${typeLabel}（穩定有氧）`)
      .replace(/^輕鬆漸進跑/, `${typeLabel}（漸進）`);
  }
  if (day.type === 'tempo') return title.replace(/^T\s*跑/i, typeLabel);
  if (day.type === 'interval') return title.replace(/^I\s*跑/i, typeLabel);
  return title;
}

function createEmptyData() {
  return { profile: null, plan: [], log: [], checkins: [], assessments: [], adaptationPrompts: {}, dayStatuses: {}, skipReasons: {}, makeupRecords: {}, activityAssignments: {}, planChangeHistory: [], garminSyncManifest: {}, trainingEvents: [], cycleHistory: [], nextCycleDraft: null, nextCycleCoachContext: null, lastBackupAt: null, safetyHold: null };
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

function formatSkipReason(reason) {
  if (!reason) return '';
  if (typeof reason === 'string') return reason;
  const label = SKIP_REASON_LABELS[reason.code] || SKIP_REASON_LABELS.other;
  return reason.noMakeupReason ? `${label}｜不補跑：${reason.noMakeupReason}` : label;
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
  // Garmin 同步資料可能在同一天分批更新；歷程只呈現最後一次校準結果，避免把同一輪自動調整誤看成兩筆事件。
  return normalized.reduce((items, item) => {
    const previousIndex = item.source === 'garmin'
      ? items.findIndex((previous) => previous.date === item.date && previous.source === item.source && previous.title === item.title)
      : -1;
    if (previousIndex >= 0) items[previousIndex] = item;
    else items.push(item);
    return items;
  }, []);
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
    checkins: Array.isArray(data?.checkins) ? data.checkins : [],
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
  const rebuiltData = applyStoredMakeupRecords(applyStoredDayStatuses({
    ...data,
    plan: buildPlan(preservedProfile)
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
    if (day) return { day: applyCoachPlanOverride(day, week), weekNum: week.weekNum || null };
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
  if (profile.maxHr && (profile.maxHr < 140 || profile.maxHr > 220)) errors.push('最大心率需介於 140 至 220 bpm，或留白讓系統採保守預設。');
  return errors;
}

function secToPace(sec) {
  if (!sec || sec <= 0) return '—';
  const rounded = Math.round(sec);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function secToTime(sec) {
  if (!sec || sec <= 0) return '0:00:00';
  const rounded = Math.round(sec);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

function hrZones(profile) {
  const max = profileMaxHr(profile);
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
  // 百分比標籤要跟區間的實際計算基準一致：LTHR 模式顯示 %LTHR，否則顯示 %HRmax
  const isLthr = zones.source === 'lthr';
  const pctUnit = isLthr ? 'LTHR' : 'HRmax';
  const rows = [
    ['恢復跑', `≤ ${zones.recoveryMax}`, isLthr ? '≤82%' : '≤75%', '很輕鬆，可完整講句子；硬課隔天用', ''],
    ['輕鬆跑 / 長跑', `≤ ${zones.easyMax}`, isLthr ? '≤88%' : '≤80%', '可對話的輕鬆有氧，週跑量主體都在這區', 'is-key'],
    ['穩定有氧', `${zones.steadyLow}–${zones.steadyHigh}`, isLthr ? '88–93%' : '80–84%', '呼吸變深但可控，存體能不追速度', ''],
    ['節奏跑', `${zones.tempoLow}–${zones.tempoHigh}`, isLthr ? '96–102%' : '85–89%', '吃力但穩定，只能講短句', ''],
    ['間歇', `${zones.intervalLow}–${zones.intervalHigh}`, isLthr ? '103–108%' : '90–95%', '很硬，趟與趟之間要完整恢復', '']
  ];
  const body = `
    <p style="margin:0 0 10px;font-size:13px;color:var(--c-text-muted)">${isLthr ? `區間以 Garmin 實測乳酸閾值心率 <b style="color:var(--c-text)">${Number(coachReviewData?.lactateThresholdHr)} bpm</b> 推算（比 %HRmax 更個人化）；最大心率 ${zones.max} bpm。` : `最大心率 <b style="color:var(--c-text)">${zones.max} bpm</b>（來源：${source}）。`}跑步時看錶守區間，比守配速可靠——尤其夏天。</p>
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
// PLAN GENERATION
// ============================================================
function mondayOfWeek(dateInput) {
  const date = new Date(dateInput);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function calcWeeks(targetDate, generatedAt = Date.now()) {
  const raceDate = new Date(`${targetDate}T00:00:00`);
  if (Number.isNaN(raceDate.getTime())) return 1;
  // 課表以生成日所在週的週一開始；必須把賽事所在的整週也納入，
  // 否則週日賽事會在「完整週數」計算中被漏掉一週。
  const planStart = mondayOfWeek(generatedAt);
  const raceWeekStart = mondayOfWeek(raceDate);
  return Math.max(Math.round((raceWeekStart - planStart) / (1000 * 86400 * 7)) + 1, 1);
}

function buildPhases(goal, totalWeeks) {
  const configs = {
    '5k10k': [
      { name: 'base', label: '基礎建量', ratio: 0.4 },
      { name: 'build', label: '強化提升', ratio: 0.4 },
      { name: 'taper', label: '賽前減量', ratio: 0.2 }
    ],
    half: [
      { name: 'base', label: '基礎建量', ratio: 0.3 },
      { name: 'build', label: '強化提升', ratio: 0.35 },
      { name: 'peak', label: '高峰週期', ratio: 0.2 },
      { name: 'taper', label: '賽前減量', ratio: 0.15 }
    ],
    full: [
      { name: 'base', label: '基礎建量', ratio: 0.25 },
      { name: 'build1', label: '強化①', ratio: 0.25 },
      { name: 'build2', label: '強化②', ratio: 0.25 },
      { name: 'peak', label: '高峰週期', ratio: 0.15 },
      { name: 'taper', label: '賽前減量', ratio: 0.1 }
    ],
    rehab: [
      { name: 'light', label: '輕量恢復', ratio: 0.25 },
      { name: 'progress', label: '漸進強化', ratio: 0.35 },
      { name: 'solid', label: '鞏固基礎', ratio: 0.25 },
      { name: 'maintain', label: '維持訓練', ratio: 0.15 }
    ]
  };
  const template = configs[goal] || configs.half;
  // 短期備賽不能硬塞完整週期模板，否則會把 1–3 週錯分成多個假 phase。
  if (totalWeeks <= 1) return [{ ...template.at(-1), weeks: 1 }];
  if (totalWeeks === 2) return [{ ...template[0], weeks: 1 }, { ...template.at(-1), weeks: 1 }];
  if (totalWeeks < template.length) {
    return [...template.slice(0, totalWeeks - 1).map((phase) => ({ ...phase, weeks: 1 })), { ...template.at(-1), weeks: 1 }];
  }
  let remaining = totalWeeks;
  return template.map((phase, index) => {
    const weeks = index === template.length - 1 ? remaining : Math.max(1, Math.round(totalWeeks * phase.ratio));
    remaining -= weeks;
    return { ...phase, weeks };
  });
}

function coachPlanningReadiness(profile) {
  const latestCheckin = latestTrainingCheckin();
  const checkinIsRecent = latestCheckin?.date && daysSinceDate(latestCheckin.date) <= 14;
  const fatigue = checkinIsRecent ? Number(latestCheckin.fatigue) || 0 : 0;
  const recoveryRisk = Boolean(checkinIsRecent && (latestCheckin.painConcern || latestCheckin.result === '停止品質課' || latestCheckin.result === '降載恢復' || fatigue >= 4));
  const hasInjury = !(profile.injuries || []).includes('none');
  const availableRuns = (profile.dayState || []).filter((state) => state >= 1).length;
  const recentTrend = weeklyRunTrend(coachRunRecords()).slice(-2);
  const completeRecent = recentTrend.filter((week) => week.week !== weekStartLabel(todayStr()) && Number(week.km) > 0);
  const recentKm = completeRecent.length ? completeRecent.reduce((sum, week) => sum + Number(week.km), 0) / completeRecent.length : 0;
  const configuredKm = Number(profile.weeklyKm) || 10;
  // 若近期實跑顯著低於設定，先以實跑能力為起點，避免重新排課瞬間跳量。
  const startKm = recentKm ? Math.min(configuredKm, Math.max(8, Math.round(recentKm * 1.05 * 10) / 10)) : configuredKm;
  const allowQuality = availableRuns >= 3 && !hasInjury && !recoveryRisk;
  return {
    startKm: recoveryRisk ? Math.round(startKm * (fatigue >= 5 || latestCheckin?.painConcern ? 0.7 : 0.85) * 10) / 10 : startKm,
    allowQuality,
    forceDeload: recoveryRisk || hasInjury,
    growthMultiplier: recoveryRisk || hasInjury ? 0 : availableRuns <= 2 ? 0.5 : 1,
    reason: recoveryRisk ? '近期疲勞、疼痛或恢復訊號未達標，先以恢復週重建。' : hasInjury ? '目前有傷病風險，先降低衝擊與品質課。' : availableRuns <= 2 ? '可訓練天數偏少，以穩定完成與長跑恢復為主。' : ''
  };
}

function calcLongRunKm(targetKm, numTrain, maxMins, easyPaceSec, isTaper, goal) {
  const rule = GOAL_RULES[goal] || GOAL_RULES.half;
  const share = numTrain <= 2 ? Math.min(rule.longRunShare + 0.08, 0.45) : rule.longRunShare;
  let km = targetKm * share;
  if (easyPaceSec > 0) {
    km = Math.min(km, (maxMins * 60) / easyPaceSec);
  }
  km = Math.min(km, rule.longRunCapKm);
  if (isTaper) km *= 0.7;
  return Math.round(km * 10) / 10;
}

function calcWorkoutKm(type, targetKm, goal, longKm, focus = '') {
  const sharesByGoal = {
    '5k10k': { interval: 0.13, tempo: 0.17, easy: 0.2 },
    half: { interval: 0.12, tempo: 0.16, easy: 0.2 },
    full: { interval: 0.1, tempo: 0.15, easy: 0.18 },
    rehab: { interval: 0, tempo: 0.12, easy: 0.16 }
  };
  const goalShares = sharesByGoal[goal] || sharesByGoal.half;
  const share = goalShares[type] ?? 0.16;
  const focusFactor = type !== 'easy'
    ? 1
    : focus === 'recovery'
      ? 0.78
      : focus === 'rebuild'
        ? 0.72
        : focus === 'marathon'
          ? 1.08
          : focus === 'fueling'
            ? 0.96
      : focus === 'prelong'
        ? 0.88
        : focus === 'progression'
          ? 0.95
            : focus === 'strides'
            ? 0.9
            : 1;
  const baseKm = targetKm * share * focusFactor;
  const capped = longKm ? Math.min(baseKm, Math.max(longKm - 2, longKm * 0.78)) : baseKm;
  return Math.max(Math.round(capped * 10) / 10, type === 'interval' ? 4 : 5);
}

function canUseIntervalBySeason(weekStart) {
  // 夏季（6–9 月）高溫不排間歇；涼季（10–5 月）開放。與 isHotSeasonDate 同一定義，避免兩套季節規則。
  return !isHotSeasonDate(weekStart);
}

function buildWorkoutPattern(profile, numTrain, weekNum, phaseName, isDeload, hasInjury, isEarlyBeginner, weekStart, readiness = {}) {
  const rule = GOAL_RULES[profile.goal] || GOAL_RULES.half;
  // 有傷史不整季禁品質課（教練規則：當週不穩才退級）；傷況調整在 buildWeekDays 做降階與提醒
  const qualityReady = weekNum >= rule.qualityAfterWeeks && !isDeload && !isEarlyBeginner && readiness.allowQuality !== false;
  const canUseTempo = qualityReady && profile.goal !== 'rehab';
  const canUseInterval = canUseTempo && canUseIntervalBySeason(weekStart);
  const phaseBucket = ['base', 'light'].includes(phaseName) ? 'base' : ['peak', 'taper'].includes(phaseName) ? phaseName : 'build';
  const rotation = weekNum % 4;
  const easyFocusCycle = ['recovery', 'aerobic', 'prelong', 'progression'];
  const qualityType = !canUseTempo || phaseBucket === 'base'
    ? 'easy'
    : canUseInterval && (phaseBucket === 'peak' || rotation === 2)
      ? 'interval'
      : 'tempo';
  const qualityFocus = qualityType === 'interval'
    ? (phaseBucket === 'peak' ? 'specific' : rotation % 2 === 0 ? 'economy' : 'cruise')
    : qualityType === 'tempo'
      ? (phaseBucket === 'base' ? 'steady' : rotation % 2 === 0 ? 'cruise' : 'progression')
      : 'aerobic';
  // 品質課變化（half / 5k10k 專用）：涼季 build 期挑一個輪替位排坡道課；
  // 熱季間歇被季節擋掉時，原本要排間歇的輪替位改排法特雷克，維持速度刺激但用體感控制。
  const qualityVariant = qualityType === 'tempo'
    ? (rotation === 2 && !canUseIntervalBySeason(weekStart)
        ? { type: 'tempo', focus: 'fartlek', label: '法特雷克變速課' }
        : rotation === 0 && phaseBucket === 'build' && canUseIntervalBySeason(weekStart)
          ? { type: 'tempo', focus: 'hills', label: '坡道強化課' }
          : null)
    : null;

  if (profile.goal === 'rehab') {
    const rehabSessions = [
      { type: 'easy', focus: 'recovery', label: '恢復跑' },
      { type: 'easy', focus: rotation % 2 === 0 ? 'rebuild' : 'aerobic', label: rotation % 2 === 0 ? '跑走重建' : '穩定慢跑' },
      { type: 'easy', focus: 'prelong', label: '輕鬆喚醒' },
      { type: 'easy', focus: 'recovery', label: '恢復跑' }
    ];
    return rehabSessions.slice(0, Math.max(1, numTrain - 1));
  }

  if (profile.goal === 'full') {
    const fullQuality = qualityType === 'interval'
      ? { type: 'tempo', focus: 'marathon', label: '馬拉松穩定主課' }
      : qualityType === 'tempo'
        ? { type: 'tempo', focus: rotation % 2 === 0 ? 'marathon' : 'cruise', label: rotation % 2 === 0 ? '馬拉松穩定主課' : '巡航節奏主課' }
        : { type: 'easy', focus: 'marathon', label: '馬拉松穩定跑' };
    const fullSessions = [
      { type: 'easy', focus: 'recovery', label: '恢復跑' },
      fullQuality,
      { type: 'easy', focus: 'aerobic', label: '補充有氧' },
      { type: 'easy', focus: rotation % 2 === 0 ? 'fueling' : 'prelong', label: rotation % 2 === 0 ? '補給演練跑' : '長跑前喚醒' }
    ];
    return fullSessions.slice(0, Math.max(1, numTrain - 1));
  }

  if (profile.goal === '5k10k') {
    const entryQuality = qualityType === 'interval'
      ? { type: 'interval', focus: rotation % 2 === 0 ? 'economy' : 'cruise', label: '速度感主課' }
      : qualityType === 'tempo'
        ? (qualityVariant || { type: 'tempo', focus: rotation % 2 === 0 ? 'steady' : 'progression', label: rotation % 2 === 0 ? '穩定節奏課' : '漸進節奏課' })
        : { type: 'easy', focus: 'aerobic', label: '穩定慢跑' };
    const entrySessions = [
      { type: 'easy', focus: 'recovery', label: '恢復跑' },
      entryQuality,
      { type: 'easy', focus: canUseInterval ? 'strides' : 'progression', label: canUseInterval ? '輕鬆跑 + 加速跑' : '漸進慢跑' },
      { type: 'easy', focus: 'prelong', label: '週末前喚醒' }
    ];
    return entrySessions.slice(0, Math.max(1, numTrain - 1));
  }

  // half（以及未落入上方專屬分支的目標）共用的品質課輪替：優先套用坡道/法特雷克變體。
  const effectiveQualityFocus = qualityVariant ? qualityVariant.focus : qualityFocus;
  const effectiveQualityLabel = qualityVariant ? qualityVariant.label : (qualityType === 'interval' ? '本週主課' : '本週節奏主課');

  if (numTrain <= 2) {
    return [{ type: 'easy', focus: 'aerobic', label: '單週維持跑' }];
  }

  if (numTrain === 3) {
    if (qualityType === 'easy') {
      return [
        { type: 'easy', focus: 'recovery', label: '恢復跑' },
        { type: 'easy', focus: rotation % 2 === 0 ? 'prelong' : 'aerobic', label: rotation % 2 === 0 ? '長跑前喚醒' : '穩定有氧' }
      ];
    }
    return rotation % 2 === 0
      ? [
          { type: qualityType, focus: effectiveQualityFocus, label: effectiveQualityLabel },
          { type: 'easy', focus: 'prelong', label: '長跑前喚醒' }
        ]
      : [
          { type: 'easy', focus: 'recovery', label: '恢復跑' },
          { type: qualityType, focus: effectiveQualityFocus, label: effectiveQualityLabel }
        ];
  }

  if (numTrain === 4) {
    if (qualityType === 'easy') {
      return [
        { type: 'easy', focus: 'recovery', label: '恢復跑' },
        { type: 'easy', focus: 'aerobic', label: '穩定有氧' },
        { type: 'easy', focus: 'prelong', label: '長跑前喚醒' }
      ];
    }
    return [
      { type: 'easy', focus: 'recovery', label: '恢復跑' },
      { type: qualityType, focus: effectiveQualityFocus, label: effectiveQualityLabel },
      { type: 'easy', focus: rotation % 2 === 0 ? 'prelong' : 'aerobic', label: rotation % 2 === 0 ? '長跑前喚醒' : '穩定有氧' }
    ];
  }

  const sessions = [
    { type: 'easy', focus: 'recovery', label: '恢復跑' },
    qualityType === 'easy'
      ? { type: 'easy', focus: 'aerobic', label: '穩定有氧' }
      : { type: qualityType, focus: effectiveQualityFocus, label: effectiveQualityLabel },
    { type: 'easy', focus: 'aerobic', label: '穩定有氧' },
    { type: 'easy', focus: canUseInterval && phaseBucket !== 'base' ? 'strides' : easyFocusCycle[rotation], label: canUseInterval && phaseBucket !== 'base' ? '輕鬆跑 + 加速跑' : '補充有氧' }
  ];
  return sessions.slice(0, Math.max(0, numTrain - 1));
}

function buildWorkoutContent(type, km, profile, phaseName, weekNum, isDeload, isTaper, focus = '', label = '') {
  const generatedAtForPace = profile.generatedAt ? new Date(profile.generatedAt) : new Date();
  const paceAnchor = new Date(generatedAtForPace);
  paceAnchor.setDate(generatedAtForPace.getDate() + (weekNum - 1) * 7);
  const easyAdaptive = adaptiveEasyPaceSec(profile, paceAnchor);
  const tempo = secToPace(profile.tempoPaceSec);
  const interval = secToPace(profile.intervalPaceSec);
  const easy = secToPace(easyAdaptive.sec);
  const fastEasy = easyAdaptive.sec > 255 ? secToPace(easyAdaptive.sec - 15) : easy;
  const goal = profile.goal || 'half';
  const phaseBucket = ['base', 'light'].includes(phaseName) ? 'base' : ['peak', 'taper'].includes(phaseName) ? phaseName : 'build';
  const goalBias = { '5k10k': 0, half: 1, full: 2, rehab: 3 }[profile.goal] || 0;
  const rotation = (weekNum + goalBias) % 4;
  const generatedAt = profile.generatedAt ? new Date(profile.generatedAt) : new Date();
  const weekAnchor = new Date(generatedAt);
  weekAnchor.setDate(generatedAt.getDate() + (weekNum - 1) * 7);
  const allowSummerStrides = canUseIntervalBySeason(weekAnchor);

  if (type === 'easy') {
    const variants = [
      {
        task: `${label || '輕鬆跑'} ${km} km`,
        pace: `配速 ${easy}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '5–8 分', detail: focus === 'recovery' ? '先把雙腿走開，不急著進入跑步節奏。' : '步行 + 動態伸展，喚醒髖部與小腿。' },
          { icon: '🏃', title: '主課', dose: `${km} km`, detail: focus === 'recovery' ? `今天是恢復跑，只要順順完成 ${km} km，配速 ${easy}/km 不追快。` : `全程維持輕鬆跑，配速 ${easy}/km，以可對話為原則。` },
          { icon: '🧘', title: '收操', dose: '5–8 分', detail: '慢跑降速 + 靜態伸展，尤其小腿、臀肌與股四頭。' }
        ]
      },
      {
        task: `${label || '輕鬆跑'} ${km} km + 加速跑`,
        pace: `配速 ${easy}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '8–10 分', detail: '慢走、開髖、腿後勾與高抬腿，先把步幅打開。' },
          { icon: '🏃', title: '主課', dose: `${Math.max(3, Math.round((km - 0.8) * 10) / 10)} km + 4×100m`, detail: `先完成輕鬆跑，再做 4 趟 100m 放鬆加速，提升步頻但不衝刺。` },
          { icon: '🧘', title: '收操', dose: '5–8 分', detail: '走跑交替降心率，最後做小腿、臀肌與髂脛束伸展。' }
        ]
      },
      {
        task: `${label || '輕鬆漸進跑'} ${km} km`,
        pace: `配速 ${easy} 起，最後收至 ${fastEasy}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '8 分', detail: '先以慢走與動態伸展啟動，再進入很輕鬆的慢跑。' },
          { icon: '🏃', title: '主課', dose: `${km} km`, detail: focus === 'prelong' ? `今天像長跑前喚醒：先輕鬆跑，最後 10–15 分鐘自然收快到 ${fastEasy}/km，不硬頂。` : `前段維持 ${easy}/km，最後 15 分鐘自然收快到 ${fastEasy}/km，不硬頂。` },
          { icon: '🧘', title: '收操', dose: '5–8 分', detail: '慢跑降速後補水，結束前做 2–3 個下肢伸展動作。' }
        ]
      },
      {
        task: `${label || '有氧穩定跑'} ${km} km`,
        pace: `配速 ${easy}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '6–8 分', detail: '先走再跑，把呼吸和步幅順起來。' },
          { icon: '🏃', title: '主課', dose: `${km} km`, detail: focus === 'aerobic' ? `今天是穩定有氧日，整段維持穩定節奏，不追速度，像在「存體能」。` : `整段維持穩定有氧，不追速度，讓今天像在「存體能」。` },
          { icon: '🧘', title: '收操', dose: '5–8 分', detail: '慢走、補水、簡單伸展，留一點餘裕給明後天。' }
        ]
      }
    ];
    const focusMap = {
      recovery: variants[0],
      strides: allowSummerStrides ? variants[1] : variants[3],
      progression: variants[2],
      prelong: variants[2],
      rebuild: variants[0],
      marathon: variants[3],
      fueling: variants[3],
      aerobic: variants[3]
    };
    const variantPool = allowSummerStrides ? variants : [variants[0], variants[2], variants[3]];
    const variant = isDeload || isTaper
      ? variants[0]
      : focusMap[focus] || variantPool[phaseBucket === 'base' ? rotation % Math.min(2, variantPool.length) : rotation % variantPool.length];
    if (focus === 'rebuild') {
      variant.task = `${label || '跑走重建'} ${km} km`;
      variant.pace = `配速 ${easy}/km 或跑走交替`;
      variant.steps[1].detail = `今天重點是重新建立規律，不求整段都跑，必要時可用跑 4–6 分 / 走 1 分完成 ${km} km。`;
    } else if (focus === 'marathon') {
      variant.task = `${label || '馬拉松穩定跑'} ${km} km`;
      variant.steps[1].detail = `今天像全馬教練安排的補充有氧：穩定完成 ${km} km，讓週量和耐力慢慢墊起來。`;
    } else if (focus === 'fueling') {
      variant.task = `${label || '補給演練跑'} ${km} km`;
      variant.steps[1].detail = `今天不是拚速度，而是邊跑邊練喝水、補給和穩定節奏，先把全馬需要的節奏建立起來。`;
    }
    variant.paceSource = easyAdaptive.source;
    return variant;
  }

  if (type === 'tempo') {
    const blockKm = Math.max(1, Math.round((km / 2.5) * 10) / 10);
    const variants = [
      {
        task: `${label || '節奏跑'} ${km} km`,
        pace: `配速 ${tempo}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '10 分', detail: `慢跑（${easy}/km）+ 動態伸展 + 2 趟短加速。` },
          { icon: '🔥', title: '主課', dose: `${km} km`, detail: `連續節奏跑，配速 ${tempo}/km，維持穩定但可控制的吃力感。` },
          { icon: '🧘', title: '收操', dose: '5–10 分', detail: '慢跑降速，收掉心率，再做靜態伸展。' }
        ]
      },
      {
        task: `${label || '節奏分段跑'} ${km} km`,
        pace: `配速 ${tempo}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '12 分', detail: `慢跑 + 動態伸展，最後做 2 趟 80m 加速，準備進入閾值區。` },
          { icon: '🔥', title: '主課', dose: `2×${blockKm} km`, detail: `兩段節奏跑，配速 ${tempo}/km，中間慢跑 3 分鐘恢復，練穩定輸出。` },
          { icon: '🧘', title: '收操', dose: '8–10 分', detail: '慢跑降速，把呼吸和步頻整理回輕鬆區。' }
        ]
      },
      {
        task: `${label || '漸進節奏跑'} ${km} km`,
        pace: `由 ${easy}/km 收至 ${tempo}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '10 分', detail: '慢跑啟動 + 下肢動態伸展，讓步頻先順起來。' },
          { icon: '🔥', title: '主課', dose: `${km} km`, detail: `前半先在輕鬆偏穩定節奏，後半逐步收快到 ${tempo}/km，練配速控制。` },
          { icon: '🧘', title: '收操', dose: '5–8 分', detail: '慢跑降速，再做髖部與小腿伸展。' }
        ]
      },
      {
        task: `${label || '穩定節奏巡航'} ${km} km`,
        pace: `配速 ${tempo}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '10–12 分', detail: '慢跑啟動，加上 2 趟輕快加速，把步頻先喚醒。' },
          { icon: '🔥', title: '主課', dose: `${Math.max(2, Math.round(km * 0.7 * 10) / 10)} km`, detail: `今天像真人教練帶的穩定主課：節奏要平、呼吸要穩，不用硬衝。` },
          { icon: '🧘', title: '收操', dose: '6–8 分', detail: '慢跑降速，再做小腿、臀部和腿後側伸展。' }
        ]
      },
      {
        task: `${label || '坡道強化課'} ${km} km`,
        pace: '看體感 / 心率，不追配速',
        steps: [
          { icon: '🚶', title: '熱身', dose: '10–12 分', detail: `慢跑（${easy}/km）+ 動態伸展，先找一段 60–90 秒的緩上坡當今天的場地。` },
          { icon: '⛰️', title: '主課', dose: '6–8 趟 60–90 秒', detail: '上坡用 RPE 7–8 的努力跑上去，注意抬膝與步頻，不看配速；下坡慢跑回起點當恢復。' },
          { icon: '🧘', title: '收操', dose: '8–10 分', detail: '平地慢跑降速，收操做小腿與臀肌伸展，坡道課隔天肌肉痠痛正常。' }
        ]
      },
      {
        task: `${label || '法特雷克變速課'} ${km} km`,
        pace: '看體感（RPE 7），不看錶配速',
        steps: [
          { icon: '🚶', title: '熱身', dose: '10 分', detail: `慢跑（${easy}/km）+ 動態伸展，天熱時把熱身縮短、留力氣給變速段。` },
          { icon: '💨', title: '主課', dose: '8–10 段 1 分快 / 2 分慢', detail: '快段憑體感跑到 RPE 7 左右（吃力但可控），慢段放鬆恢復，全程不盯配速，用心率或體感控制強度。' },
          { icon: '🧘', title: '收操', dose: '5–8 分', detail: '慢跑降速、補水，天熱時特別注意收操後的補水與降溫。' }
        ]
      }
    ];
    const focusMap = {
      steady: variants[0],
      cruise: variants[1],
      progression: variants[2],
      marathon: variants[3],
      hills: variants[4],
      fartlek: variants[5]
    };
    const variant = isDeload ? variants[0] : focusMap[focus] || variants[phaseBucket === 'peak' ? 1 : rotation % 4];
    if (focus === 'marathon') {
      variant.task = `${label || '馬拉松穩定主課'} ${km} km`;
      variant.pace = `配速 ${tempo}/km 附近`;
      variant.steps[1].detail = `今天不是衝閾值，而是練全馬需要的穩定輸出與呼吸節奏，整體感受要穩而不爆。`;
    }
    return variant;
  }

  if (type === 'interval') {
    const sets400 = Math.max(4, Math.min(8, Math.round(km / 0.4)));
    const sets800 = Math.max(3, Math.min(6, Math.round(km / 0.8)));
    const sets1k = Math.max(3, Math.min(5, Math.round(km)));
    const variants = [
      {
        task: `${label || '間歇跑'} ${sets400}×400m`,
        pace: `配速 ${interval}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '15 分', detail: '慢跑 + 動態伸展 + 3 趟 100m 加速，準備進入較快節奏。' },
          { icon: '⚡', title: '主課', dose: `${sets400}×400m`, detail: `目標配速 ${interval}/km，每趟之間慢跑 90 秒恢復，重點是節奏一致。` },
          { icon: '🧘', title: '收操', dose: '10 分', detail: '慢跑降速，整理步頻與呼吸，再做伸展。' }
        ]
      },
      {
        task: `${label || '間歇跑'} ${sets800}×800m`,
        pace: `配速 ${interval}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '15–18 分', detail: `慢跑、活動度、2 趟短加速，讓身體先進入可提速狀態。` },
          { icon: '⚡', title: '主課', dose: `${sets800}×800m`, detail: `每趟維持 ${interval}/km，趟間慢跑 2 分鐘恢復，練半馬所需的穩定速度。` },
          { icon: '🧘', title: '收操', dose: '10 分', detail: '慢跑回收後補水，最後做臀腿伸展。' }
        ]
      },
      {
        task: `${label || '巡航間歇'} ${sets1k}×1 km`,
        pace: `配速 ${tempo}–${interval}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '15 分', detail: '慢跑、動態伸展、3 趟加速跑，避免一開始就頂強度。' },
          { icon: '⚡', title: '主課', dose: `${sets1k}×1 km`, detail: `每組控制在節奏到間歇之間，配速 ${tempo}–${interval}/km，組間慢跑 2 分鐘。` },
          { icon: '🧘', title: '收操', dose: '10 分', detail: '慢跑降速，把心率拉回來再收操。' }
        ]
      },
      {
        task: `${label || '節奏交替跑'} ${Math.max(4, Math.round(km * 10) / 10)} km`,
        pace: `快段 ${tempo}/km，慢段 ${easy}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '15 分', detail: '先把身體開好，再進入交替變速，避免第一組就太硬。' },
          { icon: '⚡', title: '主課', dose: '3–4 組', detail: `每組快跑 3 分 + 慢跑 2 分，讓速度刺激更像夏季可執行版本。` },
          { icon: '🧘', title: '收操', dose: '10 分', detail: '慢跑回收，最後用步行把呼吸帶回來。' }
        ]
      }
    ];
    const focusMap = {
      economy: variants[0],
      specific: variants[1],
      cruise: variants[2]
    };
    return focusMap[focus] || variants[phaseBucket === 'peak' ? 1 : rotation % variants.length];
  }

  const longVariants = goal === 'full' ? [
    {
      task: `長跑 ${km} km（穩定累積）`,
      pace: `配速 ${easy}/km`,
      steps: [
        { icon: '🚶', title: '熱身', dose: '5–10 分', detail: '先順順起跑，把今天當成全馬基礎耐力課。' },
        { icon: '🏃', title: '主課', dose: `${km} km`, detail: `今天的任務是穩定把距離吃下來，不追速度，重點是全程節奏、補給和動作穩定。` },
        { icon: '🧘', title: '收操', dose: '10 分', detail: '補水、補給、步行回收，把疲勞留在可恢復範圍。' }
      ]
    },
    {
      task: `長跑 ${km} km（補給節奏）`,
      pace: `配速 ${easy}/km`,
      steps: [
        { icon: '🚶', title: '熱身', dose: '8 分', detail: '起跑前先把今天預計補給時間想好。' },
        { icon: '🏃', title: '主課', dose: `${km} km`, detail: `今天要把喝水、補給與穩定跑感一起練進去，像正式全馬長跑那樣執行。` },
        { icon: '🧘', title: '收操', dose: '10 分', detail: '回收後記一下今天補給和後段疲勞感，方便下週微調。' }
      ]
    },
    {
      task: `長跑 ${km} km（尾段穩住）`,
      pace: `前段 ${easy}/km，後段守住姿勢`,
      steps: [
        { icon: '🚶', title: '熱身', dose: '5–8 分', detail: '前段不要搶快，今天重點是後段也能維持動作。' },
        { icon: '🏃', title: '主課', dose: `${km} km`, detail: `前段保守，後段專注在步頻、姿勢和補給節奏，不刻意拉速度。` },
        { icon: '🧘', title: '收操', dose: '10 分', detail: '慢走回收後補充水分與碳水，讓長跑真正被吸收。' }
      ]
    },
    {
      task: `長跑 ${km} km（後段漸進收快）`,
      pace: `前段 ${easy}/km，最後 20–25% 收至 ${tempo}/km`,
      steps: [
        { icon: '🚶', title: '熱身', dose: '5–10 分', detail: '前段完全放鬆起跑，把力氣留給後段收快。' },
        { icon: '🏃', title: '主課', dose: `${km} km`, detail: `前 75–80% 維持 ${easy}/km，最後 20–25% 逐步收到接近馬拉松配速 ${tempo}/km，練後段還能加速的節奏感。` },
        { icon: '🧘', title: '收操', dose: '10 分', detail: '慢走回收、補給，記錄收快段的感受供下次微調。' }
      ]
    }
  ] : goal === 'rehab' ? [
    {
      task: `長一點的輕鬆跑 ${km} km`,
      pace: `配速 ${easy}/km`,
      steps: [
        { icon: '🚶', title: '熱身', dose: '5–8 分', detail: '先確認身體狀況，再慢慢進入今天較長一點的課。' },
        { icon: '🏃', title: '主課', dose: `${km} km`, detail: `今天不是拼長跑，只是把可恢復的距離再拉長一點，過程有不適就降速或改跑走。` },
        { icon: '🧘', title: '收操', dose: '8–10 分', detail: '跑後記一下疼痛、疲勞與恢復感，作為下週調整依據。' }
      ]
    },
    {
      task: `穩定長一點跑 ${km} km`,
      pace: `配速 ${easy}/km`,
      steps: [
        { icon: '🚶', title: '熱身', dose: '5–8 分', detail: '今天目的是穩定完成，不是突破距離。' },
        { icon: '🏃', title: '主課', dose: `${km} km`, detail: `全程保持保守節奏，讓身體學會在無痛範圍內穩定移動更久。` },
        { icon: '🧘', title: '收操', dose: '8–10 分', detail: '步行、補水、伸展，觀察隔天是否恢復正常。' }
      ]
    }
  ] : [
    {
      task: `長跑 ${km} km`,
      pace: `配速 ${easy}–${fastEasy}/km`,
      steps: [
        { icon: '🚶', title: '熱身', dose: '5–10 分', detail: '步行 + 動態伸展，進入穩定長距離前先放鬆關節。' },
        { icon: '🏃', title: '主課', dose: `${km} km`, detail: `本週最長距離課，維持 ${easy}–${fastEasy}/km，重點是穩定與耐力。` },
        { icon: '🧘', title: '收操', dose: '10 分', detail: '步行、補水、靜態伸展，讓下肢完整回收。' }
      ]
    },
    {
      task: `長跑 ${km} km（尾段收快）`,
      pace: `前段 ${easy}/km，最後 2–3 km 收至 ${fastEasy}/km`,
      steps: [
        { icon: '🚶', title: '熱身', dose: '8 分', detail: '慢走與動態伸展後，用非常輕鬆的步伐起跑。' },
        { icon: '🏃', title: '主課', dose: `${km} km`, detail: `前段穩穩跑，最後 2–3 km 略收快，練長距離後段仍能維持姿勢。` },
        { icon: '🧘', title: '收操', dose: '10 分', detail: '步行回收、補給、下肢伸展，避免累積性緊繃。' }
      ]
    },
      {
        task: `穩定長跑 ${km} km`,
        pace: `配速 ${easy}/km`,
      steps: [
        { icon: '🚶', title: '熱身', dose: '5–8 分', detail: '先把關節與步幅打開，避免一開始就跨太大。' },
        { icon: '🏃', title: '主課', dose: `${km} km`, detail: `全程守在輕鬆配速 ${easy}/km，重點是均速與補給節奏，不追求速度。` },
        { icon: '🧘', title: '收操', dose: '10 分', detail: '慢走、補水、伸展，把疲勞控制在下一課前可恢復的範圍。' }
        ]
      },
      {
        task: `長跑 ${km} km（補給演練）`,
        pace: `配速 ${easy}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '5–8 分', detail: '先順順起跑，不用一開始就卡在目標節奏。' },
          { icon: '🏃', title: '主課', dose: `${km} km`, detail: '今天重點不只是距離，也包含喝水、補給、配速穩定和姿勢維持。' },
          { icon: '🧘', title: '收操', dose: '10 分', detail: '走跑回收後記一下今天補給和疲勞感，方便下次微調。' }
        ]
      },
      {
        task: `長跑 ${km} km（後段漸進收快）`,
        pace: `前段 ${easy}/km，最後 20–25% 收至 ${tempo}/km`,
        steps: [
          { icon: '🚶', title: '熱身', dose: '5–8 分', detail: '前段完全放鬆起跑，把力氣留給後段收快。' },
          { icon: '🏃', title: '主課', dose: `${km} km`, detail: `前 75–80% 維持 ${easy}/km，最後 20–25% 逐步收到接近節奏配速 ${tempo}/km，練後段還能加速的節奏感。` },
          { icon: '🧘', title: '收操', dose: '10 分', detail: '慢走回收、補水，記錄收快段的感受供下次微調。' }
        ]
      }
    ];
  const taperIndex = goal === 'rehab' ? longVariants.length - 1 : Math.min(2, longVariants.length - 1);
  // build/peak 期讓 half / full 的長跑輪替也能排到「後段漸進收快」變體，增加長跑內容多樣性。
  const progressionEligible = (goal === 'half' || goal === 'full') && (phaseBucket === 'build' || phaseBucket === 'peak');
  const longVariant = isDeload || isTaper
    ? longVariants[taperIndex]
    : progressionEligible && rotation === 3
      ? longVariants[longVariants.length - 1]
      : longVariants[phaseBucket === 'peak' ? Math.min(1, longVariants.length - 1) : rotation % longVariants.length];
  longVariant.paceSource = easyAdaptive.source;
  return longVariant;
}

function buildSupportBlocks(kind, hasInjury, profile, weekNum = 1, daySeed = 0) {
  const rotation = (weekNum + daySeed) % 3;
  if (kind === 'strength') {
    const strengthVariants = hasInjury ? [
      {
        icon: '🏋️',
        title: '肌力 / 核心',
        type: '休息日訓練',
        dose: '20–25 分',
        detail: rotation === 0 ? '今天先做保守版，穩定和對稱比做多更重要。' : rotation === 1 ? '今天先做關節友善版，把臀腿啟動與核心撐住。' : '今天先做恢復版，不追求刺激，只把控制找回來。',
        drills: rotation === 0
          ? [
              { icon: '🌉', visual: 'bridge', name: '橋式', dose: '3×15' },
              { icon: '🦪', visual: 'clam', name: '蚌殼式', dose: '3×15' },
              { icon: '🧍', visual: 'single_balance', name: '單腳站立', dose: '3×30 秒' }
            ]
          : rotation === 1
            ? [
                { icon: '🌉', visual: 'bridge', name: '臀橋', dose: '3×12' },
                { icon: '🪵', visual: 'plank', name: '棒式', dose: '3×30 秒' },
                { icon: '🦶', visual: 'single_balance', name: '提踵', dose: '2×15' }
              ]
            : [
                { icon: '🪑', visual: 'squat', name: '椅子坐站', dose: '2×12' },
                { icon: '🦪', visual: 'clam', name: '蚌殼式', dose: '2×12 / 邊' },
                { icon: '🧍', visual: 'single_balance', name: '單腳平衡', dose: '2×30 秒 / 邊' }
              ]
      },
      {
        icon: '🧘',
        title: '活動度 / 收操',
        type: '恢復',
        dose: '10–15 分',
        detail: rotation === 2 ? '今天把足底、小腿、臀部依序放掉，恢復會比較完整。' : '把容易緊的地方先放掉，避免下一個跑課又把疲勞帶進去。',
        drills: rotation === 2
          ? [
              { icon: '🦶', visual: 'calf_foot', name: '足底放鬆', dose: '60 秒×2' },
              { icon: '🦵', visual: 'hip_flexor', name: '小腿伸展', dose: '40 秒×2' },
              { icon: '🍑', visual: 'glute_stretch', name: '臀肌伸展', dose: '40 秒×2' }
            ]
          : [
              { icon: '🦵', visual: 'hip_flexor', name: '髖屈肌', dose: '40 秒×2' },
              { icon: '🍑', visual: 'glute_stretch', name: '臀肌伸展', dose: '40 秒×2' },
              { icon: '🦶', visual: 'calf_foot', name: '足底放鬆', dose: '60 秒' }
            ]
      }
    ] : [
      {
        icon: '🏋️',
        title: GUIDE_LIBRARY.strength.courses[rotation].title,
        type: `課表指定・第 ${rotation + 1} 套`,
        dose: '25–35 分',
        detail: `${GUIDE_LIBRARY.strength.courses[rotation].caption} 今天的課表與圖解已配對，照這四項完成即可。`,
        drills: GUIDE_LIBRARY.strength.courses[rotation].drills,
        guideCourseIndex: rotation
      },
      {
        icon: '🧘',
        title: '活動度 / 收操',
        type: '恢復',
        dose: '10–15 分',
        detail: rotation === 2 ? '今天偏下肢回收，把足底和小腿的緊繃放掉。' : '這段不是可有可無，是幫你把下次訓練的恢復先做好。',
        drills: rotation === 2
          ? [
              { icon: '🦶', visual: 'calf_foot', name: '足底放鬆', dose: '60 秒×2' },
              { icon: '🦵', visual: 'hip_flexor', name: '小腿伸展', dose: '40 秒×2' },
              { icon: '🍑', visual: 'glute_stretch', name: '臀部伸展', dose: '40 秒×2' }
            ]
          : [
              { icon: '🦵', visual: 'hip_flexor', name: '腿後側', dose: '40 秒×2' },
              { icon: '🍑', visual: 'glute_stretch', name: '臀部伸展', dose: '40 秒×2' },
              { icon: '🦶', visual: 'calf_foot', name: '小腿 / 足底', dose: '60 秒' }
            ]
      }
    ];
    return strengthVariants;
  }

  return rotation === 0 ? [
    {
      icon: '🫧',
      title: '恢復日',
      type: '主動恢復',
      dose: '10–20 分',
      detail: '今天只做恢復，不再額外堆跑量，讓身體把前幾天的訓練吸收掉。',
      drills: [
        { icon: '🚶', visual: 'walk', name: '輕鬆步行', dose: '10 分' },
        { icon: '🌀', visual: 'mobility', name: '關節活動', dose: '5 分' },
        { icon: '🫧', visual: 'foam_roll', name: '滾筒放鬆', dose: '5 分' }
      ]
    }
  ] : rotation === 1 ? [
    {
      icon: '🫧',
      title: '恢復日',
      type: '主動恢復',
      dose: '10–15 分',
      detail: '今天以走路和伸展為主，不補跑，只做恢復。',
      drills: [
        { icon: '🚶', visual: 'walk', name: '輕鬆步行', dose: '8–10 分' },
        { icon: '🦵', visual: 'hip_flexor', name: '髖屈肌伸展', dose: '40 秒×2' },
        { icon: '🍑', visual: 'glute_stretch', name: '臀肌伸展', dose: '40 秒×2' }
      ]
    }
  ] : [
    {
      icon: '🫧',
      title: '恢復日',
      type: '主動恢復',
      dose: '12–18 分',
      detail: '今天偏足底與小腿回收，把下肢緊繃先降下來。',
      drills: [
        { icon: '🦶', visual: 'calf_foot', name: '足底放鬆', dose: '60 秒×2' },
        { icon: '🦵', visual: 'hip_flexor', name: '小腿伸展', dose: '40 秒×2' },
        { icon: '🌀', visual: 'mobility', name: '關節活動', dose: '5 分' }
      ]
    }
  ];
}

// 休息日居家肌力：基礎 4 招 + 依 profile.injuries 附加對應防護動作。
// 傷別對照設定表單的 pill 值（none/ankle/knee/plantar/other）。
function restDayStrengthSteps(profile) {
  const steps = [
    { icon: '🏋️', title: '深蹲或分腿蹲', dose: '3×12', detail: '雙腳與肩同寬，臀部往後坐，膝蓋對齊腳尖；體力好可改分腿蹲，前後腳蹲低再站起。' },
    { icon: '🦶', title: '單腳提踵', dose: '2×15 / 邊', detail: '單腳站立緩慢墊起腳尖再放下，強化小腿與腳踝穩定，扶牆保持平衡即可。' },
    { icon: '🪵', title: '棒式 / 側棒式', dose: '3×30 秒', detail: '核心收緊，身體維持一直線；側棒式可加強髖外側與臀中肌穩定。' },
    { icon: '🌉', title: '臀橋', dose: '3×15', detail: '躺姿屈膝，臀部夾緊往上頂，頂點停 1 秒再放下，感受臀部而非下背出力。' }
  ];
  const injuries = Array.isArray(profile?.injuries) ? profile.injuries : [];
  if (injuries.includes('knee')) {
    steps.push({ icon: '🦵', title: '臀橋 + 股四頭離心蹲', dose: '2×12', detail: '膝蓋防護重點：放慢下蹲的離心階段，加強股四頭與臀部控制，減少跑者膝壓力。' });
  }
  if (injuries.includes('plantar')) {
    steps.push({ icon: '🦶', title: '小腿離心提踵 + 足底滾筒', dose: '2×12 + 60 秒', detail: '足底筋膜防護重點：單腳緩慢下放做離心提踵，再用網球或滾筒放鬆足底。' });
  }
  if (injuries.includes('ankle')) {
    steps.push({ icon: '🧍', title: '單腳平衡踝穩定', dose: '3×30 秒 / 邊', detail: '腳踝防護重點：單腳站立訓練本體感覺與踝關節穩定，不穩可扶牆輔助。' });
  }
  return steps;
}

function buildRestDayCard(dow, dateStr, profile, today, weekNum = 1) {
  const prevState = profile.dayState[(dow + 6) % 7];
  const nextState = profile.dayState[(dow + 1) % 7];
  const betweenRuns = prevState >= 1 && nextState >= 1;
  const hasInjury = !(profile.injuries || ['none']).includes('none');
  return {
    dow,
    dateStr,
    type: 'rest',
    isToday: dateStr === today,
    status: 'upcoming',
    task: betweenRuns ? '肌力 / 核心 + 恢復' : '主動恢復 / 完全休息',
    supportBlocks: buildSupportBlocks(betweenRuns ? 'strength' : 'recovery', hasInjury, profile, weekNum, dow)
  };
}

function attachCourseGuides(steps, type) {
  const warmupIndex = ['tempo', 'interval'].includes(type) ? 1 : 0;
  const cooldownIndex = type === 'long' ? 1 : 0;
  return (steps || []).map(step => {
    if (step.title === '熱身') return { ...step, guideKind: 'warmup', guideCourseIndex: warmupIndex };
    if (step.title === '收操') return { ...step, guideKind: 'cooldown', guideCourseIndex: cooldownIndex };
    return step;
  });
}

function buildDayCard(dow, dateStr, type, km, profile, isDeload, isTaper, hasInjury, today, weekNum = 1, phaseName = 'build', focus = '', label = '') {
  const card = { dow, dateStr, type, km, isToday: dateStr === today, status: 'upcoming', isDeload, weekNum, phaseName, focus, label };
  const content = buildWorkoutContent(type, km, profile, phaseName, weekNum, isDeload, isTaper, focus, label);
  card.task = content.task;
  card.pace = content.paceSource === 'garmin' ? `${content.pace}（Garmin Z2 校正）` : content.pace;
  card.steps = attachCourseGuides(content.steps, type);

  const zones = hrZones(profile);
  card.hrTarget = type === 'easy'
    ? (focus === 'recovery' ? `HR ≤${zones.recoveryMax}` : `HR ≤${zones.easyMax}`)
    : type === 'long'
      ? `HR ≤${zones.easyMax}`
      : type === 'tempo'
        ? `HR ${zones.tempoLow}–${zones.tempoHigh}`
        : type === 'interval'
          ? `HR ${zones.intervalLow}–${zones.intervalHigh}`
          : '';
  if (hasInjury && ['tempo', 'interval'].includes(type)) {
    card.injuryNote = '傷處（左腳等）當天有任何不穩或異樣 → 本課改輕鬆跑，當週退回上一級跑量。';
  } else if (hasInjury && type === 'long') {
    card.injuryNote = '長跑距離已為傷況保護版（下修 20%）；當天有任何不穩或異樣 → 提前結束，不硬撐里程。';
  } else if (profile.cadenceCaution && type === 'long') {
    card.injuryNote = '近期步頻偏低（跨步過大），長跑當天有意識拉高步頻、縮短步幅，降低受傷風險。';
  }
  if (dateStr && isHotSeasonDate(new Date(`${dateStr}T00:00:00`)) && ['easy', 'long', 'tempo', 'interval'].includes(type)) {
    card.heatNote = type === 'tempo' || type === 'interval'
      ? '高溫期：以心率與體感為準，配速 +20–40 秒/km 屬正常；超出心率上限就降速或縮短快段。'
      : `高溫期：守心率不守配速（+20–40 秒/km 屬正常）；HR 超過 ${zones.easyMax + 5} 就走 1 分鐘再跑，長課帶水。`;
  }

  if (isDeload && type !== 'rest') {
    card.task = `${card.task} · 減量週`;
  } else if (isTaper && type !== 'rest') {
    card.task = `${card.task} · 賽前減量`;
  }
  return card;
}

function applyCourseSpacingGuard(days, profile, isDeload, isTaper, hasInjury, today, weekNum, phaseName) {
  const gapDays = (left, right) => Math.abs(Math.round((new Date(`${left.dateStr}T00:00:00`) - new Date(`${right.dateStr}T00:00:00`)) / 86400000));
  const qualityTypes = new Set(['tempo', 'interval']);
  const longDay = days.find((day) => day.type === 'long');
  let previousQuality = null;
  return days.map((day) => {
    if (!qualityTypes.has(day.type)) return day;
    const tooCloseToLong = longDay && gapDays(day, longDay) <= 1;
    const tooCloseToQuality = previousQuality && gapDays(day, previousQuality) <= 1;
    if (!tooCloseToLong && !tooCloseToQuality) {
      previousQuality = day;
      return day;
    }
    const reason = tooCloseToLong
      ? '品質課與長跑相隔不足一天，已自動改為恢復跑，保留下一次品質課的完成品質。'
      : '兩堂品質課相隔不足一天，後一堂已自動改為恢復跑，避免連續高負荷。';
    const recovery = buildDayCard(day.dow, day.dateStr, 'easy', Math.max(3, Math.round((day.km || 0) * 0.85 * 10) / 10), profile, isDeload, isTaper, hasInjury, today, weekNum, phaseName, 'recovery', '恢復保護');
    recovery.recoveryProtection = reason;
    return recovery;
  });
}

function buildWeekDays(profile, trainDows, longDow, otherDows, targetKm, isDeload, isTaper, hasInjury, weekNum, startDate, phaseName, readiness = {}) {
  const days = [];
  const weekStart = new Date(startDate);
  // 週一為每週第一天
  weekStart.setDate(startDate.getDate() + (weekNum - 1) * 7 - ((startDate.getDay() + 6) % 7));
  const numTrain = trainDows.length;
  const level = profile.fitnessLevel || 'intermediate';
  const isEarlyBeginner = level === 'beginner' && weekNum <= 4;
  let otherTypes = buildWorkoutPattern(profile, numTrain, weekNum, phaseName, isDeload, hasInjury, isEarlyBeginner, weekStart, readiness);
  if (hasInjury) {
    // 傷況保護：間歇（衝擊最大）降成節奏跑，節奏跑保留；卡片會附「當天不穩就改輕鬆跑」提醒
    otherTypes = otherTypes.map(session => session.type === 'interval'
      ? { ...session, type: 'tempo', focus: 'steady', label: '節奏跑（傷況保護版）' }
      : session);
  }

  let otherIdx = 0;
  const today = todayStr();
  let longKm = profile.dayState.includes(2)
    ? calcLongRunKm(targetKm, numTrain, profile.maxLongRunMins, profile.easyPaceSec, isTaper, profile.goal)
    : 0;
  // 傷況保護：長跑對關節/組織衝擊最大，優先降階，不只降間歇
  if (hasInjury && longKm > 0) longKm = Math.round(longKm * 0.8 * 10) / 10;

  // 休息日居家肌力：一週最多排 2 天（依序取前兩個休息日），減量週維持完全休息。
  let restStrengthCount = 0;
  for (let offset = 0; offset < 7; offset++) {
    const dow = (offset + 1) % 7; // 一、二、三、四、五、六、日
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + offset);
    const dateStr = localDateStr(date);
    if (profile.dayState[dow] === 2) {
      days.push(buildDayCard(dow, dateStr, 'long', longKm, profile, isDeload, isTaper, hasInjury, today, weekNum, phaseName));
    } else if (profile.dayState[dow] === 1) {
      const session = otherTypes[otherIdx] || { type: 'easy', focus: 'aerobic', label: '穩定有氧' };
      otherIdx += 1;
      const km = calcWorkoutKm(session.type, targetKm, profile.goal, longKm, session.focus);
      days.push(buildDayCard(dow, dateStr, session.type, km, profile, isDeload, isTaper, hasInjury, today, weekNum, phaseName, session.focus, session.label));
    } else {
      const restDay = buildRestDayCard(dow, dateStr, profile, today, weekNum);
      if (!isTaper && restStrengthCount < 2) {
        restStrengthCount += 1;
        restDay.task = '休息＋居家肌力 15–20 分';
        restDay.steps = restDayStrengthSteps(profile);
      }
      days.push(restDay);
    }
  }

  return applyCourseSpacingGuard(days, profile, isDeload, isTaper, hasInjury, today, weekNum, phaseName);
}

function buildPlan(profile) {
  const totalWeeks = calcWeeks(profile.targetDate, profile.generatedAt);
  const phases = buildPhases(profile.goal, totalWeeks);
  const rule = GOAL_RULES[profile.goal] || GOAL_RULES.half;
  const plan = [];
  const hasInjury = !(profile.injuries || ['none']).includes('none');
  // Anchor every generated week to the same saved plan date. Using a fresh
  // clock value here caused stale/corrupt saved plans to retain overlapping
  // week cards after a rebuild.
  const startDate = new Date(profile.generatedAt || Date.now());
  const longDow = profile.dayState.indexOf(2);
  const trainDows = profile.dayState.map((s, i) => (s >= 1 ? i : -1)).filter(i => i >= 0).sort((a, b) => a - b);
  const otherDows = trainDows.filter(d => d !== longDow);
  const readiness = coachPlanningReadiness(profile);
  // 新手與恢復中的跑者不應因為共用的 8 km 下限而被迫跳量。
  const configuredStartKm = Number(profile.weeklyKm) || 8;
  const minimumStartKm = profile.goal === 'rehab' ? 4 : Math.min(8, configuredStartKm);
  let baseKm = Math.min(Math.max(readiness.startKm, minimumStartKm), rule.maxWeeklyKm);
  let previousTargetKm = 0;

  phases.forEach(phase => {
    for (let wi = 0; wi < phase.weeks; wi++) {
      const weekNum = plan.length + 1;
      const weeksToRace = totalWeeks - weekNum + 1;
      const isTaper = weeksToRace <= rule.taperWeeks;
      const isDeload = !isTaper && ((weekNum % 4 === 0 && weekNum < totalWeeks) || (weekNum === 1 && readiness.forceDeload));

      let targetKm = baseKm;
      if (isDeload) targetKm = baseKm * 0.8;
      else if (isTaper) {
        if (weeksToRace === 1) targetKm = Math.max(baseKm * 0.2, 8);
        else if (weeksToRace === 2) targetKm = baseKm * 0.5;
        else targetKm = baseKm * 0.7;
      }
      targetKm = Math.min(targetKm, rule.maxWeeklyKm);
      if (previousTargetKm && !isTaper) targetKm = Math.min(targetKm, previousTargetKm * 1.1);
      targetKm = Math.round(targetKm * 10) / 10;

      plan.push({
        weekNum,
        phase: phase.name,
        phaseLabel: phase.label,
        isDeload,
        isTaper,
        targetKm,
        planningNote: weekNum === 1 && readiness.reason ? readiness.reason : '',
        days: buildWeekDays(profile, trainDows, longDow, otherDows, targetKm, isDeload, isTaper, hasInjury, weekNum, startDate, phase.name, readiness)
      });
      previousTargetKm = targetKm;

      if (!isDeload && !isTaper) {
        baseKm = Math.min(baseKm * (1 + rule.weeklyGrowth * readiness.growthMultiplier), rule.maxWeeklyKm);
      }
    }
  });

  return plan;
}

// ============================================================
// 滾動校準：每次教練資料更新，用 Garmin 實跑重排未來週
// ============================================================
// 爬升明顯的跑步，同樣心率下配速本來就會變慢，不是體能退步——
// 拿這種跑步去跟平地配速比較會誤判，校準前先濾掉。
function coachPrescriptionLocksWeek(week) {
  return coachWeekMatches(week) && coachDaysForWeek(week).length > 0;
}

function autoRecalibratePlan() {
  if (!coachReviewData?.updatedAt || !appData.profile || !Array.isArray(appData.plan) || !appData.plan.length) return null;
  // Garmin 每日同步會更新 analyticsRuns，但教練週報的 updatedAt 不一定會變。
  // 用最近實跑快照當去重鍵，才能在同一週穩定出現「課表配速外、心率仍安全」時重算未來課表；
  // 同一份快照重整頁面則不會重複加速或產生重複歷程。
  const calibrationRuns = Array.isArray(coachReviewData.analyticsRuns) && coachReviewData.analyticsRuns.length ? coachReviewData.analyticsRuns : (coachReviewData.runs || []);
  const calibrationSignature = [
    coachReviewData.syncedAt || coachReviewData.analyticsUpdatedAt || coachReviewData.updatedAt,
    ...calibrationRuns.slice(-14).map((run) => [run.activityId || '', run.date || '', run.km || '', run.qualityPace || run.pace || '', run.qualityHr || run.hr || '', run.temperatureC || ''].join(':'))
  ].join('|');
  if (appData.recalibratedFor === calibrationSignature) return null;
  const profile = appData.profile;
  const plan = appData.plan;
  const beforePlan = futurePlanSnapshot();
  const rule = GOAL_RULES[profile.goal] || GOAL_RULES.half;
  const today = todayStr();

  // 1. 跑量校準：最近完整週實跑 vs 課表目標
  const trend = Array.isArray(coachReviewData.trend) ? coachReviewData.trend.slice(-3) : [];
  const ratios = [];
  trend.forEach((entry) => {
    const week = plan.find((w) => Array.isArray(w.days) && w.days.some((d) => d.dateStr === entry.week));
    if (week && week.targetKm > 0 && entry.km > 0 && week.days[6].dateStr < today) {
      ratios.push(entry.km / week.targetKm);
    }
  });
  let volumeFactor = 1;
  if (ratios.length) {
    const avg = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    if (avg < 0.9) volumeFactor = Math.max(avg, 0.75);      // 少跑 → 未來週降，最多 -25%
    else if (avg > 1.15) volumeFactor = Math.min(avg, 1.1); // 超跑 → 小步上調，最多 +10%
  }

  const reasons = [];

  // 1b. 疲勞徵兆提前恢復週：deload 原本只按 weekNum % 4 排，週數沒到就算 Garmin
  // 已經偵測到跑量拉升過快也不會提前休息。用 autopilot 的 ramp 判斷提前插一週恢復。
  const nextWeek = plan.find((w) => w.weekNum === currentWeek + 1);
  let forcedDeload = false;
  if (nextWeek && !nextWeek.isTaper && !nextWeek.isDeload && coachReviewData.autopilot?.decision === 'deload') {
    nextWeek.isDeload = true;
    nextWeek.targetKm = Math.round(nextWeek.targetKm * 0.8 * 10) / 10;
    forcedDeload = true;
    reasons.push('Garmin 偵測近期跑量拉升過快，下週提前排入恢復週（未到原定第 4 週排程）');
  }

  // 2. 質量配速校準：最近 T 區實跑中位 vs 課表節奏配速
  let tempoDelta = 0;
  try {
    const zones = hrZones(profile);
    const qualityRuns = (typeof coachRunRecords === 'function' ? coachRunRecords() : [])
      .slice(-14)
      .filter((run) => run.hr >= zones.tempoLow - 2 && run.hr <= zones.tempoHigh + 2 && run.paceSeconds > 0 && isCalibrationSafeRun(run));
    if (qualityRuns.length >= 2) {
      const paces = qualityRuns.map((run) => heatAdjustedPaceSec(run)).sort((a, b) => a - b);
      const median = paces[Math.floor(paces.length / 2)];
      const diff = profile.tempoPaceSec - median; // 正值＝實跑比課表快
      if (diff > 8) tempoDelta = -Math.min(Math.round(diff / 2), 10);       // 穩定偏快 → 下修（半步、封頂 10 秒）
      else if (diff < -15) tempoDelta = Math.min(Math.round(-diff / 2), 15); // 穩定偏慢 → 上修
      if (tempoDelta) {
        profile.tempoPaceSec += tempoDelta;
        profile.intervalPaceSec = Math.max(profile.tempoPaceSec - 22, 180);
        reasons.push(`節奏跑配速${tempoDelta < 0 ? '提升' : '放鬆'} → ${secToPace(profile.tempoPaceSec)}/km`);
      }
    }
  } catch (err) { /* 資料不足時跳過 */ }

  // 2b. 輕鬆跑(Z2)配速校準：最近 Z2 心率區間實跑中位 vs 課表輕鬆配速
  // 同一個心率上限跑得比課表配速快，代表有氧效率真的提升了，不是硬撐（硬撐由 autoPaceCalibration() 的 RPE 邏輯處理）
  let easyDelta = 0;
  try {
    const zones = hrZones(profile);
    const easyRuns = (typeof coachRunRecords === 'function' ? coachRunRecords() : [])
      .slice(-14)
      .filter((run) => run.hr > 0 && run.hr <= zones.easyMax && run.paceSeconds > 0 && isCalibrationSafeRun(run));
    if (easyRuns.length >= 3) {
      const paces = easyRuns.map((run) => heatAdjustedPaceSec(run)).sort((a, b) => a - b);
      const median = paces[Math.floor(paces.length / 2)];
      const diff = profile.easyPaceSec - median; // 正值＝實跑比課表快
      if (diff > 10) easyDelta = -Math.min(Math.round(diff / 2), 15);        // 穩定偏快(同心率) → 下修（進步）
      else if (diff < -20) easyDelta = Math.min(Math.round(-diff / 2), 15); // 穩定偏慢 → 上修
      if (easyDelta) {
        profile.easyPaceSec += easyDelta;
        profile.easyPace = secToPace(profile.easyPaceSec);
        // VO2max 趨勢上升可以佐證「配速變快是真的變強」，不是巧合或量測誤差
        let vo2Note = '';
        if (easyDelta < 0) {
          const avg = (values) => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
          const withVo2 = (typeof coachRunRecords === 'function' ? coachRunRecords() : [])
            .filter((run) => Number(run.vo2max) > 0)
            .map((run) => Number(run.vo2max));
          if (withVo2.length >= 6) {
            const recentVo2 = avg(withVo2.slice(-3));
            const priorVo2 = avg(withVo2.slice(-6, -3));
            if (recentVo2 && priorVo2 && recentVo2 - priorVo2 >= 1) {
              vo2Note = `（VO₂ Max 同步從 ${priorVo2.toFixed(1)} 升到 ${recentVo2.toFixed(1)}，佐證是真的變強）`;
            }
          }
        }
        reasons.push(`輕鬆跑(Z2)配速${easyDelta < 0 ? '提升' : '放鬆'} → ${secToPace(profile.easyPaceSec)}/km${vo2Note}`);
      }
    }
  } catch (err) { /* 資料不足時跳過 */ }

  // 2c. 心率上限自動校正：Garmin 每筆跑步都有測到的當次最高心率，
  // 比目前設定的 maxHr 高就代表原本設定偏低——只上修，不因為「最近沒再測到更高」就往下調。
  let maxHrDelta = 0;
  try {
    const allRuns = typeof coachRunRecords === 'function' ? coachRunRecords() : [];
    const observedMaxHr = Math.round(Math.max(0, ...allRuns.map((run) => Number(run.maxHr) || 0)));
    const currentMaxHr = Number(profile.maxHr) || 0;
    if (observedMaxHr > 0 && observedMaxHr > currentMaxHr) {
      maxHrDelta = observedMaxHr - currentMaxHr;
      profile.maxHr = observedMaxHr;
      reasons.push(`心率上限依 Garmin 實測更新 → ${observedMaxHr} bpm（原設定 ${currentMaxHr || '預設值'}）`);
    }
  } catch (err) { /* 資料不足時跳過 */ }

  // 2d. 步頻風險提示：長期步頻偏低（跨步過大）是常見的受傷風險因子。
  // 步頻是軟訊號，不像心率/配速那麼確定，所以只加提醒、不直接砍跑量。
  let cadenceCautionChanged = false;
  try {
    const cadenceRuns = (typeof coachRunRecords === 'function' ? coachRunRecords() : [])
      .slice(-8)
      .filter((run) => Number(run.cadence) > 0);
    if (cadenceRuns.length >= 4) {
      const avgCadence = cadenceRuns.reduce((sum, run) => sum + Number(run.cadence), 0) / cadenceRuns.length;
      const wasCaution = !!profile.cadenceCaution;
      const isCaution = avgCadence < 168;
      profile.cadenceCaution = isCaution;
      if (isCaution !== wasCaution) {
        cadenceCautionChanged = true;
        reasons.push(isCaution
          ? `近期平均步頻 ${Math.round(avgCadence)} spm 偏低（建議 ≥170），跨步過大易增加受傷風險，長跑日課表卡片會加提醒`
          : `步頻已回到建議範圍（${Math.round(avgCadence)} spm），取消步頻提醒`);
      }
    }
  } catch (err) { /* 資料不足時跳過 */ }

  // 2e. 賽事成績回饋校準：比賽是最準的體能測驗。找最近 21 天內「以賽代訓」日的
  // 同日 Garmin 實跑，用 Riegel 換算成目標距離等效配速。明顯變快 → 整組配速上修；
  // 明顯變慢 → 只小幅放鬆節奏配速（比賽受天氣與配速策略影響大，不激進下修）。
  let raceCalibrated = false;
  try {
    const raceDay = plan.flatMap((week) => week.days || [])
      .filter((day) => day.raceReplacement === 'race' && day.dateStr < today && daysSinceDate(day.dateStr) <= 21)
      .sort((a, b) => b.dateStr.localeCompare(a.dateStr))[0];
    if (raceDay && appData.raceCalibratedFor !== raceDay.dateStr) {
      const raceRun = (typeof coachRunRecords === 'function' ? coachRunRecords() : [])
        .filter((run) => run.date === raceDay.dateStr && Number(run.km) >= 5 && run.paceSeconds > 0)
        .sort((a, b) => Number(b.km) - Number(a.km))[0];
      if (raceRun) {
        const goalDist = GOAL_DIST[profile.goal] || 10;
        const impliedRacePace = raceRun.paceSeconds * Math.pow(goalDist / Number(raceRun.km), 0.07);
        const diff = profile.racePaceSec - impliedRacePace; // 正值＝實賽比目前基準快
        if (diff > 5) {
          profile.racePaceSec = Math.round(impliedRacePace);
          profile.tempoPaceSec = profile.racePaceSec + 12;
          profile.intervalPaceSec = Math.max(profile.racePaceSec - 10, 180);
          raceCalibrated = true;
          // 賽果是比訓練中位數更強的訊號：同一輪若步驟 2 已調過節奏配速，以賽果為準，
          // 撤掉中間值的歷程訊息避免前後矛盾。
          if (tempoDelta) {
            const staleIndex = reasons.findIndex((text) => text.startsWith('節奏跑配速'));
            if (staleIndex >= 0) reasons.splice(staleIndex, 1);
            tempoDelta = 0;
          }
          reasons.push(`「${raceDay.raceName || '賽事'}」完賽 ${Number(raceRun.km).toFixed(1)} km @ ${secToPace(raceRun.paceSeconds)}/km，依實賽成績整組上修 → 比賽配速 ${secToPace(profile.racePaceSec)}、節奏 ${secToPace(profile.tempoPaceSec)}/km`);
        } else if (diff < -15 && !tempoDelta) {
          // tempoDelta 已於同輪調整時不再疊加，避免一次雙重放鬆
          const relax = Math.min(Math.round(-diff / 2), 12);
          profile.tempoPaceSec += relax;
          raceCalibrated = true;
          reasons.push(`「${raceDay.raceName || '賽事'}」成績低於目前基準（可能受天氣或配速策略影響），節奏配速先放鬆 ${relax} 秒觀察 → ${secToPace(profile.tempoPaceSec)}/km`);
        }
        appData.raceCalibratedFor = raceDay.dateStr;
      }
    }
  } catch (err) { /* 資料不足時跳過 */ }

  appData.recalibratedFor = calibrationSignature;
  if (volumeFactor === 1 && !tempoDelta && !easyDelta && !forcedDeload && !maxHrDelta && !cadenceCautionChanged && !raceCalibrated) {
    appData.lastRecalibration = null;
    saveData(appData);
    return null;
  }
  if (volumeFactor !== 1) reasons.unshift(`未來週跑量依實跑校準 → 目標量 ×${volumeFactor.toFixed(2)}`);

  // 3. 只重排未來週；過去週與本週不動（本週由教練課表覆蓋）
  const hasInjury = !profile.injuries.includes('none');
  const startDate = new Date(profile.generatedAt || Date.now());
  const longDow = profile.dayState.indexOf(2);
  const trainDows = profile.dayState.map((s, i) => (s >= 1 ? i : -1)).filter((i) => i >= 0).sort((a, b) => a - b);
  const otherDows = trainDows.filter((d) => d !== longDow);
  let coachLockedWeeks = 0;
  plan.forEach((week) => {
    if (week.weekNum <= currentWeek) return;
    if (coachPrescriptionLocksWeek(week)) {
      coachLockedWeeks += 1;
      return;
    }
    const newTarget = Math.min(Math.round(week.targetKm * volumeFactor * 10) / 10, rule.maxWeeklyKm);
    week.targetKm = newTarget;
    // 保留已套用的賽事整合（raceReplacement）與完成狀態，避免每次校準都把「以賽代訓」洗掉、重新觸發通知
    const preserved = week.days.filter((day) => day.raceReplacementBase || day.status === 'done' || day.status === 'missed' || day.isMakeup);
    const newDays = buildWeekDays(profile, trainDows, longDow, otherDows, newTarget, week.isDeload, week.isTaper, hasInjury, week.weekNum, startDate, week.phase);
    newDays.forEach((day) => {
      const old = preserved.find((item) => item.dateStr === day.dateStr);
      if (old) Object.assign(day, old);
    });
    week.days = newDays;
  });
  if (coachLockedWeeks) reasons.push(`${coachLockedWeeks} 個教練明確處方週維持原樣；自動校準只套用在未鎖定的後續課表`);
  const summary = { date: today, volumePct: Math.round(volumeFactor * 100), tempoDelta, easyDelta, forcedDeload, maxHrDelta, cadenceCautionChanged, raceCalibrated, reasons };
  appData.lastRecalibration = summary;
  recordPlanChange(beforePlan, 'garmin', 'Garmin 實跑自動校準');
  saveData(appData);
  return summary;
}

// ============================================================
// PHASE 4：體能推估 + 目標週期銜接
// ============================================================
// 用目前已校準的比賽配速反推完賽時間；racePaceSec 本身就是 Garmin/賽事回饋
// 持續校準過的「目前體能」估值，不需要另外重新建模。
function fitnessProjection(profile = appData.profile) {
  if (!profile || !profile.racePaceSec) return null;
  const goalDist = GOAL_DIST[profile.goal] || 10;
  const predictedFinishSec = Math.round(profile.racePaceSec * goalDist);
  const predictedPace = profile.racePaceSec;
  let trendNote = '';
  let potentialNote = '';
  let deltaNote = '';
  try {
    const zones = hrZones(profile);
    const easyRuns = (typeof coachRunRecords === 'function' ? coachRunRecords() : [])
      .filter((run) => run.hr > 0 && run.hr <= zones.easyMax && run.paceSeconds > 0 && isCalibrationSafeRun(run))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (easyRuns.length >= 6) {
      const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
      const recentPaces = easyRuns.slice(-5).map(heatAdjustedPaceSec);
      // 只跟「緊接在前的 5 筆」比，不摻更早的歷史，趨勢才反映近期變化
      const priorPaces = easyRuns.slice(-10, -5).map(heatAdjustedPaceSec);
      if (priorPaces.length) {
        const diff = median(priorPaces) - median(recentPaces); // 正值＝變快
        if (diff >= 5) {
          trendNote = `近期輕鬆跑(Z2)等效配速比先前快 ${Math.round(diff)} 秒/km，體能持續進步`;
          // 趨勢換算成完賽時間潛力：Z2 進步約半數可轉移到比賽配速（保守估）
          const potentialMin = Math.round((diff * 0.5 * goalDist) / 60);
          if (potentialMin >= 1) potentialNote = `若趨勢延續，完賽時間有機會再快約 ${potentialMin} 分`;
        }
        else if (diff <= -5) trendNote = `近期輕鬆跑(Z2)等效配速比先前慢 ${Math.round(-diff)} 秒/km，留意恢復與量能`;
        else trendNote = '近期體能與先前相比大致持平';
      }
    }
    const withVo2 = (typeof coachRunRecords === 'function' ? coachRunRecords() : []).filter((run) => Number(run.vo2max) > 0).map((run) => Number(run.vo2max));
    if (withVo2.length >= 6) {
      const avg = (values) => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
      const recentVo2 = avg(withVo2.slice(-3));
      const priorVo2 = avg(withVo2.slice(-6, -3));
      if (recentVo2 && priorVo2 && Math.abs(recentVo2 - priorVo2) >= 0.5) {
        deltaNote = `VO₂ Max ${priorVo2.toFixed(1)} → ${recentVo2.toFixed(1)}`;
      }
    }
  } catch (err) { /* 資料不足時跳過趨勢 */ }
  return { predictedFinishSec, predictedPace, trendNote, deltaNote, potentialNote };
}

function renderFitnessProjectionCard() {
  const projection = fitnessProjection();
  if (!projection) return '';
  const goalLabel = GOAL_NAME[appData.profile?.goal] || '目標賽事';
  return `<div class="card"><div class="card-title">🔮 預估完賽 ${secToTime(projection.predictedFinishSec)} ・ 依目前體能</div>
    <p style="margin:0 0 6px;color:var(--c-text-muted)">依目前配速基準推算 ${reviewEscape(goalLabel)} 完賽時間約 <b style="color:var(--c-text)">${secToTime(projection.predictedFinishSec)}</b>（均速 ${secToPace(projection.predictedPace)}/km）。</p>
    ${projection.trendNote ? `<p style="margin:0;color:var(--c-text-muted)">${reviewEscape(projection.trendNote)}${projection.deltaNote ? `（${reviewEscape(projection.deltaNote)}）` : ''}</p>` : ''}
    ${projection.potentialNote ? `<p style="margin:6px 0 0;color:var(--c-text-muted)">📈 ${reviewEscape(projection.potentialNote)}</p>` : ''}
  </div>`;
}

// 目標賽事日期已過：對照 Garmin 實跑（同日、或最近的「以賽代訓」日）判斷達標與否，
// 提出下一輪循環方向。找不到對應實跑時只給維持模式建議，不亂猜結果。
function goalCycleProposal(profile = appData.profile) {
  if (!profile || !profile.targetDate) return null;
  const daysUntil = daysUntilTargetDate(profile.targetDate);
  if (daysUntil === null || daysUntil >= 0) return null;
  const runs = typeof coachRunRecords === 'function' ? coachRunRecords() : [];
  const largest = (list) => [...list].sort((a, b) => (Number(b.km) || 0) - (Number(a.km) || 0))[0] || null;
  let raceRun = largest(runs.filter((run) => run.date === profile.targetDate));
  let raceDayUsed = profile.targetDate;
  if (!raceRun) {
    const targetTime = new Date(`${profile.targetDate}T00:00:00`).getTime();
    const raceDay = (appData.plan || []).flatMap((week) => week.days || [])
      .filter((day) => day.raceReplacement === 'race' && Math.abs((new Date(`${day.dateStr}T00:00:00`).getTime() - targetTime) / 86400000) <= 3)
      .sort((a, b) => Math.abs(new Date(`${a.dateStr}T00:00:00`).getTime() - targetTime) - Math.abs(new Date(`${b.dateStr}T00:00:00`).getTime() - targetTime))[0];
    if (raceDay) {
      raceRun = largest(runs.filter((run) => run.date === raceDay.dateStr));
      raceDayUsed = raceDay.dateStr;
    }
  }
  if (!raceRun || !(Number(raceRun.km) > 0) || !raceRun.paceSeconds) {
    return {
      mode: 'maintain',
      title: '維持模式',
      summary: `目標賽事日期（${profile.targetDate}）已過，但尚未在 Garmin 資料中找到對應的比賽紀錄。`,
      causes: [],
      suggestion: '建議每週維持目前跑量的 70–80%，保留一堂輕鬆長跑，確認實際比賽結果或設定下一個目標後再重新規劃課表。'
    };
  }
  const goalDist = GOAL_DIST[profile.goal] || 10;
  const goalLabel = GOAL_NAME[profile.goal] || '目標賽事';
  const impliedRacePaceSec = raceRun.paceSeconds * Math.pow(goalDist / Number(raceRun.km), 0.07);
  const targetFinishSec = Math.round((profile.racePaceSec || impliedRacePaceSec) * goalDist);
  const actualFinishSec = Math.round(impliedRacePaceSec * goalDist);
  const diff = targetFinishSec - actualFinishSec; // 正值＝實際比目標快
  const verdict = diff > 60 ? '超越' : diff >= 0 ? '達標' : '未達';
  const summary = `「${raceDayUsed}」實賽 ${Number(raceRun.km).toFixed(1)} km @ ${secToPace(raceRun.paceSeconds)}/km，換算${reviewEscape(goalLabel)}等效完賽約 ${secToTime(actualFinishSec)}（目標 ${secToTime(targetFinishSec)}）。`;
  if (verdict === '未達') {
    const causes = [];
    const completion = trainingCompletionSummary();
    if (completion.adherence < 80) causes.push(`訓練完成率僅 ${completion.adherence}%，訓練量未完全落實`);
    if (isHotSeasonDate(new Date(`${raceDayUsed}T00:00:00`))) causes.push('比賽日落在夏季高溫月份，體感配速容易被氣溫拖慢');
    const longRunThreshold = (GOAL_RULES[profile.goal] || GOAL_RULES.half).longRunCapKm * 0.6;
    const longRunCount = runs.filter((run) => Number(run.km) >= longRunThreshold).length;
    if (longRunCount < 4) causes.push(`長跑訓練次數偏少（僅 ${longRunCount} 次達長跑距離門檻），耐力儲備可能不足`);
    return { mode: 'review', verdict, title: '檢討循環', summary, causes: causes.slice(0, 3), suggestion: '先檢討本輪訓練，抓出主要落差原因，再重新排定下一輪課表。' };
  }
  return { mode: 'progress', verdict, title: '進步循環', summary, causes: [], suggestion: `目標配速已依實賽成績上修，建議重新排課並選定下一場目標賽事，延續這輪的${verdict === '超越' ? '突破' : '進步'}。` };
}

function renderGoalCycleCard() {
  const proposal = goalCycleProposal();
  if (!proposal) return '';
  const icon = proposal.mode === 'progress' ? '📈' : proposal.mode === 'review' ? '🔁' : '⏸️';
  const causesHtml = proposal.causes?.length ? `<ul style="margin:8px 0 0;padding-left:18px;color:var(--c-text-muted)">${proposal.causes.map((cause) => `<li>${reviewEscape(cause)}</li>`).join('')}</ul>` : '';
  return `<div class="card"><div class="card-title">${icon} 目標週期 · ${reviewEscape(proposal.title)}</div>
    <p style="margin:0 0 6px;color:var(--c-text-muted)">${reviewEscape(proposal.summary)}</p>
    ${causesHtml}
    <p style="margin:8px 0 0">${reviewEscape(proposal.suggestion)}</p>
    <div class="training-status-actions" style="margin-top:12px"><button class="btn btn-primary" onclick="editSetup()">重新規劃下一輪課表</button></div>
  </div>`;
}

// 設定更新走「調整」而非「砍掉重建」：沿用原計畫起點（週次與進度延續）、
// 凍結今天以前的歷史課表、保留完成／跳過／補跑／賽事整合標記，只用新設定重排未來的課。
function updatePlanInPlace(profile) {
  const oldPlan = appData.plan;
  const oldProfile = appData.profile || {};
  profile.generatedAt = oldProfile.generatedAt || profile.generatedAt;
  const before = futurePlanSnapshot();
  const newPlan = buildPlan(profile);
  const today = todayStr();
  const oldByDate = new Map(oldPlan.flatMap((week) => week.days || []).map((day) => [day.dateStr, day]));
  newPlan.forEach((week) => {
    (week.days || []).forEach((day, index) => {
      const old = oldByDate.get(day.dateStr);
      if (!old) return;
      if (day.dateStr < today) week.days[index] = old;
      else if (old.raceReplacementBase || old.status === 'done' || old.status === 'missed' || old.isMakeup) Object.assign(day, old);
    });
  });
  appData.profile = profile;
  appData.plan = newPlan;
  recordPlanChange(before, 'settings', '訓練設定更新，未執行課表已重排');
}

function generateAndShowPlan() {
  const hasExistingPlan = Boolean(appData.plan && appData.plan.length > 0);
  const profile = {
    goal: formState.goal,
    targetDate: document.getElementById('f-date').value,
    targetTime: document.getElementById('f-target-time').value,
    dayState: [...formState.dayState],
    maxLongRunMins: parseInt(document.getElementById('f-long-max').value, 10),
    weeklyKm: parseFloat(document.getElementById('f-weekly-km').value) || 0,
    easyPace: document.getElementById('f-easy-pace').value,
    heightCm: parseFloat(document.getElementById('f-height')?.value) || 0,
    weightKg: parseFloat(document.getElementById('f-weight')?.value) || 0,
    maxHr: parseInt(document.getElementById('f-max-hr')?.value, 10) || 0,
    garminCompletionPct: Number(document.getElementById('f-garmin-completion')?.value) || 60,
    recentResult: document.getElementById('f-recent').value,
    injuries: [...formState.injuries],
    coachSync: {
      frequency: document.getElementById('f-coach-sync').value,
      time: document.getElementById('f-coach-time').value,
      day: parseInt(document.getElementById('f-coach-day').value, 10)
    },
    historyContext: appData.nextCycleCoachContext || appData.profile?.historyContext || null,
    generatedAt: new Date().toISOString()
  };
  const validationErrors = trainingProfileValidationErrors(profile);
  if (validationErrors.length) {
    showModal('先確認訓練設定', `<p style="margin:0 0 10px;line-height:1.65">為避免不完整或不合理的資料直接進入課表，請先修正以下項目：</p><ul style="margin:0;padding-left:20px;line-height:1.8">${validationErrors.map((error) => `<li>${reviewEscape(error)}</li>`).join('')}</ul>`, [
      { label: '返回設定', primary: true, action: closeModal }
    ]);
    return;
  }
  const dist = GOAL_DIST[profile.goal];
  const timeSec = targetTimeToSec(profile.targetTime, dist);
  profile.racePaceSec = timeSec / dist;
  profile.tempoPaceSec = profile.racePaceSec + 12;
  profile.intervalPaceSec = Math.max(profile.racePaceSec - 10, 180);
  profile.easyPaceSec = timeToSec(profile.easyPace);
  profile.fitnessLevel = fitnessLevel(profile);
  profile.planVersion = PLAN_SCHEMA_VERSION;
  adjustPaceByRecentResult(profile);

  if (hasExistingPlan) {
    const futureCourses = appData.plan.flatMap((week) => week.days || []).filter((day) => day.dateStr >= todayStr() && day.type !== 'rest' && day.status !== 'done' && day.status !== 'missed').length;
    showModal('預覽訓練設定更新', `<p style="margin:0 0 10px;line-height:1.7">這次會依新設定重排 <b>${futureCourses} 堂尚未執行的課程</b>；過去課表、完成／跳過紀錄、補跑與已整合的賽事都會保留。</p><p style="margin:0;color:var(--c-text-muted);line-height:1.65">新目標：${reviewEscape(cycleGoalName(profile.goal))} · 目標日 ${reviewEscape(profile.targetDate || '未設定')}。確認後可在教練建議的「課表變更紀錄」查看前後差異。</p>`, [
      { label: '套用並重排未來課表', primary: true, action: () => applyGeneratedPlan(profile, true) },
      { label: '返回設定', action: closeModal }
    ]);
    return;
  }
  applyGeneratedPlan(profile, false);
}

function applyGeneratedPlan(profile, hasExistingPlan) {
  if (hasExistingPlan) closeModal();
  if (hasExistingPlan) {
    updatePlanInPlace(profile);
  } else {
    appData.profile = profile;
    appData.plan = buildPlan(profile);
  }
  appData.log = appData.log || [];
  appData.checkins = appData.checkins || [];
  appData.assessments = appData.assessments || [];
  appData.adaptationPrompts = {};
  appData.nextCycleDraft = null;
  appData.nextCycleCoachContext = null;
  // 設定變了，舊的教練資料快取不該再拿來擋下一次滾動校準
  appData.recalibratedFor = null;
  appData.lastRecalibration = null;
  saveData(appData);
  renderPlanView();
  showView('plan');
}

function confirmRestartTrainingCycle() {
  const archive = archiveCurrentCycle('restart');
  if (!archive) return;
  showModal('結束本輪並建立新週期', `<p style="margin:0 0 10px;line-height:1.7">目前的 <b>${reviewEscape(archive.title)}</b> 會完整封存：課表、完成／跳過、手動紀錄、週評估與檢測都會保留。</p><p style="margin:0;color:var(--c-text-muted);line-height:1.65">新週期會帶入精煉教練摘要，但不會自動覆寫你的新設定；這不是刪除操作。</p>`, [
    { label: '封存本輪並進入新設定', primary: true, action: restartTrainingCycle },
    { label: '取消', action: closeModal }
  ]);
}

function restartTrainingCycle() {
  const archive = archiveCurrentCycle('restart');
  if (!archive) return;
  const previousHistory = normalizeCycleHistory([...(appData.cycleHistory || []), archive]);
  const draft = { ...archive.profile, targetDate: '', targetTime: '', recentResult: '', generatedAt: '' };
  appData = {
    ...createEmptyData(),
    cycleHistory: previousHistory,
    nextCycleDraft: draft,
    nextCycleCoachContext: archive.coachSummary,
    lastBackupAt: appData.lastBackupAt
  };
  saveData(appData);
  closeModal();
  renderSetupView();
  showView('setup');
}

// ============================================================
// PLAN VIEW
// ============================================================
let currentWeek = 1;
let coachReviewData = null;
let coachReviewLoadState = 'loading';
let registrationRaceData = null;
let registrationRaceLoadState = 'idle';

function renderPlanView() {
  const el = document.getElementById('view-plan');
  const profile = appData.profile;
  const plan = appData.plan || [];
  if (!profile || !plan.length) {
    renderHeroPanel();
    showView('setup');
    return;
  }
  const daysSinceGen = Math.floor((new Date() - new Date(profile.generatedAt)) / 86400000);
  currentWeek = Math.min(Math.max(1, Math.floor(daysSinceGen / 7) + 1), plan.length);
  const garminActivitySyncControl = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    ? `<div class="garmin-activity-sync-control" data-local-only="garmin-activity-sync">
      <button class="btn btn-secondary" id="garmin-activity-sync-button" type="button" onclick="startGarminActivitySync()">⌚ 讀取 Garmin 實跑</button>
      <span id="garmin-activity-sync-status" role="status" aria-live="polite">讀取同步狀態中…</span>
    </div>`
    : '';
  renderHeroPanel();
  el.innerHTML = `
<nav class="plan-toolbar" aria-label="訓練工作區導覽">
  <div class="plan-tab-list" role="tablist" aria-label="訓練功能">
    <button id="plan-tab-button-week" class="tab active" role="tab" aria-controls="plan-tab-week" aria-selected="true" tabindex="0" onclick="switchPlanTab('week')">本週課表</button>
    <button id="plan-tab-button-coach" class="tab" role="tab" aria-controls="plan-tab-coach" aria-selected="false" tabindex="-1" onclick="switchPlanTab('coach')">教練建議</button>
    <button id="plan-tab-button-checkin" class="tab" role="tab" aria-controls="plan-tab-checkin" aria-selected="false" tabindex="-1" onclick="switchPlanTab('checkin')">週評估</button>
    <button id="plan-tab-button-progress" class="tab" role="tab" aria-controls="plan-tab-progress" aria-selected="false" tabindex="-1" onclick="switchPlanTab('progress')">進度與分析</button>
  </div>
  <div class="plan-workspace-tools" aria-label="訓練管理工具">
    ${garminActivitySyncControl}
    <button class="btn btn-secondary" onclick="openCycleManagement()">🗂 週期管理</button>
    <button class="btn btn-secondary" onclick="editSetup()">⚙️ 修改設定</button>
  </div>
</nav>
<div id="plan-tab-week" class="container" role="tabpanel" aria-labelledby="plan-tab-button-week">
  ${renderSafetyHoldCard()}
  ${renderWeekOverviewCard(profile, plan)}
  ${renderRaceWeekCard(profile)}
  ${renderPhaseTabs(plan)}
  ${renderWeekSection(plan)}
</div>
<div id="plan-tab-coach" class="container" role="tabpanel" aria-labelledby="plan-tab-button-coach" style="display:none">
  <div id="coach-review-content">${renderCoachReviewPanel()}</div>
</div>
<div id="plan-tab-checkin" class="container" role="tabpanel" aria-labelledby="plan-tab-button-checkin" style="display:none">
  ${renderCheckinSection()}
</div>
<div id="plan-tab-progress" class="container" role="tabpanel" aria-labelledby="plan-tab-button-progress" style="display:none">
  ${renderProgressHub(profile, plan)}
</div>
`;
  window.loadCoachReview?.();
  loadGarminActivitySyncStatus();
}

function switchPlanTab(tab) {
  const tabs = ['week', 'coach', 'checkin', 'progress'];
  if (!tabs.includes(tab)) tab = 'week';
  tabs.forEach((name, index) => {
    const section = document.getElementById(`plan-tab-${name}`);
    if (section) section.style.display = name === tab ? 'block' : 'none';
    const btn = document.querySelectorAll('.plan-toolbar .tab')[index];
    if (btn) {
      btn.classList.toggle('active', name === tab);
      btn.setAttribute('aria-selected', String(name === tab));
      btn.tabIndex = name === tab ? 0 : -1;
    }
  });
  saveUiState({ planTab: tab });
}

function editSetup() {
  const tabs = ['week', 'coach', 'checkin', 'progress'];
  const activeIndex = [...document.querySelectorAll('.plan-toolbar .tab')].findIndex(btn => btn.classList.contains('active'));
  setupReturnTab = tabs[Math.max(0, activeIndex)] || 'week';
  renderSetupView();
  showView('setup');
}

function returnToPlan() {
  renderPlanView();
  showView('plan');
  switchPlanTab(setupReturnTab || 'week');
}

function renderRaceWeekCard(profile) {
  const daysToRace = daysUntilTargetDate(profile?.targetDate);
  if (daysToRace === null || daysToRace < 0 || daysToRace > 7) return '';
  const goal = profile.goal || 'half';
  const pace = profile.racePaceSec || 0;
  const p = (offset) => pace ? `${secToPace(pace + offset)}/km` : '目標配速';
  const pacingByGoal = {
    '5k10k': [
      ['起跑–2K', `${p(5)}，壓住不衝`, '前段被人群帶快是最常見的爆掉原因。'],
      ['中段', `${p(0)} 穩住`, '呼吸急但可控；專注跟自己的節奏。'],
      ['最後 1–2K', '看狀態放', '還有餘力再加速，沒有就守住。']
    ],
    half: [
      ['0–5K', `${p(5)}，刻意偏慢`, '感覺「太輕鬆」才是對的，存後半的腿。'],
      ['5–16K', `${p(0)} 巡航`, '鎖定目標配速，逢站補水，專心維持節奏。'],
      ['16–21K', `守住 ${p(0)}，行有餘力再收快`, '最後 5K 靠的是前面存下來的，不是意志力。']
    ],
    full: [
      ['0–10K', `${p(10)}，比目標慢 10 秒`, '全馬前 10K 的任何激進都會在 32K 後加倍奉還。'],
      ['10–32K', `${p(0)} 巡航`, '固定節奏、固定補給，把注意力放在姿勢與補水。'],
      ['32–42K', '能守就守，掉速不慌', '撞牆時改小步幅高步頻，逢站走站補給再啟動。']
    ],
    rehab: [
      ['全程', '無配速目標', '完賽即勝利；任何不適立即降速或走，不硬撐。']
    ]
  };
  const fuelingByGoal = {
    '5k10k': '起跑前 90 分鐘吃完早餐；10K 中段逢水站喝一兩口即可，不需要 gel。',
    half: '起跑前 2 小時吃完早餐；約 40–50 分鐘吃第一包 gel、之後每 40 分鐘一包，每站補水兩三口。',
    full: '起跑前 2.5–3 小時吃完早餐；45 分鐘起每 40–45 分鐘一包 gel（共 4–6 包），水與運動飲料交替，後段可加鹽錠。',
    rehab: '照長跑練習時的補給習慣執行，不做任何新嘗試。'
  };
  const pacing = pacingByGoal[goal] || pacingByGoal.half;
  return `
<div class="card race-week-card">
  <div class="race-week-head">
    <div>
      <div class="plan-overview-kicker">Race Week</div>
      <h2 class="plan-overview-title">🏁 比賽週手冊 · 還有 ${daysToRace === 0 ? '0 天，就是今天' : `${daysToRace} 天`}</h2>
    </div>
    <div class="plan-overview-meta">${profile.targetDate} · 目標 ${profile.targetTime || '完賽'}</div>
  </div>
  <div class="race-week-grid">
    <section>
      <b>📐 分段配速策略</b>
      ${pacing.map(([seg, paceText, note]) => `<div class="race-week-item"><span class="race-week-seg">${seg}</span><strong>${paceText}</strong><p>${note}</p></div>`).join('')}
    </section>
    <section>
      <b>⛽ 補給計畫</b>
      <p class="race-week-copy">${fuelingByGoal[goal] || fuelingByGoal.half}</p>
      <b style="display:block;margin-top:12px">🛏 賽前 3 天</b>
      <ul class="race-week-list">
        <li>睡眠優先，賽前兩晚睡好比前一晚更重要</li>
        <li>碳水比例拉高、總量不暴增；不吃沒吃過的東西</li>
        <li>不做新嘗試：鞋、襪、補給、衣著全用練過的</li>
        <li>腿癢想跑就 20–30 分鐘很輕鬆的跑，不做品質課</li>
      </ul>
      <b style="display:block;margin-top:12px">🌅 比賽日早上</b>
      <ul class="race-week-list">
        <li>起跑前 2–3 小時起床，吃熟悉的早餐</li>
        <li>提早到場：寄物、廁所、15 分鐘動態熱身</li>
        <li>起跑區站對配速區間，前 1K 寧慢勿快</li>
      </ul>
    </section>
  </div>
</div>`;
}

function garminAutopilotDays(plan, activityIndex) {
  const today = todayStr();
  const todayDay = (plan || []).flatMap((week) => week.days || []).find((day) => day.dateStr === today);
  const todayCompleted = activityCompletesDay(todayDay, activityForDate(activityIndex, today));
  const start = new Date(`${today}T00:00:00`);
  if (todayCompleted) start.setDate(start.getDate() + 1);
  const startDate = localDateStr(start);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const endDate = localDateStr(end);
  return (plan || []).flatMap((week) => week.days || [])
    .filter((day) => day.dateStr >= startDate && day.dateStr <= endDate)
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
}

function renderGarminAutopilotCard(profile, plan) {
  const autopilot = coachReviewData?.autopilot;
  if (!autopilot) return '';
  const completion = trainingCompletionSummary(plan);
  const today = todayStr();
  const todayRun = activityForDate(completion.activityByDate, today);
  const todayDay = completion.planDayByDate.get(today);
  const todayCompleted = activityCompletesDay(todayDay, todayRun);
  const rollingDays = garminAutopilotDays(plan, completion.activityByDate);
  const metrics = autopilot.metrics || {};
  const decisionLabel = autopilot.label || '資料判讀中';
  const volumeFactor = Number(autopilot.volumeFactor) || 1;
  const plannedFactor = rollingDays.some((day) => day.isTaper) ? 1 : volumeFactor;
  const factorText = plannedFactor === 1 ? '維持原量' : `${plannedFactor > 1 ? '+' : ''}${Math.round((plannedFactor - 1) * 100)}%`;
  const familyLabel = { easy: '輕鬆跑', steady: '穩定跑', interval: '間歇', strides: '加速跑' }[metrics.comparisonFamily] || '主課';
  const qualityMetric = metrics.recentPace
    ? `${formatPaceSeconds(metrics.recentPace)}${metrics.paceDeltaSeconds !== null && metrics.paceDeltaSeconds !== undefined ? ` · ${metrics.paceDeltaSeconds > 0 ? '+' : ''}${metrics.paceDeltaSeconds}s` : ''}${metrics.recentHr ? ` · HR ${Math.round(metrics.recentHr)}` : ''}`
    : `${familyLabel}趨勢待建立：已累積 ${metrics.qualityComparisonSampleSize || 0}/2 筆同課型主課（完成兩筆即可比較）`;
  const menu = rollingDays.map((day) => {
    const isRest = day.type === 'rest';
    const dropQuality = ['tempo', 'interval'].includes(day.type) && autopilot.qualityMode === 'skip';
    const reducedQuality = ['tempo', 'interval'].includes(day.type) && autopilot.qualityMode === 'reduce';
    const adjustedKm = isRest ? null : Math.max(1, Math.round((Number(day.km) || 0) * plannedFactor * 10) / 10);
    const title = isRest
      ? (day.task || '恢復 / 休息')
      : dropQuality
      ? '恢復跑（自動取代品質課）'
      : `${trainingTypeLabel(day.type, day.focus)}${reducedQuality ? '（保守版）' : ''}`;
    const detail = isRest
      ? (day.supportBlocks || []).map((block) => block.title).join('・') || '把恢復留給下一次跑課。'
      : dropQuality
      ? '保留跑步頻率，取消強度刺激。'
      : day.task || day.pace || '依課表完成';
    const intensity = isRest
      ? '強度：恢復為主，不補跑。'
      : dropQuality
        ? '強度：Z2 輕鬆可對話；心率不超過輕鬆跑區間。'
        : reducedQuality
          ? `強度：原課表配速慢 10–15 秒 / km；${day.hrTarget || '心率守住原區間上緣以下。'}`
          : `強度：${[day.pace, day.hrTarget].filter(Boolean).join(' · ') || '依呼吸與可對話感受完成。'}`;
    return { day, adjustedKm, title, detail, intensity };
  });
  const readiness = autopilot.status === 'ready';
  return `
<section class="autopilot-card" aria-label="Garmin 自動駕駛輔助課表">
  <div class="autopilot-head">
    <div><div class="autopilot-kicker">Garmin Autopilot</div><h2 class="autopilot-title">⌚ 接下來 7 天輔助菜單</h2></div>
    <span class="autopilot-status">${reviewEscape(decisionLabel)}</span>
  </div>
  <p class="autopilot-copy">${reviewEscape(autopilot.headline || 'Garmin 資料已同步；系統會依實跑狀況生成保守建議。')} ${rollingDays.some((day) => day.isTaper) ? '賽前減量週維持原課表，不再額外推進。' : ''}</p>
  <div class="autopilot-metrics">
    <div class="autopilot-metric"><span>近 14 天</span><b>${Number(metrics.recentKm || 0).toFixed(1)} km · ${metrics.recentRuns || 0} 次</b></div>
    <div class="autopilot-metric"><span>主課配速 / 心率</span><b>${qualityMetric}</b></div>
    <div class="autopilot-metric"><span>最近負荷 / 長跑</span><b>${metrics.recentLoad ? `${Math.round(metrics.recentLoad)} 負荷` : '負荷資料不足'} · ${Number(metrics.recentLongKm || 0).toFixed(1)} km</b></div>
    <div class="autopilot-metric"><span>品質課 / 本次跑量</span><b>${autopilot.qualityMode === 'skip' ? '取消品質課' : autopilot.qualityMode === 'reduce' ? '品質課降階' : '保留品質課'} · ${factorText}</b></div>
  </div>
  ${todayCompleted ? `<div class="autopilot-footer">✓ <span>今日 ${today.slice(5).replace('-', '/')} Garmin 已認列完成：${Number(todayRun.actualKm || 0).toFixed(1)} km。以下從明天開始列出 7 天輔助菜單。</span></div>` : ''}
  ${readiness && menu.length ? `<ol class="autopilot-menu">${menu.map(({ day, adjustedKm, title, detail, intensity }) => `<li><span class="autopilot-day">${DOW_NAMES[day.dow] || ''}<small>${day.dateStr.slice(5).replace('-', '/')}</small></span><span class="autopilot-main">${reviewEscape(title)}<small>${reviewEscape(detail)}</small><small class="autopilot-intensity">${reviewEscape(intensity)}</small></span><span class="autopilot-km">${adjustedKm === null ? '恢復' : `${adjustedKm.toFixed(1)} km`}</span></li>`).join('')}</ol>` : `<div class="autopilot-footer">ℹ️ <span>再累積至少 3 次 Garmin 跑步後，系統才會產生可採用的輔助菜單；目前不假裝知道你的恢復能力。</span></div>`}
  <div class="autopilot-footer">🛟 <span>${reviewEscape(autopilot.guardrail || '身體不適時優先休息或下修；這張菜單不會覆寫正式課表。')} 正式課表保持原樣，這張可直接當作輔助參考。</span></div>
</section>`;
}

function renderGarminAutopilotTab(profile, plan) {
  const content = renderGarminAutopilotCard(profile, plan);
  const health = trainingDataHealth(plan);
  const trust = `<div class="automation-timeline"><div class="automation-timeline-title">同步可信度</div><div class="automation-timeline-list"><div class="automation-timeline-item"><time>${health.syncAge === null ? '—' : health.syncAge === 0 ? '今天' : `${health.syncAge} 天前`}</time><div><b>${health.syncAge !== null && health.syncAge <= 2 ? 'Garmin 資料仍在可信範圍' : '需要確認 Garmin 同步'}</b><br>${health.issues.length ? reviewEscape(health.issues.join('；')) : '完成認列、補跑與課程對應均依同一個距離門檻自動處理。'}</div></div></div></div>`;
  return `${renderTrainingStatusCard(plan)}${renderFitnessProjectionCard()}${renderGoalCycleCard()}${trust}${content || `<div class="card"><div class="card-title">⌚ Garmin 輔助菜單</div><p style="margin:0;color:var(--c-text-muted);line-height:1.7">解鎖 Garmin 訓練資料後，這裡會依最近 14 天的跑量、配速、心率與負荷，產生接下來 7 天的輔助菜單。</p></div>`}`;
}

function renderProgressHub(profile, plan) {
  const panels = ['garmin', 'cycle', 'analysis'];
  const selected = panels.includes(loadUiState().progressPanel) ? loadUiState().progressPanel : 'garmin';
  const periodization = renderCoachPeriodizationTimeline()
    || '<div class="card"><div class="card-title">🗓️ 訓練週期總覽</div><p style="color:var(--c-text-muted);margin:0">解鎖加密週報後，這裡會顯示整個週期的階段規劃。</p></div>';
  return `<section class="runner-guide-card progress-hub-intro" aria-label="進度與分析導覽"><div class="runner-guide-kicker">Progress</div><div class="runner-guide-title">先看實跑，再看調整依據</div><p class="runner-guide-copy">每天要執行的正式課程仍以「本週課表」為準；這裡一次只展開一組資料，避免把所有分析拉成一長頁。</p></section>
  <div class="progress-hub-tabs" role="tablist" aria-label="進度分析分類">
    <button id="progress-tab-garmin" class="progress-hub-tab ${selected === 'garmin' ? 'active' : ''}" role="tab" aria-controls="progress-panel-garmin" aria-selected="${selected === 'garmin'}" tabindex="${selected === 'garmin' ? '0' : '-1'}" onclick="switchProgressPanel('garmin')">Garmin 實跑</button>
    <button id="progress-tab-cycle" class="progress-hub-tab ${selected === 'cycle' ? 'active' : ''}" role="tab" aria-controls="progress-panel-cycle" aria-selected="${selected === 'cycle'}" tabindex="${selected === 'cycle' ? '0' : '-1'}" onclick="switchProgressPanel('cycle')">訓練週期</button>
    <button id="progress-tab-analysis" class="progress-hub-tab ${selected === 'analysis' ? 'active' : ''}" role="tab" aria-controls="progress-panel-analysis" aria-selected="${selected === 'analysis'}" tabindex="${selected === 'analysis' ? '0' : '-1'}" onclick="switchProgressPanel('analysis')">趨勢分析</button>
  </div>
  <div id="progress-panel-garmin" class="progress-hub-panel" role="tabpanel" aria-labelledby="progress-tab-garmin" ${selected === 'garmin' ? '' : 'hidden'}>${renderGarminAutopilotTab(profile, plan)}</div>
  <div id="progress-panel-cycle" class="progress-hub-panel" role="tabpanel" aria-labelledby="progress-tab-cycle" ${selected === 'cycle' ? '' : 'hidden'}>${periodization}</div>
  <div id="progress-panel-analysis" class="progress-hub-panel" role="tabpanel" aria-labelledby="progress-tab-analysis" ${selected === 'analysis' ? '' : 'hidden'}>${renderTrainingAnalysis()}</div>`;
}

function switchProgressPanel(panel) {
  const panels = ['garmin', 'cycle', 'analysis'];
  if (!panels.includes(panel)) return;
  panels.forEach((name) => {
    const host = document.getElementById(`progress-panel-${name}`);
    if (host) host.hidden = name !== panel;
    const button = document.querySelector(`.progress-hub-tab[onclick="switchProgressPanel('${name}')"]`);
    if (button) {
      button.classList.toggle('active', name === panel);
      button.setAttribute('aria-selected', String(name === panel));
      button.tabIndex = name === panel ? 0 : -1;
    }
  });
  saveUiState({ progressPanel: panel });
}

function garminCompletionPercent(profile = appData.profile) {
  const configured = Number(profile?.garminCompletionPct);
  return Number.isFinite(configured) && configured >= 40 && configured <= 90 ? Math.round(configured) : 60;
}

function garminCompletionRuleLabel(profile = appData.profile) {
  return `Garmin 跑量達課表 ${garminCompletionPercent(profile)}%（至少 1 km）才自動認列完成`;
}

function activityForDate(activityIndex, dateStr) {
  if (activityIndex instanceof Map) return activityIndex.get(dateStr) || null;
  return activityIndex?.has?.(dateStr) ? { actualKm: Number.POSITIVE_INFINITY, source: 'legacy' } : null;
}

function activityCompletesDay(day, activity) {
  if (!activity) return false;
  if (activity.source !== 'garmin') return true;
  const minimumKm = Math.max(1, (Number(day.km) || 0) * (garminCompletionPercent() / 100));
  return (Number(activity.actualKm) || 0) >= minimumKm;
}

function makeupCompletionCredits(planDays, activityIndex, today = todayStr()) {
  const sortedDays = [...(planDays || [])].filter((day) => day?.dateStr).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  const credits = new Map();

  // A deliberately scheduled makeup always takes priority over inferred credit.
  sortedDays.filter((day) => day.isMakeup && day.makeupOf && day.dateStr <= today && activityCompletesDay(day, activityForDate(activityIndex, day.dateStr))).forEach((day) => {
    credits.set(day.makeupOf, { makeupDate: day.dateStr, source: 'scheduled' });
  });

  // Garmin runs on a recovery day can close one recent missed session even when
  // the runner could not schedule the makeup beforehand.
  sortedDays.filter((day) => day.type === 'rest' && day.dateStr <= today && activityForDate(activityIndex, day.dateStr)).forEach((restDay) => {
    const missedDay = sortedDays.filter((day) => {
      const daysApart = Math.round((new Date(`${restDay.dateStr}T00:00:00`) - new Date(`${day.dateStr}T00:00:00`)) / 86400000);
      return day.type !== 'rest' && !day.isMakeup && day.status === 'missed' && !credits.has(day.dateStr) && daysApart >= 1 && daysApart <= 3;
    }).pop();
    if (missedDay && activityCompletesDay(missedDay, activityForDate(activityIndex, restDay.dateStr))) {
      credits.set(missedDay.dateStr, { makeupDate: restDay.dateStr, source: 'garmin-auto' });
    }
  });

  return credits;
}

function trainingCompletionSummary(plan = appData.plan || [], today = todayStr()) {
  const planDays = (plan || []).flatMap((week) => week.days || []);
  const planDayByDate = new Map(planDays.map((day) => [day.dateStr, day]));
  const garminActivity = garminActivityRecords().map((run) => ({
    date: run.date,
    actualKm: Number(run.km) || 0,
    actualTimeMins: Math.round(paceToMinutes(run.pace) * (Number(run.km) || 0)),
    source: 'garmin'
  }));
  const garminDates = new Set(garminActivity.map((entry) => entry.date));
  const allActivity = [...(appData.log || []).filter((entry) => !garminDates.has(entry.date)), ...garminActivity]
    .filter((entry) => Boolean(planDayByDate.get(entry.date) && entry.date <= today));
  const activityByDate = new Map(allActivity.map((entry) => [entry.date, entry]));
  const activityDates = new Set(activityByDate.keys());
  const makeupCredits = makeupCompletionCredits(planDays, activityByDate, today);
  const elapsedDays = planDays.filter((day) => day.type !== 'rest' && !day.isMakeup && day.dateStr <= today);
  const completedDays = elapsedDays.filter((day) => {
    const activity = activityByDate.get(day.dateStr);
    // Explicit runner confirmation is authoritative. A later short Garmin
    // activity must not turn a manually completed session back into partial.
    return day.status === 'done' || activityCompletesDay(day, activity) || makeupCredits.has(day.dateStr);
  });
  const partialDays = elapsedDays.filter((day) => {
    const activity = activityByDate.get(day.dateStr);
    return activity && day.status !== 'done' && !activityCompletesDay(day, activity) && !makeupCredits.has(day.dateStr);
  });
  const creditedMakeupDates = new Set([...makeupCredits.values()].map((credit) => credit.makeupDate));

  return {
    today,
    planDays,
    planDayByDate,
    allActivity,
    activityByDate,
    activityDates,
    makeupCredits,
    creditedMakeupDates,
    elapsedDays,
    completedDays,
    partialDays,
    elapsedSessions: elapsedDays.length,
    completedSessions: completedDays.length,
    adherence: elapsedDays.length ? Math.round((completedDays.length / elapsedDays.length) * 100) : 0,
    totalKm: allActivity.reduce((sum, entry) => sum + (entry.actualKm || 0), 0)
  };
}

function daysSinceDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((new Date(`${todayStr()}T00:00:00`) - date) / 86400000));
}

function trainingDataHealth(plan = appData.plan || []) {
  const summary = trainingCompletionSummary(plan);
  const currentWeekStart = weekStartLabel(todayStr());
  const currentWeekDays = summary.elapsedDays.filter((day) => day.dateStr >= currentWeekStart);
  const currentWeekCompleted = currentWeekDays.filter((day) => summary.completedDays.some((completed) => completed.dateStr === day.dateStr));
  const missingReasonDay = summary.elapsedDays.find((day) => day.status === 'missed' && !formatSkipReason(appData.skipReasons?.[day.dateStr]));
  const missedWithoutReason = summary.elapsedDays.filter((day) => day.status === 'missed' && !formatSkipReason(appData.skipReasons?.[day.dateStr])).length;
  const uncreditedRestRuns = summary.allActivity.filter((entry) => {
    const day = summary.planDayByDate.get(entry.date);
    // Extra runs remain in the history, but they are only actionable during
    // the current week. Do not keep an old Sunday run as a permanent alert.
    return entry.date >= currentWeekStart && day?.type === 'rest' && !summary.creditedMakeupDates.has(entry.date);
  }).length;
  const asOf = coachReviewData?.autopilot?.asOf || coachReviewData?.analyticsUpdatedAt || coachReviewData?.updatedAt;
  const syncAge = daysSinceDate(asOf);
  const issues = [];
  if (missedWithoutReason) issues.push(`${missedWithoutReason} 筆跳過尚未記錄原因`);
  if (uncreditedRestRuns) issues.push(`${uncreditedRestRuns} 筆休息日跑步未認列補跑`);
  if (syncAge !== null && syncAge > 2) issues.push(`Garmin 資料已 ${syncAge} 天未更新`);
  if (summary.partialDays.length) issues.push(`${summary.partialDays.length} 堂只有部分跑量，尚未達自動完成門檻`);
  return { summary, issues, missedWithoutReason, missingReasonDate: missingReasonDay?.dateStr || null, uncreditedRestRuns, syncAge, asOf, currentWeekDays, currentWeekCompleted };
}

function latestTrainingCheckin() {
  return [...(appData.checkins || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.weekNum || 0) - Number(a.weekNum || 0))[0] || null;
}

// ============================================================
// 當日出發前調整：模擬真人教練在課前的最後一眼。
// 高溫預報、近期疼痛/疲勞回報、昨日高強度實跑 → 自動把今天的品質課/長跑
// 降階成輕鬆課，並嘗試把原課移到本週稍後仍符合間隔的空檔（找不到就不硬塞）。
// ============================================================
function findRawPlanDay(dateStr) {
  for (const week of appData.plan || []) {
    const day = (week.days || []).find((item) => item.dateStr === dateStr);
    if (day) return { week, day };
  }
  return null;
}

function dailyAdvisoryTriggers(day) {
  const triggers = [];
  const wx = trainerWeather?.[day.dateStr];
  if (Number(wx?.tmax) >= 34) triggers.push(`預報高溫 ${Math.round(wx.tmax)}°C`);
  const checkin = latestTrainingCheckin();
  if (checkin?.date && daysSinceDate(checkin.date) <= 7) {
    if (checkin.painConcern) triggers.push('近期回報疼痛疑慮');
    else if (Number(checkin.fatigue) >= 4) triggers.push(`疲勞自評 ${checkin.fatigue}/5`);
  }
  try {
    const zones = hrZones(appData.profile);
    const yesterday = addDaysToDateStr(day.dateStr, -1);
    const hardYesterday = (typeof coachRunRecords === 'function' ? coachRunRecords() : [])
      .some((run) => run.date === yesterday && Number(run.km) >= 5 && Number(run.hr) >= zones.tempoLow);
    if (hardYesterday) triggers.push('昨天已有高強度跑，距離品質課不足 48 小時');
  } catch (err) { /* 心率區間資料不足時跳過 */ }
  return triggers;
}

// 把整堂課搬到本週稍後的輕鬆日：前後一天都不能是高強度課，目的日預報不能一樣熱。
function tryMoveSessionWithinWeek(week, fromDay, original) {
  const hardTypes = ['tempo', 'interval', 'long', 'race'];
  const days = week.days || [];
  const candidates = days.filter((item) => item.dateStr > fromDay.dateStr && item.type === 'easy'
    && !item.raceReplacement && item.status !== 'done' && !item.isMakeup);
  for (const candidate of candidates) {
    // 用全計畫找前後日，跨週交界（本週最後一天 vs 下週第一天）也能檢查強度間隔
    const prevDay = findRawPlanDay(addDaysToDateStr(candidate.dateStr, -1))?.day;
    const nextDay = findRawPlanDay(addDaysToDateStr(candidate.dateStr, 1))?.day;
    // fromDay（今天）即將被降階成輕鬆課，不算高強度鄰日
    if (prevDay && prevDay !== fromDay && hardTypes.includes(prevDay.type)) continue;
    if (nextDay && nextDay !== fromDay && hardTypes.includes(nextDay.type)) continue;
    if (Number(trainerWeather?.[candidate.dateStr]?.tmax) >= 34) continue;
    ['type', 'focus', 'km', 'task', 'pace', 'hrTarget', 'steps'].forEach((key) => { candidate[key] = original[key]; });
    candidate.movedFrom = fromDay.dateStr;
    return candidate;
  }
  return null;
}

function applyDailySessionAdvisory() {
  if (!appData?.profile || !Array.isArray(appData.plan) || !appData.plan.length) return null;
  const today = todayStr();
  // 已經調整過今天就不重複。天氣或 Garmin 教練資料是非同步載入的：
  // 同一天內，只要這次可用的資料比上次評估時多（score 變大），就允許重新評估一次，
  // 否則高溫以外的觸發（疼痛回報、昨日高強度）會因為評估時資料還沒到而永遠失效。
  if (appData.lastDailyAdvisory?.date === today) return appData.lastDailyAdvisory;
  const readinessScore = (trainerWeather ? 1 : 0) + (coachReviewData ? 2 : 0);
  const guard = appData.dailyAdvisoryGuard;
  if (guard?.date === today && Number(guard.score) >= readinessScore) return null;
  appData.dailyAdvisoryGuard = { date: today, score: readinessScore };
  const found = findRawPlanDay(today);
  appData.lastDailyAdvisory = null;
  const day = found?.day;
  const isProtectable = day && ['tempo', 'interval', 'long'].includes(day.type)
    && day.status !== 'done' && !day.raceReplacement && !day.isMakeup
    && !coachPrescriptionLocksWeek(found.week);
  if (isProtectable) {
    const triggers = dailyAdvisoryTriggers(day);
    if (triggers.length) {
      const original = { type: day.type, focus: day.focus, km: day.km, task: day.task, pace: day.pace, hrTarget: day.hrTarget, steps: day.steps };
      const originalLabel = trainingTypeLabel(day.type, day.focus);
      const easyKm = Math.max(3, Math.round((Number(day.km) || 5) * (day.type === 'long' ? 0.6 : 0.7) * 10) / 10);
      const moved = tryMoveSessionWithinWeek(found.week, day, original);
      day.type = 'easy';
      day.focus = 'recovery';
      day.km = easyKm;
      day.task = `輕鬆跑 ${easyKm} km｜出發前調整：${triggers.join('、')}`;
      day.pace = '很輕鬆、可完整對話；狀況不佳就再縮短或改休息';
      day.hrTarget = '';
      day.steps = [];
      day.advisoryAdjusted = true;
      appData.lastDailyAdvisory = { date: today, triggers, originalLabel, movedTo: moved ? moved.dateStr : null };
      recordTrainingEvent('daily-advisory', appData.lastDailyAdvisory);
    }
  }
  saveData(appData);
  return appData.lastDailyAdvisory;
}

// 找最近 60 天內同課型（type 相同、或同 focus 家族）的前一趟實跑，用熱調整配速比較才公平。
// 差距太小（<3 秒/km）視為雜訊，不特別提，避免每趟都念一次數字。
function historyComparisonNote(run, planned) {
  if (!planned) return '';
  try {
    const cutoff = addDaysToDateStr(run.date, -60);
    const prev = (typeof coachRunRecords === 'function' ? coachRunRecords() : [])
      .filter((item) => item.date && item.date < run.date && item.date >= cutoff && item.paceSeconds > 0)
      .map((item) => ({ item, itemPlanned: plannedSessionFor(item) }))
      .filter(({ itemPlanned }) => itemPlanned && (itemPlanned.type === planned.type || (planned.focus && itemPlanned.focus === planned.focus)))
      .sort((a, b) => String(b.item.date).localeCompare(String(a.item.date)))[0];
    if (!prev) return '';
    const currentPace = heatAdjustedPaceSec(run);
    const prevPace = heatAdjustedPaceSec(prev.item);
    if (!currentPace || !prevPace) return '';
    const diff = Math.round(prevPace - currentPace); // 正值＝這次比較快
    if (Math.abs(diff) < 3) return '';
    const typeLabel = trainingTypeLabel(planned.type, planned.focus);
    return `比上次同課型（${prev.item.date.slice(5).replace('-', '/')}）${diff > 0 ? '快' : '慢'} ${Math.abs(diff)} 秒/km`;
  } catch (err) {
    return '';
  }
}

// 里程碑：單次最遠、當月累積跑量新高。資料稀疏（沒有先前紀錄可比）時不誤判成新高，直接跳過。
function runMilestones(run) {
  const milestones = [];
  try {
    if (!run || !run.date || !(Number(run.km) > 0)) return milestones;
    const allRuns = typeof coachRunRecords === 'function' ? coachRunRecords() : [];
    const priorRuns = allRuns.filter((item) => item.date && item.date < run.date && Number(item.km) > 0);
    if (priorRuns.length && Number(run.km) > Math.max(...priorRuns.map((item) => Number(item.km) || 0))) {
      milestones.push(`單次最遠 ${Number(run.km).toFixed(1)} km，刷新個人紀錄`);
    }
    const runMonth = String(run.date).slice(0, 7);
    const monthTotals = new Map();
    allRuns.forEach((item) => {
      // 只累計到這筆跑步當下為止，函數重用在歷史跑步時不會被之後的里程灌水
      if (!item.date || item.date > run.date) return;
      const month = String(item.date).slice(0, 7);
      monthTotals.set(month, (monthTotals.get(month) || 0) + (Number(item.km) || 0));
    });
    const currentTotal = monthTotals.get(runMonth) || 0;
    const priorMonthTotals = [...monthTotals.entries()].filter(([month]) => month !== runMonth).map(([, km]) => km);
    if (priorMonthTotals.length && currentTotal > Math.max(...priorMonthTotals)) {
      milestones.push(`當月累積跑量 ${currentTotal.toFixed(1)} km，創單月新高`);
    }
  } catch (err) { /* 資料不足時跳過 */ }
  return milestones;
}

function postRunVerdict(run, planned = plannedSessionFor(run)) {
  const assignment = activityAssignmentFor(run);
  if (!planned || assignment?.mode === 'extra') {
    return { level: 'neutral', label: '額外跑步已保留', summary: '這趟已記入長期跑量，但不會被誤算為正式課程完成，也不會因此加量。', next: '下一堂仍照正式課表執行。' };
  }
  const targetKm = plannedMainTargetKm(planned);
  const actualKm = run.qualityEligible ? Number(run.qualityKm) || 0 : Number(run.km) || 0;
  const completionPct = targetKm ? Math.round((actualKm / targetKm) * 100) : null;
  if (completionPct !== null && completionPct < garminCompletionPercent()) {
    return { level: 'caution', label: '部分完成', summary: `主課完成 ${completionPct}%（${actualKm.toFixed(1)} / ${targetKm.toFixed(1)} km），系統保留原課表，不把缺口硬塞到下一天。`, next: '先恢復；若要補跑，系統只會在安全的 3 天內認列。' };
  }
  const milestoneNote = runMilestones(run).map((text) => `🎉 ${text}`).join('；');
  if (assignment?.mode === 'makeup') {
    return { level: 'good', label: '補跑已認列', summary: `系統已將這趟安全對應回原本漏掉的課程，不會重複計算跑量或再排一次。${milestoneNote ? ` ${milestoneNote}。` : ''}`, next: '回到原本排程，下一堂照表執行。' };
  }
  const historyNote = historyComparisonNote(run, planned);
  const baseSummary = targetKm ? `主課完成 ${completionPct ?? '—'}%，已與當日課表自動對應。` : '已與當日課表自動對應；課表沒有可量化主課距離，因此只保留完成紀錄。';
  const summary = `${baseSummary}${historyNote ? `${historyNote}。` : ''}${milestoneNote ? ` ${milestoneNote}。` : ''}`;
  return { level: 'good', label: '正式課程已完成', summary, next: '單次不會加量；若本週同課型持續比課表快、心率仍在安全範圍，系統會自動重算下一週尚未執行的配速處方。' };
}

function trainingAutopilotDecision(plan = appData.plan || []) {
  const health = trainingDataHealth(plan);
  const latestCheckin = latestTrainingCheckin();
  if (latestCheckin?.result === '停止品質課' || latestCheckin?.result === '降載恢復') {
    return { tone: 'danger', title: latestCheckin.result, reason: latestCheckin.safetyNote || latestCheckin.adjustment, next: '下週已套用保護規則；只保留恢復跑或休息，不需要再手動刪課。' };
  }
  if (health.syncAge !== null && health.syncAge > 2) {
    return { tone: 'caution', title: '等待 Garmin 資料確認', reason: `最近一次 Garmin 資料已是 ${health.syncAge} 天前。系統不會根據過期資料調整課表。`, next: '先完成正常同步；新資料回來後會自動更新完成度與跑後判讀。' };
  }
  if (health.missedWithoutReason) {
    return { tone: 'caution', title: '先釐清未完成課程', reason: `有 ${health.missedWithoutReason} 堂已過期課程沒有原因；系統暫停任何加量建議，避免把補跑誤當成加量。`, next: '只需補填一次原因，後續的補跑與下週建議會自動處理。' };
  }
  // 排在同步過期與未完成釐清之後：資料健康問題優先於例行的當日降階說明
  const advisory = appData.lastDailyAdvisory;
  if (advisory?.date === todayStr()) {
    return { tone: 'caution', title: '今天已出發前調整', reason: `原定「${advisory.originalLabel}」因${advisory.triggers.join('、')}自動降階為輕鬆跑${advisory.movedTo ? `；原課已移到 ${advisory.movedTo}（本週仍符合強度間隔）` : '；本週找不到安全空檔，原課不硬塞'}。`, next: '照調整後課表執行即可；明天出發前會重新評估。' };
  }
  const latestRun = [...garminActivityRecords()].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (latestRun && daysSinceDate(latestRun.date) <= 3) {
    const verdict = postRunVerdict(latestRun);
    return { tone: verdict.level, title: verdict.label, reason: verdict.summary, next: verdict.next };
  }
  const today = findTodayPlanDay()?.day;
  return { tone: 'good', title: today ? '今天照表執行' : '今天安排恢復', reason: today ? `${trainingTypeLabel(today.type, today.focus)} 已排定；系統會在 Garmin 資料回來後自動比對。` : '沒有正式跑課；系統不會為了湊里程臨時加課。', next: today ? '跑完先讀取 Garmin 實跑；未使用同步或資料未回來時，再用「手動補登」。' : '把睡眠、補水與恢復做好，下一個正式跑課會自動出現在這裡。' };
}

function renderAutopilotDecisionCard(plan = appData.plan || []) {
  const decision = trainingAutopilotDecision(plan);
  const icon = decision.tone === 'danger' ? '🛑' : decision.tone === 'caution' ? '🟡' : '🟢';
  return `<section class="training-status-card ${decision.tone === 'good' ? '' : 'is-attention'}" aria-label="自動訓練決策"><div><div class="training-status-kicker">自動訓練決策</div><div class="training-status-title">${icon} ${reviewEscape(decision.title)}</div><div class="training-status-copy">${reviewEscape(decision.reason)}<br><b>下一步：</b>${reviewEscape(decision.next)}</div></div></section>`;
}

function pendingGarminAssignmentReviews() {
  const earliestDate = addDaysToDateStr(todayStr(), -14);
  return garminActivityRecords().filter((run) => {
    const assignment = activityAssignmentFor(run);
    return run.date >= earliestDate && assignment?.source === 'auto' && assignment.confidence === 'medium';
  });
}

function renderTrainingStatusCard(plan = appData.plan || []) {
  const health = trainingDataHealth(plan);
  const { summary, issues, syncAge, missedWithoutReason, missingReasonDate, uncreditedRestRuns, currentWeekDays, currentWeekCompleted } = health;
  const pendingAssignmentReviews = pendingGarminAssignmentReviews();
  const reminders = [];
  if (pendingAssignmentReviews.length) reminders.push(`有 ${pendingAssignmentReviews.length} 趟 Garmin 跑步是依補跑規則低信心對應；請確認一次，避免把實跑歸到錯的課。`);
  if (uncreditedRestRuns) reminders.push(`有 ${uncreditedRestRuns} 次 Garmin 跑步還沒對應課表。目前會算進本週跑量，但不會算成完成或補跑；如果它其實是補跑，請回原本跳過的課表按「重新安排」。`);
  if (missedWithoutReason) reminders.push(`${missedWithoutReason} 個跳過課表還沒填原因；補上後，之後回顧調整才看得懂當時為什麼休息。`);
  if (summary.partialDays.length) reminders.push(`${summary.partialDays.length} 堂跑步距離還沒達到你設定的完成比例，目前先標成部分完成。`);
  if (syncAge !== null && syncAge > 2) reminders.push(`Garmin 已 ${syncAge} 天沒有新資料，先確認手錶或同步是否正常。`);
  const stateTitle = reminders.length ? `有 ${reminders.length} 件訓練事項待確認` : currentWeekDays.length ? '本週進度已更新' : '本週剛開始';
  const stateCopy = reminders.length
    ? reminders.join(' ')
    : currentWeekDays.length
      ? `本週目前完成 ${currentWeekCompleted.length}/${currentWeekDays.length} 堂。`
      : `本週還沒有到期的跑課，先照今天的正式課表即可。${syncAge === null ? '' : syncAge === 0 ? ' Garmin 今日已同步。' : ` Garmin ${syncAge} 天前同步。`}`;
  const hasInAppFix = missedWithoutReason || uncreditedRestRuns || summary.partialDays.length;
  const action = pendingAssignmentReviews[0]?.activityId
    ? `<button class="btn btn-secondary" onclick="openActivityAssignment('${pendingAssignmentReviews[0].activityId}')">確認 Garmin 對應</button>`
    : missedWithoutReason && missingReasonDate
    ? `<button class="btn btn-secondary" onclick="editSkipReason('${missingReasonDate}')">補填跳過原因</button>`
    : hasInAppFix
      ? '<button class="btn btn-secondary" onclick="showWeekPlanFromStatus()">查看本週課表</button>'
      : '';
  return `<section class="training-status-card ${issues.length ? 'is-attention' : ''}" aria-label="訓練資料狀態">
    <div><div class="training-status-kicker">本週提醒</div><div class="training-status-title">${reviewEscape(stateTitle)}</div><div class="training-status-copy">${reviewEscape(stateCopy)}</div></div>
    ${action ? `<div class="training-status-actions">${action}</div>` : ''}
  </section>`;
}

// 本週教練信：把本週完成度、最近一次自動校準／出發前調整、下週安排，
// 組成三段像真人教練寫的短文。只回傳段落內容，外框由本週總覽卡以摺疊方式呈現。
function weeklyCoachLetterBody() {
  const profile = appData.profile;
  const plan = appData.plan || [];
  if (!profile || !plan.length) return '';
  const health = trainingDataHealth(plan);
  const { currentWeekDays, currentWeekCompleted } = health;
  const weekStart = weekStartLabel(todayStr());
  const weekRuns = (typeof coachRunRecords === 'function' ? coachRunRecords() : []).filter((run) => run.date >= weekStart);

  // (a) 回顧
  let notable = '';
  const qualityRun = weekRuns
    .map((run) => ({ run, planned: plannedSessionFor(run) }))
    .filter(({ planned }) => planned && ['tempo', 'interval'].includes(planned.type))
    .sort((a, b) => String(b.run.date).localeCompare(String(a.run.date)))[0];
  if (qualityRun) {
    const label = trainingTypeLabel(qualityRun.planned.type, qualityRun.planned.focus);
    notable = `這週的${label}課完成得不錯，${qualityRun.run.date.slice(5).replace('-', '/')} 這趟配速 ${secToPace(qualityRun.run.paceSeconds)}/km。`;
  } else {
    try {
      const zones = hrZones(profile);
      const easyRuns = weekRuns.filter((run) => run.hr > 0 && run.hr <= zones.easyMax && run.paceSeconds > 0);
      if (easyRuns.length) {
        const fastest = [...easyRuns].sort((a, b) => heatAdjustedPaceSec(a) - heatAdjustedPaceSec(b))[0];
        notable = `這週最亮眼的一趟是 ${fastest.date.slice(5).replace('-', '/')} 的輕鬆跑，等效配速 ${secToPace(heatAdjustedPaceSec(fastest))}/km。`;
      }
    } catch (err) { /* 心率資料不足時跳過 */ }
  }
  const reviewPara = `本週目前完成 ${currentWeekCompleted.length}/${currentWeekDays.length || 0} 堂課。${notable || '這週還沒有足夠的實跑資料可以特別點名，先把該完成的課排好。'}`;

  // (b) 調整
  const recal = appData.lastRecalibration;
  const advisory = appData.lastDailyAdvisory?.date === todayStr() ? appData.lastDailyAdvisory : null;
  const adjustParts = [];
  if (recal?.reasons?.length) adjustParts.push(recal.reasons.slice(0, 3).join('；') + '。');
  if (advisory) adjustParts.push(`今天的「${advisory.originalLabel}」因${advisory.triggers.join('、')}臨時降階為輕鬆跑${advisory.movedTo ? `，原課已改排到 ${advisory.movedTo}` : '；本週找不到安全空檔，原課不硬塞'}。`);
  const adjustPara = adjustParts.length ? adjustParts.join(' ') : '這週沒有需要特別調整的地方，課表照原計畫執行。';

  // (c) 下週
  const nextWeek = plan.find((week) => week.weekNum === currentWeek + 1);
  let nextPara;
  if (!nextWeek) {
    nextPara = '目前計畫只排到本週為止，之後的安排等你重新設定或延長週期。';
  } else {
    const qualityDay = (nextWeek.days || []).find((day) => ['tempo', 'interval'].includes(day.type));
    const longDay = (nextWeek.days || []).find((day) => day.type === 'long');
    const specialNote = nextWeek.isTaper ? ' 下週是賽前減量週，量會刻意降下來，別想著硬撐加量。' : nextWeek.isDeload ? ' 下週安排恢復週，跑量會主動降低，好好把身體養回來。' : '';
    nextPara = `下週目標跑量約 ${nextWeek.targetKm} km${qualityDay ? `，安排一堂${trainingTypeLabel(qualityDay.type, qualityDay.focus)}` : ''}${longDay ? `，長跑約 ${longDay.km} km` : ''}。${specialNote}`;
  }

  return `<p style="margin:0 0 10px;line-height:1.7">${reviewEscape(reviewPara)}</p>
    <p style="margin:0 0 10px;line-height:1.7">${reviewEscape(adjustPara)}</p>
    <p style="margin:0;line-height:1.7">${reviewEscape(nextPara)}</p>`;
}

// 本週總覽：整併原本的 automation brief、plan pulse、教練信三張卡。
// 同一批數據（今日課、完成堂數、週跑量）原本重複出現三次，把版面拉得太長；
// 現在決策與進度各出現一次，教練信預設摺疊。
function renderWeekOverviewCard(profile, plan = appData.plan || []) {
  const health = trainingDataHealth(plan);
  const decision = trainingAutopilotDecision(plan);
  const today = findTodayPlanDay()?.day;
  const next = today || (plan.find((week) => week.weekNum === currentWeek)?.days || []).find((day) => day.dateStr > todayStr() && day.type !== 'rest');
  const course = next ? `${trainingTypeLabel(next.type, next.focus)} · ${trainingTaskTitle(next)}` : '本週先把恢復做穩';
  const syncText = health.syncAge === null ? '尚未取得' : health.syncAge === 0 ? '今天已同步' : `${health.syncAge} 天前`;
  const summary = trainingCompletionSummary(plan);
  const currWeekPlan = plan[currentWeek - 1];
  const weekDates = new Set((currWeekPlan?.days || []).map((day) => day.dateStr));
  const currWeekDone = summary.allActivity.filter((entry) => weekDates.has(entry.date)).reduce((sum, entry) => sum + (entry.actualKm || 0), 0);
  const effectiveTarget = effectiveWeekVolumeTarget(currWeekPlan);
  const weekTargetKm = effectiveTarget.numericKm || 0;
  const weekProgressPct = weekTargetKm > 0 ? Math.min(100, Math.round((currWeekDone / weekTargetKm) * 100)) : 0;
  const assessmentHint = getAssessmentCycleHint(plan);
  const pausedBanner = profile?.paused
    ? `<div style="background:#7f1d1d;border-radius:8px;padding:10px 14px;font-size:14px;margin-bottom:12px;color:#fca5a5">⏸ 計畫已暫停（${profile.pausedAt}）<button class="btn btn-secondary" style="font-size:12px;padding:4px 10px;margin-left:10px" onclick="resumePlan()">繼續計畫</button></div>`
    : '';
  const letterBody = weeklyCoachLetterBody();
  return `<section class="automation-brief" aria-label="本週總覽"><div>
      ${pausedBanner}
      ${assessmentHint ? `<div style="background:#edf5ef;border-radius:10px;padding:10px 14px;font-size:14px;margin-bottom:12px;color:var(--c-primary-hover)">🧪 ${assessmentHint}</div>` : ''}
      <div class="automation-brief-kicker">Runner autopilot · ${reviewEscape(decision.title)}</div>
      <div class="automation-brief-title">${reviewEscape(course)}</div>
      <p class="automation-brief-copy">${reviewEscape(decision.next)}</p>
      <div class="plan-progress-track" style="margin-top:12px">
        <div class="plan-progress-line"><span>本週跑量${effectiveTarget.source === '教練本週目標' ? '（教練目標）' : ''}</span><strong>${currWeekDone.toFixed(1)} / ${effectiveTarget.display} · ${weekProgressPct}%</strong></div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${weekProgressPct}%"></div></div>
      </div>
      <div class="training-status-actions" style="margin-top:12px;justify-content:flex-start"><button class="btn btn-primary" onclick="goToToday()">查看今日執行</button>${health.issues.length ? '<button class="btn btn-secondary" onclick="switchPlanTab(\'autopilot\')">查看同步狀態</button>' : ''}</div>
    </div>
    <div class="automation-brief-stats">
      <div class="automation-brief-stat"><span>本週完成</span><b>${health.currentWeekCompleted.length}/${health.currentWeekDays.length || 0} 堂</b></div>
      <div class="automation-brief-stat"><span>執行率</span><b>${summary.elapsedSessions ? `${summary.adherence}%` : '尚未開始'}</b></div>
      <div class="automation-brief-stat"><span>累積實跑</span><b>${summary.totalKm.toFixed(1)} km</b></div>
      <div class="automation-brief-stat"><span>Garmin 資料</span><b>${syncText}</b></div>
    </div></section>
  ${letterBody ? `<details class="card coach-letter-fold"><summary>✉️ 本週教練信</summary><div style="margin-top:10px">${letterBody}</div></details>` : ''}`;
}

function renderPlanChangeTimeline() {
  const items = [...(appData.planChangeHistory || [])].slice(-4).reverse();
  if (!items.length) return '<div class="automation-timeline"><div class="automation-timeline-title">課表變更紀錄</div><p style="margin:7px 0 0;color:var(--c-text-muted);font-size:12px;line-height:1.55">尚未有自動調整。系統會在 Garmin 校準、週評估保護或套用檢測後，保留前後差異。</p></div>';
  return `<div class="automation-timeline"><div class="automation-timeline-title">課表變更紀錄</div><div class="automation-timeline-list">${items.map((item) => `<div class="automation-timeline-item"><time>${reviewEscape(item.date)}</time><div><b>${reviewEscape(item.title)}</b><br>${item.changes.map((change) => reviewEscape(change)).join('；')}</div></div>`).join('')}</div></div>`;
}

function showWeekPlanFromStatus() {
  switchPlanTab('week');
  document.getElementById('plan-tab-week')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function configureGarminCompletionRule() {
  const current = garminCompletionPercent();
  showModal('設定 Garmin 自動完成門檻', `<p style="margin:0 0 14px;line-height:1.65;color:var(--c-text-muted)">同步跑步達到課表距離的指定比例（且至少 1 km）時，系統才會自動標示完成或認列補跑。手動完成不受這個門檻影響。</p><label class="form-label" for="garmin-completion-pct">課表距離完成比例</label><select id="garmin-completion-pct" class="form-input"><option value="50" ${current === 50 ? 'selected' : ''}>50%｜寬鬆，適合恢復期</option><option value="60" ${current === 60 ? 'selected' : ''}>60%｜建議預設</option><option value="70" ${current === 70 ? 'selected' : ''}>70%｜較嚴謹</option><option value="80" ${current === 80 ? 'selected' : ''}>80%｜接近完整課表</option></select>`, [
    { label: '儲存設定', primary: true, action: () => setGarminCompletionRule() },
    { label: '取消', action: closeModal }
  ]);
}

function setGarminCompletionRule() {
  const value = Number(document.getElementById('garmin-completion-pct')?.value);
  if (![50, 60, 70, 80].includes(value)) return;
  appData.profile = { ...(appData.profile || {}), garminCompletionPct: value };
  recordTrainingEvent('garmin_completion_rule_updated', { detail: `${value}%` });
  saveData(appData);
  closeModal();
  const activeTab = ['week', 'coach', 'checkin', 'progress'].find((tab) => document.getElementById(`plan-tab-${tab}`)?.style.display !== 'none') || 'week';
  renderPlanView();
  showView('plan');
  switchPlanTab(activeTab);
}

function reviewEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function coachRunStatus() {
  const sync = appData.profile?.coachSync || {};
  if (sync.frequency === 'manual') return { level: 'ok', text: '手動更新排程，無自動時間可比對' };
  const isWeekly = sync.frequency === 'weekly';
  const [hourStr, minuteStr] = String(sync.time || '20:30').split(':');
  const hour = Number.isFinite(Number(hourStr)) ? Number(hourStr) : 20;
  const minute = Number.isFinite(Number(minuteStr)) ? Number(minuteStr) : 30;
  const scheduledDow = isWeekly && Number.isInteger(sync.day) ? sync.day : null;

  const now = new Date();
  const scheduled = new Date(now);
  scheduled.setHours(hour, minute, 0, 0);
  if (scheduledDow !== null) {
    const diff = (scheduled.getDay() - scheduledDow + 7) % 7;
    scheduled.setDate(scheduled.getDate() - diff);
  }
  if (scheduled > now) scheduled.setDate(scheduled.getDate() - (scheduledDow !== null ? 7 : 1));
  // syncedAt＝這份加密檔最後一次被排程「成功建置」的日期（每次同步都會更新，含每天的 Garmin-only 排程）；
  // coachReviewData.updatedAt 是人工週報自己填的日期，只有手動寫新週報才會變，用它來判斷「排程有沒有跑」會誤判。
  const updatedAt = coachReviewData?.syncedAt || coachReviewData?.updatedAt || coachReviewData?.autopilot?.asOf;
  const scheduledDay = new Date(scheduled);
  scheduledDay.setHours(0, 0, 0, 0);
  const isFresh = updatedAt && new Date(`${updatedAt}T00:00:00`) >= scheduledDay;
  if (isFresh) return { level: 'ok', text: '✅ 本次排程已完成' };
  const minsSince = Math.round((now - scheduled) / 60000);
  if (minsSince <= 20) return { level: 'running', text: `⏳ 產生中（通常 5–20 分鐘，已 ${Math.max(minsSince, 0)} 分）` };
  if (minsSince <= 45) return { level: 'delayed', text: `⏳ 延遲中（已超過預計時間 ${minsSince} 分）` };
  if (coachReviewData?.analyticsStatus === 'missing') {
    return { level: 'failed', text: '⚠️ Garmin 從未同步成功過，請確認帳號授權或手動觸發一次同步', actionUrl: 'https://github.com/adelbert56/runner/actions/workflows/garmin-sync.yml', actionLabel: '手動補跑 Garmin 同步' };
  }
  return { level: 'failed', text: `⚠️ 可能失敗，已超過 ${minsSince} 分鐘未更新（上次成功同步：${updatedAt || '未知'}）`, actionUrl: 'https://github.com/adelbert56/runner/actions/workflows/garmin-sync.yml', actionLabel: '手動補跑 Garmin 同步' };
}

function coachScheduleLabel() {
  const sync = appData.profile?.coachSync || {};
  return sync.frequency === 'weekly'
    ? `每週${DOW_NAMES[sync.day] || '日'} ${sync.time || '20:30'} 檢查`
    : sync.frequency === 'manual'
    ? '只在手動更新時檢查'
    : `每天 ${sync.time || '20:30'} 檢查`;
}

function currentTrainingGoalLabel() {
  const profile = appData.profile || {};
  const targetTime = profile.targetTime || '未設定';
  const targetPace = profile.racePaceSec ? `${secToPace(profile.racePaceSec)}/km` : '配速待設定';
  return `${profile.targetDate || '未設定目標日'} · ${targetTime}（${targetPace}）`;
}

function paceToSeconds(pace) {
  const match = String(pace || '').match(/^(\d+):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function formatPaceSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}/km`;
}

function garminActivityRecords() {
  const rawRuns = coachReviewData?.analyticsRuns?.length ? coachReviewData.analyticsRuns : (coachReviewData?.runs || []);
  return rawRuns.map((run) => ({
    activityId: run.activityId || null,
    date: run.date,
    name: run.name || 'Garmin 跑步',
    km: Number(run.km) || 0,
    durationMin: Number(run.durationMin) || null,
    pace: run.pace,
    fullPace: run.pace,
    qualityPace: run.qualityPace || null,
    qualityKm: Number(run.qualityKm) || null,
    qualityEligible: Boolean(run.qualityEligible),
    qualitySource: run.qualitySource || 'full-activity-only',
    paceSeconds: paceToSeconds(run.qualityPace || run.pace),
    hr: Number(run.hr) || null,
    qualityHr: Number(run.qualityHr) || null,
    qualityCadence: Number(run.qualityCadence) || null,
    maxHr: Number(run.maxHr) || null,
    cadence: Number(run.cadence) || null,
    elevationGainM: Number(run.elevationGainM) || 0,
    temperatureC: Number(run.temperatureC) || null,
    aerobicTe: Number(run.aerobicTe) || null,
    anaerobicTe: Number(run.anaerobicTe) || null,
    vo2max: Number(run.vo2max) || null,
    power: Number(run.power) || null,
    trainingLoad: Number(run.trainingLoad) || null,
    laps: Array.isArray(run.laps) ? run.laps : [],
    sessionFamily: run.sessionFamily || 'easy',
    selfEvaluation: run.selfEvaluation || null
  })).filter((run) => run.date && run.km > 0);
}

function coachRunRecords() {
  return garminActivityRecords();
}

function weekStartLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weeklyRunTrend(runs) {
  const groups = new Map();
  runs.forEach((run) => {
    const week = weekStartLabel(run.date);
    const item = groups.get(week) || { week, km: 0, runs: 0 };
    item.km += run.km;
    item.runs += 1;
    groups.set(week, item);
  });
  return [...groups.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-8).map((item) => ({ ...item, km: Math.round(item.km * 10) / 10 }));
}

function renderVolumeBars(trend) {
  if (!trend.length) return '<p style="color:var(--c-text-muted);margin:0">尚無可用的週跑量資料。</p>';
  const max = Math.max(...trend.map((item) => item.km), 1);
  return `<div style="display:flex;align-items:flex-end;gap:10px;height:180px;padding-top:12px">${trend.map((item) => `<div style="flex:1;min-width:32px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px"><b style="font-size:12px">${item.km}</b><div title="${reviewEscape(item.week)}：${item.km} km / ${item.runs} 次" style="width:100%;max-width:42px;min-height:5px;height:${Math.max(5, (item.km / max) * 125)}px;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#5fae79,#24724f)"></div><span style="font-size:11px;color:var(--c-text-muted)">${reviewEscape(item.week.slice(5))}</span></div>`).join('')}</div>`;
}

function sessionIntensityLabel(intensity, index, isIntervalBlock = false) {
  const normalized = String(intensity || '').toUpperCase();
  if (isIntervalBlock && normalized === 'ACTIVE') return '間歇快段';
  if (isIntervalBlock && normalized === 'RECOVERY') return '間歇恢復';
  const labels = { WARMUP: '熱身', MAIN: '主課', ACTIVE: '活動段', INTERVAL: '間歇', RECOVERY: '恢復', COOLDOWN: '收操', REST: '休息' };
  return labels[normalized] || `計圈 ${index || ''}`.trim();
}

function sessionLapLabel(lap, index, hasStructuredMain, isIntervalBlock = false) {
  // Garmin 會把手動／自動計圈都標成 INTERVAL；沒有明確的課程結構時，
  // 不應把那個原始欄位解讀成正式課表的「間歇」。
  return hasStructuredMain ? sessionIntensityLabel(lap?.intensity, index, isIntervalBlock) : `計圈 ${index}`;
}

function sessionIntensityClass(intensity) {
  const value = String(intensity || '').toUpperCase();
  if (['MAIN', 'ACTIVE', 'INTERVAL'].includes(value)) return 'main';
  if (['RECOVERY', 'REST'].includes(value)) return 'recovery';
  return 'neutral';
}

function isStructuredIntervalBlock(laps) {
  const intensities = laps.map((lap) => String(lap?.intensity || '').toUpperCase());
  return intensities.filter((intensity) => intensity === 'ACTIVE').length >= 2
    && intensities.filter((intensity) => intensity === 'RECOVERY').length >= 2;
}

function summarizeSessionLaps(laps, hasStructuredMain, isIntervalBlock = false) {
  const groups = new Map();
  laps.forEach((lap) => {
    const intensity = hasStructuredMain ? String(lap?.intensity || '').toUpperCase() : 'LAP';
    const label = hasStructuredMain ? sessionIntensityLabel(intensity, null, isIntervalBlock) : 'Garmin 計圈';
    const group = groups.get(intensity) || { label, intensity, count: 0, distanceKm: 0, durationMin: 0 };
    group.count += 1;
    group.distanceKm += Number(lap?.distance_km) || 0;
    group.durationMin += Number(lap?.duration_min) || 0;
    groups.set(intensity, group);
  });
  return [...groups.values()].map((group) => ({
    ...group,
    paceSeconds: group.distanceKm > 0 && group.durationMin > 0 ? (group.durationMin * 60) / group.distanceKm : null,
    className: hasStructuredMain ? sessionIntensityClass(group.intensity) : 'neutral'
  }));
}

function plannedSessionFor(run) {
  const assignment = activityAssignmentFor(run);
  const targetDate = assignment?.mode === 'extra' ? '' : (assignment?.targetDate || run.date);
  for (const week of appData.plan || []) {
    const day = (week.days || []).find((item) => item.dateStr === targetDate || item.date === targetDate);
    if (day) return applyCoachPlanOverride(day, week);
  }
  return null;
}

function futurePlanSnapshot(fromWeek = currentWeek + 1) {
  return (appData.plan || []).filter((week) => week.weekNum >= fromWeek).map((week) => ({ weekNum: week.weekNum, targetKm: Number(week.targetKm) || 0, quality: (week.days || []).filter((day) => ['tempo', 'interval'].includes(day.type)).length, deload: Boolean(week.isDeload) }));
}

function recordPlanChange(before, source, title) {
  const after = futurePlanSnapshot();
  const changes = after.map((week) => {
    const previous = before.find((item) => item.weekNum === week.weekNum);
    if (!previous) return '';
    const parts = [];
    if (previous.targetKm !== week.targetKm) parts.push(`${previous.targetKm} → ${week.targetKm} km`);
    if (previous.quality !== week.quality) parts.push(`品質課 ${previous.quality} → ${week.quality} 堂`);
    if (!previous.deload && week.deload) parts.push('改為恢復週');
    return parts.length ? `第 ${week.weekNum} 週：${parts.join('、')}` : '';
  }).filter(Boolean);
  if (!changes.length) return;
  appData.planChangeHistory = normalizePlanChangeHistory(appData.planChangeHistory);
  appData.planChangeHistory.push({ date: todayStr(), source, title, changes });
  appData.planChangeHistory = appData.planChangeHistory.slice(-30);
}

function formatSessionDuration(minutes) {
  const seconds = Math.max(0, Math.round((Number(minutes) || 0) * 60));
  return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';
}

let selectedTrainingReportActivityId = null;
let selectedTrainingReportLapCategory = null;

function sessionQualitySignals(run) {
  const mainLaps = run.laps.filter((lap) => ['MAIN', 'INTERVAL'].includes(String(lap?.intensity || '').toUpperCase()) && paceToSeconds(lap.pace_per_km));
  if (mainLaps.length < 2) return null;
  const midpoint = Math.ceil(mainLaps.length / 2);
  const average = (items, field) => items.reduce((sum, item) => sum + (Number(item[field]) || 0), 0) / items.length;
  const first = mainLaps.slice(0, midpoint), last = mainLaps.slice(midpoint);
  const paceDelta = Math.round(average(last, 'duration_min') / average(last, 'distance_km') * 60 - average(first, 'duration_min') / average(first, 'distance_km') * 60);
  const hrDelta = first.some((lap) => lap.avg_hr) && last.some((lap) => lap.avg_hr) ? Math.round(average(last, 'avg_hr') - average(first, 'avg_hr')) : null;
  return { paceDelta, hrDelta, label: paceDelta <= 5 ? '主課節奏穩定' : `後半慢 ${paceDelta} 秒/km` };
}

function plannedMainTargetKm(day) {
  if (!day) return null;
  const mainStep = garminManualBuilderSteps(day).find((step) => step.title === '主課');
  const text = [mainStep?.dose, mainStep?.detail, day.task, day.detail, day.pace].filter(Boolean).join(' ');
  const match = text.match(/(?:E\s*跑|恢復跑|長跑|慢跑)\s*(\d+(?:\.\d+)?)\s*(?:km|公里)/i) || text.match(/(\d+(?:\.\d+)?)\s*(?:km|公里)/i);
  return match ? Number(match[1]) : garminMainDistanceKm(day);
}

function garminFeelLabel(value) {
  return ({ 1: '非常差', 2: '差', 3: '偏差', 4: '尚可', 5: '普通', 6: '不錯', 7: '很好', 8: '極佳' })[Number(value)] || '—';
}

function selectTrainingReport(activityId) {
  selectedTrainingReportActivityId = Number(activityId) || null;
  selectedTrainingReportLapCategory = null;
  refreshCoachReviewPanels();
}

function selectTrainingReportLapCategory(category) {
  selectedTrainingReportLapCategory = category || null;
  const analysisHost = document.getElementById('progress-panel-analysis') || document.getElementById('training-analysis-content');
  if (analysisHost) analysisHost.innerHTML = renderTrainingAnalysis();
}

function renderLatestTrainingReport(runs) {
  const run = runs.find((item) => item.activityId === selectedTrainingReportActivityId) || runs.at(-1);
  if (!run) return '';
  const assignment = activityAssignmentFor(run);
  const planned = plannedSessionFor(run);
  const mainScope = run.qualityEligible;
  const courseKm = mainScope ? run.qualityKm : run.km;
  const coursePace = mainScope ? run.qualityPace : run.fullPace;
  const courseHr = mainScope ? run.qualityHr : run.hr;
  const courseCadence = mainScope ? run.qualityCadence || run.cadence : run.cadence;
  const laps = run.laps.filter((lap) => Number(lap?.distance_km) > 0);
  const status = mainScope ? '已辨識主課' : '全程紀錄';
  const statusClass = mainScope ? '' : ' neutral';
  const plannedType = planned ? trainingTypeLabel(planned.type, planned.focus) : '未找到同日課表';
  const goal = planned ? trainingTaskTitle(planned) : '這筆實跑未對應到正式課表';
  const target = [planned?.pace, planned?.hrTarget].filter(Boolean).join(' · ') || '以教練指示與舒適度完成';
  const scopeText = mainScope ? `主課 ${courseKm?.toFixed(1)} km` : `全程 ${run.km.toFixed(1)} km`;
  const summary = mainScope
    ? `已完成 ${scopeText}，${coursePace || '配速未回傳'}${courseHr ? ` · HR ${Math.round(courseHr)}` : ''}。`
    : `本次完成 ${scopeText}；Garmin 尚未提供可安全切分的主課段別。`;
  const evidence = mainScope
    ? '品質判讀只使用 Garmin 明確標記的主課；熱身、恢復與收操仍保留在總負荷，不會拖慢主課成績。'
    : '本次僅用全程呈現，尚不會以此作為主課配速／心率的課表升降依據。';
  const intervalBlock = mainScope && isStructuredIntervalBlock(laps);
  const lapGroups = summarizeSessionLaps(laps, mainScope, intervalBlock);
  const defaultLapCategory = mainScope && lapGroups.some((group) => group.intensity === 'MAIN') ? 'MAIN' : 'ALL';
  const selectedLapCategory = selectedTrainingReportLapCategory === 'ALL' || lapGroups.some((group) => group.intensity === selectedTrainingReportLapCategory)
    ? selectedTrainingReportLapCategory
    : defaultLapCategory;
  const visibleLaps = selectedLapCategory === 'ALL'
    ? laps
    : laps.filter((lap) => (mainScope ? String(lap?.intensity || '').toUpperCase() : 'LAP') === selectedLapCategory);
  const visiblePaces = visibleLaps.map((lap) => paceToSeconds(lap.pace_per_km)).filter((pace) => pace > 0);
  const fastestLapPace = visiblePaces.length ? Math.min(...visiblePaces) : 0;
  const slowestLapPace = visiblePaces.length ? Math.max(...visiblePaces) : 0;
  const lapRows = visibleLaps.length
    ? visibleLaps.map((lap, index) => {
      const paceSeconds = paceToSeconds(lap.pace_per_km);
      const relativePace = fastestLapPace && slowestLapPace > fastestLapPace && paceSeconds
        ? 54 + ((slowestLapPace - paceSeconds) / (slowestLapPace - fastestLapPace)) * 46
        : 76;
      const label = mainScope ? sessionLapLabel(lap, lap.index || index + 1, true, intervalBlock) : `第 ${index + 1} 圈`;
      return `<div class="session-lap ${mainScope ? sessionIntensityClass(lap.intensity) : 'neutral'}"><span class="session-lap-label">${reviewEscape(label)}</span><span class="session-lap-bar" title="${reviewEscape(lap.pace_per_km || '配速未提供')}"><i style="width:${relativePace.toFixed(0)}%"></i></span><span class="session-lap-meta">${Number(lap.distance_km).toFixed(2)} km</span><span class="session-lap-meta">${reviewEscape(lap.pace_per_km || '—')}</span></div>`;
    }).join('')
    : '<p class="session-breakdown-copy">這筆舊資料尚未同步計圈摘要；下次 Garmin 同步後會補上，不影響既有總量與主課判讀。</p>';
  const lapFilters = laps.length ? `<div class="session-lap-filters" role="group" aria-label="篩選課程分段"><button type="button" class="session-lap-filter ${selectedLapCategory === 'ALL' ? 'active' : ''}" onclick="selectTrainingReportLapCategory('ALL')">全部 <small>${laps.length}</small></button>${lapGroups.map((group) => `<button type="button" class="session-lap-filter ${selectedLapCategory === group.intensity ? 'active' : ''}" onclick="selectTrainingReportLapCategory('${group.intensity}')">${reviewEscape(group.label)} <small>${group.count}</small></button>`).join('')}</div>` : '';
  const selectedGroup = lapGroups.find((group) => group.intensity === selectedLapCategory);
  const lapFilterNote = selectedLapCategory === 'ALL'
    ? `顯示全部 ${laps.length} 段 Garmin 分段。`
    : `顯示${selectedGroup?.label || '所選類別'} ${visibleLaps.length} 段；可切換其他類別，不會重複堆疊摘要。`;
  const autopilot = coachReviewData?.autopilot?.metrics || {};
  const comparisonLabel = { easy: '輕鬆跑', steady: '穩定跑', interval: '間歇', strides: '加速跑' }[autopilot.comparisonFamily] || '主課';
  const confidence = mainScope
    ? `${comparisonLabel}比較資料：最近兩次同課型主課（${autopilot.qualityComparisonSampleSize || 0}/2 筆）；兩筆比較會採較嚴格門檻才下修課表。`
    : '本次尚無主課段別，教練維持保守判讀。';
  const plannedKm = plannedMainTargetKm(planned);
  const completion = plannedKm ? `${courseKm >= plannedKm * (garminCompletionPercent() / 100) ? '已達標' : '部分完成'} · 目標 ${plannedKm.toFixed(1)} km／實跑 ${courseKm.toFixed(1)} km` : '未找到可量化的課表目標';
  const postRun = postRunVerdict(run, planned);
  const signals = sessionQualitySignals(run);
  const feel = run.selfEvaluation;
  const signalText = signals
    ? `${signals.label}${signals.hrDelta !== null ? `；後半心率 ${signals.hrDelta >= 0 ? '+' : ''}${signals.hrDelta} bpm。` : ''}`
    : '';
  const history = runs.slice(-8).reverse().map((item) => `<button class="session-report-history ${item.activityId === run.activityId ? 'active' : ''}" onclick="selectTrainingReport('${item.activityId || ''}')">${reviewEscape(item.date.slice(5))}<small>${item.qualityPace || item.pace || '—'}/km</small></button>`).join('');
  const nextAction = postRun.next;
  const reportTitle = planned ? `${plannedType}完成報告` : `${reviewEscape(run.name)}｜實跑報告`;
  const assignmentLabel = assignment.mode === 'extra'
    ? '系統判定為額外跑，不影響正式課表完成度。'
    : assignment.mode === 'makeup'
      ? `系統${assignment.source === 'runner' ? '已依你的修正' : '已自動'}對應為 ${assignment.targetDate} 的補跑。`
      : `系統已自動對應 ${assignment.targetDate} 的同日正式課程。`;
  const assignmentConfidence = assignment.confidence === 'medium' ? '低信心，建議確認一次。' : '判讀可信；不需要額外操作。';
  const assignmentAction = run.activityId ? `<button type="button" class="btn btn-secondary" onclick="openActivityAssignment('${run.activityId}')">這次對應不對？</button>` : '';
  return `<section class="session-report" aria-label="最新訓練報告">
    <div class="session-report-head"><div><div class="session-report-kicker">Training report · Garmin</div><h2 class="session-report-title">${reportTitle}</h2><div class="session-report-meta">${reviewEscape(run.date)} · 全程 ${run.km.toFixed(2)} km · ${formatSessionDuration(run.durationMin)}</div></div><span class="session-report-status${statusClass}">${status}</span></div>
    <div class="session-report-body"><div class="session-report-grid"><div class="session-report-verdict"><div class="session-report-label">這次該怎麼看</div><p class="session-report-summary">${summary}</p><p class="session-report-note">${completion}。${evidence}</p><div class="session-next-action"><b>${reviewEscape(postRun.label)}</b><span>${reviewEscape(postRun.summary)}<br><b>下一步：</b>${reviewEscape(nextAction)}</span></div></div><aside class="session-report-target"><div class="session-report-label">課程對應</div><div class="session-plan-row"><span>系統判讀</span><b>${reviewEscape(assignmentLabel)}</b></div><div class="session-plan-row"><span>可信度</span><b>${assignmentConfidence}</b></div><div class="training-status-actions" style="margin-top:10px;justify-content:flex-start">${assignmentAction}</div></aside></div><div class="session-report-grid" style="margin-top:12px"><aside class="session-report-target"><div class="session-report-label">正式課表對照</div><div class="session-plan-row"><span>原定課型</span><b>${reviewEscape(plannedType)}</b></div><div class="session-plan-row"><span>課表內容</span><b>${reviewEscape(goal)}</b></div><div class="session-plan-row"><span>目標提示</span><b>${reviewEscape(target)}</b></div></aside></div>
    <div class="session-report-metrics"><div class="session-report-metric"><span>判讀範圍</span><strong>${scopeText}</strong></div><div class="session-report-metric"><span>配速</span><strong>${coursePace ? `${reviewEscape(coursePace)}/km` : '—'}</strong></div><div class="session-report-metric"><span>平均心率</span><strong>${courseHr ? `HR ${Math.round(courseHr)}` : '—'}</strong></div></div><div class="session-secondary-metrics"><span>平均步頻 <b>${courseCadence ? `${Math.round(courseCadence)} spm` : '—'}</b></span>${feel ? `<span>Garmin 自我評量 <b>${garminFeelLabel(feel.feel)} · RPE ${feel.rpe}/10</b></span>` : '<span>Garmin 自我評量 <b>尚未填寫</b></span>'}</div>
    <div class="session-breakdown"><div class="session-breakdown-card"><h3 class="session-breakdown-title">${mainScope ? '課程分段與配速' : 'Garmin 計圈與配速'}</h3><p class="session-breakdown-copy">${mainScope ? '預設聚焦主課；需要時可切換熱身、活動、恢復、收操或全部。' : '本次沒有可安全判讀的課程段別；以下僅顯示 Garmin 計圈，不會覆寫正式課表。'}</p>${lapFilters}<p class="session-lap-filter-note">${lapFilterNote}</p><div class="session-lap-list">${lapRows}</div></div><div class="session-coach-callout"><div class="session-report-label">教練判讀</div><strong>${mainScope ? '主課成績已單獨入帳，不會被熱身與收操稀釋。' : '這筆資料保留為趨勢參考，不會改寫正式課表。'}</strong><p>${signalText}${confidence}</p></div></div><div class="session-report-history-wrap"><div class="session-report-history-label">最近訓練</div><div class="session-report-history" aria-label="近期單堂課報告">${history}</div></div></div>
  </section>`;
}

function renderPaceTrend(runs) {
  const points = runs.filter((run) => run.paceSeconds).slice(-12);
  if (points.length < 2) return '<p style="color:var(--c-text-muted);margin:0">至少需要兩筆含配速的跑步紀錄。</p>';
  const width = 620, height = 218, padX = 42, padTop = 28, padBottom = 34;
  const values = points.map((item) => item.paceSeconds);
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(max - min, 20);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const latest = points.at(-1);
  const latestDiff = Math.round(latest.paceSeconds - average);
  const x = (index) => padX + (index * (width - padX * 2)) / (points.length - 1);
  const y = (value) => padTop + ((value - min) / range) * (height - padTop - padBottom);
  const coords = points.map((item, index) => `${x(index).toFixed(1)},${y(item.paceSeconds).toFixed(1)}`).join(' ');
  const areaPath = `M ${x(0).toFixed(1)} ${height - padBottom} L ${coords.replaceAll(',', ' ').replaceAll(' ', ' L ')} L ${x(points.length - 1).toFixed(1)} ${height - padBottom} Z`;
  const gridValues = [min, Math.round((min + max) / 2), max];
  const grid = gridValues.map((value) => `<g><line class="pace-trend-grid" x1="${padX}" x2="${width - padX}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}"/><text class="pace-trend-axis-label" x="0" y="${(y(value) + 4).toFixed(1)}">${formatPaceSeconds(value)}</text></g>`).join('');
  const averageY = y(average).toFixed(1);
  const dots = points.map((item, index) => {
    const scope = item.qualityEligible ? `主課 ${item.qualityKm?.toFixed(1) || ''} km` : '全程（未辨識主課）';
    const hr = item.qualityEligible ? item.qualityHr : item.hr;
    return `<circle class="${index === points.length - 1 ? 'pace-trend-latest' : 'pace-trend-dot'}" cx="${x(index).toFixed(1)}" cy="${y(item.paceSeconds).toFixed(1)}" r="${index === points.length - 1 ? 5 : 4}"><title>${reviewEscape(item.date)} · ${scope} · ${formatPaceSeconds(item.paceSeconds)}${hr ? ` · HR ${hr}` : ''}</title></circle>`;
  }).join('');
  const dateLabels = points.map((item, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 4) === 0 ? `<text class="pace-trend-axis-label" text-anchor="middle" x="${x(index).toFixed(1)}" y="${height - 8}">${reviewEscape(item.date.slice(5))}</text>` : '').join('');
  const latestLabel = latestDiff === 0 ? '持平' : latestDiff < 0 ? `快 ${Math.abs(latestDiff)} 秒/km` : `慢 ${latestDiff} 秒/km`;
  const latestTone = latestDiff <= 0 ? 'positive' : 'caution';
  const activityRows = points.slice(-3).map((item) => {
    const scope = item.qualityEligible ? `主課 ${item.qualityKm?.toFixed(1) || ''} km` : '全程（未辨識主課）';
    const hr = item.qualityEligible ? item.qualityHr : item.hr;
    return `<div class="pace-trend-activity"><span>${reviewEscape(item.date)}</span><b>${formatPaceSeconds(item.paceSeconds)}</b><small>${scope}${hr ? ` · HR ${hr}` : ''}</small></div>`;
  }).join('');
  return `<div class="pace-trend-panel"><div class="pace-trend-summary"><div class="pace-trend-metric"><span>近 ${points.length} 趟配速</span><strong>${formatPaceSeconds(average)}</strong></div><div class="pace-trend-metric"><span>最快紀錄</span><strong>${formatPaceSeconds(min)}</strong></div><div class="pace-trend-metric"><span>最新相較均速</span><strong class="${latestTone}">${latestLabel}</strong></div></div><svg class="pace-trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="最近跑步配速趨勢；最新 ${formatPaceSeconds(latest.paceSeconds)}，近 ${points.length} 趟平均 ${formatPaceSeconds(average)}"><defs><linearGradient id="pace-trend-fill" x1="0" x2="0" y1="0"><stop offset="0%" stop-color="#5fae79" stop-opacity=".34"/><stop offset="100%" stop-color="#5fae79" stop-opacity="0"/></linearGradient></defs>${grid}<line x1="${padX}" x2="${width - padX}" y1="${averageY}" y2="${averageY}" stroke="#9aa79f" stroke-width="1.5" stroke-dasharray="5 5"/><path d="${areaPath}" fill="url(#pace-trend-fill)"/><polyline points="${coords}" fill="none" stroke="#24724f" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}${dateLabels}</svg><div class="pace-trend-legend"><span>主課優先；未辨識時只顯示全程</span><span class="average">近 ${points.length} 趟平均 ${formatPaceSeconds(average)}</span></div><div class="pace-trend-activities">${activityRows}</div></div>`;
}

function weeklyRampInfo(trend) {
  const currentWeekKey = weekStartLabel(todayStr());
  const completeWeeks = trend.filter((item) => item.week !== currentWeekKey);
  if (completeWeeks.length < 2) return null;
  const [prev, last] = completeWeeks.slice(-2);
  if (prev.km < 5) return null;
  const ramp = Math.round(((last.km - prev.km) / prev.km) * 100);
  return { prev, last, ramp };
}

function weekVolumeRecommendation(trend, adherence) {
  const autopilot = coachReviewData?.autopilot;
  if (autopilot && autopilot.status === 'ready') {
    const factor = Number(autopilot.volumeFactor) || 1;
    const tone = factor > 1 ? 'good' : factor < 1 ? 'caution' : 'good';
    const icon = tone === 'good' ? '🟢' : '🟡';
    const verdict = autopilot.label || (factor > 1 ? '可加量' : factor < 1 ? '持平或減量' : '持平');
    const reasonDetail = autopilot.reasons?.[0] ? `（${autopilot.reasons[0]}）` : '';
    return { verdict, tone, icon, reason: `${autopilot.headline || '依 Garmin 近況判讀。'}${reasonDetail}` };
  }
  const info = weeklyRampInfo(trend);
  if (!info) return null;
  const { ramp } = info;
  if (adherence < 70) {
    return { verdict: '持平或減量', tone: 'caution', icon: '🟡', reason: `近期執行率僅 ${adherence}%，低於 70%；這週先把課表完成度補起來，暫不加量。` };
  }
  if (ramp > 15) {
    return { verdict: '減量', tone: 'danger', icon: '🔴', reason: `上週跑量比前週增加 ${ramp}%，超過安全增幅上限（10–15%）；這週建議下修，避免受傷。` };
  }
  if (ramp > 10) {
    return { verdict: '持平', tone: 'caution', icon: '🟡', reason: `上週跑量比前週增加 ${ramp}%，已達安全增幅上限；這週不要再加量。` };
  }
  if (ramp < -30) {
    return { verdict: '持平', tone: 'caution', icon: '🟡', reason: `上週跑量比前週大減 ${Math.abs(ramp)}%；這週先從保守量恢復，不要直接跳回原量。` };
  }
  return { verdict: '可加量', tone: 'good', icon: '🟢', reason: `執行率 ${adherence}%、上週增幅 ${ramp >= 0 ? '+' : ''}${ramp}% 都在安全範圍；這週可小幅加量（建議 +5–10%）。` };
}

function renderWeeklySummaryCard(trend, adherence) {
  const rec = weekVolumeRecommendation(trend, adherence);
  if (!rec) return '';
  const colorMap = { good: 'var(--c-green)', caution: 'var(--c-orange)', danger: 'var(--c-red)' };
  return `<div class="card" style="border-left:4px solid ${colorMap[rec.tone]}">
    <div class="card-title">📅 本週總結</div>
    <div style="display:flex;align-items:baseline;gap:8px;margin:4px 0 8px"><span style="font-size:20px">${rec.icon}</span><b style="font-size:16px">下週建議：${rec.verdict}</b></div>
    <p style="margin:0;font-size:13px;line-height:1.6;color:var(--c-text-muted)">${rec.reason}</p>
  </div>`;
}

function liveCoachPlan() {
  const runs = coachRunRecords();
  const summary = trainingCompletionSummary(appData.plan || []);
  const trend = weeklyRunTrend(runs);
  const recommendation = weekVolumeRecommendation(trend, summary.adherence);
  const reviewedWeek = coachReviewData?.week || {};
  const hasReviewedWeek = Boolean(reviewedWeek.range || reviewedWeek.label);
  const recent = runs.slice(-4);
  const latest = recent.at(-1);
  const averagePace = recent.filter((run) => run.paceSeconds).reduce((sum, run, _, list) => sum + run.paceSeconds / list.length, 0);
  const averageHr = recent.filter((run) => run.hr).reduce((sum, run, _, list) => sum + run.hr / list.length, 0);
  const autopilot = coachReviewData?.autopilot || {};
  const qualityMode = autopilot.qualityMode || '';
  const dataLabel = hasReviewedWeek
    ? `上週回顧 · ${reviewedWeek.range || reviewedWeek.label}`
    : runs.length ? `最近 ${Math.min(runs.length, 4)} 趟 Garmin 跑步` : '尚未有 Garmin 跑步資料';
  const observation = hasReviewedWeek
    ? [
      `上週跑了 ${reviewedWeek.runs ?? '—'} 次、${reviewedWeek.km ?? '—'} km`,
      reviewedWeek.longKm ? `最長 ${reviewedWeek.longKm} km` : '',
      reviewedWeek.avgHr && reviewedWeek.avgHr !== '—' ? `平均心率 HR ${reviewedWeek.avgHr}` : ''
    ].filter(Boolean).join('；')
    : !runs.length
    ? '還沒有足夠的實跑資料，所以先不替你增加強度。'
    : [
      `近期 ${recent.length} 趟平均 ${formatPaceSeconds(averagePace)}${averageHr ? `、HR ${Math.round(averageHr)}` : ''}`,
      latest?.paceSeconds && averagePace ? `最新一趟 ${latest.paceSeconds <= averagePace ? '較近期均速快' : '較近期均速慢'} ${Math.abs(Math.round(latest.paceSeconds - averagePace))} 秒/km` : '',
      `已完成 ${summary.completedSessions}/${summary.elapsedSessions || 0} 堂（${summary.adherence}%）`
    ].filter(Boolean).join('；');
  if (!runs.length) {
    return {
      dataLabel,
      observation,
      verdict: '先維持正式課表',
      tone: 'caution',
      menuTitle: '本週活用菜單：不額外加課',
      steps: ['照正式課表完成輕鬆跑與長跑。', '至少累積 3 次 Garmin 跑步後，再開始用實跑配速、心率與跑量調整。'],
      guardrail: '目前資料不足，先建立規律比加強更重要。'
    };
  }
  if (qualityMode === 'skip' || recommendation?.tone === 'danger' || summary.adherence < 60) {
    return {
      dataLabel,
      observation,
      verdict: recommendation?.verdict || '本週優先恢復',
      tone: 'danger',
      menuTitle: '本週活用菜單：恢復版',
      steps: ['本週品質課改成 30–40 分鐘可對話的輕鬆跑，心率守在輕鬆跑區間。', '跑後做 10 分鐘小腿、臀部與髖部活動度；不加間歇、不補強度。'],
      guardrail: '這是降低負荷，不是偷懶；下週恢復穩定後再把品質課放回來。'
    };
  }
  if (qualityMode === 'reduce' || recommendation?.tone === 'caution') {
    return {
      dataLabel,
      observation,
      verdict: recommendation?.verdict || '維持，品質課降階',
      tone: 'caution',
      menuTitle: '本週活用菜單：保守加強版',
      steps: ['正式品質課保留，但主課只做原本的前 2/3；任何一組開始失控就改回輕鬆跑。', '本週總跑量不再增加，把長跑與收操完整做完。'],
      guardrail: '先把可控的品質做漂亮，不用靠硬撐完成所有組數。'
    };
  }
  return {
    dataLabel,
    observation,
    verdict: recommendation?.verdict || '可維持並小幅加強',
    tone: 'good',
    menuTitle: '本週活用菜單：微量加強',
    steps: ['選一堂輕鬆跑結束後，加 4 × 20 秒放鬆快步；每趟走或慢跑到呼吸恢復再開始。', '總跑量維持原課表，不額外加長跑或再加一堂品質課。'],
    guardrail: '快步是練跑姿與步頻，不是衝刺；腿沉、心率偏高或睡眠差就直接略過。'
  };
}

function renderLiveCoachCard(week = {}, nextWeek = {}) {
  const plan = liveCoachPlan();
  const mission = nextWeek.coachNote || '先照正式課表完成，不額外加課。';
  const hasCoachWeeklyPlan = Array.isArray(nextWeek.menu) && nextWeek.menu.length > 0;
  const statusLabel = hasCoachWeeklyPlan ? '照週報執行' : plan.verdict;
  const optionalAdjustment = hasCoachWeeklyPlan ? '' : `<div class="coach-summary-block is-menu"><div class="coach-summary-label">這週怎麼調整</div><div class="coach-summary-copy">${reviewEscape(plan.menuTitle)}</div><ol class="coach-summary-list">${plan.steps.map((step) => `<li>${reviewEscape(step)}</li>`).join('')}</ol><div class="coach-summary-copy muted">🛟 ${reviewEscape(plan.guardrail)}</div></div>`;
  const weatherBackup = hasCoachWeeklyPlan && nextWeek.weatherPlan
    ? `<div class="coach-summary-block is-menu"><div class="coach-summary-label">天氣備案</div><div class="coach-summary-copy muted">${reviewEscape(nextWeek.weatherPlan)}</div></div>`
    : '';
  return `<section class="coach-summary">
    <div class="coach-summary-head">
      <div><div class="coach-summary-kicker">Runner coach brief · ${reviewEscape(plan.dataLabel)}</div><div class="coach-summary-title">這週怎麼跑，一次說清楚</div><div class="coach-summary-goal">目標：${reviewEscape(currentTrainingGoalLabel())}</div></div>
      <span class="coach-summary-verdict">本週：${reviewEscape(statusLabel)}</span>
    </div>
    <div class="coach-summary-grid">
      <div class="coach-summary-block"><div class="coach-summary-label">本週唯一重點</div><div class="coach-summary-copy">${reviewEscape(mission)}</div></div>
      <div class="coach-summary-block"><div class="coach-summary-label">Garmin 近況</div><div class="coach-summary-copy muted">${reviewEscape(plan.observation)}</div></div>
      ${optionalAdjustment}
      ${weatherBackup}
    </div>
    ${coachGoalGapNote()}
  </section>`;
}

function registrationDistanceKm(value) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function selectedRegistrationRaceEntries() {
  const personId = appData.profile?.registrationPersonId;
  const entries = registrationRaceData?.entries;
  if (!personId || !Array.isArray(entries)) return [];
  const configuredDates = new Set(Array.isArray(appData.profile?.raceCheckpointDates) ? appData.profile.raceCheckpointDates : []);
  return entries
    .filter((entry) => entry?.personId === personId && configuredDates.has(String(entry.raceDate || '').slice(0, 10)))
    .map((entry) => ({ ...entry, date: String(entry.raceDate || '').slice(0, 10), distanceKm: registrationDistanceKm(entry.distance) }))
    .filter((entry) => entry.date && entry.distanceKm > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function raceCheckpointCandidate(entry) {
  if (!entry?.date || !entry.distanceKm) return null;
  const lower = Math.max(1, entry.distanceKm * 0.75);
  const upper = entry.distanceKm * 1.25;
  return garminActivityRecords()
    .filter((run) => run.date === entry.date && run.km >= lower && run.km <= upper && run.paceSeconds)
    .sort((a, b) => Math.abs(a.km - entry.distanceKm) - Math.abs(b.km - entry.distanceKm))[0] || null;
}

function raceCheckpointType(distanceKm) {
  if (Math.abs(distanceKm - 5) <= 0.6) return 'race_5k';
  if (Math.abs(distanceKm - 10) <= 1) return 'race_10k';
  if (Math.abs(distanceKm - 21.0975) <= 1.5) return 'race_half';
  return 'custom_race';
}

function formatRaceCheckpointResult(run) {
  const seconds = Math.round((run?.paceSeconds || 0) * (run?.km || 0));
  return seconds > 0 ? secToTime(seconds) : '—';
}

function selectRegistrationRunner(personId) {
  const person = (registrationRaceData?.people || []).find((item) => item.id === personId);
  if (!person || !appData.profile) return;
  const targetYear = String(appData.profile.targetDate || todayStr()).slice(0, 4);
  const checkpointDates = (registrationRaceData?.entries || [])
    .filter((entry) => entry?.personId === personId)
    .filter((entry) => String(entry.raceDate || '').startsWith(`${targetYear}-10-`))
    .filter((entry) => {
      const distanceKm = registrationDistanceKm(entry.distance);
      return distanceKm >= 8 && distanceKm <= 12;
    })
    .map((entry) => String(entry.raceDate).slice(0, 10))
    .filter((date, index, dates) => dates.indexOf(date) === index)
    .sort();
  appData.profile.registrationPersonId = personId;
  appData.profile.raceCheckpointDates = checkpointDates;
  saveData(appData);
  refreshCoachReviewPanels();
}

function recordRaceCheckpointResult(entryId) {
  const entry = selectedRegistrationRaceEntries().find((item) => item.id === entryId);
  const run = raceCheckpointCandidate(entry);
  if (!entry || !run) return;
  const assessment = {
    date: entry.date,
    type: raceCheckpointType(entry.distanceKm),
    result: formatRaceCheckpointResult(run),
    distanceKm: entry.distanceKm,
    rpe: 0,
    notes: `Garmin 賽事對照｜${entry.raceName || '十月檢查賽'}｜${run.km.toFixed(2)} km · ${run.pace || '配速未回傳'}${run.hr ? ` · HR ${run.hr}` : ''}`
  };
  saveAssessmentEntry(assessment);
  const assessmentIndex = (appData.assessments || []).findIndex((item) => item.date === assessment.date && item.type === assessment.type);
  const analysisHost = document.getElementById('progress-panel-analysis') || document.getElementById('training-analysis-content');
  if (analysisHost) analysisHost.innerHTML = renderTrainingAnalysis();
  showModal(
    '確認這場比賽成績？',
    `<p style="margin:0 0 10px;line-height:1.7"><b>${reviewEscape(entry.raceName || '十月檢查賽')}</b><br>${reviewEscape(entry.date)} · ${entry.distanceKm} km<br>Garmin 偵測：${run.km.toFixed(2)} km · ${reviewEscape(assessment.result)} · ${reviewEscape(run.pace || '配速未回傳')}${run.hr ? ` · HR ${run.hr}` : ''}</p><p style="margin:0;color:var(--c-text-muted);line-height:1.65">套用後才會以這場成績重算後續週的配速；已完成的課表與紀錄不會被覆寫。</p>`,
    [
      { label: '套用並調整後續課表', primary: true, action: () => applyAssessmentToPlan(assessmentIndex) },
      { label: '只保留成績', action: closeModal }
    ]
  );
}

function renderRaceCheckpointPanel() {
  if (registrationRaceLoadState === 'loading') {
    return '<div class="card" style="border-left:4px solid var(--c-primary)"><div class="card-title">🏁 十月實戰檢查</div><p style="margin:0;color:var(--c-text-muted)">正在讀取本機報名管理的賽事安排…</p></div>';
  }
  if (!registrationRaceData) return '';
  const people = Array.isArray(registrationRaceData.people) ? registrationRaceData.people : [];
  if (!appData.profile?.registrationPersonId) {
    const options = people.map((person) => `<option value="${reviewEscape(person.id)}">${reviewEscape(person.name || '未命名跑者')}</option>`).join('');
    return `<div class="card" style="border-left:4px solid var(--c-primary)"><div class="card-title">🏁 十月實戰檢查</div><p style="margin:4px 0 12px;color:var(--c-text-muted);line-height:1.65">10 月安排的 10K 賽事會作為連續三週的實戰檢查：第一場看速度基準、第二場看恢復與穩定、第三場再決定十一月如何調整。先選擇你的報名資料；此設定只保存在這台裝置。</p><select class="form-input" onchange="selectRegistrationRunner(this.value)"><option value="">選擇你的報名資料</option>${options}</select></div>`;
  }
  const entries = selectedRegistrationRaceEntries();
  if (!entries.length) {
    return '<div class="card" style="border-left:4px solid var(--c-orange)"><div class="card-title">🏁 十月實戰檢查</div><p style="margin:0;color:var(--c-text-muted)">目前選定的跑者沒有 10 月 8–12 km 賽事。可重新選擇報名資料，或在報名管理補上賽事。</p></div>';
  }
  const rows = entries.map((entry, index) => {
    const run = raceCheckpointCandidate(entry);
    const status = entry.date > todayStr()
      ? `尚未舉行 · 第 ${index + 1} 場檢查`
      : run
        ? `已偵測 Garmin 成績 · ${run.km.toFixed(2)} km · ${formatRaceCheckpointResult(run)}${run.hr ? ` · HR ${run.hr}` : ''}`
        : '尚未找到符合距離的 Garmin 跑步';
    const plan = index === 0 ? '看目前速度基準' : index === 1 ? '確認恢復與穩定性' : '依累積成果調整十一月';
    return `<div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--c-border);align-items:center"><div><b>${reviewEscape(entry.date)} · ${reviewEscape(entry.raceName || '10K 賽事')}</b><div style="font-size:13px;color:var(--c-text-muted);margin-top:3px">${entry.distanceKm} km · ${plan}<br>${reviewEscape(status)}${entry.isRegistered ? '' : ' · 報名尚未完成'}</div></div>${run ? `<button class="btn btn-primary" style="white-space:nowrap;font-size:12px;padding:7px 10px" data-entry-id="${reviewEscape(entry.id)}" onclick="recordRaceCheckpointResult(this.dataset.entryId)">確認成績</button>` : ''}</div>`;
  }).join('');
  return `<div class="card" style="border-left:4px solid var(--c-primary)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><div class="card-title">🏁 十月實戰檢查</div><p style="margin:4px 0 10px;color:var(--c-text-muted);line-height:1.65">賽後系統只會先配對 Garmin；按「確認成績」後，才會用結果調整未來課表。三場會一起看，不會只憑單場就大幅改動。</p></div><button class="btn btn-secondary" style="font-size:12px;padding:6px 10px;white-space:nowrap" onclick="appData.profile.registrationPersonId=''; appData.profile.raceCheckpointDates=[]; saveData(appData); refreshCoachReviewPanels()">更換跑者</button></div>${rows}</div>`;
}

async function loadRegistrationRaceCheckpoints() {
  registrationRaceLoadState = 'loading';
  refreshCoachReviewPanels();
  try {
    const response = await fetch('/api/registration-data', { cache: 'no-cache' });
    if (!response.ok) throw new Error('registration data unavailable');
    const data = await response.json();
    registrationRaceData = {
      people: Array.isArray(data?.people) ? data.people : [],
      entries: Array.isArray(data?.entries) ? data.entries : []
    };
    registrationRaceLoadState = 'ready';
  } catch {
    // 報名資料只在本機伺服器提供；公開網站不顯示此私人區塊。
    registrationRaceData = null;
    registrationRaceLoadState = 'unavailable';
  }
  refreshCoachReviewPanels();
}

function renderTrainingAnalysis() {
  const runs = coachRunRecords();
  const statusCard = renderTrainingStatusCard(appData.plan || []);
  const decisionCard = renderAutopilotDecisionCard(appData.plan || []);
  const checkpointPanel = renderRaceCheckpointPanel();
  if (!runs.length) return `${statusCard}${decisionCard}${checkpointPanel}<div class="card"><div class="card-title">📈 訓練分析</div><p style="color:var(--c-text-muted);margin:0">尚無 Garmin 資料；目前課表採「設定基準」模式，不會自行假設你的配速或恢復能力。完成至少 3 筆有效跑步同步後，才會顯示趨勢並校正未來週課表。</p></div>`;
  const trend = weeklyRunTrend(runs);
  const weeklySummaryCard = renderWeeklySummaryCard(trend, trainingDataHealth(appData.plan || []).summary.adherence);
  const recent = runs.slice(-4);
  const averagePace = recent.filter((run) => run.paceSeconds).reduce((sum, run, _, list) => sum + run.paceSeconds / list.length, 0);
  const averageHr = recent.filter((run) => run.hr).reduce((sum, run, _, list) => sum + run.hr / list.length, 0);
  const lastFourKm = trend.slice(-4).reduce((sum, item) => sum + item.km, 0);
  const averageCadence = recent.filter((run) => run.cadence).reduce((sum, run, _, list) => sum + run.cadence / list.length, 0);
  const elevation = recent.reduce((sum, run) => sum + (run.elevationGainM || 0), 0);
  const averageLoad = recent.filter((run) => run.trainingLoad).reduce((sum, run, _, list) => sum + run.trainingLoad / list.length, 0);
  const latestVo2 = [...runs].reverse().find((run) => run.vo2max)?.vo2max;
  const longestRun = runs.filter((run) => run.date >= addDaysToDateStr(todayStr(), -27)).reduce((max, run) => Math.max(max, Number(run.km) || 0), 0);
  const rampNote = (() => {
    const info = weeklyRampInfo(trend);
    if (!info) return '';
    const { prev, last, ramp } = info;
    const [icon, color, text] = ramp > 15
      ? ['🔴', 'var(--c-red)', `上週跑量比前週增加 ${ramp}%，超過安全增幅（10–15%），受傷風險升高；這週建議持平或下修。`]
      : ramp > 10
        ? ['🟡', 'var(--c-orange)', `上週跑量比前週增加 ${ramp}%，已達安全增幅上限（10–15%）；這週不要再加量。`]
        : ramp < -30
          ? ['🟡', 'var(--c-orange)', `上週跑量比前週大減 ${Math.abs(ramp)}%；若非減量週，這週從保守量恢復，不要直接跳回原量。`]
          : ['🟢', 'var(--c-green)', `上週跑量增幅 ${ramp >= 0 ? '+' : ''}${ramp}%，在安全範圍（≤10%）內。`];
    return `<div style="margin:14px 0 0;padding:10px 14px;border-left:3px solid ${color};border-radius:10px;background:var(--c-surface-alt);font-size:13px;line-height:1.6">${icon} <b>週增幅監控</b>：${text}（${prev.km} → ${last.km} km）</div>`;
  })();
  return `${statusCard}${decisionCard}${checkpointPanel}${renderLatestTrainingReport(runs)}${weeklySummaryCard}<div class="card"><div class="card-title">📈 長期訓練趨勢 <span style="font-size:0.65em;font-weight:normal;color:var(--c-text-muted)">Garmin 最近 ${runs.length} 筆</span></div>
    <div class="plan-metric-grid"><div class="plan-metric"><span class="plan-metric-label">近四週跑量</span><strong class="plan-metric-value">${lastFourKm.toFixed(1)} km</strong></div><div class="plan-metric"><span class="plan-metric-label">近四週最長跑</span><strong class="plan-metric-value">${longestRun ? `${longestRun.toFixed(1)} km` : '—'}</strong></div><div class="plan-metric"><span class="plan-metric-label">最近四趟平均配速</span><strong class="plan-metric-value">${formatPaceSeconds(averagePace)}</strong></div><div class="plan-metric"><span class="plan-metric-label">最近四趟平均心率</span><strong class="plan-metric-value">${averageHr ? `HR ${Math.round(averageHr)}` : '—'}</strong></div><div class="plan-metric"><span class="plan-metric-label">Garmin 資料截至</span><strong class="plan-metric-value">${reviewEscape(coachReviewData.analyticsUpdatedAt || coachReviewData.updatedAt)}</strong></div></div>
    ${rampNote}
    <div style="margin-top:20px"><b style="font-size:15px">進階訓練指標</b><p style="font-size:13px;color:var(--c-text-muted);margin:4px 0 10px">只顯示 Garmin 有回傳的數值；這些資料會提供教練建議作為恢復與負荷判讀的依據。</p><div class="plan-metric-grid"><div class="plan-metric"><span class="plan-metric-label">最近四趟平均步頻</span><strong class="plan-metric-value">${averageCadence ? `${Math.round(averageCadence)} spm` : '—'}</strong></div><div class="plan-metric"><span class="plan-metric-label">最近四趟累積爬升</span><strong class="plan-metric-value">${elevation ? `${Math.round(elevation)} m` : '—'}</strong></div><div class="plan-metric"><span class="plan-metric-label">最近四趟平均負荷</span><strong class="plan-metric-value">${averageLoad ? Math.round(averageLoad) : '—'}</strong></div><div class="plan-metric"><span class="plan-metric-label">最近 VO₂ Max</span><strong class="plan-metric-value">${latestVo2 || '—'}</strong></div></div></div>
    <div class="analysis-chart-grid"><section class="analysis-chart-card"><b>週跑量趨勢</b><p style="font-size:13px;color:var(--c-text-muted);margin:4px 0 0">每週總公里數，包含額外跑步。</p>${renderVolumeBars(trend)}</section><section class="analysis-chart-card"><div class="analysis-chart-heading"><div><b>最近跑步配速</b><p>最新 12 趟；以每公里配速呈現，數字越小越快。</p></div><span class="pace-trend-badge">Garmin 實跑</span></div>${renderPaceTrend(runs)}</section></div>
  </div>`;
}

function coachGoalGapDiffMin() {
  const coachTarget = coachReviewData?.goal?.target;
  const myTime = appData.profile?.targetTime;
  if (!coachTarget || !myTime) return null;
  const coachMatch = String(coachTarget).match(/(\d+):(\d{2})/);
  if (!coachMatch) return null;
  const coachSec = parseInt(coachMatch[1], 10) * 3600 + parseInt(coachMatch[2], 10) * 60;
  const mySec = timeToSec(myTime);
  if (!mySec || !coachSec) return null;
  const diffMin = Math.round((coachSec - mySec) / 60);
  return Math.abs(diffMin) < 6 ? null : diffMin;
}

function coachGoalGapNote(compact = false) {
  // 教練評估在檢測日之前只是持續滾動的推測，不是實測結果；
  // 沒有實際做過檢測（appData.assessments）就不該拿這個推測去說「目標需要校準」。
  if (!appData.assessments?.length) return '';
  const coachTarget = coachReviewData?.goal?.target;
  const myTime = appData.profile?.targetTime;
  if (!coachTarget || !myTime) return '';
  const coachMatch = String(coachTarget).match(/(\d+):(\d{2})/);
  if (!coachMatch) return '';
  const coachSec = parseInt(coachMatch[1], 10) * 3600 + parseInt(coachMatch[2], 10) * 60;
  const mySec = timeToSec(myTime);
  if (!mySec || !coachSec) return '';
  const diffMin = Math.round((coachSec - mySec) / 60);
  if (Math.abs(diffMin) < 6) return '';
  const dist = GOAL_DIST[appData.profile.goal] || 21.0975;
  const paceGapSec = Math.round((coachSec - mySec) / dist);
  if (diffMin > 0) {
    const body = `你的訓練設定目標 <b>${reviewEscape(myTime)}</b> 比教練評估（${reviewEscape(coachTarget)}）快 ${diffMin} 分鐘（每公里快約 ${paceGapSec} 秒）。課表配速是照 ${reviewEscape(myTime)} 生成的，恐超出目前能力，練了容易受傷或爆掉。建議到「⚙️ 修改設定」把目標時間改成教練評估值，或先照教練當週課表執行。`;
    return compact
      ? `<div class="week-goal-alert caution"><span aria-hidden="true">⚠️</span><span><strong>目標需要校準</strong><br>${body}</span></div>`
      : `<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:var(--c-orange)">⚠️ ${body}</p>`;
  }
  const body = `你的訓練設定目標 ${reviewEscape(myTime)} 比教練評估（${reviewEscape(coachTarget)}）保守 ${Math.abs(diffMin)} 分鐘，課表強度會偏低；若想跟上教練進度，可把目標時間調快。`;
  return compact
    ? `<div class="week-goal-alert info"><span aria-hidden="true">ℹ️</span><span><strong>目標設定較保守</strong><br>${body}</span></div>`
    : `<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:var(--c-text-muted)">ℹ️ ${body}</p>`;
}

function coachPeriodization() {
  return Array.isArray(coachReviewData?.periodization) ? coachReviewData.periodization : [];
}

function coachPhaseForDate(dateStr) {
  if (!dateStr) return null;
  const t = new Date(`${dateStr}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  for (const phase of coachPeriodization()) {
    const start = new Date(`${phase.start}T00:00:00`).getTime();
    if (Number.isNaN(start)) continue;
    const end = start + (phase.weeks || 1) * 7 * 86400000;
    if (t >= start && t < end) return phase;
  }
  return null;
}

function coachPhaseForWeek(week) {
  if (!Array.isArray(week?.days)) return null;
  // 計畫週與教練階段的週界不同（週日 vs 週一起算），用多數決：
  // 一週七天各自判定階段，取涵蓋天數最多者，避免跨界那 1–2 天拉錯階段。
  const counts = new Map();
  for (const day of week.days) {
    const phase = coachPhaseForDate(day.dateStr);
    if (!phase) continue;
    const key = `${phase.phase}:${phase.start}`;
    const entry = counts.get(key) || { phase, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best ? best.phase : null;
}

function coachWeekMatches(week) {
  const weekStart = coachReviewData?.nextWeek?.weekStart;
  if (!weekStart || !Array.isArray(week?.days)) return false;
  return week.days.some((day) => day.dateStr === weekStart);
}

function effectiveWeekVolumeTarget(week) {
  const formalKm = Number(week?.targetKm) || 0;
  if (!coachWeekMatches(week) || !coachReviewData?.nextWeek?.targetKm) {
    return { numericKm: formalKm, display: formalKm ? `${formalKm} km` : '—', source: '正式課表' };
  }
  const raw = String(coachReviewData.nextWeek.targetKm);
  const values = (raw.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  const numericKm = values.length > 1 ? (values[0] + values[1]) / 2 : (values[0] || formalKm);
  return { numericKm, display: `${raw} km`, source: '教練本週目標' };
}

function coachPhaseEmoji(label) {
  if (!label) return '📍';
  if (label.includes('重建')) return '🏗️';
  if (label.includes('降載')) return '🌿';
  if (label.includes('減量')) return '⬇️';
  if (label.includes('基礎')) return '🔥';
  if (label.includes('能力')) return '💪';
  if (label.includes('專項')) return '🎯';
  return '📍';
}

function coachMenuForCurrentSchedule(menu) {
  const profile = appData.profile || {};
  const dayState = Array.isArray(profile.dayState) ? profile.dayState : [];
  const trainingDows = dayState.map((state, dow) => state >= 1 ? dow : -1).filter((dow) => dow >= 0);
  const longDow = dayState.indexOf(2);
  const entries = Array.isArray(menu) ? menu : [];
  if (!trainingDows.length || !entries.length) return entries.map((entry) => ({ ...entry, scheduledDow: null }));

  const longIndex = entries.findIndex((entry) => /長跑|long/i.test(String(entry.plan || '')));
  const longEntry = longIndex >= 0 ? entries[longIndex] : null;
  const otherEntries = entries.filter((_, index) => index !== longIndex);
  let otherIndex = 0;
  return trainingDows.map((dow) => {
    const entry = dow === longDow && longEntry
      ? longEntry
      : otherEntries[otherIndex++] || null;
    return entry ? { ...entry, scheduledDow: dow } : null;
  }).filter(Boolean);
}

function formalCoachFallbackMenu(preferredWeekStart = '') {
  const weeks = appData.plan || [];
  const today = todayStr();
  const selectedWeek = weeks.find((week) => (week.days || []).some((day) => day.dateStr === preferredWeekStart))
    || weeks.find((week) => (week.days || []).some((day) => day.dateStr > today))
    || weeks[currentWeek - 1]
    || null;
  if (!selectedWeek) return { week: null, menu: [] };
  const menu = (selectedWeek.days || [])
    .filter((day) => day.type !== 'rest')
    .map((day) => ({
      day: DOW_NAMES[day.dow] || '',
      scheduledDow: day.dow,
      plan: [day.task || '依正式課表完成', day.pace, day.hrTarget].filter(Boolean).join(' · ')
    }));
  return { week: selectedWeek, menu };
}

function renderCoachDataSignals() {
  const recent = garminActivityRecords().slice(-4);
  if (!recent.length) return '';
  const average = (field) => {
    const values = recent.map((run) => run[field]).filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const cadence = average('cadence');
  const load = average('trainingLoad');
  const aerobicTe = average('aerobicTe');
  const anaerobicTe = average('anaerobicTe');
  const latestVo2 = [...recent].reverse().find((run) => run.vo2max)?.vo2max;
  const metrics = [
    cadence && ['步頻基準', `${Math.round(cadence)} spm`],
    load && ['平均訓練負荷', String(Math.round(load))],
    aerobicTe && ['有氧訓練效果', aerobicTe.toFixed(1)],
    anaerobicTe && ['無氧訓練效果', anaerobicTe.toFixed(1)],
    latestVo2 && ['最近 VO₂ Max', String(latestVo2)]
  ].filter(Boolean);
  if (!metrics.length) return '';
  return `<div class="coach-signals">
    <div class="coach-section-title">⌚ Garmin 進階觀測</div>
    <div class="plan-metric-grid">${metrics.map(([label, value]) => `<div class="plan-metric"><span class="plan-metric-label">${reviewEscape(label)}</span><strong class="plan-metric-value">${reviewEscape(value)}</strong></div>`).join('')}</div>
    <p class="coach-fineprint">教練建議會以這些數值搭配跑量、配速與心率判讀恢復狀態。</p>
  </div>`;
}

function renderGarminActualCard() {
  if (!coachReviewData?.week) {
    return `<div class="card" id="plan-week-garmin-actual"><div class="card-title">⌚ 本週實績</div><p style="color:var(--c-text-muted);font-size:14px;margin:0">尚無可用 Garmin 實績。課表會先依目標日期、目前週跑量、最長跑、可訓練日與傷痛設定建立保守基準；收到至少 3 筆有效跑步後，才會用實跑配速、心率與完成度校正未來週。</p></div>`;
  }
  const week = coachReviewData.week;
  const runs = garminActivityRecords();
  const rows = runs.slice().reverse().map((run) => `<tr><td>${reviewEscape(run.date)}</td><td>${reviewEscape(run.km)} km</td><td>${reviewEscape(run.pace)}</td><td>${run.hr ? `HR ${reviewEscape(run.hr)}` : '—'}</td></tr>`).join('');
  return `<div class="card" id="plan-week-garmin-actual"><div class="card-title">⌚ 本週實績 <span style="font-weight:normal;font-size:0.7em;opacity:0.7">Garmin · 資料截至 ${reviewEscape(coachReviewData.updatedAt)}</span></div>
    <div class="progress-stats"><span>跑步 <strong>${reviewEscape(week.runs)}</strong> 次</span><span>實際 <strong>${reviewEscape(week.km)} km</strong></span><span>最長 <strong>${reviewEscape(week.longKm)} km</strong></span><span>週均 <strong>HR ${reviewEscape(week.avgHr)}</strong></span></div>
    <details style="margin-top:14px"><summary><b>查看最近 Garmin 跑步明細（${runs.length} 筆）</b></summary><div class="table-scroll"><table class="log-table" style="margin-top:8px"><thead><tr><th>日期</th><th>距離</th><th>配速</th><th>心率</th></tr></thead><tbody>${rows || '<tr><td colspan="4">尚無可顯示紀錄</td></tr>'}</tbody></table></div></details>
  </div>`;
}

function renderCoachPeriodizationTimeline() {
  const coachPhases = coachPeriodization();
  const formalPhases = (() => {
    const groups = [];
    (appData.plan || []).forEach((week) => {
      const key = `${week.phase || ''}:${week.phaseLabel || ''}`;
      const existing = groups.at(-1);
      if (existing?.key === key) {
        existing.endWeek = week;
        existing.weeks += 1;
      } else {
        groups.push({ key, phase: week.phaseLabel || week.phase || '訓練階段', startWeek: week, endWeek: week, weeks: 1 });
      }
    });
    return groups.map((group) => ({
      ...group,
      start: group.startWeek.days?.[0]?.dateStr,
      km: `${group.startWeek.targetKm}–${group.endWeek.targetKm} km / 週`,
      focus: getPhaseRuleText(group.startWeek, appData.profile || {}, (appData.plan || []).length),
      isFormal: true
    }));
  })();
  const phases = coachPhases.length ? coachPhases : formalPhases;
  if (!phases.length) return '';
  const currentPhase = coachPhases.length
    ? coachPhaseForDate(todayStr())
    : formalPhases.find((phase) => phase.startWeek.weekNum <= currentWeek && phase.endWeek.weekNum >= currentWeek);
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const rows = phases.map((phase) => {
    const start = new Date(`${phase.start}T00:00:00`);
    const end = new Date(start.getTime() + (phase.weeks || 1) * 7 * 86400000 - 86400000);
    const isCurrent = currentPhase && (phase.isFormal
      ? currentPhase.key === phase.key
      : currentPhase.start === phase.start && currentPhase.phase === phase.phase);
    return `<div class="periodization-row ${isCurrent ? 'is-current' : ''}">
      <div class="periodization-phase">${coachPhaseEmoji(phase.phase)} ${reviewEscape(phase.phase)}${isCurrent ? '<span class="coach-key-badge">目前階段</span>' : ''}</div>
      <div class="periodization-meta"><span>${fmt(start)}–${fmt(end)}・${phase.weeks} 週</span><b>${reviewEscape(phase.km)} km</b></div>
      ${phase.focus ? `<div class="periodization-focus">${reviewEscape(phase.focus)}</div>` : ''}
    </div>`;
  }).join('');
  return `<div class="card">
    <div class="card-title">🗓️ 訓練週期總覽</div>
    <p style="font-size:13px;color:var(--c-text-muted);margin:4px 0 14px">${coachPhases.length ? '依教練週報的階段規劃顯示。' : '目前使用你的正式課表週期；教練週報沒有週期資料時，這裡仍會保留完整階段規劃。'}</p>
    <div class="periodization-list">${rows}</div>
  </div>`;
}

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

function jargonNotesFor(texts) {
  const combined = texts.join(' ');
  const notes = [];
  const seen = new Set();
  for (const [pattern, note] of TRAINING_JARGON_ENTRIES) {
    if (pattern.test(combined) && !seen.has(note)) {
      seen.add(note);
      notes.push(note);
    }
  }
  return notes;
}

function renderLastRecalibrationCard() {
  const recalibration = appData.lastRecalibration;
  if (!recalibration?.reasons?.length) return '';
  const items = recalibration.reasons.map((reason) => `<li>${reviewEscape(reason)}</li>`).join('');
  return `<div style="margin:0 0 12px;padding:10px 12px;border-left:3px solid var(--c-primary);border-radius:10px;background:var(--c-surface-alt);font-size:13px;line-height:1.6">
    <b>📊 上次滾動校準（${reviewEscape(recalibration.date)}）</b>
    <ul style="margin:6px 0 0;padding-left:18px">${items}</ul>
  </div>`;
}

function renderHistoryCoachContext() {
  const context = appData.profile?.historyContext || appData.nextCycleCoachContext;
  if (!context?.facts?.length) return '';
  return `<div class="coach-summary" style="margin-top:0"><div class="coach-summary-kicker">已引用的歷史週期</div><div class="coach-summary-title">${reviewEscape(context.headline || '歷史訓練摘要')}</div><ul class="coach-summary-list">${context.facts.map((fact) => `<li>${reviewEscape(fact)}</li>`).join('')}</ul><div class="coach-summary-copy muted">這份摘要會和目前 Garmin 實績一起提供給教練判讀；它只提供背景，不會自行覆寫正式課表。</div><div class="training-status-actions" style="margin-top:10px;justify-content:flex-start"><button class="btn btn-secondary" onclick="clearHistoryCoachContext()">不引用這份歷史</button></div></div>`;
}

function clearHistoryCoachContext() {
  const setupVisible = document.getElementById('view-setup')?.classList.contains('active');
  if (appData.profile?.historyContext) delete appData.profile.historyContext;
  appData.nextCycleCoachContext = null;
  saveData(appData);
  refreshCoachReviewPanels();
  if (!appData.profile || setupVisible) {
    renderSetupView();
    showView('setup');
  }
}

function renderCoachReviewPanel() {
  if (!coachReviewData) {
    return `${renderTrainingStatusCard(appData.plan || [])}${renderHistoryCoachContext()}${renderEarlyCoachPlanningCard()}${renderLocalGarminPairingCard()}<div class="card"><div class="card-title">🏃 教練建議</div><p style="color:var(--c-text-muted);font-size:14px;margin:0">解鎖加密週報後，這裡會顯示 Garmin 分析、跑量趨勢與下週參考菜單。</p></div>`;
  }
  const week = coachReviewData.week || {};
  const nextWeek = coachReviewData.nextWeek || {};
  const coachMenu = coachMenuForCurrentSchedule(nextWeek.menu);
  const formalFallback = coachMenu.length ? null : formalCoachFallbackMenu(nextWeek.weekStart);
  const scheduledMenu = coachMenu.length ? coachMenu : formalFallback.menu;
  const menuSource = coachMenu.length ? 'Garmin 教練參考菜單' : '正式課表（教練週報未提供菜單）';
  const menuLabel = coachMenu.length ? nextWeek.label : `第 ${formalFallback.week?.weekNum || currentWeek} 週正式課表`;
  const menuTargetKm = coachMenu.length ? nextWeek.targetKm : (formalFallback.week?.targetKm ?? '—');
  const scheduleDays = scheduledMenu.map((item) => DOW_NAMES[item.scheduledDow] || item.day).join('、');
  const notes = (coachReviewData.history || []).slice().reverse().map((item) => `<li>${reviewEscape(item.date)}：${reviewEscape(item.summary)}</li>`).join('');
  const garminOnlyNotice = coachReviewData.sourceMode === 'garmin-only'
    ? `<div style="margin:0 0 12px;padding:10px 12px;border-left:3px solid var(--c-blue);border-radius:10px;background:var(--c-surface-alt);font-size:13px;line-height:1.6"><b>Garmin 自動駕駛模式</b><br>雲端已同步實跑資料；課表頁會依近期跑量與頻率產生輔助菜單。正式課表維持原樣，不會被暗中覆寫。</div>`
    : '';
  const highlightMenuText = (text) => reviewEscape(text)
    .replace(/(\d+(?:\.\d+)?\s*(?:km|m))/gi, '<b class="coach-menu-highlight">$1</b>')
    .replace(/(HR\s*[≤~]?\s*\d+(?:\s*[–-]\s*\d+)?)/gi, '<b class="coach-menu-highlight">$1</b>');
  const menuRows = scheduledMenu.map((item) => {
    const dayName = DOW_NAMES[item.scheduledDow] || item.day || '';
    const isLong = /長跑|long/i.test(String(item.plan || ''));
    const planText = String(item.plan || '');
    const splitIdx = planText.indexOf('目的：');
    const mainText = splitIdx >= 0 ? planText.slice(0, splitIdx).replace(/[。\s]+$/, '。') : planText;
    const purposeText = splitIdx >= 0 ? planText.slice(splitIdx + 3).replace(/^[：:\s]+/, '') : '';
    return `<div class="coach-menu-row ${isLong ? 'is-long' : ''}">
      <span class="coach-menu-day">${reviewEscape(dayName)}</span>
      <div class="coach-menu-body">
        ${isLong ? '<div class="coach-menu-head-line"><span class="coach-key-badge">本週關鍵課</span></div>' : ''}
        <div>${highlightMenuText(mainText)}</div>
        ${purposeText ? `<div class="coach-menu-purpose">🎯 ${reviewEscape(purposeText)}</div>` : ''}
        ${(() => { const explicitSteps = Array.isArray(item.steps) ? item.steps : []; const confidence = explicitSteps.length ? 'coach' : coachStructureConfidence(planText); const structure = coachWorkoutStructure(planText, { km: registrationDistanceKm(planText) || 5 }, explicitSteps); return confidence === 'note-only' ? '<div class="coach-fineprint" style="margin-top:8px">⌚ 此課程缺少可安全轉換的距離／時間處方，會保留為教練備註，不會自動寫入 Garmin 結構化課程。</div>' : `<details class="coach-jargon" open style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;font-weight:800;color:var(--c-primary-hover)">⌚ Garmin 課程結構 <small style="color:var(--c-text-muted)">· ${confidence === 'coach' ? '教練原始步驟' : '由教練文字轉換'}</small></summary>${renderGarminWorkoutStructure({ km: registrationDistanceKm(planText) || 5, workoutStructure: structure })}</details>`; })()}
      </div>
    </div>`;
  }).join('');
  const courseSection = coachMenu.length
    ? `<div class="coach-menu-card">
        <div class="coach-menu-head"><div><div class="plan-overview-kicker">教練調整後的課程</div><b class="coach-menu-title">${reviewEscape(menuLabel)}</b></div><span class="coach-menu-km">${reviewEscape(menuTargetKm)} km</span></div>
        <p class="coach-fineprint" style="margin:4px 0 10px">這是 Garmin 教練週報提供的調整內容，已依目前訓練日重排：${reviewEscape(scheduleDays)}</p>
        <div class="coach-menu-list">${menuRows || '<div class="coach-fineprint">目前沒有可顯示的跑步課程。</div>'}</div>
        ${(() => {
          const jargon = jargonNotesFor(scheduledMenu.map((item) => item.plan || ''));
          if (!jargon.length) return '';
          return `<details class="coach-jargon" style="margin-top:10px"><summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--c-text-muted)">📖 這週出現的訓練名詞是什麼意思？</summary><ul style="margin:8px 0 0;padding-left:18px;font-size:12.5px;color:var(--c-text-muted);line-height:1.6">${jargon.map((note) => `<li>${reviewEscape(note)}</li>`).join('')}</ul></details>`;
        })()}
      </div>`
    : `<div class="coach-menu-card">
        <div class="coach-menu-head"><div><div class="plan-overview-kicker">正式課表維持原樣</div><b class="coach-menu-title">本週課程不重複列在這裡</b></div><span class="coach-menu-km">${reviewEscape(menuTargetKm)} km</span></div>
        <p class="coach-fineprint" style="margin:6px 0 12px">教練本次依 Garmin 給的是判讀與活用建議；完整每天課程請在「本週課表」查看，避免和輔助菜單重複。</p>
        <button class="btn btn-secondary" onclick="showWeekPlanFromStatus()">查看本週正式課表</button>
      </div>`;
  return `${renderTrainingStatusCard(appData.plan || [])}<div class="card coach-panel">
    <div class="coach-head">
      <div class="card-title" style="margin:0">🏃 教練建議</div>
      <span class="coach-pill">資料截至 ${reviewEscape(coachReviewData.updatedAt)}</span>
      <span class="coach-pill">${reviewEscape(coachScheduleLabel())}</span>
      ${(() => {
        const status = coachRunStatus();
        if (!status) return '';
        const link = status.actionUrl ? ` <a class="coach-pill" href="${reviewEscape(status.actionUrl)}" target="_blank" rel="noopener">${reviewEscape(status.actionLabel)} ↗</a>` : '';
        return `<span class="coach-pill status-${status.level}">${reviewEscape(status.text)}</span>${link}`;
      })()}
      <button class="btn btn-secondary coach-lock-btn" onclick="lockCoachReview()">🔒 鎖定</button>
    </div>
    ${garminOnlyNotice}
    ${renderHistoryCoachContext()}
    ${renderLastRecalibrationCard()}
    ${renderPlanChangeTimeline()}
    ${renderLiveCoachCard(week, nextWeek)}
    ${renderEarlyCoachPlanningCard()}
    ${renderLocalGarminPairingCard()}
    ${courseSection}
    ${renderCoachDataSignals()}
    <p class="coach-fineprint" style="margin-top:12px">這是依 Garmin 實績產生的參考安排；你的正式課表不會自動被覆寫。</p>
    ${notes ? `<details class="coach-history"><summary><b>分析快照歷史</b>（不覆蓋目前訓練設定）</summary><ul>${notes}</ul></details>` : ''}
  </div>`;
}

function earlyCoachPlanningEligibility() {
  const week = appData.plan?.[currentWeek - 1];
  const nextWeek = appData.plan?.[currentWeek];
  if (!week || !nextWeek) return { eligible: false, reason: '本輪沒有下一週可提前安排。' };
  if (appData.safetyHold?.active) return { eligible: false, reason: '傷痛保護模式啟用中；請先完成恢復確認。' };
  if (!coachReviewData) {
    return {
      eligible: false,
      reason: coachReviewLoadState === 'loading'
        ? '正在核對 Garmin 已同步紀錄，完成前不會把課程誤判為未完成。'
        : coachReviewLoadState === 'locked'
          ? '請先解鎖教練建議，系統才能核對 Garmin 已同步紀錄。'
          : '目前無法讀取 Garmin 已同步紀錄，請重新整理後再試。'
    };
  }
  const plannedSessions = (week.days || []).filter((day) => day.type !== 'rest' && !day.isMakeup);
  if (!plannedSessions.length) return { eligible: false, reason: '本週沒有可提前結案的跑步課。' };
  const completedDates = new Set([...(appData.log || []).map((entry) => entry.date), ...plannedSessions.filter((day) => day.status === 'done').map((day) => day.dateStr)]);
  const garminRunsByDate = new Map(garminActivityRecords().map((run) => [run.date, { actualKm: Number(run.km) || 0, source: 'garmin' }]));
  const pending = plannedSessions.filter((day) => !completedDates.has(day.dateStr) && !activityCompletesDay(day, garminRunsByDate.get(day.dateStr)));
  if (pending.length) return { eligible: false, reason: `尚有 ${pending.length} 堂跑步課未完成。` };
  return { eligible: true, plannedSessions };
}

function renderEarlyCoachPlanningCard() {
  const eligibility = earlyCoachPlanningEligibility();
  const completed = eligibility.plannedSessions?.length || 0;
  return `<div class="coach-setting-card" style="margin:14px 0"><div class="coach-setting-value">手動提前排課</div><div class="coach-fineprint">${eligibility.eligible ? `本週 ${completed} 堂排定跑步課均已完成，可先做恢復檢核並提前安排下週。休息與居家肌力不列入完成門檻，也不會被硬塞或自動補跑。` : reviewEscape(eligibility.reason)}</div><div class="training-status-actions" style="margin-top:10px;justify-content:flex-start"><button class="btn btn-secondary" type="button" onclick="openEarlyCoachPlanning()" ${eligibility.eligible ? '' : 'disabled'}>手動提前排定下週</button></div></div>`;
}

function openEarlyCoachPlanning() {
  const eligibility = earlyCoachPlanningEligibility();
  if (!eligibility.eligible) return;
  const checks = CHECKIN_QUESTIONS.slice(1).map((question, index) => `<label class="checkin-safety"><input id="early-check-${index + 1}" type="checkbox" style="margin-top:3px">${reviewEscape(question)}</label>`).join('');
  showModal('提前排定下週', `<p style="margin:0 0 12px;line-height:1.65">本週排定的跑步課已完成。系統只會依恢復狀態微調<b>下一週尚未執行的課程</b>；若有疲勞或疼痛，仍會降載並移除品質課。</p><div class="checkin-safety" style="background:var(--c-surface-alt)">✓ 已完成 ${eligibility.plannedSessions.length} 堂排定跑步課</div>${checks}<div class="form-group" style="margin-top:14px"><label class="form-label" for="early-fatigue">目前整體疲勞 (1–5)</label><input class="form-input" id="early-fatigue" type="number" min="1" max="5" placeholder="3"><div class="field-help">4–5 會自動降載；有疼痛請不要勾選「身體無異常疲勞或疼痛」。</div></div><div class="form-group"><label class="form-label" for="early-note">提前排課備註（選填）</label><input class="form-input" id="early-note" type="text" maxlength="240" placeholder="例：本週跑步課已提前完成，週末只安排輕鬆恢復"></div>`, [
    { label: '依恢復狀態提前排定', primary: true, action: submitEarlyCoachPlanning },
    { label: '取消', action: closeModal }
  ]);
}

function refreshCoachReviewPanels() {
  if (appData.plan?.length && document.getElementById('plan-tab-week')) {
    jumpToPhaseWeek(currentWeek);
  } else {
    const weekHost = document.getElementById('plan-week-garmin-actual');
    if (weekHost) weekHost.outerHTML = renderGarminActualCard();
  }
  const coachHost = document.getElementById('coach-review-content');
  if (coachHost) coachHost.innerHTML = renderCoachReviewPanel();
  const progressHost = document.getElementById('plan-tab-progress');
  if (progressHost) progressHost.innerHTML = renderProgressHub(appData.profile, appData.plan);
}

function paceToMinutes(pace) {
  const match = String(pace || '').match(/^(\d+):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) + Number(match[2]) / 60;
}

function syncGarminRunsToPlan(review) {
  if (!appData.plan?.length || !review) return;
  const runsByDate = new Map(garminActivityRecords().filter((run) => run?.date).map((run) => [run.date, run]));
  const logByDate = new Map((appData.log || []).map((entry, index) => [entry.date, index]));
  let changed = false;

  appData.plan.forEach((week) => week.days.forEach((day) => {
    const run = runsByDate.get(day.dateStr);
    if (!run || day.type === 'rest') return;
    const actualKm = Number(run.km) || 0;
    const actualTimeMins = Math.round(paceToMinutes(run.fullPace || run.pace) * actualKm);
    const entry = {
      date: day.dateStr,
      type: day.type,
      plannedKm: day.km || 0,
      actualKm,
      actualTimeMins,
      rpe: 0,
      notes: 'Garmin 同步',
      source: 'garmin'
    };
    const existingIndex = logByDate.get(day.dateStr);
    if (existingIndex === undefined) {
      appData.log.push(entry);
      logByDate.set(day.dateStr, appData.log.length - 1);
      changed = true;
    } else if (appData.log[existingIndex].source === 'garmin') {
      appData.log[existingIndex] = entry;
      changed = true;
    }
    if (activityCompletesDay(day, entry) && (day.status !== 'done' || appData.dayStatuses?.[day.dateStr] !== 'done')) {
      day.status = 'done';
      appData.dayStatuses = appData.dayStatuses || {};
      appData.dayStatuses[day.dateStr] = 'done';
      changed = true;
    }
  }));

  const planDays = appData.plan.flatMap((week) => week.days || []);
  const autoCredits = makeupCompletionCredits(planDays, runsByDate, todayStr());
  autoCredits.forEach((credit, sourceDate) => {
    if (credit.source !== 'garmin-auto') return;
    const sourceDay = planDays.find((day) => day.dateStr === sourceDate);
    const targetDay = planDays.find((day) => day.dateStr === credit.makeupDate);
    const run = runsByDate.get(credit.makeupDate);
    if (!sourceDay || !targetDay || !run || targetDay.type !== 'rest') return;
    applyMakeupAssignment(sourceDay, targetDay);
    appData.makeupRecords = normalizeMakeupRecords(appData.makeupRecords);
    appData.makeupRecords[sourceDate] = { targetDate: credit.makeupDate, source: 'garmin-auto' };
    const entry = {
      date: targetDay.dateStr,
      type: targetDay.type,
      plannedKm: targetDay.km || 0,
      actualKm: Number(run.km) || 0,
      actualTimeMins: Math.round(paceToMinutes(run.fullPace || run.pace) * (Number(run.km) || 0)),
      rpe: 0,
      notes: 'Garmin 自動認列補跑',
      source: 'garmin'
    };
    const existingIndex = logByDate.get(targetDay.dateStr);
    if (existingIndex === undefined) {
      appData.log.push(entry);
      logByDate.set(targetDay.dateStr, appData.log.length - 1);
    } else if (appData.log[existingIndex].source === 'garmin') {
      appData.log[existingIndex] = entry;
    }
    if (activityCompletesDay(targetDay, entry)) {
      targetDay.status = 'done';
      appData.dayStatuses = normalizeDayStatuses(appData.dayStatuses);
      appData.dayStatuses[targetDay.dateStr] = 'done';
    }
    recordTrainingEvent('makeup_auto_credited', { source: 'garmin', sourceDate, targetDate: targetDay.dateStr, detail: `${Number(run.km) || 0} km` });
    changed = true;
  });

  if (changed) saveData(appData);
}

function renderPhaseTabs(plan) {
  const useCoach = coachPeriodization().length > 0;
  const weekKey = (week) => {
    if (useCoach) {
      const coachPhase = coachPhaseForWeek(week);
      if (coachPhase) return { name: `coach:${coachPhase.phase}:${coachPhase.start}`, label: coachPhase.phase, coach: true };
    }
    return { name: week.phase, label: week.phaseLabel, coach: false };
  };
  const phases = [];
  let lastPhase = null;
  plan.forEach(week => {
    const key = weekKey(week);
    if (!lastPhase || lastPhase.name !== key.name) {
      lastPhase = { ...key, start: week.weekNum, end: week.weekNum };
      phases.push(lastPhase);
    } else {
      lastPhase.end = week.weekNum;
    }
  });
  const currentName = plan[currentWeek - 1] ? weekKey(plan[currentWeek - 1]).name : null;
  const emojiMap = { base: '🏗️', build: '🔥', build1: '🔥', build2: '💪', peak: '🎯', taper: '⬇️', light: '🌱', progress: '📈', solid: '💪', maintain: '✓' };
  const alignedNote = useCoach ? '<div class="plan-alignment-note">🧭 <span>週期已對齊教練規劃，課表更新會自動同步</span></div>' : '';
  return `${alignedNote}<div class="phase-tabs">${phases.map(phase => {
    const isCurrent = phase.name === currentName;
    const isDone = phase.end < currentWeek;
    const emoji = phase.coach ? coachPhaseEmoji(phase.label) : (emojiMap[phase.name] || '📍');
    return `<button type="button" class="phase-tab ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}" onclick="jumpToPhaseWeek(${phase.start})" aria-label="切換至${phase.label}第 ${phase.start} 週">
      ${emoji} ${phase.label} W${phase.start}${phase.end > phase.start ? '–' + phase.end : ''}
    </button>`;
  }).join('')}</div>`;
}

function jumpToPhaseWeek(weekNum) {
  currentWeek = weekNum;
  saveUiState({ week: weekNum });
  // innerHTML 重繪會讓瀏覽器把捲動重置回頂，先記住再還原
  const scroller = document.scrollingElement || document.documentElement;
  const scrollBefore = scroller.scrollTop;
  // 必須與 renderPlanView 的週分頁組成一致：boot 後所有重繪都走這裡，
  // 少列的卡片（automation brief、教練信）會永遠消失在畫面上
  document.getElementById('plan-tab-week').innerHTML = `
    ${renderWeekOverviewCard(appData.profile, appData.plan)}
    ${renderRaceWeekCard(appData.profile)}
    ${renderPhaseTabs(appData.plan)}
    ${renderWeekSection(appData.plan)}`;
  const progressHost = document.getElementById('plan-tab-progress');
  if (progressHost) progressHost.innerHTML = renderProgressHub(appData.profile, appData.plan);
  const checkinHost = document.getElementById('plan-tab-checkin');
  if (checkinHost) checkinHost.innerHTML = renderCheckinSection();
  renderHeroPanel();
  scroller.scrollTop = scrollBefore;
}

// 教練筆記完整處方只留在主課；卡片開頭只呈現方向與目的，避免重複。
function coachPlanHeadline(planText) {
  const text = String(planText || '').trim();
  if (!text) return '依主課完成今天訓練';

  const purposeMatch = text.match(/(?:目的|重點)\s*[：:]\s*([^。；;]+)/);
  const purpose = purposeMatch?.[1]?.trim();
  const direction = /(?:^|\s)E\s*跑|輕鬆跑|有氧/.test(text)
    ? TRAINING_TYPE_LABELS.easy
    : /(?:^|\s)T\s*跑|節奏跑|閾值/.test(text)
      ? TRAINING_TYPE_LABELS.tempo
      : /(?:^|\s)I\s*跑|間歇|快段/.test(text)
        ? TRAINING_TYPE_LABELS.interval
        : /長跑|耐力跑/.test(text)
          ? TRAINING_TYPE_LABELS.long
          : '今日訓練';
  return purpose ? `${direction}｜${purpose}` : direction;
}

function openWeeklyCheckin() {
  switchPlanTab('checkin');
  document.getElementById('plan-tab-checkin')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function dismissRunnerOnboarding() {
  appData.onboarding = { ...(appData.onboarding || {}), dismissedAt: new Date().toISOString() };
  saveData(appData);
  jumpToPhaseWeek(currentWeek);
}

function renderRunnerOnboardingCard() {
  if (appData.onboarding?.dismissedAt) return '';
  const completedRun = (appData.log || []).some((entry) => entry.date && entry.type !== 'rest') || (appData.plan || []).flatMap((week) => week.days || []).some((day) => day.status === 'done');
  const completedCheckin = (appData.checkins || []).length > 0;
  const items = [
    { done: true, text: '今天先照卡片完成一堂；不需要另外解讀整份週期。' },
    { done: completedRun, text: '跑完先讀取 Garmin 實跑；未同步時才用「手動補登」。若跳過，填原因就好，不需要硬補課。' },
    { done: completedCheckin, text: '每週最後做一次週評估，系統才會判斷下週維持、降載或小幅推進。' }
  ];
  return `<section class="runner-guide-card" aria-label="新手三步上手">
    <div class="runner-guide-head"><div><div class="runner-guide-kicker">Start here</div><div class="runner-guide-title">先做好這三步，課表才會越來越準</div><p class="runner-guide-copy">不需要每天填一堆數字；先把執行、回報與恢復做成習慣。</p></div><button class="btn btn-secondary" style="padding:6px 10px;font-size:12px" onclick="dismissRunnerOnboarding()">暫時隱藏</button></div>
    <ul class="runner-guide-list">${items.map((item) => `<li class="${item.done ? '' : 'pending'}">${item.text}</li>`).join('')}</ul>
  </section>`;
}

function renderDailyExecutionCard(week) {
  const today = findTodayPlanDay()?.day;
  const currentCheckin = (appData.checkins || []).find((item) => item.weekNum === currentWeek);
  const upcoming = (week?.days || []).find((day) => day.dateStr > todayStr() && day.type !== 'rest');
  const currentDay = today || upcoming;
  const typeLabel = currentDay ? trainingTypeLabel(currentDay.type, currentDay.focus) : '恢復';
  const isToday = Boolean(today);
  const task = currentDay ? trainingTaskTitle(currentDay) : '本週先完成恢復與週評估';
  const copy = currentCheckin
    ? '本週評估已完成。照今天卡片執行即可；有疼痛或步態異常時，直接停止品質課。'
    : isToday
      ? '跑完先讀取 Garmin 實跑；未同步時才用「手動補登」。若不舒服，選「跳過」並留原因，系統會把這筆背景帶進下週判斷。'
      : upcoming
        ? `下一堂是 ${upcoming.dateStr.slice(5)} 的${typeLabel}；今天以恢復、補水與睡眠為主。`
        : '本週課表接近結束，做完週評估後再看下週方向。';
  return `<section class="runner-guide-card" aria-label="今日下一步">
    <div class="runner-guide-kicker">Daily focus</div><div class="runner-guide-title">${isToday ? '今天的下一步' : '接下來的下一步'}：${reviewEscape(task)}</div>
    <p class="runner-guide-copy">${reviewEscape(copy)}</p>
    <div class="training-status-actions" style="margin-top:12px;justify-content:flex-start"><button class="btn btn-primary" onclick="goToToday()">${isToday ? '查看今天課表' : '查看本週課表'}</button>${currentCheckin ? '' : '<button class="btn btn-secondary" onclick="openWeeklyCheckin()">完成週評估</button>'}</div>
  </section>`;
}

function coachDaysForWeek(week) {
  const isCoachWeek = coachWeekMatches(week);
  const coachNextWeek = isCoachWeek ? coachReviewData?.nextWeek : null;
  return coachNextWeek ? coachMenuForCurrentSchedule(coachNextWeek.menu) : [];
}

function renderWeekSection(plan) {
  const week = plan[currentWeek - 1];
  if (!week) return '<p>找不到訓練週資料</p>';
  const deloadBadge = week.isDeload ? '<span class="week-flag-badge is-deload">減量週</span>' : '';
  const taperBadge = week.isTaper ? '<span class="week-flag-badge is-taper">賽前減量</span>' : '';
  const phaseRuleText = getPhaseRuleText(week, appData.profile, plan.length);
  const isCoachWeek = coachWeekMatches(week);
  const effectiveTarget = effectiveWeekVolumeTarget(week);
  const coachNextWeek = isCoachWeek ? coachReviewData.nextWeek : null;
  const goalGapNote = coachGoalGapNote(true);
  const planningNote = week.planningNote ? `
    <div class="week-coach-brief week-planning-note">
      <div class="week-coach-icon" aria-hidden="true">🛟</div>
      <div class="week-coach-copy">
        <div class="week-coach-title">本週排課調整</div>
        <p class="week-coach-note">${reviewEscape(week.planningNote)}</p>
      </div>
    </div>` : '';
  const coachBrief = coachNextWeek ? `
    <div class="week-coach-brief">
      <div class="week-coach-icon" aria-hidden="true">📌</div>
      <div class="week-coach-copy">
        <div class="week-coach-title">本週採用教練課表${coachNextWeek.label ? `：${reviewEscape(coachNextWeek.label)}` : ''}${coachNextWeek.targetKm ? `<span class="week-coach-meta">目標 ${reviewEscape(coachNextWeek.targetKm)} km</span>` : ''}</div>
        ${coachNextWeek.coachNote ? `<p class="week-coach-note">${reviewEscape(coachNextWeek.coachNote)}</p>` : ''}
        ${coachNextWeek.weatherPlan ? `<p class="week-coach-weather">🌦️ ${reviewEscape(coachNextWeek.weatherPlan)}</p>` : ''}
      </div>
    </div>` : '';
  const guidance = goalGapNote || coachBrief || planningNote ? `
  <section class="week-guidance" aria-label="本週教練指引">
    <div class="week-guidance-head">
      <span class="week-guidance-title">教練指引</span>
      <span class="week-guidance-caption">先依風險與本週任務執行</span>
    </div>
    ${goalGapNote}
    ${planningNote}
    ${coachBrief}
  </section>` : '';
  const hasCoachDirection = Boolean(goalGapNote || coachBrief || planningNote);
  const dayCards = week.days.map(day => renderDayCard(applyCoachPlanOverride(day, week))).join('');
  return `
<div class="card week-header-card">
  <div class="week-header-top">
    <div class="week-nav-cluster">
      <button class="week-nav-btn" onclick="navWeek(-1)" ${currentWeek <= 1 ? 'disabled' : ''} aria-label="上一週">◀</button>
      <div class="week-header-title">
        <div class="plan-overview-kicker">Week ${currentWeek} / ${plan.length}</div>
        <div class="week-header-label">第 ${currentWeek} 週 · ${(typeof coachPhaseForWeek === 'function' && coachPhaseForWeek(week)?.phase) || week.phaseLabel}${deloadBadge}${taperBadge}</div>
        <div class="week-header-target"><span>${effectiveTarget.source === '教練本週目標' ? '教練本週目標' : '本週目標'}</span><strong>${effectiveTarget.display}</strong></div>
      </div>
      <button class="week-nav-btn" onclick="navWeek(1)" ${currentWeek >= plan.length ? 'disabled' : ''} aria-label="下一週">▶</button>
    </div>
    <div class="week-header-right">
      <button class="btn btn-secondary week-garmin-export-btn" onclick="openWeeklyGarminCalendarGuide(${currentWeek})">⌚ 同步本週課程</button>
      <button class="btn btn-primary week-today-btn" onclick="goToToday()">📍 今天</button>
    </div>
  </div>
  <div class="guide-actions week-resource-actions">
    <span class="week-resource-label">訓練資源</span>
    <button class="guide-chip" onclick="openGuideLibrary('warmup')">🤸 熱身指南</button>
    <button class="guide-chip" onclick="openGuideLibrary('cooldown')">🧘 收操恢復</button>
    <button class="guide-chip" onclick="openGuideLibrary('strength')">💪 肌力補強</button>
    <button class="guide-chip" onclick="showHrZones()">❤️ 心率區間</button>
  </div>
  ${hasCoachDirection ? '' : `<div class="week-brief">
    <div class="week-brief-copy">
      <span class="week-brief-label">本週執行重點</span>
      <div class="week-explainer">${phaseRuleText}</div>
    </div>
    <span class="week-resource-label">先看今天，再完成本週</span>
  </div>`}
  ${guidance}
 </div>
<div class="week-calendar">${dayCards}</div>`;
}

function navWeek(delta) {
  currentWeek = Math.max(1, Math.min(appData.plan.length, currentWeek + delta));
  jumpToPhaseWeek(currentWeek);
}

function renderStepCards(steps) {
  return `<div class="workout-steps">${(steps || []).map(step => `
    <div class="step-card ${step.isCoachMain ? 'is-coach-main' : ''}">
      <div class="step-copy">
        <div class="step-head">
          <span class="step-title">${step.isCoachMain ? '📌 ' : ''}${step.title || ''}</span>
          ${step.dose ? `<span class="step-dose">${step.dose}</span>` : ''}
        </div>
        <div class="step-detail">${step.detail || step.text || ''}</div>
        ${step.guideKind && Number.isInteger(step.guideCourseIndex) ? `<button class="btn btn-secondary" style="margin-top:9px;font-size:12px;padding:6px 10px" onclick="openGuideLibrary('${step.guideKind}', ${step.guideCourseIndex})">查看今天的${step.title}圖解</button>` : ''}
      </div>
    </div>
  `).join('')}</div>`;
}

function resolveStepVisual(step) {
  const title = step?.title || '';
  const detail = step?.detail || '';
  if (title.includes('熱身')) return detail.includes('加速') ? 'mobility' : 'walk';
  if (title.includes('收操')) return 'stretch';
  if (title.includes('主課')) {
    if (detail.includes('間歇') || detail.includes('快跑') || detail.includes('400m') || detail.includes('800m')) return 'run_interval';
    if (detail.includes('節奏') || detail.includes('漸進')) return 'run_tempo';
    return 'run_easy';
  }
  return 'mobility';
}

function renderSupportCards(blocks) {
  return `<div class="support-grid">${(blocks || []).map(block => `
    <div class="support-card">
      <div>
        <div class="support-title">${block.title}</div>
        <div class="support-meta">
          <span class="support-type">${block.type}</span>
          ${block.dose ? `<span class="support-dose">${block.dose}</span>` : ''}
        </div>
        ${(block.drills || []).length ? `<div class="support-drill-list">${block.drills.map(drill => `${drill.name}${drill.dose ? ` ${drill.dose}` : ''}`).join('・')}</div>` : ''}
        <div class="support-detail">${block.detail}</div>
        ${Number.isInteger(block.guideCourseIndex) ? `<button class="btn btn-secondary" style="margin-top:10px;font-size:12px;padding:6px 10px" onclick="openGuideLibrary('strength', ${block.guideCourseIndex})">查看這套動作圖解</button>` : ''}
      </div>
    </div>
  `).join('')}</div>`;
}

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

function guideVideoSearchUrl(item) {
  const action = String(item || '')
    .replace(/\s+\d+[–-]?\d*\s*(秒|分|步|次|×|x).*$/u, '')
    .replace(/\s+\d+×.*$/u, '')
    .trim();
  if (GUIDE_ACTION_VIDEOS[action]) return GUIDE_ACTION_VIDEOS[action];
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${action} 動作教學 跑者`)}`;
}

function renderGuideAction(item, index) {
  const label = String(item || '');
  return `<li><span class="guide-action-index">${index + 1}</span><span class="guide-action-text">${label}</span><a class="guide-video-link" href="${guideVideoSearchUrl(label)}" target="_blank" rel="noopener noreferrer">▶ 影片</a></li>`;
}

function openGuideLibrary(kind, selectedCourseIndex = null) {
  const guide = GUIDE_LIBRARY[kind];
  if (!guide) return;
  const courses = selectedCourseIndex === null
    ? (guide.courses || [])
    : [guide.courses?.[selectedCourseIndex]].filter(Boolean);
  const hero = guide.cover ? `
    <div class="guide-hero">
      <img class="guide-hero-image" src="${guideAssetUrl(guide.cover.src)}" alt="${guide.cover.alt || guide.title}">
      <div class="guide-hero-copy">
        <div class="guide-hero-title">${guide.title}</div>
        <div class="guide-hero-text">${guide.intro || ''}</div>
      </div>
    </div>` : `
    <div class="guide-hero-copy" style="padding:0 0 14px;border-top:none">
      <div class="guide-hero-title">${guide.title}</div>
      <div class="guide-hero-text">${guide.intro || ''}</div>
    </div>`;
  const body = `
    ${hero}
    <div class="guide-asset-stack">
      ${courses.map((course, courseIndex) => `
        <div class="guide-asset-card guide-course-card">
          <div class="guide-course-kicker">${selectedCourseIndex !== null ? '今天課表指定・照這張完成' : courses.length > 1 ? `第 ${courseIndex + 1} 套・本次只做這一套` : '照這張完成本次課程'}</div>
          <div class="guide-asset-title">${course.title}</div>
          <div class="guide-asset-layout">
            <div class="guide-asset-visual">
              <img class="guide-asset-image" src="${guideAssetUrl(course.src)}" alt="${course.alt || course.title}">
              ${course.caption ? `<div class="guide-asset-caption">${course.caption}</div>` : ''}
            </div>
            <div class="guide-asset-copy">
              <ol class="guide-action-list">${(course.items || []).map(renderGuideAction).join('')}</ol>
              <div class="guide-asset-note">依編號順序完成即可；本次只做這一套。</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>`;
  showModal(guide.title, body, [{ label: '關閉', primary: true, action: closeModal }], { className: 'guide-modal' });
}

function getPhaseRuleText(week, profile, totalWeeks) {
  const rule = GOAL_RULES[profile.goal] || GOAL_RULES.half;
  const weekStart = week.days?.[0]?.dateStr ? new Date(`${week.days[0].dateStr}T00:00:00`) : null;
  const isSummerHeatBlock = weekStart ? (weekStart.getMonth() + 1) < 9 : false;
  const coachPhase = coachPhaseForWeek(week);
  if (coachPhase) {
    const hot = weekStart ? isHotSeasonDate(weekStart) : false;
    const taperNote = week.isTaper ? ' 本週已進入賽前收量。' : week.isDeload ? ' 本週為恢復週，總量下修。' : '';
    return `🧭 教練週期：目前屬「${coachPhase.phase}」${coachPhase.km ? `（週跑量 ${coachPhase.km} km）` : ''}。${coachPhase.focus || ''}${taperNote}${hot ? ' 夏季高溫：課表以心率為準，配速放慢屬正常。' : ''} 距離目標日還有 ${totalWeeks - week.weekNum + 1} 週。`;
  }
  const phaseGuides = {
    base: '先用輕鬆跑與長跑把有氧底盤墊起來，品質課只會少量出現。',
    build: '開始加入節奏跑與間歇跑，把速度耐力拉上來，但長跑仍是主軸。',
    peak: '保留關鍵強度，讓長跑尾段與品質課更接近比賽需求，但不再大幅堆量。',
    taper: '進入賽前回收，保留節奏感、明顯收量，讓雙腿在比賽前恢復。',
    light: '先以恢復與重新建立規律為主，強度維持保守。',
    progress: '在可恢復的前提下逐步加回跑量與節奏刺激。',
    solid: '把已恢復的跑量與動作品質穩定下來，避免再次拉傷。',
    maintain: '已進入維持期，以穩定出席和不過度疲勞為優先。'
  };
  if (week.isTaper) {
    return `賽前減量期：${rule.taperWeeks} 週內自動收量，讓比賽前體能回收。`;
  }
  if (week.isDeload) {
    return '本週是恢復週，總量下修，硬課減少，避免連續堆疲勞。';
  }
  if (isSummerHeatBlock && ['half', 'full'].includes(profile.goal)) {
    return `週期判別：依目標與總週數 ${totalWeeks} 週切分，目前第 ${week.weekNum} 週屬於「${week.phaseLabel}」。夏季炎熱期先以主課節奏跑、輕鬆跑與長跑為主，間歇跑會等 9 月後再加入。距離目標日還有 ${totalWeeks - week.weekNum + 1} 週。`;
  }
  return `週期判別：依目標與總週數 ${totalWeeks} 週切分，目前第 ${week.weekNum} 週屬於「${week.phaseLabel}」。${phaseGuides[week.phase] || ''} 距離目標日還有 ${totalWeeks - week.weekNum + 1} 週。`;
}

function getGarminRunForDate(dateStr) {
  return garminActivityRecords().find((run) => run.date === dateStr) || null;
}

function renderGarminRunResult(run, extra = false) {
  if (!run) return '';
  const label = extra ? 'Garmin 額外跑步' : 'Garmin 已同步';
  const detail = extra ? '已納入本週跑量' : '已比對課表';
  return `<div class="garmin-run-result ${extra ? 'extra' : ''}">
    <div class="garmin-run-label"><span>⌚ ${label}</span><small>${detail}</small></div>
    <div class="garmin-run-stats">
      <span class="garmin-run-stat">距離<b>${reviewEscape(run.km)} km</b></span>
      <span class="garmin-run-stat">配速<b>${reviewEscape(run.pace)}/km</b></span>
      <span class="garmin-run-stat">心率<b>${run.hr ? `HR ${reviewEscape(run.hr)}` : '—'}</b></span>
    </div>
  </div>`;
}

function workoutStepKind(title = '') {
  const text = String(title);
  if (/熱身/.test(text)) return 'warmup';
  if (/收操|緩和/.test(text)) return 'cooldown';
  if (/恢復|走|慢跑恢復/.test(text)) return 'recovery';
  if (/快步|加速|間歇|快段/.test(text)) return 'interval';
  return 'main';
}

function workoutEndFromText(text, fallbackKm = 0) {
  const source = String(text || '');
  const distance = source.match(/(\d+(?:\.\d+)?)\s*(?:km|公里)/i);
  if (distance) return { type: 'distance', value: Math.round(Number(distance[1]) * 1000), label: `${distance[1]} km` };
  const minutes = source.match(/(\d+(?:\.\d+)?)\s*分(?:鐘)?/);
  if (minutes) return { type: 'time', value: Math.round(Number(minutes[1]) * 60), label: `${minutes[1]} 分` };
  return fallbackKm ? { type: 'distance', value: Math.round(fallbackKm * 1000), label: `${fallbackKm} km` } : { type: 'open', value: 0, label: '依體感完成' };
}

function workoutStructureForDay(day) {
  // 休息日的 steps 是居家肌力清單，不是跑步課結構；防止被誤解析成「5 km 主課」
  if (day?.type === 'rest') return [];
  if (Array.isArray(day?.workoutStructure) && day.workoutStructure.length) return day.workoutStructure;
  const courseSteps = attachCourseGuides(day?.steps || [], day?.type);
  return courseSteps.map((step, index) => {
    const kind = workoutStepKind(step.title);
    return {
      order: index + 1,
      kind,
      title: step.title || `步驟 ${index + 1}`,
      end: workoutEndFromText(step.dose || step.detail, kind === 'main' ? Number(day?.km) || 5 : 0),
      target: kind === 'main' || kind === 'interval' ? [day?.pace, day?.hrTarget].filter(Boolean).join(' · ') : '',
      detail: step.detail || step.text || '依今天課表執行'
    };
  });
}

function normalizeCoachWorkoutSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.filter((step) => step && ['warmup', 'main', 'interval', 'recovery', 'cooldown', 'repeat'].includes(step.kind) && step.end)
    .slice(0, 12).map((step, index) => ({
      order: index + 1,
      kind: step.kind,
      title: String(step.title || '').slice(0, 60) || ({ warmup: '熱身', main: '主課', interval: '快段', recovery: '恢復', cooldown: '收操', repeat: '重複組' }[step.kind]),
      end: { type: ['distance', 'time', 'reps', 'open'].includes(step.end.type) ? step.end.type : 'open', value: Math.max(0, Number(step.end.value) || 0), label: String(step.end.label || '').slice(0, 40) || '依體感' },
      target: String(step.target || '').slice(0, 120), detail: String(step.detail || '').slice(0, 240),
      repetitions: Math.max(0, Number(step.repetitions) || 0),
      children: normalizeCoachWorkoutSteps(step.children)
    }));
}

function coachStructureConfidence(planText) {
  const text = String(planText || '');
  return /(?:E\s*跑|長跑|慢跑|節奏跑|間歇)\s*\d+(?:\.\d+)?\s*(?:km|公里)/i.test(text) ? 'inferred' : 'note-only';
}

function coachWorkoutStructure(planText, day, suppliedSteps = []) {
  const explicit = normalizeCoachWorkoutSteps(suppliedSteps);
  if (explicit.length) return explicit;
  if (coachStructureConfidence(planText) === 'note-only') return [];
  const text = String(planText || '');
  const totalMatch = text.match(/(?:E\s*跑|長跑|慢跑|節奏跑|間歇)\s*(\d+(?:\.\d+)?)\s*(?:km|公里)/i);
  const totalKm = totalMatch ? Number(totalMatch[1]) : (Number(day?.km) || 5);
  const warmupMatch = text.match(/(?:前|熱身)\s*(\d+(?:\.\d+)?)\s*(?:km|公里)[^。；;]*熱身/i);
  const warmupKm = warmupMatch ? Number(warmupMatch[1]) : 0;
  const cooldownMatch = text.match(/(?:收操|收)\s*(\d+)\s*分(?:鐘)?/i);
  const structure = [];
  if (warmupKm > 0) structure.push({ order: 1, kind: 'warmup', title: '熱身', end: workoutEndFromText(`${warmupKm} km`), target: '', detail: `前 ${warmupKm} km 放鬆熱身。` });
  structure.push({ order: structure.length + 1, kind: /間歇|快段/.test(text) ? 'interval' : 'main', title: /間歇|快段/.test(text) ? '主課快段' : '主課', end: workoutEndFromText(`${Math.max(0.1, totalKm - warmupKm)} km`), target: [text.match(/\d{1,2}:\d{2}\s*[–-]?\s*\d{1,2}:\d{2}/)?.[0], text.match(/HR\s*[≤<] ?\d+/i)?.[0]].filter(Boolean).join(' · '), detail: text });
  const strides = text.match(/(?:ST\s*快步|加速跑)\s*(\d+)\s*[×xX]\s*(\d+)\s*秒/i);
  const recoveryMatch = text.match(/(?:組間|之間|恢復)[^。；;]*?(\d+)\s*秒/i);
  const recoverySeconds = recoveryMatch ? Number(recoveryMatch[1]) : 45;
  if (strides) structure.push({ order: structure.length + 1, kind: 'repeat', title: '加速跑組', repetitions: Number(strides[1]), children: [{ kind: 'interval', title: '快步', end: { type: 'time', value: Number(strides[2]), label: `${strides[2]} 秒` } }, { kind: 'recovery', title: '恢復', end: { type: 'time', value: recoverySeconds, label: `${recoverySeconds} 秒` } }], end: { type: 'reps', value: Number(strides[1]), label: `${strides[1]} 組` }, target: '', detail: `每趟之間走或慢跑 ${recoverySeconds} 秒恢復。` });
  if (cooldownMatch) structure.push({ order: structure.length + 1, kind: 'cooldown', title: '收操', end: workoutEndFromText(`${cooldownMatch[1]} 分`), target: '', detail: '放慢、走跑並恢復呼吸。' });
  return structure;
}

function garminManualBuilderSteps(day) {
  return workoutStructureForDay(day).map((step, index) => ({
    ...step,
    order: index + 1,
    dose: step.end?.label || '依 Garmin 選項設定',
    detail: step.detail || '依今天課表執行',
    target: step.target || '不設目標或以舒適強度完成',
    targetSpec: garminTargetSpec(step.target, day?.type, step.kind)
  }));
}

function paceSecondsFromText(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function garminTargetSpec(targetText, workoutType = '', stepKind = '') {
  const text = String(targetText || '');
  const hrRange = text.match(/HR\s*(\d+)\s*[–-]\s*(\d+)/i);
  const hrMax = text.match(/HR\s*[≤<]\s*(\d+)/i);
  const paces = [...text.matchAll(/(\d{1,2}:\d{2})/g)].map((match) => paceSecondsFromText(match[1])).filter(Boolean);
  const isQuality = ['tempo', 'interval'].includes(workoutType) || stepKind === 'interval';
  if (isQuality && paces.length) {
    const fastest = Math.min(...paces), slowest = Math.max(...paces);
    return { kind: 'speed', minMps: Number((1000 / slowest).toFixed(4)), maxMps: Number((1000 / fastest).toFixed(4)) };
  }
  if (hrRange) return { kind: 'heart_rate', min: Number(hrRange[1]), max: Number(hrRange[2]) };
  if (hrMax) return { kind: 'heart_rate', min: Math.max(1, Number(hrMax[1]) - 20), max: Number(hrMax[1]) };
  if (paces.length) {
    const pace = paces[0];
    return { kind: 'speed', minMps: Number((1000 / (pace + 5)).toFixed(4)), maxMps: Number((1000 / Math.max(1, pace - 5)).toFixed(4)) };
  }
  return null;
}

function renderGarminWorkoutStructure(day) {
  const labels = { warmup: '熱身', main: '主課', interval: '快段', recovery: '恢復', cooldown: '收操', repeat: '重複組' };
  const steps = workoutStructureForDay(day);
  return `<div class="workout-steps">${steps.map((step) => {
    const isRepeat = step.kind === 'repeat' && Array.isArray(step.children);
    const childSteps = isRepeat ? `<div style="display:grid;gap:3px;margin-top:5px;padding:7px 9px;border-left:2px solid var(--c-primary);background:rgba(36,114,79,.06);border-radius:0 8px 8px 0"><b>每一組依序完成：</b>${step.children.map((child) => `<span>${reviewEscape(labels[child.kind] || child.title)} ${reviewEscape(child.end?.label || '依體感')}${child.target ? ` · ${reviewEscape(child.target)}` : ''}</span>`).join('')}<span style="color:var(--c-text-muted)">${reviewEscape(step.detail || '完成後再進入下一組。')}</span></div>` : '';
    const repeatTitle = isRepeat ? `重複 ${step.end?.label || step.repetitions || ''}` : `${labels[step.kind] || step.title}｜${step.end?.label || '依體感'}`;
    const repeatCopy = isRepeat ? '不是獨立課程；以下動作連續算一組，再重做指定次數。' : (step.target || step.detail || '依舒適強度完成');
    return `<div class="step"><span class="step-icon">${step.kind === 'warmup' ? '①' : step.kind === 'cooldown' ? '✓' : isRepeat ? '↻' : '•'}</span><span><b>${reviewEscape(repeatTitle)}</b><br>${reviewEscape(repeatCopy)}${childSteps}</span></div>`;
  }).join('')}</div>`;
}

function garminManualBuilderText(day) {
  const steps = garminManualBuilderSteps(day);
  return [
    `Runner Garmin 同步｜${day.dateStr}｜${trainingTypeLabel(day.type, day.focus)}`,
    `課名：${trainingTaskTitle(day)}`,
    '',
    ...steps.flatMap((step) => [
      `${step.order}. ${step.title}｜${step.dose}`,
      `   執行：${step.detail}`,
      `   目標：${step.target}`
    ]),
    '',
    '課表由 Runner 本機同步至 Garmin 行事曆；在 Garmin Connect 編輯後，照平常方式同步手錶。'
  ].join('\n');
}

function icsEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(dateStr) {
  return String(dateStr || '').replace(/-/g, '');
}

function nextIcsDate(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return icsDate(localDateStr(date));
}

function weeklyGarminCalendarIcs(week) {
  const runningDays = (week?.days || [])
    .filter((day) => day.type !== 'rest' && day.dateStr)
    .map((day) => applyCoachPlanOverride(day, week));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'PRODID:-//Runner Plaza//Garmin Training Calendar//ZH-TW'
  ];
  runningDays.forEach((day) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:runner-garmin-${icsDate(day.dateStr)}-${day.type}@runner-plaza.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(day.dateStr)}`,
      `DTEND;VALUE=DATE:${nextIcsDate(day.dateStr)}`,
      `SUMMARY:${icsEscape(`Runner｜${trainingTaskTitle(day)}`)}`,
      `DESCRIPTION:${icsEscape(garminManualBuilderText(day))}`,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadWeeklyGarminCalendar(weekNumber = currentWeek) {
  const week = appData.plan?.[weekNumber - 1];
  if (!week) return;
  const blob = new Blob([weeklyGarminCalendarIcs(week)], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `runner-garmin-week-${weekNumber}-${week.days?.[0]?.dateStr || todayStr()}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function garminSyncEndpoint() {
  return 'http://127.0.0.1:4173/api/garmin-workout-sync';
}

function garminPairingEndpoint() {
  return 'http://127.0.0.1:4173/api/garmin-workout-pairing';
}

function isLocalRunnerPage() {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function garminWorkoutPairingCode() {
  try {
    return sessionStorage.getItem(GARMIN_WORKOUT_PAIRING_KEY) || '';
  } catch {
    return '';
  }
}

function garminSyncHeaders() {
  const code = garminWorkoutPairingCode();
  return code ? { 'x-runner-garmin-pairing': code } : {};
}

async function showLocalGarminPairingCode() {
  try {
    const response = await fetch(garminPairingEndpoint(), { cache: 'no-store' });
    const pairing = await response.json().catch(() => ({}));
    if (!response.ok || !pairing.code) throw new Error(pairing.message || '無法讀取本機配對碼');
    showModal('本機 Garmin 配對碼', `<p style="margin-top:0;line-height:1.7">在公開訓練頁第一次同步時輸入這組碼。它只存在這台電腦，公開頁不會自動讀取。</p><input class="form-input" value="${reviewEscape(pairing.code)}" readonly onclick="this.select()" aria-label="本機 Garmin 配對碼"><p style="margin:12px 0 0;color:var(--c-text-muted);font-size:12px;line-height:1.6">請在同一台電腦、同一個瀏覽器完成配對；關閉分頁後，公開頁會要求再次輸入。</p>`, [{ label: '關閉', primary: true, action: closeModal }]);
  } catch (error) {
    showModal('無法讀取本機配對碼', `<p style="margin:0;line-height:1.7">請確認你是從本機 Runner 開啟此頁，且「啟動 Runner Garmin 同步器.cmd」正在執行。</p><p style="color:var(--c-text-muted);font-size:12px">${reviewEscape(error instanceof Error ? error.message : '未知錯誤')}</p>`, [{ label: '關閉', primary: true, action: closeModal }]);
  }
}

function openGarminWorkoutPairing(weekNumber = currentWeek) {
  showModal('配對本機 Garmin 同步器', `<p style="margin-top:0;line-height:1.7">這是第一次從公開訓練頁控制本機 Garmin 同步器。請在<b>同一台電腦</b>開啟 <code>http://127.0.0.1:4173/site/trainer.html</code>，於「教練建議」按「查看本機 Garmin 配對碼」，再貼到下方。</p><label class="form-label" for="garmin-workout-pairing-code">本機配對碼</label><input class="form-input" id="garmin-workout-pairing-code" autocomplete="off" spellcheck="false" placeholder="貼上配對碼"><p style="margin:12px 0 0;color:var(--c-text-muted);font-size:12px;line-height:1.6">此碼只儲存在目前瀏覽器分頁；重新開啟公開頁時需要再次配對。</p>`, [
    { label: '配對並同步', primary: true, action: () => saveGarminWorkoutPairing(weekNumber) },
    { label: '取消', action: closeModal }
  ]);
}

async function saveGarminWorkoutPairing(weekNumber = currentWeek) {
  const input = document.getElementById('garmin-workout-pairing-code');
  const code = String(input?.value || '').trim();
  if (!code) {
    input?.focus();
    return;
  }
  try {
    sessionStorage.setItem(GARMIN_WORKOUT_PAIRING_KEY, code);
  } catch {
    showModal('瀏覽器無法保存配對', '<p style="margin:0;line-height:1.7">目前瀏覽器禁止工作階段儲存，無法安全保存本機 Garmin 配對。請允許本網站使用工作階段儲存後再試。</p>', [{ label: '關閉', primary: true, action: closeModal }]);
    return;
  }
  await syncWeekToGarmin(weekNumber);
}

function renderLocalGarminPairingCard() {
  if (!isLocalRunnerPage()) return '';
  return `<div class="coach-setting-card" style="margin:14px 0"><div class="coach-setting-value">本機 Garmin 配對</div><div class="coach-fineprint">公開訓練頁第一次同步前，先在這裡查看配對碼。未配對的公開頁不能啟動或讀取本機 Garmin 同步。</div><div class="training-status-actions" style="margin-top:10px;justify-content:flex-start"><button class="btn btn-secondary" type="button" onclick="showLocalGarminPairingCode()">查看本機 Garmin 配對碼</button></div></div>`;
}

function estimatedGarminWorkoutSeconds(day) {
  const paceMatch = String(day.pace || '').match(/(\d+):(\d{2})/);
  const paceSeconds = paceMatch ? Number(paceMatch[1]) * 60 + Number(paceMatch[2]) : 420;
  return Math.max(1800, Math.round((Number(day.km) || 5) * paceSeconds + 900));
}

function garminMainDistanceKm(day) {
  const mainStep = garminManualBuilderSteps(day).find((step) => ['main', 'interval'].includes(step.kind));
  return mainStep?.end?.type === 'distance' ? Number(mainStep.end.value) / 1000 : (Number(day.km) || 5);
}

function weeklyGarminSyncPayload(week) {
  const runningDays = (week?.days || [])
    .filter((day) => day.type !== 'rest' && day.dateStr)
    .map((day) => applyCoachPlanOverride(day, week));
  const syncableDays = runningDays.filter((day) => day.workoutStructureConfidence !== 'note-only');
  const skippedDays = runningDays.filter((day) => day.workoutStructureConfidence === 'note-only');
  return {
    version: 1,
    source: 'runner-local-garmin-sync',
    week: Number(week?.weekNum || currentWeek),
    replaceExisting: true,
    skippedDays: skippedDays.map((day) => ({ date: day.dateStr, name: trainingTaskTitle(day), reason: '教練文字缺少可安全轉換的距離／時間步驟' })),
    workouts: syncableDays.map((day) => ({
      date: day.dateStr,
      name: `Runner｜${day.dateStr}｜${trainingTaskTitle(day)}`.slice(0, 120),
      type: day.type,
      structureConfidence: day.workoutStructureConfidence || 'formal',
      km: Number(day.km) || 5,
      mainKm: garminMainDistanceKm(day),
      pace: day.pace || '',
      steps: garminManualBuilderSteps(day),
      summary: garminManualBuilderText(day),
      estimatedDurationSec: estimatedGarminWorkoutSeconds(day)
    }))
  };
}

function garminWorkoutFingerprint(workout) {
  return JSON.stringify({ type: workout.type, km: workout.km, mainKm: workout.mainKm, pace: workout.pace, steps: workout.steps });
}

function garminSyncPreview(payload) {
  const previous = appData.garminSyncManifest && typeof appData.garminSyncManifest === 'object' ? appData.garminSyncManifest : {};
  return payload.workouts.map((workout) => {
    const key = `${workout.date}|${workout.name}`;
    const before = previous[key];
    const fingerprint = garminWorkoutFingerprint(workout);
    return { workout, key, fingerprint, change: !before ? 'new' : before.fingerprint === fingerprint ? 'unchanged' : 'changed' };
  });
}

function saveGarminSyncManifest(preview) {
  appData.garminSyncManifest = Object.fromEntries(preview.map((item) => [item.key, { fingerprint: item.fingerprint, syncedAt: new Date().toISOString() }]));
  saveData(appData);
}

async function readGarminSyncStatus() {
  const response = await fetch(garminSyncEndpoint(), { cache: 'no-store', headers: garminSyncHeaders() });
  if (!response.ok) throw new Error('無法讀取 Garmin 同步器狀態');
  return response.json();
}

async function waitForGarminSync() {
  let statusReadFailures = 0;
  let lastStatusError = null;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    let status;
    try {
      status = await readGarminSyncStatus();
      statusReadFailures = 0;
    } catch (error) {
      lastStatusError = error;
      statusReadFailures += 1;
      if (statusReadFailures >= 3) throw lastStatusError;
      continue;
    }
    if (!['queued', 'running'].includes(status.status)) return status;
  }
  return { status: 'running', message: '同步器仍在執行；可稍後再按一次查看狀態。' };
}

function garminSyncFailureGuidance(message) {
  const detail = String(message || '同步器沒有回傳可用結果');
  const needsAuth = /(token|login|log in|登入|授權|authentication|credential|social profile)/i.test(detail);
  if (needsAuth) {
    return {
      title: 'Garmin 授權需要更新',
      body: 'Runner 已辨識為 Garmin 登入／token 問題，沒有建立任何不完整課程。請先在 Garmin Connect 完成登入，再雙擊專案根目錄的「更新 Runner Garmin 授權.cmd」；完成後回來按一次同步即可。'
    };
  }
  return {
    title: 'Garmin 同步未完成',
    body: 'Runner 沒有把這次狀態誤判為完成；請確認本機同步器仍在執行，再重試一次。既有 Garmin 課程不會因這次失敗被刪除。'
  };
}

function showGarminSyncFailure(message) {
  const guidance = garminSyncFailureGuidance(message);
  showModal(guidance.title, `<p style="margin-top:0;line-height:1.7">${reviewEscape(guidance.body)}</p><p style="color:var(--c-text-muted);font-size:12px;line-height:1.6">技術訊息：${reviewEscape(message || '未提供')}</p>`, [{ label: '關閉', primary: true, action: closeModal }]);
}

async function syncWeekToGarmin(weekNumber = currentWeek) {
  const week = appData.plan?.[weekNumber - 1];
  if (!week) return;
  const payload = weeklyGarminSyncPayload(week);
  const preview = garminSyncPreview(payload);
  if (!payload.workouts.length) {
    showModal('沒有可安全同步的 Garmin 課程', '<p style="margin:0;line-height:1.7">本週教練內容缺少足以建立 Garmin 步驟的距離或時間處方，因此已保留為網頁備註，沒有寫入 Garmin。</p>', [{ label: '關閉', primary: true, action: closeModal }]);
    return;
  }
  try {
    const response = await fetch(garminSyncEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...garminSyncHeaders() },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && result.error === 'pairing-required') {
      openGarminWorkoutPairing(weekNumber);
      return;
    }
    if (!response.ok) throw new Error(result.message || 'Garmin 課程同步器未能啟動');
    closeModal();
    showModal('正在同步本週課程到 Garmin', `<p style="margin-top:0;color:var(--c-text-muted);line-height:1.7">已將 ${payload.workouts.length} 堂課交給本機同步器。同名課程會安全替換成新版，避免保留舊內容。</p><p style="color:var(--c-text-muted);font-size:12px;line-height:1.6">Runner 只會使用你電腦既有的 Garmin 授權，不會傳送帳密到網站。</p>`, [{
      label: '查看結果', primary: true, action: async () => {
        try {
          const status = await waitForGarminSync();
          const rows = (status.results || []).map((item) => {
            const action = item.action === 'created' ? '已建立' : item.action === 'replaced' ? '已替換舊課表' : '沿用既有課表';
            return `<li>${reviewEscape(item.date)}｜${reviewEscape(item.name)}（${action}）</li>`;
          }).join('');
          if (status.status === 'ok') saveGarminSyncManifest(preview);
          if (status.status !== 'ok' && status.status !== 'running') {
            showGarminSyncFailure(status.message);
            return;
          }
          showModal(status.status === 'ok' ? 'Garmin 同步完成' : 'Garmin 同步狀態', `<p style="margin-top:0;line-height:1.7">${reviewEscape(status.message || '同步器已結束。')}</p>${rows ? `<ul class="garmin-builder-steps">${rows}</ul>` : ''}`, [{ label: '關閉', primary: true, action: closeModal }]);
        } catch (error) {
          showModal('同步結果暫時無法讀取', `<p style="margin-top:0;line-height:1.7">同步請求已成功交給本機同步器；目前只是無法讀取進度，不代表同步失敗。</p><p style="margin:0;color:var(--c-text-muted);line-height:1.7">請稍後在 Garmin Connect 行事曆確認；若仍未出現，再重新啟動本機同步器後查看。</p><p style="color:var(--c-text-muted);font-size:12px">${reviewEscape(error instanceof Error ? error.message : '暫時無法讀取同步狀態')}</p>`, [{ label: '關閉', primary: true, action: closeModal }]);
        }
      }
    }]);
  } catch (error) {
    const message = error instanceof Error ? error.message : '無法連線到本機同步器';
    if (/(token|login|登入|授權|authentication|credential)/i.test(message)) {
      showGarminSyncFailure(message);
      return;
    }
    showModal('本機同步器尚未啟動', `<p style="margin-top:0;line-height:1.7">請先雙擊專案根目錄的「啟動 Runner Garmin 同步器.cmd」，然後回到本週課表再按同步。</p><p style="color:var(--c-text-muted);font-size:12px">${reviewEscape(message)}</p>`, [{ label: '關閉', primary: true, action: closeModal }]);
  }
}

function openWeeklyGarminCalendarGuide(weekNumber = currentWeek) {
  const week = appData.plan?.[weekNumber - 1];
  if (!week) return;
  const payload = weeklyGarminSyncPayload(week);
  const preview = garminSyncPreview(payload);
  const runningDays = payload.workouts.length;
  const changeLabel = { new: '新增 Garmin 課程', changed: '課程結構有變更，將替換', unchanged: '與上次相同，維持既有課程' };
  const previewRows = preview.map((item) => `<li><strong>${reviewEscape(item.workout.date)}｜${reviewEscape(trainingTaskTitle({ task: item.workout.name.replace(/^Runner｜\d{4}-\d{2}-\d{2}｜/, '') }))}</strong><small>${changeLabel[item.change]} · ${item.workout.steps.map((step) => `${step.title || step.kind} ${step.dose || step.end?.label || ''}`).join(' → ')}</small></li>`).join('');
  const skippedRows = payload.skippedDays.length ? `<div class="garmin-builder-note" style="margin-top:12px"><b>不會寫入 Garmin：</b>${payload.skippedDays.map((item) => `${reviewEscape(item.date)} ${reviewEscape(item.name)}`).join('、')}。原因：缺少可安全轉換的距離／時間步驟，已保留為教練備註。</div>` : '';
  const body = `
    <div class="garmin-builder-note" style="margin-top:0"><b>本機一鍵同步：</b>會建立或安全替換同名的 ${runningDays} 堂 Garmin 跑步訓練，排進對應日期；之後照平常用 Garmin Connect 手機同步手錶即可。</div>
    <ol class="garmin-builder-steps" style="margin-top:12px"><li><strong>這次同步差異</strong><small>依本機上次成功同步的結構比較。</small></li>${previewRows}</ol>${skippedRows}
    <ol class="garmin-builder-steps" style="margin-top:16px">
      <li><strong>啟動本機同步器</strong><small>首次使用時雙擊「啟動 Runner Garmin 同步器.cmd」；它只在你的電腦上讀取 Runner 課表並呼叫 Garmin。</small></li>
      <li><strong>確認同步本週</strong><small>Runner 會以日期＋課名判斷同名課程，先建立新版、排回原日期，再移除舊版本。</small></li>
      <li><strong>正常同步手錶</strong><small>完成後打開 Garmin Connect 手機 App，依平常方式藍牙同步，不需要插 USB。</small></li>
    </ol>
    <p style="margin:16px 0 0;color:var(--c-text-muted);font-size:12px;line-height:1.6">這是個人本機自動化，不是 Garmin 官方 Training API。課表與 Garmin token 都留在你的電腦；只有你按下確認後才會寫入 Garmin 行事曆。</p>`;
  showModal('同步本週課表到 Garmin', body, [
    ...(runningDays ? [{ label: `覆蓋並同步 ${runningDays} 堂`, primary: true, action: () => syncWeekToGarmin(weekNumber) }] : []),
    { label: '仍下載 ICS 備用', action: () => downloadWeeklyGarminCalendar(weekNumber) },
    { label: '關閉', action: closeModal }
  ]);
}

function runCompanionRecommendation(day) {
  const type = day?.type || 'easy';
  const recommendations = {
    easy: {
      title: '輕鬆跑的陪伴',
      intro: '今天的重點是把呼吸放鬆、穩穩完成，不需要被節拍追著跑。',
      musicMix: ['indiePop', 'cityPop', 'funkDisco', 'movieScores', 'easyElectronic'],
      podcastMix: ['runningStories', 'sportsCulture', 'deepTalk', 'historyStories', 'lightChat'],
      tip: '能完整講話才是對的強度；若 Podcast 讓你不自覺加速，就改成較慢的音樂。'
    },
    tempo: {
      title: '節奏跑的陪伴',
      intro: '今天需要穩定專注，讓音樂幫你守住節奏，不要讓談話內容分散注意力。',
      musicMix: ['houseDrive', 'popTempo', 'rockDrive', 'hipHopDrive', 'electronicFocus'],
      podcastMix: ['runningTraining', 'sportsCulture', 'deepTalk', 'businessIdeas', 'lightChat'],
      tip: '主課開始後優先選音樂；Podcast 留給熱身與收操，才能更容易維持目標配速。'
    },
    interval: {
      title: '間歇跑的陪伴',
      intro: '快段需要明確節奏，恢復段則把注意力拉回呼吸與姿勢。',
      musicMix: ['drumBass', 'electronicFocus', 'rockDrive', 'hipHopDrive', 'popTempo'],
      podcastMix: ['runningTraining', 'runningStories', 'sportsCulture', 'deepTalk', 'lightChat'],
      tip: '把音樂當作節奏提示，不要為了追拍子硬加速；恢復段先確認呼吸回穩。'
    },
    long: {
      title: '長跑的陪伴',
      intro: '長跑時間較長，交替聽故事與音樂，比一路硬撐更容易把心情留在跑步上。',
      musicMix: ['indiePop', 'cityPop', 'easyElectronic', 'movieScores', 'houseDrive', 'rockDrive', 'funkDisco'],
      podcastMix: ['runningStories', 'runningTraining', 'sportsCulture', 'deepTalk', 'historyStories', 'travelAdventure', 'businessIdeas', 'lightChat'],
      tip: '前半段選 Podcast，後段疲勞時再換成音樂；仍要保留對路況與身體訊號的注意力。'
    },
    race: {
      title: '比賽日的陪伴',
      intro: '今天以執行配速、補給與安全為主；熟悉的音樂就夠了，不需要嘗試新內容。',
      musicMix: ['raceHype', 'rockDrive', 'electronicFocus', 'hipHopDrive'],
      podcastMix: ['runningStories', 'sportsCulture', 'deepTalk', 'lightChat'],
      tip: '賽前只聽熟悉內容；起跑後優先聽身體和環境，別讓音樂蓋過補給或安全提醒。'
    }
  };
  if (type === 'easy' && ['recovery', 'rehab'].includes(day?.focus)) {
    return {
      title: '恢復跑的陪伴',
      intro: '今天是為了恢復，不是為了衝成績；越能放鬆越好。',
      musicMix: ['lofiRecovery', 'movieScores', 'cityPop', 'easyElectronic', 'indiePop'],
      podcastMix: ['runningStories', 'sportsCulture', 'historyStories', 'deepTalk', 'lightChat'],
      tip: '若覺得疲勞或疼痛上升，直接關掉內容、降速或改走路，完成恢復比完成里程重要。'
    };
  }
  return recommendations[type] || recommendations.easy;
}

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

function companionItemHistory(historyKey, items) {
  try {
    const saved = JSON.parse(localStorage.getItem(historyKey) || '[]');
    return Array.isArray(saved) ? saved.filter((key) => items[key]) : [];
  } catch {
    return [];
  }
}

function pickCompanionItems(keys, count, historyKey, items) {
  const history = companionItemHistory(historyKey, items);
  const freshKeys = keys.filter((key) => !history.includes(key));
  const candidates = freshKeys.length >= count ? freshKeys : keys;
  const selected = [...candidates].sort(() => Math.random() - 0.5).slice(0, count);
  localStorage.setItem(historyKey, [...selected, ...history.filter((key) => !selected.includes(key))].slice(0, 6));
  return selected;
}

function pickCompanionPodcasts(keys, count) {
  return pickCompanionItems(keys, count, RUN_COMPANION_HISTORY_KEY, RUN_COMPANION_PODCASTS);
}

function pickCompanionMusic(keys, count) {
  return pickCompanionItems(keys, count, RUN_COMPANION_MUSIC_HISTORY_KEY, RUN_COMPANION_MUSIC);
}

function estimatedRunMinutes(day) {
  const km = Number(day?.km) || 0;
  const paceMatch = String(day?.pace || '').match(/(\d+):(\d{2})\/km/);
  if (!km || !paceMatch) return null;
  return Math.round(km * (Number(paceMatch[1]) + Number(paceMatch[2]) / 60));
}

function showRunCompanion(dateStr) {
  const day = findRawPlanDay(dateStr)?.day;
  if (!day || day.type === 'rest') return;
  const recommendation = runCompanionRecommendation(day);
  const estimatedMinutes = estimatedRunMinutes(day);
  const musicCount = estimatedMinutes && estimatedMinutes >= 75 ? 4 : 3;
  const musicCards = pickCompanionMusic(recommendation.musicMix, musicCount).map((key) => RUN_COMPANION_MUSIC[key]).filter(Boolean).map((item) => {
    const musicQuery = encodeURIComponent(item.query);
    return `<a class="garmin-builder-note" style="display:block;margin-top:10px;text-decoration:none;color:inherit" href="https://open.spotify.com/search/${musicQuery}" target="_blank" rel="noopener noreferrer"><b>🎵 ${reviewEscape(item.title)}</b><span style="display:block;margin-top:3px">${reviewEscape(item.tempo)} · ${reviewEscape(item.detail)}</span></a>`;
  }).join('');
  const podcastCount = estimatedMinutes && estimatedMinutes >= 75 ? 4 : 3;
  const podcastCards = pickCompanionPodcasts(recommendation.podcastMix, podcastCount).map((key) => RUN_COMPANION_PODCASTS[key]).filter(Boolean).map((item) => {
    const podcastQuery = encodeURIComponent(item.query);
    return `<a class="garmin-builder-note" style="display:block;margin-top:10px;text-decoration:none;color:inherit" href="https://open.spotify.com/search/${podcastQuery}" target="_blank" rel="noopener noreferrer"><b>🎙️ ${reviewEscape(item.title)}</b><span style="display:block;margin-top:3px">${reviewEscape(item.length)} · ${reviewEscape(item.detail)}</span></a>`;
  }).join('');
  const body = `
    <p class="field-help" style="margin-top:0">${reviewEscape(recommendation.intro)}</p>
    <div><b>🎵 這次可選音樂</b><span class="field-help" style="display:block;margin:3px 0 0">${estimatedMinutes ? `這堂課約 ${estimatedMinutes} 分鐘；` : ''}每次會隨機換一批曲風，並避開最近出現過的選項。</span>${musicCards}</div>
    <div style="margin-top:16px"><b>🎙️ 這次可選 Podcast</b><span class="field-help" style="display:block;margin:3px 0 0">${estimatedMinutes ? `這堂課約 ${estimatedMinutes} 分鐘；` : ''}每次會隨機換一批主題，並避開最近出現過的選項。</span>${podcastCards}</div>
    <p class="field-help" style="margin-bottom:0">${reviewEscape(recommendation.tip)}</p>
    <p class="field-help" style="margin-bottom:0">為了安全，請保持可聽見環境聲的音量；道路與夜跑建議使用單耳或開放式耳機。</p>`;
  showModal(recommendation.title, body, [
    { label: '關閉', action: closeModal }
  ]);
}

function renderDayCard(day) {
  const garminRun = getGarminRunForDate(day.dateStr);
  const isTodayCard = day.dateStr === todayStr();
  if (day.type === 'rest') {
    const restDetail = renderSupportCards(day.supportBlocks);
    return `<div class="day-card type-rest ${isTodayCard ? 'today' : ''} ${day.status === 'missed' ? 'missed-card' : ''}">
      <div class="day-card-header">
        <span class="day-card-date">${DOW_NAMES[day.dow]} ${day.dateStr?.slice(5) || ''}</span>
        ${isTodayCard ? '<span class="day-card-today-badge">今天</span>' : ''}
      </div>
      <span class="workout-badge badge-rest">休息</span>
      <div class="day-card-task">${day.task || '主動恢復 / 完全休息'}</div>
      ${restDetail}
      ${renderGarminRunResult(garminRun, true)}
    </div>`;
  }
  const badgeClass = day.coachPlan
    ? 'badge-coach'
    : { easy: 'badge-easy', tempo: 'badge-tempo', interval: 'badge-interval', long: 'badge-long', race: 'badge-long' }[day.type] || 'badge-rest';
  const typeName = day.coachPlan ? '教練課表' : trainingTypeLabel(day.type, day.focus);
  const statusClass = day.status === 'done' ? 'done-card' : day.status === 'missed' ? 'missed-card' : garminRun ? 'garmin-card' : '';
  const skipReason = formatSkipReason(appData.skipReasons?.[day.dateStr]);
  const actionsHTML = garminRun
    ? renderGarminRunResult(garminRun)
    : day.status === 'done'
    ? '<div style="color:var(--c-green);font-size:13px;font-weight:600">✓ 已完成</div>'
    : day.status === 'missed'
      ? `<div style="color:var(--c-red);font-size:13px">✗ 已跳過</div><div class="skip-reason">${skipReason ? `原因：${reviewEscape(skipReason)}` : '跳過原因：尚未記錄'}</div><div class="day-card-actions"><button class="btn btn-secondary" onclick="editSkipReason('${day.dateStr}')">補填原因</button><button class="btn btn-secondary" onclick="markMissed('${day.dateStr}')">重新安排</button><button class="btn btn-secondary" onclick="undoMissed('${day.dateStr}')">撤銷跳過</button></div>`
      : day.dateStr > todayStr()
      ? '<div style="color:var(--c-text-muted);font-size:13px">尚未到日期，無法先記錄</div>'
      : `<div class="day-card-actions">
          <button class="btn btn-primary" onclick="markDone('${day.dateStr}','${day.type}',${day.km || 0})">📝 手動補登</button>
          <button class="btn btn-secondary" onclick="markMissed('${day.dateStr}','${day.type}')">跳過</button>
        </div>`;
  return `<div class="day-card type-${day.type} ${isTodayCard ? 'today' : ''} ${statusClass} ${day.isDeload ? 'deload-card' : ''}">
    <div class="day-card-header">
      <span class="day-card-date">${DOW_NAMES[day.dow]} ${day.dateStr?.slice(5) || ''}</span>
      ${isTodayCard ? '<span class="day-card-today-badge">今天</span>' : ''}
    </div>
    <span class="workout-badge ${badgeClass}">${day.coachPlan ? '📌 ' : ''}${typeName}</span>
    <div class="day-card-task ${day.coachPlan ? 'coach-headline' : ''}">${trainingTaskTitle(day)}</div>
    ${day.coachPlan ? '<p class="coach-detail-hint">完整距離、強度與動作安排請看下方主課。</p>' : ''}
    <div class="day-card-pace">${[day.pace, day.hrTarget].filter(Boolean).join(' · ')}</div>
    ${day.injuryNote ? `<div style="font-size:12px;line-height:1.5;color:var(--c-red);margin:4px 0 8px">🦶 ${day.injuryNote}</div>` : ''}
    ${day.recoveryProtection ? `<div style="font-size:12px;line-height:1.5;color:var(--c-primary-hover);margin:4px 0 8px">🛡️ ${reviewEscape(day.recoveryProtection)}</div>` : ''}
    ${day.coachSafetyOverride ? `<div style="font-size:12px;line-height:1.5;color:var(--c-red);margin:4px 0 8px">🛑 安全保護已暫時覆蓋本週教練品質課；原處方已保留在變更紀錄。</div>` : ''}
    ${day.heatNote ? `<div style="font-size:12px;line-height:1.5;color:var(--c-orange);margin:4px 0 8px">☀️ ${day.heatNote}</div>` : ''}
    ${dayWeatherLine(day)}
    ${renderStepCards(attachCourseGuides(day.steps, day.type))}
    <div class="day-card-actions"><button class="btn btn-secondary" onclick="showRunCompanion('${day.dateStr}')">🎧 跑步陪伴</button></div>
    ${actionsHTML}
  </div>`;
}

// ============================================================
// MODAL
// ============================================================
let modalReturnFocus = null;

function setModalBackgroundInert(inert) {
  document.querySelectorAll('.site-header, .trainer-page, #back-to-top').forEach((element) => {
    if (inert) element.setAttribute('inert', '');
    else element.removeAttribute('inert');
  });
}

function modalFocusableElements() {
  return [...document.querySelectorAll('#modal .modal button:not([disabled]), #modal .modal [href], #modal .modal input:not([disabled]), #modal .modal select:not([disabled]), #modal .modal textarea:not([disabled]), #modal .modal [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getClientRects().length > 0);
}

function showModal(title, bodyHTML, actions, options = {}) {
  modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const modalEl = document.querySelector('#modal .modal');
  if (modalEl) modalEl.className = `modal ${options.className || ''}`.trim();
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  const actionsEl = document.getElementById('modal-actions');
  actionsEl.innerHTML = '';
  actions.forEach(action => {
    const btn = document.createElement('button');
    btn.className = `btn ${action.primary ? 'btn-primary' : 'btn-secondary'}`;
    btn.textContent = action.label;
    btn.onclick = action.action;
    actionsEl.appendChild(btn);
  });
  const overlay = document.getElementById('modal');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  setModalBackgroundInert(true);
  requestAnimationFrame(() => {
    const firstField = modalEl?.querySelector('input:not([type="hidden"]), select, textarea');
    (firstField || modalFocusableElements()[0] || modalEl)?.focus();
  });
}

function closeModal() {
  const modalEl = document.querySelector('#modal .modal');
  if (modalEl) modalEl.className = 'modal';
  const overlay = document.getElementById('modal');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  setModalBackgroundInert(false);
  const returnFocus = modalReturnFocus;
  modalReturnFocus = null;
  if (returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus());
}

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

// ============================================================
// WORKOUT ACTIONS
// ============================================================
function markDayStatus(dateStr, status) {
  appData.dayStatuses = normalizeDayStatuses(appData.dayStatuses);
  appData.dayStatuses[dateStr] = status;
  appData.plan.forEach(week => week.days.forEach(day => {
    if (day.dateStr === dateStr) day.status = status;
  }));
  saveData(appData);
}

function saveLogEntry(entry) {
  appData.log = appData.log || [];
  appData.log = appData.log.filter(item => !(item.date === entry.date && item.type === entry.type));
  appData.log.push(entry);
  appData.dayStatuses = normalizeDayStatuses(appData.dayStatuses);
  if (entry?.date) {
    appData.dayStatuses[entry.date] = 'done';
  }
  saveData(appData);
}

const ASSESSMENT_TYPE_LABEL = {
  test_20min: '20 分鐘測驗',
  race_5k: '5K 測驗',
  race_10k: '10K 測驗',
  race_half: '半馬測驗',
  custom_race: '近期比賽'
};

function formatAssessmentType(type) {
  return ASSESSMENT_TYPE_LABEL[type] || type;
}

function saveAssessmentEntry(entry) {
  appData.assessments = appData.assessments || [];
  appData.assessments = appData.assessments.filter(item => !(item.date === entry.date && item.type === entry.type));
  appData.assessments.push(entry);
  appData.assessments.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  saveData(appData);
}

function estimatePacesFromAssessment(assessment) {
  const goalDist = GOAL_DIST[appData.profile?.goal] || 10;
  let racePaceSec = 0;
  if (assessment.type === 'test_20min') {
    if (!assessment.distanceKm) return null;
    const thresholdPaceSec = (20 * 60) / assessment.distanceKm;
    racePaceSec = thresholdPaceSec + 12;
  } else {
    const resultSec = timeToSec(assessment.result);
    const distMap = { race_5k: 5, race_10k: 10, race_half: 21.0975 };
    const baseDist = distMap[assessment.type] || assessment.distanceKm;
    if (!resultSec || !baseDist) return null;
    const recentPaceSec = resultSec / baseDist;
    racePaceSec = recentPaceSec * Math.pow(goalDist / baseDist, 0.07);
  }
  if (!racePaceSec || !Number.isFinite(racePaceSec)) return null;
  return {
    racePaceSec,
    tempoPaceSec: racePaceSec + 12,
    intervalPaceSec: Math.max(racePaceSec - 10, 180),
    easyPaceSec: Math.max(racePaceSec + 75, racePaceSec * 1.12),
    targetTime: secToTime(Math.round(racePaceSec * goalDist))
  };
}

function applyAssessmentToPlan(index = 0) {
  const assessment = (appData.assessments || [])[index];
  if (!assessment || !appData.profile) return;
  const nextPaces = estimatePacesFromAssessment(assessment);
  if (!nextPaces) {
    showModal('無法套用檢測', '這筆檢測資料不足，請確認時間或距離格式。', [{ label: '確認', action: closeModal }]);
    return;
  }
  const beforePlan = futurePlanSnapshot();
  Object.assign(appData.profile, nextPaces, {
    easyPace: secToPace(nextPaces.easyPaceSec),
    lastAssessmentAt: assessment.date,
    lastAssessmentType: assessment.type
  });
  // 配速基準變了，舊的滾動校準快取不該再拿來擋下一次校準
  appData.recalibratedFor = null;
  appData.lastRecalibration = null;
  rebuildWeeksFrom(currentWeek + 1, appData.plan.length - currentWeek);
  recordPlanChange(beforePlan, 'assessment', `檢測成績已更新：${assessment.date}`);
  saveData(appData);
  closeModal();
  renderPlanView();
  switchPlanTab('progress');
  showView('plan');
}

function getAssessmentCycleHint(plan) {
  const nextWeek = plan[currentWeek];
  const phaseShift = nextWeek && nextWeek.phase !== plan[currentWeek - 1]?.phase;
  if (currentWeek > 1 && (currentWeek % 4 === 0 || phaseShift)) {
    return '本週建議新增一筆檢測紀錄，像是 20 分鐘測驗、5K 或 10K，讓系統重算後續配速。';
  }
  return '';
}

function hasTwoConsecutiveLowCheckins() {
  const sorted = [...(appData.checkins || [])].sort((a, b) => a.weekNum - b.weekNum);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].weekNum + 1 === sorted[i].weekNum && sorted[i - 1].score <= 2 && sorted[i].score <= 2) {
      return true;
    }
  }
  return false;
}

function shouldShowAdaptationPrompt(scenario) {
  appData.adaptationPrompts = appData.adaptationPrompts || {};
  const key = `${currentWeek}:${scenario}`;
  if (appData.adaptationPrompts[key]) return false;
  appData.adaptationPrompts[key] = todayStr();
  saveData(appData);
  return true;
}

function markDone(dateStr, type, plannedKm) {
  const prescribedPaceSec = getPrescribedPaceSec(dateStr, type);
  const suggestedMins = estimateDurationMinsFromPace(prescribedPaceSec, plannedKm);
  showModal(
    '📝 手動補登完成',
    `<div><p class="field-help" style="margin-top:0">只有在未使用 Garmin 同步，或 Garmin 實跑尚未回來時才需要填寫；已有 Garmin 紀錄時，系統會自動認列，避免重複。</p>
      <div class="form-group"><label class="form-label">實際距離 (km)</label><input class="form-input" id="m-km" type="number" step="0.1" value="${plannedKm}"></div>
      <div class="form-group"><label class="form-label">完成時間 (分鐘)</label><input class="form-input" id="m-time" type="number" value="${suggestedMins || ''}" placeholder="例：45">${suggestedMins ? `<div class="field-help">已依課表配速 ${secToPace(prescribedPaceSec)}/km 自動估算約 ${suggestedMins} 分，可自行微調。</div>` : '<div class="field-help">若有課表配速，這裡會自動換算建議分鐘數。</div>'}</div>
      <div class="form-group"><label class="form-label" for="m-rpe">體感強度 RPE (1–10)</label><select class="form-input" id="m-rpe"><option value="">請選擇</option><option value="1">1｜幾乎不費力</option><option value="2">2｜非常輕鬆</option><option value="3">3｜輕鬆</option><option value="4">4｜舒適可對話</option><option value="5">5｜穩定</option><option value="6">6｜穩定可持續</option><option value="7">7｜吃力但可控制</option><option value="8">8｜很吃力</option><option value="9">9｜接近全力</option><option value="10">10｜幾乎全力</option></select><div class="field-help">RPE = 你主觀覺得有多累。3–4 很輕鬆、5–6 穩定可持續、7–8 吃力但可控制、9–10 幾乎全力。</div></div>
      <div class="form-group"><label class="form-label">備註（選填）</label><input class="form-input" id="m-notes" type="text" placeholder="感覺..."></div>
    </div>`,
    [
      {
        label: '儲存',
        primary: true,
        action: () => {
          const km = parseFloat(document.getElementById('m-km').value) || plannedKm;
          const mins = parseInt(document.getElementById('m-time').value, 10) || 0;
          const rpe = parseInt(document.getElementById('m-rpe').value, 10) || 0;
          const notes = document.getElementById('m-notes').value;
          saveLogEntry({ date: dateStr, type, plannedKm, actualKm: km, actualTimeMins: mins, rpe, notes, prescribedPaceSec });
          recordTrainingEvent('completed', { date: dateStr, detail: `${km} km · RPE ${rpe || '—'}` });
          markDayStatus(dateStr, 'done');
          autoPaceCalibration();
          closeModal();
          renderPlanView();
          assessProgress();
          showView('plan');
        }
      },
      { label: '取消', action: closeModal }
    ]
  );
  const kmInput = document.getElementById('m-km');
  const timeInput = document.getElementById('m-time');
  if (!kmInput || !timeInput || !prescribedPaceSec) return;
  timeInput.dataset.autofilled = suggestedMins > 0 ? '1' : '0';
  timeInput.addEventListener('input', () => {
    timeInput.dataset.autofilled = '0';
  });
  kmInput.addEventListener('input', () => {
    if (timeInput.dataset.autofilled !== '1') return;
    const nextKm = parseFloat(kmInput.value) || 0;
    const nextMins = estimateDurationMinsFromPace(prescribedPaceSec, nextKm);
    timeInput.value = nextMins > 0 ? String(nextMins) : '';
  });
}

function futureMakeupCandidates(sourceDate) {
  const today = todayStr();
  return (appData.plan || []).flatMap((week, weekIndex) => (week.days || []).map(day => ({ day, week, weekIndex })))
    .filter(({ day }) => {
      const isAvailable = !day.status || day.status === 'upcoming';
      return day.type === 'rest' && day.dateStr >= today && day.dateStr > sourceDate && isAvailable && !getGarminRunForDate(day.dateStr);
    });
}

function finishMissedDecision(dateStr) {
  recordTrainingEvent('skipped', { date: dateStr, detail: formatSkipReason(appData.skipReasons?.[dateStr]) });
  markDayStatus(dateStr, 'missed');
  closeModal();
  renderPlanView();
  showView('plan');
}

function scheduleMakeupRun(sourceDate, targetDate) {
  const source = (appData.plan || []).flatMap(week => week.days || []).find(day => day.dateStr === sourceDate);
  const target = (appData.plan || []).flatMap(week => week.days || []).find(day => day.dateStr === targetDate);
  if (!source || !target || target.type !== 'rest') return;
  applyMakeupAssignment(source, target);
  appData.makeupRecords = normalizeMakeupRecords(appData.makeupRecords);
  appData.makeupRecords[sourceDate] = { targetDate, source: 'scheduled' };
  recordTrainingEvent('makeup_scheduled', { sourceDate, targetDate, detail: formatSkipReason(appData.skipReasons?.[sourceDate]) });
  markDayStatus(sourceDate, 'missed');
  saveData(appData);
  closeModal();
  renderPlanView();
  showView('plan');
}

function applyMakeupAssignment(source, target) {
  const makeupKm = Math.round(((source.km || 5) * 0.8) * 10) / 10;
  if (!target.makeupOriginal) {
    target.makeupOriginal = { ...target, steps: [...(target.steps || [])], supportBlocks: target.supportBlocks ? [...target.supportBlocks] : target.supportBlocks };
  }
  target.type = source.type || 'easy';
  target.km = makeupKm;
  target.task = `補跑 ${makeupKm} km（原計畫縮短 20%）`;
  target.pace = source.pace || '';
  target.hrTarget = source.hrTarget || '';
  target.steps = source.steps || [];
  target.supportBlocks = null;
  target.isMakeup = true;
  target.makeupOf = source.dateStr;
}

function undoMissed(dateStr) {
  (appData.plan || []).forEach(week => (week.days || []).forEach(day => {
    if (day.dateStr === dateStr) delete day.status;
    if (day.makeupOf === dateStr && day.makeupOriginal) {
      Object.assign(day, day.makeupOriginal);
    }
  }));
  appData.dayStatuses = normalizeDayStatuses(appData.dayStatuses);
  delete appData.dayStatuses[dateStr];
  appData.makeupRecords = normalizeMakeupRecords(appData.makeupRecords);
  delete appData.makeupRecords[dateStr];
  recordTrainingEvent('skip_reverted', { date: dateStr });
  saveData(appData);
  renderPlanView();
  showView('plan');
}

function markMissed(dateStr) {
  const candidates = futureMakeupCandidates(dateStr);
  const options = candidates.map(({ day, week }) => `<option value="${day.dateStr}">${DOW_NAMES[day.dow]} ${day.dateStr} · 第 ${week.weekNum} 週休息日</option>`).join('');
  const skipReasonFields = renderSkipReasonFields(appData.skipReasons?.[dateStr]);
  const makeupControl = candidates.length
    ? `<div class="form-group"><label class="form-label" for="m-makeup-date">補跑日期</label><select class="form-input" id="m-makeup-date">${options}</select><div class="field-help">可選今天起尚未安排、沒有 Garmin 紀錄的休息日；補跑會取代該日的恢復內容。</div></div>`
    : `<div class="skip-reason">接下來的課表沒有可安全替換的休息日，因此這次不建議補跑。</div>`;
  showModal(
    '安排這次跳過',
    `<div class="field-help" style="margin-bottom:14px">補跑內容會比原計畫縮短 20%，避免把訓練負荷硬塞回來。</div>${makeupControl}${skipReasonFields}`,
    [
      ...(candidates.length ? [{
        label: '確認補跑',
        primary: true,
        action: () => {
          const code = document.getElementById('m-skip-reason-code')?.value;
          if (!SKIP_REASON_LABELS[code]) {
            document.getElementById('m-skip-reason-code')?.focus();
            return;
          }
          appData.skipReasons = normalizeSkipReasons(appData.skipReasons);
          appData.skipReasons[dateStr] = { code, noMakeupReason: document.getElementById('m-no-makeup-reason')?.value?.trim() || '' };
          scheduleMakeupRun(dateStr, document.getElementById('m-makeup-date')?.value);
        }
      }] : []),
      {
        label: '不補跑',
        action: () => {
          const code = document.getElementById('m-skip-reason-code')?.value;
          if (!SKIP_REASON_LABELS[code]) {
            document.getElementById('m-skip-reason-code')?.focus();
            return;
          }
          const noMakeupReason = document.getElementById('m-no-makeup-reason')?.value?.trim() || '';
          appData.skipReasons = normalizeSkipReasons(appData.skipReasons);
          appData.skipReasons[dateStr] = { code, noMakeupReason };
          finishMissedDecision(dateStr);
        }
      },
      { label: '取消', action: closeModal }
    ]
  );
}

function renderSkipReasonFields(existingReason) {
  const reason = typeof existingReason === 'string' ? { code: 'other', noMakeupReason: existingReason } : (existingReason || {});
  const skipReasonOptions = Object.entries(SKIP_REASON_LABELS).map(([code, label]) => `<option value="${code}" ${reason.code === code ? 'selected' : ''}>${label}</option>`).join('');
  return `<div class="form-group"><label class="form-label" for="m-skip-reason-code">跳過原因</label><select class="form-input" id="m-skip-reason-code"><option value="" ${reason.code ? '' : 'selected'} disabled>請選擇跳過原因</option>${skipReasonOptions}</select></div><div class="form-group"><label class="form-label" for="m-no-makeup-reason">不補跑原因（選填）</label><input class="form-input" id="m-no-makeup-reason" type="text" maxlength="240" value="${reviewEscape(reason.noMakeupReason || '')}" placeholder="例如：明天也有行程、需要先休息恢復"></div>`;
}

function saveSkipReason(dateStr) {
  const code = document.getElementById('m-skip-reason-code')?.value;
  if (!SKIP_REASON_LABELS[code]) {
    document.getElementById('m-skip-reason-code')?.focus();
    return;
  }
  const noMakeupReason = document.getElementById('m-no-makeup-reason')?.value?.trim() || '';
  appData.skipReasons = normalizeSkipReasons(appData.skipReasons);
  appData.skipReasons[dateStr] = { code, noMakeupReason };
  recordTrainingEvent('skip_reason_updated', { date: dateStr, detail: formatSkipReason(appData.skipReasons[dateStr]) });
  saveData(appData);
}

function editSkipReason(dateStr) {
  showModal(
    '補填跳過原因',
    `<div class="field-help" style="margin-bottom:14px">這筆原因會顯示在原課表日，讓後續調整知道這次跳過的背景。</div>${renderSkipReasonFields(appData.skipReasons?.[dateStr])}`,
    [
      {
        label: '儲存原因',
        primary: true,
        action: () => {
          const before = appData.skipReasons?.[dateStr];
          saveSkipReason(dateStr);
          if (appData.skipReasons?.[dateStr] === before) return;
          closeModal();
          renderPlanView();
          showView('plan');
        }
      },
      { label: '取消', action: closeModal }
    ]
  );
}

// ============================================================
// WEEKLY CHECK-IN
// ============================================================
function renderCheckinTrend() {
  const recent = [...(appData.checkins || [])].sort((a, b) => a.weekNum - b.weekNum).slice(-8);
  if (!recent.length) return '<p style="margin:12px 0 0;color:var(--c-text-muted);font-size:12px;line-height:1.55">完成每週評估後，這裡會自動顯示恢復趨勢與系統對下週做過的保護。</p>';
  const averageFatigue = recent.filter((item) => item.fatigue).reduce((sum, item, _, items) => sum + item.fatigue / items.length, 0);
  return `<div class="checkin-trend" aria-label="近期恢復趨勢">${recent.map((item) => {
    const tone = item.painConcern || item.result === '停止品質課' ? 'danger' : item.fatigue >= 4 || item.result === '降載恢復' ? 'caution' : 'good';
    const height = Math.max(14, Math.min(100, ((Number(item.fatigue) || 3) / 5) * 100));
    return `<div class="checkin-trend-item ${tone}" title="第 ${item.weekNum} 週｜疲勞 ${item.fatigue || '未填'}/5｜${reviewEscape(item.result || '維持')}"><div class="checkin-trend-bar"><i style="height:${height}%"></i></div><small>W${item.weekNum}</small></div>`;
  }).join('')}</div><p style="margin:8px 0 0;color:var(--c-text-muted);font-size:12px;line-height:1.55">近 ${recent.length} 週平均疲勞：${averageFatigue ? `${averageFatigue.toFixed(1)}/5` : '尚無主觀疲勞資料'}；柱越高代表疲勞越高，顏色反映系統是否已降載保護。</p>`;
}

// 歷史評估紀錄：讓週評估分頁看得到「之前每週系統做了什麼決定」，不只有本週表單
function renderCheckinHistory() {
  const past = [...(appData.checkins || [])]
    .filter((checkin) => checkin.weekNum !== currentWeek)
    .sort((a, b) => b.weekNum - a.weekNum)
    .slice(0, 5);
  if (!past.length) return '';
  return `<span class="checkin-section-label" style="margin-top:18px">歷史評估</span>
    <div class="checkin-history">${past.map((item) => {
      const tone = item.painConcern || item.result === '停止品質課' ? 'danger' : item.fatigue >= 4 || item.result === '降載恢復' ? 'caution' : 'good';
      return `<div class="checkin-history-item ${tone}"><b>第 ${item.weekNum} 週</b><span>${reviewEscape(item.result || '維持')}｜疲勞 ${item.fatigue || '—'}/5</span><p>${reviewEscape(item.adjustment || item.safetyNote || '照計畫執行')}</p></div>`;
    }).join('')}</div>`;
}

function renderCheckinSection() {
  const existing = (appData.checkins || []).find(checkin => checkin.weekNum === currentWeek);
  const totalWeeks = appData.plan?.length || 1;
  const timing = weeklyCheckinTiming();
  const weekSwitcher = `<div class="checkin-week-switcher" aria-label="切換評估週數">
    <button class="week-nav-btn" type="button" onclick="jumpToPhaseWeek(${currentWeek - 1})" ${currentWeek <= 1 ? 'disabled' : ''} aria-label="上一週">‹</button>
    <select aria-label="選擇評估週數" onchange="jumpToPhaseWeek(Number(this.value))">${Array.from({ length: totalWeeks }, (_, index) => index + 1).map((weekNum) => `<option value="${weekNum}" ${weekNum === currentWeek ? 'selected' : ''}>第 ${weekNum} 週</option>`).join('')}</select>
    <button class="week-nav-btn" type="button" onclick="jumpToPhaseWeek(${currentWeek + 1})" ${currentWeek >= totalWeeks ? 'disabled' : ''} aria-label="下一週">›</button>
  </div>`;
  if (existing) {
    return `<section class="checkin-card"><div class="checkin-head"><div><div class="checkin-kicker">Weekly review · ${currentWeek} / ${totalWeeks}</div><div class="checkin-title">✅ 第 ${currentWeek} 週評估完成</div></div>${weekSwitcher}</div><div class="checkin-body">
      <p class="checkin-intro">結果：<b>${existing.result}</b>　勾選 ${existing.score}/5</p>
      ${existing.fatigue ? `<p style="font-size:13px;color:var(--c-text-muted);margin-top:6px">本週整體疲勞：${existing.fatigue}/5</p>` : ''}
      ${existing.safetyNote ? `<p style="font-size:13px;color:var(--c-orange);margin-top:6px">安全判斷：${existing.safetyNote}</p>` : ''}
      ${existing.note ? `<p style="font-size:13px;color:var(--c-text-muted);margin-top:6px">週記：${existing.note}</p>` : ''}
      <p style="font-size:13px;margin:10px 0 0;line-height:1.65">${existing.adjustment}</p>${existing.provisional && timing.ready ? '<div class="training-status-actions" style="margin-top:12px;justify-content:flex-start"><button class="btn btn-secondary" onclick="reopenWeeklyCheckin()">完成本週最終評估</button></div>' : ''}${renderCheckinTrend()}${renderCheckinHistory()}
    </div>
    </section>`;
  }
  const qHTML = CHECKIN_QUESTIONS.map((question, index) => `<li><input type="checkbox" id="cq-${index}"><label for="cq-${index}">${question}</label></li>`).join('');
  return `<section class="checkin-card">
    <div class="checkin-head"><div><div class="checkin-kicker">Weekly review · ${currentWeek} / ${totalWeeks}</div><div class="checkin-title">📋 第 ${currentWeek} 週評估</div></div>${weekSwitcher}</div>
    <div class="checkin-body"><p class="checkin-intro">每週只做一次。系統會先判斷疼痛、疲勞、睡眠與長跑恢復；安全條件未滿足時，不會自動加量。${timing.ready ? ` 本週已進入收尾，可依結果安排下一週。` : ` 目前完成 ${timing.completed}/${timing.planned} 堂；可先填寫讓系統保護恢復，但會等本週最後一堂課後才開放小幅推進。`}</p>${renderCheckinTrend()}
    <span class="checkin-section-label">恢復與完成度</span>
    <ul class="checkin-questions">${qHTML}</ul>
    <span class="checkin-section-label">主觀感受</span>
    <div class="log-form-grid" style="margin-top:18px">
      <div class="form-group"><label class="form-label">本週整體疲勞 (1–5)</label><input class="form-input" id="cw-fatigue" type="number" min="1" max="5" placeholder="3"><div class="field-help">1 很輕鬆，3 正常可恢復，5 非常疲勞。</div></div>
      <div class="form-group"><label class="form-label">本週一句話備註</label><input class="form-input" id="cw-note" type="text" placeholder="例：長跑後腿有點重，但隔天恢復"></div>
    </div>
    <label class="checkin-safety"><input id="cw-pain-concern" type="checkbox" style="margin-top:3px">本週有疼痛、跛行、步態改變或越跑越痛。勾選後會停止下週品質課並建議評估。</label>
    <button class="btn btn-primary checkin-submit" onclick="submitCheckin()">提交第 ${currentWeek} 週評估</button>
    ${renderCheckinHistory()}
    </div>
  </section>`;
}

function adjustNextWeek(factor, removeQuality) {
  const nextWeekPlan = appData.plan[currentWeek];
  if (!nextWeekPlan) return;
  const beforePlan = futurePlanSnapshot();
  nextWeekPlan.targetKm = Math.round(nextWeekPlan.targetKm * factor * 10) / 10;
  nextWeekPlan.days = nextWeekPlan.days.map(day => {
    if (removeQuality && ['tempo', 'interval'].includes(day.type)) {
      const recovery = buildDayCard(day.dow, day.dateStr, 'easy', Math.round((day.km || 0) * factor * 10) / 10, appData.profile, false, false, !(appData.profile?.injuries || []).includes('none'), todayStr(), day.weekNum || currentWeek + 1, day.phaseName || nextWeekPlan.phase, 'recovery', '恢復跑');
      recovery.safetyOverride = true;
      recovery.recoveryProtection = '週評估偵測到疼痛、疲勞或恢復不足，品質課已改為恢復跑。';
      return recovery;
    }
    if (day.type !== 'rest') day.km = Math.round((day.km || 0) * factor * 10) / 10;
    return day;
  });
  recordPlanChange(beforePlan, 'checkin', removeQuality ? '週評估自動保護：下週降載並移除品質課' : '週評估已更新下週訓練量');
  saveData(appData);
}

function weeklyCheckinTiming() {
  const days = (appData.plan?.[currentWeek - 1]?.days || []).filter((day) => day.type !== 'rest' && !day.isMakeup);
  const completedDates = new Set([...(appData.log || []).map((entry) => entry.date), ...days.filter((day) => day.status === 'done').map((day) => day.dateStr)]);
  const completed = days.filter((day) => completedDates.has(day.dateStr)).length;
  const lastCourseDate = days.map((day) => day.dateStr).filter(Boolean).sort().at(-1) || todayStr();
  return { planned: days.length, completed, ready: todayStr() >= lastCourseDate };
}

function submitCheckin() {
  const answers = CHECKIN_QUESTIONS.map((_, index) => Boolean(document.getElementById(`cq-${index}`)?.checked));
  completeWeeklyCheckin({
    answers,
    fatigue: parseInt(document.getElementById('cw-fatigue')?.value, 10) || 0,
    note: document.getElementById('cw-note')?.value?.trim() || '',
    painConcern: Boolean(document.getElementById('cw-pain-concern')?.checked)
  });
}

function submitEarlyCoachPlanning() {
  const eligibility = earlyCoachPlanningEligibility();
  if (!eligibility.eligible) return;
  const answers = [true, ...CHECKIN_QUESTIONS.slice(1).map((_, index) => Boolean(document.getElementById(`early-check-${index + 1}`)?.checked))];
  completeWeeklyCheckin({
    answers,
    fatigue: parseInt(document.getElementById('early-fatigue')?.value, 10) || 0,
    note: document.getElementById('early-note')?.value?.trim() || '',
    painConcern: !answers[1],
    earlyTrigger: true,
    plannedSessionCount: eligibility.plannedSessions.length
  });
}

function completeWeeklyCheckin({ answers, fatigue, note, painConcern, earlyTrigger = false, plannedSessionCount = 0 }) {
  const score = answers.filter(Boolean).length;
  const timing = weeklyCheckinTiming();
  const decision = checkinSafetyDecision({ answers, fatigue, painConcern });
  if (!timing.ready && decision.allowIntensity && !earlyTrigger) {
    decision.result = '維持';
    decision.factor = 1;
    decision.allowIntensity = false;
    decision.note = `本週尚未結束（目前 ${timing.completed}/${timing.planned} 堂）；先保留恢復判讀，最後一堂完成後再評估是否推進。`;
  }
  if (earlyTrigger && decision.allowIntensity) decision.note = `本週 ${plannedSessionCount} 堂排定跑步課已完成；已依恢復檢核提前安排下一週，休息與居家肌力不列入跑步完成門檻。`;
  if (decision.factor !== 1 || decision.removeQuality) adjustNextWeek(decision.factor, decision.removeQuality);
  if (!decision.allowIntensity && (painConcern || fatigue >= 5 || !answers[1])) activateSafetyHold(decision, fatigue);
  appData.checkins = appData.checkins || [];
  appData.checkins.push({ weekNum: currentWeek, score, result: decision.result, adjustment: decision.note, safetyNote: decision.note, allowIntensity: decision.allowIntensity, painConcern, date: todayStr(), fatigue, note, provisional: !timing.ready, earlyTrigger });
  saveData(appData);
  assessProgress();
  jumpToPhaseWeek(currentWeek);
  switchPlanTab('checkin');
  showCheckinOutcome(decision, { ...timing, earlyTrigger });
}

function reopenWeeklyCheckin() {
  appData.checkins = (appData.checkins || []).filter((item) => item.weekNum !== currentWeek);
  saveData(appData);
  const host = document.getElementById('plan-tab-checkin');
  if (host) host.innerHTML = renderCheckinSection();
}

function showCheckinOutcome(decision, timing) {
  const hasNextWeek = currentWeek < (appData.plan?.length || 0);
  const nextStep = hasNextWeek
    ? decision.result === '小幅推進' ? '下週最多增加 5%，並保留品質課。' : decision.result === '維持' ? '下週課表維持，先把完成度與恢復做穩。' : '下週已依安全規則降量，品質課也已改為恢復安排。'
    : '本輪課表已到最後一週；可到「週期管理」封存本輪，並決定是否引用歷史給下一輪教練。';
  showModal('週評估結果', `<p style="margin:0 0 10px;line-height:1.7"><b>${reviewEscape(decision.result)}</b>：${reviewEscape(decision.note)}</p><div class="coach-setting-card"><div class="coach-setting-value">下一步</div><div class="coach-fineprint">${reviewEscape(nextStep)}${timing.ready ? '' : (timing.earlyTrigger ? ' 本次由手動提前排課觸發；本週結束後仍可重新完成最終評估。' : ' 本次評估僅做保護判讀，沒有提前加量。')}</div></div>`, [
    ...(hasNextWeek ? [{ label: '查看下週課表', primary: true, action: () => { closeModal(); jumpToPhaseWeek(currentWeek + 1); switchPlanTab('week'); } }] : [{ label: '前往週期管理', primary: true, action: () => { closeModal(); openCycleManagement(); } }]),
    { label: '留在週評估', action: closeModal }
  ]);
}

// ============================================================
// LIVE PACE CALIBRATION
// ============================================================

function getPrescribedPaceSec(dateStr, type) {
  for (const week of appData.plan) {
    const day = week.days.find(d => d.dateStr === dateStr && d.type === type);
    if (day && day.pace) {
      const m = day.pace.match(/(\d+):(\d+)/);
      if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
    }
  }
  return 0;
}

function estimateDurationMinsFromPace(paceSec, km) {
  if (!paceSec || paceSec <= 0 || !km || km <= 0) return 0;
  return Math.max(1, Math.round((paceSec * km) / 60));
}

// Returns { avgPaceGap (sec/km, negative = faster than prescribed), avgRpe, count }
function analyzePerformanceTrend(type, lookback = 3) {
  const log = (appData.log || []).filter(e =>
    e.type === type && e.actualKm > 0 && e.actualTimeMins > 0 && e.prescribedPaceSec > 0
  ).slice(-lookback);
  if (log.length < 2) return null;
  let paceGapSum = 0, rpeSum = 0;
  log.forEach(e => {
    paceGapSum += (e.actualTimeMins * 60) / e.actualKm - e.prescribedPaceSec;
    rpeSum += (e.rpe || 6);
  });
  return { avgPaceGap: paceGapSum / log.length, avgRpe: rpeSum / log.length, count: log.length };
}

function autoPaceCalibration() {
  const profile = appData.profile;
  if (!profile) return;
  const reasons = [];

  const tempoTrend = analyzePerformanceTrend('tempo');
  if (tempoTrend) {
    if (tempoTrend.avgPaceGap < -15 && tempoTrend.avgRpe < 7.5) {
      profile.tempoPaceSec = Math.max(profile.tempoPaceSec - 8, profile.racePaceSec + 5);
      reasons.push(`節奏跑配速提升 → ${secToPace(profile.tempoPaceSec)}/km`);
    } else if (tempoTrend.avgRpe > 8.5) {
      profile.tempoPaceSec += 10;
      reasons.push(`節奏跑配速放鬆 → ${secToPace(profile.tempoPaceSec)}/km`);
    }
  }

  const intervalTrend = analyzePerformanceTrend('interval');
  if (intervalTrend) {
    if (intervalTrend.avgPaceGap < -10 && intervalTrend.avgRpe < 7) {
      profile.intervalPaceSec = Math.max(profile.intervalPaceSec - 5, 150);
      reasons.push(`間歇配速提升 → ${secToPace(profile.intervalPaceSec)}/km`);
    } else if (intervalTrend.avgRpe > 9) {
      profile.intervalPaceSec += 8;
      reasons.push(`間歇配速放鬆 → ${secToPace(profile.intervalPaceSec)}/km`);
    }
  }

  const easyTrend = analyzePerformanceTrend('easy');
  if (easyTrend && easyTrend.avgRpe > 7 && easyTrend.count >= 2) {
    profile.easyPaceSec += 15;
    reasons.push(`輕鬆跑配速放鬆 → ${secToPace(profile.easyPaceSec)}/km`);
  }

  const longTrend = analyzePerformanceTrend('long');
  if (longTrend && longTrend.avgRpe > 7.5 && longTrend.count >= 2) {
    profile.easyPaceSec += 10;
    reasons.push(`長跑配速放鬆 → ${secToPace(profile.easyPaceSec)}/km`);
  }

  if (reasons.length > 0) {
    rebuildWeeksFrom(currentWeek + 1, Math.min(3, (appData.plan.length - currentWeek)));
    saveData(appData);
    showCalibrationToast(reasons);
  }
}

function showCalibrationToast(reasons) {
  document.getElementById('calibration-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'calibration-toast';
  toast.style.cssText = [
    'position:fixed', 'bottom:72px', 'left:50%', 'transform:translateX(-50%)',
    'background:var(--c-surface)', 'border:1.5px solid var(--c-primary)',
    'border-radius:10px', 'padding:12px 18px', 'font-size:13px',
    'z-index:300', 'max-width:360px', 'width:90%',
    'box-shadow:0 8px 24px rgba(0,0,0,0.15)', 'transition:opacity .4s'
  ].join(';');
  toast.innerHTML = `<div style="font-weight:700;margin-bottom:6px;color:var(--c-primary)">📊 配速已根據近期表現自動調整</div>
    <ul style="margin:0;padding-left:16px;color:var(--c-text-muted);line-height:1.8">
      ${reasons.map(r => `<li>${r}</li>`).join('')}
    </ul>`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; }, 4500);
  setTimeout(() => toast.remove(), 5000);
}

// ============================================================
// ADAPTIVE PLAN MANAGEMENT
// ============================================================
function assessProgress() {
  const plan = appData.plan || [];
  const log = appData.log || [];
  const profile = appData.profile;
  if (!plan.length || currentWeek < 2) return;
  const completedWeeks = plan.slice(0, currentWeek - 1);
  const completedPlanDays = completedWeeks.flatMap((week) => week.days || []);
  const completedSummary = trainingCompletionSummary(completedWeeks);
  const plannedKm = completedWeeks.reduce((sum, week) => sum + week.targetKm, 0);
  const actualKm = completedSummary.totalKm;
  const progressRate = plannedKm > 0 ? actualKm / plannedKm : 1;
  const plannedSessions = completedSummary.elapsedSessions;
  const doneSessions = completedSummary.completedSessions;
  const adherenceRate = plannedSessions > 0 ? doneSessions / plannedSessions : 1;
  const completedPlanDates = new Set(completedPlanDays.map((day) => day.dateStr));
  const recentLog = log.filter((entry) => completedPlanDates.has(entry.date));
  const avgRpe = recentLog.length > 0 ? recentLog.reduce((sum, entry) => sum + (entry.rpe || 6), 0) / recentLog.length : 6;
  const weeksLeft = plan.length - currentWeek + 1;
  const lowScoreStreak = hasTwoConsecutiveLowCheckins();
  if (progressRate > 1.15 && avgRpe < 6 && shouldShowAdaptationPrompt('ahead')) {
    showAdaptationDialog('ahead', { progressRate, avgRpe, weeksLeft });
  } else if ((progressRate < 0.6 || lowScoreStreak) && shouldShowAdaptationPrompt('behind_critical')) {
    showAdaptationDialog('behind_critical', { progressRate, adherenceRate, weeksLeft, lowScoreStreak });
  } else if (progressRate >= 0.6 && progressRate < 0.8 && weeksLeft > 4 && shouldShowAdaptationPrompt('behind_moderate')) {
    showAdaptationDialog('behind_moderate', { progressRate, weeksLeft });
  }
}

function showAdaptationDialog(scenario, data) {
  if (scenario === 'ahead') {
    showModal(
      '🚀 你超前計畫了！',
      `進度率 ${Math.round(data.progressRate * 100)}%，平均 RPE ${data.avgRpe.toFixed(1)}/10。<br><br>你跑得比計畫還好，要提升強度嗎？<br>若確認，系統會把目標配速再快 5 秒，並在允許的週期把主課提升。`,
      [
        { label: '提升強度', primary: true, action: () => { upgradeIntensity(); closeModal(); renderPlanView(); showView('plan'); } },
        { label: '維持現況', action: closeModal }
      ]
    );
  } else if (scenario === 'behind_moderate') {
    showModal(
      '📉 進度略為落後',
      `進度率 ${Math.round(data.progressRate * 100)}%，剩餘 ${data.weeksLeft} 週。<br><br>本週落後，繼續原計畫 / 降低目標 / 延後比賽日期？`,
      [
        { label: '繼續原計畫', action: closeModal },
        { label: '降低目標', primary: true, action: () => { adjustTargetPace(15); closeModal(); showView('plan'); } },
        { label: '延後比賽日期', action: () => { closeModal(); promptReschedule(); } }
      ]
    );
  } else if (scenario === 'behind_critical') {
    showModal(
      '⚠️ 計畫嚴重落後',
      `${data.lowScoreStreak ? '連續 2 週評估分數偏低。' : `進度率 ${Math.round(data.progressRate * 100)}%。`}<br><br>建議：重設計畫 / 降級目標 / 暫停。`,
      [
        { label: '重設計畫', primary: true, action: () => { closeModal(); resetPlanFromNow(); } },
        { label: '降級目標', action: () => { closeModal(); promptGoalDowngrade(); } },
        { label: '暫停計畫', action: () => { closeModal(); pausePlan(); } }
      ]
    );
  }
}

function upgradeIntensity() {
  const latestCheckin = (appData.checkins || []).find((item) => item.weekNum === currentWeek);
  if (!latestCheckin?.allowIntensity) {
    showModal('暫不提升強度', '需要先完成本週評估，且疼痛、疲勞、睡眠、長跑恢復與近兩週跑量增幅都在安全範圍，才會開放小幅提升。', [{ label: '查看週評估', primary: true, action: () => { closeModal(); openWeeklyCheckin(); } }, { label: '維持課表', action: closeModal }]);
    return;
  }
  const nextWeek = appData.plan[currentWeek];
  if (!nextWeek) return;
  appData.profile.racePaceSec = Math.max(appData.profile.racePaceSec - 5, 150);
  appData.profile.tempoPaceSec = appData.profile.racePaceSec + 12;
  appData.profile.intervalPaceSec = Math.max(appData.profile.racePaceSec - 10, 180);
  rebuildWeeksFrom(currentWeek + 1, 4);
  saveData(appData);
}

function adjustTargetPace(deltaSecPerKm) {
  appData.profile.racePaceSec += deltaSecPerKm;
  appData.profile.tempoPaceSec = appData.profile.racePaceSec + 12;
  appData.profile.intervalPaceSec = Math.max(appData.profile.racePaceSec - 10, 180);
  const dist = GOAL_DIST[appData.profile.goal];
  appData.profile.targetTime = secToTime(Math.round(appData.profile.racePaceSec * dist));
  rebuildWeeksFrom(currentWeek + 1, appData.plan.length - currentWeek);
  saveData(appData);
  renderPlanView();
  showView('plan');
}

function promptReschedule() {
  showModal(
    '📅 延後比賽日期',
    `<div class="form-group"><label class="form-label">新的比賽日期</label><input class="form-input" type="date" id="new-race-date" value="${appData.profile.targetDate}"></div>`,
    [
      {
        label: '確認',
        primary: true,
        action: () => {
          const newDate = document.getElementById('new-race-date').value;
          if (!newDate) return;
          appData.profile.targetDate = newDate;
          const extraWeeks = calcWeeks(newDate) - appData.plan.length;
          if (extraWeeks > 0) extendPlan(extraWeeks);
          saveData(appData);
          closeModal();
          renderPlanView();
          showView('plan');
        }
      },
      { label: '取消', action: closeModal }
    ]
  );
}

function promptGoalDowngrade() {
  const goalOrder = ['5k10k', 'half', 'full'];
  const curIdx = goalOrder.indexOf(appData.profile.goal);
  const downgradeGoal = curIdx > 0 ? goalOrder[curIdx - 1] : null;
  if (!downgradeGoal) {
    showModal('無法再降級', '已是最低目標（5K/10K）。建議暫停計畫休息。', [{ label: '確認', action: closeModal }]);
    return;
  }
  showModal(
    '降級目標',
    `把目標從 ${GOAL_NAME[appData.profile.goal]} 改為 ${GOAL_NAME[downgradeGoal]}？<br><br>訓練紀錄保留，計畫後半段重新生成。`,
    [
      {
        label: `改為 ${GOAL_NAME[downgradeGoal]}`,
        primary: true,
        action: () => {
          appData.profile.goal = downgradeGoal;
          const timeSec = timeToSec(appData.profile.targetTime);
          const dist = GOAL_DIST[downgradeGoal];
          appData.profile.racePaceSec = timeSec / dist;
          appData.profile.tempoPaceSec = appData.profile.racePaceSec + 12;
          appData.profile.intervalPaceSec = Math.max(appData.profile.racePaceSec - 10, 180);
          rebuildWeeksFrom(currentWeek + 1, appData.plan.length - currentWeek);
          saveData(appData);
          closeModal();
          renderPlanView();
          showView('plan');
        }
      },
      { label: '取消', action: closeModal }
    ]
  );
}

function resetPlanFromNow() {
  const newPlan = buildPlan({ ...appData.profile, generatedAt: new Date().toISOString() });
  appData.plan = [
    ...appData.plan.slice(0, currentWeek - 1),
    ...newPlan.slice(0, Math.max(0, newPlan.length - (currentWeek - 1)))
  ];
  saveData(appData);
  renderPlanView();
  showView('plan');
}

function pausePlan() {
  appData.profile.paused = true;
  appData.profile.pausedAt = todayStr();
  saveData(appData);
  showModal(
    '計畫已暫停',
    '訓練計畫已暫停。重新開始時，點「繼續計畫」即可恢復，訓練紀錄會保留。',
    [{ label: '確認', action: () => { closeModal(); renderPlanView(); showView('plan'); } }]
  );
}

function resumePlan() {
  const pausedAt = new Date(appData.profile.pausedAt || new Date());
  const daysPaused = Math.floor((new Date() - pausedAt) / 86400000);
  const weeksPaused = Math.round(daysPaused / 7);
  appData.plan.forEach(week => {
    week.days.forEach(day => {
      if (day.dateStr && new Date(day.dateStr) >= pausedAt && day.status === 'upcoming') {
        const shifted = new Date(day.dateStr);
        shifted.setDate(shifted.getDate() + weeksPaused * 7);
        day.dateStr = localDateStr(shifted);
      }
    });
  });
  appData.profile.paused = false;
  const newTargetDate = new Date(appData.profile.targetDate);
  newTargetDate.setDate(newTargetDate.getDate() + weeksPaused * 7);
  appData.profile.targetDate = localDateStr(newTargetDate);
  saveData(appData);
  renderPlanView();
  showView('plan');
}

function extendPlan(extraWeeks) {
  const profile = appData.profile;
  const lastWeek = appData.plan[appData.plan.length - 1];
  const lastKm = lastWeek?.targetKm || 30;
  const hasInjury = !profile.injuries.includes('none');
  const longDow = profile.dayState.indexOf(2);
  const trainDows = profile.dayState.map((s, i) => (s >= 1 ? i : -1)).filter(i => i >= 0).sort((a, b) => a - b);
  const otherDows = trainDows.filter(d => d !== longDow);
  const startDate = new Date(profile.generatedAt);
  for (let i = 0; i < extraWeeks; i++) {
    const weekNum = appData.plan.length + 1;
    const days = buildWeekDays(profile, trainDows, longDow, otherDows, lastKm, false, false, hasInjury, weekNum, startDate, 'maintain');
    appData.plan.push({ weekNum, phase: 'maintain', phaseLabel: '延長期', isDeload: false, isTaper: false, targetKm: lastKm, days });
  }
  syncRegisteredSundayRaces();
}

function rebuildWeeksFrom(startWeekNum, count) {
  const profile = appData.profile;
  const hasInjury = !profile.injuries.includes('none');
  const longDow = profile.dayState.indexOf(2);
  const trainDows = profile.dayState.map((s, i) => (s >= 1 ? i : -1)).filter(i => i >= 0).sort((a, b) => a - b);
  const otherDows = trainDows.filter(d => d !== longDow);
  const startDate = new Date(profile.generatedAt);
  for (let wi = 0; wi < count; wi++) {
    const weekIdx = startWeekNum - 1 + wi;
    if (weekIdx >= appData.plan.length) break;
    const week = appData.plan[weekIdx];
    const preserved = week.days.filter(day => day.status === 'done' || day.status === 'missed' || day.isMakeup || day.raceReplacementBase);
    const newDays = buildWeekDays(profile, trainDows, longDow, otherDows, week.targetKm, week.isDeload, week.isTaper, hasInjury, week.weekNum, startDate, week.phase);
    newDays.forEach(day => {
      const old = preserved.find(item => item.dateStr === day.dateStr);
      if (!old) return;
      if (old.isMakeup || old.raceReplacementBase) {
        Object.assign(day, old);
        return;
      }
      day.status = old.status;
    });
    week.days = newDays;
  }
  syncRegisteredSundayRaces();
}

// ============================================================
// LOG VIEW
// ============================================================
function trainingEventLabel(event) {
  const labels = {
    completed: '手動完成',
    skipped: '跳過課表',
    makeup_scheduled: '已安排補跑',
    makeup_auto_credited: 'Garmin 認列補跑',
    skip_reverted: '撤銷跳過',
    skip_reason_updated: '更新跳過原因',
    garmin_completion_rule_updated: '更新 Garmin 完成門檻'
  };
  const date = event.targetDate || event.date || event.sourceDate || '—';
  return `${date} · ${labels[event.type] || event.type}${event.detail ? `｜${event.detail}` : ''}`;
}

function renderLogSection() {
  const log = appData.log || [];
  const assessments = appData.assessments || [];
  const plan = appData.plan || [];
  const summary = trainingCompletionSummary(plan);
  const totalKm = summary.totalKm;
  const completedSessions = summary.completedSessions;
  const adherence = summary.adherence;
  const rows = [...log].reverse().map(entry => {
    const paceStr = entry.actualKm > 0 && entry.actualTimeMins > 0 ? `${secToPace((entry.actualTimeMins * 60) / entry.actualKm)}/km` : '—';
    const typeName = trainingTypeLabel(entry.type);
    return `<tr>
      <td>${entry.date}</td>
      <td>${typeName}</td>
      <td>${entry.actualKm} km</td>
      <td>${entry.actualTimeMins ? `${entry.actualTimeMins} 分` : '—'}</td>
      <td>${paceStr}</td>
      <td>${entry.rpe || '—'}</td>
    </tr>`;
  }).join('');
  const assessmentRows = assessments.map((entry, index) => {
    const summary = entry.type === 'test_20min'
      ? `${entry.distanceKm || '—'} km / 20 分`
      : `${entry.result || '—'}${entry.distanceKm ? ` · ${entry.distanceKm} km` : ''}`;
    return `<tr>
      <td>${entry.date}</td>
      <td>${formatAssessmentType(entry.type)}</td>
      <td>${summary}</td>
      <td>${entry.rpe || '—'}</td>
      <td><button class="btn btn-secondary" style="padding:6px 10px;font-size:12px" onclick="applyAssessmentToPlan(${index})">套用配速</button></td>
    </tr>`;
  }).join('');
  const eventRows = [...normalizeTrainingEvents(appData.trainingEvents)].reverse().slice(0, 12)
    .map((event) => `<li>${reviewEscape(trainingEventLabel(event))}</li>`).join('');
  return `
<div class="log-stats">
  <div class="stat-card"><div class="stat-value">${totalKm.toFixed(1)}</div><div class="stat-label">累積公里</div></div>
  <div class="stat-card"><div class="stat-value">${completedSessions}</div><div class="stat-label">完成次數</div></div>
  <div class="stat-card"><div class="stat-value">${adherence}%</div><div class="stat-label">遵從率</div></div>
</div>
<div class="card">
  <div class="card-title">使用建議</div>
  <p style="font-size:14px;color:var(--c-text-muted);line-height:1.7">正常使用時，優先做兩件事就好：1. 每天在課表卡上按完成/跳過。2. 每週到「週評估」做一次檢查。下面的手動新增記錄，是拿來補登遺漏資料，不是要你每天都填。</p>
</div>
<div class="card">
  <div class="card-title">訓練狀態紀錄</div>
  <p style="font-size:14px;color:var(--c-text-muted);margin-bottom:10px">完成、跳過、補跑與 Garmin 認列都會留下紀錄；課表重建不會把這些決策當成不存在。</p>
  ${eventRows ? `<ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.9">${eventRows}</ul>` : '<p style="color:var(--c-text-muted);font-size:14px">尚無狀態變更紀錄</p>'}
</div>
<div class="card">
  <div class="card-title">檢測紀錄 / 配速校正</div>
  <p style="font-size:14px;color:var(--c-text-muted);margin-bottom:16px">建議每 4 週、進入新週期前，或狀態明顯改變時新增一筆檢測。套用後只會重建未來週課表，已完成紀錄保留。</p>
  <div class="log-form-grid">
    <div class="form-group"><label class="form-label">日期</label><input class="form-input" type="date" id="assessment-date" value="${todayStr()}"></div>
    <div class="form-group"><label class="form-label">檢測類型</label><select class="form-input" id="assessment-type"><option value="test_20min">20 分鐘測驗</option><option value="race_5k">5K 測驗</option><option value="race_10k">10K 測驗</option><option value="race_half">半馬測驗</option><option value="custom_race">近期比賽</option></select></div>
    <div class="form-group"><label class="form-label">成績時間 (H:MM:SS / M:SS)</label><input class="form-input" type="text" id="assessment-result" placeholder="20 分測驗可留空"></div>
    <div class="form-group"><label class="form-label">距離 (km)</label><input class="form-input" type="number" id="assessment-distance" step="0.1" placeholder="20 分測驗或自訂比賽才需要"></div>
    <div class="form-group"><label class="form-label">RPE (1–10)<span class="inline-help">主觀疲勞</span></label><input class="form-input" type="number" id="assessment-rpe" min="1" max="10" placeholder="7"><div class="field-help">如果這次測驗已經接近全力，通常會落在 8–10；若只是穩定測驗，通常在 6–7。</div></div>
    <div class="form-group"><label class="form-label">備註</label><input class="form-input" type="text" id="assessment-notes" placeholder="選填"></div>
  </div>
  <button class="btn btn-primary" onclick="addAssessmentRecord()">新增檢測並更新建議</button>
</div>
<details class="card">
  <summary>手動補登每日記錄</summary>
  <p style="font-size:14px;color:var(--c-text-muted);margin-bottom:16px">只有在你忘記用課表卡打卡，或想補記舊資料時再開這裡。平常不需要每天手動填。</p>
  <div class="log-form-grid">
    <div class="form-group"><label class="form-label">日期</label><input class="form-input" type="date" id="log-date" value="${todayStr()}"></div>
    <div class="form-group"><label class="form-label">類型</label><select class="form-input" id="log-type"><option value="easy">輕鬆跑</option><option value="tempo">節奏跑</option><option value="interval">間歇跑</option><option value="long">長跑</option></select></div>
    <div class="form-group"><label class="form-label">距離 (km)</label><input class="form-input" type="number" id="log-km" step="0.1" placeholder="5.0"></div>
    <div class="form-group"><label class="form-label">時間 (分鐘)</label><input class="form-input" type="number" id="log-time" placeholder="30"></div>
    <div class="form-group"><label class="form-label">RPE (1–10)<span class="inline-help">主觀疲勞</span></label><input class="form-input" type="number" id="log-rpe" min="1" max="10" placeholder="6"><div class="field-help">不確定就抓大概即可：4 輕鬆、6 穩定、8 很吃力。</div></div>
    <div class="form-group"><label class="form-label">備註</label><input class="form-input" type="text" id="log-notes" placeholder="選填"></div>
  </div>
  <button class="btn btn-primary" onclick="addManualLog()">新增記錄</button>
</details>
<div class="card">
  <div class="card-title">檢測歷史</div>
  ${assessments.length === 0 ? '<p style="color:var(--c-text-muted);font-size:14px">尚無檢測紀錄</p>' : `<div class="table-scroll"><table class="log-table"><thead><tr><th>日期</th><th>類型</th><th>結果</th><th>RPE</th><th>操作</th></tr></thead><tbody>${assessmentRows}</tbody></table></div>`}
</div>
<div class="card">
  <div class="card-title">訓練記錄</div>
  ${log.length === 0 ? '<p style="color:var(--c-text-muted);font-size:14px">尚無記錄</p>' : `<div class="table-scroll"><table class="log-table"><thead><tr><th>日期</th><th>類型</th><th>距離</th><th>時間</th><th>配速</th><th>RPE</th></tr></thead><tbody>${rows}</tbody></table></div>`}
</div>`;
}

function addManualLog() {
  const entry = {
    date: document.getElementById('log-date').value,
    type: document.getElementById('log-type').value,
    actualKm: parseFloat(document.getElementById('log-km').value) || 0,
    actualTimeMins: parseInt(document.getElementById('log-time').value, 10) || 0,
    rpe: parseInt(document.getElementById('log-rpe').value, 10) || 0,
    notes: document.getElementById('log-notes').value
  };
  if (!entry.date || !entry.actualKm) return;
  saveLogEntry(entry);
  assessProgress();
  document.getElementById('plan-tab-log').innerHTML = renderLogSection();
}

function addAssessmentRecord() {
  const entry = {
    date: document.getElementById('assessment-date').value,
    type: document.getElementById('assessment-type').value,
    result: document.getElementById('assessment-result').value.trim(),
    distanceKm: parseFloat(document.getElementById('assessment-distance').value) || 0,
    rpe: parseInt(document.getElementById('assessment-rpe').value, 10) || 0,
    notes: document.getElementById('assessment-notes').value.trim()
  };
  const needsDistance = ['test_20min', 'custom_race'].includes(entry.type);
  if (!entry.date) return;
  if (needsDistance && !entry.distanceKm) return;
  if (!needsDistance && !entry.result) return;
  saveAssessmentEntry(entry);
  document.getElementById('plan-tab-log').innerHTML = renderLogSection();
  showModal(
    '套用這筆檢測？',
    `已新增「${formatAssessmentType(entry.type)}」檢測。要用這筆資料重算配速並更新後續課表嗎？`,
    [
      { label: '先套用', primary: true, action: () => applyAssessmentToPlan(0) },
      { label: '先保留', action: closeModal }
    ]
  );
}

// ============================================================
// EXPORTS
// ============================================================
let pendingTrainingImport = null;
let pendingTrainingImportInfo = null;

function trainingBackupFileName() {
  return `runner-training-backup-${todayStr()}.json`;
}

function trainingDataCounts(data) {
  const normalized = normalizeData(data);
  return {
    weeks: normalized.plan.length,
    days: normalized.plan.flatMap((week) => week.days || []).length,
    logs: normalized.log.length,
    checkins: normalized.checkins.length,
    cycles: normalized.cycleHistory.length
  };
}

function backupAgeMessage(value = appData.lastBackupAt) {
  if (!value) return '尚未建立備份，建議現在先匯出一份。';
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  return ageDays >= 14 ? `上次備份已 ${ageDays} 天，建議先建立新備份。` : ageDays ? `上次備份為 ${ageDays} 天前。` : '今天已建立備份。';
}

function exportTrainingData() {
  const backup = {
    app: 'Runner Training Handbook',
    schemaVersion: PLAN_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    backupFormatVersion: 1,
    data: normalizeData(appData)
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = trainingBackupFileName();
  link.click();
  URL.revokeObjectURL(link.href);
  appData.lastBackupAt = backup.exportedAt;
  saveData(appData);
  closeModal();
}

function requestTrainingDataImport() {
  document.getElementById('training-data-import')?.click();
}

function importTrainingData(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ''));
      const rawData = parsed?.data || parsed;
      if (!rawData || typeof rawData !== 'object' || !Array.isArray(rawData.plan) || !Array.isArray(rawData.log)) throw new Error('invalid backup');
      pendingTrainingImport = normalizeData(rawData);
      pendingTrainingImportInfo = { fileName: file.name, exportedAt: parsed?.exportedAt || '' };
      const incoming = trainingDataCounts(pendingTrainingImport);
      const current = trainingDataCounts(appData);
      const backupDate = pendingTrainingImportInfo.exportedAt ? new Date(pendingTrainingImportInfo.exportedAt).toLocaleString('zh-TW', { hour12: false }) : '未標示建立時間';
      showModal('還原訓練資料', `<p style="margin:0 0 10px;line-height:1.65">備份檔：<b>${reviewEscape(file.name)}</b>（${reviewEscape(backupDate)}）</p><div class="coach-setting-card"><div class="coach-setting-value">匯入前預覽</div><div class="coach-fineprint">備份：${incoming.weeks} 週／${incoming.days} 天安排／${incoming.logs} 筆紀錄／${incoming.checkins} 次週評估／${incoming.cycles} 份週期歷史<br>目前：${current.weeks} 週／${current.days} 天安排／${current.logs} 筆紀錄／${current.checkins} 次週評估／${current.cycles} 份週期歷史</div></div><p style="margin:10px 0 0;color:var(--c-orange);font-size:13px;line-height:1.6">確認後會取代目前資料；系統會在本機保留一份「匯入前快照」，可立即復原。</p>`, [
        { label: '確認還原', primary: true, action: applyTrainingDataImport },
        { label: '取消', action: () => { pendingTrainingImport = null; pendingTrainingImportInfo = null; closeModal(); } }
      ]);
    } catch {
      showModal('無法讀取備份', '<p style="margin:0;color:var(--c-text-muted);line-height:1.65">請選擇由 Runner 訓練計畫匯出的 JSON 備份檔。</p>', [{ label: '知道了', primary: true, action: closeModal }]);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file, 'utf-8');
}

function applyTrainingDataImport() {
  if (!pendingTrainingImport) return;
  try {
    localStorage.setItem(PRE_RESTORE_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: normalizeData(appData) }));
  } catch (error) {
    console.warn('training pre-restore snapshot unavailable', error);
  }
  appData = pendingTrainingImport;
  pendingTrainingImport = null;
  pendingTrainingImportInfo = null;
  saveData(appData);
  closeModal();
  renderPlanView();
  showView('plan');
}

function restorePreImportSnapshot() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(PRE_RESTORE_STORAGE_KEY) || 'null');
    if (!snapshot?.data) throw new Error('missing snapshot');
    appData = normalizeData(snapshot.data);
    saveData(appData);
    closeModal();
    renderPlanView();
    showView('plan');
  } catch {
    showModal('找不到匯入前快照', '<p style="margin:0;line-height:1.7">目前沒有可用的匯入前快照；請改用你匯出的 JSON 備份還原。</p>', [{ label: '知道了', primary: true, action: closeModal }]);
  }
}

function confirmRestorePreImportSnapshot() {
  showModal('復原匯入前資料？', '<p style="margin:0;line-height:1.7">這會以最近一次匯入前的本機快照取代目前資料。若目前已有新紀錄，請先匯出備份再繼續。</p>', [
    { label: '確認復原', primary: true, action: restorePreImportSnapshot },
    { label: '取消', action: closeModal }
  ]);
}

function cycleHistoryById(id) {
  return (appData.cycleHistory || []).find((cycle) => cycle.id === id) || null;
}

function cycleHistorySummaryHtml(cycle, { detail = false } = {}) {
  const summary = cycle.summary || {};
  const archivedAt = new Date(cycle.archivedAt).toLocaleDateString('zh-TW');
  const facts = cycle.coachSummary?.facts || [];
  return `<div class="coach-setting-card" style="margin:0 0 10px"><div class="coach-setting-value">${reviewEscape(cycle.title)}</div><div class="coach-fineprint">${archivedAt} 封存 · ${summary.plannedWeeks || 0} 週 · 完成 ${summary.completedSessions || 0}/${summary.plannedSessions || 0} 堂（${summary.adherence || 0}%）</div>${detail ? `<ul style="margin:10px 0 0;padding-left:18px;font-size:13px;line-height:1.7">${facts.map((fact) => `<li>${reviewEscape(fact)}</li>`).join('')}</ul>` : ''}</div>`;
}

function openCycleHistory() {
  const cycles = [...(appData.cycleHistory || [])].reverse();
  const body = cycles.length
    ? `<p style="margin:0 0 14px;color:var(--c-text-muted);line-height:1.65">每份週期都保留完整課表與訓練紀錄；新週期只帶入精煉摘要，避免把舊課表直接覆寫進來。</p>${cycles.map((cycle) => `${cycleHistorySummaryHtml(cycle)}<div style="display:flex;gap:8px;flex-wrap:wrap;margin:-2px 0 14px"><button class="btn btn-secondary" type="button" onclick="openCycleHistoryDetail('${cycle.id}')">查看完整紀錄</button><button class="btn btn-secondary" type="button" onclick="attachCycleToCoach('${cycle.id}')">提供給教練</button><button class="btn btn-primary" type="button" onclick="restartFromCycleHistory('${cycle.id}')">以此重新開始</button></div>`).join('')}`
    : '<p style="margin:0;color:var(--c-text-muted);line-height:1.65">尚無封存週期。當你選擇「封存目前週期並重新開始」時，系統會先建立第一份完整歷史。</p>';
  showModal('🗂 訓練週期歷史', body, [{ label: '關閉', primary: true, action: closeModal }], { className: 'guide-modal' });
}

function openCycleManagement() {
  const active = archiveCurrentCycle('restart');
  const historyCount = appData.cycleHistory?.length || 0;
  const currentSummary = active?.summary;
  const currentCard = currentSummary
    ? `<section class="cycle-management-current"><div class="cycle-management-label">目前週期</div><div class="cycle-management-title">${reviewEscape(active.title)}</div><div class="cycle-management-stats"><span>課程完成 <b>${currentSummary.completedSessions}/${currentSummary.plannedSessions} 堂</b></span><span>執行率 <b>${currentSummary.adherence}%</b></span><span>實跑 <b>${currentSummary.actualKm.toFixed(1)} km</b></span></div></section>`
    : '<section class="cycle-management-current"><div class="cycle-management-label">目前週期</div><div class="cycle-management-title">尚無可管理的正式週期</div></section>';
  showModal('🗂 週期管理', `${currentCard}<section class="cycle-management-history"><div><div class="cycle-management-label">歷史週期</div><div class="cycle-management-title">${historyCount} 份封存紀錄</div></div><p>結束本輪會先完整封存，再帶入精煉摘要協助教練安排下一輪；資料不會被刪除。</p></section>`, [
    { label: '查看週期歷史', primary: true, action: openCycleHistory },
    ...(active ? [{ label: '結束本輪並建立新週期', action: confirmRestartTrainingCycle }] : []),
    { label: '資料與備份', action: openTrainingDataManager },
    { label: '關閉', action: closeModal }
  ], { className: 'cycle-management-modal' });
}

function openCycleHistoryDetail(id) {
  const cycle = cycleHistoryById(id);
  if (!cycle) return;
  const planDays = cycle.plan.flatMap((week) => week.days || []).length;
  const coachSnapshot = cycle.coachSnapshot;
  const coachSnapshotText = coachSnapshot ? `；Garmin／教練快照截至 ${reviewEscape(coachSnapshot.analyticsUpdatedAt || coachSnapshot.updatedAt || '封存當下')}，含 ${(coachSnapshot.analyticsRuns || []).length} 筆近期實跑` : '';
  const body = `${cycleHistorySummaryHtml(cycle, { detail: true })}<div style="margin-top:14px"><b>完整封存內容</b><p class="coach-fineprint">${cycle.plan.length} 週／${planDays} 天課表、${cycle.log.length} 筆手動紀錄、${cycle.checkins.length} 筆週評估、${cycle.assessments.length} 筆檢測，以及狀態與調整歷程均已保留${coachSnapshotText}。</p></div>`;
  showModal('歷史週期明細', body, [
    { label: '提供給教練', primary: true, action: () => attachCycleToCoach(id) },
    { label: '以此重新開始', action: () => restartFromCycleHistory(id) },
    { label: '返回歷史', action: openCycleHistory }
  ]);
}

function attachCycleToCoach(id) {
  const cycle = cycleHistoryById(id);
  if (!cycle?.coachSummary) return;
  if (appData.profile) {
    appData.profile.historyContext = cloneTrainingValue(cycle.coachSummary);
  } else {
    appData.nextCycleDraft = { ...(appData.nextCycleDraft || cycle.profile), targetDate: appData.nextCycleDraft?.targetDate || '' };
    appData.nextCycleCoachContext = cloneTrainingValue(cycle.coachSummary);
  }
  saveData(appData);
  closeModal();
  if (appData.profile) {
    refreshCoachReviewPanels();
    showView('plan');
    switchPlanTab('coach');
  } else {
    renderSetupView();
    showView('setup');
  }
}

function restartFromCycleHistory(id) {
  const source = cycleHistoryById(id);
  if (!source) return;
  const continueRestart = () => {
    const currentArchive = archiveCurrentCycle('restart');
    const history = normalizeCycleHistory([...(appData.cycleHistory || []), ...(currentArchive ? [currentArchive] : [])]);
    appData = {
      ...createEmptyData(),
      cycleHistory: history,
      nextCycleDraft: { ...source.profile, targetDate: '', targetTime: '', recentResult: '', generatedAt: '' },
      nextCycleCoachContext: cloneTrainingValue(source.coachSummary),
      lastBackupAt: appData.lastBackupAt
    };
    saveData(appData);
    closeModal();
    renderSetupView();
    showView('setup');
  };
  if (appData.profile && appData.plan?.length) {
    showModal('以歷史週期重新開始', '<p style="margin:0;line-height:1.7">目前週期會先完整封存，再以選取週期的設定與教練摘要建立新週期。</p>', [
      { label: '封存目前週期並繼續', primary: true, action: continueRestart },
      { label: '取消', action: closeModal }
    ]);
  } else {
    continueRestart();
  }
}

function openTrainingDataManager() {
  const health = trainingDataHealth(appData.plan || []);
  const backupAt = appData.lastBackupAt ? new Date(appData.lastBackupAt).toLocaleString('zh-TW', { hour12: false }) : '尚未建立備份';
  let hasPreImportSnapshot = false;
  try { hasPreImportSnapshot = Boolean(JSON.parse(localStorage.getItem(PRE_RESTORE_STORAGE_KEY) || 'null')?.data); } catch { /* 無可用本機快照 */ }
  const issueText = health.issues.length ? health.issues.map((issue) => `<li>${reviewEscape(issue)}</li>`).join('') : '<li>資料結構與完成認列狀態正常。</li>';
  const rawRaceLog = Array.isArray(appData.raceIntegrationLog) ? appData.raceIntegrationLog : [];
  const seenRaceLogTexts = new Set();
  const raceLog = rawRaceLog.filter((entry) => {
    if (seenRaceLogTexts.has(entry.text)) return false; // 顯示前再去重一次，把裝置上已經累積的舊重複紀錄濾掉
    seenRaceLogTexts.add(entry.text);
    return true;
  });
  const raceLogHtml = raceLog.length
    ? `<div style="margin-top:14px"><b>賽事整合紀錄</b><ul style="margin:8px 0 0;padding-left:20px;color:var(--c-text-muted);font-size:13px;line-height:1.7">${raceLog.map((entry) => `<li>${reviewEscape(entry.at)}：${reviewEscape(entry.text)}</li>`).join('')}</ul></div>`
    : '';
  showModal('資料與備份', `<div class="coach-setting-card"><div class="coach-setting-value">${reviewEscape(garminCompletionRuleLabel())}</div><div class="coach-fineprint">完成、補跑與執行率皆使用此同一條規則。手動完成不受 Garmin 門檻覆寫。</div></div><div style="margin-top:14px"><b>資料健康檢查</b><ul style="margin:8px 0 0;padding-left:20px;color:var(--c-text-muted);font-size:13px;line-height:1.7">${issueText}</ul></div>${raceLogHtml}<div style="margin-top:14px;color:var(--c-text-muted);font-size:13px">最近備份：${reviewEscape(backupAt)}<br>${reviewEscape(backupAgeMessage())}${hasPreImportSnapshot ? '<br>保留一份最近匯入前快照，可在需要時復原。' : ''}</div>`, [
    { label: '匯出備份', primary: true, action: exportTrainingData },
    { label: '還原備份', action: requestTrainingDataImport },
    ...(hasPreImportSnapshot ? [{ label: '復原匯入前快照', action: confirmRestorePreImportSnapshot }] : []),
    { label: '完成門檻', action: configureGarminCompletionRule },
    { label: '關閉', action: closeModal }
  ]);
}

function exportPDF() {
  switchPlanTab('week');
  setTimeout(() => window.print(), 100);
}

function generateOfflineHTML(week, profile, weekNum) {
  const badgeMap = { easy: 'badge-easy', tempo: 'badge-tempo', interval: 'badge-interval', long: 'badge-long', race: 'badge-long', rest: 'badge-rest' };
  const typeMap = TRAINING_TYPE_LABELS;
  const meta = GOAL_META[profile.goal] || GOAL_META.half;
  const weekGuide = getPhaseRuleText(week, profile, appData.plan?.length || weekNum);
  const cards = week.days.map(day => {
    if (day.type === 'rest') {
      const supportHTML = (day.supportBlocks || []).map(block => `
        <div class="strength-box">
          <strong>${block.title}</strong>
          ${block.detail}
        </div>
      `).join('');
      return `<div class="day-card">
        <div class="day-card-header"><span class="day-card-date">${DOW_NAMES[day.dow]} ${(day.dateStr || '').slice(5)}</span></div>
        <span class="workout-badge badge-rest">休息</span>
        <div class="day-card-task" style="font-size:12px;color:var(--c-text-muted)">${day.task || '主動恢復 / 完全休息'}</div>
        ${supportHTML}
      </div>`;
    }
    const stepsHTML = (day.steps || []).map(step => `<div class="step"><span><strong>${step.title || ''}</strong>${step.detail ? `：${step.detail}` : (step.text || '')}${step.dose ? ` (${step.dose})` : ''}</span></div>`).join('');
    return `<div class="day-card ${day.isDeload ? 'deload-card' : ''}">
      <div class="day-card-header"><span class="day-card-date">${DOW_NAMES[day.dow]} ${(day.dateStr || '').slice(5)}</span></div>
      <span class="workout-badge ${badgeMap[day.type] || 'badge-rest'}">${typeMap[day.type] || day.type}</span>
      <div class="day-card-task">${day.task || ''}</div>
      <div class="day-card-pace">${day.pace || ''}</div>
      <div class="workout-steps">${stepsHTML}</div>
      <button class="check-btn" data-date="${day.dateStr}">標記完成</button>
    </div>`;
  }).join('');
  return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${meta.label}手機訓練手冊 第${weekNum}週</title>
<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}:root{--bg:#f6f4ee;--surface:#fffdf8;--surface2:#fbf8f0;--border:#e2ded4;--text:#1f2a24;--muted:#65736b;--primary:#24724f;--primary-hover:#155338;--green:#24724f;--orange:#e8753d;--blue:#dbeef3;--radius:14px;--shadow:0 18px 40px rgba(31,42,36,.08)}body{background:var(--bg);color:var(--text);font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;padding:16px;line-height:1.65}.shell{max-width:760px;margin:0 auto}.hero{padding:22px 18px;border:1px solid rgba(31,42,36,.08);border-radius:18px;background:linear-gradient(135deg,rgba(231,242,235,.94),rgba(255,253,248,.98));box-shadow:var(--shadow);margin-bottom:16px}.kicker{font-size:12px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:var(--primary-hover)}.header{font-size:28px;font-weight:900;line-height:1.18;margin-top:6px}.sub{font-size:14px;color:var(--muted);margin-top:10px}.meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}.meta-card{padding:12px;border-radius:12px;background:rgba(255,253,248,.94);border:1px solid rgba(31,42,36,.08)}.meta-card b{display:block;font-size:12px;margin-bottom:4px}.meta-card span{font-size:13px;color:var(--muted);line-height:1.55}.section{margin-bottom:16px}.section-title{font-size:18px;font-weight:900;margin-bottom:10px}.lead-card{padding:14px 16px;border:1px solid rgba(31,42,36,.08);border-radius:14px;background:var(--surface)}.week-calendar{display:grid;grid-template-columns:1fr;gap:12px}.day-card{background:var(--surface);border:2px solid var(--border);border-radius:12px;padding:16px;box-shadow:0 10px 24px rgba(31,42,36,.05)}.day-card.deload-card{border-color:var(--orange);border-style:dashed}.day-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px}.day-card-date{font-size:12px;color:var(--muted)}.workout-badge{display:inline-block;font-size:11px;font-weight:900;padding:4px 10px;border-radius:999px;margin-bottom:10px}.badge-easy{background:#d9ffe4;color:#14532d}.badge-tempo{background:#fff0e7;color:#9b4f2b}.badge-interval{background:#ffe0d5;color:#8a3521}.badge-long{background:var(--blue);color:#295d6a}.badge-rest{background:var(--surface2);color:var(--muted)}.day-card-task{font-size:16px;font-weight:800;margin-bottom:4px;line-height:1.45}.day-card-pace{font-size:13px;color:var(--muted);margin-bottom:12px}.workout-steps{font-size:13px;color:var(--muted);line-height:1.7;display:grid;gap:8px}.step{display:flex;gap:8px}.step-icon{font-size:13px;line-height:1.4;flex-shrink:0}.strength-box{background:var(--surface2);border-radius:10px;padding:10px;margin-top:8px;font-size:12px;color:var(--muted);border:1px solid rgba(31,42,36,.06)}.strength-box strong{color:var(--text);display:block;margin-bottom:4px}.check-btn{width:100%;margin-top:12px;padding:10px;border-radius:10px;border:none;background:var(--primary);color:#fff;font-size:14px;font-weight:800;cursor:pointer}.check-btn.checked{background:var(--green)}@media (max-width:640px){body{padding:12px}.header{font-size:24px}.meta-grid{grid-template-columns:1fr}}</style>
</head><body><div class="shell"><div class="hero"><div class="kicker">Mobile Training Handbook</div><div class="header">${meta.icon} ${meta.label}｜第 ${weekNum} 週</div><div class="sub">目標日 ${profile.targetDate} · ${week.phaseLabel} · 目標 ${week.targetKm} km · 目標配速 ${secToPace(profile.racePaceSec)}/km</div><div class="meta-grid"><div class="meta-card"><b>這個模式在做什麼</b><span>${meta.handbook}</span></div><div class="meta-card"><b>這週重點</b><span>${weekGuide}</span></div><div class="meta-card"><b>怎麼用這份手冊</b><span>先看今天那張卡，照著熱身、主課、收操完成；若身體不適，優先保留恢復與下修跑量。</span></div></div></div><div class="section"><div class="section-title">本週卡片</div><div class="lead-card">這份 HTML 是單週手機版訓練手冊。你不需要另外解讀課表邏輯，直接照卡片做，完成後可在本機標記。</div></div><div class="section"><div class="week-calendar">${cards}</div></div></div><script>const SK='trainer-offline-${weekNum}';function load(){const d=JSON.parse(localStorage.getItem(SK)||'{}');document.querySelectorAll('[data-date]').forEach(b=>{if(d[b.dataset.date]){b.textContent='✓ 已完成';b.classList.add('checked')}})}document.querySelectorAll('[data-date]').forEach(b=>{b.addEventListener('click',()=>{const d=JSON.parse(localStorage.getItem(SK)||'{}');d[b.dataset.date]=true;localStorage.setItem(SK,JSON.stringify(d));b.textContent='✓ 已完成';b.classList.add('checked')})});load();<\/script></body></html>`;
}

function exportHTML() {
  const week = appData.plan[currentWeek - 1];
  if (!week) return;
  const finalHtml = generateOfflineHTML(week, appData.profile, currentWeek);
  const blob = new Blob([finalHtml], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${appData.profile?.goal || 'trainer'}-handbook-week-${currentWeek}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

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
    renderPlanView();
    if (ui.week && appData.plan[ui.week - 1]) jumpToPhaseWeek(ui.week);
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
    if (typeof applyDailySessionAdvisory === 'function') applyDailySessionAdvisory();
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
    // 校準結果顯示在教練建議分頁的「上次滾動校準」卡片，背景自動觸發不再跳 toast
    if (typeof autoRecalibratePlan === 'function') autoRecalibratePlan();
    if (typeof applyDailySessionAdvisory === 'function') {
      // 教練資料到位後才可能觸發「昨日高強度」降階；有調整就同步刷新週視圖
      const advisoryResult = applyDailySessionAdvisory();
      if (advisoryResult && document.getElementById('plan-tab-week')) jumpToPhaseWeek(currentWeek);
    }
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
