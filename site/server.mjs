import { createReadStream, existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { createRegistrationBatchWorkbook, prepareRegistrationBatchImport } from "../local/registration/registration-batch-xlsx.js";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const registrationDir = resolve(join(root, "runner", "報名管理"));
const registrationDataPath = resolve(join(registrationDir, "報名管理資料.json"));
const raceDataPath = resolve(join(root, "site", "data", "races.json"));
const registrationPayloadLimit = 1024 * 1024;
const registrationBatchPayloadLimit = 8 * 1024 * 1024;
const garminSyncPayloadLimit = 128 * 1024;
const garminSyncRequestPath = resolve(join(root, "runner", "訓練", "garmin-workout-sync-request.json"));
const garminSyncStatusPath = resolve(join(root, "runner", "訓練", "garmin-workout-sync-status.json"));
const garminPairingPath = resolve(join(root, "runner", "訓練", "garmin-workout-pairing.json"));
const garminPublishScript = resolve(join(root, "scripts", "garmin", "publish_training_plan.py"));
const garminActivitySyncStatusPath = resolve(join(root, "runner", "訓練", "garmin-sync-status.json"));
const garminActivitySyncScript = resolve(join(root, "scripts", "garmin", "sync-garmin.ps1"));
const preferredPowerShellPath = process.env.RUNNER_PWSH_PATH || "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
const powerShellExecutable = process.platform === "win32" && existsSync(preferredPowerShellPath)
  ? preferredPowerShellPath
  : "pwsh";
const allowedLocalHosts = new Set([
  `localhost:${port}`,
  `127.0.0.1:${port}`,
  `[::1]:${port}`,
]);
const publicGarminSyncOrigin = "https://adelbert56.github.io";
const garminPairingHeader = "x-runner-garmin-pairing";
let garminSyncRunning = false;
let garminActivitySyncRunning = false;
const emptyRegistrationData = {
  version: 1,
  updatedAt: null,
  people: [],
  entries: [],
};
const registrationBatchPreviews = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function resolveRequestPath(url) {
  const decoded = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const requested = normalize(decoded === "/site/" ? "/site/index.html" : decoded);
  const filePath = resolve(join(root, requested));
  if (!filePath.startsWith(root)) {
    return null;
  }
  return filePath;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendBinary(res, status, content, contentType, filename) {
  res.writeHead(status, {
    "content-type": contentType,
    "content-disposition": `attachment; filename="${filename}"`,
    "content-length": content.length,
  });
  res.end(content);
}

function sendGarminCors(res, origin) {
  if (!origin) return;
  if (isAllowedGarminSyncOrigin(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", `content-type, ${garminPairingHeader}`);
    res.setHeader("access-control-allow-private-network", "true");
  }
}

async function readRequestBuffer(req, limit = registrationPayloadLimit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new Error("Payload too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readRequestBody(req, limit = registrationPayloadLimit) {
  return (await readRequestBuffer(req, limit)).toString("utf8");
}

function isLocalRegistrationRequest(req) {
  const host = String(req.headers.host || "");
  const origin = String(req.headers.origin || "");
  if (!allowedLocalHosts.has(host)) {
    return false;
  }
  if (!origin) {
    return true;
  }
  try {
    return allowedLocalHosts.has(new URL(origin).host);
  } catch {
    return false;
  }
}

function isAllowedGarminSyncRequest(req) {
  return isAllowedGarminSyncOrigin(String(req.headers.origin || ""));
}

function isAllowedGarminSyncOrigin(origin) {
  if (!origin) return false;
  try {
    return origin === publicGarminSyncOrigin || allowedLocalHosts.has(new URL(origin).host);
  } catch {
    return false;
  }
}

function isPublicGarminSyncRequest(req) {
  return String(req.headers.origin || "") === publicGarminSyncOrigin;
}

function isLocalGarminActivitySyncRequest(req) {
  const host = String(req.headers.host || "");
  const origin = String(req.headers.origin || "");
  const remoteAddress = String(req.socket.remoteAddress || "");
  if (!allowedLocalHosts.has(host) || !["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(remoteAddress)) return false;
  if (!origin) return true;
  try {
    return allowedLocalHosts.has(new URL(origin).host);
  } catch {
    return false;
  }
}

function validGarminSyncPayload(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.workouts) || !payload.workouts.length || payload.workouts.length > 7) {
    return false;
  }
  if (payload.replaceExisting !== undefined && typeof payload.replaceExisting !== "boolean") return false;
  const validStep = (step) => step && ["warmup", "main", "interval", "recovery", "cooldown", "repeat"].includes(step.kind)
    && step.end && ["distance", "time", "reps", "open"].includes(step.end.type)
    && Number.isFinite(Number(step.end.value)) && Number(step.end.value) >= 0
    && (!step.children || (Array.isArray(step.children) && step.children.every(validStep)));
  return payload.workouts.every((workout) => (
    workout
    && /^\d{4}-\d{2}-\d{2}$/.test(String(workout.date || ""))
    && typeof workout.name === "string"
    && workout.name.length > 0
    && workout.name.length <= 120
    && Number.isFinite(Number(workout.km))
    && Number(workout.km) > 0
    && Number(workout.km) <= 100
    && (!workout.steps || (Array.isArray(workout.steps) && workout.steps.length <= 12 && workout.steps.every(validStep)))
  ));
}

async function readGarminSyncStatus() {
  try {
    return JSON.parse(await readFile(garminSyncStatusPath, "utf8"));
  } catch {
    return { status: "idle", message: "尚未執行 Garmin 同步" };
  }
}

async function readOrCreateGarminPairing() {
  try {
    const pairing = JSON.parse(await readFile(garminPairingPath, "utf8"));
    if (typeof pairing.code === "string" && pairing.code.length >= 32) return pairing;
  } catch {
    // First pairing creates a local-only secret below.
  }
  await mkdir(resolve(join(root, "runner", "訓練")), { recursive: true });
  const pairing = {
    version: 1,
    code: randomBytes(24).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
  await writeFile(garminPairingPath, `${JSON.stringify(pairing, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return pairing;
}

function hasValidGarminPairing(req, pairing) {
  const supplied = String(req.headers[garminPairingHeader] || "");
  const expected = String(pairing.code || "");
  if (!supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

async function queueGarminSync(payload) {
  await mkdir(resolve(join(root, "runner", "訓練")), { recursive: true });
  await writeFile(garminSyncRequestPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(garminSyncStatusPath, `${JSON.stringify({
    status: "queued",
    message: payload.replaceExisting ? "Garmin 同步器已啟動；同名課程將安全替換" : "Garmin 同步器已啟動",
    updatedAt: new Date().toISOString(),
    total: payload.workouts.length,
  }, null, 2)}\n`, "utf8");
  garminSyncRunning = true;
  const args = ["run", "python", garminPublishScript, "--input", garminSyncRequestPath];
  if (payload.replaceExisting) args.push("--replace-existing");
  const child = spawn("uv", args, {
    cwd: root,
    detached: false,
    stdio: "ignore",
    windowsHide: false,
  });
  child.once("error", async (error) => {
    garminSyncRunning = false;
    await writeFile(garminSyncStatusPath, `${JSON.stringify({ status: "error", message: error.message, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  });
  child.once("close", () => {
    garminSyncRunning = false;
  });
}

async function readGarminActivitySyncStatus() {
  try {
    return JSON.parse(await readFile(garminActivitySyncStatusPath, "utf8"));
  } catch {
    return { status: "idle", message: "尚未同步 Garmin 活動紀錄" };
  }
}

async function queueGarminActivitySync() {
  await mkdir(resolve(join(root, "runner", "訓練")), { recursive: true });
  await writeFile(garminActivitySyncStatusPath, `${JSON.stringify({
    status: "running",
    message: "正在同步 Garmin 活動紀錄並更新教練建議…",
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  garminActivitySyncRunning = true;
  const child = spawn(powerShellExecutable, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", garminActivitySyncScript], {
    cwd: root,
    detached: false,
    stdio: "ignore",
    windowsHide: true,
  });
  child.once("error", async (error) => {
    garminActivitySyncRunning = false;
    await writeFile(garminActivitySyncStatusPath, `${JSON.stringify({ status: "error", message: error.message, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  });
  child.once("close", () => {
    garminActivitySyncRunning = false;
  });
}

async function readRegistrationData() {
  try {
    const raw = await readFile(registrationDataPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      updatedAt: parsed.updatedAt || null,
      people: Array.isArray(parsed.people) ? parsed.people : [],
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return { ...emptyRegistrationData };
  }
}

async function readRaceDistanceOptions() {
  try {
    const races = JSON.parse(await readFile(raceDataPath, "utf8"));
    return (Array.isArray(races) ? races : []).flatMap((race) => Array.isArray(race?.distances) ? race.distances : []);
  } catch {
    return [];
  }
}

async function writeRegistrationData(payload) {
  await mkdir(registrationDir, { recursive: true });
  try {
    const existing = await readFile(registrationDataPath, "utf8");
    await writeFile(`${registrationDataPath}.bak`, existing, "utf8");
  } catch {
    // 第一次寫入時還沒有舊檔可備份，略過即可
  }
  await writeFile(registrationDataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function pruneRegistrationBatchPreviews() {
  const now = Date.now();
  registrationBatchPreviews.forEach((preview, token) => {
    if (now - preview.createdAt > 15 * 60 * 1000) registrationBatchPreviews.delete(token);
  });
}

const server = createServer(async (req, res) => {
  const decoded = decodeURIComponent(new URL(req.url || "/", `http://localhost:${port}`).pathname);
  const origin = String(req.headers.origin || "");
  if (decoded.startsWith("/api/garmin-activity-sync")) {
    if (!isLocalGarminActivitySyncRequest(req)) {
      sendJson(res, 403, { error: "forbidden", message: "Garmin activity sync is only available from the local Runner server." });
      return;
    }
    if (decoded === "/api/garmin-activity-sync" && req.method === "GET") {
      sendJson(res, 200, { ...(await readGarminActivitySyncStatus()), running: garminActivitySyncRunning });
      return;
    }
    if (decoded === "/api/garmin-activity-sync" && req.method === "POST") {
      if (garminActivitySyncRunning) {
        sendJson(res, 409, { error: "sync-in-progress", message: "Garmin 活動同步正在執行，請稍候。" });
        return;
      }
      try {
        await queueGarminActivitySync();
        sendJson(res, 202, { ok: true, message: "Garmin 活動同步已啟動" });
      } catch (error) {
        sendJson(res, 500, { error: "sync-start-failed", message: error instanceof Error ? error.message : "Unable to start Garmin sync" });
      }
      return;
    }
    sendJson(res, 405, { error: "method-not-allowed" });
    return;
  }
  if (decoded === "/api/garmin-workout-pairing") {
    sendGarminCors(res, origin);
    if (!isLocalGarminActivitySyncRequest(req)) {
      sendJson(res, 403, { error: "local-only", message: "Garmin 配對碼只可在本機 Runner 查看。" });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method-not-allowed" });
      return;
    }
    const pairing = await readOrCreateGarminPairing();
    sendJson(res, 200, { code: pairing.code, createdAt: pairing.createdAt });
    return;
  }
  if (decoded.startsWith("/api/garmin-workout-sync")) {
    sendGarminCors(res, origin);
    if (req.method === "OPTIONS") {
      res.writeHead(isAllowedGarminSyncRequest(req) ? 204 : 403);
      res.end();
      return;
    }
    if (!isAllowedGarminSyncRequest(req)) {
      sendJson(res, 403, { error: "forbidden", message: "Garmin sync is only available from Runner." });
      return;
    }
    if (isPublicGarminSyncRequest(req)) {
      const pairing = await readOrCreateGarminPairing();
      if (!hasValidGarminPairing(req, pairing)) {
        sendJson(res, 401, { error: "pairing-required", message: "請先在本機 Runner 查看配對碼，並在公開訓練頁完成配對。" });
        return;
      }
    }
    if (decoded === "/api/garmin-workout-sync" && req.method === "GET") {
      sendJson(res, 200, { ...(await readGarminSyncStatus()), running: garminSyncRunning });
      return;
    }
    if (decoded === "/api/garmin-workout-sync" && req.method === "POST") {
      if (garminSyncRunning) {
        sendJson(res, 409, { error: "sync-in-progress", message: "已有 Garmin 同步正在執行，請等待完成。" });
        return;
      }
      try {
        const raw = await readRequestBody(req, garminSyncPayloadLimit);
        const payload = JSON.parse(raw || "{}");
        if (!validGarminSyncPayload(payload)) {
          sendJson(res, 400, { error: "invalid-payload", message: "課表資料不完整，未啟動 Garmin 同步。" });
          return;
        }
        await queueGarminSync(payload);
        sendJson(res, 202, { ok: true, message: "Garmin 同步器已啟動", total: payload.workouts.length });
      } catch (error) {
        sendJson(res, 400, { error: "invalid-request", message: error instanceof Error ? error.message : "Invalid request" });
      }
      return;
    }
    sendJson(res, 405, { error: "method-not-allowed" });
    return;
  }
  if (decoded === "/") {
    res.writeHead(302, { location: "/site/" });
    res.end();
    return;
  }

  if (decoded === "/api/registration-data" && !isLocalRegistrationRequest(req)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Registration data is only available from this local server.");
    return;
  }

  if (decoded.startsWith("/api/registration-batch") && !isLocalRegistrationRequest(req)) {
    sendJson(res, 403, { error: "forbidden", message: "批次匯入匯出僅能在本機報名管理使用。" });
    return;
  }

  if (decoded === "/api/registration-batch.xlsx" && req.method === "GET") {
    try {
      const [registrationData, distanceOptions] = await Promise.all([readRegistrationData(), readRaceDistanceOptions()]);
      const workbook = await createRegistrationBatchWorkbook(registrationData, { distanceOptions });
      sendBinary(res, 200, Buffer.from(workbook), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "registration-batch.xlsx");
    } catch (error) {
      sendJson(res, 500, { error: "batch-export-failed", message: error instanceof Error ? error.message : "Excel 匯出失敗。" });
    }
    return;
  }

  if (decoded === "/api/registration-batch/preview" && req.method === "POST") {
    try {
      const [current, distanceOptions] = await Promise.all([readRegistrationData(), readRaceDistanceOptions()]);
      const prepared = await prepareRegistrationBatchImport(await readRequestBuffer(req, registrationBatchPayloadLimit), current, { distanceOptions });
      if (prepared.errors.length) {
        sendJson(res, 422, { error: "batch-validation-failed", message: "Excel 有需要修正的資料，尚未套用。", errors: prepared.errors.slice(0, 80) });
        return;
      }
      pruneRegistrationBatchPreviews();
      const token = crypto.randomUUID();
      registrationBatchPreviews.set(token, { ...prepared, baseUpdatedAt: current.updatedAt, createdAt: Date.now() });
      sendJson(res, 200, { ok: true, previewToken: token, summary: prepared.summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Excel 讀取失敗。";
      sendJson(res, message === "Payload too large" ? 413 : 400, { error: "batch-preview-failed", message });
    }
    return;
  }

  if (decoded === "/api/registration-batch/apply" && req.method === "POST") {
    try {
      pruneRegistrationBatchPreviews();
      const request = JSON.parse(await readRequestBody(req) || "{}");
      const preview = registrationBatchPreviews.get(String(request.previewToken || ""));
      if (!preview) {
        sendJson(res, 410, { error: "batch-preview-expired", message: "匯入預覽已過期，請重新選擇 Excel 檔。" });
        return;
      }
      const current = await readRegistrationData();
      if (current.updatedAt !== preview.baseUpdatedAt) {
        sendJson(res, 409, { error: "stale-write", message: "資料已在預覽後更新，請重新匯出或重新預覽 Excel，避免覆蓋資料。" });
        return;
      }
      const payload = { ...preview.payload, updatedAt: new Date().toISOString() };
      await writeRegistrationData(payload);
      registrationBatchPreviews.delete(String(request.previewToken || ""));
      sendJson(res, 200, { ok: true, updatedAt: payload.updatedAt, summary: preview.summary });
    } catch (error) {
      sendJson(res, 400, { error: "batch-apply-failed", message: error instanceof Error ? error.message : "Excel 匯入失敗。" });
    }
    return;
  }

  if (decoded === "/api/registration-data" && req.method === "GET") {
    const data = await readRegistrationData();
    sendJson(res, 200, data);
    return;
  }

  if (decoded === "/api/registration-data" && req.method === "PUT") {
    try {
      const raw = await readRequestBody(req);
      const parsed = JSON.parse(raw || "{}");
      const current = await readRegistrationData();
      if (parsed.baseUpdatedAt !== undefined && current.updatedAt && parsed.baseUpdatedAt !== current.updatedAt) {
        sendJson(res, 409, {
          error: "stale-write",
          message: "資料已被其他分頁或裝置更新，請重新整理後再試一次，避免覆蓋掉別人的修改。",
          updatedAt: current.updatedAt,
        });
        return;
      }
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        people: Array.isArray(parsed.people) ? parsed.people : [],
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      };
      await writeRegistrationData(payload);
      sendJson(res, 200, { ok: true, updatedAt: payload.updatedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid payload";
      res.writeHead(message === "Payload too large" ? 413 : 400, { "content-type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : "Invalid payload");
    }
    return;
  }

  const filePath = resolveRequestPath(req.url || "/");
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const contentType = mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "content-type": contentType, "cache-control": "no-cache" });
  createReadStream(filePath).pipe(res);
});

server.listen(port, () => {
  console.log(`Runner Plaza is running at http://localhost:${port}/site/`);
});
