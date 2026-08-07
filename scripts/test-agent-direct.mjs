import assert from "node:assert/strict";
import {
  AgentDirectRequestError,
  agentDirectConfig,
  agentDirectEventUrl,
  agentDirectRequest,
  agentDirectTaskLifecycle,
  agentDirectTaskNeedsSync,
  normalizeAgentDirectEndpoint,
  raceAgentDirectTimeout,
} from "../src/core/agentDirect.js";
import {
  taskLifecycleForMessage,
  taskNeedsRemoteSync,
  taskStateCancelled,
  taskStateRunning,
  taskStateSucceeded,
} from "../src/core/messageLifecycle.js";
import { buildWorkbenchAgentDirectConfigCommand } from "../src/core/agent.js";
import { profileWithDetectedTools } from "../src/core/remoteCommands.js";
import { agentInstallationKey, serverPlatformLabel, sshEndpointKey } from "../src/core/foundation.js";

assert.equal(normalizeAgentDirectEndpoint("https://agent.example.com/"), "https://agent.example.com");
assert.equal(normalizeAgentDirectEndpoint("http://agent.example.com"), "");
assert.equal(normalizeAgentDirectEndpoint("not a url"), "");

const profile = {
  agentDirectEndpoint: "https://agent.example.com/",
  agentDirectAccessToken: "secret",
  agentDirectTlsFingerprint: "sha256/example-pinned-certificate",
};
assert.equal(agentDirectConfig(profile).enabled, true);
assert.equal(agentDirectEventUrl(profile), "");
assert.equal(agentDirectConfig({ ...profile, agentDirectTlsFingerprint: "" }).enabled, false);
const httpProfile = { agentDirectEndpoint: "http://agent.example.com", agentDirectAccessToken: "secret" };
assert.equal(agentDirectConfig(httpProfile).enabled, false);
assert.equal(agentDirectEventUrl(httpProfile), "");
assert.deepEqual(agentDirectTaskLifecycle({ status: "queued" }), { status: "running", outcome: "" });
assert.deepEqual(agentDirectTaskLifecycle({ status: "done" }), { status: "completed", outcome: "success" });
assert.deepEqual(agentDirectTaskLifecycle({ status: "error" }), { status: "completed", outcome: "error" });
assert.deepEqual(agentDirectTaskLifecycle({ status: "cancelled" }), { status: "completed", outcome: "cancelled" });
assert.equal(agentDirectTaskNeedsSync({ status: "done" }), false);

const lifecycle = taskLifecycleForMessage({ role: "assistant", taskState: taskStateRunning });
assert.deepEqual(lifecycle, { status: "running", outcome: "" });
assert.equal(taskNeedsRemoteSync({ role: "assistant", taskState: taskStateSucceeded }), false);
assert.equal(taskNeedsRemoteSync({ role: "assistant", taskState: taskStateCancelled }), false);

let captured = null;
const result = await agentDirectRequest(profile, "/v1/tasks", {
  method: "POST",
  body: { hello: "world" },
  fetchImpl: async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ taskId: "task-1" }), { status: 202 });
  },
});
assert.equal(result.taskId, "task-1");
assert.equal(captured.url, "https://agent.example.com/v1/tasks");
assert.equal(captured.init.headers.Authorization, "Bearer secret");

const macBootstrap = buildWorkbenchAgentDirectConfigCommand({ platform: "macos" });
assert.match(macBootstrap, /base64 < "\$AIWB_CONFIG"/);
assert.doesNotMatch(macBootstrap, /base64 "\$AIWB_CONFIG"/);
assert.match(macBootstrap, /__AIWB_AGENT_DIRECT_STATUS__error/);

const detectedMac = profileWithDetectedTools(
  { platform: "linux", codexCommand: "codex", claudeCommand: "claude" },
  { platform: "macos", codex: "/Applications/Codex.app/Contents/Resources/codex", claude: "/opt/homebrew/bin/claude" },
);
assert.equal(detectedMac.platform, "macos");
assert.equal(detectedMac.claudeCommand, "/opt/homebrew/bin/claude");
assert.equal(profileWithDetectedTools({ platform: "wsl" }, { platform: "linux" }).platform, "wsl");
const linuxMachine = { platform: "linux", host: "macmini", port: 22, username: "a0" };
const macosMachine = { ...linuxMachine, platform: "macos" };
assert.equal(agentInstallationKey(linuxMachine), agentInstallationKey(macosMachine));
assert.equal(sshEndpointKey(linuxMachine), sshEndpointKey({ ...linuxMachine, platform: "windows" }));
assert.notEqual(agentInstallationKey(linuxMachine), agentInstallationKey({ ...linuxMachine, platform: "windows" }));
assert.notEqual(
  agentInstallationKey({ ...linuxMachine, platform: "wsl", wslDistro: "Ubuntu" }),
  agentInstallationKey({ ...linuxMachine, platform: "wsl", wslDistro: "Debian" }),
);
assert.equal(serverPlatformLabel("macos"), "macOS");

// The native bridge path (Electron/iOS `agentRequest`) has no AbortController,
// so it must be bounded by a client-side deadline. A request that resolves in
// time passes through untouched; one that never settles rejects with a typed
// timeout error instead of hanging the sender forever (the iOS "stuck at 正在发送"
// regression). Uses a floored 1s deadline to stay fast and deterministic.
const fastPath = await raceAgentDirectTimeout(Promise.resolve({ status: 200, body: "{}" }), 50);
assert.deepEqual(fastPath, { status: 200, body: "{}" });

let timedOut = null;
try {
  await raceAgentDirectTimeout(new Promise(() => {}), 10);
} catch (error) {
  timedOut = error;
}
assert.ok(timedOut instanceof AgentDirectRequestError, "hanging native request must reject");
assert.equal(timedOut.code, "agent_direct_timeout");

// End to end: a native bridge whose agentRequest never resolves must surface the
// timeout through agentDirectRequest rather than leaving the promise pending.
const savedWindow = globalThis.window;
globalThis.window = {
  Capacitor: { isNativePlatform: () => true },
  aiWorkbench: { agentRequest: () => new Promise(() => {}) },
};
try {
  let nativeTimeout = null;
  try {
    await agentDirectRequest(profile, "/v1/tasks", { method: "POST", body: { hello: "world" }, timeoutMs: 10 });
  } catch (error) {
    nativeTimeout = error;
  }
  assert.ok(nativeTimeout instanceof AgentDirectRequestError, "native agentDirectRequest must settle");
  assert.equal(nativeTimeout.code, "agent_direct_timeout");
} finally {
  if (savedWindow === undefined) delete globalThis.window;
  else globalThis.window = savedWindow;
}

console.log("agent direct protocol regression: ok");
