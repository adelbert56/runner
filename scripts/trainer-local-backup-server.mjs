import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const port = Number(process.env.TRAINER_BACKUP_PORT || 4175);
const directory = resolve(process.env.LOCALAPPDATA || process.env.USERPROFILE, 'RunnerTrainerBackups');
const allowedOrigins = new Set(['http://127.0.0.1:4173', 'http://localhost:4173']);
const hash = value => createHash('sha256').update(value).digest('hex');
const server = createServer(async (req, res) => {
  const origin = String(req.headers.origin || '');
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      ...(allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) });
    res.end(JSON.stringify(data));
  };
  if (req.headers.host !== `127.0.0.1:${port}` || !allowedOrigins.has(origin)) return send(403, { error: 'local-origin-only' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }); res.end(); return;
  }
  if (req.url === '/health' && req.method === 'GET') {
    try {
      const receipt = JSON.parse(await readFile(resolve(directory, 'latest-receipt.json'), 'utf8'));
      if (!/^trainer-[a-f0-9]{64}\.json$/.test(receipt.id || '') || !/^[a-f0-9]{64}$/.test(receipt.sha256 || '') || receipt.id !== `trainer-${receipt.sha256}.json`) throw new Error('invalid-receipt');
      const bytes = await readFile(resolve(directory, receipt.id));
      if (hash(bytes) !== receipt.sha256) throw new Error('invalid-hash');
      return send(200, { ok: true, backupVerified: true, at: receipt.at, weeks: receipt.weeks, logs: receipt.logs });
    } catch {
      return send(503, { ok: false, backupVerified: false });
    }
  }
  if (req.url !== '/snapshot' || req.method !== 'POST'
    || !String(req.headers['content-type'] || '').startsWith('application/json')) return send(405, { error: 'snapshot-post-only' });
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) { send(413, { error: 'too-large' }); return; }
      chunks.push(chunk);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const data = payload?.data;
    if (!data?.profile || !Array.isArray(data.plan) || !data.plan.length || data.plan.length > 200
      || !Array.isArray(data.log) || data.log.length > 10000) throw new Error('invalid');
    const content = JSON.stringify(data);
    const digest = hash(content);
    const id = `trainer-${digest}.json`;
    await mkdir(directory, { recursive: true });
    const file = resolve(directory, id);
    try { await writeFile(file, content, { flag: 'wx', encoding: 'utf8' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (hash(await readFile(file)) !== digest) throw new Error('verification');
    const receipt = { at: new Date().toISOString(), id, sha256: digest, weeks: data.plan.length,
      logs: data.log.length, repair: data.recoveryManifest?.layoutStrengthRepairVersion || null,
      reason: ['before-repair', 'after-repair', 'before-cleanup', 'after-cleanup', 'automatic'].includes(payload.reason) ? payload.reason : 'automatic', verified: true };
    await writeFile(resolve(directory, 'latest-receipt.json'), JSON.stringify(receipt, null, 2));
    send(200, receipt);
  } catch { send(400, { error: 'backup-not-verified' }); }
});
server.listen(port, '127.0.0.1', () => console.log(`Trainer backup listening on 127.0.0.1:${port}`));
