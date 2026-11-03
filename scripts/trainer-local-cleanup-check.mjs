import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { removeRepeatedGarminSummaries } from './trainer-backup-candidate.mjs';

const code = await readFile('site/trainer-local-backup.js', 'utf8');
const summary = { date: '2026-01-01', type: 'easy', actualKm: 5, source: 'garmin', notes: 'Garmin 同步' };
const rawActivity = { date: '2026-01-01', type: 'run', actualKm: 5, source: 'garmin', activityId: null, hr: 130 };
const input = { profile: {}, plan: [{ days: [] }], log: [summary, structuredClone(summary), rawActivity], recoveryManifest: { kind: 'partial-reconstruction' } };

async function scenario(mode) {
  let value = JSON.stringify(input);
  let callback, reloaded = false, shown = '';
  const receipts = [];
  const storage = { getItem: () => value, setItem: (_key, next) => { value = next; } };
  const context = vm.createContext({
    window: { TrainerSync: {} }, document: { readyState: 'loading', addEventListener: (_type, fn) => { callback = fn; } },
    location: { hostname: '127.0.0.1', port: '4173', reload() { reloaded = true; } },
    localStorage: storage, STORAGE_KEY: 'fixture', structuredClone, AbortSignal, setTimeout, clearTimeout,
    showModal: title => { shown = title; }, closeModal() {},
    fetch: async (_url, options) => {
      const payload = JSON.parse(options.body); receipts.push(payload);
      if (mode === 'backup-fails' && payload.reason === 'after-cleanup') throw Error('fixture');
      if (mode === 'concurrent' && payload.reason === 'after-cleanup') value = JSON.stringify({ ...input, extraConcurrentEdit: true });
      return { ok: true, json: async () => ({ verified: true }) };
    },
  });
  vm.runInContext(code, context);
  assert.equal(typeof callback, 'function');
  await callback();
  return { data: JSON.parse(value), receipts, reloaded, shown, exported: context.window.TrainerLocalBackup };
}
const ok = await scenario('success');
assert.equal(ok.reloaded, true); assert.deepEqual(ok.receipts.map(x => x.reason), ['before-cleanup', 'after-cleanup']);
assert.equal(ok.data.log.length, 2); assert.deepEqual(ok.data.log[1], rawActivity);
assert.equal(JSON.stringify(ok.data), JSON.stringify(removeRepeatedGarminSummaries(input).data));
assert.equal(ok.receipts[0].data.log.length, 3); assert.equal(ok.receipts[1].data.log.length, 2);
const failed = await scenario('backup-fails');
assert.equal(failed.reloaded, false); assert.equal(JSON.stringify(failed.data), JSON.stringify(input)); assert.equal(failed.shown, '資料保護程序尚未完成');
const concurrent = await scenario('concurrent');
assert.equal(concurrent.reloaded, false); assert.equal(concurrent.data.extraConcurrentEdit, true); assert.equal(concurrent.data.log.length, 3);
console.log('PASS local cleanup backs up both versions, preserves raw activity, and stops on backup failure or concurrent change');
