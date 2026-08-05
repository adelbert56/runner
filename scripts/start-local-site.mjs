import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT || 4173);

function isListening() {
  return new Promise((resolveListening) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.end(); resolveListening(true); });
    socket.once("error", () => resolveListening(false));
  });
}

try {
  execFileSync("node", ["scripts/sync-local-site-data.mjs"], { cwd: root, stdio: "inherit" });
} catch {
  console.warn("[warn] Starting with current local site data; remote data was not applied.");
}

if (await isListening()) {
  console.log(`Runner local server is already listening on http://127.0.0.1:${port}/site/ and will serve the refreshed files.`);
} else {
  const server = spawn("node", ["site/server.mjs"], { cwd: root, stdio: "inherit", windowsHide: true });
  server.once("exit", (code) => process.exitCode = code ?? 1);
}
