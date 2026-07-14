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
assertCheck(!/<a href="local\/registration\/registration\.html">報名管理<\/a>/.test(trainer) && /function addLocalRegistrationLink\(/.test(trainer) && /data-local-only/.test(trainer), "trainer exposes registration management only from the local server");
assertCheck(/function heroTodayStepSummary\(/.test(trainer) && /step\?\.detail/.test(trainer), "today hero falls back to the detailed main-course instruction when its dose is empty");
assertCheck(/const mainStep = steps\.find\(\(step\) => step\.title === '主課'\)/.test(trainer) && /hero-today-side-steps/.test(trainer) && /hero-today-main-copy/.test(trainer), "today hero gives a detailed main course its own priority layout without crowding warmup and cooldown");
assertCheck(/function trainingDataHealth\(/.test(trainer) && /renderTrainingStatusCard\(/.test(trainer), "auxiliary trainer tabs expose shared data health status");
assertCheck(/function exportTrainingData\(/.test(trainer) && /function importTrainingData\(/.test(trainer), "trainer supports local backup and restore");
assertCheck(/garminCompletionPct/.test(trainer) && /function garminCompletionPercent\(/.test(trainer), "Garmin automatic completion threshold is configurable");
assertCheck(/function garminAutopilotDays\(plan, activityIndex\)/.test(trainer) && /今日 .*Garmin 已認列完成/.test(trainer) && /以下從明天開始列出 7 天輔助菜單/.test(trainer), "Garmin Autopilot removes an already-completed today from the future menu");
assertCheck(/comparisonFamily/.test(trainer) && /只與同課型比較/.test(trainer) && /day\.dateStr\.slice\(5\)\.replace\('-', '\/'\)/.test(trainer), "Garmin Autopilot compares only matching workout families and shows menu dates");
assertCheck(!/function openGarminManualBuilder\(/.test(trainer) && !/Garmin 手動建課助手/.test(trainer) && /function weeklyGarminCalendarIcs\(/.test(trainer) && /function weeklyGarminSyncPayload\(/.test(trainer) && /replaceExisting: true/.test(trainer) && /覆蓋並同步/.test(trainer) && /function garminMainDistanceKm\(/.test(trainer) && /mainKm: garminMainDistanceKm\(day\)/.test(trainer) && /同步結果暫時無法讀取/.test(trainer) && /不代表同步失敗/.test(trainer) && /function syncWeekToGarmin\(/.test(trainer) && /api\/garmin-workout-sync/.test(trainer) && /確認同步/.test(trainer), "trainer replaces same-named Garmin workouts after explicit confirmation while retaining guarded sync and non-misleading result status");
assertCheck(/function mondayOfWeek\(/.test(trainer) && /calcWeeks\(profile\.targetDate, profile\.generatedAt\)/.test(trainer), "trainer includes the target race week when building a plan");
assertCheck(/function formalCoachFallbackMenu\(/.test(trainer) && /正式課表（教練週報未提供菜單）/.test(trainer), "coach panel falls back to formal workouts when Garmin review has no menu");
assertCheck(/function liveCoachPlan\(/.test(trainer) && /function renderLiveCoachCard\(/.test(trainer), "coach panel turns recent Garmin records into a guarded live training menu");
assertCheck(/const formalPhases =/.test(trainer) && /目前使用你的正式課表週期/.test(trainer), "periodization falls back to the formal plan when coach review has no phase data");
assertCheck(/function extendSavedPlanToTarget\(/.test(trainer) && !/profile\.planVersion \|\| 0\) < PLAN_SCHEMA_VERSION\) return true/.test(trainer), "schema upgrades preserve existing plans and only append missing race weeks");
assertCheck(/trainer-weather-cache-v2/.test(trainer) && /morningRain/.test(trainer) && /eveningRain/.test(trainer), "trainer weather distinguishes morning and evening running windows");
assertCheck(/const currentWeekStart = weekStartLabel\(todayStr\(\)\)/.test(trainer), "old extra runs do not remain as permanent weekly alerts");
assertCheck(/coach-summary/.test(trainer) && /這週怎麼跑，一次說清楚/.test(trainer), "coach page combines goal, verdict, priority, and adjustment into one runner summary");
assertCheck(/function effectiveWeekVolumeTarget\(/.test(trainer) && /教練目標/.test(trainer), "coach weekly volume replaces the formal target across plan progress surfaces");
assertCheck(/function loadRegistrationRaceCheckpoints\(/.test(trainer) && /function recordRaceCheckpointResult\(/.test(trainer), "October race checkpoints pair local registrations with Garmin results before applying a pace update");
assertCheck(/switchPlanTab\('analysis'\);\s*showView\('plan'\);/.test(trainer), "applying an assessment returns the runner to a visible analysis tab");
assertCheck(/function checkinSafetyDecision\(/.test(trainer) && /factor: 1\.05/.test(trainer) && /停止品質課/.test(trainer), "weekly check-in uses a bounded safety decision before progression");
assertCheck(/onclick="switchPlanTab\('checkin'\)"/.test(trainer) && /function openWeeklyCheckin\(/.test(trainer), "weekly check-in is reachable from the plan and daily guidance");
assertCheck(/class="plan-tab-list" role="tablist"/.test(trainer) && /class="plan-workspace-tools"/.test(trainer) && /aria-selected/.test(trainer), "plan navigation exposes distinct tabs, management tools, and selected state");
assertCheck(/class="trainer-hero-eyebrow"/.test(trainer) && /class="trainer-hero-planline"/.test(trainer) && /class="plan-pulse-head"/.test(trainer) && /class="plan-progress-grid"/.test(trainer), "plan homepage groups identity, current plan context, and progress into distinct product surfaces");
assertCheck(!/plan-pulse-summary/.test(trainer) && /第 \$\{currentWeek\} \/ \$\{totalWeeks\} 週 · \$\{pct\}%/.test(trainer) && /\$\{weekProgressPct\}%/.test(trainer), "plan pulse presents schedule and weekly volume as two non-duplicated progress measures");
assertCheck(/const hasCoachDirection = Boolean\(goalGapNote \|\| coachBrief\)/.test(trainer) && !/\$\{renderDailyExecutionCard\(week\)\}/.test(trainer) && /class="guide-actions week-resource-actions"/.test(trainer), "week view keeps coach direction while removing duplicate daily guidance from the header stack");
assertCheck(/class="week-header-target"/.test(trainer) && !/class="week-target"/.test(trainer), "weekly target is integrated with the week identity instead of competing with header actions");
assertCheck(/const TRAINING_JARGON_ENTRIES/.test(trainer) && /輕鬆跑（E 跑）/.test(trainer) && /M 配速/.test(trainer), "coach terminology includes controlled plain-language explanations");
assertCheck(/function renderLatestTrainingReport\(/.test(trainer) && /Latest training report · Garmin/.test(trainer) && /主課成績已單獨入帳/.test(trainer), "training analysis prioritizes a single-session coach report before long-term trends");
assertCheck(/function sessionIntensityLabel\(/.test(trainer) && /課程分段/.test(trainer) && /session-lap-list/.test(trainer), "latest training report presents Garmin lap summaries by workout segment");
assertCheck(/品質判讀只使用 Garmin 明確標記的主課/.test(trainer) && /不會拖慢主課成績/.test(trainer), "session report explicitly protects main-course metrics from warmup and cooldown dilution");
assertCheck(/function plannedSessionFor\(run\)/.test(trainer) && /applyCoachPlanOverride\(day, week\)/.test(trainer), "session report uses the same effective coach override as the plan and today card");
assertCheck(/function selectTrainingReport\(/.test(trainer) && /session-report-history/.test(trainer) && /function sessionQualitySignals\(/.test(trainer), "training analysis supports historical single-session reports with quality signals");
assertCheck(/Garmin 自我評量/.test(trainer) && /function plannedMainTargetKm\(/.test(trainer), "session report shows official Garmin self-evaluation and a main-course completion target");

const failed = checks.filter((check) => !check.ok);
checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

if (failed.length) {
  process.exitCode = 1;
}
