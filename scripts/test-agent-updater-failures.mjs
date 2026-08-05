import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const updaterSource = new URL("../agent/runtime/aiwb-agent-updater.mjs", import.meta.url);
const roots = [];
const children = [];

async function readText(path) {
  return (await readFile(path, "utf8").catch(() => "")).trim();
}

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
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.fail("timed out waiting for updater failure regression state");
}

async function withManifest(run) {
  const server = createServer((request, response) => {
    if (request.url === "/manifest.json") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ version: "999" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/manifest.json`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function pidRuntime(component) {
  return `import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const home = process.env.AIWB_AGENT_HOME;
const path = join(home, ${JSON.stringify(`${component}.pid`)});
writeFileSync(path, String(process.pid));
const cleanup = () => {
  try { if (readFileSync(path, "utf8").trim() === String(process.pid)) unlinkSync(path); } catch {}
  process.exit(0);
};
process.once("SIGTERM", cleanup);
process.once("SIGINT", cleanup);
setInterval(() => {}, 1000);
`;
}

try {
  await withManifest(async (manifestUrl) => {
    const testHome = await mkdtemp(join(tmpdir(), "aiwb-updater-handoff-failure-"));
    roots.push(testHome);
    const agentHome = join(testHome, ".ai-workbench", "agent");
    await mkdir(agentHome, { recursive: true });
    await writeFile(join(agentHome, "updater.json"), JSON.stringify({ manifestUrl }));
    const env = { ...process.env, HOME: testHome, AIWB_AGENT_HOME: agentHome };
    await execFileAsync(process.execPath, [updaterSource.pathname, "--once"], { env });
    const failed = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
    assert.equal(failed.ok, false);
    assert.equal(failed.restarting, false);
    assert.equal(failed.restartTriggered, false);
    assert.equal(failed.restartHandoff.ok, false);
    assert.equal(failed.restartHandoff.error, "missing_http_runtime");
    assert.match(failed.error, /runtime restart handoff failed/);
    await assert.rejects(readFile(join(agentHome, "update.lock", "owner.pid"), "utf8"), /ENOENT/);
    await assert.rejects(readFile(join(agentHome, "tick.lock", "owner.pid"), "utf8"), /ENOENT/);
  });

  await withManifest(async (manifestUrl) => {
    const testHome = await mkdtemp(join(tmpdir(), "aiwb-updater-stale-pid-"));
    roots.push(testHome);
    const agentHome = join(testHome, ".ai-workbench", "agent");
    await mkdir(agentHome, { recursive: true });
    await writeFile(join(agentHome, "updater.json"), JSON.stringify({ manifestUrl }));
    await writeFile(join(agentHome, "aiwb-agent-http.mjs"), pidRuntime("http"));
    await writeFile(join(agentHome, "aiwb-agent-updater.mjs"), pidRuntime("updater"));

    const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    children.push(unrelated);
    await writeFile(join(agentHome, "http.pid"), `${unrelated.pid}\n`);
    await writeFile(join(agentHome, "updater.pid"), `${unrelated.pid}\n`);

    const env = { ...process.env, HOME: testHome, AIWB_AGENT_HOME: agentHome };
    await execFileAsync(process.execPath, [updaterSource.pathname, "--once"], { env });
    const restarted = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
    assert.equal(restarted.restartHandoff.ok, true);
    assert.equal(restarted.restartHandoff.mode, "direct-fallback");
    assert.equal(processAlive(unrelated.pid), true, "a reused stale PID must never signal an unrelated process");
    await waitUntil(async () => {
      const httpPid = Number(await readText(join(agentHome, "http.pid")));
      const updaterPid = Number(await readText(join(agentHome, "updater.pid")));
      return httpPid > 1 && updaterPid > 1 && httpPid !== unrelated.pid && updaterPid !== unrelated.pid;
    });
    for (const name of ["http.pid", "updater.pid"]) {
      const pid = Number(await readText(join(agentHome, name)));
      if (pid > 1) {
        try { process.kill(pid, "SIGTERM"); } catch {}
      }
    }
  });

  process.stdout.write("agent updater handoff failure and stale-PID regression: ok\n");
} finally {
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const root of roots) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
