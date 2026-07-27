import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

// Real-execution unit checks for a handful of pure trainer pace/time utilities.
// ui-smoke-check.mjs only regex-matches source text; these actually run the
// functions against real inputs, so a broken function body fails here even if
// its signature/keywords are untouched.

const root = resolve(import.meta.dirname, "..");
const checks = [];

function assertEqual(actual, expected, message) {
  const ok = actual === expected;
  checks.push({ ok, message: ok ? message : `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})` });
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`function ${name} not found in source`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces for function ${name}`);
}

const [trainerJs, trainerCopyJs, trainerPlanJs, trainerRenderJs] = await Promise.all([
  readFile(resolve(root, "site/trainer.js"), "utf8"),
  readFile(resolve(root, "site/trainer-copy.js"), "utf8"),
  readFile(resolve(root, "site/trainer-plan.js"), "utf8"),
  readFile(resolve(root, "site/trainer-render.js"), "utf8"),
]);

const sandbox = { TRAINING_TYPE_LABELS: { easy: "輕鬆跑", tempo: "節奏跑", interval: "間歇跑", long: "長跑" } };
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunction(trainerCopyJs, "secToPace"),
    extractFunction(trainerCopyJs, "coachPlanHeadline"),
    extractFunction(trainerJs, "timeToSec"),
    extractFunction(trainerJs, "targetTimeToSec"),
    extractFunction(trainerJs, "isValidClockInput"),
  ].join("\n\n"),
  sandbox
);
const { secToPace, coachPlanHeadline, timeToSec, targetTimeToSec, isValidClockInput } = sandbox;

const structureSandbox = {};
vm.createContext(structureSandbox);
vm.runInContext(extractFunction(trainerPlanJs, "buildGarminWorkoutStructure"), structureSandbox);
const { buildGarminWorkoutStructure } = structureSandbox;

const coachCopySandbox = {};
vm.createContext(coachCopySandbox);
vm.runInContext(extractFunction(trainerRenderJs, "coachPlanMainInstruction"), coachCopySandbox);
const { coachPlanMainInstruction } = coachCopySandbox;

// secToPace
assertEqual(secToPace(330), "5:30", "secToPace formats whole minutes:seconds");
assertEqual(secToPace(305), "5:05", "secToPace zero-pads sub-10 seconds");
assertEqual(secToPace(0), "—", "secToPace shows em-dash for zero/invalid seconds");
assertEqual(secToPace(-5), "—", "secToPace shows em-dash for negative seconds");

// timeToSec
assertEqual(timeToSec("2:10:00"), 7800, "timeToSec parses H:MM:SS");
assertEqual(timeToSec("5:30"), 330, "timeToSec parses M:SS");
assertEqual(timeToSec(""), 0, "timeToSec returns 0 for empty input");
assertEqual(timeToSec("abc"), 0, "timeToSec returns 0 for non-numeric input");

// targetTimeToSec: the "2:10" ambiguity bug fixed 2026-07 — a two-segment
// input must be read as H:MM when treating it as M:SS implies a
// world-record-beating pace for the target distance.
assertEqual(targetTimeToSec("2:10", 21.0975), 7800, "targetTimeToSec reads ambiguous '2:10' as 2h10m for a half marathon");
assertEqual(targetTimeToSec("2:10:00", 21.0975), 7800, "targetTimeToSec passes through unambiguous H:MM:SS");
assertEqual(targetTimeToSec("25:00", 5), 1500, "targetTimeToSec keeps a genuine M:SS-as-total-time reading when the implied pace is realistic");

// isValidClockInput
assertEqual(isValidClockInput("2:10", [2, 3]), true, "isValidClockInput accepts H:MM");
assertEqual(isValidClockInput("2:10:00", [2, 3]), true, "isValidClockInput accepts H:MM:SS");
assertEqual(isValidClockInput("2:70", [2, 3]), false, "isValidClockInput rejects out-of-range minutes/seconds");
assertEqual(isValidClockInput("0:30", [2, 3]), false, "isValidClockInput rejects a zero leading unit");
assertEqual(isValidClockInput("7:30", [2]), true, "isValidClockInput accepts M:SS pace input");

const intervalStructure = buildGarminWorkoutStructure("interval", [
  { title: "熱身", dose: "15 分" },
  { title: "主課", dose: "4×400m", detail: "目標配速 4:30/km，每趟之間慢跑 90 秒恢復。" },
  { title: "收操", dose: "10 分" },
], 5.5, "配速 4:30/km · HR 160–170");
assertEqual(intervalStructure[1]?.kind, "repeat", "interval main work is emitted as a Garmin repeat group");
assertEqual(intervalStructure[0]?.end?.type, "time", "warmup remains a time step for in-place preparation");
assertEqual(intervalStructure.at(-1)?.end?.type, "time", "cooldown remains a time step instead of an invented distance");
assertEqual(intervalStructure[1]?.children?.[0]?.end?.value, 400, "interval repeat uses the prescribed fast-segment distance");
assertEqual(intervalStructure[1]?.children?.[1]?.end?.value, 90, "interval repeat uses the prescribed recovery duration");

const tempoStructure = buildGarminWorkoutStructure("tempo", [
  { title: "熱身", dose: "12 分" },
  { title: "主課", dose: "2×2.5 km", detail: "兩段節奏跑，中間慢跑 3 分鐘恢復。" },
  { title: "收操", dose: "8 分" },
], 7, "配速 4:50/km · HR 150–160");
assertEqual(tempoStructure[1]?.children?.[0]?.end?.value, 2500, "tempo cruise repeats use per-block distance, not total workout distance");

const fartlekStructure = buildGarminWorkoutStructure("interval", [
  { title: "熱身", dose: "15 分" },
  { title: "主課", dose: "3–4 組", detail: "每組快跑 3 分 + 慢跑 2 分。" },
  { title: "收操", dose: "10 分" },
], 5, "配速 4:45/km");
assertEqual(fartlekStructure[1]?.children?.[0]?.end?.value, 180, "fartlek fast segments use Garmin time steps");
assertEqual(fartlekStructure[1]?.children?.[1]?.end?.value, 120, "fartlek recovery segments use Garmin time steps");
assertEqual(coachPlanMainInstruction('總 5.5 km（含 ST）：0.8 km 熱身＋E 主課約 3.6 km＋ST 快步 4×20 秒＋0.7 km 收操＋肌力 B。'), 'E 主課約 3.6 km＋ST 快步 4×20 秒。', "coach main-card copy excludes warmup and cooldown distance");
assertEqual(coachPlanHeadline('總 5.5 km（含 ST）：0.8 km 熱身＋E 主課約 3.6 km＋ST 快步 4×20 秒。'), '輕鬆跑', "coach heading keeps the easy-run title when the prescription uses E main-work notation");

checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  process.exitCode = 1;
}
