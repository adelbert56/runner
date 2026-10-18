// Executes production decision/sync functions in isolation; never reads personal records.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const read = path => readFile(resolve(root, path), 'utf8');
const [trainer, render, engine, copy, plan, server] = await Promise.all([
  read('site/trainer.js'), read('site/trainer-render.js'), read('site/trainer-coach-engine.js'),
  read('site/trainer-copy.js'), read('site/trainer-plan.js'),
  read('site/server.mjs'),
]);
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  const brace = source.indexOf(') {', start) + 2;
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(source.slice(start - 6, start) === 'async ' ? start - 6 : start, i + 1);
  }
  throw new Error(`Unbalanced ${name}`);
}
const review = { nextWeek: { weekStart: '2026-10-12', restDates: ['2026-10-14', '2026-10-16', '2026-10-17'], menu: [
  { date: '2026-10-12', scheduledDow: 1, totalKm: 5, plan: '恢復 E 跑 5 km' },
  { date: '2026-10-13', scheduledDow: 2, totalKm: 6, plan: '輕鬆跑 6 km' },
  { date: '2026-10-15', scheduledDow: 4, totalKm: 4, plan: '輕鬆跑 4 km' },
  { date: '2026-10-18', scheduledDow: 0, totalKm: 11, plan: '11K 路跑', steps: [{ kind: 'main', end: { type: 'distance', value: 11000 } }] },
] }, raceDirectives: [{ date: '2026-10-11', distance: '10km' }, { date: '2026-10-18', distance: '11km' }] };
const week = { weekNum: 1, days: Array.from({ length: 7 }, (_, index) => {
  const dow = (index + 1) % 7;
  const entry = review.nextWeek.menu.find(item => item.scheduledDow === dow);
  return { dateStr: `2026-10-${12 + index}`, dow, type: dow === 0 ? 'race' : entry ? 'easy' : 'rest',
    km: dow === 0 ? 0 : entry?.totalKm || 0, status: 'planned',
    ...(dow === 0 ? { raceReplacement: 'race', raceDistanceKm: 11, raceName: '11K' } : {}) };
}) };
let releaseFetch;
const events = [];
const sandbox = {
  appData: { profile: {}, plan: [week], log: [] }, coachReviewData: review,
  window: {}, TRAINING_TYPE_LABELS: { easy: '輕鬆跑', race: '賽事' },
  currentWeek: 1, todayStr: () => '2026-10-12', goalDistanceKm: () => 21.0975,
  localDateStr: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  buildContext: () => ({ plan: sandbox.appData.plan, today: sandbox.todayStr(), todayWeek: 1, completion: { allActivity: [], totalKm: 0 } }),
  safetyGuard: () => null, paceResolver: () => ({}), courseRationale: () => '', courseResolutionSource: () => 'baseline',
  coachWorkoutStructure: (_text, _day, steps) => steps, coachStructureConfidence: () => 'coach',
  raceDayPackageSteps: () => [], saveData: () => {},
  runnerRegisteredRaceKeys: () => new Set(['previous', 'current']), runnerRaceKey: race => race.race_id,
  coachScheduledRaceEntries: () => [], fetch: () => new Promise(resolve => { releaseFetch = resolve; }),
  refreshPlanAfterRaceSync: () => events.push('race refresh'), recordRaceIntegrationLog: () => {}, console,
  trainingDataHealth: () => ({}), trainingAutopilotDecision: () => ({}), buildStatusReminders: () => ({}),
  garminActivityRecords: () => [], makeupCompletionCredits: () => new Map(), activityCompletesDay: () => false,
  garminEventTitle: () => '課程', garminManualBuilderText: () => '',
  garminManualBuilderSteps: day => day.workoutStructure || [],
};
vm.createContext(sandbox);
for (const [source, names] of [
  [copy, ['coachPlanTrainingType', 'coachPlanHeadline']],
  [render, ['coachPlanMainInstruction', 'coachReviewForWeek', 'coachDaysForWeek', 'coachMenuForCurrentSchedule', 'materializeCoachReviewWeek', 'weekPlannedKm', 'effectiveWeekVolumeTarget', 'trainingCompletionSummary', 'garminDayHasRunnableWork', 'garminRaceDistanceKm', 'garminEffectiveDistanceKm', 'garminMainDistanceKm', 'estimatedGarminWorkoutSeconds', 'weeklyGarminSyncPayload']],
  [engine, ['coachPrescribedKm', 'coachPrescribedMainKm', 'hasDatedCoachRecovery', 'coachPrescription', 'resolveCourse', 'planStatus']],
  [trainer, ['coachRaceDirective', 'confirmedRaceDistanceKm', 'participantRaceDistanceKm', 'raceMaxKm', 'flattenPlanDays', 'postRaceRecoveryDayCount', 'addDaysToDateStr', 'readableRaceInstruction', 'scheduled10kNeedsStrengthDeload', 'applyRegisteredSundayRaceReplacements', 'syncRegisteredSundayRaces']],
  [plan, ['planDayLockReason']],
]) vm.runInContext(names.map(name => extract(source, name)).join('\n'), sandbox);

const races = [
  { race_id: 'previous', race_date: '2026-10-11', race_name: '10K', distances: ['10km'] },
  { race_id: 'current', race_date: '2026-10-18', race_name: '11K', distances: ['42.195km', '21km', '11km', '4km'] },
];
assert.equal(sandbox.participantRaceDistanceKm(races[1], '2026-12-01'), 0);
assert.equal(sandbox.participantRaceDistanceKm(races[1], '2026-10-18'), 11);
console.log('PASS unknown multi-category distance stays unknown; confirmed 11K wins');
const pending = sandbox.syncRegisteredSundayRaces();
sandbox.materializeCoachReviewWeek();
events.push('coach materialized');
releaseFetch({ ok: true, json: async () => races });
await pending;
assert.deepEqual(events, ['coach materialized', 'race refresh']);
assert.equal(sandbox.weekPlannedKm(week), 26);
assert.equal(week.days.filter(day => day.type !== 'rest').length, 4);
console.log('PASS delayed race fetch cannot rewrite confirmed 26K/four sessions');

// Reverse arrival order: generic recovery is applied before the review is unlocked.
const earlyWeek = JSON.parse(JSON.stringify(week));
earlyWeek.days.forEach(day => { delete day.coachPlan; });
sandbox.appData.plan = [earlyWeek];
sandbox.coachReviewData = null;
sandbox.applyRegisteredSundayRaceReplacements(races);
assert.equal(sandbox.weekPlannedKm(earlyWeek), 9);
assert.equal(earlyWeek.days[6].raceDistanceStatus, 'unconfirmed');
sandbox.coachReviewData = review;
sandbox.materializeCoachReviewWeek();
assert.equal(sandbox.weekPlannedKm(earlyWeek), 26);
assert.equal(sandbox.planDayLockReason(earlyWeek.days[0], 'coach'), '');
for (let index = 0; index < 3; index++) sandbox.applyRegisteredSundayRaceReplacements(races);
assert.equal(sandbox.weekPlannedKm(earlyWeek), 26);
sandbox.appData.plan = JSON.parse(JSON.stringify(sandbox.appData.plan));
assert.equal(sandbox.weekPlannedKm(sandbox.appData.plan[0]), 26);
console.log('PASS race-before-unlock, repeated sync, and storage reload retain 26K');

// A legacy persisted state can still be encountered; summary must read the resolved course.
const staleWeek = sandbox.appData.plan[0];
Object.assign(staleWeek.days[0], { type: 'rest', km: 0 });
Object.assign(staleWeek.days[1], { type: 'easy', km: 5 });
sandbox.todayStr = () => '2026-10-19';
staleWeek.days.filter(day => day.type !== 'rest').forEach(day => { day.status = 'done'; });
const status = sandbox.planStatus(sandbox.buildContext());
assert.equal(status.weekTargetKm, 26);
assert.equal(status.currentWeekDays, 4);
assert.equal(status.currentWeekCompleted, 3);
assert.equal(status.adherence, 75);
const mileageStatus = sandbox.planStatus({ ...sandbox.buildContext(), completion: { totalKm: 29.41, allActivity: [
  { date: '2026-10-12', actualKm: 5.4, actualTimeMins: 40.1 }, { date: '2026-10-13', actualKm: 6.48, actualTimeMins: 44.1 },
  { date: '2026-10-15', actualKm: 6.28, actualTimeMins: 44.6 }, { date: '2026-10-18', actualKm: 11.25, actualTimeMins: 75.3 },
] } });
assert.equal(mileageStatus.weekProgressPct, 75);
assert.equal(Number(mileageStatus.weekDoneKm.toFixed(2)), 29.41);
assert.equal(Number(mileageStatus.weekTotalMinutes.toFixed(1)), 204.1);
const garminWeek = sandbox.weeklyGarminSyncPayload(staleWeek);
assert.equal(garminWeek.workouts.length, 4);
assert.equal(garminWeek.workouts.reduce((sum, workout) => sum + workout.km, 0), 26);
console.log('PASS selected historical week uses four resolved sessions and preserves three completions');

const unconfirmed = { type: 'race', dateStr: '2026-12-01', km: 42.195, raceDistanceKm: 42.195,
  raceName: '42K / 11K', raceDistanceStatus: 'unconfirmed' };
assert.equal(sandbox.garminDayHasRunnableWork(unconfirmed), false);
assert.equal(sandbox.garminEffectiveDistanceKm(unconfirmed), 0);
assert.equal(sandbox.weekPlannedKm({ days: [unconfirmed] }), 0);
assert.match(sandbox.effectiveWeekVolumeTarget({ days: [unconfirmed] }).display, /距離待確認/);
console.log('PASS unknown distance cannot leak from stale fields or race title into Garmin/weekly target');

// Check both sides of resolution: original type may be easy before coach assigns tempo.
const originalGuard = sandbox.safetyGuard;
sandbox.safetyGuard = day => day.type === 'tempo' ? ({ course: { ...day, type: 'easy', safetyOverride: true }, source: 'safety-override' }) : null;
const originalPrescription = sandbox.coachPrescription;
sandbox.coachPrescription = day => ({ course: { ...day, type: 'tempo' }, source: 'coach-prescription' });
assert.equal(sandbox.resolveCourse({ type: 'easy' }, sandbox.buildContext(), staleWeek).source, 'safety-override');
sandbox.coachPrescription = originalPrescription;
sandbox.safetyGuard = originalGuard;
console.log('PASS safety is checked after coach changes the workout type');
const previousContext = sandbox.buildContext;
const previousToday = sandbox.todayStr;
vm.runInContext(extract(engine, 'safetyGuard'), sandbox);
sandbox.todayStr = () => '2026-10-12';
sandbox.buildContext = () => ({ ...previousContext(), today: '2026-10-12', safetyHold: { active: true } });
sandbox.coachPrescription = day => ({ course: { ...day, type: 'tempo', km: 8 }, source: 'coach-prescription' });
const protectedBeforeMaterialize = JSON.stringify(sandbox.appData.plan);
sandbox.materializeCoachReviewWeek();
assert.equal(JSON.stringify(sandbox.appData.plan[0].days), JSON.stringify(JSON.parse(protectedBeforeMaterialize)[0].days));
sandbox.coachPrescription = originalPrescription;
sandbox.safetyGuard = originalGuard;
sandbox.buildContext = previousContext;
sandbox.todayStr = previousToday;
console.log('PASS production safety guard prevents materialization from overwriting protected workouts');

// Exercise the real storage writer and immutable-course layer. Only unrelated
// schema normalization, profile networking and coach-memory handling are substituted.
const stored = new Map();
Object.assign(sandbox, {
  STORAGE_KEY: 'test:trainer',
  localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
  syncCoachProfileSnapshot: () => {},
  mergeCoachMemory: (...lists) => lists.flat().filter(Boolean),
  normalizeData: data => {
    const normalized = JSON.parse(JSON.stringify(data));
    sandbox.restoreFrozenCourseArchive(normalized);
    return normalized;
  },
});
vm.runInContext(['cloneTrainingValue', 'normalizeCoachPlanArchive', 'normalizeFrozenCourseArchive', 'frozenCourseDaySnapshot', 'trainerUiFixtureMode', 'restoreFrozenCourseArchive', 'snapshotFrozenCourseArchive', 'normalizeDayStatuses', 'applyStoredDayStatuses', 'preservePersistedCompletedRuns', 'snapshotStoredCoachWeeks', 'repairConfirmedRaceCourseArchive', 'saveData'].map(name => extract(trainer, name)).join('\n'), sandbox);
const legacy = JSON.parse(JSON.stringify({ ...sandbox.appData, frozenCourseArchive: { version: 1, days: {} } }));
legacy.log = [{ date: '2026-10-13', source: 'garmin', actualKm: 6.48 }];
legacy.plan[0].days[0] = { ...legacy.plan[0].days[0], type: 'rest', km: 0 };
legacy.plan[0].days[1] = { ...legacy.plan[0].days[1], type: 'easy', km: 5, status: 'done' };
legacy.plan[0].days[6].raceDistanceKm = 42.195;
legacy.plan[0].days[6].km = 42.195;
sandbox.snapshotFrozenCourseArchive(legacy);
stored.set('test:trainer', JSON.stringify(legacy));
const repaired = sandbox.saveData(JSON.parse(JSON.stringify(legacy)));
assert.equal(sandbox.weekPlannedKm(repaired.plan[0]), 26);
assert.equal(repaired.plan[0].days[1].status, 'done');
assert.equal(repaired.log[0].actualKm, 6.48);
assert.equal(repaired.frozenCourseArchive.days['2026-10-12'].day.km, 5);
assert.equal(repaired.frozenCourseArchive.days['2026-10-18'].day.raceDistanceKm, 11);
assert.equal(sandbox.garminEffectiveDistanceKm(repaired.plan[0].days[6]), 11);
assert.equal(repaired.plan[0].targetKm, 26);
assert.equal(JSON.stringify(repaired.frozenCourseArchive.days['2026-10-14'].day), JSON.stringify(legacy.frozenCourseArchive.days['2026-10-14'].day));
assert.equal(repaired.frozenCourseArchive.days['2026-10-12'].day.courseDataCorrection.version, 1);
assert.equal(sandbox.weekPlannedKm(sandbox.saveData(JSON.parse(JSON.stringify(legacy))).plan[0]), 26);
console.log('PASS actual save/frozen restore repairs only confirmed bad snapshots and resists stale writers');
const protectedData = JSON.parse(stored.get('test:trainer'));
Object.assign(protectedData.frozenCourseArchive.days['2026-10-12'].day, { type: 'rest', km: 0, safetyOverride: true });
stored.set('test:trainer', JSON.stringify(protectedData));
assert.equal(sandbox.weekPlannedKm(sandbox.saveData(protectedData).plan[0]), 21);
console.log('PASS explicit frozen safety override remains protected instead of forcing 26K');

vm.runInContext(extract(server, 'coachProfileSnapshot'), sandbox);
const profileSnapshot = sandbox.coachProfileSnapshot({ profile: { dayState: [0, 1, 1, 0, 1, 0, 2] } }, {});
assert.equal(JSON.stringify(profileSnapshot.profile.trainingDows), '[1,2,4,6]');
assert.equal(profileSnapshot.profile.longRunDay, 6);
console.log('PASS coach snapshot exports weekday indexes, not day-state values');
console.log('PASS trainer lifecycle acceptance checks');
