import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { workbenchAgentScript } from "../src/core/agent.js";

const execFileAsync = promisify(execFile);
const testHome = await mkdtemp(join(tmpdir(), "aiwb-agent-process-tree-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const taskId = "task-process-tree-regression";
const taskDir = join(agentHome, "tasks", taskId);
const controlPath = join(agentHome, "aiwbctl");
const env = { ...process.env, HOME: testHome };

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

try {
  await mkdir(taskDir, { recursive: true });
  await writeFile(controlPath, workbenchAgentScript(), "utf8");
  await chmod(controlPath, 0o700);
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
  process.stdout.write("agent process-tree cancellation regression: ok\n");
} finally {
  const daemonPid = Number(await readFile(join(agentHome, "daemon.pid"), "utf8").catch(() => ""));
  if (daemonPid && processAlive(daemonPid)) process.kill(daemonPid, "SIGTERM");
  await rm(testHome, { recursive: true, force: true });
}
