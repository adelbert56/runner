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
  const goalDist = goalDistanceKm(appData.profile);
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
    ...deriveQualityPaces(racePaceSec),
    easyPaceSec: Math.max(racePaceSec + 75, racePaceSec * 1.12),
    targetTime: secToTime(Math.round(racePaceSec * goalDist))
  };
}

function assessmentCalibrationGate(assessment) {
  const directive = typeof coachRaceDirective === 'function' ? coachRaceDirective(assessment?.date) : null;
  if (!directive?.requiresPriorDate) return { allowed: true };
  const prior = (appData.assessments || []).find((item) => item.date === directive.requiresPriorDate && item.type === 'race_10k');
  return prior
    ? { allowed: true }
    : { allowed: false, message: `「${directive.role || '這場賽事'}」需要先保留 ${directive.requiresPriorDate} 的 10K 成績與恢復紀錄，兩場證據齊全後才校正 2:15 配速。` };
}

function applyAssessmentToPlan(index = 0) {
  const assessment = (appData.assessments || [])[index];
  if (!assessment || !appData.profile) return;
  const calibrationGate = assessmentCalibrationGate(assessment);
  if (!calibrationGate.allowed) {
    showModal('暫不校正半馬配速', calibrationGate.message, [{ label: '保留成績', primary: true, action: closeModal }]);
    return;
  }
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
  // 檢測提示必須由正式課表中的檢測課觸發；不能只因第 4 週或階段切換，
  // 就在降載週暗示一堂實際不存在、也不該硬塞進去的品質課。
  const scheduledAssessment = (plan[currentWeek - 1]?.days || []).find((day) => day.type === 'assessment' || day.assessmentType);
  if (!scheduledAssessment) return '';
  return `本週已安排${trainingTaskTitle(scheduledAssessment)}檢測；完成後可用結果更新後續配速。`;
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

function findExtraSession(dateStr, sessionId) {
  const day = (appData.plan || []).flatMap((week) => week.days || []).find((item) => item.dateStr === dateStr);
  const session = day?.extraSessions?.find((item) => item.id === sessionId);
  return { day, session };
}

function markDone(dateStr, type, plannedKm, extraSessionId = '') {
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
          saveLogEntry({ date: dateStr, type, plannedKm, actualKm: km, actualTimeMins: mins, rpe, notes, prescribedPaceSec, sessionId: extraSessionId || undefined });
          recordTrainingEvent('completed', { date: dateStr, detail: `${extraSessionId ? '第二堂 · ' : ''}${km} km · RPE ${rpe || '—'}` });
          if (extraSessionId) {
            const { session } = findExtraSession(dateStr, extraSessionId);
            if (session) session.status = 'done';
            saveData(appData);
          } else {
            markDayStatus(dateStr, 'done');
          }
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

function openAddExtraSession(dateStr) {
  const { day } = findExtraSession(dateStr, '');
  if (!day || day.type === 'rest') return;
  if ((day.extraSessions || []).length >= 1) {
    showModal('已安排雙練', '<p style="margin:0;line-height:1.7">一天最多安排一堂額外課程。第二堂預設只開放恢復與補強，避免和正式主課堆疊成雙重高強度。</p>', [{ label: '知道了', primary: true, action: closeModal }]);
    return;
  }
  showModal('加入第二堂訓練', `<p class="field-help" style="margin-top:0">正式課表仍是今天唯一主課；第二堂只用於天候調整後的恢復跑、走跑或肌力補強。</p>
    <div class="form-group"><label class="form-label" for="m-extra-slot">時段</label><select class="form-input" id="m-extra-slot"><option value="morning">早上</option><option value="evening">晚上</option></select></div>
    <div class="form-group"><label class="form-label" for="m-extra-type">內容</label><select class="form-input" id="m-extra-type"><option value="recovery">恢復跑</option><option value="easy">輕鬆跑／走跑</option><option value="strength">肌力補強</option><option value="mobility">活動度／伸展</option></select></div>
    <div class="form-group"><label class="form-label" for="m-extra-km">距離（km，可留空）</label><input class="form-input" id="m-extra-km" type="number" min="0" step="0.1" value="3"></div>
    <div class="form-group"><label class="form-label" for="m-extra-duration">時間（分鐘）</label><input class="form-input" id="m-extra-duration" type="number" min="0" step="5" value="25"></div>
    <div class="form-group"><label class="form-label" for="m-extra-note">執行提示</label><input class="form-input" id="m-extra-note" type="text" value="舒適可對話；若不適則停止"></div>`, [
    { label: '加入第二堂', primary: true, action: () => {
      const type = document.getElementById('m-extra-type')?.value || 'recovery';
      const slot = document.getElementById('m-extra-slot')?.value || 'morning';
      const labels = { recovery: '恢復跑', easy: '輕鬆跑／走跑', strength: '肌力補強', mobility: '活動度／伸展' };
      day.extraSessions = [...(day.extraSessions || []), {
        id: `${dateStr}:extra:${Date.now()}`,
        slot, type, title: labels[type],
        km: Math.max(0, Number(document.getElementById('m-extra-km')?.value) || 0),
        duration: Math.max(0, Number(document.getElementById('m-extra-duration')?.value) || 0),
        target: document.getElementById('m-extra-note')?.value?.trim() || '',
        status: 'upcoming', createdAt: new Date().toISOString()
      }];
      recordTrainingEvent('extra_session_added', { date: dateStr, detail: `${slot === 'morning' ? '早上' : '晚上'} · ${labels[type]}` });
      saveData(appData); closeModal(); renderPlanView(); showView('plan');
    } },
    { label: '取消', action: closeModal }
  ]);
}

function markExtraSessionMissed(dateStr, sessionId) {
  const { session } = findExtraSession(dateStr, sessionId);
  if (!session) return;
  showModal('跳過第二堂？', '<p style="margin:0;line-height:1.7">這只會標示第二堂未完成，不會改動今天正式主課或安排補跑。</p>', [
    { label: '確認跳過', primary: true, action: () => { session.status = 'missed'; recordTrainingEvent('extra_session_skipped', { date: dateStr, detail: session.title || '第二堂' }); saveData(appData); closeModal(); renderPlanView(); } },
    { label: '取消', action: closeModal }
  ]);
}

function removeExtraSession(dateStr, sessionId) {
  const { day, session } = findExtraSession(dateStr, sessionId);
  if (!day || !session) return;
  showModal('移除第二堂？', '<p style="margin:0;line-height:1.7">這會移除額外安排與其畫面對應，但不會刪除 Garmin 原始紀錄或已寫入的訓練日誌。</p>', [
    { label: '移除', primary: true, action: () => { day.extraSessions = (day.extraSessions || []).filter((item) => item.id !== sessionId); saveData(appData); closeModal(); renderPlanView(); } },
    { label: '保留', action: closeModal }
  ]);
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
// 疲勞／疼痛的燈號分級只能有一套定義；trend 圖跟 history 列表各自複製一份
// 門檻的話，之後改標準只改到一邊，兩處顏色會悄悄對不起來。
function checkinTone(item) {
  if (item.painConcern || item.result === '停止品質課') return 'danger';
  if (item.fatigue >= 4 || item.result === '降載恢復') return 'caution';
  return 'good';
}

function renderCheckinTrend() {
  const recent = [...(appData.checkins || [])].sort((a, b) => a.weekNum - b.weekNum).slice(-8);
  if (!recent.length) return '<p style="margin:12px 0 0;color:var(--c-text-muted);font-size:12px;line-height:1.55">完成每週評估後，這裡會自動顯示你的恢復趨勢，還有我為你下週做過的保護。</p>';
  const averageFatigue = recent.filter((item) => item.fatigue).reduce((sum, item, _, items) => sum + item.fatigue / items.length, 0);
  return `<div class="checkin-trend" aria-label="近期恢復趨勢">${recent.map((item) => {
    const tone = checkinTone(item);
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
      const tone = checkinTone(item);
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

function adjustNextWeek(factor, removeQuality, qualityMode = 'keep', weekNum = currentWeek) {
  const nextWeekPlan = appData.plan[weekNum];
  if (!nextWeekPlan) return;
  const beforePlan = futurePlanSnapshot(weekNum + 1);
  nextWeekPlan.targetKm = Math.round(nextWeekPlan.targetKm * factor * 10) / 10;
  nextWeekPlan.days = nextWeekPlan.days.map(day => {
    if (removeQuality && ['tempo', 'interval'].includes(day.type)) {
      const recovery = buildDayCard(day.dow, day.dateStr, 'easy', Math.round((day.km || 0) * factor * 10) / 10, appData.profile, false, false, !(appData.profile?.injuries || []).includes('none'), todayStr(), day.weekNum || weekNum + 1, day.phaseName || nextWeekPlan.phase, 'recovery', '恢復跑');
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

function legacyEarlyCheckinDecision(checkin) {
  const text = `${checkin.adjustment || ''} ${checkin.safetyNote || ''}`;
  if (checkin.result === '停止品質課') return { factor: 0.7, removeQuality: true, qualityMode: 'keep' };
  const percent = text.match(/調整為\s*(\d{2,3})%/);
  const factor = percent ? Math.min(1.05, Math.max(0.7, Number(percent[1]) / 100)) : checkin.result === '降載恢復' ? 0.85 : checkin.result === '小幅推進' ? 1.05 : 1;
  const qualityMode = /品質課降階|原處方前\s*2\/3/.test(text) ? 'reduce' : 'keep';
  const removeQuality = checkin.result === '降載恢復' && qualityMode !== 'reduce';
  return { factor, removeQuality, qualityMode };
}

function restorePendingEarlyCoachAdjustment() {
  const checkin = (appData.checkins || []).find((item) => item.weekNum === currentWeek && item.earlyTrigger && !item.nextWeekAdjustmentApplied);
  if (!checkin || !appData.plan?.[currentWeek]) return false;
  // 已確認要套用正式教練處方時，舊版的「先調整、再排課」不可再重播。
  if (checkin.coachScheduleApplied === true) return false;
  const alreadyRecorded = (appData.planChangeHistory || []).some((item) => item.source === 'checkin' && item.date === checkin.date);
  if (alreadyRecorded) {
    checkin.nextWeekAdjustmentApplied = true;
    saveData(appData);
    return false;
  }
  const decision = checkin.earlyDecision || legacyEarlyCheckinDecision(checkin);
  if (decision.factor === 1 && !decision.removeQuality && decision.qualityMode !== 'reduce') return false;
  checkin.nextWeekAdjustmentApplied = true;
  checkin.restoredEarlyAdjustmentAt = todayStr();
  adjustNextWeek(decision.factor, decision.removeQuality, decision.qualityMode, checkin.weekNum);
  return true;
}

function coachScheduleContract() {
  const source = coachReviewData?.schedule || {};
  const trainingDows = Array.isArray(source.trainingDows) ? [...new Set(source.trainingDows.map(Number))].filter((dow) => dow >= 0 && dow <= 6).sort((left, right) => left - right) : [];
  const longDow = Number(source.longDow);
  if (trainingDows.length >= 2 && trainingDows.includes(longDow)) return { trainingDows, longDow };
  const profile = appData?.profile || {};
  const fallbackDows = (profile.dayState || []).map((state, dow) => state >= 1 ? dow : -1).filter((dow) => dow >= 0);
  return { trainingDows: fallbackDows, longDow: profile.dayState?.indexOf(2) };
}

function coachScheduleDayState({ trainingDows, longDow }) {
  return Array.from({ length: 7 }, (_, dow) => dow === longDow ? 2 : trainingDows.includes(dow) ? 1 : 0);
}

function coachPhaseIsDeload(phase) {
  // 「恢復穩定後保留品質課」是建量週的條件，不是降載指令；只接受明確的
  // 降載語意，避免把後續建量週誤寫成整週輕鬆跑。
  return phase?.phase === '降載' || /減量|無硬課|恢復週|重建週/.test(`${phase?.phase || ''} ${phase?.focus || ''}`);
}

// 原始的本機教練標記已被舊版通用重建覆蓋時，週報仍保有分期、可訓練日與
// 檢測結論。這裡只重建已結束的「長跑重建」歷史週，並在卡片明示重建來源；
// 不把它偽裝成已找回的原始逐字菜單，也絕不改動未來課表。
function restoreHistoricalCoachPlansFromReview() {
  const phases = Array.isArray(coachReviewData?.periodization) ? coachReviewData.periodization : [];
  const phase = phases.find((item) => item?.phase === '長跑重建' && item?.start && Number(item?.weeks) >= 1);
  const historyText = (coachReviewData?.history || []).map((item) => String(item?.summary || '')).join('\n');
  if (!phase || !/W1/.test(historyText) || !appData?.plan?.length) return false;
  const targets = (String(phase.km || '').match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const longTargets = (String(phase.focus || '').match(/長跑\s*(\d+(?:\.\d+)?)\s*→\s*(\d+(?:\.\d+)?)/) || []).slice(1).map(Number);
  if (targets.length < 2 || longTargets.length < 2) return false;
  const schedule = coachScheduleContract();
  if (schedule.trainingDows.length < 2 || !schedule.trainingDows.includes(schedule.longDow)) return false;
  const start = new Date(`${phase.start}T00:00:00`);
  const phaseWeeks = Math.min(Number(phase.weeks), 3);
  let changed = false;
  for (let index = 0; index < phaseWeeks; index += 1) {
    const date = new Date(start);
    date.setDate(date.getDate() + index * 7);
    const weekStart = localDateStr(date);
    const week = appData.plan.find((item) => (item.days || []).some((day) => day.dateStr === weekStart));
    if (!week || weekHasStoredCoachPlan(week) || (week.days || []).some((day) => day.type !== 'rest' && day.dateStr >= todayStr())) continue;
    // 歷史週本來有課程就是真實歷程，不可因載入新的週報而用概略週期資料重建。
    // 只有整週跑課欄位確實遺失時，才允許這條舊資料救援路徑補回。
    const hasExistingHistoricalCourse = (week.days || []).some((day) => day.type !== 'rest' && (day.task || day.km || (day.steps || []).length));
    if (hasExistingHistoricalCourse) continue;
    const targetKm = Math.round((targets[0] + ((targets[1] - targets[0]) * index) / phaseWeeks) * 10) / 10;
    const longKm = Math.round((longTargets[0] + ((longTargets[1] - longTargets[0]) * index) / phaseWeeks) * 10) / 10;
    const easyKm = Math.round(((targetKm - longKm) / Math.max(1, schedule.trainingDows.length - 1)) * 10) / 10;
    week.targetKm = targetKm;
    week.days = week.days.map((day) => {
      if (!schedule.trainingDows.includes(day.dow)) return day;
      const isLong = day.dow === schedule.longDow;
      const km = isLong ? longKm : easyKm;
      const focus = isLong ? 'long' : 'easy';
      const label = isLong ? '長跑' : '輕鬆跑';
      const course = buildDayCard(day.dow, day.dateStr, isLong ? 'long' : 'easy', km, appData.profile, false, false, false, todayStr(), week.weekNum, week.phase || 'build', focus, label);
      course.status = day.status;
      course.coachPlan = { source: 'coach-reconstruction', phase: phase.phase, targetKm, longKm, evidence: '週期表＋週檢測紀錄重建' };
      course.task = isLong
        ? `長跑 ${km} km｜歷史教練重建（E／Z2）`
        : `輕鬆跑 ${km} km${day.dow === schedule.trainingDows.filter((dow) => dow !== schedule.longDow).at(-1) ? '＋ST 快步 5×20 秒' : ''}｜歷史教練重建`;
      return course;
    });
    week.planningNote = `歷史教練重建：依「${phase.phase}」週期表與週檢測紀錄還原；非原始逐字菜單。`;
    changed = true;
  }
  if (changed) saveData(appData);
  return changed;
}

function coachPhaseHasRaceReplacingQuality(phase) {
  return /賽事取代品質|10K.*賽事|賽事.*10K/.test(String(phase?.focus || ''));
}

function applyCoachPhaseScheduleForWeek(weekNum, { record = true, constraints = {} } = {}) {
  const week = appData.plan?.[weekNum - 1];
  const phase = coachPhaseForWeek(week);
  const volume = (String(phase?.km || '').match(/\d+(?:\.\d+)?/g) || []).map(Number)[0];
  const longKm = Number((String(phase?.focus || '').match(/長跑\s*(\d+(?:\.\d+)?)/) || [])[1]);
  const schedule = coachScheduleContract();
  if (!phase || !Number.isFinite(volume) || !Number.isFinite(longKm) || !schedule.trainingDows.length || !schedule.trainingDows.includes(schedule.longDow) || volume <= longKm) return false;
  const phaseDeload = coachPhaseIsDeload(phase);
  // Garmin／週評估是處方的限制條件，而非另一份課表：正式處方只寫一次，
  // 但非降載週必須反映已確認的降量或品質降階。
  const requestedFactor = Number(constraints.factor);
  const volumeFactor = phaseDeload ? 1 : Math.min(1, Math.max(0.75, Number.isFinite(requestedFactor) ? requestedFactor : 1));
  const priorWeek = appData.plan?.[weekNum - 2];
  const priorTargetKm = Number(priorWeek?.targetKm) || 0;
  const priorLongKm = Math.max(0, ...(priorWeek?.days || []).filter((day) => day.type === 'long').map((day) => Number(day.km) || 0));
  const holdProgression = Boolean(constraints.holdProgression);
  // 「條件通過／不通過」是正式的升級煞車：即使下一個日曆 phase 寫了更高
  // 的里程，也不得讓總量或長跑自動越過上一週已排定的量。
  const effectiveVolume = Math.round(Math.min(volume * volumeFactor, holdProgression && priorTargetKm > 0 ? priorTargetKm : Infinity) * 10) / 10;
  const effectiveLongKm = Math.round(Math.min(longKm * volumeFactor, holdProgression && priorLongKm > 0 ? priorLongKm : Infinity) * 10) / 10;
  const deloadEachKm = Math.round(((effectiveVolume - effectiveLongKm) / Math.max(1, schedule.trainingDows.length - 1)) * 10) / 10;
  // 賽事週的 10K 本身就是當週品質刺激；不能再由一般課表塞一堂 T/I。
  const raceReplacesQuality = coachPhaseHasRaceReplacingQuality(phase);
  const removeQuality = Boolean(constraints.removeQuality || raceReplacesQuality);
  const qualityMode = constraints.qualityMode === 'reduce' ? 'reduce' : 'keep';
  const suppressIntervals = Boolean(constraints.suppressIntervals || holdProgression);
  const weekStart = new Date(`${week.days?.[0]?.dateStr || todayStr()}T00:00:00`);
  const scheduleDows = schedule.trainingDows.filter((dow) => dow !== schedule.longDow);
  const profile = appData.profile;
  const isEarlyBeginner = profile?.fitnessLevel === 'beginner' && weekNum <= 4;
  const sessionPattern = phaseDeload
    ? scheduleDows.map(() => ({ type: 'easy', focus: 'easy', label: '輕鬆跑' }))
    : buildWorkoutPattern(profile, schedule.trainingDows.length, weekNum, week.phase || 'build', removeQuality, false, isEarlyBeginner, weekStart, { allowQuality: !removeQuality });
  let sessionIndex = 0;
  const beforePlan = futurePlanSnapshot(weekNum);
  appData.profile.dayState = coachScheduleDayState(schedule);
  let mutatedAny = false;
  const nextDays = week.days.map((day) => {
    const actualDow = day.dateStr ? new Date(`${day.dateStr}T00:00:00`).getDay() : day.dow;
    if (!schedule.trainingDows.includes(actualDow) || !canMutatePlanDay(day, 'coach')) return { ...day, dow: actualDow };
    const isLong = actualDow === schedule.longDow;
    const scheduledSession = isLong ? { type: 'long', focus: 'long', label: '長跑' } : (sessionPattern[sessionIndex++] || { type: 'easy', focus: 'aerobic', label: '穩定有氧' });
    // 未通過升級閘門時，受控節奏跑仍可作為重新檢測，但不允許 I 課偷渡進來。
    const session = suppressIntervals && scheduledSession.type === 'interval'
      ? { type: 'tempo', focus: 'tempo', label: '受控節奏重測' }
      : scheduledSession;
    const courseKm = isLong ? effectiveLongKm : phaseDeload ? deloadEachKm : calcWorkoutKm(session.type, effectiveVolume, profile.goal, effectiveLongKm, session.focus);
    const course = buildDayCard(actualDow, day.dateStr, session.type, courseKm, profile, phaseDeload || removeQuality, false, false, todayStr(), day.weekNum || weekNum, week.phase || 'build', session.focus, session.label);
    if (qualityMode === 'reduce' && ['tempo', 'interval'].includes(course.type)) course.task = `${course.task}｜Garmin／週評估限制：主課只做原處方前 2/3，失控即改輕鬆跑。`;
    course.coachPlan = { source: 'coach-periodization', phase: phase.phase, targetKm: effectiveVolume, longKm: effectiveLongKm, volumeFactor, qualityMode, removeQuality, raceReplacesQuality, holdProgression, suppressIntervals };
    mutatedAny = true;
    return course;
  });
  // 每一天都被鎖擋（例如整週已過去）時，不能假裝處方已套用：targetKm／note／
  // 歷程都不該只改一半，寧可整次不動，讓呼叫端如實得知「這次沒有任何一天被改」。
  if (!mutatedAny) return false;
  week.days = nextDays;
  week.targetKm = effectiveVolume;
  const constraintNote = volumeFactor < 1 ? `；已依 Garmin／週評估下修 ${Math.round((1 - volumeFactor) * 100)}%` : raceReplacesQuality ? '；10K 賽事取代品質課，不另疊 T/I' : qualityMode === 'reduce' ? '；品質課已降階' : holdProgression ? '；品質檢測未完全放行，總量與長跑不增加且不排 I 課' : '';
  const adaptiveNote = phase.adaptiveNote ? `；${phase.adaptiveNote}` : '';
  week.planningNote = `已依第 ${weekNum - 1} 週完成紀錄，套用教練「${phase.phase}」第 ${weekNum} 週處方${constraintNote}${adaptiveNote}。`;
  if (record) {
    recordPlanChange(beforePlan, 'coach', `教練第 ${weekNum} 週處方已排入正式課表：${phase.phase}`);
    reconcileCoachPrescriptionHistory(weekNum, phase.phase);
    saveData(appData);
  }
  return true;
}

function alignCoachScheduleDays() {
  const schedule = coachScheduleContract();
  if (!schedule.trainingDows.length || !schedule.trainingDows.includes(schedule.longDow)) return false;
  const expectedState = coachScheduleDayState(schedule);
  let changed = JSON.stringify(appData.profile?.dayState || []) !== JSON.stringify(expectedState);
  (appData.plan || []).forEach((week) => {
    const courses = (week.days || []).filter((day) => day.coachPlan?.source === 'coach-periodization' && canMutatePlanDay(day, 'align'));
    const actualDows = courses.map((day) => new Date(`${day.dateStr}T00:00:00`).getDay()).sort((left, right) => left - right);
    const storedDows = courses.map((day) => day.dow).sort((left, right) => left - right);
    if (courses.length && (JSON.stringify(actualDows) !== JSON.stringify(schedule.trainingDows) || JSON.stringify(storedDows) !== JSON.stringify(schedule.trainingDows))) {
      applyCoachPhaseScheduleForWeek(week.weekNum, { record: false });
      changed = true;
    }
  });
  if (changed) {
    appData.profile.dayState = expectedState;
    saveData(appData);
  }
  return changed;
}

function alignCoachCourseNames() {
  let changed = false;
  (appData.plan || []).forEach((week) => (week.days || []).forEach((day) => {
    if (day.coachPlan?.source !== 'coach-periodization' || !day.dateStr || !canMutatePlanDay(day, 'align')) return;
    const nextTask = String(day.task || '').replace(/^教練輕鬆跑/, '輕鬆跑').replace(/^教練長跑/, '長跑');
    if (nextTask !== day.task) {
      day.task = nextTask;
      changed = true;
    }
  }));
  if (changed) saveData(appData);
  return changed;
}

// 修正先前把週期性降載誤寫成三堂恢復跑的既有正式課表。
// W4 沒有安全保護訊號時應保留 Z2 輕鬆跑；真正的安全覆寫不可被此修正蓋掉。
function alignCoachDeloadStructure() {
  const profile = appData?.profile || {};
  const cutoff = todayStr();
  let changed = false;
  (appData.plan || []).forEach((week) => {
    (week.days || []).forEach((day, index) => {
      if (day.type !== 'easy' || day.focus !== 'recovery' || !day.dateStr || !canMutatePlanDay(day, 'align', cutoff)) return;
      if (day.coachPlan?.source !== 'coach-periodization' || day.coachPlan?.phase !== '降載') return;
      const replacement = buildDayCard(day.dow, day.dateStr, 'easy', day.km, profile, true, false, false, cutoff, day.weekNum || week.weekNum, week.phase || day.phaseName || '降載', 'easy', '輕鬆跑');
      replacement.coachPlan = { ...day.coachPlan };
      replacement.status = day.status;
      week.days[index] = replacement;
      changed = true;
    });
  });
  if (changed) saveData(appData);
  return changed;
}

// 已寫入本機的舊版恢復課，不能繼續留下「Z2 配速 + Z1 上限」這種互相矛盾的指令。
// 僅校正今天以後、尚未完成的恢復跑，歷史訓練紀錄不回寫。
function alignRecoveryCourseTargets() {
  const profile = appData?.profile || {};
  const recovery = recoveryRunInstruction(profile);
  const zones = hrZones(profile);
  const cutoff = todayStr();
  let changed = false;
  (appData.plan || []).forEach((week) => {
    (week.days || []).forEach((day) => {
      if (day.type !== 'easy' || day.focus !== 'recovery' || !day.dateStr || !canMutatePlanDay(day, 'align', cutoff)) return;
      const nextDetail = `今天是恢復跑：${recovery.detail}`;
      const nextHeatNote = isHotSeasonDate(new Date(`${day.dateStr}T00:00:00`))
        ? `高溫期：恢復跑守 ${recovery.hrTarget}，不守配速；超過 ${zones.recoveryMax} 就放慢，仍降不下來就走到 HR ≤${Math.max(0, zones.recoveryMax - 5)} 再跑。`
        : day.heatNote;
      const nextSteps = (day.steps || []).map((step) => step.title === '主課' ? { ...step, detail: nextDetail } : step);
      if (day.pace !== recovery.pace || day.hrTarget !== recovery.hrTarget || day.heatNote !== nextHeatNote || JSON.stringify(day.steps) !== JSON.stringify(nextSteps)) {
        day.pace = recovery.pace;
        day.hrTarget = recovery.hrTarget;
        day.heatNote = nextHeatNote;
        day.steps = nextSteps;
        changed = true;
      }
    });
  });
  if (changed) saveData(appData);
  return changed;
}

// 一次提前週評估會先產生 Garmin／安全保護的中間結果，正式教練處方落地後，
// 歷程只能保留該週最後採用的處方，不能把已被覆寫的過程當成四次排課。
function reconcileCoachPrescriptionHistory(weekNum, phase) {
  const weekLabel = `第 ${weekNum} 週`;
  const title = `教練第 ${weekNum} 週處方已排入正式課表：${phase}`;
  const history = normalizePlanChangeHistory(appData.planChangeHistory);
  const affected = history.filter((item) => (item.changes || []).some((change) => String(change).includes(weekLabel)));
  if (!affected.length) return false;
  const canonical = affected.find((item) => item.source === 'coach' && item.title === title) || affected.at(-1);
  const normalizedCanonical = { ...canonical, source: 'coach', title };
  const nextHistory = history.filter((item) => !(item.changes || []).some((change) => String(change).includes(weekLabel)));
  nextHistory.push(normalizedCanonical);
  const changed = JSON.stringify(history) !== JSON.stringify(nextHistory);
  if (changed) appData.planChangeHistory = normalizePlanChangeHistory(nextHistory);
  return changed;
}

function restorePendingEarlyCoachSchedule() {
  // 出國或忙到整週沒開網站的話，currentWeek 已經往前跑了；只認當週的話那份
  // 已確認的提前排課就再也回不來。改為認「目標週還沒過去」的最後一次決策。
  const checkin = [...(appData.checkins || [])]
    .filter((item) => item.earlyTrigger && Number(item.weekNum) + 1 >= currentWeek)
    .sort((left, right) => left.weekNum - right.weekNum)
    .at(-1);
  const nextWeek = checkin ? appData.plan?.[Number(checkin.weekNum)] : null;
  const applied = (nextWeek?.days || []).filter((day) => day.type !== 'rest').every((day) => day.coachPlan?.source === 'coach-periodization');
  // 只復原已通過完成／恢復檢核的既有決策；不能因重新整理把未結案週的下一週寫出來。
  if (!checkin || checkin.coachScheduleApplied !== true) return false;
  if (applied) {
    const changed = reconcileCoachPrescriptionHistory(checkin.weekNum + 1, nextWeek.days.find((day) => day.coachPlan?.source === 'coach-periodization')?.coachPlan?.phase || '教練處方');
    if (changed) saveData(appData);
    return changed;
  }
  if (!applyCoachPhaseScheduleForWeek(checkin.weekNum + 1, { constraints: checkin.earlyDecision || {} })) return false;
  checkin.coachScheduleSource = 'coach-periodization';
  saveData(appData);
  return true;
}

function weeklyCheckinTiming() {
  const days = (appData.plan?.[currentWeek - 1]?.days || []).filter((day) => day.type !== 'rest' && !day.isMakeup);
  // 週評估必須和 Garmin 課後判讀、提前排課共用完成度；不能只因同步
  // 日誌已有一筆整趟跑量，就跳過品質主課的實際完成門檻。
  const summary = trainingCompletionSummary([appData.plan?.[currentWeek - 1]]);
  const completedDates = new Set(summary.completedDays.map((day) => day.dateStr));
  const completed = days.filter((day) => day.status === 'done' || completedDates.has(day.dateStr)).length;
  const lastCourseDate = days.map((day) => day.dateStr).filter(Boolean).sort().at(-1) || todayStr();
  // 週末到了不代表本週已結束；未完成的跑課不能自動觸發下一週處方。
  const calendarReady = todayStr() >= lastCourseDate;
  const completionReady = days.length > 0 && completed >= days.length;
  return { planned: days.length, completed, calendarReady, ready: calendarReady && completionReady };
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

function noteSignalsSafetyConcern(note) {
  const text = String(note || '').trim();
  if (!text || /(沒有|無|沒|不).*?(疼痛|痛|不適|跛|麻|腫|頭暈|胸悶)/.test(text)) return false;
  return /(疼痛|越跑越痛|刺痛|拉傷|跛行|步態.{0,4}(改|異常)|麻木|腫脹|頭暈|胸悶)/.test(text);
}

function coachTerrainEvidence(weekNum) {
  const week = appData.plan?.[Number(weekNum) - 1];
  const longDay = (week?.days || []).find((day) => day.type === 'long');
  const weekDates = new Set((week?.days || []).map((day) => day.dateStr).filter(Boolean));
  const runs = typeof coachRunRecords === 'function' ? coachRunRecords() : [];
  const exactCandidates = longDay?.dateStr ? runs.filter((run) => run.date === longDay.dateStr) : [];
  const weekCandidates = runs.filter((run) => weekDates.has(run.date));
  const candidates = (exactCandidates.length ? exactCandidates : weekCandidates)
    .sort((left, right) => longDay
      ? Math.abs((Number(left.km) || 0) - (Number(longDay.km) || 0)) - Math.abs((Number(right.km) || 0) - (Number(longDay.km) || 0))
      : (Number(right.elevationGainM) || 0) - (Number(left.elevationGainM) || 0));
  const run = candidates[0];
  if (!run || !Number.isFinite(Number(run.elevationGainM))) return null;
  const elevationGainM = Math.round(Number(run.elevationGainM));
  const km = Number(run.km) || 0;
  return { date: run.date, elevationGainM, elevationPerKm: km > 0 ? Math.round((elevationGainM / km) * 10) / 10 : null };
}

function classifyEarlyFeedback(note, terrainEvidence = null) {
  const text = String(note || '').trim();
  if (!text) return [];
  const labels = [];
  if (noteSignalsSafetyConcern(text)) labels.push('症狀／疼痛');
  else if (/(緊繃|偏緊|僵硬|卡卡|痠)/.test(text)) labels.push('局部緊繃（未明示疼痛）');
  // Garmin 的爬升是實跑負荷，不必等待跑者剛好用「上坡」描述才納入判讀。
  // 保留門檻以避免普通路線微起伏被誤當成坡訓。
  const meaningfulTerrainLoad = terrainEvidence
    && Number(terrainEvidence.elevationGainM) >= 80
    && Number(terrainEvidence.elevationPerKm) >= 6;
  if (/(上坡|爬升|丘陵|坡跑)/.test(text) || meaningfulTerrainLoad) {
    labels.push(terrainEvidence
      ? `坡度／爬升負荷（Garmin +${terrainEvidence.elevationGainM} m，${terrainEvidence.elevationPerKm} m/km）`
      : '回饋提到上坡（Garmin 未提供爬升資料）');
  }
  if (/(後面.*沒力|後段.*沒力|後段掉速|撐不住|爆掉)/.test(text)) labels.push('長跑後段失力');
  if (/(有氧耐力|心肺耐力|心肺不足)/.test(text)) labels.push('有氧耐力疑慮');
  if (/(疲勞|疲憊|累|腿重|沉重|恢復慢|沒力|無力)/.test(text)) labels.push('疲勞或恢復感受');
  if (/(睡不|失眠|睡眠|沒睡好)/.test(text)) labels.push('睡眠恢復');
  if (/(高溫|炎熱|悶熱|很熱)/.test(text)) labels.push('高溫條件');
  if (/(出差|加班|行程|無法|沒時間|週末)/.test(text)) labels.push('時間安排');
  return [...new Set(labels)];
}

function nextWeekCourseSummary(targetWeek) {
  const week = appData.plan?.[Number(targetWeek) - 1];
  if (!week) return '下週先依正式課表執行。';
  const runs = (week.days || []).filter((day) => day.type !== 'rest');
  const longRun = runs.find((day) => day.type === 'long');
  const easyRuns = runs.filter((day) => day.type !== 'long');
  const easyText = easyRuns.length ? `${easyRuns.length} 堂輕鬆跑` : '恢復安排';
  const longText = longRun ? `長跑 ${longRun.km} km（${longRun.hrTarget || '以心率控制'}）` : '不安排長跑';
  return `第 ${week.weekNum} 週維持 ${week.targetKm} km：${easyText}＋${longText}。`;
}

// 同一個心率上限下的配速中位數才能拿來比「有沒有變強」：配速變快但心率同步升高
// 不算進步，所以只取 Z2 上限以內的跑步，並沿用既有的高溫配速修正。
function sameEffortEasyPaceShift(thisWeekRuns, priorWeekRuns) {
  if (typeof hrZones !== 'function' || !appData.profile) return '';
  const easyMax = Number(hrZones(appData.profile)?.easyMax) || 0;
  if (!easyMax) return '';
  const medianPace = (runs) => {
    const paces = runs
      .filter((run) => Number(run.hr) > 0 && Number(run.hr) <= easyMax && Number(run.paceSeconds) > 0)
      .map((run) => (typeof heatAdjustedPaceSec === 'function' ? heatAdjustedPaceSec(run) : Number(run.paceSeconds)))
      .sort((left, right) => left - right);
    return paces.length ? paces[Math.floor(paces.length / 2)] : 0;
  };
  const current = medianPace(thisWeekRuns);
  if (!current) return '';
  const prior = medianPace(priorWeekRuns);
  if (!prior) return `同心率（HR ≤ ${easyMax}）輕鬆跑中位配速 ${secToPace(current)}/km`;
  const delta = Math.round(prior - current);
  const trend = Math.abs(delta) < 3 ? '持平' : delta > 0 ? `快 ${delta} 秒` : `慢 ${-delta} 秒`;
  return `同心率（HR ≤ ${easyMax}）輕鬆跑中位配速 ${secToPace(prior)} → ${secToPace(current)}/km（${trend}）`;
}

function runFeedbackFor(dateStr) {
  return appData.runFeedback?.[dateStr] || null;
}

function openRunFeedback(dateStr) {
  const existing = runFeedbackFor(dateStr) || { rpe: 0, note: '' };
  const options = [
    [3, '3｜輕鬆，可以一路對話'],
    [4, '4｜舒適，稍微有感'],
    [5, '5｜穩定'],
    [6, '6｜穩定但需要專心'],
    [7, '7｜吃力，話講不完整'],
    [8, '8｜很吃力'],
    [9, '9｜接近全力']
  ].map(([value, label]) => `<option value="${value}" ${existing.rpe === value ? 'selected' : ''}>${label}</option>`).join('');
  showModal('今天跑起來的感覺', `<p style="margin:0 0 12px;line-height:1.65">Garmin 記得你跑了多快、心率多少，但記不得你跑起來累不累。這一欄會影響下一次要不要加量。</p>
    <div class="form-group"><label class="form-label" for="feel-rpe">主觀吃力度 RPE</label><select class="form-input" id="feel-rpe"><option value="">請選擇</option>${options}</select><div class="field-help">輕鬆跑正常落在 3–5；連續幾次到 7 以上代表恢復沒跟上。</div></div>
    <div class="form-group"><label class="form-label" for="feel-note">一句話補充（選填）</label><input class="form-input" id="feel-note" type="text" maxlength="240" value="${reviewEscape(existing.note)}" placeholder="例：前段很順，最後 2 km 腿開始重"></div>`, [
    {
      label: '儲存',
      primary: true,
      action: () => {
        const saved = saveRunFeedback(dateStr, { rpe: document.getElementById('feel-rpe')?.value, note: document.getElementById('feel-note')?.value });
        closeModal();
        if (saved) renderPlanView();
      }
    },
    { label: '取消', action: closeModal }
  ]);
}

function saveRunFeedback(dateStr, { rpe, note }) {
  const parsedRpe = Math.round(Number(rpe));
  const entry = {
    rpe: Number.isFinite(parsedRpe) && parsedRpe >= 1 && parsedRpe <= 10 ? parsedRpe : 0,
    note: String(note || '').trim().slice(0, 240),
    savedAt: todayStr()
  };
  if (!entry.rpe && !entry.note) return false;
  appData.runFeedback = { ...(appData.runFeedback || {}), [dateStr]: entry };
  saveData(appData);
  return true;
}

// 睡眠、HRV、body battery 是「這個人現在恢復得如何」的客觀那一半。原本恢復判斷
// 全靠跑者每週勾三題自評，客觀資料只有訓練負荷（＝你做了多少），沒有承受度。
// 只跟自己的近期基準比，不用跨使用者的絕對門檻。
function recoverySignalStatus(days = 7) {
  const rows = Array.isArray(coachReviewData?.recovery) ? coachReviewData.recovery : [];
  if (!rows.length) return null;
  const today = todayStr();
  const from = addDaysToDateStr(today, -days);
  const recent = rows.filter((row) => row.date > from && row.date <= today);
  if (!recent.length) return null;
  const average = (field) => {
    const values = recent.map((row) => Number(row[field])).filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
  };
  const sleepHours = average('sleepHours');
  const bodyBatteryHigh = average('bodyBatteryHigh');
  const restingHr = average('restingHr');
  const hrvOvernight = average('hrvOvernight');
  const hrvWeekly = recent.map((row) => Number(row.hrvWeekly)).filter((value) => Number.isFinite(value) && value > 0).at(-1) || null;
  const latestStatus = recent.map((row) => row.hrvStatus).filter(Boolean).at(-1) || null;
  const concerns = [];
  // HRV 低於自己的週基準 10% 以上才算訊號，避免單晚波動就喊疲勞。
  if (hrvOvernight && hrvWeekly && hrvOvernight < hrvWeekly * 0.9) concerns.push(`HRV ${hrvOvernight} 低於自己的週基準 ${hrvWeekly}`);
  if (latestStatus && /unbalanced|low|poor/i.test(latestStatus)) concerns.push(`Garmin HRV 狀態為 ${latestStatus}`);
  if (sleepHours && sleepHours < 6.5) concerns.push(`近 ${days} 天平均睡眠 ${sleepHours} 小時`);
  if (bodyBatteryHigh && bodyBatteryHigh < 60) concerns.push(`body battery 每日高點平均只到 ${bodyBatteryHigh}`);
  return { days, samples: recent.length, sleepHours, bodyBatteryHigh, restingHr, hrvOvernight, hrvWeekly, hrvStatus: latestStatus, concerns, strained: concerns.length >= 2 };
}

// 主觀吃力度只在「輕鬆跑」上才有明確的判讀意義：輕鬆跑跑成吃力，就是恢復
// 沒跟上或配速太快，客觀負荷資料不一定看得出來。品質課本來就該吃力，不納入。
function recentEasyRunStrain(days = 14) {
  const feedback = appData.runFeedback || {};
  const today = todayStr();
  const from = addDaysToDateStr(today, -days);
  const easyDates = new Set((appData.plan || [])
    .flatMap((week) => week.days || [])
    .filter((day) => ['easy', 'long'].includes(day.type) && day.dateStr >= from && day.dateStr <= today)
    .map((day) => day.dateStr));
  // Garmin 手錶跑完就會問一次課後自評（selfEvaluation），跟手動輸入是同一份
  // RPE 量表；沒有手動記錄時才退回手錶那筆，避免同一天重複計入兩次。
  const watchRpeByDate = new Map((typeof coachRunRecords === 'function' ? coachRunRecords() : [])
    .filter((run) => easyDates.has(run.date) && Number(run.selfEvaluation?.rpe) > 0)
    .map((run) => [run.date, Number(run.selfEvaluation.rpe)]));
  const scores = [
    ...Object.entries(feedback).filter(([date]) => easyDates.has(date)).map(([, item]) => Number(item.rpe) || 0),
    ...(appData.log || []).filter((entry) => easyDates.has(entry.date) && !feedback[entry.date]).map((entry) => Number(entry.rpe) || 0),
    ...[...watchRpeByDate.entries()].filter(([date]) => !feedback[date] && !(appData.log || []).some((entry) => entry.date === date && entry.rpe)).map(([, rpe]) => rpe)
  ].filter((rpe) => rpe > 0);
  if (scores.length < 3) return null;
  const avgRpe = Math.round((scores.reduce((sum, rpe) => sum + rpe, 0) / scores.length) * 10) / 10;
  return { days, samples: scores.length, avgRpe, overreaching: avgRpe >= 7 };
}

// 提前排課排完就定了，週中身體變差也沒有入口改。撤掉本週評估等於回到排課前，
// 下一步的重排會用同一條處方管線覆寫尚未完成的課，不動已完成與補跑。
function restartWeeklyPlanning() {
  appData.checkins = (appData.checkins || []).filter((item) => item.weekNum !== currentWeek);
  saveData(appData);
  closeModal();
  const eligibility = earlyCoachPlanningEligibility();
  openEarlyCoachPlanning(!eligibility.eligible);
}

// 唯讀預覽：套用處方、抄下結果、再把課表還原。record:false 不寫 localStorage，
// 所以跑者可以先看下一週長什麼樣，再決定要不要真的排進去。
function previewCoachPhaseSchedule(weekNum) {
  const index = Number(weekNum) - 1;
  const week = appData.plan?.[index];
  if (!week) return null;
  const weekSnapshot = cloneTrainingValue(week);
  const dayStateSnapshot = cloneTrainingValue(appData.profile?.dayState);
  const applied = applyCoachPhaseScheduleForWeek(weekNum, { record: false });
  const preview = applied ? cloneTrainingValue(appData.plan[index]) : null;
  appData.plan[index] = weekSnapshot;
  if (appData.profile && dayStateSnapshot) appData.profile.dayState = dayStateSnapshot;
  return preview;
}

function showCoachPlanPreview(weekNum = currentWeek + 1) {
  const preview = previewCoachPhaseSchedule(weekNum);
  if (!preview) {
    showModal('目前無法預覽', '<p style="margin:0;line-height:1.7">教練週期資料還沒到位，或這一輪沒有下一週可安排。</p>', [{ label: '返回', primary: true, action: closeModal }]);
    return;
  }
  const rows = (preview.days || []).filter((day) => day.type !== 'rest').map((day) => `<li class="checkin-safety" style="display:block">
    <b>${reviewEscape(day.dateStr)}｜${reviewEscape(trainingTaskTitle(day))}</b>
    <div class="coach-fineprint">${reviewEscape([day.pace, day.hrTarget].filter(Boolean).join(' · ') || '以心率控制')}</div></li>`).join('');
  showModal(`第 ${weekNum} 週預覽`, `<p style="margin:0 0 12px;line-height:1.65">這是<b>預覽，尚未寫入課表</b>；總量 ${preview.targetKm} km。要真的排定，回上一步完成恢復檢核。</p><ul style="list-style:none;margin:0;padding:0;display:grid;gap:8px">${rows}</ul>`, [
    { label: '回去排定', primary: true, action: () => openEarlyCoachPlanning() },
    { label: '關閉', action: closeModal }
  ]);
}

// 每次判定都留下當下的客觀條件，否則每一週都是獨立事件：教練永遠無法說
// 「上次你在一樣的狀況下，我這樣安排，後來結果是這樣」。這是把逐週判讀變成
// 可回顧因果鏈的最小結構——不另開資料表，直接掛在該週的評估紀錄上。
function buildEvidenceSnapshot(weekNum = currentWeek) {
  const week = appData.plan?.[Number(weekNum) - 1];
  const dates = (week?.days || []).map((day) => day.dateStr).filter(Boolean).sort();
  const runs = typeof coachRunRecords === 'function' ? coachRunRecords() : [];
  if (!dates.length) return null;
  const sumKm = (from, to) => Math.round(runs.filter((run) => run.date >= from && run.date <= to)
    .reduce((total, run) => total + (Number(run.km) || 0), 0) * 10) / 10;
  const strain = recentEasyRunStrain();
  const recovery = recoverySignalStatus();
  const snapshot = {
    weekStart: dates[0],
    weeklyKm: sumKm(dates[0], dates.at(-1)),
    priorWeeklyKm: sumKm(addDaysToDateStr(dates[0], -7), addDaysToDateStr(dates[0], -1)),
    avgRpe: strain?.avgRpe || null,
    sleepHours: recovery?.sleepHours || null,
    hrvOvernight: recovery?.hrvOvernight || null,
    hrvWeekly: recovery?.hrvWeekly || null,
    bodyBatteryHigh: recovery?.bodyBatteryHigh || null,
    recoveryStrained: Boolean(recovery?.strained),
    effortStrained: Boolean(strain?.overreaching)
  };
  return snapshot.weeklyKm > 0 || snapshot.avgRpe || snapshot.sleepHours ? snapshot : null;
}

// 相近條件＝跑量差 15% 以內，且恢復訊號的紅綠燈一致。條件不像就不要硬扯，
// 拿不相干的過去比較只會讓判讀失去可信度。
function recallSimilarWeeks(snapshot, limit = 1) {
  if (!snapshot?.weeklyKm) return [];
  const trend = Array.isArray(coachReviewData?.trend) ? coachReviewData.trend : [];
  const kmForWeekStart = (weekStart) => Number(trend.find((entry) => entry.week === weekStart)?.km) || null;
  return (appData.checkins || [])
    .filter((item) => item.weekNum !== currentWeek && item.evidenceSnapshot?.weeklyKm > 0)
    .filter((item) => {
      const past = item.evidenceSnapshot;
      const gap = Math.abs(past.weeklyKm - snapshot.weeklyKm) / snapshot.weeklyKm;
      return gap <= 0.15 && past.recoveryStrained === snapshot.recoveryStrained && past.effortStrained === snapshot.effortStrained;
    })
    .sort((left, right) => right.weekNum - left.weekNum)
    .slice(0, limit)
    .map((item) => {
      const past = item.evidenceSnapshot;
      const followingKm = kmForWeekStart(addDaysToDateStr(past.weekStart, 7));
      const outcome = followingKm
        ? `下一週實際完成 ${followingKm} km`
        : '下一週的實跑資料還沒回來';
      return `第 ${item.weekNum} 週在相近條件（跑量 ${past.weeklyKm} km${past.avgRpe ? `、RPE ${past.avgRpe}` : ''}${past.sleepHours ? `、睡眠 ${past.sleepHours} 小時` : ''}）判定為「${item.result}」，${outcome}`;
    });
}

// 真人教練是拿數字講話的：回應要引用跑者這一週實際跑了什麼、跟前一週差多少，
// 而不是只丟結論。資料不足就回空字串，絕不編造沒發生的數字。
function runnerEvidenceSummary(weekNum = currentWeek) {
  const runs = typeof coachRunRecords === 'function' ? coachRunRecords() : [];
  const week = appData.plan?.[Number(weekNum) - 1];
  const dates = (week?.days || []).map((day) => day.dateStr).filter(Boolean).sort();
  if (!runs.length || !dates.length) return '';
  const inRange = (from, to) => runs.filter((run) => run.date >= from && run.date <= to);
  const thisWeekRuns = inRange(dates[0], dates.at(-1));
  const priorWeekRuns = inRange(addDaysToDateStr(dates[0], -7), addDaysToDateStr(dates[0], -1));
  if (!thisWeekRuns.length) return '';
  const sumKm = (items) => Math.round(items.reduce((total, run) => total + (Number(run.km) || 0), 0) * 10) / 10;
  const thisKm = sumKm(thisWeekRuns);
  const parts = [`本週實跑 ${thisKm} km／${thisWeekRuns.length} 次`];
  if (priorWeekRuns.length) {
    const priorKm = sumKm(priorWeekRuns);
    const delta = Math.round((thisKm - priorKm) * 10) / 10;
    parts.push(`前一週 ${priorKm} km／${priorWeekRuns.length} 次（${delta >= 0 ? '+' : ''}${delta} km）`);
  }
  const paceShift = sameEffortEasyPaceShift(thisWeekRuns, priorWeekRuns);
  if (paceShift) parts.push(paceShift);
  const strain = recentEasyRunStrain();
  if (strain) parts.push(`近 ${strain.days} 天輕鬆跑主觀 RPE 平均 ${strain.avgRpe}／10（${strain.samples} 筆）`);
  const recovery = recoverySignalStatus();
  if (recovery) {
    const facts = [
      recovery.sleepHours ? `睡眠 ${recovery.sleepHours} 小時` : '',
      recovery.hrvOvernight ? `HRV ${recovery.hrvOvernight}${recovery.hrvWeekly ? `／週基準 ${recovery.hrvWeekly}` : ''}` : '',
      recovery.bodyBatteryHigh ? `body battery 高點 ${recovery.bodyBatteryHigh}` : '',
      recovery.restingHr ? `靜止心率 ${recovery.restingHr}` : ''
    ].filter(Boolean);
    if (facts.length) parts.push(`近 ${recovery.days} 天恢復訊號：${facts.join('、')}`);
  }
  return parts.join('；');
}

function coachResponseToEarlyFeedback(note, decision, safetyConcern, { coachScheduleApplied = false, targetWeek = null, terrainEvidence = null, evidenceWeek = currentWeek } = {}) {
  if (!String(note || '').trim()) return '';
  const signals = classifyEarlyFeedback(note, terrainEvidence);
  const evidence = runnerEvidenceSummary(evidenceWeek);
  const readbackBase = signals.length ? `我讀到你提到：${signals.join('、')}。` : '我已讀到你的備註；其中沒有可安全自動判定的疼痛、疲勞、睡眠、高溫或時間訊號。';
  const readback = evidence ? `${readbackBase} 對照你的實跑紀錄：${evidence}。` : readbackBase;
  const terrainLongRunIssue = signals.some((signal) => signal.startsWith('坡度／爬升負荷')) && (signals.includes('長跑後段失力') || signals.includes('有氧耐力疑慮'));
  if (safetyConcern) return `${readback} 這被視為安全訊號，因此實際處置是下週先降量並取消品質課；症狀持續、加劇或影響步態時請停止跑步並尋求醫療或物理治療協助。`;
  if (terrainLongRunIssue) return `${readback} 這趟長跑含上坡，後段失力不能直接當成平路有氧能力退步；本次不據此加硬課。${nextWeekCourseSummary(targetWeek)} 下次長跑選平坦路線，前半程以心率與可對話感控制，不追配速；完成這週降載後，再用平路長跑的後段心率與主觀疲勞評估是否需要增加有氧耐力課。`;
  if (decision.result === '停止品質課') return `${readback} 本次恢復檢核未通過，實際處置是下週取消品質課並維持安全保護，待症狀與疲勞完全消退後再評估。`;
  if (decision.result === '降載恢復') return `${readback} 加上恢復檢核與 Garmin 資料，本次實際處置是下週降量，不額外增加課表。`;
  if (coachScheduleApplied) return `${readback} 本次恢復條件通過，因此已套用第 ${targetWeek || '下'} 週正式教練處方；你的備註沒有觸發額外安全覆寫，所以不會另建一份不同課表。`;
  return `${readback} 本次沒有觸發安全或跑量覆寫，因此正式課表維持原處方；這不是忽略，而是沒有足夠依據另改課。`;
}

function coachPaceGuardSeconds(text) {
  const match = String(text || '').match(/最快不得快於\s*(\d{1,2}:\d{2})/);
  return match && typeof paceToSeconds === 'function' ? paceToSeconds(match[1]) : null;
}

function coachHrGuard(text) {
  const match = String(text || '').match(/HR\s*[≤<]\s*(\d{2,3})/i);
  return match ? Number(match[1]) : null;
}

// 將 Garmin 結構化主課、課後 RPE 與週檢核收斂成可稽核的升級證據。未結構化
// 的全程紀錄仍會計入跑量，但不能當成放行 I 課或拉長長跑的證明。
function weeklyCoachPromotionEvidence(weekNum, { painConcern = false } = {}) {
  const week = appData.plan?.[Number(weekNum) - 1];
  const qualityDays = (week?.days || []).filter((day) => ['tempo', 'interval'].includes(day.type));
  if (!qualityDays.length) return { qualityPlanned: false };
  const coachDays = typeof coachDaysForWeek === 'function' ? coachDaysForWeek(week) : [];
  const runs = typeof coachRunRecords === 'function' ? coachRunRecords() : [];
  const byDate = new Map(runs.map((run) => [run.date, run]));
  const details = qualityDays.map((day) => {
    const run = byDate.get(day.dateStr);
    const feedback = runFeedbackFor(day.dateStr);
    const prescribed = coachDays.find((item) => item?.scheduledDow === day.dow) || {};
    const planText = [day.task, prescribed.plan, ...(day.steps || []), ...(prescribed.steps || [])]
      .map((step) => typeof step === 'string' ? step : `${step?.title || ''} ${step?.detail || ''}`).join(' ');
    const guardPace = coachPaceGuardSeconds(planText);
    const guardHr = coachHrGuard(planText);
    const lapPaces = (run?.laps || []).filter((lap) => ['MAIN', 'INTERVAL'].includes(String(lap?.intensity || '').toUpperCase()))
      .map((lap) => paceToSeconds(lap.pace_per_km)).filter(Boolean);
    const fastest = lapPaces.length ? Math.min(...lapPaces) : paceToSeconds(run?.qualityPace || '');
    const peakHr = Math.max(Number(run?.qualityMaxHr) || 0, Number(run?.maxHr) || 0);
    const signals = typeof sessionQualitySignals === 'function' && run ? sessionQualitySignals(run) : null;
    return {
      completed: Boolean(run) || day.status === 'done',
      structured: Boolean(run?.qualityEligible),
      rpe: Number(feedback?.rpe) || Number(run?.selfEvaluation?.rpe) || 0,
      paceCapBreached: Boolean(guardPace && fastest && fastest < guardPace),
      hrCapBreached: Boolean(guardHr && peakHr && peakHr > guardHr),
      hrDrift: Number(signals?.hrDelta) || 0,
      note: String(feedback?.note || '')
    };
  });
  const notes = details.map((item) => item.note).join(' ');
  const nextDayPain = /(?:左腳|腳痛|疼痛|步態|頭暈|噁心)/.test(notes);
  return {
    qualityPlanned: true,
    qualityCompleted: details.every((item) => item.completed),
    structuredEvidence: details.every((item) => item.structured),
    painConcern: Boolean(painConcern),
    nextDayPain,
    rpe: Math.max(0, ...details.map((item) => item.rpe)),
    paceCapBreached: details.some((item) => item.paceCapBreached),
    hrCapBreached: details.some((item) => item.hrCapBreached),
    hrDrift: Math.max(0, ...details.map((item) => item.hrDrift))
  };
}

function applyCoachPromotionGate(decision, gate) {
  if (!gate || gate.status === 'not-applicable' || ['停止品質課', '降載恢復'].includes(decision.result)) return decision;
  decision.promotionGate = gate;
  if (gate.status === 'pass') return decision;
  decision.allowIntensity = false;
  decision.holdProgression = true;
  decision.suppressIntervals = true;
  decision.factor = Math.min(1, Number(decision.factor) || 1);
  if (gate.status === 'blocked') {
    decision.result = '不通過｜保護恢復';
    decision.removeQuality = true;
    decision.factor = Math.min(0.85, decision.factor);
    decision.note = `品質檢測不通過：${gate.reasons.join('、')}。下週降量、取消品質課；不得進 I 課或增加長跑。`;
  } else {
    decision.result = '條件通過｜不升級';
    decision.note = `品質檢測條件通過：${gate.reasons.join('、')}。下週維持或下修，禁止進 I 課與增加長跑；下一次以受控節奏課重新取得放行證據。`;
  }
  decision.alternative = '本來可依週次推進，但品質課的結果與隔天反應不足以支持更高刺激；先保留可恢復的訓練。';
  return decision;
}

function completeWeeklyCheckin({ answers, fatigue, note, painConcern, earlyTrigger = false, plannedSessionCount = 0, manualCompletionConfirmed = false }) {
  const existing = (appData.checkins || []).find((item) => item.weekNum === currentWeek);
  if (existing && !existing.provisional) {
    closeModal();
    showModal('下週已安排', `<p style="margin:0;line-height:1.7">第 ${currentWeek} 週已完成正式評估；為避免重複套用跑量調整，下週課表維持目前已安排的版本。</p><p style="margin:10px 0 0;line-height:1.7">如果排定之後身體狀況改變了，可以撤掉這次評估重新判讀；已完成的課與補跑不會被動到。</p>`, [
      { label: '查看下週課表', primary: true, action: () => { closeModal(); jumpToPhaseWeek(currentWeek + 1); switchPlanTab('week'); } },
      { label: '重新評估並重排下週', action: restartWeeklyPlanning },
      { label: '留在本週', action: closeModal }
    ]);
    return;
  }
  const earlyEligibility = earlyTrigger ? earlyCoachPlanningEligibility() : null;
  const earlyCompletionConfirmed = !earlyTrigger || earlyEligibility?.eligible || (manualCompletionConfirmed && plannedSessionCount > 0);
  if (earlyTrigger && !earlyCompletionConfirmed) {
    closeModal();
    showModal('本週尚未完成', '<p style="margin:0;line-height:1.7">尚未取得本週所有跑步課的完成紀錄，因此不會安排或寫入下一週課表。</p>', [{ label: '返回本週', primary: true, action: closeModal }]);
    return;
  }
  const feedbackSafetyConcern = earlyTrigger && noteSignalsSafetyConcern(note);
  const effectivePainConcern = painConcern || feedbackSafetyConcern;
  const score = answers.filter(Boolean).length;
  const timing = weeklyCheckinTiming();
  const decision = checkinSafetyDecision({ answers, fatigue, painConcern: effectivePainConcern });
  const promotionGate = coachPromotionGate(weeklyCoachPromotionEvidence(currentWeek, { painConcern: effectivePainConcern }));
  applyCoachPromotionGate(decision, promotionGate);
  if (!timing.ready && decision.allowIntensity && !earlyTrigger) {
    decision.result = '維持';
    decision.factor = 1;
    decision.allowIntensity = false;
    decision.note = `本週尚未結束（目前 ${timing.completed}/${timing.planned} 堂）；先保留恢復判讀，最後一堂完成後再評估是否推進。`;
  }
  // 提前排課與原本週末評估使用同一份 Garmin 判讀；觸發時間不能改變教練結論。
  const garminDecision = coachReviewData?.autopilot?.status === 'ready' ? coachReviewData.autopilot : null;
  if (garminDecision?.decision === 'deload' && !effectivePainConcern && fatigue < 5 && answers[1]) {
    const garminFactor = Math.min(1, Math.max(0.75, Number(garminDecision.volumeFactor) || 1));
    decision.factor = Math.min(decision.factor, garminFactor);
    decision.removeQuality = decision.removeQuality || garminDecision.qualityMode === 'skip';
    decision.qualityMode = garminDecision.qualityMode || 'keep';
    decision.result = '降載恢復';
    decision.note = `Garmin 已判定「${garminDecision.label || '自動降量'}」：下週跑量調整為 ${Math.round(garminFactor * 100)}%，${garminDecision.qualityMode === 'reduce' ? '品質課降階為原處方前 2/3。' : garminDecision.qualityMode === 'skip' ? '品質課改為恢復跑。' : '維持原品質課。'}`;
  }
  if (earlyTrigger && garminDecision?.decision !== 'deload' && decision.allowIntensity) decision.note = `${manualCompletionConfirmed ? '已手動確認' : '已自動核對'}本週 ${plannedSessionCount} 堂排定跑步課完成；已依恢復檢核提前安排下一週，休息與居家肌力不列入跑步完成門檻。`;
  if (earlyTrigger && garminDecision?.decision === 'deload' && !effectivePainConcern && fatigue < 5 && answers[1]) decision.note = `${manualCompletionConfirmed ? '已手動確認' : '已自動核對'}本週 ${plannedSessionCount} 堂排定跑步課完成；${decision.note}`;
  // 提前排課與原本週末評估都寫入同一份週期處方；只有疼痛、重度疲勞或未通過
  // 無痛檢核時才交給安全覆寫。疲勞／睡眠不足仍可由正式處方承接降量與取消品質課。
  const checkinCompletionConfirmed = earlyTrigger ? earlyCompletionConfirmed : timing.ready;
  const formalPrescriptionPending = checkinCompletionConfirmed && !effectivePainConcern && fatigue < 5 && answers[1];
  const adaptation = runCoachAdaptation('weekly-checkin', { ...decision, formalPrescriptionPending });
  const coachScheduleApplied = formalPrescriptionPending && applyCoachPhaseScheduleForWeek(currentWeek + 1, { constraints: decision });
  if (!decision.allowIntensity && (effectivePainConcern || fatigue >= 5 || !answers[1])) activateSafetyHold(decision, fatigue);
  const feedbackTerrainEvidence = coachTerrainEvidence(currentWeek);
  const feedbackSignals = classifyEarlyFeedback(note, feedbackTerrainEvidence);
  const coachFeedbackResponse = coachResponseToEarlyFeedback(note, decision, feedbackSafetyConcern, { coachScheduleApplied, targetWeek: currentWeek + 1, terrainEvidence: feedbackTerrainEvidence });
  const checkin = { weekNum: currentWeek, score, result: decision.result, adjustment: decision.note, rejectedOption: decision.alternative || '', evidenceSnapshot: buildEvidenceSnapshot(), safetyNote: decision.note, allowIntensity: decision.allowIntensity, painConcern: effectivePainConcern, promotionGate, feedbackSafetyConcern, feedbackTerrainEvidence, feedbackSignals, coachFeedbackResponse, date: todayStr(), fatigue, note, provisional: !timing.ready, earlyTrigger, manualCompletionConfirmed, earlyDecision: earlyTrigger ? { factor: decision.factor, removeQuality: decision.removeQuality, qualityMode: decision.qualityMode || 'keep', holdProgression: Boolean(decision.holdProgression), suppressIntervals: Boolean(decision.suppressIntervals) } : null, nextWeekAdjustmentApplied: Boolean(adaptation?.nextWeekAdjustment), coachScheduleApplied, coachScheduleSource: coachScheduleApplied ? 'coach-periodization' : '' };
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
  appData.profile.racePaceSec = Math.round(appData.profile.racePaceSec * 0.987);
  Object.assign(appData.profile, deriveQualityPaces(appData.profile.racePaceSec));
  rebuildWeeksFrom(currentWeek + 1, 4);
  saveData(appData);
}

function adjustTargetPace(deltaSecPerKm) {
  appData.profile.racePaceSec += deltaSecPerKm;
  Object.assign(appData.profile, deriveQualityPaces(appData.profile.racePaceSec));
  const dist = goalDistanceKm(appData.profile);
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
          if (downgradeGoal !== '5k10k') appData.profile.raceDistanceKm = null;
          else if (!appData.profile.raceDistanceKm) appData.profile.raceDistanceKm = 10;
          const timeSec = timeToSec(appData.profile.targetTime);
          const dist = goalDistanceKm(appData.profile);
          appData.profile.racePaceSec = timeSec / dist;
          Object.assign(appData.profile, deriveQualityPaces(appData.profile.racePaceSec));
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
    const archivedWeek = typeof archivedCoachWeek === 'function' ? archivedCoachWeek(appData, week.weekNum) : null;
    if (typeof weekHasStoredCoachPlan === 'function' && weekHasStoredCoachPlan(week)) continue;
    if (archivedWeek && typeof sameWeekTimeline === 'function' && sameWeekTimeline(archivedWeek, week)) {
      appData.plan[weekIdx] = archivedWeek;
      continue;
    }
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
