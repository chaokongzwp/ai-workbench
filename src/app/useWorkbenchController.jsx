import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import * as Core from "../core/workbenchCore.js";
import {
  agentPreferredForProfile,
  dedupeRemoteTaskMessages,
  dedupeServerRemoteTaskMessages,
  isMessageListDiagnostic,
  lastRecoverableAgentResponse,
  messageTextKey,
  reconcileServerMessageLifecycle,
} from "./controllerMessageLifecycle.js";
import { shellComponents } from "./shellComponents.jsx";
import {
  createIosTaskPushTicket,
  disableIosPushNotifications,
  ensureIosPushRegistration,
  iosPushSupported,
} from "../core/iosPushNotifications.js";
import { reorderSessionsById, sortSessions } from "../core/sessionOrder.js";
import { assertSessionDispatch } from "../core/session.js";
import { patchSession, patchSessionsMatchingConnection, sessionById } from "../core/sessionStore.js";
import { patchMessage } from "../core/messageStore.js";
import { canonicalConnectionState } from "../core/connectionState.js";
import {
  sessionAttachmentDraft,
  switchSessionAttachmentDraft,
  updateSessionAttachmentDraft,
} from "../core/composerState.js";
import {
  agentCanContinueAfterUpgradeFailure,
  agentTaskSubmissionReady,
  agentTaskSubmissionTransport,
  agentTaskMatchesInterruptedSubmission,
  trustedAgentPlatform,
} from "../core/agentStartup.js";
import {
  mergePendingWorkspaceMutations,
  rebaseWorkspaceProfile,
  workspaceProfileEffectiveRevision,
} from "../core/workspaceProfileMerge.js";

function nativeDeviceClassForRuntime(platform = Capacitor.getPlatform()) {
  if (typeof window === "undefined") return "phone";

  if (platform === "ios") {
    const userAgent = String(globalThis.navigator?.userAgent || "");
    const navigatorPlatform = String(globalThis.navigator?.platform || "");
    const touchPoints = Number(globalThis.navigator?.maxTouchPoints || 0);
    const screenWidth = Number(globalThis.screen?.width || 0);
    const screenHeight = Number(globalThis.screen?.height || 0);
    const ipadRuntime =
      /iPad/i.test(userAgent) ||
      (navigatorPlatform === "MacIntel" && touchPoints > 1) ||
      Math.min(screenWidth, screenHeight) >= 768;
    return ipadRuntime ? "tablet" : "phone";
  }

  return window.innerWidth >= 768 ? "tablet" : "phone";
}

const {
  SSHWorkbench,
  VoiceWorkbench,
  agentById,
  agentCommand,
  agentDirectConfig,
  agentUploadAttachmentReady,
  createAgentDirectEventStream,
  agentDirectRequest,
  agentDirectUpload,
  agentDirectTaskRequest,
  agentDirectTaskStatusSnapshot,
  cancelAgentDirectUpload,
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
  buildAgentTaskCommand,
  buildClaudePrintCommand,
  buildCodexExecCommand,
  buildCodexLoginDeviceCommand,
  buildDiscoveryCommand,
  buildToolLoginStartCommand,
  buildToolLoginSubmitCommand,
  buildToolLoginStatusCommand,
  buildGitDownloadCommand,
  buildGitSshKeyCommand,
  buildHealthCommand,
  buildInstallGitCommand,
  buildInstallCliCommand,
  buildInstallWslCommand,
  buildInstallWorkbenchAgentCommand,
  buildUninstallWorkbenchAgentCommand,
  buildMainAIRouteRequest,
  buildModelChoiceCommand,
  buildRemoteFileDeleteCommand,
  buildRemoteFileReadCommand,
  buildRemoteDirectoryListCommand,
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
  buildWorkbenchAgentDirectConfigCommand,
  buildWorkbenchAgentStatusCommand,
  buildWorkbenchAgentTaskListCommand,
  buildWorkbenchAgentWaitTaskCommand,
  buildCloudSyncPlainPayload,
  buildWorkspaceMigrationPayload,
  builtInAliyunVoiceConfig,
  chineseNumber,
  classifyAgentFailure,
  clearBrowserDiagnosticLogs,
  cloudSyncDefaultEndpoint,
  cloudSyncSessionKeyForServer,
  claudeSetupAutomationSnippet,
  cleanAgentFailureDetail,
  cleanAgentOutput,
  cleanBase64Payload,
  clipPersistedText,
  codeFileExtensions,
  commandDiagnosticPayload,
  commandName,
  compactMessageForRouter,
  connectionForAppLaunch,
  connectionIsLive,
  connectionModeForServer,
  connectionModeFromHealth,
  conversationBottomThreshold,
  conversationRevealReady,
  createCloudSessionShare,
  createConversationId,
  createConversationRevealRequest,
  createMessage,
  createRemoteTaskId,
  createServerId,
  createServerSession,
  currentResultPlaybackPhrases,
  defaultProfile,
  defaultWakeWordPhrases,
  desktopBridge,
  detectAgentIssue,
  deleteCloudConfigSync,
  directoryPrefKey,
  directoryPrefsStorageKey,
  directoryUsageBadge,
  dirnameRemote,
  dirnameWindows,
  decryptCloudSyncPayload,
  discoverySeedWorkdir,
  displayMarker,
  displayMarkers,
  dormantConnectionForProfile,
  encryptCloudSyncPayload,
  extractAgentFinalOutput,
  extractCodexLoginInstructions,
  extractMarkedFinalOutput,
  extractRemoteFileReferences,
  extractResponseText,
  extractWorkbenchResponse,
  fallbackFinalOutput,
  fetchCloudConfigSync,
  fetchCloudSessionShares,
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
  isPendingAgentResponse,
  isSensitiveDiagnosticKey,
  isSpeechStopPhrase,
  isRetryableSshConnectionError,
  isSshStaleConnectionError,
  isSshTransportUnavailableError,
  isTransientSshSyncError,
  isUrlLikeFileCandidate,
  isWindowsProfile,
  isWslProfile,
  joinRemotePath,
  joinWindowsPath,
  lastSpeakableMessageForServer,
  lastActiveTaskMessage,
  latestWorkbenchAgentConversationTask,
  latestServerMessageSummary,
  latestWorkbenchAgentVersion,
  legacyDefaultWakeWordPhrases,
  legacyDefaultWorkdirs,
  loginCloudConfigSync,
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
  maxSshReconnectAttempts,
  mergeAgentConversationsIntoDiscovery,
  mergeCloudSharedSessions,
  mergeCloudDownloadedServers,
  mergeCloudSyncPayloads,
  mergeDirectoryPrefs,
  mergeImportedServers,
  mergeLocalMessageHistory,
  mergeManualWorkdirHistory,
  messageClientTimestamp,
  messageFontFamilyCss,
  messagesForStorage,
  migrationFileKind,
  migrationFileName,
  migrationFileVersion,
  normalizeAppearanceMode,
  normalizeDirectoryPrefs,
  normalizeDiscovery,
  normalizeMainAIRoute,
  normalizeMessageLifecycle,
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
  parseRemoteDirectoryPayload,
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
  agentInstallationKey,
  profileHostCandidates,
  profileIssue,
  profileReady,
  profileWithDetectedTools,
  psQuote,
  putCloudConfigSync,
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
  runWithSshReconnect,
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
  sessionName,
  sessionShareFromServer,
  sessionSelectionKey,
  shQuote,
  sshEndpointKey,
  shortError,
  sleep,
  scrollConversationContainerToBottom,
  revealConversationMessage,
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
  taskStateFromRemoteStatus,
  taskStateForMessage,
  taskStateForUpdate,
  taskStateIsActive,
  taskStateIsTerminal,
  taskStateAccepted,
  taskStateCancelled,
  taskStateFailed,
  taskStateRunning,
  taskStateSubmitting,
  taskStateSucceeded,
  taskStateSyncing,
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
  withInteractiveSshConnectTimeout,
  workbenchAgentAvailableFromOutput,
  workbenchAgentScript,
  workbenchAgentVersionNumber,
  workbenchAgentProtocolSupports,
  workbenchAgentTaskCreateMode,
  workdirDisplayName,
  wslDistroFromProfile,
  workspaceDiagnosticSummary,
  workspaceMirrorStorageKey,
  workspaceStoreVersion,
  workspaceStoreHasServers
} = Core;

const agentSynchronousWaitTimeoutMs = 2 * 60 * 60 * 1000;
const agentSynchronousPollInitialDelayMs = 900;
const agentSynchronousPollIntervalMs = 15_000;
const agentLongPollTimeoutSeconds = 55;
const nativeCommandTimeoutGraceMs = 20_000;
const sendClickDebounceMs = 900;

function commandClientTimeoutMs(commandTimeoutSeconds) {
  const seconds = Number(commandTimeoutSeconds);
  const safeSeconds = Number.isFinite(seconds) ? Math.max(5, seconds) : 180;
  return Math.max(10_000, safeSeconds * 1000 + nativeCommandTimeoutGraceMs);
}

function createClientCommandTimeoutError(commandTimeoutSeconds) {
  const seconds = Math.round(commandClientTimeoutMs(commandTimeoutSeconds) / 1000);
  const error = new Error(
    `SSH command timed out after ${seconds}s while waiting for App command callback. 远端任务可能仍在服务器后台运行，App 会保留任务并继续同步。`,
  );
  error.code = "AIWB_CLIENT_COMMAND_TIMEOUT";
  return error;
}

function nativeSshSessionPayload(profile, sessionId) {
  const current = normalizeProfile(profile);
  return {
    sessionId,
    host: current.host,
    port: current.port,
    username: current.username,
    password: current.password,
    sshHostKeyFingerprint: current.sshHostKeyFingerprint,
    connectTimeoutSeconds: current.connectTimeoutSeconds,
  };
}

async function runNativeCommandWithClientTimeout(payload, commandTimeoutSeconds) {
  let timer = null;
  try {
    return await Promise.race([
      SSHWorkbench.runCommand(payload),
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(createClientCommandTimeoutError(commandTimeoutSeconds)), commandClientTimeoutMs(commandTimeoutSeconds));
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

function retryableSshConnectionError(error) {
  const detail = String(error?.message || error || "");
  return /ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|no route to host|connection refused|connection timed out|connection lost before handshake/i.test(
    detail,
  );
}

function orderedHostCandidates(profile, preferredHost = "") {
  const candidates = profileHostCandidates(profile);
  const preferred = String(preferredHost || "").trim();
  if (!preferred) return candidates;
  return [preferred, ...candidates.filter((host) => host.toLocaleLowerCase() !== preferred.toLocaleLowerCase())];
}

function hapticKindForNoticeTone(tone) {
  if (tone === "error") return "error";
  if (tone === "done" || tone === "success") return "success";
  if (tone === "warning") return "warning";
  return "light";
}

function triggerInteractionFeedback(kind = "light") {
  try {
    const maybePromise = SSHWorkbench.haptic?.({ kind });
    if (maybePromise && typeof maybePromise.catch === "function") maybePromise.catch(() => {});
  } catch {
    // Feedback must never block the actual action.
  }
}

function normalizeRemoteCommandOutput(result) {
  const stdout = String(result?.stdout ?? "");
  const marker = stdout.match(/__AIWB_SCRIPT_EXIT_CODE__(\d+)/);
  if (!marker) return stdout;

  const exitCode = Number(marker[1]);
  const detail = stdout.replace(marker[0], "").trim();
  if (exitCode !== 0) {
    const readable = detail.slice(-4000);
    throw new Error(
      `远端 PowerShell 执行失败（退出码 ${exitCode}）。${readable ? `\n${readable}` : "请查看诊断日志。"}`,
    );
  }
  return detail;
}

function readableGitOperationError(output) {
  const text = String(output || "").trim();
  const detailMatch = text.match(/__AIWB_GIT_OPERATION_DETAIL_B64__([^\r\n]+)/i);
  let detail = "";
  if (detailMatch?.[1]) {
    try {
      detail = atob(detailMatch[1]).trim();
    } catch {
      detail = "";
    }
  }
  const diagnosticText = `${detail}\n${text}`;
  const explicitMarker = text.match(/__AIWB_GIT_OPERATION_ERROR__([^\r\n<]*)/i)?.[1]?.trim();

  if (/Could not resolve hostname\s+github\.com|Name or service not known|Temporary failure in name resolution/i.test(diagnosticText)) {
    return "远端机器无法解析 github.com（DNS 不可用），因此无法连接 GitHub。请先恢复这台机器的网络或 DNS 后重试。";
  }
  if (/Permission denied\s*\(publickey\)|Could not read from remote repository/i.test(diagnosticText)) {
    return "远端机器没有通过 GitHub SSH 认证。请为远端账号配置可访问该仓库的 SSH Key，或改用具备访问权限的 HTTPS 仓库地址。";
  }
  if (/Repository not found|repository .* not found/i.test(diagnosticText)) {
    return "GitHub 没有找到该仓库，或当前远端账号没有访问权限。请检查仓库地址和仓库权限。";
  }
  if (/Remote branch .* not found|couldn't find remote ref|pathspec .* did not match/i.test(diagnosticText)) {
    return "填写的 Git 分支不存在。请清空分支使用默认分支，或填写仓库中真实存在的分支。";
  }
  if (/already exists and is not an empty directory/i.test(diagnosticText)) {
    return "保存目录已经存在且不为空。请选择空目录，或更换保存目录。";
  }
  if (/路径的形式不合法|CreateDirectoryArgumentError|The filename, directory name, or volume label syntax is incorrect/i.test(diagnosticText)) {
    return "Windows 保存目录格式不正确，或磁盘根目录无法访问。请检查盘符和完整保存路径。";
  }

  if (explicitMarker) {
    return detail ? `${explicitMarker}\n\nGit 输出：\n${detail}` : explicitMarker;
  }

  return "Git 操作没有通过远端落盘验证。远端没有生成可用仓库，请检查仓库地址、网络权限和保存目录。";
}

function wslProfileFromWindowsProfile(profile, distro = "") {
  const normalized = normalizeProfile(profile);
  const workdir = String(normalized.workdir || "").trim();
  const windowsPath = /^[A-Za-z]:[\\/]/.test(workdir) || /^\\\\/.test(workdir);
  return normalizeProfile({
    ...normalized,
    platform: "wsl",
    wslDistro: String(distro || normalized.wslDistro || "").trim(),
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

export function useWorkbenchController() {
  const emptyActiveServer = useMemo(
    () => ({
      id: "",
      conversationId: "",
      name: "",
      profile: defaultProfile,
      connection: initialConnectionForProfile(defaultProfile),
      diagnostics: {},
      discovery: null,
      rawOutput: "",
      messages: [],
      task: {},
      unreadResult: null,
      shared: null,
      agentHistoryCursor: "",
      agentHistoryHasMore: true,
    }),
    [],
  );
  const desktopWindowContext = useMemo(() => {
    if (typeof window === "undefined") return { detachedChat: false, serverId: "" };
    const params = new URLSearchParams(window.location.search);
    return {
      detachedChat: params.get("window") === "chat",
      serverId: String(params.get("serverId") || "").trim(),
    };
  }, []);
  const [servers, setServers] = useState([]);
  const [activeServerId, setActiveServerId] = useState("");
  const [draftProfile, setDraftProfile] = useState(defaultProfile);
  const [editingServerId, setEditingServerId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialPage, setSettingsInitialPage] = useState("root");
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
  const [remoteDirectoryOpen, setRemoteDirectoryOpen] = useState(false);
  const [remoteDirectory, setRemoteDirectory] = useState(null);
  const [activeAgentId, setActiveAgentId] = useState("codex");
  const [composer, setComposerState] = useState("");
  const [imageAttachments, setImageAttachments] = useState([]);
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceError, setVoiceError] = useState("");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [wakeState, setWakeState] = useState("idle");
  const [wakeError, setWakeError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendConnectingServerId, setSendConnectingServerId] = useState("");
  const [taskNotice, setTaskNotice] = useState(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [systemDarkMode, setSystemDarkMode] = useState(false);
  const [nativeDeviceClass, setNativeDeviceClass] = useState(() => nativeDeviceClassForRuntime());

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || servers[0] || emptyActiveServer,
    [activeServerId, emptyActiveServer, servers],
  );
  const profile = activeServer.profile;
  const activeAgent = useMemo(() => agentById(normalizeProfile(profile).agentId, agents[0]), [profile]);
  const connection = activeServer.connection;
  const diagnostics = activeServer.diagnostics;
  const discovery = activeServer.discovery;
  const rawOutput = activeServer.rawOutput;
  const messages = activeServer.messages;
  const activeRunningMessage = useMemo(() => lastActiveTaskMessage(activeServer.messages || []), [activeServer.messages]);
  const activeTaskNotice = useMemo(
    () => (taskNotice && (!taskNotice.serverId || taskNotice.serverId === activeServerId) ? taskNotice : null),
    [activeServerId, taskNotice],
  );
  const activeTaskRunning = Boolean(activeRunningMessage);
  const activeBusy = busy || activeTaskRunning;
  const isProfileReady = useMemo(() => profileReady(profile), [profile]);
  const voiceInputEnabled = profile.voiceInputEnabled === true;
  const hasSelectedWorkdir = Boolean(String(profile.workdir || "").trim());
  const wakePhraseSignature = useMemo(
    () => wakeContextForServers(servers, activeServerId, profile).phrases.join("\n"),
    [activeServerId, profile, servers],
  );
  const agentEventStreamSignature = useMemo(() => {
    const values = new Map();
    for (const server of servers) {
      if (server.id !== activeServerId && !lastIncompleteAgentResponse(server)) continue;
      const normalized = normalizeProfile(server.profile);
      const direct = agentDirectConfig(normalized);
      if (!direct.enabled) continue;
      const connectionKey = agentInstallationKey(normalized);
      values.set(connectionKey, [connectionKey, direct.endpoint, direct.accessToken, direct.tlsFingerprint]);
    }
    return JSON.stringify([...values.values()].sort((left, right) => left[0].localeCompare(right[0])));
  }, [activeServerId, servers]);
  const hasPendingAction = messages.some((message) => Boolean(message.requiredAction));
  const profileRef = useRef(profile);
  const draftProfileRef = useRef(draftProfile);
  const settingsOpenRef = useRef(settingsOpen);
  const editingServerIdRef = useRef(editingServerId);
  const serversRef = useRef([]);
  const activeServerIdRef = useRef(activeServerId);
  const primaryActiveServerIdRef = useRef("");
  const composerRef = useRef(composer);
  const composerDraftsRef = useRef(new Map());
  const composerServerIdRef = useRef("");
  const imageAttachmentsRef = useRef(imageAttachments);
  const attachmentDraftsRef = useRef(new Map());
  const attachmentServerIdRef = useRef("");
  const voiceBaseTextRef = useRef("");
  const voiceRecognitionSessionIdRef = useRef("");
  const voiceStateRef = useRef(voiceState);
  const wakeStateRef = useRef(wakeState);
  const wakeEnabledRef = useRef(false);
  const wakeLoopIdRef = useRef(0);
  const wakeListeningSignatureRef = useRef("");
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
  const workspacePendingSaveRef = useRef(null);
  const workspaceRevisionRef = useRef(0);
  const workspaceAppliedServersRef = useRef([]);
  const workspaceAuthoritativeProfileRef = useRef(null);

  // Composer drafts deliberately stay in memory only: they belong to one open session, not its saved configuration.
  function setComposer(nextValue) {
    const currentValue = composerRef.current;
    const nextText = typeof nextValue === "function" ? nextValue(currentValue) : nextValue;
    const normalized = String(nextText ?? "");
    const serverId = activeServerIdRef.current;
    if (serverId) composerDraftsRef.current.set(serverId, normalized);
    composerRef.current = normalized;
    setComposerState(normalized);
  }
  const applyingExternalProfileRef = useRef(false);
  const noticeQueueRef = useRef([]);
  const noticeSpeakingRef = useRef(false);
  const persistentNoticeKeysRef = useRef(new Set());
  const syncingAgentTasksRef = useRef(new Set());
  const syncingAgentConversationsRef = useRef(new Set());
  const syncingAgentSweepRef = useRef(false);
  const loadingAgentHistoryRef = useRef(new Set());
  const sendingServerIdsRef = useRef(new Set());
  const cancelledUploadBootstrapServerIdsRef = useRef(new Set());
  const activeUploadByServerRef = useRef(new Map());
  const lastSendClickAtRef = useRef(0);
  const startupAgentSyncNoticeRef = useRef(new Set());
  const agentHealthRefreshKeysRef = useRef(new Set());
  const agentHealthInFlightConnectionsRef = useRef(new Set());
  const agentSetupPromisesRef = useRef(new Map());
  const sessionConnectionPromisesRef = useRef(new Map());
  const startupSessionReconnectRef = useRef("");
  const manualDisconnectSessionIdsRef = useRef(new Set());
  const sshHostKeyApprovalRequiredSessionIdsRef = useRef(new Set());
  const agentConnectionPollAtRef = useRef(new Map());
  const agentEventStreamStateRef = useRef(new Map());
  const agentRouteProbeByConnectionRef = useRef(new Map());
  const agentConversationAutoSyncAtRef = useRef(new Map());
  const agentConversationSyncFailedAtRef = useRef(new Map());
  const preferredHostByConnectionRef = useRef(new Map());
  const conversationScrollRef = useRef(null);
  const conversationStickToBottomRef = useRef(true);
  const conversationRevealRequestRef = useRef(null);
  const conversationScrollStateRef = useRef({
    activeServerId: "",
    messageCount: 0,
    lastMessageId: "",
  });

  function updateDraftProfile(nextProfile) {
    const current = draftProfileRef.current;
    const resolved = typeof nextProfile === "function" ? nextProfile(current) : nextProfile;
    draftProfileRef.current = resolved;
    setDraftProfile(resolved);
  }

  function followActiveSessionInSettings(server) {
    if (settingsOpenRef.current) return false;
    const nextServerId = server?.id || "";
    setEditingServerId(nextServerId);
    editingServerIdRef.current = nextServerId;
    updateDraftProfile(server?.profile || defaultProfile);
    return true;
  }

  // Connection probes complete asynchronously. While a settings form is open,
  // its local draft wins over a late probe so typed fields are never replaced
  // with the server's previously saved profile.
  function updateDraftProfileFromSession(serverId, nextProfile) {
    if (settingsOpenRef.current && editingServerIdRef.current === serverId) return false;
    updateDraftProfile(nextProfile);
    return true;
  }

  async function runCommandWithHostFallback(currentProfile, sessionId, commandPayload, maxResponseSize, commandTimeoutSeconds) {
    const connectionKey = sshEndpointKey(currentProfile);
    const preferredHost = preferredHostByConnectionRef.current.get(connectionKey);
    const hosts = orderedHostCandidates(currentProfile, preferredHost);
    let lastError = null;

    for (let index = 0; index < hosts.length; index += 1) {
      const host = hosts[index];
      try {
        const result = await runNativeCommandWithClientTimeout(
          {
            sessionId,
            host,
            port: currentProfile.port,
            username: currentProfile.username,
            password: currentProfile.password,
            sshHostKeyFingerprint: currentProfile.sshHostKeyFingerprint,
            connectTimeoutSeconds: currentProfile.connectTimeoutSeconds,
            commandTimeoutSeconds,
            ...commandPayload,
            maxResponseSize,
          },
          commandTimeoutSeconds,
        );
        preferredHostByConnectionRef.current.set(connectionKey, host);
        return { result, host, fallbackUsed: index > 0 };
      } catch (error) {
        lastError = error;
        if (!retryableSshConnectionError(error) || index === hosts.length - 1) throw error;
        void appLog("warn", "ssh.command.host_fallback", {
          sessionId,
          failedHost: host,
          nextHost: hosts[index + 1],
          error: shortError(error),
        });
      }
    }

    throw lastError || new Error("无法连接到任何服务器地址。");
  }

  function revokeImagePreviews(attachments = []) {
    attachments.forEach((attachment) => {
      const url = String(attachment?.previewUrl || "");
      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
      const nativeAttachmentId = String(attachment?.nativeAttachmentId || "").trim();
      if (nativeAttachmentId && Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform()) {
        void SSHWorkbench.releaseAttachment({ nativeAttachmentId }).catch(() => {});
      }
    });
  }

  function updateImageAttachmentsForSession(serverId, updater) {
    const sessionId = String(serverId || "").trim();
    if (!sessionId) return [];
    if (attachmentServerIdRef.current === sessionId) {
      attachmentDraftsRef.current.set(sessionId, imageAttachmentsRef.current);
    }
    const nextItems = updateSessionAttachmentDraft(attachmentDraftsRef.current, sessionId, updater);
    if (attachmentServerIdRef.current === sessionId) {
      imageAttachmentsRef.current = nextItems;
      setImageAttachments(nextItems);
    }
    return nextItems;
  }

  function removeUploadedImageAttachments(uploadedAttachments = [], serverId = attachmentServerIdRef.current) {
    const uploadedIds = new Set(uploadedAttachments.map((item) => String(item?.id || "")).filter(Boolean));
    const uploadedItems = new Set(uploadedAttachments);
    updateImageAttachmentsForSession(serverId, (items) => {
      const removed = items.filter(
        (item) => uploadedItems.has(item) || (item?.id && uploadedIds.has(String(item.id))),
      );
      if (!removed.length) return items;
      revokeImagePreviews(removed);
      return items.filter((item) => !removed.includes(item));
    });
  }

  function removeImageAttachment(id) {
    updateImageAttachmentsForSession(attachmentServerIdRef.current || activeServerIdRef.current, (items) => {
      const removed = items.filter((item) => item.id === id);
      revokeImagePreviews(removed);
      return items.filter((item) => item.id !== id);
    });
  }

  async function addImageAttachments(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    const serverId = activeServerIdRef.current;
    try {
      const nextItems = await Promise.all(list.map((file) => fileToImageAttachment(file)));
      updateImageAttachmentsForSession(serverId, (items) => {
        const combined = [...items, ...nextItems].slice(-10);
        const dropped = [...items, ...nextItems].slice(0, Math.max(0, items.length + nextItems.length - 10));
        revokeImagePreviews(dropped);
        return combined;
      });
      setVoiceError("");
    } catch (error) {
      setVoiceError(shortError(error));
    }
  }

  async function pickNativeAttachments() {
    if (Capacitor.getPlatform() !== "ios" || !Capacitor.isNativePlatform()) return false;
    const serverId = activeServerIdRef.current;
    try {
      const result = await SSHWorkbench.pickAttachments({ maxCount: 10, maxBytes: 20 * 1024 * 1024 });
      const nextItems = Array.from(result?.attachments || [])
        .filter((item) => String(item?.nativeAttachmentId || "").trim())
        .map((item) => {
          const mime = String(item.mime || "application/octet-stream");
          const previewMime = String(item.previewMime || "image/jpeg");
          const previewBase64 = cleanBase64Payload(item.previewBase64);
          return {
            id: item.id || `native-file-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            nativeAttachmentId: String(item.nativeAttachmentId),
            name: item.name || "附件",
            mime,
            size: Number(item.size || 0),
            base64: "",
            isImage: item.isImage === true || mime.startsWith("image/"),
            previewUrl: previewBase64 ? `data:${previewMime};base64,${previewBase64}` : "",
          };
        });
      if (nextItems.length) {
        updateImageAttachmentsForSession(serverId, (items) => {
          const combined = [...items, ...nextItems];
          const dropped = combined.slice(0, Math.max(0, combined.length - 10));
          revokeImagePreviews(dropped);
          return combined.slice(-10);
        });
        setVoiceError("");
      }
    } catch (error) {
      setVoiceError(shortError(error));
    }
    return true;
  }

  function addPreparedAttachments(attachments = [], serverId = activeServerIdRef.current) {
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

    updateImageAttachmentsForSession(serverId, (items) => {
      const combined = [...items, ...nextItems].slice(-10);
      const dropped = [...items, ...nextItems].slice(0, Math.max(0, items.length + nextItems.length - 10));
      revokeImagePreviews(dropped);
      return combined;
    });
    setVoiceError("");
    return true;
  }

  async function pasteClipboardAttachments() {
    const bridge = desktopBridge();
    if (!bridge?.readClipboardAttachments) return false;
    const serverId = activeServerIdRef.current;
    try {
      const result = await bridge.readClipboardAttachments();
      return addPreparedAttachments(result?.attachments || [], serverId);
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
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    editingServerIdRef.current = editingServerId;
  }, [editingServerId]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!workspaceLoaded || !iosPushSupported()) return undefined;
    let cancelled = false;
    const enabled = normalizeProfile(profile).taskPushNotificationsEnabled === true;
    const operation = enabled
      ? ensureIosPushRegistration({
          endpoint: cloudSyncDefaultEndpoint,
          requestPermission: true,
        })
      : disableIosPushNotifications();
    Promise.resolve(operation).catch((error) => {
      if (cancelled) return;
      void appLog("warn", "ios.push.registration.failed", {
        error: shortError(error),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [profile.taskPushNotificationsEnabled, workspaceLoaded]);

  useEffect(() => {
    if (!workspaceLoaded || !iosPushSupported()) return undefined;
    const handlePush = (event) => {
      const detail = event?.detail || {};
      const conversationId = String(detail.conversationId || "").trim();
      if (!conversationId) return;
      void (async () => {
        const target = serversRef.current.find(
          (server) => String(server?.conversationId || "").trim() === conversationId,
        );
        if (!target) {
          void appLog("warn", "ios.push.conversation_missing", {
            conversationId,
            taskId: String(detail.taskId || ""),
          });
          return;
        }
        if (detail.opened) await selectServer(target.id);
        await syncAgentConversationForServer(target, {
          limit: 1,
          reason: detail.opened ? "push-open" : "push-received",
        });
      })();
    };
    window.addEventListener("aiwb:ios-push", handlePush);
    return () => window.removeEventListener("aiwb:ios-push", handlePush);
  }, [workspaceLoaded]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const normalized = normalizeProfile(profile);
    root.style.setProperty("--message-font-family", messageFontFamilyCss(normalized.messageFontFamily));
    root.style.setProperty("--message-font-size", `${normalized.messageFontSize}px`);
    root.style.setProperty("--message-font-weight", normalized.messageFontWeight);
    root.style.setProperty("--message-line-height", normalized.messageLineHeight);
    return () => {
      root.style.removeProperty("--message-font-family");
      root.style.removeProperty("--message-font-size");
      root.style.removeProperty("--message-font-weight");
      root.style.removeProperty("--message-line-height");
    };
  }, [profile]);

  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  useEffect(() => {
    activeServerIdRef.current = activeServerId;
  }, [activeServerId]);

  useLayoutEffect(() => {
    const previousServerId = composerServerIdRef.current;
    if (previousServerId && previousServerId !== activeServerId) {
      composerDraftsRef.current.set(previousServerId, composerRef.current);
    }

    composerServerIdRef.current = activeServerId;
    const nextDraft = activeServerId ? composerDraftsRef.current.get(activeServerId) || "" : "";
    composerRef.current = nextDraft;
    setComposerState(nextDraft);

    const previousAttachmentServerId = attachmentServerIdRef.current;
    const nextAttachments = switchSessionAttachmentDraft(
      attachmentDraftsRef.current,
      previousAttachmentServerId,
      imageAttachmentsRef.current,
      activeServerId,
    );
    attachmentServerIdRef.current = activeServerId;
    imageAttachmentsRef.current = nextAttachments;
    setImageAttachments(nextAttachments);
  }, [activeServerId]);

  useEffect(() => {
    composerRef.current = composer;
  }, [composer]);

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
  }

  function scrollConversationToBottom() {
    const container = conversationScrollRef.current;
    if (!scrollConversationContainerToBottom(container)) return false;
    conversationStickToBottomRef.current = true;
    return true;
  }

  function revealConversationTarget(messageId) {
    const result = revealConversationMessage(conversationScrollRef.current, messageId);
    if (result.visible) conversationStickToBottomRef.current = true;
    return result;
  }

  useLayoutEffect(() => {
    const latestMessageId = messages[messages.length - 1]?.id || "";
    const previous = conversationScrollStateRef.current;
    const switchedSession = previous.activeServerId !== activeServerId;
    const restoredHistory = previous.messageCount === 0 && messages.length > 0;
    const revealRequest = conversationRevealRequestRef.current;
    const revealRequested = conversationRevealReady(revealRequest, activeServerId, messages);
    const shouldFollow = revealRequested || switchedSession || restoredHistory || conversationStickToBottomRef.current;

    conversationScrollStateRef.current = {
      activeServerId,
      messageCount: messages.length,
      lastMessageId: latestMessageId,
    };

    if (!workspaceLoaded || !messages.length || !shouldFollow) return undefined;

    let revealCompleted = false;
    const followConversation = () => {
      if (!revealRequested) return scrollConversationToBottom();
      if (revealCompleted || conversationRevealRequestRef.current !== revealRequest) return false;
      const result = revealConversationTarget(revealRequest.messageId);
      if (!result.visible) return false;

      revealCompleted = true;
      conversationRevealRequestRef.current = null;
      void appLog("info", "conversation.reveal.completed", {
        serverId: activeServerId,
        messageId: revealRequest.messageId,
        delayMs: Math.max(0, Date.now() - Number(revealRequest.requestedAt || Date.now())),
      });
      return true;
    };

    followConversation();
    const frame = window.requestAnimationFrame(followConversation);
    const timeout = window.setTimeout(followConversation, 80);
    const settleTimeout = window.setTimeout(followConversation, 240);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      window.clearTimeout(settleTimeout);
    };
  }, [activeServerId, messages, workspaceLoaded]);

  useEffect(() => {
    if (voiceInputEnabled) return;

    wakeManuallyDisabledRef.current = false;
    wakeEnabledRef.current = false;
    wakeListeningSignatureRef.current = "";
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
    if (wakeListeningSignatureRef.current === wakePhraseSignature) return;

    wakeEnabledRef.current = false;
    wakeListeningSignatureRef.current = "";
    const restartLoopId = wakeLoopIdRef.current + 1;
    wakeLoopIdRef.current = restartLoopId;
    VoiceWorkbench.stopWakeWord?.()
      .catch(() => {})
      .finally(() => {
        if (
          wakeLoopIdRef.current !== restartLoopId ||
          wakeManuallyDisabledRef.current ||
          normalizeProfile(profileRef.current).voiceInputEnabled !== true ||
          busyRef.current ||
          pendingActionRef.current ||
          !profileReadyRef.current
        ) {
          return;
        }
        startWakeMode();
      });
  }, [wakePhraseSignature, voiceInputEnabled, isProfileReady]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (!wakeEnabledRef.current) return;
        wakeEnabledRef.current = false;
        wakeListeningSignatureRef.current = "";
        wakeLoopIdRef.current += 1;
        applyWakeState("idle");
        VoiceWorkbench.stopWakeWord?.().catch(() => {});
        return;
      }

      if (
        normalizeProfile(profileRef.current).voiceInputEnabled === true &&
        !wakeManuallyDisabledRef.current &&
        !busyRef.current &&
        !pendingActionRef.current &&
        profileReadyRef.current
      ) {
        startWakeMode();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    return () => {
      wakeEnabledRef.current = false;
      wakeListeningSignatureRef.current = "";
      voiceSessionActiveRef.current = false;
      assistantSpeechActiveRef.current = false;
      wakeLoopIdRef.current += 1;
      VoiceWorkbench.stopWakeWord?.().catch(() => {});
      VoiceWorkbench.stop?.().catch(() => {});
      stopAssistantSpeech();
      const attachmentItems = new Set(imageAttachmentsRef.current);
      attachmentDraftsRef.current.forEach((items) => items.forEach((item) => attachmentItems.add(item)));
      revokeImagePreviews([...attachmentItems]);
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
      if (String(payload?.mode || "").toLowerCase() === "wake") return;
      const eventSessionId = String(payload?.sessionId || "").trim();
      if (eventSessionId && eventSessionId !== voiceRecognitionSessionIdRef.current) return;
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

  // Runtime updates must patch the latest session snapshot. Workspace load/import
  // are the only flows allowed to intentionally replace the full list.
  function commitServerPatch(patch, { persistDelay = 250, persist = true } = {}) {
    const currentItems = serversRef.current;
    const nextItems = typeof patch === "function" ? patch(currentItems) : patch;
    if (!Array.isArray(nextItems) || nextItems === currentItems) return currentItems;

    serversRef.current = nextItems;
    setServers(nextItems);
    if (persist && workspaceLoadedRef.current) {
      saveLocalMessageHistory(nextItems);
      queueWorkspaceSave(nextItems, activeServerIdRef.current, persistDelay);
    }
    return nextItems;
  }

  function patchServersByConnection(targetProfile, updater, options = {}) {
    const connectionKey = agentInstallationKey(normalizeProfile(targetProfile));
    return commitServerPatch(
      (items) =>
        patchSessionsMatchingConnection(
          items,
          connectionKey,
          (profile) => agentInstallationKey(normalizeProfile(profile)),
          (server) => updater(server, normalizeProfile(server.profile)),
          reconcileServerMessageLifecycle,
        ),
      options,
    );
  }

  function patchServersBySshEndpoint(targetProfile, updater, options = {}) {
    const endpointKey = sshEndpointKey(normalizeProfile(targetProfile));
    return commitServerPatch(
      (items) =>
        patchSessionsMatchingConnection(
          items,
          endpointKey,
          (profile) => sshEndpointKey(normalizeProfile(profile)),
          (server) => updater(server, normalizeProfile(server.profile)),
          reconcileServerMessageLifecycle,
        ),
      options,
    );
  }

  function propagateDetectedMachineProfile(previousProfile, detectedProfile, options = {}) {
    const machineProfileUpdatedAt = Date.now();
    const detected = { ...detectedProfile, machineProfileUpdatedAt };
    patchServersByConnection(
      previousProfile,
      (server) => ({
        ...server,
        profile: normalizeProfile({
          ...(server.profile || {}),
          platform: detected.platform,
          wslDistro: detected.wslDistro,
          codexCommand: detected.codexCommand,
          claudeCommand: detected.claudeCommand,
          machineProfileUpdatedAt,
        }),
      }),
      { persistDelay: 0, ...options },
    );
    return detected;
  }

  function updateServer(serverId, updater) {
    return commitServerPatch((items) => patchSession(items, serverId, updater, reconcileServerMessageLifecycle));
  }

  function updateActiveServer(updater) {
    updateServer(activeServerIdRef.current, updater);
  }

  function canonicalConnectionUpdate(nextConnection = {}, previousConnection = {}) {
    const connection = canonicalConnectionState({ ...previousConnection, ...nextConnection });
    const state = connection.state;
    const label =
      state === "connected"
        ? "已连接"
        : state === "testing"
          ? "连接中"
          : state === "error"
            ? "连接异常"
            : "未连接";
    return { ...connection, state, label };
  }

  function setConnection(nextConnection) {
    updateActiveServer((server) => ({
      connection: {
        ...(server.connection || {}),
        ...canonicalConnectionUpdate(nextConnection, server.connection),
      },
    }));
  }

  function setServerConnection(serverId, nextConnection) {
    updateServer(serverId, (server) => ({
      connection: {
        ...(server.connection || {}),
        ...canonicalConnectionUpdate(nextConnection, server.connection),
      },
    }));
  }

  function connectionStateForRemoteError(message, agent, mode = "ssh") {
    const detail = shortError(message);
    const isConnectionFailure =
      message?.code === "AIWB_SSH_CONNECTION_FAILED" ||
      isRetryableSshConnectionError(message) ||
      /SSH 登录失败|连接断开|连接异常|Authentication failed|ECONNREFUSED|ENOTFOUND|getaddrinfo|Connection refused/i.test(detail);
    if (isConnectionFailure) return { state: "error", label: "连接异常", detail, mode };
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
      patchMessage(items, id, patch, {
        normalize: (item, nextPatch) => {
        const nextTaskState = taskStateForUpdate(item, nextPatch);
        const requiredAction =
          Object.hasOwn(nextPatch, "requiredAction")
            ? nextPatch.requiredAction
            : Object.hasOwn(nextPatch, "loginAction") || Object.hasOwn(nextPatch, "modelChoice")
              ? nextPatch.loginAction
                ? "login"
                : nextPatch.modelChoice
                  ? "model-choice"
                  : undefined
              : item.requiredAction;
        let next = { ...item, ...nextPatch, taskState: nextTaskState, requiredAction };
        const becameTerminal =
          taskStateIsActive(item.taskState) &&
          taskStateIsTerminal(nextTaskState);
        if (becameTerminal) {
          const completedAt = Date.now();
          const startedAt = Number(item.startedAt || item.createdAtMs || completedAt);
          next.startedAt = startedAt;
          next.completedAt = completedAt;
          next.durationMs = Math.max(0, completedAt - startedAt);
        }
        next = normalizeMessageLifecycle(next);
        return next;
        },
      }),
    );
  }

  function setServerTaskMetadata(serverId, task) {
    updateServer(serverId, { task: taskForStorage(task) });
  }

  function serverById(serverId) {
    return sessionById(serversRef.current, serverId);
  }

  function ensureServerConversationId(serverId, profileValue, agentId = "codex") {
    const server = serverById(serverId);
    const existing = String(server?.conversationId || "").trim();
    if (existing) return existing;
    const profileForId = normalizeProfile(profileValue || server?.profile || defaultProfile);
    const runtimePlatform = normalizeServerPlatform(profileForId.platform);
    const nextConversationId = createConversationId(
      [runtimePlatform, profileForId.host, profileForId.username, profileForId.workdir, agentId]
        .filter(Boolean)
        .join("-"),
    );
    updateServer(serverId, { conversationId: nextConversationId });
    return nextConversationId;
  }

  // A completed Agent task is authoritative even when an older Windows Agent
  // omitted the response envelope around its final text.
  function extractCompletedAgentOutput(rawOutput, prompt = "") {
    const raw = String(rawOutput || "").trim();
    const extracted = raw ? extractAgentFinalOutput(raw, prompt) : { text: "", final: false };
    if (extracted.final && extracted.text) return extracted;

    const fallback = raw ? fallbackFinalOutput(raw, prompt) : "";
    if (!fallback || /__AIWB_(?:AGENT|RESPONSE)_/i.test(fallback)) return extracted;
    return { text: fallback, final: true, unmarked: true };
  }

  function messagesFromAgentConversation(conversation, agentId, options = {}) {
    if (!conversation?.id) return [];
    const existingTaskIds =
      options.existingTaskIds instanceof Set
        ? options.existingTaskIds
        : new Set((options.existingTaskIds || []).map((value) => String(value || "").trim()).filter(Boolean));
    const latestEntry = latestWorkbenchAgentConversationTask(conversation, agentId);
    const entries =
      latestEntry?.taskId && !existingTaskIds.has(String(latestEntry.taskId || "").trim())
        ? [latestEntry]
        : [];
    const messages = [];
    entries.forEach((entry) => {
      const entryAgentId = entry.agentId || agentId;
      const agent = agentById(entryAgentId);
      const taskId = String(entry.taskId || "").trim();
      const taskStatus = String(entry.status || "").trim();
      const currentTaskState = taskStateFromRemoteStatus(taskStatus, {
        hasTaskId: Boolean(taskId),
      });
      const isRunning = taskStateIsActive(currentTaskState);
      const lastPrompt = String(entry.lastPrompt || "").trim();
      const rawResult = String(entry.lastResult || "").trim();
      const extracted =
        rawResult && taskStatus === "done"
          ? extractCompletedAgentOutput(rawResult, lastPrompt)
          : rawResult
            ? extractAgentFinalOutput(rawResult, lastPrompt)
            : { text: "" };
      const visibleResult = extracted.final ? extracted.text : "";
      const deferredWaitingResult =
        taskStatus !== "done" && extracted.final && visibleResult && looksLikeDeferredWaitingAnswer(visibleResult);
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
      // Agent clocks can differ substantially from the device clock. Reuse the
      // client-authored turn and message ids recorded by modern Agents so the
      // restored turn keeps the same identity and chronology as the optimistic
      // local messages instead of being reordered by remote wall-clock time.
      const entryTurnId = String(entry.turnId || "").trim();
      const messagePairId = entryTurnId || `agent-pair-${conversation.id}-${taskId}`;
      const userMessageId = String(entry.requestMessageId || "").trim() || `agent-${conversation.id}-${taskId}-user`;
      const assistantMessageId = String(entry.responseMessageId || "").trim() || `agent-${conversation.id}-${taskId}-assistant`;
      const clientCreatedAtMs = messageClientTimestamp({
        turnId: entryTurnId,
        requestMessageId: userMessageId,
        remoteTaskId: taskId,
      }) || undefined;
      if (lastPrompt) {
        messages.push(
          createMessage({
            id: userMessageId,
            role: "user",
            body: lastPrompt,
            createdAt: startedAtLabel,
            createdAtMs: startedAtMs,
            backend: "agent",
            conversationId: conversation.id,
            remoteTaskId: taskId,
            agentId: entryAgentId,
            promptText: lastPrompt,
            clientCreatedAtMs,
            turnId: entryTurnId || messagePairId,
            messagePairId,
          }),
        );
      }
      if (!shouldCreateAssistant) return;
      messages.push(
        createMessage({
          id: assistantMessageId,
          role: "assistant",
          agentId: entryAgentId,
	        title: agentFailure
	          ? agentFailure.title
	          : deferredWaitingResult
	            ? "没有最终结果"
	            : resultMissing
	            ? "没有最终结果"
	            : isRunning
	              ? "执行中"
	              : `${agent.shortName} 回复`,
          body: agentFailure
            ? agentFailure.body
            : deferredWaitingResult
            ? "远端 AI 把“等待通知/稍后继续”当成最终回复返回了，任务没有真正完成。请重新发送，或明确要求它直接检查状态直到成功、失败或阻塞。"
            : resultMissing
            ? "任务已经结束，但没有收到可展示的结果。可以重新同步，或重新发送。"
	            : isRunning
	              ? "任务仍在执行，完成后会自动同步结果。"
	              : "",
          output: isRunning || agentFailure || resultMissing ? "" : visibleResult,
          liveOutput: isRunning ? formatAgentLiveOutput(rawResult, lastPrompt) : "",
          taskState:
            deferredWaitingResult || resultMissing
              ? taskStateFailed
              : currentTaskState || (agentFailure ? taskStateFailed : taskStateSucceeded),
          backend: "agent",
          conversationId: conversation.id,
          remoteTaskId: taskId,
          remoteTaskStatus: deferredWaitingResult ? "deferred-waiting-answer" : taskStatus,
          resultMissing,
          agentFailure: agentFailure || undefined,
          technicalDetail: deferredWaitingResult ? visibleResult : agentFailure?.detail || undefined,
          promptText: lastPrompt,
          clientCreatedAtMs,
          turnId: entryTurnId || messagePairId,
          messagePairId,
          replyToMessageId: lastPrompt ? userMessageId : "",
          startedAt: startedAtMs,
          completedAt: isRunning ? undefined : finishedAtMs,
          createdAt: finishedAtLabel,
          createdAtMs: finishedAtMs,
        }),
      );
    });
    return messages;
  }

  function resolveOrphanAgentPlaceholdersAfterConversationSync(messages = [], conversation, agentId, options = {}) {
    if (!conversation?.id) return messages;
    if (String(conversation.status || "").trim() === "missing") return messages;
    const latestEntry = latestWorkbenchAgentConversationTask(conversation, agentId);
    // A foreground recovery can explicitly confirm that the Agent has no task
    // for an older local placeholder. In that case the message was never sent
    // and must not remain locked in "submitting" forever.
    if (!latestEntry && options.confirmMissing !== true) return messages;
    const now = Date.now();
    const remotePromptKey = messageTextKey({ body: latestEntry?.lastPrompt || "" });
    let changed = false;
    const nextMessages = messages.map((message, index) => {
      const isAssistant = message?.role === "assistant";
      const taskId = String(message?.remoteTaskId || "").trim();
      const sameAgent = !message?.agentId || message.agentId === agentId;
      const sameConversation = !message?.conversationId || message.conversationId === conversation.id;
      const text = `${String(message?.title || "")}\n${String(message?.body || "")}`;
      const looksWaiting =
        /已发送|等待|正在|状态待确认|恢复同步|没有关联 Agent 后台任务 ID/.test(text) ||
        taskStateIsActive(taskStateForMessage(message));
      if (!isAssistant || taskId || !sameAgent || !sameConversation || !looksWaiting) return message;

      const previousUser = [...messages.slice(0, index)].reverse().find((item) => item?.role === "user");
      const promptKey = messageTextKey({ body: message.promptText || previousUser?.body || "" });
      const createdAt = Number(message.startedAt || message.createdAtMs || 0);
      // The app may have been suspended after the Agent accepted a task but
      // before the task id made it into local storage. Bind that local
      // placeholder to the matching remote task instead of adding a duplicate
      // conversation entry or treating it as unsent.
      if (promptKey && remotePromptKey && promptKey === remotePromptKey) {
        const recoveredTaskId = String(latestEntry?.taskId || "").trim();
        if (!recoveredTaskId) return message;
        const remoteStatus = String(latestEntry?.status || "queued").trim();
        const startedAt = timestampFromAgentTime(latestEntry?.startedAt) * 1000 || createdAt || now;
        changed = true;
        return {
          ...message,
          title: "已恢复任务",
          body: "已确认 Agent 收到这条消息，正在同步执行结果。",
          taskState: taskStateFromRemoteStatus(remoteStatus, { hasTaskId: true }) || taskStateSyncing,
          backend: "agent",
          conversationId: conversation.id,
          remoteTaskId: recoveredTaskId,
          remoteTaskStatus: remoteStatus,
          remoteTaskCheckedAt: now,
          remoteSyncError: "",
          startedAt,
          completedAt: undefined,
          forceUpdate: true,
        };
      }

      if (createdAt && now - createdAt < 15_000) return message;

      changed = true;
      const startedAt = createdAt || now;
      return {
        ...message,
        title: "没有提交成功",
        body: `${agentById(agentId).shortName} 没有收到这条任务。可以重新发送；如果连续出现，请先点右上角同步状态或检查 Agent。`,
        output: "",
        liveOutput: "",
        taskState: taskStateFailed,
        backend: "agent",
        conversationId: conversation.id,
        agentId,
        remoteTaskStatus: "missing",
        remoteSyncError: "远端 Agent 最近任务里没有找到这条本地等待消息对应的任务。",
        resultMissing: false,
        startedAt,
        completedAt: now,
        durationMs: Math.max(0, now - startedAt),
        forceUpdate: true,
      };
    });
    return changed ? nextMessages : messages;
  }

  function taskMetadataFromAgentConversation(conversation, agentId) {
    if (!conversation?.taskId) return {};
    return {
      backend: "agent",
      remoteTaskId: conversation.taskId,
      agentId,
      startedAt: timestampFromAgentTime(conversation.startedAt) * 1000 || undefined,
      finishedAt: timestampFromAgentTime(conversation.finishedAt) * 1000 || undefined,
    };
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
    return isPendingAgentResponse(message);
  }

  function lastIncompleteAgentResponse(server) {
    return lastRecoverableAgentResponse(server?.messages || []);
  }

  function runningMessageForServer(server) {
    return lastActiveTaskMessage(server?.messages || []);
  }

  function serverNeedsAgentConversationRecovery(server) {
    const profileValue = normalizeProfile(server?.profile);
    if (!agentPreferredForProfile(profileValue) || !server?.conversationId) return false;
    return Boolean(lastIncompleteAgentResponse(server));
  }

  function isServerBusy(serverId) {
    return serverTaskRunning(serverById(serverId));
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

  function dismissTaskNoticeByKey(key) {
    const noticeKey = String(key || "").trim();
    if (!noticeKey) return;
    persistentNoticeKeysRef.current.delete(noticeKey);
    noticeQueueRef.current = noticeQueueRef.current.filter((notice) => notice?.key !== noticeKey);
    setTaskNotice((current) => (current?.key === noticeKey ? null : current));
    if (!persistentNoticeKeysRef.current.size && noticeQueueRef.current.length) {
      window.setTimeout(drainTaskNoticeQueue, 0);
    }
  }

  async function drainTaskNoticeQueue() {
    if (noticeSpeakingRef.current) return;
    if (persistentNoticeKeysRef.current.size) return;
    if (voiceStateRef.current !== "idle") {
      window.setTimeout(drainTaskNoticeQueue, 900);
      return;
    }

    const nextNotice = noticeQueueRef.current.shift();
    if (!nextNotice) return;

    noticeSpeakingRef.current = true;
    setTaskNotice(nextNotice);
    if (!nextNotice.persistent) clearTaskNoticeLater(nextNotice.id);
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

  function enqueueTaskNotice({ serverId, title, speech, tone = "done", persistent = false, key = "" }) {
    const noticeKey = String(key || "").trim();
    const notice = {
      id: `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      serverId,
      title,
      speech,
      tone,
      persistent,
      dismissible: !persistent,
      key: noticeKey,
    };
    triggerInteractionFeedback(hapticKindForNoticeTone(tone));
    if (persistent) {
      if (noticeKey) {
        persistentNoticeKeysRef.current.add(noticeKey);
        noticeQueueRef.current = noticeQueueRef.current.filter((item) => item?.key !== noticeKey);
      }
      setTaskNotice(notice);
      return notice.id;
    }
    noticeQueueRef.current.push(notice);
    drainTaskNoticeQueue();
    return notice.id;
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

  function preserveVolatileLocalServers(incomingServers = []) {
    const currentById = new Map((serversRef.current || []).map((server) => [server.id, server]));
    let preservedCount = 0;
    const volatileRemoteStatuses = new Set([
      "preparing",
      "queued",
      "running",
      "busy",
      "sync-lost",
      "sync-lost-no-task-id",
    ]);

    const nextServers = incomingServers.map((incomingServer) => {
      const currentServer = currentById.get(incomingServer.id);
      if (!currentServer) return incomingServer;

      const isSending = sendingServerIdsRef.current.has(incomingServer.id);
      const currentMessages = Array.isArray(currentServer.messages) ? currentServer.messages : [];
      const volatileMessages = currentMessages.filter((message) => {
        if (taskStateIsActive(taskStateForMessage(message))) return true;
        if (volatileRemoteStatuses.has(String(message?.remoteTaskStatus || ""))) return true;
        if (message?.role === "user" && String(message?.remoteTaskId || "").trim()) {
          const pairRunning = currentMessages.some(
            (candidate) =>
              candidate?.role === "assistant" &&
              taskStateIsActive(taskStateForMessage(candidate)) &&
              String(candidate?.remoteTaskId || "") === String(message.remoteTaskId || ""),
          );
          return pairRunning;
        }
        return false;
      });
      const hasVolatileState = isSending || serverTaskRunning(currentServer) || volatileMessages.length > 0;
      if (!hasVolatileState) return incomingServer;

      preservedCount += 1;
      const messagesToPreserve = isSending ? currentMessages : volatileMessages;
      const mergedMessages = dedupeRemoteTaskMessages([...(incomingServer.messages || []), ...messagesToPreserve]);
      return {
        ...incomingServer,
        messages: mergedMessages,
        rawOutput: currentServer.rawOutput || incomingServer.rawOutput,
        task: isSending || serverTaskRunning(currentServer) ? currentServer.task || incomingServer.task : incomingServer.task,
        connection:
          isSending || currentServer.connection?.state === "testing"
            ? {
                ...(incomingServer.connection || {}),
                ...(currentServer.connection || {}),
              }
            : incomingServer.connection,
      };
    });

    if (preservedCount > 0) {
      void appLog("info", "profile.load.preserve_volatile_local_state", { serverCount: preservedCount });
    }
    return nextServers;
  }

  function normalizedWorkspaceRevision(value) {
    const revision = Number(value || 0);
    return Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0;
  }

  async function persistWorkspaceProfile(payload) {
    const bridge = desktopBridge();
    if (bridge?.saveProfile) return bridge.saveProfile(payload);
    return SSHWorkbench.saveProfile(payload);
  }

  function mergeSafeLocalMessageHistory(profileStore, serverList) {
    const resetServerIds = new Set(
      Object.entries(profileStore?.messageResetRevisions || {})
        .filter(([, revision]) => normalizedWorkspaceRevision(revision) > 0)
        .map(([serverId]) => String(serverId || "").trim())
        .filter(Boolean),
    );
    const mergedServers = mergeLocalMessageHistory(serverList);
    if (!resetServerIds.size) return mergedServers;
    const authoritativeById = new Map(serverList.map((server) => [server.id, server]));
    return mergedServers.map((server) =>
      resetServerIds.has(server.id) ? authoritativeById.get(server.id) || server : server,
    );
  }

  function canonicalWorkspaceProfile(profileStore, normalizedStore) {
    return {
      ...(profileStore || {}),
      ...serializeWorkspaceStore(normalizedStore.servers, normalizedStore.activeServerId || ""),
      workspaceRevision: workspaceProfileEffectiveRevision(profileStore || {}),
      serverTombstones: profileStore?.serverTombstones || {},
      messageResetRevisions: profileStore?.messageResetRevisions || {},
    };
  }

  function applyAuthoritativeWorkspaceProfile(authoritativeProfile, options = {}) {
    if (!workspaceStoreHasServers(authoritativeProfile)) return false;
    const revision = workspaceProfileEffectiveRevision(authoritativeProfile);
    if (revision < workspaceRevisionRef.current) return false;
    const previousRevision = workspaceRevisionRef.current;
    const currentServers = serversRef.current;
    const queuedPending = workspacePendingSaveRef.current;
    const expectedSnapshotChanged = options.expectedServers && currentServers !== options.expectedServers;
    const localStateIsDirty = currentServers !== workspaceAppliedServersRef.current;
    const authoritativeLoaded = normalizeWorkspaceStore(authoritativeProfile);
    authoritativeLoaded.servers = dedupeServerRemoteTaskMessages(authoritativeLoaded.servers);
    const canonicalAuthoritativeProfile = canonicalWorkspaceProfile(authoritativeProfile, authoritativeLoaded);
    const pendingMutation =
      options.pendingMutation ||
      queuedPending ||
      ((expectedSnapshotChanged || (!options.expectedServers && localStateIsDirty))
        ? {
            servers: currentServers,
            activeServerId: activeServerIdRef.current,
            baseRevision: previousRevision,
            baseProfile: workspaceAuthoritativeProfileRef.current,
            deletedServerIds: [],
            replaceMessages: false,
            replaceMessageServerIds: [],
          }
        : null);
    const pendingProfile = pendingMutation
      ? {
          ...serializeWorkspaceStore(pendingMutation.servers, pendingMutation.activeServerId),
          workspaceRevision: pendingMutation.baseRevision,
        }
      : null;
    const effectiveProfile = pendingProfile
      ? rebaseWorkspaceProfile(canonicalAuthoritativeProfile, pendingProfile, {
          baseRevision: pendingMutation.baseRevision,
          baseProfile: pendingMutation.baseProfile,
          deletedServerIds: pendingMutation.deletedServerIds,
          replaceMessages: pendingMutation.replaceMessages,
          replaceMessageServerIds: pendingMutation.replaceMessageServerIds,
        })
      : canonicalAuthoritativeProfile;
    const newerMessageReset = Object.values(authoritativeProfile.messageResetRevisions || {}).some(
      (resetRevision) => normalizedWorkspaceRevision(resetRevision) > previousRevision,
    );
    const loaded = normalizeWorkspaceStore(effectiveProfile);
    loaded.servers = dedupeServerRemoteTaskMessages(
      options.replaceMessages || newerMessageReset
        ? loaded.servers
        : mergeSafeLocalMessageHistory(authoritativeProfile, loaded.servers),
    );
    loaded.servers = preserveVolatileLocalServers(loaded.servers);
    const active =
      loaded.servers.find((server) => server.id === desktopWindowContext.serverId) ||
      loaded.servers.find((server) => server.id === activeServerIdRef.current) ||
      loaded.servers.find((server) => server.id === loaded.activeServerId) ||
      loaded.servers[0] ||
      null;

    workspaceRevisionRef.current = revision;
    workspaceAuthoritativeProfileRef.current = canonicalAuthoritativeProfile;
    applyingExternalProfileRef.current = true;
    primaryActiveServerIdRef.current = loaded.activeServerId || active?.id || "";
    const mirrorProfile = {
      ...effectiveProfile,
      ...serializeWorkspaceStore(loaded.servers, loaded.activeServerId || active?.id || ""),
      workspaceRevision: revision,
      serverTombstones: authoritativeProfile.serverTombstones || {},
      messageResetRevisions: authoritativeProfile.messageResetRevisions || {},
    };
    saveWorkspaceMirror(mirrorProfile);
    saveLocalMessageHistory(loaded.servers);
    setServers(loaded.servers);
    serversRef.current = loaded.servers;
    setActiveServerId(active?.id || "");
    activeServerIdRef.current = active?.id || "";
    followActiveSessionInSettings(active);
    profileRef.current = active?.profile || defaultProfile;
    setActiveAgentId(normalizeProfile(active?.profile || defaultProfile).agentId);

    if (pendingMutation) {
      const rebasedPending = {
        ...pendingMutation,
        servers: loaded.servers,
        activeServerId: active?.id || "",
        baseRevision: revision,
        baseProfile: canonicalAuthoritativeProfile,
      };
      workspaceAppliedServersRef.current = authoritativeLoaded.servers;
      if (options.retainPending !== false) {
        schedulePendingWorkspaceSave(rebasedPending, options.pendingDelayMs ?? 40);
      } else {
        workspacePendingSaveRef.current = null;
      }
    } else {
      workspacePendingSaveRef.current = null;
      workspaceAppliedServersRef.current = loaded.servers;
    }
    return true;
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
        const loadedRevision = workspaceProfileEffectiveRevision(profileStore || {});
        if (loadedRevision < workspaceRevisionRef.current) {
          setWorkspaceLoaded(true);
          void appLog("info", "profile.load.ignored_stale_result", {
            loadedRevision,
            appliedRevision: workspaceRevisionRef.current,
          });
          return;
        }
        workspaceRevisionRef.current = loadedRevision;
        if (workspaceStoreHasServers(nativeProfile)) saveWorkspaceMirror(nativeProfile);
        if (source === "local-mirror") {
          void appLog("warn", "profile.load.fallback_mirror", {
            nativeHasServers: workspaceStoreHasServers(nativeProfile),
            mirrorServerCount: mirrorProfile?.servers?.length || 0,
          });
        }

        const normalizedLoaded = normalizeWorkspaceStore(profileStore || nativeProfile);
        const authoritativeLoaded = {
          ...normalizedLoaded,
          servers: dedupeServerRemoteTaskMessages(normalizedLoaded.servers),
        };
        const loaded = {
          ...authoritativeLoaded,
          servers: dedupeServerRemoteTaskMessages(
            mergeSafeLocalMessageHistory(profileStore || nativeProfile, authoritativeLoaded.servers),
          ),
        };
        loaded.servers = preserveVolatileLocalServers(loaded.servers);
        const active =
          loaded.servers.find((server) => server.id === desktopWindowContext.serverId) ||
          loaded.servers.find((server) => server.id === loaded.activeServerId) ||
          loaded.servers[0] ||
          null;
        setServers(loaded.servers);
        serversRef.current = loaded.servers;
        workspaceAppliedServersRef.current = authoritativeLoaded.servers;
        workspaceAuthoritativeProfileRef.current = canonicalWorkspaceProfile(
          profileStore || nativeProfile || {},
          authoritativeLoaded,
        );
        primaryActiveServerIdRef.current = loaded.activeServerId || active?.id || "";
        setActiveServerId(active?.id || "");
        activeServerIdRef.current = active?.id || "";
        followActiveSessionInSettings(active);
        setActiveAgentId(normalizeProfile(active?.profile || defaultProfile).agentId);
        setWorkspaceLoaded(true);
        const loadedStore = profileStore || nativeProfile;
        if (Number(loadedStore?.version) !== workspaceStoreVersion) {
          const cleanStore = {
            ...serializeWorkspaceStore(loaded.servers, active?.id || ""),
            workspaceRevision: workspaceRevisionRef.current,
          };
          saveWorkspaceMirror(cleanStore);
          saveWorkspace(loaded.servers, active?.id || "", {
            baseRevision: workspaceRevisionRef.current,
            baseProfile: workspaceAuthoritativeProfileRef.current,
            replaceMessages: true,
            replaceMessageServerIds: loaded.servers.map((server) => server.id),
          })
            .catch((migrationError) => {
              void appLog("error", "profile.clean_migration.failed", { error: shortError(migrationError) });
            });
          void appLog("info", "profile.clean_migration.completed", {
            fromVersion: Number(loadedStore?.version || 0),
            toVersion: workspaceStoreVersion,
            serverCount: loaded.servers.length,
          });
        }
        void appLog("info", "profile.load.success", {
          source,
          ...workspaceDiagnosticSummary(loaded.servers, active?.id || ""),
        });
      } catch (error) {
        if (cancelled) return;
        if (workspaceAuthoritativeProfileRef.current && workspaceRevisionRef.current > 0) {
          setWorkspaceLoaded(true);
          void appLog("warn", "profile.load.failed_after_authoritative_update", {
            error: shortError(error),
            workspaceRevision: workspaceRevisionRef.current,
          });
          return;
        }
        const mirrorProfile = loadWorkspaceMirror();
        if (mirrorProfile) {
          const mirrorRevision = workspaceProfileEffectiveRevision(mirrorProfile);
          if (mirrorRevision < workspaceRevisionRef.current) {
            setWorkspaceLoaded(true);
            return;
          }
          workspaceRevisionRef.current = mirrorRevision;
          const normalizedLoaded = normalizeWorkspaceStore(mirrorProfile);
          const authoritativeLoaded = {
            ...normalizedLoaded,
            servers: dedupeServerRemoteTaskMessages(normalizedLoaded.servers),
          };
          const loaded = {
            ...authoritativeLoaded,
            servers: dedupeServerRemoteTaskMessages(
              mergeSafeLocalMessageHistory(mirrorProfile, authoritativeLoaded.servers),
            ),
          };
          loaded.servers = preserveVolatileLocalServers(loaded.servers);
          const active =
            loaded.servers.find((server) => server.id === desktopWindowContext.serverId) ||
            loaded.servers.find((server) => server.id === loaded.activeServerId) ||
            loaded.servers[0] ||
            null;
          setServers(loaded.servers);
          serversRef.current = loaded.servers;
          workspaceAppliedServersRef.current = authoritativeLoaded.servers;
          workspaceAuthoritativeProfileRef.current = canonicalWorkspaceProfile(mirrorProfile, authoritativeLoaded);
          primaryActiveServerIdRef.current = loaded.activeServerId || active?.id || "";
          setActiveServerId(active?.id || "");
          activeServerIdRef.current = active?.id || "";
          followActiveSessionInSettings(active);
          setActiveAgentId(normalizeProfile(active?.profile || defaultProfile).agentId);
          setWorkspaceLoaded(true);
          void appLog("warn", "profile.load.recovered_from_mirror", {
            error: shortError(error),
            ...workspaceDiagnosticSummary(loaded.servers, active?.id || ""),
          });
          return;
        }
        setServers([]);
        serversRef.current = [];
        workspaceAppliedServersRef.current = [];
        workspaceAuthoritativeProfileRef.current = null;
        workspaceRevisionRef.current = 0;
        primaryActiveServerIdRef.current = "";
        setActiveServerId("");
        activeServerIdRef.current = "";
        setEditingServerId("");
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
      applyAuthoritativeWorkspaceProfile(payload.profile, {
        replaceMessages: payload?.replaceMessages === true,
      });
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
      const executed = await runCommandWithHostFallback(
        current,
        activeServerIdRef.current || `profile:${profileConnectionKey(current)}`,
        commandPayload,
        maxResponseSize,
        commandTimeoutSeconds,
      );
      const stdout = normalizeRemoteCommandOutput(executed.result);
      void appLog("info", "ssh.command.success", {
        ...diagnostics,
        durationMs: Date.now() - startedAt,
        outputLength: stdout.length,
        connectedHost: executed.host,
        fallbackUsed: executed.fallbackUsed,
      });
      return stdout;
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
      const exactServer =
        serversRef.current.find(
          (server) =>
            server.id === activeServerIdRef.current &&
            sshEndpointKey(server.profile) === sshEndpointKey(current),
        ) ||
        serversRef.current.find(
          (server) =>
            sshEndpointKey(server.profile) === sshEndpointKey(current) &&
            String(server.profile?.workdir || "") === String(current.workdir || "") &&
            String(server.profile?.agentId || "") === String(current.agentId || ""),
        );
      const executed = await runCommandWithHostFallback(
        current,
        exactServer?.id || `profile:${profileConnectionKey(current)}`,
        commandPayload,
        maxResponseSize,
        commandTimeoutSeconds,
      );
      const stdout = normalizeRemoteCommandOutput(executed.result);
      void appLog("info", "ssh.command.success", {
        ...diagnostics,
        durationMs: Date.now() - startedAt,
        outputLength: stdout.length,
        connectedHost: executed.host,
        fallbackUsed: executed.fallbackUsed,
      });
      return stdout;
    } catch (error) {
      void appLog("error", "ssh.command.failed", {
        ...diagnostics,
        durationMs: Date.now() - startedAt,
        error: shortError(error),
      });
      throw error;
    }
  }, []);

  function applyAgentHealthToConnection(targetProfile, agentHealth = {}, rawOutput = "", preferredServerId = "") {
    const normalizedProfile = normalizeProfile(targetProfile);
    return patchServersByConnection(
      normalizedProfile,
      (server) => ({
        ...server,
        diagnostics: {
          ...(server.diagnostics || {}),
          ...agentHealth,
          agent: "available",
          agent_version:
            agentHealth.agent_version || server.diagnostics?.agent_version || latestWorkbenchAgentVersion,
          agent_checked_at: Date.now(),
        },
        rawOutput: server.id === preferredServerId && rawOutput.trim() ? rawOutput.trim() : server.rawOutput,
        connection: {
          ...(server.connection || {}),
          mode: "agent",
          ...(server.id === preferredServerId
            ? {
                state: "connected",
                label: "已连接",
                detail: "Agent 已就绪",
              }
            : {}),
        },
      }),
      { persistDelay: 100 },
    );
  }

  function ensureWorkbenchAgentForProfile(targetProfile, options = {}) {
    const currentProfile = withKnownPassword(normalizeProfile(targetProfile));
    const connectionKey = agentInstallationKey(currentProfile);
    const existingPromise = agentSetupPromisesRef.current.get(connectionKey);
    if (existingPromise) {
      void appLog("info", "agent.startup.reused", {
        serverId: options.serverId || "",
        reason: options.reason || "connect",
        host: currentProfile.host,
      });
      return existingPromise;
    }

    const setupPromise = ensureWorkbenchAgentForProfileOnce(currentProfile, options).finally(() => {
      if (agentSetupPromisesRef.current.get(connectionKey) === setupPromise) {
        agentSetupPromisesRef.current.delete(connectionKey);
      }
    });
    agentSetupPromisesRef.current.set(connectionKey, setupPromise);
    return setupPromise;
  }

  async function ensureWorkbenchAgentForProfileOnce(
    targetProfile,
    { serverId = "", onProgress = null, reason = "connect", allowCachedReady = false } = {},
  ) {
    const requestedProfile = normalizeProfile(targetProfile);
    if (!agentPreferredForProfile(requestedProfile)) {
      return { available: false, skipped: true, output: "", parsed: null, error: null };
    }
    const currentProfile = withInteractiveSshConnectTimeout(withKnownPassword(requestedProfile));

    const publish = (state, label, detail, mode = "agent") => {
      const next = { state, label, detail, mode };
      if (serverId) setServerConnection(serverId, next);
      if (typeof onProgress === "function") onProgress(next);
    };

    const cachedServer = serverId
      ? serversRef.current.find((server) => server.id === serverId)
      : null;
    const cachedDiagnostics = cachedServer?.diagnostics || {};
    const cachedAgentVersionNumber = workbenchAgentVersionNumber(cachedDiagnostics.agent_version);
    const requiredAgentVersionNumber = workbenchAgentVersionNumber(latestWorkbenchAgentVersion);
    const cachedGenerationReady =
      requiredAgentVersionNumber < 54 || cachedDiagnostics.agent_generation_ready === "1";
    const cachedReady =
      allowCachedReady &&
      agentInstallationKey(cachedServer?.profile || {}) === agentInstallationKey(currentProfile) &&
      (cachedDiagnostics.agent === "available" || Boolean(cachedDiagnostics.agent_version)) &&
      cachedGenerationReady &&
      // An old cached snapshot must never skip the live Agent probe. Otherwise
      // the UI can say "connected" while the remote Agent still needs an update.
      (requiredAgentVersionNumber === 0 || cachedAgentVersionNumber >= requiredAgentVersionNumber);
    if (cachedReady) {
      // Fresh SSH health owns CLI paths; an older cached Agent snapshot may
      // have empty Codex/Claude values and must not overwrite that result.
      const cachedAgentHealth = Object.fromEntries(
        Object.entries(cachedDiagnostics).filter(([key]) => key === "agent" || key.startsWith("agent_")),
      );
      const agentHealth = {
        ...cachedAgentHealth,
        agent: "available",
        agent_version: cachedDiagnostics.agent_version || latestWorkbenchAgentVersion,
      };
      publish("connected", "已连接", "Agent 已就绪", "agent");
      void appLog("info", "agent.startup.cached", {
        serverId,
        reason,
        host: currentProfile.host,
        version: agentHealth.agent_version,
      });
      return {
        available: true,
        taskSubmissionReady: true,
        cached: true,
        skipped: false,
        installed: false,
        output: "",
        parsed: null,
        agentHealth,
      };
    }

    const probeAgentStatus = () => runRemoteCommandForProfile(
      currentProfile,
      buildWorkbenchAgentStatusCommand(currentProfile),
      64_000,
      30,
    );
    let probeOutput = "";
    let probe = null;
    let probeError = null;
    try {
      probeOutput = await probeAgentStatus();
      probe = parseWorkbenchAgentOutput(probeOutput);
    } catch (error) {
      probeError = error;
      void appLog("warn", "agent.startup.probe.failed", {
        serverId,
        reason,
        host: currentProfile.host,
        error: shortError(error),
      });
      if (isSshStaleConnectionError(error)) {
        void appLog("info", "agent.startup.stale_connection_retry", {
          serverId,
          reason,
          host: currentProfile.host,
        });
        try {
          probeOutput = await probeAgentStatus();
          probe = parseWorkbenchAgentOutput(probeOutput);
          probeError = null;
        } catch (retryError) {
          probeError = retryError;
          void appLog("warn", "agent.startup.stale_connection_retry.failed", {
            serverId,
            reason,
            host: currentProfile.host,
            error: shortError(retryError),
          });
        }
      }
    }

    if (probeError && isSshTransportUnavailableError(probeError)) {
      const detail = shortError(probeError);
      publish("error", "连接失败", detail, "agent");
      void appLog("warn", "agent.startup.transport_unavailable", {
        serverId,
        reason,
        host: currentProfile.host,
        connectTimeoutSeconds: currentProfile.connectTimeoutSeconds,
        error: detail,
      });
      return {
        available: false,
        taskSubmissionReady: false,
        skipped: false,
        installed: false,
        output: probeOutput,
        parsed: probe,
        agentHealth: {},
        error: probeError,
        transportUnavailable: true,
      };
    }

    const latestVersionNumber = workbenchAgentVersionNumber(latestWorkbenchAgentVersion);
    const installedVersionNumber = workbenchAgentVersionNumber(probe?.version);
    const alreadyReady = Boolean(probe && workbenchAgentAvailableFromOutput(probeOutput));
    const needsInstall =
      !alreadyReady ||
      (latestVersionNumber > 0 && installedVersionNumber < latestVersionNumber);

    if (!needsInstall) {
      const agentHealth = healthFromWorkbenchAgentStatus(probe);
      agentRouteProbeByConnectionRef.current.set(agentInstallationKey(currentProfile), {
        checkedAt: Date.now(),
        output: probeOutput,
      });
      applyAgentHealthToConnection(currentProfile, agentHealth, probeOutput, serverId);
      publish("connected", "已连接", "Agent 已就绪", "agent");
      return {
        available: true,
        taskSubmissionReady: true,
        skipped: false,
        installed: false,
        output: probeOutput,
        parsed: probe,
        agentHealth,
      };
    }

    publish(
      "testing",
      installedVersionNumber > 0 ? "检查 Agent" : "安装 Agent",
      installedVersionNumber > 0
        ? "正在检查云端版本，必要时自动更新"
        : "首次连接正在安装远端后台服务",
      "agent",
    );

    try {
      const installOutput = await runRemoteCommandForProfile(
        currentProfile,
        buildInstallWorkbenchAgentCommand(currentProfile),
        256_000,
        300,
      );
      const installed = parseWorkbenchAgentOutput(installOutput);
      const installedTaskReady = agentTaskSubmissionReady({
        available: workbenchAgentAvailableFromOutput(installOutput),
        installedVersion: workbenchAgentVersionNumber(installed.version),
        requiredVersion: latestVersionNumber,
        generationReady: installed.generationReady === "1",
      });
      if (!installedTaskReady) {
        throw new Error(installed.error || trimVisibleText(installOutput) || "Agent 安装失败。");
      }
      const agentHealth = healthFromWorkbenchAgentStatus(installed);
      agentRouteProbeByConnectionRef.current.set(agentInstallationKey(currentProfile), {
        checkedAt: Date.now(),
        output: installOutput,
      });
      applyAgentHealthToConnection(currentProfile, agentHealth, installOutput, serverId);
      publish("connected", "已连接", "Agent 已就绪", "agent");
      return {
        available: true,
        taskSubmissionReady: true,
        skipped: false,
        installed: true,
        output: installOutput,
        parsed: installed,
        agentHealth,
      };
    } catch (error) {
      const detail = shortError(error);
      void appLog("warn", "agent.startup.install.failed", {
        serverId,
        reason,
        host: currentProfile.host,
        probeError: probeError ? shortError(probeError) : "",
        error: detail,
      });
      if (agentCanContinueAfterUpgradeFailure({ alreadyReady, installedVersion: installedVersionNumber })) {
        const agentHealth = healthFromWorkbenchAgentStatus(probe);
        agentRouteProbeByConnectionRef.current.set(agentInstallationKey(currentProfile), {
          checkedAt: Date.now(),
          output: probeOutput,
        });
        applyAgentHealthToConnection(currentProfile, agentHealth, probeOutput, serverId);
        publish("connected", "已连接", `Agent v${installedVersionNumber} 可用，升级将在后台重试`, "agent");
        void appLog("warn", "agent.startup.upgrade_deferred", {
          serverId,
          reason,
          host: currentProfile.host,
          installedVersion: installedVersionNumber,
          requiredVersion: latestVersionNumber,
          error: detail,
        });
        return {
          available: true,
          taskSubmissionReady: false,
          degraded: true,
          skipped: false,
          installed: false,
          output: probeOutput,
          parsed: probe,
          agentHealth,
          upgradeError: error,
        };
      }
      publish("error", "Agent 不可用", "请安装或修复 Agent 后重试", "agent");
      return {
        available: false,
        taskSubmissionReady: false,
        skipped: false,
        installed: false,
        output: probeOutput,
        parsed: probe,
        agentHealth: {},
        error,
      };
    }
  }

  function agentDirectHealthOutput(health = {}) {
    const version = String(health?.version || "").trim();
    return [
      "__AIWB_AGENT_STATUS__ready",
      `__AIWB_AGENT_VERSION__${version}`,
      `__AIWB_AGENT_GENERATION_READY__${health?.generationReady === true ? "1" : "0"}`,
      `__AIWB_AGENT_SERVICE_STATUS__${health?.serviceStatus || ""}`,
      `__AIWB_AGENT_SERVICE_PROCESS_STATUS__${health?.serviceProcessStatus || ""}`,
      `__AIWB_AGENT_DAEMON_STATUS__${health?.daemonStatus || ""}`,
      `__AIWB_AGENT_HTTP_STATUS__${health?.httpStatus || ""}`,
      `__AIWB_AGENT_UPDATER_STATUS__${health?.updaterStatus || ""}`,
    ].join("\n");
  }

  function verifiedAgentDirectHealth(health, requiredCapabilities = ["tasks"]) {
    const version = String(health?.version || "").trim();
    const platform = trustedAgentPlatform(health?.platform);
    const versionNumber = workbenchAgentVersionNumber(version);
    const ready =
      workbenchAgentProtocolSupports(health, requiredCapabilities) &&
      health?.transport === "https" &&
      health?.daemonStatus === "running" &&
      health?.httpStatus === "running" &&
      health?.updaterStatus === "running" &&
      Boolean(platform) &&
      (versionNumber < 54 || health?.generationReady === true) &&
      versionNumber >= workbenchAgentVersionNumber(latestWorkbenchAgentVersion);
    return { ready, version, platform };
  }

  function decodeAgentDirectConfig(encoded) {
    const compact = String(encoded || "").replace(/\s+/g, "");
    if (!compact || typeof globalThis.atob !== "function") {
      throw new Error("Agent 直连引导未返回配置数据。");
    }
    const binary = globalThis.atob(compact);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }

  function assertUploadBootstrapNotCancelled(serverId) {
    if (!cancelledUploadBootstrapServerIdsRef.current.has(serverId)) return;
    const error = new Error("附件上传已取消。");
    error.code = "AIWB_UPLOAD_CANCELLED";
    error.uploadedFileCount = 0;
    throw error;
  }

  async function bootstrapAgentDirectProfile(
    targetProfile,
    { serverId = "", reason = "send", requiredCapabilities = ["tasks"] } = {},
  ) {
    const current = withKnownPassword(targetProfile);
    const directConfigOutput = await runRemoteCommandForProfile(
      current,
      buildWorkbenchAgentDirectConfigCommand(current),
      30_000,
      10,
    );
    if (reason.startsWith("upload")) assertUploadBootstrapNotCancelled(serverId);
    const encoded = String(directConfigOutput || "").match(
      /__AIWB_AGENT_DIRECT_CONFIG_B64__([^\r\n]+)/,
    )?.[1]?.trim();
    const directConfig = decodeAgentDirectConfig(encoded);
    const port = Number(directConfig?.port) || 8787;
    const transport = directConfig?.tls ? "https" : "http";
    const connectedHost = preferredHostByConnectionRef.current.get(sshEndpointKey(current)) || current.host;
    const endpoint = `${transport}://${connectedHost}:${port}`;
    const accessToken = String(directConfig?.accessToken || "").trim();
    const tlsFingerprint = String(directConfig?.tls?.fingerprint || "").trim();
    if (!accessToken || transport !== "https" || !tlsFingerprint) {
      throw new Error("Agent 直连引导配置不完整或未启用 TLS。");
    }

    const machineProfileUpdatedAt = Date.now();
    let directProfile = {
      ...current,
      agentDirectEndpoint: endpoint,
      agentDirectAccessToken: accessToken,
      agentDirectTlsFingerprint: tlsFingerprint,
      machineProfileUpdatedAt,
    };
    const health = await agentDirectRequest(directProfile, "/v1/health", { timeoutMs: 10_000 });
    if (reason.startsWith("upload")) assertUploadBootstrapNotCancelled(serverId);
    const verified = verifiedAgentDirectHealth(health, requiredCapabilities);
    if (!verified.ready) {
      throw new Error(`Agent 直连健康校验未通过（v${verified.version || "?"}）。`);
    }
    directProfile = { ...directProfile, platform: verified.platform };
    patchServersByConnection(
      current,
      (server) => ({
        ...server,
        profile: {
          ...server.profile,
          agentDirectEndpoint: endpoint,
          agentDirectAccessToken: accessToken,
          agentDirectTlsFingerprint: tlsFingerprint,
          platform: verified.platform,
          machineProfileUpdatedAt,
        },
        connection: {
          ...(server.connection || {}),
          mode: "agent",
        },
      }),
      { persistDelay: 0 },
    );
    if (activeServerIdRef.current === serverId) profileRef.current = directProfile;
    void appLog("info", "agent.direct.configured", {
      serverId,
      reason,
      endpoint,
      connectedHost,
      transport,
      version: verified.version,
      platform: verified.platform,
      capabilities: requiredCapabilities,
      sharedByConnection: true,
    });
    return {
      profile: directProfile,
      health,
      platform: verified.platform,
      output: agentDirectHealthOutput(health),
    };
  }

  async function ensureAgentBinaryUploadProfile(targetProfile, serverId = "") {
    const current = withKnownPassword(targetProfile);
    assertUploadBootstrapNotCancelled(serverId);
    if (agentDirectConfig(current).enabled) {
      try {
        const health = await agentDirectRequest(current, "/v1/health", { timeoutMs: 10_000 });
        assertUploadBootstrapNotCancelled(serverId);
        if (verifiedAgentDirectHealth(health, ["binary-upload-v1"]).ready) return current;
        void appLog("warn", "agent.upload.direct_not_ready", {
          serverId,
          version: String(health?.version || ""),
          capabilities: Array.isArray(health?.capabilities) ? health.capabilities : [],
        });
      } catch (error) {
        if (String(error?.code || "") === "AIWB_UPLOAD_CANCELLED") throw error;
        void appLog("warn", "agent.upload.direct_stale", { serverId, error: shortError(error) });
      }
    }

    assertUploadBootstrapNotCancelled(serverId);
    let bootstrapError = null;
    try {
      const configured = await bootstrapAgentDirectProfile(current, {
        serverId,
        reason: "upload",
        requiredCapabilities: ["binary-upload-v1"],
      });
      return configured.profile;
    } catch (error) {
      if (
        String(error?.code || "") === "AIWB_UPLOAD_CANCELLED" ||
        isSshTransportUnavailableError(error) ||
        /^(?:agent_direct_|AGENT_TLS_)/.test(String(error?.code || ""))
      ) {
        throw error;
      }
      bootstrapError = error;
      void appLog("warn", "agent.upload.direct_bootstrap_failed", { serverId, error: shortError(error) });
    }

    const setup = await ensureWorkbenchAgentForProfile(current, {
      serverId,
      reason: "upload",
      allowCachedReady: false,
    });
    assertUploadBootstrapNotCancelled(serverId);
    if (!setup.available || setup.taskSubmissionReady === false) {
      throw new Error(`无法建立 Agent 安全上传通道：${shortError(setup.error || bootstrapError)}`);
    }
    const refreshedProfile = withKnownPassword(serverById(serverId)?.profile || current);
    try {
      const configured = await bootstrapAgentDirectProfile(refreshedProfile, {
        serverId,
        reason: "upload-retry",
        requiredCapabilities: ["binary-upload-v1"],
      });
      return configured.profile;
    } catch (error) {
      throw new Error(`无法建立 Agent 安全上传通道：${shortError(error)}`);
    }
  }

  async function uploadImageAttachmentsForProfile(
    targetProfile,
    attachments = [],
    serverId = "",
    assistantMessageId = "",
  ) {
    const items = attachments.filter(agentUploadAttachmentReady);
    if (!items.length) return [];
    const current = await ensureAgentBinaryUploadProfile(targetProfile, serverId);
    assertUploadBootstrapNotCancelled(serverId);
    const uploaded = [];
    for (let index = 0; index < items.length; index += 1) {
      const attachment = items[index];
      const uploadId = `upload-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 9)}`;
      const expectedSize = Number(attachment.size || 0);
      const startedAt = Date.now();
      activeUploadByServerRef.current.set(serverId, {
        uploadId,
        name: attachment.name || "附件",
        expectedSize,
        assistantMessageId,
        fileIndex: index + 1,
        fileCount: items.length,
        lastProgressPercent: -1,
      });
      void appLog("info", "agent.upload.start", { serverId, uploadId, name: attachment.name, expectedSize });
      try {
        const result = await agentDirectUpload(current, attachment, {
          uploadId,
          workdir: current.workdir,
          timeoutMs: 240_000,
        });
        if (expectedSize > 0 && Number(result.size) !== expectedSize) {
          throw new Error(`附件上传校验失败：预期 ${expectedSize} 字节，实际 ${Number(result.size || 0)} 字节。`);
        }
        uploaded.push(result);
        void appLog("info", "agent.upload.success", { serverId, uploadId, durationMs: Date.now() - startedAt, size: result.size });
      } catch (error) {
        if (error && typeof error === "object" && Object.isExtensible(error)) {
          error.uploadedFileCount = uploaded.length;
        }
        void appLog("error", "agent.upload.failed", { serverId, uploadId, durationMs: Date.now() - startedAt, error: shortError(error) });
        throw error;
      } finally {
        if (activeUploadByServerRef.current.get(serverId)?.uploadId === uploadId) {
          activeUploadByServerRef.current.delete(serverId);
        }
      }
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

    return parseMainAIRoute(result?.body || result?.json || result);
  }

  const saveWorkspace = useCallback(async (nextServers, nextActiveServerId, options = {}) => {
    const queuedBeforeSave = workspacePendingSaveRef.current;
    if (queuedBeforeSave) cancelPendingWorkspaceSave();
    const persistedActiveServerId = desktopWindowContext.detachedChat
      ? primaryActiveServerIdRef.current || nextActiveServerId
      : nextActiveServerId;
    if (!desktopWindowContext.detachedChat) primaryActiveServerIdRef.current = persistedActiveServerId;
    let baseRevision = normalizedWorkspaceRevision(
      options.baseRevision ?? queuedBeforeSave?.baseRevision ?? workspaceRevisionRef.current,
    );
    let baseProfile = options.baseProfile || queuedBeforeSave?.baseProfile || workspaceAuthoritativeProfileRef.current;
    const deletedServerIds = [...new Set(
      [
        ...(Array.isArray(queuedBeforeSave?.deletedServerIds) ? queuedBeforeSave.deletedServerIds : []),
        ...(Array.isArray(options.deletedServerIds) ? options.deletedServerIds : []),
      ]
        .map((serverId) => String(serverId || "").trim())
        .filter(Boolean),
    )];
    const replaceMessages = options.replaceMessages === true || queuedBeforeSave?.replaceMessages === true;
    const requestedReplaceMessageServerIds = options.replaceMessages === true
      ? (Array.isArray(options.replaceMessageServerIds)
          ? options.replaceMessageServerIds
          : nextServers.map((server) => server.id))
      : [];
    const replaceMessageServerIds = [...new Set(
      [
        ...(Array.isArray(queuedBeforeSave?.replaceMessageServerIds)
          ? queuedBeforeSave.replaceMessageServerIds
          : []),
        ...requestedReplaceMessageServerIds,
      ]
        .map((serverId) => String(serverId || "").trim())
        .filter(Boolean),
    )];
    let submittedServers = queuedBeforeSave ? serversRef.current : nextServers;
    let submittedActiveServerId = queuedBeforeSave
      ? desktopWindowContext.detachedChat
        ? persistedActiveServerId
        : queuedBeforeSave.activeServerId ?? activeServerIdRef.current
      : persistedActiveServerId;
    const maxAttempts = 4;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const authoritativeMetadata = workspaceAuthoritativeProfileRef.current || {};
        const profileStore = {
          ...serializeWorkspaceStore(submittedServers, submittedActiveServerId),
          workspaceRevision: baseRevision,
          serverTombstones: authoritativeMetadata.serverTombstones || {},
          messageResetRevisions: authoritativeMetadata.messageResetRevisions || {},
        };
        saveLocalMessageHistory(submittedServers);
        saveWorkspaceMirror(profileStore);
        void appLog("info", "profile.save.start", {
          ...workspaceDiagnosticSummary(submittedServers, submittedActiveServerId),
          baseRevision,
          deletedServerCount: deletedServerIds.length,
          replaceMessages,
          replaceMessageServerCount: replaceMessageServerIds.length,
          attempt,
        });
        const result = await persistWorkspaceProfile({
          profile: profileStore,
          baseRevision,
          deletedServerIds,
          replaceMessages,
          replaceMessageServerIds,
        });
        const saveRejected = result?.operations?.saveApplied === false || result?.conflict === true;
        if (saveRejected && result?.profile) {
          applyAuthoritativeWorkspaceProfile(result.profile, {
            pendingMutation: {
              servers: submittedServers,
              activeServerId: submittedActiveServerId,
              baseRevision,
              baseProfile,
              deletedServerIds,
              replaceMessages,
              replaceMessageServerIds,
            },
            retainPending: false,
          });
          submittedServers = serversRef.current;
          submittedActiveServerId = desktopWindowContext.detachedChat
            ? primaryActiveServerIdRef.current
            : activeServerIdRef.current;
          baseRevision = workspaceRevisionRef.current;
          baseProfile = workspaceAuthoritativeProfileRef.current;
          if (attempt < maxAttempts) continue;
        }
        if (saveRejected) {
          schedulePendingWorkspaceSave({
            servers: submittedServers,
            activeServerId: submittedActiveServerId,
            baseRevision,
            baseProfile,
            deletedServerIds,
            replaceMessages,
            replaceMessageServerIds,
          }, 120);
          throw new Error("会话配置正在被其他窗口更新，本次修改已排队重试。");
        }
        const authoritativeApplied = result?.profile
          ? applyAuthoritativeWorkspaceProfile(result.profile, {
              expectedServers: submittedServers,
              replaceMessages,
            })
          : false;
        void appLog("info", "profile.save.success", {
          ...workspaceDiagnosticSummary(submittedServers, submittedActiveServerId),
          authoritativeApplied,
          workspaceRevision: workspaceRevisionRef.current,
          attempt,
        });
        return result;
      }
      throw new Error("会话配置保存未完成。");
    } catch (error) {
      void appLog("error", "profile.save.failed", {
        error: shortError(error),
        ...workspaceDiagnosticSummary(submittedServers, submittedActiveServerId),
      });
      throw error;
    }
  }, [desktopWindowContext.detachedChat]);

  function cancelPendingWorkspaceSave() {
    if (typeof window !== "undefined" && workspaceSaveTimerRef.current) {
      window.clearTimeout(workspaceSaveTimerRef.current);
    }
    workspaceSaveTimerRef.current = null;
    workspacePendingSaveRef.current = null;
  }

  function schedulePendingWorkspaceSave(entry, delayMs = 250) {
    if (!workspaceLoadedRef.current || typeof window === "undefined") return;
    const existingEntry = workspacePendingSaveRef.current;
    if (workspaceSaveTimerRef.current) window.clearTimeout(workspaceSaveTimerRef.current);
    const scheduledEntry = mergePendingWorkspaceMutations(existingEntry, {
      servers: Array.isArray(entry?.servers) ? entry.servers : serversRef.current,
      activeServerId: entry?.activeServerId ?? existingEntry?.activeServerId ?? activeServerIdRef.current,
      baseRevision: normalizedWorkspaceRevision(
        entry?.baseRevision ?? existingEntry?.baseRevision ?? workspaceRevisionRef.current,
      ),
      baseProfile: entry?.baseProfile || existingEntry?.baseProfile || workspaceAuthoritativeProfileRef.current,
      deletedServerIds: entry?.deletedServerIds,
      replaceMessages: entry?.replaceMessages === true,
      replaceMessageServerIds: entry?.replaceMessageServerIds,
    });
    workspacePendingSaveRef.current = scheduledEntry;
    workspaceSaveTimerRef.current = window.setTimeout(() => {
      if (workspacePendingSaveRef.current !== scheduledEntry) return;
      workspaceSaveTimerRef.current = null;
      workspacePendingSaveRef.current = null;
      saveWorkspace(scheduledEntry.servers, scheduledEntry.activeServerId, {
        baseRevision: scheduledEntry.baseRevision,
        baseProfile: scheduledEntry.baseProfile,
        deletedServerIds: scheduledEntry.deletedServerIds,
        replaceMessages: scheduledEntry.replaceMessages,
        replaceMessageServerIds: scheduledEntry.replaceMessageServerIds,
      }).catch((error) => {
        console.warn("[aiwb:queued-save:error]", shortError(error));
      });
    }, delayMs);
  }

  function queueWorkspaceSave(nextServers, nextActiveServerId = activeServerIdRef.current, delayMs = 250) {
    schedulePendingWorkspaceSave({
      servers: Array.isArray(nextServers) ? nextServers : serversRef.current,
      activeServerId: nextActiveServerId ?? activeServerIdRef.current,
      baseRevision: workspaceRevisionRef.current,
      baseProfile: workspaceAuthoritativeProfileRef.current,
    }, delayMs);
  }

  function reorderServerSessions(sourceId, targetId, placement = "before") {
    const currentServers = serversRef.current;
    const nextServers = reorderSessionsById(currentServers, sourceId, targetId, placement);
    if (nextServers === currentServers) return;

    serversRef.current = nextServers;
    setServers(nextServers);
    queueWorkspaceSave(nextServers, activeServerIdRef.current, 180);
  }

  function sortServerSessions(mode) {
    const currentServers = serversRef.current;
    const nextServers = sortSessions(currentServers, mode);
    if (nextServers.every((server, index) => server === currentServers[index])) return;

    serversRef.current = nextServers;
    setServers(nextServers);
    queueWorkspaceSave(nextServers, activeServerIdRef.current, 180);
  }

  function flushWorkspaceSave() {
    if (!workspaceLoadedRef.current) return;
    const pending = workspacePendingSaveRef.current;
    if (typeof window !== "undefined" && workspaceSaveTimerRef.current) {
      window.clearTimeout(workspaceSaveTimerRef.current);
    }
    workspaceSaveTimerRef.current = null;
    workspacePendingSaveRef.current = null;
    const snapshot = serversRef.current;
    const nextActiveServerId = pending?.activeServerId ?? activeServerIdRef.current;
    saveLocalMessageHistory(snapshot);
    saveWorkspace(snapshot, nextActiveServerId, {
      baseRevision: pending?.baseRevision ?? workspaceRevisionRef.current,
      baseProfile: pending?.baseProfile || workspaceAuthoritativeProfileRef.current,
      deletedServerIds: pending?.deletedServerIds || [],
      replaceMessages: pending?.replaceMessages === true,
      replaceMessageServerIds: pending?.replaceMessageServerIds || [],
    }).catch((error) => {
      console.warn("[aiwb:flush-save:error]", shortError(error));
    });
  }

  async function exportWorkspaceConfig() {
    const snapshot = serversRef.current;
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
    const snapshot = serversRef.current;
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
        taskState: taskStateForMessage(
          [...(Array.isArray(currentActive?.messages) ? currentActive.messages : [])]
            .reverse()
            .find((message) => message?.role === "assistant"),
        ) || "idle",
        messageCount: Array.isArray(currentActive?.messages) ? currentActive.messages.length : 0,
      },
    };
    void appLog("info", "diagnostics.export.start", context);
    const result = await SSHWorkbench.exportLogs({ context });
    if (result?.canceled) {
      return {
        ...result,
        message: "已取消导出，原日志仍然保留。",
      };
    }
    await SSHWorkbench.clearLogs();
    clearBrowserDiagnosticLogs();
    void appLog("info", "diagnostics.export.success", {
      fileName: result?.name,
      path: result?.path,
      serverCount: context.serverCount,
      oldLogsCleared: true,
    });
    return {
      ...result,
      message: "诊断日志已导出，设备上的旧日志已自动清理。",
    };
  }

  async function clearWorkspaceCache({ logs = false, messages = false, app = false, agent = false } = {}) {
    const clearLogs = logs === true;
    const clearMessages = messages === true;
    const clearApp = app === true;
    const clearAgent = agent === true;
    if (!clearLogs && !clearMessages && !clearApp && !clearAgent) {
      return { ok: true, message: "没有选择要清理的内容。" };
    }

    const snapshot = serversRef.current;
    if ((clearMessages || clearAgent) && snapshot.some((server) => serverTaskRunning(server))) {
      throw new Error("还有任务正在运行。请等待任务完成或取消任务后，再清理消息或 Agent 缓存。");
    }
    const directProfiles = new Map();
    if (clearAgent) {
      snapshot.forEach((server) => {
        const directProfile = normalizeProfile(server.profile);
        if (!agentDirectConfig(directProfile).enabled) return;
        directProfiles.set(agentInstallationKey(directProfile), directProfile);
      });
      if (!directProfiles.size) {
        throw new Error("没有可清理的 Agent HTTPS 连接。请先连接至少一台 Agent 机器。");
      }
    }

    setBusy(true);
    try {
      let clearedAgentCount = 0;
      if (clearAgent) {
        const failures = [];
        for (const directProfile of directProfiles.values()) {
          try {
            await agentDirectRequest(directProfile, "/v1/cache/clear", {
              method: "POST",
              body: {},
            });
            clearedAgentCount += 1;
          } catch (error) {
            failures.push(shortError(error));
          }
        }
        if (failures.length) {
          throw new Error(`Agent 缓存清理失败：${failures.join("；")}`);
        }
      }

      let clearedMessageCount = 0;
      if (clearMessages) {
        if (typeof window !== "undefined" && workspaceSaveTimerRef.current) {
          window.clearTimeout(workspaceSaveTimerRef.current);
          workspaceSaveTimerRef.current = null;
        }
        const nextServers = snapshot.map((server) => {
          clearedMessageCount += Array.isArray(server.messages) ? server.messages.length : 0;
          return {
            ...server,
            messages: [],
            rawOutput: "",
            task: {},
            unreadResult: null,
          };
        });
        const activeId = activeServerIdRef.current || activeServerId;

        setServers(nextServers);
        serversRef.current = nextServers;
        setRawOutput("");
        setTaskNotice(null);
        await saveWorkspace(nextServers, activeId, { replaceMessages: true });
      }

      if (clearLogs) {
        await SSHWorkbench.clearLogs();
        clearBrowserDiagnosticLogs();
      }

      if (clearApp) {
        await SSHWorkbench.clearAppCache();
      }

      const parts = [];
      if (clearMessages) parts.push(`已清空 ${clearedMessageCount} 条本地消息`);
      if (clearLogs) parts.push("已清空诊断日志");
      if (clearApp) parts.push("已清理 App 缓存");
      if (clearAgent) parts.push(`已清理 ${clearedAgentCount} 台机器的 Agent 缓存`);
      return {
        ok: true,
        clearedMessageCount,
        clearedAgentCount,
        message: `${parts.join("，")}。会话和服务器配置已保留。`,
      };
    } finally {
      setBusy(false);
    }
  }

  async function importWorkspaceConfig(fileText) {
    const imported = parseWorkspaceMigrationText(fileText);
    const currentServers = serversRef.current;
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
    setActiveServerId(nextActive?.id || "");
    activeServerIdRef.current = nextActive?.id || "";
    setEditingServerId(nextActive?.id || "");
    updateDraftProfile(nextActive?.profile || defaultProfile);
    profileRef.current = nextActive?.profile || defaultProfile;
    setActiveAgentId(normalizeProfile(nextActive?.profile || defaultProfile).agentId);
    await saveWorkspace(nextServers, nextActive?.id || "");

    return {
      count: imported.store.servers.length,
      message: `已导入 ${imported.store.servers.length} 个会话配置。`,
    };
  }

  function cloudSyncDeviceInfo() {
    return {
      clientId: `aiwb-${platform}-${nativeDeviceClass || "desktop"}`,
      deviceName:
        platform === "ios"
          ? nativeDeviceClass === "tablet"
            ? "iPad"
            : "iPhone"
          : platform === "android"
            ? "Android"
            : bridge?.platform === "mac"
              ? "Mac"
              : "AI Workbench",
      platform: bridge?.platform || platform,
    };
  }

  function encryptedPayloadFromCloudRecord(record) {
    return (
      record?.data?.encryptedPayload ||
      record?.data?.payload ||
      record?.encryptedPayload ||
      record?.payload ||
      record?.config ||
      ""
    );
  }

  function showCloudSyncedSessionList(nextServers = []) {
    if (!Array.isArray(nextServers) || !nextServers.length) return;
    setSettingsInitialPage("root");
    setSettingsOpen(false);
    setMobileNavOpen(true);
  }

  async function pullCloudWorkspaceConfig({ endpoint = cloudSyncDefaultEndpoint, account, password } = {}) {
    setBusy(true);
    try {
      const login = await loginCloudConfigSync({
        endpoint,
        account,
        password,
        device: cloudSyncDeviceInfo(),
      });
      const currentServers = serversRef.current;
      let incomingShares = [];
      try {
        const shareResult = await fetchCloudSessionShares({ endpoint, token: login.token });
        incomingShares = Array.isArray(shareResult?.incoming) ? shareResult.incoming : [];
      } catch (error) {
        void appLog("warn", "cloud.share.pull.failed", { error: shortError(error) });
      }
      const remote = await fetchCloudConfigSync({ endpoint, token: login.token });
      const revision = Number(remote?.revision || remote?.config?.revision || 0);
      const encryptedPayload = encryptedPayloadFromCloudRecord(remote?.config || remote);
      // Older cloud-sync deployments may legitimately return revision=0 or omit
      // it. The encrypted payload is the source of truth for whether there is
      // anything to import.
      if (!encryptedPayload) {
        const shared = mergeCloudSharedSessions(currentServers, incomingShares);
        if (shared.addedServers.length) {
          const nextActive = shared.addedServers[0] || shared.servers[0];
          setServers(shared.servers);
          serversRef.current = shared.servers;
          setActiveServerId(nextActive.id);
          activeServerIdRef.current = nextActive.id;
          setEditingServerId(nextActive.id);
          updateDraftProfile(nextActive.profile);
          profileRef.current = nextActive.profile;
          setActiveAgentId(normalizeProfile(nextActive.profile).agentId);
          await saveWorkspace(shared.servers, nextActive.id);
          showCloudSyncedSessionList(shared.servers);
          return {
            added: shared.addedServers.length,
            skipped: shared.skippedShares.length,
            message: `已导入 ${shared.addedServers.length} 个共享会话；已同步 SSH 登录信息，可以直接连接。若原会话没有保存密码，再到会话设置补填。`,
          };
        }
        return {
          added: 0,
          skipped: 0,
          message: incomingShares.length
            ? "没有新的共享会话。云端配置还没有上传过。"
            : "云端还没有配置。可以先在已有配置的设备上点“上传配置到云端”。",
        };
      }

      const cloudPayload = await decryptCloudSyncPayload(encryptedPayload, password);
      const mergedConfig = mergeCloudDownloadedServers(currentServers, cloudPayload);
      const mergedShared = mergeCloudSharedSessions(mergedConfig.servers, incomingShares);
      const addedCount = mergedConfig.addedServers.length + mergedShared.addedServers.length;
      const updatedCount = mergedConfig.updatedServers.length;
      const skippedCount = mergedConfig.skippedServers.length + mergedShared.skippedShares.length;
      const cloudSessionCount = cloudPayload.workspace?.servers?.length || 0;

      if (!addedCount && !updatedCount) {
        return {
          added: 0,
          updated: 0,
          skipped: skippedCount,
          message: `云端找到 ${cloudSessionCount} 个会话，没有可同步的配置变化。`,
        };
      }

      if (cloudPayload.directoryPrefs) {
        saveDirectoryPrefs(mergeDirectoryPrefs(loadDirectoryPrefs(), cloudPayload.directoryPrefs));
      }
      if (cloudPayload.manualWorkdirHistory) {
        saveManualWorkdirHistory(mergeManualWorkdirHistory(loadManualWorkdirHistory(), cloudPayload.manualWorkdirHistory));
      }

      const currentActiveId = activeServerIdRef.current || activeServerId;
      const currentStillExists = mergedShared.servers.some((server) => server.id === currentActiveId);
      const nextActiveServerId = currentStillExists
        ? currentActiveId
        : mergedShared.addedServers[0]?.id || mergedConfig.addedServers[0]?.id || mergedShared.servers[0]?.id;
      const nextActive = mergedShared.servers.find((server) => server.id === nextActiveServerId) || mergedShared.servers[0] || null;

      setServers(mergedShared.servers);
      serversRef.current = mergedShared.servers;
      setActiveServerId(nextActive?.id || "");
      activeServerIdRef.current = nextActive?.id || "";
      setEditingServerId(nextActive?.id || "");
      updateDraftProfile(nextActive?.profile || defaultProfile);
      profileRef.current = nextActive?.profile || defaultProfile;
      setActiveAgentId(normalizeProfile(nextActive?.profile || defaultProfile).agentId);
      await saveWorkspace(mergedShared.servers, nextActive?.id || "");
      showCloudSyncedSessionList(mergedShared.servers);

      return {
        added: addedCount,
        updated: updatedCount,
        skipped: skippedCount,
        message: `云端找到 ${cloudSessionCount} 个会话，已更新 ${updatedCount} 个、新增 ${addedCount} 个。`,
      };
    } finally {
      setBusy(false);
    }
  }

  async function shareSessionWithAccount({
    serverId = activeServerIdRef.current,
    endpoint = cloudSyncDefaultEndpoint,
    account,
    password,
    recipientAccount,
  } = {}) {
    const currentServers = serversRef.current;
    const target = currentServers.find((server) => server.id === serverId);
    if (!target) throw new Error("没有找到要分享的会话。");
    const share = sessionShareFromServer(target);
    const login = await loginCloudConfigSync({
      endpoint,
      account,
      password,
      device: cloudSyncDeviceInfo(),
    });
    await createCloudSessionShare({
      endpoint,
      token: login.token,
      recipientAccount,
      session: share,
    });
    return {
      message: `已分享给 ${String(recipientAccount || "").trim()}。SSH 登录信息会随会话一起同步，对方导入后可以直接连接。`,
    };
  }

  async function pushCloudWorkspaceConfig({ endpoint = cloudSyncDefaultEndpoint, account, password } = {}) {
    setBusy(true);
    try {
      const localServers = serversRef.current;
      const localActiveId = activeServerIdRef.current || activeServerId;
      const localPayload = buildCloudSyncPlainPayload(localServers, localActiveId);
      const localCount = localPayload.workspace.servers.length;
      if (!localCount) {
        throw new Error("本机还没有可上传的配置。请先添加包含工作目录的会话。");
      }

      const login = await loginCloudConfigSync({
        endpoint,
        account,
        password,
        device: cloudSyncDeviceInfo(),
      });
      const remote = await fetchCloudConfigSync({ endpoint, token: login.token });
      const revision = Number(remote?.revision || remote?.config?.revision || 0);
      const encryptedPayload = encryptedPayloadFromCloudRecord(remote?.config || remote);
      const remotePayload = encryptedPayload ? await decryptCloudSyncPayload(encryptedPayload, password) : null;
      const merged = mergeCloudSyncPayloads(remotePayload, localPayload);
      const addedCount = merged.addedServers.length;
      const updatedCount = merged.updatedServers.length;
      const skippedCount = merged.skippedServers.length;

      if (!addedCount && !updatedCount && revision > 0) {
        return {
          added: 0,
          updated: 0,
          skipped: skippedCount,
          message: "本机没有可上传的会话配置变化。",
        };
      }

      const encrypted = await encryptCloudSyncPayload(merged.payload, password);
      const putResult = await putCloudConfigSync({
        endpoint,
        token: login.token,
        encryptedPayload: encrypted,
        baseRevision: revision,
        device: cloudSyncDeviceInfo(),
      });

      return {
        added: addedCount,
        updated: updatedCount,
        skipped: skippedCount,
        revision: putResult?.revision,
        message: `配置已上传到云端，已更新 ${updatedCount} 个、新增 ${addedCount} 个会话。`,
      };
    } finally {
      setBusy(false);
    }
  }

  async function clearCloudWorkspaceConfig({ endpoint = cloudSyncDefaultEndpoint, account, password } = {}) {
    setBusy(true);
    try {
      const login = await loginCloudConfigSync({
        endpoint,
        account,
        password,
        device: cloudSyncDeviceInfo(),
      });
      const result = await deleteCloudConfigSync({ endpoint, token: login.token });
      return {
        revision: Number(result?.revision || 0),
        message: "云端配置已清空。本机已有会话不会被删除，可以重新上传一份新的配置。",
      };
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!workspaceLoaded) return undefined;
    if (applyingExternalProfileRef.current) {
      applyingExternalProfileRef.current = false;
      return undefined;
    }

    queueWorkspaceSave(serversRef.current, activeServerIdRef.current, 700);
    return undefined;
  }, [activeServerId, saveWorkspace, servers, workspaceLoaded]);

  useEffect(() => {
    const handlePageHide = () => flushWorkspaceSave();
    const recoveryTimers = new Set();
    const recoverForegroundTask = async () => {
      if (document.visibilityState !== "visible" || !workspaceLoadedRef.current) return;

      const active = serverById(activeServerIdRef.current);
      const message = lastIncompleteAgentResponse(active);
      if (!active || !message || message.backend !== "agent") return;

      const taskId = String(message.remoteTaskId || "").trim();
      updateAssistantMessageInServer(active.id, message.id, {
        title: "正在刷新最后一条结果",
        body: "App 已回到前台，正在向 Agent 查询任务的最新状态。",
        taskState: taskStateSyncing,
        remoteTaskStatus: "syncing",
        remoteTaskCheckedAt: Date.now(),
        forceUpdate: true,
      });
      void appLog("info", "agent.foreground_recovery.begin", {
        serverId: active.id,
        messageId: message.id,
        remoteTaskId: taskId,
      });

      if (taskId) {
        await syncRemoteAgentMessage(active.id, message);
        return;
      }

      await recoverUnsubmittedAgentMessage(active, message, "foreground");
    };
    const scheduleRecoverySync = (delayMs, { retryOnConnectionFailure = false } = {}) => {
      const timer = window.setTimeout(() => {
        recoveryTimers.delete(timer);
        if (document.visibilityState !== "visible" || !workspaceLoadedRef.current) return;
        recoverForegroundTask()
          .catch((error) => {
            void appLog("warn", "agent.foreground_recovery.failed", { error: shortError(error) });
          })
          .finally(() => {
            if (!retryOnConnectionFailure) return;
            const current = serverById(activeServerIdRef.current);
            if (current?.connection?.state === "error") {
              scheduleRecoverySync(1_500);
            }
          });
      }, delayMs);
      recoveryTimers.add(timer);
    };
    const handleForeground = () => {
      // The browser visibility event is not reliable when Capacitor restores an
      // iPhone app from the background. Both entry points deliberately share
      // the same narrow recovery: only the latest unfinished Agent task.
      scheduleRecoverySync(100, { retryOnConnectionFailure: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushWorkspaceSave();
        return;
      }
      handleForeground();
    };

    let nativeAppStateListener;
    let disposed = false;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (disposed) return;
        if (isActive) {
          handleForeground();
        } else {
          flushWorkspaceSave();
        }
      })
        .then((listener) => {
          if (disposed) listener?.remove?.();
          else nativeAppStateListener = listener;
        })
        .catch(() => {});
    }

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      nativeAppStateListener?.remove?.();
      recoveryTimers.forEach((timer) => window.clearTimeout(timer));
      recoveryTimers.clear();
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeServerId, saveWorkspace, servers]);

  function withKnownPassword(profileValue, serverList = serversRef.current) {
    const normalized = normalizeProfile(profileValue);
    if (String(normalized.password || "").trim()) return normalized;

    const connectionKey = sshEndpointKey(normalized);
    const matched = (serverList || [])
      .map((server) => normalizeProfile(server.profile))
      .find((item) => sshEndpointKey(item) === connectionKey && String(item.password || "").trim());

    return matched?.password ? { ...normalized, password: matched.password } : normalized;
  }

  const saveCurrentProfile = useCallback(async (nextProfile = draftProfileRef.current) => {
    const currentServers = serversRef.current;
    const existing = currentServers.find((server) => server.id === editingServerId);
    const existingProfile = existing ? normalizeProfile(existing.profile) : null;
    const candidateProfile = withKnownPassword(
      existingProfile ? { ...existingProfile, ...nextProfile } : nextProfile,
      currentServers,
    );
    const identityEditable = !existing || existing.pendingIdentityEdit === true;
    const normalized =
      existingProfile && !identityEditable
        ? normalizeProfile({
            ...candidateProfile,
            agentId: existingProfile.agentId,
            platform: existingProfile.platform,
            host: existingProfile.host,
            hostAlternates: candidateProfile.hostAlternates,
            port: existingProfile.port,
            username: existingProfile.username,
            workdir: existingProfile.workdir,
            wslDistro: existingProfile.wslDistro,
          })
        : candidateProfile;
    const name = String(normalized.name || "").trim() || existing?.name || existingProfile?.name || "";
    const workdir = String(normalized.workdir || "").trim() || existingProfile?.workdir || "";
    const profileForServer = {
      ...normalized,
      name,
      workdir,
    };
    const conversationId =
      existing?.pendingIdentityEdit === true
        ? createConversationId(
            [
              normalizeServerPlatform(profileForServer.platform),
              profileForServer.host,
              profileForServer.username,
              profileForServer.workdir,
              profileForServer.agentId,
            ]
              .filter(Boolean)
              .join("-"),
          )
        : existing?.conversationId;
    const nextServerId = existing ? existing.id : createServerId();
    const nextServer = createServerSession(
      {
        ...(existing || {}),
        id: nextServerId,
        conversationId,
        name,
        profile: profileForServer,
        connection: initialConnectionForProfile(profileForServer),
        diagnostics: existing?.diagnostics || {},
        discovery: existing?.discovery || null,
        rawOutput: existing?.rawOutput || "原始输出会在测试连接或发送任务后显示。",
        messages: existing?.messages || [],
        pendingIdentityEdit: false,
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

  function scheduleSessionAutoConnect(serverId, attempt = 0) {
    window.setTimeout(() => {
      if (activeServerIdRef.current !== serverId) return;
      if (sshHostKeyApprovalRequiredSessionIdsRef.current.has(serverId)) return;

      const latestServer = serverById(serverId);
      if (!latestServer || connectionIsLive(latestServer.connection) || latestServer.connection?.channelState === "connecting" || latestServer.connection?.state === "testing") {
        return;
      }

      if (busyRef.current) {
        if (attempt < maxSshReconnectAttempts) scheduleSessionAutoConnect(serverId, attempt + 1);
        return;
      }

      connectExistingSession(serverId)
        .then((connected) => {
          if (!connected && activeServerIdRef.current === serverId && attempt < maxSshReconnectAttempts) {
            scheduleSessionAutoConnect(serverId, attempt + 1);
          }
        })
        .catch((error) => {
          void appLog("warn", "session.switch_auto_connect.failed", {
            serverId,
            error: shortError(error),
          });
        });
    }, attempt ? 500 * attempt : 0);
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
      scheduleSessionAutoConnect(serverId);
      return;
    }

    const nextServer = nextServers.find((server) => server.id === serverId);
    if (!nextServer) return;

    const previousServerId = activeServerIdRef.current;
    // Notices are transient feedback for the visible conversation. A result
    // from another session remains discoverable through its unread marker.
    setTaskNotice((current) => (current?.serverId && current.serverId !== serverId ? null : current));
    setActiveServerId(serverId);
    activeServerIdRef.current = serverId;
    const nextProfile = withKnownPassword(nextServer.profile, nextServers);
    profileRef.current = nextProfile;
    setEditingServerId(serverId);
    updateDraftProfile(nextProfile);
    setActiveAgentId(nextProfile.agentId);
    setRawOpen(false);
    await saveWorkspace(nextServers, serverId);
    if (previousServerId && previousServerId !== serverId) {
      manualDisconnectSessionIdsRef.current.add(previousServerId);
      SSHWorkbench.disconnectSession({ sessionId: previousServerId, preserveTransport: true })
        .catch(() => {})
        .finally(() => manualDisconnectSessionIdsRef.current.delete(previousServerId));
    }
    scheduleSessionAutoConnect(serverId);
  }

  const refreshAgentHealthForServer = useCallback(
    async (serverId, reason = "auto") => {
      const currentServers = serversRef.current;
      const target = currentServers.find((server) => server.id === serverId);
      if (!target) return;

      const targetProfile = withKnownPassword(target.profile, currentServers);
      if (profileIssue(targetProfile)) return;

      const connectionKey = agentInstallationKey(targetProfile);
      const key = `${connectionKey}:${reason}`;
      if (agentHealthRefreshKeysRef.current.has(key) || agentHealthInFlightConnectionsRef.current.has(connectionKey)) return;
      agentHealthRefreshKeysRef.current.add(key);
      agentHealthInFlightConnectionsRef.current.add(connectionKey);

      try {
        const stdout = await runRemoteCommandForProfile(targetProfile, buildWorkbenchAgentTaskListCommand(targetProfile), 768_000, 30);
        const parsed = parseWorkbenchAgentOutput(stdout);
        if (parsed.status !== "ready" && !parsed.version) return;

        // A cached ready flag makes session switching immediate. Version checks
        // remain asynchronous, but an older installed Agent is upgraded on the
        // first successful App connection instead of waiting for manual repair.
        if (
          workbenchAgentVersionNumber(parsed.version) < workbenchAgentVersionNumber(latestWorkbenchAgentVersion) ||
          !workbenchAgentAvailableFromOutput(stdout)
        ) {
          await ensureWorkbenchAgentForProfile(targetProfile, {
            serverId,
            reason: "background-connect-upgrade",
            allowCachedReady: false,
          });
          return;
        }

        const agentHealth = healthFromWorkbenchAgentStatus(parsed);
        patchServersByConnection(
          targetProfile,
          (server, serverProfile) => ({
            ...server,
            diagnostics: {
              ...(server.diagnostics || {}),
              ...agentHealth,
              agent: "available",
              agent_version: agentHealth.agent_version || parsed.version || server.diagnostics?.agent_version || "1",
              agent_checked_at: Date.now(),
            },
            rawOutput: server.id === serverId ? stdout.trim() || server.rawOutput : server.rawOutput,
            connection: {
              ...(server.connection || {}),
              mode: agentPreferredForProfile(serverProfile) ? "agent" : server.connection?.mode || "ssh",
            },
          }),
          { persistDelay: 100 },
        );
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

  function connectExistingSession(serverId = activeServerIdRef.current) {
    const targetServerId = String(serverId || activeServerIdRef.current || "").trim();
    if (!targetServerId) return Promise.resolve(false);

    const existingPromise = sessionConnectionPromisesRef.current.get(targetServerId);
    if (existingPromise) return existingPromise;

    const connectionPromise = connectExistingSessionOnce(targetServerId).finally(() => {
      if (sessionConnectionPromisesRef.current.get(targetServerId) === connectionPromise) {
        sessionConnectionPromisesRef.current.delete(targetServerId);
      }
    });
    sessionConnectionPromisesRef.current.set(targetServerId, connectionPromise);
    return connectionPromise;
  }

  async function connectExistingSessionOnce(serverId) {
    const currentServers = serversRef.current;
    const target = currentServers.find((server) => server.id === serverId) || activeServer;
    if (!target) return false;

    const targetProfile = withKnownPassword(target.profile, currentServers);
    const issue = profileIssue(targetProfile);

    setActiveServerId(target.id);
    activeServerIdRef.current = target.id;
    profileRef.current = targetProfile;
    // A background reconnect may update the active session, but it must never
    // replace the settings target while the user is editing any settings page
    // (especially the global settings page).
    if (!settingsOpenRef.current) {
      setEditingServerId(target.id);
      editingServerIdRef.current = target.id;
      updateDraftProfile(targetProfile);
    }
    setActiveAgentId(targetProfile.agentId);
    setRawOpen(false);

    if (issue) {
      setServerConnection(target.id, { state: "error", label: "待配置", detail: issue });
      openServerSettings(target.id);
      return false;
    }

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
      const stdout = await runWithSshReconnect(
        async () => {
          await SSHWorkbench.connectSession(nativeSshSessionPayload(targetProfile, target.id));
          return runRemoteCommandForProfile(targetProfile, buildHealthCommand(targetProfile), 512_000, 60);
        },
        {
          onRetry: async ({ error, reconnectAttempt }) => {
            manualDisconnectSessionIdsRef.current.add(target.id);
            await SSHWorkbench.disconnectSession({ sessionId: target.id }).catch(() => {});
            manualDisconnectSessionIdsRef.current.delete(target.id);
            setServerConnection(target.id, {
              state: "testing",
              label: "连接断开",
              detail: `正在自动重连 ${reconnectAttempt}/${maxSshReconnectAttempts}`,
              mode: target.connection?.mode || "ssh",
            });
            void appLog("warn", "connection.reconnect", {
              serverId: target.id,
              host: targetProfile.host,
              attempt: reconnectAttempt,
              maxAttempts: maxSshReconnectAttempts,
              error: String(error?.message || error || ""),
            });
          },
        },
      );
      const parsed = parseHealth(stdout);
      const detectedProfile = propagateDetectedMachineProfile(
        targetProfile,
        profileWithDetectedTools(targetProfile, parsed),
      );
      profileRef.current = detectedProfile;
      updateDraftProfileFromSession(target.id, detectedProfile);
      setActiveAgentId(detectedProfile.agentId);
      const agentSetup = await ensureWorkbenchAgentForProfile(detectedProfile, {
        serverId: target.id,
        reason: "session-connect",
        allowCachedReady: true,
      });
      const connectionMode = agentSetup.available ? "agent" : "ssh";
      const nextServers = updateServer(target.id, (server) => ({
              ...server,
              profile: detectedProfile,
              connection: {
                state: "connected",
                label: "已连接",
                detail: agentSetup.available
                  ? "Agent 已就绪"
                  : `${parsed.user || detectedProfile.username}@${parsed.host || detectedProfile.host}`,
                mode: connectionMode,
              },
              diagnostics: {
                ...(server.diagnostics || {}),
                ...parsed,
                ...(agentSetup.agentHealth || {}),
                pwd: parsed.pwd || detectedProfile.workdir,
              },
              discovery: null,
              rawOutput:
                [stdout.trim(), agentSetup.output.trim()].filter(Boolean).join("\n\n") || "连接成功。",
            }));
      await saveWorkspace(nextServers, target.id);
      const connectedServer = nextServers.find((server) => server.id === target.id);
      if (agentSetup.available && serverNeedsAgentConversationRecovery(connectedServer)) {
        await syncAgentConversationForServer(connectedServer, {
          limit: 1,
          reason: "session-connect-pending-task",
        });
      }
      if (agentSetup.cached) {
        // A cached Agent lets the chat open immediately; refresh version and task
        // health after the connection path finishes instead of blocking it.
        void refreshAgentHealthForServer(target.id, "background-connect");
      }
      return true;
    } catch (error) {
      const message = shortError(error);
      const hostKeyMatch = String(error?.message || error || "").match(/SSH_HOST_KEY_UNTRUSTED:(sha256\/[A-Za-z0-9+/=]+)/);
      const changedHostKeyMatch = String(error?.message || error || "").match(/SSH_HOST_KEY_CHANGED:(sha256\/[A-Za-z0-9+/=]+)/);
      if (hostKeyMatch && typeof window !== "undefined") {
        sshHostKeyApprovalRequiredSessionIdsRef.current.add(target.id);
        const approved = window.confirm(
          `连接新服务器\n\n这是你刚刚添加的服务器「${targetProfile.host}」吗？\n\n确认后，AI Workbench 会记住这台机器的安全凭证，之后不会再询问。`,
        );
        if (approved) {
          sshHostKeyApprovalRequiredSessionIdsRef.current.delete(target.id);
          const sshIdentityUpdatedAt = Date.now();
          const trustedProfile = {
            ...targetProfile,
            sshHostKeyFingerprint: hostKeyMatch[1],
            sshIdentityUpdatedAt,
          };
          const nextServers = patchServersBySshEndpoint(
            targetProfile,
            (server) => ({
              ...server,
              profile: {
                ...(server.profile || {}),
                sshHostKeyFingerprint: hostKeyMatch[1],
                sshIdentityUpdatedAt,
              },
            }),
            { persistDelay: 0 },
          );
          await saveWorkspace(nextServers, target.id);
          return connectExistingSessionOnce(target.id);
        }
        setServerConnection(target.id, {
          state: "error",
          label: "等待安全确认",
          detail: "请确认服务器身份后再连接",
          mode: target.connection?.mode || "ssh",
        });
        return false;
      }
      if (changedHostKeyMatch) {
        sshHostKeyApprovalRequiredSessionIdsRef.current.add(target.id);
        updateServer(target.id, {
          connection: {
            state: "error",
            label: "安全校验失败",
            detail: "这台服务器的安全凭证与上次不同",
          },
          discovery: null,
          rawOutput: "服务器身份与上次连接不一致。为保护登录密码，App 已阻止连接。请确认机器没有被替换后，在会话设置里重新连接。",
        });
        return false;
      }
      void appLog("error", "connection.failed", {
        serverId: target.id,
        host: targetProfile.host,
        attempts: error?.reconnectAttempts || 0,
        error: String(error?.cause?.message || error?.message || error || ""),
      });
      updateServer(target.id, {
        connection: { state: "error", label: "连接异常", detail: message },
        discovery: null,
        rawOutput: "连接异常",
      });
      return false;
    }
  }

  useEffect(() => {
    if (!workspaceLoaded) return undefined;
    const target = serverById(activeServerIdRef.current);
    if (!target || !profileReady(withKnownPassword(target.profile))) return undefined;

    const reconnectKey = `${target.id}:${profileConnectionKey(normalizeProfile(target.profile))}`;
    if (startupSessionReconnectRef.current === reconnectKey) return undefined;

    const recoveringMessage = lastIncompleteAgentResponse(target);
    if (recoveringMessage?.backend === "agent") {
      updateAssistantMessageInServer(target.id, recoveringMessage.id, {
        title: "正在刷新最后一条结果",
        body: "App 正在连接 Agent，并查询上一次任务的最新状态。",
        taskState: taskStateSyncing,
        remoteTaskStatus: "syncing",
        remoteTaskCheckedAt: Date.now(),
        forceUpdate: true,
      });
    }

    setServerConnection(target.id, {
      state: "testing",
      label: "连接中",
      detail: target.profile?.workdir || `${target.profile?.username}@${target.profile?.host}`,
      mode: target.connection?.mode || "",
    });

    const timer = window.setTimeout(() => {
      if (startupSessionReconnectRef.current === reconnectKey) return;
      startupSessionReconnectRef.current = reconnectKey;
      void appLog("info", "session.startup_reconnect.begin", {
        serverId: target.id,
        conversationId: target.conversationId || "",
      });
      connectExistingSession(target.id).catch((error) => {
        void appLog("warn", "session.startup_reconnect.failed", {
          serverId: target.id,
          error: shortError(error),
        });
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [workspaceLoaded]);

  useEffect(() => {
    const handleConnectionState = (payload = {}) => {
      const serverId = String(payload.sessionId || "").trim();
      const state = String(payload.state || "").trim().toLowerCase();
      const detail = String(payload.detail || "");
      if (!serverId || !state) return;

      const target = serverById(serverId);
      if (!target) return;
      const manuallyDisconnected = manualDisconnectSessionIdsRef.current.has(serverId);

      const untrustedHostKey = detail.match(/SSH_HOST_KEY_UNTRUSTED:(sha256\/[A-Za-z0-9+/=]+)/);
      const changedHostKey = detail.match(/SSH_HOST_KEY_CHANGED:(sha256\/[A-Za-z0-9+/=]+)/);
      if (untrustedHostKey || changedHostKey) {
        sshHostKeyApprovalRequiredSessionIdsRef.current.add(serverId);
        setServerConnection(serverId, {
          state: "error",
          label: changedHostKey ? "安全校验失败" : "等待安全确认",
          detail: changedHostKey ? "SSH 主机指纹已变化" : "请确认服务器身份后再连接",
          mode: target.connection?.mode || "ssh",
        });
        return;
      }

      if (state === "connecting") {
        if (serverId === activeServerIdRef.current) {
          setServerConnection(serverId, {
            state: "testing",
            label: "连接中",
            detail: "正在建立 SSH 长连接",
            mode: target.connection?.mode || "ssh",
          });
        }
        return;
      }
      if (state === "connected") {
        manualDisconnectSessionIdsRef.current.delete(serverId);
        sshHostKeyApprovalRequiredSessionIdsRef.current.delete(serverId);
        if (
          serverId === activeServerIdRef.current &&
          busyRef.current &&
          target.connection?.state === "testing"
        ) {
          setServerConnection(serverId, {
            state: "testing",
            label: "连接中",
            detail: "SSH 已连接，正在检查工作环境",
            mode: target.connection?.mode || "ssh",
          });
          return;
        }
        setServerConnection(serverId, {
          state: "connected",
          label: "已连接",
          detail: target.profile?.workdir || `${target.profile?.username}@${target.profile?.host}`,
          mode: target.connection?.mode || "ssh",
        });
        return;
      }
      if (state !== "closed" && state !== "error") return;

      if (manuallyDisconnected || serverId !== activeServerIdRef.current) {
        setServerConnection(serverId, dormantConnectionForProfile(target.profile, target.connection, "未连接"));
        return;
      }

      setServerConnection(serverId, {
        state: "testing",
        label: "连接断开",
        detail: "正在自动重连",
        mode: target.connection?.mode || "ssh",
      });
      if (busyRef.current) return;
      scheduleSessionAutoConnect(serverId, 1);
    };

    const bridge = Core.desktopBridge?.();
    const desktopUnsubscribe = bridge?.onConnectionState?.(handleConnectionState);
    let nativeSubscription;
    let cancelled = false;
    if (Capacitor.isNativePlatform() && typeof SSHWorkbench.addListener === "function") {
      SSHWorkbench.addListener("connectionState", handleConnectionState)
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
      desktopUnsubscribe?.();
      nativeSubscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    const handleUploadProgress = (payload = {}) => {
      const uploadId = String(payload.uploadId || "").trim();
      if (!uploadId) return;
      const activeEntry = [...activeUploadByServerRef.current.entries()].find(([, value]) => value?.uploadId === uploadId);
      if (!activeEntry) return;
      const [serverId, activeUpload] = activeEntry;
      const bytesSent = Math.max(0, Number(payload.bytesSent || 0));
      const totalBytes = Math.max(0, Number(payload.totalBytes || activeUpload.expectedSize || 0));
      const rawProgress = Number(payload.progress);
      const derivedPercent = totalBytes > 0 ? (bytesSent / totalBytes) * 100 : 0;
      const percent = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            Number.isFinite(rawProgress) ? (rawProgress <= 1 ? rawProgress * 100 : rawProgress) : derivedPercent,
          ),
        ),
      );
      const progressBucket = percent >= 100 ? 100 : Math.floor(percent / 5) * 5;
      if (progressBucket <= Number(activeUpload.lastProgressPercent ?? -1)) return;
      activeUpload.lastProgressPercent = progressBucket;
      void appLog("info", "agent.upload.progress", {
        serverId,
        uploadId,
        bytesSent,
        totalBytes,
        progress: progressBucket,
      });
      if (activeUpload.assistantMessageId) {
        updateAssistantMessageInServer(serverId, activeUpload.assistantMessageId, {
          title: "上传中",
          body: `正在上传附件 ${activeUpload.fileIndex}/${activeUpload.fileCount}：${activeUpload.name}（${progressBucket}%）`,
          taskState: taskStateSubmitting,
          forceUpdate: true,
        });
      }
    };
    let nativeSubscription;
    let desktopUnsubscribe;
    let cancelled = false;
    const bridge = desktopBridge();
    if (typeof bridge?.onUploadProgress === "function") {
      desktopUnsubscribe = bridge.onUploadProgress(handleUploadProgress);
    }
    if (Capacitor.isNativePlatform() && typeof SSHWorkbench.addListener === "function") {
      SSHWorkbench.addListener("uploadProgress", handleUploadProgress)
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
      desktopUnsubscribe?.();
      nativeSubscription?.remove?.();
    };
  }, []);

  async function disconnectSession(serverId = activeServerIdRef.current) {
    if (busy) return;
    const currentServers = serversRef.current;
    const target = currentServers.find((server) => server.id === serverId) || activeServer;
    if (!target || serverTaskRunning(target)) return;

    const targetProfile = withKnownPassword(target.profile, currentServers);
    manualDisconnectSessionIdsRef.current.add(target.id);
    await SSHWorkbench.disconnectSession({ sessionId: target.id }).catch(() => {});
    const nextConnection = {
      ...dormantConnectionForProfile(targetProfile, target.connection, "未连接"),
      detail: "已断开",
    };

    setServerConnection(target.id, nextConnection);
    if (target.id === activeServerIdRef.current) {
      setRawOpen(false);
      setRawOutput("已断开当前 App 里的连接状态。配置和历史记录仍然保留。");
    }
    const nextServers = updateServer(target.id, { connection: nextConnection });
    await saveWorkspace(nextServers, activeServerIdRef.current);
    manualDisconnectSessionIdsRef.current.delete(target.id);
  }

  function openServerSettings(serverId = activeServerIdRef.current) {
    const currentServers = serversRef.current;
    const target = currentServers.find((server) => server.id === serverId) || activeServer;
    const targetProfile = withKnownPassword(target.profile, currentServers);
    setEditingServerId(target.id);
    editingServerIdRef.current = target.id;
    updateDraftProfile(targetProfile);
    setSettingsDiscovery(null);
    setSettingsSelectedSessions([]);
    setSettingsAgentTab(targetProfile.agentId);
    setAgentManagementTargetId("");
    setSettingsInitialPage("root");
    settingsOpenRef.current = true;
    setSettingsOpen(true);
    void refreshSettingsHealth(targetProfile, target.id);
  }

  function openGlobalSettings(targetServerId = "") {
    const nextAgentTargetId = typeof targetServerId === "string" ? targetServerId : "";
    setEditingServerId("global");
    editingServerIdRef.current = "global";
    updateDraftProfile({
      ...defaultProfile,
      ...globalSettingsFromProfile(profileRef.current),
    });
    setSettingsDiscovery(null);
    setSettingsSelectedSessions([]);
    setSettingsAgentTab(activeAgentId);
    setAgentManagementTargetId(nextAgentTargetId);
    setSettingsInitialPage("root");
    settingsOpenRef.current = true;
    setSettingsOpen(true);
  }

  function openCloudSyncSettings() {
    setEditingServerId("global");
    editingServerIdRef.current = "global";
    updateDraftProfile({
      ...defaultProfile,
      ...globalSettingsFromProfile(profileRef.current),
    });
    setSettingsDiscovery(null);
    setSettingsSelectedSessions([]);
    setSettingsAgentTab(activeAgentId);
    setAgentManagementTargetId("");
    setSettingsInitialPage("global-cloud-sync");
    settingsOpenRef.current = true;
    setSettingsOpen(true);
  }

  function openGlobalVoiceSettings() {
    setEditingServerId("global");
    editingServerIdRef.current = "global";
    updateDraftProfile({
      ...defaultProfile,
      ...globalSettingsFromProfile(profileRef.current),
    });
    setSettingsDiscovery(null);
    setSettingsSelectedSessions([]);
    setSettingsAgentTab(activeAgentId);
    setAgentManagementTargetId("");
    setSettingsInitialPage("global-voice");
    settingsOpenRef.current = true;
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
      name: "",
    };
    setEditingServerId("");
    editingServerIdRef.current = "";
    updateDraftProfile(nextProfile);
    setSettingsDiscovery(null);
    setSettingsSelectedSessions([]);
    setSettingsAgentTab("codex");
    setAgentManagementTargetId("");
    setSettingsInitialPage("root");
    settingsOpenRef.current = true;
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
    const currentServers = serversRef.current;
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
    const savedProfile = await saveCurrentProfile(nextProfile);
    setSettingsOpen(false);
    enqueueTaskNotice({
      serverId: activeServerIdRef.current,
      title: `「${savedProfile.name || "会话"}」已保存`,
      tone: "done",
    });
  }

  async function openSshTerminal(profileOverride = draftProfileRef.current, terminalOptions = {}) {
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
        sshHostKeyFingerprint: currentProfile.sshHostKeyFingerprint,
        platform: normalizeServerPlatform(currentProfile.platform),
        wslDistro: currentProfile.wslDistro,
        workdir: currentProfile.workdir,
        tmuxSession: sessionName(currentProfile, currentProfile.agentId),
        ...terminalOptions,
      });
    } catch (error) {
      const message = shortError(error);
      setRawOpen(true);
      setRawOutput(message);
      window.alert(message);
      if (terminalOptions.throwOnError) throw error;
    }
  }

  async function openRemoteAgentLogin(agentId = "codex", mode = "start", authorizationCode = "", profileOverride = draftProfileRef.current) {
    const currentProfile = normalizeProfile(profileOverride);
    if (!String(currentProfile.host || "").trim() || !String(currentProfile.username || "").trim()) {
      window.alert("请先填写服务器地址和用户名。");
      return;
    }

    const agent = agentById(agentId === "claude" ? "claude" : "codex");
    try {
      const output = await runRemoteCommandForProfile(
        currentProfile,
        mode === "status"
          ? buildToolLoginStatusCommand(currentProfile, agent)
          : mode === "submit"
            ? buildToolLoginSubmitCommand(currentProfile, agent, authorizationCode)
            : buildToolLoginStartCommand(currentProfile, agent),
        1_048_576,
        45,
      );
      setConnection({
        state: "testing",
        label:
          mode === "status"
            ? `已检查 ${agent.shortName} 登录`
            : mode === "submit"
              ? `已提交 ${agent.shortName} 授权密钥`
              : `等待 ${agent.shortName} 登录`,
        detail:
          mode === "status"
            ? "已读取远端 CLI 登录状态"
            : mode === "submit"
              ? "远端 CLI 已接收授权密钥"
              : "请在 App 内完成浏览器授权",
        mode: "ssh",
      });
      return String(output || "").trim();
    } catch (error) {
      const message = shortError(error);
      setConnection({
        state: "error",
        label: "登录准备失败",
        detail: message,
        mode: "ssh",
      });
      throw error;
    }
  }

  async function installWorkbenchAgentForServer(serverId = activeServerIdRef.current) {
    if (busy) return;
    const currentServers = serversRef.current;
    const targetServer = currentServers.find((server) => server.id === serverId) || serverById(activeServerIdRef.current);
    if (!targetServer) {
      window.alert("没有找到要管理的远端机器。");
      return;
    }
    const targetServerId = targetServer.id;
    const nextProfile = withKnownPassword(targetServer.profile, currentServers);
    const issue = profileIssue(nextProfile);
    if (issue) {
      window.alert(issue);
      return;
    }

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommandForProfile(nextProfile, buildInstallWorkbenchAgentCommand(nextProfile), 128_000, 300);
      const parsed = parseWorkbenchAgentOutput(output);
      if (parsed.status !== "ready") {
        throw new Error(parsed.error || trimVisibleText(output) || "Agent 安装失败。");
      }
      const agentHealth = healthFromWorkbenchAgentStatus(parsed);
      const nextServers = patchServersByConnection(nextProfile, (server) => {
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

  async function installCliForServer(serverId = activeServerIdRef.current, cliId = "codex") {
    if (busy) return;
    const normalizedCliId = String(cliId || "codex").toLowerCase() === "claude" ? "claude" : "codex";
    const cliName = normalizedCliId === "claude" ? "Claude" : "Codex";
    const currentServers = serversRef.current;
    const targetServer = currentServers.find((server) => server.id === serverId) || serverById(activeServerIdRef.current);
    if (!targetServer) {
      window.alert("没有找到要管理的远端机器。");
      return;
    }
    const targetServerId = targetServer.id;
    const nextProfile = withKnownPassword(targetServer.profile, currentServers);
    const issue = profileIssue(nextProfile);
    if (issue) {
      window.alert(issue);
      return;
    }

    setBusy(true);
    setRawOpen(false);
    let output = "";
    let parsed = null;
    try {
      output = await runRemoteCommandForProfile(nextProfile, buildInstallCliCommand(nextProfile, normalizedCliId), 256_000, 300);
      parsed = parseWorkbenchAgentOutput(output);
      if (parsed.cliId !== normalizedCliId || parsed.cliStatus !== "ready") {
        throw new Error(parsed.cliError || trimVisibleText(output) || `${cliName} CLI 安装失败。`);
      }
      const cliHealth = healthFromWorkbenchAgentStatus(parsed);
      const cliPath = String(parsed.cliPath || "").trim();
      const machineProfileUpdatedAt = Date.now();
      const readableResult = `${cliName} CLI 已安装并验证可执行。${cliPath ? `\n路径：${cliPath}` : ""}`;
      const nextServers = patchServersByConnection(nextProfile, (server) => {
        return {
          ...server,
          profile: cliPath
            ? {
                ...(server.profile || {}),
                [normalizedCliId === "claude" ? "claudeCommand" : "codexCommand"]: cliPath,
                machineProfileUpdatedAt,
              }
            : server.profile,
          diagnostics: {
            ...(server.diagnostics || {}),
            ...cliHealth,
          },
          rawOutput: server.id === targetServerId ? readableResult : server.rawOutput,
        };
      });
      await saveWorkspace(nextServers, activeServerIdRef.current);
      setRawOutput(readableResult);
      window.alert(`${readableResult}\n\n现在可以重新检测或发送任务。`);
      return { cliId: normalizedCliId, path: cliPath, message: readableResult };
    } catch (error) {
      const message = parsed?.cliError || (String(error?.message || error).match(/ENOSPC|no space left on device/i) ? `远端磁盘空间不足，${cliName} CLI 没有完成安装。请先清理 Windows 磁盘空间后再重试。` : shortError(error));
      setRawOutput(message);
      window.alert(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function uninstallWorkbenchAgentForServer(serverId = activeServerIdRef.current) {
    if (busy) return;
    const currentServers = serversRef.current;
    const targetServer = currentServers.find((server) => server.id === serverId) || serverById(activeServerIdRef.current);
    if (!targetServer) {
      window.alert("没有找到要管理的远端机器。");
      return;
    }
    const nextProfile = withKnownPassword(targetServer.profile, currentServers);
    const issue = profileIssue(nextProfile);
    if (issue) {
      window.alert(issue);
      return;
    }

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommandForProfile(nextProfile, buildUninstallWorkbenchAgentCommand(nextProfile), 128_000, 60);
      const parsed = parseWorkbenchAgentOutput(output);
      if (parsed.status && !["removed", "missing"].includes(parsed.status)) {
        throw new Error(parsed.error || trimVisibleText(output) || "Agent 卸载失败。");
      }
      const nextServers = patchServersByConnection(nextProfile, (server) => {
        return {
          ...server,
          diagnostics: {
            ...(server.diagnostics || {}),
            agent: "missing",
            agent_version: "",
            agent_service_status: "removed",
            agent_daemon_status: "stopped",
            agent_task_list: [],
            agent_tasks_queued: "0",
            agent_tasks_running: "0",
          },
          connection: {
            ...(server.connection || {}),
            mode: "agent",
            state: server.id === serverId ? "error" : server.connection?.state,
            label: server.id === serverId ? "Agent 未安装" : server.connection?.label,
            detail: server.id === serverId ? "重新安装 Agent 后才能执行任务" : server.connection?.detail,
          },
          rawOutput: server.id === serverId ? output.trim() || "Agent 已卸载。" : server.rawOutput,
        };
      });
      await saveWorkspace(nextServers, activeServerIdRef.current);
      window.alert("Agent 已卸载。工作目录和 Codex/Claude 未删除；重新安装 Agent 前无法执行 AI 任务。");
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
      "将在这台 Windows 机器上启用 WSL 2 并安装 Ubuntu。不会自动安装或修改 Node.js、Codex、Claude 等开发工具。需要管理员权限，安装完成后可能需要重启机器。是否继续？",
    );
    if (!confirmed) return;

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommandForProfile(nextProfile, buildInstallWslCommand(nextProfile), 2_097_152, 2 * 60 * 60);
      setRawOutput(output.trim());
      const result = parseHealth(output);
      const status = String(result.wsl_install_status || "").trim();
      if (status === "ready") {
        const wslProfile = wslProfileFromWindowsProfile(nextProfile, result.wsl_default_distro);
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
    const gitDraftProfile = normalizeProfile({
      ...draftProfileRef.current,
      gitRepoUrl: String(options.repoUrl || "").trim(),
      gitTargetDir: String(options.targetDir || draftProfileRef.current?.gitTargetDir || "").trim(),
      gitBranch: String(options.branch || "").trim(),
    });
    // Git fields are an operational preference. Persist them before execution so a
    // failed clone never makes the user re-enter the repository address.
    updateDraftProfile(gitDraftProfile);
    const savedProfile = await saveCurrentProfile(gitDraftProfile);
    const nextProfile = withKnownPassword(savedProfile);
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
        throw new Error(readableGitOperationError(output));
      }
      if (parsed.git_operation_verified !== "1") {
        throw new Error(readableGitOperationError(output));
      }
      const status = parsed.git_operation_status || "done";
      const target = parsed.git_operation_target || options.targetDir || nextProfile.workdir || "";
      const message = status === "updated" ? "仓库已更新。" : status === "cloned" ? "仓库已下载。" : "Git 操作完成。";
      const gitProfile = normalizeProfile({
        ...nextProfile,
        gitRepoUrl: String(options.repoUrl || "").trim(),
        gitTargetDir: target,
        gitBranch: String(options.branch || "").trim(),
      });
      updateDraftProfile(gitProfile);
      setRawOutput(output.trim() || message);
      updateServer(targetServerId, (server) => ({
        profile: gitProfile,
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
      const rawMessage = String(error?.message || error || "");
      const message = /__AIWB_GIT_OPERATION_(?:ERROR|DETAIL_B64)__/.test(rawMessage)
        ? readableGitOperationError(rawMessage)
        : shortError(error);
      setRawOutput(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function inspectGitSshKeyForEditingServer(options = {}) {
    if (busy) return null;
    const nextProfile = withKnownPassword(draftProfileRef.current);
    const issue = profileIssue(nextProfile);
    if (issue) throw new Error(issue);

    setBusy(true);
    try {
      const output = await runRemoteCommandForProfile(
        nextProfile,
        buildGitSshKeyCommand(nextProfile, { generate: options.generate === true }),
        256_000,
        120,
      );
      const parsed = parseHealth(output);
      if (parsed.git_ssh_key_error) throw new Error(parsed.git_ssh_key_error);

      return {
        status: parsed.git_ssh_key_status || "missing",
        publicKey: parsed.git_ssh_key_public_key || "",
        path: parsed.git_ssh_key_path || "",
        fingerprint: parsed.git_ssh_key_fingerprint || "",
      };
    } finally {
      setBusy(false);
    }
  }

  async function duplicateServer(serverId = activeServerIdRef.current) {
    if (busy) return;
    const currentServers = serversRef.current;
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
        conversationId: createConversationId(
          [
            normalizeServerPlatform(duplicateProfile.platform),
            duplicateProfile.host,
            duplicateProfile.username,
            duplicateProfile.workdir,
            duplicateProfile.agentId,
          ]
            .filter(Boolean)
            .join("-"),
        ),
        name: duplicateName,
        profile: duplicateProfile,
        connection: readyConnectionForSession(duplicateProfile, source.connection),
        diagnostics: source.diagnostics,
        discovery: null,
        rawOutput: source.rawOutput,
        pendingIdentityEdit: true,
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
    return {
      id: duplicate.id,
      name: duplicateName,
    };
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
      let detectedProfile = propagateDetectedMachineProfile(
        nextProfile,
        profileWithDetectedTools(nextProfile, parsed),
      );
      if (
        detectedProfile.platform !== nextProfile.platform ||
        detectedProfile.wslDistro !== nextProfile.wslDistro ||
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

  async function refreshSettingsHealth(profileOverride, serverId) {
    const nextProfile = withKnownPassword(profileOverride);
    if (profileIssue(nextProfile)) return;
    try {
      const healthOutput = await runRemoteCommandForProfile(nextProfile, buildHealthCommand(nextProfile), 512_000, 60);
      const parsed = parseHealth(healthOutput);
      setSettingsDiscovery((current) => ({
        ...(current || {
          state: "ready",
          directories: [],
          tools: [],
          activeSessions: [],
          recentSessions: [],
          conversations: [],
          history: {},
        }),
        health: { ...(current?.health || {}), ...parsed },
      }));
      updateServer(serverId, (server) => ({
        diagnostics: { ...(server.diagnostics || {}), ...parsed },
        rawOutput: healthOutput.trim() || server.rawOutput,
      }));
    } catch (error) {
      void appLog("warn", "settings.health.refresh.failed", {
        host: nextProfile.host,
        error: shortError(error),
      });
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
      const name = titleName || workdirDisplayName(path);
      const profileForSession = normalizeProfile({
        ...sourceProfile,
        name,
        workdir: path,
        agentId: normalizedAgent,
      });
      const conversationTaskState = taskStateFromRemoteStatus(conversation?.status, {
        hasTaskId: Boolean(conversation?.taskId),
      });
      // Keep history device-local, but restore the current unfinished turn so task state has one owner.
      const conversationMessages = taskStateIsActive(conversationTaskState)
        ? messagesFromAgentConversation(conversation, normalizedAgent).slice(-2)
        : [];
      const conversationTask = taskMetadataFromAgentConversation(conversation, normalizedAgent);
      const sessionPayload = {
        conversationId: conversation?.id || "",
        name,
        profile: profileForSession,
        connection: readyConnectionForSession(profileForSession, {
          mode: agentPreferredForProfile(profileForSession) ? connectionModeFromHealth(sourceDiagnostics) : "ssh",
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
            task: Object.keys(sessionPayload.task || {}).length ? sessionPayload.task : existing.task,
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
      const stdout = await runWithSshReconnect(
        () => runRemoteCommand(buildHealthCommand(nextProfile), 512_000, 60),
        {
          onRetry: ({ error, reconnectAttempt }) => {
            setConnection({
              state: "testing",
              label: "连接断开",
              detail: `正在自动重连 ${reconnectAttempt}/${maxSshReconnectAttempts}`,
            });
            void appLog("warn", "connection.test.reconnect", {
              host: nextProfile.host,
              attempt: reconnectAttempt,
              maxAttempts: maxSshReconnectAttempts,
              error: String(error?.message || error || ""),
            });
          },
        },
      );
      const parsed = parseHealth(stdout);
      const detectedProfile = propagateDetectedMachineProfile(
        nextProfile,
        profileWithDetectedTools(nextProfile, parsed),
      );
      profileRef.current = detectedProfile;
      updateDraftProfile(detectedProfile);
      setActiveAgentId(detectedProfile.agentId);
      const agentSetup = await ensureWorkbenchAgentForProfile(detectedProfile, {
        serverId: activeServerIdRef.current,
        onProgress: setConnection,
        reason: "new-session",
      });
      setConnection({
        state: "testing",
        label: "扫描中",
        detail: agentSetup.available ? "Agent 已就绪，正在扫描会话" : parsed.pwd || detectedProfile.workdir,
      });

      let scanOutput = "";
      let scan = null;
      try {
        scanOutput = await runRemoteCommandForProfile(detectedProfile, buildDiscoveryCommand(detectedProfile), 1_048_576, 180);
        scan = parseDiscovery(scanOutput);
        if (agentSetup.available) {
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

      const rawOutput = [stdout.trim(), agentSetup.output.trim(), scanOutput.trim()]
        .filter(Boolean)
        .join("\n\n") || "连接成功。";
      const connectedState = {
        state: "connected",
        label: "已连接",
        detail: agentSetup.available
          ? "Agent 已就绪"
          : `${parsed.user || detectedProfile.username}@${parsed.host || detectedProfile.host}`,
        mode: agentSetup.available ? "agent" : "ssh",
      };
      const nextServers = updateServer(activeServerIdRef.current, {
        profile: detectedProfile,
        diagnostics: {
          ...parsed,
          ...(agentSetup.agentHealth || {}),
        },
        discovery: scan,
        rawOutput,
        connection: connectedState,
      });
      try {
        await saveWorkspace(nextServers, activeServerIdRef.current);
      } catch (persistenceError) {
        void appLog("warn", "connection.profile_persistence.failed", {
          host: detectedProfile.host,
          error: shortError(persistenceError),
        });
      }
    } catch (error) {
      const message = shortError(error);
      void appLog("error", "connection.test.failed", {
        host: nextProfile.host,
        attempts: error?.reconnectAttempts || 0,
        error: String(error?.cause?.message || error?.message || error || ""),
      });
      setRawOutput("连接异常");
      setConnection({ state: "error", label: "连接异常", detail: message });
    } finally {
      setBusy(false);
    }
  }

  async function runAgentPrompt({
    serverId,
    currentProfile,
    agent,
    text,
    turnId = "",
    assistantMessageId,
    userMessageId = "",
  }) {
    assertSessionDispatch(serverById(serverId), {
      sessionId: serverId,
      agentId: agent?.id,
      profile: currentProfile,
    });

    const applyAgentOutput = (output, final = false, completedAgentTask = false) => {
      const raw = String(output || "").trim();
      const extracted = completedAgentTask ? extractCompletedAgentOutput(raw, text) : extractAgentFinalOutput(raw, text);
      const visibleOutput = extracted.final ? extracted.text : "";
      const hasFinalOutput = Boolean(extracted.final && visibleOutput);
      setServerRawOutput(serverId, raw);

      if (!hasFinalOutput && isCodexLoginPrompt(raw)) {
        if (serverId === activeServerIdRef.current) setRawOpen(false);
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `${agent.shortName} 需要登录`,
          body: "远端 Codex 登录已过期。生成设备码后，在浏览器完成一次登录即可继续使用。",
          output: "",
          taskState: taskStateFailed,
          requiredAction: "login",
          loginAction: { prompt: text, agentId: agent.id },
          modelChoice: undefined,
        });
        setServerConnection(serverId, { state: "connected", detail: `${agent.shortName} 需要登录` });
        return false;
      }

      if (!hasFinalOutput && agent.id === "codex" && /401 Unauthorized|Missing bearer|authentication/i.test(raw)) {
        if (serverId === activeServerIdRef.current) setRawOpen(false);
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `${agent.shortName} 需要登录`,
          body: "远端 Codex 登录已过期。生成设备码后，在浏览器完成一次登录即可继续使用。",
          output: "",
          taskState: taskStateFailed,
          requiredAction: "login",
          loginAction: { prompt: text, agentId: agent.id },
          modelChoice: undefined,
        });
        setServerConnection(serverId, { state: "connected", detail: `${agent.shortName} 需要登录` });
        return false;
      }

      if (!hasFinalOutput && isCodexModelChoicePrompt(raw)) {
        if (serverId === activeServerIdRef.current) setRawOpen(false);
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: `${agent.shortName} 需要选择模型`,
          body: "Codex CLI 检测到 GPT-5.5 可用。选择后会继续发送刚才的任务。",
          output: "",
          taskState: taskStateFailed,
          requiredAction: "model-choice",
          loginAction: undefined,
          modelChoice: { prompt: text, agentId: agent.id },
        });
        setServerConnection(serverId, { state: "connected", detail: `${agent.shortName} 等待选择模型` });
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
          taskState: taskStateFailed,
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

      const deferredWaitingAnswer =
        !completedAgentTask && extracted.final && visibleOutput && looksLikeDeferredWaitingAnswer(visibleOutput);

      if (deferredWaitingAnswer) {
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: "没有最终结果",
          body: "远端 AI 把“等待通知/稍后继续”当成最终回复返回了，任务没有真正完成。请重新发送，或明确要求它直接检查状态直到成功、失败或阻塞。",
          output: "",
          liveOutput: "",
          taskState: taskStateFailed,
          backend: agentPreferredForProfile(currentProfile) ? "agent" : "ssh",
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
            ? "没有最终结果"
            : "执行中",
        body: visibleOutput
          ? ""
          : endedWithoutFinalOutput
            ? "任务已经结束，但没有收到可展示的结果。可以重新同步，或重新发送。"
            : final
              ? agent.id === "claude"
                ? "还没有拿到最终回复。Claude 长任务可能暂时没有中间输出，请继续等待或查看原始输出。"
                : `还没有拿到最终回复，可以点“刷新状态”继续检查。`
              : `正在等待 ${agent.shortName} 返回结果。`,
        output: visibleOutput,
        liveOutput: "",
        taskState: done
          ? taskStateSucceeded
          : endedWithoutFinalOutput
            ? taskStateFailed
            : taskStateRunning,
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
      void appLog("info", "agent.route.selected", {
        serverId,
        agentId: agent.id,
        host: currentProfile.host,
        platform: currentProfile.platform,
        configured: true,
        effective: true,
      });

      const connectionKey = agentInstallationKey(currentProfile);
      const cachedProbe = agentRouteProbeByConnectionRef.current.get(connectionKey);
      let directRouteReady = false;
      let directHealthOutput = "";
      let trustedDirectPlatform = "";
      const taskSubmissionReadyFromOutput = (output) => {
        const parsed = parseWorkbenchAgentOutput(output);
        return agentTaskSubmissionReady({
          available: workbenchAgentAvailableFromOutput(output),
          installedVersion: workbenchAgentVersionNumber(parsed.version),
          requiredVersion: workbenchAgentVersionNumber(latestWorkbenchAgentVersion),
          generationReady: parsed.generationReady === "1",
        });
      };
      if (agentDirectConfig(currentProfile).enabled) {
        try {
          const directHealth = await agentDirectRequest(currentProfile, "/v1/health", { timeoutMs: 10_000 });
          const directVersion = String(directHealth?.version || "").trim();
          trustedDirectPlatform = trustedAgentPlatform(directHealth?.platform);
          const protocolVersion = Number(directHealth?.protocolVersion || 0);
          const protocolReady = workbenchAgentProtocolSupports(directHealth, ["tasks"]);
          const versionReady =
            workbenchAgentVersionNumber(directVersion) >= workbenchAgentVersionNumber(latestWorkbenchAgentVersion);
          const generationReady =
            workbenchAgentVersionNumber(directVersion) < 54 || directHealth?.generationReady === true;
          const componentsReady =
            directHealth?.daemonStatus === "running" &&
            directHealth?.httpStatus === "running" &&
            directHealth?.updaterStatus === "running";
          directRouteReady =
            protocolReady &&
            versionReady &&
            generationReady &&
            componentsReady &&
            directHealth?.transport === "https" &&
            Boolean(trustedDirectPlatform);
          if (directRouteReady) {
            directHealthOutput = [
              "__AIWB_AGENT_STATUS__ready",
              `__AIWB_AGENT_VERSION__${directVersion}`,
              `__AIWB_AGENT_GENERATION_READY__${directHealth?.generationReady === true ? "1" : "0"}`,
              `__AIWB_AGENT_SERVICE_STATUS__${directHealth?.serviceStatus || ""}`,
              `__AIWB_AGENT_SERVICE_PROCESS_STATUS__${directHealth?.serviceProcessStatus || ""}`,
              `__AIWB_AGENT_DAEMON_STATUS__${directHealth?.daemonStatus || ""}`,
              `__AIWB_AGENT_HTTP_STATUS__${directHealth?.httpStatus || ""}`,
              `__AIWB_AGENT_UPDATER_STATUS__${directHealth?.updaterStatus || ""}`,
            ].join("\n");
          } else {
            void appLog("warn", "agent.direct.version_mismatch", {
              serverId,
              agentId: agent.id,
              version: directVersion,
              platform: trustedDirectPlatform,
              protocolVersion,
              capabilities: Array.isArray(directHealth?.capabilities) ? directHealth.capabilities : [],
              requiredVersion: latestWorkbenchAgentVersion,
            });
          }
        } catch (error) {
          void appLog("warn", "agent.direct.health_failed", {
            serverId,
            agentId: agent.id,
            error: shortError(error),
          });
        }
      }
      let healthResolvedProfile = trustedDirectPlatform
        ? { ...currentProfile, platform: trustedDirectPlatform }
        : currentProfile;
      if (trustedDirectPlatform && normalizeServerPlatform(currentProfile.platform) !== trustedDirectPlatform) {
        const machineProfileUpdatedAt = Date.now();
        healthResolvedProfile = { ...healthResolvedProfile, machineProfileUpdatedAt };
        patchServersByConnection(
          currentProfile,
          (server) => ({
            ...server,
            profile: {
              ...server.profile,
              platform: trustedDirectPlatform,
              machineProfileUpdatedAt,
            },
          }),
          { persistDelay: 0 },
        );
        if (activeServerIdRef.current === serverId) profileRef.current = healthResolvedProfile;
      }
      const probeIsFresh =
        directRouteReady ||
        (cachedProbe &&
          Date.now() - Number(cachedProbe.checkedAt || 0) < 15_000 &&
          taskSubmissionReadyFromOutput(cachedProbe.output));
      let probeOutput = directRouteReady
        ? directHealthOutput
        : probeIsFresh
          ? cachedProbe.output
          : "";
      let routeProbeError = null;
      if (!probeIsFresh) {
        try {
          probeOutput = await runRemoteCommandForProfile(
            withInteractiveSshConnectTimeout(healthResolvedProfile),
            buildWorkbenchAgentStatusCommand(healthResolvedProfile),
            64_000,
            20,
          );
        } catch (error) {
          routeProbeError = error;
          void appLog("warn", "agent.probe.failed", {
            serverId,
            agentId: agent.id,
            error: shortError(error),
          });
        }
      }

      if (!taskSubmissionReadyFromOutput(probeOutput)) {
        if (
          routeProbeError &&
          isSshTransportUnavailableError(routeProbeError) &&
          !isSshStaleConnectionError(routeProbeError)
        ) {
          throw routeProbeError;
        }
        void appLog("info", "agent.route.ensure", {
          serverId,
          agentId: agent.id,
          reason: "send",
          host: currentProfile.host,
        });
        const setup = await ensureWorkbenchAgentForProfile(healthResolvedProfile, {
          serverId,
          reason: "send",
        });
        if (!setup.available || setup.taskSubmissionReady === false) {
          void appLog("warn", "agent.route.fallback", {
            serverId,
            agentId: agent.id,
            error: setup.error ? shortError(setup.error) : "Agent status unavailable",
          });
          throw new Error(
            setup.error
              ? shortError(setup.error)
              : `Agent 只能同步旧任务，必须先升级到 v${latestWorkbenchAgentVersion} 后才能发送新任务。`,
          );
        }
        probeOutput = setup.output || "";
        if (!taskSubmissionReadyFromOutput(probeOutput)) {
          try {
            probeOutput = await runRemoteCommandForProfile(
              healthResolvedProfile,
              buildWorkbenchAgentStatusCommand(healthResolvedProfile),
              64_000,
              20,
            );
          } catch (error) {
            void appLog("warn", "agent.route.status_after_setup.failed", {
              serverId,
              agentId: agent.id,
              error: shortError(error),
            });
          }
        }
        if (!taskSubmissionReadyFromOutput(probeOutput)) {
          throw new Error(`Agent 尚未完成 v${latestWorkbenchAgentVersion} 代际升级，暂时不能发送新任务。`);
        }
      }
      agentRouteProbeByConnectionRef.current.set(connectionKey, {
        checkedAt: Date.now(),
        output: probeOutput,
      });
      void appLog("info", "agent.route.ready", {
        serverId,
        agentId: agent.id,
        host: currentProfile.host,
        status: parseWorkbenchAgentOutput(probeOutput).status,
        version: parseWorkbenchAgentOutput(probeOutput).version,
      });

      const probedAgent = parseWorkbenchAgentOutput(probeOutput);
      const probedAgentHealth = healthFromWorkbenchAgentStatus(probedAgent);
      if (probedAgentHealth.agent || probedAgentHealth.agent_version) {
        patchServersByConnection(
          currentProfile,
          (server, serverProfile) => ({
              ...server,
              diagnostics: {
                ...(server.diagnostics || {}),
                ...probedAgentHealth,
                agent: "available",
                agent_version: probedAgentHealth.agent_version || probedAgent.version || server.diagnostics?.agent_version || "1",
              },
              connection: {
                ...(server.connection || {}),
                mode: agentPreferredForProfile(serverProfile) ? "agent" : server.connection?.mode || "ssh",
              },
            }),
          { persistDelay: 100 },
        );
      }
      // HTTPS owns health/status on every platform. Linux/Windows may also
      // submit through it; macOS deliberately keeps task creation in the SSH
      // user audit session so Codex/Claude inherit the required privacy context.
      let directProfile = healthResolvedProfile;
      if (!directRouteReady) {
        try {
          const configured = await bootstrapAgentDirectProfile(healthResolvedProfile, {
            serverId,
            reason: "send",
            requiredCapabilities: ["tasks"],
          });
          trustedDirectPlatform = configured.platform;
          directProfile = configured.profile;
          directRouteReady = true;
          directHealthOutput = configured.output;
        } catch (error) {
          void appLog("warn", "agent.direct.config_read_failed", { serverId, error: shortError(error) });
        }
      }

      const conversationId = ensureServerConversationId(serverId, currentProfile, agent.id);
      const runtimeProfile = agentRuntimeProfile({ ...directProfile, conversationId });
      const command = buildAgentTaskCommand(runtimeProfile, agent, text);
      const maxAgentStartupAttempts = 2;
      assertSessionDispatch(serverById(serverId), {
        sessionId: serverId,
        agentId: agent.id,
        conversationId,
        profile: currentProfile,
      });
      const conversationName = serverDisplayName(serverById(serverId), 0);

      for (let attempt = 1; attempt <= maxAgentStartupAttempts; attempt += 1) {
        const remoteTaskId = createRemoteTaskId(conversationId, agent.id);
        const optimisticStartedAt = Date.now();
        let pushTicket = null;
        if (currentProfile.taskPushNotificationsEnabled === true && iosPushSupported()) {
          try {
            pushTicket = await createIosTaskPushTicket({
              endpoint: cloudSyncDefaultEndpoint,
              taskId: remoteTaskId,
              conversationId,
              conversationName,
              agentId: agent.id,
            });
          } catch (error) {
            void appLog("warn", "ios.push.ticket.failed", {
              serverId,
              conversationId,
              remoteTaskId,
              error: shortError(error),
            });
          }
        }
        setServerTaskMetadata(serverId, {
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
          title: "正在发送",
          body: `正在把消息发送给 Agent。`,
          taskState: taskStateSubmitting,
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
        let createOutput = "";
        let created = null;
        let createTransport = "";
        const plannedCreateTransport = agentTaskSubmissionTransport({
          platform: directProfile.platform,
          directRouteReady,
          directConfigured: agentDirectConfig(directProfile).enabled,
        });
        const createThroughSshContext = plannedCreateTransport === "ssh-create-now";
        const taskCreateMode = createThroughSshContext ? "create-now" : workbenchAgentTaskCreateMode(directProfile);
        const directTaskRequest = agentDirectTaskRequest({
          taskId: remoteTaskId,
          conversationId,
          turnId,
          agentId: agent.id,
          model: currentProfile.aiModel,
          workdir: currentProfile.workdir,
          prompt: text,
          requestMessageId: userMessageId,
          responseMessageId: assistantMessageId,
          command,
          name: conversationName,
        });
        const acceptDirectTask = (task = {}) => ({
          status: "ready",
          taskStatus: String(task.rawStatus || task.status || "queued").toLowerCase(),
          taskId: task.id || remoteTaskId,
          pid: "",
          startedAt: task.startedAt || "",
          runnerStartedAt: task.runnerStartedAt || "",
          exitCode: task.exitCode || "",
          eventFingerprint: "",
        });
        if (plannedCreateTransport === "direct") {
          const eventStream = agentEventStreamStateRef.current.get(agentInstallationKey(directProfile));
          if (eventStream?.status === "open" && eventStream.handle?.isOpen?.()) {
            try {
              const response = await eventStream.handle.request({ type: "task.create", task: directTaskRequest }, { timeoutMs: 5_000 });
              created = acceptDirectTask(response?.task);
              createTransport = "websocket";
              void appLog("info", "agent.events.task_created", { serverId, remoteTaskId });
            } catch (error) {
              void appLog("warn", "agent.events.task_create_failed", {
                serverId,
                remoteTaskId,
                error: shortError(error),
              });
            }
          }
        }
        if (plannedCreateTransport === "direct" && !created) {
          try {
            const response = await agentDirectRequest(directProfile, "/v1/tasks", {
              method: "POST",
              body: directTaskRequest,
              timeoutMs: 20_000,
            });
            created = acceptDirectTask(response?.task);
            createTransport = "direct";
            void appLog("info", "agent.direct.task_created", { serverId, remoteTaskId });
          } catch (error) {
            void appLog("warn", "agent.direct.task_create_failed", {
              serverId,
              remoteTaskId,
              error: shortError(error),
            });
          }
        }
        if (!created) {
          createOutput = await runRemoteCommandForProfile(
            directProfile,
            buildWorkbenchAgentCreateCommand(directProfile, remoteTaskId, command, {
              conversationId,
              name: conversationName,
              workdir: currentProfile.workdir,
              agentId: agent.id,
              model: currentProfile.aiModel,
              promptText: text,
              turnId,
              requestMessageId: userMessageId,
              responseMessageId: assistantMessageId,
              pushNotifyUrl: pushTicket?.notifyUrl || "",
              pushNotifyToken: pushTicket?.notifyToken || "",
            }, { createMode: taskCreateMode }),
            128_000,
            30,
          );
          created = parseWorkbenchAgentOutput(createOutput);
          createTransport = createThroughSshContext ? "ssh-create-now" : "ssh-create";
        }
        const generationChanged =
          created.errorCode === "generation_changed" ||
          /__AIWB_AGENT_ERROR_CODE__generation_changed(?:\r?\n|$)/.test(createOutput);
        if (generationChanged && attempt < maxAgentStartupAttempts) {
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: "Agent 刚完成升级",
            body: "运行代际已经切换，正在用新版本安全重试。",
            taskState: taskStateSubmitting,
            remoteTaskStatus: "generation-changed",
            remoteTaskCheckedAt: Date.now(),
            technicalDetail: undefined,
          });
          await sleep(250);
          continue;
        }
        if (generationChanged) {
          throw new Error("Agent 运行代际刚刚切换，任务没有启动；请重新发送。");
        }
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
	            title: failure?.title || "会话正在执行",
	            body:
	              failure?.body ||
	              "这个会话已有任务在执行，你刚才这条新请求没有发送。等当前任务完成，或取消后再发送。",
            output: "",
            liveOutput: "",
            taskState: taskStateSyncing,
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
          setServerTaskMetadata(serverId, {
            backend: "agent",
            conversationId,
            remoteTaskId: blockingTaskId,
            agentId: agent.id,
            startedAt,
            label: `会话占用 ${agent.shortName}`,
          });
          setServerConnection(serverId, {
            state: "connected",
            label: "已连接",
            detail: agent.shortName,
            mode: "agent",
          });
          return { used: true, ok: false, pending: true };
        }
        const createdTaskAccepted = ["queued", "running"].includes(created.taskStatus);
        if (created.status !== "ready" || !createdTaskAccepted) {
          if (created.status === "missing" || created.status === "unsupported") {
            throw new Error("Agent 协议不受支持，请将客户端和 Agent 升级到同一版本。");
          }
          throw new Error(created.error || trimVisibleText(createOutput) || "Agent 创建任务失败。");
        }

        const startedAt = optimisticStartedAt;
        setServerTaskMetadata(serverId, {
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
        const acceptedRunnerStarted = Boolean(String(created.runnerStartedAt || "").trim());
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: attempt === 1 ? (acceptedRunnerStarted ? "AI 执行中" : "Agent 已接收") : "正在重试",
          body:
            attempt === 1
              ? acceptedRunnerStarted
                ? `AI 已开始处理，完成后会自动返回结果。`
                : "消息发送成功，Agent 正在把任务交给 AI。"
              : `第 ${attempt - 1} 次启动失败，正在重新尝试。`,
          taskState: acceptedRunnerStarted ? taskStateRunning : taskStateAccepted,
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
          state: "connected",
          label: "已连接",
          detail: agent.shortName,
          mode: "agent",
        });

        // Task acceptance is the handoff boundary on every platform and every
        // transport. A shared recovery owner performs status sync; the send
        // action must never remain open in a two-hour SSH polling loop.
        void appLog("info", "agent.background_sync.handoff", {
          serverId,
          agentId: agent.id,
          remoteTaskId,
          taskStatus: created.taskStatus || "queued",
          transport: createTransport || (Capacitor.isNativePlatform() ? "native" : "ssh-bootstrap"),
        });
        return { used: true, ok: false, pending: true };

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
            statusOutput = await runWithSshReconnect(
              () =>
                runRemoteCommandForProfile(
                  currentProfile,
                  buildWorkbenchAgentWaitTaskCommand(currentProfile, remoteTaskId, lastEventFingerprint, {
                    timeoutSeconds: remainingWaitSeconds,
                  }),
                  2_097_152,
                  remainingWaitSeconds + 20,
                ),
              {
                shouldRetry: (error) =>
                  isRetryableSshConnectionError(error) ||
                  (isTransientSshSyncError(error) && error?.code !== "AIWB_CLIENT_COMMAND_TIMEOUT"),
                onRetry: ({ error, reconnectAttempt }) => {
                  setServerConnection(serverId, {
                    state: "testing",
                    label: "连接断开",
                    detail: `正在自动重连 ${reconnectAttempt}/${maxSshReconnectAttempts}`,
                    mode: "agent",
                  });
                  void appLog("warn", "agent.status.reconnect", {
                    serverId,
                    agentId: agent.id,
                    remoteTaskId,
                    attempt: reconnectAttempt,
                    maxAttempts: maxSshReconnectAttempts,
                    error: String(error?.message || error || ""),
                  });
                },
              },
            );
          } catch (error) {
            if (error?.code !== "AIWB_SSH_CONNECTION_FAILED" && !isTransientSshSyncError(error)) throw error;
            const detail = shortError(error);
            void appLog("error", "agent.status.connection_failed", {
              serverId,
              agentId: agent.id,
              remoteTaskId,
              attempts: error?.reconnectAttempts || 0,
              error: String(error?.cause?.message || error?.message || error || ""),
            });
            updateAssistantMessageInServer(serverId, assistantMessageId, {
              title: "连接异常",
              body: "暂时无法连接服务器。远端任务可能仍在运行，重新连接后会继续同步。",
              taskState: taskStateSyncing,
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
              state: "error",
              label: "连接异常",
              detail: "自动重连 3 次仍未恢复",
              mode: "agent",
            });
            return { used: true, ok: false, pending: true };
          }
          const status = parseWorkbenchAgentOutput(statusOutput);
          if (status.eventFingerprint) lastEventFingerprint = status.eventFingerprint;
          const taskStatus = status.taskStatus || "unknown";
          if (taskStatus === "done") {
            if (!applyAgentOutput(status.output, true, true)) return { used: true, ok: false, pending: false };
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
	              title: failure?.title || "已取消",
	              body: failure?.body || (visibleOutput ? "任务已停止，下面保留停止前已经收到的内容。" : "任务已停止，可以继续输入。"),
              output: visibleOutput,
              liveOutput: "",
              taskState: taskStateCancelled,
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
            setServerTaskMetadata(serverId, {
              backend: "agent",
              conversationId,
              remoteTaskId,
              agentId: agent.id,
              finishedAt: Date.now(),
            });
            setServerConnection(serverId, {
              state: "connected",
              label: "已连接",
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
            const shouldRetryAgent =
              failure?.kind === "agent_stale_runner" || failure?.kind === "agent_daemon_unavailable";
            void appLog("error", "agent.task.failed", {
              serverId,
              agentId: agent.id,
              remoteTaskId,
              taskStatus,
              exitCode: status.exitCode || "",
              failureKind: failure?.kind || "unknown",
              failureTitle: failure?.title || "执行失败",
              hasUploadedFiles: /\b\.ai-workbench[\\/]uploads[\\/]/i.test(text),
            });
            if (shouldRetryAgent) {
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
	                  title: "正在重试",
	                  body: `第 ${attempt} 次启动失败，正在自动重试。`,
                  output: "",
                  taskState: taskStateSubmitting,
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
                  state: "connected",
                  label: "已连接",
                  detail: agent.shortName,
                  mode: "agent",
                });
                retryAgentStartup = true;
                break;
              }

              updateAssistantMessageInServer(serverId, assistantMessageId, {
                title: failure?.title || "Agent 启动失败",
                body: failure?.body || "Agent 连续两次没有启动任务。请修复 Agent 后重试。",
                output: "",
                liveOutput: "",
                taskState: taskStateFailed,
                backend: "agent",
                conversationId,
                remoteTaskId,
                agentId: agent.id,
                promptText: text,
                remoteTaskStatus: taskStatus,
                remoteTaskCheckedAt: Date.now(),
                agentFailure: failure,
                technicalDetail: failure?.detail || cleanAgentFailureDetail(raw),
              });
              return { used: true, ok: false, pending: false };
            }

	            updateAssistantMessageInServer(serverId, assistantMessageId, {
	              title: failure?.title || "执行失败",
	              body: failure?.body || trimVisibleText(raw) || "远端执行失败。",
              output: "",
              liveOutput: "",
              taskState: taskStateFailed,
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
	            setServerTaskMetadata(serverId, {
	              backend: "agent",
	              conversationId,
	              remoteTaskId,
	              agentId: agent.id,
	              finishedAt: Date.now(),
	            });
	            setServerConnection(serverId, {
              state: "connected",
              label: "已连接",
              detail: agent.shortName,
              mode: "agent",
            });
            return { used: true, ok: false, pending: false };
          }

          const liveOutput = formatAgentLiveOutput(status.output || "", text);
          const runnerStarted = Boolean(String(status.runnerStartedAt || "").trim());
          const stageTitle =
            taskStatus === "queued" || taskStatus === "preparing"
              ? "Agent 已接收"
              : runnerStarted || liveOutput
                ? "AI 执行中"
                : "正在交给 AI";
          const stageBody =
            taskStatus === "queued" || taskStatus === "preparing"
              ? "消息发送成功，Agent 正在把任务交给 AI。"
              : liveOutput
                ? "正在接收 AI 的中间输出，最终结果会自动更新。"
                : runnerStarted
                  ? "AI 已开始处理，完成后会自动返回结果。"
                  : "Agent 正在启动 AI 会话。";
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: stageTitle,
            body: stageBody,
            taskState:
              taskStateFromRemoteStatus(taskStatus, { hasTaskId: true }) || taskStateRunning,
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
	          title: "同步超时",
	          body: "等待 2 小时仍未拿到最终结果。可以检查状态继续同步，或取消任务。",
          output: "",
          liveOutput: "",
          taskState: taskStateSyncing,
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
        setServerTaskMetadata(serverId, {
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
        return { used: true, ok: false, pending: true };
      }

      throw new Error("Agent 无法启动任务，请修复 Agent 后重试。");
    };

    const agentRun = await runWithWorkbenchAgent();
    if (agentRun.used) return agentRun;
    throw new Error("Agent 是唯一任务执行后端，请先安装或修复 Agent。");
  }

  async function syncRemoteAgentMessage(serverId, message, options = {}) {
    if (!message?.remoteTaskId || message.backend !== "agent") return false;
    const lockKey = `${serverId}:${message.remoteTaskId}`;
    if (syncingAgentTasksRef.current.has(lockKey)) return false;

    const server = serverById(serverId);
    if (!server) return false;

    const currentProfile = withKnownPassword(server.profile);
    if (profileIssue(currentProfile)) return false;

    // A stored response can be stale or originate from an older client. The
    // session profile is the source of truth for which remote CLI may be used.
    const agent = agentById(currentProfile.agentId, activeAgent);
    try {
      assertSessionDispatch(server, {
        sessionId: serverId,
        agentId: agent.id,
        conversationId: message.conversationId || server.conversationId,
        profile: currentProfile,
      });
    } catch (error) {
      updateAssistantMessageInServer(serverId, message.id, {
        title: "会话校验失败",
        body: String(error?.message || "会话信息不一致，已停止同步。"),
        taskState: taskStateFailed,
        backend: "agent",
        technicalDetail: String(error?.message || error || ""),
        remoteSyncError: "session dispatch invariant mismatch",
        forceUpdate: true,
      });
      void appLog("error", "agent.sync.session_invariant_failed", {
        serverId,
        remoteTaskId: message.remoteTaskId,
        error: String(error?.message || error || ""),
      });
      return false;
    }
    syncingAgentTasksRef.current.add(lockKey);
    try {
      const waitTimeoutSeconds =
        serverId === activeServerIdRef.current && taskStateIsActive(taskStateForMessage(message))
          ? agentLongPollTimeoutSeconds
          : 20;
      let statusOutput = "";
      let status = null;

      if (options.directTask?.id && String(options.directTask.id) === String(message.remoteTaskId)) {
        status = agentDirectTaskStatusSnapshot(options.directTask);
        statusOutput = status.output;
      }

      // The task was submitted through the Agent API. Query that exact task on
      // resume as well, rather than opening a fresh SSH command just to poll.
      if (!status && agentDirectConfig(currentProfile).enabled) {
        try {
          const response = await agentDirectRequest(
            currentProfile,
            `/v1/tasks/${encodeURIComponent(message.remoteTaskId)}`,
            { timeoutMs: Math.min((waitTimeoutSeconds + 5) * 1_000, 25_000) },
          );
          const task = response?.task || {};
          status = agentDirectTaskStatusSnapshot(task);
          statusOutput = status.output;
          void appLog("info", "agent.direct.task_status", {
            serverId,
            remoteTaskId: message.remoteTaskId,
            taskStatus: status.taskStatus,
          });
        } catch (error) {
          // Keep SSH as a recovery path for old routes, LAN changes, or an
          // Agent endpoint that was restarted while the app was backgrounded.
          void appLog("warn", "agent.direct.task_status_failed", {
            serverId,
            remoteTaskId: message.remoteTaskId,
            error: shortError(error),
          });
        }
      }

      if (!status) {
        statusOutput = await runWithSshReconnect(
          () =>
            runRemoteCommandForProfile(
              currentProfile,
              buildWorkbenchAgentWaitTaskCommand(currentProfile, message.remoteTaskId, message.remoteEventFingerprint || "", {
                timeoutSeconds: waitTimeoutSeconds,
              }),
              2_097_152,
              waitTimeoutSeconds + 20,
            ),
          {
            shouldRetry: (error) =>
              isRetryableSshConnectionError(error) ||
              (isTransientSshSyncError(error) && error?.code !== "AIWB_CLIENT_COMMAND_TIMEOUT"),
            onRetry: ({ error, reconnectAttempt }) => {
              setServerConnection(serverId, {
                ...(server.connection || {}),
                state: "testing",
                label: "连接断开",
                detail: `正在自动重连 ${reconnectAttempt}/${maxSshReconnectAttempts}`,
                mode: "agent",
              });
              void appLog("warn", "agent.sync.reconnect", {
                serverId,
                remoteTaskId: message.remoteTaskId,
                attempt: reconnectAttempt,
                maxAttempts: maxSshReconnectAttempts,
                error: String(error?.message || error || ""),
              });
            },
          },
        );
        status = parseWorkbenchAgentOutput(statusOutput);
      }
      const taskStatus = status.taskStatus || "unknown";
      const eventFingerprint = status.eventFingerprint || message.remoteEventFingerprint || "";
      const raw = status.output || status.raw || statusOutput;
      const executionSummary = String(status.executionSummary || "").trim();

      if (taskStatus === "queued" || taskStatus === "running" || taskStatus === "preparing" || taskStatus === "unknown") {
        const liveOutput = formatAgentLiveOutput(status.output || "", message.promptText || "");
        const runnerStarted = Boolean(String(status.runnerStartedAt || "").trim());
        const stageTitle =
          taskStatus === "queued" || taskStatus === "preparing"
            ? "Agent 已接收"
            : runnerStarted || liveOutput
              ? "AI 执行中"
              : "正在交给 AI";
        const stageBody =
          taskStatus === "queued" || taskStatus === "preparing"
            ? "消息发送成功，Agent 正在把任务交给 AI。"
            : liveOutput
              ? "正在接收 AI 的中间输出，最终结果会自动更新。"
              : runnerStarted
                ? "AI 已开始处理，完成后会自动返回结果。"
                : "Agent 正在启动 AI 会话。";
        if (liveOutput) setServerRawOutput(serverId, raw);
        updateAssistantMessageInServer(serverId, message.id, {
          title: stageTitle,
          body: stageBody,
          taskState:
            taskStateFromRemoteStatus(taskStatus, { hasTaskId: true }) || taskStateRunning,
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
        setServerTaskMetadata(serverId, {
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentId: agent.id,
          startedAt: message.startedAt || message.createdAtMs || Date.now(),
	          label: `同步等待 ${agent.shortName}`,
        });
        setServerConnection(serverId, {
          ...(server.connection || {}),
          state: "connected",
          label: "已连接",
          detail: agent.shortName,
          mode: "agent",
        });
        return false;
      }

      setServerRawOutput(serverId, raw);

      if (taskStatus === "done") {
        const extracted = extractCompletedAgentOutput(raw, message.promptText || "");
        const output = extracted.final ? extracted.text : "";
	        if (!output) {
	          updateAssistantMessageInServer(serverId, message.id, {
	            title: executionSummary ? "AI 回复不完整" : "没有最终结果",
            body: executionSummary
              ? "远端 AI 没有给出完整结论。下面是 Agent 独立记录的实际执行痕迹。"
              : "任务已经结束，但没有收到可展示的结果。可以重新同步，或重新发送。",
            output: executionSummary,
            liveOutput: "",
            taskState: taskStateFailed,
            backend: "agent",
            remoteTaskId: message.remoteTaskId,
            resultMissing: true,
            technicalDetail: undefined,
            executionSummary,
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
          setServerTaskMetadata(serverId, {
            backend: "agent",
            remoteTaskId: message.remoteTaskId,
            agentId: agent.id,
            finishedAt: Date.now(),
          });
          setServerConnection(serverId, {
            state: "connected",
            label: "已完成",
            detail: "任务已结束",
            mode: "agent",
          });
          return false;
        }
        updateAssistantMessageInServer(serverId, message.id, {
          title: `${agent.shortName} 回复`,
          body: "",
          output,
          executionSummary,
          liveOutput: "",
          taskState: taskStateSucceeded,
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
        setServerTaskMetadata(serverId, {
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
	          title: failure?.title || "已取消",
	          body: failure?.body || (visibleOutput ? "任务已停止，下面保留停止前已经收到的内容。" : "任务已停止，可以继续输入。"),
          output: visibleOutput,
          liveOutput: "",
          taskState: taskStateCancelled,
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
        setServerTaskMetadata(serverId, {
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentId: agent.id,
          finishedAt: Date.now(),
        });
        setServerConnection(serverId, { state: "connected", label: "已连接", detail: agent.shortName, mode: "agent" });
        return true;
      }

      const failure = classifyAgentFailure(raw, agent, status);
      const issue = failure ? "" : detectAgentIssue(raw, agent);
	      updateAssistantMessageInServer(serverId, message.id, {
	        title: failure?.title || "执行失败",
	        body: failure?.body || issue || trimVisibleText(raw) || "远端执行失败。",
        output: "",
        liveOutput: "",
        taskState: taskStateFailed,
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
      setServerTaskMetadata(serverId, {
        backend: "agent",
        remoteTaskId: message.remoteTaskId,
        agentId: agent.id,
        finishedAt: Date.now(),
      });
      setServerConnection(serverId, { state: "connected", label: "已连接", detail: agent.shortName, mode: "agent" });
      notifyTaskFinished(serverId, agent, false);
      return true;
    } catch (error) {
      if (error?.code === "AIWB_SSH_CONNECTION_FAILED" || isTransientSshSyncError(error)) {
        const detail = shortError(error);
        updateAssistantMessageInServer(serverId, message.id, {
          title: "连接异常",
          body: "暂时无法连接服务器。远端任务可能仍在运行，重新连接后会继续同步。",
          taskState: taskStateSyncing,
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentId: agent.id,
          promptText: message.promptText || "",
          remoteTaskStatus: "sync-lost",
          remoteTaskCheckedAt: Date.now(),
          remoteSyncError: detail,
        });
        setServerTaskMetadata(serverId, {
          backend: "agent",
          remoteTaskId: message.remoteTaskId,
          agentId: agent.id,
          startedAt: message.startedAt || message.createdAtMs || Date.now(),
          label: `等待同步 ${agent.shortName}`,
        });
        setServerConnection(serverId, {
          ...(server.connection || {}),
          state: "error",
          label: "连接异常",
          detail: "自动重连 3 次仍未恢复",
          mode: "agent",
        });
        void appLog("error", "agent.sync.connection_failed", {
          serverId,
          remoteTaskId: message.remoteTaskId,
          attempts: error?.reconnectAttempts || 0,
          error: String(error?.cause?.message || error?.message || error || ""),
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
    if (!server?.id) return false;
    const latestServer = serverById(server.id) || server;
    const currentProfile = withInteractiveSshConnectTimeout(withKnownPassword(latestServer.profile));
    if (profileIssue(currentProfile)) return false;
    const conversationId = String(latestServer.conversationId || "").trim();
    if (!conversationId) return false;

    const lockKey = `${latestServer.id}:${conversationId}:latest`;
    if (syncingAgentConversationsRef.current.has(lockKey)) return false;
    syncingAgentConversationsRef.current.add(lockKey);

    try {
      void appLog("info", "agent.conversation_sync.start", {
        serverId: latestServer.id,
        conversationId,
        reason: options.reason || "",
      });
      const output = await runRemoteCommandForProfile(
        currentProfile,
        buildWorkbenchAgentConversationStatusCommand(currentProfile, conversationId, {
          limit: 1,
        }),
        2_097_152,
        45,
      );
      const conversations = parseWorkbenchAgentConversations(output);
      const conversation = conversations.find((item) => item.id === conversationId) || conversations[0];
      if (!conversation?.id) {
        if (options.showResult === true) {
          setServerRawOutput(latestServer.id, "没有从远端 Agent 读到这个会话的消息。");
        }
        return false;
      }

      const agentId = conversation.agentId || currentProfile.agentId;
      const restoredMessages = messagesFromAgentConversation(conversation, agentId, {
        existingTaskIds: new Set(),
      });
      const current = serverById(latestServer.id) || latestServer;
      const mergedMessages = resolveOrphanAgentPlaceholdersAfterConversationSync(
        dedupeRemoteTaskMessages([
          ...(current.messages || []),
          ...restoredMessages,
        ]),
        conversation,
        agentId,
        { confirmMissing: options.confirmMissing === true },
      );
      const hasNewMessage = mergedMessages.length !== (current.messages || []).length;
      const nextTask = taskMetadataFromAgentConversation(conversation, agentId);
      const nextConnection = {
        ...(current.connection || {}),
        state: "connected",
        label: "已连接",
        detail: agentById(agentId).shortName,
        mode: "agent",
      };

      updateServer(latestServer.id, {
        conversationId: conversation.id,
        messages: mergedMessages,
        task: nextTask,
        connection: nextConnection,
      });

      if (options.showResult === true) {
        setServerRawOutput(latestServer.id, output);
      }
      if (
        hasNewMessage &&
        latestServer.id !== activeServerIdRef.current &&
        !lastActiveTaskMessage(mergedMessages)
      ) {
        updateServer(latestServer.id, {
          unreadResult: {
            tone: conversation.status === "done" ? "done" : "error",
            title: `${latestServer.name || agentById(agentId).shortName} 有新结果`,
            finishedAt: Date.now(),
          },
        });
      }
      void appLog("info", "agent.conversation_sync.success", {
        serverId: latestServer.id,
        conversationId,
        restoredMessages: restoredMessages.length,
        messageCount: mergedMessages.length,
        status: conversation.status || "",
      });
      return hasNewMessage;
    } catch (error) {
      void appLog("warn", "agent.conversation_sync.failed", {
        serverId: latestServer.id,
        conversationId,
        reason: options.reason || "",
        error: shortError(error),
      });
      if (options.showResult === true) {
        setServerRawOutput(latestServer.id, `同步会话失败：${shortError(error)}`);
      }
      if (options.throwOnError === true) throw error;
      return false;
    } finally {
      syncingAgentConversationsRef.current.delete(lockKey);
    }
  }

  async function recoverUnsubmittedAgentMessage(server, message, reason = "startup") {
    if (!server?.id || !message?.id || message?.backend !== "agent") return false;
    if (String(message.remoteTaskId || "").trim()) return false;
    if (!taskStateIsActive(taskStateForMessage(message))) return false;

    const promptText = taskTextFromValue(message.promptText || message.retryText || "");
    if (!promptText || !server.conversationId) return false;

    const recoveryAttempts = Number(message.submissionRecoveryAttempts || 0);
    if (recoveryAttempts >= 1) {
      updateAssistantMessageInServer(server.id, message.id, {
        title: "没有提交成功",
        body: "App 退出时这条消息尚未提交到 Agent，自动恢复已尝试一次但没有确认成功。可以编辑后重新发送。",
        taskState: taskStateFailed,
        remoteTaskStatus: "submission-not-confirmed",
        completedAt: Date.now(),
        forceUpdate: true,
      });
      return false;
    }

    updateAssistantMessageInServer(server.id, message.id, {
      title: "正在恢复发送",
      body: "正在确认 Agent 是否已经收到；未收到时会自动补发一次。",
      taskState: taskStateSubmitting,
      remoteTaskStatus: "submission-recovering",
      remoteTaskCheckedAt: Date.now(),
      forceUpdate: true,
    });
    void appLog("info", "agent.submission_recovery.check", {
      serverId: server.id,
      messageId: message.id,
      reason,
    });

    const recoveryProfile = withKnownPassword(server.profile);
    if (agentDirectConfig(recoveryProfile).enabled) {
      try {
        const response = await agentDirectRequest(
          recoveryProfile,
          `/v1/conversations/${encodeURIComponent(server.conversationId)}/latest-task`,
          { timeoutMs: 15_000 },
        );
        const directTask = response?.task || {};
        if (agentTaskMatchesInterruptedSubmission(directTask, message, server.conversationId)) {
          const recoveredMessage = {
            ...message,
            remoteTaskId: directTask.id,
            taskState: taskStateSyncing,
            remoteTaskStatus: String(directTask.rawStatus || "syncing").toLowerCase(),
            remoteTaskCheckedAt: Date.now(),
          };
          updateAssistantMessageInServer(server.id, message.id, {
            remoteTaskId: recoveredMessage.remoteTaskId,
            title: "同步中",
            body: "已找到 Agent 任务，正在恢复最终结果。",
            taskState: recoveredMessage.taskState,
            remoteTaskStatus: recoveredMessage.remoteTaskStatus,
            remoteTaskCheckedAt: recoveredMessage.remoteTaskCheckedAt,
            forceUpdate: true,
          });
          void appLog("info", "agent.submission_recovery.direct_found", {
            serverId: server.id,
            messageId: message.id,
            remoteTaskId: recoveredMessage.remoteTaskId,
          });
          await syncRemoteAgentMessage(server.id, recoveredMessage);
          return true;
        }
      } catch (error) {
        void appLog("warn", "agent.submission_recovery.direct_failed", {
          serverId: server.id,
          messageId: message.id,
          error: shortError(error),
        });
      }
    }

    await syncAgentConversationForServer(server, {
      limit: 1,
      reason: `submission-recovery:${reason}`,
      confirmMissing: true,
    });

    const refreshedServer = serverById(server.id) || server;
    const refreshedMessage = (refreshedServer.messages || []).find((item) => item.id === message.id);
    if (String(refreshedMessage?.remoteTaskId || "").trim()) {
      void appLog("info", "agent.submission_recovery.remote_found", {
        serverId: server.id,
        messageId: message.id,
        remoteTaskId: refreshedMessage.remoteTaskId,
      });
      return true;
    }

    if (!refreshedMessage || taskStateForMessage(refreshedMessage) !== taskStateFailed) return false;

    updateAssistantMessageInServer(server.id, message.id, {
      submissionRecoveryAttempts: recoveryAttempts + 1,
      title: "正在恢复发送",
      body: "Agent 未收到上次消息，正在自动补发。",
      taskState: taskStateFailed,
      remoteTaskStatus: "submission-retrying",
      forceUpdate: true,
    });
    void appLog("info", "agent.submission_recovery.resend", {
      serverId: server.id,
      messageId: message.id,
      reason,
    });
    await sendTask(promptText, { retryMessage: { ...refreshedMessage, id: message.id } });
    return true;
  }

  useEffect(() => {
    if (!workspaceLoaded || !agentEventStreamSignature) return undefined;
    let disposed = false;
    const timers = new Set();
    const states = new Map();
    const groupedProfiles = new Map();

    for (const server of serversRef.current) {
      if (server.id !== activeServerIdRef.current && !lastIncompleteAgentResponse(server)) continue;
      const currentProfile = withKnownPassword(server.profile);
      if (!agentDirectConfig(currentProfile).enabled) continue;
      const connectionKey = agentInstallationKey(currentProfile);
      if (!groupedProfiles.has(connectionKey)) groupedProfiles.set(connectionKey, currentProfile);
    }

    const recoverConnectionTasks = async (connectionKey) => {
      const snapshot = serversRef.current;
      for (const server of snapshot) {
        if (agentInstallationKey(normalizeProfile(server.profile)) !== connectionKey) continue;
        const message = lastIncompleteAgentResponse(server);
        if (!message?.remoteTaskId) continue;
        await syncRemoteAgentMessage(server.id, message);
      }
    };

    for (const [connectionKey, currentProfile] of groupedProfiles) {
      const state = {
        status: "connecting",
        lastEventAt: 0,
        reconnectAttempt: 0,
        handle: null,
      };
      states.set(connectionKey, state);
      agentEventStreamStateRef.current.set(connectionKey, state);

      const scheduleReconnect = () => {
        if (disposed || state.status === "open") return;
        const delays = [1_000, 2_000, 5_000, 10_000, 30_000];
        const delay = delays[Math.min(state.reconnectAttempt, delays.length - 1)];
        state.reconnectAttempt += 1;
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          connect();
        }, delay);
        timers.add(timer);
      };

      const connect = () => {
        if (disposed) return;
        const previous = state.handle;
        state.handle = null;
        previous?.close?.();
        state.status = "connecting";
        let handle = null;
        handle = createAgentDirectEventStream(currentProfile, {
          onOpen: () => {
            if (disposed || state.handle !== handle) return;
            state.status = "open";
            state.lastEventAt = Date.now();
            state.reconnectAttempt = 0;
            void appLog("info", "agent.events.open", { connectionKey });
            recoverConnectionTasks(connectionKey).catch((error) => {
              void appLog("warn", "agent.events.recovery_failed", { connectionKey, error: shortError(error) });
            });
          },
          onEvent: (event) => {
            if (disposed || state.handle !== handle) return;
            state.lastEventAt = Date.now();
            if (event?.type !== "task.updated" || !event.task?.id) return;
            const taskId = String(event.task.id);
            for (const server of serversRef.current) {
              if (agentInstallationKey(normalizeProfile(server.profile)) !== connectionKey) continue;
              const message = lastIncompleteAgentResponse(server);
              if (!message || String(message.remoteTaskId || "") !== taskId) continue;
              if (message) {
                void appLog("info", "agent.events.task_updated", {
                  serverId: server.id,
                  remoteTaskId: taskId,
                  taskStatus: event.task.rawStatus || event.task.status || "",
                });
                syncRemoteAgentMessage(server.id, message, { directTask: event.task }).catch((error) => {
                  void appLog("warn", "agent.events.task_sync_failed", {
                    serverId: server.id,
                    remoteTaskId: taskId,
                    error: shortError(error),
                  });
                });
                break;
              }
            }
          },
          onClose: (event) => {
            if (disposed || state.handle !== handle) return;
            state.status = "closed";
            state.lastEventAt = 0;
            void appLog("warn", "agent.events.closed", {
              connectionKey,
              error: String(event?.error || ""),
            });
            scheduleReconnect();
          },
        });
        if (!handle) {
          state.status = "unsupported";
          scheduleReconnect();
          return;
        }
        state.handle = handle;
      };

      connect();
    }

    return () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      for (const [connectionKey, state] of states) {
        state.handle?.close?.();
        if (agentEventStreamStateRef.current.get(connectionKey) === state) {
          agentEventStreamStateRef.current.delete(connectionKey);
        }
      }
    };
  }, [agentEventStreamSignature, workspaceLoaded]);

  async function syncRemoteAgentTasks() {
    if (syncingAgentSweepRef.current) return;
    syncingAgentSweepRef.current = true;
    try {
      const snapshot = serversRef.current;
      const now = Date.now();
      const serversByConnection = new Map();

      for (const server of snapshot) {
        if (sendingServerIdsRef.current.has(server.id)) continue;
        const connectionKey = agentInstallationKey(normalizeProfile(server.profile));
        const connectionServers = serversByConnection.get(connectionKey) || [];
        connectionServers.push(server);
        serversByConnection.set(connectionKey, connectionServers);
      }

      for (const [connectionKey, connectionServers] of serversByConnection) {
        if (agentHealthInFlightConnectionsRef.current.has(connectionKey)) continue;
        const eventStream = agentEventStreamStateRef.current.get(connectionKey);
        const eventStreamHealthy =
          eventStream?.status === "open" && Date.now() - Number(eventStream.lastEventAt || 0) < 45_000;
        if (eventStreamHealthy) continue;
        const lastConnectionPollAt = Number(agentConnectionPollAtRef.current.get(connectionKey) || 0);
        if (lastConnectionPollAt && now - lastConnectionPollAt < 60_000) continue;

        const taskCandidates = [];
        for (const server of connectionServers) {
          const latestSyncableMessage = lastIncompleteAgentResponse(server);
          if (latestSyncableMessage) {
            taskCandidates.push({ server, message: latestSyncableMessage });
          }
        }

        if (taskCandidates.length) {
          taskCandidates.sort((left, right) => {
            const leftCheckedAt = Number(left.message.remoteTaskCheckedAt || 0);
            const rightCheckedAt = Number(right.message.remoteTaskCheckedAt || 0);
            if (leftCheckedAt !== rightCheckedAt) return leftCheckedAt - rightCheckedAt;
            if (
              taskStateIsActive(taskStateForMessage(left.message)) &&
              !taskStateIsActive(taskStateForMessage(right.message))
            ) return -1;
            if (
              taskStateIsActive(taskStateForMessage(right.message)) &&
              !taskStateIsActive(taskStateForMessage(left.message))
            ) return 1;
            return left.server.id === activeServerIdRef.current ? -1 : 1;
          });
          const candidate = taskCandidates[0];
          agentConnectionPollAtRef.current.set(connectionKey, Date.now());
          if (String(candidate.message.remoteTaskId || "").trim()) {
            await syncRemoteAgentMessage(candidate.server.id, candidate.message);
          } else if (candidate.server.id === activeServerIdRef.current) {
            await recoverUnsubmittedAgentMessage(candidate.server, candidate.message, "background-sweep");
          }
          continue;
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
    const server = serverById(activeServerIdRef.current);
    const message = lastIncompleteAgentResponse(server);
    if (!server || !message) return undefined;
    if (!connectionIsLive(server.connection)) return undefined;

    const taskId = String(message.remoteTaskId || "").trim();
    const agent = agentById(message.agentId || normalizeProfile(server.profile).agentId);
    const noticeKey = `${server.id}:${message.id}:${taskId || "no-task-id"}`;
    if (startupAgentSyncNoticeRef.current.has(noticeKey)) return undefined;
    startupAgentSyncNoticeRef.current.add(noticeKey);

    updateAssistantMessageInServer(server.id, message.id, {
      title: "正在刷新最后一条结果",
      body: "App 正在向 Agent 查询上一次任务的最新状态。",
      taskState: "syncing",
    });

    if (!taskId) {
      const timer = window.setTimeout(() => {
        recoverUnsubmittedAgentMessage(server, message, "startup").catch((error) => {
          console.warn("[aiwb:agent-startup-submission-recovery:error]", shortError(error));
        });
      }, 350);
      return () => window.clearTimeout(timer);
    }

    enqueueTaskNotice({ serverId: server.id, title: "正在同步上次未完成的任务", tone: "progress" });
    void appLog("info", "agent.startup_sync.begin", {
      serverId: server.id,
      messageId: message.id,
      remoteTaskId: taskId,
    });

    const timer = window.setTimeout(() => {
      syncRemoteAgentMessage(server.id, message).catch((error) => {
        console.warn("[aiwb:agent-startup-sync:error]", shortError(error));
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeServerId, connection?.state, workspaceLoaded]);

  useEffect(() => {
    if (!workspaceLoaded) return undefined;
    const message = activeRunningMessage;
    if (
      !message ||
      !taskStateIsActive(taskStateForMessage(message)) ||
      message.backend !== "agent" ||
      !message.remoteTaskId
    ) {
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
  }, [
    activeRunningMessage?.id,
    activeRunningMessage?.remoteTaskId,
    activeRunningMessage?.taskState,
    activeServerId,
    workspaceLoaded,
  ]);

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

  async function openRemoteDirectory(path = profileRef.current?.workdir) {
    const currentProfile = withKnownPassword(profileRef.current);
    const targetPath = String(path || currentProfile.workdir || "").trim();
    if (!targetPath) {
      setRemoteDirectory({ state: "error", path: "", entries: [], error: "当前会话没有设置工作目录。" });
      setRemoteDirectoryOpen(true);
      return;
    }

    setRemoteDirectoryOpen(true);
    setRemoteDirectory({ state: "loading", path: targetPath, entries: [] });
    try {
      const output = await runRemoteCommandForProfile(
        currentProfile,
        buildRemoteDirectoryListCommand(currentProfile, targetPath),
        512_000,
        120,
      );
      const result = parseRemoteDirectoryPayload(output);
      setRemoteDirectory({ state: "done", ...result });
    } catch (error) {
      setRemoteDirectory({ state: "error", path: targetPath, entries: [], error: shortError(error) });
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
      progress: 6,
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

      setFileDownload((current) =>
        current?.path === path
          ? { ...current, state: "loading", progress: 86, message: "文件已读取，正在准备保存…" }
          : current,
      );

      const savedFile = {
        ...file,
        name: file.name || fileRef?.name || remoteBasename(path),
        path: file.path || path,
      };
      setFileDownload((current) =>
        current?.path === path ? { ...current, state: "loading", progress: 94, message: "正在交给系统保存…" } : current,
      );
      const saveOperation = saveFileToDevice(savedFile);
      const result = Capacitor.isNativePlatform()
        ? await Promise.race([
            saveOperation,
            sleep(15_000).then(() => ({ ok: true, handedOff: true })),
          ])
        : await saveOperation;
      const canceled = Boolean(result?.canceled);
      setFileDownload({
        state: canceled ? "idle" : "done",
        action: "download",
        path,
        progress: canceled ? 0 : 100,
        message: canceled
          ? "已取消保存。"
          : result?.path
            ? `已保存：${result.path}`
            : "文件已交给系统保存。",
      });
      return { ok: true, canceled, path: result?.path || "" };
    } catch (error) {
      const message = shortError(error);
      setFileDownload({
        state: "error",
        action: "download",
        path,
        progress: 0,
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
    if (!message?.id || !taskStateIsActive(taskStateForMessage(message))) return;
    const serverId = activeServerIdRef.current;
    const currentProfile = normalizeProfile(profileRef.current);
    const agent = agentById(message.agentId || currentProfile.agentId, activeAgent);
    const now = Date.now();
    const startedAt = Number(message.startedAt || message.createdAtMs || now);
    const durationMs = Math.max(0, now - startedAt);

    updateAssistantMessageInServer(serverId, message.id, {
      title: `${agent.shortName} 可能已卡住`,
      body: [
        `这个任务已经等待 ${formatDuration(durationMs)}，已停止等待。你可以继续发送新任务。`,
        agent.id === "claude"
          ? "Claude 长任务没有中间输出；远端进程可能还在执行，稍后如果返回结果，这条消息不会再被覆盖。"
          : "远端任务可能还在运行；如果需要彻底停止，可以再点一次中断或打开 SSH 查看。",
      ].join("\n"),
      output: "",
      taskState: taskStateFailed,
      cancelledAt: now,
      completedAt: now,
      durationMs,
      loginAction: undefined,
      modelChoice: undefined,
    });
    setServerTaskMetadata(serverId, {
      agentId: agent.id,
      interruptedAt: now,
      finishedAt: now,
    });
    setServerConnection(serverId, {
      state: "connected",
      detail: `${agent.shortName} 任务可能仍在远端运行`,
    });
    enqueueTaskNotice({ serverId, title: "任务已停止，可以继续发送新任务", tone: "warning" });
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
      setVoiceError("任务执行中，可以先取消或切换到其它任务。");
      return;
    }

    await sendTask(text, { retryMessage: message });
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
      lastActiveTaskMessage(server?.messages || []);

    if (runningMessage) {
      markRunningMessageStuck(runningMessage);
      return;
    }

    const currentProfile = normalizeProfile(server?.profile || profileRef.current);
    const task = server?.task || {};
    const agent = agentById(task.agentId || currentProfile.agentId, activeAgent);
    const now = Date.now();
    const startedAt = Number(task.startedAt || now);

    setServerTaskMetadata(serverId, {
      agentId: agent.id,
      interruptedAt: now,
      finishedAt: now,
      durationMs: Math.max(0, now - startedAt),
    });
    setServerConnection(serverId, {
      state: "connected",
      detail: `${agent.shortName} 任务可能仍在远端运行`,
    });
    enqueueTaskNotice({ serverId, title: "任务已停止，可以继续发送新任务", tone: "warning" });
  }

  async function sendTask(textOverride, options = {}) {
    const retryMessage = options?.retryMessage && typeof options.retryMessage === "object" ? options.retryMessage : null;
    const pendingFiles = imageAttachmentsRef.current.filter(agentUploadAttachmentReady);
    const rawText = taskTextFromValue(textOverride, composerRef.current || composer);
    const text = rawText || (pendingFiles.length ? "请查看这些附件。" : "");
    if (!text) return;
    const clickServerId = activeServerIdRef.current;
    const clickedAt = Date.now();
    if (clickedAt - Number(lastSendClickAtRef.current || 0) < sendClickDebounceMs) {
      const title = "已收到点击，请不要重复提交";
      setVoiceError(title);
      enqueueTaskNotice({ serverId: clickServerId, title, tone: "warning" });
      void appLog("warn", "send.blocked", { serverId: clickServerId, reason: "click_debounce" });
      return;
    }
    lastSendClickAtRef.current = clickedAt;

    if (!retryMessage && !pendingFiles.length && (await handleLocalVoiceCommand(text))) {
      composerRef.current = "";
      setComposer("");
      lastSendClickAtRef.current = 0;
      return;
    }

    if (!retryMessage && !pendingFiles.length) {
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
        lastSendClickAtRef.current = 0;
        return;
      }
    }

    const serverId = activeServerIdRef.current;
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

	    if (pendingActionRef.current) {
	      const title = "请先完成上方的登录或选择";
	      setVoiceError(title);
      enqueueTaskNotice({ serverId, title, tone: "error" });
      void appLog("warn", "send.blocked", {
        serverId,
        reason: "pending_action",
      });
      return;
    }

	    if (sendingServerIdsRef.current.has(serverId)) {
	      const title = "正在提交，请稍等";
      setVoiceError(title);
      enqueueTaskNotice({ serverId, title, tone: "error" });
      void appLog("warn", "send.blocked", { serverId, reason: "already_sending" });
      return;
    }
	    if (isServerBusy(serverId)) {
	      const title = "任务执行中，不能重复发送";
      setVoiceError(title);
      enqueueTaskNotice({ serverId, title, tone: "error" });
      const busyServer = serverById(serverId);
      const runningMessage = runningMessageForServer(busyServer);
      void appLog("warn", "send.blocked", {
        serverId,
        reason: "server_task_running",
        taskState: taskStateForMessage(runningMessage),
        taskBackend: busyServer?.task?.backend || "",
        runningMessageId: runningMessage?.id || "",
        runningRemoteTaskId: runningMessage?.remoteTaskId || "",
        runningRemoteStatus: runningMessage?.remoteTaskStatus || "",
      });
      return;
    }

    let sourceServer = serverById(serverId) || activeServer;
    // Never dispatch from the global active profile. During a fast session
    // switch it can still point at the previously selected session.
    let currentProfile = withKnownPassword(sourceServer?.profile || profileRef.current);
    if (showProfileIssue(currentProfile)) {
      enqueueTaskNotice({ serverId, title: "连接信息不完整，请先补全配置", tone: "error" });
      return;
    }
    if (!String(currentProfile.workdir || "").trim()) {
      setVoiceError("请先选择一个工作目录。");
      setServerConnection(serverId, { state: "idle", label: "待选择目录", detail: "未选择工作目录" });
      enqueueTaskNotice({ serverId, title: "请先选择一个工作目录", tone: "error" });
      return;
    }
    // Retried messages are historical UI data. They cannot override the
    // immutable agent binding of the current work session.
    const selectedAgent = agentById(currentProfile.agentId, activeAgent);
    // A configured direct Agent owns its own authenticated HTTP connection.
    // Do not make a task submission wait for the legacy SSH command channel.
    const directAgentReadyForSend =
      agentPreferredForProfile(currentProfile) && agentDirectConfig(currentProfile).enabled;
    const transportReadyForSend = connectionIsLive(sourceServer.connection) || directAgentReadyForSend;
    sendingServerIdsRef.current.add(serverId);
    cancelledUploadBootstrapServerIdsRef.current.delete(serverId);
    const routerEnabled = mainAIRouterReady(currentProfile) && !pendingFiles.length;
    const existingRetryMessage = retryMessage?.id
      ? (sourceServer.messages || []).find((item) => item.id === retryMessage.id && item.role === "assistant")
      : null;
    const reuseMessage = existingRetryMessage || null;
    const clientCreatedAtMs = Date.now();
    const turnId = String(reuseMessage?.turnId || reuseMessage?.messagePairId || "").trim() || `turn-${clientCreatedAtMs}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessageId = String(reuseMessage?.replyToMessageId || "").trim() || `${turnId}-request`;
    const assistantMessageId = reuseMessage?.id || `${turnId}-response`;
    const messagePairId = turnId;
    const sourceMessages = sourceServer.messages || [];
    const initialBackend = agentPreferredForProfile(currentProfile) ? "agent" : "ssh";
    const initialConversationId = ensureServerConversationId(serverId, currentProfile, selectedAgent.id);
    // Keep a message-specific reveal request separate from the generic sticky
    // scroll flag. Scroll events may update the generic flag before React has
    // committed this turn, but they must not cancel a deliberate send reveal.
    conversationRevealRequestRef.current = createConversationRevealRequest(serverId, userMessageId);
    conversationStickToBottomRef.current = true;
    composerRef.current = "";
    setComposer("");
    setRawOpen(false);
    setServerTaskMetadata(serverId, {
      agentId: selectedAgent.id,
      startedAt: Date.now(),
      label: `等待 ${selectedAgent.shortName}`,
    });
    setServerConnection(
      serverId,
      transportReadyForSend
        ? {
            state: "connected",
            label: "已连接",
            detail: selectedAgent.shortName,
          }
        : {
            state: "testing",
            label: "连接中",
            detail: "正在建立服务器连接",
          },
    );
    setServerMessages(serverId, (items) => {
      if (reuseMessage) {
        return items.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                agentId: selectedAgent.id,
                title: transportReadyForSend
                  ? pendingFiles.length
                    ? "上传中"
                    : routerEnabled
                      ? "判断中"
                      : "提交中"
                  : "准备发送",
                body: transportReadyForSend
                  ? pendingFiles.length
                    ? `正在上传 ${pendingFiles.length} 个文件。`
                    : routerEnabled
                      ? "正在判断这句话该怎么处理。"
                      : `正在重新提交给 ${selectedAgent.shortName}。`
                  : "正在连接服务器，连接后会自动提交。",
                output: "",
                liveOutput: "",
                taskState: taskStateSubmitting,
                backend: initialBackend,
                conversationId: initialConversationId,
                promptText: text,
                retryText: text,
                startedAt: Date.now(),
                completedAt: undefined,
                durationMs: undefined,
                remoteTaskId: undefined,
                remoteTaskStatus: "preparing",
                remoteTaskCheckedAt: Date.now(),
                agentFailure: undefined,
                technicalDetail: undefined,
                resultMissing: false,
                remoteSyncError: "",
                loginAction: undefined,
                modelChoice: undefined,
                requiredAction: undefined,
                cancelledAt: undefined,
                retryCount: Number(item.retryCount || 0) + 1,
              }
            : item,
        );
      }

      return [
        ...items,
        createMessage({
        id: userMessageId,
        role: "user",
        body: pendingFiles.length
          ? `${text}\n\n${pendingFiles.map((item) => `[${item.isImage ? "图片" : "文件"}] ${item.name}`).join("\n")}`
          : text,
        turnId,
        messagePairId,
        backend: initialBackend,
        conversationId: initialConversationId,
        agentId: selectedAgent.id,
        promptText: text,
        clientCreatedAtMs,
      }),
      createMessage({
        id: assistantMessageId,
        role: "assistant",
        agentId: selectedAgent.id,
        title: transportReadyForSend
          ? pendingFiles.length
            ? "上传中"
            : routerEnabled
              ? "判断中"
              : "提交中"
          : "准备发送",
        body: transportReadyForSend
          ? pendingFiles.length
            ? `正在上传 ${pendingFiles.length} 个文件。`
            : routerEnabled
              ? "正在判断这句话该怎么处理。"
              : `正在提交给 ${selectedAgent.shortName}。`
          : "消息已保存在本地，正在连接服务器，连接后会自动提交。",
        taskState: taskStateSubmitting,
        backend: initialBackend,
        conversationId: initialConversationId,
        promptText: text,
        startedAt: Date.now(),
        remoteTaskStatus: "preparing",
        remoteTaskCheckedAt: Date.now(),
        clientCreatedAtMs,
        turnId,
        messagePairId,
        replyToMessageId: userMessageId,
      }),
      ];
    });
    void appLog("info", "send.local_messages.appended", {
      serverId,
      userMessageId,
      assistantMessageId,
      previousMessageCount: sourceMessages.length,
      agentId: selectedAgent.id,
      backend: agentPreferredForProfile(currentProfile) ? "agent" : "ssh",
    });

    if (!transportReadyForSend) {
      setSendConnectingServerId(serverId);
      try {
        await connectExistingSession(serverId);
      } finally {
        setSendConnectingServerId((current) => (current === serverId ? "" : current));
      }
      sourceServer = serverById(serverId) || sourceServer;
      currentProfile = withKnownPassword(sourceServer.profile);
      if (!connectionIsLive(sourceServer.connection)) {
        const finishedAt = Date.now();
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: "连接异常",
          body: "消息已保存在本地，但没有发送到远端。重新连接后可以编辑并再次发送。",
          taskState: taskStateFailed,
          remoteTaskStatus: "connection-failed",
          completedAt: finishedAt,
          forceUpdate: true,
        });
        setServerTaskMetadata(serverId, {
          agentId: selectedAgent.id,
          finishedAt,
          label: "消息未发送",
        });
        sendingServerIdsRef.current.delete(serverId);
        enqueueTaskNotice({ serverId, title: "连接异常，消息未发送", tone: "error" });
        void appLog("warn", "send.connection.failed", {
          serverId,
          userMessageId,
          assistantMessageId,
        });
        return;
      }
      updateAssistantMessageInServer(serverId, assistantMessageId, {
        title: pendingFiles.length ? "上传中" : routerEnabled ? "判断中" : "提交中",
        body: pendingFiles.length
          ? `正在上传 ${pendingFiles.length} 个文件。`
          : routerEnabled
            ? "正在判断这句话该怎么处理。"
            : `正在提交给 ${selectedAgent.shortName}。`,
        backend: agentPreferredForProfile(currentProfile) ? "agent" : "ssh",
        forceUpdate: true,
      });
    }

    let ranRemote = false;
    let completedOk = false;
    let pendingRemoteTask = false;
    let finalAgent = selectedAgent;
    let sendStage = pendingFiles.length ? "uploading" : "executing";
    let uploadedFileCount = 0;
    try {
      let agent = selectedAgent;
      let uploadedImages = [];
      let promptText = text;
      if (pendingFiles.length) {
        uploadedImages = await uploadImageAttachmentsForProfile(
          currentProfile,
          pendingFiles,
          serverId,
          assistantMessageId,
        );
        sourceServer = serverById(serverId) || sourceServer;
        currentProfile = withKnownPassword(sourceServer.profile || currentProfile);
        uploadedFileCount = uploadedImages.length;
        removeUploadedImageAttachments(pendingFiles, serverId);
        sendStage = "executing";
        promptText = appendUploadedImagesToPrompt(text, uploadedImages);
        updateAssistantMessageInServer(serverId, userMessageId, {
          body: text,
          attachments: uploadedImages,
          forceUpdate: true,
        });
	        updateAssistantMessageInServer(serverId, assistantMessageId, {
	          title: "提交中",
	          body: `附件已上传，正在提交给 ${selectedAgent.shortName}。`,
          taskState: taskStateSubmitting,
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
            taskState: taskStateSubmitting,
          });
        }
      }

      if (route) {
        // A work session owns one AI conversation. The router may classify or
        // rewrite a request, but it must not send it to a different CLI while
        // retaining this session's conversationId.
        agent = selectedAgent;
        task = taskTextFromValue(route.task, promptText);

        if (route.action === "answer_directly" || route.action === "ask_clarification" || route.action === "no_action") {
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: route.action === "ask_clarification" ? "主 AI 需要确认" : "主 AI 回复",
            body: "",
            output: route.reply || route.reason || "我需要你再说清楚一点。",
            agentId: selectedAgent.id,
            taskState: taskStateSucceeded,
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
            taskState: taskStateSucceeded,
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
              `准备交给 ${selectedAgent.shortName}：${task}`,
              "",
              "确认后再发一次明确指令，我再执行。",
            ].join("\n"),
            agentId: selectedAgent.id,
            taskState: taskStateSucceeded,
          });
          setServerConnection(serverId, { state: "connected", detail: `${selectedAgent.shortName} 等待任务确认` });
          return;
        }

        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: "提交中",
          body: `正在发送给 ${selectedAgent.shortName}。`,
          agentId: selectedAgent.id,
          taskState: taskStateSubmitting,
        });
      }

      ranRemote = true;
      finalAgent = agent;
      void appLog("info", "send.remote.start", {
        serverId,
        assistantMessageId,
        agentId: agent.id,
        backend: agentPreferredForProfile(currentProfile) ? "agent" : "ssh",
        textLength: task.length,
      });
      const remoteResult = await runAgentPrompt({
        serverId,
        currentProfile,
        agent,
        text: task,
        turnId,
        assistantMessageId,
        userMessageId,
      });
      completedOk = Boolean(remoteResult?.ok);
      pendingRemoteTask = Boolean(remoteResult?.pending);
      if (pendingRemoteTask) {
        const pendingMessage = (serverById(serverId)?.messages || []).find((item) => item.id === assistantMessageId);
        const remoteTaskId = String(pendingMessage?.remoteTaskId || "").trim();
        if (remoteTaskId && taskStateForMessage(pendingMessage) === taskStateSubmitting) {
          const remoteTaskStatus = String(pendingMessage?.remoteTaskStatus || "").trim();
          updateAssistantMessageInServer(serverId, assistantMessageId, {
            title: remoteTaskStatus === "sync-lost" ? "同步中" : "Agent 已接收",
            body:
              remoteTaskStatus === "sync-lost"
                ? "任务已提交，正在重新连接并同步执行结果。"
                : "消息发送成功，Agent 正在把任务交给 AI。",
            taskState: remoteTaskStatus === "sync-lost" ? taskStateSyncing : taskStateAccepted,
            remoteTaskCheckedAt: Date.now(),
            forceUpdate: true,
          });
        }
      }
    } catch (error) {
      const message = shortError(error);
      uploadedFileCount = Math.max(uploadedFileCount, Number(error?.uploadedFileCount || 0));
      const agentMode = agentPreferredForProfile(currentProfile);
      const uploadFailed = sendStage === "uploading";
      const uploadCancelled = uploadFailed && /AIWB_UPLOAD_CANCELLED|cancelled|canceled|已取消|取消上传/i.test(
        String(error?.code || error?.message || error || ""),
      );
      // A direct-transport request that timed out or dropped its connection may
      // still have created the task on the Agent. Treat it like a transient SSH
      // disconnect so a known remoteTaskId hands off to the background sweep
      // instead of being reported as a hard failure that loses a running task.
      const directTransportRecoverable =
        agentMode && ["agent_direct_timeout", "agent_direct_network_error"].includes(String(error?.code || ""));
      const transientAgentDisconnect =
        !uploadFailed && agentMode && (isTransientSshSyncError(error) || directTransportRecoverable);
      const executionTimedOut =
        !uploadFailed &&
        /SSH command timed out|远端任务执行时间太长/i.test(String(error?.message || error || ""));
      void appLog("error", "send.remote.failed", {
        serverId,
        assistantMessageId,
        agentId: finalAgent.id,
        backend: agentMode ? "agent" : "ssh",
        stage: sendStage,
        uploadedFileCount,
        error: message,
        transientAgentDisconnect,
      });
      if (!transientAgentDisconnect && serverId === activeServerIdRef.current) setRawOpen(true);
      setServerRawOutput(serverId, transientAgentDisconnect ? "连接断开" : message);
      if (uploadFailed) {
        const totalFiles = pendingFiles.length;
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: uploadCancelled ? "已取消文件上传" : "文件上传失败",
          body: uploadCancelled
            ? `附件仍保留在输入框，Agent 没有创建任务，${finalAgent.shortName} 没有收到这条消息。`
            : [
                `已完成：消息已保存在本机，服务器连接成功。`,
                `中断位置：上传附件（${uploadedFileCount}/${totalFiles}）。`,
                `尚未执行：Agent 没有创建任务，${finalAgent.shortName} 没有收到这条消息。`,
                "",
                message,
              ].join("\n"),
          taskState: uploadCancelled ? taskStateCancelled : taskStateFailed,
          backend: agentMode ? "agent" : "ssh",
          remoteTaskStatus: uploadCancelled ? "upload-cancelled" : "upload-failed",
          resultMissing: false,
          completedAt: Date.now(),
          loginAction: undefined,
          modelChoice: undefined,
          forceUpdate: true,
        });
        setServerTaskMetadata(serverId, {
          backend: agentMode ? "agent" : "ssh",
          remoteTaskId: "",
          agentId: finalAgent.id,
          finishedAt: Date.now(),
          label: uploadCancelled ? "附件上传已取消" : "附件上传失败",
        });
        setServerConnection(serverId, {
          state: uploadCancelled ? "connected" : "error",
          label: uploadCancelled ? "已取消" : "上传失败",
          detail: uploadCancelled
            ? "附件已保留，AI 尚未启动"
            : `${uploadedFileCount}/${totalFiles} 个附件已上传，AI 尚未启动`,
          mode: agentMode ? "agent" : "ssh",
        });
        enqueueTaskNotice({
          serverId,
          title: uploadCancelled ? "附件上传已取消，可以重新发送" : "附件上传失败，AI 尚未启动",
          tone: "warning",
        });
      } else if (transientAgentDisconnect) {
        const currentMessage = (serverById(serverId)?.messages || []).find((item) => item.id === assistantMessageId) || {};
        const remoteTaskId = String(currentMessage.remoteTaskId || "").trim();
        const taskWasAccepted = Boolean(remoteTaskId);
        const conversationId = String(currentMessage.conversationId || "").trim() || ensureServerConversationId(serverId, currentProfile, finalAgent.id);
        pendingRemoteTask = taskWasAccepted;
        ranRemote = true;
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: taskWasAccepted ? "连接断开" : "提交状态未知",
          body: taskWasAccepted
            ? "正在自动重新连接。远端任务可能仍在运行，连接恢复后会继续同步。"
            : "没有拿到远端任务编号，当前没有可查询的状态。请直接重新发送这条任务。",
          taskState: taskWasAccepted ? taskStateSyncing : taskStateFailed,
          backend: "agent",
          conversationId,
          remoteTaskId: remoteTaskId || undefined,
          agentId: finalAgent.id,
          promptText: taskTextFromValue(currentMessage.promptText || text),
          remoteTaskStatus: taskWasAccepted ? "sync-lost" : "sync-lost-no-task-id",
          remoteTaskCheckedAt: Date.now(),
          remoteSyncError: message,
          resultMissing: taskWasAccepted ? undefined : true,
          completedAt: taskWasAccepted ? undefined : Date.now(),
          agentFailure: undefined,
          technicalDetail: undefined,
          loginAction: undefined,
          modelChoice: undefined,
          forceUpdate: true,
        });
        setServerTaskMetadata(serverId, {
          backend: "agent",
          conversationId,
          remoteTaskId: remoteTaskId || "",
          agentId: finalAgent.id,
          startedAt: Number(currentMessage.startedAt || currentMessage.createdAtMs || Date.now()),
          finishedAt: taskWasAccepted ? undefined : Date.now(),
          label: taskWasAccepted ? `等待同步 ${finalAgent.shortName}` : "需要重新发送",
        });
        setServerConnection(serverId, {
          state: taskWasAccepted ? "testing" : "error",
          label: taskWasAccepted ? "连接断开" : "连接异常",
          detail: taskWasAccepted ? "正在自动重新连接" : "无法确认远端任务状态",
          mode: "agent",
        });
        enqueueTaskNotice({
          serverId,
          title: taskWasAccepted ? "连接断开，正在重连" : "任务没有确认提交，请重新发送",
          tone: "warning",
        });
      } else if (executionTimedOut) {
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: "暂未收到结果",
          body: "任务没有在等待时间内返回。可以稍后重试。",
          taskState: taskStateFailed,
          backend: agentMode ? "agent" : "ssh",
          remoteTaskStatus: "timeout",
          resultMissing: false,
          completedAt: Date.now(),
          loginAction: undefined,
          modelChoice: undefined,
          forceUpdate: true,
        });
        setServerTaskMetadata(serverId, {
          backend: agentMode ? "agent" : "ssh",
          agentId: finalAgent.id,
          finishedAt: Date.now(),
          label: "暂未收到结果",
        });
        setServerConnection(serverId, {
          state: "connected",
          label: "已连接",
          detail: finalAgent.shortName,
          mode: agentMode ? "agent" : "ssh",
        });
      } else {
        updateAssistantMessageInServer(serverId, assistantMessageId, {
          title: uploadedFileCount ? "AI 执行失败" : "远端执行失败",
          body: uploadedFileCount
            ? `附件已上传，但 ${finalAgent.shortName} 没有完成任务：${message}`
            : message,
          taskState: taskStateFailed,
          loginAction: undefined,
          modelChoice: undefined,
        });
        setServerConnection(serverId, connectionStateForRemoteError(message, finalAgent, agentMode ? "agent" : "ssh"));
      }
    } finally {
      sendingServerIdsRef.current.delete(serverId);
      cancelledUploadBootstrapServerIdsRef.current.delete(serverId);
      if (!pendingRemoteTask) {
        setServerTaskMetadata(serverId, {
          agentId: finalAgent.id,
          finishedAt: Date.now(),
        });
      }
      if (!ranRemote && completedOk) {
        setServerConnection(serverId, { state: "connected", label: "已完成", detail: finalAgent.shortName });
      }
      if (ranRemote && !pendingRemoteTask) notifyTaskFinished(serverId, finalAgent, completedOk);
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
      const recognitionSessionId = `dictation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      voiceRecognitionSessionIdRef.current = recognitionSessionId;
      const result = await VoiceWorkbench.start({
        locale: "zh-CN",
        timeoutSeconds: 30,
        silenceSeconds: 3,
        sessionId: recognitionSessionId,
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
      voiceRecognitionSessionIdRef.current = "";
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
        wakeListeningSignatureRef.current = wakeContext.phrases.join("\n");
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
      wakeListeningSignatureRef.current = "";
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
      wakeListeningSignatureRef.current = "";
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

  function startPushToTalk() {
    if (voiceStateRef.current !== "idle") return false;
    return startVoiceInput({ silentOnEmpty: true });
  }

  async function stopPushToTalk() {
    if (voiceStateRef.current !== "listening") return;
    voiceSessionActiveRef.current = false;
    applyVoiceState("stopping");
    try {
      await VoiceWorkbench.stop();
    } catch {
      applyVoiceState("idle");
    }
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
      taskState: taskStateRunning,
      modelChoice: undefined,
    });

    try {
      const choiceOutput = await runRemoteCommand(buildModelChoiceCommand(currentProfile, agent, choice), 1_048_576, 120);
      setRawOutput(String(choiceOutput || "").trim());
      await runAgentPrompt({
        serverId,
        currentProfile,
        agent,
        text,
        turnId: message.turnId || message.messagePairId || "",
        assistantMessageId: message.id,
        userMessageId: message.replyToMessageId || "",
      });
    } catch (error) {
      const detail = shortError(error);
      setRawOpen(true);
      setRawOutput(detail);
      updateAssistantMessage(message.id, {
        title: "模型选择失败",
        body: detail,
        taskState: taskStateFailed,
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
      taskState: taskStateRunning,
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
        taskState: taskStateSucceeded,
        loginAction: undefined,
        modelChoice: undefined,
      });
      setConnection({ state: "connected", detail: `${agent.shortName} 等待登录` });
    } catch (error) {
      const detail = shortError(error);
      setRawOpen(true);
      setRawOutput(detail);
      updateAssistantMessage(message.id, {
        title: "生成登录码失败",
        body: detail,
        taskState: taskStateFailed,
        loginAction: undefined,
        modelChoice: undefined,
      });
      setConnection({ state: "error", label: "登录失败", detail });
    } finally {
      setBusy(false);
    }
  }

  function updateAssistantMessage(id, patch) {
    updateAssistantMessageInServer(activeServerIdRef.current, id, patch);
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
      const targetAgent = agentById(targetMessage?.agentId || currentProfile.agentId);
      const detail = "这条消息没有 Agent 任务 ID，App 不能继续查询远端状态。请重新发送。";
      setConnection({
        state: "connected",
        label: "已连接",
        detail: "缺少 Agent 任务 ID",
        mode: "agent",
      });
      setRawOpen(true);
      setRawOutput(
        [targetMessage.title, targetMessage.body, targetMessage.output, targetMessage.liveOutput]
          .filter(Boolean)
          .join("\n\n"),
      );
      updateAssistantMessageInServer(serverId, targetMessage.id, {
        title: "状态无法同步",
        body: detail,
        taskState: taskStateFailed,
        resultMissing: false,
        remoteTaskStatus: "sync-lost-no-task-id",
        remoteSyncError: detail,
        remoteTaskCheckedAt: Date.now(),
        forceUpdate: true,
      });
      setServerTaskMetadata(serverId, {
        backend: "agent",
        agentId: targetAgent.id,
        finishedAt: Date.now(),
      });
      enqueueTaskNotice({
        serverId,
        title: "缺少任务 ID，无法继续同步",
        tone: "warning",
      });
      return;
    }
    const runningAgentMessage =
      requestedAgentMessage ||
      lastIncompleteAgentResponse(server);
    if (runningAgentMessage) {
      const refreshNoticeKey = `refresh:${serverId}:${runningAgentMessage.id}`;
      enqueueTaskNotice({
        serverId,
        title: "正在检查远端任务状态",
        tone: "progress",
        persistent: true,
        key: refreshNoticeKey,
      });
      setBusy(true);
      try {
        await syncRemoteAgentMessage(serverId, runningAgentMessage);
      } finally {
        setBusy(false);
        dismissTaskNoticeByKey(refreshNoticeKey);
      }
      return;
    }
    setConnection({
      ...(server?.connection || {}),
      state: "connected",
      label: "已连接",
      detail: "没有需要同步的未完成任务",
      mode: "agent",
    });
    enqueueTaskNotice({ serverId, title: "最后一条回复已经完整保存在本地", tone: "done" });
  }

  async function interruptAgent() {
    const serverId = activeServerIdRef.current;
    const server = serverById(serverId);
    const currentProfile = withKnownPassword(server?.profile || profileRef.current);
    if (showProfileIssue(currentProfile)) return;
    const activeUpload = activeUploadByServerRef.current.get(serverId);

    const runningMessage = lastActiveTaskMessage(server?.messages || []);
    const runningAgentMessage =
      runningMessage?.backend === "agent" && runningMessage.remoteTaskId ? runningMessage : null;
    const uploadBootstrapRunning =
      !activeUpload?.uploadId &&
      sendingServerIdsRef.current.has(serverId) &&
      !runningAgentMessage &&
      (runningMessage?.title === "上传中" || /正在上传/.test(String(runningMessage?.body || "")));
    const taskAgent = agentById(runningMessage?.agentId || server?.task?.agentId || currentProfile.agentId, activeAgent);

    if (busyRef.current && !runningMessage && !serverTaskRunning(server)) return;

    enqueueTaskNotice({ serverId, title: "正在停止当前任务", tone: "warning" });
    setBusy(true);
    setRawOpen(false);
    try {
      if (uploadBootstrapRunning) {
        cancelledUploadBootstrapServerIdsRef.current.add(serverId);
        enqueueTaskNotice({ serverId, title: "正在取消附件上传，附件会保留在输入框", tone: "warning" });
        return;
      }
      if (activeUpload?.uploadId) {
        const result = await cancelAgentDirectUpload(activeUpload.uploadId);
        if (result?.active === false && result?.cancelled !== true) {
          throw new Error("上传已经结束，没有可取消的上传操作。");
        }
        enqueueTaskNotice({ serverId, title: "已取消附件上传，附件仍保留在输入框", tone: "warning" });
        return;
      }
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
	          title: failure?.title || "已取消",
	          body: failure?.body || (visibleOutput ? "任务已停止，下面保留停止前已经收到的内容。" : "任务已停止，可以继续输入。"),
          output: visibleOutput,
          liveOutput: "",
          taskState: taskStateCancelled,
          backend: "agent",
          remoteTaskId: runningAgentMessage.remoteTaskId,
          remoteTaskStatus: "cancelled",
          agentId: targetAgent.id,
          agentFailure: undefined,
          technicalDetail: failure?.detail || cleanAgentFailureDetail(raw),
          cancelledAt: now,
          completedAt: now,
          forceUpdate: true,
        });
        setServerTaskMetadata(serverId, {
          backend: "agent",
          remoteTaskId: runningAgentMessage.remoteTaskId,
          agentId: targetAgent.id,
          interruptedAt: now,
          finishedAt: now,
        });
        setServerConnection(serverId, {
          state: "connected",
          label: "已连接",
          detail: targetAgent.shortName,
          mode: "agent",
        });
        enqueueTaskNotice({ serverId, title: "任务已取消，可以继续输入", tone: "warning" });
        return;
      }

      throw new Error("当前任务缺少 Agent 任务 ID，不能执行旧式 SSH/tmux 停止操作。请重新连接会话。");
    } catch (error) {
      const message = shortError(error);
      setServerRawOutput(serverId, message);
      setServerConnection(serverId, {
        state: "error",
        detail: message,
        mode: "agent",
      });
      enqueueTaskNotice({ serverId, title: "停止任务失败，请查看详情", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function clearProfile() {
    const currentId = editingServerId || activeServerIdRef.current;
    if (!currentId) return;
    if (typeof window !== "undefined" && workspaceSaveTimerRef.current) {
      window.clearTimeout(workspaceSaveTimerRef.current);
      workspaceSaveTimerRef.current = null;
    }
    const currentServers = serversRef.current;
    const remaining = currentServers.filter((server) => server.id !== currentId);

    if (remaining.length) {
      const nextActive = remaining[0];
      setServers(remaining);
      serversRef.current = remaining;
      setActiveServerId(nextActive.id);
      activeServerIdRef.current = nextActive.id;
      setEditingServerId(nextActive.id);
      updateDraftProfile(nextActive.profile);
      profileRef.current = nextActive.profile;
      setSettingsOpen(false);
      setRawOpen(false);
      await saveWorkspace(remaining, nextActive.id, { deletedServerIds: [currentId] });
      return;
    }

    setServers(remaining);
    serversRef.current = remaining;
    setActiveServerId("");
    activeServerIdRef.current = "";
    setEditingServerId("");
    updateDraftProfile(defaultProfile);
    profileRef.current = defaultProfile;
    setSettingsOpen(false);
    setRawOpen(false);
    await saveWorkspace(remaining, "", { deletedServerIds: [currentId] });
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
        const layoutWidth = Math.round(window.innerWidth || root.clientWidth || viewport?.width || 0);
        const layoutHeight = Math.round(window.innerHeight || root.clientHeight || viewport?.height || 0);
        const keyboardHeight = Math.round(viewport?.height || layoutHeight);
        const height = keyboardFocused ? Math.min(layoutHeight, keyboardHeight) : layoutHeight;
        const width = layoutWidth;
        const geometry = `${width}x${height}:${keyboardFocused ? "keyboard" : "normal"}`;
        if (geometry === lastGeometry) return;
        lastGeometry = geometry;

        if (height > 0) root.style.setProperty("--app-viewport-height", `${height}px`);
        if (width > 0) root.style.setProperty("--app-viewport-width", `${width}px`);
        if (width > 0) {
          const nextClass = platform === "ios" ? nativeDeviceClassForRuntime(platform) : width >= 768 ? "tablet" : "phone";
          setNativeDeviceClass((current) => (current === nextClass ? current : nextClass));
        }
        root.scrollLeft = 0;
        root.scrollTop = 0;
        if (body) {
          body.scrollLeft = 0;
          body.scrollTop = 0;
        }
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      });
    };

    updateViewportSize();
    window.visualViewport?.addEventListener("resize", updateViewportSize);
    window.visualViewport?.addEventListener("scroll", updateViewportSize);
    window.addEventListener("resize", updateViewportSize);
    window.addEventListener("orientationchange", updateViewportSize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.visualViewport?.removeEventListener("resize", updateViewportSize);
      window.visualViewport?.removeEventListener("scroll", updateViewportSize);
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
  const activeSessionName = activeServerIndex >= 0 ? serverSessionName(activeServer, activeServerIndex) : "AI Workbench";
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
  const canOpenInteractiveTerminal = Boolean(bridge?.openTerminal);
  const conversationRevealMessageId =
    conversationRevealRequestRef.current?.serverId === activeServerId
      ? String(conversationRevealRequestRef.current.messageId || "")
      : "";
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
    terminalProfile: withKnownPassword(profile),
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
    sendConnecting: sendConnectingServerId === activeServerId,
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
    conversationRevealMessageId,
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
    taskNotice: activeTaskNotice,
    settingsOpen,
    settingsInitialPage,
    settingsDiscovery,
    settingsAgentTab,
    settingsSelectedSessions,
    editingServerId,
    draftProfile,
    filePreview,
    remoteDownloadOpen,
    remoteDirectoryOpen,
    remoteDirectory,
    onSelectServer: selectServer,
    onReorderServer: reorderServerSessions,
    onSortServer: sortServerSessions,
    onOpenChatWindow: openDetachedChatWindow,
    onConfigureServer: openServerSettings,
    onAddServer: openNewServerSettings,
    onDuplicateServer: () => duplicateServer(),
    onOpenGlobalSettings: openGlobalSettings,
    onOpenVoiceSettings: openGlobalVoiceSettings,
    onOpenCloudSync: openCloudSyncSettings,
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
    onOpenRemoteDirectory: () => openRemoteDirectory(profileRef.current?.workdir),
    onNavigateRemoteDirectory: openRemoteDirectory,
    onCloseRemoteDirectory: () => {
      setRemoteDirectoryOpen(false);
      setRemoteDirectory(null);
    },
    onInterruptAgent: interruptAgent,
    onMarkStuck: markRunningMessageStuck,
    onRetryMessage: retryAgentFailureMessage,
    onShowDetails: showAgentFailureDetails,
    onOpenSettingsFromMessage: openActiveServerSettingsFromMessage,
    setComposer,
    onAttachFiles: addImageAttachments,
    onAttachImages: addImageAttachments,
    onPickNativeAttachments: pickNativeAttachments,
    onPasteClipboard: pasteClipboardAttachments,
    onRemoveImageAttachment: removeImageAttachment,
    onSend: sendTask,
    onVoice: toggleVoiceInput,
    onPushToTalkStart: startPushToTalk,
    onPushToTalkEnd: stopPushToTalk,
    onWake: toggleWakeWord,
    onReleaseRunningTask: releaseActiveRunningTask,
    onCancelRunningTask: interruptAgent,
    onToggleRaw: () => setRawOpen((value) => !value),
    onOpenTaskNotice: async () => {
      if (activeTaskNotice?.serverId) await selectServer(activeTaskNotice.serverId);
      setTaskNotice(null);
    },
    onCloseTaskNotice: () => setTaskNotice(null),
    onCloseSettings: () => setSettingsOpen(false),
    onScanSettings: () => scanSettingsProfile(),
    onAddSelectedSessions: addSelectedSessionsFromSettings,
    onSaveSettings: editingServerId === "global" ? saveGlobalSettings : saveSessionSettings,
    onDeleteProfile: clearProfile,
    onDuplicateEditingServer: editingServerId && editingServerId !== "global" ? () => duplicateServer(editingServerId) : undefined,
    onOpenTerminal:
      editingServerId && editingServerId !== "global" && canOpenInteractiveTerminal ? () => openSshTerminal() : undefined,
    onLoginRemoteAgent:
      editingServerId && editingServerId !== "global"
        ? (agentId, mode, authorizationCode) => openRemoteAgentLogin(agentId, mode, authorizationCode)
        : undefined,
    agentManagementTargetId,
    onInstallAgent: installWorkbenchAgentForServer,
    onInstallCli: installCliForServer,
    onUninstallAgent: uninstallWorkbenchAgentForServer,
    onRefreshAgent: (serverId) => refreshAgentHealthForServer(serverId, "manual"),
    onOpenAgentSettings: (serverId) => openGlobalSettings(serverId),
    onInstallWsl: installWslForDraftProfile,
    onInstallGit: editingServerId && editingServerId !== "global" ? installGitForEditingServer : undefined,
    onGitDownload: editingServerId && editingServerId !== "global" ? runGitDownloadForEditingServer : undefined,
    onGitSshKey: editingServerId && editingServerId !== "global" ? inspectGitSshKeyForEditingServer : undefined,
    onExportConfig: exportWorkspaceConfig,
    onExportLogs: exportDiagnosticsLogs,
    onClearCache: clearWorkspaceCache,
    onImportConfig: importWorkspaceConfig,
    onCloudPullConfig: pullCloudWorkspaceConfig,
    onCloudPushConfig: pushCloudWorkspaceConfig,
    onCloudClearConfig: clearCloudWorkspaceConfig,
    onShareSession: shareSessionWithAccount,
    setDraftProfile: updateDraftProfile,
    setSettingsAgentTab,
    setSettingsSelectedSessions,
    onCloseFilePreview: () => setFilePreview(null),
  };

  return { nativeMobile, platform, nativeDeviceClass, shellProps };
}
