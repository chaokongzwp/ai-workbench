import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const updaterSourcePath = new URL("../agent/runtime/aiwb-agent-updater.mjs", import.meta.url);
const httpRuntimeUrl = new URL("../agent/runtime/aiwb-agent-http.mjs", import.meta.url).href;
const testHome = await mkdtemp(join(tmpdir(), "aiwb-control-update-drain-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const httpPath = join(agentHome, "aiwb-agent-http.mjs");
const updaterPath = join(agentHome, "aiwb-agent-updater.mjs");
const controlPath = join(agentHome, process.platform === "win32" ? "aiwb-agent.mjs" : "aiwbctl");
const taskDir = join(agentHome, "tasks", "task-live");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const token = "direct-test-access-token";
const updateToken = "control-update-token-0123456789";
const children = [];

function processAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return Number(pid) > 1;
  } catch {
    return false;
  }
}

async function readText(path) {
  return (await readFile(path, "utf8").catch(() => "")).trim();
}

async function waitUntil(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("timed out waiting for /v1/control/update regression state");
}

const freePortProbe = createServer();
await new Promise((resolve) => freePortProbe.listen(0, "127.0.0.1", resolve));
const directPort = freePortProbe.address().port;
await new Promise((resolve) => freePortProbe.close(resolve));

function httpWrapper(generation) {
  return `import { startAgentDirectServer } from ${JSON.stringify(httpRuntimeUrl)};
await startAgentDirectServer({
  config: { listenHost: "127.0.0.1", port: ${directPort}, accessToken: ${JSON.stringify(token)}, tls: null },
});
// ${generation}
`;
}

const oldHttp = httpWrapper("old-http-generation");
const newHttp = httpWrapper("new-http-generation");
const oldControl = process.platform === "win32"
  ? "process.exit(1);\n"
  : "#!/bin/sh\nexit 1\n";
const newControl = process.platform === "win32"
  ? "process.exit(1);\n// new-control-generation\n"
  : "#!/bin/sh\n# new-control-generation\nexit 1\n";
const newUpdater = `import { createHash } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const home = process.env.AIWB_AGENT_HOME;
const runtimePath = fileURLToPath(import.meta.url);
const pidPath = join(home, "updater.pid");
writeFileSync(pidPath, String(process.pid));
writeFileSync(join(home, "updater.runtime.sha256"), createHash("sha256").update(readFileSync(runtimePath)).digest("hex") + "\\n");
const cleanup = () => {
  try { if (readFileSync(pidPath, "utf8").trim() === String(process.pid)) unlinkSync(pidPath); } catch {}
  process.exit(0);
};
process.once("SIGTERM", cleanup);
process.once("SIGINT", cleanup);
setInterval(() => {}, 1000);
`;

const artifacts = {
  "/control": Buffer.from(newControl),
  "/http": Buffer.from(newHttp),
  "/updater": Buffer.from(newUpdater),
};

let artifactServer;
try {
  await mkdir(taskDir, { recursive: true });
  await writeFile(httpPath, oldHttp);
  await copyFile(updaterSourcePath, updaterPath);
  await writeFile(controlPath, oldControl);
  await chmod(controlPath, 0o700);
  await writeFile(join(agentHome, "agent-control.json"), JSON.stringify({
    agentId: "agent-control-update-test",
    updateToken,
  }));
  await writeFile(join(taskDir, "status"), "running\n");
  await writeFile(join(taskDir, "run.sh"), "#!/bin/sh\nwhile :; do sleep 1; done\n");
  const taskRunner = spawn("/bin/bash", [join(taskDir, "run.sh"), taskDir], { stdio: "ignore" });
  children.push(taskRunner);
  await writeFile(join(taskDir, "pid"), `${taskRunner.pid}\n`);
  await writeFile(join(taskDir, "command_pid"), "\n");
  await writeFile(join(taskDir, "command.b64"), "cHJpbnRmIHRlc3Q=\n");

  artifactServer = createServer((request, response) => {
    if (request.url === "/manifest.json") {
      const base = `http://127.0.0.1:${artifactServer.address().port}`;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        version: "999",
        scriptUrl: `${base}/control`,
        sha256: sha(artifacts["/control"]),
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
    response.writeHead(404).end();
  });
  await new Promise((resolve) => artifactServer.listen(0, "127.0.0.1", resolve));
  await writeFile(join(agentHome, "updater.json"), JSON.stringify({
    manifestUrl: `http://127.0.0.1:${artifactServer.address().port}/manifest.json`,
  }));

  const env = { ...process.env, HOME: testHome, AIWB_AGENT_HOME: agentHome };
  const oldHttpProcess = spawn(process.execPath, [httpPath], { env, stdio: "ignore" });
  children.push(oldHttpProcess);
  await waitUntil(async () => Number(await readText(join(agentHome, "http.pid"))) === oldHttpProcess.pid);
  await waitUntil(async () => {
    const response = await fetch(`http://127.0.0.1:${directPort}/v1/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  });

  const before = {
    control: sha(await readFile(controlPath)),
    http: sha(await readFile(httpPath)),
    updater: sha(await readFile(updaterPath)),
    httpPid: await readText(join(agentHome, "http.pid")),
    taskPid: await readText(join(taskDir, "pid")),
  };
  const trigger = async () => {
    const response = await fetch(`http://127.0.0.1:${directPort}/v1/control/update`, {
      method: "POST",
      headers: { "X-AIWB-Agent-Update-Token": updateToken, "Content-Type": "application/json" },
      body: JSON.stringify({ version: "999" }),
    });
    assert.equal(response.status, 202);
    return response.json();
  };

  assert.equal((await trigger()).accepted, true);
  await waitUntil(async () => JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8")).reason === "active_tasks");
  const deferred = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(deferred.activeTaskCount, 1);
  assert.deepEqual({
    control: sha(await readFile(controlPath)),
    http: sha(await readFile(httpPath)),
    updater: sha(await readFile(updaterPath)),
    httpPid: await readText(join(agentHome, "http.pid")),
    taskPid: await readText(join(taskDir, "pid")),
  }, before, "active tasks must keep every runtime file and PID unchanged");

  taskRunner.kill("SIGTERM");
  await new Promise((resolve) => taskRunner.once("exit", resolve));
  await writeFile(join(taskDir, "status"), "done\n");
  await waitUntil(async () => (await trigger()).accepted === true);
  await waitUntil(async () => sha(await readFile(httpPath)) === sha(artifacts["/http"]));
  await waitUntil(async () => {
    const nextPid = Number(await readText(join(agentHome, "http.pid")));
    return nextPid > 1 && nextPid !== oldHttpProcess.pid && processAlive(nextPid);
  });
  await waitUntil(async () => {
    const nextPid = Number(await readText(join(agentHome, "updater.pid")));
    return nextPid > 1 && processAlive(nextPid);
  });
  assert.equal(sha(await readFile(controlPath)), sha(artifacts["/control"]));
  assert.equal(sha(await readFile(updaterPath)), sha(artifacts["/updater"]));
  const restarted = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(restarted.restartHandoff?.ok, true);
  assert.equal(restarted.restartHandoff?.mode, "direct-fallback");
  assert.equal(processAlive(oldHttpProcess.pid), false);
  await assert.rejects(readFile(join(agentHome, "tick.lock", "owner.pid"), "utf8"), /ENOENT/);

  process.stdout.write("agent /v1/control/update active-task drain regression: ok\n");
} finally {
  for (const name of ["http.pid", "updater.pid"]) {
    const pid = Number(await readText(join(agentHome, name)));
    if (pid > 1 && pid !== process.pid) {
      try { process.kill(pid, "SIGTERM"); } catch {}
    }
  }
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch {}
  }
  if (artifactServer) await new Promise((resolve) => artifactServer.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 150));
  await rm(testHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
