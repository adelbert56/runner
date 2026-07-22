// trainer-plan.js
// Plan generation, rolling recalibration, fitness projection, and cycle apply/restart.
// Extracted from trainer.js (2026-07-19 refactor). Classic script; all
// top-level functions stay global. Loaded before trainer.js so init() can call them.

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
            ],
        guideKind: 'cooldown',
        guideCourseIndex: rotation === 2 ? 1 : 0
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
            ],
        guideKind: 'cooldown',
        guideCourseIndex: rotation === 2 ? 1 : 0
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

// Garmin 的訓練負荷沒有跨使用者可共用的絕對門檻，因此只和自己的近期基準比較。
// 單趟高 TE 不會擅自降載；必須同時看見負荷連續上升與高強度效果，才下修未來週。
function garminLoadDecision(runs = []) {
  const validRuns = runs.filter((run) => Number(run.trainingLoad) > 0).slice(-6);
  if (validRuns.length < 3) {
    return { factor: 1, status: 'insufficient', message: 'Garmin 訓練負荷資料未滿 3 趟，暫不以單次數值調整課表。' };
  }
  const average = (items, field) => {
    const values = items.map((item) => Number(item[field])).filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const recent = validRuns.slice(-3);
  const previous = validRuns.slice(-6, -3);
  const recentLoad = average(recent, 'trainingLoad');
  const previousLoad = average(previous, 'trainingLoad');
  const aerobicTe = average(recent, 'aerobicTe');
  const anaerobicTe = average(recent, 'anaerobicTe');
  if (!previousLoad) {
    return { factor: 1, status: 'baseline', recentLoad, aerobicTe, anaerobicTe, message: `已建立近 3 趟平均負荷 ${Math.round(recentLoad)} 的個人基準；累積到前後兩組資料後才會判定是否降載。` };
  }
  const loadRatio = recentLoad / previousLoad;
  const highEffect = (aerobicTe || 0) >= 3.8 || (anaerobicTe || 0) >= 2.5;
  if (loadRatio >= 1.2 && highEffect) {
    const factor = loadRatio >= 1.4 || (aerobicTe || 0) >= 4.5 || (anaerobicTe || 0) >= 3.5 ? 0.8 : 0.9;
    return {
      factor,
      status: 'reduce',
      recentLoad,
      previousLoad,
      aerobicTe,
      anaerobicTe,
      message: `近 3 趟平均負荷 ${Math.round(recentLoad)} 較前 3 趟增加 ${Math.round((loadRatio - 1) * 100)}%，且訓練效果偏高；下週跑量下修 ${Math.round((1 - factor) * 100)}%。`
    };
  }
  return { factor: 1, status: 'steady', recentLoad, previousLoad, aerobicTe, anaerobicTe, message: `近 3 趟平均負荷 ${Math.round(recentLoad)}（前 3 趟 ${Math.round(previousLoad)}），未達降載條件；下週維持原課表。` };
}

function recordGarminAnalysisSnapshot(signature, reasons) {
  const history = Array.isArray(appData.garminAnalysisHistory) ? appData.garminAnalysisHistory : [];
  if (history.some((item) => item?.signature === signature)) return;
  history.push({ date: todayStr(), signature, summary: reasons.join('；') });
  appData.garminAnalysisHistory = history.slice(-20);
}

function autoRecalibratePlan() {
  if (!coachReviewData?.updatedAt || !appData.profile || !Array.isArray(appData.plan) || !appData.plan.length) return null;
  const cadencePolicy = COACH_SIGNAL_POLICY.cadence;
  const today = todayStr();
  const reviewWeek = appData.plan.find((week) => week.weekNum === currentWeek) || [...appData.plan]
    .filter((week) => (week.days || []).every((day) => !day.dateStr || day.dateStr < today))
    .sort((a, b) => b.weekNum - a.weekNum)[0];
  if (!reviewWeek) return null;
  const calibrationRuns = Array.isArray(coachReviewData.analyticsRuns) && coachReviewData.analyticsRuns.length ? coachReviewData.analyticsRuns : (coachReviewData.runs || []);
  const completedRuns = calibrationRuns.filter((run) => run.date <= today).slice(-14);
  const calibrationSignature = [
    `week:${reviewWeek.weekNum}:as-of:${today}:cadence-policy:${cadencePolicy.minPassingSpm}`,
    ...completedRuns.map((run) => [run.activityId || '', run.date || '', run.km || '', run.qualityPace || run.pace || '', run.qualityHr || run.hr || '', run.temperatureC || '', run.trainingLoad || '', run.aerobicTe || '', run.anaerobicTe || '', run.cadence || '', run.vo2max || ''].join(':'))
  ].join('|');
  if (appData.recalibratedFor === calibrationSignature) return null;
  const profile = appData.profile;
  const plan = appData.plan;
  const beforePlan = futurePlanSnapshot();
  const rule = GOAL_RULES[profile.goal] || GOAL_RULES.half;

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
  const loadDecision = garminLoadDecision(completedRuns);
  if (loadDecision.factor < 1) {
    volumeFactor = Math.min(volumeFactor, loadDecision.factor);
    reasons.push(loadDecision.message);
  }

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
  // 只採 Garmin 明確標記的主課段（qualityCadence），不以整筆活動平均步頻
  // 判讀，避免走路、熱身、收操或補給段把跑步步頻拉低。
  // 步頻是軟訊號，不像心率/配速那麼確定，所以只加提醒、不直接砍跑量。
  let cadenceCautionChanged = false;
  let cadenceEvidenceRuns = [];
  let cadenceAssessment = null;
  try {
    cadenceAssessment = coachCadenceAssessment();
    cadenceEvidenceRuns = cadenceAssessment.evidenceRuns;
    if (cadenceAssessment.sufficient) {
      const wasCaution = !!profile.cadenceCaution;
      const displayedCadence = cadenceAssessment.displayed;
      const isCaution = !cadenceAssessment.passed;
      profile.cadenceCaution = isCaution;
      if (isCaution !== wasCaution) {
        cadenceCautionChanged = true;
        reasons.push(isCaution
          ? `近 ${cadencePolicy.sampleRuns} 次有效跑步分圈平均步頻 ${displayedCadence} spm，未達 ${cadencePolicy.minPassingSpm} spm；長跑日保留步頻提醒`
          : `近 ${cadencePolicy.sampleRuns} 次有效跑步分圈平均步頻 ${displayedCadence} spm，已達 ${cadencePolicy.minPassingSpm} spm；取消步頻提醒`);
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
  const nextLongRun = plan.find((week) => week.weekNum === currentWeek + 1)?.days?.find((day) => day.type === 'long');
  if (profile.cadenceCaution && nextLongRun && cadenceAssessment?.displayed > 0) reasons.push(`近 ${cadencePolicy.sampleRuns} 次有效跑步分圈平均步頻 ${cadenceAssessment.displayed} spm 未達 ${cadencePolicy.minPassingSpm} spm，已套用到 ${nextLongRun.dateStr.slice(5).replace('-', '/')} 長跑的步頻提醒`);
  if (!reasons.length) reasons.push('本週 Garmin 實績已分析，未達需調整課表的門檻，未來週維持原安排');
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
  if (!profile.cadenceCaution) {
    plan.flatMap((week) => week.days || []).forEach((day) => {
      if (String(day.injuryNote || '').startsWith('近期步頻偏低')) delete day.injuryNote;
    });
  }
  if (coachLockedWeeks) reasons.push(`${coachLockedWeeks} 個教練明確處方週維持原樣；自動校準只套用在未鎖定的後續課表`);
  const summary = { date: today, volumePct: Math.round(volumeFactor * 100), tempoDelta, easyDelta, forcedDeload, maxHrDelta, cadenceCautionChanged, raceCalibrated, reasons };
  appData.lastRecalibration = summary;
  recordGarminAnalysisSnapshot(calibrationSignature, reasons);
  if (volumeFactor !== 1 || tempoDelta || easyDelta || forcedDeload || maxHrDelta || cadenceCautionChanged || raceCalibrated) recordPlanChange(beforePlan, 'garmin', 'Garmin 實跑自動校準');
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
  return `<section class="card fitness-projection-card"><div class="fitness-projection-kicker">FITNESS OUTLOOK</div><div class="fitness-projection-main"><div><h2>預估完賽</h2><p>${reviewEscape(goalLabel)}・依目前體能</p></div><strong>${secToTime(projection.predictedFinishSec)}<small>${secToPace(projection.predictedPace)}/km</small></strong></div>
    <p class="fitness-projection-copy">依目前配速基準推算；${projection.trendNote ? `${reviewEscape(projection.trendNote)}${projection.deltaNote ? `（${reviewEscape(projection.deltaNote)}）` : ''}` : '持續累積實跑，讓推估更穩定。'}</p>
    ${projection.potentialNote ? `<p class="fitness-projection-potential">${reviewEscape(projection.potentialNote)}</p>` : ''}
  </section>`;
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
