import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const testHome = await mkdtemp(join(tmpdir(), "aiwb-updater-drain-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const taskDir = join(agentHome, "tasks", "task-running");
const metadataTaskDir = join(agentHome, "tasks", "task-metadata-pending");
const lateCreatorTaskDir = join(agentHome, "tasks", "task-late-creator");
const updaterPath = new URL("../agent/runtime/aiwb-agent-updater.mjs", import.meta.url);
const artifacts = {
  "/aiwbctl": Buffer.from("new-control\n"),
  "/http": Buffer.from("new-http\n"),
  "/updater": Buffer.from("new-updater\n"),
};
const sha = (value) => createHash("sha256").update(value).digest("hex");

async function waitForPath(path, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${path}`);
}

function waitForExit(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("updater exit timeout")), timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

let server;
let taskRunner;
try {
  await mkdir(taskDir, { recursive: true });
  await writeFile(join(agentHome, "aiwbctl"), "old-control\n");
  await writeFile(join(agentHome, "aiwb-agent-http.mjs"), "old-http\n");
  await writeFile(join(agentHome, "aiwb-agent-updater.mjs"), "old-updater\n");
  await writeFile(join(taskDir, "run.sh"), "#!/bin/sh\nwhile :; do sleep 1; done\n");
  taskRunner = spawn("/bin/bash", [join(taskDir, "run.sh"), taskDir], { stdio: "ignore" });
  await writeFile(join(taskDir, "status"), "running\n");
  await writeFile(join(taskDir, "pid"), `${taskRunner.pid}\n`);
  await writeFile(join(taskDir, "command_pid"), "\n");
  await writeFile(join(agentHome, "http.pid"), `${process.pid}\n`);
  await writeFile(join(agentHome, "updater.pid"), `${process.pid}\n`);

  server = createServer((request, response) => {
    if (request.url === "/manifest.json") {
      const base = `http://127.0.0.1:${server.address().port}`;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        version: "999",
        scriptUrl: `${base}/aiwbctl`,
        sha256: sha(artifacts["/aiwbctl"]),
        directRuntime: { url: `${base}/http`, sha256: sha(artifacts["/http"]) },
        updaterRuntime: { url: `${base}/updater`, sha256: sha(artifacts["/updater"]) },
      }));
      return;
    }
    const artifact = artifacts[request.url];
    if (artifact) {
      response.end(artifact);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  await writeFile(
    join(agentHome, "updater.json"),
    JSON.stringify({ manifestUrl: `http://127.0.0.1:${server.address().port}/manifest.json` }),
  );

  const env = { ...process.env, HOME: testHome, AIWB_AGENT_HOME: agentHome };
  await execFileAsync(process.execPath, [updaterPath.pathname, "--once"], { env });
  assert.equal(await readFile(join(agentHome, "aiwbctl"), "utf8"), "old-control\n");
  const deferred = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(deferred.deferred, true);
  assert.equal(deferred.reason, "active_tasks");
  assert.equal(deferred.runtimeRecoveryPending, true);
  assert.equal(deferred.activeTaskCount, 1);
  assert.equal(await readFile(join(agentHome, "http.pid"), "utf8"), `${process.pid}\n`);
  assert.equal(await readFile(join(agentHome, "updater.pid"), "utf8"), `${process.pid}\n`);

  taskRunner.kill("SIGTERM");
  await new Promise((resolve) => taskRunner.once("exit", resolve));
  await writeFile(join(taskDir, "status"), "done\n");

  // create-now writes task metadata before it acquires tick.lock and writes a
  // status. That short status-less window must also block file replacement.
  await mkdir(metadataTaskDir, { recursive: true });
  await writeFile(join(metadataTaskDir, "command.b64"), "cHJpbnRmIHRlc3Q=\n");
  await execFileAsync(process.execPath, [updaterPath.pathname, "--once"], { env });
  assert.equal(await readFile(join(agentHome, "aiwbctl"), "utf8"), "old-control\n");
  const metadataDeferred = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(metadataDeferred.reason, "active_tasks");
  assert.equal(metadataDeferred.activeTaskCount, 1);

  // A live daemon/create lock must defer rather than racing the task creator.
  await mkdir(join(agentHome, "tick.lock"), { recursive: true });
  await writeFile(join(agentHome, "tick.lock", "owner.pid"), `${process.pid}\n`);
  const oldLockTime = new Date(Date.now() - 31_000);
  await utimes(join(agentHome, "tick.lock"), oldLockTime, oldLockTime);
  await execFileAsync(process.execPath, [updaterPath.pathname, "--once"], { env });
  const lockDeferred = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(lockDeferred.reason, "task_lock_busy");
  assert.equal(await readFile(join(agentHome, "aiwbctl"), "utf8"), "old-control\n");
  assert.equal(await readFile(join(agentHome, "tick.lock", "owner.pid"), "utf8"), `${process.pid}\n`);
  await rm(join(agentHome, "tick.lock"), { recursive: true, force: true });

  // Abandoned status-less metadata expires and cannot block repair forever.
  const stale = new Date(Date.now() - 31_000);
  await utimes(join(metadataTaskDir, "command.b64"), stale, stale);
  // A live but unrelated reused PID in a stale running task is not proof of
  // ownership and must not defer the update forever.
  await writeFile(join(taskDir, "status"), "running\n");
  await writeFile(join(taskDir, "pid"), `${process.pid}\n`);
  await writeFile(join(taskDir, "command_pid"), `${process.pid}\n`);

  // Deterministic regression for the original race: the updater has already
  // taken tick.lock and completed its first active scan when it publishes the
  // fence. A legacy SSH creator can still write fresh preparing metadata
  // without that lock. The quiet-window rescan must observe it and leave all
  // runtime artifacts and the committed generation untouched.
  const fencedEnv = { ...env, AIWB_AGENT_CREATOR_DRAIN_QUIET_MS: "1000" };
  const fencedUpdater = spawn(process.execPath, [updaterPath.pathname, "--once"], {
    env: fencedEnv,
    stdio: "ignore",
  });
  const fencedExit = waitForExit(fencedUpdater);
  await waitForPath(join(agentHome, "runtime-update.fence"));
  const fence = await readFile(join(agentHome, "runtime-update.fence"), "utf8");
  assert.match(fence, /^format=1$/m);
  assert.match(fence, /^state=draining$/m);
  assert.match(fence, /^epoch=[0-9a-f-]+$/m);
  assert.match(fence, new RegExp(`^owner_pid=${fencedUpdater.pid}$`, "m"));
  assert.match(fence, new RegExp(`^target_control_sha256=${sha(artifacts["/aiwbctl"])}$`, "m"));
  await mkdir(lateCreatorTaskDir, { recursive: true });
  await writeFile(join(lateCreatorTaskDir, "command.b64"), "cHJpbnRmIGxhdGU=\n");
  await writeFile(join(lateCreatorTaskDir, "created_at"), new Date().toISOString());
  await writeFile(join(lateCreatorTaskDir, "status"), "preparing\n");
  assert.deepEqual(await fencedExit, { code: 0, signal: null });
  const lateDeferred = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(lateDeferred.reason, "active_tasks");
  assert.equal(lateDeferred.lateCreatorDetected, true);
  assert.equal(lateDeferred.activeTaskCount, 1);
  assert.equal(await readFile(join(agentHome, "aiwbctl"), "utf8"), "old-control\n");
  await assert.rejects(readFile(join(agentHome, "runtime.generation"), "utf8"), /ENOENT/);
  await assert.rejects(readFile(join(agentHome, "runtime-update.fence"), "utf8"), /ENOENT/);
  await writeFile(join(lateCreatorTaskDir, "status"), "done\n");

  await execFileAsync(process.execPath, [updaterPath.pathname, "--once"], { env });
  assert.equal(await readFile(join(agentHome, "aiwbctl"), "utf8"), "new-control\n");
  assert.equal(await readFile(join(agentHome, "aiwb-agent-http.mjs"), "utf8"), "new-http\n");
  assert.equal(await readFile(join(agentHome, "aiwb-agent-updater.mjs"), "utf8"), "new-updater\n");
  const committedGeneration = await readFile(join(agentHome, "runtime.generation"), "utf8");
  assert.match(committedGeneration, /^format=1$/m);
  assert.match(committedGeneration, /^state=committed$/m);
  assert.match(committedGeneration, /^epoch=[0-9a-f-]+$/m);
  assert.match(committedGeneration, /^version=999$/m);
  assert.match(committedGeneration, new RegExp(`^control_sha256=${sha(artifacts["/aiwbctl"])}$`, "m"));
  assert.match(committedGeneration, new RegExp(`^http_sha256=${sha(artifacts["/http"])}$`, "m"));
  assert.match(committedGeneration, new RegExp(`^updater_sha256=${sha(artifacts["/updater"])}$`, "m"));
  await assert.rejects(readFile(join(agentHome, "runtime-update.fence"), "utf8"), /ENOENT/);
  const pendingRestart = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(pendingRestart.runtimeRecoveryPending, true);
  assert.equal(pendingRestart.restarting, true);
  assert.equal(pendingRestart.restartTriggered, true);
  assert.equal(pendingRestart.restartHandoff.ok, true);
  assert.equal(pendingRestart.targetRuntime.version, "999");
  assert.equal(pendingRestart.targetRuntime.controlSha256, sha(artifacts["/aiwbctl"]));
  assert.equal(pendingRestart.runtimeConsistency.consistent, false);
  assert.ok(pendingRestart.runtimeConsistency.reasons.includes("daemon_not_running"));
  assert.ok(pendingRestart.runtimeConsistency.reasons.includes("http_pid_owner_mismatch"));
  assert.ok(pendingRestart.runtimeConsistency.reasons.includes("updater_pid_owner_mismatch"));
  assert.equal(await readFile(join(agentHome, "http.pid"), "utf8"), `${process.pid}\n`);
  assert.equal(await readFile(join(agentHome, "updater.pid"), "utf8"), `${process.pid}\n`);
  await assert.rejects(readFile(join(agentHome, "tick.lock", "owner.pid"), "utf8"), /ENOENT/);
  process.stdout.write("agent updater active-task drain regression: ok\n");
} finally {
  try { taskRunner?.kill("SIGTERM"); } catch {}
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(testHome, { recursive: true, force: true });
}
