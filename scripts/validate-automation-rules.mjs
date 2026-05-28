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
  pagesWorkflow,
  ciWorkflow,
  scheduleAuditConfigRaw,
  httpClientScript,
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
  text(".github/workflows/pages.yml"),
  text(".github/workflows/ci.yml"),
  text(".github/schedule-audit.json"),
  text("scripts/http_client.py"),
]);

const packageJson = JSON.parse(packageJsonRaw);
const scheduleAuditConfig = JSON.parse(scheduleAuditConfigRaw);
const appVersion = appJs.match(/const DATA_VERSION = "([^"]+)"/)?.[1] || "";
const scriptVersion = indexHtml.match(/app\.js\?v=([^"]+)"/)?.[1] || "";

assertCheck(
  packageJson.scripts.check.includes("scripts/validate-automation-rules.mjs"),
  "npm run check includes automation rule validation"
);
assertCheck(appVersion && appVersion === scriptVersion, `app data version matches index asset version (${appVersion})`);
assertCheck(appJs.includes("races.json?v=${DATA_VERSION}"), "race data fetch uses DATA_VERSION cache busting");
assertCheck(appJs.includes("content.json?v=${DATA_VERSION}"), "content data fetch uses DATA_VERSION cache busting");
assertCheck(appJs.includes("announcements.json?v=${DATA_VERSION}"), "announcement data fetch uses DATA_VERSION cache busting");
assertCheck(appJs.includes("message-cloud.json?v=${DATA_VERSION}"), "message cloud data fetch uses DATA_VERSION cache busting");
assertCheck(appJs.includes("automation-health.json?v=${DATA_VERSION}"), "automation health fetch uses DATA_VERSION cache busting");
assertCheck(packageJson.scripts["message-cloud:build"] === "node scripts/build-message-cloud.mjs", "message cloud has a GitHub issue build script");
assertCheck(scheduleAuditConfig.pages_url === "https://adelbert56.github.io/runner/", "schedule audit checks the public GitHub Pages URL");
const raceScheduleAudit = scheduleAuditConfig.expected_workflows.find((workflow) => workflow.path === ".github/workflows/data-refresh.yml");
assertCheck(
  raceScheduleAudit?.max_age_minutes_by_local_weekday?.["3"] <= 430
    && raceScheduleAudit?.max_age_minutes_by_local_weekday?.["5"] <= 430,
  "schedule audit catches missed Tuesday/Thursday race data windows by next Taipei morning"
);
assertCheck(httpClientScript.includes("522") && httpClientScript.includes("Retry-After"), "HTTP scraper retry policy handles Cloudflare/transient failures");
assertCheck((appJs.match(/cache: "no-cache"/g) || []).length >= 2, "race/content fetches opt out of stale cache");
assertCheck(!appJs.includes("function buildAnnouncementItems"), "front end does not build announcements from race data");
assertCheck(raceDbRaw.includes('"first_seen_at"'), "race data includes first_seen_at tracking");
assertCheck(
  appJs.includes('timeZone: "Asia/Taipei"') && appJs.includes("const TODAY = getTodayString();"),
  "site date calculations use Asia/Taipei today"
);
assertCheck(raceDbRaw === siteRaceRaw, "runner race database and site race data are identical");
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
    && publishContentScript.includes("parseDate(normalizedArticleDate || normalizedCheckedAt)"),
  "published content dates prefer source article date before checked date"
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
  weatherWorkflow.includes("Check recent weather refresh guard") && weatherWorkflow.includes("--status success"),
  "weather backup schedules retry until a recent success exists"
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
  contentWorkflow.includes('cron: "17 1 * * 1,3,5"') && contentWorkflow.includes('cron: "37 2 * * 1,3,5"') && contentWorkflow.includes('cron: "17 4 * * 1,3,5"') && contentWorkflow.includes('cron: "47 5 * * 1,3,5"'),
  "content workflow has staggered Monday/Wednesday/Friday primary and backup schedules"
);
assertCheck(
  contentWorkflow.includes("Check recent content refresh guard") && contentWorkflow.includes("lookback_hours=8") && contentWorkflow.includes("--status success"),
  "content backup schedules retry until a recent success exists"
);
assertCheck(
  quipsWorkflow.includes('cron: "23 2 * * 1"') && quipsWorkflow.includes('cron: "53 3 * * 1"') && quipsWorkflow.includes('cron: "23 5 * * 1"'),
  "runner quips workflow has staggered Monday primary and backup schedules"
);
assertCheck(
  quipsWorkflow.includes("Check recent quips refresh guard") && quipsWorkflow.includes("--status success"),
  "runner quips backup schedules retry until a recent success exists"
);
assertCheck(
  messageCloudWorkflow.includes('cron: "7 4 * * *"') && messageCloudWorkflow.includes('cron: "7 10 * * *"') && messageCloudWorkflow.includes('MESSAGE_CLOUD_ISSUE_NUMBER: "34"'),
  "message cloud workflow refreshes the GitHub issue source twice daily"
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
  dataWorkflow.includes("git add --")
    && dataWorkflow.includes('"runner/系統配置/營運儀表板.md"')
    && dataWorkflow.includes('"runner/賽事/爬蟲最後狀態.json"'),
  "race data workflow stages dashboard reports explicitly"
);
assertCheck(weatherWorkflow.includes("git add --") && weatherWorkflow.includes('"site/data/races.json"'), "weather workflow stages site data explicitly");
assertCheck(contentWorkflow.includes("git add --") && contentWorkflow.includes('"runner/系統配置/營運儀表板.md"'), "content workflow stages dashboard reports explicitly");
assertCheck(quipsWorkflow.includes("git add --") && quipsWorkflow.includes('"site/data/announcements.json"'), "runner quips workflow stages announcement data explicitly");
assertCheck(messageCloudWorkflow.includes("git add --") && messageCloudWorkflow.includes('"site/data/message-cloud.json"'), "message cloud workflow stages site data explicitly");
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
  ["pages", pagesWorkflow],
]) {
  assertCheck(workflow.includes('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"'), `${name} workflow opts into Node 24 action runtime`);
}

for (const [name, workflow] of [
  ["weather", weatherWorkflow],
  ["content", contentWorkflow],
  ["runner quips", quipsWorkflow],
  ["message cloud", messageCloudWorkflow],
]) {
  assertCheck(workflow.includes("pages: write") && workflow.includes("id-token: write"), `${name} workflow can deploy Pages after scheduled updates`);
  assertCheck(workflow.includes("actions/upload-pages-artifact@v3") && workflow.includes("actions/deploy-pages@v4"), `${name} workflow deploys Pages directly`);
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
    "Setup Pages",
    "Upload site",
    "Deploy",
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
    "Setup Pages",
    "Upload site",
    "Deploy",
  ]),
  "content workflow validates, commits, and deploys in order"
);
assertCheck(
  includesInOrder(quipsWorkflow, [
    "Promote runner quips",
    "Build announcement and automation data",
    "Validate scripts",
    "Commit runner quips",
    "Setup Pages",
    "Upload site",
    "Deploy",
  ]),
  "runner quips workflow validates, commits, and deploys in order"
);
assertCheck(
  includesInOrder(messageCloudWorkflow, [
    "Build message cloud",
    "Validate scripts",
    "Commit message cloud",
    "Setup Pages",
    "Upload site",
    "Deploy",
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
