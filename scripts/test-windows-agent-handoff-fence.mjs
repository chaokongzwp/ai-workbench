import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { windowsWorkbenchAgentScript } from "../src/core/windowsAgent.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function waitUntil(predicate, timeoutMilliseconds = 5000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("timed out waiting for Windows handoff fence state");
}

function waitForExit(child, timeoutMilliseconds = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return Promise.race([
    new Promise((resolve, reject) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
      child.once("error", reject);
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("handoff process did not exit")), timeoutMilliseconds)),
  ]);
}

async function createFixture() {
  const testHome = await mkdtemp(join(tmpdir(), "aiwb-windows-handoff-fence-"));
  const agentHome = join(testHome, ".ai-workbench", "agent");
  const controlPath = join(agentHome, "aiwb-agent.mjs");
  const httpPath = join(agentHome, "aiwb-agent-http.mjs");
  const updaterPath = join(agentHome, "aiwb-agent-updater.mjs");
  const fencePath = join(agentHome, "runtime-update.fence");
  const generationPath = join(agentHome, "runtime.generation");
  const tickLockPath = join(agentHome, "tick.lock");
  const fakeBin = join(testHome, "bin");
  const processCalls = join(testHome, "process-calls.log");
  const version = "handoff-fence-test";
  const control = windowsWorkbenchAgentScript(version);
  const http = "// handoff fence http runtime\n";
  const updater = "// handoff fence updater runtime\n";
  await mkdir(agentHome, { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await writeFile(controlPath, control);
  await writeFile(httpPath, http);
  await writeFile(updaterPath, updater);
  for (const executable of ["schtasks.exe", "taskkill.exe"]) {
    const path = join(fakeBin, executable);
    await writeFile(path, "#!/bin/sh\nprintf '%s %s\\n' \"$0\" \"$*\" >> \"$AIWB_TEST_PROCESS_CALLS\"\nexit 0\n");
    await chmod(path, 0o700);
  }
  const env = {
    ...process.env,
    HOME: testHome,
    PATH: `${fakeBin}:${process.env.PATH || ""}`,
    AIWB_AGENT_HANDOFF_FENCE_WAIT_MS: "500",
    AIWB_TEST_PROCESS_CALLS: processCalls,
  };
  const generation = (epoch) => [
    "format=1",
    "state=committed",
    `epoch=${epoch}`,
    `version=${version}`,
    `control_sha256=${sha256(control)}`,
    `http_sha256=${sha256(http)}`,
    `updater_sha256=${sha256(updater)}`,
    "",
  ].join("\n");
  const fence = (epoch, ownerPid, controlSha = sha256(control)) => [
    "format=1",
    "state=draining",
    `epoch=${epoch}`,
    `owner_pid=${ownerPid}`,
    `target_version=${version}`,
    `target_control_sha256=${controlSha}`,
    "",
  ].join("\n");
  const writeTickLock = async (ownerPid) => {
    await mkdir(tickLockPath, { recursive: true });
    await writeFile(join(tickLockPath, "owner.pid"), `${ownerPid}\n`);
    await writeFile(join(tickLockPath, "owner.token"), "updater-owner-token\n");
    await writeFile(join(tickLockPath, "started_at"), `${new Date().toISOString()}\n`);
  };
  return {
    testHome,
    agentHome,
    controlPath,
    fencePath,
    generationPath,
    tickLockPath,
    processCalls,
    env,
    generation,
    fence,
    writeTickLock,
  };
}

function startHandoff(fixture) {
  const child = spawn(process.execPath, [fixture.controlPath, "install-service-handoff"], {
    env: fixture.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  return { child, output: () => output };
}

async function serviceStopWasRequested(fixture) {
  const calls = await readFile(fixture.processCalls, "utf8").catch(() => "");
  return /schtasks\.exe \/End \/TN AI Workbench Agent(?:\r?\n|$)/i.test(calls);
}

test("Windows handoff waits for a live updater to release its committed drain fence", async () => {
  const fixture = await createFixture();
  const owner = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  let handoff;
  try {
    const epoch = "live-owner-committed";
    await writeFile(fixture.generationPath, fixture.generation(epoch));
    await writeFile(fixture.fencePath, fixture.fence(epoch, owner.pid));
    await fixture.writeTickLock(owner.pid);
    handoff = startHandoff(fixture);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(await serviceStopWasRequested(fixture), false, "handoff must not pass a live updater fence");

    // This is the updater's normal finally order: fence, then tick.lock.
    await unlink(fixture.fencePath);
    await rm(fixture.tickLockPath, { recursive: true, force: true });
    owner.kill("SIGTERM");
    await waitForExit(owner);
    await waitUntil(() => serviceStopWasRequested(fixture));
    assert.doesNotMatch(handoff.output(), /__AIWB_AGENT_INSTALL_FENCE_RECOVERED__1/);
  } finally {
    try { owner.kill("SIGTERM"); } catch {}
    try { handoff?.child.kill("SIGTERM"); } catch {}
    if (handoff) await waitForExit(handoff.child).catch(() => {});
    await rm(fixture.testHome, { recursive: true, force: true });
  }
});

test("Windows handoff recovers only a dead owner's exactly committed drain fence", async () => {
  const fixture = await createFixture();
  const exitedOwner = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await waitForExit(exitedOwner);
  let handoff;
  try {
    const epoch = "dead-owner-committed";
    await writeFile(fixture.generationPath, fixture.generation(epoch));
    await writeFile(fixture.fencePath, fixture.fence(epoch, exitedOwner.pid));
    await fixture.writeTickLock(exitedOwner.pid);
    handoff = startHandoff(fixture);
    await waitUntil(() => serviceStopWasRequested(fixture));
    await waitUntil(() => /__AIWB_AGENT_INSTALL_FENCE_RECOVERED__1/.test(handoff.output()));
    await waitUntil(async () => {
      try {
        await readFile(fixture.fencePath, "utf8");
        return false;
      } catch (error) {
        if (error?.code === "ENOENT") return true;
        throw error;
      }
    });
  } finally {
    try { handoff?.child.kill("SIGTERM"); } catch {}
    if (handoff) await waitForExit(handoff.child).catch(() => {});
    await rm(fixture.testHome, { recursive: true, force: true });
  }
});

test("Windows handoff never clears a mismatched dead fence or a timed-out live fence", async () => {
  const deadFixture = await createFixture();
  const exitedOwner = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await waitForExit(exitedOwner);
  try {
    await writeFile(deadFixture.generationPath, deadFixture.generation("different-epoch"));
    const deadFence = deadFixture.fence("dead-owner-uncommitted", exitedOwner.pid);
    await writeFile(deadFixture.fencePath, deadFence);
    await deadFixture.writeTickLock(exitedOwner.pid);
    const rejected = spawnSync(process.execPath, [deadFixture.controlPath, "install-service-handoff"], {
      encoding: "utf8",
      env: deadFixture.env,
      timeout: 5000,
    });
    assert.equal(rejected.status, 22, rejected.stderr || rejected.stdout);
    assert.match(rejected.stdout, /__AIWB_AGENT_INSTALL_DEFER_REASON__runtime_update_fence_busy/);
    assert.equal(await readFile(deadFixture.fencePath, "utf8"), deadFence);
    assert.equal(await serviceStopWasRequested(deadFixture), false);
  } finally {
    await rm(deadFixture.testHome, { recursive: true, force: true });
  }

  const liveFixture = await createFixture();
  const liveOwner = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  try {
    const epoch = "live-owner-timeout";
    await writeFile(liveFixture.generationPath, liveFixture.generation(epoch));
    const liveFence = liveFixture.fence(epoch, liveOwner.pid);
    await writeFile(liveFixture.fencePath, liveFence);
    await liveFixture.writeTickLock(liveOwner.pid);
    const rejected = spawnSync(process.execPath, [liveFixture.controlPath, "install-service-handoff"], {
      encoding: "utf8",
      env: liveFixture.env,
      timeout: 5000,
    });
    assert.equal(rejected.status, 22, rejected.stderr || rejected.stdout);
    assert.match(rejected.stdout, /__AIWB_AGENT_INSTALL_DEFER_REASON__runtime_update_fence_busy/);
    assert.equal(await readFile(liveFixture.fencePath, "utf8"), liveFence);
    assert.equal(await serviceStopWasRequested(liveFixture), false);
  } finally {
    liveOwner.kill("SIGTERM");
    await waitForExit(liveOwner).catch(() => {});
    await rm(liveFixture.testHome, { recursive: true, force: true });
  }
});
