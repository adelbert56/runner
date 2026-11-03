import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import net from 'node:net';

const probe = net.createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const child = spawn(process.execPath, ['site/server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('server exited'); })]);
  const request = path => fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
  assert.equal((await request('/%E0%A4%A')).status, 400, 'malformed encoding rejected');
  assert.equal((await request('/site/')).status, 200, 'server remains available after malformed request');
  for (const path of ['/site/', '/site/trainer.html', '/site/data/races.json', '/local/registration/registration.html', '/runner/%E8%B3%BD%E4%BA%8B/%E8%B3%BD%E4%BA%8B%E8%B3%87%E6%96%99%E5%BA%AB.json']) {
    assert.equal((await request(path)).status, 200, path);
  }
  for (const path of ['/package.json', '/runner/%E5%A0%B1%E5%90%8D%E7%AE%A1%E7%90%86/%E5%A0%B1%E5%90%8D%E7%AE%A1%E7%90%86%E8%B3%87%E6%96%99.json', '/output/recovery/runner-partial-recovery.json', '/scripts/trainer-local-backup-server.mjs']) {
    assert.equal((await request(path)).status, 404, path);
  }
  assert.equal((await request('/api/registration-data')).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/registration-data`, { headers: { Origin: 'https://example.org' } })).status, 403);
  assert.equal((await fetch(`http://localhost:${port}/site/`, { redirect: 'manual' })).status, 302);
  const config = await request('/output/recovery/layout-strength-config.json');
  assert.ok([200, 404].includes(config.status), 'optional recovery configuration');
  console.log('Local server boundary checks passed.');
} finally {
  child.kill();
}
