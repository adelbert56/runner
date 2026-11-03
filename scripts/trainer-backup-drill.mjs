// Read an existing backup and exercise the production import path in memory only.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { removeRepeatedGarminSummaries } from './trainer-backup-candidate.mjs';

const backupDir = join(process.env.LOCALAPPDATA || process.env.USERPROFILE, 'RunnerTrainerBackups');
const receipt = JSON.parse(await readFile(join(backupDir, 'latest-receipt.json'), 'utf8'));
assert.match(receipt.id, /^trainer-[a-f0-9]{64}\.json$/);
const raw = await readFile(join(backupDir, receipt.id));
assert.equal(createHash('sha256').update(raw).digest('hex'), receipt.sha256);
const backup = JSON.parse(raw);
assert.equal(backup.plan.length, receipt.weeks);
assert.equal(backup.log.length, receipt.logs);

const trainer = await readFile('site/trainer.js', 'utf8');
const dataCode = await readFile('site/trainer-data.js', 'utf8');
const memory = new Map();
const localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
let title = '';
const sandbox = vm.createContext({
  localStorage, window: { location: { hostname: 'isolated.invalid' } }, location: { hostname: 'isolated.invalid', port: '', origin: 'https://isolated.invalid' }, document: {},
  crypto: { randomUUID: () => 'backup-drill' }, console: { warn() {}, log() {} },
  todayStr: () => new Date().toISOString().slice(0, 10),
  showModal: value => { title = value; }, closeModal() {}, renderPlanView() {}, showView() {},
  reviewEscape: String,
  FileReader: class { readAsText(file) { this.result = file.content; this.onload(); } },
});
const start = trainer.indexOf('function loadData()');
const end = trainer.indexOf('function weekHasMalformedVolume(', start);
assert.ok(start > 0 && end > start);
vm.runInContext(trainer.slice(0, end), sandbox);
vm.runInContext('let appData = createEmptyData();', sandbox);
vm.runInContext(dataCode, sandbox);
sandbox.inputFile = { name: 'isolated-backup.json', content: raw.toString('utf8') };
vm.runInContext('window.TrainerData.importData({target:{files:[inputFile],value:""}})', sandbox);
assert.equal(title, '還原訓練資料');
vm.runInContext('window.TrainerData.applyImport()', sandbox);
const result = vm.runInContext('({weeks: appData.plan.length, logs: appData.log.length, plan: JSON.stringify(appData.plan.map(w => ({weekNum:w.weekNum, days:w.days.map(d => ({dateStr:d.dateStr,type:d.type,km:d.km,status:d.status,task:d.task}))}))), log: JSON.stringify(appData.log), manifest: JSON.stringify(appData.recoveryManifest), stored: JSON.stringify(JSON.parse(localStorage.getItem(STORAGE_KEY)).log)})', sandbox);
assert.equal(result.weeks, backup.plan.length);
assert.equal(result.logs, backup.log.length);
assert.equal(result.log, JSON.stringify(backup.log));
assert.equal(result.stored, result.log);
assert.equal(result.manifest, JSON.stringify(backup.recoveryManifest));
const expectedPlan = JSON.stringify(backup.plan.map(w => ({ weekNum: w.weekNum, days: w.days.map(d => ({ dateStr: d.dateStr, type: d.type, km: d.km, status: d.status, task: d.task })) })));
assert.equal(result.plan, expectedPlan, 'course dates, types, distance, status and task');
console.log(`PASS verified backup import in isolated memory: ${result.weeks} weeks, ${result.logs} records; course fields, log and reconstruction marker preserved`);
const candidate = removeRepeatedGarminSummaries(backup);
if (candidate.removed) {
  sandbox.inputFile = { name: 'isolated-candidate.json', content: JSON.stringify({ app: 'Runner Training Handbook', backupFormatVersion: 1, exportedAt: receipt.at, data: candidate.data }) };
  vm.runInContext('window.TrainerData.importData({target:{files:[inputFile],value:""}}); window.TrainerData.applyImport()', sandbox);
  const cleaned = vm.runInContext('({log: JSON.stringify(appData.log), snapshot: JSON.stringify(JSON.parse(localStorage.getItem(PRE_RESTORE_STORAGE_KEY)).data.log), weeks: appData.plan.length})', sandbox);
  assert.equal(cleaned.log, JSON.stringify(candidate.data.log), 'candidate after production save protection');
  assert.equal(cleaned.snapshot, JSON.stringify(backup.log), 'pre-import snapshot retains original log');
  assert.equal(cleaned.weeks, backup.plan.length);
  console.log(`PASS isolated cleanup candidate: removed ${candidate.removed} exact generated summaries; original remains in pre-import snapshot`);
  let onReady, reloaded = false;
  const receipts = [];
  sandbox.location = { hostname: '127.0.0.1', port: '4173', reload: () => { reloaded = true; } };
  sandbox.document = { readyState: 'loading', addEventListener: (_type, callback) => { onReady = callback; } };
  sandbox.AbortSignal = AbortSignal;
  sandbox.fetch = async (_url, options) => { receipts.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ verified: true }) }; };
  sandbox.backupRaw = raw.toString('utf8');
  vm.runInContext('localStorage.setItem(STORAGE_KEY, backupRaw)', sandbox);
  vm.runInContext(await readFile('site/trainer-local-backup.js', 'utf8'), sandbox);
  await onReady();
  const actualCleanup = vm.runInContext('JSON.stringify(JSON.parse(localStorage.getItem(STORAGE_KEY)).log)', sandbox);
  assert.equal(actualCleanup, JSON.stringify(candidate.data.log));
  assert.deepEqual(receipts.map(r => r.reason), ['before-cleanup', 'after-cleanup']);
  assert.equal(receipts[0].data.log.length, backup.log.length); assert.equal(receipts[1].data.log.length, candidate.data.log.length);
  assert.equal(reloaded, true);
  console.log('PASS local cleanup on real backup data in isolated memory with pre/post backup receipts');
}
