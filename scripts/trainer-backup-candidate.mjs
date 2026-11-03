// Build a reviewable candidate; never modify the current browser or source backup.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function removeRepeatedGarminSummaries(data) {
  const seen = new Set();
  let removed = 0;
  const log = data.log.filter(entry => {
    const isSummary = entry?.source === 'garmin' && !entry.activityId && !entry.garminActivityId &&
      ['Garmin 同步', 'Garmin 自動認列補跑'].includes(entry.notes) &&
      !Object.hasOwn(entry, 'hr') && !Object.hasOwn(entry, 'pace') && !Object.hasOwn(entry, 'recoveredActivityType');
    if (!isSummary) return true;
    const fingerprint = JSON.stringify(entry);
    if (seen.has(fingerprint)) { removed++; return false; }
    seen.add(fingerprint);
    return true;
  });
  return { data: { ...data, log }, removed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = join(process.env.LOCALAPPDATA || process.env.USERPROFILE, 'RunnerTrainerBackups');
  const receiptPath = join(dir, 'latest-receipt.json');
  const receiptRaw = await readFile(receiptPath, 'utf8');
  const receipt = JSON.parse(receiptRaw);
  if (!/^trainer-[a-f0-9]{64}\.json$/.test(receipt.id)) throw Error('invalid receipt');
  const source = await readFile(join(dir, receipt.id));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  if (hash(source) !== receipt.sha256) throw Error('source backup checksum mismatch');
  const sourceData = JSON.parse(source);
  if (!Array.isArray(sourceData.plan) || !Array.isArray(sourceData.log)) throw Error('invalid backup');
  const result = removeRepeatedGarminSummaries(sourceData);
  if (!result.removed) { console.log('No exact repeated Garmin summaries; no candidate created.'); process.exit(0); }
  if (await readFile(receiptPath, 'utf8') !== receiptRaw) throw Error('latest backup changed; retry with the new receipt');
  const destination = join(dir, `trainer-cleanup-candidate-v2-${receipt.sha256}.json`);
  const content = JSON.stringify({ app: 'Runner Training Handbook', backupFormatVersion: 1,
    exportedAt: receipt.at, candidateSource: { sha256: receipt.sha256, removed: result.removed }, data: result.data });
  try { await writeFile(destination, content, { flag: 'wx', encoding: 'utf8' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (hash(await readFile(destination)) !== hash(content)) throw Error('candidate verification failed');
  console.log(JSON.stringify({ candidate: destination, sourceAt: receipt.at, before: sourceData.log.length, after: result.data.log.length, removed: result.removed }));
}
