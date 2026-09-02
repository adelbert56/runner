import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

// Real-execution unit checks for a handful of pure trainer pace/time utilities.
// ui-smoke-check.mjs only regex-matches source text; these actually run the
// functions against real inputs, so a broken function body fails here even if
// its signature/keywords are untouched.

const root = resolve(import.meta.dirname, "..");
const checks = [];

function assertEqual(actual, expected, message) {
  const ok = actual === expected;
  checks.push({ ok, message: ok ? message : `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})` });
}

function assertThrows(callback, message) {
  let thrown = false;
  try {
    callback();
  } catch {
    thrown = true;
  }
  checks.push({ ok: thrown, message: thrown ? message : `${message} (did not throw)` });
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`function ${name} not found in source`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces for function ${name}`);
}

const [trainerJs, trainerCopyJs, trainerPlanJs, trainerRenderJs, trainerActionsJs, trainerCoachEngineJs, trainerSafetyJs, trainingReviewBuilder] = await Promise.all([
  readFile(resolve(root, "site/trainer.js"), "utf8"),
  readFile(resolve(root, "site/trainer-copy.js"), "utf8"),
  readFile(resolve(root, "site/trainer-plan.js"), "utf8"),
  readFile(resolve(root, "site/trainer-render.js"), "utf8"),
  readFile(resolve(root, "site/trainer-actions.js"), "utf8"),
  readFile(resolve(root, "site/trainer-coach-engine.js"), "utf8"),
  readFile(resolve(root, "site/trainer-safety.js"), "utf8"),
  readFile(resolve(root, "scripts/build-training-review.mjs"), "utf8"),
]);

const sandbox = { TRAINING_TYPE_LABELS: { easy: "輕鬆跑", tempo: "節奏跑", interval: "間歇跑", long: "長跑" } };
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunction(trainerCopyJs, "secToPace"),
    extractFunction(trainerCopyJs, "coachPlanTrainingType"),
    extractFunction(trainerCopyJs, "coachPlanHeadline"),
    extractFunction(trainerJs, "timeToSec"),
    extractFunction(trainerJs, "targetTimeToSec"),
    extractFunction(trainerJs, "isValidClockInput"),
  ].join("\n\n"),
  sandbox
);
const { secToPace, coachPlanTrainingType, coachPlanHeadline, timeToSec, targetTimeToSec, isValidClockInput } = sandbox;

const structureSandbox = {};
vm.createContext(structureSandbox);
vm.runInContext(extractFunction(trainerPlanJs, "buildGarminWorkoutStructure"), structureSandbox);
const { buildGarminWorkoutStructure } = structureSandbox;

const coachCopySandbox = {};
vm.createContext(coachCopySandbox);
vm.runInContext([extractFunction(trainerRenderJs, "coachPlanMainInstruction"), extractFunction(trainerRenderJs, "normalizeCoachWorkoutSteps")].join("\n\n"), coachCopySandbox);
const { coachPlanMainInstruction, normalizeCoachWorkoutSteps } = coachCopySandbox;

const sessionStorySandbox = {
  paceToSeconds: (pace) => ({ '7:00': 420, '6:50': 410, '6:40': 400, '6:30': 390 }[pace] || 0),
  formatPaceSeconds: (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
};
vm.createContext(sessionStorySandbox);
vm.runInContext([extractFunction(trainerRenderJs, "sessionCoachStory"), extractFunction(trainerRenderJs, "sessionFollowUpAssessment")].join("\n\n"), sessionStorySandbox);
const { sessionCoachStory, sessionFollowUpAssessment } = sessionStorySandbox;

const companionSandbox = {
  coachPlanTrainingType: (text) => /節奏|閾值|(?:^|\s)T\s*跑/.test(String(text || '')) ? 'tempo' : 'easy',
  isHandwrittenCoachPlan: (day) => Boolean(day?.coachPlan),
};
vm.createContext(companionSandbox);
vm.runInContext([extractFunction(trainerRenderJs, "companionWorkoutType"), extractFunction(trainerRenderJs, "runCompanionRecommendation")].join("\n\n"), companionSandbox);
const { companionWorkoutType, runCompanionRecommendation } = companionSandbox;

const cadenceSandbox = {
  COACH_SIGNAL_POLICY: { cadence: { minPassingSpm: 165, sampleRuns: 8, minEvidenceRuns: 4, minLapKm: 0.5, minLapCadence: 150, maxRunningPaceSec: 570 } },
  paceToSeconds: (value) => ({ '8:00': 480, '9:00': 540 }[value] || 0),
};
vm.createContext(cadenceSandbox);
vm.runInContext(extractFunction(trainerCoachEngineJs, "coachCadenceAssessment"), cadenceSandbox);
const { coachCadenceAssessment } = cadenceSandbox;

const weekFlagSandbox = {};
vm.createContext(weekFlagSandbox);
vm.runInContext(extractFunction(trainerRenderJs, "effectiveWeekIsDeload"), weekFlagSandbox);
const { effectiveWeekIsDeload } = weekFlagSandbox;

const racePhaseSandbox = {};
vm.createContext(racePhaseSandbox);
vm.runInContext(extractFunction(trainerActionsJs, "coachPhaseHasRaceReplacingQuality"), racePhaseSandbox);
const { coachPhaseHasRaceReplacingQuality } = racePhaseSandbox;

const scheduledRaceSandbox = {};
vm.createContext(scheduledRaceSandbox);
vm.runInContext(extractFunction(trainerJs, "scheduled10kNeedsStrengthDeload"), scheduledRaceSandbox);
const { scheduled10kNeedsStrengthDeload } = scheduledRaceSandbox;

const scheduledEntrySandbox = {
  coachReviewData: {
    raceDirectives: [
      { date: '2026-11-08', name: '11/8 10K 路跑', distance: '10km', scheduled: true },
      { date: '2026-10-04', role: '舊賽事判讀', scheduled: false },
    ],
  },
};
vm.createContext(scheduledEntrySandbox);
vm.runInContext(extractFunction(trainerJs, "coachScheduledRaceEntries"), scheduledEntrySandbox);
const { coachScheduledRaceEntries } = scheduledEntrySandbox;

const deferredRacePackageSandbox = {
  goalDistanceKm: () => 21.0975,
  secToPace: (seconds) => `pace-${seconds}`,
  coachRaceDirective: () => ({ deferCalibration: true, role: '九月基準檢測' }),
  trainerWeather: {},
  isHotSeasonDate: () => false,
};
vm.createContext(deferredRacePackageSandbox);
vm.runInContext(extractFunction(trainerJs, "raceDayPackageSteps"), deferredRacePackageSandbox);
const { raceDayPackageSteps } = deferredRacePackageSandbox;

const assessmentGateSandbox = {
  coachRaceDirective: (date) => date === '2026-11-15'
    ? { requiresPriorDate: '2026-11-08', role: '半馬前節奏提醒' }
    : date === '2026-09-20'
      ? { deferCalibration: true, role: '九月基準檢測' }
    : null,
  appData: { assessments: [] },
};
vm.createContext(assessmentGateSandbox);
vm.runInContext(extractFunction(trainerActionsJs, "assessmentCalibrationGate"), assessmentGateSandbox);
const { assessmentCalibrationGate } = assessmentGateSandbox;

const coachEngineSandbox = {};
vm.createContext(coachEngineSandbox);
vm.runInContext([extractFunction(trainerCoachEngineJs, "coachPrescribedKm"), extractFunction(trainerCoachEngineJs, "coachPrescribedMainKm")].join("\n\n"), coachEngineSandbox);
const { coachPrescribedKm, coachPrescribedMainKm } = coachEngineSandbox;

const reviewValidationSandbox = {};
vm.createContext(reviewValidationSandbox);
vm.runInContext([
  extractFunction(trainingReviewBuilder, "plannedDistanceKm"),
  extractFunction(trainingReviewBuilder, "targetKmBounds"),
  extractFunction(trainingReviewBuilder, "assertPublishableCoachReview"),
].join("\n\n"), reviewValidationSandbox);
const { assertPublishableCoachReview } = reviewValidationSandbox;

const promotionSandbox = {};
vm.createContext(promotionSandbox);
vm.runInContext(extractFunction(trainerSafetyJs, "coachPromotionGate"), promotionSandbox);
const { coachPromotionGate } = promotionSandbox;

// secToPace
assertEqual(secToPace(330), "5:30", "secToPace formats whole minutes:seconds");
assertEqual(secToPace(305), "5:05", "secToPace zero-pads sub-10 seconds");
assertEqual(secToPace(0), "—", "secToPace shows em-dash for zero/invalid seconds");
assertEqual(secToPace(-5), "—", "secToPace shows em-dash for negative seconds");

// 單堂主課敘事：只依 Garmin 主課步驟、以順序拆前中後段，缺值不臆測。
const story = sessionCoachStory({ laps: [
  { intensity: 'WARMUP', pace_per_km: '7:00', distance_km: 1, duration_min: 7, avg_hr: 120, avg_cadence: 170 },
  { intensity: 'ACTIVE', pace_per_km: '7:00', distance_km: 1, duration_min: 7, avg_hr: 130, avg_cadence: 176 },
  { intensity: 'ACTIVE', pace_per_km: '6:50', distance_km: 1, duration_min: 6.8333, avg_hr: 140, avg_cadence: 178 },
  { intensity: 'ACTIVE', pace_per_km: '6:40', distance_km: 1, duration_min: 6.6667, avg_hr: 150, avg_cadence: 180 },
  { intensity: 'ACTIVE', pace_per_km: '6:30', distance_km: 1, duration_min: 6.5, avg_hr: 160, avg_cadence: 181 },
] });
assertEqual(story?.segments.length, 3, "single-session coach story splits an ACTIVE main workout into ordered front, middle, and finish evidence");
assertEqual(story?.segments[0]?.label, '主課前段', "single-session coach story labels the first main segment without treating warmup as main work");
assertEqual(story?.segments.at(-1)?.hr, 155, "single-session coach story time-weights heart rate across the final main segment");
assertEqual(story?.headline.includes('後段比前段快 25 秒/km'), true, "single-session coach story reports pace change instead of inventing a training upgrade");
const missingMetricStory = sessionCoachStory({ laps: [
  { intensity: 'MAIN', pace_per_km: '7:00', distance_km: 1, duration_min: 7 },
  { intensity: 'MAIN', pace_per_km: '6:50', distance_km: 1, duration_min: 6.8333 },
] });
assertEqual(missingMetricStory?.headline.includes('心率未提供'), true, "single-session coach story explicitly downgrades missing heart-rate evidence");
const followUp = sessionFollowUpAssessment({ date: '2026-09-02' }, {
  status: 'ready', label: '小幅推進', volumeFactor: 1.05, qualityMode: 'keep', headline: '近兩週完成度穩定，可小幅推進。',
  metrics: { latestRunDate: '2026-09-02', qualityComparisonSampleSize: 2, qualityComparisonReady: true, comparisonFamily: 'steady' }
});
assertEqual(followUp.title, '評比完成：小幅推進', "single-session report exposes the completed downstream course assessment instead of only its sample count");
assertEqual(followUp.detail.includes('未來跑量 +5%'), true, "single-session report names the actual future-volume direction when an assessment is ready");
assertEqual(sessionFollowUpAssessment({ date: '2026-09-02' }, { status: 'ready', metrics: { latestRunDate: '2026-09-02', qualityComparisonSampleSize: 1, qualityComparisonReady: false, comparisonFamily: 'steady' } }).title, '評比資料累積中', "single-session report makes insufficient comparison evidence visible");

// timeToSec
assertEqual(timeToSec("2:10:00"), 7800, "timeToSec parses H:MM:SS");
assertEqual(timeToSec("5:30"), 330, "timeToSec parses M:SS");
assertEqual(timeToSec(""), 0, "timeToSec returns 0 for empty input");
assertEqual(timeToSec("abc"), 0, "timeToSec returns 0 for non-numeric input");

// targetTimeToSec: the "2:10" ambiguity bug fixed 2026-07 — a two-segment
// input must be read as H:MM when treating it as M:SS implies a
// world-record-beating pace for the target distance.
assertEqual(targetTimeToSec("2:10", 21.0975), 7800, "targetTimeToSec reads ambiguous '2:10' as 2h10m for a half marathon");
assertEqual(targetTimeToSec("2:10:00", 21.0975), 7800, "targetTimeToSec passes through unambiguous H:MM:SS");
assertEqual(targetTimeToSec("25:00", 5), 1500, "targetTimeToSec keeps a genuine M:SS-as-total-time reading when the implied pace is realistic");

// isValidClockInput
assertEqual(isValidClockInput("2:10", [2, 3]), true, "isValidClockInput accepts H:MM");
assertEqual(isValidClockInput("2:10:00", [2, 3]), true, "isValidClockInput accepts H:MM:SS");
assertEqual(isValidClockInput("2:70", [2, 3]), false, "isValidClockInput rejects out-of-range minutes/seconds");
assertEqual(isValidClockInput("0:30", [2, 3]), false, "isValidClockInput rejects a zero leading unit");
assertEqual(isValidClockInput("7:30", [2]), true, "isValidClockInput accepts M:SS pace input");

const intervalStructure = buildGarminWorkoutStructure("interval", [
  { title: "熱身", dose: "15 分" },
  { title: "主課", dose: "4×400m", detail: "目標配速 4:30/km，每趟之間慢跑 90 秒恢復。" },
  { title: "收操", dose: "10 分" },
], 5.5, "配速 4:30/km · HR 160–170");
assertEqual(intervalStructure[1]?.kind, "repeat", "interval main work is emitted as a Garmin repeat group");
assertEqual(intervalStructure[0]?.end?.type, "time", "warmup remains a time step for in-place preparation");
assertEqual(intervalStructure.at(-1)?.end?.type, "time", "cooldown remains a time step instead of an invented distance");
assertEqual(intervalStructure[1]?.children?.[0]?.end?.value, 400, "interval repeat uses the prescribed fast-segment distance");
assertEqual(intervalStructure[1]?.children?.[1]?.end?.value, 90, "interval repeat uses the prescribed recovery duration");

const tempoStructure = buildGarminWorkoutStructure("tempo", [
  { title: "熱身", dose: "12 分" },
  { title: "主課", dose: "2×2.5 km", detail: "兩段節奏跑，中間慢跑 3 分鐘恢復。" },
  { title: "收操", dose: "8 分" },
], 7, "配速 4:50/km · HR 150–160");
assertEqual(tempoStructure[1]?.children?.[0]?.end?.value, 2500, "tempo cruise repeats use per-block distance, not total workout distance");

const fartlekStructure = buildGarminWorkoutStructure("interval", [
  { title: "熱身", dose: "15 分" },
  { title: "主課", dose: "3–4 組", detail: "每組快跑 3 分 + 慢跑 2 分。" },
  { title: "收操", dose: "10 分" },
], 5, "配速 4:45/km");
assertEqual(fartlekStructure[1]?.children?.[0]?.end?.value, 180, "fartlek fast segments use Garmin time steps");
assertEqual(fartlekStructure[1]?.children?.[1]?.end?.value, 120, "fartlek recovery segments use Garmin time steps");
assertEqual(coachPlanMainInstruction('總 5.5 km（含 ST）：0.8 km 熱身＋E 主課約 3.6 km＋ST 快步 4×20 秒＋0.7 km 收操＋肌力 B。'), 'E 主課約 3.6 km＋ST 快步 4×20 秒。', "coach main-card copy excludes warmup and cooldown distance");
assertEqual(coachPlanMainInstruction('總約 8.0 km：8 分鐘熱身＋6×（2 分 T 體感／2 分 E 慢跑）＋E 補足 4.0 km＋6 分鐘收操；前夜睡眠 <6 小時則改全程 E 8 km。'), '6×（2 分 T 體感／2 分 E 慢跑）＋E 補足 4.0 km；前夜睡眠 <6 小時則改全程 E 8 km。', "coach main-card copy excludes duplicate timed warmup and cooldown");
assertEqual(coachPlanHeadline('總 5.5 km（含 ST）：0.8 km 熱身＋E 主課約 3.6 km＋ST 快步 4×20 秒。'), '輕鬆跑', "coach heading keeps the easy-run title when the prescription uses E main-work notation");
assertEqual(coachPlanTrainingType('跑步總量約 8 km：20 分連續節奏（約 3 km）＋E 跑 5 km（HR≤150）。'), 'tempo', "a tempo test remains tempo when E mileage follows it");
assertEqual(coachPlanHeadline('跑步總量約 8 km：20 分連續節奏（約 3 km）＋E 跑 5 km（HR≤150）。'), '節奏跑', "coach heading labels the quality workout instead of its E completion mileage");
const repairedLegacyCoachStructure = normalizeCoachWorkoutSteps([
  { kind: 'warmup', title: '熱身', end: { type: 'distance', value: 800, label: '0.8 km' } },
  { kind: 'main', title: '主課', end: { type: 'distance', value: 4500, label: '4.5 km' } },
  { kind: 'cooldown', title: '收操', end: { type: 'distance', value: 700, label: '0.7 km' } },
], { type: 'easy', km: 5.5 });
assertEqual(repairedLegacyCoachStructure[0]?.end?.type, 'time', "legacy coach warmup becomes a time step instead of a distance requirement");
assertEqual(repairedLegacyCoachStructure[1]?.end?.value, 5500, "legacy easy-run main distance remains the planned 5.5 km");
assertEqual(repairedLegacyCoachStructure[2]?.end?.type, 'time', "legacy coach cooldown becomes a time step instead of a distance requirement");
assertEqual(coachPrescribedKm({ km: 14 }, { totalKm: 13 }), 13, "confirmed coach totalKm overrides the generator's stale day distance");
assertEqual(coachPrescribedKm({ km: 14 }, {}), 14, "coach distance falls back to the generated day only when no confirmed total exists");
assertEqual(coachPrescribedMainKm({ km: 7 }, { totalKm: 6.5, steps: [{ kind: 'main', end: { type: 'distance', value: 4600 } }, { kind: 'repeat', title: 'ST 快步組', detail: '每趟快步' }] }), 4.6, "stride sessions keep their explicit main-run distance instead of adding strides on top of total mileage");
assertEqual(coachPrescribedMainKm({ km: 8 }, { totalKm: 8, steps: [{ kind: 'repeat', title: 'T 體感組', children: [{ kind: 'interval', end: { type: 'time', value: 120 } }] }, { kind: 'main', end: { type: 'distance', value: 4000 } }] }), 4, "timed quality repeats keep their explicit Z2 completion distance instead of adding the total session distance");
assertEqual(coachPrescribedMainKm({ km: 14 }, { totalKm: 13, steps: [{ kind: 'main', end: { type: 'distance', value: 11500 } }] }), 13, "long-run total remains the main-run target when warmup and cooldown are time-based");
assertEqual(effectiveWeekIsDeload({ isDeload: true }, { phase: "基礎強化", focus: "品質課" }), false, "formal base phase overrides the generator's stale deload flag");
assertEqual(effectiveWeekIsDeload({ isDeload: false }, { phase: "降載", focus: "吸收訓練" }), true, "formal deload phase overrides the generator's non-deload flag");
assertEqual(effectiveWeekIsDeload({ isDeload: true }, null), true, "legacy plans retain their generated deload flag without a formal phase");
assertEqual(coachPhaseHasRaceReplacingQuality({ focus: "11/8、11/15 兩場 10K 賽事取代品質課" }), true, "confirmed 10K race weeks remove an extra quality session");
assertEqual(coachPhaseHasRaceReplacingQuality({ focus: "長跑 16 km @E" }), false, "normal long-run weeks retain their separately planned quality decision");
assertEqual(scheduled10kNeedsStrengthDeload({ scheduled: true, distance: '10km' }), true, "scheduled 10K races deload strength 48 hours before start");
assertEqual(scheduled10kNeedsStrengthDeload({ scheduled: true, distance: '21km' }), false, "half-marathon directives do not use the 10K strength-deload rule");
assertEqual(coachScheduledRaceEntries().length, 1, "only coach-confirmed scheduled races are integrated without registration data");
assertEqual(coachScheduledRaceEntries()[0]?.race_date, '2026-11-08', "scheduled-race integration preserves the confirmed race date");
assertEqual(assessmentCalibrationGate({ date: '2026-09-20' }).allowed, false, "9/20 10K retains evidence for coach review instead of auto-calibrating pace");
assertEqual(raceDayPackageSteps({ goal: 'half', racePaceSec: 384 }, 10, '2026-09-20')[1]?.detail.includes('pace-'), false, "deferred 10K race card never reverse-calculates a pace from the half-marathon target");
assertEqual(assessmentCalibrationGate({ date: '2026-11-15' }).allowed, false, "11/15 10K cannot recalibrate the half-marathon before 11/8 evidence exists");
assessmentGateSandbox.appData.assessments.push({ date: '2026-11-08', type: 'race_10k' });
assertEqual(assessmentCalibrationGate({ date: '2026-11-15' }).allowed, true, "11/15 10K may calibrate only after the 11/8 race evidence is retained");
assertThrows(() => assertPublishableCoachReview(JSON.stringify({
  reviewMode: 'final',
  nextWeek: {
    targetKm: '8',
    menu: [{
      day: '二', totalKm: 8,
      steps: [
        { kind: 'main', end: { type: 'time', value: 1200 }, title: '20 分節奏' },
        { kind: 'main', end: { type: 'distance', value: 8000, label: '補至手錶總量 8 km' }, title: 'E 跑補量' },
      ],
    }],
  },
})), "cumulative total cannot be published as a second Garmin distance step");

assertEqual(coachPromotionGate({ qualityPlanned: true, qualityCompleted: true, structuredEvidence: true, rpe: 7 }).status, 'pass', "structured quality evidence with controlled RPE passes the progression gate");
assertEqual(coachPromotionGate({ qualityPlanned: true, qualityCompleted: true, structuredEvidence: false, rpe: 6 }).status, 'conditional', "missing structured Garmin main evidence cannot advance long runs or intervals");
assertEqual(coachPromotionGate({ qualityPlanned: true, qualityCompleted: true, structuredEvidence: true, nextDayPain: true, rpe: 6 }).status, 'blocked', "next-day pain blocks quality progression regardless of pace result");

assertEqual(companionWorkoutType({ type: 'easy', focus: 'recovery', coachPlan: true, task: '節奏跑 20 分鐘後 E 跑補量' }), 'tempo', "coach tempo prescription takes precedence over stale easy/recovery fields for companion selection");
assertEqual(runCompanionRecommendation({ type: 'easy', focus: 'recovery', coachPlan: true, task: '節奏跑 20 分鐘後 E 跑補量' }).title, '節奏跑的陪伴', "tempo companion never falls back to recovery content");
assertEqual(runCompanionRecommendation({ type: 'easy', focus: 'recovery' }).title, '恢復跑的陪伴', "genuine recovery run retains low-stimulation companion content");
const cadenceWeighting = coachCadenceAssessment([
  { qualityEligible: true, qualityCadence: 150, qualityKm: 1 },
  { qualityEligible: true, qualityCadence: 170, qualityKm: 8 },
  { qualityEligible: true, qualityCadence: 170, qualityKm: 8 },
  { qualityEligible: true, qualityCadence: 170, qualityKm: 8 },
]);
assertEqual(cadenceWeighting.displayed, 169, "cadence caution uses distance-weighted effective main work instead of letting a short session dominate");

checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  process.exitCode = 1;
}
