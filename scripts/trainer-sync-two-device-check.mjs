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
  const window = { TRAINER_SYNC_CONFIG: {url: 'https://fixture.invalid', publishableKey: 'fixture', table: 'snapshots'}, setTimeout, clearTimeout, addEventListener() {} };
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
  return {window, localStorage, state};
}
const a = device(), b = device();
await a.window.__test.unlock(); await b.window.__test.unlock();
a.localStorage.setItem('coach-review:passphrase', 'synthetic coach one');
await a.window.__test.reconcile();
await b.window.__test.reconcile();
assert.equal(b.state.conflicts, 0);
assert.equal(b.localStorage.getItem('coach-review:passphrase'), 'synthetic coach one');
// Simulate a separate remote update while A also changes its local coach passphrase.
remote.revision++;
a.localStorage.setItem('coach-review:passphrase', 'synthetic coach two');
await a.window.__test.reconcile();
assert.equal(remote.revision, 3);
b.localStorage.removeItem('coach-review:passphrase');
await b.window.__test.reconcile();
assert.equal(b.localStorage.getItem('coach-review:passphrase'), 'synthetic coach two');
assert.equal(b.state.conflicts, 0);
console.log('PASS two isolated devices use encrypted snapshots, avoid conflicts, and propagate a changed coach passphrase');

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
