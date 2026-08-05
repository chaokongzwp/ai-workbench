import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const dataDir = await mkdtemp(join(tmpdir(), "aiwb-agent-control-"));
const port = 30_000 + Math.floor(Math.random() * 20_000);
const endpoint = `http://127.0.0.1:${port}`;
const child = spawn("python3", ["services/config-sync/aiwb_config_sync.py"], {
  cwd: root,
  env: {
    ...process.env,
    AIWB_CONFIG_SYNC_DATA_DIR: dataDir,
    AIWB_CONFIG_SYNC_HOST: "127.0.0.1",
    AIWB_CONFIG_SYNC_PORT: String(port),
    AIWB_AGENT_CONTROL_ADMIN_TOKEN: "control-test-token",
    AIWB_AGENT_CONTROL_PUBLIC_BASE_URL: `${endpoint}/v1/agent-control`,
  },
  stdio: "ignore",
});

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${endpoint}/health`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const initial = await (await fetch(`${endpoint}/v1/agent-control/latest`)).json();
  assert.equal(initial.ok, true);
  assert.equal(initial.agent.source, "unpublished");
  assert.equal(initial.manifestUrl, "");
  assert.deepEqual(initial.platforms, {});

  let updateRequest = null;
  const callbackServer = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/v1/control/update") {
      let raw = "";
      request.on("data", (chunk) => (raw += chunk));
      request.on("end", () => {
        updateRequest = { token: request.headers["x-aiwb-agent-update-token"], body: JSON.parse(raw) };
        response.writeHead(202, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, accepted: true }));
      });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => callbackServer.listen(0, "127.0.0.1", resolve));
  const callbackAddress = callbackServer.address();
  const registration = await fetch(`${endpoint}/v1/agent-control/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: "agent-control-test-0001",
      updateToken: "control-test-token-0123456789",
      endpoint: `http://127.0.0.1:${callbackAddress.port}`,
      version: "32",
      diskVersion: "32",
      platform: "linux",
      hostname: "test-host",
      generationReady: true,
      runningRuntimeSha256: "d".repeat(64),
      diskRuntimeSha256: "d".repeat(64),
    }),
  });
  assert.equal(registration.status, 200);

  const linuxScript = Buffer.from("test linux agent\n");
  const macosScript = Buffer.from("test macos agent\n");
  const windowsScript = Buffer.from("test windows agent\n");
  const directRuntime = Buffer.from("test direct runtime\n");
  const updaterRuntime = Buffer.from("test updater runtime\n");
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const runtimeManifest = {
    directRuntime: { url: "https://old.example/direct", sha256: digest(directRuntime) },
    updaterRuntime: { url: "https://old.example/updater", sha256: digest(updaterRuntime) },
  };
  const publish = await fetch(`${endpoint}/v1/agent-control/publish`, {
    method: "POST",
    headers: { Authorization: "Bearer control-test-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      version: "53",
      manifests: {
        linux: {
          version: "53",
          platform: "linux",
          sha256: digest(linuxScript),
          scriptUrl: "https://old.example/linux/aiwbctl",
          ...runtimeManifest,
        },
        macos: {
          version: "53",
          platform: "macos",
          sha256: digest(macosScript),
          scriptUrl: "https://old.example/macos/aiwbctl",
          ...runtimeManifest,
        },
        windows: {
          version: "53",
          platform: "windows",
          sha256: digest(windowsScript),
          scriptUrl: "https://old.example/windows/aiwb-agent.mjs",
          ...runtimeManifest,
        },
      },
      artifacts: {
        "linux/aiwbctl": linuxScript.toString("base64"),
        "macos/aiwbctl": macosScript.toString("base64"),
        "windows/aiwb-agent.mjs": windowsScript.toString("base64"),
        "common/aiwb-agent-http.mjs": directRuntime.toString("base64"),
        "common/aiwb-agent-updater.mjs": updaterRuntime.toString("base64"),
      },
    }),
  });
  assert.equal(publish.status, 200);
  const updated = await (await fetch(`${endpoint}/v1/agent-control/latest`)).json();
  assert.equal(updated.agent.version, "53");
  assert.equal(updated.agent.source, "config-center");
  assert.equal(updated.linuxManifestUrl, `${endpoint}/v1/agent-control/releases/v53/linux/manifest.json`);
  assert.equal(updated.macosManifestUrl, `${endpoint}/v1/agent-control/releases/v53/macos/manifest.json`);
  assert.equal(updated.windowsManifestUrl, `${endpoint}/v1/agent-control/releases/v53/windows/manifest.json`);
  assert.equal(updated.manifestUrl, updated.linuxManifestUrl);
  assert.equal(updated.platforms.macos.manifestUrl, updated.macosManifestUrl);
  const hostedWindowsManifest = await (await fetch(updated.windowsManifestUrl)).json();
  assert.equal(hostedWindowsManifest.source, "config-center");
  assert.equal(hostedWindowsManifest.platform, "windows");
  assert.equal(hostedWindowsManifest.scriptUrl, `${endpoint}/v1/agent-control/releases/v53/windows/aiwb-agent.mjs`);
  assert.deepEqual(
    Buffer.from(await (await fetch(`${endpoint}/v1/agent-control/download/windows`)).arrayBuffer()),
    windowsScript,
  );
  assert.deepEqual(
    Buffer.from(await (await fetch(`${endpoint}/v1/agent-control/download/linux`)).arrayBuffer()),
    linuxScript,
  );
  assert.deepEqual(
    Buffer.from(await (await fetch(`${endpoint}/v1/agent-control/download/macos`)).arrayBuffer()),
    macosScript,
  );
  const conflictingPublish = await fetch(`${endpoint}/v1/agent-control/publish`, {
    method: "POST",
    headers: { Authorization: "Bearer control-test-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      version: "53",
      manifests: {
        linux: { ...JSON.parse(JSON.stringify((await (await fetch(updated.linuxManifestUrl)).json()))), sha256: digest(Buffer.from("changed")) },
        macos: await (await fetch(updated.macosManifestUrl)).json(),
        windows: hostedWindowsManifest,
      },
      artifacts: {
        "linux/aiwbctl": Buffer.from("changed").toString("base64"),
        "macos/aiwbctl": macosScript.toString("base64"),
        "windows/aiwb-agent.mjs": windowsScript.toString("base64"),
        "common/aiwb-agent-http.mjs": directRuntime.toString("base64"),
        "common/aiwb-agent-updater.mjs": updaterRuntime.toString("base64"),
      },
    }),
  });
  assert.equal(conflictingPublish.status, 400);
  for (let attempt = 0; attempt < 40 && !updateRequest; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(updateRequest, { token: "control-test-token-0123456789", body: { version: "53" } });

  // A disk version is not an effective running version. Legacy HTTP runtimes
  // used to register the newly downloaded control version while continuing to
  // run the old process generation, which made the control plane stop repairing.
  updateRequest = null;
  const staleGeneration = await fetch(`${endpoint}/v1/agent-control/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: "agent-control-test-0001",
      updateToken: "control-test-token-0123456789",
      endpoint: `http://127.0.0.1:${callbackAddress.port}`,
      version: "53",
      diskVersion: "53",
      platform: "darwin",
      hostname: "test-host",
      generationReady: false,
      runningRuntimeSha256: "a".repeat(64),
      diskRuntimeSha256: "b".repeat(64),
    }),
  });
  const staleGenerationResult = await staleGeneration.json();
  assert.equal(staleGenerationResult.updateRequired, false);
  assert.equal(staleGenerationResult.needsRepair, true);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(updateRequest, null, "v53 generation repair must stay gated during config-service-first migration");

  updateRequest = null;
  const convergedGeneration = await fetch(`${endpoint}/v1/agent-control/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: "agent-control-test-0001",
      updateToken: "control-test-token-0123456789",
      endpoint: `http://127.0.0.1:${callbackAddress.port}`,
      version: "53",
      diskVersion: "53",
      platform: "macos",
      hostname: "test-host",
      generationReady: true,
      runningRuntimeSha256: "c".repeat(64),
      diskRuntimeSha256: "c".repeat(64),
    }),
  });
  const convergedGenerationResult = await convergedGeneration.json();
  assert.equal(convergedGenerationResult.updateRequired, false);
  assert.equal(convergedGenerationResult.generationReady, true);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(updateRequest, null);

  const publish54 = await fetch(`${endpoint}/v1/agent-control/publish`, {
    method: "POST",
    headers: { Authorization: "Bearer control-test-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      version: "54",
      manifests: Object.fromEntries(["linux", "macos", "windows"].map((platform) => [platform, {
        version: "54",
        platform,
        sha256: digest(platform === "linux" ? linuxScript : platform === "macos" ? macosScript : windowsScript),
        scriptUrl: `https://old.example/${platform}/agent`,
        ...runtimeManifest,
      }])),
      artifacts: {
        "linux/aiwbctl": linuxScript.toString("base64"),
        "macos/aiwbctl": macosScript.toString("base64"),
        "windows/aiwb-agent.mjs": windowsScript.toString("base64"),
        "common/aiwb-agent-http.mjs": directRuntime.toString("base64"),
        "common/aiwb-agent-updater.mjs": updaterRuntime.toString("base64"),
      },
    }),
  });
  assert.equal(publish54.status, 200);
  for (let attempt = 0; attempt < 40 && !updateRequest; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(updateRequest, { token: "control-test-token-0123456789", body: { version: "54" } });

  // v54 enables same-version generation repair, but a generation-unaware
  // client must never receive a proactive callback (old HTTP restarts without
  // draining active tasks). It converges through its periodic updater instead.
  updateRequest = null;
  const stale54 = await fetch(`${endpoint}/v1/agent-control/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: "agent-control-test-0001",
      updateToken: "control-test-token-0123456789",
      endpoint: `http://127.0.0.1:${callbackAddress.port}`,
      version: "54",
      diskVersion: "54",
      platform: "macos",
      hostname: "test-host",
      generationReady: false,
      runningRuntimeSha256: "a".repeat(64),
      diskRuntimeSha256: "b".repeat(64),
    }),
  });
  const stale54Result = await stale54.json();
  assert.equal(stale54Result.updateRequired, true);
  assert.equal(stale54Result.needsRepair, true);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(updateRequest, null, "generationReady=false clients must not receive proactive update callbacks");

  const converged54 = await fetch(`${endpoint}/v1/agent-control/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: "agent-control-test-0001",
      updateToken: "control-test-token-0123456789",
      endpoint: `http://127.0.0.1:${callbackAddress.port}`,
      version: "54",
      diskVersion: "54",
      platform: "macos",
      hostname: "test-host",
      generationReady: true,
      runningRuntimeSha256: "e".repeat(64),
      diskRuntimeSha256: "e".repeat(64),
    }),
  });
  const converged54Result = await converged54.json();
  assert.equal(converged54Result.updateRequired, false);
  assert.equal(converged54Result.generationReady, true);
  callbackServer.close();
  process.stdout.write("agent control regression: ok\n");
} finally {
  child.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
}
