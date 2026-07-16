import * as Foundation from "./foundation.js";
import * as Agent from "./agent.js";
import * as RemoteCommands from "./remoteCommands.js";
import * as RemoteFiles from "./remoteFiles.js";

const {
  SSHWorkbench,
  VoiceWorkbench,
  agentCommand,
  agentRuntimeProfile,
  agents,
  appLog,
  appearanceModeOptions,
  appendBrowserDiagnosticLog,
  appendUploadedImagesToPrompt,
  applyGlobalSettings,
  assetBase,
  assetPath,
  automaticTaskWakePhrases,
  bashCommand,
  browserDiagnosticLogStorageKey,
  buildAgentSendCommand,
  buildCaptureCommand,
  buildClaudePrintCommand,
  buildCodexExecCommand,
  buildCodexLoginDeviceCommand,
  buildDiscoveryCommand,
  buildHealthCommand,
  buildInstallWorkbenchAgentCommand,
  buildInterruptCommand,
  buildKillCommand,
  buildModelChoiceCommand,
  buildRemoteFileReadCommand,
  buildRemoteImageUploadCommand,
  buildWindowsCodexExecCommand,
  buildWindowsDiscoveryCommand,
  buildWindowsHealthCommand,
  buildWindowsNoTmuxCommand,
  buildWindowsUnsupportedAgentCommand,
  buildWorkbenchAgentCancelCommand,
  buildWorkbenchAgentConversationListCommand,
  buildWorkbenchAgentConversationStatusCommand,
  buildWorkbenchAgentCreateCommand,
  buildWorkbenchAgentStatusCommand,
  buildWorkspaceMigrationPayload,
  builtInAliyunVoiceConfig,
  chineseNumber,
  claudeSetupAutomationSnippet,
  cleanBase64Payload,
  clipPersistedText,
  codeFileExtensions,
  commandDiagnosticPayload,
  commandName,
  compactInlineText,
  connectionForAppLaunch,
  connectionIsLive,
  conversationBottomThreshold,
  createConversationId,
  createMessage,
  createRemoteTaskId,
  createServerId,
  createServerSession,
  currentResultPlaybackPhrases,
  defaultProfile,
  defaultWakeWordPhrases,
  desktopBridge,
  directoryPrefKey,
  directoryPrefsStorageKey,
  directoryUsageBadge,
  dirnameRemote,
  dirnameWindows,
  discoverySeedWorkdir,
  displayMarker,
  displayMarkers,
  dormantConnectionForProfile,
  extractRemoteFileReferences,
  fileToImageAttachment,
  finalAnswerEnd,
  finalAnswerStart,
  formatAgentPrompt,
  formatDuration,
  globalSettingsFromProfile,
  healthFromWorkbenchAgentStatus,
  imageExtensionFromFile,
  imageUploadRemoteName,
  initialConnectionForProfile,
  isAbsoluteRemotePath,
  isEventLike,
  isGlobalWakePhrase,
  isLegacyDefaultWorkdir,
  isNoisyDiagnosticKey,
  isSensitiveDiagnosticKey,
  isSpeechStopPhrase,
  isUrlLikeFileCandidate,
  isWindowsProfile,
  isWslProfile,
  joinRemotePath,
  joinWindowsPath,
  lastSpeakableMessageForServer,
  legacyDefaultWakeWordPhrases,
  legacyDefaultWorkdirs,
  loadBrowserDiagnosticLogs,
  loadDirectoryPrefs,
  loadLocalMessageHistory,
  loadManualWorkdirHistory,
  loadWorkspaceMirror,
  localMessageHistoryFromServers,
  localMessageHistoryStorageKey,
  mainAIRouteSchema,
  mainAIRouterInstructions,
  manualWorkdirHistoryStorageKey,
  manualWorkdirScope,
  markerLabels,
  maxDownloadFileBytes,
  maxImageAttachmentBytes,
  maxPersistedMessagesPerServer,
  maxPersistedTextLength,
  maxPreviewFileBytes,
  mergeAgentConversationsIntoDiscovery,
  mergeDirectoryPrefs,
  mergeImportedServers,
  mergeLocalMessageHistory,
  mergeManualWorkdirHistory,
  messageCounter,
  messagesForStorage,
  migrationFileKind,
  migrationFileName,
  migrationFileVersion,
  normalizeAppearanceMode,
  normalizeDirectoryPrefs,
  normalizeDiscovery,
  normalizeManualWorkdirHistory,
  normalizePersistedMessage,
  normalizeProfile,
  normalizeResultAudioMode,
  normalizeServerPlatform,
  normalizeVoiceText,
  normalizeWorkspaceStore,
  parseDiscovery,
  parseHealth,
  parsePlaybackCommandIndex,
  parseRemoteFilePayload,
  parseRemoteImageUploadPayload,
  parseSessionSelectionKey,
  parseSessionSwitchIndex,
  parseSmallChineseNumber,
  parseWorkbenchAgentConversations,
  parseWorkbenchAgentOutput,
  parseWorkspaceMigrationText,
  playbackCommandMatchFromPhrase,
  playbackPhrasesForServer,
  powershellCommand,
  powershellStdinCommand,
  previewFileExtensionPattern,
  previewFileExtensions,
  previewKindFromExtension,
  previewLabelFromKind,
  previewMimeFromExtension,
  profileConnectionKey,
  profileIssue,
  profileReady,
  profileWithDetectedTools,
  psQuote,
  readFileAsDataUrl,
  readableVoiceNameCandidate,
  readyConnectionForSession,
  recentManualWorkdirs,
  rememberManualWorkdir,
  remoteBasename,
  remoteBashCommand,
  remoteFileExtension,
  remoteFilePayloadOverhead,
  remoteFileResponseSizeForBytes,
  resultAudioModeOptions,
  sameWorkdir,
  sanitizeDiagnosticValue,
  sanitizeId,
  sanitizeUploadName,
  saveDirectoryPrefs,
  saveLocalMessageHistory,
  saveManualWorkdirHistory,
  saveWorkspaceMirror,
  serializeWakePhrases,
  serializeWorkspaceMigrationStore,
  serializeWorkspaceStore,
  serverCompletionSpeech,
  serverDisplayName,
  serverPlatformDefaults,
  serverPlatformLabel,
  serverPlatforms,
  serverSessionName,
  serverTaskRunning,
  serverTaskState,
  sessionName,
  sessionSelectionKey,
  shQuote,
  sleep,
  speakAssistantText,
  speechInterruptContextForServers,
  speechInterruptPhrases,
  speechTextFromMessage,
  stopAssistantSpeech,
  stripFileCandidate,
  stripLegacyDefaultWorkdirFromPlaceholder,
  stripTextForSpeech,
  taskForStorage,
  taskTextFromValue,
  taskWakeMatchFromPhrase,
  taskWakeMatchFromText,
  taskWakePhrasesForServer,
  timestampFromAgentTime,
  toBase64Bytes,
  toBase64Utf16Le,
  toBase64Utf8,
  toggleListValue,
  trimVisibleText,
  ttsModelOptions,
  userBodyWithUploadedImages,
  voiceToneOptions,
  waitUntil,
  wakeContextForServers,
  wakePhrasesForProfile,
  wakePhrasesFromText,
  workbenchAgentAvailableFromOutput,
  workbenchAgentScript,
  workbenchAgentVersionNumber,
  workdirDisplayName,
  workspaceDiagnosticSummary,
  workspaceMirrorStorageKey,
  workspaceStoreHasServers
} = { ...Foundation, ...Agent, ...RemoteCommands, ...RemoteFiles };

export function shortError(error) {
  const message = String(error?.message || error || "未知错误").replace(
    /^Error invoking remote method '[^']+': Error:\s*/i,
    "",
  );
  if (/All configured authentication methods failed/i.test(message)) {
    return "SSH 登录失败：用户名或密码不正确。请手动重新输入 Windows 账户密码，不要使用系统自动填充。";
  }
  if (/Authentication failed/i.test(message)) {
    return "SSH 登录失败：请检查用户名和登录密码。";
  }
  if (/Unable to exec/i.test(message)) {
    return "SSH 已连上，但远端系统拒绝执行命令。Windows 机器请确认 OpenSSH Server 可执行 PowerShell，或改用 Windows + WSL 模式。";
  }
  if (/Timed out while waiting for handshake|Keepalive timeout|Connection lost before handshake/i.test(message)) {
    return "SSH 状态连接暂时中断：远端任务不一定失败，App 会保留任务并在连接恢复后继续同步。";
  }
  if (/SSH command timed out|timed out/i.test(message)) {
    return "远端任务执行时间太长，App 暂时没有等到结果。任务可能仍在机器上运行，可以稍后刷新或重试。";
  }
  if (/Connection lost before handshake|Handshake failed|Connection lost|Connection closed|ECONNRESET|EPIPE|Socket closed/i.test(message)) {
    return "SSH 同步连接临时中断：后台任务可能仍在服务器运行，网络恢复后会自动同步结果。";
  }
  if (/ECONNREFUSED|Connection refused/i.test(message)) {
    return "连接被拒绝：请确认这台机器已开启 SSH，并且端口没有被防火墙拦截。";
  }
  if (/ENOTFOUND|getaddrinfo/i.test(message)) {
    return "找不到这台机器：请检查 IP 或域名是否正确。";
  }
  if (/Permission denied/i.test(message)) {
    return "远端权限不足：当前账号没有权限访问这个目录或执行这个命令。";
  }
  return message;
}

export function isTransientSshSyncError(error) {
  const message = String(error?.message || error || "");
  return /Timed out while waiting for handshake|Keepalive timeout|SSH command timed out|Connection lost before handshake|Handshake failed|Connection lost|Connection closed|ECONNRESET|EPIPE|Socket closed|No response from server|Client network socket disconnected/i.test(
    message,
  );
}

export function isCodexLoginPrompt(output) {
  const text = String(output || "");
  return /Sign in with ChatGPT/i.test(text) && /Sign in with Device Code/i.test(text);
}

export function isCodexModelChoicePrompt(output) {
  const text = String(output || "");
  return /Introducing GPT-5\.5/i.test(text) && /Try new model/i.test(text) && /Use existing model/i.test(text);
}

export function extractCodexLoginInstructions(output) {
  const text = stripTerminalControl(output);
  const url = text.match(/https:\/\/auth\.openai\.com\/codex\/device/i)?.[0] || "";
  const code = text.match(/\b[A-Z0-9]{4}-[A-Z0-9]{5}\b/)?.[0] || "";

  if (!url && !code) return trimVisibleText(text);

  return trimVisibleText(
    [
      url ? `登录链接：${url}` : "",
      code ? `验证码：${code}` : "",
      "完成浏览器登录后，回到 AI Workbench 重新发送任务。",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export function detectAgentIssue(output, agent) {
  const text = String(output || "");
  const finalStartIndex = text.indexOf(finalAnswerStart);
  const finalEndIndex = text.indexOf(finalAnswerEnd, finalStartIndex + finalAnswerStart.length);
  if (finalStartIndex >= 0 && finalEndIndex > finalStartIndex + finalAnswerStart.length) {
    return "";
  }
  if (/401 Unauthorized/i.test(text)) {
    return `${agent.shortName} 登录已过期。请先生成设备码完成登录，然后重新发送任务。`;
  }
  if (/tmux session not running/i.test(text)) {
    return `${agent.shortName} 会话没有保持运行，这次任务没有完成。请先点“检查服务器”，再重新发送。`;
  }
  if (/Windows PowerShell 模式暂时不能使用持续会话/i.test(text)) {
    return `${agent.shortName} 在 Windows PowerShell 模式暂时不能使用持续会话。请改选 Windows + WSL，或把 ${agent.shortName} 安装到 WSL/Linux 环境。`;
  }
  if (text.includes(`AI Workbench: ${agent.shortName} 已退出`)) {
    return `${agent.shortName} 没有启动成功。原始原因已放在“详情”里，通常是服务器上的命令路径、登录状态或工具配置需要处理。`;
  }
  return "";
}

export function cleanAgentFailureDetail(raw) {
  const text = trimVisibleText(stripTerminalControl(raw));
  if (!text) return "";

  if (text.includes("__AIWB_AGENT_")) {
    const parsed = parseWorkbenchAgentOutput(text);
    if (parsed.status || parsed.taskId || parsed.taskStatus) {
      const output = trimVisibleText(stripTerminalControl(parsed.output || ""));
      const lines = [
        parsed.status ? `Agent 状态：${parsed.status}` : "",
        parsed.version ? `Agent 版本：${parsed.version}` : "",
        parsed.serviceStatus ? `服务状态：${parsed.serviceStatus}` : "",
        parsed.daemonStatus ? `Daemon 状态：${parsed.daemonStatus}` : "",
        parsed.daemonHeartbeat ? `Daemon 心跳：${parsed.daemonHeartbeat}` : "",
        parsed.taskId ? `任务 ID：${parsed.taskId}` : "",
        parsed.blockedByTaskId ? `占用任务 ID：${parsed.blockedByTaskId}` : "",
        parsed.taskStatus ? `任务状态：${parsed.taskStatus}` : "",
        parsed.exitCode ? `退出码：${parsed.exitCode}` : "",
        parsed.pid ? `PID：${parsed.pid}` : "",
        parsed.attempts ? `启动次数：${parsed.attempts}` : "",
        parsed.startedAt ? `开始时间：${parsed.startedAt}` : "",
        parsed.runnerStartedAt ? `Runner 启动时间：${parsed.runnerStartedAt}` : "Runner 启动时间：未启动",
        parsed.finishedAt ? `结束时间：${parsed.finishedAt}` : "",
        parsed.queuedTasks ? `排队任务：${parsed.queuedTasks}` : "",
        parsed.runningTasks ? `运行任务：${parsed.runningTasks}` : "",
        parsed.errorTasks ? `失败任务：${parsed.errorTasks}` : "",
        parsed.cancelledTasks ? `取消任务：${parsed.cancelledTasks}` : "",
        parsed.hostCpuPercent ? `CPU：${parsed.hostCpuPercent}%` : "",
        parsed.hostMemPercent ? `内存：${parsed.hostMemPercent}%` : "",
        parsed.hostDiskPercent ? `磁盘：${parsed.hostDiskPercent}%` : "",
        parsed.hostLoadAvg ? `负载：${parsed.hostLoadAvg}` : "",
        output ? "\n输出：" : "",
        output,
      ];
      return clipPersistedText(lines.filter(Boolean).join("\n"), 12_000);
    }
  }

  return clipPersistedText(text, 12_000);
}

export function classifyAgentFailure(raw, agent, status = {}) {
  const text = String(raw || status?.raw || "");
  const taskStatus = String(status?.taskStatus || "").toLowerCase();
  const exitCode = String(status?.exitCode || "").trim();
  const detail = cleanAgentFailureDetail(text);
  const blockedByTaskId = String(status?.blockedByTaskId || status?.taskId || "").trim();
  if (taskStatus === "busy" || /conversation already has a queued or running task/i.test(text)) {
    return {
      kind: "agent_conversation_busy",
      title: "这个会话正在执行",
      body: "同一个会话一次只能处理一个任务。你刚才这条新请求没有发送，避免打断或污染正在执行的上下文。",
      hint: blockedByTaskId
        ? `可以等待当前任务完成，或取消当前任务后重新发送。当前任务 ID：${blockedByTaskId}`
        : "可以等待当前任务完成，或取消当前任务后重新发送。",
      detail,
      canRetry: false,
      canOpenSettings: false,
    };
  }

  const unavailableModel =
    text.match(/issue with the selected model\s*\(([^)]+)\)/i)?.[1]?.trim() ||
    text.match(/model\s+["']?([^"'\s]+)["']?\s+(?:does not exist|is not available)/i)?.[1]?.trim() ||
    "";
  if (unavailableModel || (/api_error_status["']?\s*:\s*404/i.test(text) && /selected model/i.test(text))) {
    return {
      kind: "agent_model_unavailable",
      title: `${agent.shortName} 模型不可用`,
      body: unavailableModel
        ? `当前会话选择的模型 ${unavailableModel} 不存在，或这个账号没有访问权限。`
        : "当前会话选择的模型不存在，或这个账号没有访问权限。",
      hint: "请在会话设置里改用默认模型或官方别名后重新发送。",
      detail,
      canRetry: true,
      canOpenSettings: true,
    };
  }

  const staleRunner =
    /task was marked running, but the runner process is not alive/i.test(text) ||
    /runner process is not alive/i.test(text) ||
    /runner pid:\s*missing/i.test(text) ||
    (taskStatus === "error" && exitCode === "124" && !String(status?.pid || "").trim());
  const daemonUnavailable =
    /daemon is not running|queued task cannot start|daemon did not start/i.test(text) ||
    (taskStatus === "error" && exitCode === "125");

  if (staleRunner) {
    return {
      kind: "agent_stale_runner",
      title: "后台任务没有真正启动",
      body: "服务器 Agent 发现这条任务没有对应的后台进程，已自动结束。",
      hint: "通常是旧版 Agent 留下的异常任务，重新发送即可；如果连续出现，再到设置里重新安装 Agent。",
      detail,
      canRetry: true,
      canOpenSettings: true,
    };
  }

  if (daemonUnavailable) {
    return {
      kind: "agent_daemon_unavailable",
      title: "Agent 后台服务没有启动",
      body: "服务器 Agent 的常驻服务没有启动成功，这条排队任务无法继续。",
      hint: "App 会自动改用 SSH 直连继续执行；之后可以到设置里重新安装 Agent 服务。",
      detail,
      canRetry: true,
      canOpenSettings: true,
    };
  }

  if (taskStatus === "missing") {
    return {
      kind: "agent_task_missing",
      title: "找不到这条后台任务",
      body: "服务器上没有找到这条任务记录，可能是 Agent 数据被清理或机器重启后丢失。",
      hint: "可以重新发送任务；如果经常出现，建议重新安装 Agent。",
      detail,
      canRetry: true,
      canOpenSettings: true,
    };
  }

  if (taskStatus === "cancelled") {
    return {
      kind: "agent_task_cancelled",
      title: `${agent.shortName} 任务已取消`,
      body: "这条后台任务已经停止，输入框已释放。",
      hint: "需要继续时可以重新发送同一条任务。",
      detail,
      canRetry: true,
      canOpenSettings: false,
    };
  }

  const issue = detectAgentIssue(text, agent);
  if (issue) {
    return {
      kind: "agent_tool_issue",
      title: `${agent.shortName} 没有启动成功`,
      body: issue,
      hint: "处理好服务器上的登录、命令路径或工具配置后，再重新发送任务。",
      detail,
      canRetry: true,
      canOpenSettings: true,
    };
  }

  if (taskStatus === "error") {
    return {
      kind: "agent_task_error",
      title: `${agent.shortName} 后台任务失败`,
      body: "Agent 已经结束这条任务，但远端工具没有返回可直接展示的最终结果。",
      hint: "可以查看详情定位原因，修复后重新发送。",
      detail,
      canRetry: true,
      canOpenSettings: true,
    };
  }

  return null;
}

export function formatAgentFailureCopy(message, overrideFailure) {
  const failure = overrideFailure || message?.agentFailure || {};
  const detail = failure.detail || message?.technicalDetail || "";
  return [
    failure.title || message?.title || "后台任务失败",
    failure.body || message?.body || "",
    failure.hint || "",
    message?.remoteTaskId ? `任务 ID：${message.remoteTaskId}` : "",
    detail ? "\n技术详情：" : "",
    detail,
  ]
    .filter(Boolean)
    .join("\n");
}

export function stripTerminalControl(text) {
  return String(text || "")
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "");
}
