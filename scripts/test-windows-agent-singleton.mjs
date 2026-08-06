import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { windowsWorkbenchAgentScript } from "../src/core/windowsAgent.js";

function processAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(readValue, predicate, timeoutMilliseconds = 5_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const value = await readValue().catch(() => "");
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for the Windows supervisor singleton fixture.");
}

async function waitForExit(child, timeoutMilliseconds = 5_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Process did not exit.")), timeoutMilliseconds);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function terminate(child) {
  if (!child || !processAlive(child.pid)) return;
  child.kill("SIGTERM");
  await waitForExit(child).catch(() => {});
}

test("Windows service-run rejects a concurrent tree and recovers only after its owner exits", async () => {
  const testHome = await mkdtemp(join(tmpdir(), "aiwb-windows-service-singleton-"));
  const agentHome = join(testHome, ".ai-workbench", "agent");
  const fakeBin = join(testHome, "bin");
  const controlPath = join(agentHome, "aiwb-agent.mjs");
  const descriptorPath = join(testHome, "service-descriptor.json");
  const servicePidPath = join(agentHome, "service.pid");
  const lockOwnerPath = join(agentHome, "service.lock", "owner.pid");
  const httpPidPath = join(agentHome, "http.pid");
  const updaterPidPath = join(agentHome, "updater.pid");
  let first;
  let second;
  let replacement;

  const runtimeSource = (pidPath) => `
import fs from "node:fs";
fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
setInterval(() => {}, 1000);
`;
  const env = {
    ...process.env,
    HOME: testHome,
    PATH: `${fakeBin}:${process.env.PATH || ""}`,
    AIWB_TEST_SERVICE_DESCRIPTOR: descriptorPath,
  };

  const publishDescriptor = async (pid) => {
    await writeFile(descriptorPath, JSON.stringify([{
      ProcessId: pid,
      ExecutablePath: process.execPath,
      CommandLine: `"${process.execPath}" "${controlPath}" service-run`,
    }]));
  };
  const stopRecordedRuntime = async (pidPath) => {
    const pid = Number(await readFile(pidPath, "utf8").catch(() => ""));
    if (!(pid > 1) || !processAlive(pid)) return;
    try { process.kill(pid, "SIGTERM"); } catch {}
    await waitFor(async () => String(processAlive(pid)), (value) => value === "false").catch(() => {});
  };

  try {
    await mkdir(agentHome, { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    await writeFile(controlPath, windowsWorkbenchAgentScript("singleton-test"));
    await writeFile(join(agentHome, "aiwb-agent-http.mjs"), runtimeSource(httpPidPath));
    await writeFile(join(agentHome, "aiwb-agent-updater.mjs"), runtimeSource(updaterPidPath));
    const fakePowerShell = join(fakeBin, "powershell.exe");
    await writeFile(fakePowerShell, `#!/usr/bin/env node
const fs = require("node:fs");
try { process.stdout.write(fs.readFileSync(process.env.AIWB_TEST_SERVICE_DESCRIPTOR, "utf8")); }
catch { process.stdout.write("[]"); }
`);
    await chmod(fakePowerShell, 0o700);

    first = spawn(process.execPath, [controlPath, "service-run"], { env, stdio: "ignore" });
    await waitFor(() => readFile(servicePidPath, "utf8"), (value) => Number(value.trim()) === first.pid);
    await waitFor(() => readFile(lockOwnerPath, "utf8"), (value) => Number(value.trim()) === first.pid);
    await publishDescriptor(first.pid);

    second = spawn(process.execPath, [controlPath, "service-run"], { env, stdio: "ignore" });
    await waitForExit(second);
    assert.equal(second.exitCode, 0);
    assert.equal(Number((await readFile(servicePidPath, "utf8")).trim()), first.pid);
    assert.equal(Number((await readFile(lockOwnerPath, "utf8")).trim()), first.pid);

    await terminate(first);
    await stopRecordedRuntime(httpPidPath);
    await stopRecordedRuntime(updaterPidPath);

    replacement = spawn(process.execPath, [controlPath, "service-run"], { env, stdio: "ignore" });
    await waitFor(() => readFile(servicePidPath, "utf8"), (value) => Number(value.trim()) === replacement.pid);
    await waitFor(() => readFile(lockOwnerPath, "utf8"), (value) => Number(value.trim()) === replacement.pid);
    assert.equal(processAlive(replacement.pid), true);
  } finally {
    await terminate(second);
    await terminate(first);
    await terminate(replacement);
    await stopRecordedRuntime(httpPidPath);
    await stopRecordedRuntime(updaterPidPath);
    await rm(testHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
