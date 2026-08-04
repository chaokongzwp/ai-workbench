import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
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
  assert.match(initial.manifestUrl, /^https:\/\//);

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
      platform: "linux",
      hostname: "test-host",
    }),
  });
  assert.equal(registration.status, 200);

  const publish = await fetch(`${endpoint}/v1/agent-control/publish`, {
    method: "POST",
    headers: { Authorization: "Bearer control-test-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      version: "37",
      manifestUrl: "https://example.test/agent/v37/manifest.json",
      windowsManifestUrl: "https://example.test/agent/v37/windows-manifest.json",
    }),
  });
  assert.equal(publish.status, 200);
  const updated = await (await fetch(`${endpoint}/v1/agent-control/latest`)).json();
  assert.equal(updated.agent.version, "37");
  assert.equal(updated.windowsManifestUrl, "https://example.test/agent/v37/windows-manifest.json");
  for (let attempt = 0; attempt < 40 && !updateRequest; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(updateRequest, { token: "control-test-token-0123456789", body: { version: "37" } });
  callbackServer.close();
  process.stdout.write("agent control regression: ok\n");
} finally {
  child.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
}
