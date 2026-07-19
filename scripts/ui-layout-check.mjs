import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import http from "node:http";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.UI_LAYOUT_PORT || 4174);
const baseUrl = `http://127.0.0.1:${port}/site/`;
const screenshotDir = resolve(root, "output/playwright");

const panels = [
  { id: "races", label: "賽事" },
  { id: "announcements", label: "公告" },
  { id: "gear", label: "跑鞋" },
  { id: "academy", label: "入門" },
  { id: "news", label: "新聞" },
];

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1280, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "wide-desktop", width: 1920, height: 1080 },
];
const requestedViewportNames = String(process.env.UI_LAYOUT_VIEWPORTS || "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const selectedViewports = requestedViewportNames.length
  ? viewports.filter((viewport) => requestedViewportNames.includes(viewport.name))
  : viewports;

if (requestedViewportNames.length && selectedViewports.length !== requestedViewportNames.length) {
  throw new Error(`Unknown UI_LAYOUT_VIEWPORTS value: ${requestedViewportNames.join(", ")}`);
}

const trainerVisualSample = {
  profile: {
    generatedAt: "2026-07-06",
    targetDate: "2026-10-18",
    targetTime: "02:00:00",
    racePaceSec: 340,
    goal: "half",
    dayState: [0, 1, 0, 1, 0, 0, 1],
    injuries: ["none"],
    planVersion: 10,
  },
  plan: [{
    weekNum: 1,
    phase: "base",
    phaseLabel: "基礎期",
    targetKm: 24,
    days: [{
      dateStr: "2026-07-08",
      dow: 3,
      type: "easy",
      focus: "easy",
      task: "E 跑 6.5 km",
      detail: "輕鬆完成，維持可以對話的強度。",
      pace: "7:20–7:50/km",
      km: 6.5,
      status: "done",
    }, {
      dateStr: "2026-07-15",
      dow: 3,
      type: "easy",
      focus: "easy",
      task: "E 跑 5 km",
      detail: "輕鬆完成，維持可以對話的強度。",
      pace: "7:20–7:50/km",
      km: 5,
      status: "upcoming",
    }],
  }],
  log: [],
  checkins: [],
  assessments: [],
  trainingEvents: [],
};

const trainerReviewSample = {
  updatedAt: "2026-07-14",
  analyticsUpdatedAt: "2026-07-14",
  nextWeek: {
    label: "W1（07-13 週）— 長跑重建",
    targetKm: "28–30",
    menu: [
      { day: "週一", plan: "E 跑 7 km，前 1 km 最慢當熱身，中段 8:50-9:20、守 Z2（HR≤150），收 5 分鐘慢走伸展。目的：洪掉前幾天疲勞。" },
      { day: "週三", plan: "E 跑 6 km、守 Z2（HR≤150）＋ ST 快步 4×20 秒。目的：保持頻率。" },
      { day: "週六", plan: "長跑 10 km，清晨開跑，8:50-9:20、守 Z2（HR≤150）。目的：本週最重要一課。" },
    ],
  },
  analyticsRuns: [{
    activityId: 7008,
    date: "2026-07-08",
    name: "晨跑",
    km: 6.52,
    durationMin: 47.6,
    pace: "7:18",
    hr: 156,
    cadence: 156,
    qualityEligible: true,
    qualitySource: "garmin-workout-steps",
    qualityKm: 6,
    qualityPace: "7:40",
    qualityHr: 154,
    qualityCadence: 157,
    laps: [
      { index: 1, intensity: "WARMUP", distance_km: 0.26, duration_min: 2.95, pace_per_km: "11:43" },
      { index: 2, intensity: "MAIN", distance_km: 1, duration_min: 7.4, pace_per_km: "7:24" },
      { index: 3, intensity: "MAIN", distance_km: 1, duration_min: 7.98, pace_per_km: "7:59" },
      { index: 4, intensity: "MAIN", distance_km: 1, duration_min: 7.88, pace_per_km: "7:53" },
      { index: 5, intensity: "MAIN", distance_km: 1, duration_min: 7.75, pace_per_km: "7:45" },
      { index: 6, intensity: "MAIN", distance_km: 1, duration_min: 7.67, pace_per_km: "7:40" },
      { index: 7, intensity: "MAIN", distance_km: 1, duration_min: 8.43, pace_per_km: "8:26" },
      { index: 8, intensity: "ACTIVE", distance_km: 0.05, duration_min: 0.35, pace_per_km: "6:59" },
      { index: 9, intensity: "RECOVERY", distance_km: 0.08, duration_min: 0.76, pace_per_km: "9:30" },
      { index: 10, intensity: "ACTIVE", distance_km: 0.06, duration_min: 0.35, pace_per_km: "5:58" },
      { index: 11, intensity: "RECOVERY", distance_km: 0.08, duration_min: 0.73, pace_per_km: "9:06" },
      { index: 12, intensity: "ACTIVE", distance_km: 0.08, duration_min: 0.35, pace_per_km: "4:20" },
      { index: 13, intensity: "RECOVERY", distance_km: 0.07, duration_min: 0.72, pace_per_km: "10:23" },
      { index: 14, intensity: "COOLDOWN", distance_km: 0.27, duration_min: 3.1, pace_per_km: "11:17" },
      { index: 15, intensity: "COOLDOWN", distance_km: 0.03, duration_min: 0.33, pace_per_km: "10:52" },
      { index: 16, intensity: "COOLDOWN", distance_km: 0.01, duration_min: 0.11, pace_per_km: "10:52" },
    ],
    selfEvaluation: { feel: 5, rpe: 3 },
  }],
  autopilot: { metrics: { comparisonFamily: "easy", recentQualityRuns: 0, previousQualityRuns: 0 } },
};

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    fail(
      "Playwright is not installed. Run `npm install --no-save playwright@1.56.1` and `npx playwright install chromium` first."
    );
  }
}

function waitForServer(url, timeoutMs = 10000) {
  const started = Date.now();
  return new Promise((resolveReady, rejectReady) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolveReady();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        rejectReady(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(check, 250);
    };

    check();
  });
}

function startServer() {
  const child = spawn(process.execPath, ["site/server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function assertNoHorizontalOverflow(page, context) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  if (metrics.scroll > metrics.viewport + 2) {
    throw new Error(`${context}: horizontal overflow ${metrics.scroll}px > ${metrics.viewport}px`);
  }
}

async function assertTextFitsControls(page, context) {
  const offenders = await page.evaluate(() => {
    const selectors = [
      "button",
      ".button",
      ".register-link",
      ".link-button",
      ".toggle-button",
      ".race-card h3",
      ".shoe-release-list article h3",
      ".news-list article h3",
    ];
    return [...document.querySelectorAll(selectors.join(","))]
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          element.scrollWidth > element.clientWidth + 2
        );
      })
      .slice(0, 8)
      .map((element) => ({
        selector: element.tagName.toLowerCase(),
        className: element.className || "",
        text: (element.textContent || "").trim().slice(0, 80),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
  });

  if (offenders.length) {
    throw new Error(`${context}: text overflow ${JSON.stringify(offenders)}`);
  }
}

async function assertRaceCardsStayScannable(page, viewportName) {
  const limits = viewportName === "desktop" ? { titleLines: 3, cardHeight: 430 } : { titleLines: 4, cardHeight: 560 };
  const cards = await page.evaluate((limitsArg) => {
    return [...document.querySelectorAll(".race-card")]
      .slice(0, 6)
      .map((card) => {
        const title = card.querySelector("h3");
        const titleStyle = title ? window.getComputedStyle(title) : null;
        const lineHeight = titleStyle ? parseFloat(titleStyle.lineHeight) || 24 : 24;
        const titleLines = title ? Math.round(title.getBoundingClientRect().height / lineHeight) : 0;
        return {
          title: (title?.textContent || "").trim(),
          titleLines,
          height: Math.round(card.getBoundingClientRect().height),
          titleOk: titleLines <= limitsArg.titleLines,
          heightOk: card.getBoundingClientRect().height <= limitsArg.cardHeight,
        };
      });
  }, limits);

  const badCards = cards.filter((card) => !card.titleOk || !card.heightOk);
  if (badCards.length) {
    throw new Error(`${viewportName}: race cards are too dense ${JSON.stringify(badCards)}`);
  }
}

async function assertPanel(page, panel, viewportName) {
  await page.click(`[data-panel-link="${panel.id}"]`);
  await page.waitForSelector(`#${panel.id}.active`, { timeout: 5000 });
  await page.waitForLoadState("networkidle");

  const visible = await page.locator(`#${panel.id}`).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 240;
  });
  if (!visible) {
    throw new Error(`${viewportName}/${panel.id}: panel is not visibly rendered`);
  }

  await assertNoHorizontalOverflow(page, `${viewportName}/${panel.id}`);
  await assertTextFitsControls(page, `${viewportName}/${panel.id}`);

  if (panel.id === "races") {
    await page.waitForSelector(".race-card", { timeout: 5000 });
    await assertRaceCardsStayScannable(page, viewportName);
  }

  await page.screenshot({
    path: resolve(screenshotDir, `${viewportName}-${panel.id}.png`),
    fullPage: true,
  });
  console.log(`OK ${viewportName}/${panel.id} layout`);
}

async function assertTrainerReport(page, viewportName) {
  // The trainer loads encrypted coach data in the background.  Network idle is
  // not a page-readiness signal here and can time out on CI despite a usable UI.
  await page.goto(`${baseUrl}trainer.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#trainer-hero-shell", { timeout: 5000 });
  await page.evaluate((sample) => localStorage.setItem("runner-trainer-v1", JSON.stringify(sample)), trainerVisualSample);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#trainer-hero-shell", { timeout: 5000 });
  await page.evaluate((review) => {
    // This is a deterministic local visual fixture; it never writes to the product data files.
    eval(`coachReviewData = ${JSON.stringify(review)}`);
    renderPlanView();
    showView("plan");
    switchPlanTab("progress");
    switchProgressPanel("analysis");
  }, trainerReviewSample);
  await page.waitForSelector(".session-report", { timeout: 5000 });
  await assertNoHorizontalOverflow(page, `${viewportName}/trainer-report`);
  const decision = await page.locator("#progress-panel-analysis").evaluate((element) => ({
    hasDecision: element.textContent.includes("自動訓練決策"),
    hasLongestRun: element.textContent.includes("近四週最長跑"),
  }));
  if (!decision.hasDecision || !decision.hasLongestRun) {
    throw new Error(`${viewportName}/trainer-report: automatic decision or long-term context is missing ${JSON.stringify(decision)}`);
  }
  const inputValidation = await page.evaluate(() => {
    const valid = {
      goal: "half",
      targetDate: "2026-10-18",
      targetTime: "2:10",
      dayState: [0, 1, 0, 1, 0, 0, 2],
      weeklyKm: 24,
      easyPace: "7:30",
      maxHr: 180,
    };
    return {
      validErrors: trainingProfileValidationErrors(valid),
      malformedErrors: trainingProfileValidationErrors({ ...valid, targetTime: "2:99", easyPace: "7:88", weeklyKm: 999 }),
    };
  });
  if (inputValidation.validErrors.length || inputValidation.malformedErrors.length < 3) {
    throw new Error(`${viewportName}/trainer-profile-validation: expected valid setup to pass and malformed setup to be blocked ${JSON.stringify(inputValidation)}`);
  }
  const earlyPlanning = await page.evaluate(() => {
    currentWeek = 1;
    const week = appData.plan[0];
    const planned = (week?.days || []).filter((day) => day.type !== "rest" && !day.isMakeup);
    const previous = {
      log: appData.log,
      dayStatuses: appData.dayStatuses,
      runs: coachReviewData.analyticsRuns,
      statuses: planned.map((day) => day.status),
    };
    try {
      appData.log = [];
      appData.dayStatuses = {};
      planned.forEach((day) => { day.status = "planned"; });
      coachReviewData.analyticsRuns = planned.map((day, index) => ({
        activityId: `early-plan-${index}`,
        date: day.dateStr,
        km: day.km,
        pace: "6:00",
      }));
      const eligibility = earlyCoachPlanningEligibility();
      return { eligible: eligibility.eligible, planned: eligibility.plannedSessions?.length || 0 };
    } finally {
      appData.log = previous.log;
      appData.dayStatuses = previous.dayStatuses;
      coachReviewData.analyticsRuns = previous.runs;
      planned.forEach((day, index) => { day.status = previous.statuses[index]; });
    }
  });
  if (!earlyPlanning.eligible || earlyPlanning.planned < 2) {
    throw new Error(`${viewportName}/trainer-early-planning: matched Garmin sessions did not unlock early planning ${JSON.stringify(earlyPlanning)}`);
  }
  const earlyPlanningSubmission = await page.evaluate(() => {
    const previousData = cloneTrainingValue(appData);
    const previousWeek = currentWeek;
    const previousReview = cloneTrainingValue(coachReviewData);
    const originalJumpToPhaseWeek = window.jumpToPhaseWeek;
    const originalSwitchPlanTab = window.switchPlanTab;
    const originalShowCheckinOutcome = window.showCheckinOutcome;
    try {
      currentWeek = 1;
      const week = appData.plan[0];
      const planned = (week?.days || []).filter((day) => day.type !== "rest" && !day.isMakeup);
      appData.log = [];
      appData.dayStatuses = {};
      planned.forEach((day) => { day.status = "planned"; });
      appData.checkins = [];
      const nextWeek = appData.plan[1];
      const originalTargetKm = nextWeek.targetKm;
      window.jumpToPhaseWeek = () => {};
      window.switchPlanTab = () => {};
      window.showCheckinOutcome = () => {};
      coachReviewData.analyticsRuns = planned.map((day, index) => ({ activityId: `early-submit-${index}`, date: day.dateStr, km: day.km, pace: "6:00" }));
      coachReviewData.autopilot = { status: "ready", decision: "deload", label: "自動降量", volumeFactor: 0.85, qualityMode: "reduce" };
      openEarlyCoachPlanning();
      CHECKIN_QUESTIONS.slice(1).forEach((_, index) => { document.getElementById(`early-check-${index + 1}`).checked = true; });
      document.getElementById("early-fatigue").value = "3";
      submitEarlyCoachPlanning();
      const checkin = appData.checkins.find((item) => item.weekNum === currentWeek);
      if (checkin) checkin.provisional = false;
      openEarlyCoachPlanning();
      CHECKIN_QUESTIONS.slice(1).forEach((_, index) => { document.getElementById(`early-check-${index + 1}`).checked = true; });
      document.getElementById("early-fatigue").value = "3";
      submitEarlyCoachPlanning();
      const hasQuality = nextWeek.days.some((day) => ["tempo", "interval"].includes(day.type));
      return { recorded: Boolean(checkin), earlyTrigger: checkin?.earlyTrigger === true, hasSchedulingDecision: typeof checkin?.adjustment === "string" && checkin.adjustment.includes("85%"), nextWeekExists: Boolean(appData.plan[currentWeek]), adjustedTargetKm: nextWeek.targetKm, expectedTargetKm: Math.round(originalTargetKm * 0.85 * 10) / 10, qualityReduced: !hasQuality || nextWeek.days.some((day) => day.coachPlan?.qualityMode === "reduce"), repeatSubmissionTitle: document.getElementById("modal-title")?.textContent?.trim() };
    } finally {
      appData = previousData;
      currentWeek = previousWeek;
      coachReviewData = previousReview;
      window.jumpToPhaseWeek = originalJumpToPhaseWeek;
      window.switchPlanTab = originalSwitchPlanTab;
      window.showCheckinOutcome = originalShowCheckinOutcome;
      saveData(appData);
      closeModal();
    }
  });
  if (!earlyPlanningSubmission.recorded || !earlyPlanningSubmission.earlyTrigger || !earlyPlanningSubmission.hasSchedulingDecision || !earlyPlanningSubmission.nextWeekExists || earlyPlanningSubmission.adjustedTargetKm !== earlyPlanningSubmission.expectedTargetKm || !earlyPlanningSubmission.qualityReduced || earlyPlanningSubmission.repeatSubmissionTitle !== "下週已安排") {
    throw new Error(`${viewportName}/trainer-early-planning-submit: completed Garmin sessions did not complete the next-week scheduling flow ${JSON.stringify(earlyPlanningSubmission)}`);
  }
  const manualEarlyPlanning = await page.evaluate(() => {
    const previousWeek = currentWeek;
    currentWeek = 1;
    const week = appData.plan[0];
    const planned = (week?.days || []).filter((day) => day.type !== "rest" && !day.isMakeup);
    const previous = {
      log: appData.log,
      dayStatuses: appData.dayStatuses,
      runs: coachReviewData.analyticsRuns,
      statuses: planned.map((day) => day.status),
    };
    try {
      appData.log = [];
      appData.dayStatuses = {};
      planned.forEach((day) => { day.status = "planned"; });
      coachReviewData.analyticsRuns = [];
      const eligibility = earlyCoachPlanningEligibility();
      const card = renderEarlyCoachPlanningCard();
      return {
        pending: eligibility.pending?.length || 0,
        offersManualConfirmation: card.includes("確認已完成並安排下週"),
      };
    } finally {
      appData.log = previous.log;
      appData.dayStatuses = previous.dayStatuses;
      coachReviewData.analyticsRuns = previous.runs;
      planned.forEach((day, index) => { day.status = previous.statuses[index]; });
      currentWeek = previousWeek;
    }
  });
  if (!manualEarlyPlanning.pending || !manualEarlyPlanning.offersManualConfirmation) {
    throw new Error(`${viewportName}/trainer-manual-early-planning: unmatched Garmin dates did not offer a per-course confirmation ${JSON.stringify(manualEarlyPlanning)}`);
  }
  const duplicateGuards = await page.evaluate(() => {
    const checkins = normalizeTrainingCheckins([
      { weekNum: 2, date: "2026-07-17", provisional: true, result: "維持", fatigue: 3 },
      { weekNum: 2, date: "2026-07-19", provisional: false, result: "降載恢復", fatigue: 4 },
      { weekNum: 3, date: "2026-07-20", provisional: false, result: "維持", fatigue: 2 },
    ]);
    const planChanges = normalizePlanChangeHistory([
      { date: "2026-07-16", source: "garmin", title: "Garmin 實跑自動校準", changes: ["第 3 週：37.8 → 30.2 km、改為恢復週"] },
      { date: "2026-07-18", source: "garmin", title: "Garmin 實跑自動校準", changes: ["第 3 週：37.8 → 30.2 km、改為恢復週"] },
    ]);
    return { checkinWeeks: checkins.map((item) => item.weekNum), finalWeek2: checkins.find((item) => item.weekNum === 2)?.result, planChangeCount: planChanges.length, planChangeDate: planChanges[0]?.date };
  });
  if (duplicateGuards.checkinWeeks.join(",") !== "2,3" || duplicateGuards.finalWeek2 !== "降載恢復" || duplicateGuards.planChangeCount !== 1 || duplicateGuards.planChangeDate !== "2026-07-18") {
    throw new Error(`${viewportName}/trainer-duplicate-guards: weekly reviews or repeated Garmin calibration results were not collapsed ${JSON.stringify(duplicateGuards)}`);
  }
  const safetyHold = await page.evaluate(() => {
    appData.safetyHold = { active: true, startedOn: todayStr(), reason: "test safety hold" };
    const adjusted = applyCoachPlanOverride({ dateStr: todayStr(), type: "tempo", focus: "tempo", task: "T 跑", pace: "5:00/km" }, { weekNum: 1 });
    appData.safetyHold = null;
    return { type: adjusted.type, focus: adjusted.focus, task: adjusted.task };
  });
  if (safetyHold.type !== "easy" || safetyHold.focus !== "recovery" || !safetyHold.task.includes("傷痛保護模式")) {
    throw new Error(`${viewportName}/trainer-safety-hold: quality workout was not safely masked ${JSON.stringify(safetyHold)}`);
  }
  const report = await page.locator(".session-report").evaluate((element) => ({
    hasPlanComparison: element.textContent.includes("正式課表對照"),
    hasNextAction: element.textContent.includes("下一步"),
    hasLapFilter: Boolean(element.querySelector(".session-lap-filters")),
    activeFilterText: element.querySelector(".session-lap-filter.active")?.textContent.trim(),
    visibleLapCount: element.querySelectorAll(".session-lap-list .session-lap").length,
    filterLabels: [...element.querySelectorAll(".session-lap-filter")].map((button) => button.textContent.trim()),
    hasAmbiguousActiveLabel: element.textContent.includes("活動段"),
    hasInvalidNumber: element.textContent.includes("NaN"),
  }));
  if (!report.hasPlanComparison || !report.hasNextAction || !report.hasLapFilter || !/^主課\s+6$/.test(report.activeFilterText || "") || report.visibleLapCount !== 6 || !report.filterLabels.some((label) => /^間歇快段\s+3$/.test(label)) || !report.filterLabels.some((label) => /^間歇恢復\s+3$/.test(label)) || report.hasAmbiguousActiveLabel || report.hasInvalidNumber) {
    throw new Error(`${viewportName}/trainer-report: product hierarchy or neutral lap labels are missing ${JSON.stringify(report)}`);
  }
  await page.screenshot({
    path: resolve(screenshotDir, `${viewportName}-trainer-report.png`),
    fullPage: true,
  });
  await page.getByRole("button", { name: /^全部\s+16$/ }).click();
  const allLapsVisible = await page.locator(".session-report").evaluate((element) => element.querySelectorAll(".session-lap-list .session-lap").length);
  if (allLapsVisible !== 16) throw new Error(`${viewportName}/trainer-report: all-category filter did not restore 16 laps`);
  await page.evaluate(() => {
    switchPlanTab("coach");
    const host = document.getElementById("coach-review-content");
    if (host) host.innerHTML = renderCoachReviewPanel();
  });
  await page.waitForSelector("#plan-tab-coach .coach-menu-card", { timeout: 5000 });
  const coachStructure = await page.locator("#plan-tab-coach").evaluate((element) => ({
    showsUpcomingPlan: element.textContent.includes("下週安排已依正式課表準備"),
    hasHistoricalReview: element.textContent.includes("查看歷史教練週報"),
    detailsCount: element.querySelectorAll("details").length,
    openDetailsCount: element.querySelectorAll("details[open]").length,
    hasInvalidNumber: element.textContent.includes("NaN"),
  }));
  if (!coachStructure.showsUpcomingPlan || !coachStructure.hasHistoricalReview || !coachStructure.detailsCount || coachStructure.openDetailsCount || coachStructure.hasInvalidNumber) {
    throw new Error(`${viewportName}/trainer-coach: stale coach review did not select a compact upcoming plan ${JSON.stringify(coachStructure)}`);
  }
  const pendingCoachReview = await page.evaluate(() => {
    const priorWeek = currentWeek;
    const currentPlanIndex = appData.plan.findIndex((week) => (week.days || []).some((day) => day.dateStr === todayStr()));
    if (currentPlanIndex >= 0) currentWeek = currentPlanIndex + 1;
    const upcomingWeek = appData.plan?.[currentWeek];
    coachReviewData = {
      updatedAt: todayStr(),
      nextWeek: {
        weekStart: upcomingWeek?.days?.[0]?.dateStr,
        label: `${upcomingWeek?.days?.[0]?.dateStr} 週`,
        menu: [{ day: "週一", plan: "恢復跑 5 km" }],
      },
    };
    const host = document.getElementById("coach-review-content");
    if (host) host.innerHTML = renderCoachReviewPanel();
    const text = host?.textContent || "";
    currentWeek = priorWeek;
    return text;
  });
  if (!pendingCoachReview.includes("下週教練調整後的課程") || !pendingCoachReview.includes("恢復跑 5 km") || pendingCoachReview.includes("查看歷史教練週報")) {
    throw new Error(`${viewportName}/trainer-coach: a future next-week review was not shown as a directly usable plan ${pendingCoachReview}`);
  }
  await page.locator("#plan-tab-coach details").first().evaluate((element) => { element.open = true; });
  await assertNoHorizontalOverflow(page, `${viewportName}/trainer-coach`);
  await page.screenshot({ path: resolve(screenshotDir, `${viewportName}-trainer-coach-structure.png`), fullPage: true });
  const recalibration = await page.evaluate(() => {
    appData.profile.easyPaceSec = 480;
    appData.profile.tempoPaceSec = 390;
    appData.profile.intervalPaceSec = 360;
    appData.profile.maxHr = 190;
    appData.recalibratedFor = null;
    coachReviewData = {
      updatedAt: "2026-07-15",
      analyticsUpdatedAt: "2026-07-15",
      analyticsRuns: [
        { activityId: 8101, date: "2026-07-13", km: 6, pace: "7:05", hr: 145 },
        { activityId: 8102, date: "2026-07-14", km: 6, pace: "7:00", hr: 146 },
        { activityId: 8103, date: "2026-07-15", km: 6, pace: "7:02", hr: 144 },
      ],
    };
    const first = autoRecalibratePlan();
    const calibratedEasyPace = appData.profile.easyPaceSec;
    const repeated = autoRecalibratePlan();
    return { first, calibratedEasyPace, repeated, analysisSnapshots: appData.garminAnalysisHistory || [] };
  });
  if (!(recalibration.first?.easyDelta < 0) || recalibration.calibratedEasyPace >= 480 || recalibration.repeated !== null || !recalibration.analysisSnapshots.length || !recalibration.analysisSnapshots.at(-1)?.summary) {
    throw new Error(`${viewportName}/trainer-recalibration: stable safe Garmin runs did not produce one bounded future pace calibration ${JSON.stringify(recalibration)}`);
  }
  const loadDecision = await page.evaluate(() => garminLoadDecision([
    { trainingLoad: 50, aerobicTe: 2.8, anaerobicTe: 0.5 },
    { trainingLoad: 55, aerobicTe: 3.0, anaerobicTe: 0.7 },
    { trainingLoad: 52, aerobicTe: 2.9, anaerobicTe: 0.6 },
    { trainingLoad: 85, aerobicTe: 4.2, anaerobicTe: 2.7 },
    { trainingLoad: 90, aerobicTe: 4.1, anaerobicTe: 2.8 },
    { trainingLoad: 88, aerobicTe: 4.3, anaerobicTe: 2.6 },
  ]));
  if (loadDecision.factor !== 0.8 || loadDecision.status !== "reduce" || !loadDecision.message.includes("下週跑量下修 20%")) {
    throw new Error(`${viewportName}/trainer-load-decision: sustained Garmin load was not linked to a bounded future-week reduction ${JSON.stringify(loadDecision)}`);
  }
  const safeguards = await page.evaluate(() => {
    const protectedDays = applyCourseSpacingGuard([
      { dow: 1, dateStr: "2026-07-20", type: "long", km: 10 },
      { dow: 2, dateStr: "2026-07-21", type: "tempo", km: 6, focus: "tempo" },
    ], appData.profile, false, false, false, "2026-07-15", 3, "build");
    const coachWeek = { days: [{ dateStr: "2026-07-20", dow: 1 }] };
    coachReviewData = { nextWeek: { weekStart: "2026-07-20", menu: [{ plan: "節奏跑 6 km" }] } };
    const safetyDay = applyCoachPlanOverride({ dow: 1, dateStr: "2026-07-20", type: "easy", task: "恢復跑", safetyOverride: true }, coachWeek);
    return {
      heatSafe: isCalibrationSafeRun({ date: "2026-07-15", km: 6, elevationGainM: 0, temperatureC: 35 }),
      protectedType: protectedDays[1]?.type,
      protection: protectedDays[1]?.recoveryProtection,
      coachLocked: coachPrescriptionLocksWeek(coachWeek),
      safetyOverride: Boolean(safetyDay.coachSafetyOverride),
    };
  });
  if (safeguards.heatSafe || safeguards.protectedType !== "easy" || !safeguards.protection || !safeguards.coachLocked || !safeguards.safetyOverride) {
    throw new Error(`${viewportName}/trainer-safeguards: environmental, recovery, or coach-priority rule failed ${JSON.stringify(safeguards)}`);
  }
  const planningScenarios = await page.evaluate(() => {
    const profile = (overrides = {}) => ({
      generatedAt: "2026-07-13",
      targetDate: "2026-10-18",
      goal: "half",
      fitnessLevel: "intermediate",
      weeklyKm: 24,
      maxLongRunMins: 120,
      easyPaceSec: 480,
      tempoPaceSec: 420,
      intervalPaceSec: 390,
      dayState: [0, 1, 0, 1, 0, 0, 2],
      injuries: ["none"],
      ...overrides,
    });
    const highLoad = new Set(["tempo", "interval", "long"]);
    const hasAdjacentHighLoad = (plan) => plan.some((week) => week.days.some((day, index, days) => index > 0 && highLoad.has(day.type) && highLoad.has(days[index - 1].type)));
    const hasClearPurpose = (plan) => plan.every((week) => week.days.every((day) => day.type === "rest" || (day.steps || []).some((step) => step.title === "主課" && String(step.detail || "").length >= 12)));
    const hasCappedProgression = (plan) => plan.every((week, index) => index === 0 || week.isTaper || week.targetKm <= plan[index - 1].targetKm * 1.1 + 0.1);

    coachReviewData = { analyticsRuns: [] };
    appData.checkins = [];
    const beginner = buildPlan(profile({ fitnessLevel: "beginner", weeklyKm: 8 }));
    const general = buildPlan(profile());
    const marathon = buildPlan(profile({ goal: "full" }));
    appData.checkins = [{ date: todayStr(), fatigue: 4, result: "降載恢復", painConcern: false }];
    const fatigued = buildPlan(profile());
    appData.checkins = [];
    const raceReady = buildPlan(profile({ targetDate: "2026-08-02", weeklyKm: 30 }));

    return {
      beginnerNoEarlyQuality: beginner.slice(0, 4).every((week) => week.days.every((day) => !["tempo", "interval"].includes(day.type))),
      generalHasQuality: general.slice(2).some((week) => week.days.some((day) => ["tempo", "interval"].includes(day.type))),
      goalChangesLongRun: (marathon[0]?.days.find((day) => day.type === "long")?.km || 0) > (general[0]?.days.find((day) => day.type === "long")?.km || 0),
      noAdjacentHighLoad: !hasAdjacentHighLoad(general),
      progressionCapped: hasCappedProgression(general),
      fatigueDeload: Boolean(fatigued[0]?.isDeload) && fatigued[0]?.days.every((day) => !["tempo", "interval"].includes(day.type)) && Boolean(fatigued[0]?.planningNote),
      raceHasTaper: Boolean(raceReady.at(-1)?.isTaper) && raceReady.at(-1)?.targetKm < raceReady[0]?.targetKm,
      purposeClear: hasClearPurpose(general),
    };
  });
  if (!Object.values(planningScenarios).every(Boolean)) {
    throw new Error(`${viewportName}/trainer-planning-scenarios: coach planning acceptance failed ${JSON.stringify(planningScenarios)}`);
  }
  console.log(`OK ${viewportName}/trainer report layout`);
}

async function assertRegistrationHero(page, viewportName) {
  await page.goto(`${baseUrl.replace("/site/", "/")}local/registration/registration.html`, { waitUntil: "networkidle" });
  await page.waitForSelector(".registration-hero", { timeout: 5000 });
  await assertNoHorizontalOverflow(page, `${viewportName}/registration-hero`);
  await assertTextFitsControls(page, `${viewportName}/registration-hero`);
  const hero = await page.locator(".registration-hero").evaluate((element) => {
    const heading = element.querySelector("h1");
    const actions = element.querySelector(".registration-hero-actions");
    return {
      hasStoragePath: (element.textContent || "").includes("runner/報名管理/報名管理資料.json"),
      hasLocalOnlyContext: (element.textContent || "").includes("資料只留在這台電腦")
        && (element.textContent || "").includes("runner/報名管理/報名管理資料.json"),
      hasBackupTitle: (actions?.textContent || "").includes("備份與還原"),
      hasExport: Boolean(actions?.querySelector("#export-data")),
      hasImport: Boolean(actions?.querySelector("#import-data")),
      titleSize: heading ? Math.round(parseFloat(window.getComputedStyle(heading).fontSize)) : 0,
      heroHeight: Math.round(element.getBoundingClientRect().height),
    };
  });
  const heightLimit = viewportName === "mobile" ? 520 : 330;
  if (!hero.hasStoragePath || !hero.hasLocalOnlyContext || !hero.hasBackupTitle || !hero.hasExport || !hero.hasImport || hero.titleSize > 60 || hero.heroHeight > heightLimit) {
    throw new Error(`${viewportName}/registration-hero: privacy hierarchy or compact actions failed ${JSON.stringify(hero)}`);
  }
  await page.screenshot({ path: resolve(screenshotDir, `${viewportName}-registration-hero.png`), fullPage: true });
  console.log(`OK ${viewportName}/registration hero layout`);
}

const { chromium } = await loadPlaywright();
await mkdir(screenshotDir, { recursive: true });

const server = startServer();
let browser;

try {
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true });

  for (const viewport of selectedViewports) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => fail(`${viewport.name}: page error: ${error.message}`));
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await assertTrainerReport(page, viewport.name);

    await assertRegistrationHero(page, viewport.name);

    await page.goto(baseUrl, { waitUntil: "networkidle" });

    if (process.env.UI_LAYOUT_TRAINER_ONLY !== "1") {
      for (const panel of panels) {
        await assertPanel(page, panel, viewport.name);
      }
    }

    await page.close();
  }
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  server.kill();
}
