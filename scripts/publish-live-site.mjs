import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repository = process.env.GITHUB_REPOSITORY || "adelbert56/runner";
const pagesUrl = "https://adelbert56.github.io/runner";
const defaultCommitMessage = process.env.SITE_PUBLISH_COMMIT_MESSAGE || "chore(site): publish latest generated data";

const publishPaths = [
  "runner/內容/人工精選內容.json",
  "runner/內容/候選內容.json",
  "runner/內容/候選內容報告.md",
  "runner/內容/候選內容庫.json",
  "runner/內容/內容來源健康度報告.json",
  "runner/內容/內容來源健康度報告.md",
  "runner/內容/內容品質報告.md",
  "runner/內容/自動上架內容報告.md",
  "runner/賽事/賽事資料庫.json",
  "runner/系統配置/營運儀表板.json",
  "runner/系統配置/營運儀表板.md",
  "site/data/announcements.json",
  "site/data/automation-health.json",
  "site/data/content.json",
  "site/data/message-cloud.json",
  "site/data/races.json",
  "site/data/runner-quips.json",
];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function parseArgs(argv) {
  let commitMessage = defaultCommitMessage;
  let skipCheck = false;
  let skipPagesWait = false;
  let skipRemoteVerify = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--skip-check") {
      skipCheck = true;
      continue;
    }
    if (arg === "--skip-pages-wait") {
      skipPagesWait = true;
      continue;
    }
    if (arg === "--skip-remote-verify") {
      skipRemoteVerify = true;
      continue;
    }
    if (arg === "--message") {
      commitMessage = argv[index + 1] || commitMessage;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { commitMessage, skipCheck, skipPagesWait, skipRemoteVerify };
}

function getCurrentBranch() {
  return run("git", ["branch", "--show-current"]);
}

function ensureMainBranch() {
  const branch = getCurrentBranch();
  if (branch !== "main") {
    throw new Error(`Live publish only runs on main. Current branch: ${branch}`);
  }
}

function assertOriginMainIsNotAhead() {
  run("git", ["fetch", "origin", "main"]);
  const head = run("git", ["rev-parse", "HEAD"]);
  const remote = run("git", ["rev-parse", "origin/main"]);
  if (head === remote) return;

  try {
    execFileSync("git", ["merge-base", "--is-ancestor", head, remote], { cwd: root, stdio: "ignore" });
  } catch {
    return;
  }

  throw new Error("origin/main advanced before this publish. Run npm run main:sync, regenerate the data, then publish again.");
}

function listAllowedChanges() {
  const output = run("git", ["status", "--short"]);
  if (!output) return [];
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3).trim();
      return { raw: line, path };
    });
}

function assertOnlyPublishScopeChanges(changes) {
  const outOfScope = changes.filter(({ path }) => !publishPaths.includes(path));
  if (outOfScope.length) {
    throw new Error(`Working tree has out-of-scope changes: ${outOfScope.map((item) => item.path).join(", ")}`);
  }
}

function stagePublishPaths() {
  run("git", ["add", "--", ...publishPaths]);
}

function stagedPublishPaths() {
  const output = run("git", ["diff", "--cached", "--name-only"]);
  if (!output) return [];
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((path) => publishPaths.includes(path));
}

function commitChanges(message) {
  run("git", ["commit", "-m", message], { stdio: ["ignore", "inherit", "inherit"] });
}

function pushMain() {
  run("git", ["push", "origin", "main"], { stdio: ["ignore", "inherit", "inherit"] });
}

function triggerPages() {
  run("gh", ["workflow", "run", "--repo", repository, "pages.yml", "--ref", "main"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

function waitForPagesDeploy() {
  run("bash", [".github/scripts/wait-for-pages-dispatch.sh"], {
    env: { ...process.env, REPOSITORY: repository },
    stdio: ["ignore", "inherit", "inherit"],
  });
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
}

async function verifyRemoteFile(path, localFile) {
  const localJson = await readJson(localFile);
  const response = await fetch(`${pagesUrl}/${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Remote verify failed for ${path}: ${response.status}`);
  }
  const remoteJson = await response.json();
  const localGeneratedAt = String(localJson.generated_at || localJson.updatedAt || "");
  const remoteGeneratedAt = String(remoteJson.generated_at || remoteJson.updatedAt || "");

  if (localGeneratedAt && remoteGeneratedAt && localGeneratedAt !== remoteGeneratedAt) {
    throw new Error(`${path} generated_at mismatch: local=${localGeneratedAt} remote=${remoteGeneratedAt}`);
  }

  const localCount = Array.isArray(localJson.items)
    ? localJson.items.length
    : Array.isArray(localJson)
      ? localJson.length
      : Array.isArray(localJson.workflows)
        ? localJson.workflows.length
        : null;

  const remoteCount = Array.isArray(remoteJson.items)
    ? remoteJson.items.length
    : Array.isArray(remoteJson)
      ? remoteJson.length
      : Array.isArray(remoteJson.workflows)
        ? remoteJson.workflows.length
        : null;

  if (localCount !== null && remoteCount !== null && localCount !== remoteCount) {
    throw new Error(`${path} count mismatch: local=${localCount} remote=${remoteCount}`);
  }

  return { path, generatedAt: remoteGeneratedAt || localGeneratedAt, count: remoteCount ?? localCount };
}

async function verifyRemotePayloads() {
  const checks = [
    { path: "data/content.json", local: "site/data/content.json" },
    { path: "data/races.json", local: "site/data/races.json" },
    { path: "data/announcements.json", local: "site/data/announcements.json" },
    { path: "data/automation-health.json", local: "site/data/automation-health.json" },
  ];
  const results = [];
  for (const item of checks) {
    results.push(await verifyRemoteFile(item.path, item.local));
  }
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  ensureMainBranch();
  assertOriginMainIsNotAhead();

  const changes = listAllowedChanges();
  if (!changes.length) {
    console.log("No local changes found in the working tree.");
    return;
  }
  assertOnlyPublishScopeChanges(changes);

  if (!options.skipCheck) {
    run("npm", ["run", "check"], { stdio: ["ignore", "inherit", "inherit"] });
  }

  stagePublishPaths();
  const staged = stagedPublishPaths();
  if (!staged.length) {
    console.log("No publish-scope changes to commit.");
    return;
  }

  commitChanges(options.commitMessage);
  pushMain();

  if (!options.skipPagesWait) {
    triggerPages();
    waitForPagesDeploy();
  }

  if (!options.skipRemoteVerify) {
    const verified = await verifyRemotePayloads();
    for (const item of verified) {
      console.log(`Verified ${item.path}: generated_at=${item.generatedAt || "-"} count=${item.count ?? "-"}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
