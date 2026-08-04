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
  taskStateSucceeded,
  taskStateSyncing,
} from "../src/core/messageLifecycle.js";
import {
  loadLocalMessageHistory,
  localMessageHistoryStorageKey,
  localMessageHistoryVersion,
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
assert.equal(
  messageChronologyTimestamp({ id: "assistant-1783047059014-result" }),
  1783047059014,
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
