import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const updaterSource = new URL("../agent/runtime/aiwb-agent-updater.mjs", import.meta.url);
const testHome = await mkdtemp(join(tmpdir(), "aiwb-updater-lock-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const children = [];
let manifestRequests = 0;
let heldResponse = null;

async function waitUntil(predicate, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("timed out waiting for updater lock regression state");
}

function runUpdater(env) {
  const child = spawn(process.execPath, [updaterSource.pathname, "--once"], { env, stdio: "ignore" });
  children.push(child);
  return child;
}

function waitForExit(child, timeoutMs = 8_000) {
  return Promise.race([
    new Promise((resolve, reject) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
      child.once("error", reject);
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("updater child exit timeout")), timeoutMs)),
  ]);
}

const server = createServer((request, response) => {
  if (request.url !== "/manifest.json") return response.writeHead(404).end();
  manifestRequests += 1;
  if (manifestRequests === 1) {
    heldResponse = response;
    return;
  }
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ version: "" }));
});

try {
  await mkdir(agentHome, { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  await writeFile(join(agentHome, "updater.json"), JSON.stringify({
    manifestUrl: `http://127.0.0.1:${server.address().port}/manifest.json`,
  }));
  const env = { ...process.env, HOME: testHome, AIWB_AGENT_HOME: agentHome };

  const first = runUpdater(env);
  await waitUntil(() => manifestRequests === 1 && heldResponse);
  // Exceed the lock's acquisition-publication grace. The start-time owner
  // marker must still prevent a second process from stealing a live lock.
  await new Promise((resolve) => setTimeout(resolve, 5_200));
  const second = runUpdater(env);
  const secondExit = await waitForExit(second);
  assert.equal(secondExit.code, 0);
  assert.equal(manifestRequests, 1, "a live cross-process update lock must not be stolen after the grace period");

  heldResponse.setHeader("Content-Type", "application/json");
  heldResponse.end(JSON.stringify({ version: "" }));
  const firstExit = await waitForExit(first);
  assert.equal(firstExit.code, 0);
  await assert.rejects(readFile(join(agentHome, "update.lock", "owner.pid"), "utf8"), /ENOENT/);

  const third = runUpdater(env);
  const thirdExit = await waitForExit(third);
  assert.equal(thirdExit.code, 0);
  assert.equal(manifestRequests, 2, "the lock must be reusable after its owner exits");
  process.stdout.write("agent updater cross-process lock regression: ok\n");
} finally {
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch {}
  }
  await new Promise((resolve) => server.close(resolve));
  await rm(testHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
