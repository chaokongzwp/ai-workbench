import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildWorkbenchAgentCreateCommand,
  parseWorkbenchAgentOutput,
  workbenchAgentScript,
  workbenchAgentTaskCreateMode,
} from "../src/core/agent.js";

async function waitForText(path, expected, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = (await readFile(path, "utf8").catch(() => "")).trim();
    if (value === expected) return value;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.fail(`timed out waiting for ${path}=${expected}`);
}

async function prepareTask(agentHome, taskId, command) {
  const taskDir = join(agentHome, "tasks", taskId);
  await mkdir(taskDir, { recursive: true });
  await writeFile(join(taskDir, "command.b64"), `${Buffer.from(command).toString("base64")}\n`);
  await writeFile(join(taskDir, "conversation_id"), `conversation-${taskId}\n`);
  await writeFile(join(taskDir, "workdir"), `${agentHome}\n`);
  await writeFile(join(taskDir, "agent_id"), "codex\n");
  await writeFile(join(taskDir, "prompt.txt"), "context regression\n");
  return taskDir;
}

function runControl(controlPath, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(controlPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

assert.equal(workbenchAgentTaskCreateMode({ platform: "macos" }), "create-now");
assert.equal(workbenchAgentTaskCreateMode({ platform: "darwin" }), "create-now");
assert.equal(workbenchAgentTaskCreateMode({ platform: "linux" }), "create");
assert.equal(workbenchAgentTaskCreateMode({ platform: "windows" }), "create");

const macCreateCommand = buildWorkbenchAgentCreateCommand(
  { platform: "macos", workdir: "/Users/test/Documents/project" },
  "task-builder",
  "printf ok",
  { conversationId: "conversation-builder" },
  { createMode: "create-now" },
);
assert.match(macCreateCommand, /create-now/);

const testHome = await mkdtemp(join(tmpdir(), "aiwb-agent-macos-context-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const controlPath = join(agentHome, "aiwbctl");
const fakeBin = join(testHome, "bin");
const cleanupTaskIds = [];
let cleanupEnv = null;

try {
  await mkdir(agentHome, { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await writeFile(controlPath, workbenchAgentScript());
  await chmod(controlPath, 0o700);
  await writeFile(join(fakeBin, "uname"), "#!/bin/sh\nprintf 'Darwin\\n'\n");
  await chmod(join(fakeBin, "uname"), 0o700);

  const baseEnv = {
    ...process.env,
    HOME: testHome,
    PATH: `${fakeBin}:${process.env.PATH || ""}`,
    SSH_CONNECTION: "",
    SSH_TTY: "",
  };
  cleanupEnv = baseEnv;

  const controlSource = workbenchAgentScript();
  const controlSha = createHash("sha256").update(controlSource).digest("hex");
  const generation = (epoch, sha = controlSha) => [
    "format=1",
    "state=committed",
    `epoch=${epoch}`,
    "version=55",
    `control_sha256=${sha}`,
    "http_sha256=test-http",
    "updater_sha256=test-updater",
    "",
  ].join("\n");

  const rejectedTaskDir = await prepareTask(agentHome, "task-headless", "printf should-not-run");
  const rejected = spawnSync(controlPath, ["create", "task-headless"], {
    env: baseEnv,
    encoding: "utf8",
  });
  assert.equal(rejected.status, 42);
  assert.match(rejected.stdout, /__AIWB_AGENT_ERROR_CODE__execution_context_required/);
  assert.equal((await readFile(join(rejectedTaskDir, "status"), "utf8").catch(() => "")).trim(), "");

  const rejectedNowTaskDir = await prepareTask(agentHome, "task-headless-now", "printf should-not-run");
  const rejectedNow = spawnSync(controlPath, ["create-now", "task-headless-now"], {
    env: baseEnv,
    encoding: "utf8",
  });
  assert.equal(rejectedNow.status, 42);
  assert.match(rejectedNow.stdout, /__AIWB_AGENT_ERROR_CODE__execution_context_required/);
  assert.equal((await readFile(join(rejectedNowTaskDir, "status"), "utf8").catch(() => "")).trim(), "");

  const fencedTaskDir = await prepareTask(agentHome, "task-update-fenced", "printf should-not-run");
  await writeFile(join(agentHome, "runtime-update.fence"), [
    "format=1",
    "state=draining",
    "epoch=test-fence",
    "owner_pid=123",
    "target_version=55",
    `target_control_sha256=${controlSha}`,
    "",
  ].join("\n"));
  const fenced = spawnSync(controlPath, ["create-now", "task-update-fenced"], {
    env: { ...baseEnv, SSH_CONNECTION: "127.0.0.1 50003 127.0.0.1 22" },
    encoding: "utf8",
  });
  assert.equal(fenced.status, 44);
  assert.match(fenced.stdout, /__AIWB_AGENT_ERROR_CODE__generation_changed/);
  assert.match(fenced.stdout, /__AIWB_AGENT_RETRYABLE__1/);
  assert.equal(parseWorkbenchAgentOutput(fenced.stdout).errorCode, "generation_changed");
  assert.equal(parseWorkbenchAgentOutput(fenced.stdout).retryable, "1");
  assert.equal((await readFile(join(fencedTaskDir, "status"), "utf8")).trim(), "error");
  assert.equal((await readFile(join(fencedTaskDir, "retryable_error_code"), "utf8")).trim(), "generation_changed");
  await rm(join(agentHome, "runtime-update.fence"), { force: true });

  const sshTaskDir = await prepareTask(agentHome, "task-old-app-fallback", "printf 'ssh-context-ok\\n'");
  const launched = spawnSync(controlPath, ["create", "task-old-app-fallback"], {
    env: {
      ...baseEnv,
      SSH_CONNECTION: "127.0.0.1 50000 127.0.0.1 22",
    },
    encoding: "utf8",
  });
  assert.equal(launched.status, 0, launched.stderr || launched.stdout);
  assert.match(launched.stdout, /__AIWB_AGENT_TASK_STATUS__(?:running|done)/);
  await waitForText(join(sshTaskDir, "status"), "done");
  assert.equal((await readFile(join(sshTaskDir, "output.log"), "utf8")).trim(), "ssh-context-ok");
  assert.equal((await readFile(join(agentHome, "service.pid"), "utf8").catch(() => "")).trim(), "");
  assert.equal((await readFile(join(agentHome, "daemon.pid"), "utf8").catch(() => "")).trim(), "");

  const createNowTaskDir = await prepareTask(agentHome, "task-new-app", "printf 'create-now-ok\\n'");
  const createNow = spawnSync(controlPath, ["create-now", "task-new-app"], {
    env: {
      ...baseEnv,
      SSH_CONNECTION: "127.0.0.1 50001 127.0.0.1 22",
    },
    encoding: "utf8",
  });
  assert.equal(createNow.status, 0, createNow.stderr || createNow.stdout);
  await waitForText(join(createNowTaskDir, "status"), "done");
  assert.equal((await readFile(join(createNowTaskDir, "output.log"), "utf8")).trim(), "create-now-ok");

  // A create-now process may wait behind an updater that replaces the
  // committed generation. It must revalidate after acquiring tick.lock and
  // refuse to launch from its old process image.
  await writeFile(join(agentHome, "runtime.generation"), generation("before-token"));
  const generationTaskDir = await prepareTask(agentHome, "task-generation-swap", "printf generation-must-not-run");
  const generationTickLock = join(agentHome, "tick.lock");
  await mkdir(generationTickLock);
  await writeFile(join(generationTickLock, "owner.pid"), `${process.pid}\n`);
  await writeFile(join(generationTickLock, "started_at"), `${new Date().toISOString()}\n`);
  const generationRun = runControl(controlPath, ["create-now", "task-generation-swap"], {
    ...baseEnv,
    SSH_CONNECTION: "127.0.0.1 50004 127.0.0.1 22",
  });
  await waitForText(join(generationTaskDir, "status"), "preparing");
  await writeFile(join(agentHome, "runtime.generation"), generation("after-token"));
  await rm(generationTickLock, { recursive: true, force: true });
  const generationResult = await generationRun;
  assert.equal(generationResult.code, 44, generationResult.stderr || generationResult.stdout);
  assert.match(generationResult.stdout, /__AIWB_AGENT_ERROR_CODE__generation_changed/);
  assert.equal((await readFile(join(generationTaskDir, "status"), "utf8")).trim(), "error");
  assert.equal(await readFile(join(generationTaskDir, "output.log"), "utf8").catch(() => ""), "");

  const shaTaskDir = await prepareTask(agentHome, "task-control-sha-swap", "printf sha-must-not-run");
  await mkdir(generationTickLock);
  await writeFile(join(generationTickLock, "owner.pid"), `${process.pid}\n`);
  await writeFile(join(generationTickLock, "started_at"), `${new Date().toISOString()}\n`);
  const shaRun = runControl(controlPath, ["create-now", "task-control-sha-swap"], {
    ...baseEnv,
    SSH_CONNECTION: "127.0.0.1 50005 127.0.0.1 22",
  });
  await waitForText(join(shaTaskDir, "status"), "preparing");
  await writeFile(controlPath, `${controlSource}\n# replacement generation\n`);
  await chmod(controlPath, 0o700);
  await rm(generationTickLock, { recursive: true, force: true });
  const shaResult = await shaRun;
  assert.equal(shaResult.code, 44, shaResult.stderr || shaResult.stdout);
  assert.match(shaResult.stdout, /__AIWB_AGENT_ERROR_CODE__generation_changed/);
  assert.equal((await readFile(join(shaTaskDir, "status"), "utf8")).trim(), "error");
  assert.equal(await readFile(join(shaTaskDir, "output.log"), "utf8").catch(() => ""), "");
  await writeFile(controlPath, controlSource);
  await chmod(controlPath, 0o700);
  await writeFile(join(agentHome, "runtime.generation"), generation("restored-token"));

  // A headless macOS daemon must terminalize old queued work. The sentinel
  // command proves the legacy payload never reached aiwb_launch_task.
  const legacyTaskDir = await prepareTask(agentHome, "task-legacy-queued", "printf launched > legacy-sentinel");
  await writeFile(join(legacyTaskDir, "status"), "queued\n");
  await writeFile(join(legacyTaskDir, "queued_at"), "2020-01-01T00:00:00Z\n");
  const legacyDaemon = spawn(controlPath, ["daemon"], { env: baseEnv, stdio: "ignore" });
  await waitForText(join(legacyTaskDir, "status"), "error");
  assert.equal((await readFile(join(legacyTaskDir, "migration_error_code"), "utf8")).trim(), "macos_user_context_required");
  assert.equal(await readFile(join(agentHome, "legacy-sentinel"), "utf8").catch(() => ""), "");
  legacyDaemon.kill("SIGTERM");
  await new Promise((resolve) => legacyDaemon.once("close", resolve));
  assert.equal(await readFile(join(agentHome, "tick.lock", "owner.pid"), "utf8").catch(() => ""), "");

  // Race more direct launches than the Agent's capacity. Tick-lock
  // serialization must accept exactly four and reject the rest without ever
  // queueing them for launchd.
  const capacityTaskIds = Array.from({ length: 6 }, (_, index) => `task-capacity-${index + 1}`);
  cleanupTaskIds.push(...capacityTaskIds);
  await Promise.all(capacityTaskIds.map((taskId) => prepareTask(agentHome, taskId, "sleep 30")));
  const capacityResults = await Promise.all(capacityTaskIds.map((taskId, index) => runControl(
    controlPath,
    ["create-now", taskId],
    {
      ...baseEnv,
      SSH_CONNECTION: `127.0.0.1 ${50100 + index} 127.0.0.1 22`,
    },
  )));
  const acceptedIndexes = capacityResults
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.code === 0);
  const rejectedIndexes = capacityResults
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.code === 43);
  assert.equal(acceptedIndexes.length, 4, JSON.stringify(capacityResults));
  assert.equal(rejectedIndexes.length, 2, JSON.stringify(capacityResults));
  for (const { index } of acceptedIndexes) {
    await waitForText(join(agentHome, "tasks", capacityTaskIds[index], "status"), "running");
  }
  for (const { result, index } of rejectedIndexes) {
    assert.match(result.stdout, /__AIWB_AGENT_ERROR_CODE__capacity_reached/);
    assert.equal((await readFile(join(agentHome, "tasks", capacityTaskIds[index], "status"), "utf8")).trim(), "error");
    assert.equal((await readFile(join(agentHome, "tasks", capacityTaskIds[index], "exit_code"), "utf8")).trim(), "75");
  }
  const capacityStatuses = await Promise.all(capacityTaskIds.map((taskId) =>
    readFile(join(agentHome, "tasks", taskId, "status"), "utf8").then((value) => value.trim()),
  ));
  assert.equal(capacityStatuses.includes("queued"), false);
} finally {
  if (cleanupEnv) {
    for (const taskId of cleanupTaskIds) {
      spawnSync(controlPath, ["cancel", taskId], { env: cleanupEnv, encoding: "utf8" });
    }
  }
  await rm(testHome, { recursive: true, force: true });
}

console.log("macOS Agent SSH execution-context regression: ok");
