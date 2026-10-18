import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const [safety, engine, render, actions, trainer] = await Promise.all(['trainer-safety.js', 'trainer-coach-engine.js', 'trainer-render.js', 'trainer-actions.js', 'trainer.js'].map(name => readFile(resolve(root, 'site', name), 'utf8')));
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  let depth = 0;
  for (let i = source.indexOf(') {', start) + 2; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error(name);
}
let today = '2026-10-18';
let review = null;
let context;
const p = {
  appData: { raceRecoveryChecks: {} }, coachReviewData: { recovery: [] },
  todayStr: () => today,
  localDateStr: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  coachReviewForWeek: () => review, buildContext: () => context,
  safetyGuard: () => null, coachPrescription: () => null, paceResolver: () => null,
  courseRationale: () => '', courseResolutionSource: () => 'baseline',
  garminEventTitle: () => '課程', garminMainDistanceKm: day => day.km, garminManualBuilderSteps: () => [],
  garminManualBuilderText: () => '', estimatedGarminWorkoutSeconds: () => 0,
  weeklyRampInfo: () => ({ ramp: 0 }), weeklyRunTrend: () => [], coachRunRecords: () => [],
};
vm.createContext(p);
for (const [source, names] of [
  [trainer, ['addDaysToDateStr']], [safety, ['raceRecoveryDecision', 'courseReleaseDecision', 'coachPromotionGate', 'checkinSafetyDecision']],
  [actions, ['recoverySignalStatus']], [engine, ['resolveCourse']],
  [render, ['weekPlannedKm', 'garminRaceDistanceKm', 'garminEffectiveDistanceKm', 'garminDayHasRunnableWork', 'weeklyGarminSyncPayload']],
]) vm.runInContext(names.map(name => extract(source, name)).join('\n'), p);
const check = { savedAt: '2026-10-21', fatigue: '2', pain: 'none', gait: 'normal' };
assert.equal(p.raceRecoveryDecision('2026-10-18', { ...check, savedAt: '2026-10-18' }, '2026-10-21').blocked, true);
assert.equal(p.raceRecoveryDecision('2026-10-18', check, '2026-10-20').blocked, true);
assert.equal(p.raceRecoveryDecision('2026-10-18', { ...check, fatigue: '' }, '2026-10-21').blocked, true);
assert.equal(p.raceRecoveryDecision('2026-10-18', { ...check, savedAt: '2026-10-22' }, '2026-10-21').blocked, true);
assert.equal(p.raceRecoveryDecision('2026-10-18', check, '2026-10-21').blocked, false);
console.log('PASS race recovery rejects early, future and incomplete reports');
assert.equal(p.recoverySignalStatus(), null);
p.coachReviewData.recovery = [{ date: today, hrvStatus: 'BALANCED' }];
assert.equal(p.recoverySignalStatus().sufficient, false);
p.coachReviewData.recovery = ['2026-10-16', '2026-10-17', today].map(date => ({ date, sleepHours: 7, restingHr: 50, hrvOvernight: 45, hrvWeekly: 45 }));
assert.equal(p.recoverySignalStatus().sufficient, true);
p.coachReviewData.recovery = ['2026-10-12', '2026-10-13', '2026-10-14'].map(date => ({ date, sleepHours: 7, restingHr: 50, hrvOvernight: 45 })).concat([{ date: today, hrvStatus: 'BALANCED' }]);
assert.equal(p.recoverySignalStatus().sufficient, false);
p.coachReviewData.recovery = [];
assert.equal(p.checkinSafetyDecision({ answers: [true, true, true, true], fatigue: 1, painConcern: false }).allowIntensity, false);
const evidence = { qualityPlanned: true, qualityCompleted: true, structuredEvidence: true, rpe: 5 };
assert.equal(p.coachPromotionGate(evidence).status, 'conditional');
assert.equal(p.coachPromotionGate({ ...evidence, recoveryConfirmed: true }).status, 'pass');
console.log('PASS missing recovery and RPE are not promotion evidence');

p.coachReviewData.recovery = ['2026-10-16', '2026-10-17', today].map(date => ({ date, sleepHours: 7, restingHr: 50, hrvOvernight: 45, hrvWeekly: 45 }));
const long = { dateStr: '2026-10-24', type: 'long', km: 18, workoutStructureConfidence: 'formal' };
const week = { weekNum: 1, days: [{ dateStr: '2026-10-19', type: 'easy', km: 9 }, { dateStr: '2026-10-22', type: 'easy', km: 9 }, long] };
context = { today, plan: [week], garminRuns: [{ date: '2026-10-18', km: 11.25 }] };
const pending = p.resolveCourse(long, context, week);
assert.equal(pending.course.releaseStatus, 'pending');
assert(pending.course.releaseReasons.some(reason => reason.includes('40%')));
assert.equal(p.weeklyGarminSyncPayload(week).workouts.some(item => item.date === long.dateStr), false);
assert(p.weeklyGarminSyncPayload(week).skippedDays.some(item => item.reason.includes('40%')));
review = { progressionApproval: { reviewedOn: today, recoveryConfirmed: true, longRunKm: 18, maxLongRunShare: 0.5 } };
const released = p.resolveCourse(pending.course, context, week);
assert.equal(released.course.releaseStatus, undefined);
assert.equal(released.course.workoutStructureConfidence, 'formal');
assert.equal(p.weeklyGarminSyncPayload(week).workouts.some(item => item.date === long.dateStr), true);
assert.equal(p.courseReleaseDecision({ ...long, dateStr: '2026-10-17' }, context, week), null);
console.log('PASS long-run previews require evidence/exception and are re-evaluated without sticky flags');
week.days.push({ dateStr: '2026-10-25', type: 'race', raceDistanceKm: 11 });
assert(p.courseReleaseDecision(long, context, week).reasons.some(reason => reason.includes('疊加')));
console.log('PASS race weeks cannot silently add another hard workout');

today = '2026-12-13';
const secondHalf = { dateStr: today, type: 'race', raceDistanceKm: 21 };
const halfWeek = { days: [secondHalf] };
context = { today, plan: [{ days: [{ dateStr: '2026-12-06', type: 'race', raceDistanceKm: 21 }] }, halfWeek], garminRuns: [] };
review = null;
assert.equal(p.courseReleaseDecision(secondHalf, context, halfWeek).status, 'pending');
p.appData.raceRecoveryChecks['2026-12-06'] = { savedAt: '2026-12-09', pain: 'none', gait: 'normal', fatigue: '2' };
review = { progressionApproval: { reviewedOn: '2026-12-10', recoveryConfirmed: true, approvedRaceDates: [today] } };
assert.equal(p.courseReleaseDecision(secondHalf, context, halfWeek), null);
assert.equal(p.courseReleaseDecision(secondHalf, { ...context, safetyHold: { active: true } }, halfWeek).status, 'pending');
review.progressionApproval.reviewedOn = '2026-12-05';
assert.equal(p.courseReleaseDecision(secondHalf, context, halfWeek).status, 'pending');
console.log('PASS consecutive half marathons require post-event recovery and individual approval');

vm.runInContext([extract(actions, 'coachScheduleDayState'), extract(actions, 'applyCoachPhaseScheduleForWeek')].join('\n'), p);
const nextWeek = { weekNum: 2, phase: 'build', days: ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-31'].map(dateStr => ({ dateStr, type: 'easy', km: 8 })) };
p.appData = { profile: { goal: 'half' }, plan: [{ days: Array.from({ length: 4 }, () => ({ type: 'easy', km: 8 })) }, nextWeek] };
Object.assign(p, {
  coachPhaseForWeek: () => ({ km: '36', focus: '長跑 18 km', phase: '半馬專項' }), coachPhaseIsDeload: () => false,
  coachScheduleContract: () => ({ trainingDows: [1, 2, 4, 6], longDow: 6 }), coachPhaseHasRaceReplacingQuality: () => false,
  buildWorkoutPattern: () => Array.from({ length: 3 }, () => ({ type: 'easy' })),
  futurePlanSnapshot: () => [], canMutatePlanDay: () => true,
  calcWorkoutKm: (_type, volume, _goal, longKm) => (volume - longKm) / 3,
  buildDayCard: (dow, dateStr, type, km) => ({ dow, dateStr, type, km }),
});
assert.equal(p.applyCoachPhaseScheduleForWeek(2, { record: false }), true);
assert.equal(nextWeek.targetKm, 35.2);
p.applyCoachPhaseScheduleForWeek(2, { record: false, constraints: { holdProgression: true } });
assert.equal(nextWeek.targetKm, 32);
console.log('PASS phase progression uses comparable prescribed distance and respects the plan growth ceiling');
