import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const dataDir = await mkdtemp(join(tmpdir(), "aiwb-agent-control-"));
const port = 19_500 + Math.floor(Math.random() * 300);
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

  const publish = await fetch(`${endpoint}/v1/agent-control/publish`, {
    method: "POST",
    headers: { Authorization: "Bearer control-test-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      version: "33",
      manifestUrl: "https://example.test/agent/v33/manifest.json",
      windowsManifestUrl: "https://example.test/agent/v33/windows-manifest.json",
    }),
  });
  assert.equal(publish.status, 200);
  const updated = await (await fetch(`${endpoint}/v1/agent-control/latest`)).json();
  assert.equal(updated.agent.version, "33");
  assert.equal(updated.windowsManifestUrl, "https://example.test/agent/v33/windows-manifest.json");
  process.stdout.write("agent control regression: ok\n");
} finally {
  child.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
}
