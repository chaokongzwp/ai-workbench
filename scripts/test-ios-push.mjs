import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  buildWorkbenchAgentCreateCommand,
  latestWorkbenchAgentVersion,
  workbenchAgentScript,
} from "../src/core/agent.js";
import { windowsWorkbenchAgentScript } from "../src/core/windowsAgent.js";

const repoRoot = new URL("../", import.meta.url).pathname;

async function waitForHealth(endpoint, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Push 测试服务提前退出：${child.exitCode}`);
    try {
      const response = await fetch(`${endpoint}/health`);
      if (response.ok) return response.json();
    } catch {
      // The temporary server may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Push 测试服务启动超时。");
}

test("latest Agent contains terminal Push callbacks", () => {
  assert.ok(Number(latestWorkbenchAgentVersion) >= 1);
  const linux = workbenchAgentScript();
  const windows = windowsWorkbenchAgentScript(latestWorkbenchAgentVersion);
  for (const source of [linux, windows]) {
    assert.match(source, /push_notify_url/);
    assert.match(source, /push_notify_token/);
    assert.match(source, /push_notified_at/);
    assert.match(source, /done/);
    assert.match(source, /cancelled/);
  }
});

test("Agent create command stores one-time Push ticket metadata", () => {
  const command = buildWorkbenchAgentCreateCommand(
    {
      serverType: "linux",
      username: "root",
      workdir: "/opt/project",
    },
    "task-test-push",
    "printf done",
    {
      conversationId: "conversation-test",
      pushNotifyUrl: "https://example.test/v1/push/tickets/push-test/complete",
      pushNotifyToken: "one-time-secret",
    },
  );
  assert.match(command, /push_notify_url/);
  assert.match(command, /push_notify_token/);
  assert.match(command, /one-time-secret/);
});

test("Push gateway registers a device and issues an authenticated ticket", async (context) => {
  const dataDir = await mkdtemp(join(tmpdir(), "aiwb-push-test-"));
  const port = 30_000 + Math.floor(Math.random() * 20_000);
  const endpoint = `http://127.0.0.1:${port}`;
  const child = spawn("python3", ["services/config-sync/aiwb_config_sync.py"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AIWB_CONFIG_SYNC_DATA_DIR: dataDir,
      AIWB_CONFIG_SYNC_HOST: "127.0.0.1",
      AIWB_CONFIG_SYNC_PORT: String(port),
    },
    stdio: "ignore",
  });
  context.after(async () => {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1_500)),
    ]);
    await rm(dataDir, { recursive: true, force: true });
  });

  const health = await waitForHealth(endpoint, child);
  assert.equal(health.version, 6);
  assert.deepEqual(health.push, { platforms: ["ios"], ready: false });

  const registrationResponse = await fetch(`${endpoint}/v1/push/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      installationId: "ios-test-installation-1234",
      deviceToken: "a".repeat(64),
      deviceName: "Test iPhone",
      platform: "ios",
    }),
  });
  assert.equal(registrationResponse.status, 200);
  const registration = await registrationResponse.json();
  assert.equal(registration.ok, true);
  assert.ok(registration.deviceSecret);

  const ticketResponse = await fetch(`${endpoint}/v1/push/tickets`, {
    method: "POST",
    headers: {
      Authorization: `Device ${registration.installationId}:${registration.deviceSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      taskId: "task-test-1",
      conversationId: "conversation-test-1",
      conversationName: "测试会话",
      agentId: "claude",
    }),
  });
  assert.equal(ticketResponse.status, 200);
  const ticket = await ticketResponse.json();
  assert.equal(ticket.ok, true);
  assert.ok(ticket.notifyPath);
  assert.ok(ticket.notifyToken);

  const unauthorised = await fetch(`${endpoint}${ticket.notifyPath}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer wrong-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(unauthorised.status, 401);

  const completion = await fetch(`${endpoint}${ticket.notifyPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ticket.notifyToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(completion.status, 503);
  assert.equal((await completion.json()).reason, "apns_not_configured");
});
