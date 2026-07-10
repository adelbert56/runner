// Encrypt the local coach weekly review (runner/訓練/週報.json) into
// site/data/training-review.enc.json for publishing on GitHub Pages.
//
// Only the ciphertext is committed; the plaintext source and the passphrase
// stay local. The trainer page decrypts in-browser with the same passphrase
// (PBKDF2-SHA256 + AES-256-GCM, compatible with WebCrypto).
//
// Passphrase resolution order: TRAINING_REVIEW_KEY env var, local ignored key
// file, then .env file.
// Usage: node scripts/build-training-review.mjs

import { webcrypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { subtle } = webcrypto;
const getRandomValues = (arr) => webcrypto.getRandomValues(arr);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "runner", "訓練", "週報.json");
const ACTIVITY_SOURCE = path.join(root, "runner", "訓練", "訓練紀錄.json");
const TARGET = path.join(root, "site", "data", "training-review.enc.json");
const LOCAL_KEY = path.join(root, "runner", "訓練", ".review-key");
const PBKDF2_ITERATIONS = 310000;

async function resolvePassphrase() {
  if (process.env.TRAINING_REVIEW_KEY) return process.env.TRAINING_REVIEW_KEY;
  try {
    const localKey = (await readFile(LOCAL_KEY, "utf8")).trim();
    if (localKey) return localKey;
  } catch {
    // local key has not been configured yet
  }
  try {
    const env = await readFile(path.join(root, ".env"), "utf8");
    const match = env.match(/^TRAINING_REVIEW_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    // no .env — fall through
  }
  return null;
}

async function encrypt(plaintext, passphrase) {
  const salt = getRandomValues(new Uint8Array(16));
  const iv = getRandomValues(new Uint8Array(12));
  const keyMaterial = await subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  const key = await subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)
  );
  const b64 = (buf) => Buffer.from(buf).toString("base64");
  return {
    v: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS },
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(ciphertext),
  };
}

async function buildPublishedReview(plaintext) {
  const review = JSON.parse(plaintext);
  try {
    const activityFeed = JSON.parse(await readFile(ACTIVITY_SOURCE, "utf8"));
    const activities = Array.isArray(activityFeed.activities) ? activityFeed.activities : [];
    review.analyticsRuns = activities.map((activity) => ({
      date: activity.date,
      startTime: activity.startTime,
      km: activity.distance_km,
      durationMin: activity.duration_min,
      pace: activity.pace_per_km,
      hr: activity.avg_hr,
      maxHr: activity.max_hr,
      cadence: activity.avg_cadence,
      elevationGainM: activity.elevation_gain_m,
      calories: activity.calories,
      aerobicTe: activity.aerobic_te,
      anaerobicTe: activity.anaerobic_te,
      vo2max: activity.vo2max,
      power: activity.avg_power,
      trainingLoad: activity.training_load
    })).filter((activity) => activity.date && activity.km > 0);
  } catch {
    // The encrypted weekly review remains publishable before Garmin data exists.
    review.analyticsRuns = [];
  }
  return JSON.stringify(review);
}

async function main() {
  const passphrase = await resolvePassphrase();
  if (!passphrase) {
    console.error("TRAINING_REVIEW_KEY not set (env var or .env). Aborting.");
    process.exit(1);
  }

  let plaintext;
  try {
    plaintext = await readFile(SOURCE, "utf8");
    JSON.parse(plaintext); // validate before publishing garbage
  } catch (err) {
    console.error(`Cannot read valid JSON from ${SOURCE}: ${err.message}`);
    process.exit(1);
  }

  const payload = await encrypt(await buildPublishedReview(plaintext), passphrase);
  payload.updatedAt = new Date().toISOString().slice(0, 10);
  await writeFile(TARGET, JSON.stringify(payload) + "\n", "utf8");
  console.log(`Encrypted review written to ${TARGET} (${payload.ct.length} b64 chars)`);
}

main();
