import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const { createAgentDirectServer } = await import("../agent/runtime/aiwb-agent-http.mjs");
const server = createAgentDirectServer({
  config: { listenHost: "127.0.0.1", port: 0, accessToken: "test-token", tls: null },
  control: async () => ({ code: 0, stdout: "", stderr: "" }),
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
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
console.log("agent direct server regression: ok");
