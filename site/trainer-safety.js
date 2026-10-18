// Safety boundary: persistent pain/fatigue protection and conservative course overrides.
// This remains a classic script so existing inline controls can keep calling these functions.

function activeSafetyHold() {
  return appData.safetyHold?.active ? appData.safetyHold : null;
}

function raceRecoveryDecision(raceDate, check, today) {
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const elapsed = validDate(raceDate) && validDate(today) ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${raceDate}T00:00:00Z`)) / 86400000 : -1;
  if (elapsed < 3) return { blocked: true, reason: `${raceDate} 賽後恢復只有日期資料，尚未通過保守48小時觀察窗口` };
  const savedAfterDays = validDate(check?.savedAt) ? (Date.parse(`${check.savedAt}T00:00:00Z`) - Date.parse(`${raceDate}T00:00:00Z`)) / 86400000 : -1;
  const fatigue = check?.fatigue === '' || check?.fatigue == null ? NaN : Number(check.fatigue);
  if (!check || savedAfterDays < 3 || check.savedAt > today || !Number.isInteger(fatigue) || fatigue < 1 || fatigue > 5
    || !['none', 'mild', 'pain'].includes(check.pain) || !['normal', 'changed'].includes(check.gait)) {
    return { blocked: true, reason: `${raceDate} 賽後恢復回報缺失、過早或欄位不完整` };
  }
  if (check.pain !== 'none' || check.gait !== 'normal' || fatigue >= 4) return { blocked: true, reason: `${raceDate} 賽後恢復訊號尚未通過` };
  return { blocked: false, reason: `${raceDate} 賽後恢復回報已通過（日期資料採三日保守窗口）` };
}

function recentRaceRecoveryGate(days = 14) {
  if (typeof appData === 'undefined') return null;
  const races = (appData.plan || []).flatMap((week) => week.days || [])
    .filter((day) => day.type === 'race' && day.dateStr <= todayStr() && day.dateStr >= addDaysToDateStr(todayStr(), -days))
    .sort((left, right) => String(right.dateStr).localeCompare(String(left.dateStr)));
  const race = races[0];
  if (!race) return null;
  const check = appData.raceRecoveryChecks?.[race.dateStr];
  return raceRecoveryDecision(race.dateStr, check, todayStr());
}

// 放行是資料決策，不替跑者補造新距離。未通過的課程保留預覽與原因，禁止匯出。
function courseReleaseDecision(day, ctx, week) {
  if (!day?.dateStr || day.dateStr < ctx.today || day.status === 'done' || day.type === 'rest') return null;
  const reasons = [];
  if (day.type === 'race' && (ctx.safetyHold?.active || day.safetyOverride || day.recoveryProtection)) reasons.push('傷痛或恢復保護尚未解除，賽事不能由既有核准自動放行');
  const planDays = (ctx.plan || []).flatMap(item => item.days || []);
  const runs = (ctx.garminRuns || []).filter(run => run.date && run.date <= ctx.today && Number(run.km) > 0);
  const races = planDays.filter(item => item.type === 'race' && item.dateStr !== day.dateStr);
  const review = typeof coachReviewForWeek === 'function' ? coachReviewForWeek(week) : null;
  const approval = review?.progressionApproval;
  const approvalFresh = approval?.reviewedOn && approval.reviewedOn <= ctx.today
    && approval.reviewedOn >= addDaysToDateStr(ctx.today, -7) && approval.reviewedOn >= addDaysToDateStr(day.dateStr, -7)
    && approval.recoveryConfirmed === true;
  const isHard = ['tempo', 'interval', 'long'].includes(day.type);
  if (isHard) {
    const raceInWeek = races.find(race => (week?.days || []).some(item => item.dateStr === race.dateStr));
    if (raceInWeek) reasons.push(`${raceInWeek.dateStr} 賽事已取代本週品質／長跑，不疊加硬課`);
    const recentRace = races.filter(race => race.dateStr <= ctx.today && race.dateStr >= addDaysToDateStr(ctx.today, -14)).sort((a, b) => b.dateStr.localeCompare(a.dateStr))[0];
    if (recentRace) {
      const recovery = raceRecoveryDecision(recentRace.dateStr, appData.raceRecoveryChecks?.[recentRace.dateStr], ctx.today);
      if (recovery.blocked) reasons.push(recovery.reason);
    }
  }
  if (day.type === 'long') {
    const km = Number(day.km) || 0;
    const recentRuns = runs.filter(run => run.date >= addDaysToDateStr(ctx.today, -14));
    const recentMax = Math.max(0, ...recentRuns.map(run => Number(run.km)));
    const menuTotal = (review?.menu || []).reduce((sum, entry) => sum + (Number(entry.totalKm) || 0), 0);
    const weekTotal = menuTotal || (typeof weekPlannedKm === 'function' ? weekPlannedKm(week) : 0);
    const approvedDistance = approvalFresh && Number(approval.longRunKm) >= km;
    const shareLimit = approvalFresh && Number(approval.maxLongRunShare) >= 0.4 && Number(approval.maxLongRunShare) <= 1 ? Number(approval.maxLongRunShare) : 0.4;
    if (!recentMax || (km > recentMax && !approvedDistance)) reasons.push(`長跑 ${km} km 尚缺近期耐力與教練推進確認（近14天全程最長 ${recentMax || '未知'} km）`);
    if (!weekTotal || km / weekTotal > shareLimit + 0.001) reasons.push('長跑占處方週量超過本計畫40%原則，缺少有效例外核准');
    const recovery = typeof recoverySignalStatus === 'function' ? recoverySignalStatus() : null;
    if (!recovery?.sufficient) reasons.push('近期恢復資料不足或過期，暫不放行長跑推進');
    else if (recovery.strained) reasons.push('近期恢復訊號偏離基準，暫不放行長跑');
  }
  if (day.type === 'race') {
    const km = Number(day.raceDistanceKm) || Number(day.km) || 0;
    const previousHalf = races.filter(race => race.dateStr < day.dateStr && race.dateStr >= addDaysToDateStr(day.dateStr, -7)
      && (Number(race.raceDistanceKm) || Number(race.km)) >= 15).sort((a, b) => b.dateStr.localeCompare(a.dateStr))[0];
    if (km >= 15 && previousHalf) {
      const recovery = raceRecoveryDecision(previousHalf.dateStr, appData.raceRecoveryChecks?.[previousHalf.dateStr], ctx.today);
      const approved = approvalFresh && approval.reviewedOn >= addDaysToDateStr(previousHalf.dateStr, 2)
        && Array.isArray(approval.approvedRaceDates) && approval.approvedRaceDates.includes(day.dateStr);
      if (recovery.blocked || !approved) reasons.push('前一場半馬級賽事後一週再參賽，需賽後恢復與教練個別確認；可縮短、走跑或不參賽');
    }
  }
  return reasons.length ? { status: 'pending', reasons } : null;
}

function renderSafetyHoldCard() {
  const hold = activeSafetyHold();
  if (!hold) return '';
  return `<section class="training-status-card is-attention" aria-label="傷痛保護模式">
    <div><div class="training-status-kicker">傷痛保護模式</div><div class="training-status-title">🛑 品質課與長跑暫停</div><div class="training-status-copy">${reviewEscape(hold.reason)} 在你確認症狀已消退前，系統只會顯示恢復安排；若疼痛持續、加劇或影響步態，請停止跑步並尋求醫療或物理治療協助。</div></div>
    <div class="training-status-actions"><button class="btn btn-secondary" onclick="confirmClearSafetyHold()">症狀已消退，解除保護</button></div>
  </section>`;
}

function activateSafetyHold(decision, fatigue) {
  appData.safetyHold = {
    active: true,
    startedOn: todayStr(),
    reason: decision.note,
    fatigue: Number(fatigue) || null
  };
  recordTrainingEvent('safety_hold_activated', { date: todayStr(), source: 'runner', detail: decision.note });
}

function confirmClearSafetyHold() {
  showModal('解除傷痛保護模式？', '<p style="margin:0;line-height:1.7">只在疼痛、步態異常與異常疲勞都已消退時解除。解除後不會把原本取消的品質課或長跑硬補回來，仍請從下一堂課保守恢復。</p>', [
    { label: '確認解除', primary: true, action: clearSafetyHold },
    { label: '維持保護', action: closeModal }
  ]);
}

function clearSafetyHold() {
  if (!activeSafetyHold()) return closeModal();
  appData.safetyHold = null;
  recordTrainingEvent('safety_hold_cleared', { date: todayStr(), source: 'runner', detail: '跑者確認症狀已消退，解除傷痛保護模式。' });
  saveData(appData);
  closeModal();
  renderPlanView();
}

// 真人教練會講「本來想怎麼排、為什麼沒那樣排」。只給結論的話，跑者無法判斷
// 這是有依據的取捨還是系統偷懶，所以每個判定都要帶上被否決的那個選項。
function checkinSafetyDecision({ answers, fatigue, painConcern }) {
  const noPain = Boolean(answers[1]);
  const sleptWell = Boolean(answers[2]);
  const recoveredFromLongRun = Boolean(answers[3]);
  const ramp = weeklyRampInfo(weeklyRunTrend(coachRunRecords()));
  const easyStrain = typeof recentEasyRunStrain === 'function' ? recentEasyRunStrain() : null;
  if (painConcern || !noPain || fatigue >= 5) {
    return { result: '停止品質課', factor: 0.7, removeQuality: true, allowIntensity: false, note: '有疼痛、異常疲勞或步態問題；下週先降量並取消節奏跑與間歇。若症狀持續或加劇，請就醫。', alternative: '本來的下一步是照週期把品質課排回來，但疼痛或異常疲勞的處理順位高於任何進度。' };
  }
  if (fatigue >= 4 || !sleptWell || !recoveredFromLongRun) {
    const blocked = [fatigue >= 4 ? `疲勞自評 ${fatigue}/5` : '', !sleptWell ? '睡眠未達標' : '', !recoveredFromLongRun ? '長跑恢復未完成' : ''].filter(Boolean).join('、');
    return { result: '降載恢復', factor: 0.85, removeQuality: true, allowIntensity: false, note: '恢復條件尚未達標；下週降量 15% 並取消品質課，先把睡眠與恢復補回來。', alternative: `本來可以維持原跑量並保留品質課，但${blocked}，先補恢復比硬吃課表划算。` };
  }
  // 自評過關但手錶的恢復訊號連兩項示警時，同樣不推進：跑者常低估累積疲勞，
  // 睡眠與 HRV 是他自己也看不到的那一半。
  const recovery = typeof recoverySignalStatus === 'function' ? recoverySignalStatus() : null;
  if (recovery?.strained) {
    return { result: '維持', factor: 1, removeQuality: false, allowIntensity: false, note: `恢復自評過關，但手錶訊號顯示：${recovery.concerns.join('、')}；下週維持跑量，先把恢復補回來。`, alternative: '本來符合小幅推進 +5% 的條件，但睡眠／HRV／body battery 有兩項以上低於你自己的近期基準，這時候加量是拿恢復去換里程。' };
  }
  // 客觀資料同意加量、主觀體感卻已經很吃力時，不推進。真人教練不會只看錶。
  if (easyStrain?.overreaching) {
    return { result: '維持', factor: 1, removeQuality: false, allowIntensity: false, note: `恢復自評過關，但近 ${easyStrain.days} 天輕鬆跑平均 RPE ${easyStrain.avgRpe}／10 偏高；下週維持跑量，先把輕鬆跑真的跑輕鬆。`, alternative: '本來符合小幅推進 +5% 的條件，但輕鬆跑的主觀吃力度已經超過輕鬆跑該有的範圍，加量只會把疲勞往前堆。' };
  }
  if (!recovery?.sufficient) {
    return { result: '維持', factor: 1, removeQuality: false, allowIntensity: false, note: '恢復資料缺失、過期或未達三筆有效睡眠／HRV／靜息心率紀錄；維持課表，不自動加量。', alternative: '自評可保留，但缺值不等於恢復正常，等待完整證據後才推進。' };
  }
  if (answers.every(Boolean) && fatigue <= 2 && ramp && ramp.ramp <= 10) {
    return { result: '小幅推進', factor: 1.05, removeQuality: false, allowIntensity: true, note: `完成度、恢復與實跑增幅（${ramp.ramp >= 0 ? '+' : ''}${ramp.ramp}%）符合本計畫推進條件；下週最多小幅增加 5%。`, alternative: `沒有一次加更多：目前週增幅已是 ${ramp.ramp >= 0 ? '+' : ''}${ramp.ramp}%，再往上疊會超出本計畫 10% 的增量上限。` };
  }
  const lacksTrend = answers.every(Boolean) && fatigue <= 2 && !ramp;
  const note = lacksTrend
    ? '自評恢復穩定，但尚缺兩週實跑趨勢；下週先維持，不自動加量。'
    : '本週以維持為主；先把完成度與恢復做穩，再談加量。';
  const alternative = lacksTrend
    ? '本來可以小幅推進 +5%，但只有自評、沒有連續兩週的實跑資料可以佐證，寧可少加一週。'
    : '本來可以小幅推進 +5%，但完成度與恢復自評沒有同時達標，加量的依據不足。';
  return { result: '維持', factor: 1, removeQuality: false, allowIntensity: false, note, alternative };
}

// 品質課不是「有完成」就自動升級。這個閘門只回答一件事：這次輸出與恢復證據，
// 是否足以讓下一階段增加長跑或進入 I 課。資料不足也不是綠燈，避免日曆把跑者
// 推進到能力尚未證明的刺激。
function coachPromotionGate(evidence) {
  evidence = evidence || {};
  const qualityPlanned = Boolean(evidence.qualityPlanned);
  if (!qualityPlanned) return { status: 'not-applicable', label: '本週無品質檢測', reasons: [] };
  const reasons = [];
  const raceRecovery = typeof recentRaceRecoveryGate === 'function' ? recentRaceRecoveryGate() : null;
  if (raceRecovery?.blocked) reasons.push(raceRecovery.reason);
  if (!evidence.qualityCompleted) reasons.push('品質課未完成');
  if (!evidence.structuredEvidence) reasons.push('Garmin 未辨識到主課段，無法判讀節奏與心率');
  if (!(Number(evidence.rpe) >= 1 && Number(evidence.rpe) <= 10)) reasons.push('主課 RPE 尚未提供');
  if (evidence.recoveryConfirmed !== true) reasons.push('尚缺主課隔天的明確恢復確認');
  if (evidence.painConcern || evidence.nextDayPain) reasons.push('左腳疼痛、步態改變或隔天症狀未消退');
  if (Number(evidence.rpe) >= 8) reasons.push(`主課 RPE ${evidence.rpe}/10 過高`);
  if (evidence.paceCapBreached) reasons.push('主課快過處方的最快護欄');
  if (evidence.hrCapBreached) reasons.push('主課超過心率上限');
  if (Number(evidence.hrDrift) >= 8) reasons.push(`主課後半心率漂移 +${Math.round(Number(evidence.hrDrift))} bpm`);
  if (evidence.painConcern || evidence.nextDayPain || raceRecovery?.blocked) return { status: 'blocked', label: '不通過', reasons };
  if (reasons.length) return { status: 'conditional', label: '條件通過', reasons };
  return { status: 'pass', label: '通過', reasons: ['主課有結構化紀錄，未見配速／心率護欄違規，且恢復自評正常'] };
}
