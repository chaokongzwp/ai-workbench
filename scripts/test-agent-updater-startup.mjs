import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const testHome = await mkdtemp(join(tmpdir(), "aiwb-updater-startup-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const updaterPath = new URL("../agent/runtime/aiwb-agent-updater.mjs", import.meta.url);
const controlName = process.platform === "win32" ? "aiwb-agent.mjs" : "aiwbctl";
const artifacts = {
  "/control": Buffer.from("new-control\n"),
  "/http": Buffer.from("new-http\n"),
  "/updater": Buffer.from("new-updater\n"),
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const children = [];
const keepAlive = (component) => {
  const componentArgs = component === "service"
    ? [join(agentHome, controlName), "service-run"]
    : component === "daemon"
      ? [join(agentHome, controlName), "daemon"]
      : [join(agentHome, component === "http" ? "aiwb-agent-http.mjs" : "aiwb-agent-updater.mjs")];
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", ...componentArgs], { stdio: "ignore", windowsHide: true });
  children.push(child);
  return child;
};

let server;
try {
  await mkdir(join(agentHome, "daemon.lock"), { recursive: true });

  // These processes deliberately predate the installed files. Even if a
  // transient updater-status.json disappears, they cannot be mistaken for the
  // runtime generation represented by the manifest on disk.
  const oldService = keepAlive("service");
  const oldDaemon = keepAlive("daemon");
  const oldHttp = keepAlive("http");
  const oldUpdater = keepAlive("updater");
  await writeFile(join(agentHome, controlName), artifacts["/control"]);
  await writeFile(join(agentHome, "aiwb-agent-http.mjs"), artifacts["/http"]);
  await writeFile(join(agentHome, "aiwb-agent-updater.mjs"), artifacts["/updater"]);
  const future = new Date(Date.now() + 10_000);
  await Promise.all([
    utimes(join(agentHome, controlName), future, future),
    utimes(join(agentHome, "aiwb-agent-http.mjs"), future, future),
    utimes(join(agentHome, "aiwb-agent-updater.mjs"), future, future),
  ]);
  await writeFile(join(agentHome, "service.pid"), `${oldService.pid}\n`);
  await writeFile(join(agentHome, "daemon.pid"), `${oldDaemon.pid}\n`);
  await writeFile(join(agentHome, "http.pid"), `${oldHttp.pid}\n`);
  await writeFile(join(agentHome, "updater.pid"), `${oldUpdater.pid}\n`);
  await writeFile(join(agentHome, "daemon.lock", "owner.pid"), `${oldDaemon.pid}\n`);
  await writeFile(join(agentHome, "daemon.lock", "version"), "998\n");
  await writeFile(join(agentHome, "daemon.lock", "control.sha256"), "old-control-sha\n");
  await writeFile(join(agentHome, "service.runtime.sha256"), "old-control-sha\n");
  await writeFile(join(agentHome, "http.runtime.sha256"), "old-http-sha\n");
  await writeFile(join(agentHome, "updater.runtime.sha256"), "old-updater-sha\n");

  server = createServer((request, response) => {
    if (request.url === "/manifest.json") {
      const base = `http://127.0.0.1:${server.address().port}`;
      response.setHeader("content-type", "application/json");
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
  const recoveredWithoutMarker = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(recoveredWithoutMarker.runtimeRecoveryPending, true);
  assert.equal(recoveredWithoutMarker.restarting, true);
  assert.equal(recoveredWithoutMarker.restartHandoff.ok, true);
  assert.ok(recoveredWithoutMarker.runtimeConsistency.reasons.includes("http_runtime_sha256_mismatch"));
  assert.ok(recoveredWithoutMarker.runtimeConsistency.reasons.includes("updater_runtime_sha256_mismatch"));
  if (process.platform !== "win32") {
    assert.ok(recoveredWithoutMarker.runtimeConsistency.reasons.includes("daemon_runtime_version_mismatch"));
  }
  assert.ok(recoveredWithoutMarker.runtimeConsistency.reasons.includes("service_runtime_generation_stale"));
  assert.ok(recoveredWithoutMarker.runtimeConsistency.reasons.includes("daemon_runtime_generation_stale"));
  assert.ok(recoveredWithoutMarker.runtimeConsistency.reasons.includes("http_runtime_generation_stale"));
  assert.ok(recoveredWithoutMarker.runtimeConsistency.reasons.includes("updater_runtime_generation_stale"));
  const initializedGeneration = await readFile(join(agentHome, "runtime.generation"), "utf8");
  assert.match(initializedGeneration, /^format=1$/m);
  assert.match(initializedGeneration, /^state=committed$/m);
  assert.match(initializedGeneration, /^epoch=[0-9a-f-]+$/m);
  assert.match(initializedGeneration, /^version=999$/m);
  assert.match(initializedGeneration, new RegExp(`^control_sha256=${sha(artifacts["/control"])}$`, "m"));
  await assert.rejects(readFile(join(agentHome, "runtime-update.fence"), "utf8"), /ENOENT/);

  // A real restart request must retain the durable recovery intent. The old
  // implementation cleared it before doing any process work.
  oldUpdater.kill();
  await unlink(join(agentHome, "updater.pid"));
  await execFileAsync(process.execPath, [updaterPath.pathname], { env, timeout: 15_000 });
  const restartRequested = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(restartRequested.runtimeRecoveryPending, true);
  assert.equal(restartRequested.restarting, true);
  assert.equal(restartRequested.restartTriggered, true);
  if (process.platform !== "win32") {
    assert.equal(restartRequested.restartHandoff.mode, "posix-install-handoff");
  }
  await assert.rejects(readFile(join(agentHome, "update.lock", "owner.pid"), "utf8"), /ENOENT/);
  await assert.rejects(readFile(join(agentHome, "tick.lock", "owner.pid"), "utf8"), /ENOENT/);

  // Removing the transient status cannot hide the mismatch: the next check
  // reconstructs recovery state from the manifest, runtime markers and PIDs.
  await unlink(join(agentHome, "updater-status.json"));
  await execFileAsync(process.execPath, [updaterPath.pathname, "--once"], { env });
  const inferredAgain = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(inferredAgain.runtimeRecoveryPending, true);
  assert.equal(inferredAgain.runtimeConsistency.consistent, false);

  oldService.kill();
  oldDaemon.kill();
  oldHttp.kill();
  const past = new Date(Date.now() - 5_000);
  await Promise.all([
    utimes(join(agentHome, controlName), past, past),
    utimes(join(agentHome, "aiwb-agent-http.mjs"), past, past),
    utimes(join(agentHome, "aiwb-agent-updater.mjs"), past, past),
  ]);
  const newService = keepAlive("service");
  const newDaemon = keepAlive("daemon");
  const newHttp = keepAlive("http");
  const newUpdater = keepAlive("updater");
  await writeFile(join(agentHome, "service.pid"), `${newService.pid}\n`);
  await writeFile(join(agentHome, "daemon.pid"), `${newDaemon.pid}\n`);
  await writeFile(join(agentHome, "http.pid"), `${newHttp.pid}\n`);
  await writeFile(join(agentHome, "updater.pid"), `${newUpdater.pid}\n`);
  await writeFile(join(agentHome, "daemon.lock", "owner.pid"), `${newDaemon.pid}\n`);
  await writeFile(join(agentHome, "daemon.lock", "version"), "999\n");
  await writeFile(join(agentHome, "daemon.lock", "control.sha256"), `${sha(artifacts["/control"])}\n`);
  await writeFile(join(agentHome, "service.runtime.sha256"), `${sha(artifacts["/control"])}\n`);
  await writeFile(join(agentHome, "http.runtime.sha256"), `${sha(artifacts["/http"])}\n`);
  await writeFile(join(agentHome, "updater.runtime.sha256"), `${sha(artifacts["/updater"])}\n`);

  await execFileAsync(process.execPath, [updaterPath.pathname, "--once"], { env });
  const acknowledged = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(acknowledged.runtimeConsistency.consistent, true);
  assert.equal(acknowledged.runtimeRecoveryPending, false);
  assert.equal(acknowledged.restarting, false);
  assert.equal(acknowledged.runtimeVerified, true);
  assert.equal(acknowledged.runtimeGenerationCommitted, true);
  assert.equal(acknowledged.restartAcknowledged, true);

  // Migration from a generation-unaware install can have all three artifacts
  // and live processes already correct while the new committed marker is
  // absent. Initialize that marker under the fence without forcing another
  // runtime restart.
  await unlink(join(agentHome, "runtime.generation"));
  await execFileAsync(process.execPath, [updaterPath.pathname, "--once"], { env });
  const markerOnlyRepair = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(markerOnlyRepair.updated, false);
  assert.equal(markerOnlyRepair.runtimeConsistency.consistent, true);
  assert.equal(markerOnlyRepair.runtimeGenerationCommitted, true);
  assert.equal(markerOnlyRepair.runtimeRecoveryPending, false);
  assert.equal(markerOnlyRepair.restarting, false);
  assert.match(await readFile(join(agentHome, "runtime.generation"), "utf8"), /^state=committed$/m);
  await assert.rejects(readFile(join(agentHome, "runtime-update.fence"), "utf8"), /ENOENT/);
  process.stdout.write("agent updater runtime-generation startup recovery regression: ok\n");
} finally {
  for (const child of children) {
    try { child.kill(); } catch {}
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(testHome, { recursive: true, force: true });
}
