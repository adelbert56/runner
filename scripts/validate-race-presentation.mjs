import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dataPath = resolve(root, "site/data/races.json");
const strictMode = process.argv.includes("--strict");
const suspiciousOrganizer = /同意|責任|危險性|免責|隱私政策|活動規程/u;

function items(value) {
  return String(value || "")
    .split(/[、；]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isBareMoney(value) {
  return /^(?:NT\$?|\$)?\s*[\d,]+\s*元?$/iu.test(value);
}

function isBareQuota(value) {
  return /^\d[\d,]*\s*(?:人|名)?$/u.test(value);
}

function feeIssues(race) {
  const values = items(race.fees);
  if (!values.length) return [];
  const chipDepositIndex = values.findIndex((value) => /晶片押金/u.test(value));
  const bare = values.filter((value, index) => isBareMoney(value) && !(chipDepositIndex >= 0 && index > chipDepositIndex));
  const unresolvedVariants = values.filter((value) => /(?:NT\$?|\$)?[\d,]+\s*元?\s*\/\s*(?:NT\$?|\$)?[\d,]+/iu.test(value));
  const issues = [];
  if (bare.length) issues.push(`費用缺組別：${bare.join("、")}`);
  if (unresolvedVariants.length) issues.push(`費用缺方案標籤：${unresolvedVariants.join("、")}`);
  return issues;
}

function quotaIssues(race) {
  const values = items(race.quota);
  const bare = values.filter(isBareQuota);
  return bare.length ? [`名額缺組別或總額語意：${bare.join("、")}`] : [];
}

function organizerIssues(race) {
  const organizer = String(race.organizer || "").trim();
  return organizer && suspiciousOrganizer.test(organizer)
    ? ["主辦欄疑似誤抓規程、免責或聲明文字"]
    : [];
}

const races = JSON.parse(await readFile(dataPath, "utf-8"));
const findings = races.map((race) => ({
  race,
  issues: [
    ...feeIssues(race),
    ...quotaIssues(race),
    ...organizerIssues(race),
  ],
})).filter((item) => item.issues.length);

console.log(`Races checked: ${races.length}`);
console.log(`Presentation-data issues: ${findings.length}`);
for (const { race, issues } of findings) {
  console.log(`- ${race.race_date || "日期未知"} ${race.race_name}: ${issues.join("；")}`);
}

if (strictMode && findings.length) {
  process.exitCode = 1;
}
