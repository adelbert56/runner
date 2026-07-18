// Safety boundary: persistent pain/fatigue protection and conservative course overrides.
// This remains a classic script so existing inline controls can keep calling these functions.

function activeSafetyHold() {
  return appData.safetyHold?.active ? appData.safetyHold : null;
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

function applyCoachPlanOverride(day, week) {
  // 安全保護高於教練處方；疼痛保護中不顯示原本的品質或長跑內容。
  const safetyHold = activeSafetyHold();
  if (safetyHold && day.dateStr >= todayStr() && ['tempo', 'interval', 'long'].includes(day.type)) {
    return {
      ...day,
      type: 'easy',
      focus: 'recovery',
      task: '恢復跑或休息（傷痛保護模式）',
      detail: '暫停品質課與長跑；若仍有疼痛、步態異常或不適，改為完全休息。',
      pace: '非常輕鬆／可完整對話；不適即停止',
      coachSafetyOverride: true
    };
  }
  if (day.safetyOverride) return { ...day, coachSafetyOverride: true };
  const coachDays = coachDaysForWeek(week);
  const entry = coachDays.find((item) => item.scheduledDow === day.dow);
  if (!entry) return day;
  const headline = coachPlanHeadline(entry.plan);
  const steps = (day.steps || []).map((step) => step.title === '主課'
    ? { ...step, dose: '', detail: entry.plan, isCoachMain: true }
    : step);
  const suppliedSteps = Array.isArray(entry.steps) ? entry.steps : [];
  const workoutStructure = coachWorkoutStructure(entry.plan, day, suppliedSteps);
  return { ...day, task: headline, pace: '', hrTarget: '', steps, workoutStructure, workoutStructureConfidence: suppliedSteps.length ? 'coach' : coachStructureConfidence(entry.plan), coachPlan: true };
}

function checkinSafetyDecision({ answers, fatigue, painConcern }) {
  const noPain = Boolean(answers[1]);
  const sleptWell = Boolean(answers[2]);
  const recoveredFromLongRun = Boolean(answers[3]);
  const ramp = weeklyRampInfo(weeklyRunTrend(coachRunRecords()));
  if (painConcern || !noPain || fatigue >= 5) {
    return { result: '停止品質課', factor: 0.7, removeQuality: true, allowIntensity: false, note: '有疼痛、異常疲勞或步態問題；下週先降量並取消節奏跑與間歇。若症狀持續或加劇，請就醫。' };
  }
  if (fatigue >= 4 || !sleptWell || !recoveredFromLongRun) {
    return { result: '降載恢復', factor: 0.85, removeQuality: true, allowIntensity: false, note: '恢復條件尚未達標；下週降量 15% 並取消品質課，先把睡眠與恢復補回來。' };
  }
  if (answers.every(Boolean) && fatigue <= 2 && ramp && ramp.ramp <= 10) {
    return { result: '小幅推進', factor: 1.05, removeQuality: false, allowIntensity: true, note: `完成度、恢復與實跑增幅（${ramp.ramp >= 0 ? '+' : ''}${ramp.ramp}%）皆在安全範圍；下週最多小幅增加 5%。` };
  }
  const note = answers.every(Boolean) && fatigue <= 2 && !ramp
    ? '自評恢復穩定，但尚缺兩週實跑趨勢；下週先維持，不自動加量。'
    : '本週以維持為主；先把完成度與恢復做穩，再談加量。';
  return { result: '維持', factor: 1, removeQuality: false, allowIntensity: false, note };
}
