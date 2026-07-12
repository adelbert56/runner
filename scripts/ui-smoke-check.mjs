import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const checks = [];

function assertCheck(condition, message) {
  checks.push({ ok: Boolean(condition), message });
}

function sentenceKeys(text) {
  return (String(text || "").match(/[^。！？.!?]+[。！？.!?]?/g) || [])
    .map((sentence) => sentence.replace(/[，、；：,.!?！？。;:\s]/g, "").slice(0, 48))
    .filter(Boolean);
}

const [html, app, contentRaw, trainer] = await Promise.all([
  readFile(resolve(root, "site/index.html"), "utf8"),
  readFile(resolve(root, "site/app.js"), "utf8"),
  readFile(resolve(root, "site/data/content.json"), "utf8"),
  readFile(resolve(root, "site/trainer.html"), "utf8"),
]);

const content = JSON.parse(contentRaw);
const items = Array.isArray(content.items) ? content.items : [];
const shoeCount = items.filter((item) => item.type === "shoe").length;
const newsCount = items.filter((item) => item.type === "news").length;
const longSummaries = items.filter((item) => String(item.summary || "").length > 180);
const duplicateSummaries = items.filter((item) => {
  const keys = sentenceKeys(item.summary);
  return keys.length !== new Set(keys).size;
});

assertCheck(!/const TODAY = "\d{4}-\d{2}-\d{2}"/.test(app), "front-end baseline date is dynamic");
assertCheck(/const TODAY = getTodayString\(\)/.test(app), "front-end uses getTodayString()");
assertCheck(/shoeContainer\.innerHTML = shoes\.map/.test(app), "published shoe content replaces static fallback when JSON loads");
assertCheck(/newsContainer\.innerHTML = news\.map/.test(app), "published news content replaces static fallback when JSON loads");
assertCheck(/\?v=2026\d{4}-[a-z0-9-]+/.test(html), "asset version parameter was bumped");
assertCheck(/announcements\.json\?v=\$\{DATA_VERSION\}/.test(app), "announcements load from scheduled data file");
assertCheck(/message-cloud\.json\?v=\$\{DATA_VERSION\}/.test(app), "message cloud loads from scheduled data file");
assertCheck(/source_url/.test(app) && /我要留言/.test(app), "message cloud links to GitHub issue comments");
assertCheck(items.length >= 10, `published content count is usable (${items.length})`);
assertCheck(shoeCount >= 10, `published shoe count reaches target (${shoeCount})`);
assertCheck(newsCount >= 10, `published news count reaches target (${newsCount})`);
assertCheck(longSummaries.length === 0, `content summaries stay concise (${longSummaries.length} over limit)`);
assertCheck(duplicateSummaries.length === 0, `content summaries do not repeat sentences (${duplicateSummaries.length} repeated)`);
assertCheck(/function trainingCompletionSummary\(/.test(trainer), "trainer uses one completion summary for progress and adherence");
assertCheck(/function trainingDataHealth\(/.test(trainer) && /renderTrainingStatusCard\(/.test(trainer), "auxiliary trainer tabs expose shared data health status");
assertCheck(/function exportTrainingData\(/.test(trainer) && /function importTrainingData\(/.test(trainer), "trainer supports local backup and restore");
assertCheck(/garminCompletionPct/.test(trainer) && /function garminCompletionPercent\(/.test(trainer), "Garmin automatic completion threshold is configurable");
assertCheck(/function mondayOfWeek\(/.test(trainer) && /calcWeeks\(profile\.targetDate, profile\.generatedAt\)/.test(trainer), "trainer includes the target race week when building a plan");

const failed = checks.filter((check) => !check.ok);
checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

if (failed.length) {
  process.exitCode = 1;
}
