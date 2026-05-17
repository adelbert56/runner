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
  contentCandidateScript,
  publishContentScript,
  contentQualityScript,
  raceDbRaw,
  siteRaceRaw,
  weatherWorkflow,
  dataWorkflow,
  contentWorkflow,
  pagesWorkflow,
] = await Promise.all([
  text("package.json"),
  text("site/index.html"),
  text("site/app.js"),
  text("scripts/update-race-weather.mjs"),
  text("scripts/enrich-official-race-data.mjs"),
  text("scripts/validate-race-data.mjs"),
  text("scripts/build-operational-dashboard.mjs"),
  text("scripts/collect-content-candidates.mjs"),
  text("scripts/publish-content.mjs"),
  text("scripts/validate-content-data.mjs"),
  text("runner/賽事/賽事資料庫.json"),
  text("site/data/races.json"),
  text(".github/workflows/weather-refresh.yml"),
  text(".github/workflows/data-refresh.yml"),
  text(".github/workflows/content-candidates.yml"),
  text(".github/workflows/pages.yml"),
]);

const packageJson = JSON.parse(packageJsonRaw);
const appVersion = appJs.match(/const DATA_VERSION = "([^"]+)"/)?.[1] || "";
const scriptVersion = indexHtml.match(/app\.js\?v=([^"]+)"/)?.[1] || "";

assertCheck(
  packageJson.scripts.check.includes("scripts/validate-automation-rules.mjs"),
  "npm run check includes automation rule validation"
);
assertCheck(appVersion && appVersion === scriptVersion, `app data version matches index asset version (${appVersion})`);
assertCheck(appJs.includes("races.json?v=${DATA_VERSION}"), "race data fetch uses DATA_VERSION cache busting");
assertCheck(appJs.includes("content.json?v=${DATA_VERSION}"), "content data fetch uses DATA_VERSION cache busting");
assertCheck((appJs.match(/cache: "no-cache"/g) || []).length >= 2, "race/content fetches opt out of stale cache");
assertCheck(
  appJs.includes('timeZone: "Asia/Taipei"') && appJs.includes("const TODAY = getTodayString();"),
  "site date calculations use Asia/Taipei today"
);
assertCheck(raceDbRaw === siteRaceRaw, "runner race database and site race data are identical");

const dateSensitiveScripts = [
  ["scripts/update-race-weather.mjs", weatherScript],
  ["scripts/enrich-official-race-data.mjs", officialRaceScript],
  ["scripts/validate-race-data.mjs", raceQualityScript],
  ["scripts/build-operational-dashboard.mjs", dashboardScript],
  ["scripts/collect-content-candidates.mjs", contentCandidateScript],
  ["scripts/publish-content.mjs", publishContentScript],
  ["scripts/validate-content-data.mjs", contentQualityScript],
];

for (const [path, content] of dateSensitiveScripts) {
  assertCheck(content.includes("todayInTaipei"), `${path} uses Asia/Taipei today helper`);
  assertCheck(
    !/const\s+(?:TODAY|today)\s*=\s*process\.env\.RUNNER_TODAY\s*\|\|\s*new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(content),
    `${path} does not derive business date from UTC ISO date`
  );
}

assertCheck(weatherWorkflow.includes('cron: "0 23 * * *"'), "weather workflow runs at 07:00 Asia/Taipei");
assertCheck(dataWorkflow.includes('cron: "0 10 * * 2,4"'), "race data workflow runs at 18:00 Asia/Taipei Tuesday/Thursday");
assertCheck(contentWorkflow.includes('cron: "0 1 * * 1"'), "content workflow runs at 09:00 Asia/Taipei Monday");
assertCheck(weatherWorkflow.includes("runner/賽事/賽事資料庫.json") && weatherWorkflow.includes("site/data/races.json"), "weather auto-commit includes both race data outputs");
assertCheck(dataWorkflow.includes("runner/系統配置/營運儀表板.json") && dataWorkflow.includes("site/data/races.json"), "race data auto-commit includes dashboard and site data");
assertCheck(contentWorkflow.includes("site/data/content.json") && contentWorkflow.includes("runner/內容/內容品質報告.md"), "content auto-commit includes published content and quality report");
assertCheck(pagesWorkflow.includes('cp "runner/賽事/賽事資料庫.json" site/data/races.json'), "Pages deploy publishes canonical race database");

assertCheck(
  includesInOrder(dataWorkflow, [
    "Run race scrapers",
    "Enrich official platform details",
    "Apply manual supplements and quality report",
    "Run strict data quality gate",
    "Update race weather forecast",
    "Build operational dashboard",
    "Validate generated files",
    "Commit data updates",
  ]),
  "race data workflow validates generated files before commit"
);
assertCheck(
  includesInOrder(weatherWorkflow, ["Update race weather forecast", "Validate generated files", "Commit weather updates"]),
  "weather workflow validates generated files before commit"
);
assertCheck(
  includesInOrder(contentWorkflow, [
    "Collect and publish running content",
    "Run strict content quality gate",
    "Build operational dashboard",
    "Validate scripts",
    "Commit content candidates",
  ]),
  "content workflow validates generated files before commit"
);

const failed = checks.filter((check) => !check.ok);
checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

if (failed.length) {
  process.exitCode = 1;
}
