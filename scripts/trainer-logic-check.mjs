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

const [trainerJs, trainerCopyJs, trainerPlanJs, trainerRenderJs, trainerCoachEngineJs] = await Promise.all([
  readFile(resolve(root, "site/trainer.js"), "utf8"),
  readFile(resolve(root, "site/trainer-copy.js"), "utf8"),
  readFile(resolve(root, "site/trainer-plan.js"), "utf8"),
  readFile(resolve(root, "site/trainer-render.js"), "utf8"),
  readFile(resolve(root, "site/trainer-coach-engine.js"), "utf8"),
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
vm.runInContext([extractFunction(trainerRenderJs, "coachPlanMainInstruction"), extractFunction(trainerRenderJs, "normalizeCoachWorkoutSteps")].join("\n\n"), coachCopySandbox);
const { coachPlanMainInstruction, normalizeCoachWorkoutSteps } = coachCopySandbox;

const coachEngineSandbox = {};
vm.createContext(coachEngineSandbox);
vm.runInContext([extractFunction(trainerCoachEngineJs, "coachPrescribedKm"), extractFunction(trainerCoachEngineJs, "coachPrescribedMainKm")].join("\n\n"), coachEngineSandbox);
const { coachPrescribedKm, coachPrescribedMainKm } = coachEngineSandbox;

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
assertEqual(coachPlanMainInstruction('總約 8.0 km：8 分鐘熱身＋6×（2 分 T 體感／2 分 E 慢跑）＋E 補足 4.0 km＋6 分鐘收操；前夜睡眠 <6 小時則改全程 E 8 km。'), '6×（2 分 T 體感／2 分 E 慢跑）＋E 補足 4.0 km；前夜睡眠 <6 小時則改全程 E 8 km。', "coach main-card copy excludes duplicate timed warmup and cooldown");
assertEqual(coachPlanHeadline('總 5.5 km（含 ST）：0.8 km 熱身＋E 主課約 3.6 km＋ST 快步 4×20 秒。'), '輕鬆跑', "coach heading keeps the easy-run title when the prescription uses E main-work notation");
const repairedLegacyCoachStructure = normalizeCoachWorkoutSteps([
  { kind: 'warmup', title: '熱身', end: { type: 'distance', value: 800, label: '0.8 km' } },
  { kind: 'main', title: '主課', end: { type: 'distance', value: 4500, label: '4.5 km' } },
  { kind: 'cooldown', title: '收操', end: { type: 'distance', value: 700, label: '0.7 km' } },
], { type: 'easy', km: 5.5 });
assertEqual(repairedLegacyCoachStructure[0]?.end?.type, 'time', "legacy coach warmup becomes a time step instead of a distance requirement");
assertEqual(repairedLegacyCoachStructure[1]?.end?.value, 5500, "legacy easy-run main distance remains the planned 5.5 km");
assertEqual(repairedLegacyCoachStructure[2]?.end?.type, 'time', "legacy coach cooldown becomes a time step instead of a distance requirement");
assertEqual(coachPrescribedKm({ km: 14 }, { totalKm: 13 }), 13, "confirmed coach totalKm overrides the generator's stale day distance");
assertEqual(coachPrescribedKm({ km: 14 }, {}), 14, "coach distance falls back to the generated day only when no confirmed total exists");
assertEqual(coachPrescribedMainKm({ km: 7 }, { totalKm: 6.5, steps: [{ kind: 'main', end: { type: 'distance', value: 4600 } }, { kind: 'repeat', title: 'ST 快步組', detail: '每趟快步' }] }), 4.6, "stride sessions keep their explicit main-run distance instead of adding strides on top of total mileage");
assertEqual(coachPrescribedMainKm({ km: 8 }, { totalKm: 8, steps: [{ kind: 'repeat', title: 'T 體感組', children: [{ kind: 'interval', end: { type: 'time', value: 120 } }] }, { kind: 'main', end: { type: 'distance', value: 4000 } }] }), 4, "timed quality repeats keep their explicit Z2 completion distance instead of adding the total session distance");
assertEqual(coachPrescribedMainKm({ km: 14 }, { totalKm: 13, steps: [{ kind: 'main', end: { type: 'distance', value: 11500 } }] }), 13, "long-run total remains the main-run target when warmup and cooldown are time-based");

checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  process.exitCode = 1;
}
