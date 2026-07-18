// Garmin assignment boundary: map recorded runs to formal sessions conservatively.

function automaticActivityAssignment(run) {
  const planDays = (appData.plan || []).flatMap((week) => week.days || []);
  const sameDay = planDays.find((day) => day.dateStr === run.date && day.type !== 'rest');
  if (sameDay) return { targetDate: sameDay.dateStr, mode: 'same-day', source: 'auto', confidence: 'high' };
  const currentDay = planDays.find((day) => day.dateStr === run.date);
  if (currentDay?.isMakeup && currentDay.makeupOf) return { targetDate: currentDay.makeupOf, mode: 'makeup', source: 'auto', confidence: 'high' };
  const candidates = planDays.filter((day) => {
    const apart = Math.round((new Date(`${run.date}T00:00:00`) - new Date(`${day.dateStr}T00:00:00`)) / 86400000);
    return day.type !== 'rest' && day.status === 'missed' && apart >= 1 && apart <= 3 && activityCompletesDay(day, { actualKm: run.km, source: 'garmin' });
  });
  if (candidates.length === 1) return { targetDate: candidates[0].dateStr, mode: 'makeup', source: 'auto', confidence: 'medium' };
  return { targetDate: '', mode: 'extra', source: 'auto', confidence: 'high' };
}

function activityAssignmentFor(run) {
  const saved = appData.activityAssignments?.[String(run?.activityId || '')];
  return saved || automaticActivityAssignment(run);
}

function setActivityAssignment(activityId, targetDate, mode = 'same-day') {
  if (!activityId || !targetDate || !['same-day', 'makeup', 'extra'].includes(mode)) return;
  appData.activityAssignments = normalizeActivityAssignments(appData.activityAssignments);
  appData.activityAssignments[String(activityId)] = { targetDate, mode, source: 'runner', updatedAt: new Date().toISOString() };
  recordTrainingEvent('activity_assignment_updated', { date: targetDate, source: 'runner', detail: `${activityId} → ${targetDate} (${mode})` });
  saveData(appData);
  refreshCoachReviewPanels();
}

function openActivityAssignment(activityId) {
  const run = garminActivityRecords().find((item) => String(item.activityId) === String(activityId));
  if (!run) return;
  const planDays = (appData.plan || []).flatMap((week) => week.days || []).filter((day) => day.type !== 'rest' && day.dateStr <= run.date && day.dateStr >= addDaysToDateStr(run.date, -7));
  const current = activityAssignmentFor(run);
  const options = planDays.map((day) => `<option value="${day.dateStr}" ${day.dateStr === current.targetDate ? 'selected' : ''}>${day.dateStr} · ${trainingTypeLabel(day.type, day.focus)} · ${reviewEscape(trainingTaskTitle(day))}</option>`).join('');
  showModal('修正這趟跑步的課程對應', `<p class="field-help" style="margin-top:0">系統預設會自動對應同日課程，或在休息日跑步時尋找 3 天內可安全認列的補跑；只有判斷不符合實際情況時才需要改。</p><div class="form-group"><label class="form-label" for="m-activity-assignment">對應的正式課程</label><select id="m-activity-assignment" class="form-input">${options}</select></div>`, [
    { label: '儲存對應', primary: true, action: () => { setActivityAssignment(run.activityId, document.getElementById('m-activity-assignment')?.value, document.getElementById('m-activity-assignment')?.value === run.date ? 'same-day' : 'makeup'); closeModal(); } },
    { label: '標示為額外跑', action: () => { appData.activityAssignments = normalizeActivityAssignments(appData.activityAssignments); appData.activityAssignments[String(run.activityId)] = { targetDate: run.date, mode: 'extra', source: 'runner', updatedAt: new Date().toISOString() }; saveData(appData); closeModal(); refreshCoachReviewPanels(); } },
    { label: '取消', action: closeModal }
  ]);
}
