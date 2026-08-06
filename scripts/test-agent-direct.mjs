import assert from "node:assert/strict";
import {
  agentDirectConfig,
  agentDirectEventUrl,
  agentDirectRequest,
  agentDirectUpload,
  agentDirectTaskLifecycle,
  agentDirectTaskNeedsSync,
  agentDirectTaskStatusSnapshot,
  normalizeAgentDirectEndpoint,
} from "../src/core/agentDirect.js";
import {
  taskLifecycleForMessage,
  taskNeedsRemoteSync,
  taskStateCancelled,
  taskStateRunning,
  taskStateSucceeded,
} from "../src/core/messageLifecycle.js";
import {
  buildWorkbenchAgentDirectConfigCommand,
  workbenchAgentProtocolSupports,
} from "../src/core/agent.js";
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
assert.equal(agentDirectEventUrl(profile), "wss://agent.example.com/v1/events");
assert.equal(agentDirectConfig({ ...profile, agentDirectTlsFingerprint: "" }).enabled, false);
const httpProfile = { agentDirectEndpoint: "http://agent.example.com", agentDirectAccessToken: "secret" };
assert.equal(agentDirectConfig(httpProfile).enabled, false);
assert.equal(agentDirectEventUrl(httpProfile), "");
assert.equal(workbenchAgentProtocolSupports({ protocolVersion: 1 }, ["tasks"]), true);
assert.equal(
  workbenchAgentProtocolSupports({ protocolVersion: 2, capabilities: ["tasks", "binary-upload-v1"] }, ["tasks"]),
  true,
);
assert.equal(workbenchAgentProtocolSupports({ protocolVersion: 2, capabilities: ["binary-upload-v1"] }, ["tasks"]), false);
assert.equal(workbenchAgentProtocolSupports({ protocolVersion: 3, capabilities: ["tasks"] }, ["tasks"]), true);
assert.equal(workbenchAgentProtocolSupports({ protocolVersion: 0, capabilities: ["tasks"] }, ["tasks"]), false);
assert.equal(workbenchAgentProtocolSupports({ protocolVersion: 1 }, ["binary-upload-v1"]), false);
assert.deepEqual(agentDirectTaskLifecycle({ status: "queued" }), { status: "running", outcome: "" });
assert.deepEqual(agentDirectTaskLifecycle({ status: "done" }), { status: "completed", outcome: "success" });
assert.deepEqual(agentDirectTaskLifecycle({ status: "error" }), { status: "completed", outcome: "error" });
assert.deepEqual(agentDirectTaskLifecycle({ status: "cancelled" }), { status: "completed", outcome: "cancelled" });
assert.equal(agentDirectTaskNeedsSync({ status: "done" }), false);
assert.deepEqual(
  agentDirectTaskStatusSnapshot({ rawStatus: "done", outcome: "success", output: "final", exitCode: 0 }),
  {
    taskStatus: "done",
    output: "final",
    raw: "final",
    eventFingerprint: JSON.stringify(["done", "", "", 0, "", 5]),
    pid: "",
    startedAt: "",
    runnerStartedAt: "",
    finishedAt: "",
    exitCode: "",
    executionSummary: "",
  },
);

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

const uploadBytes = Buffer.from("binary-upload-中文", "utf8");
const uploaded = await agentDirectUpload(profile, {
  name: "测试附件.txt",
  mime: "text/plain",
  size: uploadBytes.length,
  base64: uploadBytes.toString("base64"),
}, {
  uploadId: "upload-test-1",
  workdir: "/workspace/project",
  fetchImpl: async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ file: {
      name: "测试附件.txt",
      path: "/workspace/project/.ai-workbench/uploads/result.txt",
      size: uploadBytes.length,
      sha256: init.headers["X-AIWB-Content-SHA256"],
    } }), { status: 201 });
  },
});
assert.equal(uploaded.size, uploadBytes.length);
assert.equal(captured.url, "https://agent.example.com/v1/files");
assert.equal(captured.init.headers["Content-Type"], "application/octet-stream");
assert.equal(Buffer.from(captured.init.body).equals(uploadBytes), true);
assert.equal(Buffer.from(captured.init.headers["X-AIWB-File-Name"], "base64url").toString("utf8"), "测试附件.txt");
assert.match(captured.init.headers["X-AIWB-Content-SHA256"], /^[a-f0-9]{64}$/);

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

console.log("agent direct protocol regression: ok");
