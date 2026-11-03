import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = await readFile('site/trainer-data.js', 'utf8');
const store = new Map([['current', 'version-1']]);
let failSnapshot = false;
let failSave = false;
let modal = '';
let saved = 0;
const localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => { if (failSnapshot && key === 'before') throw Error('quota'); store.set(key, value); } };
const sandbox = {
  window: {}, localStorage, STORAGE_KEY: 'current', PRE_RESTORE_STORAGE_KEY: 'before',
  appData: { profile: {}, plan: [{ days: [] }], log: [{ date: '2026-01-01' }], checkins: [], cycleHistory: [] },
  normalizeData: value => JSON.parse(JSON.stringify(value)), reviewEscape: String,
  showModal: title => { modal = title; }, closeModal() {}, renderPlanView() {}, showView() {}, console: { warn() {} },
  savePreRestoreSnapshot(data, reason) { const value = JSON.stringify({ data, reason }); localStorage.setItem('before', value); if (localStorage.getItem('before') !== value) throw Error('verify'); },
  saveData(data) { if (failSave) return null; saved++; localStorage.setItem('current', JSON.stringify(data)); return data; },
  FileReader: class { readAsText(file) { this.result = file.content; this.onload(); } },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const incoming = { profile: {}, plan: [{ days: [] }], log: [], checkins: [], cycleHistory: [] };
const prepare = () => sandbox.window.TrainerData.importData({ target: { files: [{ name: 'fixture.json', content: JSON.stringify(incoming) }], value: '' } });
prepare();
failSnapshot = true;
sandbox.window.TrainerData.applyImport();
assert.equal(saved, 0); assert.equal(sandbox.appData.log.length, 1); assert.equal(modal, '無法安全還原');
failSnapshot = false;
prepare(); store.set('current', 'newer-tab'); sandbox.window.TrainerData.applyImport();
assert.equal(saved, 0); assert.equal(sandbox.appData.log.length, 1);
prepare(); failSave = true; sandbox.window.TrainerData.applyImport();
assert.equal(sandbox.appData.log.length, 1); assert.equal(JSON.parse(store.get('before')).data.log.length, 1);
failSave = false; prepare(); sandbox.window.TrainerData.applyImport();
assert.equal(saved, 1); assert.equal(sandbox.appData.log.length, 0);
sandbox.window.TrainerData.restorePreImportSnapshot();
assert.equal(sandbox.appData.log.length, 1);
console.log('PASS synthetic import, verified snapshot failure, stale tab, save failure, and restore');

const trainer = await readFile('site/trainer.js', 'utf8');
function extract(name, code = trainer) {
  const start = code.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const opening = code.indexOf(') {', start) + 2;
  let depth = 0;
  for (let i = opening; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}' && --depth === 0) return code.slice(code.slice(start - 6, start) === 'async ' ? start - 6 : start, i + 1);
  }
  throw Error(`unclosed function: ${name}`);
}
let notified = 0;
const saveSandbox = vm.createContext({
  normalizeData: value => JSON.parse(JSON.stringify(value)), trainerUiFixtureMode: () => true,
  snapshotStoredCoachWeeks: () => ({}), STORAGE_KEY: 'current', PRE_RESTORE_STORAGE_KEY: 'before',
  localStorage: { setItem() { throw Error('quota'); }, getItem() { return null; } },
  showModal() {}, closeModal() {}, console: { warn() {} }, window: { TrainerSync: { onLocalSave() { notified++; } } },
  syncCoachProfileSnapshot() { notified++; },
});
vm.runInContext(`${extract('saveData')}\n${extract('savePreRestoreSnapshot')}`, saveSandbox);
assert.equal(saveSandbox.saveData({ log: [] }), null);
assert.equal(notified, 0);
assert.throws(() => saveSandbox.savePreRestoreSnapshot({ log: [] }, 'test'));
console.log('PASS production save failure cannot trigger synchronization or claim snapshot success');

const sync = await readFile('site/trainer-sync.js', 'utf8');
let cloudSaveCalls = 0;
let cloudMetaCalls = 0;
const cloud = vm.createContext({
  appData: { profile: {}, plan: [1], log: [1] }, applyingRemote: false,
  readSession: () => ({}), sessionUserId: () => 'fixture', decryptSnapshot: async () => ({ profile: {}, plan: [2], log: [] }),
  hasMeaningfulData: () => true, savePreRestoreSnapshot() { throw Error('quota'); },
  saveData: value => { cloudSaveCalls++; return value; }, storeMeta() { cloudMetaCalls++; },
  renderPlanView() {}, showView() {}, setStatus() {},
});
vm.runInContext(extract('applyRemote', sync), cloud);
await assert.rejects(cloud.applyRemote({ payload: {}, checksum: 'x' }));
assert.equal(cloudSaveCalls, 0); assert.equal(cloudMetaCalls, 0); assert.equal(cloud.appData.log.length, 1);
cloud.savePreRestoreSnapshot = () => {};
cloud.saveData = () => null;
await assert.rejects(cloud.applyRemote({ payload: {}, checksum: 'x' }));
assert.equal(cloudMetaCalls, 0); assert.equal(cloud.appData.log.length, 1); assert.equal(cloud.applyingRemote, false);
console.log('PASS cloud snapshot and storage failures preserve local state and revision');
