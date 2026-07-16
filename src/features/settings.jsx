import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowClockwise,
  CaretRight,
  Check,
  Copy,
  DownloadSimple,
  FileZip,
  FolderSimple,
  GitBranch,
  HardDrives,
  Info,
  Microphone,
  Palette,
  Robot,
  Terminal,
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
  buildInstallWorkbenchAgentCommand,
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
  normalizeAgentModel,
  normalizeDirectoryPrefs,
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
    <div className={`settings-status-row tone-${tone}`}>
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

export function SettingsPanel({
  servers = [],
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
  onOpenTerminal,
  onInstallAgent,
  onRefreshAgent,
  onInstallWsl,
  onInstallGit,
  onGitDownload,
  onExportConfig,
  onExportLogs,
  onImportConfig,
  onTest,
}) {
  const [connectionFormExpanded, setConnectionFormExpanded] = useState(false);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [gitRepoUrl, setGitRepoUrl] = useState("");
  const [gitTargetDir, setGitTargetDir] = useState(() => String(draftProfile.workdir || ""));
  const [gitBranch, setGitBranch] = useState("");
  const [gitStatus, setGitStatus] = useState(null);
  const [agentSelectionNotice, setAgentSelectionNotice] = useState("");
  const [settingsPage, setSettingsPage] = useState("root");
  const [appInfo, setAppInfo] = useState(() => normalizeAppInfo());
  const migrationInputRef = useRef(null);
  const settingsScrollRef = useRef(null);

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

  const missingPassword = !String(draftProfile.password || "").trim();
  const addingSessions = mode === "add";
  const editingSession = mode === "edit";
  const globalSettings = mode === "global";
  const addScanDone = addingSessions && settingsDiscovery?.state === "done";
  const compactConnection = addScanDone && !connectionFormExpanded;
  const draftConnectionKey = profileConnectionKey(draftProfile);
  const sameMachineDiagnostics = (servers || [])
    .filter((server) => profileConnectionKey(server.profile) === draftConnectionKey)
    .map((server) => server.diagnostics || {});
  const availableMachineDiagnostics = sameMachineDiagnostics.find(
    (diagnostics) => diagnostics.agent === "available" || diagnostics.agent_version,
  );
  const mergedHealth = {
    ...sameMachineDiagnostics.reduce((health, diagnostics) => ({ ...health, ...diagnostics }), {}),
    ...(editingServer?.diagnostics || {}),
    ...(availableMachineDiagnostics || {}),
    ...(settingsDiscovery?.health || {}),
  };
  const agentHealth =
    mergedHealth.agent ||
    (isWindowsProfile(draftProfile) ? "unsupported" : "missing");
  const agentVersion = mergedHealth.agent_version || "";
  const latestAgentVersion = latestWorkbenchAgentVersion || "";
  const installedAgentVersionNumber = workbenchAgentVersionNumber(agentVersion);
  const latestAgentVersionNumber = workbenchAgentVersionNumber(latestAgentVersion);
  const agentAvailable = agentHealth === "available";
  const agentUnsupported = agentHealth === "unsupported" || isWindowsProfile(draftProfile);
  const agentNeedsUpdate =
    agentAvailable &&
    latestAgentVersionNumber > 0 &&
    installedAgentVersionNumber > 0 &&
    installedAgentVersionNumber < latestAgentVersionNumber;
  const currentMachineTasks = Array.isArray(mergedHealth.agent_task_list)
    ? mergedHealth.agent_task_list
    : [];
  const currentMachineHostHealth = formatHostPerformanceSummary(mergedHealth, true);
  const gitPath = String(mergedHealth.git || "").trim();
  const gitVersion = String(mergedHealth.git_version || "").trim();
  const gitAvailable = Boolean(gitPath);
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
      setAgentSelectionNotice("");
      updateField("useWorkbenchAgent", false);
      return;
    }
    if (agentUnsupported) {
      setAgentSelectionNotice("当前服务器类型暂不支持 Agent，只能使用 SSH 直连。");
      return;
    }
    if (!agentAvailable) {
      setAgentSelectionNotice("当前会话连接的这台机器还没有检测到 Agent。可以在本页安装或重新检测。");
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

  useEffect(() => {
    if (!editingSession) return;
    setGitTargetDir(String(draftProfile.workdir || ""));
    setGitStatus(null);
    setAgentSelectionNotice("");
  }, [editingSession, editingServer?.id, draftProfile.workdir]);

  useEffect(() => {
    setSettingsPage("root");
  }, [mode, editingServer?.id]);

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
    const scrollBody = settingsScrollRef.current;
    if (!scrollBody) return undefined;

    const resetHorizontalPosition = () => {
      if (scrollBody.scrollLeft !== 0) scrollBody.scrollLeft = 0;
    };

    resetHorizontalPosition();
    const frameId = window.requestAnimationFrame(resetHorizontalPosition);
    return () => window.cancelAnimationFrame(frameId);
  }, [mode, settingsPage, connectionFormExpanded, settingsDiscovery?.state]);

  const pageTitles = {
    root: addingSessions ? "添加工作会话" : editingSession ? "会话设置" : "全局设置",
    "session-general": "连接配置",
    "session-connection": "连接信息",
    "session-development": "开发环境",
    "session-execution": "执行方式",
    "session-actions": "会话操作",
    "global-appearance": "外观",
    "global-voice": "语音与播放",
    "global-migration": "配置迁移",
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
  const settingsPageNeedsSave = [
    "session-general",
    "global-appearance",
    "global-voice",
    "global-main-ai",
  ].includes(settingsPage);

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
              disabled={busy}
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
          <button type="button" className="settings-close-button" onClick={onClose} disabled={busy} aria-label="关闭设置">
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
        {settingsPage === "root" && editingSession ? (
          <div className="settings-root-page">
            <SettingsSection title="当前会话">
              <SettingsMenuRow
                icon={HardDrives}
                title="连接配置"
                detail={`${currentAgent.shortName}，${currentModel} · ${draftProfile.username || "用户"}@${draftProfile.host || "未配置"}`}
                value={draftProfile.useWorkbenchAgent === true ? "Agent" : "SSH"}
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
                detail="复制会话、打开终端或删除"
                onClick={() => setSettingsPage("session-actions")}
              />
            </SettingsSection>
            {isWindowsProfile(draftProfile) ? (
              <SettingsSection
                title="WSL Linux 环境"
                footer="WSL 安装在 Windows 宿主机上。就绪后，SSH 仍连接 Windows，但 Codex、Claude 和 Agent 会在 WSL 内运行。"
              >
                <SettingsStatusRow
                  icon={Terminal}
                  title="Windows + WSL"
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
                      className="settings-inline-button primary"
                      onClick={onInstallWsl}
                      disabled={busy || !onInstallWsl}
                    >
                      <Wrench size={17} weight="bold" />
                      {wslNeedsRestart ? "完成安装" : "安装 WSL"}
                    </button>
                  ) : null}
                </SettingsButtonRow>
              </SettingsSection>
            ) : null}
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
                icon={Microphone}
                title="语音与播放"
                detail="唤醒、识别、音色和结果播报"
                value={draftProfile.voiceInputEnabled === true ? "已开启" : "已关闭"}
                onClick={() => setSettingsPage("global-voice")}
              />
              <SettingsMenuRow
                icon={Robot}
                title="主 AI"
                detail="自然语言理解与任务分流"
                value={draftProfile.mainAIEnabled !== false ? "已开启" : "已关闭"}
                onClick={() => setSettingsPage("global-main-ai")}
              />
            </SettingsSection>
            <SettingsSection title="数据">
              <SettingsMenuRow
                icon={FolderSimple}
                title="配置迁移"
                detail="导入、导出配置与诊断日志"
                onClick={() => setSettingsPage("global-migration")}
              />
            </SettingsSection>
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

        {(addingSessions || (editingSession && ["session-general", "session-connection"].includes(settingsPage))) && missingPassword ? (
          <p className="settings-note">
            {editingSession
              ? "没有找到这台机器的已保存密码，修改连接信息前需要补一次。"
              : "第一次使用填写登录密码即可，测试通过后就能开始对话。"}
          </p>
        ) : null}

        {compactConnection ? (
          <div className="connection-summary-card">
            <div>
              <strong>{draftProfile.name || draftProfile.host || "服务器"}</strong>
              <span>
                {draftProfile.username}@{draftProfile.host} · {serverPlatformLabel(draftProfile)}
              </span>
            </div>
            <button type="button" className="ghost-button" onClick={() => setConnectionFormExpanded(true)}>
              修改
            </button>
          </div>
        ) : null}

        {editingSession && settingsPage === "session-general" ? (
          <div className="settings-page-content">
            <SettingsSection title="会话与模型" footer="名称用于会话列表和语音切换，工作目录决定 AI 可以访问的工程范围。">
              <ConfigField label="名称" value={draftProfile.name} onChange={(value) => updateField("name", value)} />
              <ConfigSelect
                label="AI 类型"
                value={draftProfile.agentId || defaultProfile.agentId}
                options={agents.map((agent) => ({ id: agent.id, label: agent.shortName }))}
                onChange={(value) => updateField("agentId", value)}
              />
              <AgentModelField
                agentId={draftProfile.agentId || defaultProfile.agentId}
                value={draftProfile.aiModel || ""}
                onChange={(value) => updateField("aiModel", value)}
              />
              <ConfigField label="工作目录" value={draftProfile.workdir} onChange={(value) => updateField("workdir", value)} />
            </SettingsSection>
            <SettingsSection title="连接信息" footer="服务器账号和密码保存在当前设备，用于建立 SSH 连接和远端操作。">
              <ConfigSelect
                label="服务器类型"
                value={normalizeServerPlatform(draftProfile.platform)}
                options={serverPlatforms}
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
                onChange={(value) => updateField("password", value)}
              />
            </SettingsSection>
            <SettingsSection
              title="执行方式"
              footer="Agent 安装在当前会话连接的这台机器上。同一台机器的多个会话会共享它；未安装或不支持时，会使用 SSH 直连。"
              className="agent-mode-panel"
            >
              <ConfigToggle
                label="使用 Agent"
                checked={agentAvailable && draftProfile.useWorkbenchAgent === true}
                disabled={agentUnsupported || busy}
                onChange={handleAgentModeChange}
              />
              <SettingsStatusRow
                icon={Robot}
                title="当前机器 Agent"
                detail={
                  agentAvailable
                    ? `${draftProfile.username || "用户"}@${draftProfile.host || "未配置"} · 已安装 v${agentVersion || "未知"}${agentNeedsUpdate ? "，建议升级" : "，运行正常"}${currentMachineHostHealth !== "未检测" ? ` · ${currentMachineHostHealth}` : ""}`
                    : agentUnsupported
                      ? "当前服务器类型暂不支持，将使用 SSH 直连"
                      : `${draftProfile.username || "用户"}@${draftProfile.host || "未配置"} · 未检测到；SSH 可用，但无法可靠恢复长任务`
                }
                value={agentAvailable ? (agentNeedsUpdate ? "可升级" : "可用") : agentUnsupported ? "不支持" : "未安装"}
                tone={agentAvailable ? (agentNeedsUpdate ? "warning" : "success") : "neutral"}
              />
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

        {(addingSessions || (editingSession && settingsPage === "session-connection")) && !compactConnection ? (
          <div className={editingSession ? "settings-page-content" : "settings-add-connection"}>
            <SettingsSection
              title={editingSession ? "服务器" : "连接信息"}
              footer={editingSession ? "密码保存在当前设备，用于建立 SSH 连接。" : "连接成功后会自动扫描 Codex 和 Claude 的工作目录。"}
            >
              <ConfigField label="名称" value={draftProfile.name} onChange={(value) => updateField("name", value)} />
              <ConfigSelect
                label="服务器类型"
                value={normalizeServerPlatform(draftProfile.platform)}
                options={serverPlatforms}
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
            {isWindowsProfile(draftProfile) ? (
              <SettingsSection
                title="WSL Linux 环境"
                footer="先通过 Windows SSH 完成检测。WSL 就绪后会自动切换并扫描 Linux 内的 Codex、Claude 和工作目录。"
              >
                <SettingsStatusRow
                  icon={Terminal}
                  title="Windows + WSL"
                  detail={wslStatusDetail}
                  value={wslStatusLabel}
                  tone={wslReady ? "success" : wslNeedsRestart ? "warning" : "neutral"}
                />
                <SettingsButtonRow>
                  <button type="button" className="settings-inline-button" onClick={onScan} disabled={busy || !onScan}>
                    <ArrowClockwise size={17} weight="bold" />
                    连接检测
                  </button>
                  {!wslReady ? (
                    <button
                      type="button"
                      className="settings-inline-button primary"
                      onClick={onInstallWsl}
                      disabled={busy || !onInstallWsl}
                    >
                      <Wrench size={17} weight="bold" />
                      {wslNeedsRestart ? "完成安装" : "安装 WSL"}
                    </button>
                  ) : null}
                </SettingsButtonRow>
              </SettingsSection>
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
            <SettingsSection title="Git 仓库" className="git-operation-settings">
              <ConfigField label="仓库地址" value={gitRepoUrl} onChange={setGitRepoUrl} />
              <ConfigField label="保存目录" value={gitTargetDir} onChange={setGitTargetDir} />
              <ConfigField label="分支" value={gitBranch} onChange={setGitBranch} />
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
            onAgentChange={setSettingsAgentTab}
            onToggle={(key) => {
              setSettingsSelectedSessions((items) =>
                items.includes(key) ? items.filter((item) => item !== key) : [...items, key],
              );
            }}
            onScan={onScan}
            onAddSelected={onAddSelected}
          />
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
            <SettingsSection title="诊断">
              <SettingsActionRow
                icon={FileZip}
                title="导出诊断日志"
                detail="打包连接、Agent 和运行日志，用于排查问题"
                onClick={handleExportLogs}
                disabled={busy || migrationBusy}
              />
            </SettingsSection>
            {migrationStatus ? (
              <p className={`settings-page-status ${migrationStatus.tone || ""}`}>{migrationStatus.message}</p>
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
            <SettingsSection title="常用操作">
              <SettingsActionRow
                icon={Copy}
                title="复制会话"
                detail="保留服务器和工作目录，创建一个新的独立会话"
                onClick={onDuplicate}
                disabled={busy || !onDuplicate}
              />
              <SettingsActionRow
                icon={Terminal}
                title="打开 SSH 终端"
                detail="处理登录、授权或命令行交互"
                onClick={onOpenTerminal}
                disabled={busy || !onOpenTerminal}
              />
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
        </div>

        {(addingSessions || settingsPageNeedsSave) ? (
        <div className="settings-actions">
          {!addingSessions ? (
            <button type="button" className="send-button" onClick={() => onSave?.()} disabled={busy}>
              保存更改
            </button>
          ) : null}
          {addingSessions ? (
            <button type="button" className="send-button" onClick={() => onTest?.()} disabled={busy}>
              扫描
            </button>
          ) : null}
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
  onAgentChange,
  onToggle,
  onScan,
  onAddSelected,
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
    const key = sessionSelectionKey(normalizedAgent, path);
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
  const selectedCount = selectedKeys.length;
  const hiddenByPreferenceCount = Math.max(0, searchedDirectories.length - visibleBaseDirectories.length);
  const hiddenCount = Math.max(0, visibleBaseDirectories.length - visibleDirectories.length);
  const directoryStatusText =
    state === "idle"
      ? "先连接机器并扫描已有 AI 会话"
      : state === "scanning"
        ? "正在扫描远端目录"
        : state === "error"
          ? discovery?.message || "扫描失败"
          : query
            ? `匹配 ${visibleBaseDirectories.length} 个目录`
            : visibleBaseDirectories.length === 0
              ? "没有识别到 AI 历史目录"
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
    <section className="session-import">
      <div className="session-import-head">
        <div>
          <strong>工作目录</strong>
          <span>{directoryStatusText}</span>
        </div>
        <button type="button" className="ghost-button" onClick={() => onScan?.()} disabled={busy}>
          {state === "done" ? "重新扫描" : "连接扫描"}
        </button>
      </div>

      {state === "scanning" ? (
        <div className="scan-skeleton compact">
          <span />
          <span />
        </div>
      ) : null}

      {state === "error" ? <p className="discovery-error">{discovery?.message || "扫描失败。"}</p> : null}

      {state === "done" ? (
        <>
          <div className="session-tabs" role="tablist" aria-label="AI 类型">
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className={activeAgent === agent.id ? "active" : ""}
                onClick={() => onAgentChange(agent.id)}
              >
                <AgentLogo agentId={agent.id} compact />
                {agent.shortName}
              </button>
            ))}
          </div>

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

          <div className="manual-directory">
            <label>
              <span>手动添加</span>
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
            <button type="button" onClick={addManualPath} disabled={busy || !manualPath.trim()}>
              添加
            </button>
          </div>

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
                {query ? "没有匹配的工作目录。" : "没有从 Codex 或 Claude 历史里识别到工作目录。"}
              </p>
            ) : null}
            {hiddenCount ? (
              <button type="button" className="show-more-directories" onClick={() => setShowAllDirectories(true)}>
                显示全部 {visibleBaseDirectories.length} 个目录
              </button>
            ) : null}
          </div>

          <button type="button" className="send-button session-add-button" onClick={() => onAddSelected?.()} disabled={busy || !selectedCount}>
            添加 {selectedCount} 个会话
          </button>
        </>
      ) : null}
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

export function ConfigField({ label, value, onChange, type = "text", inputMode, autoComplete, required = false }) {
  const resolvedAutoComplete = type === "password" ? autoComplete || "new-password" : autoComplete;
  const visibleType = type === "password" ? "text" : type;

  return (
    <label className={`config-field ${required ? "required" : ""}`}>
      <span>{label}</span>
      <div className="config-control">
        <input
          value={value ?? ""}
          type={visibleType}
          inputMode={inputMode}
          autoComplete={resolvedAutoComplete}
          onChange={(event) => onChange(event.target.value)}
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
    <label className="config-field">
      <span>{label}</span>
      <div className="config-control">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <ConfigCopyButton value={copyValue} />
      </div>
    </label>
  );
}
