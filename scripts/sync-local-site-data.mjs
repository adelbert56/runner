import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicDataPaths = [
  "site/data/announcements.json",
  "site/data/automation-health.json",
  "site/data/content.json",
  "site/data/message-cloud.json",
  "site/data/races.json",
  "site/data/runner-quips.json",
];

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "buffer", ...options });
}

function isLocalPathDirty(path) {
  return String(git(["status", "--porcelain", "--", path], { encoding: "utf8" })).trim().length > 0;
}

async function writeAtomically(path, content) {
  const destination = resolve(root, path);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.sync-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content);
  await rename(temporary, destination);
}

function generatedAt(content) {
  try {
    const payload = JSON.parse(String(content));
    const value = payload.generated_at || payload.updatedAt;
    const timestamp = Date.parse(String(value || ""));
    return Number.isNaN(timestamp) ? null : timestamp;
  } catch {
    return null;
  }
}

async function backupLocalData(path, content) {
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const backupPath = resolve(root, "tmp", "local-site-data-sync-backups", stamp, path);
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, content);
  return backupPath;
}

async function main() {
  git(["fetch", "origin", "main"], { stdio: "inherit" });
  const updated = [];
  const retained = [];
  const backups = [];
  for (const path of publicDataPaths) {
    let remote;
    try {
      remote = git(["show", `origin/main:${path}`]);
    } catch {
      console.warn(`[skip] origin/main has no ${path}`);
      continue;
    }
    const localPath = resolve(root, path);
    let current = null;
    let localContent = null;
    try {
      await stat(localPath);
      current = git(["hash-object", "--", localPath]);
      localContent = await readFile(localPath, "utf8");
    } catch {
      // Missing local data is repaired from origin/main below.
    }
    const remoteHash = git(["rev-parse", `origin/main:${path}`]);
    if (!current || !Buffer.from(current).equals(Buffer.from(remoteHash))) {
      if (current && isLocalPathDirty(path)) {
        const localGeneratedAt = generatedAt(localContent);
        const remoteGeneratedAt = generatedAt(remote);
        if (localGeneratedAt === null || remoteGeneratedAt === null || remoteGeneratedAt <= localGeneratedAt) {
          retained.push(path);
          continue;
        }
        backups.push(await backupLocalData(path, localContent));
      }
      await writeAtomically(path, remote);
      updated.push(path);
    }
  }
  console.log(updated.length ? `Synchronized ${updated.length} public data files from origin/main.` : "Public site data is already current.");
  if (retained.length) {
    console.warn(`Retained ${retained.length} local public data file(s) because they are unpublished, newer, or lack a comparable generated_at: ${retained.join(", ")}`);
  }
  if (backups.length) {
    console.log(`Backed up ${backups.length} stale local public data file(s) before replacing them: ${backups.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(`Local site data sync failed: ${error.message}`);
  process.exitCode = 1;
});
