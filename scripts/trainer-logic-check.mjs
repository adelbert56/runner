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

const [trainerJs, trainerCopyJs] = await Promise.all([
  readFile(resolve(root, "site/trainer.js"), "utf8"),
  readFile(resolve(root, "site/trainer-copy.js"), "utf8"),
]);

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunction(trainerCopyJs, "secToPace"),
    extractFunction(trainerJs, "timeToSec"),
    extractFunction(trainerJs, "targetTimeToSec"),
    extractFunction(trainerJs, "isValidClockInput"),
  ].join("\n\n"),
  sandbox
);
const { secToPace, timeToSec, targetTimeToSec, isValidClockInput } = sandbox;

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

checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  process.exitCode = 1;
}
