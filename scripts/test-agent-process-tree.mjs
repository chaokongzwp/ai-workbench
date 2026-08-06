import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { workbenchAgentScript } from "../src/core/agent.js";

const execFileAsync = promisify(execFile);
const testHome = await mkdtemp(join(tmpdir(), "aiwb-agent-process-tree-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const taskId = "task-process-tree-regression";
const taskDir = join(agentHome, "tasks", taskId);
const watchdogTaskId = "task-claude-macos-watchdog-regression";
const watchdogTaskDir = join(agentHome, "tasks", watchdogTaskId);
const staleTaskId = "task-stale-pid-regression";
const staleTaskDir = join(agentHome, "tasks", staleTaskId);
const lockTaskId = "task-live-lock-regression";
const lockTaskDir = join(agentHome, "tasks", lockTaskId);
const controlPath = join(agentHome, "aiwbctl");
const testBin = join(testHome, "bin");
const env = {
  ...process.env,
  HOME: testHome,
  PATH: `${testBin}:${process.env.PATH || ""}`,
  AIWB_CLAUDE_MAC_STARTUP_WATCHDOG_FORCE: "1",
  AIWB_CLAUDE_MAC_STARTUP_GRACE_SECONDS: "1",
  AIWB_CLAUDE_MAC_STARTUP_SAMPLE_SECONDS: "1",
  AIWB_CLAUDE_MAC_STARTUP_STALL_SAMPLES: "2",
  // macOS v54 intentionally refuses task launch from a headless LaunchAgent.
  // This regression exercises a task created through the supported SSH path.
  SSH_CONNECTION: "127.0.0.1 50002 127.0.0.1 22",
};
let unrelatedProcess;
let daemonProbe;

function processAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(read, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read().catch(() => "");
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Agent process-tree state.");
}

async function mkdirWhenAvailable(directory, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await mkdir(directory);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting to create test lock: ${directory}`);
}

try {
  await mkdir(taskDir, { recursive: true });
  await mkdir(watchdogTaskDir, { recursive: true });
  await mkdir(staleTaskDir, { recursive: true });
  await mkdir(lockTaskDir, { recursive: true });
  await mkdir(testBin, { recursive: true });
  await writeFile(join(testBin, "lsof"), "#!/bin/sh\nexit 1\n", "utf8");
  await chmod(join(testBin, "lsof"), 0o700);
  const controlSource = workbenchAgentScript();
  await writeFile(controlPath, controlSource, "utf8");
  await chmod(controlPath, 0o700);
  unrelatedProcess = spawn("sleep", ["120"], { stdio: "ignore" });
  await waitFor(async () => String(processAlive(unrelatedProcess.pid)), (value) => value === "true");
  const daemonLock = join(agentHome, "daemon.lock");
  await mkdir(daemonLock);
  await writeFile(join(agentHome, "daemon.pid"), `${unrelatedProcess.pid}\n`);
  await writeFile(join(daemonLock, "owner.pid"), `${unrelatedProcess.pid}\n`);
  await writeFile(join(daemonLock, "version"), `${(await execFileAsync(controlPath, ["--version"], { env })).stdout.trim()}\n`);
  await writeFile(join(daemonLock, "control.sha256"), `${createHash("sha256").update(controlSource).digest("hex")}\n`);
  const staleHealth = await execFileAsync(controlPath, ["status"], { env });
  assert.match(staleHealth.stdout, /__AIWB_AGENT_DAEMON_STATUS__stopped/);
  assert.match(staleHealth.stdout, /__AIWB_AGENT_GENERATION_READY__0/);
  daemonProbe = spawn(controlPath, ["daemon"], { env, stdio: "ignore" });
  const replacementDaemonPid = Number(await waitFor(
    () => readFile(join(agentHome, "daemon.pid"), "utf8"),
    (value) => /^\d+\s*$/.test(value) && Number(value.trim()) !== unrelatedProcess.pid,
  ));
  assert.equal(processAlive(replacementDaemonPid), true);
  assert.equal(processAlive(unrelatedProcess.pid), true, "stale daemon PID reuse must not block startup or kill its owner");
  daemonProbe.kill("SIGTERM");
  await waitFor(async () => String(processAlive(replacementDaemonPid)), (value) => value === "false");

  const tickLock = join(agentHome, "tick.lock");
  await mkdirWhenAvailable(tickLock);
  await writeFile(join(tickLock, "owner.pid"), `${process.pid}\n`);
  await writeFile(join(tickLock, "started_at"), "2000-01-01T00:00:00Z\n");
  const oldTime = new Date(Date.now() - 120_000);
  await utimes(tickLock, oldTime, oldTime);
  await writeFile(join(lockTaskDir, "command.b64"), `${Buffer.from("printf lock-test").toString("base64")}\n`, "utf8");
  await writeFile(join(lockTaskDir, "conversation_id"), "live-lock-regression\n", "utf8");
  await assert.rejects(execFileAsync(controlPath, ["create-now", lockTaskId], { env }));
  assert.equal((await readFile(join(tickLock, "owner.pid"), "utf8")).trim(), String(process.pid));
  assert.equal((await stat(tickLock)).isDirectory(), true, "an old lock with a live owner must never be removed");
  await rm(tickLock, { recursive: true, force: true });

  const command = "bash -c 'sleep 120 & wait'";
  await writeFile(join(taskDir, "command.b64"), `${Buffer.from(command).toString("base64")}\n`, "utf8");
  await writeFile(join(taskDir, "conversation_id"), "process-tree-regression\n", "utf8");

  await execFileAsync(controlPath, ["create", taskId], { env });
  const runnerPid = Number(await waitFor(
    () => readFile(join(taskDir, "pid"), "utf8"),
    (value) => /^\d+\s*$/.test(value),
  ));
  const commandPid = Number(await waitFor(
    () => readFile(join(taskDir, "command_pid"), "utf8"),
    (value) => /^\d+\s*$/.test(value),
  ));
  assert.equal(processAlive(runnerPid), true);
  assert.equal(processAlive(commandPid), true);

  await execFileAsync(controlPath, ["cancel", taskId], { env });
  await waitFor(async () => String(processAlive(runnerPid) || processAlive(commandPid)), (value) => value === "false");
  assert.equal((await readFile(join(taskDir, "status"), "utf8")).trim(), "cancelled");

  await writeFile(join(staleTaskDir, "status"), "running\n", "utf8");
  await writeFile(join(staleTaskDir, "pid"), `${unrelatedProcess.pid}\n`, "utf8");
  await writeFile(join(staleTaskDir, "command_pid"), `${unrelatedProcess.pid}\n`, "utf8");
  await execFileAsync(controlPath, ["cancel", staleTaskId], { env });
  assert.equal(processAlive(unrelatedProcess.pid), true, "a reused stale task PID must never kill an unrelated process");
  assert.equal((await readFile(join(staleTaskDir, "status"), "utf8")).trim(), "cancelled");

  await writeFile(join(watchdogTaskDir, "command.b64"), `${Buffer.from("exec sleep 120").toString("base64")}\n`, "utf8");
  await writeFile(join(watchdogTaskDir, "conversation_id"), "claude-macos-watchdog-regression\n", "utf8");
  await writeFile(join(watchdogTaskDir, "agent_id"), "claude\n", "utf8");
  await execFileAsync(controlPath, ["create", watchdogTaskId], { env });
  await waitFor(
    () => readFile(join(watchdogTaskDir, "status"), "utf8"),
    (value) => value.trim() === "error",
    8_000,
  );
  assert.match(await readFile(join(watchdogTaskDir, "bootstrap.log"), "utf8"), /macOS Claude CLI.*假死/);
  assert.match(await readFile(join(watchdogTaskDir, "startup_watchdog_triggered_at"), "utf8"), /^\d{4}-\d{2}-\d{2}T/);
  await execFileAsync(controlPath, ["uninstall-service"], { env });
  assert.equal(processAlive(unrelatedProcess.pid), true, "uninstall must not kill a stale PID that belongs to an unrelated process");
  process.stdout.write("agent process-tree cancellation regression: ok\n");
} finally {
  if (unrelatedProcess && processAlive(unrelatedProcess.pid)) unrelatedProcess.kill("SIGTERM");
  if (daemonProbe && processAlive(daemonProbe.pid)) daemonProbe.kill("SIGTERM");
  const daemonPid = Number(await readFile(join(agentHome, "daemon.pid"), "utf8").catch(() => ""));
  if (daemonPid && processAlive(daemonPid)) {
    process.kill(daemonPid, "SIGTERM");
    await waitFor(() => String(processAlive(daemonPid)), (value) => value === "false").catch(() => {});
  }
  await rm(testHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
