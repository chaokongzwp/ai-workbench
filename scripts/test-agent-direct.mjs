import assert from "node:assert/strict";
import {
  agentDirectConfig,
  agentDirectEventUrl,
  agentDirectRequest,
  agentDirectTaskLifecycle,
  agentDirectTaskNeedsSync,
  normalizeAgentDirectEndpoint,
} from "../src/core/agentDirect.js";
import {
  taskLifecycleForMessage,
  taskNeedsRemoteSync,
  taskStateCancelled,
  taskStateRunning,
  taskStateSucceeded,
} from "../src/core/messageLifecycle.js";

assert.equal(normalizeAgentDirectEndpoint("https://agent.example.com/"), "https://agent.example.com");
assert.equal(normalizeAgentDirectEndpoint("http://agent.example.com"), "");
assert.equal(normalizeAgentDirectEndpoint("not a url"), "");

const profile = { agentDirectEndpoint: "https://agent.example.com/", agentDirectAccessToken: "secret" };
assert.equal(agentDirectConfig(profile).enabled, true);
assert.equal(agentDirectEventUrl(profile), "wss://agent.example.com/v1/events");
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

console.log("agent direct protocol regression: ok");
