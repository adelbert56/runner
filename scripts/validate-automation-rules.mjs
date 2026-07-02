import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const checks = [];

function assertCheck(condition, message) {
  checks.push({ ok: Boolean(condition), message });
}

async function text(path) {
  return readFile(resolve(root, path), "utf8");
}

function includesInOrder(content, labels) {
  let index = -1;
  for (const label of labels) {
    const next = content.indexOf(label, index + 1);
    if (next < 0) {
      return false;
    }
    index = next;
  }
  return true;
}

function extractLookbackHours(workflow) {
  const match = workflow.match(/lookback_hours=(\d+)/);
  return match ? Number(match[1]) : null;
}

function extractOrchestratorTask(source, workflowFile) {
  const tasksBlockMatch = source.match(/const TASKS = \[(?<body>[\s\S]*?)\n\];/);
  if (!tasksBlockMatch?.groups?.body) {
    return null;
  }

  const taskBlocks = tasksBlockMatch.groups.body
    .split(/\n  },\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const block = taskBlocks.find((candidate) => candidate.includes(`workflow: "${workflowFile}"`));
  if (!block) {
    return null;
  }

  const name = block.match(/name: "([^"]+)"/)?.[1] || null;
  const slots = [];
  const slotRegex = /{ days: \[([^\]]+)\], due: "([^"]+)", deadline: "([^"]+)" }/g;
  let slotMatch;
  while ((slotMatch = slotRegex.exec(block)) !== null) {
    slots.push({
      days: slotMatch[1].split(",").map((value) => Number(value.trim())),
      due: slotMatch[2],
      deadline: slotMatch[3],
    });
  }
  return { name, slots };
}

function workflowCommitsGeneratedFiles(workflow, files) {
  return workflow.includes("bash .github/scripts/commit-generated.sh")
    && commitGeneratedScript.includes("git add --")
    && files.every((file) => workflow.includes(file));
}

const [
  packageJsonRaw,
  indexHtml,
  appJs,
  weatherScript,
  officialRaceScript,
  raceQualityScript,
  dashboardScript,
  announcementsScript,
  automationHealthScript,
  contentCandidateScript,
  publishContentScript,
  contentQualityScript,
  runnerQuipsScript,
  raceDbRaw,
  siteRaceRaw,
  pythonConfig,
  sportsNoteScraper,
  sportsnetScraper,
  twttraScraper,
  weatherWorkflow,
  dataWorkflow,
  contentWorkflow,
  quipsWorkflow,
  messageCloudWorkflow,
  automationOrchestratorWorkflow,
  automationOrchestratorScript,
  pagesWorkflow,
  ciWorkflow,
  scheduleAuditConfigRaw,
  httpClientScript,
  commitGeneratedScript,
  waitForPagesDispatchScript,
] = await Promise.all([
  text("package.json"),
  text("site/index.html"),
  text("site/app.js"),
  text("scripts/update-race-weather.mjs"),
  text("scripts/enrich-official-race-data.mjs"),
  text("scripts/validate-race-data.mjs"),
  text("scripts/build-operational-dashboard.mjs"),
  text("scripts/build-announcements.mjs"),
  text("scripts/build-automation-health.mjs"),
  text("scripts/collect-content-candidates.mjs"),
  text("scripts/publish-content.mjs"),
  text("scripts/validate-content-data.mjs"),
  text("scripts/refresh-runner-quips.mjs"),
  text("runner/賽事/賽事資料庫.json"),
  text("site/data/races.json"),
  text("scripts/config.py"),
  text("scripts/scrapers/sports_note_scraper.py"),
  text("scripts/scrapers/sportsnet_scraper.py"),
  text("scripts/scrapers/twttra_scraper.py"),
  text(".github/workflows/weather-refresh.yml"),
  text(".github/workflows/data-refresh.yml"),
  text(".github/workflows/content-candidates.yml"),
  text(".github/workflows/runner-quips-refresh.yml"),
  text(".github/workflows/message-cloud-refresh.yml"),
  text(".github/workflows/automation-orchestrator.yml"),
  text("scripts/automation-orchestrator.mjs"),
  text(".github/workflows/pages.yml"),
  text(".github/workflows/ci.yml"),
  text(".github/schedule-audit.json"),
  text("scripts/http_client.py"),
  text(".github/scripts/commit-generated.sh"),
  text(".github/scripts/wait-for-pages-dispatch.sh"),
]);

const packageJson = JSON.parse(packageJsonRaw);
const scheduleAuditConfig = JSON.parse(scheduleAuditConfigRaw);
const appUsesDynamicDataVersion = appJs.includes("const DATA_VERSION = `${Date.now()}`;");
const scriptVersion = indexHtml.match(/app\.js\?v=([^"]+)"/)?.[1] || "";
const scheduledWorkflowExpectations = [
  {
    label: "weather",
    workflowFile: "weather-refresh.yml",
    workflowName: "Refresh race weather",
    workflowSource: weatherWorkflow,
    lookbackHours: 6,
    slots: [{ days: [0, 1, 2, 3, 4, 5, 6], due: "07:23", deadline: "15:30" }],
  },
  {
    label: "race data",
    workflowFile: "data-refresh.yml",
    workflowName: "Refresh race data",
    workflowSource: dataWorkflow,
    lookbackHours: 18,
    slots: [{ days: [2, 4], due: "18:17", deadline: "23:59" }],
  },
  {
    label: "content",
    workflowFile: "content-candidates.yml",
    workflowName: "Collect content candidates",
    workflowSource: contentWorkflow,
    lookbackHours: 8,
    slots: [{ days: [0, 1, 2, 3, 4, 5, 6], due: "09:17", deadline: "18:00" }],
  },
  {
    label: "runner quips",
    workflowFile: "runner-quips-refresh.yml",
    workflowName: "Refresh runner quips",
    workflowSource: quipsWorkflow,
    lookbackHours: 8,
    slots: [{ days: [1], due: "10:23", deadline: "18:00" }],
  },
  {
    label: "message cloud",
    workflowFile: "message-cloud-refresh.yml",
    workflowName: "Refresh message cloud",
    workflowSource: messageCloudWorkflow,
    lookbackHours: 8,
    slots: [
      { days: [0, 1, 2, 3, 4, 5, 6], due: "12:07", deadline: "17:59" },
      { days: [0, 1, 2, 3, 4, 5, 6], due: "18:07", deadline: "23:59" },
    ],
  },
];

assertCheck(
  packageJson.scripts.check.includes("scripts/validate-automation-rules.mjs"),
  "npm run check includes automation rule validation"
);
assertCheck(
  appUsesDynamicDataVersion || Boolean(scriptVersion),
  appUsesDynamicDataVersion
    ? "app data version uses runtime cache busting"
    : `app script asset version is present (${scriptVersion})`
);
assertCheck(appJs.includes("races.json?v=${DATA_VERSION}"), "race data fetch uses DATA_VERSION cache busting");
assertCheck(appJs.includes("content.json?v=${DATA_VERSION}"), "content data fetch uses DATA_VERSION cache busting");
assertCheck(appJs.includes("announcements.json?v=${DATA_VERSION}"), "announcement data fetch uses DATA_VERSION cache busting");
assertCheck(appJs.includes("message-cloud.json?v=${DATA_VERSION}"), "message cloud data fetch uses DATA_VERSION cache busting");
assertCheck(appJs.includes("automation-health.json?v=${DATA_VERSION}"), "automation health fetch uses DATA_VERSION cache busting");
assertCheck(packageJson.scripts["message-cloud:build"] === "node scripts/build-message-cloud.mjs", "message cloud has a GitHub issue build script");
assertCheck(scheduleAuditConfig.pages_url === "https://adelbert56.github.io/runner/", "schedule audit checks the public GitHub Pages URL");
assertCheck(waitForPagesDispatchScript.includes('workflow_file="${PAGES_WORKFLOW_FILE:-pages.yml}"'), "shared Pages wait script defaults to pages.yml");
assertCheck(waitForPagesDispatchScript.includes('workflow_event="${PAGES_WORKFLOW_EVENT:-workflow_dispatch}"'), "shared Pages wait script waits for workflow_dispatch runs");
assertCheck(waitForPagesDispatchScript.includes('gh run watch --repo "$REPOSITORY" "$pages_run_id" --exit-status'), "shared Pages wait script blocks on deploy completion");
const raceScheduleAudit = scheduleAuditConfig.expected_workflows.find((workflow) => workflow.path === ".github/workflows/data-refresh.yml");
assertCheck(
  raceScheduleAudit?.max_age_minutes_by_local_weekday?.["3"] <= 430
    && raceScheduleAudit?.max_age_minutes_by_local_weekday?.["5"] <= 430,
  "schedule audit catches missed Tuesday/Thursday race data windows by next Taipei morning"
);
assertCheck(
  raceScheduleAudit?.recovery_events?.includes("workflow_dispatch"),
  "schedule audit accepts manual race data recovery runs in the same freshness window"
);
assertCheck(
  scheduleAuditConfig.expected_workflows
    .filter((workflow) => [
      ".github/workflows/weather-refresh.yml",
      ".github/workflows/content-candidates.yml",
      ".github/workflows/message-cloud-refresh.yml",
      ".github/workflows/runner-quips-refresh.yml",
    ].includes(workflow.path))
    .every((workflow) => workflow.recovery_events?.includes("workflow_dispatch")),
  "schedule audit accepts orchestrator recovery dispatches for scheduled content, weather, and message cloud workflows"
);
for (const expected of scheduledWorkflowExpectations) {
  const lookbackHours = extractLookbackHours(expected.workflowSource);
  const auditEntry = scheduleAuditConfig.expected_workflows.find((workflow) => workflow.path === `.github/workflows/${expected.workflowFile}`);
  const orchestratorTask = extractOrchestratorTask(automationOrchestratorScript, expected.workflowFile);

  assertCheck(lookbackHours === expected.lookbackHours, `${expected.label} workflow keeps the expected lookback guard (${expected.lookbackHours}h)`);
  assertCheck(Boolean(auditEntry), `${expected.label} workflow is registered in schedule audit config`);
  assertCheck(auditEntry?.name === expected.workflowName, `${expected.label} audit entry matches the workflow display name`);
  assertCheck(auditEntry?.recovery_events?.includes("workflow_dispatch"), `${expected.label} audit entry accepts workflow_dispatch recovery`);
  assertCheck(Boolean(orchestratorTask), `${expected.label} workflow is covered by automation orchestrator`);
  assertCheck(orchestratorTask?.name === expected.workflowName, `${expected.label} orchestrator task matches the workflow display name`);
  assertCheck(JSON.stringify(orchestratorTask?.slots || []) === JSON.stringify(expected.slots), `${expected.label} orchestrator slots match the validated schedule windows`);
}
assertCheck(httpClientScript.includes("522") && httpClientScript.includes("Retry-After"), "HTTP scraper retry policy handles Cloudflare/transient failures");
assertCheck((appJs.match(/cache: "no-cache"/g) || []).length >= 2, "race/content fetches opt out of stale cache");
assertCheck(!appJs.includes("function buildAnnouncementItems"), "front end does not build announcements from race data");
assertCheck(raceDbRaw.includes('"first_seen_at"'), "race data includes first_seen_at tracking");
assertCheck(
  appJs.includes('timeZone: "Asia/Taipei"') && appJs.includes("const TODAY = getTodayString();"),
  "site date calculations use Asia/Taipei today"
);
assertCheck(
  (() => {
    const runnerRaces = JSON.parse(raceDbRaw);
    const siteRaces = JSON.parse(siteRaceRaw);
    const activeSiteRaces = siteRaces.filter((race) => !race.disappeared_at);
    return JSON.stringify(runnerRaces) === JSON.stringify(activeSiteRaces);
  })(),
  "runner race database matches active site race data"
);
assertCheck(
  pythonConfig.includes("NON_RUNNING_EVENT_KEYWORDS")
    && sportsNoteScraper.includes("is_running_event")
    && sportsnetScraper.includes("is_running_event")
    && twttraScraper.includes("is_running_event"),
  "race scrapers filter non-running events before quality gates"
);
assertCheck(contentCandidateScript.includes("function extractMetaDate"), "content crawler extracts source article dates");
assertCheck(contentCandidateScript.includes("article_date"), "content candidates preserve source article dates");
assertCheck(
  publishContentScript.includes("normalizeIsoDate(item.article_date)")
    && publishContentScript.includes("normalizeIsoDate(item.checked_at)")
    && publishContentScript.includes("normalizeIsoDate(item.first_seen_at)")
    && publishContentScript.includes("date: parseDate(stableContentDate(item))"),
  "published content dates prefer source article date before stable first-seen date"
);
assertCheck(
  publishContentScript.includes("PUBLISH_WINDOW_DAYS"),
  "auto-published content enforces recent publish window"
);
assertCheck(
  publishContentScript.includes("function sourceOriginRank") && appJs.includes("data-source-origin") && appJs.includes("content-origin-tag"),
  "published content surfaces newly crawled items ahead of inventory"
);

const dateSensitiveScripts = [
  ["scripts/update-race-weather.mjs", weatherScript],
  ["scripts/enrich-official-race-data.mjs", officialRaceScript],
  ["scripts/validate-race-data.mjs", raceQualityScript],
  ["scripts/build-operational-dashboard.mjs", dashboardScript],
  ["scripts/build-announcements.mjs", announcementsScript],
  ["scripts/build-automation-health.mjs", automationHealthScript],
  ["scripts/collect-content-candidates.mjs", contentCandidateScript],
  ["scripts/publish-content.mjs", publishContentScript],
  ["scripts/validate-content-data.mjs", contentQualityScript],
  ["scripts/refresh-runner-quips.mjs", runnerQuipsScript],
];

for (const [path, content] of dateSensitiveScripts) {
  assertCheck(content.includes("todayInTaipei"), `${path} uses Asia/Taipei today helper`);
  assertCheck(
    !/const\s+(?:TODAY|today)\s*=\s*process\.env\.RUNNER_TODAY\s*\|\|\s*new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(content),
    `${path} does not derive business date from UTC ISO date`
  );
}

assertCheck(
  weatherWorkflow.includes('cron: "23 23 * * *"') && weatherWorkflow.includes('cron: "37 0 * * *"') && weatherWorkflow.includes('cron: "7 3 * * *"'),
  "weather workflow uses staggered daily primary and backup schedules"
);
assertCheck(
  weatherWorkflow.includes("Check recent weather refresh guard")
    && weatherWorkflow.includes("--json databaseId,createdAt,status,conclusion")
    && weatherWorkflow.includes('.conclusion == "success"')
    && weatherWorkflow.includes('.status == "in_progress"')
    && weatherWorkflow.includes('.status == "queued"'),
  "weather schedule slots skip when a recent refresh already exists or is running"
);
assertCheck(
  dataWorkflow.includes('cron: "17 10 * * 2,4"') && dataWorkflow.includes('cron: "47 11 * * 2,4"') && dataWorkflow.includes('cron: "17 13 * * 2,4"') && dataWorkflow.includes('cron: "47 15 * * 2,4"'),
  "race data workflow has staggered primary and backup Tuesday/Thursday schedules"
);
assertCheck(
  dataWorkflow.includes("Check recent refresh guard")
    && dataWorkflow.includes("lookback_hours=18")
    && dataWorkflow.includes("--json databaseId,createdAt,status,conclusion")
    && dataWorkflow.includes('.conclusion == "success"')
    && dataWorkflow.includes('.status == "in_progress"')
    && dataWorkflow.includes('.status == "queued"'),
  "race data backup schedules retry until a recent success exists"
);
assertCheck(
  !dataWorkflow.includes('Primary schedule trigger ($SCHEDULE); continuing.'),
  "race data primary schedule also skips when a recent refresh already exists"
);
assertCheck(
  contentWorkflow.includes('cron: "17 1 * * *"') && contentWorkflow.includes('cron: "37 2 * * *"') && contentWorkflow.includes('cron: "17 4 * * *"') && contentWorkflow.includes('cron: "47 5 * * *"'),
  "content workflow has staggered daily primary and backup schedules"
);
assertCheck(
  contentWorkflow.includes("Check recent content refresh guard")
    && contentWorkflow.includes("lookback_hours=8")
    && contentWorkflow.includes("--json databaseId,createdAt,status,conclusion")
    && contentWorkflow.includes('.conclusion == "success"')
    && contentWorkflow.includes('.status == "in_progress"')
    && contentWorkflow.includes('.status == "queued"')
    && !contentWorkflow.includes('Primary schedule trigger ($SCHEDULE); continuing.'),
  "content schedule slots skip when a recent refresh already exists or is running"
);
assertCheck(
  quipsWorkflow.includes('cron: "23 2 * * 1"') && quipsWorkflow.includes('cron: "53 3 * * 1"') && quipsWorkflow.includes('cron: "23 5 * * 1"'),
  "runner quips workflow has staggered Monday primary and backup schedules"
);
assertCheck(
  quipsWorkflow.includes("Check recent quips refresh guard")
    && quipsWorkflow.includes("--json databaseId,createdAt,status,conclusion")
    && quipsWorkflow.includes('.conclusion == "success"')
    && quipsWorkflow.includes('.status == "in_progress"')
    && quipsWorkflow.includes('.status == "queued"')
    && !quipsWorkflow.includes('Primary schedule trigger ($SCHEDULE); continuing.'),
  "runner quips schedule slots skip when a recent refresh already exists or is running"
);
assertCheck(
  messageCloudWorkflow.includes('cron: "7 4 * * *"') && messageCloudWorkflow.includes('cron: "7 10 * * *"') && messageCloudWorkflow.includes('MESSAGE_CLOUD_ISSUE_NUMBER: "34"'),
  "message cloud workflow refreshes the GitHub issue source twice daily"
);
assertCheck(
  messageCloudWorkflow.includes("Check recent message cloud refresh guard")
    && messageCloudWorkflow.includes("lookback_hours=8")
    && messageCloudWorkflow.includes("--json databaseId,createdAt,status,conclusion")
    && messageCloudWorkflow.includes('.conclusion == "success"')
    && messageCloudWorkflow.includes('.status == "in_progress"')
    && messageCloudWorkflow.includes('.status == "queued"'),
  "message cloud schedule slots skip when a recent refresh already exists or is running"
);
assertCheck(
  automationOrchestratorWorkflow.includes('cron: "*/30 * * * *"')
    && automationOrchestratorWorkflow.includes("workflow_run:")
    && automationOrchestratorWorkflow.includes("node scripts/automation-orchestrator.mjs"),
  "automation orchestrator runs as a high-frequency heartbeat and workflow-run backfill"
);
assertCheck(
  automationOrchestratorWorkflow.includes("actions: write")
    && automationOrchestratorWorkflow.includes("Refresh runner quips")
    && automationOrchestratorWorkflow.includes("Collect content candidates")
    && automationOrchestratorWorkflow.includes("Refresh race data")
    && automationOrchestratorWorkflow.includes("Refresh message cloud"),
  "automation orchestrator can dispatch missed runner quips, content, race data, and message cloud workflows"
);
assertCheck(
  messageCloudWorkflow.includes("issues: read") && messageCloudWorkflow.includes("npm run message-cloud:build"),
  "message cloud workflow can read issue comments and build data"
);
assertCheck(weatherWorkflow.includes("runner/賽事/賽事資料庫.json") && weatherWorkflow.includes("site/data/races.json"), "weather auto-commit includes both race data outputs");
assertCheck(dataWorkflow.includes("runner/系統配置/營運儀表板.json") && dataWorkflow.includes("site/data/races.json"), "race data auto-commit includes dashboard and site data");
assertCheck(contentWorkflow.includes("site/data/content.json") && contentWorkflow.includes("runner/內容/內容品質報告.md"), "content auto-commit includes published content and quality report");
assertCheck(quipsWorkflow.includes("site/data/runner-quips.json") && quipsWorkflow.includes("runner/內容/跑者碎念候補.json"), "runner quips workflow commits active and backlog data");
assertCheck(dataWorkflow.includes("site/data/announcements.json") && quipsWorkflow.includes("site/data/announcements.json"), "announcement data is rebuilt by race and quips workflows");
assertCheck(dataWorkflow.includes("site/data/automation-health.json") && contentWorkflow.includes("site/data/automation-health.json"), "automation health data is committed by scheduled workflows");
assertCheck(!dataWorkflow.includes("git-auto-commit-action") && !weatherWorkflow.includes("git-auto-commit-action"), "race workflows avoid pattern-based auto-commit action");
assertCheck(!contentWorkflow.includes("git-auto-commit-action") && !quipsWorkflow.includes("git-auto-commit-action"), "content workflows avoid pattern-based auto-commit action");
assertCheck(
  workflowCommitsGeneratedFiles(dataWorkflow, [
    '"runner/系統配置/營運儀表板.md"',
    '"runner/賽事/爬蟲最後狀態.json"',
  ]),
  "race data workflow stages dashboard reports explicitly"
);
assertCheck(
  workflowCommitsGeneratedFiles(weatherWorkflow, ['"site/data/races.json"']),
  "weather workflow stages site data explicitly"
);
assertCheck(
  workflowCommitsGeneratedFiles(contentWorkflow, ['"runner/系統配置/營運儀表板.md"']),
  "content workflow stages dashboard reports explicitly"
);
assertCheck(
  workflowCommitsGeneratedFiles(quipsWorkflow, ['"site/data/announcements.json"']),
  "runner quips workflow stages announcement data explicitly"
);
assertCheck(
  workflowCommitsGeneratedFiles(messageCloudWorkflow, ['"site/data/message-cloud.json"']),
  "message cloud workflow stages site data explicitly"
);
assertCheck(pagesWorkflow.includes('cp "runner/賽事/賽事資料庫.json" site/data/races.json'), "Pages deploy publishes canonical race database");
assertCheck(pagesWorkflow.includes("actions/setup-node@v6"), "Pages deploy installs Node before derived data builds");
assertCheck(pagesWorkflow.includes('node-version: "22"'), "Pages deploy uses the shared Node version");
assertCheck(pagesWorkflow.includes("npm run announcements:build") && pagesWorkflow.includes("npm run automation:health"), "Pages deploy rebuilds derived site data");

for (const [name, workflow] of [
  ["ci", ciWorkflow],
  ["weather", weatherWorkflow],
  ["race data", dataWorkflow],
  ["content", contentWorkflow],
  ["runner quips", quipsWorkflow],
  ["message cloud", messageCloudWorkflow],
  ["automation orchestrator", automationOrchestratorWorkflow],
  ["pages", pagesWorkflow],
]) {
  assertCheck(workflow.includes('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"'), `${name} workflow opts into Node 24 action runtime`);
}

for (const [name, workflow] of [
  ["race data", dataWorkflow],
  ["weather", weatherWorkflow],
  ["content", contentWorkflow],
  ["runner quips", quipsWorkflow],
  ["message cloud", messageCloudWorkflow],
]) {
  assertCheck(workflow.includes("actions: write"), `${name} workflow can trigger Pages deploy`);
  assertCheck(workflow.includes("pages.yml"), `${name} workflow delegates Pages deploy to pages.yml`);
  assertCheck(workflow.includes("Wait for Pages deploy"), `${name} workflow waits for the matching Pages deploy`);
  assertCheck(workflow.includes("bash .github/scripts/wait-for-pages-dispatch.sh"), `${name} workflow uses the shared Pages wait script`);
}

assertCheck(
  includesInOrder(dataWorkflow, [
    "Run race scrapers",
    "Enrich official platform details",
    "Apply manual supplements and quality report",
    "Run strict data quality gate",
    "Update race weather forecast",
    "Sync site race data",
    "Build operational dashboard",
    "Build announcement and automation data",
    "Validate generated files",
    "Commit data updates",
  ]),
  "race data workflow syncs, validates, and commits in order"
);
assertCheck(
  includesInOrder(weatherWorkflow, [
    "Update race weather forecast",
    "Sync site race data",
    "Build announcement and automation data",
    "Validate generated files",
    "Commit weather updates",
    "Trigger Pages deploy",
    "Wait for Pages deploy",
  ]),
  "weather workflow syncs, validates, commits, and deploys in order"
);
assertCheck(
  includesInOrder(contentWorkflow, [
    "Collect and publish running content",
    "Run strict content quality gate",
    "Build operational dashboard",
    "Build automation health data",
    "Validate scripts",
    "Commit content candidates",
    "Trigger Pages deploy",
    "Wait for Pages deploy",
  ]),
  "content workflow validates, commits, and deploys in order"
);
assertCheck(
  includesInOrder(quipsWorkflow, [
    "Promote runner quips",
    "Build announcement and automation data",
    "Validate scripts",
    "Commit runner quips",
    "Trigger Pages deploy",
    "Wait for Pages deploy",
  ]),
  "runner quips workflow validates, commits, and deploys in order"
);
assertCheck(
  includesInOrder(messageCloudWorkflow, [
    "Check recent message cloud refresh guard",
    "Build message cloud",
    "Validate scripts",
    "Commit message cloud",
    "Trigger Pages deploy",
    "Wait for Pages deploy",
  ]),
  "message cloud workflow validates, commits, and deploys in order"
);

const failed = checks.filter((check) => !check.ok);
checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

if (failed.length) {
  process.exitCode = 1;
}
