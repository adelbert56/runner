import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

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

function gitBlobExists(relativePath) {
  try {
    runGit(["cat-file", "-e", `origin/main:${relativePath}`]);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("Fetching latest public site data from origin/main ...");
  runGit(["fetch", "--quiet", "origin", "main"]);

  for (const relativePath of publicDataFiles) {
    if (!gitBlobExists(relativePath)) {
      console.log(`Skipped ${relativePath} (not present on origin/main)`);
      continue;
    }
    const blob = runGit(["show", `origin/main:${relativePath}`]);
    const outputPath = resolve(root, relativePath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, blob, "utf8");
    console.log(`Synced ${relativePath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
