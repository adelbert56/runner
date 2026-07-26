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
  const restDayForecast = await page.evaluate(() => {
    eval(`trainerWeather = { "2026-07-24": { tmax: 30.8, rain: 50, morningRain: 20, eveningRain: 40 } }`);
    appData.plan[0].days.push({
      dateStr: "2026-07-24",
      dow: 5,
      type: "rest",
      focus: "rest",
      task: "休息＋居家肌力",
      status: "upcoming",
      steps: [],
    });
    renderPlanView();
    showView("plan");
    switchPlanTab("week");
    return document.querySelector("#plan-tab-week .day-card.type-rest .wx-chip")?.textContent?.trim() || "";
  });
  if (!restDayForecast.includes("預報 31°C") || !restDayForecast.includes("清晨 20%")) {
    throw new Error(`${viewportName}/trainer-rest-day-weather: forecast is missing from rest-day course card: ${restDayForecast}`);
  }
  await page.evaluate((review) => {
    // This is a deterministic local visual fixture; it never writes to the product data files.
    eval(`coachReviewData = ${JSON.stringify(review)}`);
    renderPlanView();
    showView("plan");
    switchPlanTab("week");
  }, trainerReviewSample);
  await page.waitForSelector(".course-decision-panel", { timeout: 5000 });
  const courseDecision = await page.locator(".course-decision-panel").evaluate((element) => ({
    hasFocus: Boolean(element.querySelector(".weekly-coach-insight")) || Boolean(element.querySelector(".course-decision-context")),
    hasDuplicateFocus: Boolean(element.querySelector(".weekly-coach-insight") && element.querySelector(".course-decision-context")),
    hasActionableTitle: element.textContent.includes("本週執行重點") || element.textContent.includes("這週怎麼跑，先看這裡"),
    hasVisibleGuidance: element.textContent.trim().length > 40,
  }));
  if (!courseDecision.hasFocus || courseDecision.hasDuplicateFocus || !courseDecision.hasActionableTitle || !courseDecision.hasVisibleGuidance) {
    throw new Error(`${viewportName}/trainer-course-decision: visible coaching brief is incomplete ${JSON.stringify(courseDecision)}`);
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    const toolbar = document.querySelector(".plan-toolbar");
    const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0;
    const targetTop = (toolbar?.getBoundingClientRect().top || 0) + window.scrollY - headerBottom - 24;
    window.scrollTo(0, Math.max(0, targetTop));
    window.dispatchEvent(new Event("scroll"));
  });
  const stickyToolbar = await page.locator(".plan-toolbar").evaluate((element) => {
    const header = document.querySelector(".site-header");
    const toolbarRect = element.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      toolbarTop: toolbarRect.top,
      headerBottom: headerRect?.bottom || 0,
      isVisible: toolbarRect.bottom > 0 && toolbarRect.top < window.innerHeight,
    };
  });
  const toolbarClearsHeader = stickyToolbar.toolbarTop >= stickyToolbar.headerBottom + 6;
  const toolbarNeedsPin = stickyToolbar.toolbarTop <= stickyToolbar.headerBottom + 12;
  if (stickyToolbar.isVisible && (!toolbarClearsHeader || (toolbarNeedsPin && stickyToolbar.position !== "fixed"))) {
    throw new Error(`${viewportName}/trainer-toolbar: sticky workspace navigation is obscured or unavailable ${JSON.stringify(stickyToolbar)}`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const weekDecisionOwnership = await page.locator("#plan-tab-week").evaluate((element) => ({
    hasLegacyCoachLetter: element.textContent.includes("本週教練信"),
    hasLegacyGuidance: element.textContent.includes("教練指引"),
    decisionPanels: element.querySelectorAll(".course-decision-panel").length,
  }));
  if (weekDecisionOwnership.hasLegacyCoachLetter || weekDecisionOwnership.hasLegacyGuidance || weekDecisionOwnership.decisionPanels !== 1) {
    throw new Error(`${viewportName}/trainer-course-decision: weekly decision ownership is duplicated ${JSON.stringify(weekDecisionOwnership)}`);
  }
  await assertNoHorizontalOverflow(page, `${viewportName}/trainer-course-decision`);
  await page.screenshot({
    path: resolve(screenshotDir, `${viewportName}-trainer-decision-summary.png`),
    fullPage: true,
  });
  await page.evaluate(() => {
    switchPlanTab("coach");
    const host = document.getElementById("coach-review-content");
    if (host) host.innerHTML = renderCoachReviewPanel();
  });
  const coachWorkspaceReady = await page.locator("#coach-review-content").evaluate((element) => ({
    hasWorkspace: Boolean(element.querySelector(".coach-decision-workspace")),
    text: element.textContent.trim().slice(0, 240),
  }));
  if (!coachWorkspaceReady.hasWorkspace) {
    throw new Error(`${viewportName}/trainer-coach-decision: shared workspace was not rendered ${JSON.stringify(coachWorkspaceReady)}`);
  }
  const coachDecisionOwnership = await page.locator("#plan-tab-coach").evaluate((element) => ({
    hasSharedDecision: Boolean(element.querySelector(".coach-decision-workspace")),
    hasEvidence: Boolean(element.querySelector(".coach-evidence")),
    hasLegacyMenu: element.textContent.includes("下週教練菜單") || Boolean(element.querySelector(".coach-menu-card")),
    hasWeekLink: element.textContent.includes("查看本週正式課表"),
  }));
  if (!coachDecisionOwnership.hasSharedDecision || !coachDecisionOwnership.hasEvidence || coachDecisionOwnership.hasLegacyMenu || !coachDecisionOwnership.hasWeekLink) {
    throw new Error(`${viewportName}/trainer-coach-decision: coach ownership is incomplete ${JSON.stringify(coachDecisionOwnership)}`);
  }
  await assertNoHorizontalOverflow(page, `${viewportName}/trainer-coach-decision`);
  await page.screenshot({
    path: resolve(screenshotDir, `${viewportName}-trainer-coach-decision.png`),
    fullPage: true,
  });
  await page.evaluate(() => {
    switchPlanTab("progress");
    switchProgressPanel("analysis");
  });
  await page.waitForSelector(".session-report", { timeout: 5000 });
  await assertNoHorizontalOverflow(page, `${viewportName}/trainer-report`);
  const analysisContext = await page.locator("#progress-panel-analysis").evaluate((element) => ({
    hasDuplicatedDecision: element.textContent.includes("自動訓練決策"),
    hasLongestRun: element.textContent.includes("近四週最長跑"),
  }));
  if (analysisContext.hasDuplicatedDecision || !analysisContext.hasLongestRun) {
    throw new Error(`${viewportName}/trainer-report: analysis must keep long-term context without duplicating the week decision ${JSON.stringify(analysisContext)}`);
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
      coachReviewData.analyticsRuns = planned.map((day, index) => ({ activityId: `early-submit-${index}`, date: day.dateStr, km: day.km, pace: "6:00", elevationGainM: 120 }));
      coachReviewData.autopilot = { status: "ready", decision: "deload", label: "自動降量", volumeFactor: 0.85, qualityMode: "reduce" };
      openEarlyCoachPlanning();
      CHECKIN_QUESTIONS.slice(1).forEach((_, index) => { document.getElementById(`early-check-${index + 1}`).checked = true; });
      document.getElementById("early-fatigue").value = "3";
      document.getElementById("early-note").value = "本次長跑有加入上坡跑，所以比較辛苦，有氧耐力還不夠需要多練，跑到後面都沒力了";
      submitEarlyCoachPlanning();
      const checkin = appData.checkins.find((item) => item.weekNum === currentWeek);
      if (checkin) checkin.provisional = false;
      openEarlyCoachPlanning();
      CHECKIN_QUESTIONS.slice(1).forEach((_, index) => { document.getElementById(`early-check-${index + 1}`).checked = true; });
      document.getElementById("early-fatigue").value = "3";
      submitEarlyCoachPlanning();
      const hasQuality = nextWeek.days.some((day) => ["tempo", "interval"].includes(day.type));
      const coachTargetKm = Number((String(coachReviewData.nextWeek.targetKm).match(/\d+(?:\.\d+)?/) || [])[0]);
      const automaticTerrainSignal = classifyEarlyFeedback("長跑後段掉速、感覺沒力", { elevationGainM: 120, elevationPerKm: 9.4 });
      return { recorded: Boolean(checkin), earlyTrigger: checkin?.earlyTrigger === true, hasSchedulingDecision: typeof checkin?.adjustment === "string" && checkin.adjustment.includes("85%"), feedbackRecorded: checkin?.note === "本次長跑有加入上坡跑，所以比較辛苦，有氧耐力還不夠需要多練，跑到後面都沒力了", feedbackTerrainMeasured: checkin?.feedbackTerrainEvidence?.elevationGainM === 120, automaticTerrainDetected: automaticTerrainSignal.some((signal) => signal.includes("Garmin +120 m")), feedbackResponded: typeof checkin?.coachFeedbackResponse === "string" && checkin.coachFeedbackResponse.includes("Garmin +120 m") && checkin.coachFeedbackResponse.includes("長跑後段失力") && checkin.coachFeedbackResponse.includes("平坦路線"), nextWeekExists: Boolean(appData.plan[currentWeek]), coachScheduleApplied: checkin?.coachScheduleApplied === true, nextWeekAdjustmentApplied: checkin?.nextWeekAdjustmentApplied === true, qualityReduced: !hasQuality || nextWeek.days.some((day) => day.coachPlan?.qualityMode === "reduce"), repeatSubmissionTitle: document.getElementById("modal-title")?.textContent?.trim() };
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
  if (!earlyPlanningSubmission.recorded || !earlyPlanningSubmission.earlyTrigger || !earlyPlanningSubmission.hasSchedulingDecision || !earlyPlanningSubmission.feedbackRecorded || !earlyPlanningSubmission.feedbackTerrainMeasured || !earlyPlanningSubmission.automaticTerrainDetected || !earlyPlanningSubmission.feedbackResponded || !earlyPlanningSubmission.nextWeekExists || earlyPlanningSubmission.nextWeekAdjustmentApplied || !earlyPlanningSubmission.qualityReduced || earlyPlanningSubmission.repeatSubmissionTitle !== "下週已安排") {
    throw new Error(`${viewportName}/trainer-early-planning-submit: completed Garmin sessions did not complete the next-week scheduling flow ${JSON.stringify(earlyPlanningSubmission)}`);
  }
  const intervalCompletionTarget = await page.evaluate(() => plannedMainTargetKm({
    steps: [{ title: "主課", dose: "4×400m", detail: "組間 200m 慢跑恢復" }],
    km: 6.4,
    type: "interval"
  }));
  if (intervalCompletionTarget !== 1.6) {
    throw new Error(`${viewportName}/trainer-interval-completion: Garmin completion must use interval fast-work distance, received ${intervalCompletionTarget}`);
  }
  const intervalCompletionCredit = await page.evaluate(() => {
    const day = { type: "interval", km: 6.4, steps: [{ title: "主課", dose: "4×400m", detail: "組間 200m 慢跑恢復" }] };
    return {
      targetKm: plannedCompletionTargetKm(day),
      partial: activityCompletesDay(day, { source: "garmin", actualKm: 6.4, qualityEligible: true, qualityKm: 0.8 }),
      complete: activityCompletesDay(day, { source: "garmin", actualKm: 6.4, qualityEligible: true, qualityKm: 1.0 })
    };
  });
  if (intervalCompletionCredit.targetKm !== 1.6 || intervalCompletionCredit.partial || !intervalCompletionCredit.complete) {
    throw new Error(`${viewportName}/trainer-interval-credit: weekly completion must use the same quality-work target ${JSON.stringify(intervalCompletionCredit)}`);
  }
  const intervalWeeklyGate = await page.evaluate(() => {
    const previousData = cloneTrainingValue(appData);
    const previousWeek = currentWeek;
    const previousReview = cloneTrainingValue(coachReviewData);
    const day = { dateStr: "2026-07-20", dow: 1, type: "interval", km: 6.4, status: "planned", steps: [{ title: "主課", dose: "4×400m", detail: "組間 200m 慢跑恢復" }] };
    try {
      currentWeek = 1;
      appData.plan = [{ weekNum: 1, days: [day] }];
      appData.log = [];
      coachReviewData = { analyticsRuns: [{ activityId: "partial-interval", date: day.dateStr, km: 6.4, pace: "5:30", qualityEligible: true, qualityKm: 0.8 }] };
      const partial = weeklyCheckinTiming();
      coachReviewData.analyticsRuns[0].qualityKm = 1.0;
      const complete = weeklyCheckinTiming();
      return { partialReady: partial.ready, partialCompleted: partial.completed, completeReady: complete.ready, completeCompleted: complete.completed };
    } finally {
      appData = previousData;
      currentWeek = previousWeek;
      coachReviewData = previousReview;
      saveData(appData);
    }
  });
  if (intervalWeeklyGate.partialReady || intervalWeeklyGate.partialCompleted !== 0 || !intervalWeeklyGate.completeReady || intervalWeeklyGate.completeCompleted !== 1) {
    throw new Error(`${viewportName}/trainer-interval-weekly-gate: weekly review did not enforce quality-work completion ${JSON.stringify(intervalWeeklyGate)}`);
  }
  const coachingPrinciples = await page.evaluate(() => {
    const profile = {
      generatedAt: "2026-07-06",
      targetDate: "2026-12-06",
      targetTime: "02:00:00",
      racePaceSec: 340,
      easyPaceSec: 500,
      weeklyKm: 28,
      maxLongRunMins: 150,
      goal: "half",
      fitnessLevel: "intermediate",
      dayState: [0, 1, 1, 0, 1, 0, 2],
      injuries: ["none"]
    };
    const plan = buildPlan(profile);
    const runningDows = [1, 2, 4, 6];
    const summaries = plan.map((week) => {
      const running = week.days.filter((day) => day.type !== "rest");
      const quality = running.filter((day) => ["tempo", "interval"].includes(day.type));
      const long = running.filter((day) => day.type === "long");
      return {
        weekNum: week.weekNum,
        isDeload: Boolean(week.isDeload),
        dows: running.map((day) => day.dow).sort((a, b) => a - b),
        longDows: long.map((day) => day.dow),
        qualityDows: quality.map((day) => day.dow),
        plannedKm: weekPlannedKm(week),
        courses: running.map((day) => [day.dow, day.type, day.km])
      };
    });
    return {
      weeks: summaries.length,
      fixedDays: summaries.every((week) => JSON.stringify(week.dows) === JSON.stringify(runningDows)),
      saturdayLong: summaries.every((week) => JSON.stringify(week.longDows) === JSON.stringify([6])),
      deloadNoQuality: summaries.filter((week) => week.isDeload).every((week) => week.qualityDows.length === 0),
      oneQualityMax: summaries.every((week) => week.qualityDows.length <= 1),
      qualitySpacing: summaries.every((week) => week.qualityDows.every((dow) => Math.abs(dow - 6) >= 2)),
      deloadVolume: summaries.filter((week) => week.isDeload).every((week) => {
        const prior = summaries[week.weekNum - 2];
        return !prior || week.plannedKm < prior.plannedKm;
      }),
      summaries
    };
  });
  if (coachingPrinciples.weeks < 8 || !coachingPrinciples.fixedDays || !coachingPrinciples.saturdayLong || !coachingPrinciples.deloadNoQuality || !coachingPrinciples.oneQualityMax || !coachingPrinciples.qualitySpacing || !coachingPrinciples.deloadVolume) {
    throw new Error(`${viewportName}/trainer-coaching-principles: cycle violated fixed-day, load, or spacing rules ${JSON.stringify(coachingPrinciples)}`);
  }
  const directCoachSchedule = await page.evaluate(() => {
    const previousData = cloneTrainingValue(appData);
    const previousWeek = currentWeek;
    const previousReview = cloneTrainingValue(coachReviewData);
    try {
      const profile = { ...appData.profile, generatedAt: "2026-07-06", dayState: [0, 1, 1, 0, 1, 0, 2], injuries: ["none"] };
      const trainDows = [1, 2, 4, 6];
      appData.profile = profile;
      appData.plan = [1, 2, 3, 4, 5].map((weekNum) => ({
        weekNum,
        phase: "build",
        phaseLabel: "建立期",
        targetKm: 30,
        days: buildWeekDays(profile, trainDows, 6, [1, 2, 4], 30, false, false, false, weekNum, new Date("2026-07-06T00:00:00"), "build")
      }));
      currentWeek = 3;
      coachReviewData = {
        zones: { maxHr: 187, recoveryLabel: "Garmin Z1", easyLabel: "Garmin Z2", easyMax: 150, steady: "150–157", tempo: "159–166", interval: "168–178" },
        schedule: { trainingDows: [1, 2, 4, 6], longDow: 6 },
        periodization: [
          { phase: "降載", start: "2026-07-27", weeks: 1, km: "26–28", focus: "長跑 10–11 km @E，無硬課；確認左腳、疲勞歸零。" },
          { phase: "基礎建量", start: "2026-08-03", weeks: 1, km: "30–32", focus: "長跑 12 km @E；恢復穩定後保留一堂品質課。" }
        ]
      };
      appData.checkins = [{ weekNum: 3, earlyTrigger: true, coachScheduleApplied: true, earlyDecision: { factor: 0.85 }, result: "維持", note: "腳感偏緊，但沒有疼痛" }];
      const adaptation = runCoachAdaptation("weekly-checkin", { factor: 0.85, removeQuality: false, qualityMode: "reduce", formalPrescriptionPending: true });
      const applied = restorePendingEarlyCoachSchedule();
      const week4 = appData.plan[3];
      const buildApplied = applyCoachPhaseScheduleForWeek(5, { record: false, constraints: { factor: 0.85, removeQuality: false, qualityMode: "reduce" } });
      const week5 = appData.plan[4];
      week4.days.filter((day) => day.focus === "easy").forEach((day) => {
        day.focus = "recovery";
        day.pace = "配速 8:17/km（Garmin Z2 校正）";
        day.hrTarget = "HR ≤140";
        day.steps = day.steps.map((step) => step.title === "主課" ? { ...step, detail: "舊版 Z2 配速恢復跑" } : step);
      });
      const deloadStructureAligned = alignCoachDeloadStructure();
      appData.planChangeHistory.push(
        { date: "2026-07-25", source: "checkin", title: "Garmin 教練建議：下週降量並降階品質課", changes: ["第 4 週：21.8 → 18.7 km"] },
        { date: "2026-07-25", source: "coach", title: "教練下週處方已提前排入正式課表：長跑重建", changes: ["第 4 週：21.8 → 18.9 km"] },
        { date: "2026-07-25", source: "coach", title: "第 3 週完成後，教練處方已排入第 4 週", changes: ["第 4 週：21.8 → 27.2 km"] }
      );
      const historyReconciled = restorePendingEarlyCoachSchedule();
      const coachWorkspace = renderCoachDecisionWorkspace(appData.plan);
      const coachBrief = renderCoachAdviceNote("本週維持穩定執行。下週依正式處方安排。", { earlyFeedback: earlyFeedbackForCoachBrief(3) });
      return {
        applied,
        noIntermediateAdjustment: !adaptation.nextWeekAdjustment,
        historyReconciled,
        targetKm: week4.targetKm,
        plannedKm: weekPlannedKm(week4),
        week4Start: week4.days[0]?.dateStr,
        deloadStructureAligned,
        courses: week4.days.filter((day) => day.type !== "rest").map((day) => ({ dow: day.dow, focus: day.focus, task: day.task, km: day.km, pace: day.pace, hrTarget: day.hrTarget, mainDetail: day.steps.find((step) => step.title === "主課")?.detail, source: day.coachPlan?.source, version: day.coachPlan?.version })).sort((left, right) => left.dow - right.dow),
        note: week4.planningNote,
        buildApplied,
        buildTargetKm: week5.targetKm,
        buildCourses: week5.days.filter((day) => day.type !== "rest").map((day) => ({ type: day.type, focus: day.focus, km: day.km, task: day.task, qualityMode: day.coachPlan?.qualityMode, source: day.coachPlan?.source })),
        coachWorkspace,
        coachBrief,
        history: appData.planChangeHistory,
        timeline: renderPlanChangeTimeline()
      };
    } finally {
      appData = previousData;
      currentWeek = previousWeek;
      coachReviewData = previousReview;
      saveData(appData);
    }
  });
  const deloadEasyCourses = directCoachSchedule.courses.filter((day) => day.focus === "easy");
  if (!directCoachSchedule.applied || !directCoachSchedule.noIntermediateAdjustment || !directCoachSchedule.deloadStructureAligned || directCoachSchedule.week4Start !== "2026-07-27" || directCoachSchedule.targetKm !== 26 || directCoachSchedule.plannedKm !== 25.9 || JSON.stringify(directCoachSchedule.courses.map((day) => [day.dow, day.km])) !== JSON.stringify([[1, 5.3], [2, 5.3], [4, 5.3], [6, 10]]) || !directCoachSchedule.courses.every((day) => day.source === "coach-periodization") || directCoachSchedule.courses.some((day) => day.task.includes("教練")) || deloadEasyCourses.length !== 3 || !deloadEasyCourses.every((day) => day.pace.startsWith("配速 ") && day.hrTarget === "HR ≤150（Garmin Z2）" && !day.mainDetail?.includes("恢復跑")) || !directCoachSchedule.note.includes("第 3 週") || !directCoachSchedule.note.includes("第 4 週")) {
    throw new Error(`${viewportName}/trainer-direct-coach-schedule: week 3 completion did not write the aligned coach prescription into week 4 ${JSON.stringify(directCoachSchedule)}`);
  }
  const buildQualityCourses = directCoachSchedule.buildCourses.filter((day) => ["tempo", "interval"].includes(day.type));
  if (!directCoachSchedule.buildApplied || directCoachSchedule.buildTargetKm !== 25.5 || buildQualityCourses.length !== 1 || buildQualityCourses[0].qualityMode !== "reduce" || !buildQualityCourses[0].task.includes("原處方前 2/3") || !directCoachSchedule.buildCourses.every((day) => day.source === "coach-periodization")) {
    throw new Error(`${viewportName}/trainer-coach-build-constraints: a non-deload coach prescription did not keep one reduced quality course under Garmin constraints ${JSON.stringify(directCoachSchedule)}`);
  }
  const normalWeeklySchedule = await page.evaluate(() => {
    const previousData = cloneTrainingValue(appData);
    const previousWeek = currentWeek;
    const previousReview = cloneTrainingValue(coachReviewData);
    const originalJump = window.jumpToPhaseWeek;
    const originalTab = window.switchPlanTab;
    const originalOutcome = window.showCheckinOutcome;
    try {
      const profile = { ...appData.profile, generatedAt: "2026-07-06", dayState: [0, 1, 1, 0, 1, 0, 2], injuries: ["none"] };
      const trainDows = [1, 2, 4, 6];
      appData.profile = profile;
      appData.plan = [1, 2, 3, 4].map((weekNum) => ({
        weekNum,
        phase: "build",
        phaseLabel: "建立期",
        targetKm: 30,
        days: buildWeekDays(profile, trainDows, 6, [1, 2, 4], 30, false, false, false, weekNum, new Date("2026-07-06T00:00:00"), "build")
      }));
      currentWeek = 3;
      const completedWeek = appData.plan[2];
      appData.log = completedWeek.days.filter((day) => day.type !== "rest").map((day) => ({ date: day.dateStr, km: day.km }));
      appData.checkins = [];
      coachReviewData = {
        schedule: { trainingDows: [1, 2, 4, 6], longDow: 6 },
        periodization: [{ phase: "降載", start: "2026-07-27", weeks: 1, km: "26–28", focus: "長跑 10–11 km @E，無硬課。" }],
        autopilot: { status: "ready", decision: "deload", label: "自動降量", volumeFactor: 0.85, qualityMode: "reduce" },
        analyticsRuns: completedWeek.days.filter((day) => day.type !== "rest").map((day, index) => ({ activityId: `normal-${index}`, date: day.dateStr, km: day.km, elevationGainM: 120 }))
      };
      window.jumpToPhaseWeek = () => {};
      window.switchPlanTab = () => {};
      window.showCheckinOutcome = () => {};
      completeWeeklyCheckin({ answers: [true, true, true, true, true], fatigue: 1, note: "長跑後段沒力", painConcern: false });
      const checkin = appData.checkins.find((item) => item.weekNum === 3);
      const nextWeek = appData.plan[3];
      const brief = renderCoachAdviceNote("本週完成，進入下週處方。", { earlyFeedback: earlyFeedbackForCoachBrief(3) });
      const result = {
        coachScheduleApplied: checkin?.coachScheduleApplied === true,
        noGenericRewrite: !checkin?.nextWeekAdjustmentApplied,
        sourceAligned: nextWeek.days.filter((day) => day.type !== "rest").every((day) => day.coachPlan?.source === "coach-periodization"),
        terrainRead: checkin?.feedbackTerrainEvidence?.elevationGainM === 120 && checkin?.coachFeedbackResponse?.includes("Garmin +120 m") && brief.includes("跑者回饋") && brief.includes("回饋的實際處置"),
        nextTargetKm: nextWeek.targetKm
      };
      closeModal();
      return result;
    } finally {
      appData = previousData;
      currentWeek = previousWeek;
      coachReviewData = previousReview;
      window.jumpToPhaseWeek = originalJump;
      window.switchPlanTab = originalTab;
      window.showCheckinOutcome = originalOutcome;
      saveData(appData);
    }
  });
  if (!normalWeeklySchedule.coachScheduleApplied || !normalWeeklySchedule.noGenericRewrite || !normalWeeklySchedule.sourceAligned || !normalWeeklySchedule.terrainRead || normalWeeklySchedule.nextTargetKm !== 26) {
    throw new Error(`${viewportName}/trainer-normal-weekly-prescription: Sunday and early coaching did not resolve to the same formal schedule ${JSON.stringify(normalWeeklySchedule)}`);
  }
  if (!directCoachSchedule.coachWorkspace.includes("教練處方已套用") || !directCoachSchedule.coachWorkspace.includes("第 3 週完成紀錄") || !directCoachSchedule.coachWorkspace.includes("第 4 週正式課表") || !directCoachSchedule.coachWorkspace.includes("降載") || !directCoachSchedule.coachBrief.includes("跑者回饋") || !directCoachSchedule.coachBrief.includes("腳感偏緊，但沒有疼痛") || !directCoachSchedule.coachBrief.includes("局部緊繃（未明示疼痛）") || !directCoachSchedule.coachBrief.includes("回饋的實際處置") || directCoachSchedule.coachWorkspace.includes("EARLY COACH SCHEDULE")) {
    throw new Error(`${viewportName}/trainer-direct-coach-workspace: existing coach decision did not present the applied week 4 prescription ${directCoachSchedule.coachWorkspace}`);
  }
  if (!directCoachSchedule.historyReconciled || directCoachSchedule.history.filter((item) => item.changes.some((change) => change.includes("第 4 週"))).length !== 1 || !directCoachSchedule.timeline.includes("教練第 4 週處方已排入正式課表：降載") || /18\.7|18\.9|27\.2/.test(directCoachSchedule.timeline)) {
    throw new Error(`${viewportName}/trainer-direct-coach-history: conflicting intermediate week 4 changes remained visible ${JSON.stringify(directCoachSchedule)}`);
  }
  const incompleteWeekCannotSchedule = await page.evaluate(() => {
    const previousData = cloneTrainingValue(appData);
    const previousWeek = currentWeek;
    const previousReview = cloneTrainingValue(coachReviewData);
    const originalModal = window.showModal;
    const originalClose = window.closeModal;
    const originalJump = window.jumpToPhaseWeek;
    const originalTab = window.switchPlanTab;
    const originalOutcome = window.showCheckinOutcome;
    try {
      const profile = { ...appData.profile, generatedAt: "2026-07-06", dayState: [1, 1, 0, 1, 0, 0, 2], injuries: ["none"] };
      const trainDows = [0, 1, 3, 6];
      appData.profile = profile;
      appData.plan = [1, 2, 3, 4, 5].map((weekNum) => ({ weekNum, phase: "build", phaseLabel: "建立期", targetKm: 30, days: buildWeekDays(profile, trainDows, 6, [0, 1, 3], 30, false, false, false, weekNum, new Date("2026-07-06T00:00:00"), "build") }));
      appData.checkins = [];
      appData.log = [];
      currentWeek = 4;
      coachReviewData = { periodization: [{ phase: "基礎強化", start: "2026-08-10", weeks: 4, km: "32→38", focus: "長跑 14–16 km。" }] };
      window.showModal = () => {};
      window.closeModal = () => {};
      window.jumpToPhaseWeek = () => {};
      window.switchPlanTab = () => {};
      window.showCheckinOutcome = () => {};
      const beforeWeek5 = cloneTrainingValue(appData.plan[4]);
      completeWeeklyCheckin({ answers: [true, true, true, true, true], fatigue: 1, note: "", painConcern: false, earlyTrigger: true, plannedSessionCount: 4 });
      return { unchanged: JSON.stringify(beforeWeek5) === JSON.stringify(appData.plan[4]), checkinWritten: appData.checkins.some((item) => item.weekNum === 4) };
    } finally {
      appData = previousData;
      currentWeek = previousWeek;
      coachReviewData = previousReview;
      window.showModal = originalModal;
      window.closeModal = originalClose;
      window.jumpToPhaseWeek = originalJump;
      window.switchPlanTab = originalTab;
      window.showCheckinOutcome = originalOutcome;
      saveData(appData);
    }
  });
  if (!incompleteWeekCannotSchedule.unchanged || incompleteWeekCannotSchedule.checkinWritten) {
    throw new Error(`${viewportName}/trainer-incomplete-week-gate: an incomplete week was allowed to write week 5 ${JSON.stringify(incompleteWeekCannotSchedule)}`);
  }
  const deloadAssessmentHint = await page.evaluate(() => {
    const previousWeek = currentWeek;
    try {
      currentWeek = 4;
      return getAssessmentCycleHint(appData.plan);
    } finally {
      currentWeek = previousWeek;
    }
  });
  if (deloadAssessmentHint) {
    throw new Error(`${viewportName}/trainer-deload-assessment-hint: a deload week advertised an unscheduled assessment ${deloadAssessmentHint}`);
  }
  const recoveredEarlyPlanning = await page.evaluate(() => {
    const previousData = cloneTrainingValue(appData);
    const previousWeek = currentWeek;
    try {
      currentWeek = 1;
      const nextWeek = appData.plan[1];
      const originalTargetKm = nextWeek.targetKm;
      const hadQuality = nextWeek.days.some((day) => ["tempo", "interval"].includes(day.type));
      appData.checkins = [{ weekNum: 1, earlyTrigger: true, provisional: true, result: "降載恢復", adjustment: "Garmin 已判定「自動降量」：下週跑量調整為 85%，品質課降階為原處方前 2/3。", safetyNote: "Garmin 已判定「自動降量」：下週跑量調整為 85%，品質課降階為原處方前 2/3。", date: todayStr() }];
      appData.planChangeHistory = [];
      const restored = restorePendingEarlyCoachAdjustment();
      return { restored, applied: appData.checkins[0].nextWeekAdjustmentApplied === true, targetKm: nextWeek.targetKm, expectedTargetKm: Math.round(originalTargetKm * 0.85 * 10) / 10, qualityReduced: !hadQuality || nextWeek.days.some((day) => day.coachPlan?.qualityMode === "reduce") };
    } finally {
      appData = previousData;
      currentWeek = previousWeek;
      saveData(appData);
    }
  });
  if (!recoveredEarlyPlanning.restored || !recoveredEarlyPlanning.applied || recoveredEarlyPlanning.targetKm !== recoveredEarlyPlanning.expectedTargetKm || !recoveredEarlyPlanning.qualityReduced) {
    throw new Error(`${viewportName}/trainer-early-planning-recovery: stored early coaching record was not restored exactly once ${JSON.stringify(recoveredEarlyPlanning)}`);
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
    const resolved = resolveCourse({ dateStr: todayStr(), type: "tempo", focus: "tempo", task: "T 跑", pace: "5:00/km" }, buildContext(), { weekNum: 1 });
    appData.safetyHold = null;
    return { type: resolved.course.type, focus: resolved.course.focus, task: resolved.course.task, rationale: resolved.rationale };
  });
  if (safetyHold.type !== "easy" || safetyHold.focus !== "recovery" || !safetyHold.task.includes("傷痛保護模式") || !safetyHold.rationale.includes("安全保護")) {
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
  const reportDetails = page.locator(".session-report-details");
  if (!(await reportDetails.evaluate((element) => element.open))) await reportDetails.locator("summary").click();
  await page.getByRole("button", { name: /^全部\s+16$/ }).click();
  const allLapsVisible = await page.locator(".session-report").evaluate((element) => element.querySelectorAll(".session-lap-list .session-lap").length);
  if (allLapsVisible !== 16) throw new Error(`${viewportName}/trainer-report: all-category filter did not restore 16 laps`);
  await page.evaluate(() => {
    switchPlanTab("coach");
    const host = document.getElementById("coach-review-content");
    if (host) host.innerHTML = renderCoachReviewPanel();
  });
  const coachStructure = await page.locator("#plan-tab-coach").evaluate((element) => ({
    hasSharedDecision: Boolean(element.querySelector(".coach-decision-workspace")),
    hasEvidence: Boolean(element.querySelector(".coach-evidence")),
    hasSecondSchedule: Boolean(element.querySelector(".coach-menu-card")),
    hasHistoricalReview: element.textContent.includes("歷史教練週報"),
    detailsCount: element.querySelectorAll("details").length,
    openDetailsCount: element.querySelectorAll("details[open]").length,
    hasInvalidNumber: element.textContent.includes("NaN"),
  }));
  if (!coachStructure.hasSharedDecision || !coachStructure.hasEvidence || coachStructure.hasSecondSchedule || !coachStructure.hasHistoricalReview || !coachStructure.detailsCount || coachStructure.openDetailsCount < 1 || coachStructure.hasInvalidNumber) {
    throw new Error(`${viewportName}/trainer-coach: stale coach review did not remain a compact evidence surface ${JSON.stringify(coachStructure)}`);
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
    const futureReviewEvidence = host?.querySelector(".coach-evidence .coach-history")?.textContent || "";
    currentWeek = priorWeek;
    return futureReviewEvidence;
  });
  if (pendingCoachReview.includes("恢復跑 5 km") || pendingCoachReview.includes("下週教練調整後的課程")) {
    throw new Error(`${viewportName}/trainer-coach: a future next-week review was not kept as evidence ${pendingCoachReview}`);
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
  const coachWeekCalibrationLock = await page.evaluate(() => {
    const previousData = cloneTrainingValue(appData);
    const previousWeek = currentWeek;
    const previousReview = cloneTrainingValue(coachReviewData);
    try {
      const currentPlanIndex = appData.plan.findIndex((week) => (week.days || []).some((day) => day.dateStr === todayStr()));
      if (currentPlanIndex >= 0) currentWeek = currentPlanIndex + 1;
      const upcoming = appData.plan?.[currentWeek];
      if (!upcoming) return { skipped: true };
      upcoming.isDeload = false;
      upcoming.days = (upcoming.days || []).map((day) => (day.type === "rest" ? day : {
        ...day,
        status: "planned",
        coachPlan: { source: "coach-periodization", phase: "長跑重建", targetKm: upcoming.targetKm }
      }));
      const plannedBefore = upcoming.days.filter((day) => day.type !== "rest").length;
      appData.recalibratedFor = null;
      coachReviewData = {
        updatedAt: "2026-07-16",
        analyticsUpdatedAt: "2026-07-16",
        autopilot: { status: "ready", decision: "deload", volumeFactor: 0.85, qualityMode: "reduce" },
        analyticsRuns: [
          { activityId: 9101, date: "2026-07-11", km: 6, pace: "7:05", hr: 145, trainingLoad: 50, aerobicTe: 2.8, anaerobicTe: 0.5 },
          { activityId: 9102, date: "2026-07-12", km: 6, pace: "7:00", hr: 146, trainingLoad: 55, aerobicTe: 3.0, anaerobicTe: 0.7 },
          { activityId: 9103, date: "2026-07-13", km: 6, pace: "7:02", hr: 144, trainingLoad: 52, aerobicTe: 2.9, anaerobicTe: 0.6 },
          { activityId: 9104, date: "2026-07-14", km: 8, pace: "6:40", hr: 152, trainingLoad: 85, aerobicTe: 4.2, anaerobicTe: 2.7 },
          { activityId: 9105, date: "2026-07-15", km: 8, pace: "6:38", hr: 153, trainingLoad: 90, aerobicTe: 4.1, anaerobicTe: 2.8 },
          { activityId: 9106, date: "2026-07-16", km: 8, pace: "6:42", hr: 151, trainingLoad: 88, aerobicTe: 4.3, anaerobicTe: 2.6 }
        ]
      };
      const summary = autoRecalibratePlan();
      const after = appData.plan?.[currentWeek];
      const planned = (after?.days || []).filter((day) => day.type !== "rest");
      return {
        calibrated: Boolean(summary),
        forcedDeload: Boolean(summary?.forcedDeload),
        plannedBefore,
        planned: planned.length,
        coachPrescribed: planned.filter((day) => day.coachPlan?.source === "coach-periodization").length
      };
    } finally {
      appData = previousData;
      currentWeek = previousWeek;
      coachReviewData = previousReview;
      saveData(appData);
    }
  });
  if (!coachWeekCalibrationLock.skipped && (!coachWeekCalibrationLock.plannedBefore || coachWeekCalibrationLock.coachPrescribed !== coachWeekCalibrationLock.planned || coachWeekCalibrationLock.forcedDeload)) {
    throw new Error(`${viewportName}/trainer-coach-week-lock: Garmin calibration overwrote an early-scheduled coach week ${JSON.stringify(coachWeekCalibrationLock)}`);
  }
  const duplicateCopy = await page.evaluate(() => {
    const host = document.getElementById("plan-tab-week");
    const text = host?.textContent || "";
    const headingCount = (label) => text.split(label).length - 1;
    const paragraphs = [...(host?.querySelectorAll("p") || [])]
      .map((node) => node.textContent.replace(/\s+/g, "").trim())
      .filter((value) => value.length >= 24);
    const seen = new Map();
    paragraphs.forEach((value) => seen.set(value, (seen.get(value) || 0) + 1));
    return {
      focusHeadings: headingCount("本週執行重點"),
      repeatedParagraphs: [...seen.entries()].filter(([, count]) => count > 1).map(([value, count]) => `${value.slice(0, 30)}×${count}`)
    };
  });
  if (duplicateCopy.focusHeadings > 1 || duplicateCopy.repeatedParagraphs.length) {
    throw new Error(`${viewportName}/trainer-duplicate-copy: the plan view printed the same coaching copy twice ${JSON.stringify(duplicateCopy)}`);
  }
  const rejectedOptionVoice = await page.evaluate(() => {
    const answers = [true, true, true, true];
    const stable = checkinSafetyDecision({ answers, fatigue: 2, painConcern: false });
    const sore = checkinSafetyDecision({ answers, fatigue: 4, painConcern: false });
    const hurt = checkinSafetyDecision({ answers: [true, false, true, true], fatigue: 2, painConcern: true });
    return {
      stable: stable.alternative || "",
      sore: sore.alternative || "",
      hurt: hurt.alternative || "",
      soreQuotesSignal: (sore.alternative || "").includes("疲勞自評 4/5")
    };
  });
  if (!rejectedOptionVoice.stable || !rejectedOptionVoice.sore || !rejectedOptionVoice.hurt || !rejectedOptionVoice.soreQuotesSignal) {
    throw new Error(`${viewportName}/trainer-rejected-option: weekly verdicts did not say which option was turned down ${JSON.stringify(rejectedOptionVoice)}`);
  }
  const runFeel = await page.evaluate(() => {
    const previousFeedback = cloneTrainingValue(appData.runFeedback);
    const previousPlan = cloneTrainingValue(appData.plan);
    try {
      const today = todayStr();
      const shift = (days) => new Date(new Date(`${today}T00:00:00`).getTime() + days * 86400000).toISOString().slice(0, 10);
      appData.plan = [{ weekNum: 1, days: [1, 3, 5].map((offset) => ({ dateStr: shift(-offset), dow: offset, type: "easy", km: 6, status: "done" })) }];
      appData.runFeedback = {};
      const rejectsEmpty = saveRunFeedback(shift(-1), { rpe: "", note: "" });
      const clampsOutOfRange = saveRunFeedback(shift(-9), { rpe: 42, note: "腿很重" });
      [1, 3, 5].forEach((offset) => saveRunFeedback(shift(-offset), { rpe: 8, note: "" }));
      const strain = recentEasyRunStrain();
      const decision = checkinSafetyDecision({ answers: [true, true, true, true], fatigue: 2, painConcern: false });
      return {
        rejectsEmpty,
        clampedRpe: appData.runFeedback[shift(-9)]?.rpe,
        clampedNote: appData.runFeedback[shift(-9)]?.note,
        clampsOutOfRange,
        strain,
        result: decision.result,
        alternative: decision.alternative || ""
      };
    } finally {
      appData.runFeedback = previousFeedback;
      appData.plan = previousPlan;
      saveData(appData);
    }
  });
  if (runFeel.rejectsEmpty || !runFeel.clampsOutOfRange || runFeel.clampedRpe !== 0 || runFeel.clampedNote !== "腿很重" || runFeel.strain?.samples !== 3 || runFeel.strain?.avgRpe !== 8
    || !runFeel.strain?.overreaching || runFeel.result !== "維持" || !runFeel.alternative.includes("小幅推進")) {
    throw new Error(`${viewportName}/trainer-run-feel: subjective effort was not captured or did not hold back a progression ${JSON.stringify(runFeel)}`);
  }
  const mutationGate = await page.evaluate(() => {
    const today = "2026-07-20";
    const day = (extra) => ({ dateStr: "2026-07-24", dow: 5, type: "easy", km: 6, ...extra });
    return {
      doneBlocksCoach: canMutatePlanDay(day({ status: "done" }), "coach", today),
      doneAllowsSafety: canMutatePlanDay(day({ status: "done" }), "safety", today),
      pastBlocksAlign: canMutatePlanDay(day({ dateStr: "2026-07-18" }), "align", today),
      makeupBlocksCalibration: canMutatePlanDay(day({ isMakeup: true }), "calibration", today),
      raceBlocksCalibration: canMutatePlanDay(day({ raceReplacement: "race" }), "calibration", today),
      raceAllowsRace: canMutatePlanDay(day({ raceReplacement: "race" }), "race", today),
      recoveryBlocksAlign: canMutatePlanDay(day({ recoveryProtection: "本週評估已降階" }), "align", today),
      recoveryAllowsCoach: canMutatePlanDay(day({ recoveryProtection: "本週評估已降階" }), "coach", today),
      plainAllowsCalibration: canMutatePlanDay(day(), "calibration", today),
      pastWeekCode: planWeekLockCode({ weekNum: Math.max(1, currentWeek - 1), days: [] }, "calibration"),
      coachWeekBlocksCalibration: planWeekLockCode({ weekNum: currentWeek + 5, days: [{ dateStr: "2026-09-01", type: "easy", coachPlan: { source: "coach-periodization" } }] }, "calibration"),
      coachWeekAllowsCoach: planWeekLockCode({ weekNum: currentWeek + 5, days: [{ dateStr: "2026-09-01", type: "easy", coachPlan: { source: "coach-periodization" } }] }, "coach")
    };
  });
  if (mutationGate.doneBlocksCoach || !mutationGate.doneAllowsSafety || mutationGate.pastBlocksAlign
    || mutationGate.makeupBlocksCalibration || mutationGate.raceBlocksCalibration || !mutationGate.raceAllowsRace
    || mutationGate.recoveryBlocksAlign || !mutationGate.recoveryAllowsCoach || !mutationGate.plainAllowsCalibration
    || mutationGate.pastWeekCode !== "past-week" || mutationGate.coachWeekBlocksCalibration !== "coach-prescription"
    || mutationGate.coachWeekAllowsCoach !== "") {
    throw new Error(`${viewportName}/trainer-mutation-gate: plan write permissions did not follow one source precedence ${JSON.stringify(mutationGate)}`);
  }
  const evidenceVoice = await page.evaluate(() => {
    const previousData = cloneTrainingValue(appData);
    const previousWeek = currentWeek;
    const previousReview = cloneTrainingValue(coachReviewData);
    try {
      currentWeek = 1;
      appData.plan = [{
        weekNum: 1,
        targetKm: 30,
        days: [
          { dateStr: "2026-07-20", dow: 1, type: "easy", km: 6 },
          { dateStr: "2026-07-23", dow: 4, type: "easy", km: 6 },
          { dateStr: "2026-07-26", dow: 0, type: "long", km: 12 }
        ]
      }];
      coachReviewData = {
        analyticsRuns: [
          { activityId: 7001, date: "2026-07-14", km: 6, pace: "8:30", hr: 138 },
          { activityId: 7002, date: "2026-07-16", km: 6, pace: "8:30", hr: 140 },
          { activityId: 7003, date: "2026-07-20", km: 6, pace: "8:10", hr: 139 },
          { activityId: 7004, date: "2026-07-23", km: 7, pace: "8:10", hr: 138 },
          { activityId: 7005, date: "2026-07-26", km: 11, pace: "8:12", hr: 141 }
        ]
      };
      const summary = runnerEvidenceSummary(1);
      const reply = coachResponseToEarlyFeedback("本週狀況不錯，沒有疼痛", { result: "小幅推進" }, false, { coachScheduleApplied: true, targetWeek: 2, evidenceWeek: 1 });
      const emptyDataSummary = (() => {
        coachReviewData = { analyticsRuns: [] };
        return runnerEvidenceSummary(1);
      })();
      return { summary, reply, emptyDataSummary };
    } finally {
      appData = previousData;
      currentWeek = previousWeek;
      coachReviewData = previousReview;
      saveData(appData);
    }
  });
  if (!/本週實跑 24 km／3 次/.test(evidenceVoice.summary)
    || !/前一週 12 km／2 次（\+12 km）/.test(evidenceVoice.summary)
    || !/8:30 → 8:1\d\/km（快 \d+ 秒）/.test(evidenceVoice.summary)
    || !evidenceVoice.reply.includes("對照你的實跑紀錄：")
    || evidenceVoice.emptyDataSummary !== "") {
    throw new Error(`${viewportName}/trainer-coach-voice: coaching reply did not quote real mileage and same-effort pace ${JSON.stringify(evidenceVoice)}`);
  }
  const snapshotDedupe = await page.evaluate(() => {
    const previousHistory = cloneTrainingValue(appData.garminAnalysisHistory);
    try {
      appData.garminAnalysisHistory = [];
      recordGarminAnalysisSnapshot("sig-day-1", ["本週 Garmin 實績已分析，未達需調整課表的門檻"]);
      recordGarminAnalysisSnapshot("sig-day-2", ["本週 Garmin 實績已分析，未達需調整課表的門檻"]);
      recordGarminAnalysisSnapshot("sig-day-3", ["輕鬆跑(Z2)配速提升 → 8:05/km"]);
      return (appData.garminAnalysisHistory || []).map((item) => item.summary);
    } finally {
      appData.garminAnalysisHistory = previousHistory;
      saveData(appData);
    }
  });
  if (snapshotDedupe.length !== 2 || snapshotDedupe[1] !== "輕鬆跑(Z2)配速提升 → 8:05/km") {
    throw new Error(`${viewportName}/trainer-analysis-dedupe: unchanged Garmin verdicts were repeated in the coaching history ${JSON.stringify(snapshotDedupe)}`);
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
    const safetyDay = resolveCourse({ dow: 1, dateStr: "2026-07-20", type: "easy", task: "恢復跑", safetyOverride: true }, buildContext(), coachWeek);
    const hotCoachDay = resolveCourse(
      { dow: 1, dateStr: "2026-07-20", type: "tempo", km: 6, task: "節奏跑 6 km", steps: [] },
      { ...buildContext(), today: "2026-07-20", weather: { "2026-07-20": { tmax: 35 } }, checkins: [] },
      coachWeek
    );
    const raceCoachDay = resolveCourse(
      { dow: 1, dateStr: "2026-07-20", type: "race", focus: "race", task: "半馬｜以賽代訓", raceReplacement: "race", steps: [] },
      { ...buildContext(), today: "2026-07-20", weather: {}, checkins: [] },
      coachWeek
    );
    const nextWeekDecision = progression(buildContext(), "weekly-checkin", { factor: 0.85, removeQuality: true, qualityMode: "keep" });
    const paces = paceResolver(buildContext(), "2026-07-20");
    const coachLocked = coachPrescriptionLocksWeek(coachWeek);
    return {
      heatSafe: isCalibrationSafeRun({ date: "2026-07-15", km: 6, elevationGainM: 0, temperatureC: 35 }),
      protectedType: protectedDays[1]?.type,
      protection: protectedDays[1]?.recoveryProtection,
      coachLocked,
      safetyOverride: Boolean(safetyDay.course.coachSafetyOverride),
      hotCoachSource: hotCoachDay.source,
      hotCoachType: hotCoachDay.course.type,
      raceCoachSource: raceCoachDay.source,
      raceCoachType: raceCoachDay.course.type,
      progressionSafety: nextWeekDecision?.removeQuality,
      paceSource: paces?.easy?.source,
      paceHrMax: paces?.hrZones?.max,
    };
  });
  if (safeguards.heatSafe || safeguards.protectedType !== "easy" || !safeguards.protection || !safeguards.coachLocked || !safeguards.safetyOverride || safeguards.hotCoachSource !== "daily-safety-guard" || safeguards.hotCoachType !== "easy" || safeguards.raceCoachSource !== "race-adjustment" || safeguards.raceCoachType !== "race" || !safeguards.progressionSafety || !safeguards.paceSource || !safeguards.paceHrMax) {
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
