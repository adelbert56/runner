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
    lastDailyAdvisory: appData.lastDailyAdvisory || null,
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

// ============================================================
// resolveCourse：render-time 的單一課程決策器。
//
// 課表本體仍是 baseline；adapter 只傳回覆蓋結果，不寫 appData、不碰 DOM。
// 持久的課表調整（校準／週評估／當日安全調整）則統一由
// runCoachAdaptation() 觸發，避免誤把 mutation 放進每張卡的 render path。
// ============================================================
function safetyGuard(day, ctx) {
  const safetyHold = ctx.safetyHold?.active ? ctx.safetyHold : null;
  if (safetyHold && day.dateStr >= ctx.today && ['tempo', 'interval', 'long'].includes(day.type)) {
    return {
      type: 'replace',
      course: {
        ...day,
        type: 'easy',
        focus: 'recovery',
        task: '恢復跑或休息（傷痛保護模式）',
        detail: '暫停品質課與長跑；若仍有疼痛、步態異常或不適，改為完全休息。',
        pace: '非常輕鬆／可完整對話；不適即停止',
        coachSafetyOverride: true
      },
      rationale: '安全保護：傷痛保護模式暫停品質課與長跑。',
      source: 'safety-hold'
    };
  }
  if (day.safetyOverride) {
    return {
      type: 'replace',
      course: { ...day, coachSafetyOverride: true },
      rationale: day.recoveryProtection || '安全保護：本週評估已將品質課改為恢復跑。',
      source: 'safety-override'
    };
  }
  return null;
}

function coachPrescription(day, ctx, week) {
  const coachDays = coachDaysForWeek(week);
  const entry = coachDays.find((item) => item.scheduledDow === day.dow);
  if (!entry) return null;
  const headline = coachPlanHeadline(entry.plan);
  const steps = (day.steps || []).map((step) => step.title === '主課'
    ? { ...step, dose: '', detail: entry.plan, isCoachMain: true }
    : step);
  const suppliedSteps = Array.isArray(entry.steps) ? entry.steps : [];
  return {
    type: 'replace',
    course: {
      ...day,
      task: headline,
      pace: '',
      hrTarget: '',
      steps,
      workoutStructure: coachWorkoutStructure(entry.plan, day, suppliedSteps),
      workoutStructureConfidence: suppliedSteps.length ? 'coach' : coachStructureConfidence(entry.plan),
      coachPlan: true
    },
    rationale: '教練處方：本週手寫課表覆蓋預設課程。',
    source: 'coach-prescription'
  };
}

function courseRationale(day, ctx) {
  if (day.recoveryProtection) return `安全保護：${day.recoveryProtection}`;
  const advisory = ctx.lastDailyAdvisory?.date === day.dateStr ? ctx.lastDailyAdvisory : null;
  if (day.advisoryAdjusted && advisory?.triggers?.length) {
    return `出發前調整：${advisory.triggers.join('、')}；今天已降階為恢復安排。`;
  }
  if (day.raceReplacement === 'post-race') return '賽事調整：賽後恢復優先，暫不補原本的訓練量。';
  if (day.raceReplacement === 'pre-race-taper') return '賽事調整：保留賽前減壓，避免累積疲勞。';
  return '';
}

// 持久調整的 adapter 只描述「是否需要調整」與依據；實際寫入仍由既有函式處理，
// 讓校準、移課、變更紀錄與 saveData 的成熟行為保持不變。
function dailyAdjust(day, ctx) {
  const isProtectable = day && day.dateStr === ctx.today && ['tempo', 'interval', 'long'].includes(day.type)
    && day.status !== 'done' && !day.raceReplacement && !day.isMakeup
    && !coachPrescriptionLocksWeek(ctx.plan.find((week) => (week.days || []).includes(day)));
  if (!isProtectable) return null;
  const triggers = dailyAdvisoryTriggers(day, ctx);
  if (!triggers.length) return null;
  return {
    type: 'mutation',
    source: 'daily-adjust',
    triggers,
    rationale: `出發前調整：${triggers.join('、')}。`
  };
}

function progression(ctx, trigger, options = {}) {
  if (trigger === 'weekly-checkin') {
    const { factor = 1, removeQuality = false, qualityMode = 'keep' } = options;
    if (factor === 1 && !removeQuality && qualityMode !== 'reduce') return null;
    return {
      type: 'mutation',
      source: 'weekly-checkin',
      factor,
      removeQuality,
      qualityMode,
      rationale: removeQuality ? '週評估安全保護：下週移除品質課。' : qualityMode === 'reduce' ? 'Garmin 負荷保護：下週品質課降階。' : '週評估：下週跑量已依恢復狀態調整。'
    };
  }
  if (trigger === 'coach-review-ready' && ctx.coachReview?.updatedAt && ctx.profile && ctx.plan.length) {
    return { type: 'mutation', source: 'garmin-recalibration', rationale: 'Garmin 教練資料已到位，重新檢查未來週校準。' };
  }
  return null;
}

function paceResolver(ctx, date = ctx.today) {
  if (!ctx.profile) return null;
  const when = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? new Date(`${date}T00:00:00`) : null;
  const easy = adaptiveEasyPaceSec(ctx.profile, when);
  return {
    easy,
    tempoSec: Number(ctx.profile.tempoPaceSec) || null,
    intervalSec: Number(ctx.profile.intervalPaceSec) || null,
    hrZones: hrZones(ctx.profile),
    source: { easy: easy.source, quality: 'profile' }
  };
}

function resolveCourse(day, ctx = buildContext(), week = null) {
  const resolvedWeek = week || ctx.plan.find((item) => (item.days || []).includes(day)
    || (day.weekNum && item.weekNum === day.weekNum)
    || (day.dateStr && (item.days || []).some((itemDay) => itemDay.dateStr === day.dateStr)));
  const course = day;
  const adapter = safetyGuard(course, ctx) || coachPrescription(course, ctx, resolvedWeek);
  if (!adapter) return { course, paces: paceResolver(ctx, day.dateStr), rationale: courseRationale(course, ctx), source: 'baseline' };
  return { course: adapter.course, paces: paceResolver(ctx, day.dateStr), rationale: adapter.rationale || courseRationale(adapter.course, ctx), source: adapter.source };
}

function runCoachAdaptation(trigger, options = {}) {
  // 所有會寫回 plan 的既有優化器集中在此調度；各函式內部先不重寫，
  // 以守住既有校準與安全邊界的行為 parity。
  const ctx = buildContext();
  const result = { trigger, recalibration: null, dailyAdvisory: null, nextWeekAdjustment: null, decisions: [] };
  if (trigger === 'coach-review-ready') {
    const progressionDecision = progression(ctx, trigger, options);
    if (progressionDecision) result.decisions.push(progressionDecision);
    result.recalibration = progressionDecision ? autoRecalibratePlan() : null;
    const dailyDecision = dailyAdjust(findRawPlanDay(ctx.today)?.day, ctx);
    if (dailyDecision) result.decisions.push(dailyDecision);
    result.dailyAdvisory = applyDailySessionAdvisory();
  } else if (trigger === 'weather-ready') {
    const dailyDecision = dailyAdjust(findRawPlanDay(ctx.today)?.day, ctx);
    if (dailyDecision) result.decisions.push(dailyDecision);
    result.dailyAdvisory = applyDailySessionAdvisory();
  } else if (trigger === 'weekly-checkin') {
    const progressionDecision = progression(ctx, trigger, options);
    if (progressionDecision) {
      result.decisions.push(progressionDecision);
      adjustNextWeek(progressionDecision.factor, progressionDecision.removeQuality, progressionDecision.qualityMode);
      result.nextWeekAdjustment = progressionDecision;
    }
  }
  return result;
}
