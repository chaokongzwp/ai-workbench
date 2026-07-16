import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import * as Core from "../core/workbenchCore.js";
import { shellComponents } from "./shellComponents.jsx";
const {
  SSHWorkbench,
  VoiceWorkbench,
  agentById,
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
  buildGitDownloadCommand,
  buildHealthCommand,
  buildInstallGitCommand,
  buildInstallWslCommand,
  buildInstallWorkbenchAgentCommand,
  buildInterruptCommand,
  buildKillCommand,
  buildMainAIRouteRequest,
  buildModelChoiceCommand,
  buildRemoteFileDeleteCommand,
  buildRemoteFileReadCommand,
  buildRemoteImageUploadCommand,
  buildRestartWindowsCommand,
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
  buildWorkbenchAgentTaskListCommand,
  buildWorkbenchAgentWaitTaskCommand,
  buildWorkspaceMigrationPayload,
  builtInAliyunVoiceConfig,
  chineseNumber,
  classifyAgentFailure,
  claudeSetupAutomationSnippet,
  cleanAgentFailureDetail,
  cleanAgentOutput,
  cleanBase64Payload,
  clipPersistedText,
  codeFileExtensions,
  commandDiagnosticPayload,
  commandName,
  compactInlineText,
  compactMessageForRouter,
  connectionForAppLaunch,
  connectionIsLive,
  connectionModeForServer,
  connectionModeFromHealth,
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
  extractAgentFinalOutput,
  extractCodexLoginInstructions,
  extractMarkedFinalOutput,
  extractRemoteFileReferences,
  extractResponseText,
  extractWorkbenchResponse,
  fallbackFinalOutput,
  fileToImageAttachment,
  finalAnswerEnd,
  finalAnswerStart,
  formatAgentFailureCopy,
  formatAgentLiveOutput,
  formatAgentPrompt,
  formatDuration,
  formatHostPerformanceSummary,
  formatPercentMetric,
  globalSettingsFromProfile,
  healthFromWorkbenchAgentStatus,
  hostMetric,
  hostPerformanceLevel,
  imageExtensionFromFile,
  imageUploadRemoteName,
  initialConnectionForProfile,
  isAbsoluteRemotePath,
  isCodexLoginPrompt,
  isCodexModelChoicePrompt,
  isEventLike,
  isGlobalWakePhrase,
  isLegacyDefaultWorkdir,
  isNearConversationBottom,
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
  latestServerMessageSummary,
  latestWorkbenchAgentVersion,
  legacyDefaultWakeWordPhrases,
  legacyDefaultWorkdirs,
  loadBrowserDiagnosticLogs,
  loadDirectoryPrefs,
  loadLocalMessageHistory,
  loadManualWorkdirHistory,
  loadWorkspaceMirror,
  localMessageHistoryFromServers,
  localMessageHistoryStorageKey,
  looksLikeDeferredWaitingAnswer,
  looksLikeTerminalNoise,
  mainAIRouteSchema,
  mainAIRouterInstructions,
  mainAIRouterReady,
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
  messagesForStorage,
  migrationFileKind,
  migrationFileName,
  migrationFileVersion,
  normalizeAppearanceMode,
  normalizeDirectoryPrefs,
  normalizeDiscovery,
  normalizeMainAIRoute,
  normalizeManualWorkdirHistory,
  normalizePersistedMessage,
  normalizeProfile,
  normalizeResultAudioMode,
  normalizeServerPlatform,
  normalizeVoiceText,
  normalizeWorkspaceStore,
  numericMetric,
  parseDiscovery,
  parseHealth,
  parseMainAIRoute,
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
  serverSidebarMeta,
  serverTaskRunning,
  serverTaskState,
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
} = Core;

const remoteTaskTerminalStatuses = new Set(["done", "error", "cancelled"]);
const agentSynchronousWaitTimeoutMs = 2 * 60 * 60 * 1000;
const agentSynchronousPollInitialDelayMs = 900;
const agentSynchronousPollIntervalMs = 15_000;
const agentLongPollTimeoutSeconds = 55;

function wslProfileFromWindowsProfile(profile) {
  const normalized = normalizeProfile(profile);
  const workdir = String(normalized.workdir || "").trim();
  const windowsPath = /^[A-Za-z]:[\\/]/.test(workdir) || /^\\\\/.test(workdir);
  return normalizeProfile({
    ...normalized,
    platform: "wsl",
    workdir: windowsPath ? "" : workdir,
    codexCommand:
      !normalized.codexCommand || normalized.codexCommand === serverPlatformDefaults.windows.codexCommand
        ? serverPlatformDefaults.wsl.codexCommand
        : normalized.codexCommand,
    claudeCommand:
      !normalized.claudeCommand || normalized.claudeCommand === serverPlatformDefaults.windows.claudeCommand
        ? serverPlatformDefaults.wsl.claudeCommand
        : normalized.claudeCommand,
  });
}

function messageStatusPriority(message) {
  const status = String(message?.status || "").trim();
  const remoteStatus = String(message?.remoteTaskStatus || "").trim();
  if (
    remoteTaskTerminalStatuses.has(status) ||
    ["done", "error", "cancelled", "missing", "deferred-waiting-answer"].includes(remoteStatus) ||
    message?.resultMissing === true
  ) {
    return 3;
  }
  if (status === "choice" || status === "login") return 2;
  if (status === "running") return 1;
  return 0;
}

function earliestMessageTime(left, right) {
  const values = [Number(left || 0), Number(right || 0)].filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.min(...values) : undefined;
}

function mergeRemoteTaskMessages(existing, incoming) {
  const existingPriority = messageStatusPriority(existing);
  const incomingPriority = messageStatusPriority(incoming);
  const preferred = incomingPriority >= existingPriority ? incoming : existing;
  const fallback = preferred === incoming ? existing : incoming;
  const startedAt = earliestMessageTime(existing.startedAt || existing.createdAtMs, incoming.startedAt || incoming.createdAtMs);
  const createdAtMs = earliestMessageTime(existing.createdAtMs, incoming.createdAtMs);
  const preferredIsTerminal = messageStatusPriority(preferred) === 3;

  return {
    ...fallback,
    ...preferred,
    id: existing.id,
    body: preferredIsTerminal ? String(preferred.body || "") : preferred.body || fallback.body || "",
    output: preferred.output || fallback.output || "",
    liveOutput: preferredIsTerminal ? "" : preferred.liveOutput || fallback.liveOutput || "",
    promptText: preferred.promptText || fallback.promptText || "",
    technicalDetail: preferredIsTerminal ? preferred.technicalDetail : preferred.technicalDetail || fallback.technicalDetail,
    agentFailure: preferredIsTerminal ? preferred.agentFailure : preferred.agentFailure || fallback.agentFailure,
    resultMissing: preferredIsTerminal ? preferred.resultMissing === true : preferred.resultMissing || fallback.resultMissing,
    remoteSyncError: preferredIsTerminal ? String(preferred.remoteSyncError || "") : preferred.remoteSyncError || fallback.remoteSyncError || "",
    startedAt,
    createdAtMs,
    createdAt: existing.createdAt || incoming.createdAt,
  };
}

function messageTimelineTime(message) {
  if (message?.role === "assistant" && Number(message?.startedAt || 0) > 0) {
    return Number(message.startedAt);
  }
  return (
    Number(message?.createdAtMs || 0) ||
    Number(message?.startedAt || 0) ||
    Number(message?.completedAt || 0) ||
    0
  );
}

function messageTextKey(message) {
  return String(message?.body || message?.promptText || "").trim();
}

function assistantMessageHasVisiblePayload(message) {
  if (message?.role !== "assistant") return true;
  if (message?.agentFailure || message?.resultMissing || message?.modelChoice || message?.loginAction) return true;
  if (message?.status === "running") return true;
  if (Array.isArray(message?.attachments) && message.attachments.length) return true;
  return Boolean(
    String(message?.body || "").trim() ||
      String(message?.output || "").trim() ||
      String(message?.liveOutput || "").trim(),
  );
}

function mergeRemoteUserMessages(existing, incoming) {
  const preferred = messageTextKey(incoming) ? incoming : existing;
  const fallback = preferred === incoming ? existing : incoming;
  const createdAtMs = earliestMessageTime(existing.createdAtMs, incoming.createdAtMs);

  return {
    ...fallback,
    ...preferred,
    id: existing.id,
    body: preferred.body || fallback.body || "",
    promptText: preferred.promptText || fallback.promptText || preferred.body || fallback.body || "",
    remoteTaskId: existing.remoteTaskId || incoming.remoteTaskId,
    conversationId: existing.conversationId || incoming.conversationId,
    agentId: existing.agentId || incoming.agentId,
    backend: existing.backend || incoming.backend,
    createdAtMs,
    createdAt: existing.createdAt || incoming.createdAt,
  };
}

function inferAssistantTaskIdsFromRemoteMessages(messages = []) {
  const nextMessages = messages.map((message) => (message && typeof message === "object" ? { ...message } : message));
  let latestUserPrompt = "";
  const taskPromptById = new Map();

  nextMessages.forEach((message) => {
    if (message?.role === "user") {
      latestUserPrompt = messageTextKey(message);
      const userTaskId = String(message.remoteTaskId || "").trim();
      if (userTaskId && latestUserPrompt) taskPromptById.set(userTaskId, latestUserPrompt);
      return;
    }
    const titleAndBody = `${String(message?.title || "")}\n${String(message?.body || "")}`;
    const looksLikeLocalPlaceholder =
      message?.role === "assistant" &&
      !String(message?.remoteTaskId || "").trim() &&
      (message?.status === "running" ||
        message?.status === "idle" ||
        /已发送|等待|正在|无法确认|没有最终内容|任务未能恢复|没有关联 Agent 后台任务 ID/.test(titleAndBody));
    if (looksLikeLocalPlaceholder && !String(message?.promptText || "").trim() && latestUserPrompt) {
      message.promptText = latestUserPrompt;
    }
  });

  const claimedPlaceholderIndexes = new Set();
  nextMessages.forEach((remoteMessage, remoteIndex) => {
    const taskId = String(remoteMessage?.remoteTaskId || "").trim();
    const promptText = String(remoteMessage?.promptText || taskPromptById.get(taskId) || "").trim();
    if (remoteMessage?.role !== "assistant" || !taskId) return;
    if (promptText && !String(remoteMessage.promptText || "").trim()) remoteMessage.promptText = promptText;

    const remoteTime = messageTimelineTime(remoteMessage);
    let matchedIndex = -1;
    let matchedDistance = Number.POSITIVE_INFINITY;
    nextMessages.forEach((candidate, candidateIndex) => {
      if (
        candidateIndex === remoteIndex ||
        candidateIndex > remoteIndex ||
        claimedPlaceholderIndexes.has(candidateIndex) ||
        candidate?.role !== "assistant" ||
        String(candidate.remoteTaskId || "").trim()
      ) {
        return;
      }
      const candidatePrompt = String(candidate.promptText || "").trim();
      const distance = Math.abs(messageTimelineTime(candidate) - remoteTime);
      // Older builds did not always persist createdAtMs/startedAt. After an App
      // restart those messages can receive a new local timestamp, so an exact
      // prompt match must not depend on the clock. Distance is still used below
      // to choose the nearest candidate when the same prompt was sent twice.
      const promptMatches = Boolean(promptText) && candidatePrompt === promptText;
      const timeMatches =
        !promptMatches &&
        (!promptText || !candidatePrompt) &&
        candidate.agentId === remoteMessage.agentId &&
        distance <= 120_000;
      if (!promptMatches && !timeMatches) return;
      if (distance < matchedDistance) {
        matchedIndex = candidateIndex;
        matchedDistance = distance;
      }
    });

    if (matchedIndex < 0) return;
    claimedPlaceholderIndexes.add(matchedIndex);
    nextMessages[matchedIndex] = {
      ...nextMessages[matchedIndex],
      remoteTaskId: taskId,
      conversationId: remoteMessage.conversationId || nextMessages[matchedIndex].conversationId,
      agentId: remoteMessage.agentId || nextMessages[matchedIndex].agentId,
      backend: remoteMessage.backend || "agent",
      promptText,
    };
  });

  return nextMessages;
}

function inferUserTaskIdsFromAssistantMessages(messages = []) {
  const nextMessages = messages.map((message) => (message && typeof message === "object" ? { ...message } : message));
  const usedUserIndexes = new Set();

  nextMessages.forEach((message, index) => {
    const taskId = String(message?.remoteTaskId || "").trim();
    const promptText = String(message?.promptText || "").trim();
    if (message?.role !== "assistant" || !taskId || !promptText) return;

    let matchedIndex = -1;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = nextMessages[cursor];
      if (
        usedUserIndexes.has(cursor) ||
        candidate?.role !== "user" ||
        String(candidate.remoteTaskId || "").trim() ||
        messageTextKey(candidate) !== promptText
      ) {
        continue;
      }
      matchedIndex = cursor;
      break;
    }

    if (matchedIndex >= 0) {
      usedUserIndexes.add(matchedIndex);
      nextMessages[matchedIndex] = {
        ...nextMessages[matchedIndex],
        remoteTaskId: taskId,
        conversationId: message.conversationId || nextMessages[matchedIndex].conversationId,
        agentId: message.agentId || nextMessages[matchedIndex].agentId,
        backend: message.backend || nextMessages[matchedIndex].backend,
        promptText,
      };
    }
  });

  return nextMessages;
}

export function dedupeRemoteTaskMessages(messages = []) {
  const nextMessages = [];
  const remoteTaskIndexes = new Map();

  const linkedMessages = inferAssistantTaskIdsFromRemoteMessages(messages);
  for (const message of inferUserTaskIdsFromAssistantMessages(linkedMessages)) {
    const taskId = String(message?.remoteTaskId || "").trim();
    if ((message?.role !== "assistant" && message?.role !== "user") || !taskId) {
      nextMessages.push(message);
      continue;
    }

    const taskKey = `${message.role}:${taskId}`;
    const existingIndex = remoteTaskIndexes.get(taskKey);
    if (existingIndex === undefined) {
      remoteTaskIndexes.set(taskKey, nextMessages.length);
      nextMessages.push(message);
      continue;
    }

    nextMessages[existingIndex] =
      message.role === "assistant"
        ? mergeRemoteTaskMessages(nextMessages[existingIndex], message)
        : mergeRemoteUserMessages(nextMessages[existingIndex], message);
  }

  const taskStartTimes = new Map();
  nextMessages.forEach((message) => {
    const taskId = String(message?.remoteTaskId || "").trim();
    if (!taskId) return;
    const current = taskStartTimes.get(taskId) || Number.POSITIVE_INFINITY;
    const time =
      message.role === "assistant"
        ? Number(message.startedAt || 0) || messageTimelineTime(message)
        : messageTimelineTime(message);
    taskStartTimes.set(taskId, Math.min(current, time || current));
  });

  const normalizedMessages = nextMessages.map((message) => {
    const body = String(message?.body || "").trim();
    const hasTerminalResult =
      message?.role === "assistant" &&
      remoteTaskTerminalStatuses.has(message?.status) &&
      String(message?.output || "").trim();
    const stalePlaceholder = /正在等待.+回复|任务还在服务器后台运行|App 已重新打开，无法确认/.test(body);
    if (!hasTerminalResult || !stalePlaceholder) return message;
    return {
      ...message,
      body: "",
      liveOutput: "",
    };
  });

  return normalizedMessages
    .filter(assistantMessageHasVisiblePayload)
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const leftTaskId = String(left.message?.remoteTaskId || "").trim();
      const rightTaskId = String(right.message?.remoteTaskId || "").trim();
      const leftBase = leftTaskId ? taskStartTimes.get(leftTaskId) || messageTimelineTime(left.message) : messageTimelineTime(left.message);
      const rightBase = rightTaskId ? taskStartTimes.get(rightTaskId) || messageTimelineTime(right.message) : messageTimelineTime(right.message);
      if (leftBase !== rightBase) return leftBase - rightBase;
      if (leftTaskId && rightTaskId && leftTaskId === rightTaskId) {
        const leftRoleOrder = left.message?.role === "user" ? 0 : left.message?.role === "assistant" ? 1 : 2;
        const rightRoleOrder = right.message?.role === "user" ? 0 : right.message?.role === "assistant" ? 1 : 2;
        if (leftRoleOrder !== rightRoleOrder) return leftRoleOrder - rightRoleOrder;
      }
      return left.index - right.index;
    })
    .map((item) => item.message);
}

function dedupeServerRemoteTaskMessages(servers = []) {
  return servers.map((server) => ({
    ...server,
    messages: dedupeRemoteTaskMessages(server.messages || []),
  }));
}

export function useWorkbenchController() {
  const defaultServer = useMemo(() => createServerSession({ id: "default-server", name: "默认服务器", profile: defaultProfile }), []);
  const desktopWindowContext = useMemo(() => {
    if (typeof window === "undefined") return { detachedChat: false, serverId: "" };
    const params = new URLSearchParams(window.location.search);
    return {
      detachedChat: params.get("window") === "chat",
      serverId: String(params.get("serverId") || "").trim(),
    };
  }, []);
  const [servers, setServers] = useState([defaultServer]);
  const [activeServerId, setActiveServerId] = useState(defaultServer.id);
  const [draftProfile, setDraftProfile] = useState(defaultProfile);
  const [editingServerId, setEditingServerId] = useState(defaultServer.id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDiscovery, setSettingsDiscovery] = useState(null);
  const [agentManagementTargetId, setAgentManagementTargetId] = useState("");
  const [settingsAgentTab, setSettingsAgentTab] = useState("codex");
  const [settingsSelectedSessions, setSettingsSelectedSessions] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [filePreview, setFilePreview] = useState(null);
  const [fileDownload, setFileDownload] = useState(null);
  const [deletedRemoteFilePaths, setDeletedRemoteFilePaths] = useState(() => new Set());
  const [remoteDownloadOpen, setRemoteDownloadOpen] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState("codex");
  const [composer, setComposer] = useState("");
  const [imageAttachments, setImageAttachments] = useState([]);
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceError, setVoiceError] = useState("");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [wakeState, setWakeState] = useState("idle");
  const [wakeError, setWakeError] = useState("");
  const [busy, setBusy] = useState(false);
  const [taskNotice, setTaskNotice] = useState(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [systemDarkMode, setSystemDarkMode] = useState(false);
  const [nativeDeviceClass, setNativeDeviceClass] = useState(() =>
    typeof window !== "undefined" && window.innerWidth >= 768 ? "tablet" : "phone",
  );

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || servers[0] || defaultServer,
    [activeServerId, defaultServer, servers],
  );
  const profile = activeServer.profile;
  const activeAgent = useMemo(() => agentById(normalizeProfile(profile).agentId, agents[0]), [profile]);
  const connection = activeServer.connection;
  const diagnostics = activeServer.diagnostics;
  const discovery = activeServer.discovery;
  const rawOutput = activeServer.rawOutput;
  const messages = activeServer.messages;
  const activeTaskRunning = serverTaskRunning(activeServer);
  const activeBusy = busy || activeTaskRunning;
  const activeRunningMessage = useMemo(
    () => [...messages].reverse().find((message) => message.status === "running") || null,
    [messages],
  );
  const isProfileReady = useMemo(() => profileReady(profile), [profile]);
  const voiceInputEnabled = profile.voiceInputEnabled === true;
  const hasSelectedWorkdir = Boolean(String(profile.workdir || "").trim());
  const wakePhraseSignature = useMemo(
    () => wakeContextForServers(servers, activeServerId, profile).phrases.join("\n"),
    [activeServerId, profile, servers],
  );
  const hasPendingAction = messages.some((message) => message.status === "choice" || message.status === "login");
  const profileRef = useRef(profile);
  const draftProfileRef = useRef(draftProfile);
  const serversRef = useRef([defaultServer]);
  const activeServerIdRef = useRef(activeServerId);
  const primaryActiveServerIdRef = useRef("");
  const composerRef = useRef(composer);
  const imageAttachmentsRef = useRef(imageAttachments);
  const voiceBaseTextRef = useRef("");
  const voiceStateRef = useRef(voiceState);
  const wakeStateRef = useRef(wakeState);
  const wakeEnabledRef = useRef(false);
  const wakeLoopIdRef = useRef(0);
  const wakeManuallyDisabledRef = useRef(false);
  const voiceSessionActiveRef = useRef(false);
  const assistantSpeechActiveRef = useRef(false);
  const assistantSpeechRunIdRef = useRef(0);
  const spokenMessageIdsRef = useRef(new Set());
  const busyRef = useRef(busy);
  const pendingActionRef = useRef(hasPendingAction);
  const profileReadyRef = useRef(isProfileReady);
  const workspaceLoadedRef = useRef(workspaceLoaded);
  const workspaceSaveTimerRef = useRef(null);
  const applyingExternalProfileRef = useRef(false);
  const noticeQueueRef = useRef([]);
  const noticeSpeakingRef = useRef(false);
  const syncingAgentTasksRef = useRef(new Set());
  const syncingAgentConversationsRef = useRef(new Set());
  const syncingAgentSweepRef = useRef(false);
  const loadingAgentHistoryRef = useRef(new Set());
  const sendingServerIdsRef = useRef(new Set());
  const agentHealthRefreshKeysRef = useRef(new Set());
  const agentHealthInFlightConnectionsRef = useRef(new Set());
  const agentStartupHealthCheckedRef = useRef(false);
  const agentConnectionPollAtRef = useRef(new Map());
  const agentConversationAutoSyncAtRef = useRef(new Map());
  const agentConversationSyncFailedAtRef = useRef(new Map());
  const conversationScrollRef = useRef(null);
  const conversationStickToBottomRef = useRef(true);
  const conversationScrollStateRef = useRef({
    activeServerId: defaultServer.id,
    messageCount: 0,
    lastMessageId: "",
  });

  function updateDraftProfile(nextProfile) {
    const current = draftProfileRef.current;
    const resolved = typeof nextProfile === "function" ? nextProfile(current) : nextProfile;
    draftProfileRef.current = resolved;
    setDraftProfile(resolved);
  }

  function revokeImagePreviews(attachments = []) {
    attachments.forEach((attachment) => {
      const url = String(attachment?.previewUrl || "");
      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
  }

  function clearImageAttachments() {
    revokeImagePreviews(imageAttachmentsRef.current);
    imageAttachmentsRef.current = [];
    setImageAttachments([]);
  }

  function removeImageAttachment(id) {
    setImageAttachments((items) => {
      const removed = items.filter((item) => item.id === id);
      revokeImagePreviews(removed);
      const nextItems = items.filter((item) => item.id !== id);
      imageAttachmentsRef.current = nextItems;
      return nextItems;
    });
  }

  async function addImageAttachments(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    try {
      const nextItems = await Promise.all(list.map((file) => fileToImageAttachment(file)));
      setImageAttachments((items) => {
        const combined = [...items, ...nextItems].slice(-10);
        const dropped = [...items, ...nextItems].slice(0, Math.max(0, items.length + nextItems.length - 10));
        revokeImagePreviews(dropped);
        imageAttachmentsRef.current = combined;
        return combined;
      });
      setVoiceError("");
    } catch (error) {
      setVoiceError(shortError(error));
    }
  }

  function addPreparedAttachments(attachments = []) {
    const nextItems = attachments
      .filter((item) => cleanBase64Payload(item?.base64))
      .map((item) => {
        const mime = String(item.mime || "application/octet-stream");
        const base64 = cleanBase64Payload(item.base64);
        const isImage = item.isImage === true || mime.startsWith("image/");
        return {
          id: item.id || `clipboard-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: item.name || (isImage ? "粘贴的图片.png" : "粘贴的文件"),
          mime,
          size: Number(item.size || 0),
          base64,
          isImage,
          previewUrl: isImage ? `data:${mime};base64,${base64}` : "",
        };
      });
    if (!nextItems.length) return false;

    setImageAttachments((items) => {
      const combined = [...items, ...nextItems].slice(-10);
      const dropped = [...items, ...nextItems].slice(0, Math.max(0, items.length + nextItems.length - 10));
      revokeImagePreviews(dropped);
      imageAttachmentsRef.current = combined;
      return combined;
    });
    setVoiceError("");
    return true;
  }

  async function pasteClipboardAttachments() {
    const bridge = desktopBridge();
    if (!bridge?.readClipboardAttachments) return false;
    try {
      const result = await bridge.readClipboardAttachments();
      return addPreparedAttachments(result?.attachments || []);
    } catch (error) {
      setVoiceError(shortError(error));
      return false;
    }
  }

  useEffect(() => {
    const configuredAgentId = normalizeProfile(profile).agentId;
    if (activeAgentId !== configuredAgentId) setActiveAgentId(configuredAgentId);
  }, [activeAgentId, profile]);

  useEffect(() => {
    draftProfileRef.current = draftProfile;
  }, [draftProfile]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  useEffect(() => {
    activeServerIdRef.current = activeServerId;
  }, [activeServerId]);

  useEffect(() => {
    composerRef.current = composer;
  }, [composer]);

  useEffect(() => {
    imageAttachmentsRef.current = imageAttachments;
  }, [imageAttachments]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    wakeStateRef.current = wakeState;
  }, [wakeState]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    pendingActionRef.current = hasPendingAction;
  }, [hasPendingAction]);

  useEffect(() => {
    profileReadyRef.current = isProfileReady;
  }, [isProfileReady]);

  useEffect(() => {
    workspaceLoadedRef.current = workspaceLoaded;
  }, [workspaceLoaded]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemDarkMode(Boolean(query.matches));
    updateSystemTheme();
    query.addEventListener?.("change", updateSystemTheme);
    return () => query.removeEventListener?.("change", updateSystemTheme);
  }, []);

  function handleConversationScroll() {
    const container = conversationScrollRef.current;
    conversationStickToBottomRef.current = isNearConversationBottom(container);
    if (!container || container.scrollTop > 72) return;
    if (container.scrollHeight <= container.clientHeight + 24) return;
    void loadOlderAgentHistoryForServer(activeServerIdRef.current);
  }

  function scrollConversationToBottom() {
    const container = conversationScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
    conversationStickToBottomRef.current = true;
  }

  useLayoutEffect(() => {
    const latestMessageId = messages[messages.length - 1]?.id || "";
    const previous = conversationScrollStateRef.current;
    const switchedSession = previous.activeServerId !== activeServerId;
    const restoredHistory = previous.messageCount === 0 && messages.length > 0;
    const shouldFollow = switchedSession || restoredHistory || conversationStickToBottomRef.current;

    conversationScrollStateRef.current = {
      activeServerId,
      messageCount: messages.length,
      lastMessageId: latestMessageId,
    };

    if (!workspaceLoaded || !messages.length || !shouldFollow) return undefined;

    scrollConversationToBottom();
    const frame = window.requestAnimationFrame(scrollConversationToBottom);
    const timeout = window.setTimeout(scrollConversationToBottom, 80);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [activeServerId, messages, workspaceLoaded]);

  useEffect(() => {
    if (voiceInputEnabled) {
      wakeManuallyDisabledRef.current = false;
      return;
    }

    wakeManuallyDisabledRef.current = true;
    wakeEnabledRef.current = false;
    voiceSessionActiveRef.current = false;
    wakeLoopIdRef.current += 1;
    applyWakeState("idle");
    if (voiceStateRef.current !== "idle") applyVoiceState("idle");
    VoiceWorkbench.stopWakeWord?.().catch(() => {});
    VoiceWorkbench.stop?.().catch(() => {});
  }, [voiceInputEnabled]);

  useEffect(() => {
    if (!voiceInputEnabled || !isProfileReady || busy || hasPendingAction || wakeEnabledRef.current || wakeManuallyDisabledRef.current) {
      return;
    }
    startWakeMode();
  }, [voiceInputEnabled, isProfileReady, busy, hasPendingAction, activeServerId]);

  useEffect(() => {
    if (!voiceInputEnabled || !isProfileReady || !wakeEnabledRef.current || wakeManuallyDisabledRef.current) return;
    if (wakeStateRef.current !== "listening") return;

    wakeLoopIdRef.current += 1;
    VoiceWorkbench.stopWakeWord?.().catch(() => {});
    startWakeMode();
  }, [wakePhraseSignature, voiceInputEnabled, isProfileReady]);

  useEffect(() => {
    return () => {
      wakeEnabledRef.current = false;
      voiceSessionActiveRef.current = false;
      assistantSpeechActiveRef.current = false;
      wakeLoopIdRef.current += 1;
      VoiceWorkbench.stopWakeWord?.().catch(() => {});
      VoiceWorkbench.stop?.().catch(() => {});
      stopAssistantSpeech();
      revokeImagePreviews(imageAttachmentsRef.current);
    };
  }, []);

  useEffect(() => {
    messages.forEach((message) => {
      if (speechTextFromMessage(message)) spokenMessageIdsRef.current.add(message.id);
    });
  }, [activeServerId]);

  useEffect(() => {
    const latestSpeakable = [...messages].reverse().find((message) => speechTextFromMessage(message));
    if (!latestSpeakable || spokenMessageIdsRef.current.has(latestSpeakable.id)) return;

    const activeIndex = serversRef.current.findIndex((server) => server.id === activeServerIdRef.current);
    const activeServerSnapshot = serverById(activeServerIdRef.current) || activeServer;
    const currentProfile = normalizeProfile(profileRef.current);
    const text =
      normalizeResultAudioMode(currentProfile.resultAudioMode) === "summary"
        ? serverCompletionSpeech(activeServerSnapshot, activeIndex >= 0 ? activeIndex : 0, true, "summary")
        : speechTextFromMessage(latestSpeakable);
    if (!text) return;

    spokenMessageIdsRef.current.add(latestSpeakable.id);
    if (!currentProfile.playResultAudio) {
      if (voiceSessionActiveRef.current && wakeEnabledRef.current) {
        resumeVoiceFlowAfterSpeech();
      } else if (wakeEnabledRef.current && !voiceSessionActiveRef.current) {
        applyWakeState("listening");
      }
      return;
    }

    playAssistantSpeech(text, currentProfile);
  }, [messages, profile.playResultAudio, profile.resultAudioMode]);

  useEffect(() => {
    const bridge = desktopBridge();

    const handleTranscript = (payload) => {
      if (voiceStateRef.current !== "listening") return;
      if (Object.prototype.hasOwnProperty.call(payload || {}, "level")) {
        const level = Math.max(0, Math.min(Number(payload.level || 0) || 0, 1));
        setVoiceLevel(level);
        if (!String(payload?.text || "").trim()) return;
      }
      const text = String(payload?.text || "").trim();
      const base = voiceBaseTextRef.current.trim();
      const nextText = text ? (base ? `${base}\n${text}` : text) : base;
      composerRef.current = nextText;
      setComposer(nextText);
    };

    const browserTranscriptListener = (event) => {
      handleTranscript(event.detail);
    };
    window.addEventListener("aiwb:voice-transcript", browserTranscriptListener);

    const desktopUnsubscribe = bridge?.onVoiceTranscript?.(handleTranscript);
    let nativeSubscription;
    let cancelled = false;

    if (Capacitor.isNativePlatform() && typeof VoiceWorkbench.addListener === "function") {
      VoiceWorkbench.addListener("voiceTranscript", handleTranscript)
        .then((subscription) => {
          if (cancelled) {
            subscription?.remove?.();
            return;
          }
          nativeSubscription = subscription;
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      window.removeEventListener("aiwb:voice-transcript", browserTranscriptListener);
      desktopUnsubscribe?.();
      nativeSubscription?.remove?.();
    };
  }, []);

  function updateServer(serverId, updater) {
    setServers((items) => {
      const nextItems = items.map((server) => {
        if (server.id !== serverId) return server;
        const patch = typeof updater === "function" ? updater(server) : updater;
        const nextServer = { ...server, ...patch };
        if (Array.isArray(nextServer.messages)) {
          nextServer.messages = dedupeRemoteTaskMessages(nextServer.messages);
        }
        return nextServer;
      });
      serversRef.current = nextItems;
      if (workspaceLoadedRef.current) {
        saveLocalMessageHistory(nextItems);
        queueWorkspaceSave(nextItems, activeServerIdRef.current, 250);
      }
      return nextItems;
    });
  }

  function updateActiveServer(updater) {
    updateServer(activeServerIdRef.current, updater);
  }

  function setConnection(nextConnection) {
    updateActiveServer((server) => ({
      connection: {
        ...(server.connection || {}),
        ...nextConnection,
      },
    }));
  }

  function setServerConnection(serverId, nextConnection) {
    updateServer(serverId, (server) => ({
      connection: {
        ...(server.connection || {}),
        ...nextConnection,
      },
    }));
  }

  function connectionStateForRemoteError(message, agent, mode = "ssh") {
    const detail = shortError(message);
    const isConnectionFailure =
      /SSH 登录失败|连接被拒绝|找不到这台机器|Authentication failed|ECONNREFUSED|ENOTFOUND|getaddrinfo|Connection refused/i.test(detail);
    if (isConnectionFailure) return { state: "error", label: "连接失败", detail, mode };
    return { state: "connected", label: "已连接", detail: agent?.shortName || "任务失败", mode };
  }

  function setDiagnostics(nextDiagnostics) {
    updateActiveServer({ diagnostics: nextDiagnostics });
  }

  function setDiscovery(nextDiscovery) {
    updateActiveServer({ discovery: nextDiscovery });
  }

  function setRawOutput(nextRawOutput) {
    updateActiveServer({ rawOutput: nextRawOutput });
  }

  function setServerRawOutput(serverId, nextRawOutput) {
    updateServer(serverId, { rawOutput: nextRawOutput });
  }

  function setMessages(updater) {
    updateActiveServer((server) => ({
      messages: typeof updater === "function" ? updater(server.messages || []) : updater,
    }));
  }

  function setServerMessages(serverId, updater) {
    updateServer(serverId, (server) => ({
      messages: typeof updater === "function" ? updater(server.messages || []) : updater,
    }));
  }

  function updateAssistantMessageInServer(serverId, id, patch) {
    setServerMessages(serverId, (items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        if (item.cancelledAt && !patch.forceUpdate) return item;
        const patchEntries = Object.entries(patch).filter(([key]) => key !== "forceUpdate");
        const changed = patch.forceUpdate || patchEntries.some(([key, value]) => item[key] !== value);
        if (!changed) return item;
        const next = { ...item, ...patch };
        const becameTerminal =
          item.status === "running" &&
          patch.status &&
          !["running"].includes(patch.status);
        if (becameTerminal) {
          const completedAt = Date.now();
          const startedAt = Number(item.startedAt || item.createdAtMs || completedAt);
          next.startedAt = startedAt;
          next.completedAt = completedAt;
          next.durationMs = Math.max(0, completedAt - startedAt);
        }
        return next;
      }),
    );
  }

  function setServerTask(serverId, task) {
    updateServer(serverId, { task });
  }

  function serverById(serverId) {
    return serversRef.current.find((server) => server.id === serverId);
  }

  function ensureServerConversationId(serverId, profileValue, agentId = "codex") {
    const server = serverById(serverId);
    const existing = String(server?.conversationId || "").trim();
    if (existing) return existing;
    const profileForId = normalizeProfile(profileValue || server?.profile || defaultProfile);
    const nextConversationId = createConversationId(
      [profileForId.host, profileForId.username, profileForId.workdir, agentId].filter(Boolean).join("-"),
    );
    updateServer(serverId, { conversationId: nextConversationId });
    return nextConversationId;
  }

  function messagesFromAgentConversation(conversation, agentId, options = {}) {
    if (!conversation?.id) return [];
    const existingTaskIds =
      options.existingTaskIds instanceof Set
        ? options.existingTaskIds
        : new Set((options.existingTaskIds || []).map((value) => String(value || "").trim()).filter(Boolean));
    const fallbackEntry = conversation.taskId
      ? {
          taskId: conversation.taskId,
          sortKey: conversation.historyCursor || "",
          status: conversation.status,
          agentId: conversation.agentId || agentId,
          startedAt: conversation.startedAt,
          finishedAt: conversation.finishedAt,
          exitCode: conversation.exitCode,
          lastPrompt: conversation.lastPrompt,
          lastResult: conversation.lastResult,
          mtime: conversation.mtime,
        }
      : null;
    const entries = (Array.isArray(conversation.history) && conversation.history.length ? conversation.history : fallbackEntry ? [fallbackEntry] : [])
      .filter((entry) => entry?.taskId && !existingTaskIds.has(String(entry.taskId || "").trim()))
      .sort((a, b) => {
        const left = Number(a.mtime || timestampFromAgentTime(a.finishedAt || a.startedAt));
        const right = Number(b.mtime || timestampFromAgentTime(b.finishedAt || b.startedAt));
        return left - right;
      });
    const messages = [];
    entries.forEach((entry) => {
      const entryAgentId = entry.agentId || agentId;
      const agent = agentById(entryAgentId);
      const taskId = String(entry.taskId || "").trim();
      const taskStatus = String(entry.status || "").trim();
      const isRunning = taskStatus === "running" || taskStatus === "queued" || taskStatus === "preparing" || taskStatus === "unknown";
      const lastPrompt = String(entry.lastPrompt || "").trim();
      const rawResult = String(entry.lastResult || "").trim();
      const extracted = rawResult ? extractAgentFinalOutput(rawResult, lastPrompt) : { text: "" };
      const visibleResult = extracted.final ? extracted.text : "";
      const deferredWaitingResult = extracted.final && visibleResult && looksLikeDeferredWaitingAnswer(visibleResult);
      const agentFailure =
        !isRunning && ["error", "cancelled", "missing"].includes(taskStatus)
          ? classifyAgentFailure(rawResult, agent, {
              taskStatus,
              exitCode: entry.exitCode,
              taskId,
              raw: rawResult,
            })
          : null;
      const resultMissing =
        Boolean(lastPrompt) && !isRunning && taskStatus === "done" && (!String(visibleResult || "").trim() || deferredWaitingResult);
      const shouldCreateAssistant = isRunning || visibleResult || agentFailure || resultMissing;
      const startedAtMs = timestampFromAgentTime(entry.startedAt) * 1000 || Number(entry.mtime || 0) * 1000 || Date.now();
      const finishedAtMs = timestampFromAgentTime(entry.finishedAt) * 1000 || Number(entry.mtime || 0) * 1000 || startedAtMs;
      const startedAtLabel = new Date(startedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const finishedAtLabel = new Date(finishedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (lastPrompt) {
        messages.push(
          createMessage({
            id: `agent-${conversation.id}-${taskId}-user`,
            role: "user",
            body: lastPrompt,
            createdAt: startedAtLabel,
            createdAtMs: startedAtMs,
            backend: "agent",
            conversationId: conversation.id,
            remoteTaskId: taskId,
            agentId: entryAgentId,
            promptText: lastPrompt,
          }),
        );
      }
      if (!shouldCreateAssistant) return;
      messages.push(
        createMessage({
          id: `agent-${conversation.id}-${taskId}-assistant`,
          role: "assistant",
          agentId: entryAgentId,
          title: agentFailure
            ? agentFailure.title
            : deferredWaitingResult
            ? `${agent.shortName} 没有给出同步结果`
            : resultMissing
            ? `${agent.shortName} 已结束，但没有最终内容`
            : isRunning
              ? `等待 ${agent.shortName} 回复`
              : `${agent.shortName} 回复`,
          body: agentFailure
            ? agentFailure.body
            : deferredWaitingResult
            ? "远端 AI 把“等待通知/稍后继续”当成最终回复返回了，任务没有真正完成。请重新发送，或明确要求它直接检查状态直到成功、失败或阻塞。"
            : resultMissing
            ? "远端任务已完成，但 App 暂时没有同步到最终回复。可以检查状态或重新发送。"
            : isRunning
              ? "任务仍在运行，正在等待最终结果。恢复连接后会继续同步结果。"
              : "",
          output: isRunning || agentFailure || resultMissing ? "" : visibleResult,
          liveOutput: isRunning ? formatAgentLiveOutput(rawResult, lastPrompt) : "",
          status: isRunning
            ? "running"
            : deferredWaitingResult
            ? "error"
            : resultMissing
            ? "idle"
            : taskStatus === "cancelled"
            ? "cancelled"
            : agentFailure || taskStatus === "error"
            ? "error"
            : "done",
          backend: "agent",
          conversationId: conversation.id,
          remoteTaskId: taskId,
          remoteTaskStatus: deferredWaitingResult ? "deferred-waiting-answer" : taskStatus,
          resultMissing,
          agentFailure: agentFailure || undefined,
          technicalDetail: deferredWaitingResult ? visibleResult : agentFailure?.detail || undefined,
          promptText: lastPrompt,
          startedAt: startedAtMs,
          completedAt: isRunning ? undefined : finishedAtMs,
          createdAt: finishedAtLabel,
          createdAtMs: finishedAtMs,
        }),
      );
    });
    return messages;
  }

  function taskFromAgentConversation(conversation, agentId) {
    if (!conversation?.taskId) return { state: "idle" };
    const status = String(conversation.status || "").trim();
    if (!["queued", "running", "preparing", "unknown"].includes(status)) {
      return {
        state: status === "done" ? "done" : "idle",
        backend: "agent",
        remoteTaskId: conversation.taskId,
        agentId,
        finishedAt: timestampFromAgentTime(conversation.finishedAt) * 1000 || Date.now(),
      };
    }
    return {
      state: "running",
      backend: "agent",
      remoteTaskId: conversation.taskId,
      agentId,
      startedAt: timestampFromAgentTime(conversation.startedAt) * 1000 || Date.now(),
	      label: `同步等待 ${agentById(agentId).shortName}`,
    };
  }

  function agentTaskStatusText(status) {
    const value = String(status || "").trim().toLowerCase();
    if (value === "queued") return "排队中";
    if (value === "preparing") return "准备中";
    if (value === "running") return "运行中";
    if (value === "done") return "已完成";
    if (value === "error") return "执行失败";
    if (value === "cancelled") return "已取消";
    if (value === "missing") return "未找到";
    return value || "未知";
  }

  function agentConversationHistoryEntries(conversation, agentId) {
    const history = Array.isArray(conversation?.history) ? conversation.history : [];
    if (history.length) return history;
    if (!conversation?.taskId) return [];
    return [
      {
        taskId: conversation.taskId,
        status: conversation.status,
        agentId: conversation.agentId || agentId,
        startedAt: conversation.startedAt,
        finishedAt: conversation.finishedAt,
        lastPrompt: conversation.lastPrompt,
        lastResult: conversation.lastResult,
      },
    ];
  }

  function createAgentConversationPullResultMessage(conversation, agentId, restoredMessages, options = {}) {
    const agent = agentById(agentId);
    const entries = agentConversationHistoryEntries(conversation, agentId);
    const restoredUserCount = restoredMessages.filter((message) => message.role === "user").length;
    const restoredAssistantCount = restoredMessages.filter((message) => message.role === "assistant").length;
    const modeText = options.before ? "更早消息" : "最近消息";
    const recentLines = entries.slice(0, 5).map((entry, index) => {
      const prompt = compactInlineText(entry.lastPrompt || "(无任务内容)");
      const taskId = String(entry.taskId || "").trim();
      const suffix = taskId ? ` · ${taskId.slice(-8)}` : "";
      return `${index + 1}. ${agentTaskStatusText(entry.status)}${suffix}\n   ${prompt}`;
    });
    const output = [
      `本次拉取：${modeText}`,
      `远端返回：${entries.length} 条任务记录`,
      `新增到本地：${restoredUserCount} 条用户消息，${restoredAssistantCount} 条 AI 回复`,
      `当前状态：${agentTaskStatusText(conversation.status)}`,
      `AI：${agent.shortName}`,
      `会话 ID：${conversation.id}`,
      conversation.taskId ? `当前任务 ID：${conversation.taskId}` : "",
      `还有更早消息：${conversation.historyHasMore !== false ? "是" : "否"}`,
      recentLines.length ? "\n最近记录：" : "\n最近记录：无",
      ...recentLines,
    ]
      .filter(Boolean)
      .join("\n");

    return createMessage({
      role: "assistant",
      agentId,
      title: "消息列表已拉取",
      body: "",
      output,
      status: "done",
      backend: "agent",
      conversationId: conversation.id,
      remoteTaskStatus: conversation.status || "",
      remoteTaskCheckedAt: Date.now(),
      forceUpdate: true,
    });
  }

  function visibleOutputForStoppedTask(rawOutput, message) {
    const raw = String(rawOutput || "").trim();
    const prompt = String(message?.promptText || "").trim();
    const extracted = raw ? extractAgentFinalOutput(raw, prompt) : { text: "" };
    const canShowRawFallback = raw && !/__AIWB_AGENT_/.test(raw);
    return (
      String(extracted.text || "").trim() ||
      String(message?.liveOutput || "").trim() ||
      String(message?.output || "").trim() ||
      (canShowRawFallback ? formatAgentLiveOutput(raw, prompt) : "") ||
      (canShowRawFallback ? trimVisibleText(raw) : "")
    ).trim();
  }

  function remoteResultNeedsSync(message) {
    if (message?.backend !== "agent" || !message?.remoteTaskId) return false;
    if (String(message.output || "").trim()) return false;
    if (message.resultMissing === true) return true;
    if (
      message.agentFailure?.kind === "agent_tool_issue" &&
      !["error", "cancelled"].includes(String(message.remoteTaskStatus || "").trim())
    ) {
      return true;
    }
    return /没有最终内容|没有拿到.+最终回复|没有给出同步结果|同步等待超时|结果待同步|结果同步|远端任务执行时间太长|SSH 状态连接暂时中断|后台任务仍可能|远端任务仍可能|Keepalive timeout|timed out while waiting for handshake/i.test(
      `${String(message.title || "")}\n${String(message.body || "")}`,
    );
  }

  function runningMessageForServer(server) {
    return [...(server?.messages || [])].reverse().find((message) => message.status === "running") || null;
  }

  function taskLooksStale(server) {
    if (!serverTaskRunning(server)) return false;
    const runningMessage = runningMessageForServer(server);
    if (!runningMessage) return true;
    const remoteStatus = String(runningMessage.remoteTaskStatus || "").trim();
    return ["done", "error", "cancelled", "missing"].includes(remoteStatus);
  }

  function serverNeedsAgentConversationRecovery(server) {
    const profileValue = normalizeProfile(server?.profile);
    if (profileValue.useWorkbenchAgent !== true || isWindowsProfile(profileValue) || !server?.conversationId) return false;
    if (serverTaskRunning(server)) return true;
    return (server?.messages || []).some((message) => {
      if (message?.backend !== "agent") return false;
      const hasTaskId = Boolean(String(message.remoteTaskId || "").trim());
      const status = String(message.remoteTaskStatus || "").trim();
      const remoteTaskFinished = ["done", "error", "cancelled", "missing", "deferred-waiting-answer"].includes(status);
      const text = `${message.title || ""}\n${message.body || ""}\n${message.remoteSyncError || ""}`;
      return (
        (!hasTaskId && (message.resultMissing === true || /任务未能恢复|没有关联 Agent 后台任务 ID/.test(text))) ||
        (message.status === "running" && !remoteTaskFinished) ||
        (remoteResultNeedsSync(message) && !remoteTaskFinished) ||
        status === "sync-lost" ||
        status === "sync-lost-no-task-id" ||
        (!hasTaskId && Boolean(message.remoteSyncError)) ||
        /连不上服务器|恢复连接|同步连接中断|网络恢复|网络异常/i.test(text)
      );
    });
  }

  function releaseStaleRunningTask(serverId, reason = "unknown") {
    const server = serverById(serverId);
    if (!taskLooksStale(server)) return false;
    const agent = agentById(server?.task?.agentId || server?.profile?.agentId || "codex");
    setServerTask(serverId, {
      state: "idle",
      backend: server?.task?.backend || "",
      agentId: agent.id,
      finishedAt: Date.now(),
    });
    setServerConnection(serverId, {
      ...(server?.connection || {}),
      state: "connected",
      label: "已连接",
      detail: agent.shortName,
      mode: server?.connection?.mode || server?.task?.backend || "",
    });
    void appLog("warn", "send.stale_task.released", {
      serverId,
      reason,
      taskState: server?.task?.state || "",
      messageCount: (server?.messages || []).length,
      runningMessageId: runningMessageForServer(server)?.id || "",
      runningRemoteStatus: runningMessageForServer(server)?.remoteTaskStatus || "",
    });
    return true;
  }

  function isServerBusy(serverId) {
    const server = serverById(serverId);
    if (taskLooksStale(server)) return false;
    return serverTaskRunning(server);
  }

  function cancelAssistantSpeechPlayback() {
    assistantSpeechRunIdRef.current += 1;
    assistantSpeechActiveRef.current = false;
    stopAssistantSpeech();
  }

  async function resumeVoiceFlowAfterSpeech() {
    if (
      voiceSessionActiveRef.current &&
      wakeEnabledRef.current &&
      voiceStateRef.current === "idle" &&
      !pendingActionRef.current &&
      profileReadyRef.current
    ) {
      const readyForFollowUp = await waitUntil(
        () => !busyRef.current && !pendingActionRef.current && voiceStateRef.current === "idle",
        { timeoutMs: 5000 },
      );
      if (readyForFollowUp && voiceSessionActiveRef.current && wakeEnabledRef.current) {
        await startVoiceInput({ fromWake: true, silentOnEmpty: true });
      }
    } else if (wakeEnabledRef.current && !voiceSessionActiveRef.current) {
      applyWakeState("listening");
    }
  }

  async function playAssistantSpeech(text, voiceProfile = profileRef.current) {
    const speechRunId = assistantSpeechRunIdRef.current + 1;
    assistantSpeechRunIdRef.current = speechRunId;
    stopAssistantSpeech();

    assistantSpeechActiveRef.current = true;
    if (wakeEnabledRef.current) {
      applyWakeState("speaking");
      try {
        await VoiceWorkbench.stopWakeWord?.();
      } catch {
        // The wake loop will restart after playback or listen for interrupt phrases.
      }
    }

    try {
      await speakAssistantText(
        text,
        () => assistantSpeechRunIdRef.current === speechRunId && assistantSpeechActiveRef.current,
        normalizeProfile(voiceProfile),
      );
    } catch (error) {
      setVoiceError(shortError(error));
    } finally {
      if (assistantSpeechRunIdRef.current !== speechRunId) return;
      assistantSpeechActiveRef.current = false;
      await resumeVoiceFlowAfterSpeech();
    }
  }

  async function switchToServerFromVoice(serverId, fallbackIndex = -1, { listenAfterSwitch = false } = {}) {
    const target = serverId ? serverById(serverId) : serversRef.current[fallbackIndex];
    const targetIndex = target ? serversRef.current.findIndex((server) => server.id === target.id) : fallbackIndex;

    if (!target) {
      if (fallbackIndex >= 0) setVoiceError(`没有第 ${fallbackIndex + 1} 个会话。`);
      return { ok: false, running: false };
    }

    await selectServer(target.id);
    const running = serverTaskRunning(target);
    setServerConnection(target.id, {
      ...(target.connection || {}),
      state: running ? "testing" : target.connection?.state || "connected",
      label: running ? "运行中" : "已切换",
      detail: serverSessionName(target, targetIndex >= 0 ? targetIndex : 0),
    });

    if (running) {
      voiceSessionActiveRef.current = false;
      setVoiceError(`${serverSessionName(target, targetIndex >= 0 ? targetIndex : 0)} 正在运行，完成后会提醒你。`);
      return { ok: true, running: true, target };
    }

    if (listenAfterSwitch) {
      voiceSessionActiveRef.current = true;
      await startVoiceInput({ fromWake: true, silentOnEmpty: true });
    }

    return { ok: true, running: false, target };
  }

  async function playLastResultForVoiceCommand(commandMatch = {}) {
    const currentServers = serversRef.current;
    const target = commandMatch.current
      ? serverById(activeServerIdRef.current)
      : currentServers[Number(commandMatch.index)];
    const targetIndex = target ? currentServers.findIndex((server) => server.id === target.id) : Number(commandMatch.index);

    if (!target) {
      if (Number.isFinite(Number(commandMatch.index))) setVoiceError(`没有第 ${Number(commandMatch.index) + 1} 个任务。`);
      else setVoiceError("没有可播放的任务。");
      return true;
    }

    const lastMessage = lastSpeakableMessageForServer(target);
    const speech = speechTextFromMessage(lastMessage);
    const name = serverSessionName(target, targetIndex >= 0 ? targetIndex : 0);
    if (!speech) {
      setVoiceError(`${name} 还没有可播放的返回结果。`);
      return true;
    }

    voiceSessionActiveRef.current = false;
    setVoiceError(`正在播放 ${name} 的最新结果。`);
    await playAssistantSpeech(speech, profileRef.current);
    return true;
  }

  async function handleLocalVoiceCommand(text) {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return false;

    if (isSpeechStopPhrase(text)) {
      voiceSessionActiveRef.current = false;
      cancelAssistantSpeechPlayback();
      applyWakeState(wakeEnabledRef.current ? "listening" : "idle");
      setVoiceError("");
      return true;
    }

    const playbackMatch = parsePlaybackCommandIndex(text);
    if (playbackMatch) {
      await playLastResultForVoiceCommand(playbackMatch);
      return true;
    }

    return false;
  }

  async function handleSpeechInterruptPhrase(phrase) {
    const context = speechInterruptContextForServers(serversRef.current, activeServerIdRef.current, profileRef.current);
    const playbackMatch =
      playbackCommandMatchFromPhrase(phrase, context) ||
      (currentResultPlaybackPhrases.some((item) => normalizeVoiceText(item) === normalizeVoiceText(phrase))
        ? { current: true }
        : null);

    if (playbackMatch) {
      cancelAssistantSpeechPlayback();
      await playLastResultForVoiceCommand(playbackMatch);
      return true;
    }

    const switchMatch = taskWakeMatchFromPhrase(phrase, context);

    if (switchMatch?.serverId) {
      cancelAssistantSpeechPlayback();
      await switchToServerFromVoice(switchMatch.serverId, switchMatch.index, { listenAfterSwitch: true });
      return true;
    }

    if (isSpeechStopPhrase(phrase)) {
      voiceSessionActiveRef.current = false;
      cancelAssistantSpeechPlayback();
      applyWakeState("listening");
      setVoiceError("");
      return true;
    }

    if (isGlobalWakePhrase(phrase, context)) {
      cancelAssistantSpeechPlayback();
      voiceSessionActiveRef.current = true;
      applyWakeState("detected");
      await sleep(120);
      await startVoiceInput({ fromWake: true });
      return true;
    }

    return false;
  }

  async function listenForSpeechInterrupt(loopId) {
    const context = speechInterruptContextForServers(serversRef.current, activeServerIdRef.current, profileRef.current);
    if (!context.phrases.length) {
      await sleep(700);
      return;
    }

    try {
      const result = await VoiceWorkbench.startWakeWord({
        locale: "zh-CN",
        phrases: context.phrases,
        timeoutSeconds: 4,
        apiKey: profileRef.current?.aliyunApiKey,
        workspaceId: profileRef.current?.aliyunWorkspaceId,
      });

      if (!wakeEnabledRef.current || wakeLoopIdRef.current !== loopId || !assistantSpeechActiveRef.current) return;
      if (result?.detected) {
        setWakeError("");
        await handleSpeechInterruptPhrase(result.phrase);
      }
    } catch (error) {
      if (!wakeEnabledRef.current || wakeLoopIdRef.current !== loopId || !assistantSpeechActiveRef.current) return;
      setWakeError(shortError(error));
      await sleep(900);
    }
  }

  function clearTaskNoticeLater(id) {
    window.setTimeout(() => {
      setTaskNotice((current) => (current?.id === id ? null : current));
    }, 4200);
  }

  async function drainTaskNoticeQueue() {
    if (noticeSpeakingRef.current) return;
    if (voiceStateRef.current !== "idle") {
      window.setTimeout(drainTaskNoticeQueue, 900);
      return;
    }

    const nextNotice = noticeQueueRef.current.shift();
    if (!nextNotice) return;

    noticeSpeakingRef.current = true;
    setTaskNotice(nextNotice);
    clearTaskNoticeLater(nextNotice.id);
    try {
      const currentProfile = normalizeProfile(profileRef.current);
      if (currentProfile.playResultAudio && nextNotice.speech) {
        await playAssistantSpeech(nextNotice.speech, currentProfile);
      } else {
        await sleep(100);
      }
    } finally {
      noticeSpeakingRef.current = false;
      if (noticeQueueRef.current.length) window.setTimeout(drainTaskNoticeQueue, 500);
    }
  }

  function enqueueTaskNotice({ serverId, title, speech, tone = "done" }) {
    const notice = {
      id: `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      serverId,
      title,
      speech,
      tone,
    };
    noticeQueueRef.current.push(notice);
    drainTaskNoticeQueue();
  }

  function notifyTaskFinished(serverId, agent, ok = true) {
    if (serverId === activeServerIdRef.current) return;
    const server = serverById(serverId);
    if (!server) return;
    const index = serversRef.current.findIndex((item) => item.id === serverId);
    const name = serverSessionName(server, index >= 0 ? index : 0);
    const speech = serverCompletionSpeech(
      server,
      index >= 0 ? index : 0,
      ok,
      normalizeProfile(profileRef.current).resultAudioMode,
    );
    updateServer(serverId, {
      unreadResult: {
        tone: ok ? "done" : "error",
        title: ok ? `${name} 已完成` : `${name} 失败了`,
        finishedAt: Date.now(),
      },
    });
    enqueueTaskNotice({
      serverId,
      tone: ok ? "done" : "error",
      title: ok ? `${name} 已完成` : `${name} 失败了`,
      speech,
    });
  }

  function applyVoiceState(nextState) {
    voiceStateRef.current = nextState;
    setVoiceState(nextState);
    if (nextState === "idle") setVoiceLevel(0);
  }

  function applyWakeState(nextState) {
    wakeStateRef.current = nextState;
    setWakeState(nextState);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      void appLog("info", "profile.load.start", { platform: Capacitor.getPlatform() });
      try {
        const result = await SSHWorkbench.loadProfile();
        if (cancelled) return;

        const nativeProfile = result?.profile;
        const mirrorProfile = loadWorkspaceMirror();
        const profileStore = workspaceStoreHasServers(nativeProfile) ? nativeProfile : mirrorProfile;
        const source = workspaceStoreHasServers(nativeProfile) ? "native" : mirrorProfile ? "local-mirror" : "empty";
        if (workspaceStoreHasServers(nativeProfile)) saveWorkspaceMirror(nativeProfile);
        if (source === "local-mirror") {
          void appLog("warn", "profile.load.fallback_mirror", {
            nativeHasServers: workspaceStoreHasServers(nativeProfile),
            mirrorServerCount: mirrorProfile?.servers?.length || 0,
          });
        }

        const loaded = normalizeWorkspaceStore(profileStore || nativeProfile);
        loaded.servers = dedupeServerRemoteTaskMessages(mergeLocalMessageHistory(loaded.servers));
        const active =
          loaded.servers.find((server) => server.id === desktopWindowContext.serverId) ||
          loaded.servers.find((server) => server.id === loaded.activeServerId) ||
          loaded.servers[0];
        setServers(loaded.servers);
        serversRef.current = loaded.servers;
        primaryActiveServerIdRef.current = loaded.activeServerId || active.id;
        setActiveServerId(active.id);
        activeServerIdRef.current = active.id;
        setEditingServerId(active.id);
        updateDraftProfile(active.profile);
        setActiveAgentId(normalizeProfile(active.profile).agentId);
        setWorkspaceLoaded(true);
        void appLog("info", "profile.load.success", {
          source,
          ...workspaceDiagnosticSummary(loaded.servers, active.id),
        });
      } catch (error) {
        if (cancelled) return;
        const mirrorProfile = loadWorkspaceMirror();
        if (mirrorProfile) {
          const loaded = normalizeWorkspaceStore(mirrorProfile);
          loaded.servers = dedupeServerRemoteTaskMessages(mergeLocalMessageHistory(loaded.servers));
          const active =
            loaded.servers.find((server) => server.id === desktopWindowContext.serverId) ||
            loaded.servers.find((server) => server.id === loaded.activeServerId) ||
            loaded.servers[0];
          setServers(loaded.servers);
          serversRef.current = loaded.servers;
          primaryActiveServerIdRef.current = loaded.activeServerId || active.id;
          setActiveServerId(active.id);
          activeServerIdRef.current = active.id;
          setEditingServerId(active.id);
          updateDraftProfile(active.profile);
          setActiveAgentId(normalizeProfile(active.profile).agentId);
          setWorkspaceLoaded(true);
          void appLog("warn", "profile.load.recovered_from_mirror", {
            error: shortError(error),
            ...workspaceDiagnosticSummary(loaded.servers, active.id),
          });
          return;
        }
        const fallback = createServerSession({ id: "default-server", name: "默认服务器", profile: defaultProfile });
        setServers([fallback]);
        serversRef.current = [fallback];
        primaryActiveServerIdRef.current = fallback.id;
        setActiveServerId(fallback.id);
        activeServerIdRef.current = fallback.id;
        setEditingServerId(fallback.id);
        updateDraftProfile(defaultProfile);
        setActiveAgentId(defaultProfile.agentId);
        setWorkspaceLoaded(true);
        void appLog("error", "profile.load.failed", { error: shortError(error) });
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [desktopWindowContext.serverId]);

  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge?.onProfileUpdated) return undefined;
    return bridge.onProfileUpdated((payload) => {
      if (!workspaceStoreHasServers(payload?.profile)) return;
      const loaded = normalizeWorkspaceStore(payload.profile);
      loaded.servers = dedupeServerRemoteTaskMessages(mergeLocalMessageHistory(loaded.servers));
      const active =
        loaded.servers.find((server) => server.id === desktopWindowContext.serverId) ||
        loaded.servers.find((server) => server.id === activeServerIdRef.current) ||
        loaded.servers.find((server) => server.id === loaded.activeServerId) ||
        loaded.servers[0];
      if (!active) return;
      applyingExternalProfileRef.current = true;
      primaryActiveServerIdRef.current = loaded.activeServerId || primaryActiveServerIdRef.current || active.id;
      saveWorkspaceMirror(payload.profile);
      saveLocalMessageHistory(loaded.servers);
      setServers(loaded.servers);
      serversRef.current = loaded.servers;
      setActiveServerId(active.id);
      activeServerIdRef.current = active.id;
      updateDraftProfile(active.profile);
      profileRef.current = active.profile;
      setActiveAgentId(normalizeProfile(active.profile).agentId);
    });
  }, [desktopWindowContext.serverId]);

  const runRemoteCommand = useCallback(async (command, maxResponseSize = 1_048_576, commandTimeoutSeconds = 180) => {
    const current = withKnownPassword(profileRef.current);
    const missing = profileIssue(current);
    if (missing) {
      throw new Error(missing);
    }
    const commandPayload = command && typeof command === "object" ? command : { command };
    const diagnostics = commandDiagnosticPayload(current, commandPayload, maxResponseSize, commandTimeoutSeconds);
    const startedAt = Date.now();

    void appLog("info", "ssh.command.start", diagnostics);
    try {
      const result = await SSHWorkbench.runCommand({
        host: current.host,
        port: current.port,
        username: current.username,
        password: current.password,
        connectTimeoutSeconds: current.connectTimeoutSeconds,
        commandTimeoutSeconds,
        ...commandPayload,
        maxResponseSize,
      });
      void appLog("info", "ssh.command.success", {
        ...diagnostics,
        durationMs: Date.now() - startedAt,
        outputLength: String(result?.stdout || "").length,
      });
      return result?.stdout ?? "";
    } catch (error) {
      void appLog("error", "ssh.command.failed", {
        ...diagnostics,
        durationMs: Date.now() - startedAt,
        error: shortError(error),
      });
      throw error;
    }
  }, []);

  const runRemoteCommandForProfile = useCallback(async (targetProfile, command, maxResponseSize = 1_048_576, commandTimeoutSeconds = 180) => {
    const current = withKnownPassword(targetProfile);
    const missing = profileIssue(current);
    if (missing) {
      throw new Error(missing);
    }
    const commandPayload = command && typeof command === "object" ? command : { command };
    console.info("[aiwb:renderer:run-command]", {
      host: current.host,
      port: current.port,
      username: current.username,
      platform: normalizeServerPlatform(current.platform),
      passwordLength: String(current.password || "").length,
      commandKind: commandPayload.uploadScript ? "uploaded-powershell" : commandPayload.stdin ? "stdin" : "exec",
      stdinLength: String(commandPayload.stdin || "").length,
      commandTimeoutSeconds,
      maxResponseSize,
    });

    const diagnostics = commandDiagnosticPayload(current, commandPayload, maxResponseSize, commandTimeoutSeconds);
    const startedAt = Date.now();
    void appLog("info", "ssh.command.start", diagnostics);

    try {
      const result = await SSHWorkbench.runCommand({
        host: current.host,
        port: current.port,
        username: current.username,
        password: current.password,
        connectTimeoutSeconds: current.connectTimeoutSeconds,
        commandTimeoutSeconds,
        ...commandPayload,
        maxResponseSize,
      });
      void appLog("info", "ssh.command.success", {
        ...diagnostics,
        durationMs: Date.now() - startedAt,
        outputLength: String(result?.stdout || "").length,
      });
      return result?.stdout ?? "";
    } catch (error) {
      void appLog("error", "ssh.command.failed", {
        ...diagnostics,
        durationMs: Date.now() - startedAt,
        error: shortError(error),
      });
      throw error;
    }
  }, []);

  async function uploadImageAttachmentsForProfile(targetProfile, attachments = []) {
    const items = attachments.filter((item) => cleanBase64Payload(item?.base64));
    if (!items.length) return [];
    const uploaded = [];
    for (let index = 0; index < items.length; index += 1) {
      const attachment = items[index];
      const command = buildRemoteImageUploadCommand(targetProfile, attachment, index);
      const output = await runRemoteCommandForProfile(targetProfile, command, 64_000, 240);
      uploaded.push(parseRemoteImageUploadPayload(output, command));
    }
    return uploaded;
  }

  async function routeUserIntent({ currentProfile, text, agent, sourceMessages = messages }) {
    if (!mainAIRouterReady(currentProfile)) return null;

    const result = await SSHWorkbench.routeIntent({
      apiKey: currentProfile.openAIAPIKey,
      requestBody: buildMainAIRouteRequest({
        profile: currentProfile,
        text,
        activeAgent: agent,
        messages: sourceMessages,
      }),
      timeoutSeconds: 20,
    });

    return parseMainAIRoute(result?.body || result?.json || result, agent);
  }

  const saveWorkspace = useCallback(async (nextServers, nextActiveServerId) => {
    const persistedActiveServerId = desktopWindowContext.detachedChat
      ? primaryActiveServerIdRef.current || nextActiveServerId
      : nextActiveServerId;
    if (!desktopWindowContext.detachedChat) primaryActiveServerIdRef.current = persistedActiveServerId;
    const profileStore = serializeWorkspaceStore(nextServers, persistedActiveServerId);
    saveLocalMessageHistory(nextServers);
    saveWorkspaceMirror(profileStore);
    void appLog("info", "profile.save.start", workspaceDiagnosticSummary(nextServers, nextActiveServerId));
    try {
      await SSHWorkbench.saveProfile({
        profile: profileStore,
      });
      void appLog("info", "profile.save.success", workspaceDiagnosticSummary(nextServers, nextActiveServerId));
    } catch (error) {
      void appLog("error", "profile.save.failed", {
        error: shortError(error),
        ...workspaceDiagnosticSummary(nextServers, nextActiveServerId),
      });
      throw error;
    }
  }, [desktopWindowContext.detachedChat]);

  function queueWorkspaceSave(nextServers, nextActiveServerId = activeServerIdRef.current, delayMs = 250) {
    if (!workspaceLoadedRef.current || typeof window === "undefined") return;
    if (workspaceSaveTimerRef.current) window.clearTimeout(workspaceSaveTimerRef.current);
    const snapshot = Array.isArray(nextServers) ? nextServers : serversRef.current;
    const activeId = nextActiveServerId || activeServerIdRef.current;
    workspaceSaveTimerRef.current = window.setTimeout(() => {
      workspaceSaveTimerRef.current = null;
      saveWorkspace(snapshot, activeId).catch((error) => {
        console.warn("[aiwb:queued-save:error]", shortError(error));
      });
    }, delayMs);
  }

  function flushWorkspaceSave() {
    if (!workspaceLoadedRef.current) return;
    if (typeof window !== "undefined" && workspaceSaveTimerRef.current) {
      window.clearTimeout(workspaceSaveTimerRef.current);
      workspaceSaveTimerRef.current = null;
    }
    const snapshot = serversRef.current.length ? serversRef.current : servers;
    saveLocalMessageHistory(snapshot);
    saveWorkspace(snapshot, activeServerIdRef.current || activeServerId).catch((error) => {
      console.warn("[aiwb:flush-save:error]", shortError(error));
    });
  }

  async function exportWorkspaceConfig() {
    const snapshot = serversRef.current.length ? serversRef.current : servers;
    const activeId = activeServerIdRef.current || activeServerId;
    const payload = buildWorkspaceMigrationPayload(snapshot, activeId);
    await SSHWorkbench.saveFile({
      name: migrationFileName(),
      mime: "application/json",
      base64: toBase64Utf8(JSON.stringify(payload, null, 2)),
    });
    return {
      count: payload.workspace.servers.length,
      message: `已导出 ${payload.workspace.servers.length} 个会话配置。`,
    };
  }

  async function exportDiagnosticsLogs() {
    const snapshot = serversRef.current.length ? serversRef.current : servers;
    const activeId = activeServerIdRef.current || activeServerId;
    const currentActive = snapshot.find((server) => server.id === activeId) || activeServer;
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    const context = {
      ...workspaceDiagnosticSummary(snapshot, activeId),
      client: {
        platform: Capacitor.getPlatform(),
        native: Capacitor.isNativePlatform(),
        nativeDeviceClass,
        appearanceMode: normalizeAppearanceMode((profileRef.current || profile).appearanceMode),
        resolvedTheme,
        online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
        visibilityState: typeof document !== "undefined" ? document.visibilityState : undefined,
        viewport: typeof window !== "undefined" ? {
          width: Math.round(window.innerWidth || 0),
          height: Math.round(window.innerHeight || 0),
          devicePixelRatio: Number(window.devicePixelRatio || 1),
          visualWidth: viewport ? Math.round(viewport.width || 0) : undefined,
          visualHeight: viewport ? Math.round(viewport.height || 0) : undefined,
          visualOffsetTop: viewport ? Math.round(viewport.offsetTop || 0) : undefined,
        } : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      },
      activeSession: {
        id: activeId,
        name: currentActive ? serverSessionName(currentActive, Math.max(0, snapshot.findIndex((server) => server.id === activeId))) : "",
        connectionMode: connectionModeForServer(currentActive || activeServer, currentActive?.connection || connection)?.id || "",
        agentId: normalizeProfile(currentActive?.profile || profile).agentId,
        taskState: currentActive?.task?.state || "idle",
        messageCount: Array.isArray(currentActive?.messages) ? currentActive.messages.length : 0,
      },
    };
    void appLog("info", "diagnostics.export.start", context);
    const result = await SSHWorkbench.exportLogs({ context });
    void appLog("info", "diagnostics.export.success", {
      fileName: result?.name,
      path: result?.path,
      serverCount: context.serverCount,
    });
    return {
      ...result,
      message: "诊断日志已打包，可以直接分享给微信或保存到文件。",
    };
  }

  async function importWorkspaceConfig(fileText) {
    const imported = parseWorkspaceMigrationText(fileText);
    const currentServers = serversRef.current.length ? serversRef.current : servers;
    const nextServers = mergeImportedServers(currentServers, imported.store.servers);
    const importedActiveId = imported.store.activeServerId;
    const firstImportedId = imported.store.servers[0]?.id;
    const nextActiveServerId =
      nextServers.find((server) => server.id === importedActiveId)?.id ||
      nextServers.find((server) => server.id === firstImportedId)?.id ||
      nextServers[0]?.id;
    const nextActive = nextServers.find((server) => server.id === nextActiveServerId) || nextServers[0];

    if (imported.directoryPrefs) {
      saveDirectoryPrefs(mergeDirectoryPrefs(loadDirectoryPrefs(), imported.directoryPrefs));
    }
    if (imported.manualWorkdirHistory) {
      saveManualWorkdirHistory(mergeManualWorkdirHistory(loadManualWorkdirHistory(), imported.manualWorkdirHistory));
    }

    setServers(nextServers);
    serversRef.current = nextServers;
    setActiveServerId(nextActive.id);
    activeServerIdRef.current = nextActive.id;
    setEditingServerId(nextActive.id);
    updateDraftProfile(nextActive.profile);
    profileRef.current = nextActive.profile;
    setActiveAgentId(normalizeProfile(nextActive.profile).agentId);
    await saveWorkspace(nextServers, nextActive.id);

    return {
      count: imported.store.servers.length,
      message: `已导入 ${imported.store.servers.length} 个会话配置。`,
    };
  }

  useEffect(() => {
    if (!workspaceLoaded) return undefined;
    if (applyingExternalProfileRef.current) {
      applyingExternalProfileRef.current = false;
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const nextServers = serversRef.current.length ? serversRef.current : servers;
      const nextActiveServerId = activeServerIdRef.current || activeServerId;
      saveWorkspace(nextServers, nextActiveServerId).catch((error) => {
        console.warn("[aiwb:autosave:error]", shortError(error));
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [activeServerId, saveWorkspace, servers, workspaceLoaded]);

  useEffect(() => {
    const handlePageHide = () => flushWorkspaceSave();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushWorkspaceSave();
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeServerId, saveWorkspace, servers]);

  function withKnownPassword(profileValue, serverList = serversRef.current.length ? serversRef.current : servers) {
    const normalized = normalizeProfile(profileValue);
    if (String(normalized.password || "").trim()) return normalized;

    const connectionKey = profileConnectionKey(normalized);
    const matched = (serverList || [])
      .map((server) => normalizeProfile(server.profile))
      .find((item) => profileConnectionKey(item) === connectionKey && String(item.password || "").trim());

    return matched?.password ? { ...normalized, password: matched.password } : normalized;
  }

  const saveCurrentProfile = useCallback(async (nextProfile = draftProfileRef.current) => {
    const currentServers = serversRef.current.length ? serversRef.current : servers;
    const existing = currentServers.find((server) => server.id === editingServerId);
    const existingProfile = existing ? normalizeProfile(existing.profile) : null;
    const normalized = withKnownPassword(
      existingProfile ? { ...existingProfile, ...nextProfile } : nextProfile,
      currentServers,
    );
    const name = String(normalized.name || "").trim() || existing?.name || existingProfile?.name || "";
    const workdir = String(normalized.workdir || "").trim() || existingProfile?.workdir || "";
    const profileForServer = {
      ...normalized,
      name,
      workdir,
    };
    const nextServerId = existing ? existing.id : createServerId();
    const nextServer = createServerSession(
      {
        ...(existing || {}),
        id: nextServerId,
        name,
        profile: profileForServer,
        connection: initialConnectionForProfile(profileForServer),
        diagnostics: existing?.diagnostics || {},
        discovery: existing?.discovery || null,
        rawOutput: existing?.rawOutput || "原始输出会在测试连接或发送任务后显示。",
        messages: existing?.messages || [],
      },
      servers.length,
    );
    const nextServers = existing
      ? currentServers.map((server) => (server.id === existing.id ? nextServer : server))
      : [...currentServers, nextServer];

    setServers(nextServers);
    serversRef.current = nextServers;
    setActiveServerId(nextServer.id);
    activeServerIdRef.current = nextServer.id;
    setEditingServerId(nextServer.id);
    updateDraftProfile(profileForServer);
    profileRef.current = profileForServer;
    setActiveAgentId(profileForServer.agentId);
    await saveWorkspace(nextServers, nextServer.id);
    return profileForServer;
  }, [draftProfile, editingServerId, saveWorkspace, servers]);

  function showProfileIssue(nextProfile, openSettings = true) {
    const issue = profileIssue(nextProfile);
    if (!issue) return false;

    setConnection({ state: "error", label: "待配置", detail: issue });
    setRawOpen(false);
    setRawOutput(issue);
    if (openSettings) openNewServerSettings();
    return true;
  }

  async function selectServer(serverId) {
    const currentServers = serversRef.current;
    const target = currentServers.find((server) => server.id === serverId);
    if (!target) return;

    const hydratedTargetProfile = withKnownPassword(target.profile, currentServers);
    const needsProfileHydration = hydratedTargetProfile.password !== normalizeProfile(target.profile).password;
    const nextServers =
      target.unreadResult || needsProfileHydration
        ? currentServers.map((server) =>
            server.id === serverId
              ? {
                  ...server,
                  profile: needsProfileHydration ? hydratedTargetProfile : server.profile,
                  unreadResult: null,
                }
              : server,
          )
        : currentServers;
    if (nextServers !== currentServers) {
      setServers(nextServers);
      serversRef.current = nextServers;
    }

    if (serverId === activeServerIdRef.current) {
      const nextServer = nextServers.find((server) => server.id === serverId);
      const nextProfile = nextServer ? withKnownPassword(nextServer.profile, nextServers) : hydratedTargetProfile;
      profileRef.current = nextProfile;
      updateDraftProfile(nextProfile);
      setActiveAgentId(nextProfile.agentId);
      if (nextServers !== currentServers) await saveWorkspace(nextServers, serverId);
      return;
    }

    const nextServer = nextServers.find((server) => server.id === serverId);
    if (!nextServer) return;

    setActiveServerId(serverId);
    activeServerIdRef.current = serverId;
    const nextProfile = withKnownPassword(nextServer.profile, nextServers);
    profileRef.current = nextProfile;
    setEditingServerId(serverId);
    updateDraftProfile(nextProfile);
    setActiveAgentId(nextProfile.agentId);
    setRawOpen(false);
    await saveWorkspace(nextServers, serverId);
  }

  const refreshAgentHealthForServer = useCallback(
    async (serverId, reason = "auto") => {
      const currentServers = serversRef.current.length ? serversRef.current : [];
      const target = currentServers.find((server) => server.id === serverId);
      if (!target) return;

      const targetProfile = withKnownPassword(target.profile, currentServers);
      if (isWindowsProfile(targetProfile) || profileIssue(targetProfile)) return;

      const connectionKey = profileConnectionKey(targetProfile);
      const key = `${connectionKey}:${reason}`;
      if (agentHealthRefreshKeysRef.current.has(key) || agentHealthInFlightConnectionsRef.current.has(connectionKey)) return;
      agentHealthRefreshKeysRef.current.add(key);
      agentHealthInFlightConnectionsRef.current.add(connectionKey);

      try {
        const stdout = await runRemoteCommandForProfile(targetProfile, buildWorkbenchAgentTaskListCommand(targetProfile), 768_000, 30);
        const parsed = parseWorkbenchAgentOutput(stdout);
        if (parsed.status !== "ready" && !parsed.version) return;

        const agentHealth = healthFromWorkbenchAgentStatus(parsed);
        const nextServers = serversRef.current.map((server) => {
          const serverProfile = normalizeProfile(server.profile);
          if (profileConnectionKey(serverProfile) !== connectionKey) return server;
          const isTargetServer = server.id === serverId;
          return {
            ...server,
            diagnostics: {
              ...(server.diagnostics || {}),
              ...agentHealth,
              agent: "available",
              agent_version: agentHealth.agent_version || parsed.version || server.diagnostics?.agent_version || "1",
            },
            rawOutput: server.id === serverId ? stdout.trim() || server.rawOutput : server.rawOutput,
            connection: {
              ...(server.connection || {}),
              mode: serverProfile.useWorkbenchAgent ? "agent" : server.connection?.mode || "ssh",
              ...(isTargetServer
                ? {
                    state: "connected",
                    label: "已连接",
                    detail: "Agent 正常",
                  }
                : {}),
            },
          };
        });
        setServers(nextServers);
        serversRef.current = nextServers;
        queueWorkspaceSave(nextServers, activeServerIdRef.current, 100);
      } catch (error) {
        void appLog("warn", "agent.health.refresh.failed", {
          serverId,
          reason,
          error: shortError(error),
        });
      } finally {
        agentHealthInFlightConnectionsRef.current.delete(connectionKey);
        window.setTimeout(() => agentHealthRefreshKeysRef.current.delete(key), 30_000);
      }
    },
    [runRemoteCommandForProfile],
  );

  useEffect(() => {
    if (!workspaceLoaded) return;
    if (agentStartupHealthCheckedRef.current) return;
    agentStartupHealthCheckedRef.current = true;
    const currentServers = serversRef.current.length ? serversRef.current : [];
    for (const server of currentServers) {
      const normalized = withKnownPassword(server.profile, currentServers);
      if (isWindowsProfile(normalized) || !profileReady(normalized)) continue;
      void refreshAgentHealthForServer(server.id, "startup");
    }
  }, [refreshAgentHealthForServer, workspaceLoaded]);

  async function connectExistingSession(serverId = activeServerIdRef.current) {
    if (busy) return;

    const currentServers = serversRef.current.length ? serversRef.current : servers;
    const target = currentServers.find((server) => server.id === serverId) || activeServer;
    if (!target) return;

    const targetProfile = withKnownPassword(target.profile, currentServers);
    const issue = profileIssue(targetProfile);

    setActiveServerId(target.id);
    activeServerIdRef.current = target.id;
    profileRef.current = targetProfile;
    setEditingServerId(target.id);
    updateDraftProfile(targetProfile);
    setActiveAgentId(targetProfile.agentId);
    setRawOpen(false);

    if (issue) {
      setServerConnection(target.id, { state: "error", label: "待配置", detail: issue });
      openServerSettings(target.id);
      return;
    }

    setBusy(true);
    setServers((items) => {
      const nextItems = items.map((server) =>
        server.id === target.id
          ? {
              ...server,
              profile: targetProfile,
              connection: {
                ...(server.connection || {}),
                state: "testing",
                label: "连接中",
                detail: targetProfile.workdir,
              },
              discovery: null,
              unreadResult: null,
            }
          : server,
      );
      serversRef.current = nextItems;
      return nextItems;
    });

    try {
      const stdout = await runRemoteCommandForProfile(targetProfile, buildHealthCommand(targetProfile), 512_000, 60);
      const parsed = parseHealth(stdout);
      const detectedProfile = profileWithDetectedTools(targetProfile, parsed);
      profileRef.current = detectedProfile;
      updateDraftProfile(detectedProfile);
      setActiveAgentId(detectedProfile.agentId);
      const nextServers = serversRef.current.map((server) =>
        server.id === target.id
          ? {
              ...server,
              profile: detectedProfile,
              connection: {
                state: "connected",
                label: "已连接",
                detail: `${parsed.user || detectedProfile.username}@${parsed.host || detectedProfile.host}`,
                mode: connectionModeFromHealth(parsed),
              },
              diagnostics: {
                ...(server.diagnostics || {}),
                ...parsed,
                pwd: parsed.pwd || detectedProfile.workdir,
              },
              discovery: null,
              rawOutput: stdout.trim() || "连接成功。",
            }
          : connectionIsLive(server.connection) && !serverTaskRunning(server)
            ? {
                ...server,
                connection: readyConnectionForSession(server.profile, server.connection),
              }
            : server,
      );
      setServers(nextServers);
      serversRef.current = nextServers;
      await saveWorkspace(nextServers, target.id);
    } catch (error) {
      const message = shortError(error);
      setRawOpen(true);
      setServers((items) => {
        const nextItems = items.map((server) =>
          server.id === target.id
            ? {
                ...server,
                connection: { state: "error", label: "连接失败", detail: message },
                discovery: null,
                rawOutput: message,
              }
            : server,
        );
        serversRef.current = nextItems;
        return nextItems;
      });
    } finally {
      setBusy(false);
    }
  }

  async function disconnectSession(serverId = activeServerIdRef.current) {
    if (busy) return;
    const currentServers = serversRef.current.length ? serversRef.current : servers;
    const target = currentServers.find((server) => server.id === serverId) || activeServer;
    if (!target || serverTaskRunning(target)) return;

    const targetProfile = withKnownPassword(target.profile, currentServers);
    const nextConnection = {
      ...dormantConnectionForProfile(targetProfile, target.connection, "未连接"),
      detail: "已断开",
    };

    setServerConnection(target.id, nextConnection);
    if (target.id === activeServerIdRef.current) {
      setRawOpen(false);
      setRawOutput("已断开当前 App 里的连接状态。配置和历史记录仍然保留。");
    }
    const nextServers = currentServers.map((server) =>
      server.id === target.id
        ? {
            ...server,
            connection: nextConnection,
          }
        : server,
    );
    serversRef.current = nextServers;
    setServers(nextServers);
    await saveWorkspace(nextServers, activeServerIdRef.current);
  }

  function openServerSettings(serverId = activeServerIdRef.current) {
    const currentServers = serversRef.current.length ? serversRef.current : servers;
    const target = currentServers.find((server) => server.id === serverId) || activeServer;
    const targetProfile = withKnownPassword(target.profile, currentServers);
    setEditingServerId(target.id);
    updateDraftProfile(targetProfile);
    setSettingsDiscovery(null);
    setSettingsSelectedSessions([]);
    setSettingsAgentTab(targetProfile.agentId);
    setAgentManagementTargetId("");
    setSettingsOpen(true);
  }

  function openGlobalSettings(targetServerId = "") {
    const nextAgentTargetId = typeof targetServerId === "string" ? targetServerId : "";
    setEditingServerId("global");
    updateDraftProfile({
      ...defaultProfile,
      ...globalSettingsFromProfile(profileRef.current),
    });
    setSettingsDiscovery(null);
    setSettingsSelectedSessions([]);
    setSettingsAgentTab(activeAgentId);
    setAgentManagementTargetId(nextAgentTargetId);
    setSettingsOpen(true);
  }

  function openNewServerSettings() {
    const globalSettings = globalSettingsFromProfile(profileRef.current);
    const nextProfile = {
      ...defaultProfile,
      ...globalSettings,
      host: "",
      username: "",
      password: "",
      name: `服务器 ${servers.length + 1}`,
    };
    setEditingServerId("");
    updateDraftProfile(nextProfile);
    setSettingsDiscovery(null);
    setSettingsSelectedSessions([]);
    setSettingsAgentTab("codex");
    setAgentManagementTargetId("");
    setSettingsOpen(true);
  }

  async function openDetachedChatWindow(serverId = activeServerIdRef.current) {
    const bridge = desktopBridge();
    const targetIndex = serversRef.current.findIndex((server) => server.id === serverId);
    const target = targetIndex >= 0 ? serversRef.current[targetIndex] : serverById(serverId);
    if (!target) return;
    if (!bridge?.openChatWindow) {
      await selectServer(serverId);
      return;
    }
    await bridge.openChatWindow({
      serverId: target.id,
      title: serverSessionName(target, Math.max(0, targetIndex)),
    });
  }

  async function saveGlobalSettings(nextProfile = draftProfileRef.current) {
    const globalSettings = globalSettingsFromProfile(nextProfile);
    const currentServers = serversRef.current.length ? serversRef.current : servers;
    const nextServers = currentServers.map((server, index) =>
      createServerSession(
        {
          ...server,
          profile: applyGlobalSettings(server.profile, globalSettings),
        },
        index,
      ),
    );
    const active = nextServers.find((server) => server.id === activeServerIdRef.current) || nextServers[0];

    setServers(nextServers);
    serversRef.current = nextServers;
    if (active) {
      profileRef.current = active.profile;
      updateDraftProfile({
        ...defaultProfile,
        ...globalSettingsFromProfile(active.profile),
      });
      setActiveAgentId(normalizeProfile(active.profile).agentId);
    }
    setSettingsOpen(false);
    await saveWorkspace(nextServers, activeServerIdRef.current);
  }

  async function saveSessionSettings(nextProfile = draftProfileRef.current) {
    await saveCurrentProfile(nextProfile);
    setSettingsOpen(false);
  }

  async function openSshTerminal(profileOverride = draftProfileRef.current) {
    const currentProfile = normalizeProfile(profileOverride);
    if (!String(currentProfile.host || "").trim() || !String(currentProfile.username || "").trim()) {
      window.alert("请先填写服务器地址和用户名。");
      return;
    }

    try {
      await SSHWorkbench.openTerminal({
        host: currentProfile.host,
        port: currentProfile.port,
        username: currentProfile.username,
        platform: normalizeServerPlatform(currentProfile.platform),
        workdir: currentProfile.workdir,
        tmuxSession: sessionName(currentProfile, currentProfile.agentId),
      });
    } catch (error) {
      const message = shortError(error);
      setRawOpen(true);
      setRawOutput(message);
      window.alert(message);
    }
  }

  async function installWorkbenchAgentForServer(serverId = activeServerIdRef.current) {
    if (busy) return;
    const currentServers = serversRef.current.length ? serversRef.current : servers;
    const targetServer = currentServers.find((server) => server.id === serverId) || serverById(activeServerIdRef.current);
    if (!targetServer) {
      window.alert("没有找到要管理的远端机器。");
      return;
    }
    const targetServerId = targetServer.id;
    const nextProfile = withKnownPassword(targetServer.profile, currentServers);
    if (isWindowsProfile(nextProfile)) {
      window.alert("Windows PowerShell 模式暂不支持 Agent，当前会继续使用兼容模式。");
      return;
    }
    const issue = profileIssue(nextProfile);
    if (issue) {
      window.alert(issue);
      return;
    }

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommandForProfile(nextProfile, buildInstallWorkbenchAgentCommand(nextProfile), 128_000, 60);
      const parsed = parseWorkbenchAgentOutput(output);
      if (parsed.status !== "ready") {
        throw new Error(parsed.error || trimVisibleText(output) || "Agent 安装失败。");
      }
      const agentHealth = healthFromWorkbenchAgentStatus(parsed);
      const connectionKey = profileConnectionKey(nextProfile);
      const nextServers = currentServers.map((server) => {
        const serverProfile = normalizeProfile(server.profile);
        if (profileConnectionKey(serverProfile) !== connectionKey) return server;
        return {
          ...server,
          diagnostics: {
            ...(server.diagnostics || {}),
            ...agentHealth,
            agent: "available",
            agent_version: agentHealth.agent_version || parsed.version || "1",
          },
          rawOutput: server.id === targetServerId ? output.trim() || "Agent 已安装。" : server.rawOutput,
        };
      });
      setServers(nextServers);
      serversRef.current = nextServers;
      await saveWorkspace(nextServers, activeServerIdRef.current);
      window.alert("Agent 已安装到这台远端机器。现在可以在需要后台执行的会话里打开“使用 Agent”。");
    } catch (error) {
      const message = shortError(error);
      setRawOutput(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  async function installWslForDraftProfile() {
    if (busy) return;
    const nextProfile = withKnownPassword(draftProfileRef.current);
    if (!isWindowsProfile(nextProfile)) {
      window.alert("当前连接已经不是 Windows PowerShell 模式。");
      return;
    }
    const issue = profileIssue(nextProfile);
    if (issue) {
      window.alert(issue);
      return;
    }
    const confirmed = window.confirm(
      "将在这台 Windows 机器上启用 WSL 2 并安装 Ubuntu。需要管理员权限，安装完成后可能需要重启机器。是否继续？",
    );
    if (!confirmed) return;

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommandForProfile(nextProfile, buildInstallWslCommand(nextProfile), 512_000, 30 * 60);
      setRawOutput(output.trim());
      const result = parseHealth(output);
      const status = String(result.wsl_install_status || "").trim();
      if (status === "ready") {
        const wslProfile = wslProfileFromWindowsProfile(nextProfile);
        updateDraftProfile(wslProfile);
        window.alert("WSL 已就绪。AI Workbench 将切换到 Windows + WSL，并重新扫描 Linux 环境。");
        await scanSettingsProfile(wslProfile);
        return;
      }
      if (status === "restart_required") {
        setSettingsDiscovery((current) => ({
          ...(current || {}),
          state: "restart_required",
          message: "WSL 组件已经安装，需要重启 Windows。重启后重新连接，App 会自动切换到 WSL。",
          health: {
            ...(current?.health || {}),
            wsl_status: "restart_required",
            wsl_default_distro: result.wsl_default_distro || "Ubuntu",
          },
          directories: current?.directories || [],
          tools: current?.tools || [],
          activeSessions: current?.activeSessions || [],
          recentSessions: current?.recentSessions || [],
          conversations: current?.conversations || [],
          history: current?.history || {},
        }));
        const restartNow = window.confirm("WSL 安装完成，需要重启 Windows。是否现在重启？");
        if (!restartNow) return;
        try {
          await runRemoteCommandForProfile(nextProfile, buildRestartWindowsCommand(nextProfile), 64_000, 30);
        } catch (restartError) {
          if (!isTransientSshSyncError(restartError)) throw restartError;
        }
        window.alert("Windows 正在重启。机器恢复后重新连接即可，App 会自动进入 WSL。");
        return;
      }
      if (status === "permission_required") {
        throw new Error(result.wsl_install_error || "当前 Windows SSH 账户没有管理员权限。");
      }
      throw new Error(result.wsl_install_error || trimVisibleText(output) || "WSL 安装失败。");
    } catch (error) {
      const message = shortError(error);
      setRawOutput(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  async function installGitForEditingServer() {
    if (busy) return;
    const targetServerId = editingServerId && editingServerId !== "global" ? editingServerId : activeServerIdRef.current;
    const nextProfile = withKnownPassword(draftProfileRef.current);
    const issue = profileIssue(nextProfile);
    if (issue) {
      window.alert(issue);
      return;
    }

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommandForProfile(nextProfile, buildInstallGitCommand(nextProfile), 1_048_576, 900);
      const parsed = parseHealth(output);
      const installError = parsed.install_error || "";
      const gitPath = parsed.git || "";
      if (installError || !gitPath) {
        throw new Error(installError || trimVisibleText(output) || "Git 安装失败。");
      }

      setSettingsDiscovery((current) => ({
        ...(current || {}),
        state: current?.state || "done",
        health: {
          ...(current?.health || {}),
          git: parsed.git,
          git_version: parsed.git_version || "",
          install_status: parsed.install_status || "done",
        },
      }));
      updateServer(targetServerId, (server) => ({
        diagnostics: {
          ...(server.diagnostics || {}),
          git: parsed.git,
          git_version: parsed.git_version || "",
        },
        rawOutput: output.trim() || "Git 已安装。",
        connection: {
          ...(server.connection || {}),
          state: "connected",
          label: "已连接",
          detail: "Git 可用",
        },
      }));
      setRawOutput(output.trim() || `${parsed.git_version || "Git"} 已安装。`);
      window.alert(parsed.install_status === "already_installed" ? "Git 已经安装。" : "Git 安装完成。");
    } catch (error) {
      const message = shortError(error);
      setRawOutput(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  async function runGitDownloadForEditingServer(options = {}) {
    if (busy) return null;
    const targetServerId = editingServerId && editingServerId !== "global" ? editingServerId : activeServerIdRef.current;
    const nextProfile = withKnownPassword(draftProfileRef.current);
    const issue = profileIssue(nextProfile);
    if (issue) {
      throw new Error(issue);
    }

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommandForProfile(
        nextProfile,
        buildGitDownloadCommand(nextProfile, options),
        2_097_152,
        1800,
      );
      const parsed = parseHealth(output);
      if (parsed.git_operation_error) {
        throw new Error(parsed.git_operation_error);
      }
      const status = parsed.git_operation_status || "done";
      const target = parsed.git_operation_target || options.targetDir || nextProfile.workdir || "";
      const message = status === "updated" ? "仓库已更新。" : status === "cloned" ? "仓库已下载。" : "Git 操作完成。";
      setRawOutput(output.trim() || message);
      updateServer(targetServerId, (server) => ({
        diagnostics: {
          ...(server.diagnostics || {}),
          git: (server.diagnostics || {}).git || "git",
          git_version: (server.diagnostics || {}).git_version || "",
        },
        rawOutput: output.trim() || message,
        connection: {
          ...(server.connection || {}),
          state: "connected",
          label: "已连接",
          detail: message.replace("。", ""),
        },
      }));
      return { ok: true, message: target ? `${message} ${target}` : message, output, status, target };
    } catch (error) {
      const message = shortError(error);
      setRawOutput(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function duplicateServer(serverId = activeServerIdRef.current) {
    if (busy) return;
    const currentServers = serversRef.current.length ? serversRef.current : servers;
    const sourceIndex = currentServers.findIndex((server) => server.id === serverId);
    const source = sourceIndex >= 0 ? currentServers[sourceIndex] : activeServer;
    if (!source) return;

    const sourceName = serverDisplayName(source, sourceIndex >= 0 ? sourceIndex : 0);
    const duplicateName = `${sourceName} 副本`;
    const sourceProfile = withKnownPassword(source.profile, currentServers);
    if (!String(sourceProfile.workdir || "").trim()) {
      const nextProfile = normalizeProfile({
        ...sourceProfile,
        name: duplicateName,
        workdir: "",
      });
      setEditingServerId("");
      updateDraftProfile(nextProfile);
      setSettingsDiscovery(null);
      setSettingsSelectedSessions([]);
      setSettingsAgentTab(nextProfile.agentId);
      setRawOpen(false);
      setSettingsOpen(true);
      await scanSettingsProfile(nextProfile);
      return;
    }

    const duplicateProfile = normalizeProfile({
      ...source.profile,
      ...sourceProfile,
      name: duplicateName,
    });
    const duplicate = createServerSession(
      {
        name: duplicateName,
        profile: duplicateProfile,
        connection: readyConnectionForSession(duplicateProfile, source.connection),
        diagnostics: source.diagnostics,
        discovery: null,
        rawOutput: source.rawOutput,
      },
      currentServers.length,
    );
    const nextServers = [...currentServers, duplicate];

    setServers(nextServers);
    serversRef.current = nextServers;
    setActiveServerId(duplicate.id);
    activeServerIdRef.current = duplicate.id;
    setEditingServerId(duplicate.id);
    updateDraftProfile(duplicate.profile);
    profileRef.current = duplicate.profile;
    setActiveAgentId(duplicateProfile.agentId);
    setRawOpen(false);
    setSettingsOpen(true);
    await saveWorkspace(nextServers, duplicate.id);
  }

  async function addDiscoveredWorkdir(path, agentId = activeAgentId) {
    const workdir = String(path || "").trim();
    if (!workdir || busy) return;

    const source = servers.find((server) => server.id === activeServerIdRef.current) || activeServer;
    const sourceDiagnostics = source.diagnostics || {};
    const sourceProfile = normalizeProfile(source.profile);
    rememberManualWorkdir(manualWorkdirScope(sourceProfile), agentId, workdir);
    const existing = servers.find((server) => {
      const nextProfile = normalizeProfile(server.profile);
      return (
        nextProfile.host === sourceProfile.host &&
        nextProfile.port === sourceProfile.port &&
        nextProfile.username === sourceProfile.username &&
        normalizeServerPlatform(nextProfile.platform) === normalizeServerPlatform(sourceProfile.platform) &&
        String(nextProfile.workdir || "") === workdir &&
        normalizeProfile(server.profile).agentId === (agentId === "claude" ? "claude" : "codex")
      );
    });

    if (existing) {
      const nextServers = servers.map((server) =>
        server.id === existing.id
          ? {
              ...server,
              connection: readyConnectionForSession(server.profile, source.connection || server.connection),
              diagnostics: {
                ...(server.diagnostics || {}),
                ...sourceDiagnostics,
                pwd: workdir,
              },
              discovery: null,
            }
          : server,
      );
      const nextActive = nextServers.find((server) => server.id === existing.id) || existing;

      setServers(nextServers);
      setActiveServerId(existing.id);
      activeServerIdRef.current = existing.id;
      setEditingServerId(existing.id);
      updateDraftProfile(nextActive.profile);
      profileRef.current = nextActive.profile;
      setRawOpen(false);
      await saveWorkspace(nextServers, existing.id);
      return;
    }

    const name = workdirDisplayName(workdir);
    const profileForWorkdir = normalizeProfile({
      ...source.profile,
      name,
      workdir,
      agentId: agentId === "claude" ? "claude" : "codex",
    });
    const nextServer = createServerSession(
      {
        name,
        profile: profileForWorkdir,
        connection: readyConnectionForSession(profileForWorkdir, source.connection),
        diagnostics: {
          ...sourceDiagnostics,
          pwd: workdir,
        },
        discovery: null,
      },
      servers.length,
    );
    const nextServers = [...servers, nextServer];

    setServers(nextServers);
    setActiveServerId(nextServer.id);
    activeServerIdRef.current = nextServer.id;
    setEditingServerId(nextServer.id);
    updateDraftProfile(nextServer.profile);
    profileRef.current = nextServer.profile;
    setRawOpen(false);
    await saveWorkspace(nextServers, nextServer.id);
  }

  async function scanSettingsProfile(profileOverride = draftProfileRef.current) {
    const nextProfile = withKnownPassword(profileOverride);
    if (nextProfile.password !== draftProfileRef.current.password) updateDraftProfile(nextProfile);
    const issue = profileIssue(nextProfile);
    if (issue) {
      setSettingsDiscovery({
        state: "error",
        message: issue,
        directories: [],
        tools: [],
        activeSessions: [],
        recentSessions: [],
        conversations: [],
        history: {},
      });
      return;
    }
    console.info("[aiwb:settings-scan:start]", {
      host: nextProfile.host,
      port: nextProfile.port,
      username: nextProfile.username,
      platform: normalizeServerPlatform(nextProfile.platform),
      passwordLength: String(nextProfile.password || "").length,
    });

    setBusy(true);
    setSettingsDiscovery({
      state: "scanning",
      directories: [],
      tools: [],
      activeSessions: [],
      recentSessions: [],
      conversations: [],
      history: {},
    });
    setSettingsSelectedSessions([]);
    try {
      let healthOutput = await runRemoteCommandForProfile(nextProfile, buildHealthCommand(nextProfile), 512_000, 60);
      let parsed = parseHealth(healthOutput);
      let detectedProfile = profileWithDetectedTools(nextProfile, parsed);
      if (isWindowsProfile(nextProfile) && parsed.wsl_status === "ready") {
        const windowsHealth = parsed;
        const wslProfile = wslProfileFromWindowsProfile(nextProfile);
        const wslHealthOutput = await runRemoteCommandForProfile(wslProfile, buildHealthCommand(wslProfile), 512_000, 90);
        healthOutput = `${healthOutput.trim()}\n${wslHealthOutput.trim()}`.trim();
        parsed = {
          ...windowsHealth,
          ...parseHealth(wslHealthOutput),
          wsl_status: "ready",
          wsl_distros: windowsHealth.wsl_distros || "",
          wsl_default_distro: windowsHealth.wsl_default_distro || "",
          wsl_version: windowsHealth.wsl_version || "",
        };
        detectedProfile = profileWithDetectedTools(wslProfile, parsed);
      }
      if (
        detectedProfile.platform !== nextProfile.platform ||
        detectedProfile.workdir !== nextProfile.workdir ||
        detectedProfile.codexCommand !== nextProfile.codexCommand ||
        detectedProfile.claudeCommand !== nextProfile.claudeCommand ||
        detectedProfile.password !== draftProfileRef.current.password
      ) {
        updateDraftProfile(detectedProfile);
      }
      const scanOutput = await runRemoteCommandForProfile(detectedProfile, buildDiscoveryCommand(detectedProfile), 1_048_576, 180);
      let scan = parseDiscovery(scanOutput);
      if (parsed.agent === "available" || parsed.agent_version) {
        try {
          const conversationOutput = await runRemoteCommandForProfile(
            detectedProfile,
            buildWorkbenchAgentConversationListCommand(detectedProfile),
            1_048_576,
            45,
          );
          const conversations = parseWorkbenchAgentConversations(conversationOutput);
          scan = mergeAgentConversationsIntoDiscovery(scan, conversations);
        } catch (conversationError) {
          void appLog("warn", "agent.conversation.scan.failed", {
            host: detectedProfile.host,
            error: shortError(conversationError),
          });
        }
      }
      setSettingsDiscovery({
        ...scan,
        health: parsed,
      });
      if (editingServerId && editingServerId !== "global") {
        updateServer(editingServerId, (server) => ({
          profile: normalizeProfile({
            ...(server.profile || {}),
            platform: detectedProfile.platform,
            workdir: detectedProfile.workdir,
            codexCommand: detectedProfile.codexCommand,
            claudeCommand: detectedProfile.claudeCommand,
          }),
          diagnostics: {
            ...(server.diagnostics || {}),
            ...parsed,
          },
          rawOutput: healthOutput.trim() || server.rawOutput,
          connection: {
            ...(server.connection || {}),
            state: "connected",
            label: "已连接",
            detail: `${parsed.user || detectedProfile.username}@${parsed.host || detectedProfile.host}`,
            mode: connectionModeFromHealth(parsed),
          },
        }));
      }
    } catch (error) {
      console.error("[aiwb:settings-scan:error]", {
        host: nextProfile.host,
        username: nextProfile.username,
        message: shortError(error),
      });
      setSettingsDiscovery({
        state: "error",
        message: shortError(error),
        directories: [],
        tools: [],
        activeSessions: [],
        recentSessions: [],
        conversations: [],
        history: { codex: 0, claude: 0 },
      });
    } finally {
      setBusy(false);
    }
  }

  async function addSelectedSessionsFromSettings() {
    const selected = settingsSelectedSessions.map(parseSessionSelectionKey).filter((item) => item.path);
    if (!selected.length || busy) return;

    const sourceProfile = withKnownPassword(draftProfileRef.current);
    if (sourceProfile.password !== draftProfileRef.current.password) updateDraftProfile(sourceProfile);
    const issue = profileIssue(sourceProfile);
    if (issue) {
      setSettingsDiscovery({ state: "error", message: issue, directories: [], tools: [], history: {} });
      return;
    }
    const sourceDiagnostics = settingsDiscovery?.health || {};
    const historyScope = manualWorkdirScope(sourceProfile);
    const nextServers = [...servers];
    const sourceSignature = (profile) => {
      const normalized = normalizeProfile(profile);
      return [
        normalized.host,
        normalized.port,
        normalized.username,
        normalizeServerPlatform(normalized.platform),
      ].join("|");
    };
    const baseSignature = sourceSignature(sourceProfile);
    let lastActiveId = activeServerIdRef.current;
    const conversations = Array.isArray(settingsDiscovery?.conversations) ? settingsDiscovery.conversations : [];
    const conversationById = new Map(conversations.map((item) => [item.id, item]));

    selected.forEach(({ agentId, path, conversationId, title }) => {
      const normalizedAgent = agentId === "claude" ? "claude" : "codex";
      const conversation = conversationId ? conversationById.get(conversationId) : null;
      rememberManualWorkdir(historyScope, normalizedAgent, path);
      const existingIndex = nextServers.findIndex((server) => {
        const profileValue = normalizeProfile(server.profile);
        if (conversation?.id && server.conversationId === conversation.id) return true;
        return (
          !conversation?.id &&
          sourceSignature(profileValue) === baseSignature &&
          String(profileValue.workdir || "") === path &&
          profileValue.agentId === normalizedAgent
        );
      });
      const titleName = String(title || conversation?.title || conversation?.name || "").trim();
      const name = titleName || `${workdirDisplayName(path)} · ${normalizedAgent === "claude" ? "Claude" : "Codex"}`;
      const profileForSession = normalizeProfile({
        ...sourceProfile,
        name,
        workdir: path,
        agentId: normalizedAgent,
      });
      const conversationMessages = messagesFromAgentConversation(conversation, normalizedAgent);
      const conversationTask = taskFromAgentConversation(conversation, normalizedAgent);
      const conversationRunning = conversationTask.state === "running";
      const sessionPayload = {
        conversationId: conversation?.id || "",
        name,
        profile: profileForSession,
        connection: readyConnectionForSession(profileForSession, {
          mode: profileForSession.useWorkbenchAgent ? connectionModeFromHealth(sourceDiagnostics) : "ssh",
        }),
        diagnostics: {
          ...sourceDiagnostics,
          pwd: path,
        },
        discovery: null,
        messages: conversationMessages,
        task: conversationTask,
      };

      if (existingIndex >= 0) {
        const existing = nextServers[existingIndex];
        const nextMessages = (existing.messages || []).length ? existing.messages : conversationMessages;
        nextServers[existingIndex] = createServerSession(
          {
            ...existing,
            ...sessionPayload,
            id: existing.id,
            conversationId: conversation?.id || existing.conversationId,
            messages: nextMessages,
            rawOutput: existing.rawOutput,
            task: conversationRunning ? sessionPayload.task : existing.task || sessionPayload.task,
          },
          existingIndex,
        );
        lastActiveId = existing.id;
      } else {
        const created = createServerSession(sessionPayload, nextServers.length);
        nextServers.push(created);
        lastActiveId = created.id;
      }
    });

    const active = nextServers.find((server) => server.id === lastActiveId) || nextServers[nextServers.length - 1];
    setServers(nextServers);
    setActiveServerId(active.id);
    activeServerIdRef.current = active.id;
    setEditingServerId(active.id);
    updateDraftProfile(active.profile);
    profileRef.current = active.profile;
    setActiveAgentId(normalizeProfile(active.profile).agentId);
    setSettingsOpen(false);
    setSettingsSelectedSessions([]);
    setSettingsDiscovery(null);
    await saveWorkspace(nextServers, active.id);
  }

  async function testConnection() {
    const nextProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(nextProfile)) return;

    setBusy(true);
    setRawOpen(false);
    setConnection({ state: "testing", label: "测试中", detail: `${nextProfile.username}@${nextProfile.host}` });
    setDiscovery({
      state: "scanning",
      directories: [],
      tools: [],
      activeSessions: [],
      recentSessions: [],
      conversations: [],
      history: {},
    });

    try {
      const stdout = await runRemoteCommand(buildHealthCommand(nextProfile), 512_000, 60);
      const parsed = parseHealth(stdout);
      const detectedProfile = profileWithDetectedTools(nextProfile, parsed);
      profileRef.current = detectedProfile;
      updateDraftProfile(detectedProfile);
      setActiveAgentId(detectedProfile.agentId);
      setConnection({
        state: "testing",
        label: "扫描中",
        detail: parsed.pwd || detectedProfile.workdir,
      });

      let scanOutput = "";
      let scan = null;
      try {
        scanOutput = await runRemoteCommandForProfile(detectedProfile, buildDiscoveryCommand(detectedProfile), 1_048_576, 180);
        scan = parseDiscovery(scanOutput);
        if (parsed.agent === "available" || parsed.agent_version) {
          try {
            const conversationOutput = await runRemoteCommandForProfile(
              detectedProfile,
              buildWorkbenchAgentConversationListCommand(detectedProfile),
              1_048_576,
              45,
            );
            scan = mergeAgentConversationsIntoDiscovery(scan, parseWorkbenchAgentConversations(conversationOutput));
          } catch (conversationError) {
            void appLog("warn", "agent.conversation.scan.failed", {
              host: detectedProfile.host,
              error: shortError(conversationError),
            });
          }
        }
      } catch (scanError) {
        scan = {
          state: "error",
          message: shortError(scanError),
          directories: [],
          tools: [],
          activeSessions: [],
          recentSessions: [],
          conversations: [],
          history: { codex: 0, claude: 0 },
        };
      }

      const rawOutput = [stdout.trim(), scanOutput.trim()].filter(Boolean).join("\n\n") || "连接成功。";
      const connectedState = {
        state: "connected",
        label: "已连接",
        detail: `${parsed.user || detectedProfile.username}@${parsed.host || detectedProfile.host}`,
        mode: connectionModeFromHealth(parsed),
      };
      const nextServers = serversRef.current.map((server) =>
        server.id === activeServerIdRef.current
          ? {
              ...server,
              profile: detectedProfile,
              diagnostics: parsed,
              discovery: scan,
              rawOutput,
              connection: connectedState,
            }
          : connectionIsLive(server.connection) && !serverTaskRunning(server)
            ? {
                ...server,
                connection: readyConnectionForSession(server.profile, server.connection),
              }
            : server,
      );
      setServers(nextServers);
      serversRef.current = nextServers;
      await saveWorkspace(nextServers, activeServerIdRef.current);
    } catch (error) {
      const message = shortError(error);
      setRawOpen(true);
      setRawOutput(message);
      setConnection({ state: "error", label: "连接失败", detail: message });
    } finally {
      setBusy(false);
    }
  }

  async function runAgentPrompt({ serverId, currentProfile, agent, text, assistantMessageId, userMessageId = "" }) {
    const applyAgentOutput = (output, final = false) => {
      const raw = String(output || "").trim();
      const extracted = extractAgentFinalOutput(raw, text);
      const visibleOutput = extracted.final ? extracted.text : "";
      const hasFinalOutput = Boolean(extracted.final && visibleOutput);
      setServerRawOutput(serverId, raw);

      if (!hasFinalOutput && isCodexLoginPrompt(raw)) {
        if (serverId === activeServerIdRef.current) setRawOpen(false);
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `${agent.shortName} 需要登录`,
          body: "远端 Codex 登录已过期。生成设备码后，在浏览器完成一次登录即可继续使用。",
          output: "",
          status: "login",
          loginAction: { prompt: text, agentId: agent.id },
          modelChoice: undefined,
        });
        setServerConnection(serverId, { state: "idle", label: "需要登录", detail: agent.shortName });
        return false;
      }

      if (!hasFinalOutput && agent.id === "codex" && /401 Unauthorized|Missing bearer|authentication/i.test(raw)) {
        if (serverId === activeServerIdRef.current) setRawOpen(false);
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `${agent.shortName} 需要登录`,
          body: "远端 Codex 登录已过期。生成设备码后，在浏览器完成一次登录即可继续使用。",
          output: "",
          status: "login",
          loginAction: { prompt: text, agentId: agent.id },
          modelChoice: undefined,
        });
        setServerConnection(serverId, { state: "idle", label: "需要登录", detail: agent.shortName });
        return false;
      }

      if (!hasFinalOutput && isCodexModelChoicePrompt(raw)) {
        if (serverId === activeServerIdRef.current) setRawOpen(false);
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `${agent.shortName} 需要选择模型`,
          body: "Codex CLI 检测到 GPT-5.5 可用。选择后会继续发送刚才的任务。",
          output: "",
          status: "choice",
          loginAction: undefined,
          modelChoice: { prompt: text, agentId: agent.id },
        });
        setServerConnection(serverId, { state: "idle", label: "等待选择", detail: agent.shortName });
        return false;
      }

      const issue = hasFinalOutput ? "" : detectAgentIssue(raw, agent);
      if (issue) {
        const failure = classifyAgentFailure(raw, agent);
        if (serverId === activeServerIdRef.current) setRawOpen(true);
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: failure?.title || `${agent.shortName} 没有启动成功`,
          body: failure?.body || issue,
          output: "",
          liveOutput: "",
          status: "error",
          backend: "ssh",
          agentId: agent.id,
          promptText: text,
          agentFailure: failure,
          technicalDetail: failure?.detail || cleanAgentFailureDetail(raw),
          loginAction: undefined,
          modelChoice: undefined,
        });
        setServerConnection(serverId, { state: "connected", label: "已连接", detail: agent.shortName, mode: "ssh" });
        return false;
      }

      const deferredWaitingAnswer = extracted.final && visibleOutput && looksLikeDeferredWaitingAnswer(visibleOutput);

      if (deferredWaitingAnswer) {
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `${agent.shortName} 没有给出同步结果`,
          body: "远端 AI 把“等待通知/稍后继续”当成最终回复返回了，任务没有真正完成。请重新发送，或明确要求它直接检查状态直到成功、失败或阻塞。",
          output: "",
          liveOutput: "",
          status: "error",
          backend: currentProfile.useWorkbenchAgent === true ? "agent" : "ssh",
          agentId: agent.id,
          promptText: text,
          remoteTaskStatus: "deferred-waiting-answer",
          remoteTaskCheckedAt: Date.now(),
          resultMissing: true,
          agentFailure: undefined,
          technicalDetail: visibleOutput,
          loginAction: undefined,
          modelChoice: undefined,
        });
        return false;
      }

      const done = extracted.final && Boolean(visibleOutput);
      const endedWithoutFinalOutput = final && !done;
      updateAssistantMessageInServer(serverId, assistantMessageId, {
        title: done
          ? `${agent.shortName} 回复`
          : endedWithoutFinalOutput
            ? `${agent.shortName} 已结束，但没有最终内容`
            : `等待 ${agent.shortName} 回复`,
        body: visibleOutput
          ? ""
          : endedWithoutFinalOutput
            ? agent.id === "claude"
              ? "Claude 任务已经结束，但没有最终答案标记。为避免把中间结论当成结果，App 暂不展示为正式回复。可以查看原始输出或重新发送。"
              : "远端任务已经结束，但没有最终答案标记。为避免把中间结论当成结果，App 暂不展示为正式回复。可以查看原始输出或重新发送。"
            : final
              ? agent.id === "claude"
                ? "还没有拿到最终回复。Claude 长任务通常没有中间输出，请继续等待或查看原始输出。"
                : `还没有拿到最终回复，可以点“刷新状态”继续检查。`
              : `正在等待 ${agent.shortName} 回复。`,
        output: visibleOutput,
        liveOutput: "",
        status: done ? "done" : endedWithoutFinalOutput ? "idle" : "running",
        remoteTaskStatus: done || endedWithoutFinalOutput ? "done" : undefined,
        remoteTaskCheckedAt: Date.now(),
        resultMissing: endedWithoutFinalOutput,
        agentFailure: undefined,
        technicalDetail: undefined,
        loginAction: undefined,
        modelChoice: undefined,
      });
      return true;
    };

    const runWithWorkbenchAgent = async () => {
      if (currentProfile.useWorkbenchAgent !== true) return { used: false };
      if (isWindowsProfile(currentProfile)) return { used: false };

      let probeOutput = "";
      try {
        probeOutput = await runRemoteCommandForProfile(currentProfile, buildWorkbenchAgentStatusCommand(currentProfile), 64_000, 20);
      } catch (error) {
        void appLog("warn", "agent.probe.failed", {
          serverId,
          agentId: agent.id,
          error: shortError(error),
        });
        return { used: false };
      }

      if (!workbenchAgentAvailableFromOutput(probeOutput)) {
        setServerConnection(serverId, {
          state: "testing",
          label: "兼容模式",
          detail: "未检测到 Agent",
          mode: "ssh",
        });
        return { used: false };
      }

      const probedAgent = parseWorkbenchAgentOutput(probeOutput);
      const probedAgentHealth = healthFromWorkbenchAgentStatus(probedAgent);
      if (probedAgentHealth.agent || probedAgentHealth.agent_version) {
        const connectionKey = profileConnectionKey(currentProfile);
        const nextServers = serversRef.current.map((server) => {
          const serverProfile = normalizeProfile(server.profile);
          if (profileConnectionKey(serverProfile) !== connectionKey) return server;
          return {
            ...server,
            diagnostics: {
              ...(server.diagnostics || {}),
              ...probedAgentHealth,
              agent: "available",
              agent_version: probedAgentHealth.agent_version || probedAgent.version || server.diagnostics?.agent_version || "1",
            },
            connection: {
              ...(server.connection || {}),
              mode: serverProfile.useWorkbenchAgent ? "agent" : server.connection?.mode || "ssh",
            },
          };
        });
        setServers(nextServers);
        serversRef.current = nextServers;
        queueWorkspaceSave(nextServers, activeServerIdRef.current, 100);
      }
      const latestAgentVersionNumber = workbenchAgentVersionNumber(latestWorkbenchAgentVersion);
      if (latestAgentVersionNumber > 0 && workbenchAgentVersionNumber(probedAgent.version) < latestAgentVersionNumber) {
        try {
          setServerConnection(serverId, {
            state: "testing",
            label: "升级 Agent",
            detail: "同步会话注册表",
            mode: "agent",
          });
          probeOutput = await runRemoteCommandForProfile(
            currentProfile,
            buildInstallWorkbenchAgentCommand(currentProfile),
            256_000,
            90,
          );
          const upgraded = parseWorkbenchAgentOutput(probeOutput);
          if (workbenchAgentVersionNumber(upgraded.version) < latestAgentVersionNumber) {
            void appLog("warn", "agent.upgrade.unconfirmed", {
              serverId,
              agentId: agent.id,
              version: upgraded.version || probedAgent.version,
            });
          }
        } catch (upgradeError) {
          void appLog("warn", "agent.upgrade.failed", {
            serverId,
            agentId: agent.id,
            error: shortError(upgradeError),
          });
        }
      }

      const runtimeProfile = agentRuntimeProfile(currentProfile);
      const command = buildAgentSendCommand(runtimeProfile, agent, text);
      const maxAgentStartupAttempts = 2;
      const conversationId = ensureServerConversationId(serverId, currentProfile, agent.id);
      const conversationName = serverDisplayName(serverById(serverId), 0);

      for (let attempt = 1; attempt <= maxAgentStartupAttempts; attempt += 1) {
        const remoteTaskId = createRemoteTaskId(conversationId, agent.id);
        const optimisticStartedAt = Date.now();
        setServerTask(serverId, {
          state: "running",
          backend: "agent",
          conversationId,
          remoteTaskId,
          agentId: agent.id,
          startedAt: optimisticStartedAt,
          label: `正在提交 ${agent.shortName}`,
        });
        if (userMessageId) {
          updateAssistantMessageInServer(serverId, userMessageId, {
            backend: "agent",
            conversationId,
            remoteTaskId,
            agentId: agent.id,
            promptText: text,
            startedAt: optimisticStartedAt,
            forceUpdate: true,
          });
        }
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `正在提交给 ${agent.shortName}`,
          body: "任务 ID 已在本地保存，正在交给远端 Agent。即使连接中断，也会用这个 ID 继续同步。",
          status: "running",
          backend: "agent",
          conversationId,
          remoteTaskId,
          agentId: agent.id,
          promptText: text,
          startedAt: optimisticStartedAt,
          remoteTaskStatus: "preparing",
          remoteTaskCheckedAt: Date.now(),
          remoteSyncError: "",
          forceUpdate: true,
        });
        const createOutput = await runRemoteCommandForProfile(
          currentProfile,
          buildWorkbenchAgentCreateCommand(currentProfile, remoteTaskId, command, {
            conversationId,
            name: conversationName,
            workdir: currentProfile.workdir,
            agentId: agent.id,
            model: currentProfile.aiModel,
            promptText: text,
          }),
          128_000,
          30,
        );
        const created = parseWorkbenchAgentOutput(createOutput);
        if (created.taskStatus === "busy") {
          const blockingTaskId = String(created.blockedByTaskId || created.taskId || "").trim();
          const raw = created.output || created.raw || createOutput;
          const failure = classifyAgentFailure(raw, agent, created);
          const startedAt = Date.now();
          if (userMessageId) {
            updateAssistantMessageInServer(serverId, userMessageId, {
              remoteTaskId: blockingTaskId || undefined,
              conversationId,
              backend: "agent",
              agentId: agent.id,
              promptText: text,
              forceUpdate: true,
            });
          }
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: failure?.title || `${agent.shortName} 会话正在执行`,
            body:
              failure?.body ||
              "同一个会话当前已有任务正在运行。你刚才这条新请求没有发送，可以等待结果，或取消当前任务后重新发送。",
            output: "",
            liveOutput: "",
            status: "running",
            backend: "agent",
            conversationId,
            remoteTaskId: blockingTaskId,
            agentId: agent.id,
            promptText: text,
            startedAt,
            remoteTaskStatus: "busy",
            remoteTaskCheckedAt: Date.now(),
            remoteTaskPid: created.pid || "",
            remoteTaskStartedAt: created.startedAt || "",
            remoteTaskRunnerStartedAt: created.runnerStartedAt || "",
            remoteTaskExitCode: created.exitCode || "",
            remoteSyncError: "",
            agentFailure: undefined,
            technicalDetail: failure?.detail || cleanAgentFailureDetail(raw),
            blockedByTaskId: blockingTaskId,
            rejectedPromptText: text,
            forceUpdate: true,
          });
          setServerTask(serverId, {
            state: "running",
            backend: "agent",
            conversationId,
            remoteTaskId: blockingTaskId,
            agentId: agent.id,
            startedAt,
            label: `会话占用 ${agent.shortName}`,
          });
          setServerConnection(serverId, {
            state: "testing",
            label: "会话占用中",
            detail: agent.shortName,
            mode: "agent",
          });
          return { used: true, ok: false, pending: true };
        }
        const createdTaskAccepted = ["queued", "running"].includes(created.taskStatus);
        if (created.status !== "ready" || !createdTaskAccepted) {
          if (created.status === "missing" || created.status === "unsupported") {
            if (userMessageId) {
              updateAssistantMessageInServer(serverId, userMessageId, {
                remoteTaskId: undefined,
                conversationId: undefined,
                backend: "ssh",
                forceUpdate: true,
              });
            }
            updateAssistantMessageInServer(serverId, assistantMessageId, {
              remoteTaskId: undefined,
              conversationId: undefined,
              backend: "ssh",
              remoteTaskStatus: undefined,
              forceUpdate: true,
            });
            return { used: false };
          }
          throw new Error(created.error || trimVisibleText(createOutput) || "Agent 创建任务失败。");
        }

        const startedAt = optimisticStartedAt;
        setServerTask(serverId, {
          state: "running",
          backend: "agent",
          conversationId,
          remoteTaskId,
          agentId: agent.id,
          startedAt,
          label: `同步等待 ${agent.shortName}`,
        });
        if (userMessageId) {
          updateAssistantMessageInServer(serverId, userMessageId, {
            backend: "agent",
            conversationId,
            remoteTaskId,
            agentId: agent.id,
            promptText: text,
            startedAt,
            forceUpdate: true,
          });
        }
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: attempt === 1 ? `已交给 ${agent.shortName}` : `正在重试 Agent 启动`,
          body:
            attempt === 1
              ? "任务已发送，正在同步等待最终结果。App 退到后台或被关闭后，远端任务仍会继续执行，下次打开会继续同步。"
              : `第 ${attempt - 1} 次 Agent 启动失败，正在第 ${attempt} 次尝试。`,
          status: "running",
          backend: "agent",
          conversationId,
          remoteTaskId,
          agentId: agent.id,
          promptText: text,
          startedAt,
          remoteTaskStatus: created.taskStatus || "queued",
          remoteTaskCheckedAt: Date.now(),
          remoteTaskPid: created.pid || "",
          remoteTaskStartedAt: created.startedAt || "",
          remoteTaskRunnerStartedAt: created.runnerStartedAt || "",
          remoteTaskExitCode: created.exitCode || "",
          remoteSyncError: "",
          agentFailure: undefined,
          technicalDetail: undefined,
        });
        setServerConnection(serverId, {
          state: "testing",
          label: attempt === 1 ? "等待结果" : "Agent 重试中",
          detail: agent.shortName,
          mode: "agent",
        });

        let retryAgentStartup = false;
        let pollCount = 0;
        let lastEventFingerprint = created.eventFingerprint || "";
        const synchronousWaitDeadlineAt = Date.now() + agentSynchronousWaitTimeoutMs;
        while (Date.now() < synchronousWaitDeadlineAt) {
          if (pollCount === 0) await sleep(agentSynchronousPollInitialDelayMs);
          pollCount += 1;
          let statusOutput = "";
          const remainingWaitSeconds = Math.max(5, Math.min(agentLongPollTimeoutSeconds, Math.ceil((synchronousWaitDeadlineAt - Date.now()) / 1000)));
          try {
            statusOutput = await runRemoteCommandForProfile(
              currentProfile,
              buildWorkbenchAgentWaitTaskCommand(currentProfile, remoteTaskId, lastEventFingerprint, {
                timeoutSeconds: remainingWaitSeconds,
              }),
              2_097_152,
              remainingWaitSeconds + 20,
            );
          } catch (error) {
            if (!isTransientSshSyncError(error)) throw error;
            const detail = shortError(error);
            void appLog("warn", "agent.status.transient_disconnect", {
              serverId,
              agentId: agent.id,
              remoteTaskId,
              error: detail,
            });
            updateAssistantMessageInServer(serverId, assistantMessageId, {
              title: `等待 ${agent.shortName} 回复`,
              body: "App 暂时连不上服务器查询状态，远端任务仍可能在运行；恢复连接后会继续同步结果。",
              status: "running",
              backend: "agent",
              conversationId,
              remoteTaskId,
              agentId: agent.id,
              promptText: text,
              remoteTaskStatus: "sync-lost",
              remoteTaskCheckedAt: Date.now(),
              remoteSyncError: detail,
            });
            setServerConnection(serverId, {
              state: "testing",
              label: "等待恢复",
              detail: "同步连接中断，自动重试",
              mode: "agent",
            });
            continue;
          }
          const status = parseWorkbenchAgentOutput(statusOutput);
          if (status.eventFingerprint) lastEventFingerprint = status.eventFingerprint;
          const taskStatus = status.taskStatus || "unknown";
          if (taskStatus === "done") {
            if (!applyAgentOutput(status.output, true)) return { used: true, ok: false, pending: false };
            updateAssistantMessageInServer(serverId, assistantMessageId, {
              remoteTaskStatus: taskStatus,
              remoteEventFingerprint: status.eventFingerprint || lastEventFingerprint,
              remoteTaskCheckedAt: Date.now(),
              remoteTaskPid: status.pid || "",
              remoteTaskStartedAt: status.startedAt || "",
              remoteTaskRunnerStartedAt: status.runnerStartedAt || "",
              remoteTaskExitCode: status.exitCode || "",
              remoteSyncError: "",
            });
            setServerConnection(serverId, {
              state: "connected",
              label: "会话已完成",
              detail: "Agent 后台任务",
              mode: "agent",
            });
            return { used: true, ok: true, pending: false };
          }

          if (taskStatus === "cancelled") {
            const raw = status.output || status.raw || statusOutput;
            const failure = classifyAgentFailure(raw, agent, status);
            const visibleOutput = visibleOutputForStoppedTask(raw, serverById(serverId)?.messages?.find((item) => item.id === assistantMessageId));
            updateAssistantMessageInServer(serverId, assistantMessageId, {
              title: failure?.title || `${agent.shortName} 任务已取消`,
              body: failure?.body || (visibleOutput ? "后台任务已停止，下面保留停止前已经收到的内容。" : "后台任务已停止，输入框已释放。"),
              output: visibleOutput,
              liveOutput: "",
              status: "cancelled",
              backend: "agent",
              conversationId,
              remoteTaskId,
              agentId: agent.id,
              promptText: text,
              remoteTaskStatus: taskStatus,
              remoteEventFingerprint: status.eventFingerprint || lastEventFingerprint,
              remoteTaskCheckedAt: Date.now(),
              remoteTaskPid: status.pid || "",
              remoteTaskStartedAt: status.startedAt || "",
              remoteTaskRunnerStartedAt: status.runnerStartedAt || "",
              remoteTaskExitCode: status.exitCode || "",
              remoteSyncError: "",
              agentFailure: undefined,
              technicalDetail: failure?.detail || cleanAgentFailureDetail(raw),
              cancelledAt: Date.now(),
            });
            setServerTask(serverId, {
              state: "idle",
              backend: "agent",
              conversationId,
              remoteTaskId,
              agentId: agent.id,
              finishedAt: Date.now(),
            });
            setServerConnection(serverId, {
              state: "idle",
              label: "已取消",
              detail: agent.shortName,
              mode: "agent",
            });
            return { used: true, ok: false, pending: false };
          }

          if (taskStatus === "error" || taskStatus === "missing") {
            const raw = status.output || status.raw || statusOutput;
            const mayNeedInteractiveHandling =
              isCodexLoginPrompt(raw) ||
              isCodexModelChoicePrompt(raw) ||
              (agent.id === "codex" && /401 Unauthorized|Missing bearer|authentication/i.test(raw));
            if (mayNeedInteractiveHandling && raw && !applyAgentOutput(raw, true)) {
              return { used: true, ok: false, pending: false };
            }
            const failure = classifyAgentFailure(raw, agent, status);
            const shouldFallbackToSsh =
              failure?.kind === "agent_stale_runner" || failure?.kind === "agent_daemon_unavailable";
            if (shouldFallbackToSsh) {
              setServerRawOutput(serverId, raw);
              void appLog("warn", "agent.startup.failed", {
                serverId,
                agentId: agent.id,
                remoteTaskId,
                attempt,
                maxAttempts: maxAgentStartupAttempts,
                failure: failure.kind,
              });

              if (attempt < maxAgentStartupAttempts) {
                updateAssistantMessageInServer(serverId, assistantMessageId, {
                  title: "Agent 启动失败，正在重试",
                  body: `第 ${attempt} 次后台 runner 没有启动成功，正在自动重试。`,
                  output: "",
                  status: "running",
                  backend: "agent",
                  conversationId,
                  remoteTaskId,
                  agentId: agent.id,
                  promptText: text,
                  remoteEventFingerprint: status.eventFingerprint || lastEventFingerprint,
                  agentFailure: undefined,
                  technicalDetail: cleanAgentFailureDetail(raw),
                });
                setServerConnection(serverId, {
                  state: "testing",
                  label: "Agent 重试中",
                  detail: `${attempt}/${maxAgentStartupAttempts}`,
                  mode: "agent",
                });
                retryAgentStartup = true;
                break;
              }

              const fallbackStartedAt = Date.now();
              updateAssistantMessageInServer(serverId, assistantMessageId, {
                title: "Agent 启动失败，已切换 SSH 直连",
                body: `Agent 连续 ${maxAgentStartupAttempts} 次没有把后台 runner 启动起来，正在用 SSH 直连继续执行同一条任务。`,
                output: "",
                status: "running",
                backend: "ssh",
                conversationId,
                remoteTaskId: undefined,
                agentId: agent.id,
                promptText: text,
                startedAt: fallbackStartedAt,
                remoteTaskStatus: "ssh-waiting",
                remoteTaskCheckedAt: Date.now(),
                remoteTaskPid: "",
                remoteTaskStartedAt: "",
                remoteTaskRunnerStartedAt: "",
                remoteTaskExitCode: "",
                remoteSyncError: "",
                agentFailure: undefined,
                technicalDetail: cleanAgentFailureDetail(raw),
              });
              setServerTask(serverId, {
                state: "running",
                backend: "ssh",
                agentId: agent.id,
                startedAt: fallbackStartedAt,
                label: `SSH 直连 ${agent.shortName}`,
              });
              setServerConnection(serverId, {
                state: "testing",
                label: "SSH 直连中",
                detail: "Agent 自动降级",
                mode: "ssh",
              });
              return { used: false, fallbackReason: failure.kind };
            }

            updateAssistantMessageInServer(serverId, assistantMessageId, {
              title: failure?.title || `${agent.shortName} 执行失败`,
              body: failure?.body || trimVisibleText(raw) || "Agent 后台任务失败。",
              output: "",
              liveOutput: "",
              status: "error",
              backend: "agent",
              conversationId,
              remoteTaskId,
              agentId: agent.id,
              promptText: text,
              remoteTaskStatus: taskStatus,
              remoteEventFingerprint: status.eventFingerprint || lastEventFingerprint,
              remoteTaskCheckedAt: Date.now(),
              remoteTaskPid: status.pid || "",
              remoteTaskStartedAt: status.startedAt || "",
              remoteTaskRunnerStartedAt: status.runnerStartedAt || "",
              remoteTaskExitCode: status.exitCode || "",
              agentFailure: failure,
              technicalDetail: failure?.detail || cleanAgentFailureDetail(raw),
            });
            setServerRawOutput(serverId, raw);
            setServerConnection(serverId, {
              state: "connected",
              label: "已连接",
              detail: agent.shortName,
              mode: "agent",
            });
            return { used: true, ok: false, pending: false };
          }

          const liveOutput = formatAgentLiveOutput(status.output || "", text);
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: `等待 ${agent.shortName} 回复`,
            body: liveOutput
              ? "正在接收远端实时输出，最终回复完成后会自动整理。"
              : "正在同步等待最终结果。这个会话会保持占用，直到任务完成、失败或被取消。",
            status: "running",
            backend: "agent",
            conversationId,
            remoteTaskId,
            promptText: text,
            liveOutput,
            remoteTaskStatus: taskStatus,
            remoteEventFingerprint: status.eventFingerprint || lastEventFingerprint,
            remoteTaskCheckedAt: Date.now(),
            remoteTaskPid: status.pid || "",
            remoteTaskStartedAt: status.startedAt || "",
            remoteTaskRunnerStartedAt: status.runnerStartedAt || "",
            remoteTaskExitCode: status.exitCode || "",
            remoteSyncError: "",
          });
        }

        if (retryAgentStartup) continue;

        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `${agent.shortName} 同步等待超时`,
          body: "已经同步等待 2 小时仍未拿到最终结果。远端任务可能仍在运行，可以点“检查状态”继续同步，或取消任务。",
          output: "",
          liveOutput: "",
          status: "error",
          backend: "agent",
          conversationId,
          remoteTaskId,
          agentId: agent.id,
          promptText: text,
          remoteTaskStatus: "sync-timeout",
          remoteTaskCheckedAt: Date.now(),
          resultMissing: true,
          remoteSyncError: "sync wait timeout",
        });
        setServerTask(serverId, {
          state: "idle",
          backend: "agent",
          conversationId,
          remoteTaskId,
          agentId: agent.id,
          finishedAt: Date.now(),
        });
        setServerConnection(serverId, {
          state: "connected",
          label: "同步超时",
          detail: agent.shortName,
          mode: "agent",
        });
        return { used: true, ok: false, pending: false };
      }

      return { used: false, fallbackReason: "agent_startup_failed" };
    };

    const agentRun = await runWithWorkbenchAgent();
    if (agentRun.used) return agentRun;

    setServerConnection(serverId, {
      state: "testing",
      label: "SSH 直连中",
      detail: agent.shortName,
      mode: "ssh",
    });
    updateAssistantMessageInServer(serverId, assistantMessageId, {
      title: `等待 ${agent.shortName} 回复`,
      body: "正在通过 SSH 直连等待远端返回。这个通道没有后台恢复能力；如果 App 关闭，建议改用 Agent 代理。",
      status: "running",
      backend: "ssh",
      agentId: agent.id,
      promptText: text,
      startedAt: Date.now(),
      remoteTaskStatus: "ssh-waiting",
      remoteTaskCheckedAt: Date.now(),
      remoteSyncError: "",
    });
    const firstOutput = await runRemoteCommandForProfile(
      currentProfile,
      buildAgentSendCommand(currentProfile, agent, text),
      2_097_152,
      7200,
    );
    const completesFromCommand = agent.id === "codex" || agent.id === "claude";
    if (!applyAgentOutput(firstOutput, completesFromCommand)) return { ok: false, pending: false };

    if (completesFromCommand) {
      setServerConnection(serverId, {
        state: "connected",
        label: "会话已完成",
        detail: sessionName(currentProfile, agent.id),
        mode: "ssh",
      });
      return { ok: true, pending: false };
    }

    for (let index = 0; index < 5; index += 1) {
      await sleep(1800);
      const output = await runRemoteCommandForProfile(currentProfile, buildCaptureCommand(currentProfile, agent), 2_097_152, 90);
      if (!applyAgentOutput(output, index === 4)) return { ok: false, pending: false };
    }

    setServerConnection(serverId, {
      state: "connected",
      label: "会话运行中",
      detail: sessionName(currentProfile, agent.id),
      mode: "ssh",
    });
    return { ok: true, pending: false };
  }

  async function syncRemoteAgentMessage(serverId, message) {
    if (!message?.remoteTaskId || message.backend !== "agent") return false;
    const lockKey = `${serverId}:${message.remoteTaskId}`;
    if (syncingAgentTasksRef.current.has(lockKey)) return false;

    const server = serverById(serverId);
    if (!server) return false;

    const currentProfile = withKnownPassword(server.profile);
    if (profileIssue(currentProfile)) return false;

    const agent = agentById(message.agentId || currentProfile.agentId, activeAgent);
    syncingAgentTasksRef.current.add(lockKey);
    try {
      const waitTimeoutSeconds =
        serverId === activeServerIdRef.current && message.status === "running" ? agentLongPollTimeoutSeconds : 20;
      const statusOutput = await runRemoteCommandForProfile(
        currentProfile,
        buildWorkbenchAgentWaitTaskCommand(currentProfile, message.remoteTaskId, message.remoteEventFingerprint || "", {
          timeoutSeconds: waitTimeoutSeconds,
        }),
        2_097_152,
        waitTimeoutSeconds + 20,
      );
      const status = parseWorkbenchAgentOutput(statusOutput);
      const taskStatus = status.taskStatus || "unknown";
      const eventFingerprint = status.eventFingerprint || message.remoteEventFingerprint || "";
      const raw = status.output || status.raw || statusOutput;

      if (taskStatus === "queued" || taskStatus === "running" || taskStatus === "preparing" || taskStatus === "unknown") {
        const liveOutput = formatAgentLiveOutput(status.output || "", message.promptText || "");
        if (liveOutput) setServerRawOutput(serverId, raw);
	        updateAssistantMessageInServer(serverId, message.id, {
	          title: `等待 ${agent.shortName} 回复`,
	          body: liveOutput
	            ? "正在接收远端实时输出，最终回复完成后会自动整理。"
	            : "任务仍在运行，正在同步等待最终结果。恢复连接后会继续同步。",
          status: "running",
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentId: agent.id,
          promptText: message.promptText || "",
          liveOutput,
          remoteTaskStatus: taskStatus,
          remoteEventFingerprint: eventFingerprint,
          remoteTaskCheckedAt: Date.now(),
          remoteTaskPid: status.pid || "",
          remoteTaskStartedAt: status.startedAt || "",
          remoteTaskRunnerStartedAt: status.runnerStartedAt || "",
          remoteTaskExitCode: status.exitCode || "",
          remoteSyncError: "",
        });
        setServerTask(serverId, {
          state: "running",
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentId: agent.id,
          startedAt: message.startedAt || message.createdAtMs || Date.now(),
	          label: `同步等待 ${agent.shortName}`,
        });
        setServerConnection(serverId, {
          ...(server.connection || {}),
          state: "testing",
	          label: "等待结果",
          detail: agent.shortName,
          mode: "agent",
        });
        return false;
      }

      setServerRawOutput(serverId, raw);

      if (taskStatus === "done") {
        const extracted = extractAgentFinalOutput(raw, message.promptText || "");
        const output = extracted.final ? extracted.text : "";
        const deferredWaitingAnswer = output && looksLikeDeferredWaitingAnswer(output);
        if (!output || deferredWaitingAnswer) {
          updateAssistantMessageInServer(serverId, message.id, {
            title: deferredWaitingAnswer ? `${agent.shortName} 没有给出同步结果` : `${agent.shortName} 已结束，但没有最终内容`,
            body: deferredWaitingAnswer
              ? "远端 AI 把“等待通知/稍后继续”当成最终回复返回了，任务没有真正完成。请重新发送，或明确要求它直接检查状态直到成功、失败或阻塞。"
              : "远端任务已经结束，但没有最终答案标记。为避免把中间结论当成结果，App 暂不展示为正式回复。可以查看原始输出或重新发送。",
            output: "",
            liveOutput: "",
            status: deferredWaitingAnswer ? "error" : "idle",
            backend: "agent",
            remoteTaskId: message.remoteTaskId,
            resultMissing: true,
            technicalDetail: deferredWaitingAnswer ? output : undefined,
            remoteTaskStatus: deferredWaitingAnswer ? "deferred-waiting-answer" : taskStatus,
            remoteEventFingerprint: eventFingerprint,
            remoteTaskCheckedAt: Date.now(),
            remoteTaskPid: status.pid || "",
            remoteTaskStartedAt: status.startedAt || "",
            remoteTaskRunnerStartedAt: status.runnerStartedAt || "",
            remoteTaskExitCode: status.exitCode || "",
            remoteSyncError: "",
            forceUpdate: true,
          });
          setServerTask(serverId, {
            state: "done",
            backend: "agent",
            remoteTaskId: message.remoteTaskId,
            agentId: agent.id,
            finishedAt: Date.now(),
          });
          setServerConnection(serverId, {
            state: "connected",
            label: "已完成",
            detail: deferredWaitingAnswer ? "没有最终结果" : "任务已结束",
            mode: "agent",
          });
          return false;
        }
        updateAssistantMessageInServer(serverId, message.id, {
          title: `${agent.shortName} 回复`,
          body: "",
          output,
          liveOutput: "",
          status: "done",
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentFailure: undefined,
          technicalDetail: undefined,
          remoteTaskStatus: taskStatus,
          remoteEventFingerprint: eventFingerprint,
          remoteTaskCheckedAt: Date.now(),
          remoteTaskPid: status.pid || "",
          remoteTaskStartedAt: status.startedAt || "",
          remoteTaskRunnerStartedAt: status.runnerStartedAt || "",
          remoteTaskExitCode: status.exitCode || "",
          remoteSyncError: "",
          resultMissing: false,
          forceUpdate: true,
        });
        setServerTask(serverId, {
          state: "done",
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentId: agent.id,
          finishedAt: Date.now(),
        });
        setServerConnection(serverId, {
          state: "connected",
          label: "会话已完成",
          detail: "Agent 后台任务",
          mode: "agent",
        });
        notifyTaskFinished(serverId, agent, true);
        return true;
      }

      if (taskStatus === "cancelled") {
        const failure = classifyAgentFailure(raw, agent, status);
        const visibleOutput = visibleOutputForStoppedTask(raw, message);
        updateAssistantMessageInServer(serverId, message.id, {
          title: failure?.title || `${agent.shortName} 任务已取消`,
          body: failure?.body || (visibleOutput ? "后台任务已停止，下面保留停止前已经收到的内容。" : "后台任务已停止，输入框已释放。"),
          output: visibleOutput,
          liveOutput: "",
          status: "cancelled",
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentFailure: undefined,
          technicalDetail: failure?.detail || cleanAgentFailureDetail(raw),
          remoteTaskStatus: taskStatus,
          remoteEventFingerprint: eventFingerprint,
          remoteTaskCheckedAt: Date.now(),
          remoteTaskPid: status.pid || "",
          remoteTaskStartedAt: status.startedAt || "",
          remoteTaskRunnerStartedAt: status.runnerStartedAt || "",
          remoteTaskExitCode: status.exitCode || "",
          remoteSyncError: "",
          cancelledAt: Date.now(),
          forceUpdate: true,
        });
        setServerTask(serverId, {
          state: "idle",
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentId: agent.id,
          finishedAt: Date.now(),
        });
        setServerConnection(serverId, { state: "idle", label: "已取消", detail: agent.shortName, mode: "agent" });
        return true;
      }

      const failure = classifyAgentFailure(raw, agent, status);
      const issue = failure ? "" : detectAgentIssue(raw, agent);
      updateAssistantMessageInServer(serverId, message.id, {
        title: failure?.title || `${agent.shortName} 执行失败`,
        body: failure?.body || issue || trimVisibleText(raw) || "Agent 后台任务失败。",
        output: "",
        liveOutput: "",
        status: "error",
        backend: "agent",
        remoteTaskId: message.remoteTaskId,
        agentId: agent.id,
        agentFailure: failure,
        technicalDetail: failure?.detail || cleanAgentFailureDetail(raw),
        remoteTaskStatus: taskStatus,
        remoteEventFingerprint: eventFingerprint,
        remoteTaskCheckedAt: Date.now(),
        remoteTaskPid: status.pid || "",
        remoteTaskStartedAt: status.startedAt || "",
        remoteTaskRunnerStartedAt: status.runnerStartedAt || "",
        remoteTaskExitCode: status.exitCode || "",
        remoteSyncError: "",
        forceUpdate: true,
      });
      setServerTask(serverId, {
        state: "idle",
        backend: "agent",
        remoteTaskId: message.remoteTaskId,
        agentId: agent.id,
        finishedAt: Date.now(),
      });
      setServerConnection(serverId, { state: "connected", label: "已连接", detail: agent.shortName, mode: "agent" });
      notifyTaskFinished(serverId, agent, false);
      return true;
    } catch (error) {
      if (isTransientSshSyncError(error)) {
        const detail = shortError(error);
        updateAssistantMessageInServer(serverId, message.id, {
          title: `等待 ${agent.shortName} 回复`,
	          body: "App 暂时连不上服务器查询状态，远端任务仍可能在运行；恢复连接后会继续同步结果。",
          status: "running",
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentId: agent.id,
          promptText: message.promptText || "",
          remoteTaskStatus: "sync-lost",
          remoteTaskCheckedAt: Date.now(),
          remoteSyncError: detail,
        });
        setServerTask(serverId, {
          state: "running",
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentId: agent.id,
          startedAt: message.startedAt || message.createdAtMs || Date.now(),
          label: `等待同步 ${agent.shortName}`,
        });
        setServerConnection(serverId, {
          ...(server.connection || {}),
          state: "testing",
          label: "等待恢复",
          detail: "同步连接中断，自动重试",
          mode: "agent",
        });
        void appLog("warn", "agent.sync.transient_disconnect", {
          serverId,
          remoteTaskId: message.remoteTaskId,
          error: detail,
        });
        return false;
      }
      void appLog("warn", "agent.sync.failed", {
        serverId,
        remoteTaskId: message.remoteTaskId,
        error: shortError(error),
      });
      return false;
    } finally {
      syncingAgentTasksRef.current.delete(lockKey);
    }
  }

  async function syncAgentConversationForServer(server, options = {}) {
    const conversationId = String(server?.conversationId || "").trim();
    if (!conversationId) return false;
    const currentProfile = withKnownPassword(server.profile);
    if (currentProfile.useWorkbenchAgent !== true || isWindowsProfile(currentProfile) || profileIssue(currentProfile)) return false;
    const lockKey = `${server.id}:${conversationId}`;
    if (syncingAgentConversationsRef.current.has(lockKey)) return false;
    syncingAgentConversationsRef.current.add(lockKey);

    const existingTaskIds = new Set(
      (server.messages || [])
        .map((message) => String(message.remoteTaskId || "").trim())
        .filter(Boolean),
    );

    try {
      const output = await runRemoteCommandForProfile(
        currentProfile,
        buildWorkbenchAgentConversationStatusCommand(currentProfile, conversationId, { limit: 5 }),
        1_048_576,
        45,
      );
      if (options.showResult === true) setServerRawOutput(server.id, output.trim());
      const [conversation] = parseWorkbenchAgentConversations(output);
      if (!conversation?.id) return false;

      const agentId = conversation.agentId || currentProfile.agentId;
      const allRemoteMessages = messagesFromAgentConversation(conversation, agentId);
      const restoredMessages = allRemoteMessages.filter(
        (message) => message.remoteTaskId && !existingTaskIds.has(String(message.remoteTaskId || "").trim()),
      );
      const pullResultMessage =
        options.showResult === true
          ? createAgentConversationPullResultMessage(conversation, agentId, restoredMessages, options)
          : null;
      const status = String(conversation.status || "").trim();
      const isRunning = ["queued", "running", "preparing", "unknown"].includes(status);
      updateServer(server.id, (currentServer) => {
        const currentMessages = currentServer.messages || [];
        let nextMessages = dedupeRemoteTaskMessages([
          ...currentMessages,
          ...(allRemoteMessages.length ? allRemoteMessages : []),
          ...(pullResultMessage ? [pullResultMessage] : []),
        ]);
        if (!isRunning) {
          const completedAt = Date.now();
          nextMessages = nextMessages.map((message) => {
            const unresolvedWithoutTaskId =
              message?.role === "assistant" &&
              message?.backend === "agent" &&
              !String(message.remoteTaskId || "").trim() &&
              (message.status === "running" || Boolean(message.remoteSyncError));
            if (!unresolvedWithoutTaskId) return message;
            const startedAt = Number(message.startedAt || message.createdAtMs || completedAt);
            return {
              ...message,
              title: `${agentById(message.agentId || agentId).shortName} 任务未能恢复`,
              body: "这条任务在 Agent 登记完成前连接中断，服务器当前没有对应的后台进程。请重新发送这条任务。",
              status: "error",
              resultMissing: true,
              remoteTaskStatus: "missing",
              technicalDetail: message.remoteSyncError || message.technicalDetail,
              remoteSyncError: "",
              completedAt,
              durationMs: Math.max(0, completedAt - startedAt),
            };
          });
        }
        return {
          messages: nextMessages,
          task: taskFromAgentConversation(conversation, agentId),
          connection: {
            ...(currentServer.connection || {}),
            state: isRunning ? "testing" : "connected",
	            label: isRunning ? "等待结果" : "已同步",
            detail: agentById(agentId).shortName,
            mode: "agent",
          },
          agentHistoryCursor: currentServer.agentHistoryCursor || conversation.historyCursor || "",
          agentHistoryHasMore: currentServer.agentHistoryCursor
            ? currentServer.agentHistoryHasMore !== false
            : conversation.historyHasMore !== false,
          unreadResult:
            server.id === activeServerIdRef.current || isRunning || !restoredMessages.length
              ? currentServer.unreadResult || null
              : {
                  at: Date.now(),
                  agentId,
                  taskId: conversation.taskId || restoredMessages[restoredMessages.length - 1]?.remoteTaskId,
                },
        };
      });
      void appLog("info", "agent.conversation.sync.success", {
        serverId: server.id,
        conversationId,
        status,
        taskId: conversation.taskId || "",
        historyCount: Array.isArray(conversation.history) ? conversation.history.length : 0,
        remoteMessageCount: allRemoteMessages.length,
        newlyRestoredMessageCount: restoredMessages.length,
      });
      return true;
    } catch (error) {
      if (isTransientSshSyncError(error)) {
        setServerConnection(server.id, {
          ...(server.connection || {}),
          state: "testing",
          label: "等待恢复",
          detail: "网络恢复后自动同步",
          mode: "agent",
        });
      } else {
        void appLog("warn", "agent.conversation.sync.failed", {
          serverId: server.id,
          conversationId,
          error: shortError(error),
        });
      }
      return false;
    } finally {
      syncingAgentConversationsRef.current.delete(lockKey);
    }
  }

  async function loadOlderAgentHistoryForServer(serverId) {
    const server = serverById(serverId);
    if (!server?.conversationId || server.agentHistoryHasMore === false) return false;
    const currentProfile = withKnownPassword(server.profile);
    if (currentProfile.useWorkbenchAgent !== true || isWindowsProfile(currentProfile) || profileIssue(currentProfile)) return false;

    const conversationId = String(server.conversationId || "").trim();
    const before = String(server.agentHistoryCursor || "").trim();
    const lockKey = `${serverId}:${conversationId}:${before || "latest"}`;
    if (loadingAgentHistoryRef.current.has(lockKey)) return false;

    loadingAgentHistoryRef.current.add(lockKey);
    const container = conversationScrollRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;
    const previousScrollTop = container?.scrollTop || 0;
    try {
      const existingTaskIds = new Set(
        (server.messages || [])
          .map((message) => String(message.remoteTaskId || "").trim())
          .filter(Boolean),
      );
      const output = await runRemoteCommandForProfile(
        currentProfile,
        buildWorkbenchAgentConversationStatusCommand(currentProfile, conversationId, { limit: 5, before }),
        1_048_576,
        45,
      );
      const [conversation] = parseWorkbenchAgentConversations(output);
      if (!conversation?.id) return false;

      const agentId = conversation.agentId || currentProfile.agentId;
      const restoredMessages = messagesFromAgentConversation(conversation, agentId, { existingTaskIds });
      const nextCursor = conversation.historyCursor || before;
      const nextHasMore = conversation.historyHasMore !== false;

      updateServer(serverId, (currentServer) => ({
        messages: restoredMessages.length ? [...restoredMessages, ...(currentServer.messages || [])] : currentServer.messages || [],
        agentHistoryCursor: nextCursor,
        agentHistoryHasMore: nextHasMore,
      }));

      if (restoredMessages.length && typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          const latestContainer = conversationScrollRef.current;
          if (!latestContainer || activeServerIdRef.current !== serverId) return;
          latestContainer.scrollTop = Math.max(0, latestContainer.scrollHeight - previousScrollHeight + previousScrollTop);
        });
      }
      return restoredMessages.length > 0;
    } catch (error) {
      void appLog("warn", "agent.history.load_older.failed", {
        serverId,
        conversationId,
        error: shortError(error),
      });
      return false;
    } finally {
      loadingAgentHistoryRef.current.delete(lockKey);
    }
  }

  async function syncRemoteAgentTasks() {
    if (syncingAgentSweepRef.current) return;
    syncingAgentSweepRef.current = true;
    try {
      const snapshot = serversRef.current.length ? serversRef.current : servers;
      const now = Date.now();
      const serversByConnection = new Map();

      for (const server of snapshot) {
        if (sendingServerIdsRef.current.has(server.id)) continue;
        const connectionKey = profileConnectionKey(normalizeProfile(server.profile));
        const connectionServers = serversByConnection.get(connectionKey) || [];
        connectionServers.push(server);
        serversByConnection.set(connectionKey, connectionServers);
      }

      for (const [connectionKey, connectionServers] of serversByConnection) {
        if (agentHealthInFlightConnectionsRef.current.has(connectionKey)) continue;
        const lastConnectionPollAt = Number(agentConnectionPollAtRef.current.get(connectionKey) || 0);
        if (lastConnectionPollAt && now - lastConnectionPollAt < 15_000) continue;

        const taskCandidates = [];
        for (const server of connectionServers) {
          const seenTaskIds = new Set();
          const latestSyncableMessage = [...(server.messages || [])].reverse().find((message) => {
            const taskId = String(message.remoteTaskId || "").trim();
            if (
              message.role !== "assistant" ||
              message.backend !== "agent" ||
              !taskId ||
              seenTaskIds.has(taskId) ||
              (message.status !== "running" && !remoteResultNeedsSync(message))
            ) {
              return false;
            }
            seenTaskIds.add(taskId);
            return true;
          });
          if (latestSyncableMessage) {
            taskCandidates.push({ server, message: latestSyncableMessage });
          }
        }

        if (taskCandidates.length) {
          taskCandidates.sort((left, right) => {
            const leftCheckedAt = Number(left.message.remoteTaskCheckedAt || 0);
            const rightCheckedAt = Number(right.message.remoteTaskCheckedAt || 0);
            if (leftCheckedAt !== rightCheckedAt) return leftCheckedAt - rightCheckedAt;
            if (left.message.status === "running" && right.message.status !== "running") return -1;
            if (right.message.status === "running" && left.message.status !== "running") return 1;
            return left.server.id === activeServerIdRef.current ? -1 : 1;
          });
          const candidate = taskCandidates[0];
          agentConnectionPollAtRef.current.set(connectionKey, Date.now());
          await syncRemoteAgentMessage(candidate.server.id, candidate.message);
          const conversationCandidate = connectionServers.find(
            (server) => server.conversationId && serverNeedsAgentConversationRecovery(server),
          );
          if (conversationCandidate) {
            const syncKey = `${conversationCandidate.id}:${conversationCandidate.conversationId}`;
            const lastSyncedAt = Number(agentConversationAutoSyncAtRef.current.get(syncKey) || 0);
            const lastFailedAt = Number(agentConversationSyncFailedAtRef.current.get(syncKey) || 0);
            const syncNow = Date.now();
            if ((!lastSyncedAt || syncNow - lastSyncedAt >= 60_000) && (!lastFailedAt || syncNow - lastFailedAt >= 60_000)) {
              const ok = await syncAgentConversationForServer(conversationCandidate);
              if (ok) {
                agentConversationAutoSyncAtRef.current.set(syncKey, syncNow);
                agentConversationSyncFailedAtRef.current.delete(syncKey);
              } else {
                agentConversationSyncFailedAtRef.current.set(syncKey, syncNow);
              }
            }
          }
          continue;
        }

        const recoveryCandidates = connectionServers
          .filter((server) => {
            if (!server.conversationId) return false;
            const syncKey = `${server.id}:${server.conversationId}`;
            return !agentConversationAutoSyncAtRef.current.has(syncKey) || serverNeedsAgentConversationRecovery(server);
          })
          .sort((left, right) => {
            if (left.id === activeServerIdRef.current) return -1;
            if (right.id === activeServerIdRef.current) return 1;
            return Number(right.task?.startedAt || 0) - Number(left.task?.startedAt || 0);
          });
        const server = recoveryCandidates[0];
        if (!server) continue;

        const syncKey = `${server.id}:${server.conversationId}`;
        const lastSyncedAt = Number(agentConversationAutoSyncAtRef.current.get(syncKey) || 0);
        const lastFailedAt = Number(agentConversationSyncFailedAtRef.current.get(syncKey) || 0);
        if (lastSyncedAt && now - lastSyncedAt < 20_000) continue;
        if (lastFailedAt && now - lastFailedAt < 45_000) continue;

        agentConnectionPollAtRef.current.set(connectionKey, Date.now());
        const ok = await syncAgentConversationForServer(server);
        if (ok) {
          agentConversationAutoSyncAtRef.current.set(syncKey, now);
          agentConversationSyncFailedAtRef.current.delete(syncKey);
        } else {
          agentConversationSyncFailedAtRef.current.set(syncKey, now);
        }
      }
    } finally {
      syncingAgentSweepRef.current = false;
    }
  }

  useEffect(() => {
    if (!workspaceLoaded) return undefined;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      syncRemoteAgentTasks().catch((error) => {
        console.warn("[aiwb:agent-sync:error]", shortError(error));
      });
    };
    const firstTimer = window.setTimeout(tick, 1200);
    const interval = window.setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
    };
  }, [workspaceLoaded]);

  useEffect(() => {
    if (!workspaceLoaded) return undefined;
    const message = activeRunningMessage;
    if (!message || message.status !== "running" || message.backend !== "agent" || !message.remoteTaskId) {
      return undefined;
    }

    let cancelled = false;
    const firstTimer = window.setTimeout(() => {
      if (cancelled) return;
      syncRemoteAgentTasks().catch((error) => {
        console.warn("[aiwb:agent-active-sync:error]", shortError(error));
      });
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(firstTimer);
    };
  }, [activeRunningMessage?.id, activeRunningMessage?.remoteTaskId, activeRunningMessage?.status, activeServerId, workspaceLoaded]);

  async function openRemoteFilePreview(fileRef) {
    const currentProfile = withKnownPassword(profileRef.current);
    const path = String(fileRef?.path || "").trim();
    if (!path) return;

    setFilePreview({
      state: "loading",
      request: {
        ...fileRef,
        name: fileRef?.name || remoteBasename(path),
        path,
      },
    });

    try {
      const output = await runRemoteCommandForProfile(
        currentProfile,
        buildRemoteFileReadCommand(currentProfile, path, { maxBytes: maxPreviewFileBytes }),
        remoteFileResponseSizeForBytes(maxPreviewFileBytes),
        120,
      );
      const file = parseRemoteFilePayload(output);
      setFilePreview({
        state: "done",
        request: fileRef,
        file: {
          ...file,
          name: file.name || fileRef?.name || remoteBasename(path),
          path: file.path || path,
        },
      });
    } catch (error) {
      setFilePreview({
        state: "error",
        request: fileRef,
        error: shortError(error),
      });
    }
  }

  async function saveFileToDevice(file) {
    if (!file?.base64) throw new Error("文件内容为空，无法保存。");
    return SSHWorkbench.saveFile({
      name: file.name || remoteBasename(file.path) || "download",
      mime: file.mime || previewMimeFromExtension(file.extension),
      base64: file.base64,
    });
  }

  async function downloadRemoteFile(fileRef, loadedFile) {
    const currentProfile = withKnownPassword(profileRef.current);
    const path = String(loadedFile?.path || fileRef?.path || "").trim();
    if (!path) {
      const message = "请输入要下载的远程文件路径。";
      setFileDownload({ state: "error", path: "", message });
      return { ok: false, error: message };
    }

    setFileDownload({
      state: "loading",
      action: "download",
      path,
      message: `正在下载 ${fileRef?.name || loadedFile?.name || remoteBasename(path)}`,
    });

    try {
      let file = loadedFile?.base64 ? loadedFile : null;
      if (!file) {
        const output = await runRemoteCommandForProfile(
          currentProfile,
          buildRemoteFileReadCommand(currentProfile, path, { maxBytes: maxDownloadFileBytes }),
          remoteFileResponseSizeForBytes(maxDownloadFileBytes),
          600,
        );
        file = parseRemoteFilePayload(output);
      }

      const savedFile = {
        ...file,
        name: file.name || fileRef?.name || remoteBasename(path),
        path: file.path || path,
      };
      const result = await saveFileToDevice(savedFile);
      const canceled = Boolean(result?.canceled);
      setFileDownload({
        state: canceled ? "idle" : "done",
        action: "download",
        path,
        message: canceled ? "已取消保存。" : result?.path ? `已保存：${result.path}` : "文件已交给系统保存。",
      });
      return { ok: true, canceled, path: result?.path || "" };
    } catch (error) {
      const message = shortError(error);
      setFileDownload({
        state: "error",
        action: "download",
        path,
        message,
      });
      return { ok: false, error: message };
    } finally {
      window.setTimeout(() => {
        setFileDownload((current) => (current?.path === path && current.state !== "loading" ? null : current));
      }, 4200);
    }
  }

  async function deleteRemoteFile(fileRef) {
    const currentProfile = withKnownPassword(profileRef.current);
    const path = String(fileRef?.path || "").trim();
    if (!path) return { ok: false, error: "文件路径为空。" };
    if (!window.confirm(`确定删除远程文件“${fileRef?.name || remoteBasename(path)}”吗？\n\n${path}`)) {
      return { ok: false, canceled: true };
    }

    setFileDownload({ state: "loading", action: "delete", path, message: "正在删除远程文件…" });
    try {
      await runRemoteCommandForProfile(currentProfile, buildRemoteFileDeleteCommand(currentProfile, path), 32_000, 120);
      setDeletedRemoteFilePaths((current) => new Set([...current, path]));
      setFilePreview((current) => (current?.file?.path === path || current?.request?.path === path ? null : current));
      setFileDownload({ state: "done", action: "delete", path, message: "远程文件已删除。" });
      return { ok: true };
    } catch (error) {
      const message = shortError(error);
      setFileDownload({ state: "error", action: "delete", path, message });
      return { ok: false, error: message };
    } finally {
      window.setTimeout(() => {
        setFileDownload((current) => (current?.path === path && current.state !== "loading" ? null : current));
      }, 4200);
    }
  }

  function markRunningMessageStuck(message) {
    if (!message?.id || message.status !== "running") return;
    const serverId = activeServerIdRef.current;
    const currentProfile = normalizeProfile(profileRef.current);
    const agent = agentById(message.agentId || currentProfile.agentId, activeAgent);
    const now = Date.now();
    const startedAt = Number(message.startedAt || message.createdAtMs || now);
    const durationMs = Math.max(0, now - startedAt);

    updateAssistantMessageInServer(serverId, message.id, {
      title: `${agent.shortName} 可能已卡住`,
      body: [
        `这个任务已经等待 ${formatDuration(durationMs)}，已释放输入框。你可以继续发送新任务。`,
        agent.id === "claude"
          ? "Claude 长任务没有中间输出；远端进程可能还在执行，稍后如果返回结果，这条已释放的消息不会再被覆盖。"
          : "远端任务可能还在运行；如果需要彻底停止，可以再点一次中断或打开 SSH 查看。",
      ].join("\n"),
      output: "",
      status: "error",
      cancelledAt: now,
      completedAt: now,
      durationMs,
      loginAction: undefined,
      modelChoice: undefined,
    });
    setServerTask(serverId, {
      state: "idle",
      agentId: agent.id,
      interruptedAt: now,
      finishedAt: now,
    });
    setServerConnection(serverId, {
      state: "idle",
      label: "已释放",
      detail: `${agent.shortName} 任务可能仍在远端运行`,
    });
  }

  async function retryAgentFailureMessage(message) {
    const text = taskTextFromValue(message?.promptText || message?.retryText || "");
    if (!text) {
      setVoiceError("这条失败消息没有保留原始任务内容，请手动重新输入一次。");
      return;
    }

    const serverId = activeServerIdRef.current;
    if (busyRef.current || pendingActionRef.current || sendingServerIdsRef.current.has(serverId)) {
      setVoiceError("当前还有任务正在提交，请稍等。");
      return;
    }
    if (isServerBusy(serverId)) {
      setVoiceError("当前任务还在运行，可以先取消或切换到其它任务。");
      return;
    }

    const currentProfile = normalizeProfile(profileRef.current);
    const agent = agentById(message?.agentId || currentProfile.agentId, activeAgent);
    const now = Date.now();
    updateAssistantMessageInServer(serverId, message.id, {
      title: "已重新发送",
      body: `已重新交给 ${agent.shortName}，新的任务进度会显示在下面。`,
      output: "",
      liveOutput: "",
      status: "done",
      agentFailure: undefined,
      modelChoice: undefined,
      loginAction: undefined,
      retryText: text,
      completedAt: now,
      durationMs: Number(message.startedAt || message.createdAtMs || 0) ? Math.max(0, now - Number(message.startedAt || message.createdAtMs || now)) : message.durationMs,
      forceUpdate: true,
    });
    await sendTask(text);
  }

  function showAgentFailureDetails(message, failure) {
    const detail = formatAgentFailureCopy(message, failure);
    if (!detail.trim()) return;
    setServerRawOutput(activeServerIdRef.current, detail);
    setRawOpen(true);
  }

  function openActiveServerSettingsFromMessage() {
    openServerSettings(activeServerIdRef.current);
  }

  function releaseActiveRunningTask() {
    const serverId = activeServerIdRef.current;
    const server = serverById(serverId);
    const runningMessage =
      [...(server?.messages || [])].reverse().find((message) => message.status === "running") || null;

    if (runningMessage) {
      markRunningMessageStuck(runningMessage);
      return;
    }

    const currentProfile = normalizeProfile(server?.profile || profileRef.current);
    const task = server?.task || {};
    const agent = agentById(task.agentId || currentProfile.agentId, activeAgent);
    const now = Date.now();
    const startedAt = Number(task.startedAt || now);

    setServerTask(serverId, {
      state: "idle",
      agentId: agent.id,
      interruptedAt: now,
      finishedAt: now,
      durationMs: Math.max(0, now - startedAt),
    });
    setServerConnection(serverId, {
      state: "idle",
      label: "已释放",
      detail: `${agent.shortName} 任务可能仍在远端运行`,
    });
  }

  async function sendTask(textOverride) {
    const pendingFiles = imageAttachmentsRef.current.filter((item) => cleanBase64Payload(item?.base64));
    const rawText = taskTextFromValue(textOverride, composerRef.current || composer);
    const text = rawText || (pendingFiles.length ? "请查看这些附件。" : "");
    if (!text) return;

    if (!pendingFiles.length && (await handleLocalVoiceCommand(text))) {
      composerRef.current = "";
      setComposer("");
      return;
    }

    if (!pendingFiles.length) {
      const switchIndex = parseSessionSwitchIndex(text);
      const switchMatch = switchIndex >= 0 ? { index: switchIndex, serverId: serversRef.current[switchIndex]?.id } : taskWakeMatchFromText(text, serversRef.current);
      if (switchMatch?.serverId || switchIndex >= 0) {
        const target = switchMatch?.serverId ? serverById(switchMatch.serverId) : serversRef.current[switchIndex];
        const targetIndex = target ? serversRef.current.findIndex((server) => server.id === target.id) : switchIndex;
        voiceSessionActiveRef.current = false;
        assistantSpeechActiveRef.current = false;
        stopAssistantSpeech();
        composerRef.current = "";
        setComposer("");
        if (target) {
          await selectServer(target.id);
          setServerConnection(target.id, {
            ...(target.connection || {}),
            state: serverTaskRunning(target) ? "testing" : target.connection?.state || "connected",
            label: serverTaskRunning(target) ? "运行中" : "已切换",
            detail: serverSessionName(target, targetIndex >= 0 ? targetIndex : 0),
          });
        } else {
          setVoiceError(`没有第 ${switchIndex + 1} 个会话。`);
        }
        return;
      }
    }

    const serverId = activeServerIdRef.current;
    releaseStaleRunningTask(serverId, "before_send");
    void appLog("info", "send.request", {
      serverId,
      textLength: text.length,
      attachmentCount: pendingFiles.length,
      busy: busyRef.current,
      pendingAction: pendingActionRef.current,
      alreadySending: sendingServerIdsRef.current.has(serverId),
      serverBusy: isServerBusy(serverId),
      activeServerId: activeServerIdRef.current,
    });

    if (busyRef.current || pendingActionRef.current) {
      const title = "当前正在处理上一条操作";
      setVoiceError(title);
      enqueueTaskNotice({ serverId, title, tone: "error" });
      void appLog("warn", "send.blocked", {
        serverId,
        reason: busyRef.current ? "ui_busy" : "pending_action",
      });
      return;
    }

    if (sendingServerIdsRef.current.has(serverId)) {
      const title = "当前任务正在提交，请稍等";
      setVoiceError(title);
      enqueueTaskNotice({ serverId, title, tone: "error" });
      void appLog("warn", "send.blocked", { serverId, reason: "already_sending" });
      return;
    }
    if (isServerBusy(serverId)) {
      const title = "当前任务还在运行，先停止或切换任务";
      setVoiceError(title);
      enqueueTaskNotice({ serverId, title, tone: "error" });
      const busyServer = serverById(serverId);
      const runningMessage = runningMessageForServer(busyServer);
      void appLog("warn", "send.blocked", {
        serverId,
        reason: "server_task_running",
        taskState: busyServer?.task?.state || "",
        taskBackend: busyServer?.task?.backend || "",
        runningMessageId: runningMessage?.id || "",
        runningRemoteTaskId: runningMessage?.remoteTaskId || "",
        runningRemoteStatus: runningMessage?.remoteTaskStatus || "",
      });
      return;
    }

    const sourceServer = serverById(serverId) || activeServer;
    const currentProfile = withKnownPassword(profileRef.current);
    if (showProfileIssue(currentProfile)) return;
    if (!String(currentProfile.workdir || "").trim()) {
      setVoiceError("请先选择一个工作目录。");
      setServerConnection(serverId, { state: "idle", label: "待选择目录", detail: "未选择工作目录" });
      return;
    }

    const selectedAgent = agentById(currentProfile.agentId, activeAgent);
    sendingServerIdsRef.current.add(serverId);
    const routerEnabled = mainAIRouterReady(currentProfile) && !pendingFiles.length;
    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `agent-${Date.now()}`;
    const sourceMessages = sourceServer.messages || [];
    composerRef.current = "";
    setComposer("");
    setRawOpen(false);
    setServerTask(serverId, {
      state: "running",
      agentId: selectedAgent.id,
      startedAt: Date.now(),
      label: `等待 ${selectedAgent.shortName}`,
    });
    setServerConnection(serverId, {
      state: "testing",
      label: "运行中",
      detail: selectedAgent.shortName,
    });
    setServerMessages(serverId, (items) => [
      ...items,
      createMessage({
        id: userMessageId,
        role: "user",
        body: pendingFiles.length
          ? `${text}\n\n${pendingFiles.map((item) => `[${item.isImage ? "图片" : "文件"}] ${item.name}`).join("\n")}`
          : text,
      }),
      createMessage({
        id: assistantMessageId,
        role: "assistant",
        agentId: selectedAgent.id,
        title: pendingFiles.length ? "正在上传附件" : routerEnabled ? "主 AI 正在判断" : `已发送到 ${selectedAgent.shortName}`,
        body: pendingFiles.length
          ? `正在上传 ${pendingFiles.length} 个文件到远端工作目录。`
          : routerEnabled
            ? "正在用 gpt-5.4-mini 判断这句话该怎么处理。"
            : `正在等待 ${selectedAgent.shortName} 回复。`,
        status: "running",
        startedAt: Date.now(),
        remoteTaskStatus: "preparing",
        remoteTaskCheckedAt: Date.now(),
      }),
    ]);
    void appLog("info", "send.local_messages.appended", {
      serverId,
      userMessageId,
      assistantMessageId,
      previousMessageCount: sourceMessages.length,
      agentId: selectedAgent.id,
      backend: currentProfile.useWorkbenchAgent ? "agent" : "ssh",
    });

    let ranRemote = false;
    let completedOk = false;
    let pendingRemoteTask = false;
    let finalAgent = selectedAgent;
    try {
      let agent = selectedAgent;
      let uploadedImages = [];
      let promptText = text;
      if (pendingFiles.length) {
        uploadedImages = await uploadImageAttachmentsForProfile(currentProfile, pendingFiles);
        promptText = appendUploadedImagesToPrompt(text, uploadedImages);
        clearImageAttachments();
        updateAssistantMessageInServer(serverId, userMessageId, {
          body: text,
          attachments: uploadedImages,
          forceUpdate: true,
        });
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `已发送到 ${selectedAgent.shortName}`,
          body: `附件已上传，正在等待 ${selectedAgent.shortName} 回复。`,
          status: "running",
          forceUpdate: true,
        });
      }

      let task = promptText;
      let route = null;

      if (routerEnabled) {
        try {
          route = await routeUserIntent({ currentProfile, text: promptText, agent: selectedAgent, sourceMessages });
        } catch (routeError) {
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: "主 AI 分流失败，改为直接发送",
            body: `${shortError(routeError)}\n\n我会按当前选择交给 ${selectedAgent.shortName}。`,
            agentId: selectedAgent.id,
            status: "running",
          });
        }
      }

      if (route) {
        agent = agentById(route.agent, selectedAgent);
        task = taskTextFromValue(route.task, promptText);

        if (route.action === "switch_agent") {
          setActiveAgentId(agent.id);
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: "已切换 AI",
            body: "",
            output: route.reply || `已切换到 ${agent.shortName}。`,
            agentId: agent.id,
            status: "done",
          });
          setServerConnection(serverId, { state: "connected", label: "已切换", detail: agent.shortName });
          completedOk = true;
          return;
        }

        if (route.action === "answer_directly" || route.action === "ask_clarification" || route.action === "no_action") {
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: route.action === "ask_clarification" ? "主 AI 需要确认" : "主 AI 回复",
            body: "",
            output: route.reply || route.reason || "我需要你再说清楚一点。",
            agentId: selectedAgent.id,
            status: "done",
          });
          completedOk = true;
          return;
        }

        if (route.action === "stop") {
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: "主 AI 已理解为停止",
            body: "",
            output: route.reply || "明白，当前没有继续发送新的任务。",
            agentId: selectedAgent.id,
            status: "done",
          });
          completedOk = true;
          return;
        }

        if (route.requiresConfirmation) {
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: "需要你确认后再执行",
            body: "",
            output: [
              route.reply || "这个操作可能会修改项目或影响远端环境。",
              "",
              `准备交给 ${agent.shortName}：${task}`,
              "",
              "确认后再发一次明确指令，我再执行。",
            ].join("\n"),
            agentId: agent.id,
            status: "done",
          });
          setServerConnection(serverId, { state: "idle", label: "等待确认", detail: agent.shortName });
          return;
        }

        if (agent.id !== selectedAgent.id) setActiveAgentId(agent.id);
        finalAgent = agent;
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `主 AI 已选择 ${agent.shortName}`,
          body: `gpt-5.4-mini 判断为：${route.reason || "执行任务"}。正在发送给 ${agent.shortName}。`,
          agentId: agent.id,
          status: "running",
        });
      }

      ranRemote = true;
      finalAgent = agent;
      void appLog("info", "send.remote.start", {
        serverId,
        assistantMessageId,
        agentId: agent.id,
        backend: currentProfile.useWorkbenchAgent ? "agent" : "ssh",
        textLength: task.length,
      });
      const remoteResult = await runAgentPrompt({ serverId, currentProfile, agent, text: task, assistantMessageId, userMessageId });
      completedOk = Boolean(remoteResult?.ok);
      pendingRemoteTask = Boolean(remoteResult?.pending);
    } catch (error) {
      const message = shortError(error);
      const agentMode = currentProfile.useWorkbenchAgent === true;
      const transientAgentDisconnect = agentMode && isTransientSshSyncError(error);
      void appLog("error", "send.remote.failed", {
        serverId,
        assistantMessageId,
        agentId: finalAgent.id,
        backend: agentMode ? "agent" : "ssh",
        error: message,
        transientAgentDisconnect,
      });
      if (serverId === activeServerIdRef.current) setRawOpen(true);
      setServerRawOutput(serverId, message);
      if (transientAgentDisconnect) {
        const currentMessage = (serverById(serverId)?.messages || []).find((item) => item.id === assistantMessageId) || {};
        const remoteTaskId = String(currentMessage.remoteTaskId || "").trim();
        const conversationId = String(currentMessage.conversationId || "").trim() || ensureServerConversationId(serverId, currentProfile, finalAgent.id);
        pendingRemoteTask = true;
        ranRemote = true;
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `等待 ${finalAgent.shortName} 回复`,
          body: remoteTaskId
            ? "App 暂时连不上服务器查询状态，远端任务仍可能在运行；网络恢复后会继续同步结果。"
            : "任务可能已经提交到服务器，但 App 在确认状态时断开了连接；网络恢复后会按会话重新同步。",
          status: "running",
          backend: "agent",
          conversationId,
          remoteTaskId: remoteTaskId || undefined,
          agentId: finalAgent.id,
          promptText: taskTextFromValue(currentMessage.promptText || text),
          remoteTaskStatus: remoteTaskId ? "sync-lost" : "sync-lost-no-task-id",
          remoteTaskCheckedAt: Date.now(),
          remoteSyncError: message,
          agentFailure: undefined,
          technicalDetail: undefined,
          loginAction: undefined,
          modelChoice: undefined,
          forceUpdate: true,
        });
        setServerTask(serverId, {
          state: "running",
          backend: "agent",
          conversationId,
          remoteTaskId: remoteTaskId || "",
          agentId: finalAgent.id,
          startedAt: Number(currentMessage.startedAt || currentMessage.createdAtMs || Date.now()),
          label: `等待同步 ${finalAgent.shortName}`,
        });
        setServerConnection(serverId, {
          state: "testing",
          label: "等待恢复",
          detail: "网络恢复后自动同步",
          mode: "agent",
        });
        const syncKey = `${serverId}:${conversationId}`;
        agentConversationAutoSyncAtRef.current.delete(syncKey);
        agentConversationSyncFailedAtRef.current.delete(syncKey);
        setTimeout(() => {
          const latestServer = serverById(serverId);
          if (latestServer) {
            syncAgentConversationForServer(latestServer).catch((syncError) => {
              console.warn("[aiwb:agent-recover-sync:error]", shortError(syncError));
            });
          }
        }, 1200);
      } else {
      updateAssistantMessageInServer(serverId, assistantMessageId, {
        title: "远端执行失败",
        body: message,
        status: "error",
        loginAction: undefined,
        modelChoice: undefined,
      });
      setServerConnection(serverId, connectionStateForRemoteError(message, finalAgent, agentMode ? "agent" : "ssh"));
      }
    } finally {
      sendingServerIdsRef.current.delete(serverId);
      if (!pendingRemoteTask) {
        setServerTask(serverId, {
          state: completedOk ? "done" : "idle",
          agentId: finalAgent.id,
          finishedAt: Date.now(),
        });
      }
      if (!ranRemote && completedOk) {
        setServerConnection(serverId, { state: "connected", label: "已完成", detail: finalAgent.shortName });
      }
      if (ranRemote && !pendingRemoteTask) notifyTaskFinished(serverId, finalAgent, completedOk);
      if (ranRemote && completedOk && currentProfile.useWorkbenchAgent === true) {
        const latestServer = serverById(serverId);
        if (latestServer?.conversationId) {
          window.setTimeout(() => {
            const currentServer = serverById(serverId);
            if (!currentServer) return;
            syncAgentConversationForServer(currentServer).catch((syncError) => {
              console.warn("[aiwb:agent-post-complete-sync:error]", shortError(syncError));
            });
          }, 500);
        }
      }
      void appLog("info", "send.finished", {
        serverId,
        assistantMessageId,
        agentId: finalAgent.id,
        ranRemote,
        completedOk,
        pendingRemoteTask,
      });
    }
  }

  async function startVoiceInput({ fromWake = false, silentOnEmpty = false } = {}) {
    if (normalizeProfile(profileRef.current).voiceInputEnabled !== true) {
      setVoiceError("请先在全局设置开启语音输入与唤醒。");
      return false;
    }
    if (voiceStateRef.current !== "idle" || !profileReadyRef.current) {
      return false;
    }

    setVoiceError("");
    setVoiceLevel(0);
    if (fromWake) voiceSessionActiveRef.current = true;
    applyVoiceState("listening");
    if (fromWake) applyWakeState("dictating");
    voiceBaseTextRef.current = composerRef.current.trim();

    if (wakeEnabledRef.current && wakeStateRef.current !== "idle") {
      try {
        await VoiceWorkbench.stopWakeWord?.();
      } catch {
        // The wake listener is best-effort and will restart from the wake loop.
      }
    }

    try {
      const result = await VoiceWorkbench.start({
        locale: "zh-CN",
        timeoutSeconds: 30,
        silenceSeconds: 3,
        apiKey: profileRef.current?.aliyunApiKey,
        workspaceId: profileRef.current?.aliyunWorkspaceId,
      });
      const text = String(result?.text || "").trim();
      if (text) {
        if (fromWake) voiceSessionActiveRef.current = true;
        const existing = voiceBaseTextRef.current.trim();
        const task = existing ? `${existing}\n${text}` : text;
        composerRef.current = "";
        setComposer("");
        sendTask(task);
      } else {
        if (fromWake) voiceSessionActiveRef.current = false;
        composerRef.current = voiceBaseTextRef.current;
        setComposer(voiceBaseTextRef.current);
        if (!silentOnEmpty) {
          setVoiceError(fromWake ? "已唤醒，但没有识别到任务内容。" : "没有识别到内容。");
        }
      }
      return Boolean(text);
    } catch (error) {
      if (fromWake) voiceSessionActiveRef.current = false;
      setVoiceError(shortError(error));
      return false;
    } finally {
      voiceBaseTextRef.current = "";
      applyVoiceState("idle");
      if (fromWake && wakeEnabledRef.current && !voiceSessionActiveRef.current) applyWakeState("listening");
    }
  }

  async function runWakeLoop(loopId) {
    while (wakeEnabledRef.current && wakeLoopIdRef.current === loopId) {
      if (assistantSpeechActiveRef.current) {
        applyWakeState("speaking");
        await listenForSpeechInterrupt(loopId);
        await sleep(120);
        continue;
      }

      if (
        voiceStateRef.current !== "idle" ||
        voiceSessionActiveRef.current ||
        !profileReadyRef.current
      ) {
        if (voiceSessionActiveRef.current || voiceStateRef.current !== "idle") {
          applyWakeState("dictating");
        } else {
          applyWakeState("listening");
        }
        await sleep(700);
        continue;
      }

      applyWakeState("listening");
      try {
        const wakeContext = wakeContextForServers(serversRef.current, activeServerIdRef.current, profileRef.current);
        const result = await VoiceWorkbench.startWakeWord({
          locale: "zh-CN",
          phrases: wakeContext.phrases,
          timeoutSeconds: 50,
          apiKey: profileRef.current?.aliyunApiKey,
          workspaceId: profileRef.current?.aliyunWorkspaceId,
        });

        if (!wakeEnabledRef.current || wakeLoopIdRef.current !== loopId) break;

        if (result?.detected) {
          setWakeError("");
          const playbackMatch =
            playbackCommandMatchFromPhrase(result.phrase, wakeContext) ||
            (currentResultPlaybackPhrases.some((item) => normalizeVoiceText(item) === normalizeVoiceText(result.phrase))
              ? { current: true }
              : null);
          if (playbackMatch) {
            await playLastResultForVoiceCommand(playbackMatch);
            continue;
          }

          const taskMatch = taskWakeMatchFromPhrase(result.phrase, wakeContext);
          if (taskMatch?.serverId) {
            const target = serverById(taskMatch.serverId);
            const targetIndex = serversRef.current.findIndex((server) => server.id === taskMatch.serverId);
            if (target) {
              await selectServer(target.id);
              const running = serverTaskRunning(target);
              setServerConnection(target.id, {
                ...(target.connection || {}),
                state: running ? "testing" : target.connection?.state || "connected",
                label: running ? "运行中" : "已切换",
                detail: serverSessionName(target, targetIndex >= 0 ? targetIndex : 0),
              });
              if (running) {
                voiceSessionActiveRef.current = false;
                setVoiceError(`${serverSessionName(target, targetIndex >= 0 ? targetIndex : 0)} 正在运行，完成后会提醒你。`);
                continue;
              }
            }
          }
          voiceSessionActiveRef.current = true;
          applyWakeState("detected");
          await sleep(180);
          await startVoiceInput({ fromWake: true });
        }
      } catch (error) {
        if (!wakeEnabledRef.current || wakeLoopIdRef.current !== loopId) break;
        setWakeError(shortError(error));
        applyWakeState("listening");
        await sleep(1800);
      }

      await sleep(240);
    }

    if (wakeLoopIdRef.current === loopId) {
      wakeEnabledRef.current = false;
      applyWakeState("idle");
    }
  }

  function startWakeMode() {
    if (
      normalizeProfile(profileRef.current).voiceInputEnabled !== true ||
      wakeEnabledRef.current ||
      busyRef.current ||
      !profileReadyRef.current
    ) {
      return false;
    }

    setWakeError("");
    wakeEnabledRef.current = true;
    const loopId = wakeLoopIdRef.current + 1;
    wakeLoopIdRef.current = loopId;
    applyWakeState("listening");
    runWakeLoop(loopId);
    return true;
  }

  async function toggleWakeWord() {
    if (wakeEnabledRef.current) {
      wakeEnabledRef.current = false;
      wakeManuallyDisabledRef.current = true;
      voiceSessionActiveRef.current = false;
      assistantSpeechActiveRef.current = false;
      wakeLoopIdRef.current += 1;
      applyWakeState("stopping");
      try {
        await VoiceWorkbench.stopWakeWord?.();
      } catch {
        // Best effort stop.
      }
      applyWakeState("idle");
      return;
    }

    if (normalizeProfile(profileRef.current).voiceInputEnabled !== true) {
      setVoiceError("请先在全局设置开启语音输入与唤醒。");
      return;
    }
    if (busy || !isProfileReady) return;

    wakeManuallyDisabledRef.current = false;
    startWakeMode();
  }

  async function toggleVoiceInput() {
    if (voiceState === "listening") {
      voiceSessionActiveRef.current = false;
      applyVoiceState("stopping");
      try {
        await VoiceWorkbench.stop();
      } catch {
        applyVoiceState("idle");
      }
      return;
    }

    if (normalizeProfile(profileRef.current).voiceInputEnabled !== true) {
      setVoiceError("请先在全局设置开启语音输入与唤醒。");
      return;
    }
    await startVoiceInput();
  }

  async function chooseCodexModel(message, choice) {
    if (busy || !message?.modelChoice) return;

    const serverId = activeServerIdRef.current;
    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    const agent = agents.find((item) => item.id === message.modelChoice.agentId) ?? activeAgent;
    const text = message.modelChoice.prompt;
    const choiceText = choice === "new" ? "试用 GPT-5.5" : "继续使用当前模型";

    setBusy(true);
    setRawOpen(false);
    updateAssistantMessage(message.id, {
      title: `已选择：${choiceText}`,
      body: "正在应用选择，并继续发送刚才的任务。",
      status: "running",
      modelChoice: undefined,
    });

    try {
      const choiceOutput = await runRemoteCommand(buildModelChoiceCommand(currentProfile, agent, choice), 1_048_576, 120);
      setRawOutput(String(choiceOutput || "").trim());
      await runAgentPrompt({ serverId, currentProfile, agent, text, assistantMessageId: message.id });
    } catch (error) {
      const detail = shortError(error);
      setRawOpen(true);
      setRawOutput(detail);
      updateAssistantMessage(message.id, {
        title: "模型选择失败",
        body: detail,
        status: "error",
        modelChoice: undefined,
      });
      setConnection({ state: "error", label: "选择失败", detail });
    } finally {
      setBusy(false);
    }
  }

  async function startCodexDeviceLogin(message) {
    if (busy || !message?.loginAction) return;

    const serverId = activeServerIdRef.current;
    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    const agent = agents.find((item) => item.id === message.loginAction.agentId) ?? activeAgent;

    setBusy(true);
    setRawOpen(false);
    updateAssistantMessage(message.id, {
      title: "正在生成登录码",
      body: "请稍等，正在向远端 Codex 请求设备登录码。",
      status: "running",
      loginAction: undefined,
      modelChoice: undefined,
    });

    try {
      const output = await runRemoteCommand(buildCodexLoginDeviceCommand(currentProfile, agent), 1_048_576, 120);
      setRawOutput(String(output || "").trim());
      updateAssistantMessage(message.id, {
        title: "完成 Codex 登录",
        body: "在浏览器打开链接并输入验证码。",
        output: extractCodexLoginInstructions(output),
        status: "done",
        loginAction: undefined,
        modelChoice: undefined,
      });
      setConnection({ state: "idle", label: "等待登录", detail: agent.shortName });
    } catch (error) {
      const detail = shortError(error);
      setRawOpen(true);
      setRawOutput(detail);
      updateAssistantMessage(message.id, {
        title: "生成登录码失败",
        body: detail,
        status: "error",
        loginAction: undefined,
        modelChoice: undefined,
      });
      setConnection({ state: "error", label: "登录失败", detail });
    } finally {
      setBusy(false);
    }
  }

  function updateAssistantMessage(id, patch) {
    setMessages((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function refreshOutput(targetMessage = null) {
    if (busy) return;
    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;
    const serverId = activeServerIdRef.current;
    const server = serverById(serverId);
    const hasExplicitTarget = Boolean(targetMessage?.id);
    const requestedAgentMessage =
      targetMessage?.backend === "agent" && targetMessage?.remoteTaskId
        ? (server?.messages || []).find(
            (message) =>
              message.id === targetMessage.id ||
              (message.remoteTaskId === targetMessage.remoteTaskId && message.role === "assistant"),
          ) || targetMessage
        : null;
    if (hasExplicitTarget && !requestedAgentMessage) {
      if (
        targetMessage?.backend === "agent" &&
        currentProfile.useWorkbenchAgent === true &&
        server?.conversationId &&
        !isWindowsProfile(currentProfile)
      ) {
        setBusy(true);
        try {
          const ok = await syncAgentConversationForServer(server, { showResult: true });
          if (ok) return;
        } finally {
          setBusy(false);
        }
      }
      const detail = "这条消息没有关联 Agent 后台任务 ID，App 不能继续查询远端状态。可以查看原始输出，或重新发送这条任务。";
      setConnection({
        state: "connected",
        label: "无法检查状态",
        detail: "缺少 Agent 任务 ID",
      });
      setRawOpen(true);
      setRawOutput(
        [targetMessage.title, targetMessage.body, targetMessage.output, targetMessage.liveOutput]
          .filter(Boolean)
          .join("\n\n"),
      );
      updateAssistantMessageInServer(serverId, targetMessage.id, {
        body: detail,
        resultMissing: true,
        remoteTaskCheckedAt: Date.now(),
        forceUpdate: true,
      });
      return;
    }
    const runningAgentMessage =
      requestedAgentMessage ||
      [...(server?.messages || [])]
        .reverse()
        .find(
          (message) =>
            message.backend === "agent" &&
            message.remoteTaskId &&
            (message.status === "running" || remoteResultNeedsSync(message)),
        );
    if (runningAgentMessage) {
      setBusy(true);
      try {
        await syncRemoteAgentMessage(serverId, runningAgentMessage);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (currentProfile.useWorkbenchAgent === true && server?.conversationId && !isWindowsProfile(currentProfile)) {
      setBusy(true);
      try {
        const ok = await syncAgentConversationForServer(server, { showResult: true });
        if (!ok) {
          setMessages((items) => [
            ...items,
            createMessage({
              role: "assistant",
              agentId: activeAgent.id,
              title: "消息列表拉取失败",
              body: "没有从 Agent 拿到可展示的消息列表。可以检查 Agent 状态，或重新连接后再试。",
              output: "",
              status: "error",
              backend: "agent",
              conversationId: server.conversationId,
            }),
          ]);
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    if (activeAgent.id === "claude") {
      setConnection({
        state: "connected",
        label: "无需刷新",
        detail: "Claude 会直接返回最终结果",
      });
      return;
    }

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommand(buildCaptureCommand(currentProfile, activeAgent), 2_097_152, 90);
      setRawOutput(output.trim());
      setMessages((items) => [
        ...items,
        createMessage({
          role: "assistant",
          agentId: activeAgent.id,
          title: `${activeAgent.shortName} 输出已刷新`,
          body: `已读取 ${activeAgent.shortName} 当前输出。`,
          output: cleanAgentOutput(output),
        }),
      ]);
    } catch (error) {
      setRawOutput(shortError(error));
    } finally {
      setBusy(false);
    }
  }

  async function interruptAgent() {
    const serverId = activeServerIdRef.current;
    const server = serverById(serverId);
    const currentProfile = withKnownPassword(server?.profile || profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    const runningMessage = [...(server?.messages || [])].reverse().find((message) => message.status === "running");
    const runningAgentMessage =
      runningMessage?.backend === "agent" && runningMessage.remoteTaskId ? runningMessage : null;
    const taskAgent = agentById(runningMessage?.agentId || server?.task?.agentId || currentProfile.agentId, activeAgent);

    if (busyRef.current && !runningMessage && !serverTaskRunning(server)) return;

    setBusy(true);
    setRawOpen(false);
    try {
      if (runningAgentMessage) {
        const targetAgent = agentById(runningAgentMessage.agentId || currentProfile.agentId, activeAgent);
        const output = await runRemoteCommandForProfile(
          currentProfile,
          buildWorkbenchAgentCancelCommand(currentProfile, runningAgentMessage.remoteTaskId),
          1_048_576,
          60,
        );
        const status = parseWorkbenchAgentOutput(output);
        const raw = status.output || status.raw || output;
        const failure = classifyAgentFailure(raw, targetAgent, status);
        const visibleOutput = visibleOutputForStoppedTask(raw, runningAgentMessage);
        const now = Date.now();
        setServerRawOutput(serverId, raw.trim());
        updateAssistantMessageInServer(serverId, runningAgentMessage.id, {
          title: failure?.title || `${targetAgent.shortName} 任务已取消`,
          body: failure?.body || (visibleOutput ? "任务已停止，下面保留停止前已经收到的内容。" : "Agent 后台任务已停止，输入框已释放。"),
          output: visibleOutput,
          liveOutput: "",
          status: "cancelled",
          backend: "agent",
          remoteTaskId: runningAgentMessage.remoteTaskId,
          agentId: targetAgent.id,
          agentFailure: undefined,
          technicalDetail: failure?.detail || cleanAgentFailureDetail(raw),
          cancelledAt: now,
          completedAt: now,
          forceUpdate: true,
        });
        setServerTask(serverId, {
          state: "idle",
          backend: "agent",
          remoteTaskId: runningAgentMessage.remoteTaskId,
          agentId: targetAgent.id,
          interruptedAt: now,
          finishedAt: now,
        });
        setServerConnection(serverId, {
          state: "idle",
          label: "已取消",
          detail: targetAgent.shortName,
          mode: "agent",
        });
        return;
      }

      const output = await runRemoteCommandForProfile(currentProfile, buildInterruptCommand(currentProfile, taskAgent), 1_048_576, 60);
      const raw = String(output || "").trim();
      const visibleOutput = visibleOutputForStoppedTask(raw, runningMessage);
      const now = Date.now();
      setServerRawOutput(serverId, raw);
      if (runningMessage) {
        updateAssistantMessageInServer(serverId, runningMessage.id, {
          title: `${taskAgent.shortName} 任务已停止`,
          body: visibleOutput ? "已发送停止指令，下面保留停止前已经收到的内容。" : "已发送停止指令，输入框已释放。",
          output: visibleOutput,
          liveOutput: "",
          status: "cancelled",
          backend: runningMessage.backend || "ssh",
          agentId: taskAgent.id,
          promptText: runningMessage.promptText || "",
          cancelledAt: now,
          completedAt: now,
          forceUpdate: true,
        });
      }
      setServerTask(serverId, {
        state: "idle",
        backend: runningMessage?.backend || "ssh",
        agentId: taskAgent.id,
        interruptedAt: now,
        finishedAt: now,
      });
      setServerConnection(serverId, {
        state: "idle",
        label: "已停止",
        detail: sessionName(currentProfile, taskAgent.id),
        mode: runningMessage?.backend === "agent" ? "agent" : "ssh",
      });
    } catch (error) {
      const message = shortError(error);
      setServerRawOutput(serverId, message);
      setServerConnection(serverId, {
        state: "error",
        label: "停止失败",
        detail: message,
        mode: runningAgentMessage ? "agent" : "ssh",
      });
    } finally {
      setBusy(false);
    }
  }

  async function killAgentSession() {
    if (busy) return;
    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommand(buildKillCommand(currentProfile, activeAgent), 512_000, 60);
      setRawOutput(output.trim());
      setConnection({
        state: "idle",
        label: "会话已关闭",
        detail: sessionName(currentProfile, activeAgent.id),
      });
    } catch (error) {
      setRawOutput(shortError(error));
    } finally {
      setBusy(false);
    }
  }

  async function clearProfile() {
    const currentId = editingServerId || activeServerIdRef.current;
    const remaining = servers.filter((server) => server.id !== currentId);

    if (remaining.length) {
      const nextActive = remaining[0];
      setServers(remaining);
      setActiveServerId(nextActive.id);
      activeServerIdRef.current = nextActive.id;
      setEditingServerId(nextActive.id);
      updateDraftProfile(nextActive.profile);
      profileRef.current = nextActive.profile;
      setSettingsOpen(false);
      setRawOpen(false);
      await saveWorkspace(remaining, nextActive.id);
      return;
    }

    const resetServer = createServerSession({ id: "default-server", name: "默认服务器", profile: defaultProfile });
    setServers([resetServer]);
    setActiveServerId(resetServer.id);
    activeServerIdRef.current = resetServer.id;
    setEditingServerId(resetServer.id);
    updateDraftProfile(defaultProfile);
    profileRef.current = defaultProfile;
    setSettingsOpen(false);
    setRawOpen(false);
    await saveWorkspace([resetServer], resetServer.id);
  }

  const bridge = desktopBridge();
  const platform = Capacitor.getPlatform();
  const nativeMobilePlatform = platform === "ios" || platform === "android";
  const desktopPreview =
    !bridge &&
    platform === "web" &&
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 1024px) and (hover: hover)").matches;

  useLayoutEffect(() => {
    if (!nativeMobilePlatform || typeof window === "undefined" || typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const body = document.body;
    let animationFrame = 0;
    let lastGeometry = "";
    root.classList.add("aiwb-native-viewport");
    body?.classList.add("aiwb-native-viewport");
    const updateViewportSize = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const keyboardFocused = root.classList.contains("aiwb-keyboard-focus");
        const layoutHeight = Math.round(window.innerHeight || viewport?.height || 0);
        const keyboardHeight = Math.round(viewport?.height || layoutHeight);
        const height = keyboardFocused ? Math.min(layoutHeight, keyboardHeight) : layoutHeight;
        const width = Math.round(window.innerWidth || viewport?.width || 0);
        const geometry = `${width}x${height}:${keyboardFocused ? "keyboard" : "normal"}`;
        if (geometry === lastGeometry) return;
        lastGeometry = geometry;

        if (height > 0) root.style.setProperty("--app-viewport-height", `${height}px`);
        if (width > 0) root.style.setProperty("--app-viewport-width", `${width}px`);
        if (width > 0) {
          const nextClass = width >= 768 ? "tablet" : "phone";
          setNativeDeviceClass((current) => (current === nextClass ? current : nextClass));
        }
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      });
    };

    updateViewportSize();
    window.visualViewport?.addEventListener("resize", updateViewportSize);
    window.addEventListener("resize", updateViewportSize);
    window.addEventListener("orientationchange", updateViewportSize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.visualViewport?.removeEventListener("resize", updateViewportSize);
      window.removeEventListener("resize", updateViewportSize);
      window.removeEventListener("orientationchange", updateViewportSize);
      root.style.removeProperty("--app-viewport-height");
      root.style.removeProperty("--app-viewport-width");
      root.classList.remove("aiwb-native-viewport");
      body?.classList.remove("aiwb-native-viewport");
    };
  }, [nativeMobilePlatform]);

  const shellClassName = `app-shell ${bridge?.platform === "mac" || desktopPreview ? "mac-shell" : ""} ${
    sidebarCollapsed ? "sidebar-collapsed" : ""
  } ${desktopWindowContext.detachedChat ? "detached-chat-window" : ""}`;
  const appearanceMode = normalizeAppearanceMode(profile.appearanceMode);
  const resolvedTheme = appearanceMode === "system" ? (systemDarkMode ? "dark" : "light") : appearanceMode;
  const activeServerIndex = servers.findIndex((server) => server.id === activeServerId);
  const activeSessionName = serverSessionName(activeServer, activeServerIndex >= 0 ? activeServerIndex : 0);
  const activeConnectionMode = connectionModeForServer(activeServer, connection);
  const discoveryDirectoryCount = Array.isArray(discovery?.directories) ? discovery.directories.length : 0;
  const workspacePickerOpen = messages.length === 0 && discovery?.state === "done" && discoveryDirectoryCount > 0;
  const shouldShowDiscovery =
    Boolean(discovery) &&
    (workspacePickerOpen || discovery?.state === "scanning" || discovery?.state === "error");
  const showConnectionSummary =
    messages.length === 0 &&
    (!isProfileReady || !hasSelectedWorkdir || workspacePickerOpen || discovery?.state === "scanning" || discovery?.state === "error");
  const conversationClassName = [
    "conversation",
    showConnectionSummary ? "setup-conversation" : "",
    shouldShowDiscovery ? "with-discovery" : "",
    workspacePickerOpen ? "workspace-picker-open" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const showComposer = !workspacePickerOpen;
  const downloadingFilePath = fileDownload?.state === "loading" && fileDownload?.action !== "delete" ? fileDownload.path : "";
  const deletingFilePath = fileDownload?.state === "loading" && fileDownload?.action === "delete" ? fileDownload.path : "";
  const nativeMobile = platform === "ios" || platform === "android";
  const shellProps = {
    components: shellComponents,
    shellClassName,
    resolvedTheme,
    appearanceMode,
    platform,
    desktopPreview,
    detachedChatMode: desktopWindowContext.detachedChat,
    activeSessionName,
    activeConnectionMode,
    servers,
    activeServer,
    activeServerId,
    profile,
    connection,
    diagnostics,
    discovery,
    mobileNavOpen,
    setMobileNavOpen,
    sidebarCollapsed,
    onToggleSidebar: () => setSidebarCollapsed((value) => !value),
    busy,
    rawOpen,
    rawOutput,
    activeAgent,
    activeBusy,
    activeTaskRunning,
    activeRunningMessage,
    hasPendingAction,
    isProfileReady,
    mainAIReady: mainAIRouterReady(profile),
    composer,
    imageAttachments,
    voiceState,
    voiceError,
    voiceLevel,
    wakeState,
    wakeError,
    wakePhrases: wakePhrasesForProfile(profile),
    messages,
    conversationClassName,
    conversationScrollRef,
    handleConversationScroll,
    showConnectionSummary,
    shouldShowDiscovery,
    workspacePickerOpen,
    showComposer,
    downloadingFilePath,
    deletingFilePath,
    deletedRemoteFilePaths,
    fileDownload,
    taskNotice,
    settingsOpen,
    settingsDiscovery,
    settingsAgentTab,
    settingsSelectedSessions,
    editingServerId,
    draftProfile,
    filePreview,
    remoteDownloadOpen,
    onSelectServer: selectServer,
    onOpenChatWindow: openDetachedChatWindow,
    onConfigureServer: openServerSettings,
    onAddServer: openNewServerSettings,
    onDuplicateServer: () => duplicateServer(),
    onOpenGlobalSettings: openGlobalSettings,
    onTestConnection: connectExistingSession,
    onDisconnectServer: disconnectSession,
    onRefreshOutput: refreshOutput,
    onScanDiscovery: testConnection,
    onAddWorkdir: addDiscoveredWorkdir,
    onModelChoice: chooseCodexModel,
    onCodexLogin: startCodexDeviceLogin,
    onPreviewFile: openRemoteFilePreview,
    onDownloadFile: downloadRemoteFile,
    onDeleteFile: deleteRemoteFile,
    onOpenRemoteDownload: () => setRemoteDownloadOpen(true),
    onCloseRemoteDownload: () => setRemoteDownloadOpen(false),
    onInterruptAgent: interruptAgent,
    onMarkStuck: markRunningMessageStuck,
    onRetryMessage: retryAgentFailureMessage,
    onShowDetails: showAgentFailureDetails,
    onOpenSettingsFromMessage: openActiveServerSettingsFromMessage,
    setComposer,
    onAttachFiles: addImageAttachments,
    onAttachImages: addImageAttachments,
    onPasteClipboard: pasteClipboardAttachments,
    onRemoveImageAttachment: removeImageAttachment,
    onSend: sendTask,
    onVoice: toggleVoiceInput,
    onWake: toggleWakeWord,
    onReleaseRunningTask: releaseActiveRunningTask,
    onCancelRunningTask: interruptAgent,
    onToggleRaw: () => setRawOpen((value) => !value),
    onKillAgentSession: killAgentSession,
    onOpenTaskNotice: async () => {
      if (taskNotice?.serverId) await selectServer(taskNotice.serverId);
      setTaskNotice(null);
    },
    onCloseTaskNotice: () => setTaskNotice(null),
    onCloseSettings: () => setSettingsOpen(false),
    onScanSettings: () => scanSettingsProfile(),
    onAddSelectedSessions: addSelectedSessionsFromSettings,
    onSaveSettings: editingServerId === "global" ? saveGlobalSettings : saveSessionSettings,
    onDeleteProfile: clearProfile,
    onDuplicateEditingServer: editingServerId && editingServerId !== "global" ? () => duplicateServer(editingServerId) : undefined,
    onOpenTerminal: editingServerId && editingServerId !== "global" ? () => openSshTerminal() : undefined,
    agentManagementTargetId,
    onInstallAgent: installWorkbenchAgentForServer,
    onRefreshAgent: (serverId) => refreshAgentHealthForServer(serverId, "manual"),
    onOpenAgentSettings: (serverId) => openGlobalSettings(serverId),
    onInstallWsl: installWslForDraftProfile,
    onInstallGit: editingServerId && editingServerId !== "global" ? installGitForEditingServer : undefined,
    onGitDownload: editingServerId && editingServerId !== "global" ? runGitDownloadForEditingServer : undefined,
    onExportConfig: exportWorkspaceConfig,
    onExportLogs: exportDiagnosticsLogs,
    onImportConfig: importWorkspaceConfig,
    setDraftProfile: updateDraftProfile,
    setSettingsAgentTab,
    setSettingsSelectedSessions,
    onCloseFilePreview: () => setFilePreview(null),
  };

  return { nativeMobile, platform, nativeDeviceClass, shellProps };
}
