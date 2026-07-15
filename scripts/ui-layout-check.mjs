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
  { id: "training", label: "練跑" },
  { id: "news", label: "新聞" },
];

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
];

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
  await page.goto(`${baseUrl}trainer.html`, { waitUntil: "networkidle" });
  await page.evaluate((sample) => localStorage.setItem("runner-trainer-v1", JSON.stringify(sample)), trainerVisualSample);
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate((review) => {
    // This is a deterministic local visual fixture; it never writes to the product data files.
    eval(`coachReviewData = ${JSON.stringify(review)}`);
    renderPlanView();
    showView("plan");
    switchPlanTab("analysis");
  }, trainerReviewSample);
  await page.waitForSelector(".session-report", { timeout: 5000 });
  await assertNoHorizontalOverflow(page, `${viewportName}/trainer-report`);
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
    hasStructure: element.textContent.includes("Garmin 課程結構"),
    detailsCount: element.querySelectorAll("details").length,
    hasInvalidNumber: element.textContent.includes("NaN"),
  }));
  if (!coachStructure.hasStructure || !coachStructure.detailsCount || coachStructure.hasInvalidNumber) {
    throw new Error(`${viewportName}/trainer-coach: Garmin structure is missing or invalid ${JSON.stringify(coachStructure)}`);
  }
  await page.locator("#plan-tab-coach details").first().evaluate((element) => { element.open = true; });
  await assertNoHorizontalOverflow(page, `${viewportName}/trainer-coach`);
  await page.screenshot({ path: resolve(screenshotDir, `${viewportName}-trainer-coach-structure.png`), fullPage: true });
  console.log(`OK ${viewportName}/trainer report layout`);
}

const { chromium } = await loadPlaywright();
await mkdir(screenshotDir, { recursive: true });

const server = startServer();
let browser;

try {
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => fail(`${viewport.name}: page error: ${error.message}`));
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await assertTrainerReport(page, viewport.name);

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
