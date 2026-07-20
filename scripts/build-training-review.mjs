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
const SOURCE = process.env.TRAINING_REVIEW_SOURCE || path.join(root, "runner", "訓練", "週報.json");
const ACTIVITY_SOURCE = process.env.TRAINING_ACTIVITY_SOURCE || path.join(root, "runner", "訓練", "訓練紀錄.json");
// 機器可讀的教練真相源：存在時 zones/periodization 以此檔為準，避免與 週報.json 漂移。
const COACH_GOAL_SOURCE = process.env.TRAINING_COACH_GOAL_SOURCE || path.join(root, "runner", "訓練", "教練目標.json");
const TARGET = process.env.TRAINING_REVIEW_TARGET || path.join(root, "site", "data", "training-review.enc.json");
const LOCAL_KEY = path.join(root, "runner", "訓練", ".review-key");
const PBKDF2_ITERATIONS = 310000;

const COACH_STEP_KINDS = new Set(["warmup", "main", "interval", "recovery", "cooldown", "repeat"]);
const COACH_END_TYPES = new Set(["distance", "time", "reps", "open"]);

function normalizeCoachSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.filter((step) => step && COACH_STEP_KINDS.has(step.kind) && step.end && COACH_END_TYPES.has(step.end.type))
    .slice(0, 12).map((step) => ({
      kind: step.kind,
      title: String(step.title || "").slice(0, 60),
      end: { type: step.end.type, value: Math.max(0, Number(step.end.value) || 0), label: String(step.end.label || "").slice(0, 40) },
      target: String(step.target || "").slice(0, 120),
      detail: String(step.detail || "").slice(0, 240),
      repetitions: Math.max(0, Number(step.repetitions) || 0),
      children: normalizeCoachSteps(step.children),
    }));
}

function preserveCoachWorkoutSteps(review) {
  const menu = review?.nextWeek?.menu;
  if (!Array.isArray(menu)) return review;
  return { ...review, nextWeek: { ...review.nextWeek, menu: menu.map((entry) => ({ ...entry, steps: normalizeCoachSteps(entry?.steps) })) } };
}

function weekStart(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function buildAnalyticsRuns(activities) {
  return activities.map((activity) => {
    const main = activity.main_segment;
    const qualityEligible = Boolean(main?.source === 'garmin-workout-steps' && main?.pace_per_km && main?.distance_km > 0);
    const laps = Array.isArray(activity.lap_summary) ? activity.lap_summary : [];
    const intensities = new Set(laps.map((lap) => String(lap?.intensity || '').toUpperCase()));
    // A bare INTERVAL lap may simply be an automatic/manual kilometre lap.
    // Only structured Garmin workout steps can define a quality-session family.
    const sessionFamily = qualityEligible
      ? (intensities.has('INTERVAL') ? 'interval' : intensities.has('MAIN') ? 'steady' : intensities.has('ACTIVE') && intensities.has('RECOVERY') ? 'strides' : 'easy')
      : 'easy';
    return {
      activityId: activity.activityId,
      date: activity.date,
      startTime: activity.startTime,
      name: activity.name,
      // Full activity stays authoritative for volume and training load.
      km: activity.distance_km,
      durationMin: activity.duration_min,
      pace: activity.pace_per_km,
      hr: activity.avg_hr,
      maxHr: activity.max_hr,
      cadence: activity.avg_cadence,
      elevationGainM: activity.elevation_gain_m,
      temperatureC: activity.avg_temperature_c,
      calories: activity.calories,
      aerobicTe: activity.aerobic_te,
      anaerobicTe: activity.anaerobic_te,
      vo2max: activity.vo2max,
      power: activity.avg_power,
      trainingLoad: activity.training_load,
      // Course-quality metrics are populated only from explicit Garmin steps;
      // never infer them from automatic kilometre laps.
      qualityEligible,
      qualitySource: qualityEligible ? main.source : 'full-activity-only',
      qualityKm: qualityEligible ? main.distance_km : null,
      qualityPace: qualityEligible ? main.pace_per_km : null,
      qualityHr: qualityEligible ? main.avg_hr : null,
      qualityMaxHr: qualityEligible ? main.max_hr : null,
      qualityCadence: qualityEligible ? main.avg_cadence : null,
      // A compact Garmin lap summary powers the per-session report. It never
      // contains GPS coordinates or per-second activity streams.
      laps,
      sessionFamily,
      selfEvaluation: activity.self_evaluation || null,
    };
  }).filter((activity) => activity.date && activity.km > 0);
}

// Publish slimming: the per-session lap detail only powers the recent-run
// report (front-end history picker shows the last 8 activities). Keep laps for
// the most recent runs and drop them from older ones so the published, encrypted
// review stays lean. Volume/trend/completion use km & hr, not laps.
function slimAnalyticsLaps(runs, keepRecent = 20) {
  const keep = new Set(
    [...runs].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, keepRecent).map((run) => run.activityId)
  );
  return runs.map((run) => (keep.has(run.activityId) ? run : { ...run, laps: [] }));
}

function buildWeeklyTrend(runs) {
  const weeks = new Map();
  runs.forEach((run) => {
    const week = weekStart(run.date);
    const entry = weeks.get(week) || { week, km: 0, runs: 0, longKm: 0, hrTotal: 0, hrCount: 0 };
    entry.km += Number(run.km) || 0;
    entry.runs += 1;
    entry.longKm = Math.max(entry.longKm, Number(run.km) || 0);
    if (Number(run.hr) > 0) {
      entry.hrTotal += Number(run.hr);
      entry.hrCount += 1;
    }
    weeks.set(week, entry);
  });
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-8).map((entry) => ({
    week: entry.week,
    km: Math.round(entry.km * 10) / 10,
    runs: entry.runs,
    longKm: Math.round(entry.longKm * 10) / 10,
    avgHr: entry.hrCount ? Math.round(entry.hrTotal / entry.hrCount) : null,
  }));
}

function isoDateOffset(dateText, offsetDays) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000));
}

function sumKm(runs) {
  return Math.round(runs.reduce((sum, run) => sum + (Number(run.km) || 0), 0) * 10) / 10;
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0);
  return usable.length ? Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 10) / 10 : null;
}

function median(values) {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : Math.round((usable[middle - 1] + usable[middle]) / 2);
}

function paceSeconds(pace) {
  const match = String(pace || '').match(/^(\d+):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function longestKm(runs) {
  return Math.round(Math.max(0, ...runs.map((run) => Number(run.km) || 0)) * 10) / 10;
}

function buildGarminAutopilot(analyticsRuns, updatedAt) {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(updatedAt || '')
    ? updatedAt
    : new Date().toISOString().slice(0, 10);
  const recentStart = isoDateOffset(asOf, -13);
  const previousStart = isoDateOffset(asOf, -27);
  const previousEnd = isoDateOffset(asOf, -14);
  const recent = analyticsRuns.filter((run) => run.date >= recentStart && run.date <= asOf);
  const previous = analyticsRuns.filter((run) => run.date >= previousStart && run.date <= previousEnd);
  const latestDate = analyticsRuns.map((run) => run.date).filter(Boolean).sort().at(-1) || null;
  const recentKm = sumKm(recent);
  const previousKm = sumKm(previous);
  const latestRunDaysAgo = latestDate ? daysBetween(latestDate, asOf) : null;
  const rampPct = previousKm > 0 ? Math.round(((recentKm - previousKm) / previousKm) * 100) : null;
  const structuredRuns = analyticsRuns.filter((run) => run.qualityEligible);
  const comparisonFamily = structuredRuns.at(-1)?.sessionFamily || null;
  const matchedQuality = structuredRuns
    .filter((run) => run.sessionFamily === comparisonFamily)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Compare the latest matched pair instead of waiting for two 14-day windows.
  // This makes the signal available after two same-family main sessions, while
  // still excluding warmup/cooldown data and unrelated workout types.
  const recentQuality = matchedQuality.slice(-1);
  const previousQuality = matchedQuality.slice(-2, -1);
  const hasComparableQuality = recentQuality.length >= 1 && previousQuality.length >= 1;
  const recentPace = hasComparableQuality ? median(recentQuality.map((run) => paceSeconds(run.qualityPace))) : null;
  const previousPace = hasComparableQuality ? median(previousQuality.map((run) => paceSeconds(run.qualityPace))) : null;
  const recentHr = hasComparableQuality ? average(recentQuality.map((run) => Number(run.qualityHr))) : null;
  const previousHr = hasComparableQuality ? average(previousQuality.map((run) => Number(run.qualityHr))) : null;
  const recentLoad = average(recent.map((run) => Number(run.trainingLoad)));
  const previousLoad = average(previous.map((run) => Number(run.trainingLoad)));
  // 跑量看的是距離，訓練負荷是 Garmin 算的強度×時長綜合值：
  // 距離沒明顯增加、但強度拉高（例如加了間歇/爬升）時，只看 rampPct 會漏掉這種過度堆疊。
  const loadRampPct = previousLoad > 0 ? Math.round(((recentLoad - previousLoad) / previousLoad) * 100) : null;
  const paceDeltaSeconds = recentPace && previousPace ? recentPace - previousPace : null;
  const hrDelta = recentHr && previousHr ? Math.round(recentHr - previousHr) : null;
  // A two-session comparison is intentionally more conservative than a
  // multi-session median: do not reduce a course unless both changes are clear.
  const fatigueSignal = paceDeltaSeconds !== null && hrDelta !== null && paceDeltaSeconds >= 12 && hrDelta >= 7;

  let decision = 'maintain';
  let volumeFactor = 1;
  let qualityMode = 'keep';
  let label = '維持節奏';
  let headline = '近期訓練吸收平穩，照目前課表完成即可。';
  const reasons = [];

  if (!latestDate || latestRunDaysAgo >= 8) {
    decision = 'rebuild';
    volumeFactor = 0.75;
    qualityMode = 'skip';
    label = '重建週';
    headline = '近期跑步中斷較久，先回到低壓力的重建菜單。';
    reasons.push(latestDate ? `距離最近一次 Garmin 跑步已 ${latestRunDaysAgo} 天。` : '尚無可用 Garmin 跑步紀錄。');
  } else if (recent.length < 3) {
    decision = 'rebuild';
    volumeFactor = 0.85;
    qualityMode = 'skip';
    label = '保守重建';
    headline = '近 14 天有效跑步不足 3 次，先把頻率建立回來。';
    reasons.push(`近 14 天僅 ${recent.length} 次 Garmin 跑步。`);
  } else if ((rampPct !== null && rampPct > 15) || (loadRampPct !== null && loadRampPct > 25)) {
    decision = 'deload';
    volumeFactor = 0.85;
    qualityMode = 'reduce';
    label = '自動降量';
    headline = rampPct !== null && rampPct > 15
      ? '近期跑量拉升偏快，下週先收量，避免連續堆疲勞。'
      : '近期距離沒有明顯增加，但 Garmin 訓練負荷拉升偏快（強度堆疊過快），下週先收量。';
    reasons.push(rampPct !== null && rampPct > 15
      ? `近 14 天跑量比前 14 天增加 ${rampPct}%。`
      : `近 14 天平均訓練負荷比前 14 天增加 ${loadRampPct}%。`);
  } else if (fatigueSignal) {
    decision = 'maintain';
    volumeFactor = 0.9;
    qualityMode = 'reduce';
    label = '恢復優先';
    headline = '近期配速變慢且平均心率上升，先下修品質課與總量。';
    reasons.push(`主課中位配速慢 ${paceDeltaSeconds} 秒 / km，主課平均心率高 ${hrDelta} bpm。`);
  } else if (rampPct !== null && rampPct < -30) {
    decision = 'maintain';
    volumeFactor = 0.9;
    qualityMode = 'reduce';
    label = '保守銜接';
    headline = '近期跑量明顯下降，下週先保守銜接，不直接跳回原本強度。';
    reasons.push(`近 14 天跑量比前 14 天減少 ${Math.abs(rampPct)}%。`);
  } else if (previousKm > 0 && recentKm >= previousKm * 0.9) {
    decision = 'progress';
    volumeFactor = 1.05;
    qualityMode = 'keep';
    label = '小幅推進';
    headline = '近兩週完成度穩定，可小幅推進，但只增加一個變因。';
    reasons.push(`近 14 天 ${recentKm} km，前 14 天 ${previousKm} km。`);
  } else {
    reasons.push(`近 14 天 ${recentKm} km，共 ${recent.length} 次跑步。`);
  }

  return {
    version: 1,
    asOf,
    status: latestDate ? 'ready' : 'insufficient',
    label,
    decision,
    volumeFactor,
    qualityMode,
    headline,
    reasons,
    metrics: {
      recentKm,
      previousKm,
      recentRuns: recent.length,
      latestRunDate: latestDate,
      latestRunDaysAgo,
      rampPct,
      recentPace,
      previousPace,
      paceDeltaSeconds,
      recentHr,
      previousHr,
      hrDelta,
      recentLoad,
      previousLoad,
      recentQualityRuns: recentQuality.length,
      previousQualityRuns: previousQuality.length,
      qualityComparisonSampleSize: recentQuality.length + previousQuality.length,
      comparisonFamily,
      qualityComparisonReady: hasComparableQuality,
      recentLongKm: longestKm(recent),
      previousLongKm: longestKm(previous),
    },
    guardrail: 'Garmin 不包含疼痛、生病與睡眠判讀；身體不適時請優先休息或下修。',
  };
}

function buildGarminOnlyReview(analyticsRuns, updatedAt) {
  const trend = buildWeeklyTrend(analyticsRuns);
  const latest = trend.at(-1) || { week: updatedAt || "尚無資料", km: 0, runs: 0, longKm: 0, avgHr: null };
  return {
    updatedAt: updatedAt || new Date().toISOString().slice(0, 10),
    sourceMode: "garmin-only",
    periodization: [],
    history: [],
    week: {
      label: `${latest.week} Garmin 同步週`,
      range: latest.week,
      runs: latest.runs,
      km: latest.km,
      longKm: latest.longKm,
      avgHr: latest.avgHr ?? "—",
      verdict: "資料同步完成",
      notes: "尚未建立人工教練週報；正式課表維持跑者設定，系統只依實跑資料校正未來週。",
    },
    nextWeek: {
      label: "Garmin 輔助菜單",
      targetKm: "依近期實跑判讀",
      menu: [],
      coachNote: "課表頁會依 Garmin 近期跑量與頻率生成下一段輔助菜單；正式課表維持原樣。",
    },
    trend,
  };
}

// 菜單裡的配速是人工寫的，不會自動回校；跑者變快後很容易留著過時的數字。
// 這裡拿最近同心率（Z2）實跑的中位配速去對，差太多就在 coachNote 標出來，
// 讓下一份週報知道要更新——顯示端本來就以心率為主控，不會被舊配速帶偏。
function menuPaceDriftNote(review, analyticsRuns) {
  const easyMax = Number(review?.zones?.easyMax) || 0;
  const menu = Array.isArray(review?.nextWeek?.menu) ? review.nextWeek.menu : [];
  if (!easyMax || !menu.length) return '';
  const prescribed = menu
    .map((entry) => /(\d{1,2}:\d{2})\s*[–—~-]\s*(\d{1,2}:\d{2})/.exec(String(entry?.plan || '')))
    .filter(Boolean)
    .map((match) => paceSeconds(match[1]))
    .filter((seconds) => Number.isFinite(seconds));
  if (!prescribed.length) return '';
  // 取最近 6 筆 Z2 實跑而非固定天數窗口：跑量週期起伏時，天數窗口會把幾週前
  // 的慢跑一起算進中位，反而看不出跑者現在的水準。
  const easyRuns = analyticsRuns
    .filter((run) => {
      const hr = Number(run.hr);
      return hr > 0 && hr <= easyMax && paceSeconds(run.pace) > 0;
    })
    .slice(-6);
  if (easyRuns.length < 3) return '';
  const actual = median(easyRuns.map((run) => paceSeconds(run.pace)));
  // 取最慢的那筆處方：菜單可能一部分已更新、一部分還留著舊數字，
  // 只要有任何一筆明顯慢於實跑就值得提醒。
  const slowestPrescribed = Math.max(...prescribed);
  const drift = slowestPrescribed - actual;
  if (!Number.isFinite(drift) || drift < 30) return '';
  const asPace = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  return `⚠️ 處方參考配速最慢到 ${asPace(slowestPrescribed)}，比最近 ${easyRuns.length} 筆同心率實跑中位（${asPace(actual)}）慢 ${Math.round(drift)} 秒／km，數字可能已過時；課表以心率為主控。`;
}

function shortRange(start, end) {
  return `${start.slice(5)} ~ ${end.slice(5)}`;
}

function refreshReviewFromGarmin(review, analyticsRuns, updatedAt, autopilot, missingStepsNote = '') {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(updatedAt || '')
    ? updatedAt
    : new Date().toISOString().slice(0, 10);
  const currentStart = weekStart(asOf);
  const currentEnd = isoDateOffset(currentStart, 6);
  const nextStart = isoDateOffset(currentStart, 7);
  const currentRuns = analyticsRuns.filter((run) => run.date >= currentStart && run.date <= currentEnd);
  const currentKm = sumKm(currentRuns);
  const currentHr = average(currentRuns.map((run) => Number(run.hr)));
  const previousMenuStart = review?.nextWeek?.weekStart || '';
  // 人工菜單在「還沒跑完」之前都要保留：菜單週開始日 >= 本週一即有效（本週要
  // 照做的那份，以及提早寫好的下週那份）。只有真的過期（上一週以前）才清空，
  // 讓前端讀跑者本機的正式課表，而不是把已完成的舊週課表當成教練建議。
  const hasCurrentManualMenu = Boolean(previousMenuStart) && previousMenuStart >= currentStart;
  return {
    ...review,
    updatedAt: asOf,
    week: {
      ...(review?.week || {}),
      label: `本週回顧（${shortRange(currentStart, currentEnd)}）`,
      range: shortRange(currentStart, currentEnd),
      runs: currentRuns.length,
      km: currentKm,
      longKm: longestKm(currentRuns),
      avgHr: currentHr ?? '—',
      verdict: autopilot.label,
      notes: `Garmin 已同步至 ${asOf}：本週 ${currentRuns.length} 次、${currentKm} km；${autopilot.headline}`,
    },
    nextWeek: {
      ...(review?.nextWeek || {}),
      label: hasCurrentManualMenu ? review.nextWeek.label : `下週（${shortRange(nextStart, isoDateOffset(nextStart, 6))}）`,
      weekStart: hasCurrentManualMenu ? previousMenuStart : nextStart,
      targetKm: hasCurrentManualMenu ? review.nextWeek.targetKm : '依正式課表安排',
      menu: hasCurrentManualMenu ? review.nextWeek.menu : [],
      coachNote: hasCurrentManualMenu
        ? [review.nextWeek.coachNote, menuPaceDriftNote(review, analyticsRuns), missingStepsNote].filter(Boolean).join(' ')
        : autopilot.headline,
      weatherPlan: hasCurrentManualMenu ? review.nextWeek.weatherPlan : '',
    },
  };
}

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

async function decrypt(payload, passphrase) {
  if (!payload?.salt || !payload?.iv || !payload?.ct || !payload?.kdf) {
    throw new Error("Encrypted training review payload is incomplete");
  }
  const keyMaterial = await subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  const key = await subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: Buffer.from(payload.salt, "base64"),
      iterations: Number(payload.kdf.iterations),
      hash: payload.kdf.hash,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(payload.iv, "base64") },
    key,
    Buffer.from(payload.ct, "base64")
  );
  return new TextDecoder().decode(plaintext);
}

// 跑步課一定要帶 steps：Garmin 同步是逐步讀 steps 的，只有敘述文字時前端得靠
// 正則猜結構，猜不出來的那天會被 skippedDays 丟掉。這裡在發布前先喊出來——
// 回傳文字讓呼叫端決定要不要寫進 coachNote／CI summary，而不是只印在 console
// （排程跑的時候沒人在看 Action log，之前這條警告等於白喊）。
function warnMenuWithoutSteps(review) {
  const menu = Array.isArray(review?.nextWeek?.menu) ? review.nextWeek.menu : [];
  const missing = menu.filter((entry) => /(?:E\s*跑|長跑|慢跑|節奏跑|間歇)/i.test(String(entry?.plan || ''))
    && !(Array.isArray(entry?.steps) && entry.steps.length));
  if (!missing.length) return '';
  const note = `⚠️ 教練菜單有 ${missing.length} 天是跑步課但沒有 steps（${missing.map((entry) => entry.day || '?').join('、')}）；Garmin 同步只能靠文字推測結構，這幾天可能被排除。`;
  console.warn(note);
  return note;
}

async function buildPublishedReview(plaintext) {
  let review = plaintext ? preserveCoachWorkoutSteps(JSON.parse(plaintext)) : null;
  const missingStepsNote = warnMenuWithoutSteps(review);
  await appendJobSummary(missingStepsNote);
  try {
    const activityFeed = JSON.parse(await readFile(ACTIVITY_SOURCE, "utf8"));
    const activities = Array.isArray(activityFeed.activities) ? activityFeed.activities : [];
    const analyticsRuns = buildAnalyticsRuns(activities);
    review = review || buildGarminOnlyReview(analyticsRuns, activityFeed.updatedAt);
    const autopilot = buildGarminAutopilot(analyticsRuns, activityFeed.updatedAt);
    review = refreshReviewFromGarmin(review, analyticsRuns, activityFeed.updatedAt, autopilot, missingStepsNote);
    review.analyticsUpdatedAt = activityFeed.updatedAt || null;
    review.analyticsStatus = "synced";
    review.analyticsRuns = slimAnalyticsLaps(analyticsRuns);
    // 手錶估的乳酸閾值心率：前端訓練區間優先用它，比 %maxHr 推算準
    review.lactateThresholdHr = Number(activityFeed.lactateThreshold?.heartRate) || null;
    review.autopilot = autopilot;
  } catch {
    review = review || buildGarminOnlyReview([], null);
    review.analyticsRuns = [];
    review.analyticsUpdatedAt = null;
    review.analyticsStatus = "missing";
    review.lactateThresholdHr = null;
    review.autopilot = buildGarminAutopilot([], null);
    // Garmin 實跑讀不到時 refreshReviewFromGarmin 不會跑，missingStepsNote 就沒機會
    // 併進 coachNote——這裡補上，避免這條警告只在沒有 Garmin 資料的那次靜靜消失。
    if (missingStepsNote && review.nextWeek) {
      review.nextWeek.coachNote = [review.nextWeek.coachNote, missingStepsNote].filter(Boolean).join(' ');
    }
  }
  // 教練目標.json 為單一真相：存在且結構有效時，覆蓋 zones/periodization。
  // 找不到或格式不符則沿用 週報.json 既有值（向後相容，不會清空）。
  try {
    const coachGoal = JSON.parse(await readFile(COACH_GOAL_SOURCE, "utf8"));
    if (review && coachGoal && typeof coachGoal === "object") {
      if (coachGoal.zones && typeof coachGoal.zones === "object") review.zones = coachGoal.zones;
      if (Array.isArray(coachGoal.periodization) && coachGoal.periodization.length) review.periodization = coachGoal.periodization;
    }
  } catch { /* 沒有 教練目標.json 就沿用週報值 */ }
  return JSON.stringify(review);
}

async function appendJobSummary(text) {
  if (!text || !process.env.GITHUB_STEP_SUMMARY) return;
  try {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n`, { flag: "a" });
  } catch {
    // best-effort only; never block the run over a summary write failure
  }
}

async function main() {
  const passphrase = await resolvePassphrase();
  if (!passphrase) {
    const message = "⚠️ training-review sync aborted: TRAINING_REVIEW_KEY not set (env var or .env).";
    console.error(message);
    await appendJobSummary(message);
    process.exit(1);
  }

  let plaintext = null;
  try {
    plaintext = await readFile(SOURCE, "utf8");
    JSON.parse(plaintext); // validate before publishing garbage
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.error(`Cannot read valid JSON from ${SOURCE}: ${err.message}`);
      process.exit(1);
    }
    try {
      const existingPayload = JSON.parse(await readFile(TARGET, "utf8"));
      plaintext = await decrypt(existingPayload, passphrase);
      JSON.parse(plaintext); // validate before retaining the existing coach plan
      console.warn(`No local coach review found at ${SOURCE}; preserving the existing encrypted coach plan and refreshing Garmin analytics.`);
    } catch (existingErr) {
      if (process.env.TRAINING_REVIEW_ALLOW_GARMIN_ONLY !== "1") {
        const message = `⚠️ training-review sync skipped: no local coach review at ${SOURCE} and the existing encrypted fallback at ${TARGET} could not be read (${existingErr.message}). Training review has not been updated this run.`;
        console.warn(message);
        await appendJobSummary(message);
        return;
      }
      console.warn(`No local coach review found at ${SOURCE}; publishing Garmin-only training data by explicit opt-in.`);
    }
  }

  const payload = await encrypt(await buildPublishedReview(plaintext), passphrase);
  payload.updatedAt = new Date().toISOString().slice(0, 10);
  await writeFile(TARGET, JSON.stringify(payload) + "\n", "utf8");
  console.log(`Encrypted review written to ${TARGET} (${payload.ct.length} b64 chars)`);
}

main();
