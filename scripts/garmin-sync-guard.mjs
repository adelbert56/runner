import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { hasGarminSyncEvidence } from "./lib/garmin-sync-evidence.mjs";

const { CURRENT_RUN_ID, GITHUB_EVENT_NAME, GITHUB_OUTPUT, GITHUB_REPOSITORY, GITHUB_STEP_SUMMARY } = process.env;

function readRuns(...args) {
  return JSON.parse(execFileSync("gh", ["run", ...args, "--repo", GITHUB_REPOSITORY], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10000,
  }));
}

function shouldSync() {
  if (GITHUB_EVENT_NAME !== "schedule") return true;
  const since = Date.now() - 20 * 60 * 60 * 1000;
  const runs = readRuns("list", "--workflow", "garmin-sync.yml", "--branch", "main", "--limit", "30",
    "--status", "success", "--json", "databaseId,createdAt");

  for (const run of runs) {
    if (String(run.databaseId) === CURRENT_RUN_ID || !(Date.parse(run.createdAt) >= since)) continue;
    const { jobs } = readRuns("view", String(run.databaseId), "--json", "jobs");
    if (hasGarminSyncEvidence(jobs)) {
      const reason = `Skipped Garmin fetch and review because both succeeded in run ${run.databaseId} within 20 hours.`;
      console.log(reason);
      if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${reason}\n`);
      return false;
    }
  }
  return true;
}

let shouldRun = true;
try {
  shouldRun = shouldSync();
} catch {
  console.warn("::warning::Could not verify recent Garmin sync evidence. Proceeding with the scheduled sync.");
}
appendFileSync(GITHUB_OUTPUT, `should_run=${shouldRun}\n`);
