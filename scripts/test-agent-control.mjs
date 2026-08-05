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

  const linuxScript = Buffer.from("test linux agent\n");
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
      version: "37",
      manifest: { version: "37", sha256: digest(linuxScript), scriptUrl: "https://old.example/aiwbctl", ...runtimeManifest },
      windowsManifest: {
        version: "37",
        sha256: digest(windowsScript),
        scriptUrl: "https://old.example/aiwb-agent.mjs",
        ...runtimeManifest,
      },
      artifacts: {
        aiwbctl: linuxScript.toString("base64"),
        "aiwb-agent.mjs": windowsScript.toString("base64"),
        "aiwb-agent-http.mjs": directRuntime.toString("base64"),
        "aiwb-agent-updater.mjs": updaterRuntime.toString("base64"),
      },
    }),
  });
  assert.equal(publish.status, 200);
  const updated = await (await fetch(`${endpoint}/v1/agent-control/latest`)).json();
  assert.equal(updated.agent.version, "37");
  assert.equal(updated.agent.source, "config-center");
  assert.equal(updated.windowsManifestUrl, `${endpoint}/v1/agent-control/releases/v37/windows-manifest.json`);
  const hostedWindowsManifest = await (await fetch(updated.windowsManifestUrl)).json();
  assert.equal(hostedWindowsManifest.source, "config-center");
  assert.equal(hostedWindowsManifest.scriptUrl, `${endpoint}/v1/agent-control/releases/v37/aiwb-agent.mjs`);
  assert.deepEqual(
    Buffer.from(await (await fetch(`${endpoint}/v1/agent-control/download/windows`)).arrayBuffer()),
    windowsScript,
  );
  assert.deepEqual(
    Buffer.from(await (await fetch(`${endpoint}/v1/agent-control/download/linux`)).arrayBuffer()),
    linuxScript,
  );
  for (let attempt = 0; attempt < 40 && !updateRequest; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(updateRequest, { token: "control-test-token-0123456789", body: { version: "37" } });
  callbackServer.close();
  process.stdout.write("agent control regression: ok\n");
} finally {
  child.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
}
