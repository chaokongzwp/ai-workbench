import assert from "node:assert/strict";
import {
  isPendingAgentResponse,
  lastPendingAgentResponse,
  mergeResponseLifecycle,
  normalizeMessageLifecycle,
  responsePhaseCompleted,
  responsePhasePending,
} from "../src/core/messageLifecycle.js";

const pending = normalizeMessageLifecycle({
  id: "turn-1-response",
  role: "assistant",
  backend: "agent",
  remoteTaskId: "task-1",
  status: "running",
  remoteTaskStatus: "running",
  body: "正在等待 Claude 回复。",
  createdAtMs: 100,
});
assert.equal(pending.responsePhase, responsePhasePending);
assert.equal(isPendingAgentResponse(pending), true);

const completed = normalizeMessageLifecycle({
  ...pending,
  status: "done",
  remoteTaskStatus: "done",
  output: "已完成，并给出了下一步选择。",
  completedAt: 200,
});
assert.equal(completed.responsePhase, responsePhaseCompleted);
assert.equal(completed.responseOutcome, "success");
assert.equal(isPendingAgentResponse(completed), false);

const cancelledWithStaleRemoteStatus = normalizeMessageLifecycle({
  ...pending,
  status: "cancelled",
  remoteTaskStatus: "running",
  cancelledAt: 180,
});
assert.equal(cancelledWithStaleRemoteStatus.responsePhase, responsePhaseCompleted);
assert.equal(cancelledWithStaleRemoteStatus.responseOutcome, "cancelled");
assert.equal(cancelledWithStaleRemoteStatus.status, "cancelled");
assert.equal(isPendingAgentResponse(cancelledWithStaleRemoteStatus), false);

const transportTimeout = normalizeMessageLifecycle({
  ...pending,
  status: "error",
  remoteTaskStatus: "sync-timeout",
  body: "App 暂时没有等到结果。",
});
assert.equal(transportTimeout.responsePhase, responsePhasePending);
assert.equal(isPendingAgentResponse(transportTimeout), true);

const stalePending = {
  ...pending,
  body: "旧缓存仍显示等待。",
  remoteTaskCheckedAt: 300,
};
const completedDoesNotRegress = mergeResponseLifecycle(completed, stalePending);
assert.equal(completedDoesNotRegress.responsePhase, responsePhaseCompleted);
assert.equal(completedDoesNotRegress.output, completed.output);

const oldError = normalizeMessageLifecycle({
  ...pending,
  status: "error",
  remoteTaskStatus: "missing",
  resultMissing: true,
  body: "没有拿到结果。",
  completedAt: 150,
});
const recoveredSuccess = mergeResponseLifecycle(oldError, completed);
assert.equal(recoveredSuccess.responseOutcome, "success");
assert.equal(recoveredSuccess.output, completed.output);
assert.equal(recoveredSuccess.resultMissing, false);

assert.equal(lastPendingAgentResponse([
  { id: "turn-1-request", role: "user", body: "执行任务" },
  pending,
]), pending);
assert.equal(lastPendingAgentResponse([
  { id: "turn-1-request", role: "user", body: "执行任务" },
  completed,
]), null);
assert.equal(lastPendingAgentResponse([
  pending,
  { id: "turn-2-request", role: "user", body: "新消息尚未提交" },
]), null);

console.log("message lifecycle regression: ok");
