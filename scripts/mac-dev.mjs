import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const host = "127.0.0.1";
const port = Number(process.env.AIWB_MAC_PORT || 5173);

process.env.ELECTRON_MIRROR ||= "https://npmmirror.com/mirrors/electron/";

function findFreePort(preferredPort) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(findFreePort(preferredPort + 1)));
    server.listen(preferredPort, host, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForRenderer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  return child;
}

const resolvedPort = await findFreePort(port);
const resolvedUrl = `http://${host}:${resolvedPort}/`;

const vite = spawnProcess(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "--host",
  host,
  "--port",
  String(resolvedPort),
]);
vite.on("exit", (code, signal) => {
  console.log(`AI Workbench macOS dev: Vite exited, code=${code ?? ""}, signal=${signal ?? ""}`);
});

let electron;

const cleanup = () => {
  vite.kill("SIGTERM");
  electron?.kill("SIGTERM");
};

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

await waitForRenderer(resolvedUrl);

let electronPath;
try {
  electronPath = require("electron");
} catch {
  cleanup();
  console.error("Electron is not installed. Run: npm install");
  process.exit(1);
}

console.log(`AI Workbench macOS dev: ${resolvedUrl}`);

electron = spawnProcess(electronPath, ["."], {
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: resolvedUrl,
    AIWB_OPEN_DEVTOOLS: process.env.AIWB_OPEN_DEVTOOLS || "0",
  },
});

electron.on("exit", (code, signal) => {
  console.log(`AI Workbench macOS dev: Electron exited, code=${code ?? ""}, signal=${signal ?? ""}`);
  cleanup();
  process.exit(code ?? 0);
});
