import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

let source = await readFile('site/trainer-sync.js', 'utf8');
source = source.replace('  window.TrainerSync =', `  window.__test = { async unlock() { syncKey = await deriveKey('fixture-user', 'synthetic sync password'); }, reconcile, readMeta };\n  window.TrainerSync =`);
let remote = null;
const token = `x.${Buffer.from(JSON.stringify({sub:'fixture-user'})).toString('base64')}.x`;
function device() {
  const map = new Map([['runner-trainer:sync-session:v1', JSON.stringify({ access_token: token })]]);
  const localStorage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
  const state = { conflicts: 0, statuses: [] };
  const timers = new Map();
  const window = { TRAINER_SYNC_CONFIG: {url: 'https://fixture.invalid', publishableKey: 'fixture', table: 'snapshots'},
    setTimeout(callback, delay) { const id = Symbol(); timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, addEventListener() {},
    loadCoachReview() { state.reviewLoads = (state.reviewLoads || 0) + 1; } };
  const fetch = async (_url, options = {}) => {
    if (!options.method) return {ok: true, status: 200, json: async () => remote ? [structuredClone(remote)] : []};
    const body = JSON.parse(options.body);
    if (options.method === 'PATCH' && Number(new URL(_url).searchParams.get('revision').slice(3)) !== remote.revision) return {ok: true, status: 200, json: async () => []};
    remote = body;
    return {ok: true, status: 200, json: async () => [structuredClone(remote)]};
  };
  const sandbox = vm.createContext({window, localStorage, fetch, crypto: webcrypto, TextEncoder, TextDecoder, atob, btoa,
    document: {querySelectorAll: () => [{set textContent(value) {state.statuses.push(value);}}]},
    appData: {profile:{name:'synthetic'}, plan:[{week:1}]}, normalizeData: x => x,
    showModal: () => {state.conflicts++;}, closeModal() {}, savePreRestoreSnapshot() {}, saveData: x => x,
    renderPlanView() {}, showView() {}, console, Date, Uint8Array, JSON });
  vm.runInContext(source, sandbox);
  return {window, localStorage, state, sandbox, timers,
    async runTimer(delay) {
      const entry = [...timers].find(([, task]) => task.delay === delay);
      assert.ok(entry, `expected a ${delay} ms timer`);
      timers.delete(entry[0]);
      await entry[1].callback();
    }};
}
const a = device(), b = device();
await a.window.__test.unlock(); await b.window.__test.unlock();
await a.window.__test.reconcile();
const remembered = device();
remembered.localStorage.setItem('coach-review:passphrase', 'synthetic coach one');
remembered.window.TrainerSync.onLocalSave();
assert.equal(remembered.timers.size, 0, 'a locked sync session does not schedule an upload');
await remembered.window.__test.unlock();
remembered.window.TrainerSync.onLocalSave();
await remembered.runTimer(900);
assert.equal(remote.revision, 2, 'a remembered passphrase fills an empty cloud key without another training edit');
assert.ok(!JSON.stringify(remote).includes('synthetic coach one'));
await b.window.__test.reconcile();
await b.runTimer(0);
assert.equal(b.state.reviewLoads, 1, 'the second device reloads the review automatically');
a.localStorage.setItem('coach-review:passphrase', 'synthetic coach one');
await a.window.__test.reconcile();
assert.equal(remote.revision, 2, 'matching passphrases do not create duplicate revisions');
assert.equal(b.state.conflicts, 0);
assert.equal(b.localStorage.getItem('coach-review:passphrase'), 'synthetic coach one');
// Simulate a separate remote update while A also changes its local coach passphrase.
remote.revision++;
a.localStorage.setItem('coach-review:passphrase', 'synthetic coach two');
await a.window.__test.reconcile();
assert.equal(remote.revision, 4);
b.localStorage.removeItem('coach-review:passphrase');
await b.window.__test.reconcile();
assert.equal(b.localStorage.getItem('coach-review:passphrase'), 'synthetic coach two');
assert.equal(b.state.conflicts, 0);
console.log('PASS two isolated devices use encrypted snapshots, avoid conflicts, and propagate a changed coach passphrase');

a.sandbox.appData = { ...a.sandbox.appData, log: [{ date: '2026-11-17', actualKm: 6.5 }] };
await a.window.__test.reconcile();
await b.window.__test.reconcile();
assert.equal(b.sandbox.appData.log[0].actualKm, 6.5, 'an unchanged device follows a newer cloud revision automatically');
assert.equal(b.state.conflicts, 0);
a.sandbox.appData = { ...a.sandbox.appData, log: [{ date: '2026-11-17', actualKm: 7 }] };
b.sandbox.appData = { ...b.sandbox.appData, log: [{ date: '2026-11-17', actualKm: 8 }] };
await a.window.__test.reconcile();
await b.window.__test.reconcile();
assert.equal(b.state.conflicts, 1, 'concurrent edits still require a choice');
assert.equal(b.sandbox.appData.log[0].actualKm, 8);
console.log('PASS newer results reach an unchanged device and concurrent edits preserve local data');

// Exercise the setup-screen entry and feedback without accessing a real account.
let modal = null;
let visibleStatus = '';
const form = { 'training-sync-email': {value: ''}, 'training-sync-login-password': {value: ''} };
const loginWindow = { TRAINER_SYNC_CONFIG: {url:'https://fixture.invalid', publishableKey:'fixture', table:'snapshots'}, setTimeout, clearTimeout, addEventListener() {} };
const loginContext = vm.createContext({ window: loginWindow, localStorage: {getItem: () => null}, crypto: webcrypto, TextEncoder, TextDecoder, atob, btoa, console,
  document: {getElementById: id => form[id], querySelectorAll: () => [{set textContent(v) {visibleStatus = v;}}]},
  showModal: (title, body, actions) => {modal = {title, body, actions};}, closeModal() {} });
vm.runInContext(source, loginContext);
loginWindow.openTrainingSyncModal();
assert.equal(modal.title, '登入跨裝置同步');
assert.match(modal.body, /data-training-sync-status/);
await modal.actions.find(action => action.label === '登入').action();
assert.equal(visibleStatus, '請輸入 Email 與密碼');
loginWindow.TRAINER_SYNC_CONFIG = null;
loginWindow.openTrainingSyncModal();
assert.equal(modal.title, '無法開啟同步');
console.log('PASS login entry opens and missing credentials or configuration are visible');

let selection = null;
form['training-sync-passphrase'] = { type: 'password', value: 'synthetic-secret', selectionStart: 2, selectionEnd: 5,
  focus() {}, setSelectionRange(start, end) { selection = [start, end]; } };
const attrs = {};
const eye = { setAttribute: (key, value) => { attrs[key] = value; } };
loginWindow.TrainerSync.togglePasswordVisibility('training-sync-passphrase', eye);
assert.equal(form['training-sync-passphrase'].type, 'text');
assert.equal(form['training-sync-passphrase'].value, 'synthetic-secret');
assert.deepEqual(selection, [2, 5]);
assert.equal(attrs['aria-label'], '隱藏密碼');
loginWindow.TrainerSync.togglePasswordVisibility('training-sync-passphrase', eye);
assert.equal(form['training-sync-passphrase'].type, 'password');
assert.equal(attrs['aria-label'], '顯示密碼');
console.log('PASS password visibility preserves text and selection');
