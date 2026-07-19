// trainer-coach-engine.js
// 統一教練模型：單一 context / status / resolver。Classic script，全域，
// 載於 trainer.js 前；函式於 call time 才用到 trainer.js 的常數與函式（安全，
// init 在全部載入後才跑）。
// 設計：docs/superpowers/specs/2026-07-19-unified-coach-model-design.md
// 計畫：docs/superpowers/plans/2026-07-19-unified-coach-model.md

// ============================================================
// buildContext：一次組好全部輸入，下游共用（不再各卡各自重抓）
// ============================================================
function buildContext() {
  const plan = appData.plan || [];
  const summary = trainingCompletionSummary(plan);
  return {
    today: todayStr(),
    todayWeek: (typeof todayWeekNum === 'function' ? todayWeekNum() : currentWeek),
    profile: appData.profile || null,
    plan,
    coachReview: (typeof coachReviewData !== 'undefined' ? coachReviewData : null),
    checkins: appData.checkins || [],
    weather: (typeof trainerWeather !== 'undefined' ? trainerWeather : null),
    safetyHold: appData.safetyHold || null,
    garminRuns: (typeof garminActivityRecords === 'function' ? garminActivityRecords() : []),
    activityByDate: summary.activityByDate,
    planDayByDate: summary.planDayByDate,
    completion: summary,
  };
}

// ============================================================
// buildStatusReminders：資料衛生提醒（原 renderTrainingStatusCard 的組裝邏輯，
// 抽成純資料，供 planStatus 與 renderTrainingStatusCard 共用）
// ============================================================
function buildStatusReminders(health = trainingDataHealth(appData.plan || [])) {
  const { summary, issues, syncAge, missedWithoutReason, missingReasonDate, uncreditedRestRuns, currentWeekDays, currentWeekCompleted } = health;
  const pendingAssignmentReviews = (typeof pendingGarminAssignmentReviews === 'function' ? pendingGarminAssignmentReviews() : []);
  const list = [];
  if (pendingAssignmentReviews.length) list.push(`有 ${pendingAssignmentReviews.length} 趟 Garmin 跑步是依補跑規則低信心對應；請確認一次，避免把實跑歸到錯的課。`);
  if (uncreditedRestRuns) list.push(`有 ${uncreditedRestRuns} 次 Garmin 跑步還沒對應課表。目前會算進本週跑量，但不會算成完成或補跑；如果它其實是補跑，請回原本跳過的課表按「重新安排」。`);
  if (missedWithoutReason) list.push(`${missedWithoutReason} 個跳過課表還沒填原因；補上後，之後回顧調整才看得懂當時為什麼休息。`);
  if (summary.partialDays.length) list.push(`${summary.partialDays.length} 堂跑步距離還沒達到你設定的完成比例，目前先標成部分完成。`);
  if (syncAge !== null && syncAge > 2) list.push(`Garmin 已 ${syncAge} 天沒有新資料，先確認手錶或同步是否正常。`);
  const stateTitle = list.length ? `有 ${list.length} 件訓練事項待確認` : currentWeekDays.length ? '本週進度已更新' : '本週剛開始';
  const stateCopy = list.length
    ? list.join(' ')
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
  return { list, issues, stateTitle, stateCopy, action };
}

// ============================================================
// planStatus：單一狀態源。完成度／週量／autopilot 決策／預測 → 驅動所有卡。
// ============================================================
function planStatus(ctx = buildContext()) {
  const plan = ctx.plan;
  const health = trainingDataHealth(plan);
  const decision = trainingAutopilotDecision(plan);
  const projection = (typeof fitnessProjection === 'function' ? fitnessProjection(ctx.profile) : null);
  // 用 currentWeek（app 目前聚焦週，瀏覽會變）對齊 renderWeekOverviewCard 既有行為；
  // health.currentWeekCompleted 仍是今日日曆週（既有卡本就是這樣混用，保留不改）。
  const currWeekPlan = plan[currentWeek - 1] || plan[ctx.todayWeek - 1];
  const effectiveTarget = effectiveWeekVolumeTarget(currWeekPlan);
  const weekDates = new Set((currWeekPlan?.days || []).map((d) => d.dateStr));
  const currWeekDone = ctx.completion.allActivity
    .filter((e) => weekDates.has(e.date))
    .reduce((s, e) => s + (e.actualKm || 0), 0);
  const weekTargetKm = effectiveTarget.numericKm || 0;
  return {
    health,
    decision,
    projection,
    completion: ctx.completion,
    currentWeekCompleted: health.currentWeekCompleted.length,
    currentWeekDays: health.currentWeekDays.length,
    adherence: ctx.completion.elapsedSessions ? ctx.completion.adherence : null,
    totalKm: ctx.completion.totalKm,
    syncAge: health.syncAge,
    weekTargetKm,
    weekTargetDisplay: effectiveTarget.display,
    weekTargetSource: effectiveTarget.source,
    weekDoneKm: currWeekDone,
    weekProgressPct: weekTargetKm > 0 ? Math.min(100, Math.round((currWeekDone / weekTargetKm) * 100)) : 0,
    reminders: buildStatusReminders(health),
  };
}
