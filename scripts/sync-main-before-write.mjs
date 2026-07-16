import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function ensureCleanMain() {
  const branch = run("git", ["branch", "--show-current"]);
  if (branch !== "main") {
    throw new Error(`Main sync only runs on main. Current branch: ${branch}`);
  }

  if (run("git", ["status", "--short"])) {
    throw new Error("Working tree is not clean. Commit or stash changes before syncing main.");
  }
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  ensureCleanMain();
  run("git", ["fetch", "origin", "main"]);

  const head = run("git", ["rev-parse", "HEAD"]);
  const remote = run("git", ["rev-parse", "origin/main"]);
  if (head === remote) {
    console.log("main is already synchronized with origin/main.");
    return;
  }

  if (isAncestor(head, remote)) {
    run("git", ["merge", "--ff-only", "origin/main"], { stdio: ["ignore", "inherit", "inherit"] });
    console.log("Fast-forwarded main to the latest origin/main before generating changes.");
    return;
  }

  if (isAncestor(remote, head)) {
    console.log("Local main is ahead of origin/main; keeping local commits for the next publish.");
    return;
  }

  throw new Error("main and origin/main have diverged. Rebase local commits before generating new publish data.");
}

main();
