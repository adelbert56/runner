import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { removeRepeatedGarminSummaries } from './trainer-backup-candidate.mjs';

function extract(code, name) {
  const start = code.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const opening = code.indexOf(') {', start) + 2;
  let depth = 0;
  for (let i = opening; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1);
  }
  throw Error(`unclosed: ${name}`);
}
const trainer = await readFile('site/trainer.js', 'utf8');
const render = await readFile('site/trainer-render.js', 'utf8');
const summary = { date: '2026-01-01', type: 'easy', plannedKm: 5, actualKm: 5, actualTimeMins: 30, rpe: 0, notes: 'Garmin 同步', source: 'garmin' };
const raw = { date: '2026-01-01', type: 'run', source: 'garmin', activityId: null, actualKm: 5, hr: 140, pace: '6:00', recoveredActivityType: 'running' };
const other = { date: '2026-01-01', type: 'run', source: 'garmin', activityId: 'activity-2', actualKm: 2, hr: 130, pace: '7:00' };
const data = { plan: [{ weekNum: 1, days: [{ dateStr: '2026-01-01', type: 'easy', km: 5, status: 'planned' }] }], log: [summary, raw, other], dayStatuses: {} };
let persisted = structuredClone(data);
const sandbox = vm.createContext({
  appData: data, garminActivityRecords: () => [{ date: '2026-01-01', km: 5, pace: '6:00' }],
  paceToMinutes: () => 6, archivedCoachWeek: () => null, cloneTrainingValue: structuredClone,
  normalizeDayStatuses: x => x || {}, applyStoredDayStatuses() {}, activityCompletesDay: () => false,
  makeupCompletionCredits: () => new Map(), todayStr: () => '2026-01-02',
  saveData(value) { sandbox.preservePersistedCompletedRuns(value, persisted); persisted = structuredClone(value); },
});
vm.runInContext(`${extract(trainer, 'preservePersistedCompletedRuns')}\n${extract(render, 'syncGarminRunsToPlan')}`, sandbox);
for (let n = 0; n < 5; n++) sandbox.syncGarminRunsToPlan({});
assert.equal(data.log.length, 3);
assert.deepEqual(data.log[1], raw); assert.deepEqual(data.log[2], other);

// A sole raw activity must not be replaced by a generated daily summary.
data.log = [structuredClone(raw)]; persisted = structuredClone(data);
for (let n = 0; n < 5; n++) sandbox.syncGarminRunsToPlan({});
assert.equal(data.log.length, 1); assert.deepEqual(data.log[0], raw);

// Manual entry remains authoritative when a raw Garmin record shares the date.
const manual = { date: '2026-01-01', type: 'easy', source: 'manual', actualKm: 4, notes: 'fixture' };
data.log = [manual, structuredClone(raw)]; persisted = structuredClone(data);
for (let n = 0; n < 5; n++) sandbox.syncGarminRunsToPlan({});
assert.equal(data.log.length, 2); assert.deepEqual(data.log[0], manual); assert.deepEqual(data.log[1], raw);
console.log('PASS repeated Garmin sync preserves raw activities, manual entries and stable record count');
const mixed = [summary, structuredClone(summary), raw, structuredClone(raw), other, manual, structuredClone(manual), { ...summary, actualKm: 6 }];
const candidate = removeRepeatedGarminSummaries({ plan: [], log: mixed });
assert.equal(candidate.removed, 1);
assert.equal(candidate.data.log.length, mixed.length - 1);
assert.equal(candidate.data.log.filter(x => x.recoveredActivityType).length, 2);
assert.equal(candidate.data.log.filter(x => x.source === 'manual').length, 2);
assert.equal(mixed.length, 8);
console.log('PASS candidate removes only exact generated summaries and leaves source data untouched');
