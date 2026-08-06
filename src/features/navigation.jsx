import { useEffect, useMemo, useRef, useState } from "react";
import {
  CopySimple,
  DotsThree,
  Plus,
  SidebarSimple,
} from "@phosphor-icons/react";
import {
  Ellipsis,
  PanelLeftClose,
  PanelLeftOpen,
  Plus as LucidePlus,
  RefreshCw,
  SquareArrowOutUpRight,
  SquareTerminal,
} from "lucide-react";
import * as Core from "../core/workbenchCore.js";
import * as Primitives from "./primitives.jsx";
import { useSessionReorder } from "./useSessionReorder.js";
import { SessionSortMenu } from "./SessionSortMenu.jsx";

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
  appDisplayVersion,
  applyGlobalSettings,
  assetBase,
  assetPath,
  automaticTaskWakePhrases,
  bashCommand,
  browserDiagnosticLogStorageKey,
  buildClaudePrintCommand,
  buildCodexExecCommand,
  buildCodexLoginDeviceCommand,
  buildDiscoveryCommand,
  buildHealthCommand,
  buildInstallWorkbenchAgentCommand,
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
  connectionStatusPresentation,
  conversationIdSuffix,
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

export function TopBar({
  sessionName: currentSessionName,
  sessionSubtitle = "",
  showSessionName,
  connection,
  busy,
  onOpenNav,
  onRefreshOutput,
  onToggleTerminal,
  terminalOpen = false,
  onOpenSettings,
}) {
  const status = connectionStatusPresentation(connection);

  return (
    <header className="topbar">
      <button className="nav-trigger" type="button" aria-label="打开菜单" onClick={onOpenNav}>
        <span>≡</span>
      </button>
      <div className={`topbar-session ${showSessionName ? "visible" : ""}`} aria-hidden={!showSessionName}>
        <strong>{currentSessionName}</strong>
        {sessionSubtitle ? <span className="topbar-session-detail">{sessionSubtitle}</span> : null}
        <span className="topbar-session-status">
          <StatusDot status={status.tone} />
          {status.label}
        </span>
      </div>
      <div className="topbar-actions">
        {onToggleTerminal ? (
          <button
            type="button"
            className={`topbar-terminal-button ${terminalOpen ? "active" : ""}`}
            aria-label={terminalOpen ? "收起 SSH 终端" : "打开当前会话 SSH 终端"}
            title={terminalOpen ? "收起 SSH 终端" : "打开当前会话 SSH 终端"}
            aria-pressed={terminalOpen}
            onClick={onToggleTerminal}
          >
            <SquareTerminal size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}
        {onRefreshOutput ? (
          <button
            type="button"
            className="topbar-refresh-button"
            aria-label="同步当前会话状态"
            title="同步当前会话状态"
            onClick={() => onRefreshOutput()}
            disabled={busy}
          >
            <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="topbar-logo-button"
          aria-label="服务器设置"
          title="服务器设置"
          onClick={onOpenSettings}
        >
          <Ellipsis className="topbar-more" size={18} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function connectionActionLabel(connection, fallback = "连接") {
  const state = String(connection?.state || "idle").trim();
  if (state === "testing") return "连接中";
  if (state === "connected") return "断开";
  if (state === "error") return "重新连接";

  const detail = String(connection?.detail || "").trim();
  return /上次状态已重置|已断开|连接断开/.test(detail) ? "重新连接" : fallback;
}

export function NavigationPanel({
  servers = [],
  activeServerId,
  profile,
  connection,
  diagnostics,
  discovery,
  collapsed = false,
  onToggleCollapse,
  onSelectServer,
  onReorderServer,
  onSortServer,
  onOpenChatWindow,
  onConfigureServer,
  onAddServer,
  onDuplicateServer,
  onTestConnection,
  onDisconnectServer,
  busy,
  variant = "default",
  emptyState = null,
  hideAddWhenEmpty = false,
  hideDuplicate = false,
}) {
  const macVariant = variant === "mac";
  const ipadVariant = variant === "ipad";
  const [runtimeVersionLabel, setRuntimeVersionLabel] = useState(appDisplayVersion);
  const [versionCopied, setVersionCopied] = useState(false);
  const versionCopyResetRef = useRef(null);
  const connected = connectionIsLive(connection);
  const connectLabel = connected ? "断开" : connectionActionLabel(connection);
  const { draggingId, getReorderProps } = useSessionReorder(onReorderServer);

  useEffect(() => {
    if (!macVariant) return undefined;

    let active = true;
    desktopBridge()
      ?.getAppInfo?.()
      .then((info) => {
        if (!active || !info) return;
        const version = String(info.version || "").trim();
        const build = String(info.build || "").trim();
        if (version) {
          setRuntimeVersionLabel(build && build !== version ? `v${version} · build ${build}` : `v${version}`);
        }
      })
      .catch(() => {
        // Keep the compile-time version as a fallback for browser previews.
      });

    return () => {
      active = false;
      if (versionCopyResetRef.current) {
        window.clearTimeout(versionCopyResetRef.current);
      }
    };
  }, [macVariant]);

  async function copyRuntimeVersion() {
    const copied = await Primitives.copyPlainText(runtimeVersionLabel);
    if (!copied) return;
    setVersionCopied(true);
    if (versionCopyResetRef.current) {
      window.clearTimeout(versionCopyResetRef.current);
    }
    versionCopyResetRef.current = window.setTimeout(() => {
      setVersionCopied(false);
      versionCopyResetRef.current = null;
    }, 1400);
  }

  function selectServerFromCard(event, serverId) {
    if (event.key && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectServer?.(serverId);
  }

  return (
    <>
      <div className="sidebar-toolbar">
        <SectionHeader title={macVariant || ipadVariant ? "工作会话" : "服务器"} />
        {onAddServer && !(hideAddWhenEmpty && servers.length === 0) ? (
          <button
            className={`sidebar-add ${ipadVariant ? "utility-icon-button" : ""}`}
            type="button"
            aria-label="添加服务器"
            title="添加服务器"
            onClick={onAddServer}
            disabled={busy}
          >
            {macVariant ? (
              <LucidePlus size={16} strokeWidth={1.9} aria-hidden="true" />
            ) : ipadVariant ? (
              <Plus size={16} weight="bold" aria-hidden="true" />
            ) : (
              "+"
            )}
          </button>
        ) : null}
        <SessionSortMenu onSort={servers.length > 1 ? onSortServer : undefined} />
        {onDuplicateServer && !macVariant && !hideDuplicate ? (
          <button
            className={`sidebar-duplicate ${ipadVariant ? "utility-icon-button" : ""}`}
            type="button"
            aria-label="复制当前服务器"
            title="复制当前服务器"
            onClick={onDuplicateServer}
            disabled={busy}
          >
            {ipadVariant ? <CopySimple size={16} weight="bold" aria-hidden="true" /> : "复制"}
          </button>
        ) : null}
        {onToggleCollapse ? (
          <button
            className={`sidebar-collapse ${ipadVariant ? "utility-icon-button" : ""}`}
            type="button"
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            onClick={onToggleCollapse}
          >
            {macVariant ? (
              collapsed ? (
                <PanelLeftOpen size={16} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={16} strokeWidth={1.8} aria-hidden="true" />
              )
            ) : ipadVariant ? (
              <SidebarSimple
                className={collapsed ? "is-collapsed" : ""}
                size={16}
                weight="bold"
                aria-hidden="true"
              />
            ) : collapsed ? (
              "›"
            ) : (
              "‹"
            )}
          </button>
        ) : null}
      </div>
      <div
        className={`server-list ${servers.length === 0 && emptyState ? "has-empty-state" : ""} ${
          draggingId ? "session-reorder-active" : ""
        }`}
      >
        {servers.length === 0 ? emptyState : null}
        {servers.map((server, index) => {
          const isActive = server.id === activeServerId;
          const serverConnection = isActive ? connection : server.connection;
          const serverDiagnostics = isActive ? diagnostics : server.diagnostics || {};
          const taskRunning = serverTaskRunning(server);
          const serverConnected = taskRunning || connectionIsLive(serverConnection);
          const serverReady = profileReady(server.profile);
          const serverConnectLabel = isActive
            ? taskRunning
              ? "运行中"
              : connectLabel
            : serverConnection?.state === "error"
              ? "重新连接"
              : taskRunning
                ? "运行中"
                : serverReady
                  ? connectionActionLabel(serverConnection, "打开")
                  : "配置";
          const serverStatus = taskRunning
            ? "testing"
            : isActive && connectionIsLive(serverConnection)
              ? "disconnect"
              : serverConnection?.state || "idle";
          const taskName = serverSessionName(server, index);
          const sessionIdTail = conversationIdSuffix(server.conversationId);
          const metaText = serverSidebarMeta(server, index, serverConnected);
          const modeInfo = connectionModeForServer(server, serverConnection);
          const unreadResult = Boolean(server.unreadResult);
          const macState = taskRunning
            ? { label: "执行中", tone: "running" }
            : serverConnection?.state === "error"
              ? { label: "重新连接", tone: "error" }
              : connectionIsLive(serverConnection)
                ? { label: "已连接", tone: "connected" }
                : unreadResult
                  ? { label: "已完成", tone: "done" }
                  : { label: connectionActionLabel(serverConnection), tone: "idle" };

          if (macVariant) {
            return (
              <div
                className={`mac-session-row ${isActive ? "active" : ""} ${taskRunning ? "running" : ""} ${
                  unreadResult ? "has-unread-result" : ""
                } ${draggingId === server.id ? "is-reordering" : ""}`}
                role="button"
                tabIndex={0}
                key={server.id}
                aria-label={`${taskName}，${macState.label}`}
                onClick={() => onSelectServer?.(server.id)}
                onDoubleClick={() => onOpenChatWindow?.(server.id)}
                onKeyDown={(event) => selectServerFromCard(event, server.id)}
                {...getReorderProps(server.id)}
              >
                <span className="mac-session-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="mac-session-logo">
                  <AgentLogo agentId={server.profile?.agentId || "codex"} compact />
                </span>
                <span className="mac-session-copy">
                  <strong>{taskName}</strong>
                  <span className="mac-session-subline">
                    <button
                      type="button"
                      className={`mac-session-state ${macState.tone}`}
                      data-reorder-ignore
                      title={isActive && connectionIsLive(serverConnection) ? "断开连接" : connectionActionLabel(serverConnection)}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelectServer?.(server.id);
                        if (busy || taskRunning) return;
                        if (isActive && connectionIsLive(serverConnection)) {
                          onDisconnectServer?.(server.id);
                        } else {
                          onTestConnection?.(server.id);
                        }
                      }}
                    >
                      <StatusDot
                        status={macState.tone === "running" ? "testing" : macState.tone === "done" ? "connected" : macState.tone}
                      />
                      {macState.label}
                    </button>
                    <span className="mac-session-channel">{modeInfo.shortLabel}</span>
                    {sessionIdTail ? <span className="session-id-tail">#{sessionIdTail}</span> : null}
                  </span>
                </span>
                <span className="mac-session-row-actions">
                {onOpenChatWindow ? (
                  <button
                    type="button"
                    className="mac-session-more mac-session-detach"
                    data-reorder-ignore
                    aria-label={`${taskName}在新窗口打开`}
                    title="在新窗口打开"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenChatWindow(server.id);
                    }}
                  >
                    <SquareArrowOutUpRight size={15} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                ) : null}
                {onConfigureServer ? (
                  <button
                    type="button"
                    className="mac-session-more"
                    data-reorder-ignore
                    aria-label={`${taskName}设置`}
                    title="会话设置"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onConfigureServer(server.id);
                    }}
                  >
                    <Ellipsis size={16} strokeWidth={1.9} aria-hidden="true" />
                  </button>
                ) : null}
                </span>
              </div>
            );
          }

          if (ipadVariant) {
            const ipadStatus = taskRunning
              ? { label: "运行中", tone: "running" }
              : serverConnection?.state === "error"
                ? { label: "重新连接", tone: "error" }
                : connectionIsLive(serverConnection)
                  ? { label: "已连接", tone: "connected" }
                  : unreadResult
                    ? { label: "已完成", tone: "done" }
                    : { label: serverReady ? connectionActionLabel(serverConnection) : "配置", tone: "idle" };

            return (
              <div
                className={`ipad-session-row ${isActive ? "active" : ""} ${taskRunning ? "running" : ""} ${
                  unreadResult ? "has-unread-result" : ""
                } ${draggingId === server.id ? "is-reordering" : ""}`}
                role="button"
                tabIndex={0}
                key={server.id}
                aria-label={`${taskName}，${ipadStatus.label}`}
                onClick={() => onSelectServer?.(server.id)}
                onKeyDown={(event) => selectServerFromCard(event, server.id)}
                {...getReorderProps(server.id)}
              >
                <AgentLogo agentId={server.profile?.agentId || "codex"} compact />
                <span className="ipad-session-copy">
                  <strong>{taskName}</strong>
                  <span>
                    {modeInfo.shortLabel} / {serverPlatformLabel(server.profile)}
                    {sessionIdTail ? ` / #${sessionIdTail}` : ""}
                  </span>
                </span>
                {unreadResult ? <span className="ipad-session-unread" aria-label="有新的执行结果" /> : null}
                <span className="ipad-session-actions">
                  <button
                    type="button"
                    className={`ipad-session-connect ${ipadStatus.tone}`}
                    data-reorder-ignore
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onSelectServer?.(server.id);
                      if (busy || taskRunning) return;
                      if (isActive && connectionIsLive(serverConnection)) {
                        onDisconnectServer?.(server.id);
                      } else if (serverReady) {
                        onTestConnection?.(server.id);
                      } else {
                        onConfigureServer?.(server.id);
                      }
                    }}
                  >
                    {ipadStatus.label}
                  </button>
                  {onConfigureServer ? (
                    <button
                      type="button"
                      className="ipad-session-settings"
                      data-reorder-ignore
                      aria-label={`${taskName}设置`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onConfigureServer(server.id);
                      }}
                    >
                      <DotsThree size={18} weight="bold" aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              </div>
            );
          }

          return (
            <div
              className={`nav-card server-card ${isActive ? "active" : ""} ${taskRunning ? "running" : ""} ${
                unreadResult ? "has-unread-result" : ""
              } ${draggingId === server.id ? "is-reordering" : ""}`}
              role="button"
              tabIndex={0}
              key={server.id}
              aria-label={`${taskName}，${server.profile.host || "未添加"}，${serverPlatformLabel(server.profile)}`}
              onClick={() => onSelectServer?.(server.id)}
              onKeyDown={(event) => selectServerFromCard(event, server.id)}
              {...getReorderProps(server.id)}
            >
              {unreadResult ? (
                <span
                  className="session-unread-dot"
                  aria-label="有新的执行结果"
                  title={server.unreadResult?.title || "有新的执行结果"}
                />
              ) : null}
              <div className="nav-card-main">
                <span className="nav-index">{index + 1}</span>
                <span className="nav-title-stack">
                  <strong className="nav-task-name">{taskName}</strong>
                  <span className="nav-meta-row">
                    <ConnectionModeBadge mode={modeInfo} compact />
                    <span className="nav-meta">{metaText}</span>
                    {sessionIdTail ? <span className="session-id-tail">#{sessionIdTail}</span> : null}
                  </span>
                </span>
              </div>
              <div className="nav-card-footer">
                <span className="nav-card-actions">
                  {onConfigureServer ? (
                    <button
                      type="button"
                      className="task-settings-button"
                      data-reorder-ignore
                      aria-label="会话设置"
                      title="会话设置"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onConfigureServer(server.id);
                      }}
                    >
                      设置
                    </button>
                  ) : null}
                  <button
                    className={`connect-badge ${serverStatus}`}
                    data-reorder-ignore
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onSelectServer?.(server.id);
                      if (busy || (isActive && connection.state === "testing")) return;
                      if (isActive && connectionIsLive(serverConnection)) {
                        onDisconnectServer?.(server.id);
                      } else {
                        onTestConnection?.(server.id);
                      }
                    }}
                  >
                    {serverConnectLabel}
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {macVariant ? (
        <button
          className="sidebar-version-label"
          type="button"
          title={`点击复制 ${runtimeVersionLabel}`}
          aria-label={`复制版本号 ${runtimeVersionLabel}`}
          onClick={copyRuntimeVersion}
        >
          {versionCopied ? "已复制" : runtimeVersionLabel}
        </button>
      ) : null}
    </>
  );
}

export function ConnectionSummary({
  profile,
  connection,
  diagnostics,
  discovery,
  profileReady: ready,
}) {
  const connected = connectionIsLive(connection);
  const scanning = discovery?.state === "scanning";
  const scanDone = discovery?.state === "done";
  const scanError = discovery?.state === "error";
  const directoryCount = discovery?.directories?.length || 0;
  const historyCount = (discovery?.history?.codex || 0) + (discovery?.history?.claude || 0);
  const shouldPickWorkdir = scanDone && directoryCount > 0;
  const selectedWorkdir = String(profile.workdir || "").trim();
  const modeInfo = connectionModeForServer({ profile, connection, diagnostics }, connection);
  const title = !ready
    ? "先添加一台机器"
    : scanning
      ? "正在扫描 AI 工作区"
      : shouldPickWorkdir
        ? "选择一个工作目录"
        : connected
          ? selectedWorkdir
            ? "工作会话已就绪"
            : "选择一个工作目录"
          : "连接后自动扫描";
  const body = !ready
    ? "只需要填写地址、账号和密码，其它细节都放在设置里。"
    : scanning
      ? "正在读取远端已有的 Codex、Claude 会话和项目目录。"
      : shouldPickWorkdir
        ? `找到 ${directoryCount} 个工作目录和 ${historyCount} 条 AI 历史，选择一个就可以开始对话。`
        : scanError
          ? `机器已连上，但扫描没有完成：${discovery.message || "请重新扫描。"}`
          : selectedWorkdir
            ? `当前工作目录是 ${selectedWorkdir}，可以直接发送任务。`
            : "还没有选择工作目录，请从扫描结果里选择，或者在会话设置里手动填写。";

  return (
    <section className={`summary-strip codex-intro setup-flow ${ready ? "" : "setup-required"}`}>
      <div className="summary-main">
        <div className="intro-mark">
          <WorkbenchLogo />
        </div>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      <div className="summary-metrics">
        <SummaryMetric label="服务器" value={profile.host} />
        <SummaryMetric label="状态" value={connection.detail} />
        <SummaryMetric label="通道" value={modeInfo.label} />
        <SummaryMetric label="性能" value={formatHostPerformanceSummary(diagnostics, true)} />
        <SummaryMetric label="目录" value={selectedWorkdir ? workdirDisplayName(selectedWorkdir) : "未选择"} />
      </div>
    </section>
  );
}

export function DiscoveryPanel({ discovery, profile, servers = [], busy, onRescan, onAddWorkdir }) {
  if (!discovery || discovery.state === "idle") return null;

  const currentWorkdir = String(profile.workdir || "");
  const knownWorkdirs = new Set(
    servers
      .filter((server) => server.profile?.host === profile.host && server.profile?.username === profile.username)
      .map((server) => String(server.profile?.workdir || "")),
  );
  const directories = Array.isArray(discovery.directories) ? discovery.directories.slice(0, 12) : [];
  const tools = Array.isArray(discovery.tools)
    ? discovery.tools.filter((tool) => ["codex", "claude", "gemini", "aider", "ollama"].includes(tool.id))
    : [];
  const activeCount = discovery.activeSessions?.length || 0;
  const historyCount = (discovery.history?.codex || 0) + (discovery.history?.claude || 0);
  const toolNames = tools.map((tool) => tool.name || tool.id).slice(0, 4).join("、");

  return (
    <section className={`discovery-panel ${discovery.state}`}>
      <header>
        <div>
          <strong>{discovery.state === "scanning" ? "正在扫描" : "选择工作目录"}</strong>
          <span>
            {discovery.state === "scanning"
              ? "正在读取已有 AI 会话和项目目录"
              : `${directories.length} 个目录 · ${historyCount} 条历史${activeCount ? ` · ${activeCount} 个运行会话` : ""}${
                  toolNames ? ` · ${toolNames}` : ""
                }`}
          </span>
        </div>
        <button type="button" className="ghost-button" onClick={onRescan} disabled={busy}>
          刷新
        </button>
      </header>

      {discovery.state === "error" ? <p className="discovery-error">{discovery.message || "扫描失败。"}</p> : null}

      {discovery.state === "scanning" ? (
        <div className="scan-skeleton">
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {discovery.state === "done" && directories.length ? (
        <div className="workdir-list">
          {directories.map((item) => {
            const selected = item.path === currentWorkdir;
            const known = knownWorkdirs.has(item.path);
            const codexCount = item.history?.codex || 0;
            const claudeCount = item.history?.claude || 0;
            const meta = [
              ...displayMarkers(item.markers),
              codexCount ? `Codex ${codexCount}` : "",
              claudeCount ? `Claude ${claudeCount}` : "",
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <article className={`workdir-card ${selected ? "selected" : ""}`} key={item.path}>
                <div>
                  <strong>{item.name || workdirDisplayName(item.path)}</strong>
                  <span className="mono">{item.path}</span>
                  <small>{meta || "普通目录"}</small>
                </div>
                <button
                  type="button"
                  className={selected || known ? "ghost-button" : "send-button"}
                  onClick={() => onAddWorkdir(item.path)}
                  disabled={busy}
                >
                  {selected ? "开始" : known ? "打开" : "使用"}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
      {discovery.state === "done" && !directories.length ? (
        <p className="discovery-empty">没有自动找到工作目录，可以在设置里手动填写路径。</p>
      ) : null}
    </section>
  );
}
