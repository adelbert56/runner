// trainer-render.js
// Plan-view rendering: cards, coach panels, periodization, week/day cards, companion, modal.
// Extracted from trainer.js (2026-07-19 refactor). Classic script; all
// top-level functions stay global. Loaded before trainer.js so init() can call them.

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
  <p class="autopilot-copy">${reviewEscape(autopilot.headline || 'Garmin 資料進來了；我會照你的實跑狀況給保守一點的建議。')} ${rollingDays.some((day) => day.isTaper) ? '賽前減量週維持原課表，不再額外推進。' : ''}</p>
  <div class="autopilot-metrics">
    <div class="autopilot-metric"><span>近 14 天</span><b>${Number(metrics.recentKm || 0).toFixed(1)} km · ${metrics.recentRuns || 0} 次</b></div>
    <div class="autopilot-metric"><span>主課配速 / 心率</span><b>${qualityMetric}</b></div>
    <div class="autopilot-metric"><span>最近負荷 / 長跑</span><b>${metrics.recentLoad ? `${Math.round(metrics.recentLoad)} 負荷` : '負荷資料不足'} · ${Number(metrics.recentLongKm || 0).toFixed(1)} km</b></div>
    <div class="autopilot-metric"><span>品質課 / 本次跑量</span><b>${autopilot.qualityMode === 'skip' ? '取消品質課' : autopilot.qualityMode === 'reduce' ? '品質課降階' : '保留品質課'} · ${factorText}</b></div>
  </div>
  ${todayCompleted ? `<div class="autopilot-footer">✓ <span>今日 ${today.slice(5).replace('-', '/')} Garmin 已認列完成：${Number(todayRun.actualKm || 0).toFixed(1)} km。以下從明天開始列出 7 天輔助菜單。</span></div>` : ''}
  ${readiness && menu.length ? `<ol class="autopilot-menu">${menu.map(({ day, adjustedKm, title, detail, intensity }) => `<li><span class="autopilot-day">${DOW_NAMES[day.dow] || ''}<small>${day.dateStr.slice(5).replace('-', '/')}</small></span><span class="autopilot-main">${reviewEscape(title)}<small>${reviewEscape(detail)}</small><small class="autopilot-intensity">${reviewEscape(intensity)}</small></span><span class="autopilot-km">${adjustedKm === null ? '恢復' : `${adjustedKm.toFixed(1)} km`}</span></li>`).join('')}</ol>` : `<div class="autopilot-footer">ℹ️ <span>再累積至少 3 次 Garmin 跑步後，我才敢給你可以照做的輔助菜單；在那之前，我不會假裝摸得清你的恢復能力。</span></div>`}
  <div class="autopilot-footer">🛟 <span>${reviewEscape(autopilot.guardrail || '身體不適時優先休息或下修；這張菜單不會覆寫正式課表。')} 正式課表保持原樣，這張可直接當作輔助參考。</span></div>
</section>`;
}

function renderGarminAutopilotTab(profile, plan) {
  const content = renderGarminAutopilotCard(profile, plan);
  const health = trainingDataHealth(plan);
  const trust = `<div class="automation-timeline"><div class="automation-timeline-title">同步可信度</div><div class="automation-timeline-list"><div class="automation-timeline-item"><time>${health.syncAge === null ? '—' : health.syncAge === 0 ? '今天' : `${health.syncAge} 天前`}</time><div><b>${health.syncAge !== null && health.syncAge <= 2 ? 'Garmin 資料仍在可信範圍' : '需要確認 Garmin 同步'}</b><br>${health.issues.length ? reviewEscape(health.issues.join('；')) : '完成認列、補跑與課程對應均依同一個距離門檻自動處理。'}</div></div></div></div>`;
  // 資料衛生提醒卡（renderTrainingStatusCard）已固定在「教練建議」tab，且「本週課表」
  // 總覽卡於有問題時會給同步狀態入口；此處不再重貼，避免同一組提醒橫跨三個 tab。
  return `${renderFitnessProjectionCard()}${renderGoalCycleCard()}${trust}${content || `<div class="card"><div class="card-title">⌚ Garmin 輔助菜單</div><p style="margin:0;color:var(--c-text-muted);line-height:1.7">解鎖 Garmin 訓練資料後，這裡會依最近 14 天的跑量、配速、心率與負荷，產生接下來 7 天的輔助菜單。</p></div>`}`;
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
    return { level: 'caution', label: '部分完成', summary: `主課完成 ${completionPct}%（${actualKm.toFixed(1)} / ${targetKm.toFixed(1)} km），我先保留原課表，缺口不會硬塞到明天。`, next: '先把身體養回來；想補跑的話，我只在安全的 3 天內幫你認列。' };
  }
  const milestoneNote = runMilestones(run).map((text) => `🎉 ${text}`).join('；');
  if (assignment?.mode === 'makeup') {
    return { level: 'good', label: '補跑已認列', summary: `我已經把這趟安全地補回你原本漏掉的那堂課，不會重複算跑量，也不會再排一次。${milestoneNote ? ` ${milestoneNote}。` : ''}`, next: '回到原本排程，下一堂照表執行。' };
  }
  const historyNote = historyComparisonNote(run, planned);
  const baseSummary = targetKm ? `主課完成 ${completionPct ?? '—'}%，已與當日課表自動對應。` : '已與當日課表自動對應；課表沒有可量化主課距離，因此只保留完成紀錄。';
  const summary = `${baseSummary}${historyNote ? `${historyNote}。` : ''}${milestoneNote ? ` ${milestoneNote}。` : ''}`;
  return { level: 'good', label: '正式課程已完成', summary, next: '單次不會加量；若本週同課型持續比課表快、心率也還在安全範圍，我會自動幫你重算下一週還沒跑的配速處方。' };
}

function trainingAutopilotDecision(plan = appData.plan || []) {
  const health = trainingDataHealth(plan);
  const latestCheckin = latestTrainingCheckin();
  if (latestCheckin?.result === '停止品質課' || latestCheckin?.result === '降載恢復') {
    return { tone: 'danger', title: latestCheckin.result, reason: latestCheckin.safetyNote || latestCheckin.adjustment, next: '下週已套用保護規則；只保留恢復跑或休息，不需要再手動刪課。' };
  }
  if (health.syncAge !== null && health.syncAge > 2) {
    return { tone: 'caution', title: '等待 Garmin 資料確認', reason: `最近一次 Garmin 資料已是 ${health.syncAge} 天前。資料太舊，我不會拿來亂改你的課表。`, next: '先完成正常同步；新資料回來後會自動更新完成度與跑後判讀。' };
  }
  if (health.missedWithoutReason) {
    return { tone: 'caution', title: '先釐清未完成課程', reason: `有 ${health.missedWithoutReason} 堂已過期課程沒有原因；我先按住所有加量建議，免得把補跑誤當成在加量。`, next: '只需補填一次原因，後續的補跑與下週建議會自動處理。' };
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
  return { tone: 'good', title: today ? '今天照表執行' : '今天安排恢復', reason: today ? `${trainingTypeLabel(today.type, today.focus)} 已排好了；等 Garmin 資料回來，我會自動幫你比對。` : '今天沒有正式跑課；我不會為了湊里程臨時塞課給你。', next: today ? '跑完先讀取 Garmin 實跑；未使用同步或資料未回來時，再用「手動補登」。' : '把睡眠、補水與恢復做好，下一個正式跑課會自動出現在這裡。' };
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
    nextPara = `下週目標跑量約 ${weekPlannedKm(nextWeek)} km${qualityDay ? `，安排一堂${trainingTypeLabel(qualityDay.type, qualityDay.focus)}` : ''}${longDay ? `，長跑約 ${longDay.km} km` : ''}。${specialNote}`;
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
      ${health.issues.length ? '<div class="training-status-actions" style="margin-top:12px;justify-content:flex-start"><button class="btn btn-secondary" onclick="switchPlanTab(\'autopilot\')">查看同步狀態</button></div>' : ''}
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
  if (!items.length) return '<div class="automation-timeline"><div class="automation-timeline-title">課表變更紀錄</div><p style="margin:7px 0 0;color:var(--c-text-muted);font-size:12px;line-height:1.55">還沒有任何自動調整。等 Garmin 校準、週評估保護或套用檢測之後，我會把前後的差異留在這裡給你看。</p></div>';
  return `<div class="automation-timeline"><div class="automation-timeline-title">課表變更紀錄</div><div class="automation-timeline-list">${items.map((item) => `<div class="automation-timeline-item"><time>${reviewEscape(item.date)}</time><div><b>${reviewEscape(item.title)}</b><br>${item.changes.map((change) => reviewEscape(change)).join('；')}</div></div>`).join('')}</div></div>`;
}

function showWeekPlanFromStatus() {
  switchPlanTab('week');
  document.getElementById('plan-tab-week')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function configureGarminCompletionRule() {
  const current = garminCompletionPercent();
  showModal('設定 Garmin 自動完成門檻', `<p style="margin:0 0 14px;line-height:1.65;color:var(--c-text-muted)">同步跑步達到課表距離的指定比例（且至少 1 km）時，我才會自動幫你標完成或認列補跑。手動完成不受這個門檻影響。</p><label class="form-label" for="garmin-completion-pct">課表距離完成比例</label><select id="garmin-completion-pct" class="form-input"><option value="50" ${current === 50 ? 'selected' : ''}>50%｜寬鬆，適合恢復期</option><option value="60" ${current === 60 ? 'selected' : ''}>60%｜建議預設</option><option value="70" ${current === 70 ? 'selected' : ''}>70%｜較嚴謹</option><option value="80" ${current === 80 ? 'selected' : ''}>80%｜接近完整課表</option></select>`, [
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

function currentTrainingGoalLabel() {
  const profile = appData.profile || {};
  const targetTime = profile.targetTime || '未設定';
  const targetPace = profile.racePaceSec ? `${secToPace(profile.racePaceSec)}/km` : '配速待設定';
  return `${profile.targetDate || '未設定目標日'} · ${targetTime}（${targetPace}）`;
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
  return (appData.plan || []).filter((week) => week.weekNum >= fromWeek).map((week) => ({ weekNum: week.weekNum, plannedKm: weekPlannedKm(week), quality: (week.days || []).filter((day) => ['tempo', 'interval'].includes(day.type)).length, deload: Boolean(week.isDeload) }));
}

function recordPlanChange(before, source, title) {
  const after = futurePlanSnapshot();
  const changes = after.map((week) => {
    const previous = before.find((item) => item.weekNum === week.weekNum);
    if (!previous) return '';
    const parts = [];
    if (previous.plannedKm !== week.plannedKm) parts.push(`${previous.plannedKm} → ${week.plannedKm} km`);
    if (previous.quality !== week.quality) parts.push(`品質課 ${previous.quality} → ${week.quality} 堂`);
    if (!previous.deload && week.deload) parts.push('改為恢復週');
    return parts.length ? `第 ${week.weekNum} 週：${parts.join('、')}` : '';
  }).filter(Boolean);
  if (!changes.length) return;
  appData.planChangeHistory = normalizePlanChangeHistory(appData.planChangeHistory);
  appData.planChangeHistory.push({ date: todayStr(), source, title, changes });
  appData.planChangeHistory = appData.planChangeHistory.slice(-30);
}

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
    ? '這趟我當額外跑看，不會影響你正式課表的完成度。'
    : assignment.mode === 'makeup'
      ? `${assignment.source === 'runner' ? '我已依你的修正' : '我已自動'}把它對應成 ${assignment.targetDate} 的補跑。`
      : `我已自動把它對應到 ${assignment.targetDate} 同一天的正式課程。`;
  const assignmentConfidence = assignment.confidence === 'medium' ? '低信心，建議確認一次。' : '判讀可信；不需要額外操作。';
  const assignmentAction = run.activityId ? `<button type="button" class="btn btn-secondary" onclick="openActivityAssignment('${run.activityId}')">這次對應不對？</button>` : '';
  return `<section class="session-report" aria-label="最新訓練報告">
    <div class="session-report-head"><div><div class="session-report-kicker">Training report · Garmin</div><h2 class="session-report-title">${reportTitle}</h2><div class="session-report-meta">${reviewEscape(run.date)} · 全程 ${run.km.toFixed(2)} km · ${formatSessionDuration(run.durationMin)}</div></div><span class="session-report-status${statusClass}">${status}</span></div>
    <div class="session-report-body"><div class="session-report-grid"><div class="session-report-verdict"><div class="session-report-label">這次該怎麼看</div><p class="session-report-summary">${summary}</p><p class="session-report-note">${completion}。${evidence}</p><div class="session-next-action"><b>${reviewEscape(postRun.label)}</b><span>${reviewEscape(postRun.summary)}<br><b>下一步：</b>${reviewEscape(nextAction)}</span></div></div><aside class="session-report-target"><div class="session-report-label">課程對應</div><div class="session-plan-row"><span>課程判讀</span><b>${reviewEscape(assignmentLabel)}</b></div><div class="session-plan-row"><span>可信度</span><b>${assignmentConfidence}</b></div><div class="training-status-actions" style="margin-top:10px;justify-content:flex-start">${assignmentAction}</div></aside></div><div class="session-report-grid" style="margin-top:12px"><aside class="session-report-target"><div class="session-report-label">正式課表對照</div><div class="session-plan-row"><span>原定課型</span><b>${reviewEscape(plannedType)}</b></div><div class="session-plan-row"><span>課表內容</span><b>${reviewEscape(goal)}</b></div><div class="session-plan-row"><span>目標提示</span><b>${reviewEscape(target)}</b></div></aside></div>
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

function liveCoachPlan() {
  const runs = coachRunRecords();
  const summary = trainingCompletionSummary(appData.plan || []);
  const trend = weeklyRunTrend(runs);
  const recommendation = weekVolumeRecommendation(trend, summary.adherence);
  const reviewedWeek = coachReviewData?.week || {};
  const reviewedPlanStart = coachReviewData?.nextWeek?.weekStart || '';
  // 人工週報描述的是 nextWeek 開始前的那週。只要該週已有 Garmin 實跑，
  // 就不能再用前一週的摘要冒充目前狀況，必須改讀本週的實跑紀錄。
  const hasNewerGarminRuns = Boolean(reviewedPlanStart) && runs.some((run) => run.date >= reviewedPlanStart);
  const hasReviewedWeek = Boolean(reviewedWeek.range || reviewedWeek.label) && !hasNewerGarminRuns;
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

function renderLiveCoachCard(week = {}, nextWeek = {}, hasCurrentCoachPlan = false) {
  const plan = liveCoachPlan();
  const mission = hasCurrentCoachPlan && nextWeek.coachNote ? nextWeek.coachNote : '先照正式課表完成，不額外加課。';
  const hasCoachWeeklyPlan = hasCurrentCoachPlan && Array.isArray(nextWeek.menu) && nextWeek.menu.length > 0;
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
  return `<div class="card" style="border-left:4px solid var(--c-primary)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><div class="card-title">🏁 十月實戰檢查</div><p style="margin:4px 0 10px;color:var(--c-text-muted);line-height:1.65">賽後我只會先幫你配對 Garmin；等你按「確認成績」，才會用結果去調整未來課表。三場會一起看，不會只憑單場就大幅改動。</p></div><button class="btn btn-secondary" style="font-size:12px;padding:6px 10px;white-space:nowrap" onclick="appData.profile.registrationPersonId=''; appData.profile.raceCheckpointDates=[]; saveData(appData); refreshCoachReviewPanels()">更換跑者</button></div>${rows}</div>`;
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
  return `${statusCard}${decisionCard}${checkpointPanel}${renderLatestTrainingReport(runs)}<div class="card"><div class="card-title">📈 長期訓練趨勢 <span style="font-size:0.65em;font-weight:normal;color:var(--c-text-muted)">Garmin 最近 ${runs.length} 筆</span></div>
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

// week.targetKm 是課表產生器分配每日課表前的參考目標，calcWorkoutKm/
// calcLongRunKm 依課型權重分天配額後，加總本來就會小於這個目標（權重
// 設計上就留了緩衝，不是要湊滿）。凡是要顯示「這週排了多少 km」的地方，
// 一律用這個函式加總實際排定課表，不要直接讀 week.targetKm——不然這裡
// 跟每日卡片、跟本週跑量進度條會各講各的數字。
function weekPlannedKm(week) {
  return Math.round((week?.days || []).reduce((sum, day) => sum + (day.type !== 'rest' && !day.isMakeup ? (Number(day.km) || 0) : 0), 0) * 10) / 10;
}

function effectiveWeekVolumeTarget(week) {
  const formalKm = weekPlannedKm(week) || Number(week?.targetKm) || 0;
  // nextWeek.menu 為空代表教練週報還沒有真人手動菜單，targetKm 只會是像
  // 「依正式課表安排」這種說明文字，不是數字；此時一律回退正式課表，
  // 避免把說明文字硬接上「km」顯示成亂碼，也避免誤標成「教練本週目標」。
  if (!coachWeekMatches(week) || !coachReviewData?.nextWeek?.menu?.length || !coachReviewData?.nextWeek?.targetKm) {
    return { numericKm: formalKm, display: formalKm ? `${formalKm} km` : '—', source: '正式課表' };
  }
  const raw = String(coachReviewData.nextWeek.targetKm);
  const values = (raw.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  const numericKm = values.length > 1 ? (values[0] + values[1]) / 2 : (values[0] || formalKm);
  return { numericKm, display: `${raw} km`, source: '教練本週目標' };
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
  const allRuns = garminActivityRecords();
  const currentWeekStart = appData.plan?.[currentWeek - 1]?.days?.[0]?.dateStr || weekStartLabel(todayStr());
  const recent = allRuns.filter((run) => run.date >= currentWeekStart && run.date <= todayStr()).slice(-4);
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
    <div class="coach-section-title">⌚ Garmin 進階觀測 · 本週已同步 ${recent.length} 趟</div>
    <div class="plan-metric-grid">${metrics.map(([label, value]) => `<div class="plan-metric"><span class="plan-metric-label">${reviewEscape(label)}</span><strong class="plan-metric-value">${reviewEscape(value)}</strong></div>`).join('')}</div>
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
      km: `${weekPlannedKm(group.startWeek)}–${weekPlannedKm(group.endWeek)} km / 週`,
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
    return `${renderTrainingStatusCard(appData.plan || [])}${renderHistoryCoachContext()}${renderEarlyCoachPlanningCard()}${renderLocalGarminPairingButton()}<div class="card"><div class="card-title">🏃 教練建議</div><p style="color:var(--c-text-muted);font-size:14px;margin:0">解鎖加密週報後，這裡會顯示 Garmin 分析、跑量趨勢與下週參考菜單。</p></div>`;
  }
  const week = coachReviewData.week || {};
  const nextWeek = coachReviewData.nextWeek || {};
  const activePlanWeek = appData.plan?.[currentWeek - 1] || null;
  const upcomingPlanWeek = appData.plan?.[currentWeek] || null;
  const hasCurrentCoachPlan = coachWeekMatches(activePlanWeek);
  const hasUpcomingCoachPlan = !hasCurrentCoachPlan && coachWeekMatches(upcomingPlanWeek);
  const coachMenu = hasCurrentCoachPlan || hasUpcomingCoachPlan ? coachMenuForCurrentSchedule(nextWeek.menu) : [];
  const upcomingWeekStart = appData.plan?.[currentWeek]?.days?.[0]?.dateStr || '';
  const reviewWeekStart = nextWeek.weekStart || '';
  const formalFallback = coachMenu.length ? null : formalCoachFallbackMenu(hasCurrentCoachPlan ? nextWeek.weekStart : upcomingWeekStart);
  const scheduledMenu = coachMenu.length ? coachMenu : formalFallback.menu;
  const menuSource = coachMenu.length ? 'Garmin 教練參考菜單' : '下週正式課表（依本週 Garmin 實跑判讀）';
  const menuLabel = coachMenu.length ? nextWeek.label : `第 ${formalFallback.week?.weekNum || currentWeek} 週正式課表`;
  const menuTargetKm = coachMenu.length ? nextWeek.targetKm : (formalFallback.week?.targetKm ?? '—');
  const garminUpdatedAt = coachReviewData.analyticsUpdatedAt || coachReviewData.syncedAt || coachReviewData.updatedAt;
  const reviewFreshness = garminUpdatedAt === coachReviewData.updatedAt
    ? `Garmin 資料截至 ${garminUpdatedAt}`
    : `Garmin 資料截至 ${garminUpdatedAt} · 人工週報 ${coachReviewData.updatedAt}`;
  const scheduleDays = scheduledMenu.map((item) => DOW_NAMES[item.scheduledDow] || item.day).join('、');
  const notes = [...(coachReviewData.history || []), ...(appData.garminAnalysisHistory || [])].slice(-12).reverse().map((item) => `<li>${reviewEscape(item.date)}：${reviewEscape(item.summary)}</li>`).join('');
  const reviewNotice = !hasCurrentCoachPlan && !hasUpcomingCoachPlan && Array.isArray(nextWeek.menu) && nextWeek.menu.length
    ? reviewWeekStart >= todayStr()
      ? `<details class="coach-history" style="margin-top:10px"><summary><b>${reviewWeekStart === upcomingWeekStart ? '查看下週教練週報（待套用）' : '查看未來教練週報（待對應）'}</b>（${reviewEscape(nextWeek.label || reviewWeekStart || '日期未標示')}）</summary><p class="coach-fineprint">這份週報尚未開始${reviewWeekStart === upcomingWeekStart ? '，會在下週課表顯示時套用；目前不會提早計入完成度。' : `，目前下週從 ${reviewEscape(upcomingWeekStart || '日期未標示')} 開始；待日期對應後才會套用。`}</p></details>`
      : `<details class="coach-history" style="margin-top:10px"><summary><b>查看歷史教練週報</b>（${reviewEscape(nextWeek.label || reviewWeekStart || '日期未標示')}）</summary><p class="coach-fineprint">這份週報與目前第 ${currentWeek} 週的日期不一致，僅保留作為參考，不會覆寫正式課表或計入提前排課完成度。</p></details>`
    : '';
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
        ${(() => { const explicitSteps = Array.isArray(item.steps) ? item.steps : []; const confidence = explicitSteps.length ? 'coach' : coachStructureConfidence(planText); const structure = coachWorkoutStructure(planText, { km: registrationDistanceKm(planText) || 5 }, explicitSteps); return confidence === 'note-only' ? '<div class="coach-fineprint" style="margin-top:8px">⌚ 此課程缺少可安全轉換的距離／時間處方，會保留為教練備註，不會自動寫入 Garmin 結構化課程。</div>' : `<details class="coach-jargon" style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;font-weight:800;color:var(--c-primary-hover)">⌚ 查看 Garmin 課程結構 <small style="color:var(--c-text-muted)">· ${confidence === 'coach' ? '教練原始步驟' : '由教練文字轉換'}</small></summary>${renderGarminWorkoutStructure({ km: registrationDistanceKm(planText) || 5, workoutStructure: structure })}</details>`; })()}
      </div>
    </div>`;
  }).join('');
  const courseSection = coachMenu.length
    ? `<div class="coach-menu-card">
        <div class="coach-menu-head"><div><div class="plan-overview-kicker">${hasUpcomingCoachPlan ? '下週教練調整後的課程' : '教練調整後的課程'}</div><b class="coach-menu-title">${reviewEscape(menuLabel)}</b></div><span class="coach-menu-km">${reviewEscape(menuTargetKm)} km</span></div>
        <p class="coach-fineprint" style="margin:4px 0 10px">這是 Garmin 教練週報提供的調整內容，已依目前訓練日重排：${reviewEscape(scheduleDays)}${hasUpcomingCoachPlan ? '。下週已可直接照這份執行。' : ''}</p>
        <div class="coach-menu-list">${menuRows || '<div class="coach-fineprint">目前沒有可顯示的跑步課程。</div>'}</div>
        ${(() => {
          const jargon = jargonNotesFor(scheduledMenu.map((item) => item.plan || ''));
          if (!jargon.length) return '';
          return `<details class="coach-jargon" style="margin-top:10px"><summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--c-text-muted)">📖 這週出現的訓練名詞是什麼意思？</summary><ul style="margin:8px 0 0;padding-left:18px;font-size:12.5px;color:var(--c-text-muted);line-height:1.6">${jargon.map((note) => `<li>${reviewEscape(note)}</li>`).join('')}</ul></details>`;
        })()}
        ${hasUpcomingCoachPlan ? `<button class="btn btn-secondary" style="margin-top:12px" onclick="jumpToPhaseWeek(${currentWeek + 1}); switchPlanTab('week')">查看下週正式課表</button>` : ''}
      </div>`
    : `<div class="coach-menu-card">
        <div class="coach-menu-head"><div><div class="plan-overview-kicker">${hasCurrentCoachPlan ? '正式課表維持原樣' : 'Garmin 實跑已納入判讀'}</div><b class="coach-menu-title">${hasCurrentCoachPlan ? '本週課程不重複列在這裡' : '下週安排已依正式課表準備'}</b></div><span class="coach-menu-km">${reviewEscape(menuTargetKm)} km</span></div>
        <p class="coach-fineprint" style="margin:6px 0 12px">${hasCurrentCoachPlan ? '完整每天課程請在「本週課表」查看；目前只顯示與本週日期相符的教練調整，避免歷史週報重複拉長頁面。' : '已讀取本週 Garmin 主課與完成度；完成恢復確認後，我會把安全調整套用到這份下週正式課表。'}</p>
        ${!hasCurrentCoachPlan && nextWeek.weekStart && nextWeek.weekStart !== upcomingWeekStart ? `<p class="coach-fineprint" style="margin:0 0 12px;color:var(--c-orange)">⚠️ 真人週報最後寫到 ${reviewEscape(nextWeek.weekStart)} 那週，還沒更新到下週（${reviewEscape(upcomingWeekStart)}）；下週先照正式課表執行，等真人週報補上再看那邊的調整。</p>` : ''}
        <button class="btn btn-secondary" onclick="${hasCurrentCoachPlan ? 'showWeekPlanFromStatus()' : `jumpToPhaseWeek(${currentWeek + 1}); switchPlanTab('week')`}">${hasCurrentCoachPlan ? '查看本週正式課表' : '查看下週正式課表'}</button>
        ${reviewNotice}
      </div>`;
  return `${renderTrainingStatusCard(appData.plan || [])}<div class="card coach-panel">
    <div class="coach-head">
      <div class="card-title" style="margin:0">🏃 教練建議</div>
      <span class="coach-pill">${reviewEscape(reviewFreshness)}</span>
      <span class="coach-pill">${reviewEscape(coachScheduleLabel())}</span>
      ${(() => {
        const status = coachRunStatus();
        if (!status) return '';
        const link = status.actionUrl ? ` <a class="coach-pill" href="${reviewEscape(status.actionUrl)}" target="_blank" rel="noopener">${reviewEscape(status.actionLabel)} ↗</a>` : '';
        return `<span class="coach-pill status-${status.level}">${reviewEscape(status.text)}</span>${link}`;
      })()}
      ${renderEarlyCoachPlanningAction()}
      ${renderLocalGarminPairingButton()}
      <button class="btn btn-secondary coach-lock-btn" onclick="lockCoachReview()">🔒 鎖定</button>
    </div>
    ${garminOnlyNotice}
    ${renderHistoryCoachContext()}
    ${renderLastRecalibrationCard()}
    ${renderPlanChangeTimeline()}
    ${renderLiveCoachCard(week, nextWeek, hasCurrentCoachPlan)}
    ${courseSection}
    ${renderCoachDataSignals()}
    <p class="coach-fineprint" style="margin-top:12px">Garmin 實績會保守更新未來課表；已完成課程與教練明確處方不會被覆寫。</p>
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
          ? '先解鎖教練建議，我才能幫你核對 Garmin 已同步的紀錄。'
          : '目前無法讀取 Garmin 已同步紀錄，請重新整理後再試。'
    };
  }
  const plannedSessions = (week.days || []).filter((day) => day.type !== 'rest' && !day.isMakeup);
  if (!plannedSessions.length) return { eligible: false, reason: '本週沒有可提前結案的跑步課。' };
  const completedDates = new Set([...(appData.log || []).map((entry) => entry.date), ...plannedSessions.filter((day) => day.status === 'done').map((day) => day.dateStr)]);
  const garminRunsByDate = new Map(garminActivityRecords().map((run) => [run.date, { actualKm: Number(run.km) || 0, source: 'garmin' }]));
  const allPlanDays = (appData.plan || []).flatMap((planWeek) => planWeek.days || []);
  const makeupCredits = makeupCompletionCredits(allPlanDays, garminRunsByDate, todayStr());
  const pending = plannedSessions.filter((day) => !completedDates.has(day.dateStr) && !makeupCredits.has(day.dateStr) && !activityCompletesDay(day, garminRunsByDate.get(day.dateStr)));
  if (pending.length) return { eligible: false, reason: `尚有 ${pending.length} 堂跑步課未完成。`, plannedSessions, pending };
  return { eligible: true, plannedSessions };
}

function renderEarlyCoachPlanningCard() {
  const eligibility = earlyCoachPlanningEligibility();
  const completed = eligibility.plannedSessions?.length || 0;
  return `<div class="coach-setting-card" style="margin:14px 0"><div class="coach-setting-value">手動提前排課</div><div class="coach-fineprint">${eligibility.eligible ? `本週 ${completed} 堂排定跑步課均已完成，可先做恢復檢核並提前安排下週。休息與居家肌力不列入完成門檻，也不會被硬塞或自動補跑。` : reviewEscape(eligibility.reason)}</div><div class="training-status-actions" style="margin-top:10px;justify-content:flex-start">${renderEarlyCoachPlanningAction(eligibility)}</div></div>`;
}

function renderEarlyCoachPlanningAction(eligibility = earlyCoachPlanningEligibility()) {
  if (eligibility.eligible) return '<button class="btn btn-secondary" type="button" onclick="openEarlyCoachPlanning()">📅 依本週完成紀錄安排下週</button>';
  if (Array.isArray(eligibility.pending) && eligibility.pending.length > 0) return '<button class="btn btn-secondary" type="button" onclick="openEarlyCoachPlanning(true)">📅 確認已完成並安排下週</button>';
  return '';
}

function openEarlyCoachPlanning(manualConfirmation = false) {
  const eligibility = earlyCoachPlanningEligibility();
  if (!eligibility.eligible && !manualConfirmation) return;
  const checks = CHECKIN_QUESTIONS.slice(1).map((question, index) => `<label class="checkin-safety"><input id="early-check-${index + 1}" type="checkbox" style="margin-top:3px">${reviewEscape(question)}</label>`).join('');
  const planned = eligibility.plannedSessions || [];
  const manualChecks = manualConfirmation ? `<div class="coach-setting-card" style="margin:0 0 12px"><b>手動完成確認</b><div class="coach-fineprint">Garmin 日期未能和目前課表對上。請逐堂確認已完成，我才會幫你提前排課。</div>${planned.map((day, index) => `<label class="checkin-safety"><input id="early-complete-${index}" type="checkbox" style="margin-top:3px">${reviewEscape(day.dateStr)}｜${reviewEscape(trainingTaskTitle(day))}</label>`).join('')}</div>` : `<div class="checkin-safety" style="background:var(--c-surface-alt)">✓ 已完成 ${planned.length} 堂排定跑步課</div>`;
  showModal('提前排定下週', `<p style="margin:0 0 12px;line-height:1.65">我只會照你的恢復狀態微調<b>下一週還沒跑的課程</b>；若有疲勞或疼痛，仍會降載並移除品質課。</p>${manualChecks}${checks}<div class="form-group" style="margin-top:14px"><label class="form-label" for="early-fatigue">目前整體疲勞 (1–5)</label><input class="form-input" id="early-fatigue" type="number" min="1" max="5" placeholder="3"><div class="field-help">4–5 會自動降載；有疼痛請不要勾選「身體無異常疲勞或疼痛」。</div></div><div class="form-group"><label class="form-label" for="early-note">提前排課備註（選填）</label><input class="form-input" id="early-note" type="text" maxlength="240" placeholder="例：本週跑步課已提前完成，週末只安排輕鬆恢復"></div>`, [
    { label: '依恢復狀態提前排定', primary: true, action: () => submitEarlyCoachPlanning(manualConfirmation) },
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
    { done: completedCheckin, text: '每週最後做一次週評估，我才能判斷下週要維持、降載，還是小幅往前推。' }
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
      ? '跑完先讀取 Garmin 實跑；未同步時才用「手動補登」。若不舒服，選「跳過」並留下原因，我會把這筆記著，帶進下週的判斷。'
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
  // 沒有真人手動菜單（menu 為空）就不算「教練課表」，只是自動回退文字；
  // 不然「本週採用教練課表」會顯示 targetKm 的說明文字（如「依正式課表安排」）當成 km 數字。
  const coachNextWeek = isCoachWeek && coachReviewData.nextWeek?.menu?.length ? coachReviewData.nextWeek : null;
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
        ${currentWeek !== todayWeekNum() ? `<div class="week-header-target"><span>${effectiveTarget.source === '教練本週目標' ? '教練本週目標' : '本週目標'}</span><strong>${effectiveTarget.display}</strong></div>` : ''}
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

// 今天實際落在第幾週（與 renderPlanView 的 currentWeek 初值同公式）。currentWeek 會被
// 週導覽改動，需要一個不受瀏覽影響的「今日週次」來判斷是否在看當前週。
function todayWeekNum() {
  const gen = appData.profile?.generatedAt;
  if (!gen) return currentWeek;
  const days = Math.floor((new Date() - new Date(gen)) / 86400000);
  return Math.min(Math.max(1, Math.floor(days / 7) + 1), (appData.plan || []).length || 1);
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
    showModal('無法讀取本機配對碼', `<p style="margin:0;line-height:1.7">請確認你是從本機 Runner 開啟此頁，且本機網站服務（<code>http://localhost:4173/site/</code>）仍在執行。</p><p style="color:var(--c-text-muted);font-size:12px">${reviewEscape(error instanceof Error ? error.message : '未知錯誤')}</p>`, [{ label: '關閉', primary: true, action: closeModal }]);
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

function renderLocalGarminPairingButton() {
  if (!isLocalRunnerPage()) return '';
  return `<button class="btn btn-secondary" type="button" onclick="showLocalGarminPairingCode()">⌚ 本機 Garmin 配對碼</button>`;
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
