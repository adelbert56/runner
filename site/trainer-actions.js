// trainer-actions.js
// Workout actions, weekly check-in, pace calibration, adaptation, log, backup, cycle, export.
// Extracted from trainer.js (2026-07-19 refactor). Classic script; all
// top-level functions stay global. Loaded before trainer.js so init() can call them.

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
    return '本週建議新增一筆檢測紀錄，像是 20 分鐘測驗、5K 或 10K，讓我幫你重算後面的配速。';
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
    `<div><p class="field-help" style="margin-top:0">只有在未使用 Garmin 同步，或 Garmin 實跑尚未回來時才需要填寫；已經有 Garmin 紀錄時，我會自動幫你認列，避免重複。</p>
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
  if (!recent.length) return '<p style="margin:12px 0 0;color:var(--c-text-muted);font-size:12px;line-height:1.55">完成每週評估後，這裡會自動顯示你的恢復趨勢，還有我為你下週做過的保護。</p>';
  const averageFatigue = recent.filter((item) => item.fatigue).reduce((sum, item, _, items) => sum + item.fatigue / items.length, 0);
  return `<div class="checkin-trend" aria-label="近期恢復趨勢">${recent.map((item) => {
    const tone = item.painConcern || item.result === '停止品質課' ? 'danger' : item.fatigue >= 4 || item.result === '降載恢復' ? 'caution' : 'good';
    const height = Math.max(14, Math.min(100, ((Number(item.fatigue) || 3) / 5) * 100));
    return `<div class="checkin-trend-item ${tone}" title="第 ${item.weekNum} 週｜疲勞 ${item.fatigue || '未填'}/5｜${reviewEscape(item.result || '維持')}"><div class="checkin-trend-bar"><i style="height:${height}%"></i></div><small>W${item.weekNum}</small></div>`;
  }).join('')}</div><p style="margin:8px 0 0;color:var(--c-text-muted);font-size:12px;line-height:1.55">近 ${recent.length} 週平均疲勞：${averageFatigue ? `${averageFatigue.toFixed(1)}/5` : '尚無主觀疲勞資料'}；柱越高代表疲勞越高，顏色代表我當週有沒有幫你降載保護。</p>`;
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
    <div class="checkin-body"><p class="checkin-intro">每週只做一次。我會先看你的疼痛、疲勞、睡眠和長跑恢復；安全條件沒到，我不會自動加量。${timing.ready ? ` 本週已進入收尾，可依結果安排下一週。` : ` 目前完成 ${timing.completed}/${timing.planned} 堂；可以先填，我會先護著你的恢復，但要等本週最後一堂課後才開放小幅推進。`}</p>${renderCheckinTrend()}
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

function adjustNextWeek(factor, removeQuality, qualityMode = 'keep') {
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
    if (qualityMode === 'reduce' && ['tempo', 'interval'].includes(day.type)) {
      day.task = `${day.task || '品質課'}｜Garmin 教練調整：主課只做原處方前 2/3，失控即改輕鬆跑。`;
      day.coachPlan = { source: 'garmin-autopilot', qualityMode: 'reduce' };
    }
    return day;
  });
  recordPlanChange(beforePlan, 'checkin', removeQuality ? '週評估自動保護：下週降載並移除品質課' : qualityMode === 'reduce' ? 'Garmin 教練建議：下週降量並降階品質課' : '週評估已更新下週訓練量');
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

function submitEarlyCoachPlanning(manualConfirmation = false) {
  const eligibility = earlyCoachPlanningEligibility();
  const planned = eligibility.plannedSessions || [];
  if (!eligibility.eligible && !manualConfirmation) return;
  if (manualConfirmation && (!planned.length || planned.some((_, index) => !document.getElementById(`early-complete-${index}`)?.checked))) {
    showModal('請確認已完成的跑步課', '<p style="margin:0;line-height:1.7">請逐堂勾選已完成的跑步課後，再進行提前排課。</p>', [{ label: '返回確認', primary: true, action: () => openEarlyCoachPlanning(true) }]);
    return;
  }
  const answers = [true, ...CHECKIN_QUESTIONS.slice(1).map((_, index) => Boolean(document.getElementById(`early-check-${index + 1}`)?.checked))];
  completeWeeklyCheckin({
    answers,
    fatigue: parseInt(document.getElementById('early-fatigue')?.value, 10) || 0,
    note: document.getElementById('early-note')?.value?.trim() || '',
    painConcern: !answers[1],
    earlyTrigger: true,
    plannedSessionCount: planned.length,
    manualCompletionConfirmed: manualConfirmation
  });
}

function completeWeeklyCheckin({ answers, fatigue, note, painConcern, earlyTrigger = false, plannedSessionCount = 0, manualCompletionConfirmed = false }) {
  const existing = (appData.checkins || []).find((item) => item.weekNum === currentWeek);
  if (existing && !existing.provisional) {
    closeModal();
    showModal('下週已安排', `<p style="margin:0;line-height:1.7">第 ${currentWeek} 週已完成正式評估；為避免重複套用跑量調整，下週課表維持目前已安排的版本。</p>`, [
      { label: '查看下週課表', primary: true, action: () => { closeModal(); jumpToPhaseWeek(currentWeek + 1); switchPlanTab('week'); } },
      { label: '留在本週', action: closeModal }
    ]);
    return;
  }
  const score = answers.filter(Boolean).length;
  const timing = weeklyCheckinTiming();
  const decision = checkinSafetyDecision({ answers, fatigue, painConcern });
  if (!timing.ready && decision.allowIntensity && !earlyTrigger) {
    decision.result = '維持';
    decision.factor = 1;
    decision.allowIntensity = false;
    decision.note = `本週尚未結束（目前 ${timing.completed}/${timing.planned} 堂）；先保留恢復判讀，最後一堂完成後再評估是否推進。`;
  }
  const garminDecision = earlyTrigger && coachReviewData?.autopilot?.status === 'ready' ? coachReviewData.autopilot : null;
  if (garminDecision?.decision === 'deload' && !painConcern && fatigue < 5 && answers[1]) {
    const garminFactor = Math.min(1, Math.max(0.75, Number(garminDecision.volumeFactor) || 1));
    decision.factor = Math.min(decision.factor, garminFactor);
    decision.removeQuality = decision.removeQuality || garminDecision.qualityMode === 'skip';
    decision.qualityMode = garminDecision.qualityMode || 'keep';
    decision.result = '降載恢復';
    decision.note = `Garmin 已判定「${garminDecision.label || '自動降量'}」：下週跑量調整為 ${Math.round(garminFactor * 100)}%，${garminDecision.qualityMode === 'reduce' ? '品質課降階為原處方前 2/3。' : garminDecision.qualityMode === 'skip' ? '品質課改為恢復跑。' : '維持原品質課。'}`;
  }
  if (earlyTrigger && garminDecision?.decision !== 'deload' && decision.allowIntensity) decision.note = `${manualCompletionConfirmed ? '已手動確認' : '已自動核對'}本週 ${plannedSessionCount} 堂排定跑步課完成；已依恢復檢核提前安排下一週，休息與居家肌力不列入跑步完成門檻。`;
  if (earlyTrigger && garminDecision?.decision === 'deload' && !painConcern && fatigue < 5 && answers[1]) decision.note = `${manualCompletionConfirmed ? '已手動確認' : '已自動核對'}本週 ${plannedSessionCount} 堂排定跑步課完成；${decision.note}`;
  if (decision.factor !== 1 || decision.removeQuality || decision.qualityMode === 'reduce') adjustNextWeek(decision.factor, decision.removeQuality, decision.qualityMode);
  if (!decision.allowIntensity && (painConcern || fatigue >= 5 || !answers[1])) activateSafetyHold(decision, fatigue);
  const checkin = { weekNum: currentWeek, score, result: decision.result, adjustment: decision.note, safetyNote: decision.note, allowIntensity: decision.allowIntensity, painConcern, date: todayStr(), fatigue, note, provisional: !timing.ready, earlyTrigger, manualCompletionConfirmed };
  appData.checkins = normalizeTrainingCheckins([...(appData.checkins || []).filter((item) => item.weekNum !== currentWeek), checkin]);
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
      `進度率 ${Math.round(data.progressRate * 100)}%，平均 RPE ${data.avgRpe.toFixed(1)}/10。<br><br>你跑得比計畫還好，要提升強度嗎？<br>你確認的話，我會把目標配速再收快 5 秒，並在允許的週期把主課往上帶。`,
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
      showModal('還原訓練資料', `<p style="margin:0 0 10px;line-height:1.65">備份檔：<b>${reviewEscape(file.name)}</b>（${reviewEscape(backupDate)}）</p><div class="coach-setting-card"><div class="coach-setting-value">匯入前預覽</div><div class="coach-fineprint">備份：${incoming.weeks} 週／${incoming.days} 天安排／${incoming.logs} 筆紀錄／${incoming.checkins} 次週評估／${incoming.cycles} 份週期歷史<br>目前：${current.weeks} 週／${current.days} 天安排／${current.logs} 筆紀錄／${current.checkins} 次週評估／${current.cycles} 份週期歷史</div></div><p style="margin:10px 0 0;color:var(--c-orange);font-size:13px;line-height:1.6">確認後會蓋掉目前資料；我會在你本機留一份「匯入前快照」，隨時能還原。</p>`, [
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
    : '<p style="margin:0;color:var(--c-text-muted);line-height:1.65">尚無封存週期。等你選「封存目前週期並重新開始」，我會先幫你建立第一份完整歷史。</p>';
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
