import assert from "node:assert/strict";
import {
  agentPreferredForProfile,
  dedupeRemoteTaskMessages,
  isMessageListDiagnostic,
  messageTextKey,
  reconcileServerMessageLifecycle,
} from "../src/app/controllerMessageLifecycle.js";
import {
  taskStateRunning,
  taskStateSucceeded,
} from "../src/core/messageLifecycle.js";

const userMessages = dedupeRemoteTaskMessages([
  {
    id: "request-local",
    role: "user",
    turnId: "turn-1",
    body: "",
    createdAtMs: 200,
  },
  {
    id: "request-remote",
    role: "user",
    turnId: "turn-1",
    body: "检查服务状态",
    createdAtMs: 100,
  },
]);
assert.equal(userMessages.length, 1);
assert.equal(userMessages[0].body, "检查服务状态");
assert.equal(userMessages[0].createdAtMs, 100);

const taskMessages = dedupeRemoteTaskMessages([
  {
    id: "response-local",
    role: "assistant",
    backend: "agent",
    agentId: "claude",
    remoteTaskId: "task-1",
    taskState: taskStateRunning,
    remoteTaskStatus: "running",
    body: "正在等待 Claude 回复。",
    createdAtMs: 300,
  },
  {
    id: "response-remote",
    role: "assistant",
    backend: "agent",
    agentId: "claude",
    remoteTaskId: "task-1",
    taskState: taskStateSucceeded,
    remoteTaskStatus: "done",
    output: "服务运行正常。",
    createdAtMs: 300,
    completedAt: 500,
  },
]);
assert.equal(taskMessages.length, 1);
assert.equal(taskMessages[0].taskState, taskStateSucceeded);
assert.equal(taskMessages[0].output, "服务运行正常。");
assert.equal(taskMessages[0].body, "");

const reconciled = reconcileServerMessageLifecycle({
  id: "server-1",
  profile: { agentId: "claude" },
  messages: [
    {
      id: "response-running",
      role: "assistant",
      backend: "agent",
      agentId: "claude",
      remoteTaskId: "task-running",
      taskState: taskStateRunning,
      remoteTaskStatus: "running",
      createdAtMs: 800,
    },
  ],
});
assert.equal(reconciled.task.remoteTaskId, "task-running");
assert.equal(reconciled.task.agentId, "claude");

assert.equal(agentPreferredForProfile({ platform: "windows", useWorkbenchAgent: false }), true);
assert.equal(agentPreferredForProfile({ platform: "linux", useWorkbenchAgent: true }), true);
assert.equal(agentPreferredForProfile({ platform: "linux", useWorkbenchAgent: false }), false);
assert.equal(messageTextKey({ promptText: " 继续执行 " }), "继续执行");
assert.equal(isMessageListDiagnostic({ title: "消息列表已拉取" }), true);
assert.equal(isMessageListDiagnostic({ title: "Claude 输出已刷新" }), true);
assert.equal(isMessageListDiagnostic({ title: "Claude 回复" }), false);

console.log("controller message lifecycle regression: ok");
