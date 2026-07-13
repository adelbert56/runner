import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const registrationDir = resolve(join(root, "runner", "報名管理"));
const registrationDataPath = resolve(join(registrationDir, "報名管理資料.json"));
const registrationPayloadLimit = 1024 * 1024;
const allowedLocalHosts = new Set([
  `localhost:${port}`,
  `127.0.0.1:${port}`,
  `[::1]:${port}`,
]);
const emptyRegistrationData = {
  version: 1,
  updatedAt: null,
  people: [],
  entries: [],
};

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

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > registrationPayloadLimit) {
      throw new Error("Payload too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
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

const server = createServer(async (req, res) => {
  const decoded = decodeURIComponent(new URL(req.url || "/", `http://localhost:${port}`).pathname);
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
  res.writeHead(200, { "content-type": contentType });
  createReadStream(filePath).pipe(res);
});

server.listen(port, () => {
  console.log(`Runner Plaza is running at http://localhost:${port}/site/`);
});
