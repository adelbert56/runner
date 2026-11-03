import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const temp = await mkdtemp(join(tmpdir(), 'runner-content-sync-'));
const root = resolve(import.meta.dirname, '..');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
try {
  const remote = join(temp, 'remote.git'), seed = join(temp, 'seed'), work = join(temp, 'work');
  git(temp, 'init', '--bare', '--initial-branch=main', remote);
  git(temp, 'clone', remote, seed);
  git(seed, 'config', 'user.name', 'Runner Test'); git(seed, 'config', 'user.email', 'test@example.invalid');
  await mkdir(join(seed, 'site/data'), { recursive: true });
  const payload = { generated_at: '2026-11-03T04:00:00Z', items: [
    { type: 'shoe', title: 'Running shoes 30% off' },
    { type: 'news', title: '久站鞋挑選秘訣' },
    { type: 'shoe', title: 'Running shoe review' },
  ] };
  await writeFile(join(seed, 'site/data/content.json'), JSON.stringify(payload));
  git(seed, 'add', 'site/data/content.json'); git(seed, 'commit', '-m', 'fixture'); git(seed, 'push', 'origin', 'main');
  git(temp, 'clone', remote, work);
  await mkdir(join(work, 'scripts/lib'), { recursive: true });
  await copyFile(join(root, 'scripts/sync-local-site-data.mjs'), join(work, 'scripts/sync-local-site-data.mjs'));
  await copyFile(join(root, 'scripts/lib/content-quality.mjs'), join(work, 'scripts/lib/content-quality.mjs'));
  const old = { generated_at: '2026-11-02T00:00:00Z', items: [{ type: 'news', title: '馬拉松' }] };
  await writeFile(join(work, 'site/data/content.json'), JSON.stringify(old));
  const result = spawnSync(process.execPath, [join(work, 'scripts/sync-local-site-data.mjs')], { cwd: work, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(await readFile(join(work, 'site/data/content.json'), 'utf8'));
  assert.equal(actual.generated_at, payload.generated_at);
  assert.deepEqual(actual.items, [payload.items[2]]);
  assert.match(result.stdout, /Backed up 1 stale local public data/);
  console.log('PASS local sync backs up older data, preserves source time and filters unsuitable remote content');
} finally {
  assert.equal(dirname(resolve(temp)), resolve(tmpdir())); assert.ok(basename(temp).startsWith('runner-content-sync-'));
  await rm(temp, { recursive: true, force: true });
}
