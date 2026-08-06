import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
const home = mkdtempSync(join(tmpdir(), "aiwb-agent-http-"));
const taskDir = join(home, "tasks", "task-1");
const staleTaskDir = join(home, "tasks", "task-stale");
mkdirSync(taskDir, { recursive: true });
mkdirSync(staleTaskDir, { recursive: true });
for (const [name, value] of Object.entries({
  status: "done",
  conversation_id: "conversation-1",
  agent_id: "codex",
  "output.log": "done result",
})) writeFileSync(join(taskDir, name), value);
for (const [name, value] of Object.entries({
  status: "running",
  conversation_id: "conversation-stale",
  agent_id: "codex",
})) writeFileSync(join(staleTaskDir, name), value);

process.env.AIWB_AGENT_HOME = home;
const { createAgentDirectServer, loadAgentDirectConfig, startAgentDirectServer } = await import("../agent/runtime/aiwb-agent-http.mjs");
const defaultConfig = loadAgentDirectConfig();
assert.equal(defaultConfig.securityVersion, 1);
assert.equal(defaultConfig.tls.enabled, true);
assert.match(defaultConfig.tls.fingerprint, /^sha256\/[A-Za-z0-9+/=]+$/);
const controlCalls = [];
const server = createAgentDirectServer({
  config: { listenHost: "127.0.0.1", port: 0, accessToken: "test-token", tls: null },
  control: async (args) => {
    controlCalls.push(args);
    if (args?.[0] === "create" && args?.[1] === "task-context-required") {
      return {
        code: 42,
        stdout: [
          "__AIWB_AGENT_STATUS__error",
          "__AIWB_AGENT_ERROR_CODE__execution_context_required",
          "__AIWB_AGENT_ERROR__macOS task creation requires SSH context.",
        ].join("\n"),
        stderr: "",
      };
    }
    if (args?.[0] === "status" && args?.[1] === "task-stale") {
      writeFileSync(join(staleTaskDir, "status"), "error");
      writeFileSync(join(staleTaskDir, "exit_code"), "124");
    }
    return { code: 0, stdout: "__AIWB_AGENT_VERSION__42", stderr: "" };
  },
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const eventSocket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/events`, ["aiwb.v1", "bearer.test-token"]);
const firstAgentEvent = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Agent WebSocket did not publish a ready event.")), 5_000);
  eventSocket.addEventListener("message", (event) => {
    clearTimeout(timer);
    resolve(JSON.parse(String(event.data || "{}")));
  }, { once: true });
  eventSocket.addEventListener("error", (event) => {
    clearTimeout(timer);
    reject(event.error || new Error("Agent WebSocket connection failed."));
  }, { once: true });
});
assert.equal(firstAgentEvent.type, "connection.ready");
const waitForAgentEvent = (predicate) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    eventSocket.removeEventListener("message", listener);
    reject(new Error("Agent WebSocket task event timed out."));
  }, 5_000);
  const listener = (event) => {
    const payload = JSON.parse(String(event.data || "{}"));
    if (!predicate(payload)) return;
    clearTimeout(timer);
    eventSocket.removeEventListener("message", listener);
    resolve(payload);
  };
  eventSocket.addEventListener("message", listener);
});
const pushedTaskDir = join(home, "tasks", "task-pushed");
const runningPush = waitForAgentEvent((event) => event.type === "task.updated" && event.task?.id === "task-pushed");
mkdirSync(pushedTaskDir, { recursive: true });
writeFileSync(join(pushedTaskDir, "status"), "running");
writeFileSync(join(pushedTaskDir, "output.log"), "live output");
assert.equal((await runningPush).task.rawStatus, "running");
const terminalPush = waitForAgentEvent(
  (event) => event.type === "task.updated" && event.task?.id === "task-pushed" && event.task?.rawStatus === "done",
);
const largeFinalOutput = "x".repeat(70_000);
writeFileSync(join(pushedTaskDir, "output.log"), largeFinalOutput);
writeFileSync(join(pushedTaskDir, "status"), "done");
const terminalEvent = await terminalPush;
assert.equal(terminalEvent.task.output.length, largeFinalOutput.length);
const websocketTaskRequest = {
  taskId: "task-websocket-command",
  conversationId: "conversation-websocket",
  command: "printf websocket-agent-direct-probe",
};
const acceptedTask = waitForAgentEvent(
  (event) => event.type === "task.accepted" && event.requestId === "request-create-1",
);
eventSocket.send(JSON.stringify({
  type: "task.create",
  requestId: "request-create-1",
  task: websocketTaskRequest,
}));
const acceptedEvent = await acceptedTask;
assert.equal(acceptedEvent.task.id, "task-websocket-command");
assert.equal(acceptedEvent.idempotent, false);
assert.equal(
  Buffer.from(readFileSync(join(home, "tasks", "task-websocket-command", "command.b64"), "utf8").trim(), "base64").toString("utf8"),
  "printf websocket-agent-direct-probe",
);
const idempotentFallback = await fetch(`${baseUrl}/v1/tasks`, {
  method: "POST",
  headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
  body: JSON.stringify(websocketTaskRequest),
});
assert.equal(idempotentFallback.status, 200);
assert.equal((await idempotentFallback.json()).idempotent, true);
assert.equal(
  controlCalls.filter((args) => args?.[0] === "create" && args?.[1] === "task-websocket-command").length,
  1,
);
await new Promise((resolve, reject) => {
  if (eventSocket.readyState === WebSocket.CLOSED) {
    resolve();
    return;
  }
  const timer = setTimeout(() => reject(new Error("Agent WebSocket did not close cleanly.")), 5_000);
  eventSocket.addEventListener("close", () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
  eventSocket.close();
});
const healthResponse = await fetch(`${baseUrl}/v1/health`, { headers: { Authorization: "Bearer test-token" } });
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.version, "42");
assert.equal(health.protocolVersion, 2);
assert.ok(health.capabilities.includes("binary-upload-v1"));
assert.ok(health.capabilities.includes("events-v1"));
assert.ok(health.capabilities.includes("task-create-events-v1"));
assert.equal(health.transport, "https");
const response = await fetch(`${baseUrl}/v1/tasks/task-1`, { headers: { Authorization: "Bearer test-token" } });
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.task.status, "completed");
assert.equal(payload.task.outcome, "success");
assert.equal(payload.task.output, "done result");

const staleResponse = await fetch(`${baseUrl}/v1/tasks/task-stale`, { headers: { Authorization: "Bearer test-token" } });
const stalePayload = await staleResponse.json();
assert.equal(stalePayload.task.rawStatus, "error");
assert.equal(stalePayload.task.outcome, "error");
assert.equal(controlCalls.some((args) => args?.[0] === "status" && args?.[1] === "task-stale"), true);

const cacheClearResponse = await fetch(`${baseUrl}/v1/cache/clear`, {
  method: "POST",
  headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(cacheClearResponse.status, 200);
assert.equal((await cacheClearResponse.json()).ok, true);

const workspace = join(home, "workspace");
mkdirSync(workspace, { recursive: true });
const uploadBody = Buffer.alloc(2 * 1024 * 1024 + 137, 0x5a);
const uploadSha256 = createHash("sha256").update(uploadBody).digest("hex");
const encodedHeader = (value) => Buffer.from(value, "utf8").toString("base64url");
const uploadedResponse = await fetch(`${baseUrl}/v1/files`, {
  method: "POST",
  headers: {
    Authorization: "Bearer test-token",
    "Content-Type": "application/octet-stream",
    "X-AIWB-Upload-Id": "upload-large-1",
    "X-AIWB-Workdir": encodedHeader(workspace),
    "X-AIWB-File-Name": encodedHeader("数据 原型.html"),
    "X-AIWB-File-Mime": "text/html",
    "X-AIWB-Content-SHA256": uploadSha256,
  },
  body: uploadBody,
});
assert.equal(uploadedResponse.status, 201);
const uploadedFile = (await uploadedResponse.json()).file;
assert.equal(uploadedFile.name, "数据 原型.html");
assert.equal(uploadedFile.size, uploadBody.length);
assert.equal(uploadedFile.sha256, uploadSha256);
assert.deepEqual(readFileSync(uploadedFile.path), uploadBody);

const invalidUpload = await fetch(`${baseUrl}/v1/files`, {
  method: "POST",
  headers: {
    Authorization: "Bearer test-token",
    "Content-Type": "application/octet-stream",
    "X-AIWB-Upload-Id": "upload-invalid-sha",
    "X-AIWB-Workdir": encodedHeader(workspace),
    "X-AIWB-File-Name": encodedHeader("broken.bin"),
    "X-AIWB-Content-SHA256": "0".repeat(64),
  },
  body: Buffer.from("must-not-be-published"),
});
assert.equal(invalidUpload.status, 400);
assert.equal(
  readdirSync(join(workspace, ".ai-workbench", "uploads")).some((name) => name.includes("broken.bin") || name.endsWith(".part")),
  false,
);

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

const windowsCommand = {
  kind: "codex",
  command: "codex",
  workdir: "C:\\workspace",
  model: "gpt-5.6",
  prompt: "return windows-agent-direct-ok",
  sessionFile: "C:\\workspace\\.ai-workbench\\conversation.session",
  executionPermissionMode: "full-access",
};
const windowsCreated = await fetch(`${baseUrl}/v1/tasks`, {
  method: "POST",
  headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
  body: JSON.stringify({
    taskId: "task-windows-command",
    conversationId: "conversation-windows",
    command: windowsCommand,
  }),
});
assert.equal(windowsCreated.status, 202);
assert.deepEqual(
  JSON.parse(
    Buffer.from(
      readFileSync(join(home, "tasks", "task-windows-command", "command.b64"), "utf8").trim(),
      "base64",
    ).toString("utf8"),
  ),
  windowsCommand,
);

const contextRequired = await fetch(`${baseUrl}/v1/tasks`, {
  method: "POST",
  headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
  body: JSON.stringify({
    taskId: "task-context-required",
    conversationId: "conversation-context-required",
    command: "printf should-not-run",
  }),
});
assert.equal(contextRequired.status, 409);
assert.equal((await contextRequired.json()).error.code, "execution_context_required");
assert.equal(existsSync(join(home, "tasks", "task-context-required")), false);

// The real HTTP control child must remain headless even when the HTTP runtime
// accidentally inherited SSH_CONNECTION from its original service launcher.
const controlPath = join(home, "aiwbctl");
writeFileSync(controlPath, `#!/bin/sh
if [ "\${AIWB_AGENT_HEADLESS_HTTP:-}" = "1" ] && [ -n "\${SSH_CONNECTION:-}" ]; then
  printf '__AIWB_AGENT_STATUS__error\\n'
  printf '__AIWB_AGENT_ERROR_CODE__execution_context_required\\n'
  exit 42
fi
printf '__AIWB_AGENT_ERROR__headless marker missing\\n'
exit 99
`);
chmodSync(controlPath, 0o700);
const inheritedSshConnection = process.env.SSH_CONNECTION;
process.env.SSH_CONNECTION = "127.0.0.1 50002 127.0.0.1 22";
const realControlServer = createAgentDirectServer({
  config: { listenHost: "127.0.0.1", port: 0, accessToken: "test-token", tls: null },
});
await new Promise((resolve) => realControlServer.listen(0, "127.0.0.1", resolve));
const realControlAddress = realControlServer.address();
const inheritedContextResponse = await fetch(`http://127.0.0.1:${realControlAddress.port}/v1/tasks`, {
  method: "POST",
  headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
  body: JSON.stringify({
    taskId: "task-inherited-ssh-http",
    conversationId: "conversation-inherited-ssh-http",
    command: "printf should-not-run",
  }),
});
assert.equal(inheritedContextResponse.status, 409);
assert.equal((await inheritedContextResponse.json()).error.code, "execution_context_required");
assert.equal(existsSync(join(home, "tasks", "task-inherited-ssh-http")), false);
await new Promise((resolve) => realControlServer.close(resolve));
if (inheritedSshConnection === undefined) delete process.env.SSH_CONNECTION;
else process.env.SSH_CONNECTION = inheritedSshConnection;

if (process.platform !== "win32") {
  writeFileSync(controlPath, "#!/bin/sh\nkill -TERM $$\nsleep 1\n");
  chmodSync(controlPath, 0o700);
  const signalledControlServer = createAgentDirectServer({
    config: { listenHost: "127.0.0.1", port: 0, accessToken: "test-token", tls: null },
  });
  await new Promise((resolve) => signalledControlServer.listen(0, "127.0.0.1", resolve));
  const signalledAddress = signalledControlServer.address();
  const signalledResponse = await fetch(`http://127.0.0.1:${signalledAddress.port}/v1/cache/clear`, {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(signalledResponse.status, 409);
  const signalledPayload = await signalledResponse.json();
  assert.match(signalledPayload.error.message, /terminated by SIGTERM/);
  await new Promise((resolve) => signalledControlServer.close(resolve));
}

const latest = await fetch(`${baseUrl}/v1/conversations/conversation-1/latest-task`, { headers: { Authorization: "Bearer test-token" } });
assert.equal((await latest.json()).task.id, "task-linux-command");
await new Promise((resolve) => server.close(resolve));

// A process that cannot bind the direct API port is not a running runtime
// generation and must leave the last known-good marker untouched.
const previousRuntimeMarker = "previous-runtime-generation";
writeFileSync(join(home, "http.runtime.sha256"), `${previousRuntimeMarker}\n`);
const occupiedPort = createServer((_request, response) => response.end("occupied"));
await new Promise((resolve) => occupiedPort.listen(0, "127.0.0.1", resolve));
await assert.rejects(
  startAgentDirectServer({
    config: {
      listenHost: "127.0.0.1",
      port: occupiedPort.address().port,
      accessToken: "test-token",
      tls: null,
    },
  }),
  (error) => error?.code === "EADDRINUSE",
);
assert.equal(readFileSync(join(home, "http.runtime.sha256"), "utf8").trim(), previousRuntimeMarker);
assert.equal(existsSync(join(home, "http.pid")), false);
await new Promise((resolve) => occupiedPort.close(resolve));

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
assert.equal(registration?.body?.generationReady, false);
assert.match(registration?.body?.agentId || "", /^agent-/);
assert.match(registration?.body?.updateToken || "", /^[A-Za-z0-9_-]{24,}$/);
await new Promise((resolve) => registeredServer.close(resolve));
controlPlane.close();
console.log("agent direct server regression: ok");
