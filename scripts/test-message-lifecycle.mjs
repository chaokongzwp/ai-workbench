import assert from "node:assert/strict";
import {
  isPendingAgentResponse,
  lastActiveTaskMessage,
  lastPendingAgentResponse,
  messageChronologyTimestamp,
  mergeTaskMessages,
  normalizeMessageLifecycle,
  sortConversationMessages,
  taskStateCancelled,
  taskStateFailed,
  taskStateRunning,
  taskStateSubmitting,
  taskStateSucceeded,
  taskStateSyncing,
} from "../src/core/messageLifecycle.js";
import {
  loadLocalMessageHistory,
  localMessageHistoryStorageKey,
  localMessageHistoryVersion,
  normalizePersistedMessage,
  normalizeWorkspaceStore,
  repairCopiedConversationMappings,
  serializeWorkspaceStore,
  workspaceStoreVersion,
} from "../src/core/foundation.js";

const pending = normalizeMessageLifecycle({
  id: "turn-1-response",
  role: "assistant",
  backend: "agent",
  remoteTaskId: "task-1",
  taskState: taskStateRunning,
  remoteTaskStatus: "running",
  body: "正在等待 Claude 回复。",
  createdAtMs: 100,
});
assert.equal(pending.taskState, taskStateRunning);
assert.equal(isPendingAgentResponse(pending), true);

const completed = normalizeMessageLifecycle({
  ...pending,
  taskState: taskStateSucceeded,
  remoteTaskStatus: "done",
  output: "已完成，并给出了下一步选择。",
  completedAt: 200,
});
assert.equal(completed.taskState, taskStateSucceeded);
assert.equal(isPendingAgentResponse(completed), false);

const cancelledWithStaleRemoteStatus = normalizeMessageLifecycle({
  ...pending,
  taskState: taskStateCancelled,
  remoteTaskStatus: "running",
  cancelledAt: 180,
});
assert.equal(cancelledWithStaleRemoteStatus.taskState, taskStateCancelled);
assert.equal(isPendingAgentResponse(cancelledWithStaleRemoteStatus), false);

const transportTimeout = normalizeMessageLifecycle({
  ...pending,
  taskState: taskStateSyncing,
  remoteTaskStatus: "sync-timeout",
  body: "App 暂时没有等到结果。",
});
assert.equal(transportTimeout.taskState, taskStateSyncing);
assert.equal(isPendingAgentResponse(transportTimeout), true);

const unconfirmedSubmission = normalizeMessageLifecycle({
  ...pending,
  remoteTaskId: "",
  taskState: taskStateFailed,
  remoteTaskStatus: "sync-lost-no-task-id",
  resultMissing: true,
  body: "没有确认任务是否成功提交。",
});
assert.equal(unconfirmedSubmission.taskState, taskStateFailed);
assert.equal(isPendingAgentResponse(unconfirmedSubmission), false);

const stalePending = {
  ...pending,
  body: "旧缓存仍显示等待。",
  remoteTaskCheckedAt: 300,
};
const completedDoesNotRegress = mergeTaskMessages(completed, stalePending);
assert.equal(completedDoesNotRegress.taskState, taskStateSucceeded);
assert.equal(completedDoesNotRegress.output, completed.output);

const oldError = normalizeMessageLifecycle({
  ...pending,
  taskState: taskStateFailed,
  remoteTaskStatus: "missing",
  resultMissing: true,
  body: "没有拿到结果。",
  completedAt: 150,
});
const recoveredSuccess = mergeTaskMessages(oldError, completed);
assert.equal(recoveredSuccess.taskState, taskStateSucceeded);
assert.equal(recoveredSuccess.output, completed.output);

const fullRemoteTaskId = "task-1786006375455-bc69cf-codex-conv-E-codex-17";
const truncatedRemoteTaskId = "task-1786006375455-bc69cf-codex-conv-";
const confirmedTask = {
  ...pending,
  id: "turn-1786006341866-kwg19e-response",
  turnId: "turn-1786006341866-kwg19e",
  messagePairId: "turn-1786006341866-kwg19e",
  remoteTaskId: fullRemoteTaskId,
};
const wrappedConversationTask = {
  ...confirmedTask,
  id: "turn-1786006341866-kwg19e",
  remoteTaskId: truncatedRemoteTaskId,
  body: "任务仍在执行。",
};
const taskMergedAfterWrappedConversationSync = mergeTaskMessages(confirmedTask, wrappedConversationTask);
assert.equal(taskMergedAfterWrappedConversationSync.id, confirmedTask.id);
assert.equal(taskMergedAfterWrappedConversationSync.remoteTaskId, fullRemoteTaskId);
assert.equal(
  mergeTaskMessages(
    { ...confirmedTask, remoteTaskId: truncatedRemoteTaskId },
    { ...wrappedConversationTask, remoteTaskId: fullRemoteTaskId },
  ).remoteTaskId,
  fullRemoteTaskId,
);
assert.equal(
  mergeTaskMessages(confirmedTask, { ...wrappedConversationTask, remoteTaskId: "task-unrelated" }).remoteTaskId,
  fullRemoteTaskId,
);
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
assert.equal(lastActiveTaskMessage([
  { id: "turn-1-request", role: "user", body: "执行任务" },
  pending,
]), pending);

const sortedConversation = sortConversationMessages([
  { id: "turn-2-response", role: "assistant", turnId: "turn-2", createdAtMs: 401 },
  { id: "turn-1-response", role: "assistant", turnId: "turn-1", createdAtMs: 99 },
  { id: "turn-2-request", role: "user", turnId: "turn-2", createdAtMs: 400 },
  { id: "turn-1-request", role: "user", turnId: "turn-1", createdAtMs: 100 },
]);
assert.deepEqual(
  sortedConversation.map((message) => message.id),
  ["turn-1-request", "turn-1-response", "turn-2-request", "turn-2-response"],
);

const legacyUndatedTail = Array.from({ length: 8 }, (_, index) => ({
  id: `legacy-${index + 1}`,
  role: index % 2 === 0 ? "user" : "assistant",
  body: `旧消息 ${index + 1}`,
}));
const locallyAppendedAt = 500;
const conversationWithNewLocalTurn = sortConversationMessages([
  ...legacyUndatedTail,
  {
    id: "new-local-request",
    role: "user",
    turnId: "new-local-turn",
    createdAtMs: locallyAppendedAt,
  },
  {
    id: "new-local-response",
    role: "assistant",
    turnId: "new-local-turn",
    createdAtMs: locallyAppendedAt + 1,
    taskState: taskStateSubmitting,
  },
]);
assert.deepEqual(
  conversationWithNewLocalTurn.slice(-2).map((message) => message.id),
  ["new-local-request", "new-local-response"],
  "a timestamped local turn appended after undated legacy history must remain at the transcript tail",
);
assert.deepEqual(
  conversationWithNewLocalTurn.slice(-6).map((message) => message.id),
  ["legacy-5", "legacy-6", "legacy-7", "legacy-8", "new-local-request", "new-local-response"],
  "the progressive transcript window must include the newly appended local turn",
);
assert.equal(
  messageChronologyTimestamp({ id: "assistant-1783047059014-result" }),
  1783047059014,
);
assert.equal(
  messageChronologyTimestamp({
    id: "agent-conv-1785376137913-task-1785988683000-user",
    createdAtMs: 1785938000000,
  }),
  1785988683000,
  "the task timestamp at the end of a restored Agent id must win over the conversation id and a skewed remote clock",
);
assert.equal(
  messageChronologyTimestamp({
    id: "remote-response",
    turnId: "turn-1785988683000-client",
    createdAtMs: 1785938000000,
    completedAt: 1785938005000,
  }),
  1785988683000,
  "a client-authored turn id must be the chronology source of truth across machines",
);
assert.equal(
  messageChronologyTimestamp({
    turnId: "legacy-turn-without-epoch",
    messagePairId: "turn-1785988683000-client",
    createdAtMs: 1785938000000,
  }),
  1785988683000,
  "an unparseable turn id must not hide a valid message-pair timestamp",
);
assert.equal(
  messageChronologyTimestamp({
    id: "order-1785989999999",
    createdAtMs: 1785988683000,
  }),
  1785988683000,
  "an unrelated 13-digit business identifier must not override the recorded event time",
);
assert.equal(
  messageChronologyTimestamp({
    id: "task-2999999999999-impossible",
    createdAtMs: 1785988683000,
  }),
  1785988683000,
  "an implausible future timestamp embedded in an id must be ignored",
);

const clockSkewedConversation = sortConversationMessages([
  {
    id: "new-response",
    role: "assistant",
    turnId: "turn-1785988683000-new",
    createdAtMs: 1785938005000,
  },
  {
    id: "old-response",
    role: "assistant",
    turnId: "turn-1785985000000-old",
    createdAtMs: 1786000005000,
  },
  {
    id: "new-request",
    role: "user",
    turnId: "turn-1785988683000-new",
    createdAtMs: 1785938000000,
  },
  {
    id: "old-request",
    role: "user",
    turnId: "turn-1785985000000-old",
    createdAtMs: 1786000000000,
  },
]);
assert.deepEqual(
  clockSkewedConversation.map((message) => message.id),
  ["old-request", "old-response", "new-request", "new-response"],
  "remote wall-clock skew must not move an older Agent turn after the newly sent client turn",
);

const persistedClockSkewedMessage = normalizePersistedMessage({
  id: "turn-1785988683000-client-request",
  role: "user",
  turnId: "turn-1785988683000-client",
  body: "保留本地排序锚点",
  createdAtMs: 1785938000000,
});
assert.equal(persistedClockSkewedMessage.clientCreatedAtMs, 1785988683000);
assert.equal(
  persistedClockSkewedMessage.createdAtMs,
  1785938000000,
  "persistence must not overwrite the remote event time with the client chronology anchor",
);

const legacyWorkspace = normalizeWorkspaceStore({
  version: 2,
  activeServerId: "server-clean-break",
  servers: [
    {
      id: "server-clean-break",
      name: "测试服务器",
      conversationId: "conversation-kept",
      profile: {
        host: "127.0.0.1",
        username: "tester",
        password: "secret",
        workdir: "/workspace",
        agentId: "claude",
      },
      messages: [pending, completed],
      task: { state: "running", backend: "agent", remoteTaskId: "task-old" },
      unreadResult: { messageId: completed.id },
    },
  ],
});
assert.equal(workspaceStoreVersion, 5);
assert.equal(localMessageHistoryVersion, 2);
assert.equal(legacyWorkspace.servers.length, 1);
assert.equal(legacyWorkspace.servers[0].conversationId, "conversation-kept");

const copiedMappingRepair = repairCopiedConversationMappings([
  {
    id: "source",
    conversationId: "conv-E--codex-cat-litter-box-1785466000000-a1b2c3d4",
    profile: { workdir: "E:\\codex\\cat-litter-box" },
    messages: [],
  },
  {
    id: "copy",
    conversationId: "conv-E--codex-cat-litter-box-1785466066679-e5f6a7b8",
    profile: { workdir: "E:\\codex\\dd-device" },
    messages: [],
  },
]);
assert.equal(copiedMappingRepair.repairedCount, 1);
assert.match(copiedMappingRepair.servers[1].conversationId, /^conv-E--codex-dd-device-/);

const activeCopiedMapping = repairCopiedConversationMappings([
  copiedMappingRepair.servers[0],
  {
    id: "active-copy",
    conversationId: "conv-E--codex-cat-litter-box-1785466066680-e5f6a7b9",
    profile: { workdir: "E:\\codex\\dd-device" },
    messages: [{ role: "assistant", taskState: taskStateRunning }],
  },
]);
assert.equal(activeCopiedMapping.repairedCount, 0);
assert.equal(
  activeCopiedMapping.servers[1].conversationId,
  "conv-E--codex-cat-litter-box-1785466066680-e5f6a7b9",
);
assert.equal(legacyWorkspace.servers[0].profile.password, "secret");
assert.equal(legacyWorkspace.servers[0].messages.length, 2);
assert.equal(legacyWorkspace.servers[0].messages[0].taskState, taskStateRunning);
assert.equal(legacyWorkspace.servers[0].messages[1].taskState, taskStateSucceeded);
assert.equal("state" in legacyWorkspace.servers[0].task, false);

const cleanWorkspace = serializeWorkspaceStore(legacyWorkspace.servers, legacyWorkspace.activeServerId);
assert.equal(cleanWorkspace.version, workspaceStoreVersion);
assert.equal("connection" in cleanWorkspace.servers[0], false);
assert.equal(cleanWorkspace.servers[0].messages.length, 2);
assert.equal("status" in cleanWorkspace.servers[0].messages[0], false);
assert.equal("responsePhase" in cleanWorkspace.servers[0].messages[0], false);

const storage = new Map([
  [
    "ai-workbench-local-message-history-v1",
    JSON.stringify({
      version: 1,
      servers: [
        {
          id: "legacy-history",
          messages: [
            {
              id: "legacy-response",
              role: "assistant",
              backend: "agent",
              remoteTaskId: "legacy-task",
              status: "running",
              body: "旧版任务仍在运行。",
              createdAtMs: 300,
            },
          ],
        },
      ],
    }),
  ],
]);
globalThis.window = {
  localStorage: {
    getItem(key) {
      return storage.get(key) || null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
  },
};
const migratedHistory = loadLocalMessageHistory();
assert.equal(migratedHistory["legacy-history"][0].taskState, taskStateRunning);
assert.equal(storage.has("ai-workbench-local-message-history-v1"), false);
assert.equal(JSON.parse(storage.get(localMessageHistoryStorageKey)).version, localMessageHistoryVersion);
delete globalThis.window;

console.log("message lifecycle regression: ok");
