import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mergePendingWorkspaceMutations,
  mergeWorkspaceMessages,
  mergeWorkspaceProfile,
  rebaseWorkspaceProfile,
  workspaceProfileEffectiveRevision,
} from "../src/core/workspaceProfileMerge.js";

const messageId = "turn-1785916838478-a3u8zh-response";
const completed = {
  id: messageId,
  role: "assistant",
  backend: "agent",
  taskState: "succeeded",
  remoteTaskStatus: "done",
  remoteTaskId: "task-02",
  title: "Claude 回复",
  output: "任务已经完成。",
  startedAt: 100,
  completedAt: 200,
};
const staleSubmitting = {
  id: messageId,
  role: "assistant",
  backend: "agent",
  taskState: "submitting",
  remoteTaskStatus: "preparing",
  remoteTaskId: "task-02",
  title: "正在发送",
  body: "正在把消息发送给 Agent。",
  startedAt: 100,
};

const mergedMessages = mergeWorkspaceMessages([completed], [staleSubmitting]);
assert.equal(mergedMessages.length, 1);
assert.equal(mergedMessages[0].taskState, "succeeded");
assert.equal(mergedMessages[0].remoteTaskStatus, "done");
assert.equal(mergedMessages[0].output, "任务已经完成。");

const mergedProfile = mergeWorkspaceProfile(
  {
    version: 5,
    activeServerId: "session-02",
    servers: [{ id: "session-02", messages: [completed] }],
  },
  {
    version: 5,
    activeServerId: "session-05",
    servers: [{ id: "session-02", messages: [staleSubmitting] }],
  },
);
assert.equal(mergedProfile.servers[0].messages[0].taskState, "succeeded");
assert.equal(mergedProfile.servers[0].messages[0].output, "任务已经完成。");

const freshCompletion = mergeWorkspaceMessages([staleSubmitting], [completed]);
assert.equal(freshCompletion[0].taskState, "succeeded");
assert.equal(freshCompletion[0].output, "任务已经完成。");

const protectedMachineProfile = mergeWorkspaceProfile(
  {
    servers: [{
      id: "session-09",
      profile: {
        platform: "macos",
        codexCommand: "/Applications/ChatGPT.app/Contents/Resources/codex",
        agentDirectEndpoint: "https://macmini:8787",
        agentDirectAccessToken: "current-token",
        agentDirectTlsFingerprint: "sha256/current",
        machineProfileUpdatedAt: 200,
      },
      messages: [],
    }],
  },
  {
    servers: [{
      id: "session-09",
      profile: {
        platform: "linux",
        codexCommand: "/usr/local/bin/codex",
        agentDirectEndpoint: "",
        agentDirectAccessToken: "",
        agentDirectTlsFingerprint: "",
        machineProfileUpdatedAt: 100,
      },
      messages: [],
    }],
  },
);
assert.equal(protectedMachineProfile.servers[0].profile.platform, "macos");
assert.equal(protectedMachineProfile.servers[0].profile.agentDirectAccessToken, "current-token");
assert.equal(
  protectedMachineProfile.servers[0].profile.codexCommand,
  "/Applications/ChatGPT.app/Contents/Resources/codex",
);

const staleWindowCannotDeleteNewServer = mergeWorkspaceProfile(
  {
    activeServerId: "session-10",
    servers: [
      { id: "session-09", profile: { platform: "macos" }, messages: [] },
      { id: "session-10", profile: { platform: "macos" }, messages: [completed] },
    ],
  },
  {
    activeServerId: "session-09",
    servers: [{ id: "session-09", profile: { platform: "linux" }, messages: [] }],
  },
);
assert.deepEqual(
  staleWindowCannotDeleteNewServer.servers.map((server) => server.id),
  ["session-09", "session-10"],
);
assert.equal(staleWindowCannotDeleteNewServer.servers[1].messages[0].output, "任务已经完成。");

const zeroRevisionMacProfile = mergeWorkspaceProfile(
  {
    servers: [{
      id: "session-09",
      profile: {
        platform: "macos",
        codexCommand: "/Applications/ChatGPT.app/Contents/Resources/codex",
        claudeCommand: "/opt/homebrew/bin/claude",
      },
      messages: [],
    }],
  },
  {
    servers: [{
      id: "session-09",
      profile: {
        platform: "linux",
        codexCommand: "/usr/local/bin/codex",
        claudeCommand: "claude",
      },
      messages: [],
    }],
  },
);
assert.equal(zeroRevisionMacProfile.servers[0].profile.platform, "macos");
assert.equal(
  zeroRevisionMacProfile.servers[0].profile.codexCommand,
  "/Applications/ChatGPT.app/Contents/Resources/codex",
);
assert.equal(zeroRevisionMacProfile.servers[0].profile.claudeCommand, "/opt/homebrew/bin/claude");

const explicitlyDeleted = mergeWorkspaceProfile(
  {
    version: 5,
    workspaceRevision: 7,
    activeServerId: "session-b",
    servers: [
      { id: "session-a", profile: { platform: "macos" }, messages: [] },
      { id: "session-b", profile: { platform: "linux" }, messages: [completed] },
    ],
  },
  {
    version: 5,
    workspaceRevision: 7,
    activeServerId: "session-a",
    servers: [{ id: "session-a", profile: { platform: "macos" }, messages: [] }],
  },
  { baseRevision: 7, deletedServerIds: ["session-b"] },
);
assert.equal(explicitlyDeleted.workspaceRevision, 8);
assert.deepEqual(explicitlyDeleted.servers.map((server) => server.id), ["session-a"]);
assert.equal(explicitlyDeleted.activeServerId, "session-a");
assert.equal(explicitlyDeleted.serverTombstones["session-b"], 8);

const staleSnapshotCannotReviveDeletedServer = mergeWorkspaceProfile(
  explicitlyDeleted,
  {
    version: 5,
    workspaceRevision: 7,
    activeServerId: "session-b",
    servers: [
      { id: "session-a", profile: { platform: "macos" }, messages: [] },
      { id: "session-b", profile: { platform: "linux" }, messages: [completed] },
    ],
  },
  { baseRevision: 7 },
);
assert.deepEqual(staleSnapshotCannotReviveDeletedServer.servers.map((server) => server.id), ["session-a"]);
assert.equal(staleSnapshotCannotReviveDeletedServer.activeServerId, "session-a");
assert.equal(staleSnapshotCannotReviveDeletedServer.serverTombstones["session-b"], 8);

const deleteLastServer = mergeWorkspaceProfile(
  {
    version: 5,
    workspaceRevision: 3,
    activeServerId: "session-only",
    servers: [{ id: "session-only", profile: { platform: "macos" }, messages: [completed] }],
  },
  { version: 5, workspaceRevision: 3, activeServerId: "", servers: [] },
  { baseRevision: 3, deletedServerIds: ["session-only"] },
);
assert.deepEqual(deleteLastServer.servers, []);
assert.equal(deleteLastServer.activeServerId, "");
assert.equal(deleteLastServer.serverTombstones["session-only"], 4);

const replaceMessagesPreservesConcurrentTopologyAndMachineState = mergeWorkspaceProfile(
  {
    version: 5,
    workspaceRevision: 12,
    activeServerId: "session-a",
    servers: [
      {
        id: "session-a",
        profile: {
          platform: "macos",
          machineProfileUpdatedAt: 200,
          sshHostKeyFingerprint: "sha256/current",
          sshIdentityUpdatedAt: 200,
        },
        messages: [completed],
      },
      { id: "session-concurrent", profile: { platform: "linux" }, messages: [completed] },
    ],
  },
  {
    version: 5,
    workspaceRevision: 12,
    activeServerId: "session-a",
    servers: [{
      id: "session-a",
      profile: {
        platform: "linux",
        machineProfileUpdatedAt: 100,
        sshHostKeyFingerprint: "",
        sshIdentityUpdatedAt: 100,
      },
      messages: [],
      rawOutput: "",
      task: {},
    }],
  },
  { baseRevision: 12, replaceMessages: true },
);
assert.deepEqual(
  replaceMessagesPreservesConcurrentTopologyAndMachineState.servers.map((server) => server.id),
  ["session-a", "session-concurrent"],
);
assert.deepEqual(replaceMessagesPreservesConcurrentTopologyAndMachineState.servers[0].messages, []);
assert.equal(replaceMessagesPreservesConcurrentTopologyAndMachineState.servers[0].profile.platform, "macos");
assert.equal(
  replaceMessagesPreservesConcurrentTopologyAndMachineState.servers[0].profile.sshHostKeyFingerprint,
  "sha256/current",
);
assert.equal(replaceMessagesPreservesConcurrentTopologyAndMachineState.servers[1].messages[0].output, "任务已经完成。");
assert.equal(replaceMessagesPreservesConcurrentTopologyAndMachineState.messageResetRevisions["session-a"], 13);

const staleReplaceCannotClearNewerMessages = mergeWorkspaceProfile(
  {
    version: 5,
    workspaceRevision: 12,
    activeServerId: "session-a",
    servers: [{ id: "session-a", profile: { platform: "macos" }, messages: [completed] }],
  },
  {
    version: 5,
    workspaceRevision: 10,
    activeServerId: "session-a",
    servers: [{ id: "session-a", profile: { platform: "macos" }, messages: [] }],
  },
  { baseRevision: 10, replaceMessages: true },
);
assert.equal(staleReplaceCannotClearNewerMessages.servers[0].messages[0].output, "任务已经完成。");
assert.equal(staleReplaceCannotClearNewerMessages.messageResetRevisions["session-a"], undefined);

const futureRevisionCannotBypassMessageCompareAndSet = mergeWorkspaceProfile(
  {
    version: 5,
    workspaceRevision: 12,
    activeServerId: "session-a",
    servers: [{ id: "session-a", profile: { platform: "macos" }, messages: [completed] }],
  },
  {
    version: 5,
    workspaceRevision: 99,
    activeServerId: "session-a",
    servers: [{ id: "session-a", profile: { platform: "macos" }, messages: [] }],
  },
  { baseRevision: 99, replaceMessages: true },
);
assert.equal(futureRevisionCannotBypassMessageCompareAndSet.servers[0].messages[0].output, "任务已经完成。");

const clearedMessages = mergeWorkspaceProfile(
  {
    version: 5,
    workspaceRevision: 7,
    activeServerId: "session-a",
    servers: [{ id: "session-a", profile: { platform: "macos" }, messages: [completed] }],
  },
  {
    version: 5,
    workspaceRevision: 7,
    activeServerId: "session-a",
    servers: [{ id: "session-a", profile: { platform: "macos" }, messages: [] }],
  },
  { baseRevision: 7, replaceMessages: true },
);
assert.deepEqual(clearedMessages.servers[0].messages, []);
assert.equal(clearedMessages.messageResetRevisions["session-a"], 8);

const staleSaveCannotRestoreClearedMessages = mergeWorkspaceProfile(
  clearedMessages,
  {
    version: 5,
    workspaceRevision: 7,
    activeServerId: "session-a",
    servers: [{ id: "session-a", profile: { platform: "macos" }, messages: [completed] }],
  },
  { baseRevision: 7 },
);
assert.deepEqual(staleSaveCannotRestoreClearedMessages.servers[0].messages, []);

const freshRevisionStillCannotInferServerRestore = mergeWorkspaceProfile(
  staleSnapshotCannotReviveDeletedServer,
  {
    version: 5,
    workspaceRevision: staleSnapshotCannotReviveDeletedServer.workspaceRevision,
    activeServerId: "session-b",
    servers: [
      { id: "session-a", profile: { platform: "macos" }, messages: [] },
      { id: "session-b", profile: { platform: "linux" }, messages: [completed] },
    ],
  },
  { baseRevision: staleSnapshotCannotReviveDeletedServer.workspaceRevision },
);
assert.deepEqual(freshRevisionStillCannotInferServerRestore.servers.map((server) => server.id), ["session-a"]);

const rebasedPendingAfterDelete = rebaseWorkspaceProfile(
  explicitlyDeleted,
  {
    version: 5,
    workspaceRevision: 7,
    activeServerId: "session-a",
    servers: [
      { id: "session-a", profile: { platform: "macos", name: "pending-name" }, messages: [] },
      { id: "session-b", profile: { platform: "linux" }, messages: [completed] },
    ],
  },
  {
    baseRevision: 7,
    baseProfile: {
      version: 5,
      workspaceRevision: 7,
      activeServerId: "session-b",
      servers: [
        { id: "session-a", profile: { platform: "macos" }, messages: [] },
        { id: "session-b", profile: { platform: "linux" }, messages: [completed] },
      ],
    },
  },
);
assert.equal(rebasedPendingAfterDelete.workspaceRevision, explicitlyDeleted.workspaceRevision);
assert.deepEqual(rebasedPendingAfterDelete.servers.map((server) => server.id), ["session-a"]);
assert.equal(rebasedPendingAfterDelete.servers[0].profile.name, "pending-name");

const rebasedPendingAfterMessageClear = rebaseWorkspaceProfile(
  clearedMessages,
  {
    version: 5,
    workspaceRevision: 7,
    activeServerId: "session-a",
    servers: [{
      id: "session-a",
      profile: { platform: "macos", name: "pending-name" },
      messages: [completed],
    }],
  },
  {
    baseRevision: 7,
    baseProfile: {
      version: 5,
      workspaceRevision: 7,
      activeServerId: "session-a",
      servers: [{ id: "session-a", profile: { platform: "macos" }, messages: [completed] }],
    },
  },
);
assert.deepEqual(rebasedPendingAfterMessageClear.servers[0].messages, []);
assert.equal(rebasedPendingAfterMessageClear.servers[0].profile.name, "pending-name");
assert.equal(rebasedPendingAfterMessageClear.workspaceRevision, clearedMessages.workspaceRevision);

const staleConfigurationSnapshotIsSideEffectFree = mergeWorkspaceProfile(
  {
    version: 5,
    workspaceRevision: 9,
    activeServerId: "session-a",
    servers: [{
      id: "session-a",
      name: "remote-name",
      profile: { platform: "macos", host: "new-host", port: 22 },
      diagnostics: { source: "remote" },
      messages: [],
    }],
  },
  {
    version: 5,
    workspaceRevision: 8,
    activeServerId: "session-a",
    servers: [{
      id: "session-a",
      name: "old-name",
      profile: { platform: "macos", host: "old-host", port: 22 },
      diagnostics: { source: "old" },
      messages: [{ id: "local-message", role: "user", body: "local" }],
    }],
  },
  { baseRevision: 8 },
);
assert.equal(staleConfigurationSnapshotIsSideEffectFree.workspaceRevision, 9);
assert.equal(staleConfigurationSnapshotIsSideEffectFree.servers[0].name, "remote-name");
assert.equal(staleConfigurationSnapshotIsSideEffectFree.servers[0].profile.host, "new-host");
assert.equal(staleConfigurationSnapshotIsSideEffectFree.servers[0].diagnostics.source, "remote");
assert.deepEqual(staleConfigurationSnapshotIsSideEffectFree.servers[0].messages, []);

const threeWayBaseProfile = {
  version: 5,
  workspaceRevision: 8,
  activeServerId: "session-a",
  servers: [{
    id: "session-a",
    name: "old-name",
    profile: { platform: "macos", host: "old-host", port: 22 },
    diagnostics: { source: "base", localFlag: false },
    messages: [],
  }],
};
const threeWayAuthoritativeProfile = {
  version: 5,
  workspaceRevision: 9,
  activeServerId: "session-a",
  servers: [{
    id: "session-a",
    name: "remote-name",
    profile: { platform: "macos", host: "new-host", port: 22 },
    diagnostics: { source: "remote", localFlag: false },
    messages: [],
  }],
};
const threeWayPendingProfile = {
  version: 5,
  workspaceRevision: 8,
  activeServerId: "session-a",
  servers: [{
    id: "session-a",
    name: "old-name",
    profile: { platform: "macos", host: "old-host", port: 2222 },
    diagnostics: { source: "base", localFlag: true },
    messages: [{ id: "local-message", role: "user", body: "local" }],
  }],
};
const threeWayRebased = rebaseWorkspaceProfile(
  threeWayAuthoritativeProfile,
  threeWayPendingProfile,
  { baseRevision: 8, baseProfile: threeWayBaseProfile },
);
assert.equal(threeWayRebased.workspaceRevision, 9);
assert.equal(threeWayRebased.servers[0].name, "remote-name");
assert.equal(threeWayRebased.servers[0].profile.host, "new-host");
assert.equal(threeWayRebased.servers[0].profile.port, 2222);
assert.equal(threeWayRebased.servers[0].diagnostics.source, "remote");
assert.equal(threeWayRebased.servers[0].diagnostics.localFlag, true);
assert.equal(threeWayRebased.servers[0].messages[0].body, "local");

const orderBase = {
  version: 5,
  workspaceRevision: 30,
  activeServerId: "session-a",
  servers: [
    { id: "session-a", profile: {}, messages: [] },
    { id: "session-b", profile: {}, messages: [] },
  ],
};
const remoteReordered = rebaseWorkspaceProfile(
  { ...orderBase, workspaceRevision: 31, servers: [...orderBase.servers].reverse() },
  {
    ...orderBase,
    servers: [
      { ...orderBase.servers[0], messages: [{ id: "local-order-message", role: "user", body: "local" }] },
      orderBase.servers[1],
    ],
  },
  { baseRevision: 30, baseProfile: orderBase },
);
assert.deepEqual(remoteReordered.servers.map((server) => server.id), ["session-b", "session-a"]);
const locallyReordered = rebaseWorkspaceProfile(
  { ...orderBase, workspaceRevision: 31 },
  { ...orderBase, servers: [...orderBase.servers].reverse() },
  { baseRevision: 30, baseProfile: orderBase },
);
assert.deepEqual(locallyReordered.servers.map((server) => server.id), ["session-b", "session-a"]);
const locallyInserted = rebaseWorkspaceProfile(
  { ...orderBase, workspaceRevision: 31 },
  {
    ...orderBase,
    servers: [
      orderBase.servers[0],
      { id: "session-c", profile: {}, messages: [] },
      orderBase.servers[1],
    ],
  },
  { baseRevision: 30, baseProfile: orderBase },
);
assert.deepEqual(locallyInserted.servers.map((server) => server.id), ["session-a", "session-c", "session-b"]);

const concurrentServer = {
  id: "session-c",
  profile: { platform: "linux", host: "concurrent" },
  messages: [{ id: "c1", role: "user", body: "keep-c" }],
};
const clearScopeRebased = rebaseWorkspaceProfile(
  {
    ...threeWayAuthoritativeProfile,
    workspaceRevision: 14,
    servers: [...threeWayAuthoritativeProfile.servers, concurrentServer],
  },
  {
    ...threeWayPendingProfile,
    servers: [{ ...threeWayPendingProfile.servers[0], messages: [] }],
  },
  {
    baseRevision: 8,
    baseProfile: threeWayBaseProfile,
    replaceMessages: true,
    replaceMessageServerIds: ["session-a"],
  },
);
const clearScopeRetry = mergeWorkspaceProfile(
  {
    ...threeWayAuthoritativeProfile,
    workspaceRevision: 14,
    servers: [...threeWayAuthoritativeProfile.servers, concurrentServer],
  },
  clearScopeRebased,
  {
    baseRevision: 14,
    replaceMessages: true,
    replaceMessageServerIds: ["session-a"],
  },
);
assert.equal(clearScopeRetry.messageResetRevisions["session-a"], 15);
assert.equal(clearScopeRetry.messageResetRevisions["session-c"], undefined);
assert.equal(clearScopeRetry.servers.find((server) => server.id === "session-c").messages[0].body, "keep-c");

const combinedPendingMutation = mergePendingWorkspaceMutations(
  {
    servers: [{ id: "session-a" }],
    baseRevision: 20,
    baseProfile: { workspaceRevision: 20 },
    replaceMessages: true,
    replaceMessageServerIds: ["session-a"],
    deletedServerIds: ["session-b"],
  },
  {
    servers: [{ id: "session-a", name: "latest" }],
    activeServerId: "session-a",
    baseRevision: 20,
    baseProfile: { workspaceRevision: 20 },
    replaceMessages: false,
    deletedServerIds: [],
  },
);
assert.equal(combinedPendingMutation.replaceMessages, true);
assert.deepEqual(combinedPendingMutation.replaceMessageServerIds, ["session-a"]);
assert.deepEqual(combinedPendingMutation.deletedServerIds, ["session-b"]);
assert.equal(combinedPendingMutation.servers[0].name, "latest");
assert.equal(workspaceProfileEffectiveRevision({
  workspaceRevision: 2,
  serverTombstones: { "session-z": 11 },
  messageResetRevisions: { "session-a": 8 },
}), 11);

const electronSource = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
assert.match(electronSource, /mergeWorkspaceProfile\(currentProfile, incomingProfile, \{/);
assert.match(electronSource, /deletedServerIds,/);
assert.doesNotMatch(electronSource, /replaceMessages\s*\?\s*incomingProfile\s*:/);
assert.match(electronSource, /ipcMain\.handle\("aiwb:load-profile", async \(\) => \{\s*await profileSaveChain;/s);
assert.match(electronSource, /if \(baseRevision !== currentRevision\) \{/);
assert.match(electronSource, /profile\.native\.save\.conflict/);

const controllerSource = readFileSync(new URL("../src/app/useWorkbenchController.jsx", import.meta.url), "utf8");
assert.match(controllerSource, /baseRevision,\s*deletedServerIds,\s*replaceMessages,/s);
assert.match(controllerSource, /expectedServers:\s*submittedServers/);
assert.match(controllerSource, /workspaceSaveTimerRef\.current\s*=\s*null/);
assert.match(controllerSource, /deletedServerIds:\s*\[currentId\]/);
assert.match(controllerSource, /rebaseWorkspaceProfile\(canonicalAuthoritativeProfile, pendingProfile/);
assert.match(controllerSource, /baseRevision:\s*workspaceRevisionRef\.current,[\s\S]*schedulePendingWorkspaceSave/s);
assert.doesNotMatch(controllerSource, /serversRef\.current\.length\s*\?\s*serversRef\.current\s*:\s*servers/);

console.log("workspace profile merge regression: ok");
