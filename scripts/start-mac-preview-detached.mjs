import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const electronPath = require("electron");
const logDir = join(process.env.HOME || projectRoot, "Library", "Logs", "AI Workbench");
const logPath = join(logDir, "electron-detached-preview.log");

mkdirSync(logDir, { recursive: true });

function stopExistingPreview() {
  let output = "";
  try {
    output = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  } catch {
    return [];
  }
  const electronMain = join(projectRoot, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
  const relativeElectronMain = "./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron";
  const hasProjectCwd = (pid) => {
    try {
      const cwdOutput = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
      return cwdOutput.split("\n").some((line) => line === `n${projectRoot}`);
    } catch {
      return false;
    }
  };
  const pids = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter(Boolean)
    .filter(({ pid, command }) => {
      if (pid === process.pid) return false;
      if (command.includes(electronMain)) return true;
      return command.includes(relativeElectronMain) && hasProjectCwd(pid);
    })
    .map(({ pid }) => pid);

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The process may already be gone.
    }
  }
  if (pids.length) {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const stillAlive = pids.some((pid) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      });
      if (!stillAlive) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  return pids;
}

const stoppedPids = stopExistingPreview();
const output = openSync(logPath, "a");
const child = spawn(electronPath, ["."], {
  cwd: projectRoot,
  detached: true,
  stdio: ["ignore", output, output],
  env: {
    ...process.env,
    AIWB_ELECTRON_MODE: "preview",
  },
});

child.unref();
if (stoppedPids.length) console.log(`已关闭旧的 AI Workbench macOS preview：pid=${stoppedPids.join(",")}`);
console.log(`AI Workbench macOS preview 已独立启动：pid=${child.pid}`);
console.log(`日志：${logPath}`);
