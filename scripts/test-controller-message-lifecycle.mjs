import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  agentPreferredForProfile,
  dedupeRemoteTaskMessages,
  isMessageListDiagnostic,
  lastRecoverableAgentResponse,
  messageTextKey,
  reconcileServerMessageLifecycle,
} from "../src/app/controllerMessageLifecycle.js";
import {
  taskStateRunning,
  taskStateSucceeded,
  taskStateSyncing,
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

const recoveredAfterTcpShutdown = reconcileServerMessageLifecycle({
  id: "server-2",
  profile: { agentId: "claude" },
  messages: [
    {
      id: "response-disconnected",
      role: "assistant",
      backend: "agent",
      agentId: "claude",
      remoteTaskId: "task-accepted-before-disconnect",
      remoteTaskStatus: "running",
      taskState: "failed",
      title: "远端执行失败",
      body: "SSH command failed: NIOSSHError.tcpShutdown",
      completedAt: 900,
      createdAtMs: 800,
    },
  ],
});
assert.equal(recoveredAfterTcpShutdown.messages[0].taskState, taskStateSyncing);
assert.equal(recoveredAfterTcpShutdown.messages[0].remoteTaskStatus, "sync-lost");
assert.equal(recoveredAfterTcpShutdown.messages[0].completedAt, undefined);
assert.equal(recoveredAfterTcpShutdown.task.remoteTaskId, "task-accepted-before-disconnect");

assert.equal(agentPreferredForProfile({ platform: "windows" }), true);
assert.equal(agentPreferredForProfile({ platform: "linux" }), true);
assert.equal(messageTextKey({ promptText: " 继续执行 " }), "继续执行");
assert.equal(isMessageListDiagnostic({ title: "消息列表已拉取" }), true);
assert.equal(isMessageListDiagnostic({ title: "Claude 输出已刷新" }), true);
assert.equal(isMessageListDiagnostic({ title: "Claude 回复" }), false);

const submissionWithoutTaskId = {
  id: "response-submit-interrupted",
  role: "assistant",
  backend: "agent",
  agentId: "claude",
  taskState: "submitting",
  remoteTaskStatus: "preparing",
  promptText: "继续完成任务",
};
assert.equal(
  lastRecoverableAgentResponse([submissionWithoutTaskId]),
  submissionWithoutTaskId,
  "an interrupted submission without a persisted task id must still enter conversation recovery",
);
const syncingWithoutTaskId = {
  ...submissionWithoutTaskId,
  id: "response-sync-interrupted",
  taskState: "syncing",
  remoteTaskStatus: "syncing",
};
assert.equal(
  lastRecoverableAgentResponse([syncingWithoutTaskId]),
  syncingWithoutTaskId,
  "a recovery placeholder without a task id must survive an App restart",
);

const controllerSource = readFileSync(
  new URL("../src/app/useWorkbenchController.jsx", import.meta.url),
  "utf8",
);
const sendTaskSource = controllerSource.slice(
  controllerSource.indexOf("  async function sendTask(textOverride, options = {}) {"),
  controllerSource.indexOf("  async function startVoiceInput(", controllerSource.indexOf("  async function sendTask(textOverride, options = {}) {")),
);
const optimisticSendIndex = sendTaskSource.indexOf("const selectedAgent = agentById");
const clearComposerIndex = sendTaskSource.indexOf('setComposer("");', optimisticSendIndex);
const appendLocalMessagesIndex = sendTaskSource.indexOf("setServerMessages(serverId, (items) => {", optimisticSendIndex);
const awaitConnectionIndex = sendTaskSource.indexOf("await connectExistingSession(serverId);");
assert.ok(clearComposerIndex >= 0 && clearComposerIndex < awaitConnectionIndex);
assert.ok(appendLocalMessagesIndex >= 0 && appendLocalMessagesIndex < awaitConnectionIndex);
assert.match(sendTaskSource, /消息已保存在本地，但没有发送到远端/);

const connectSessionSource = controllerSource.slice(
  controllerSource.indexOf("  async function connectExistingSessionOnce(serverId) {"),
  controllerSource.indexOf("  useEffect(() => {", controllerSource.indexOf("  async function connectExistingSessionOnce(serverId) {")),
);
assert.doesNotMatch(connectSessionSource, /if \(busyRef\.current\) return false;/);
assert.doesNotMatch(connectSessionSource, /setBusy\(true\)|setBusy\(false\)/);
assert.match(
  connectSessionSource,
  /if \(!settingsOpenRef\.current\) \{[\s\S]*?setEditingServerId\(target\.id\)/,
  "a background reconnect must not replace the settings target while settings are open",
);
assert.doesNotMatch(
  connectSessionSource,
  /!settingsOpenRef\.current \|\| editingServerIdRef\.current !== target\.id/,
);
assert.doesNotMatch(
  connectSessionSource,
  /connectionIsLive\(server\.connection\)[\s\S]*?readyConnectionForSession\(server\.profile, server\.connection\)/,
);

const switchFromVoiceSource = controllerSource.slice(
  controllerSource.indexOf("  async function switchToServerFromVoice("),
  controllerSource.indexOf("  async function playLastResultForVoiceCommand", controllerSource.indexOf("  async function switchToServerFromVoice(")),
);
assert.doesNotMatch(switchFromVoiceSource, /setServerConnection\(/);
assert.match(controllerSource, /await sendTask\(text, \{ retryMessage: message \}\);/);
assert.match(controllerSource, /async function sendTask\(textOverride, options = \{\}\)/);
assert.match(controllerSource, /const reuseMessage = existingRetryMessage \|\| null;/);
assert.match(controllerSource, /retryCount: Number\(item\.retryCount \|\| 0\) \+ 1/);
assert.match(controllerSource, /function commitServerPatch\(patch, \{ persistDelay = 250, persist = true \} = \{\}\)/);
assert.match(controllerSource, /function patchServersByConnection\(targetProfile, updater, options = \{\}\)/);
assert.match(controllerSource, /function updateServer\(serverId, updater\)/);
assert.match(controllerSource, /allowCachedReady = false/);
assert.match(controllerSource, /agent\.startup\.cached/);
assert.match(controllerSource, /allowCachedReady: true/);
assert.match(controllerSource, /refreshAgentHealthForServer\(target\.id, "background-connect"\)/);
assert.match(controllerSource, /title: "正在刷新最后一条结果"/);
assert.match(controllerSource, /agentDirectRequest\(directProfile, "\/v1\/cache\/clear"/);
const openGlobalSettingsSource = controllerSource.slice(
  controllerSource.indexOf("  function openGlobalSettings("),
  controllerSource.indexOf("  function openCloudSyncSettings(", controllerSource.indexOf("  function openGlobalSettings(")),
);
assert.match(openGlobalSettingsSource, /editingServerIdRef\.current = "global"/);
assert.match(openGlobalSettingsSource, /settingsOpenRef\.current = true/);
const followActiveSettingsSource = controllerSource.slice(
  controllerSource.indexOf("  function followActiveSessionInSettings("),
  controllerSource.indexOf("  // Connection probes complete asynchronously.", controllerSource.indexOf("  function followActiveSessionInSettings(")),
);
assert.match(followActiveSettingsSource, /if \(settingsOpenRef\.current\) return false/);
const authoritativeWorkspaceSource = controllerSource.slice(
  controllerSource.indexOf("  function applyAuthoritativeWorkspaceProfile("),
  controllerSource.indexOf("  useEffect(() => {", controllerSource.indexOf("  function applyAuthoritativeWorkspaceProfile(")),
);
assert.match(authoritativeWorkspaceSource, /followActiveSessionInSettings\(active\)/);
assert.doesNotMatch(authoritativeWorkspaceSource, /setEditingServerId\(/);
const agentRouteSource = controllerSource.slice(
  controllerSource.indexOf("const probedAgent = parseWorkbenchAgentOutput(probeOutput);"),
  controllerSource.indexOf("const conversationId = ensureServerConversationId"),
);
assert.match(agentRouteSource, /patchServersByConnection\(/);
assert.doesNotMatch(agentRouteSource, /\bsetServers\(/);
assert.doesNotMatch(controllerSource, /SSH 直连中|改用 SSH 直连|Agent 自动降级/);

const chatSource = readFileSync(new URL("../src/features/chat.jsx", import.meta.url), "utf8");
assert.match(chatSource, /const canRetryFailedMessage = Boolean\(/);
assert.match(chatSource, />\s*重试\s*</);
assert.match(chatSource, /aria-label="文件下载进度"/);

const iphoneShellSource = readFileSync(
  new URL("../src/platforms/iphone/IphoneWorkbenchShell.jsx", import.meta.url),
  "utf8",
);
assert.match(iphoneShellSource, /maximum-scale=1\.0, user-scalable=no/);
assert.match(iphoneShellSource, /function resetIphonePageOffset\(\)/);
assert.doesNotMatch(iphoneShellSource, /scrollIntoView\(/);
assert.doesNotMatch(iphoneShellSource, /setProperty\("--app-viewport-(?:width|height)"/);
const settingsSource = readFileSync(new URL("../src/features/settings.jsx", import.meta.url), "utf8");
assert.doesNotMatch(settingsSource, /setProperty\("--app-viewport-(?:width|height)"/);
assert.match(controllerSource, /visualViewport\?\.addEventListener\("scroll", updateViewportSize\)/);

const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
assert.match(
  stylesSource,
  /\.iphone-shell :is\(input, textarea, select\) \{[\s\S]*?font-size:\s*16px !important/,
);
const sentMessageStyle = stylesSource.slice(
  stylesSource.indexOf(".user-prompt .user-message-card {"),
  stylesSource.indexOf("}", stylesSource.indexOf(".user-prompt .user-message-card {")) + 1,
);
assert.match(sentMessageStyle, /width:\s*fit-content/);
assert.match(sentMessageStyle, /max-width:\s*min\(560px,\s*78%\)/);
const sentMessageParagraphStyle = stylesSource.slice(
  stylesSource.indexOf(".conversation .user-prompt .user-message-card > p,"),
  stylesSource.indexOf("}", stylesSource.indexOf(".conversation .user-prompt .user-message-card > p,")) + 1,
);
assert.match(sentMessageParagraphStyle, /margin:\s*0/);
assert.match(sentMessageParagraphStyle, /background:\s*transparent/);

console.log("controller message lifecycle regression: ok");
