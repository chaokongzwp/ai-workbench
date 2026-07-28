import * as Foundation from "./foundation.js";
import * as Agent from "./agent.js";
import * as RemoteCommands from "./remoteCommands.js";
import * as RemoteFiles from "./remoteFiles.js";
import * as AgentOutput from "./agentOutput.js";
import {
  taskStateForMessage,
  taskStateIsActive,
  taskStateSucceeded,
} from "./messageLifecycle.js";

const {
  SSHWorkbench,
  VoiceWorkbench,
  agentCommand,
  agentModelLabel,
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
  classifyAgentFailure,
  claudeSetupAutomationSnippet,
  cleanAgentFailureDetail,
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
  detectAgentIssue,
  directoryPrefKey,
  directoryPrefsStorageKey,
  directoryUsageBadge,
  dirnameRemote,
  dirnameWindows,
  discoverySeedWorkdir,
  displayMarker,
  displayMarkers,
  dormantConnectionForProfile,
  extractCodexLoginInstructions,
  extractRemoteFileReferences,
  fileToImageAttachment,
  finalAnswerEnd,
  finalAnswerStart,
  formatAgentFailureCopy,
  formatAgentPrompt,
  formatDuration,
  globalSettingsFromProfile,
  healthFromWorkbenchAgentStatus,
  imageExtensionFromFile,
  imageUploadRemoteName,
  initialConnectionForProfile,
  isAbsoluteRemotePath,
  isCodexLoginPrompt,
  isCodexModelChoicePrompt,
  isEventLike,
  isGlobalWakePhrase,
  isLegacyDefaultWorkdir,
  isNoisyDiagnosticKey,
  isSensitiveDiagnosticKey,
  isSpeechStopPhrase,
  isTransientSshSyncError,
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
  sessionName,
  sessionSelectionKey,
  shQuote,
  shortError,
  sleep,
  speakAssistantText,
  speechInterruptContextForServers,
  speechInterruptPhrases,
  speechTextFromMessage,
  stopAssistantSpeech,
  stripFileCandidate,
  stripLegacyDefaultWorkdirFromPlaceholder,
  stripTerminalControl,
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
} = { ...Foundation, ...Agent, ...RemoteCommands, ...RemoteFiles, ...AgentOutput };

function trimVisibleText(text) {
  return String(text || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function messageDisplayText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return trimVisibleText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return trimVisibleText(value.map(messageDisplayText).filter(Boolean).join("\n"));
  if (typeof value === "object") {
    for (const key of ["text", "output", "body", "content", "message", "reply", "title"]) {
      if (value[key] !== undefined) {
        const text = messageDisplayText(value[key]);
        if (text) return text;
      }
    }
  }
  return "";
}

export function mainAIRouterReady(profile) {
  return Boolean(profile?.mainAIEnabled && String(profile?.openAIAPIKey || "").trim());
}

export function agentById(agentId, fallback = agents[0]) {
  return agents.find((item) => item.id === agentId) || fallback;
}

export function latestServerMessageSummary(server) {
  const messages = Array.isArray(server?.messages) ? server.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || taskStateIsActive(taskStateForMessage(message))) continue;
    const text = messageDisplayText(message.output || message.body || message.title);
    if (!text) continue;
    return compactInlineText(message.role === "user" ? `你：${text}` : text, 32);
  }
  return "";
}

export function serverSidebarMeta(server, index, connected = false) {
  const connection = server?.connection || {};
  const latestAssistant = [...(Array.isArray(server?.messages) ? server.messages : [])]
    .reverse()
    .find((message) => message?.role === "assistant");
  if (serverTaskRunning(server)) return compactInlineText(latestAssistant?.title || "正在等待 AI 回复", 32);
  if (
    taskStateForMessage(latestAssistant) === taskStateSucceeded &&
    latestAssistant?.completedAt &&
    Date.now() - Number(latestAssistant.completedAt) < 5 * 60 * 1000
  ) {
    return "刚完成";
  }
  if (connection.state === "error") return compactInlineText(connection.detail || "连接异常", 32);

  const latest = latestServerMessageSummary(server);
  if (latest) return latest;

  const profile = normalizeProfile(server?.profile);
  const agent = agentById(profile.agentId);
  const modelLabel = agentModelLabel(agent.id, profile.aiModel);
  const agentLabel = [agent.shortName, modelLabel].filter(Boolean).join(" · ");
  if (connected) return `${agentLabel} · 可继续`;
  return `${agentLabel} · ${serverPlatformLabel(profile)}`;
}

export function connectionModeForServer(server, liveConnection = null) {
  const connection = liveConnection || server?.connection || {};
  const explicitMode = String(connection.mode || connection.transport || connection.backend || "").toLowerCase();
  const profile = normalizeProfile(server?.profile || {});
  if (server?.task?.backend === "agent") {
    return { id: "agent", label: "Agent 代理", shortLabel: "Agent", description: "通过远端 Agent 后台执行" };
  }
  if (explicitMode === "agent" && profile.useWorkbenchAgent === true) {
    return { id: "agent", label: "Agent 代理", shortLabel: "Agent", description: "通过远端 Agent 后台执行" };
  }
  if (explicitMode === "ssh") {
    return { id: "ssh", label: "直接 SSH", shortLabel: "SSH", description: "通过 SSH 直连执行" };
  }
  const diagnostics = server?.diagnostics || {};
  if ((diagnostics.agent === "available" || diagnostics.agent_version) && profile.useWorkbenchAgent === true) {
    return { id: "agent", label: "Agent 代理", shortLabel: "Agent", description: "远端 Agent 已可用" };
  }
  return { id: "ssh", label: "直接 SSH", shortLabel: "SSH", description: "通过 SSH 直连执行" };
}

export function connectionModeFromHealth(health) {
  return health?.agent === "available" || health?.agent_version ? "agent" : "ssh";
}

export function numericMetric(value) {
  const number = Number(String(value ?? "").replace(/%/g, ""));
  return Number.isFinite(number) ? number : null;
}

export function hostMetric(health, key) {
  if (!health) return "";
  return health[`agent_host_${key}`] || health[`host_${key}`] || "";
}

export function hostPerformanceLevel(health) {
  const cpu = numericMetric(hostMetric(health, "cpu_percent"));
  const mem = numericMetric(hostMetric(health, "mem_percent"));
  const disk = numericMetric(hostMetric(health, "disk_percent"));
  if ([cpu, mem, disk].some((value) => value !== null && value >= 90)) return "压力大";
  if ([cpu, mem, disk].some((value) => value !== null && value >= 75)) return "偏高";
  if ([cpu, mem, disk].some((value) => value !== null)) return "正常";
  return "未检测";
}

export function formatPercentMetric(value) {
  const number = numericMetric(value);
  if (number === null) return "";
  return `${Math.round(number)}%`;
}

export function formatHostPerformanceSummary(health, compact = false) {
  const cpu = formatPercentMetric(hostMetric(health, "cpu_percent"));
  const mem = formatPercentMetric(hostMetric(health, "mem_percent"));
  const disk = formatPercentMetric(hostMetric(health, "disk_percent"));
  const parts = [
    hostPerformanceLevel(health),
    cpu ? `CPU ${cpu}` : "",
    mem ? `内存 ${mem}` : "",
    disk ? `磁盘 ${disk}` : "",
  ].filter(Boolean);
  if (compact) return parts.slice(0, 4).join(" · ") || "未检测";
  const load = String(hostMetric(health, "load_avg") || "").replace(/,/g, " / ");
  if (load) parts.push(`负载 ${load}`);
  return parts.join(" · ") || "未检测";
}

export function compactMessageForRouter(message) {
  const text = trimVisibleText(messageDisplayText(message?.body || message?.output || ""));
  return {
    role: message?.role === "assistant" ? "assistant" : "user",
    text: text.slice(0, 900),
  };
}

export function buildMainAIRouteRequest({ profile, text, activeAgent, messages }) {
  const context = {
    userText: text,
    activeAgent: activeAgent.id,
    activeWorkdir: profile.workdir,
    availableAgents: agents.map((agent) => ({ id: agent.id, name: agent.shortName })),
    recentMessages: messages.slice(-6).map(compactMessageForRouter),
  };

  return {
    model: profile.mainAIModel || defaultProfile.mainAIModel,
    instructions: mainAIRouterInstructions,
    input: JSON.stringify(context),
    store: false,
    max_output_tokens: 500,
    text: {
      format: {
        type: "json_schema",
        name: "ai_workbench_route",
        strict: true,
        schema: mainAIRouteSchema,
      },
    },
  };
}

export function extractResponseText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string") return payload.output_text;

  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
      if (typeof content.output_text === "string") chunks.push(content.output_text);
    }
  }
  return chunks.join("\n").trim();
}

export function normalizeMainAIRoute(route, activeAgent) {
  const fallbackAgent = activeAgent?.id || "codex";
  const action = [
    "run_agent_task",
    "switch_agent",
    "ask_clarification",
    "answer_directly",
    "stop",
    "no_action",
  ].includes(route?.action)
    ? route.action
    : "run_agent_task";
  const agent = route?.agent === "current" ? fallbackAgent : agentById(route?.agent, activeAgent)?.id || fallbackAgent;

  return {
    action,
    agent,
    confidence: Math.max(0, Math.min(Number(route?.confidence ?? 0.5) || 0.5, 1)),
    requiresConfirmation: Boolean(route?.requiresConfirmation),
    task: trimVisibleText(route?.task || ""),
    reply: trimVisibleText(route?.reply || ""),
    reason: trimVisibleText(route?.reason || ""),
  };
}

export function parseMainAIRoute(rawBody, activeAgent) {
  const payload = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
  const outputText = extractResponseText(payload);
  const route = JSON.parse(outputText || "{}");
  return normalizeMainAIRoute(route, activeAgent);
}

export function extractMarkedFinalOutput(text) {
  const pattern = new RegExp(`${finalAnswerStart}\\s*([\\s\\S]*?)\\s*${finalAnswerEnd}`, "gi");
  let match;
  let answer = "";

  while ((match = pattern.exec(text))) {
    const candidate = trimVisibleText(match[1]);
    if (candidate && candidate !== "和" && !candidate.includes("这里写最终回答")) answer = candidate;
  }

  if (answer) return answer;

  const lastStart = text.lastIndexOf(finalAnswerStart);
  if (lastStart < 0) return "";

  const openAnswer = trimVisibleText(text.slice(lastStart + finalAnswerStart.length).replace(finalAnswerEnd, ""));
  return openAnswer && !openAnswer.includes("这里写最终回答") ? openAnswer : "";
}

export function extractWorkbenchResponse(text) {
  const match = String(text || "").match(/__AIWB_RESPONSE_START__\s*([\s\S]*?)\s*__AIWB_RESPONSE_END__/);
  return match ? trimVisibleText(match[1]) : "";
}

export function looksLikeTerminalNoise(line, prompt = "") {
  const text = String(line || "").trim();
  const userPrompt = String(prompt || "").trim();

  if (!text) return false;
  if (userPrompt && text === userPrompt) return true;
  if (text === finalAnswerStart || text === finalAnswerEnd || text === "这里写最终回答") return true;
  if (text.includes(finalAnswerStart) || text.includes(finalAnswerEnd)) return true;
  if (/^明白[。，.].*(最终|标记|AIWB_FINAL)/.test(text)) return true;
  if (/^(请只在任务完成后|标记中不要放命令行日志)/.test(text)) return true;
  if (/^[╭╮╰╯│┃─━┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬\s]+$/.test(text)) return true;
  if (/^(›|▌|>_|\$|#)\s*/.test(text)) return true;
  if (/^(Introducing GPT-5\.5|Learn more:|Choose how|Use ↑|1\. Try new model|2\. Use existing model)/i.test(text)) {
    return true;
  }
  if (/^(Codex could not find bubblewrap|package manager\.|https:\/\/developers\.openai\.com\/codex\/concepts\/sandboxing|will use the bundled bubblewrap)/i.test(text)) {
    return true;
  }
  if (/(OpenAI Codex|model:\s+gpt-|directory:\s+\/|\/model to change)/i.test(text)) return true;
  if (/^(Tip:|Use \/fast|› Use \/skills|gpt-[\w.-]+\s+.*·\s+)/i.test(text)) return true;
  if (/^•\s+Booting MCP server/i.test(text)) return true;
  if (/^(AI Workbench:|tmux session not running|Missing required field:)/i.test(text)) return true;
  if (/^(Welcome to Claude Code|Let's get started\.|Choose the text style|To change this later, run \/theme)/i.test(text)) return true;
  if (/^(Claude Code can be used with your Claude subscription|usage through your Console account|Select login method:)/i.test(text)) return true;
  if (/^(?:›\s*)?\d+\.\s+(Auto|Dark mode|Light mode|Dark mode \(colorblind-friendly\)|Light mode \(colorblind-friendly\)|Dark mode \(ANSI colors only\)|Light mode \(ANSI colors only\))/i.test(text)) return true;
  if (/^(?:›\s*)?\d+\.\s+(Claude account with subscription|Anthropic Console account|3rd-party platform)/i.test(text)) return true;
  if (/^(Do you trust|Yes,|Proceed|Continue|Press (Enter|Return))/i.test(text)) return true;
  if (/^(thinking|working|running|reading|edited|applied|searched|opened|ran|tool|shell)\b/i.test(text)) return true;
  if (/^(ctrl|shift|enter|esc|press enter)\b/i.test(text)) return true;
  if (/^[\w.-]+@[\w.-]+:[~/\w.-]*[$#]/.test(text)) return true;
  if (/^\d+% context left/i.test(text)) return true;

  return false;
}

export function fallbackFinalOutput(text, prompt = "") {
  const lines = stripTerminalControl(text)
    .replace(/^AI Workbench: 正在启动 .*\n?/gm, "")
    .replace(/Introducing GPT-5\.5[\s\S]*?press enter to confirm\s*/gi, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));

  const filtered = [];
  for (const line of lines) {
    if (looksLikeTerminalNoise(line, prompt)) continue;
    filtered.push(line);
  }

  let startIndex = 0;
  const userPrompt = String(prompt || "").trim();
  if (userPrompt) {
    for (let index = filtered.length - 1; index >= 0; index -= 1) {
      if (filtered[index].includes(userPrompt)) {
        startIndex = index + 1;
        break;
      }
    }
  }

  return trimVisibleText(filtered.slice(startIndex).slice(-80).join("\n"));
}

export function extractAgentFinalOutput(output, prompt = "") {
  const normalized = stripTerminalControl(output);
  const workbenchResponse = extractWorkbenchResponse(normalized);
  const answerSource = workbenchResponse || normalized;
  const marked = extractMarkedFinalOutput(answerSource);
  if (marked) return { text: marked, final: true };
  if (workbenchResponse) return { text: workbenchResponse, final: true };

  return {
    text: fallbackFinalOutput(answerSource, prompt),
    final: false,
  };
}

export function looksLikeDeferredWaitingAnswer(text) {
  const normalized = trimVisibleText(stripTerminalControl(text)).replace(/\s+/g, " ");
  if (!normalized) return false;
  // This heuristic is only for a short, stand-alone waiting response. A
  // substantive final report may legitimately mention waiting for another
  // team or ask the user to choose a next step.
  if (normalized.length > 360) return false;

  return [
    /^(?:I(?:'m| am)\s+)?(?:still\s+)?waiting for .{1,180}\bto (?:finish|complete|end)[.!…]*$/i,
    /\bI(?:'|’)ll wait for (?:the )?(?:notification|monitor|result|deployment|test|tests|build|pipeline|workflow|completion)\b/i,
    /\bI will wait for (?:the )?(?:notification|monitor|result|deployment|test|tests|build|pipeline|workflow|completion)\b/i,
    /\bwait for (?:the )?(?:notification|monitor|result|deployment|test|tests|build|pipeline|workflow|completion) before continuing\b/i,
    /等待.*(通知|结果|测试|构建|部署|流水线|监控).*(继续|再继续|后续)/,
    /(等|待).*(通知|结果|测试|构建|部署|流水线|监控).*再继续/,
    /稍后.*继续.*(部署|固定|pin|发布|执行)/i,
  ].some((pattern) => pattern.test(normalized));
}

export function cleanAgentOutput(output, prompt = "") {
  return extractAgentFinalOutput(output, prompt).text;
}

export function formatAgentLiveOutput(output, prompt = "") {
  const text = stripTerminalControl(output);
  const workbenchResponse = extractWorkbenchResponse(text);
  const source = workbenchResponse || text;
  const markedFinal = extractMarkedFinalOutput(source);
  const visible = markedFinal || fallbackFinalOutput(source, prompt) || trimVisibleText(source);
  return clipPersistedText(visible, 30_000);
}

export function isNearConversationBottom(element) {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= conversationBottomThreshold;
}
