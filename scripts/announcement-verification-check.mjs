import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(join(tmpdir(), 'runner-announcement-check-'));
try {
  for (const dir of ['scripts/lib', 'site/data']) await mkdir(join(temp, dir), { recursive: true });
  for (const file of ['scripts/build-announcements.mjs', 'scripts/lib/time.mjs']) await copyFile(join(root, file), join(temp, file));
  const races = [{ race_name: '查證費率', race_date: '2026-12-01', race_county: '臺中市', first_seen_at: '2026-01-01', verified_at: '2026-11-03', registration_link: 'https://example.org/race', registration_deadline: '2026-11-30' }];
  await writeFile(join(temp, 'site/data/races.json'), JSON.stringify(races));
  await writeFile(join(temp, 'site/data/runner-quips.json'), '{"quips":[]}');
  const result = spawnSync(process.execPath, [join(temp, 'scripts/build-announcements.mjs')], { encoding: 'utf8', env: { ...process.env, RUNNER_TODAY: '2026-11-03' } });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(await readFile(join(temp, 'site/data/announcements.json'), 'utf8'));
  const item = output.items.find(entry => entry.types.includes('updated'));
  assert.ok(item); assert.ok(item.details.includes('11/03 查證賽事資訊'));
  assert.ok(!item.details.some(detail => /補齊報名/.test(detail)));
  console.log('PASS verified race announcement does not claim registration fields were newly added');
} finally {
  assert.equal(dirname(resolve(temp)), resolve(tmpdir())); assert.ok(basename(temp).startsWith('runner-announcement-check-'));
  await rm(temp, { recursive: true, force: true });
}
