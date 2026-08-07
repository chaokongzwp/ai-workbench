import assert from "node:assert/strict";
import {
  cloudSyncPayloadKind,
  cloudSyncPayloadVersion,
  createServerSession,
  mergeCloudDownloadedServers,
  mergeCloudSyncPayloads,
  workspaceStoreVersion,
} from "../src/core/foundation.js";

function profile(overrides = {}) {
  return {
    name: "开发会话",
    platform: "linux",
    host: "10.0.0.8",
    port: "22",
    username: "developer",
    password: "secret",
    workdir: "/srv/app",
    agentId: "codex",
    aiModel: "gpt-old",
    environmentVariables: "FEATURE_FLAG=old",
    ...overrides,
  };
}

function cloudPayload(servers, activeServerId = servers[0]?.id || "") {
  return {
    kind: cloudSyncPayloadKind,
    version: cloudSyncPayloadVersion,
    workspace: {
      version: workspaceStoreVersion,
      activeServerId,
      servers,
    },
  };
}

const remoteSameConversation = createServerSession({
  id: "cloud-server-1",
  conversationId: "conversation-stable",
  name: "旧名称",
  profile: profile(),
});
const localSameConversation = createServerSession({
  id: "local-server-1",
  conversationId: "conversation-stable",
  name: "新名称",
  profile: profile({
    host: "10.0.0.9",
    workdir: "/srv/app-next",
    aiModel: "gpt-new",
    environmentVariables: "FEATURE_FLAG=new\nEXTRA=1",
  }),
});
const remoteOnly = createServerSession({
  id: "cloud-server-only",
  conversationId: "conversation-cloud-only",
  profile: profile({ workdir: "/srv/cloud-only" }),
});
const localNew = createServerSession({
  id: "local-server-new",
  conversationId: "conversation-new",
  profile: profile({ workdir: "/srv/new" }),
});

const uploaded = mergeCloudSyncPayloads(
  cloudPayload([remoteSameConversation, remoteOnly], remoteSameConversation.id),
  cloudPayload([localSameConversation, localNew], localSameConversation.id),
);
assert.equal(uploaded.updatedServers.length, 1);
assert.equal(uploaded.addedServers.length, 1);
assert.equal(uploaded.skippedServers.length, 0);
assert.equal(uploaded.payload.workspace.servers.length, 3);
const uploadedUpdate = uploaded.payload.workspace.servers.find(
  (server) => server.conversationId === "conversation-stable",
);
assert.equal(uploadedUpdate.id, "cloud-server-1", "upsert keeps the cloud record id");
assert.equal(uploadedUpdate.name, "新名称");
assert.equal(uploadedUpdate.profile.host, "10.0.0.9");
assert.equal(uploadedUpdate.profile.workdir, "/srv/app-next");
assert.equal(uploadedUpdate.profile.aiModel, "gpt-new");
assert.equal(uploadedUpdate.profile.environmentVariables, "FEATURE_FLAG=new\nEXTRA=1");
assert.equal(uploaded.payload.workspace.activeServerId, "cloud-server-1");
assert.ok(
  uploaded.payload.workspace.servers.some((server) => server.conversationId === "conversation-cloud-only"),
  "upload keeps conversations that exist only in the cloud",
);

const unchangedUpload = mergeCloudSyncPayloads(
  cloudPayload([remoteSameConversation], remoteSameConversation.id),
  cloudPayload([remoteSameConversation], remoteSameConversation.id),
);
assert.equal(unchangedUpload.updatedServers.length, 0);
assert.equal(unchangedUpload.addedServers.length, 0);
assert.equal(unchangedUpload.skippedServers.length, 1);

const localState = createServerSession({
  id: "device-local-id",
  conversationId: "conversation-download",
  name: "下载前",
  profile: profile(),
  connection: {
    state: "connected",
    channelState: "connected",
    label: "已连接",
    detail: "live socket",
    mode: "agent",
  },
  diagnostics: { lastCheck: "ok" },
  discovery: { agents: ["codex"] },
  rawOutput: "本机原始输出",
  messages: [
    { id: "user-1", role: "user", body: "保留这条消息", createdAtMs: 100 },
    { id: "assistant-1", role: "assistant", body: "正在处理", createdAtMs: 101 },
  ],
  task: { state: "running", remoteTaskId: "task-1" },
  unreadResult: { messageId: "assistant-1" },
  pendingIdentityEdit: true,
  agentHistoryCursor: "cursor-1",
  agentHistoryHasMore: false,
});
const cloudConfigUpdate = createServerSession({
  id: "cloud-download-id",
  conversationId: "conversation-download",
  name: "下载后",
  profile: profile({
    workdir: "/srv/app-renamed",
    aiModel: "gpt-new",
    environmentVariables: "FEATURE_FLAG=new",
  }),
});
const downloaded = mergeCloudDownloadedServers(
  [localState],
  cloudPayload([cloudConfigUpdate], cloudConfigUpdate.id),
);
assert.equal(downloaded.updatedServers.length, 1);
assert.equal(downloaded.addedServers.length, 0);
const downloadedUpdate = downloaded.servers[0];
assert.equal(downloadedUpdate.id, "device-local-id", "download keeps the device-local card id");
assert.equal(downloadedUpdate.conversationId, "conversation-download");
assert.equal(downloadedUpdate.name, "下载后");
assert.equal(downloadedUpdate.profile.workdir, "/srv/app-renamed");
assert.equal(downloadedUpdate.profile.aiModel, "gpt-new");
assert.equal(downloadedUpdate.profile.environmentVariables, "FEATURE_FLAG=new");
assert.deepEqual(downloadedUpdate.connection, localState.connection, "same connection target remains connected");
assert.deepEqual(downloadedUpdate.messages, localState.messages);
assert.deepEqual(downloadedUpdate.task, localState.task);
assert.deepEqual(downloadedUpdate.unreadResult, localState.unreadResult);
assert.deepEqual(downloadedUpdate.diagnostics, localState.diagnostics);
assert.deepEqual(downloadedUpdate.discovery, localState.discovery);
assert.equal(downloadedUpdate.rawOutput, localState.rawOutput);
assert.equal(downloadedUpdate.pendingIdentityEdit, true);
assert.equal(downloadedUpdate.agentHistoryCursor, "cursor-1");
assert.equal(downloadedUpdate.agentHistoryHasMore, false);

const unchangedDownload = mergeCloudDownloadedServers(
  [localState],
  cloudPayload([localState], localState.id),
);
assert.equal(unchangedDownload.updatedServers.length, 0);
assert.equal(unchangedDownload.addedServers.length, 0);
assert.equal(unchangedDownload.skippedServers.length, 1);
assert.equal(unchangedDownload.servers[0], localState, "an unchanged download does not rewrite local state");

const movedTarget = createServerSession({
  id: "cloud-download-id",
  conversationId: "conversation-download",
  name: "迁移后的会话",
  profile: profile({ host: "10.0.0.99", port: "2222", username: "new-user" }),
});
const downloadedMovedTarget = mergeCloudDownloadedServers(
  [localState],
  cloudPayload([movedTarget], movedTarget.id),
).servers[0];
assert.equal(downloadedMovedTarget.profile.host, "10.0.0.99");
assert.equal(downloadedMovedTarget.connection.state, "idle");
assert.equal(downloadedMovedTarget.connection.channelState, "disconnected");
assert.deepEqual(downloadedMovedTarget.messages, localState.messages);
assert.deepEqual(downloadedMovedTarget.task, localState.task);

const sameTargetDifferentConversation = createServerSession({
  id: "cloud-second-conversation",
  conversationId: "conversation-distinct",
  name: "相同目录的另一个会话",
  profile: profile(),
});
const downloadedDistinct = mergeCloudDownloadedServers(
  [localState],
  cloudPayload([sameTargetDifferentConversation], sameTargetDifferentConversation.id),
);
assert.equal(downloadedDistinct.updatedServers.length, 0);
assert.equal(downloadedDistinct.addedServers.length, 1);
assert.equal(downloadedDistinct.servers.length, 2, "conversation id prevents unrelated sessions from being merged");

console.log("cloud sync upsert tests passed");
