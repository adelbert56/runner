// Evaluate current inputs in an isolated directory; never rewrite the working files.
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { strongIdentityTokens } from './lib/race-dedupe.mjs';

const root = resolve(import.meta.dirname, '..');
const isolated = await mkdtemp(join(tmpdir(), 'runner-race-preview-'));
try {
  for (const dir of ['scripts/lib', 'runner/賽事', 'site/data']) await mkdir(join(isolated, dir), { recursive: true });
  const files = ['scripts/sync-race-data.mjs', 'scripts/lib/time.mjs', 'scripts/lib/race-dedupe.mjs', 'runner/賽事/賽事資料庫.json', 'site/data/races.json'];
  for (const file of files) await copyFile(join(root, file), join(isolated, file));
  const before = JSON.parse(await readFile(join(isolated, 'site/data/races.json'), 'utf8'));
  const result = spawnSync(process.execPath, [join(isolated, 'scripts/sync-race-data.mjs')], { encoding: 'utf8' });
  if (result.status !== 0) throw Error(`isolated sync failed: ${result.stderr}`);
  const after = JSON.parse(await readFile(join(isolated, 'site/data/races.json'), 'utf8'));
  const identity = race => `${String(race.race_name || '').trim()}|${String(race.race_date || '').slice(0, 10)}`;
  const evidence = ['official_event_url', 'registration_link', 'registration_opens_at', 'registration_deadline', 'fees', 'quota', 'start_times', 'verified_at', 'verification_note'];
  const has = value => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && String(value).trim() !== '';
  const lost = [];
  let matched = 0;
  for (const old of before) {
    const tokens = new Set(strongIdentityTokens(old));
    const same = after.find(item => identity(item) === identity(old) || strongIdentityTokens(item).some(token => tokens.has(token)));
    if (!same) continue;
    matched++;
    const fields = evidence.filter(field => has(old[field]) && !has(same[field]));
    if (fields.length) lost.push({ race: old.race_name, fields });
  }
  console.log(JSON.stringify({ current: before.length, proposed: after.length, matched, fieldsLost: lost, unmatchedCurrent: before.length - matched, output: result.stdout.trim() }, null, 2));
} finally {
  assert.equal(dirname(resolve(isolated)), resolve(tmpdir()));
  assert.ok(basename(isolated).startsWith('runner-race-preview-'));
  await rm(isolated, { recursive: true, force: true });
}
