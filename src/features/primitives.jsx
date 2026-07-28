import { useEffect, useMemo, useRef, useState } from "react";
import { CloudArrowDown, Plus } from "@phosphor-icons/react";
import * as Core from "../core/workbenchCore.js";

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
  taskStateForMessage,
  taskStateIsActive,
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

export function TaskNotice({ notice, onOpen, onClose }) {
  return (
    <div className={`task-notice ${notice.tone || "done"}`} role="status">
      <button type="button" className="task-notice-main" onClick={onOpen}>
        <StatusDot status={notice.tone === "error" ? "error" : "connected"} />
        <strong>{notice.title}</strong>
      </button>
      <button type="button" className="task-notice-close" aria-label="关闭提示" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

export function EmptyWorkspaceActions({ busy = false, onAddServer, onSyncCloud }) {
  return (
    <div className="empty-workspace-actions">
      <strong>开始使用 AI Workbench</strong>
      <span>添加新的工作会话，或从云端同步已有配置。</span>
      <div className="empty-workspace-buttons">
        <button type="button" className="empty-workspace-primary" onClick={onAddServer} disabled={busy}>
          <Plus size={17} weight="bold" aria-hidden="true" />
          <span>添加会话</span>
        </button>
        <button type="button" className="empty-workspace-secondary" onClick={onSyncCloud} disabled={busy}>
          <CloudArrowDown size={17} weight="bold" aria-hidden="true" />
          <span>同步云端会话</span>
        </button>
      </div>
    </div>
  );
}

export function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function SummaryMetric({ label, value, mono = false }) {
  return (
    <div className="summary-metric">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
    </div>
  );
}

export async function copyPlainText(value) {
  const text = String(value ?? "");
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy selection path.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    return true;
  } catch {
    return false;
  }
}

export function readFileAsText(file) {
  if (!file) return Promise.reject(new Error("没有选择配置文件。"));
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("配置文件读取失败。"));
    reader.readAsText(file, "utf-8");
  });
}

export function TaskTimer({ message }) {
  const running = taskStateIsActive(taskStateForMessage(message));
  const [now, setNow] = useState(Date.now());
  const startedAt = Number(message.startedAt || message.createdAtMs || 0);
  const durationMs =
    Number(message.durationMs || 0) ||
    (startedAt ? Math.max(0, (running ? now : Number(message.completedAt || now)) - startedAt) : 0);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  if (!durationMs && !running) return null;

  return <span className={`task-timer ${running ? "running" : ""}`}>{formatDuration(durationMs)}</span>;
}

export function useRunningElapsed(message) {
  const running = taskStateIsActive(taskStateForMessage(message));
  const [now, setNow] = useState(Date.now());
  const startedAt = Number(message?.startedAt || message?.createdAtMs || 0);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  return startedAt ? Math.max(0, now - startedAt) : 0;
}

export function statusLabel(status) {
  if (status === "submitting") return "正在发送";
  if (status === "accepted") return "Agent 已接收";
  if (status === "running") return "AI 执行中";
  if (status === "syncing") return "同步中";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  return "完成";
}

export function DiagnosticRow({ label, value }) {
  return (
    <div className="diagnostic-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function SectionHeader({ title }) {
  return (
    <div className="section-header">
      <span>{title}</span>
    </div>
  );
}

export function IconSvg({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function MicIcon() {
  return (
    <IconSvg>
      <path d="M12 3.8a3.2 3.2 0 0 0-3.2 3.2v5a3.2 3.2 0 0 0 6.4 0V7A3.2 3.2 0 0 0 12 3.8Z" />
      <path d="M5.7 10.8v1.1a6.3 6.3 0 0 0 12.6 0v-1.1" />
      <path d="M12 18.2v2.2" />
      <path d="M8.7 20.4h6.6" />
    </IconSvg>
  );
}

export function BoltIcon() {
  return (
    <IconSvg>
      <path d="M13.2 2.8 5.6 13.2h5.4l-1 8 8.4-11.5h-5.6l.4-6.9Z" />
    </IconSvg>
  );
}

export function ArrowUpIcon() {
  return (
    <IconSvg>
      <path d="M12 19V5" />
      <path d="m5.7 11.3 6.3-6.3 6.3 6.3" />
    </IconSvg>
  );
}

export function StopIcon() {
  return (
    <IconSvg>
      <rect x="7.2" y="7.2" width="9.6" height="9.6" rx="2.2" />
    </IconSvg>
  );
}

export function ImagePlusIcon() {
  return (
    <IconSvg>
      <rect x="4.2" y="5" width="15.6" height="14" rx="2.4" />
      <path d="M8.3 14.8 10.4 12.6a1 1 0 0 1 1.4 0l1.4 1.4 1.9-2.1a1 1 0 0 1 1.5 0l3.2 3.6" />
      <path d="M8.5 9.2h.01" />
      <path d="M17 4v4" />
      <path d="M15 6h4" />
    </IconSvg>
  );
}

export function DownloadIcon() {
  return (
    <IconSvg>
      <path d="M12 4.2v10.4" />
      <path d="m7.2 10.1 4.8 4.8 4.8-4.8" />
      <path d="M5.2 19.8h13.6" />
    </IconSvg>
  );
}

export function FileAttachmentIcon() {
  return (
    <IconSvg>
      <path d="M8.3 3.7h5.9l3.5 3.5v13.1H8.3a2 2 0 0 1-2-2V5.7a2 2 0 0 1 2-2Z" />
      <path d="M14 3.9v3.5h3.5" />
      <path d="M9.4 12.2h5.2" />
      <path d="M9.4 15.7h5.2" />
    </IconSvg>
  );
}

export function AgentLogo({ agentId, compact = false }) {
  const normalized = agentId === "claude" ? "claude" : "codex";
  const label = normalized === "claude" ? "Claude" : "Codex";
  return (
    <span className={`agent-logo ${normalized} ${compact ? "compact" : ""}`} aria-label={label}>
      <img src={assetPath(`icons/${normalized}.svg`)} alt="" />
    </span>
  );
}

export function WorkbenchLogo() {
  return (
    <span className="workbench-logo" aria-label="AI Workbench">
      <img src={assetPath("icons/workbench.png")} alt="" />
    </span>
  );
}

export function ConnectionModeBadge({ mode, compact = false }) {
  const info =
    typeof mode === "string"
      ? mode === "agent"
        ? { id: "agent", label: "Agent 代理", shortLabel: "Agent", description: "通过远端 Agent 后台执行" }
        : { id: "ssh", label: "直接 SSH", shortLabel: "SSH", description: "通过 SSH 直连执行" }
      : mode || { id: "ssh", label: "直接 SSH", shortLabel: "SSH", description: "通过 SSH 直连执行" };
  return (
    <span className={`connection-mode-badge ${info.id} ${compact ? "compact" : ""}`} title={info.description}>
      {compact ? info.shortLabel : info.label}
    </span>
  );
}

export function StatusDot({ status = "connected" }) {
  const normalized = status === "testing" || status === "running" ? "testing" : status;
  return <span className={`status-dot ${normalized}`} />;
}
