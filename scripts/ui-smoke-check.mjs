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

const [html, app, contentRaw, trainerHtml, trainerGarminAssignmentsJs, trainerGarminSyncJs, trainerGarminCalibrationJs, trainerSafetyJs, trainerJs, trainerDataJs, trainerCss, garminPublisher, garminReviewBuilder, server] = await Promise.all([
  readFile(resolve(root, "site/index.html"), "utf8"),
  readFile(resolve(root, "site/app.js"), "utf8"),
  readFile(resolve(root, "site/data/content.json"), "utf8"),
  readFile(resolve(root, "site/trainer.html"), "utf8"),
  readFile(resolve(root, "site/trainer-garmin-assignments.js"), "utf8"),
  readFile(resolve(root, "site/trainer-garmin-sync.js"), "utf8"),
  readFile(resolve(root, "site/trainer-garmin-calibration.js"), "utf8"),
  readFile(resolve(root, "site/trainer-safety.js"), "utf8"),
  readFile(resolve(root, "site/trainer.js"), "utf8"),
  readFile(resolve(root, "site/trainer-data.js"), "utf8"),
  readFile(resolve(root, "site/trainer.css"), "utf8"),
  readFile(resolve(root, "scripts/garmin/publish_training_plan.py"), "utf8"),
  readFile(resolve(root, "scripts/build-training-review.mjs"), "utf8"),
  readFile(resolve(root, "site/server.mjs"), "utf8"),
]);
// trainer 頁面已拆成 html/js/css 三檔；既有斷言以串接內容檢查，語意不變
const trainer = `${trainerHtml}\n${trainerGarminAssignmentsJs}\n${trainerGarminSyncJs}\n${trainerGarminCalibrationJs}\n${trainerSafetyJs}\n${trainerJs}\n${trainerDataJs}\n${trainerCss}`;
assertCheck(/trainer-garmin-assignments\.js/.test(trainerHtml) && trainerHtml.indexOf("trainer-garmin-assignments.js") < trainerHtml.indexOf("trainer.js"), "trainer loads Garmin assignment rules before the core script");
assertCheck(/trainer-garmin-sync\.js/.test(trainerHtml) && trainerHtml.indexOf("trainer-garmin-sync.js") < trainerHtml.indexOf("trainer.js") && /GARMIN_ACTIVITY_SYNC_API/.test(trainerGarminSyncJs), "trainer loads local Garmin sync controls before the core script");
assertCheck(/trainer-garmin-calibration\.js/.test(trainerHtml) && trainerHtml.indexOf("trainer-garmin-calibration.js") < trainerHtml.indexOf("trainer.js") && /function heatAdjustedPaceSec\(/.test(trainerGarminCalibrationJs), "trainer loads Garmin calibration guards before the core script");
assertCheck(/trainer-safety\.js/.test(trainerHtml) && trainerHtml.indexOf("trainer-safety.js") < trainerHtml.indexOf("trainer.js"), "trainer loads the safety boundary before the core script");
assertCheck(/trainer-data\.js/.test(trainerHtml) && /window\.TrainerData/.test(trainerDataJs) && /TrainerData\?\.exportData/.test(trainerJs), "trainer delegates backup actions to the data boundary while retaining existing controls");

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
assertCheck(/function exportTrainingData\(/.test(trainer) && /function importTrainingData\(/.test(trainer) && /PRE_RESTORE_STORAGE_KEY/.test(trainer) && /function trainingDataCounts\(/.test(trainer) && /function confirmRestorePreImportSnapshot\(/.test(trainer), "trainer previews backups and preserves a local pre-restore recovery snapshot");
assertCheck(/function archiveCurrentCycle\(/.test(trainer) && /function restartTrainingCycle\(/.test(trainer) && /cycleHistory: \[\]/.test(trainer) && /function openCycleHistory\(/.test(trainer), "trainer archives complete training cycles before a restart and keeps them reviewable");
assertCheck(/nextCycleCoachContext/.test(trainer) && /historyContext/.test(trainer) && /function renderHistoryCoachContext\(/.test(trainer) && /提供給教練/.test(trainer), "trainer carries a selected cycle summary into the next coach context without overwriting the formal plan");
assertCheck(/garminCompletionPct/.test(trainer) && /function garminCompletionPercent\(/.test(trainer), "Garmin automatic completion threshold is configurable");
assertCheck(/GARMIN_ACTIVITY_SYNC_API/.test(trainer) && /startGarminActivitySync/.test(trainer) && /loadGarminActivitySyncStatus/.test(trainer) && /formatGarminActivitySyncMessage/.test(trainer) && /data-local-only="garmin-activity-sync"/.test(trainer) && /\['localhost', '127\.0\.0\.1', '::1'\]/.test(trainer), "trainer offers a local-only manual Garmin activity sync with visible status");
assertCheck(/api\/garmin-activity-sync/.test(server) && /sync-garmin\.ps1/.test(server) && /isLocalGarminActivitySyncRequest/.test(server) && /req\.socket\.remoteAddress/.test(server), "manual Garmin activity sync stays loopback-only and uses the existing sync script");
assertCheck(/requestHost === `localhost:\$\{port\}`/.test(server) && /http:\/\/127\.0\.0\.1:\$\{port\}\$\{req\.url/.test(server), "local Runner canonically redirects localhost pages to 127.0.0.1 so browser-local training data is not split by loopback hostname");
assertCheck(/function garminAutopilotDays\(plan, activityIndex\)/.test(trainer) && /今日 .*Garmin 已認列完成/.test(trainer) && /以下從明天開始列出 7 天輔助菜單/.test(trainer), "Garmin Autopilot removes an already-completed today from the future menu");
assertCheck(/完成兩筆即可比較/.test(trainer) && /最近兩次同課型主課/.test(trainer) && /較嚴格門檻才下修課表/.test(trainer), "Garmin comparison becomes available after two matched main sessions and explains its conservative guardrail");
assertCheck(/const matchedQuality = structuredRuns[\s\S]*?slice\(-1\)[\s\S]*?slice\(-2, -1\)[\s\S]*?paceDeltaSeconds >= 12 && hrDelta >= 7/.test(garminReviewBuilder), "Garmin trend compares the latest matched pair and uses stricter fatigue thresholds for the smaller sample");
assertCheck(/comparisonFamily/.test(trainer) && /qualityComparisonSampleSize/.test(trainer) && /day\.dateStr\.slice\(5\)\.replace\('-', '\/'\)/.test(trainer), "Garmin Autopilot compares only matching workout families and shows menu dates");
assertCheck(!/function openGarminManualBuilder\(/.test(trainer) && !/Garmin 手動建課助手/.test(trainer) && /function weeklyGarminCalendarIcs\(/.test(trainer) && /function weeklyGarminSyncPayload\(/.test(trainer) && /replaceExisting: true/.test(trainer) && /覆蓋並同步/.test(trainer) && /function garminMainDistanceKm\(/.test(trainer) && /mainKm: garminMainDistanceKm\(day\)/.test(trainer) && /steps: garminManualBuilderSteps\(day\)/.test(trainer) && /同步結果暫時無法讀取/.test(trainer) && /不代表同步失敗/.test(trainer) && /function syncWeekToGarmin\(/.test(trainer) && /api\/garmin-workout-sync/.test(trainer) && /確認同步/.test(trainer), "trainer replaces same-named Garmin workouts after explicit confirmation while retaining guarded sync and non-misleading result status");
assertCheck(/GARMIN_WORKOUT_PAIRING_KEY/.test(trainer) && /sessionStorage\.getItem\(GARMIN_WORKOUT_PAIRING_KEY\)/.test(trainer) && /sessionStorage\.setItem\(GARMIN_WORKOUT_PAIRING_KEY, code\)/.test(trainer) && /openGarminWorkoutPairing/.test(trainer) && /x-runner-garmin-pairing/.test(trainer) && /api\/garmin-workout-pairing/.test(server) && /randomBytes\(24\)/.test(server) && /timingSafeEqual/.test(server) && /pairing-required/.test(server) && /isLocalGarminActivitySyncRequest\(req\)/.test(server) && /decoded === "\/api\/garmin-workout-pairing"[\s\S]{0,120}sendGarminCors\(res, origin\)/.test(server), "public Garmin workout bridge requires a session pairing code that only a loopback page can retrieve");
assertCheck(/function workoutStructureForDay\(/.test(trainer) && /function coachWorkoutStructure\(/.test(trainer) && /查看 Garmin 課程結構/.test(trainer) && !/<details class="coach-jargon" open/.test(trainer) && /每一組依序完成/.test(trainer) && /const workoutStructure = coachWorkoutStructure/.test(trainer) && /hasCurrentCoachPlan/.test(trainer) && /查看歷史教練週報/.test(trainer), "coach Garmin structure stays collapsible and historical reviews do not expand into the current-week plan");
assertCheck(/def structured_steps\(/.test(garminPublisher) && /structured_steps\(item\) or fallback_steps/.test(garminPublisher) && /STRUCTURED_STEP_TYPES/.test(garminPublisher), "local Garmin publisher consumes structured workout steps instead of parsing only summary text");
assertCheck(/const recoverySeconds = recoveryMatch \? Number\(recoveryMatch\[1\]\) : 45/.test(trainer) && /recovery_seconds = int\(recovery_match\.group\(1\)\) if recovery_match else 45/.test(garminPublisher), "stride recovery defaults to the current 45-second prescription unless the coach specifies otherwise");
assertCheck(/function garminSyncPreview\(/.test(trainer) && /這次同步差異/.test(trainer) && /不會寫入 Garmin/.test(trainer), "Garmin sync previews structural changes and safely excludes note-only coach text");
assertCheck(/function preserveCoachWorkoutSteps\(/.test(garminReviewBuilder) && /function normalizeCoachSteps\(/.test(garminReviewBuilder), "encrypted coach review preserves native structured steps from the coach source");
assertCheck(/function garminTargetSpec\(/.test(trainer) && /kind: 'heart_rate'/.test(trainer) && /kind: 'speed'/.test(trainer) && /targetSpec: garminTargetSpec/.test(trainer) && /def target_from_spec\(/.test(garminPublisher) && /TargetType\.SPEED_ZONE/.test(garminPublisher) && /TargetType\.HEART_RATE_ZONE/.test(garminPublisher), "verified Garmin speed and heart-rate targets are passed from course steps to the publisher");
assertCheck(/function mondayOfWeek\(/.test(trainer) && /calcWeeks\(profile\.targetDate, profile\.generatedAt\)/.test(trainer), "trainer includes the target race week when building a plan");
assertCheck(/function formalCoachFallbackMenu\(/.test(trainer) && /下週正式課表（依本週 Garmin 實跑判讀）/.test(trainer) && /const upcomingWeekStart = appData\.plan\?\.\[currentWeek\]\?\.days\?\.\[0\]\?\.dateStr/.test(trainer), "coach panel selects the upcoming formal week when an older review has no current menu");
assertCheck(/function liveCoachPlan\(/.test(trainer) && /function renderLiveCoachCard\(/.test(trainer) && /const hasNewerGarminRuns/.test(trainer) && /run\.date >= reviewedPlanStart/.test(trainer), "coach panel replaces an outdated review summary with recent Garmin records");
assertCheck(/const formalPhases =/.test(trainer) && /目前使用你的正式課表週期/.test(trainer), "periodization falls back to the formal plan when coach review has no phase data");
assertCheck(/function extendSavedPlanToTarget\(/.test(trainer) && !/profile\.planVersion \|\| 0\) < PLAN_SCHEMA_VERSION\) return true/.test(trainer), "schema upgrades preserve existing plans and only append missing race weeks");
assertCheck(/trainer-weather-cache-v2/.test(trainer) && /morningRain/.test(trainer) && /eveningRain/.test(trainer), "trainer weather distinguishes morning and evening running windows");
assertCheck(/const currentWeekStart = weekStartLabel\(todayStr\(\)\)/.test(trainer), "old extra runs do not remain as permanent weekly alerts");
assertCheck(/coach-summary/.test(trainer) && /這週怎麼跑，一次說清楚/.test(trainer), "coach page combines goal, verdict, priority, and adjustment into one runner summary");
assertCheck(/function effectiveWeekVolumeTarget\(/.test(trainer) && /教練目標/.test(trainer), "coach weekly volume replaces the formal target across plan progress surfaces");
assertCheck(/function loadRegistrationRaceCheckpoints\(/.test(trainer) && /function recordRaceCheckpointResult\(/.test(trainer), "October race checkpoints pair local registrations with Garmin results before applying a pace update");
assertCheck(/switchPlanTab\('progress'\);\s*showView\('plan'\);/.test(trainer), "applying an assessment returns the runner to the visible progress hub");
assertCheck(/function checkinSafetyDecision\(/.test(trainer) && /factor: 1\.05/.test(trainer) && /停止品質課/.test(trainer), "weekly check-in uses a bounded safety decision before progression");
assertCheck(/function normalizeSafetyHold\(/.test(trainer) && /function activateSafetyHold\(/.test(trainer) && /function confirmClearSafetyHold\(/.test(trainer) && /傷痛保護模式/.test(trainer) && /\['tempo', 'interval', 'long'\]/.test(trainer), "pain or severe fatigue activates a persistent safety hold that masks quality and long runs until confirmed clear");
assertCheck(/onclick="switchPlanTab\('checkin'\)"/.test(trainer) && /function openWeeklyCheckin\(/.test(trainer), "weekly check-in is reachable from the plan and daily guidance");
assertCheck(/class="checkin-week-switcher"/.test(trainer) && /aria-label="選擇評估週數"/.test(trainer) && /jumpToPhaseWeek\(Number\(this\.value\)\)/.test(trainer), "weekly check-in supports direct week switching without leaving the review tab");
assertCheck(/class="plan-tab-list" role="tablist"/.test(trainer) && /class="plan-workspace-tools"/.test(trainer) && /aria-selected/.test(trainer), "plan navigation exposes distinct tabs, management tools, and selected state");
assertCheck(/讀取 Garmin 實跑/.test(trainer) && /手動補登/.test(trainer) && !/完成後按「完成」/.test(trainer), "daily completion makes Garmin recognition the first path and reserves manual entry for exceptions");
assertCheck(/function openCycleManagement\(/.test(trainer) && /結束本輪並建立新週期/.test(trainer) && /資料與備份/.test(trainer), "cycle history, restart, and backup actions are grouped without duplicate restart entry points");
assertCheck(/cycle-management-current/.test(trainer) && /cycle-management-history/.test(trainer) && /className: 'cycle-management-modal'/.test(trainer), "cycle management modal separates current-cycle status from archive guidance and uses its own responsive action layout");
assertCheck(/function weeklyCheckinTiming\(/.test(trainer) && /function showCheckinOutcome\(/.test(trainer) && /查看下週課表/.test(trainer) && /完成本週最終評估/.test(trainer), "weekly review distinguishes an early safety check from the final progression decision and routes to the next action");
assertCheck(/function earlyCoachPlanningEligibility\(/.test(trainer) && /day\.type !== 'rest' && !day\.isMakeup/.test(trainer) && /garminRunsByDate/.test(trainer) && /activityCompletesDay\(day, garminRunsByDate\.get\(day\.dateStr\)\)/.test(trainer) && /function renderEarlyCoachPlanningAction\(/.test(trainer) && /確認已完成並安排下週/.test(trainer) && /依本週完成紀錄安排下週/.test(trainer) && /manualCompletionConfirmed/.test(trainer) && /earlyTrigger/.test(trainer), "coach advice counts matched Garmin sessions and provides a direct next-week scheduling action with a manual-confirmation fallback");
assertCheck(/let coachReviewLoadState = 'loading'/.test(trainer) && /正在核對 Garmin 已同步紀錄/.test(trainer) && /請先解鎖教練建議/.test(trainer), "early planning waits for Garmin review data instead of falsely reporting every session incomplete before coach review is ready");
assertCheck(/\.modal \{[^}]*max-height: calc\(100dvh - 32px\)[^}]*display: flex; flex-direction: column;[^}]*\}/.test(trainer) && /\.modal-body \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;[^}]*\}/.test(trainer), "all modals constrain tall content to a scrollable viewport while keeping actions reachable");
assertCheck(/class="trainer-hero-eyebrow"/.test(trainer) && /class="trainer-hero-planline"/.test(trainer) && /function renderWeekOverviewCard\(/.test(trainer) && /class="plan-progress-track"/.test(trainer), "plan homepage groups identity, current plan context, and progress into distinct product surfaces");
assertCheck(!/plan-pulse-summary/.test(trainer) && !/function renderProgressCard\(/.test(trainer) && /\$\{weekProgressPct\}%/.test(trainer), "week overview shows weekly volume once instead of a separate plan-pulse card duplicating hero context");
assertCheck(/const hasCoachDirection = Boolean\(goalGapNote \|\| coachBrief \|\| planningNote\)/.test(trainer) && /本週排課調整/.test(trainer) && !/\$\{renderDailyExecutionCard\(week\)\}/.test(trainer) && /class="guide-actions week-resource-actions"/.test(trainer), "week view keeps concise coach direction, including a recovery-driven scheduling reason, without duplicate daily guidance");
assertCheck(/class="week-header-target"/.test(trainer) && !/class="week-target"/.test(trainer), "weekly target is integrated with the week identity instead of competing with header actions");
assertCheck(/const TRAINING_JARGON_ENTRIES/.test(trainer) && /輕鬆跑（E 跑）/.test(trainer) && /M 配速/.test(trainer), "coach terminology includes controlled plain-language explanations");
assertCheck(/function renderLatestTrainingReport\(/.test(trainer) && /Training report · Garmin/.test(trainer) && /主課成績已單獨入帳/.test(trainer), "training analysis prioritizes a single-session coach report before long-term trends");
assertCheck(/PASSPHRASE_STORAGE_KEY/.test(trainer) && /id="coach-review-remember"(?!\s+checked)/.test(trainer) && /localStorage\.setItem\(PASSPHRASE_STORAGE_KEY, pass\)/.test(trainer) && /localStorage\.removeItem\(PASSPHRASE_STORAGE_KEY\)/.test(trainer), "coach review remembers a passphrase only after explicit opt-in on a trusted device");
assertCheck(/data-entry-id="\$\{reviewEscape\(entry\.id\)\}" onclick="recordRaceCheckpointResult\(this\.dataset\.entryId\)"/.test(trainer) && !/recordRaceCheckpointResult\('\$\{reviewEscape\(entry\.id\)\}'\)/.test(trainer), "local registration IDs stay in a data attribute instead of being interpolated into inline JavaScript");
assertCheck(/role="dialog" aria-modal="true" aria-labelledby="modal-title"/.test(trainerHtml) && /function modalFocusableElements\(/.test(trainer) && /event\.key === 'Escape'/.test(trainer), "trainer modal has dialog semantics, focus containment, and Escape close");
assertCheck(/aria-controls="plan-tab-week"/.test(trainer) && /aria-controls="progress-panel-analysis"/.test(trainer) && /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/.test(trainer), "trainer tabs expose linked panels and keyboard navigation");
assertCheck(/function sessionIntensityLabel\(/.test(trainer) && /課程分段/.test(trainer) && /session-lap-list/.test(trainer), "latest training report presents Garmin lap summaries by workout segment");
assertCheck(/function sessionLapLabel\(/.test(trainer) && /不應把那個原始欄位解讀成正式課表的「間歇」/.test(trainer) && /Garmin 計圈/.test(trainer), "unstructured Garmin laps stay neutral instead of being mislabeled as intervals");
assertCheck(/class="session-report-verdict"/.test(trainer) && /正式課表對照/.test(trainer) && /下一步/.test(trainer) && /function summarizeSessionLaps\(/.test(trainer) && /function selectTrainingReportLapCategory\(/.test(trainer) && /progress-panel-analysis/.test(trainer) && /class="session-lap-filter/.test(trainer), "session report keeps lap filters interactive after analysis moved into the progress hub");
assertCheck(/品質判讀只使用 Garmin 明確標記的主課/.test(trainer) && /不會拖慢主課成績/.test(trainer), "session report explicitly protects main-course metrics from warmup and cooldown dilution");
assertCheck(/function plannedSessionFor\(run\)/.test(trainer) && /applyCoachPlanOverride\(day, week\)/.test(trainer), "session report uses the same effective coach override as the plan and today card");
assertCheck(/function selectTrainingReport\(/.test(trainer) && /session-report-history/.test(trainer) && /function sessionQualitySignals\(/.test(trainer), "training analysis supports historical single-session reports with quality signals");
assertCheck(/Garmin 自我評量/.test(trainer) && /function plannedMainTargetKm\(/.test(trainer), "session report shows official Garmin self-evaluation and a main-course completion target");
assertCheck(/function automaticActivityAssignment\(/.test(trainerGarminAssignmentsJs) && /function activityAssignmentFor\(/.test(trainerGarminAssignmentsJs) && /這次對應不對？/.test(trainer), "trainer auto-maps same-day and safe makeup runs while leaving one exception path");
assertCheck(/activityAssignments: \{\}/.test(trainer) && /function normalizeActivityAssignments\(/.test(trainer) && /function setActivityAssignment\(/.test(trainer), "activity assignment overrides persist safely in local training data");
assertCheck(/function pendingGarminAssignmentReviews\(/.test(trainer) && /低信心對應/.test(trainer) && /確認 Garmin 對應/.test(trainer), "low-confidence Garmin makeup assignments are surfaced for runner review");
assertCheck(/function recordPlanChange\(/.test(trainer) && /function renderPlanChangeTimeline\(/.test(trainer) && /Garmin 實跑自動校準/.test(trainer) && /previous\.date === item\.date && previous\.source === item\.source && previous\.title === item\.title/.test(trainer), "automatic plan changes retain a compact, same-day deduplicated before-and-after history");
assertCheck(/function renderWeekOverviewCard\(/.test(trainer) && /同步可信度/.test(trainer) && /function renderCheckinTrend\(/.test(trainer), "plan workspace surfaces automatic execution, sync trust, and recovery trend");
assertCheck(/function runCompanionRecommendation\(/.test(trainer) && /const RUN_COMPANION_PODCASTS =/.test(trainer) && /const RUN_COMPANION_MUSIC =/.test(trainer) && /function estimatedRunMinutes\(/.test(trainer) && /function pickCompanionPodcasts\(keys, count\)/.test(trainer) && /function pickCompanionMusic\(keys, count\)/.test(trainer) && /RUN_COMPANION_HISTORY_KEY/.test(trainer) && /RUN_COMPANION_MUSIC_HISTORY_KEY/.test(trainer) && /每次會隨機換一批主題/.test(trainer) && /每次會隨機換一批曲風/.test(trainer) && /onclick="showRunCompanion\('\$\{day\.dateStr\}'\)"/.test(trainer) && /跑步故事/.test(trainer) && /深度訪談/.test(trainer) && /電影／遊戲配樂/.test(trainer), "course cards randomize varied podcast and music choices by workout while avoiding recently shown topics");
assertCheck(/function postRunVerdict\(/.test(trainer) && /function trainingAutopilotDecision\(/.test(trainer) && /自動訓練決策/.test(trainer) && /不把缺口硬塞到下一天/.test(trainer), "post-run completion, safe makeup, and next-step guidance use one automatic decision layer");
assertCheck(/const calibrationSignature = \[/.test(trainer) && /coachReviewData\.analyticsRuns/.test(trainer) && /本週同課型持續比課表快/.test(trainer), "new Garmin activity snapshots can recalibrate future pace prescriptions without reacting to one fast run");
assertCheck(/function isCalibrationSafeRun\(/.test(trainer) && /function heatAdjustedPaceSec\(/.test(trainer) && /temperatureC\) >= 35/.test(trainer) && /function coachPrescriptionLocksWeek\(/.test(trainer) && /function applyCourseSpacingGuard\(/.test(trainer) && /安全保護高於教練處方/.test(trainer), "coach calibration normalizes heat instead of freezing all summer, excludes terrain and extreme heat, and safety overrides coach prescriptions");
assertCheck(/function postRaceRecoveryDayCount\(/.test(trainer) && /raceReplacement = 'post-race'/.test(trainer) && /賽後恢復/.test(trainer) && /day\.dateStr < today\) return;/.test(trainer), "registered races schedule post-race recovery days and past race history stays frozen for calibration");
assertCheck(/appData\.raceCalibratedFor/.test(trainer) && /依實賽成績整組上修/.test(trainer) && /Math\.pow\(goalDist \/ Number\(raceRun\.km\), 0\.07\)/.test(trainer), "actual race results recalibrate race, tempo, and interval paces once per race");
assertCheck(/lactateThresholdHr/.test(trainer) && /source: 'lthr'/.test(trainer) && /source: 'maxhr'/.test(trainer) && /lactateThresholdHr/.test(garminReviewBuilder), "training zones prefer the watch-estimated lactate threshold and fall back to %maxHr");
assertCheck(/raceReplacement = 'pre-race-taper'/.test(trainer) && /preRaceTaperOf/.test(trainer) && /賽前減壓跑/.test(trainer) && /raceMaxKm\(race\) \|\| 0\) < 15\) return;/.test(trainer), "B-tier registered races get a 2-3 day mini-taper while short races stay train-through");
assertCheck((trainer.match(/\$\{renderWeekOverviewCard\(/g) || []).length >= 2, "week tab re-renders keep the merged week overview card after boot");
assertCheck(/function targetTimeToSec\(/.test(trainer) && /targetTimeToSec\(profile\.targetTime, dist\)/.test(trainer) && /targetTimeToSec\(timeVal, dist\)/.test(trainer) && /讀作 \$\{Math\.floor\(timeSec \/ 3600\)\} 小時/.test(trainer), "a two-part goal time like 2:10 is read as hours and minutes and the interpretation is echoed back live");
assertCheck(/function isValidClockInput\(/.test(trainer) && /function trainingProfileValidationErrors\(/.test(trainer) && /trainingProfileValidationErrors\(profile\)/.test(trainer) && /避免不完整或不合理的資料直接進入課表/.test(trainer), "trainer rejects malformed time and unsafe numeric setup before generating a plan");
assertCheck(/type-\$\{day\.type\}/.test(trainer) && /\.day-card\.type-interval/.test(trainer) && /\.day-card\.type-long/.test(trainer) && /border-left-width: 6px/.test(trainer), "week view day cards carry an intensity color scale on the left border");
assertCheck(/potentialNote/.test(trainer) && /若趨勢延續，完賽時間有機會再快約/.test(trainer) && /mask-image: linear-gradient\(90deg/.test(trainer), "fitness projection quantifies trend upside and the mobile tab list hints at horizontal scroll");
assertCheck(/function canUseIntervalBySeason\(/.test(trainer) && /!isHotSeasonDate\(weekStart\)/.test(trainer), "interval season rule reuses the single hot-season definition instead of a conflicting month threshold");
assertCheck(/function applyDailySessionAdvisory\(/.test(trainer) && /function dailyAdvisoryTriggers\(/.test(trainer) && /出發前調整/.test(trainer) && /appData\.dailyAdvisoryGuard/.test(trainer) && /guard\.score\) >= readinessScore/.test(trainer), "pre-session advisory adjusts at most once per day but re-evaluates when async weather or Garmin data arrives later");
assertCheck(/function tryMoveSessionWithinWeek\(/.test(trainer) && /hardTypes\.includes\(prevDay\.type\)/.test(trainer) && /原課不硬塞/.test(trainer), "a downgraded session is moved within the week only when intensity spacing and weather allow, never forced");
assertCheck(/function coachPlanningReadiness\(/.test(trainer) && /allowQuality/.test(trainer) && /previousTargetKm \* 1\.1/.test(trainer) && /planningNote/.test(trainer), "coach scheduling uses recent readiness, availability, and a capped volume progression with a visible reason");
assertCheck(/近四週最長跑/.test(trainer) && /最近四趟平均配速/.test(trainer) && /最近四趟平均心率/.test(trainer), "long-term training trend exposes volume, longest run, pace, and heart-rate context together");
assertCheck(/function garminSyncFailureGuidance\(/.test(trainer) && /Garmin 授權需要更新/.test(trainer) && /沒有建立任何不完整課程/.test(trainer), "Garmin token failures give a precise recovery path without claiming a successful sync");
assertCheck(/focus: 'hills', label: '坡道強化課'/.test(trainer) && /focus: 'fartlek', label: '法特雷克變速課'/.test(trainer) && /hills: variants\[4\]/.test(trainer) && /fartlek: variants\[5\]/.test(trainer), "quality-session rotation for half/5k10k varies into hill repeats and fartlek content instead of only tempo/interval");
assertCheck(/function restDayStrengthSteps\(/.test(trainer) && /休息＋居家肌力 15–20 分/.test(trainer) && /restStrengthCount < 2/.test(trainer) && /injuries\.includes\('knee'\)/.test(trainer) && /injuries\.includes\('plantar'\)/.test(trainer) && /injuries\.includes\('ankle'\)/.test(trainer) && /day\?\.type === 'rest'\) return \[\];/.test(trainer), "rest days carry a home strength routine with injury-specific additions and never parse as a running workout structure");
assertCheck(/function raceDayPackageSteps\(/.test(trainer) && /raceDay\.steps = raceDayPackageSteps\(appData\.profile, raceMaxKm\(race\) \|\| GOAL_DIST\[appData\.profile\?\.goal\] \|\| 10, dateStr\)/.test(trainer), "registered race days are populated with a pacing, fueling, and pre-race checklist package instead of empty steps");

assertCheck(/function fitnessProjection\(/.test(trainer) && /function renderFitnessProjectionCard\(/.test(trainer) && /function goalCycleProposal\(/.test(trainer) && /function renderGoalCycleCard\(/.test(trainer) && /預估完賽/.test(trainer) && /檢討循環/.test(trainer) && /進步循環/.test(trainer), "autopilot tab projects a fitness-based finish time and proposes a next-cycle plan once the target race date has passed");
assertCheck(/function weeklyCoachLetterBody\(/.test(trainer) && /本週教練信/.test(trainer) && /coach-letter-fold/.test(trainer) && !/details class="day-fold"/.test(trainer), "weekly coach letter folds into the week overview while day cards stay fully expanded");
assertCheck(/function renderCheckinHistory\(/.test(trainer) && /歷史評估/.test(trainer) && /checkin-history-item/.test(trainer), "weekly review tab shows past check-in decisions, not only the current form");
assertCheck(/function renderProgressHub\(/.test(trainer) && /function switchProgressPanel\(/.test(trainer) && /progress-hub-panel/.test(trainer) && /\['week', 'coach', 'checkin', 'progress'\]/.test(trainer), "progress hub keeps Garmin, cycle, and analysis in one-at-a-time panels instead of one long page");
assertCheck(/function updatePlanInPlace\(/.test(trainer) && /profile\.generatedAt = oldProfile\.generatedAt \|\| profile\.generatedAt/.test(trainer) && /過去課表、完成／跳過紀錄、補跑與已整合的賽事都會保留/.test(trainer) && !/重新生成會取代目前計畫/.test(trainer), "updating handbook settings reflows only future sessions instead of resetting the whole plan");
assertCheck(/預覽訓練設定更新/.test(trainer) && /套用並重排未來課表/.test(trainer) && /function applyGeneratedPlan\(/.test(trainer), "settings updates preview their future-course impact before applying the reflow");
assertCheck(/function historyComparisonNote\(/.test(trainer) && /比上次同課型/.test(trainer) && /function runMilestones\(/.test(trainer) && /刷新個人紀錄/.test(trainer) && /創單月新高/.test(trainer) && /milestoneNote = runMilestones\(run\)\.map/.test(trainer), "post-run verdict cites the prior same-type session pace delta and celebrates farthest-run and monthly-volume milestones");

const failed = checks.filter((check) => !check.ok);
checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

if (failed.length) {
  process.exitCode = 1;
}
