import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const code = await readFile(new URL('../site/favorites-backup.js', import.meta.url), 'utf8');
const context = { window: {}, document: { getElementById: () => null }, Blob, Date, JSON,
  FAVORITES_KEY: 'f', REGISTERED_RACES_KEY: 'r', CONTENT_FAVORITES_KEY: 'c', LEGACY_FAVORITES_KEY: 'legacy', DEVICE_ID: 'fixture' };
vm.runInNewContext(code, context);
const api = context.window.RunnerFavoritesBackup;
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: k => values.has(k) ? values.get(k) : null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
const s = storage({ legacy: '["old"]', r: '["race"]', c: '[]' });
const backup = api.createBackup(s);
assert.equal(backup.data.favorites[0], 'old');
assert.throws(() => api.parseBackup('{}'));
const arrays = api.parseBackup(JSON.stringify(backup));
const before = api.rawValues(s);
api.restore(s, arrays, before);
assert.equal(s.getItem('f'), '["old"]');
const changed = api.rawValues(s);
s.setItem('legacy', '["changed"]');
assert.throws(() => api.restore(s, arrays, changed), /concurrent-change/);
const fail = storage({ f: '["before"]', r: '[]', c: '[]' });
const put = fail.setItem; let once = true;
fail.setItem = (key, value) => { if (key === 'r' && once) { once = false; throw Error('quota'); } put(key, value); };
assert.throws(() => api.restore(fail, [['after'], [], []], api.rawValues(fail)), /restore-failed/);
assert.equal(fail.getItem('f'), '["before"]');
const noSnapshot = storage({ f: '["before"]', r: '[]', c: '[]' });
const beforeSnapshot = api.rawValues(noSnapshot);
noSnapshot.setItem = () => { throw Error('quota'); };
assert.throws(() => api.restore(noSnapshot, [['after'], [], []], beforeSnapshot));
assert.equal(noSnapshot.getItem('f'), '["before"]');
assert.throws(() => api.parseBackup('x'.repeat(1024 * 1024 + 1)), /file-too-large/);
// Exercise the real dialog callbacks without opening or controlling the user's browser.
function node() {
  return { handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; }, click() { return this.handlers.click?.(); }, textContent: '', disabled: false, value: '' };
}
const opener = node();
const elements = Object.fromEntries(['.collections-backup-summary', '.collections-backup-status', '[data-export]', '[data-import]', '[data-close]', 'input'].map(key => [key, node()]));
const dialog = { ...node(), open: false, setAttribute() {}, querySelector: key => elements[key], showModal() { this.open = true; }, close() { this.open = false; this.handlers.close?.(); }, remove() {} };
const uiStorage = storage({ f: '["original"]', r: '[]', c: '[]' });
let prompts = 0;
const uiContext = { ...context, window: { confirm: () => { prompts++; return false; } }, localStorage: uiStorage,
  document: { getElementById: () => opener, body: { appendChild() {} }, createElement: tag => { assert.equal(tag, 'dialog'); return dialog; } } };
vm.runInNewContext(code, uiContext);
opener.click();
assert.equal(dialog.open, true);
assert.match(elements['.collections-backup-summary'].textContent, /收藏賽事 1/);
elements.input.files = [{ size: 100, text: async () => JSON.stringify(backup) }];
await elements.input.handlers.change();
assert.equal(prompts, 1);
assert.equal(uiStorage.getItem('f'), '["original"]');
assert.match(elements['.collections-backup-status'].textContent, /取消/);
elements['[data-close]'].click();
assert.equal(dialog.open, false);
console.log('PASS export, invalid and oversized files, restore, concurrency, snapshot failure and partial-write rollback');
console.log('PASS dialog opens, previews, cancels without modifying data, and closes');
