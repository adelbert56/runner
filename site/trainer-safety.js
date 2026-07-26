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
  // 客觀資料同意加量、主觀體感卻已經很吃力時，不推進。真人教練不會只看錶。
  if (easyStrain?.overreaching) {
    return { result: '維持', factor: 1, removeQuality: false, allowIntensity: false, note: `恢復自評過關，但近 ${easyStrain.days} 天輕鬆跑平均 RPE ${easyStrain.avgRpe}／10 偏高；下週維持跑量，先把輕鬆跑真的跑輕鬆。`, alternative: '本來符合小幅推進 +5% 的條件，但輕鬆跑的主觀吃力度已經超過輕鬆跑該有的範圍，加量只會把疲勞往前堆。' };
  }
  if (answers.every(Boolean) && fatigue <= 2 && ramp && ramp.ramp <= 10) {
    return { result: '小幅推進', factor: 1.05, removeQuality: false, allowIntensity: true, note: `完成度、恢復與實跑增幅（${ramp.ramp >= 0 ? '+' : ''}${ramp.ramp}%）皆在安全範圍；下週最多小幅增加 5%。`, alternative: `沒有一次加更多：目前週增幅已是 ${ramp.ramp >= 0 ? '+' : ''}${ramp.ramp}%，再往上疊會超出 10% 的安全增量上限。` };
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
