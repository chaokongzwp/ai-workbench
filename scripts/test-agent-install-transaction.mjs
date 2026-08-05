import assert from "node:assert/strict";
import { exec, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  buildInstallWorkbenchAgentCommand,
  latestWorkbenchAgentVersion,
  workbenchAgentControlLatestUrl,
} from "../src/core/agent.js";

const execAsync = promisify(exec);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const oldControl = `#!/usr/bin/env bash
case "$1" in
  --version|version) printf '53\\n' ;;
  install-service) printf 'recovered\\n' > "$HOME/old-supervisor-recovered" ;;
  status) printf '__AIWB_AGENT_STATUS__ready\\n' ;;
esac
`;
const failingControl = `#!/usr/bin/env bash
case "$1" in
  --version|version) printf '${latestWorkbenchAgentVersion}\\n' ;;
  install-service) exit 17 ;;
  status) printf '__AIWB_AGENT_STATUS__ready\\n' ;;
esac
`;
const oldArtifacts = {
  control: oldControl,
  http: "old-http-runtime\n",
  updater: "old-updater-runtime\n",
  updaterConfig: '{"old":"updater"}\n',
  httpConfig: '{"old":"http","tls":true}\n',
  generation: [
    "format=1",
    "state=committed",
    "epoch=old-generation",
    "version=53",
    `control_sha256=${sha256(oldControl)}`,
    `http_sha256=${sha256("old-http-runtime\n")}`,
    `updater_sha256=${sha256("old-updater-runtime\n")}`,
    "",
  ].join("\n"),
};
const newArtifacts = {
  control: failingControl,
  http: "new-http-runtime\n",
  updater: "new-updater-runtime\n",
};

function replacementFailureInjection(command, agentHome) {
  const flag = join(agentHome, "replacement-failure-triggered");
  const injection = `mv() {
  AIWB_TEST_MV_SOURCE="$1"
  AIWB_TEST_MV_TARGET="$2"
  case "$AIWB_TEST_MV_SOURCE:$AIWB_TEST_MV_TARGET" in
    *aiwb-agent-http.mjs.stage.*:*aiwb-agent-http.mjs)
      if [ ! -e "${flag}" ]; then
        : > "${flag}"
        return 91
      fi
      ;;
  esac
  command mv "$@"
}
`;
  return command.replace("set -e\n", `set -e\n${injection}`);
}

async function runScenario({
  taskStatus = "",
  taskPid = "",
  commandPid = "",
  freshTaskWithoutStatus = false,
  corrupt = "",
  failReplacement = false,
  sameVersionUnrelatedPids = false,
  liveOldTickLock = false,
  realRunningTask = false,
  platform = "macos",
  taskAgeSeconds = 0,
} = {}) {
  const testHome = await mkdtemp(join(tmpdir(), "aiwb-agent-install-transaction-"));
  const agentHome = join(testHome, ".ai-workbench", "agent");
  const taskDir = join(agentHome, "tasks", "task-test");
  const fakeBin = join(testHome, "bin");
  let server;
  let taskRunner;
  try {
    await mkdir(taskDir, { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    await writeFile(join(fakeBin, "uname"), `#!/bin/sh\nprintf '${platform === "macos" ? "Darwin" : "Linux"}\\n'\n`);
    await chmod(join(fakeBin, "uname"), 0o700);
    const installedControl = sameVersionUnrelatedPids ? failingControl : oldArtifacts.control;
    await writeFile(join(agentHome, "aiwbctl"), installedControl);
    await chmod(join(agentHome, "aiwbctl"), 0o700);
    await writeFile(join(agentHome, "aiwb-agent-http.mjs"), oldArtifacts.http);
    await writeFile(join(agentHome, "aiwb-agent-updater.mjs"), oldArtifacts.updater);
    await writeFile(join(agentHome, "updater.json"), oldArtifacts.updaterConfig);
    await writeFile(join(agentHome, "http.json"), oldArtifacts.httpConfig);
    await writeFile(join(agentHome, "runtime.generation"), oldArtifacts.generation);

    if (realRunningTask) {
      const runPath = join(taskDir, "run.sh");
      await writeFile(runPath, "#!/usr/bin/env bash\ntrap 'kill \"$child\" 2>/dev/null || true' TERM EXIT\nsleep 120 &\nchild=$!\nwait \"$child\"\n");
      await chmod(runPath, 0o700);
      taskRunner = spawn("/bin/bash", [runPath, taskDir], { stdio: "ignore" });
      taskPid = taskRunner.pid;
    }
    if (taskStatus) await writeFile(join(taskDir, "status"), `${taskStatus}\n`);
    if (taskPid) await writeFile(join(taskDir, "pid"), `${taskPid}\n`);
    if (commandPid) await writeFile(join(taskDir, "command_pid"), `${commandPid}\n`);
    if (taskStatus === "preparing" || freshTaskWithoutStatus) {
      await writeFile(join(taskDir, "created_at"), `${new Date(Date.now() - taskAgeSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")}\n`);
      await writeFile(join(taskDir, "command.b64"), "dGVzdA==\n");
    }
    if (liveOldTickLock) {
      const tickLock = join(agentHome, "tick.lock");
      await mkdir(tickLock);
      await writeFile(join(tickLock, "owner.pid"), `${process.pid}\n`);
      await writeFile(join(tickLock, "started_at"), "2000-01-01T00:00:00Z\n");
      const oldTime = new Date(Date.now() - 120_000);
      await utimes(tickLock, oldTime, oldTime);
    }

    server = createServer((request, response) => {
      const base = `http://127.0.0.1:${server.address().port}`;
      if (request.url === "/control") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          macosManifestUrl: `${base}/manifest`,
          linuxManifestUrl: `${base}/manifest`,
        }));
        return;
      }
      if (request.url === "/manifest") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          version: latestWorkbenchAgentVersion,
          scriptUrl: `${base}/control-artifact`,
          sha256: sha256(newArtifacts.control),
          directRuntime: {
            url: `${base}/http-artifact`,
            sha256: corrupt === "http" ? sha256("different-http") : sha256(newArtifacts.http),
          },
          updaterRuntime: {
            url: `${base}/updater-artifact`,
            sha256: corrupt === "updater" ? sha256("different-updater") : sha256(newArtifacts.updater),
          },
        }));
        return;
      }
      const body = {
        "/control-artifact": newArtifacts.control,
        "/http-artifact": newArtifacts.http,
        "/updater-artifact": newArtifacts.updater,
      }[request.url];
      if (body != null) {
        response.end(body);
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    if (sameVersionUnrelatedPids) {
      const controlSha = sha256(newArtifacts.control);
      await writeFile(join(agentHome, "aiwb-agent-http.mjs"), newArtifacts.http);
      await writeFile(join(agentHome, "aiwb-agent-updater.mjs"), newArtifacts.updater);
      await writeFile(join(agentHome, "service.runtime.sha256"), `${controlSha}\n`);
      await writeFile(join(agentHome, "http.runtime.sha256"), `${sha256(newArtifacts.http)}\n`);
      await writeFile(join(agentHome, "updater.runtime.sha256"), `${sha256(newArtifacts.updater)}\n`);
      await mkdir(join(agentHome, "daemon.lock"), { recursive: true });
      await writeFile(join(agentHome, "daemon.lock", "version"), `${latestWorkbenchAgentVersion}\n`);
      await writeFile(join(agentHome, "daemon.lock", "control.sha256"), `${controlSha}\n`);
      await writeFile(join(agentHome, "daemon.lock", "owner.pid"), `${process.pid}\n`);
      for (const name of ["service.pid", "daemon.pid", "http.pid", "updater.pid"]) {
        await writeFile(join(agentHome, name), `${process.pid}\n`);
      }
    }

    const localControlUrl = `http://127.0.0.1:${server.address().port}/control`;
    let command = buildInstallWorkbenchAgentCommand({ platform: "macos", host: "127.0.0.1" })
      .replace(workbenchAgentControlLatestUrl, localControlUrl)
      .replace("set -e\n", `set -e\nuname() { printf "${platform === "macos" ? "Darwin" : "Linux"}\\n"; }\n`);
    if (failReplacement) command = replacementFailureInjection(command, agentHome);
    let result;
    try {
      const completed = await execAsync(command, {
        env: { ...process.env, HOME: testHome, PATH: `${fakeBin}:${process.env.PATH || ""}` },
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      result = { code: 0, stdout: completed.stdout, stderr: completed.stderr };
    } catch (error) {
      result = {
        code: Number.isInteger(error.code) ? error.code : -1,
        stdout: String(error.stdout || ""),
        stderr: String(error.stderr || error.message || ""),
      };
    }
    const files = {
      control: await readFile(join(agentHome, "aiwbctl"), "utf8"),
      http: await readFile(join(agentHome, "aiwb-agent-http.mjs"), "utf8"),
      updater: await readFile(join(agentHome, "aiwb-agent-updater.mjs"), "utf8"),
      updaterConfig: await readFile(join(agentHome, "updater.json"), "utf8"),
      httpConfig: await readFile(join(agentHome, "http.json"), "utf8"),
      generation: await readFile(join(agentHome, "runtime.generation"), "utf8"),
      taskStatus: await readFile(join(taskDir, "status"), "utf8").catch(() => ""),
      migrationError: await readFile(join(taskDir, "migration_error_code"), "utf8").catch(() => ""),
      recovered: await readFile(join(testHome, "old-supervisor-recovered"), "utf8").catch(() => ""),
      lockOwner: await readFile(join(agentHome, "tick.lock", "owner.pid"), "utf8").catch(() => ""),
    };
    return { result, files, installedControl, testHome };
  } finally {
    if (taskRunner) {
      try { taskRunner.kill("SIGTERM"); } catch {}
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    // Callers have already captured all assertions inputs.
    await rm(testHome, { recursive: true, force: true });
  }
}

function assertOriginalGeneration(files, installedControl = oldArtifacts.control) {
  assert.equal(files.control, installedControl);
  assert.equal(files.http, oldArtifacts.http);
  assert.equal(files.updater, oldArtifacts.updater);
  assert.equal(files.updaterConfig, oldArtifacts.updaterConfig);
  assert.equal(files.httpConfig, oldArtifacts.httpConfig);
  assert.equal(files.generation, oldArtifacts.generation);
}

{
  const { result, files } = await runScenario({ liveOldTickLock: true });
  assert.equal(result.code, 21);
  assert.match(result.stdout, /__AIWB_AGENT_INSTALL_DEFER_REASON__task_lock_busy/);
  assert.equal(files.lockOwner.trim(), String(process.pid), "installer must not steal an old lock whose owner is alive");
  assertOriginalGeneration(files);
}

{
  const { result, files } = await runScenario({ taskStatus: "running", realRunningTask: true });
  assert.equal(result.code, 20);
  assert.match(result.stdout, /__AIWB_AGENT_INSTALL_RESULT__deferred/);
  assert.match(result.stdout, /__AIWB_AGENT_INSTALL_DEFER_REASON__active_tasks/);
  assertOriginalGeneration(files);
}

{
  const { result, files } = await runScenario({ taskStatus: "running", taskPid: process.pid, commandPid: process.pid });
  assert.equal(result.code, 11, "a stale reused PID must not be treated as a real running task");
  assert.doesNotMatch(result.stdout, /INSTALL_RESULT__deferred/);
  assertOriginalGeneration(files);
}

{
  const { result, files } = await runScenario({ taskStatus: "preparing" });
  assert.equal(result.code, 20);
  assert.match(result.stdout, /__AIWB_AGENT_INSTALL_RESULT__deferred/);
  assertOriginalGeneration(files);
}

{
  const { result, files } = await runScenario({ freshTaskWithoutStatus: true });
  assert.equal(result.code, 20);
  assert.match(result.stdout, /__AIWB_AGENT_INSTALL_DEFER_REASON__active_tasks/);
  assertOriginalGeneration(files);
}

for (const corrupt of ["http", "updater"]) {
  const { result, files } = await runScenario({ corrupt });
  assert.equal(result.code, 7);
  assert.match(result.stdout, /runtime 下载或校验失败/);
  assertOriginalGeneration(files);
}

{
  const { result, files } = await runScenario({ failReplacement: true });
  assert.equal(result.code, 10);
  assert.match(result.stdout, /__AIWB_AGENT_INSTALL_ROLLBACK__restored/);
  assert.equal(files.recovered.trim(), "recovered");
  assertOriginalGeneration(files);
}

{
  const { result, files } = await runScenario({ taskStatus: "queued" });
  assert.equal(result.code, 11, "macOS legacy queued work must not block the upgrade transaction");
  assert.doesNotMatch(result.stdout, /INSTALL_RESULT__deferred/);
  assert.match(result.stdout, /__AIWB_AGENT_INSTALL_ROLLBACK__restored/);
  assert.equal(files.recovered.trim(), "recovered");
  assert.equal(files.taskStatus.trim(), "error");
  assert.equal(files.migrationError.trim(), "macos_user_context_required");
  assertOriginalGeneration(files);
}

{
  const { result, files } = await runScenario({ taskStatus: "preparing", taskAgeSeconds: 60 });
  assert.equal(result.code, 11, "stale macOS preparing work must be terminalized during migration");
  assert.doesNotMatch(result.stdout, /INSTALL_RESULT__deferred/);
  assert.equal(files.taskStatus.trim(), "error");
  assert.equal(files.migrationError.trim(), "macos_user_context_required");
  assertOriginalGeneration(files);
}

{
  const { result, files } = await runScenario({ taskStatus: "queued", platform: "linux" });
  assert.equal(result.code, 11);
  assert.equal(files.taskStatus.trim(), "queued", "Linux queued work must remain available to the new daemon");
  assert.equal(files.migrationError.trim(), "");
  assertOriginalGeneration(files);
}

{
  const { result, files, installedControl } = await runScenario({ sameVersionUnrelatedPids: true });
  assert.equal(result.code, 11, "unrelated live PIDs must not satisfy same-version readiness");
  assert.doesNotMatch(result.stdout, /INSTALL_RESULT__unchanged/);
  assert.equal(files.control, installedControl);
  assert.equal(files.http, newArtifacts.http);
  assert.equal(files.updater, newArtifacts.updater);
  assert.equal(files.updaterConfig, oldArtifacts.updaterConfig);
  assert.equal(files.httpConfig, oldArtifacts.httpConfig);
}

console.log("unix Agent install drain and transaction regression: ok");
