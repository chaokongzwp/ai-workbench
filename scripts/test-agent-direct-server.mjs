import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
const home = mkdtempSync(join(tmpdir(), "aiwb-agent-http-"));
const taskDir = join(home, "tasks", "task-1");
mkdirSync(taskDir, { recursive: true });
for (const [name, value] of Object.entries({
  status: "done",
  conversation_id: "conversation-1",
  agent_id: "codex",
  "output.log": "done result",
})) writeFileSync(join(taskDir, name), value);

process.env.AIWB_AGENT_HOME = home;
const { createAgentDirectServer, loadAgentDirectConfig, startAgentDirectServer } = await import("../agent/runtime/aiwb-agent-http.mjs");
const defaultConfig = loadAgentDirectConfig();
assert.equal(defaultConfig.securityVersion, 1);
assert.equal(defaultConfig.tls.enabled, true);
assert.match(defaultConfig.tls.fingerprint, /^sha256\/[A-Za-z0-9+/=]+$/);
const server = createAgentDirectServer({
  config: { listenHost: "127.0.0.1", port: 0, accessToken: "test-token", tls: null },
  control: async () => ({ code: 0, stdout: "__AIWB_AGENT_VERSION__41", stderr: "" }),
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const healthResponse = await fetch(`${baseUrl}/v1/health`, { headers: { Authorization: "Bearer test-token" } });
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.version, "41");
assert.equal(health.protocolVersion, 1);
assert.equal(health.transport, "https");
const response = await fetch(`${baseUrl}/v1/tasks/task-1`, { headers: { Authorization: "Bearer test-token" } });
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.task.status, "completed");
assert.equal(payload.task.outcome, "success");
assert.equal(payload.task.output, "done result");

const created = await fetch(`${baseUrl}/v1/tasks`, {
  method: "POST",
  headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
  body: JSON.stringify({
    taskId: "task-linux-command",
    conversationId: "conversation-1",
    command: "printf agent-direct-probe",
  }),
});
assert.equal(created.status, 202);
assert.equal(
  Buffer.from(readFileSync(join(home, "tasks", "task-linux-command", "command.b64"), "utf8").trim(), "base64").toString("utf8"),
  "printf agent-direct-probe",
);

const latest = await fetch(`${baseUrl}/v1/conversations/conversation-1/latest-task`, { headers: { Authorization: "Bearer test-token" } });
assert.equal((await latest.json()).task.id, "task-linux-command");
server.close();

let registration = null;
const controlPlane = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    registration = { method: request.method, path: request.url, body: JSON.parse(body) };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
});
await new Promise((resolve) => controlPlane.listen(0, "127.0.0.1", resolve));
const controlAddress = controlPlane.address();
writeFileSync(join(home, "updater.json"), JSON.stringify({
  controlEndpoint: `http://127.0.0.1:${controlAddress.port}/v1/agent-control`,
  advertisedEndpoint: "http://127.0.0.1:8787",
}));
const registeredServer = await startAgentDirectServer({
  config: { listenHost: "127.0.0.1", port: 0, accessToken: "test-token", tls: null },
  control: async () => ({ code: 0, stdout: "__AIWB_AGENT_VERSION__37\n", stderr: "" }),
});
for (let attempt = 0; attempt < 40 && !registration; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
assert.equal(registration?.method, "POST");
assert.equal(registration?.path, "/v1/agent-control/register");
assert.equal(registration?.body?.endpoint, "http://127.0.0.1:8787");
assert.equal(registration?.body?.version, "37");
assert.match(registration?.body?.agentId || "", /^agent-/);
assert.match(registration?.body?.updateToken || "", /^[A-Za-z0-9_-]{24,}$/);
await new Promise((resolve) => registeredServer.close(resolve));
controlPlane.close();
console.log("agent direct server regression: ok");
