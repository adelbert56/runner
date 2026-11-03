import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import assert from 'node:assert/strict';

const temp = await mkdtemp(join(tmpdir(), 'runner-backup-check-'));
const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
const port = probe.address().port; await new Promise(resolveClose => probe.close(resolveClose));
const child = spawn(process.execPath, ['scripts/trainer-local-backup-server.mjs'], { env: { ...process.env, LOCALAPPDATA: temp, TRAINER_BACKUP_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw Error('backup server exited'); })]);
  const endpoint = `http://127.0.0.1:${port}/snapshot`;
  const health = `http://127.0.0.1:${port}/health`;
  const data = { profile: { test: true }, plan: [{ days: [] }], log: [{ date: '2026-01-01' }] };
  const options = { method: 'POST', headers: { Origin: 'http://127.0.0.1:4173', 'Content-Type': 'application/json' }, body: JSON.stringify({ data, reason: 'before-cleanup' }) };
  assert.equal((await fetch(endpoint, { ...options, headers: { ...options.headers, Origin: 'https://example.org' } })).status, 403);
  assert.equal((await fetch(health, { headers: { Origin: 'https://example.org' } })).status, 403);
  assert.equal((await fetch(health, { headers: { Origin: 'http://127.0.0.1:4173' } })).status, 503);
  assert.equal((await fetch(endpoint, { ...options, body: JSON.stringify({ data: { plan: [] } }) })).status, 400);
  const response = await fetch(endpoint, options); assert.equal(response.status, 200);
  const receipt = await response.json(); assert.equal(receipt.verified, true); assert.equal(receipt.reason, 'before-cleanup');
  const bytes = await readFile(join(temp, 'RunnerTrainerBackups', receipt.id));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256);
  assert.deepEqual(JSON.parse(bytes), data);
  assert.equal(JSON.parse(await readFile(join(temp, 'RunnerTrainerBackups', 'latest-receipt.json'), 'utf8')).sha256, receipt.sha256);
  const healthResult = await fetch(health, { headers: { Origin: 'http://127.0.0.1:4173' } });
  assert.equal(healthResult.status, 200); assert.equal((await healthResult.json()).backupVerified, true);
  await writeFile(join(temp, 'RunnerTrainerBackups', receipt.id), '{}');
  assert.equal((await fetch(health, { headers: { Origin: 'http://127.0.0.1:4173' } })).status, 503);
  console.log('PASS independent backup HTTP service rejects invalid origins/data and verifies stored snapshot and receipt');
} finally {
  const exited = once(child, 'exit'); child.kill(); await exited;
  assert.equal(dirname(resolve(temp)), resolve(tmpdir())); assert.ok(basename(temp).startsWith('runner-backup-check-'));
  await rm(temp, { recursive: true, force: true });
}
