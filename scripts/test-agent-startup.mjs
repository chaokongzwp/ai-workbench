import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { get as httpGet } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  agentCanContinueAfterUpgradeFailure,
  agentTaskSubmissionReady,
  agentTaskSubmissionTransport,
  agentTaskMatchesInterruptedSubmission,
  trustedAgentPlatform,
} from "../src/core/agentStartup.js";
import { workbenchAgentScript } from "../src/core/agent.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function processAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return Number(pid) > 1;
  } catch {
    return false;
  }
}

async function waitUntil(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("timed out waiting for Agent supervisor state");
}

async function readText(path) {
  return (await readFile(path, "utf8").catch(() => "")).trim();
}

function fakeHttpRuntime(generation) {
  return `import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const home = process.env.AIWB_AGENT_HOME;
const runtimePath = fileURLToPath(import.meta.url);
const pidPath = join(home, "http.pid");
const markerPath = join(home, "http.runtime.sha256");
const existing = Number(existsSync(pidPath) ? readFileSync(pidPath, "utf8").trim() : 0);
try { if (existing > 1) { process.kill(existing, 0); process.exit(17); } } catch {}
writeFileSync(pidPath, String(process.pid));
writeFileSync(markerPath, createHash("sha256").update(readFileSync(runtimePath)).digest("hex") + "\\n");
const server = createServer((request, response) => {
  if (request.url === "/upgrade") {
    response.end("accepted");
    setTimeout(() => spawn(join(home, "aiwbctl"), ["install-service"], { env: process.env }), 20);
    return;
  }
  response.end(${JSON.stringify(generation)});
});
const cleanup = () => {
  try { if (readFileSync(pidPath, "utf8").trim() === String(process.pid)) unlinkSync(pidPath); } catch {}
  process.exit(0);
};
process.once("SIGTERM", () => server.close(cleanup));
process.once("SIGINT", () => server.close(cleanup));
server.once("error", cleanup);
server.listen(Number(process.env.AIWB_TEST_HTTP_PORT), "127.0.0.1");
`;
}

function fakeUpdaterRuntime(generation) {
  return `import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const generation = ${JSON.stringify(generation)};
const home = process.env.AIWB_AGENT_HOME;
const runtimePath = fileURLToPath(import.meta.url);
const pidPath = join(home, "updater.pid");
const markerPath = join(home, "updater.runtime.sha256");
const existing = Number(existsSync(pidPath) ? readFileSync(pidPath, "utf8").trim() : 0);
try { if (existing > 1) { process.kill(existing, 0); process.exit(17); } } catch {}
writeFileSync(pidPath, String(process.pid));
writeFileSync(markerPath, createHash("sha256").update(readFileSync(runtimePath)).digest("hex") + "\\n");
const cleanup = () => {
  try { if (readFileSync(pidPath, "utf8").trim() === String(process.pid)) unlinkSync(pidPath); } catch {}
  process.exit(0);
};
process.once("SIGTERM", cleanup);
process.once("SIGINT", cleanup);
setInterval(() => void generation, 1000);
`;
}

function httpGeneration(port, path = "/") {
  return new Promise((resolve, reject) => {
    const request = httpGet(`http://127.0.0.1:${port}${path}`, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    request.once("error", reject);
  });
}

assert.equal(
  agentCanContinueAfterUpgradeFailure({ alreadyReady: true, installedVersion: 51 }),
  true,
  "a running older Agent must keep task sync available when its upgrade fails",
);
assert.equal(agentCanContinueAfterUpgradeFailure({ alreadyReady: false, installedVersion: 51 }), false);
assert.equal(agentCanContinueAfterUpgradeFailure({ alreadyReady: true, installedVersion: 0 }), false);
assert.equal(
  agentTaskSubmissionReady({ available: true, installedVersion: 54, requiredVersion: 54, generationReady: true }),
  true,
);
assert.equal(
  agentTaskSubmissionReady({ available: true, installedVersion: 53, requiredVersion: 54, generationReady: false }),
  false,
  "an old Agent may sync existing tasks but must not accept a new submission",
);
assert.equal(
  agentTaskSubmissionReady({ available: true, installedVersion: 54, requiredVersion: 54, generationReady: false }),
  false,
);
assert.equal(trustedAgentPlatform("Darwin"), "macos");
assert.equal(trustedAgentPlatform("macos"), "macos");
assert.equal(trustedAgentPlatform("linux"), "linux");
assert.equal(trustedAgentPlatform("unknown"), "");
assert.equal(
  agentTaskSubmissionTransport({ platform: "macos", directRouteReady: true, directConfigured: true }),
  "ssh-create-now",
  "a trusted macOS health result must always use the SSH user execution context",
);
assert.equal(
  agentTaskSubmissionTransport({ platform: "linux", directRouteReady: false, directConfigured: true }),
  "ssh-create",
  "direct credentials alone must never authorize task creation after a failed live health check",
);
assert.equal(
  agentTaskSubmissionTransport({ platform: "linux", directRouteReady: true, directConfigured: true }),
  "direct",
);

const interruptedMessage = {
  conversationId: "conversation-02",
  turnId: "turn-02",
};
assert.equal(
  agentTaskMatchesInterruptedSubmission(
    { id: "task-02", conversationId: "conversation-02", turnId: "turn-02" },
    interruptedMessage,
  ),
  true,
);
assert.equal(
  agentTaskMatchesInterruptedSubmission(
    { id: "task-previous", conversationId: "conversation-02", turnId: "turn-01" },
    interruptedMessage,
  ),
  false,
  "conversation recovery must not attach the previous turn's result to a newer placeholder",
);

const rawTestHome = await mkdtemp(join(tmpdir(), "aiwb-agent-supervisor-startup-"));
const testHome = await realpath(rawTestHome);
const agentHome = join(testHome, ".ai-workbench", "agent");
const controlPath = join(agentHome, "aiwbctl");
const httpRuntimePath = join(agentHome, "aiwb-agent-http.mjs");
const updaterRuntimePath = join(agentHome, "aiwb-agent-updater.mjs");
const fakeBin = join(testHome, "bin");
const children = [];
let cleanupEnv;
try {
  await mkdir(agentHome, { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await writeFile(controlPath, workbenchAgentScript());
  await chmod(controlPath, 0o700);
  await writeFile(join(fakeBin, "uname"), "#!/bin/sh\nprintf 'AIWBTest\\n'\n");
  await writeFile(join(fakeBin, "id"), "#!/bin/sh\nif [ \"$1\" = \"-u\" ]; then printf '501\\n'; else /usr/bin/id \"$@\"; fi\n");
  await chmod(join(fakeBin, "uname"), 0o700);
  await chmod(join(fakeBin, "id"), 0o700);

  const portProbe = await import("node:net").then(({ createServer }) => createServer());
  await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
  const httpPort = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  cleanupEnv = {
    ...process.env,
    HOME: testHome,
    AIWB_AGENT_HOME: agentHome,
    AIWB_TEST_HTTP_PORT: String(httpPort),
    PATH: [fakeBin, dirname(process.execPath), process.env.PATH || ""].filter(Boolean).join(":"),
  };

  const oldHttpSource = fakeHttpRuntime("old-v52");
  const oldUpdaterSource = fakeUpdaterRuntime("old-v52");
  await writeFile(httpRuntimePath, oldHttpSource);
  await writeFile(updaterRuntimePath, oldUpdaterSource);
  const oldHttp = spawn(process.execPath, [httpRuntimePath], { env: cleanupEnv, stdio: "ignore" });
  const oldUpdater = spawn(process.execPath, [updaterRuntimePath], { env: cleanupEnv, stdio: "ignore" });
  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  children.push(oldHttp, oldUpdater, unrelated);
  await waitUntil(async () => Number(await readText(join(agentHome, "http.pid"))) === oldHttp.pid);
  await waitUntil(async () => Number(await readText(join(agentHome, "updater.pid"))) === oldUpdater.pid);
  await waitUntil(async () => (await httpGeneration(httpPort)) === "old-v52");

  // A reused stale PID must be removed without terminating the unrelated
  // process. The two runtime PID files, however, identify real v52 leftovers.
  await writeFile(join(agentHome, "service.pid"), `${unrelated.pid}\n`);
  const newHttpSource = fakeHttpRuntime("new-v53");
  const newUpdaterSource = fakeUpdaterRuntime("new-v53");
  await writeFile(httpRuntimePath, newHttpSource);
  await writeFile(updaterRuntimePath, newUpdaterSource);

  assert.equal(await httpGeneration(httpPort, "/upgrade"), "accepted");
  await waitUntil(async () => (await httpGeneration(httpPort)) === "new-v53", 15_000);
  const newHttpPid = Number(await readText(join(agentHome, "http.pid")));
  const newUpdaterPid = Number(await readText(join(agentHome, "updater.pid")));
  const newServicePid = Number(await readText(join(agentHome, "service.pid")));
  assert.notEqual(newHttpPid, oldHttp.pid);
  assert.notEqual(newUpdaterPid, oldUpdater.pid);
  assert.notEqual(newServicePid, unrelated.pid);
  assert.equal(processAlive(oldHttp.pid), false);
  assert.equal(processAlive(oldUpdater.pid), false);
  assert.equal(processAlive(unrelated.pid), true, "stale PID reuse must not kill an unrelated process");
  assert.equal(await readText(join(agentHome, "http.runtime.sha256")), sha256(newHttpSource));
  assert.equal(await readText(join(agentHome, "updater.runtime.sha256")), sha256(newUpdaterSource));
  const controlSha = sha256(await readFile(controlPath));
  assert.equal(await readText(join(agentHome, "service.runtime.sha256")), controlSha);
  assert.equal(await readText(join(agentHome, "daemon.lock", "control.sha256")), controlSha);
  assert.equal(
    await readText(join(agentHome, "daemon.lock", "owner.pid")),
    await readText(join(agentHome, "daemon.pid")),
  );
} finally {
  const runtimePidFiles = ["service.pid", "daemon.pid", "http.pid", "updater.pid"];
  for (const name of runtimePidFiles) {
    const pid = Number(await readText(join(agentHome, name)));
    if (pid > 1) {
      try { process.kill(pid, "SIGTERM"); } catch {}
    }
  }
  for (const child of children) {
    try { child.kill(); } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  for (const name of runtimePidFiles) {
    const pid = Number(await readText(join(agentHome, name)));
    if (pid > 1) {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  }
  await rm(rawTestHome, { recursive: true, force: true });
}

console.log("agent startup fallback and supervisor generation regression: ok");
