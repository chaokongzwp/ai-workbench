import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowClockwise,
  ArrowSquareOut,
  Bell,
  CaretRight,
  Check,
  Copy,
  DownloadSimple,
  FileZip,
  FolderSimple,
  GitBranch,
  HardDrives,
  Info,
  Key,
  Microphone,
  Palette,
  Robot,
  ShareNetwork,
  ShieldCheck,
  Terminal,
  TextT,
  Trash,
  UploadSimple,
  WarningCircle,
  Wrench,
  X,
} from "@phosphor-icons/react";
import * as Core from "../core/workbenchCore.js";
import * as Primitives from "./primitives.jsx";

const {
  SSHWorkbench,
  VoiceWorkbench,
  agentById,
  agentCommand,
  agentModelLabel,
  agentModelOptions,
  agentModelOptionsForAgent,
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
  buildInterruptCommand,
  buildKillCommand,
  buildMainAIRouteRequest,
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
  cloudSyncDefaultEndpoint,
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
  workbenchAgentGithubManifestUrl,
  legacyDefaultWakeWordPhrases,
  legacyDefaultWorkdirs,
  loadBrowserDiagnosticLogs,
  loadCloudSyncSettings,
  loadDirectoryPrefs,
  loadLocalMessageHistory,
  loadManualWorkdirHistory,
  loadWorkspaceMirror,
  localMessageHistoryFromServers,
  localMessageHistoryStorageKey,
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
  messageFontFamilyOptions,
  messageFontSizeOptions,
  messageFontWeightOptions,
  messageLineHeightOptions,
  migrationFileKind,
  migrationFileName,
  migrationFileVersion,
  normalizeAppearanceMode,
  normalizeAgentModel,
  normalizeCloudSyncAccount,
  normalizeDirectoryPrefs,
  normalizeExecutionPermissionMode,
  normalizeDiscovery,
  normalizeMainAIRoute,
  normalizeManualWorkdirHistory,
  normalizePersistedMessage,
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
  saveCloudSyncSettings,
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
  serverSidebarMeta,
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
const {
  AgentLogo,
  ArrowUpIcon,
  BoltIcon,
  ConnectionModeBadge,
  DiagnosticRow,
  FileAttachmentIcon,
  IconSvg,
  ImagePlusIcon,
  MicIcon,
  SectionHeader,
  StatusDot,
  SummaryMetric,
  TaskNotice,
  TaskTimer,
  WorkbenchLogo,
  copyPlainText,
  formatFileSize,
  readFileAsText,
  statusLabel,
  useRunningElapsed
} = { ...Primitives };

function agentTaskStatusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (value === "queued") return "排队中";
  if (value === "preparing") return "准备中";
  if (value === "running") return "运行中";
  if (value === "busy") return "会话占用";
  if (value === "done") return "已完成";
  if (value === "error") return "失败";
  if (value === "cancelled") return "已取消";
  return "未知";
}

function agentTaskStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (["queued", "preparing", "running", "busy"].includes(value)) return "active";
  if (value === "done") return "done";
  if (value === "error") return "error";
  if (value === "cancelled") return "cancelled";
  return "unknown";
}

function agentTaskTimeLabel(task) {
  const timestamp =
    timestampFromAgentTime(task?.startedAt) ||
    timestampFromAgentTime(task?.createdAt) ||
    timestampFromAgentTime(task?.finishedAt);
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AgentTaskList({ tasks = [] }) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const activeTasks = safeTasks.filter((task) => task.active);
  const visibleTasks = activeTasks.length ? activeTasks : safeTasks.slice(0, 3);
  const title = activeTasks.length ? `当前任务 ${activeTasks.length}` : "当前无运行任务";

  return (
    <div className="agent-task-list">
      <div className="agent-task-list-head">
        <strong>{title}</strong>
        <span>{safeTasks.length ? `最近记录 ${safeTasks.length}` : "点击刷新获取"}</span>
      </div>
      {visibleTasks.length ? (
        <div className="agent-task-items">
          {visibleTasks.map((task) => {
            const agent = agentById(task.agentId || "codex");
            const statusTone = agentTaskStatusTone(task.status);
            const timeLabel = agentTaskTimeLabel(task);
            const primary = task.name || task.workdir || task.conversationId || task.id;
            const secondary = [
              agent.shortName,
              task.model ? agentModelLabel(task.agentId || agent.id, task.model) : "",
              task.workdir,
              task.pid ? `PID ${task.pid}${task.pidAlive === "1" ? " 在线" : task.pidAlive === "0" ? " 已退出" : ""}` : "",
              timeLabel,
            ].filter(Boolean);
            return (
              <div key={task.id} className={`agent-task-item ${statusTone}`}>
                <div>
                  <strong>{primary}</strong>
                  <span>{secondary.join(" · ")}</span>
                  <small>{task.id}</small>
                </div>
                <em>{agentTaskStatusLabel(task.status)}</em>
              </div>
            );
          })}
        </div>
      ) : (
        <small className="agent-task-empty">还没有读取到任务列表。</small>
      )}
    </div>
  );
}

function SettingsSection({ title, footer = "", className = "", children }) {
  return (
    <section className={`settings-section ${className}`.trim()}>
      {title ? <h2 className="settings-section-title">{title}</h2> : null}
      <div className="settings-section-group">{children}</div>
      {footer ? <p className="settings-section-footer">{footer}</p> : null}
    </section>
  );
}

function SettingsMenuRow({ icon: Icon, title, detail = "", value = "", tone = "default", onClick }) {
  return (
    <button type="button" className={`settings-menu-row tone-${tone}`} onClick={onClick}>
      <span className="settings-menu-icon" aria-hidden="true">
        <Icon size={18} weight="fill" />
      </span>
      <span className="settings-menu-copy">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {value ? <span className="settings-menu-value">{value}</span> : null}
      <CaretRight className="settings-menu-chevron" size={17} weight="bold" aria-hidden="true" />
    </button>
  );
}

function SettingsActionRow({ icon: Icon, title, detail = "", destructive = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      className={`settings-action-row ${destructive ? "destructive" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="settings-action-row-icon" aria-hidden="true">
        <Icon size={19} weight="bold" />
      </span>
      <span>
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <CaretRight size={17} weight="bold" aria-hidden="true" />
    </button>
  );
}

function SettingsStatusRow({ icon: Icon, title, detail = "", value = "", tone = "neutral", actions = null }) {
  return (
    <div className={`settings-status-row tone-${tone}${Icon ? "" : " no-icon"}`}>
      {Icon ? (
        <span className="settings-status-icon" aria-hidden="true">
          <Icon size={18} weight="bold" />
        </span>
      ) : null}
      <span className="settings-status-copy">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {value ? <span className="settings-status-value">{value}</span> : null}
      {actions ? <span className="settings-status-actions">{actions}</span> : null}
    </div>
  );
}

function SettingsButtonRow({ children }) {
  return <div className="settings-button-row">{children}</div>;
}

function WslAdvancedSection({
  busy,
  wslReady,
  wslNeedsRestart,
  wslStatusDetail,
  wslStatusLabel,
  onScan,
  onInstallWsl,
}) {
  return (
    <details className="settings-collapsible-section wsl-advanced-settings">
      <summary>
        <span className="settings-collapsible-summary-icon" aria-hidden="true">
          <Terminal size={18} weight="bold" />
        </span>
        <span className="settings-collapsible-summary-copy">
          <strong>高级 Windows 环境</strong>
          <small>仅在需要把工具放进 WSL Linux 时使用</small>
        </span>
        <CaretRight className="settings-collapsible-chevron" size={17} weight="bold" aria-hidden="true" />
      </summary>
      <div className="settings-section-group">
        <SettingsStatusRow
          icon={Terminal}
          title="WSL Linux"
          detail={wslStatusDetail}
          value={wslStatusLabel}
          tone={wslReady ? "success" : wslNeedsRestart ? "warning" : "neutral"}
        />
        <SettingsButtonRow>
          <button type="button" className="settings-inline-button" onClick={onScan} disabled={busy || !onScan}>
            <ArrowClockwise size={17} weight="bold" />
            检测 WSL
          </button>
          {!wslReady ? (
            <button
              type="button"
              className="settings-inline-button"
              onClick={onInstallWsl}
              disabled={busy || !onInstallWsl}
            >
              <Wrench size={17} weight="bold" />
              {wslNeedsRestart ? "完成安装" : "安装 WSL"}
            </button>
          ) : null}
        </SettingsButtonRow>
      </div>
      <p className="settings-section-footer">
        默认不需要 WSL。只有 Windows PowerShell 无法满足 Codex、Claude 或 Agent 运行要求时，再进入这里处理。
      </p>
    </details>
  );
}

const fallbackAppVersion =
  typeof __AIWB_APP_VERSION__ === "string" && __AIWB_APP_VERSION__ ? __AIWB_APP_VERSION__ : "1.0.0";
const fallbackAppBuild = typeof __AIWB_APP_BUILD__ === "string" ? __AIWB_APP_BUILD__ : "";

function appPlatformLabel(info = {}) {
  const platform = String(info.platform || desktopBridge()?.platform || "").toLowerCase();
  if (platform === "darwin" || platform === "mac") return "macOS";
  if (platform === "ios") return "iPhone / iPad";
  if (platform === "android") return "Android";
  if (platform === "win32" || platform === "windows") return "Windows";
  if (platform === "linux") return "Linux";
  return "当前设备";
}

function normalizeAppInfo(info = {}) {
  const version = String(info.version || fallbackAppVersion || "1.0.0").trim();
  const build = String(info.build || fallbackAppBuild || "").trim();
  return {
    ...info,
    name: String(info.name || "AI Workbench").trim(),
    version,
    build,
    displayVersion: build && build !== version ? `${version} (${build})` : version,
    platformLabel: appPlatformLabel(info),
  };
}

function parseToolLoginResult(agentId, output) {
  const raw = String(output || "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "")
    .trim();
  const url = raw.match(/https:\/\/[^\s)>]+/i)?.[0] || "";
  const code = agentId === "codex" ? raw.match(/\b[A-Z0-9]{4}-[A-Z0-9]{5}\b/)?.[0] || "" : "";

  if (agentId === "codex" && /Logged in using ChatGPT|Logged in as/i.test(raw)) {
    return {
      tone: "done",
      message: "Codex 已登录，可以返回会话开始使用。",
      url: "",
      code: "",
    };
  }
  if (agentId === "claude" && /"loggedIn"\s*:\s*true|Welcome back|Claude (?:Pro|Max|Team|Enterprise)|Let's get started/i.test(raw)) {
    return {
      tone: "done",
      message: "Claude 已登录，可以返回会话开始使用。",
      url: "",
      code: "",
    };
  }
  if (/Not logged in|Invalid API key|"loggedIn"\s*:\s*false/i.test(raw)) {
    return {
      tone: "warning",
      message: `${agentId === "claude" ? "Claude" : "Codex"} 尚未登录。请点击“开始登录”。`,
      url: "",
      code: "",
    };
  }
  if (url || code) {
    return {
      tone: "pending",
      message: "请在浏览器完成授权。完成后回到这里点“检查登录状态”。",
      url,
      code,
    };
  }
  return {
    tone: "done",
    message: raw ? "远端正在等待授权完成。" : "登录流程已启动，正在等待授权信息。",
    url: "",
    code: "",
  };
}

export function SettingsPanel({
  servers = [],
  platform = "",
  draftProfile,
  editingServer,
  busy,
  mode = "global",
  settingsDiscovery,
  settingsAgentTab,
  settingsSelectedSessions,
  setDraftProfile,
  setSettingsAgentTab,
  setSettingsSelectedSessions,
  onClose,
  onScan,
  onAddSelected,
  onSave,
  onDelete,
  onDuplicate,
  onLoginRemoteAgent,
  onInstallAgent,
  onInstallCli,
  onUninstallAgent,
  onRefreshAgent,
  onInstallWsl,
  onInstallGit,
  onGitDownload,
  onGitSshKey,
  onExportConfig,
  onExportLogs,
  onClearCache,
  onImportConfig,
  onCloudPullConfig,
  onCloudPushConfig,
  onCloudClearConfig,
  onShareSession,
  onTest,
  initialPage = "root",
  allowCloseWhileBusy = false,
}) {
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheStatus, setCacheStatus] = useState(null);
  const [cloudSyncBusy, setCloudSyncBusy] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState(null);
  const [cloudSyncForm, setCloudSyncForm] = useState(() => ({
    ...loadCloudSyncSettings(),
    password: "",
  }));
  const [shareForm, setShareForm] = useState(() => ({
    ...loadCloudSyncSettings(),
    password: "",
    recipientAccount: "",
  }));
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState(null);
  const [gitRepoUrl, setGitRepoUrl] = useState(() => String(draftProfile.gitRepoUrl || ""));
  const [gitTargetDir, setGitTargetDir] = useState(
    () => String(draftProfile.gitTargetDir || draftProfile.workdir || ""),
  );
  const [gitBranch, setGitBranch] = useState(() => String(draftProfile.gitBranch || ""));
  const [gitStatus, setGitStatus] = useState(null);
  const [gitSshKey, setGitSshKey] = useState({
    status: "idle",
    publicKey: "",
    path: "",
    fingerprint: "",
    message: "",
  });
  const [agentSelectionNotice, setAgentSelectionNotice] = useState("");
  const [sessionActionStatus, setSessionActionStatus] = useState(null);
  const [cliInstallStatus, setCliInstallStatus] = useState(null);
  const [toolLoginStatus, setToolLoginStatus] = useState(null);
  const [settingsPage, setSettingsPage] = useState(() => initialPage || "root");
  const [appInfo, setAppInfo] = useState(() => normalizeAppInfo());
  const [publishedAgentVersion, setPublishedAgentVersion] = useState(() => latestWorkbenchAgentVersion || "");
  const migrationInputRef = useRef(null);
  const settingsScrollRef = useRef(null);
  const gitSshKeyCheckedForRef = useRef("");

  function updateField(field, value) {
    if (field === "agentId") {
      const nextAgentId = value === "claude" ? "claude" : "codex";
      setDraftProfile((current) => {
        const currentModel = normalizeAgentModel(nextAgentId, current.aiModel);
        const validModel = (agentModelOptions[nextAgentId] || []).some((option) => option.id === currentModel)
          ? currentModel
          : "";
        return { ...current, agentId: nextAgentId, aiModel: validModel };
      });
      return;
    }
    if (field === "platform") {
      const nextPlatform = normalizeServerPlatform(value);
      setDraftProfile((current) => {
        const currentPlatform = normalizeServerPlatform(current.platform);
        const currentDefaults = serverPlatformDefaults[currentPlatform] || serverPlatformDefaults.linux;
        const nextDefaults = serverPlatformDefaults[nextPlatform] || serverPlatformDefaults.linux;
        return {
          ...current,
          platform: nextPlatform,
          workdir:
            !current.workdir || current.workdir === currentDefaults.workdir
              ? nextDefaults.workdir
              : current.workdir,
          codexCommand:
            !current.codexCommand || current.codexCommand === currentDefaults.codexCommand
              ? nextDefaults.codexCommand
              : current.codexCommand,
          claudeCommand:
            !current.claudeCommand || current.claudeCommand === currentDefaults.claudeCommand
              ? nextDefaults.claudeCommand
              : current.claudeCommand,
        };
      });
      return;
    }
    setDraftProfile((current) => ({ ...current, [field]: value }));
  }

  function updateSessionCreationAgent(value) {
    const nextAgentId = value === "claude" ? "claude" : "codex";
    if (settingsAgentTab !== nextAgentId) {
      setSettingsSelectedSessions([]);
    }
    setSettingsAgentTab(nextAgentId);
    updateField("agentId", nextAgentId);
  }

  async function handleDuplicateSession() {
    if (!onDuplicate || busy || sessionActionStatus?.tone === "loading") return;
    setSessionActionStatus({ tone: "loading", message: "正在复制会话..." });
    try {
      const duplicate = await onDuplicate();
      if (!duplicate?.id) {
        throw new Error("会话没有复制成功，请重试。");
      }
      setSessionActionStatus({
        tone: "done",
        message: `已复制为「${duplicate.name}」。修改完成后点击“保存更改”。`,
      });
      setSettingsPage("session-general");
    } catch (error) {
      setSessionActionStatus({ tone: "error", message: shortError(error) });
    }
  }

  const missingPassword = !String(draftProfile.password || "").trim();
  const addingSessions = mode === "add";
  const editingSession = mode === "edit";
  const globalSettings = mode === "global";
  const draftConnectionKey = profileConnectionKey(draftProfile);
  const sameMachineDiagnostics = (servers || [])
    .filter((server) => profileConnectionKey(server.profile) === draftConnectionKey)
    .map((server) => server.diagnostics || {});
  const availableMachineDiagnostics = sameMachineDiagnostics.find(
    (diagnostics) => diagnostics.agent === "available" || diagnostics.agent_version,
  );
  const mergedHealth = {
    ...(settingsDiscovery?.health || {}),
    ...sameMachineDiagnostics.reduce((health, diagnostics) => ({ ...health, ...diagnostics }), {}),
    ...(availableMachineDiagnostics || {}),
    ...(editingServer?.diagnostics || {}),
  };
  const agentHealth =
    mergedHealth.agent ||
    "missing";
  const agentVersion = mergedHealth.agent_version || "";
  const latestAgentVersion = publishedAgentVersion || latestWorkbenchAgentVersion || "";
  const installedAgentVersionNumber = workbenchAgentVersionNumber(agentVersion);
  const latestAgentVersionNumber = workbenchAgentVersionNumber(latestAgentVersion);
  const agentAvailable = agentHealth === "available";
  // Windows has a native Agent runtime. Older health snapshots used the
  // legacy "unsupported" marker even though the install path is valid, so
  // keep the setup controls available for Windows until a real probe says it
  // is missing or ready.
  const agentUnsupported = agentHealth === "unsupported" && !isWindowsProfile(draftProfile);
  // Uninstall is intentionally idempotent. A stale or missing health probe
  // must not make the destructive action impossible to reach; the remote
  // command reports whether there was anything to remove.
  const canUninstallAgent = Boolean(editingServer?.id && onUninstallAgent);
  const agentNeedsUpdate =
    agentAvailable &&
    latestAgentVersionNumber > 0 &&
    installedAgentVersionNumber > 0 &&
    installedAgentVersionNumber < latestAgentVersionNumber;
  const agentAheadOfPublished =
    agentAvailable &&
    latestAgentVersionNumber > 0 &&
    installedAgentVersionNumber > latestAgentVersionNumber;
  const agentVersionDetail = agentNeedsUpdate
    ? `已安装 v${agentVersion || "未知"} · 最新 v${latestAgentVersion || "未知"}，连接后会自动更新`
    : agentAheadOfPublished
      ? `已安装 v${agentVersion || "未知"} · 发布清单 v${latestAgentVersion || "未知"}，当前 Agent 版本较新`
      : `已安装 v${agentVersion || "未知"} · 最新 v${latestAgentVersion || "未知"}，已对齐`;
  const currentMachineTasks = Array.isArray(mergedHealth.agent_task_list)
    ? mergedHealth.agent_task_list
    : [];
  const currentMachineHostHealth = formatHostPerformanceSummary(mergedHealth, true);
  const cliMarkerAvailable = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || (normalized && !["0", "false", "missing", "unsupported"].includes(normalized));
  };
  const cliTools = [
    {
      id: "codex",
      name: "Codex",
      available: cliMarkerAvailable(mergedHealth.agent_codex_available) || cliMarkerAvailable(mergedHealth.codex),
      path: String(mergedHealth.agent_codex_path || mergedHealth.agent_codex_executable || mergedHealth.codex || "").trim(),
      status: String(mergedHealth.agent_codex_cli_status || "").trim(),
    },
    {
      id: "claude",
      name: "Claude",
      available: cliMarkerAvailable(mergedHealth.agent_claude_available) || cliMarkerAvailable(mergedHealth.claude),
      path: String(mergedHealth.agent_claude_path || mergedHealth.agent_claude_executable || mergedHealth.claude || "").trim(),
      status: String(mergedHealth.agent_claude_cli_status || "").trim(),
    },
  ];
  const gitPath = String(mergedHealth.git || "").trim();
  const gitVersion = String(mergedHealth.git_version || "").trim();
  const gitAvailable = Boolean(gitPath);
  const currentServerPlatform = normalizeServerPlatform(draftProfile.platform);
  const standardServerPlatforms = serverPlatforms.filter((option) => option.id !== "wsl");
  const serverPlatformOptions =
    currentServerPlatform === "wsl"
      ? [{ id: "wsl", label: "Windows + WSL（高级）" }, ...standardServerPlatforms]
      : standardServerPlatforms;
  const wslStatus = String(mergedHealth.wsl_status || "unknown").trim();
  const wslDistro = String(mergedHealth.wsl_default_distro || mergedHealth.wsl_distros || "Ubuntu").trim();
  const wslReady = wslStatus === "ready";
  const wslNeedsRestart = wslStatus === "restart_required";
  const wslStatusLabel = wslReady
    ? "可用"
    : wslNeedsRestart
      ? "待重启"
      : wslStatus === "initialization_required"
        ? "待初始化"
        : wslStatus === "installed_no_distro"
          ? "缺少发行版"
          : wslStatus === "missing"
            ? "未安装"
            : "未检测";
  const wslStatusDetail = wslReady
    ? `${wslDistro} 已就绪，重新扫描时会自动切换到 Linux 环境`
    : wslNeedsRestart
      ? "WSL 组件已安装，重启 Windows 后即可继续"
      : wslStatus === "initialization_required"
        ? `${wslDistro} 已安装，但还没有完成首次初始化`
        : wslStatus === "installed_no_distro"
          ? "WSL 系统组件已存在，还需要安装 Ubuntu"
          : "连接后可自动安装 WSL 2 和 Ubuntu；需要管理员权限，可能需要重启";

  function handleAgentModeChange(value) {
    if (!value) {
      if (isWindowsProfile(draftProfile)) {
        setAgentSelectionNotice("Windows 会话默认使用 Agent；只有 Agent 不可用时才会自动回退 SSH。");
        updateField("useWorkbenchAgent", true);
        return;
      }
      setAgentSelectionNotice("");
      updateField("useWorkbenchAgent", false);
      return;
    }
    if (agentUnsupported) {
      setAgentSelectionNotice("当前连接环境暂不支持 Agent，只能使用 SSH 直连。");
      return;
    }
    if (!agentAvailable) {
      setAgentSelectionNotice("已设为优先使用 Agent。当前机器还没检测到 Agent 时，本次会自动回退 SSH；安装或重新检测成功后，新任务会走 Agent。");
      updateField("useWorkbenchAgent", true);
      return;
    }
    setAgentSelectionNotice("");
    updateField("useWorkbenchAgent", true);
  }

  async function handleRefreshSessionAgent() {
    if (!editingServer?.id || !onRefreshAgent || busy) return;
    setAgentSelectionNotice("");
    await onRefreshAgent(editingServer.id);
  }

  async function handleInstallSessionAgent() {
    if (!editingServer?.id || !onInstallAgent || busy || agentUnsupported) return;
    setAgentSelectionNotice("");
    await onInstallAgent(editingServer.id);
  }

  async function handleInstallCli(cliId) {
    if (!editingServer?.id || !onInstallCli || busy) return;
    const cliName = cliId === "claude" ? "Claude" : "Codex";
    setCliInstallStatus({ cliId, tone: "loading", message: `正在安装 ${cliName} CLI...` });
    try {
      const result = await onInstallCli(editingServer.id, cliId);
      const path = String(result?.path || "").trim();
      setCliInstallStatus({
        cliId,
        tone: "done",
        message: `${cliName} CLI 已安装，可以登录 ${cliName}。${path ? ` 路径：${path}` : ""}`,
      });
    } catch (error) {
      setCliInstallStatus({ cliId, tone: "error", message: shortError(error) });
    }
  }

  async function handleUninstallSessionAgent() {
    if (!editingServer?.id || !onUninstallAgent || busy) return;
    const confirmed = window.confirm("卸载这台机器上的 AI Workbench Agent？\n\n这会停止 Agent 后台任务并删除 Agent 文件，但不会删除工作目录、Codex 或 Claude。之后会使用 SSH 直连。 ");
    if (!confirmed) return;
    setAgentSelectionNotice("");
    await onUninstallAgent(editingServer.id);
  }

  async function handleExportConfig() {
    if (!onExportConfig || migrationBusy) return;
    setMigrationBusy(true);
    setMigrationStatus({ tone: "loading", message: "正在生成迁移配置文件..." });
    try {
      const result = await onExportConfig();
      setMigrationStatus({ tone: "done", message: result?.message || "配置文件已导出。" });
    } catch (error) {
      setMigrationStatus({ tone: "error", message: shortError(error) });
    } finally {
      setMigrationBusy(false);
    }
  }

  async function handleExportLogs() {
    if (!onExportLogs || migrationBusy) return;
    setMigrationBusy(true);
    setMigrationStatus({ tone: "loading", message: "正在打包诊断日志..." });
    try {
      const result = await onExportLogs();
      setMigrationStatus({ tone: "done", message: result?.message || "诊断日志已导出。" });
    } catch (error) {
      setMigrationStatus({ tone: "error", message: shortError(error) });
    } finally {
      setMigrationBusy(false);
    }
  }

  async function handleClearCache(options) {
    if (!onClearCache || cacheBusy) return;
    const clearLogs = options?.logs === true;
    const clearMessages = options?.messages === true;
    const confirmation = clearLogs && clearMessages
      ? "清空当前设备上的全部诊断日志和聊天消息？\n\n服务器、密码、工作目录和会话配置会保留。此操作不可恢复。"
      : clearMessages
        ? "清空当前设备上的全部聊天消息？\n\n服务器、密码、工作目录和会话配置会保留。此操作不可恢复。"
        : "清空当前设备上的诊断日志？\n\n已经导出的日志文件不会受到影响。";
    if (!window.confirm(confirmation)) return;

    setCacheBusy(true);
    setCacheStatus({ tone: "loading", message: "正在清理当前设备的缓存..." });
    try {
      const result = await onClearCache({ logs: clearLogs, messages: clearMessages });
      setCacheStatus({ tone: "done", message: result?.message || "缓存已清理。" });
    } catch (error) {
      setCacheStatus({ tone: "error", message: shortError(error) });
    } finally {
      setCacheBusy(false);
    }
  }

  async function handleImportConfigFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onImportConfig || migrationBusy) return;
    setMigrationBusy(true);
    setMigrationStatus({ tone: "loading", message: "正在导入配置文件..." });
    try {
      const text = await readFileAsText(file);
      const result = await onImportConfig(text);
      setMigrationStatus({ tone: "done", message: result?.message || "配置文件已导入。" });
    } catch (error) {
      setMigrationStatus({ tone: "error", message: shortError(error) });
    } finally {
      setMigrationBusy(false);
    }
  }

  async function handleGitDownload() {
    if (!onGitDownload || busy) return;
    const repoUrl = gitRepoUrl.trim();
    const targetDir = gitTargetDir.trim();
    if (!repoUrl) {
      setGitStatus({ tone: "error", message: "请先填写 Git 仓库地址。" });
      return;
    }
    if (!targetDir) {
      setGitStatus({ tone: "error", message: "请先填写保存目录。" });
      return;
    }

    setGitStatus({ tone: "loading", message: "正在连接远端执行 Git 操作..." });
    try {
      const result = await onGitDownload({ repoUrl, targetDir, branch: gitBranch.trim() });
      setGitStatus({ tone: "done", message: result?.message || "Git 操作完成。" });
    } catch (error) {
      setGitStatus({ tone: "error", message: shortError(error) });
    }
  }

  async function handleGitSshKeyCheck(generate = false) {
    if (!onGitSshKey || busy) return;
    setGitSshKey((current) => ({
      ...current,
      status: generate ? "generating" : "checking",
      message: generate ? "正在远端生成 SSH Key..." : "正在检测远端 SSH Key...",
    }));
    try {
      const result = await onGitSshKey({ generate });
      if (!result) return;
      const ready = result.status === "ready" && result.publicKey;
      setGitSshKey({
        status: ready ? "ready" : "missing",
        publicKey: result.publicKey || "",
        path: result.path || "",
        fingerprint: result.fingerprint || "",
        message: ready
          ? generate
            ? "SSH Key 已生成。复制公钥并添加到 GitHub。"
            : "已找到远端 SSH Key。"
          : "远端账号还没有 SSH Key。",
      });
    } catch (error) {
      setGitSshKey({
        status: "error",
        publicKey: "",
        path: "",
        fingerprint: "",
        message: shortError(error),
      });
    }
  }

  useEffect(() => {
    if (!editingSession) return;
    setGitRepoUrl(String(draftProfile.gitRepoUrl || ""));
    setGitTargetDir(String(draftProfile.gitTargetDir || draftProfile.workdir || ""));
    setGitBranch(String(draftProfile.gitBranch || ""));
    setGitStatus(null);
    setGitSshKey({
      status: "idle",
      publicKey: "",
      path: "",
      fingerprint: "",
      message: "",
    });
    setAgentSelectionNotice("");
    setShareForm((current) => ({
      ...current,
      ...loadCloudSyncSettings(),
      recipientAccount: "",
      password: "",
    }));
    setShareStatus(null);
  }, [editingSession, editingServer?.id]);

  useEffect(() => {
    if (
      !editingSession ||
      settingsPage !== "session-development" ||
      !editingServer?.id ||
      !onGitSshKey ||
      busy
    ) {
      return;
    }
    const checkKey = `${editingServer.id}:${profileConnectionKey(draftProfile)}`;
    if (gitSshKeyCheckedForRef.current === checkKey) return;
    gitSshKeyCheckedForRef.current = checkKey;
    void handleGitSshKeyCheck(false);
  }, [busy, editingSession, editingServer?.id, settingsPage]);

  useEffect(() => {
    setSettingsPage(initialPage || "root");
  }, [mode, editingServer?.id, initialPage]);

  useEffect(() => {
    let mounted = true;
    const bridge = desktopBridge();
    const appInfoPromise = bridge?.getAppInfo ? bridge.getAppInfo() : SSHWorkbench.getAppInfo?.();
    if (!appInfoPromise) return undefined;
    appInfoPromise
      .then((info) => {
        if (mounted) setAppInfo(normalizeAppInfo(info));
      })
      .catch(() => {
        if (mounted) setAppInfo(normalizeAppInfo());
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5_000);

    void fetch(workbenchAgentGithubManifestUrl, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((manifest) => {
        const version = String(manifest?.version || "").trim();
        if (workbenchAgentVersionNumber(version) > 0) setPublishedAgentVersion(version);
      })
      .catch(() => {
        // The bundled version remains a safe fallback when the release pointer is unreachable.
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const scrollBody = settingsScrollRef.current;
    if (!scrollBody) return undefined;

    const resetHorizontalPosition = () => {
      if (scrollBody.scrollLeft !== 0) scrollBody.scrollLeft = 0;
    };

    resetHorizontalPosition();
    const frameId = window.requestAnimationFrame(resetHorizontalPosition);
    return () => window.cancelAnimationFrame(frameId);
  }, [mode, settingsPage, settingsDiscovery?.state]);

  useEffect(() => {
    const scrollBody = settingsScrollRef.current;
    if (!scrollBody || typeof document === "undefined" || !document.querySelector(".iphone-shell")) return undefined;

    const root = document.documentElement;
    const body = document.body;
    const timers = [];
    let blurTimer = 0;

    const clearTimers = () => {
      timers.splice(0).forEach((timer) => window.clearTimeout(timer));
      if (blurTimer) window.clearTimeout(blurTimer);
      blurTimer = 0;
    };

    const syncViewport = (keyboardVisible) => {
      const viewport = window.visualViewport;
      const layoutHeight = Math.round(window.innerHeight || document.documentElement.clientHeight || viewport?.height || 0);
      const visualHeight = Math.round(viewport?.height || layoutHeight);
      const width = Math.round(window.innerWidth || document.documentElement.clientWidth || viewport?.width || 0);
      const height = keyboardVisible ? Math.min(layoutHeight, visualHeight) : layoutHeight;
      if (height > 0) root.style.setProperty("--app-viewport-height", `${height}px`);
      if (width > 0) root.style.setProperty("--app-viewport-width", `${width}px`);
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    };

    const keepFocusedFieldVisible = (field) => {
      if (!field || !scrollBody.contains(document.activeElement)) return;
      syncViewport(true);
      const target = field.closest(".config-field, .wake-word-field, .settings-action-row") || field;
      const viewport = window.visualViewport;
      const visibleBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight || 0) - 16;
      const headerBottom = scrollBody.getBoundingClientRect().top + 12;
      const fieldRect = target.getBoundingClientRect();

      if (fieldRect.bottom > visibleBottom) {
        scrollBody.scrollTop += fieldRect.bottom - visibleBottom;
      } else if (fieldRect.top < headerBottom) {
        scrollBody.scrollTop -= headerBottom - fieldRect.top;
      }
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    };

    const handleFocusIn = (event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
      clearTimers();
      root.classList.add("aiwb-keyboard-focus");
      body?.classList.add("aiwb-keyboard-focus");
      [0, 80, 180, 360, 620].forEach((delay) => {
        timers.push(window.setTimeout(() => keepFocusedFieldVisible(field), delay));
      });
    };

    const handleFocusOut = () => {
      blurTimer = window.setTimeout(() => {
        if (scrollBody.contains(document.activeElement)) return;
        root.classList.remove("aiwb-keyboard-focus");
        body?.classList.remove("aiwb-keyboard-focus");
        syncViewport(false);
      }, 80);
    };

    scrollBody.addEventListener("focusin", handleFocusIn);
    scrollBody.addEventListener("focusout", handleFocusOut);
    return () => {
      clearTimers();
      scrollBody.removeEventListener("focusin", handleFocusIn);
      scrollBody.removeEventListener("focusout", handleFocusOut);
      root.classList.remove("aiwb-keyboard-focus");
      body?.classList.remove("aiwb-keyboard-focus");
    };
  }, [mode, settingsPage]);

  const pageTitles = {
    root: addingSessions ? "添加工作会话" : editingSession ? "会话设置" : "全局设置",
    "session-general": "连接配置",
    "session-connection": "连接信息",
    "session-development": "开发环境",
    "session-execution": "执行方式",
    "session-actions": "会话操作",
    "session-login": "AI 工具登录",
    "session-share": "分享会话",
    "global-appearance": "外观",
    "global-permissions": "执行权限",
    "global-typography": "字体与消息",
    "global-voice": "语音与播放",
    "global-notifications": "任务通知",
    "global-cloud-sync": "云端配置",
    "global-migration": "配置迁移",
    "global-storage": "存储与缓存",
    "global-main-ai": "主 AI",
  };
  const panelTitle = pageTitles[settingsPage] || pageTitles.root;
  const panelSubtitle = addingSessions
    ? "连接机器后选择一个或多个工作目录"
    : settingsPage !== "root"
      ? editingSession
        ? draftProfile.name || draftProfile.host || "当前会话"
        : "AI Workbench"
      : editingSession
        ? "模型、连接与执行偏好"
        : `${appInfo.name} ${appInfo.displayVersion} · ${appInfo.platformLabel}`;
  const appearanceLabel =
    appearanceModeOptions.find((option) => option.id === normalizeAppearanceMode(draftProfile.appearanceMode))?.label || "跟随系统";
  const currentAgent = agentById(draftProfile.agentId || defaultProfile.agentId);
  const currentModel = agentModelLabel(draftProfile.agentId || defaultProfile.agentId, draftProfile.aiModel || "") || "默认模型";
  const identityEditable = editingServer?.pendingIdentityEdit === true;
  const selectedSessionCount = Array.isArray(settingsSelectedSessions) ? settingsSelectedSessions.length : 0;
  const totalMessageCount = useMemo(
    () =>
      (Array.isArray(servers) ? servers : []).reduce(
        (count, server) => count + (Array.isArray(server?.messages) ? server.messages.length : 0),
        0,
      ),
    [servers],
  );
  const runningTaskCount = useMemo(
    () => (Array.isArray(servers) ? servers : []).filter((server) => serverTaskRunning(server)).length,
    [servers],
  );
  const settingsPageNeedsSave = [
    "session-general",
    "global-appearance",
    "global-permissions",
    "global-typography",
    "global-voice",
    "global-notifications",
    "global-main-ai",
  ].includes(settingsPage);

  function updateCloudSyncForm(field, value) {
    setCloudSyncForm((current) => {
      const next = { ...current, [field]: field === "account" ? normalizeCloudSyncAccount(value) : value };
      if (field !== "password") saveCloudSyncSettings(next);
      return next;
    });
  }

  async function handleCloudPullConfig() {
    if (!onCloudPullConfig || cloudSyncBusy) return;
    setCloudSyncBusy(true);
    setCloudSyncStatus({ tone: "loading", message: "正在登录并下载云端配置..." });
    try {
      const result = await onCloudPullConfig({
        endpoint: cloudSyncForm.endpoint || cloudSyncDefaultEndpoint,
        account: cloudSyncForm.account,
        password: cloudSyncForm.password,
      });
      const nextSettings = {
        endpoint: cloudSyncForm.endpoint || cloudSyncDefaultEndpoint,
        account: cloudSyncForm.account,
        lastSyncedAt: new Date().toISOString(),
      };
      saveCloudSyncSettings(nextSettings);
      setCloudSyncForm((current) => ({ ...current, ...nextSettings }));
      setCloudSyncStatus({ tone: "done", message: result?.message || "云端配置已下载到本机。" });
    } catch (error) {
      setCloudSyncStatus({ tone: "error", message: shortError(error) });
    } finally {
      setCloudSyncBusy(false);
    }
  }

  async function handleCloudPushConfig() {
    if (!onCloudPushConfig || cloudSyncBusy) return;
    setCloudSyncBusy(true);
    setCloudSyncStatus({ tone: "loading", message: "正在加密并上传配置到云端..." });
    try {
      const result = await onCloudPushConfig({
        endpoint: cloudSyncForm.endpoint || cloudSyncDefaultEndpoint,
        account: cloudSyncForm.account,
        password: cloudSyncForm.password,
      });
      const nextSettings = {
        endpoint: cloudSyncForm.endpoint || cloudSyncDefaultEndpoint,
        account: cloudSyncForm.account,
        lastSyncedAt: new Date().toISOString(),
      };
      saveCloudSyncSettings(nextSettings);
      setCloudSyncForm((current) => ({ ...current, ...nextSettings }));
      setCloudSyncStatus({ tone: "done", message: result?.message || "配置已上传到云端。" });
    } catch (error) {
      setCloudSyncStatus({ tone: "error", message: shortError(error) });
    } finally {
      setCloudSyncBusy(false);
    }
  }

  async function handleCloudClearConfig() {
    if (!onCloudClearConfig || cloudSyncBusy) return;
    const confirmed = window.confirm("确定清空这个账号的云端配置吗？本机会话不会删除，但其他设备将无法继续下载旧配置。");
    if (!confirmed) return;
    setCloudSyncBusy(true);
    setCloudSyncStatus({ tone: "loading", message: "正在登录并清空云端配置..." });
    try {
      const result = await onCloudClearConfig({
        endpoint: cloudSyncForm.endpoint || cloudSyncDefaultEndpoint,
        account: cloudSyncForm.account,
        password: cloudSyncForm.password,
      });
      const nextSettings = {
        endpoint: cloudSyncForm.endpoint || cloudSyncDefaultEndpoint,
        account: cloudSyncForm.account,
        lastSyncedAt: new Date().toISOString(),
      };
      saveCloudSyncSettings(nextSettings);
      setCloudSyncForm((current) => ({ ...current, ...nextSettings }));
      setCloudSyncStatus({ tone: "done", message: result?.message || "云端配置已清空。" });
    } catch (error) {
      setCloudSyncStatus({ tone: "error", message: shortError(error) });
    } finally {
      setCloudSyncBusy(false);
    }
  }

  async function handleShareSession() {
    if (!onShareSession || shareBusy) return;
    const recipientAccount = normalizeCloudSyncAccount(shareForm.recipientAccount);
    if (!shareForm.account) {
      setShareStatus({ tone: "error", message: "请填写你的同步账号。" });
      return;
    }
    if (!recipientAccount) {
      setShareStatus({ tone: "error", message: "请填写接收方账号。" });
      return;
    }
    if (!shareForm.password) {
      setShareStatus({ tone: "error", message: "请填写你的同步密码。" });
      return;
    }
    setShareBusy(true);
    setShareStatus({ tone: "loading", message: "正在创建共享会话..." });
    try {
      const result = await onShareSession({
        serverId: editingServer?.id,
        endpoint: shareForm.endpoint || cloudSyncDefaultEndpoint,
        account: shareForm.account,
        password: shareForm.password,
        recipientAccount,
      });
      saveCloudSyncSettings({
        endpoint: shareForm.endpoint || cloudSyncDefaultEndpoint,
        account: shareForm.account,
      });
      setShareStatus({ tone: "done", message: result?.message || "会话已分享。" });
      setShareForm((current) => ({ ...current, recipientAccount: "", password: "" }));
    } catch (error) {
      setShareStatus({ tone: "error", message: shortError(error) });
    } finally {
      setShareBusy(false);
    }
  }

  async function handleToolLogin(agentId, mode = "start") {
    const agent = agentById(agentId === "claude" ? "claude" : "codex");
    if (busy) {
      setToolLoginStatus({ tone: "warning", message: "当前会话正在执行任务，请完成后再启动登录授权。" });
      return;
    }
    if (!onLoginRemoteAgent) {
      setToolLoginStatus({
        tone: "warning",
        message: "当前会话还没有可用的远程连接信息。",
      });
      return;
    }
    setSettingsPage("session-login");
    setToolLoginStatus({
      agentId: agent.id,
      tone: "loading",
      message: mode === "status" ? `正在检查 ${agent.shortName} 登录状态…` : `正在准备 ${agent.shortName} 授权…`,
      output: "",
    });
    try {
      const output = await onLoginRemoteAgent(agent.id, mode);
      const result = parseToolLoginResult(agent.id, output);
      setToolLoginStatus({
        agentId: agent.id,
        ...result,
        output: "",
      });
    } catch (error) {
      setToolLoginStatus({ agentId: agent.id, tone: "error", message: shortError(error), output: "" });
    }
  }

  return (
    <div className="settings-layer" role="dialog" aria-modal="true">
      <button className="settings-backdrop" type="button" aria-label="关闭设置" onClick={onClose} />
      <section
        className={`settings-panel settings-${mode}-mode ${settingsPage !== "root" ? "settings-subpage-mode" : ""} ${addingSessions ? "add-session-mode" : ""}`}
      >
        <header className="settings-navigation">
          {settingsPage !== "root" ? (
            <button
              type="button"
              className="settings-back-button"
              onClick={() => setSettingsPage("root")}
              aria-label="返回设置"
            >
              <ArrowLeft size={19} weight="bold" aria-hidden="true" />
            </button>
          ) : (
            <span className="settings-navigation-spacer" aria-hidden="true" />
          )}
          <div className="settings-title-block">
            <strong>{panelTitle}</strong>
            <span>{panelSubtitle}</span>
          </div>
          <button
            type="button"
            className="settings-close-button"
            onClick={onClose}
            aria-label="关闭设置"
          >
            <X size={19} weight="bold" aria-hidden="true" />
          </button>
        </header>

        <div
          ref={settingsScrollRef}
          className="settings-scroll-body"
          onScroll={(event) => {
            if (event.currentTarget.scrollLeft !== 0) event.currentTarget.scrollLeft = 0;
          }}
        >
        {busy ? (
          <div className="settings-inline-notice settings-busy-notice" role="status">
            <ArrowClockwise className="is-spinning" size={18} weight="bold" aria-hidden="true" />
            <span>当前会话正在执行远端操作。涉及同一台机器的安装、检测和删除会暂不可用；返回、关闭和其他本地设置仍可操作。</span>
          </div>
        ) : null}
        {settingsPage === "root" && editingSession ? (
          <div className="settings-root-page">
            <SettingsSection title="当前会话">
              <SettingsMenuRow
                icon={HardDrives}
                title="连接配置"
                detail={`${currentAgent.shortName}，${currentModel} · ${draftProfile.username || "用户"}@${draftProfile.host || "未配置"}`}
                value={draftProfile.useWorkbenchAgent === true || isWindowsProfile(draftProfile) ? "Agent" : "SSH"}
                onClick={() => setSettingsPage("session-general")}
              />
              <SettingsMenuRow
                icon={GitBranch}
                title="开发环境"
                detail={gitAvailable ? gitVersion || "Git 已安装" : "Git 未检测"}
                value={draftProfile.workdir ? "已配置" : "未配置"}
                onClick={() => setSettingsPage("session-development")}
              />
            </SettingsSection>
            <SettingsSection title="管理">
              <SettingsMenuRow
                icon={FolderSimple}
                title="会话操作"
                detail="登录、复制或删除会话"
                onClick={() => setSettingsPage("session-actions")}
              />
              <SettingsMenuRow
                icon={ShareNetwork}
                title="分享会话"
                detail="把当前会话分享给指定账号"
                onClick={() => setSettingsPage("session-share")}
              />
            </SettingsSection>
          </div>
        ) : null}

        {settingsPage === "root" && globalSettings ? (
          <div className="settings-root-page">
            <SettingsSection title="应用">
              <SettingsMenuRow
                icon={Palette}
                title="外观"
                detail="界面显示与系统主题"
                value={appearanceLabel}
                onClick={() => setSettingsPage("global-appearance")}
              />
              <SettingsMenuRow
                icon={TextT}
                title="字体与消息"
                detail="消息字体、字号和阅读间距"
                value={`${draftProfile.messageFontSize || defaultProfile.messageFontSize}px`}
                onClick={() => setSettingsPage("global-typography")}
              />
              <SettingsMenuRow
                icon={Microphone}
                title="语音与播放"
                detail="唤醒、识别、音色和结果播报"
                value={draftProfile.voiceInputEnabled === true ? "已开启" : "已关闭"}
                onClick={() => setSettingsPage("global-voice")}
              />
              {platform === "ios" ? (
                <SettingsMenuRow
                  icon={Bell}
                  title="任务通知"
                  detail="App 在后台时通知任务结果"
                  value={draftProfile.taskPushNotificationsEnabled === true ? "已开启" : "已关闭"}
                  onClick={() => setSettingsPage("global-notifications")}
                />
              ) : null}
              <SettingsMenuRow
                icon={Robot}
                title="主 AI"
                detail="自然语言理解与任务分流"
                value={draftProfile.mainAIEnabled !== false ? "已开启" : "已关闭"}
                onClick={() => setSettingsPage("global-main-ai")}
              />
              <SettingsMenuRow
                icon={ShieldCheck}
                title="执行权限"
                detail="统一控制 Codex 和 Claude 的操作范围"
                value={normalizeExecutionPermissionMode(draftProfile.executionPermissionMode) === "full-access" ? "完全访问" : "标准"}
                onClick={() => setSettingsPage("global-permissions")}
              />
            </SettingsSection>
            <SettingsSection title="数据">
              <SettingsMenuRow
                icon={HardDrives}
                title="云端配置"
                detail="上传配置到云端，另一台设备输入账号密码即可下载"
                value={cloudSyncForm.account ? "已配置" : ""}
                onClick={() => setSettingsPage("global-cloud-sync")}
              />
              <SettingsMenuRow
                icon={FolderSimple}
                title="配置迁移"
                detail="导入或导出会话配置"
                onClick={() => setSettingsPage("global-migration")}
              />
              <SettingsMenuRow
                icon={HardDrives}
                title="存储与缓存"
                detail="导出或清理当前设备的日志和聊天消息"
                value={`${totalMessageCount} 条消息`}
                onClick={() => {
                  setCacheStatus(null);
                  setSettingsPage("global-storage");
                }}
              />
            </SettingsSection>
            {migrationStatus ? (
              <p className={`settings-page-status ${migrationStatus.tone || ""}`}>{migrationStatus.message}</p>
            ) : null}
            <SettingsSection title="关于">
              <SettingsStatusRow
                icon={Info}
                title={appInfo.name}
                detail={`版本 ${appInfo.displayVersion} · ${appInfo.platformLabel}`}
                value={appInfo.packaged === false ? "开发版" : "已安装"}
                actions={<ConfigCopyButton value={`${appInfo.name} ${appInfo.displayVersion} · ${appInfo.platformLabel}`} />}
              />
            </SettingsSection>
          </div>
        ) : null}

        {editingSession && ["session-general", "session-connection"].includes(settingsPage) && missingPassword ? (
          <p className="settings-note">没有找到这台机器的已保存密码，修改连接信息前需要补一次。</p>
        ) : null}

        {editingSession && settingsPage === "session-general" ? (
          <div className="settings-page-content session-connection-page">
            {sessionActionStatus?.tone === "done" ? (
              <div className="settings-inline-notice done">
                <Check size={18} weight="bold" aria-hidden="true" />
                <span>{sessionActionStatus.message}</span>
              </div>
            ) : null}
            <SettingsSection
              title="会话"
              footer="名称用于会话列表和语音切换，工作目录决定 AI 可以访问的范围。"
              className="session-profile-panel"
            >
              <ConfigField label="名称" value={draftProfile.name} onChange={(value) => updateField("name", value)} />
              {identityEditable ? (
                <ConfigSelect
                  label="AI 类型"
                  value={draftProfile.agentId || defaultProfile.agentId}
                  options={agents.map((agent) => ({ id: agent.id, label: agent.shortName }))}
                  onChange={(value) => updateField("agentId", value)}
                />
              ) : (
                <SettingsStatusRow
                  title="AI 类型"
                  detail="会话保存后不可修改"
                  value={currentAgent.shortName}
                />
              )}
              <AgentModelField
                agentId={draftProfile.agentId || defaultProfile.agentId}
                value={draftProfile.aiModel || ""}
                onChange={(value) => updateField("aiModel", value)}
              />
              <ConfigField
                label="工作目录"
                value={draftProfile.workdir}
                readOnly={!identityEditable}
                onChange={(value) => updateField("workdir", value)}
              />
            </SettingsSection>
            <SettingsSection
              title="服务器"
              footer="账号和密码仅保存在当前设备。"
              className="session-server-panel"
            >
              {identityEditable ? (
                <ConfigSelect
                  label="服务器类型"
                  value={normalizeServerPlatform(draftProfile.platform)}
                  options={serverPlatformOptions}
                  onChange={(value) => updateField("platform", value)}
                />
              ) : (
                <SettingsStatusRow
                  title="服务器类型"
                  detail="会话保存后不可修改"
                  value={serverPlatformLabel(draftProfile.platform)}
                />
              )}
              <ConfigField
                label="主服务器地址"
                value={draftProfile.host}
                readOnly={!identityEditable}
                onChange={(value) => updateField("host", value)}
              />
              <ConfigField
                label="备用服务器地址"
                value={(draftProfile.hostAlternates || []).join(", ")}
                placeholder="多个地址用逗号分隔，按顺序尝试"
                onChange={(value) =>
                  updateField(
                    "hostAlternates",
                    String(value || "")
                      .split(/[\n,，;；]/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
              />
              <ConfigField
                label="端口"
                value={draftProfile.port}
                inputMode="numeric"
                readOnly={!identityEditable}
                onChange={(value) => updateField("port", value)}
              />
              <ConfigField
                label="用户名"
                value={draftProfile.username}
                autoComplete="username"
                readOnly={!identityEditable}
                onChange={(value) => updateField("username", value)}
              />
              <ConfigField
                label="登录密码"
                type="password"
                value={draftProfile.password}
                autoComplete="new-password"
                onChange={(value) => updateField("password", value)}
              />
            </SettingsSection>
            <SettingsSection
              title="命令行工具"
              footer="CLI 与 Agent 相互独立，可以分别维护。"
              className="cli-management-panel session-cli-panel"
            >
              {cliTools.map((tool) => (
                <SettingsStatusRow
                  key={tool.id}
                  title={`${tool.name} CLI`}
                  detail={
                    cliInstallStatus?.cliId === tool.id
                      ? cliInstallStatus.message
                      : tool.path
                        ? `路径：${tool.path}`
                        : `${tool.name} 尚未检测到，可单独安装`
                  }
                  value={
                    cliInstallStatus?.cliId === tool.id
                      ? cliInstallStatus.tone === "loading"
                        ? "安装中"
                        : cliInstallStatus.tone === "done"
                          ? "已安装"
                          : "安装失败"
                      : tool.available
                        ? "可用"
                        : tool.status === "installing"
                          ? "安装中"
                          : "未安装"
                  }
                  tone={
                    cliInstallStatus?.cliId === tool.id
                      ? cliInstallStatus.tone === "done"
                        ? "success"
                        : cliInstallStatus.tone === "error"
                          ? "warning"
                          : "neutral"
                      : tool.available
                        ? "success"
                        : tool.status === "failed"
                          ? "warning"
                          : "neutral"
                  }
                  actions={
                    <button
                      type="button"
                      className="settings-inline-button primary"
                      onClick={() => handleInstallCli(tool.id)}
                      disabled={busy || !editingServer?.id || !onInstallCli || cliInstallStatus?.tone === "loading"}
                    >
                      <Wrench size={17} weight="bold" />
                      {cliInstallStatus?.cliId === tool.id && cliInstallStatus.tone === "loading"
                        ? "安装中"
                        : tool.available
                          ? "重装"
                          : "安装"}
                    </button>
                  }
                />
              ))}
            </SettingsSection>
            <SettingsSection
              title="运行方式"
              footer="Agent 异常时会自动改用 SSH 直连。"
              className="agent-mode-panel session-agent-panel"
            >
              <ConfigToggle
                label="使用 Agent"
                checked={draftProfile.useWorkbenchAgent === true || isWindowsProfile(draftProfile)}
                disabled={agentUnsupported || busy || isWindowsProfile(draftProfile)}
                onChange={handleAgentModeChange}
              />
              <SettingsStatusRow
                icon={Robot}
                title="当前机器 Agent"
                detail={
                  agentAvailable
                    ? `${draftProfile.username || "用户"}@${draftProfile.host || "未配置"} · ${agentVersionDetail}${currentMachineHostHealth !== "未检测" ? ` · ${currentMachineHostHealth}` : ""}`
                    : agentUnsupported
                      ? "当前连接环境暂不支持，将使用 SSH 直连"
                      : `${draftProfile.username || "用户"}@${draftProfile.host || "未配置"} · 未检测到；SSH 可用，但无法可靠恢复长任务`
                }
                value={agentAvailable ? (agentNeedsUpdate ? "自动升级" : agentAheadOfPublished ? "版本较新" : "已对齐") : agentUnsupported ? "不支持" : "未安装"}
                tone={agentAvailable ? (agentNeedsUpdate || agentAheadOfPublished ? "warning" : "success") : "neutral"}
              />
              {draftProfile.agentDirectEndpoint ? (
                <SettingsStatusRow
                  icon={ShieldCheck}
                  title={draftProfile.agentDirectEndpoint.startsWith("https:") ? "Agent 安全连接" : "Agent 非加密连接"}
                  detail={
                    draftProfile.agentDirectEndpoint.startsWith("https:")
                      ? "HTTPS 已固定校验证书指纹。证书变更时会阻止连接。"
                      : "OpenSSL 不可用，当前仅作为兼容降级使用；请在服务器安装 OpenSSL 后重新安装 Agent。"
                  }
                  value={draftProfile.agentDirectEndpoint.startsWith("https:") ? "已加密" : "未加密"}
                  tone={draftProfile.agentDirectEndpoint.startsWith("https:") ? "success" : "warning"}
                />
              ) : null}
              <SettingsButtonRow>
                <button
                  type="button"
                  className="settings-inline-button"
                  onClick={handleRefreshSessionAgent}
                  disabled={busy || agentUnsupported || !editingServer?.id || !onRefreshAgent}
                >
                  <ArrowClockwise size={17} weight="bold" />
                  重新检测
                </button>
                <button
                  type="button"
                  className="settings-inline-button primary"
                  onClick={handleInstallSessionAgent}
                  disabled={busy || agentUnsupported || !editingServer?.id || !onInstallAgent}
                >
                  <Wrench size={17} weight="bold" />
                  {agentNeedsUpdate ? "升级 Agent" : agentAvailable ? "重新安装" : "安装 Agent"}
                </button>
                <button
                  type="button"
                  className="settings-inline-button danger"
                  onClick={handleUninstallSessionAgent}
                  disabled={busy || !canUninstallAgent || !editingServer?.id || !onUninstallAgent}
                >
                  <Trash size={17} weight="bold" />
                  卸载 Agent
                </button>
              </SettingsButtonRow>
              {agentAvailable ? <AgentTaskList tasks={currentMachineTasks} /> : null}
              {agentSelectionNotice ? (
                <div className="settings-inline-notice">
                  <Info size={18} weight="fill" aria-hidden="true" />
                  <span>{agentSelectionNotice}</span>
                  {!agentUnsupported ? (
                    <button type="button" className="settings-inline-link" onClick={handleInstallSessionAgent}>
                      安装
                    </button>
                  ) : null}
                </div>
              ) : null}
            </SettingsSection>
          </div>
        ) : null}

        {addingSessions || (editingSession && settingsPage === "session-connection") ? (
          <div className={editingSession ? "settings-page-content" : "settings-add-connection"}>
            <SettingsSection
              title={editingSession ? "服务器" : "连接信息"}
              className={addingSessions ? "connection-settings-section" : ""}
              footer={editingSession ? "密码保存在当前设备，用于建立 SSH 连接。" : "连接成功后会自动扫描 Codex 和 Claude 的工作目录。"}
            >
              <ConfigField
                label="名称"
                value={draftProfile.name}
                placeholder={addingSessions ? "可不填，创建后自动命名" : ""}
                onChange={(value) => updateField("name", value)}
              />
              {addingSessions ? (
                <ConfigSelect
                  label="AI 类型"
                  value={settingsAgentTab || draftProfile.agentId || defaultProfile.agentId}
                  options={agents.map((agent) => ({ id: agent.id, label: agent.shortName }))}
                  onChange={updateSessionCreationAgent}
                />
              ) : null}
              <ConfigSelect
                label="服务器类型"
                value={normalizeServerPlatform(draftProfile.platform)}
                options={serverPlatformOptions}
                onChange={(value) => updateField("platform", value)}
              />
              <ConfigField label="服务器地址" value={draftProfile.host} onChange={(value) => updateField("host", value)} />
              <ConfigField
                label="端口"
                value={draftProfile.port}
                inputMode="numeric"
                onChange={(value) => updateField("port", value)}
              />
              <ConfigField
                label="用户名"
                value={draftProfile.username}
                autoComplete="username"
                onChange={(value) => updateField("username", value)}
              />
              <ConfigField
                label="登录密码"
                type="password"
                value={draftProfile.password}
                autoComplete="new-password"
                required={addingSessions}
                onChange={(value) => updateField("password", value)}
              />
            </SettingsSection>
            {isWindowsProfile(draftProfile) || isWslProfile(draftProfile) ? (
              <WslAdvancedSection
                busy={busy}
                wslReady={wslReady}
                wslNeedsRestart={wslNeedsRestart}
                wslStatusDetail={wslStatusDetail}
                wslStatusLabel={wslStatusLabel}
                onScan={onScan}
                onInstallWsl={onInstallWsl}
              />
            ) : null}
          </div>
        ) : null}

        {editingSession && settingsPage === "session-development" ? (
          <div className="settings-page-content">
            <SettingsSection
              title="环境状态"
              footer={gitAvailable ? `Git 路径：${gitPath}` : "支持 Linux 常见包管理器；Windows 支持 winget、Chocolatey 和 Scoop。"}
            >
              <SettingsStatusRow
                icon={GitBranch}
                title="Git"
                detail={gitAvailable ? gitVersion || "已安装，可以执行仓库操作" : "未检测到，安装后可下载和更新仓库"}
                value={gitAvailable ? "可用" : "未安装"}
                tone={gitAvailable ? "success" : "warning"}
              />
              <SettingsButtonRow>
                <button type="button" className="settings-inline-button" onClick={onScan} disabled={busy || !onScan}>
                  <ArrowClockwise size={17} weight="bold" />
                  重新检测
                </button>
                <button type="button" className="settings-inline-button primary" onClick={onInstallGit} disabled={busy || !onInstallGit}>
                  <Wrench size={17} weight="bold" />
                  {gitAvailable ? "修复 Git" : "安装 Git"}
                </button>
              </SettingsButtonRow>
            </SettingsSection>
            <SettingsSection
              title="Git SSH Key"
              className="git-ssh-key-settings"
              footer="私钥只保存在远端机器。App 仅展示公钥，用于添加到 GitHub、GitLab 等代码托管平台。"
            >
              {gitSshKey.status === "ready" ? (
                <div className="git-ssh-key-result">
                  <div className="git-ssh-key-heading">
                    <span className="settings-status-dot success" aria-hidden="true" />
                    <div>
                      <strong>SSH Key 已就绪</strong>
                      <small>{gitSshKey.path || "远端公钥文件"}</small>
                    </div>
                  </div>
                  <div className="git-public-key">
                    <code>{gitSshKey.publicKey}</code>
                    <ConfigCopyButton value={gitSshKey.publicKey} />
                  </div>
                  {gitSshKey.fingerprint ? <p className="git-key-fingerprint">{gitSshKey.fingerprint}</p> : null}
                </div>
              ) : (
                <p className={`settings-inline-status ${gitSshKey.status === "error" ? "error" : ""}`}>
                  {gitSshKey.message ||
                    (gitSshKey.status === "checking"
                      ? "正在检测远端 SSH Key..."
                      : "打开本页后会自动检测远端 SSH Key。")}
                </p>
              )}
              <SettingsButtonRow>
                <button
                  type="button"
                  className="settings-inline-button"
                  onClick={() => handleGitSshKeyCheck(false)}
                  disabled={busy || !onGitSshKey}
                >
                  <ArrowClockwise size={17} weight="bold" />
                  重新检测
                </button>
                {gitSshKey.status !== "ready" ? (
                  <button
                    type="button"
                    className="settings-inline-button primary"
                    onClick={() => handleGitSshKeyCheck(true)}
                    disabled={busy || !onGitSshKey || gitSshKey.status === "checking" || gitSshKey.status === "generating"}
                  >
                    <Key size={17} weight="bold" />
                    生成 SSH Key
                  </button>
                ) : null}
              </SettingsButtonRow>
            </SettingsSection>
            <SettingsSection title="Git 仓库" className="git-operation-settings">
              <ConfigField
                label="仓库地址"
                value={gitRepoUrl}
                onChange={(value) => {
                  setGitRepoUrl(value);
                  updateField("gitRepoUrl", value);
                }}
              />
              <ConfigField
                label="保存目录"
                value={gitTargetDir}
                onChange={(value) => {
                  setGitTargetDir(value);
                  updateField("gitTargetDir", value);
                }}
              />
              <ConfigField
                label="分支"
                value={gitBranch}
                onChange={(value) => {
                  setGitBranch(value);
                  updateField("gitBranch", value);
                }}
              />
              <SettingsButtonRow>
                <button
                  type="button"
                  className="settings-inline-button primary"
                  onClick={handleGitDownload}
                  disabled={busy || !onGitDownload || !gitRepoUrl.trim() || !gitTargetDir.trim()}
                >
                  <DownloadSimple size={17} weight="bold" />
                  下载或更新
                </button>
              </SettingsButtonRow>
              {gitStatus ? <p className={`settings-inline-status ${gitStatus.tone || ""}`}>{gitStatus.message}</p> : null}
            </SettingsSection>
          </div>
        ) : null}

        {addingSessions ? (
          <SessionImportPanel
            discovery={settingsDiscovery}
            profile={draftProfile}
            activeAgent={settingsAgentTab}
            platform={normalizeServerPlatform(draftProfile.platform)}
            selectedKeys={settingsSelectedSessions}
            busy={busy}
            onToggle={(key) => {
              setSettingsSelectedSessions((items) =>
                items.includes(key) ? items.filter((item) => item !== key) : [...items, key],
              );
            }}
            onScan={onScan}
          />
        ) : null}

        {globalSettings && settingsPage === "global-cloud-sync" ? (
          <div className="settings-page-content cloud-sync-page">
            <SettingsSection
              title="云端同步凭据"
              footer="同步账号用来定位你的配置；同步密码用于登录和端侧加密，不会保存在本机。"
            >
              <ConfigField
                label="同步账号"
                value={cloudSyncForm.account}
                autoComplete="username"
                placeholder="邮箱或唯一昵称"
                onChange={(value) => updateCloudSyncForm("account", value)}
              />
              <ConfigField
                label="同步密码"
                type="password"
                value={cloudSyncForm.password}
                autoComplete="current-password"
                placeholder="填写你的同步密码"
                onChange={(value) => updateCloudSyncForm("password", value)}
              />
            </SettingsSection>
            <SettingsSection title="同步规则">
              <SettingsStatusRow
                icon={Info}
                title="识别同一个会话"
                detail="按 IP/域名、登录账号、会话路径判断。本机已经存在的会话会跳过，不会重复添加。"
                value="不覆盖"
                tone="neutral"
              />
              <SettingsStatusRow
                icon={Info}
                title="最近同步"
                detail={cloudSyncForm.lastSyncedAt ? new Date(cloudSyncForm.lastSyncedAt).toLocaleString() : "还没有同步过"}
                value={cloudSyncForm.account ? "就绪" : "未登录"}
                tone={cloudSyncForm.account ? "success" : "neutral"}
              />
            </SettingsSection>
            <SettingsSection
              title="操作"
              footer="上传和下载都不会重复添加同一个会话。云端保存的是加密后的配置，不包含聊天记录。"
            >
              <SettingsActionRow
                icon={DownloadSimple}
                title="下载云端配置"
                detail="另一台设备输入同一个账号密码，就能把配置下载到本机"
                onClick={handleCloudPullConfig}
                disabled={busy || cloudSyncBusy || !onCloudPullConfig}
              />
              <SettingsActionRow
                icon={UploadSimple}
                title="上传配置到云端"
                detail="把当前设备的会话配置加密后保存到云端"
                onClick={handleCloudPushConfig}
                disabled={busy || cloudSyncBusy || !onCloudPushConfig}
              />
              <SettingsActionRow
                icon={Trash}
                title="清空云端配置"
                detail="只删除云端保存的配置，本机已有会话不会受影响"
                destructive
                onClick={handleCloudClearConfig}
                disabled={busy || cloudSyncBusy || !onCloudClearConfig}
              />
            </SettingsSection>
            {cloudSyncStatus ? (
              <p className={`settings-page-status ${cloudSyncStatus.tone || ""}`}>{cloudSyncStatus.message}</p>
            ) : null}
          </div>
        ) : null}

        {globalSettings && settingsPage === "global-migration" ? (
          <div className="settings-page-content">
            <SettingsSection
              title="配置文件"
              footer="配置文件包含会话 ID、服务器、工作目录、AI 类型、密码和 Key，不包含聊天记录。请像保管密码一样妥善保存。"
            >
              <SettingsActionRow
                icon={DownloadSimple}
                title="导出配置"
                detail="迁移到 iPhone、iPad、Mac 或 Android"
                onClick={handleExportConfig}
                disabled={busy || migrationBusy}
              />
              <SettingsActionRow
                icon={UploadSimple}
                title="导入配置"
                detail="从另一台设备恢复会话"
                onClick={() => migrationInputRef.current?.click()}
                disabled={busy || migrationBusy}
              />
              <input
                ref={migrationInputRef}
                type="file"
                accept=".aiwb.json,.json,application/json"
                hidden
                onChange={handleImportConfigFile}
              />
            </SettingsSection>
            {migrationStatus ? (
              <p className={`settings-page-status ${migrationStatus.tone || ""}`}>{migrationStatus.message}</p>
            ) : null}
          </div>
        ) : null}

        {globalSettings && settingsPage === "global-storage" ? (
          <div className="settings-page-content">
            <SettingsSection
              title="本机数据"
              footer={
                runningTaskCount > 0
                  ? `当前有 ${runningTaskCount} 个任务正在运行。为避免丢失任务映射，任务结束前不能清空消息。`
                  : "清理操作只影响当前设备，不会删除服务器文件、远端 AI 会话或云端配置。"
              }
            >
              <SettingsStatusRow
                icon={TextT}
                title="聊天消息"
                detail="保存在当前设备，用于重新打开 App 后恢复聊天内容"
                value={`${totalMessageCount} 条`}
                tone="neutral"
              />
              <SettingsStatusRow
                icon={FileZip}
                title="诊断日志"
                detail="包含连接、Agent 和运行状态，可先导出再清理"
                value="本机"
                tone="neutral"
              />
            </SettingsSection>
            <SettingsSection title="日志">
              <SettingsActionRow
                icon={FileZip}
                title="导出诊断日志"
                detail="打包后可以保存或直接分享"
                onClick={handleExportLogs}
                disabled={busy || migrationBusy || cacheBusy || !onExportLogs}
              />
              <SettingsActionRow
                icon={Trash}
                title="清空诊断日志"
                detail="删除当前设备内尚未导出的诊断记录"
                destructive
                onClick={() => handleClearCache({ logs: true })}
                disabled={busy || cacheBusy || !onClearCache}
              />
            </SettingsSection>
            <SettingsSection title="聊天记录">
              <SettingsActionRow
                icon={Trash}
                title="清空消息列表"
                detail="删除所有会话在当前设备上的聊天内容，保留连接配置"
                destructive
                onClick={() => handleClearCache({ messages: true })}
                disabled={busy || cacheBusy || runningTaskCount > 0 || !onClearCache}
              />
              <SettingsActionRow
                icon={Trash}
                title="清空全部缓存"
                detail="同时删除诊断日志和本地聊天消息"
                destructive
                onClick={() => handleClearCache({ logs: true, messages: true })}
                disabled={busy || cacheBusy || runningTaskCount > 0 || !onClearCache}
              />
            </SettingsSection>
            {cacheStatus ? (
              <p className={`settings-page-status ${cacheStatus.tone || ""}`}>{cacheStatus.message}</p>
            ) : null}
          </div>
        ) : null}

        {globalSettings && settingsPage === "global-appearance" ? (
          <div className="settings-page-content">
            <SettingsSection title="界面" footer="跟随系统会自动匹配设备的浅色或深色外观。">
              <ConfigSelect
                label="显示模式"
                value={normalizeAppearanceMode(draftProfile.appearanceMode)}
                options={appearanceModeOptions}
                onChange={(value) => updateField("appearanceMode", value)}
              />
            </SettingsSection>
          </div>
        ) : null}

        {globalSettings && settingsPage === "global-permissions" ? (
          <div className="settings-page-content">
            <SettingsSection
              title="AI 执行权限"
              footer="这是全局设置。保存后会同步到已有会话和以后新建的会话。"
            >
              <ConfigToggle
                label="允许完全访问"
                checked={normalizeExecutionPermissionMode(draftProfile.executionPermissionMode) === "full-access"}
                onChange={(value) => updateField("executionPermissionMode", value ? "full-access" : "standard")}
              />
            </SettingsSection>
            <p className="settings-note">
              开启后，Codex 和 Claude 可以在系统账号允许的范围内修改文件、执行命令和访问网络，并且不再等待操作确认。
              Linux/macOS 的 root 会话会改用显式工具授权，以兼容 Claude 对 root 绕过模式的限制。
            </p>
          </div>
        ) : null}

        {globalSettings && settingsPage === "global-typography" ? (
          <div className="settings-page-content">
            <SettingsSection title="消息文字" footer="发送消息和 AI 回复使用同一套正文设置。代码、表格和技术状态会保留专用的等宽字体。">
              <ConfigSelect
                label="字体"
                value={draftProfile.messageFontFamily || defaultProfile.messageFontFamily}
                options={messageFontFamilyOptions}
                onChange={(value) => updateField("messageFontFamily", value)}
              />
              <ConfigSelect
                label="字号"
                value={String(draftProfile.messageFontSize || defaultProfile.messageFontSize)}
                options={messageFontSizeOptions}
                onChange={(value) => updateField("messageFontSize", value)}
              />
              <ConfigSelect
                label="字重"
                value={String(draftProfile.messageFontWeight || defaultProfile.messageFontWeight)}
                options={messageFontWeightOptions}
                onChange={(value) => updateField("messageFontWeight", value)}
              />
              <ConfigSelect
                label="行距"
                value={String(draftProfile.messageLineHeight || defaultProfile.messageLineHeight)}
                options={messageLineHeightOptions}
                onChange={(value) => updateField("messageLineHeight", value)}
              />
            </SettingsSection>
            <section
              className="settings-font-preview"
              style={{
                fontFamily:
                  draftProfile.messageFontFamily === "rounded"
                    ? 'ui-rounded, "SF Pro Rounded", -apple-system, sans-serif'
                    : draftProfile.messageFontFamily === "serif"
                      ? '"Songti SC", "STSong", serif'
                      : '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif',
                fontSize: `${draftProfile.messageFontSize || defaultProfile.messageFontSize}px`,
                fontWeight: Number(draftProfile.messageFontWeight || defaultProfile.messageFontWeight),
                lineHeight: draftProfile.messageLineHeight || defaultProfile.messageLineHeight,
              }}
            >
              <strong>预览</strong>
              <p>这是一条消息预览。发送内容和 AI 回复会保持一致的阅读风格。</p>
            </section>
          </div>
        ) : null}

        {globalSettings && settingsPage === "global-voice" ? (
          <div className="settings-page-content">
            <SettingsSection title="语音控制" footer="默认关闭。打开后，App 才会监听唤醒词并开始语音识别。">
              <ConfigToggle
                label="语音输入与唤醒"
                checked={draftProfile.voiceInputEnabled === true}
                onChange={(value) => updateField("voiceInputEnabled", value)}
              />
            </SettingsSection>
            <SettingsSection title="结果播报" footer="可只播报任务已完成，也可以朗读 AI 返回的完整内容。">
              <ConfigToggle
                label="播放执行结果"
                checked={draftProfile.playResultAudio === true}
                onChange={(value) => updateField("playResultAudio", value)}
              />
              <ConfigSelect
                label="播报内容"
                value={normalizeResultAudioMode(draftProfile.resultAudioMode)}
                options={resultAudioModeOptions}
                onChange={(value) => updateField("resultAudioMode", value)}
              />
              <ConfigSelect
                label="音色"
                value={draftProfile.ttsVoiceName || defaultProfile.ttsVoiceName}
                options={voiceToneOptions}
                onChange={(value) => updateField("ttsVoiceName", value)}
              />
              <ConfigSelect
                label="TTS 模型"
                value={draftProfile.ttsModel || defaultProfile.ttsModel}
                options={ttsModelOptions}
                onChange={(value) => updateField("ttsModel", value)}
              />
            </SettingsSection>
            <SettingsSection title="唤醒词" footer="每行一个。说出任意一个词后，App 会进入当前任务的听写状态。">
              <WakeWordEditor
                label="全局唤醒词"
                value={draftProfile.wakeWordPhrases}
                hint=""
                onChange={(value) => updateField("wakeWordPhrases", value)}
              />
            </SettingsSection>
          </div>
        ) : null}

        {globalSettings && settingsPage === "global-notifications" ? (
          <div className="settings-page-content">
            <SettingsSection
              title="任务完成通知"
              footer="只发送会话名称和完成状态，不会把任务内容、AI 返回正文或服务器密码放进系统通知。"
            >
              <ConfigToggle
                label="允许 Push 通知"
                checked={draftProfile.taskPushNotificationsEnabled === true}
                onChange={(value) => updateField("taskPushNotificationsEnabled", value)}
              />
            </SettingsSection>
            <SettingsSection
              title="通知时机"
              footer="远端 Agent 到达完成、失败或已取消状态时发送。点击通知会打开对应会话并同步最终结果。"
            >
              <SettingsStatusRow
                icon={Bell}
                title="后台任务结果"
                detail="iPhone 与 iPad"
                value={draftProfile.taskPushNotificationsEnabled === true ? "已启用" : "未启用"}
              />
            </SettingsSection>
          </div>
        ) : null}

        {globalSettings && settingsPage === "global-main-ai" ? (
          <div className="settings-page-content">
            <SettingsSection title="任务分流" footer="主 AI 负责理解自然语言、选择会话和分派任务，不直接替代 Codex 或 Claude 工作会话。">
              <ConfigToggle
                label="启用主 AI"
                checked={draftProfile.mainAIEnabled !== false}
                onChange={(value) => updateField("mainAIEnabled", value)}
              />
            </SettingsSection>
            <SettingsSection title="模型连接" footer="Key 只保存在当前设备。模型名称需要与 OpenAI API 支持的模型 ID 一致。">
              <ConfigField
                label="OpenAI Key"
                type="password"
                value={draftProfile.openAIAPIKey}
                autoComplete="new-password"
                onChange={(value) => updateField("openAIAPIKey", value)}
              />
              <ConfigField
                label="模型"
                value={draftProfile.mainAIModel}
                onChange={(value) => updateField("mainAIModel", value)}
              />
            </SettingsSection>
          </div>
        ) : null}

        {editingSession && settingsPage === "session-actions" ? (
          <div className="settings-page-content">
            <SettingsSection title="会话管理">
              <SettingsActionRow
                icon={Copy}
                title={sessionActionStatus?.tone === "loading" ? "正在复制" : "复制会话"}
                detail="保留连接、工作目录和会话 ID，创建一个可独立修改的新会话"
                disabled={busy || !onDuplicate || sessionActionStatus?.tone === "loading"}
                onClick={handleDuplicateSession}
              />
              {sessionActionStatus ? (
                <div className={`settings-inline-notice ${sessionActionStatus.tone}`}>
                  {sessionActionStatus.tone === "done" ? (
                    <Check size={18} weight="bold" aria-hidden="true" />
                  ) : sessionActionStatus.tone === "error" ? (
                    <WarningCircle size={18} weight="fill" aria-hidden="true" />
                  ) : (
                    <ArrowClockwise className="is-spinning" size={18} weight="bold" aria-hidden="true" />
                  )}
                  <span>{sessionActionStatus.message}</span>
                </div>
              ) : null}
            </SettingsSection>
            <SettingsSection title="AI 工具登录">
              <SettingsActionRow
                icon={Robot}
                title="登录 Codex"
                detail="在本页完成浏览器授权"
                onClick={() => void handleToolLogin("codex")}
                disabled={busy}
              />
              <SettingsActionRow
                icon={Terminal}
                title="登录 Claude"
                detail="在本页完成浏览器授权"
                onClick={() => void handleToolLogin("claude")}
                disabled={busy}
              />
              {toolLoginStatus ? (
                <div className={`settings-inline-notice ${toolLoginStatus.tone}`}>
                  {toolLoginStatus.tone === "done" ? (
                    <Check size={18} weight="bold" aria-hidden="true" />
                  ) : toolLoginStatus.tone === "error" || toolLoginStatus.tone === "warning" ? (
                    <WarningCircle size={18} weight="fill" aria-hidden="true" />
                  ) : (
                    <ArrowClockwise className="is-spinning" size={18} weight="bold" aria-hidden="true" />
                  )}
                  <span>{toolLoginStatus.message}</span>
                </div>
              ) : null}
            </SettingsSection>
            <SettingsSection title="危险操作" footer="删除只会移除当前设备上的会话配置，不会删除远端工程文件。">
              <SettingsActionRow
                icon={Trash}
                title="删除会话"
                detail="从会话列表中移除"
                destructive
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("删除这个会话？")) return;
                  onDelete?.();
                }}
              />
            </SettingsSection>
          </div>
        ) : null}

        {editingSession && settingsPage === "session-login" ? (
          <div className="settings-page-content tool-login-page">
            <SettingsSection
              title={`${agentById(toolLoginStatus?.agentId || draftProfile.agentId).shortName} 授权`}
              footer="AI Workbench 会在远端后台保持授权流程。本页只展示 AI 工具给出的设备码、链接和状态，不显示 SSH 或命令。"
            >
              <SettingsStatusRow
                icon={ShieldCheck}
                title={
                  toolLoginStatus?.tone === "loading"
                    ? "正在检查授权"
                    : toolLoginStatus?.tone === "pending"
                      ? "等待完成授权"
                    : toolLoginStatus?.tone === "warning"
                      ? "尚未登录"
                      : "登录状态"
                }
                detail={toolLoginStatus?.message || "请从会话操作中选择要登录的 AI 工具。"}
                value={
                  toolLoginStatus?.tone === "error"
                    ? "失败"
                    : toolLoginStatus?.tone === "loading"
                      ? "处理中"
                      : toolLoginStatus?.tone === "pending"
                        ? "等待授权"
                        : toolLoginStatus?.tone === "done"
                          ? "已登录"
                          : "未登录"
                }
                tone={toolLoginStatus?.tone === "error" ? "warning" : toolLoginStatus?.tone === "done" ? "success" : "neutral"}
              />
              {toolLoginStatus?.output ? (
                <div className="tool-login-output" aria-label="授权信息">
                  <pre>{toolLoginStatus.output}</pre>
                </div>
              ) : null}
              {toolLoginStatus?.code ? (
                <SettingsStatusRow
                  icon={Key}
                  title="一次性验证码"
                  detail="在授权网页中输入；验证码会过期。"
                  value={toolLoginStatus.code}
                  actions={<ConfigCopyButton value={toolLoginStatus.code} />}
                />
              ) : null}
              <SettingsButtonRow>
                {toolLoginStatus?.url ? (
                  <button
                    type="button"
                    className="settings-inline-button primary"
                    onClick={() => window.open(toolLoginStatus.url, "_blank", "noopener,noreferrer")}
                  >
                    <ArrowSquareOut size={17} weight="bold" aria-hidden="true" />
                    打开授权网页
                  </button>
                ) : null}
                {toolLoginStatus?.tone === "pending" ? (
                  <>
                    <button
                      type="button"
                      className="settings-inline-button primary"
                      onClick={() => void handleToolLogin(toolLoginStatus?.agentId || draftProfile.agentId, "status")}
                      disabled={busy || toolLoginStatus?.tone === "loading"}
                    >
                      <Check size={17} weight="bold" aria-hidden="true" />
                      我已完成授权
                    </button>
                    <button
                      type="button"
                      className="settings-inline-button"
                      onClick={() => void handleToolLogin(toolLoginStatus?.agentId || draftProfile.agentId, "start")}
                      disabled={busy || toolLoginStatus?.tone === "loading"}
                    >
                      <ArrowClockwise size={17} weight="bold" aria-hidden="true" />
                      重新开始
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="settings-inline-button primary"
                      onClick={() => void handleToolLogin(toolLoginStatus?.agentId || draftProfile.agentId, "start")}
                      disabled={busy || toolLoginStatus?.tone === "loading"}
                    >
                      <ArrowClockwise size={17} weight="bold" aria-hidden="true" />
                      {toolLoginStatus?.tone === "done" ? "重新登录" : "开始登录"}
                    </button>
                    <button
                      type="button"
                      className="settings-inline-button"
                      onClick={() => void handleToolLogin(toolLoginStatus?.agentId || draftProfile.agentId, "status")}
                      disabled={busy || toolLoginStatus?.tone === "loading"}
                    >
                      <ArrowClockwise size={17} weight="bold" aria-hidden="true" />
                      检查登录状态
                    </button>
                  </>
                )}
              </SettingsButtonRow>
            </SettingsSection>
          </div>
        ) : null}

        {editingSession && settingsPage === "session-share" ? (
          <div className="settings-page-content">
            <SettingsSection
              title="分享给指定账号"
              footer="会分享会话 ID、机器地址、工作目录、AI 类型和 SSH 登录密码，受信任账号导入后可以直接连接。不分享 API Key 和聊天记录。"
            >
              <ConfigField
                label="接收方账号"
                value={shareForm.recipientAccount}
                autoComplete="off"
                placeholder="对方的同步账号"
                onChange={(value) => setShareForm((current) => ({ ...current, recipientAccount: normalizeCloudSyncAccount(value) }))}
              />
              <ConfigField
                label="你的同步账号"
                value={shareForm.account}
                autoComplete="username"
                placeholder="你的云端账号"
                onChange={(value) => {
                  const account = normalizeCloudSyncAccount(value);
                  setShareForm((current) => ({ ...current, account }));
                  saveCloudSyncSettings({ endpoint: shareForm.endpoint, account });
                }}
              />
              <ConfigField
                label="同步密码"
                type="password"
                value={shareForm.password}
                autoComplete="current-password"
                placeholder="用于验证你的账号"
                onChange={(value) => setShareForm((current) => ({ ...current, password: value }))}
              />
            </SettingsSection>
            <SettingsSection title="操作">
              <SettingsActionRow
                icon={ShareNetwork}
                title="发送共享邀请"
                detail="对方下次点击“下载云端配置”时会看到这个会话"
                onClick={handleShareSession}
                disabled={busy || shareBusy || !onShareSession}
              />
            </SettingsSection>
            {shareStatus ? <p className={`settings-page-status ${shareStatus.tone || ""}`}>{shareStatus.message}</p> : null}
          </div>
        ) : null}
        </div>

        {addingSessions || settingsPageNeedsSave ? (
          <div className="settings-actions">
            {addingSessions ? (
              <button
                type="button"
                className="send-button session-add-button"
                onClick={() => onAddSelected?.()}
                disabled={busy || !selectedSessionCount}
              >
                添加 {selectedSessionCount} 个会话
              </button>
            ) : (
              <button type="button" className="send-button" onClick={() => onSave?.()} disabled={busy}>
                保存更改
              </button>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function SessionImportPanel({
  discovery,
  profile,
  activeAgent,
  platform = "linux",
  selectedKeys,
  busy,
  onToggle,
  onScan,
}) {
  const [showAllDirectories, setShowAllDirectories] = useState(false);
  const [showHiddenDirectories, setShowHiddenDirectories] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [manualPath, setManualPath] = useState("");
  const [directoryPrefs, setDirectoryPrefs] = useState(loadDirectoryPrefs);
  const historyScope = manualWorkdirScope(profile);
  const [manualEntries, setManualEntries] = useState(() => recentManualWorkdirs(historyScope, activeAgent));
  const state = discovery?.state || "idle";
  const directories = Array.isArray(discovery?.directories) ? discovery.directories : [];
  const conversations = Array.isArray(discovery?.conversations) ? discovery.conversations : [];
  const recentSessions = Array.isArray(discovery?.recentSessions) ? discovery.recentSessions : [];
  const favoriteKeys = useMemo(() => new Set(directoryPrefs.favorites || []), [directoryPrefs.favorites]);
  const hiddenKeys = useMemo(() => new Set(directoryPrefs.hidden || []), [directoryPrefs.hidden]);
  const manualPlaceholder = platform === "windows" ? "例如 C:\\project\\app" : "例如 /opt/project/app";

  function addManualPath() {
    const path = manualPath.trim();
    if (!path || busy) return;

    const normalizedAgent = activeAgent === "claude" ? "claude" : "codex";
    const key = sessionSelectionKey(normalizedAgent, path, "", workdirDisplayName(path));
    setManualEntries((items) => {
      if (items.some((item) => item.agentId === normalizedAgent && item.path === path)) return items;
      return [{ agentId: normalizedAgent, path, source: "manual", updatedAt: Date.now() }, ...items];
    });
    rememberManualWorkdir(historyScope, normalizedAgent, path);
    if (!selectedKeys.includes(key)) onToggle(key);
    setManualPath("");
    setDirectoryQuery("");
  }

  function updateDirectoryPrefs(updater) {
    setDirectoryPrefs((current) => {
      const next = normalizeDirectoryPrefs(typeof updater === "function" ? updater(current) : updater);
      saveDirectoryPrefs(next);
      return next;
    });
  }

  function toggleFavorite(key) {
    updateDirectoryPrefs((current) => ({
      ...current,
      favorites: toggleListValue(current.favorites, key),
      hidden: (current.hidden || []).filter((item) => item !== key),
    }));
  }

  function toggleHidden(key) {
    updateDirectoryPrefs((current) => ({
      ...current,
      hidden: toggleListValue(current.hidden, key),
      favorites: (current.favorites || []).filter((item) => item !== key),
    }));
  }

  const mergedDirectories = useMemo(() => {
    const conversationItems = conversations
      .filter((item) => item.agentId === activeAgent && String(item.workdir || "").trim())
      .map((item) => ({
        path: String(item.workdir || "").trim(),
        name: item.title || item.name || workdirDisplayName(item.workdir),
        markers: ["agent-session", item.status === "running" || item.status === "queued" ? "running" : ""].filter(Boolean),
        history: { codex: item.agentId === "codex" ? 1 : 0, claude: item.agentId === "claude" ? 1 : 0 },
        current: false,
        exists: true,
        score: 100 + (item.status === "running" || item.status === "queued" ? 80 : 0),
        latest: Number(item.mtime || 0),
        conversationId: item.id,
        conversationStatus: item.status,
        remoteTaskId: item.taskId,
        lastPrompt: item.lastPrompt,
        lastResult: item.lastResult,
      }));
    const agentConversationKeys = new Set(
      conversationItems.map((item) => `${activeAgent}:${String(item.path || "")}:${String(item.conversationId || "")}`),
    );
    const agentConversationPathKeys = new Set(conversationItems.map((item) => `${activeAgent}:${String(item.path || "")}`));
    const historySessionItems = recentSessions
      .filter((item) => (item.agentId || item.agent) === activeAgent && String(item.cwd || item.workdir || "").trim())
      .map((item) => {
        const path = String(item.cwd || item.workdir || "").trim();
        const title = String(item.title || "").trim() || workdirDisplayName(path);
        return {
          path,
          name: title,
          markers: ["native-session"],
          history: { codex: activeAgent === "codex" ? 1 : 0, claude: activeAgent === "claude" ? 1 : 0 },
          current: false,
          exists: true,
          score: 70,
          latest: Number(item.mtime || 0),
          conversationId: "",
          sourceSessionId: String(item.sessionId || "").trim(),
          lastPrompt: item.lastUser || "",
          lastResult: item.lastAssistant || "",
        };
      })
      .filter(
        (item) =>
          !agentConversationPathKeys.has(`${activeAgent}:${item.path}`) &&
          !agentConversationKeys.has(`${activeAgent}:${item.path}:${item.sourceSessionId}`),
      );
    const historyPathKeys = new Set(historySessionItems.map((item) => `${activeAgent}:${String(item.path || "")}`));
    const directoryItems = directories
      .filter((item) => !historyPathKeys.has(`${activeAgent}:${String(item.path || "")}`))
      .map((item) => ({ ...item, conversationId: "", sourceSessionId: "" }));
    const items = [...conversationItems, ...historySessionItems, ...directoryItems];
    const existingKeys = new Set(
      items.map(
        (item) =>
          `${activeAgent}:${String(item.path || "")}:${String(item.conversationId || "")}:${String(item.sourceSessionId || "")}`,
      ),
    );
    const existingPathKeys = new Set(items.map((item) => `${activeAgent}:${String(item.path || "")}`));
    manualEntries
      .filter((item) => item.agentId === activeAgent)
      .forEach((item) => {
        const key = `${item.agentId}:${item.path}::`;
        if (existingKeys.has(key) || existingPathKeys.has(`${item.agentId}:${item.path}`)) return;
        items.push({
          path: item.path,
          name: workdirDisplayName(item.path),
          markers: [item.source === "manual" ? "manual" : "saved"],
          history: { codex: 0, claude: 0 },
          current: false,
          exists: true,
          score: 1,
          latest: 0,
          conversationId: "",
          sourceSessionId: "",
        });
      });
    return items;
  }, [activeAgent, conversations, directories, manualEntries, recentSessions]);

  const sortedDirectories = [...mergedDirectories].sort((a, b) => {
    const aFavorite = favoriteKeys.has(directoryPrefKey(activeAgent, a.path)) ? 1 : 0;
    const bFavorite = favoriteKeys.has(directoryPrefKey(activeAgent, b.path)) ? 1 : 0;
    const aHistory = Number(a.history?.[activeAgent] || 0);
    const bHistory = Number(b.history?.[activeAgent] || 0);
    return (
      bFavorite - aFavorite ||
      bHistory - aHistory ||
      Number(b.latest || 0) - Number(a.latest || 0) ||
      Number(b.score || 0) - Number(a.score || 0) ||
      String(a.path).localeCompare(String(b.path))
    );
  });
  const agentDirectories = sortedDirectories.filter(
    (item) => Number(item.history?.[activeAgent] || 0) > 0 || item.markers?.includes("manual"),
  );
  const focusedDirectories = agentDirectories.length ? agentDirectories : sortedDirectories;
  const query = directoryQuery.trim().toLocaleLowerCase();
  const searchedDirectories = query
    ? focusedDirectories.filter((item) => {
        const text = [
          item.name,
          item.path,
          directoryUsageBadge(item, activeAgent),
          ...displayMarkers(item.markers),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        return text.includes(query);
      })
    : focusedDirectories;
  const visibleBaseDirectories = searchedDirectories.filter(
    (item) => showHiddenDirectories || !hiddenKeys.has(directoryPrefKey(activeAgent, item.path)),
  );
  const visibleDirectories = showAllDirectories ? visibleBaseDirectories : visibleBaseDirectories.slice(0, 20);
  const hiddenByPreferenceCount = Math.max(0, searchedDirectories.length - visibleBaseDirectories.length);
  const hiddenCount = Math.max(0, visibleBaseDirectories.length - visibleDirectories.length);
  const canManualAdd = state !== "scanning";
  const canShowDirectoryTools = state === "done" || Boolean(query) || visibleBaseDirectories.length > 0;
  const canShowDirectoryRows = canManualAdd && (state === "done" || visibleDirectories.length > 0 || query);
  const directoryStatusText =
    state === "idle"
      ? "可以扫描已有 AI 会话，也可以手动输入路径"
      : state === "scanning"
        ? "正在扫描远端目录"
        : state === "error"
          ? `扫描失败，可手动输入路径${discovery?.message ? `：${discovery.message}` : ""}`
          : query
            ? `匹配 ${visibleBaseDirectories.length} 个目录`
            : visibleBaseDirectories.length === 0
              ? "没有识别到 AI 历史目录，可手动输入路径"
              : `${visibleBaseDirectories.length} 个常用目录，可多选添加`;

  useEffect(() => {
    setShowAllDirectories(false);
    setShowHiddenDirectories(false);
    setDirectoryQuery("");
  }, [activeAgent, state, mergedDirectories.length]);

  useEffect(() => {
    setManualEntries(recentManualWorkdirs(historyScope, activeAgent));
    setManualPath("");
  }, [historyScope, activeAgent]);

  return (
    <section className="session-import-block">
      <div className="session-import-label">
        <strong>工作目录</strong>
        <span>{directoryStatusText}</span>
      </div>

      <div className="session-import">
        {state === "scanning" ? (
          <div className="scan-skeleton compact">
            <span />
            <span />
          </div>
        ) : null}

        {state === "error" ? <p className="discovery-error">{discovery?.message || "扫描失败。"}</p> : null}

        {canManualAdd ? (
          <>
            <div className="directory-add-methods">
              <div className="directory-method-card">
                <div className="directory-method-main">
                  <strong className="directory-method-title">自动扫描</strong>
                  <button
                    type="button"
                    className="directory-method-action"
                    onClick={() => onScan?.()}
                    disabled={busy}
                  >
                    <ArrowClockwise size={16} weight="bold" />
                    {state === "idle" ? "开始扫描" : "重新扫描"}
                  </button>
                </div>
                <p className="directory-method-note">读取这台机器里的 Codex、Claude 历史和常用目录。</p>
              </div>

              <div className="directory-method-card manual">
                <div className="directory-method-main">
                  <strong className="directory-method-title">手动添加</strong>
                  <div className="manual-directory">
                    <label>
                      <input
                        type="text"
                        value={manualPath}
                        placeholder={manualPlaceholder}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck="false"
                        onChange={(event) => setManualPath(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          addManualPath();
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={addManualPath}
                      disabled={busy || !manualPath.trim()}
                    >
                      添加
                    </button>
                  </div>
                </div>
                <p className="directory-method-note">知道完整路径时可以直接添加，不需要先扫描。</p>
              </div>
            </div>

            {canShowDirectoryTools ? (
              <div className="directory-tools">
                <label className="directory-search">
                  <span>搜索</span>
                  <input
                    type="search"
                    value={directoryQuery}
                    placeholder="目录名或路径"
                    onChange={(event) => {
                      setDirectoryQuery(event.target.value);
                      setShowAllDirectories(false);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={`directory-filter-pill ${showHiddenDirectories ? "active" : ""}`}
                  onClick={() => setShowHiddenDirectories((value) => !value)}
                  disabled={!hiddenByPreferenceCount && !showHiddenDirectories}
                >
                  {showHiddenDirectories ? "收起隐藏" : hiddenByPreferenceCount ? `隐藏 ${hiddenByPreferenceCount}` : "无隐藏"}
                </button>
              </div>
            ) : null}

            {canShowDirectoryRows ? (
              <div className="session-pick-list">
                {visibleDirectories.map((item) => {
                  const key = sessionSelectionKey(activeAgent, item.path, item.conversationId, item.name, item.sourceSessionId);
                  const checked = selectedKeys.includes(key);
                  const prefKey = directoryPrefKey(activeAgent, item.path);
                  const favorite = favoriteKeys.has(prefKey);
                  const hidden = hiddenKeys.has(prefKey);
                  const historyCount = Number(item.history?.[activeAgent] || 0);
                  const usageBadge = directoryUsageBadge(item, activeAgent);
                  const meta = [
                    item.conversationId ? "Agent 已同步" : "",
                    item.sourceSessionId ? "历史会话" : "",
                    item.conversationStatus === "running" || item.conversationStatus === "queued" ? "运行中" : "",
                    favorite ? "已收藏" : "",
                    hidden ? "已隐藏" : "",
                    historyCount ? `${activeAgent === "claude" ? "Claude" : "Codex"} ${historyCount}` : "",
                    ...displayMarkers(item.markers),
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <div
                      className={`session-pick-row ${checked ? "checked" : ""} ${favorite ? "favorite" : ""} ${
                        hidden ? "hidden-directory" : ""
                      }`}
                      role="checkbox"
                      aria-checked={checked}
                      tabIndex={0}
                      key={key}
                      onClick={() => onToggle(key)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onToggle(key);
                      }}
                    >
                      <input type="checkbox" checked={checked} readOnly tabIndex={-1} />
                      <div className="session-row-copy">
                        <span className="session-row-title">
                          <strong>{item.name || workdirDisplayName(item.path)}</strong>
                          {usageBadge ? <em>{usageBadge}</em> : null}
                        </span>
                        <span className="mono">{item.path}</span>
                        <small>{meta || "普通目录"}</small>
                      </div>
                      <div className="session-row-actions">
                        <button
                          type="button"
                          className={`directory-icon-button ${favorite ? "active" : ""}`}
                          aria-label={favorite ? "取消收藏目录" : "收藏目录"}
                          title={favorite ? "取消收藏" : "收藏"}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleFavorite(prefKey);
                          }}
                        >
                          {favorite ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          className="directory-hide-button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleHidden(prefKey);
                          }}
                        >
                          {hidden ? "显示" : "隐藏"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!visibleDirectories.length ? (
                  <p className="session-empty">
                    {query ? "没有匹配的工作目录。" : "输入工作目录后点“添加”，不需要先扫描。"}
                  </p>
                ) : null}
                {hiddenCount ? (
                  <button type="button" className="show-more-directories" onClick={() => setShowAllDirectories(true)}>
                    显示全部 {visibleBaseDirectories.length} 个目录
                  </button>
                ) : null}
              </div>
            ) : null}

          </>
        ) : null}
      </div>
    </section>
  );
}

export function AgentModelField({ agentId, value, onChange }) {
  const normalizedAgent = agentId === "claude" ? "claude" : "codex";
  const model = normalizeAgentModel(normalizedAgent, value);
  const baseOptions = agentModelOptions[normalizedAgent] || [];
  const presetSelected = !model || baseOptions.some((option) => option.id === model);
  const [customOpen, setCustomOpen] = useState(!presetSelected);
  const options = [...agentModelOptionsForAgent(normalizedAgent, model), { id: "__custom__", label: "自定义模型 ID" }];
  const selectValue = customOpen ? "__custom__" : model;

  useEffect(() => {
    setCustomOpen(!presetSelected);
  }, [normalizedAgent, presetSelected]);

  return (
    <>
      <ConfigSelect
        label="模型"
        value={selectValue}
        options={options}
        onChange={(nextValue) => {
          if (nextValue === "__custom__") {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          onChange(nextValue);
        }}
      />
      {customOpen ? (
        <ConfigField
          label="模型 ID"
          value={model}
          onChange={(nextValue) => onChange(normalizeAgentModel(normalizedAgent, nextValue))}
        />
      ) : null}
    </>
  );
}

export function ConfigToggle({ label, checked, disabled = false, onChange }) {
  return (
    <label className="config-field config-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function WakeWordEditor({
  label = "唤醒词",
  value,
  fallbackPhrases = defaultWakeWordPhrases,
  hint = "每一行一个，也支持逗号或顿号分隔。",
  onChange,
}) {
  const phrases = wakePhrasesFromText(value);
  const editorValue = phrases.length ? serializeWakePhrases(phrases) : serializeWakePhrases(fallbackPhrases);
  const lineCount = Math.max(3, Math.min(8, editorValue.split("\n").length + 1));

  return (
    <label className="config-field wake-word-field">
      <span>{label}</span>
      <div className="wake-word-control">
        <textarea
          value={editorValue}
          rows={lineCount}
          placeholder="未来"
          onChange={(event) => onChange(serializeWakePhrases(wakePhrasesFromText(event.target.value)))}
          onBlur={(event) => {
            const next = wakePhrasesFromText(event.target.value);
            onChange(serializeWakePhrases(next.length ? next : fallbackPhrases));
          }}
        />
        <small>{hint}</small>
      </div>
    </label>
  );
}

function ConfigCopyButton({ value }) {
  const copyValue = String(value ?? "");
  const [copyState, setCopyState] = useState("idle");

  useEffect(() => {
    setCopyState("idle");
  }, [copyValue]);

  async function handleCopy(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!copyValue) return;
    const ok = await copyPlainText(copyValue);
    setCopyState(ok ? "copied" : "failed");
  }

  const label = copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制";
  const CopyStateIcon = copyState === "copied" ? Check : copyState === "failed" ? WarningCircle : Copy;

  return (
    <button
      type="button"
      className={`config-copy-button copy-state-${copyState}`}
      onClick={handleCopy}
      disabled={!copyValue}
      aria-label={label}
      title={label}
    >
      <CopyStateIcon size={16} weight="bold" aria-hidden="true" />
    </button>
  );
}

export function ConfigField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  required = false,
  readOnly = false,
}) {
  const resolvedAutoComplete = type === "password" ? autoComplete || "new-password" : autoComplete;
  const visibleType = type === "password" ? "text" : type;

  return (
    <label className={`config-field ${required ? "required" : ""} ${readOnly ? "read-only" : ""}`}>
      <span>{label}</span>
      <div className="config-control">
        <input
          value={value ?? ""}
          type={visibleType}
          inputMode={inputMode}
          autoComplete={resolvedAutoComplete}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
        />
        <ConfigCopyButton value={value} />
      </div>
    </label>
  );
}

export function ConfigSelect({ label, value, options, onChange }) {
  const selectedOption = options.find((option) => option.id === value);
  const copyValue = selectedOption?.label || value;

  return (
    <label className="config-field config-select-field">
      <span>{label}</span>
      <div className="config-control">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <CaretRight className="config-select-chevron" size={15} weight="bold" aria-hidden="true" />
        <ConfigCopyButton value={copyValue} />
      </div>
    </label>
  );
}
