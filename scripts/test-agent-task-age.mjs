import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { workbenchAgentScript } from "../src/core/agent.js";

const execFileAsync = promisify(execFile);
const testHome = await mkdtemp(join(tmpdir(), "aiwb-agent-task-age-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const taskId = "task-fresh-without-pid";
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

try {
  await mkdir(taskDir, { recursive: true });
  await writeFile(controlPath, workbenchAgentScript(), "utf8");
  await chmod(controlPath, 0o700);
  await writeFile(join(taskDir, "status"), "running\n");
  await writeFile(join(taskDir, "started_at"), `${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}\n`);
  await writeFile(join(taskDir, "pid"), "\n");

  const result = await execFileAsync(controlPath, ["status", taskId], { env });
  assert.match(result.stdout, /__AIWB_AGENT_TASK_STATUS__running/);
  assert.equal((await readFile(join(taskDir, "status"), "utf8")).trim(), "running");
  process.stdout.write("agent portable fresh-task age regression: ok\n");
} finally {
  const daemonPid = Number(await readFile(join(agentHome, "daemon.pid"), "utf8").catch(() => ""));
  if (daemonPid && processAlive(daemonPid)) process.kill(daemonPid, "SIGTERM");
  await rm(testHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
