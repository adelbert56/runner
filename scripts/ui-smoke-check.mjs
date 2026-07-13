import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const checks = [];

function assertCheck(condition, message) {
  checks.push({ ok: Boolean(condition), message });
}

function sentenceKeys(text) {
  return (String(text || "").match(/[^。！？.!?]+[。！？.!?]?/g) || [])
    .map((sentence) => sentence.replace(/[，、；：,.!?！？。;:\s]/g, "").slice(0, 48))
    .filter(Boolean);
}

const [html, app, contentRaw, trainer] = await Promise.all([
  readFile(resolve(root, "site/index.html"), "utf8"),
  readFile(resolve(root, "site/app.js"), "utf8"),
  readFile(resolve(root, "site/data/content.json"), "utf8"),
  readFile(resolve(root, "site/trainer.html"), "utf8"),
]);

const content = JSON.parse(contentRaw);
const items = Array.isArray(content.items) ? content.items : [];
const shoeCount = items.filter((item) => item.type === "shoe").length;
const newsCount = items.filter((item) => item.type === "news").length;
const longSummaries = items.filter((item) => String(item.summary || "").length > 180);
const duplicateSummaries = items.filter((item) => {
  const keys = sentenceKeys(item.summary);
  return keys.length !== new Set(keys).size;
});

assertCheck(!/const TODAY = "\d{4}-\d{2}-\d{2}"/.test(app), "front-end baseline date is dynamic");
assertCheck(/const TODAY = getTodayString\(\)/.test(app), "front-end uses getTodayString()");
assertCheck(/shoeContainer\.innerHTML = shoes\.map/.test(app), "published shoe content replaces static fallback when JSON loads");
assertCheck(/newsContainer\.innerHTML = news\.map/.test(app), "published news content replaces static fallback when JSON loads");
assertCheck(/\?v=2026\d{4}-[a-z0-9-]+/.test(html), "asset version parameter was bumped");
assertCheck(/announcements\.json\?v=\$\{DATA_VERSION\}/.test(app), "announcements load from scheduled data file");
assertCheck(/message-cloud\.json\?v=\$\{DATA_VERSION\}/.test(app), "message cloud loads from scheduled data file");
assertCheck(/source_url/.test(app) && /我要留言/.test(app), "message cloud links to GitHub issue comments");
assertCheck(items.length >= 10, `published content count is usable (${items.length})`);
assertCheck(shoeCount >= 10, `published shoe count reaches target (${shoeCount})`);
assertCheck(newsCount >= 10, `published news count reaches target (${newsCount})`);
assertCheck(longSummaries.length === 0, `content summaries stay concise (${longSummaries.length} over limit)`);
assertCheck(duplicateSummaries.length === 0, `content summaries do not repeat sentences (${duplicateSummaries.length} repeated)`);
assertCheck(/function trainingCompletionSummary\(/.test(trainer), "trainer uses one completion summary for progress and adherence");
assertCheck(/function trainingDataHealth\(/.test(trainer) && /renderTrainingStatusCard\(/.test(trainer), "auxiliary trainer tabs expose shared data health status");
assertCheck(/function exportTrainingData\(/.test(trainer) && /function importTrainingData\(/.test(trainer), "trainer supports local backup and restore");
assertCheck(/garminCompletionPct/.test(trainer) && /function garminCompletionPercent\(/.test(trainer), "Garmin automatic completion threshold is configurable");
assertCheck(/function mondayOfWeek\(/.test(trainer) && /calcWeeks\(profile\.targetDate, profile\.generatedAt\)/.test(trainer), "trainer includes the target race week when building a plan");
assertCheck(/function formalCoachFallbackMenu\(/.test(trainer) && /正式課表（教練週報未提供菜單）/.test(trainer), "coach panel falls back to formal workouts when Garmin review has no menu");
assertCheck(/function liveCoachPlan\(/.test(trainer) && /function renderLiveCoachCard\(/.test(trainer), "coach panel turns recent Garmin records into a guarded live training menu");
assertCheck(/const formalPhases =/.test(trainer) && /目前使用你的正式課表週期/.test(trainer), "periodization falls back to the formal plan when coach review has no phase data");
assertCheck(/function extendSavedPlanToTarget\(/.test(trainer) && !/profile\.planVersion \|\| 0\) < PLAN_SCHEMA_VERSION\) return true/.test(trainer), "schema upgrades preserve existing plans and only append missing race weeks");
assertCheck(/trainer-weather-cache-v2/.test(trainer) && /morningRain/.test(trainer) && /eveningRain/.test(trainer), "trainer weather distinguishes morning and evening running windows");
assertCheck(/const currentWeekStart = weekStartLabel\(todayStr\(\)\)/.test(trainer), "old extra runs do not remain as permanent weekly alerts");
assertCheck(/coach-summary/.test(trainer) && /這週怎麼跑，一次說清楚/.test(trainer), "coach page combines goal, verdict, priority, and adjustment into one runner summary");
assertCheck(/function effectiveWeekVolumeTarget\(/.test(trainer) && /依教練菜單/.test(trainer), "coach weekly volume replaces the formal target across plan progress surfaces");
assertCheck(/function loadRegistrationRaceCheckpoints\(/.test(trainer) && /function recordRaceCheckpointResult\(/.test(trainer), "October race checkpoints pair local registrations with Garmin results before applying a pace update");
assertCheck(/switchPlanTab\('analysis'\);\s*showView\('plan'\);/.test(trainer), "applying an assessment returns the runner to a visible analysis tab");
assertCheck(/function checkinSafetyDecision\(/.test(trainer) && /factor: 1\.05/.test(trainer) && /停止品質課/.test(trainer), "weekly check-in uses a bounded safety decision before progression");
assertCheck(/onclick="switchPlanTab\('checkin'\)"/.test(trainer) && /function openWeeklyCheckin\(/.test(trainer), "weekly check-in is reachable from the plan and daily guidance");
assertCheck(/const TRAINING_JARGON_ENTRIES/.test(trainer) && /輕鬆跑（E 跑）/.test(trainer) && /M 配速/.test(trainer), "coach terminology includes controlled plain-language explanations");

const failed = checks.filter((check) => !check.ok);
checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

if (failed.length) {
  process.exitCode = 1;
}
