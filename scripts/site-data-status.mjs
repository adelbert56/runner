import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicDataFiles = [
  "site/data/announcements.json",
  "site/data/automation-health.json",
  "site/data/content.json",
  "site/data/message-cloud.json",
  "site/data/races.json",
  "site/data/runner-quips.json",
];

function runGit(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readOriginBlob(relativePath) {
  try {
    return runGit(["show", `origin/main:${relativePath}`]);
  } catch {
    return "";
  }
}

async function readLocalFile(relativePath) {
  try {
    return await readFile(resolve(root, relativePath), "utf8");
  } catch {
    return "";
  }
}

function extractGeneratedAt(raw) {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.generated_at || parsed.updatedAt || "").trim();
  } catch {
    return "";
  }
}

function extractCount(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
    if (Array.isArray(parsed.items)) return parsed.items.length;
    if (Array.isArray(parsed.workflows)) return parsed.workflows.length;
    if (Array.isArray(parsed.people)) return parsed.people.length;
    return null;
  } catch {
    return null;
  }
}

function summarize(relativePath, localRaw, remoteRaw) {
  const localGeneratedAt = extractGeneratedAt(localRaw);
  const remoteGeneratedAt = extractGeneratedAt(remoteRaw);
  const localCount = extractCount(localRaw);
  const remoteCount = extractCount(remoteRaw);
  const same = localRaw === remoteRaw;
  return {
    relativePath,
    status: same ? "in_sync" : "local_differs",
    localGeneratedAt,
    remoteGeneratedAt,
    localCount,
    remoteCount,
  };
}

async function main() {
  try {
    runGit(["fetch", "--quiet", "origin", "main"]);
  } catch {
    // Continue with the most recent local refs when fetch is unavailable.
  }

  const rows = [];
  for (const relativePath of publicDataFiles) {
    const [localRaw, remoteRaw] = await Promise.all([
      readLocalFile(relativePath),
      Promise.resolve(readOriginBlob(relativePath)),
    ]);
    rows.push(summarize(relativePath, localRaw, remoteRaw));
  }

  const hasDiff = rows.some((row) => row.status !== "in_sync");
  const mode = hasDiff ? "preview_only" : "live_synced";
  const summary = {
    mode,
    hasDiff,
    files: rows,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
