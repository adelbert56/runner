import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const isolated = await mkdtemp(join(tmpdir(), 'runner-race-sync-'));
try {
  for (const dir of ['scripts/lib', 'runner/賽事', 'site/data']) await mkdir(join(isolated, dir), { recursive: true });
  for (const file of ['scripts/sync-race-data.mjs', 'scripts/lib/time.mjs', 'scripts/lib/race-dedupe.mjs']) await copyFile(join(root, file), join(isolated, file));
  const source = join(isolated, 'runner/賽事/賽事資料庫.json');
  const target = join(isolated, 'site/data/races.json');
  const original = JSON.stringify([{ race_name: 'fixture', race_date: '2099-12-31' }]);
  const run = () => spawnSync(process.execPath, [join(isolated, 'scripts/sync-race-data.mjs')], { encoding: 'utf8' });
  for (const input of [null, '{', '[]', '{}']) {
    await writeFile(target, original);
    if (input === null) await rm(source, { force: true }); else await writeFile(source, input);
    const result = run();
    assert.notEqual(result.status, 0, `invalid input ${input}`);
    assert.equal(await readFile(target, 'utf8'), original, `preserve target for ${input}`);
    if (input !== null) assert.equal(await readFile(source, 'utf8'), input, `preserve source for ${input}`);
  }
  await writeFile(source, original);
  assert.equal(run().status, 0);
  assert.equal(JSON.parse(await readFile(target, 'utf8'))[0].race_name, 'fixture');
  const base = { race_name: 'fixture', race_date: '2099-12-31' };
  const forecast = { forecast_for: base.race_date, updated_at: '2026-11-03T00:00:00Z', summary: 'fixture' };
  await writeFile(source, JSON.stringify([base]));
  await writeFile(target, JSON.stringify([{ ...base, weather_forecast: forecast }]));
  assert.equal(run().status, 0);
  assert.deepEqual(JSON.parse(await readFile(source, 'utf8'))[0].weather_forecast, forecast);
  await writeFile(source, JSON.stringify([base]));
  await writeFile(target, JSON.stringify([{ ...base, weather_forecast: { ...forecast, forecast_for: '2099-12-30' } }]));
  assert.equal(run().status, 0);
  assert.equal(JSON.parse(await readFile(source, 'utf8'))[0].weather_forecast, undefined);
  await writeFile(source, JSON.stringify([base]));
  await writeFile(target, JSON.stringify([{ ...base, weather_forecast: forecast }, { ...base, weather_forecast: forecast }]));
  assert.equal(run().status, 0);
  assert.equal(JSON.parse(await readFile(source, 'utf8'))[0].weather_forecast, undefined);
  console.log('PASS preserve newer forecast only for unique exact race and matching forecast date');
  console.log('PASS missing, invalid, empty and non-array source preserve output; valid source syncs');
} finally {
  assert.equal(dirname(resolve(isolated)), resolve(tmpdir()));
  assert.ok(basename(isolated).startsWith('runner-race-sync-'));
  await rm(isolated, { recursive: true, force: true });
}
