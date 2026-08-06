import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const updaterSource = new URL("../agent/runtime/aiwb-agent-updater.mjs", import.meta.url);
const testHome = await mkdtemp(join(tmpdir(), "aiwb-updater-fence-owner-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const controlName = process.platform === "win32" ? "aiwb-agent.mjs" : "aiwbctl";
const fencePath = join(agentHome, "runtime-update.fence");
const generationPath = join(agentHome, "runtime.generation");
const control = "fence-owner-control\n";
const http = "fence-owner-http\n";
const updater = "fence-owner-updater\n";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const epoch = "committed-owner-epoch";
const generation = [
  "format=1",
  "state=committed",
  `epoch=${epoch}`,
  "version=fence-owner-test",
  `control_sha256=${sha256(control)}`,
  `http_sha256=${sha256(http)}`,
  `updater_sha256=${sha256(updater)}`,
  "",
].join("\n");
const fence = (ownerPid, { state = "draining", targetEpoch = epoch } = {}) => [
  "format=1",
  `state=${state}`,
  `epoch=${targetEpoch}`,
  `owner_pid=${ownerPid}`,
  "target_version=fence-owner-test",
  `target_control_sha256=${sha256(control)}`,
  "",
].join("\n");
const runUpdater = () => execFileAsync(process.execPath, [updaterSource.pathname, "--once"], {
  env: { ...process.env, HOME: testHome, AIWB_AGENT_HOME: agentHome },
});
const waitForExit = (child) => new Promise((resolve, reject) => {
  if (child.exitCode !== null || child.signalCode !== null) return resolve();
  child.once("exit", resolve);
  child.once("error", reject);
});

const owner = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
try {
  await mkdir(agentHome, { recursive: true });
  await writeFile(join(agentHome, controlName), control);
  await writeFile(join(agentHome, "aiwb-agent-http.mjs"), http);
  await writeFile(join(agentHome, "aiwb-agent-updater.mjs"), updater);
  await writeFile(generationPath, generation);

  const liveFence = fence(owner.pid);
  await writeFile(fencePath, liveFence);
  await runUpdater();
  assert.equal(await readFile(fencePath, "utf8"), liveFence, "a live updater owner must remain authoritative after commit");

  owner.kill("SIGTERM");
  await waitForExit(owner);
  await runUpdater();
  await assert.rejects(readFile(fencePath, "utf8"), /ENOENT/, "a dead owner's exactly committed fence should be recovered");

  const mismatchedFence = fence(owner.pid, { targetEpoch: "different-epoch" });
  await writeFile(fencePath, mismatchedFence);
  await runUpdater();
  assert.equal(await readFile(fencePath, "utf8"), mismatchedFence, "a dead but mismatched fence must never be cleared");

  const nonDrainingFence = fence(owner.pid, { state: "service-install" });
  await writeFile(fencePath, nonDrainingFence);
  await runUpdater();
  assert.equal(await readFile(fencePath, "utf8"), nonDrainingFence, "only updater draining fences are recoverable");

  process.stdout.write("agent updater fence ownership regression: ok\n");
} finally {
  try { owner.kill("SIGTERM"); } catch {}
  await rm(testHome, { recursive: true, force: true });
}
