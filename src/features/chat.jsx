import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  Copy as CopyIcon,
  DownloadSimple,
  Eye,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import {
  Copy as LucideCopy,
  Download as LucideDownload,
  Eye as LucideEye,
  FileText as LucideFileText,
  Pencil as LucidePencil,
  RefreshCw as LucideRefreshCw,
  Trash2 as LucideTrash,
} from "lucide-react";
import * as Core from "../core/workbenchCore.js";
import * as Primitives from "./primitives.jsx";
import * as FilePreview from "./filePreview.jsx";

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
  taskStateFailed,
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
  CodeFilePreview,
  ConnectionModeBadge,
  DiagnosticRow,
  FileAttachmentIcon,
  FilePreviewContent,
  FilePreviewPanel,
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
  decodeBase64Utf8,
  fileDataUrl,
  formatFileSize,
  parseCsvPreview,
  readFileAsText,
  statusLabel,
  useRunningElapsed
} = { ...Primitives, ...FilePreview };

export function messageDisplayText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim() === "[object Object]" ? "已发送任务" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(messageDisplayText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    for (const key of ["text", "body", "output", "content", "message", "task", "reply"]) {
      if (value[key] !== undefined) {
        const text = messageDisplayText(value[key]);
        if (text) return text;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "";
    }
  }
  return String(value || "");
}

export function RunningTaskHint({ message, agent, operationBusy, onRefreshOutput, onInterruptAgent }) {
  const elapsedMs = useRunningElapsed(message);
  if (!taskStateIsActive(taskStateForMessage(message)) || elapsedMs < 120_000) return null;

  const longRunning = elapsedMs >= 300_000;
  const isClaude = agent.id === "claude";
  const isAgentTask = message.backend === "agent";
  const title = longRunning ? "这个任务执行得有点久" : "任务正在执行";
  const detail = isAgentTask
    ? "可以检查一下最新状态；如果确认不想继续，就取消任务。"
    : isClaude
    ? "Claude 长任务可能暂时没有中间输出，可以继续等，或停止当前任务。"
    : "远端可能还在运行，也可能在等待交互。可以刷新状态或中断任务。";

  return (
    <div className={`running-task-hint ${longRunning ? "long" : ""}`}>
      <div>
        <strong>{title}</strong>
        <span>
          已运行 {formatDuration(elapsedMs)}。{detail}
        </span>
      </div>
      <div className="running-task-actions">
        {isAgentTask || !isClaude ? (
          <button type="button" onClick={() => onRefreshOutput?.(message)} disabled={operationBusy}>
            刷新状态
          </button>
        ) : null}
        {isAgentTask || !isClaude ? (
          <button type="button" onClick={onInterruptAgent} disabled={operationBusy}>
            {isAgentTask ? "取消任务" : "中断"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AgentLiveOutput({ text }) {
  const visibleText = String(text || "").trim();
  if (!visibleText) return null;

  return (
    <section className="agent-live-output" aria-label="实时输出">
      <header>
        <strong>实时输出</strong>
        <span>运行中</span>
      </header>
      <pre>{visibleText}</pre>
    </section>
  );
}

function friendlyProgressFromText(text, agent) {
  const value = String(text || "").trim();
  if (!value) return null;

  const normalized = value
    .replace(/[`*_#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const agentName = agent?.shortName || agent?.name || "AI";

  if (
    /the test suite is running/i.test(normalized) ||
    (/maven quiet mode buffers output/i.test(normalized) && /monitor to report completion/i.test(normalized))
  ) {
    return {
      title: "测试正在运行",
      body: "远端测试已经开始执行。Maven 安静模式会暂时缓存日志，所以中间看起来没有刷新；等测试完成后会同步最终结果。",
      meta: `${agentName} · 等待测试完成`,
    };
  }

  if (/quiet mode buffers output|monitor to report completion/i.test(normalized)) {
    return {
      title: "任务正在等待结果",
      body: "远端命令还在执行，当前阶段没有持续输出日志。可以先等待，任务结束后会展示最终结果。",
      meta: `${agentName} · 暂无中间输出`,
    };
  }

  return null;
}

function FriendlyProgressCard({ progress, message, operationBusy, onRefreshOutput }) {
  if (!progress) return null;
  const canRefresh = typeof onRefreshOutput === "function";

  return (
    <section className="friendly-progress-card" aria-label={progress.title}>
      <strong>{progress.title}</strong>
      {progress.meta ? <span>{progress.meta}</span> : null}
      {canRefresh ? (
        <button
          type="button"
          onClick={() => onRefreshOutput(message)}
          disabled={operationBusy}
          aria-label="刷新状态"
          title="刷新状态"
        >
          <ArrowClockwise size={15} weight="bold" aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

function waitingLikeMessage(message) {
  const title = String(message?.title || "");
  const body = String(message?.body || "");
  return /等待|还没有拿到|后台运行|运行中/.test(`${title}\n${body}`);
}

function messageNeedsResultSync(message) {
  if (message?.backend !== "agent" || !message?.remoteTaskId || String(message?.output || "").trim()) return false;
  if (message?.resultMissing === true) return true;
  return /没有最终内容|没有拿到.+最终回复|结果待同步|结果同步/.test(
    `${String(message?.title || "")}\n${String(message?.body || "")}`,
  );
}

function messageTimestamp(message) {
  const completedAt = Number(message?.completedAt || 0);
  const createdAtMs = Number(message?.createdAtMs || 0);
  const timestamp =
    message?.role === "assistant" && !taskStateIsActive(taskStateForMessage(message))
      ? completedAt || createdAtMs
      : createdAtMs;
  if (!timestamp) {
    return { label: String(message?.createdAt || "").trim(), dateTime: "" };
  }
  const date = new Date(timestamp);
  return {
    label: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    dateTime: date.toISOString(),
  };
}

function compactAgentMessageTitle(message, agent) {
  const title = String(message?.title || agent?.name || "").trim();
  const waitingMatch = title.match(/^等待\s+(.+?)\s+回复$/);
  if (waitingMatch) return waitingMatch[1];
  const replyMatch = title.match(/^(.+?)\s+回复$/);
  if (replyMatch) return replyMatch[1];
  return title;
}

function agentDeliveryStatus(message, liveOutputText = "") {
  if (message?.backend !== "agent") return "";
  const state = taskStateForMessage(message);
  return taskStateIsActive(state) ? statusLabel(state) : "";
}

function CopyButton({
  text,
  label,
  copiedLabel = "已复制",
  failedLabel = "复制失败",
  className = "",
  icon = true,
  iconStyle = "default",
  children,
}) {
  const [copyState, setCopyState] = useState("idle");
  const disabled = !String(text || "").trim();
  const visibleLabel = copyState === "copied" ? copiedLabel : copyState === "failed" ? failedLabel : label;

  useEffect(() => {
    setCopyState("idle");
  }, [text]);

  async function handleCopy(event) {
    event?.stopPropagation?.();
    if (disabled) return;
    const ok = await copyPlainText(text);
    setCopyState(ok ? "copied" : "failed");
  }

  return (
    <button
      type="button"
      className={`${className} copy-state-${copyState}`.trim()}
      onClick={handleCopy}
      disabled={disabled}
      aria-label={visibleLabel}
      title={visibleLabel}
      data-copy-label={visibleLabel}
      aria-live="polite"
    >
      {children || (
        <>
          {icon ? (
            iconStyle === "mac" ? (
              <LucideCopy size={16} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <CopyIcon size={15} weight="light" aria-hidden="true" />
            )
          ) : null}
          <span className="copy-message-label">{visibleLabel}</span>
        </>
      )}
    </button>
  );
}

export function AgentFailureCard({ message, failure, operationBusy, onRetry, onShowDetails, onOpenSettings }) {
  if (!failure) return null;
  const canRetry = Boolean(failure.canRetry && message?.promptText);
  const hasDetail = Boolean(failure.detail || message?.technicalDetail);

  return (
    <section className="agent-failure-card" aria-label="执行异常">
      <div className="agent-failure-copy">
        <p>{failure.body || "这条任务没有返回可直接展示的结果。"}</p>
      </div>
      <div className="agent-failure-actions">
        {canRetry ? (
          <button type="button" className="primary" onClick={() => onRetry?.(message)} disabled={operationBusy}>
            重新发送
          </button>
        ) : null}
        {hasDetail ? (
          <button type="button" onClick={() => onShowDetails?.(message, failure)} disabled={operationBusy}>
            查看详情
          </button>
        ) : null}
        {failure.canOpenSettings ? (
          <button type="button" onClick={onOpenSettings} disabled={operationBusy}>
            设置
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function MessageBubble({
  message,
  activeAgent,
  profile,
  busy,
  operationBusy,
  onModelChoice,
  onCodexLogin,
  onPreviewFile,
  onDownloadFile,
  onDeleteFile,
  downloadingFilePath,
  deletingFilePath,
  deletedRemoteFilePaths,
  fileDownload,
  onRefreshOutput,
  onInterruptAgent,
  onMarkStuck,
  onRetryMessage,
  onShowDetails,
  onOpenSettings,
  onEditUserMessage,
  iconStyle = "default",
}) {
  const agent = agents.find((item) => item.id === message.agentId) ?? activeAgent;
  const taskState = taskStateForMessage(message);
  const taskRunning = taskStateIsActive(taskState);
  const bodyText = messageDisplayText(message.body);
  const outputText = messageDisplayText(message.output);
  const liveOutputText = messageDisplayText(message.liveOutput);
  const legacyFailureSource = `${bodyText}\n${outputText}\n${messageDisplayText(message.technicalDetail)}`;
  const legacyAgentFailure =
    !message.agentFailure &&
    taskState === taskStateFailed &&
    /__AIWB_AGENT_|runner process is not alive|runner pid:/i.test(legacyFailureSource)
      ? classifyAgentFailure(legacyFailureSource, agent)
      : null;
  const storedAgentFailure =
    message.agentFailure && typeof message.agentFailure === "object"
      ? {
          ...message.agentFailure,
          detail: cleanAgentFailureDetail(message.agentFailure.detail || message.technicalDetail || ""),
        }
      : message.agentFailure;
  const agentFailure = storedAgentFailure || legacyAgentFailure;
  const rawCopyText = agentFailure ? formatAgentFailureCopy(message, agentFailure) : outputText || liveOutputText || bodyText || "";
  const legacyMissingResult =
    !outputText.trim() &&
    !liveOutputText.trim() &&
    /没有最终答案标记|远端任务已完成，但 App 暂时没有同步到最终回复|已结束，但没有最终内容/.test(
      `${String(message.title || "")}\n${bodyText}`,
    );
  const hasActualResult = Boolean(outputText.trim() || liveOutputText.trim());
  const legacyPlaceholderBodyWithResult =
    hasActualResult &&
    /没有最终答案标记|远端任务已完成，但 App 暂时没有同步到最终回复|已结束，但没有最终内容/.test(bodyText);
  const assistantBodyText = legacyMissingResult
    ? "任务已经结束，但没有收到可展示的结果。可以重新同步，或重新发送。"
    : legacyPlaceholderBodyWithResult
      ? ""
      : bodyText;
  const fileReferences = useMemo(() => {
    const explicit = Array.isArray(message.attachments)
      ? message.attachments
          .filter((item) => item?.path)
          .map((item) => {
            const extension = remoteFileExtension(item.path || item.name);
            const kind = previewKindFromExtension(extension);
            return {
              ...item,
              name: item.name || remoteBasename(item.path),
              extension,
              kind,
              label: previewLabelFromKind(kind),
            };
          })
      : [];
    const extracted = extractRemoteFileReferences(outputText, profile);
    const seen = new Set();
    return [...explicit, ...extracted].filter((item) => {
      const key = String(item.path || "").toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [message.attachments, outputText, profile]);
  const displayOutputText = useMemo(() => {
    if (!fileReferences.length) return outputText;
    const filePaths = new Set(fileReferences.map((file) => String(file.path || "").trim()).filter(Boolean));
    const withoutStandalonePaths = String(outputText || "")
      .split("\n")
      .filter((line) => {
        const candidate = line
          .trim()
          .replace(/^[-*+]\s+/, "")
          .replace(/^`|`$/g, "")
          .trim();
        return !filePaths.has(candidate);
      })
      .join("\n");

    return withoutStandalonePaths
      .replace(/(^|\n)#{1,6}\s*(?:相关文件|文件列表|生成文件)\s*\n(?=\s*(?:\n|$))/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }, [fileReferences, outputText]);
  const friendlyProgress = useMemo(
    () => friendlyProgressFromText(displayOutputText || (taskRunning ? liveOutputText : ""), agent),
    [displayOutputText, liveOutputText, taskRunning, agent],
  );
  const copyText = friendlyProgress ? `${friendlyProgress.title}\n${friendlyProgress.body}` : rawCopyText;
  const needsResultSync = messageNeedsResultSync(message);
  const taskId = String(message.remoteTaskId || "").trim();
  const taskStatusUnconfirmed =
    message.backend === "agent" &&
    taskState === taskStateFailed &&
    !taskId &&
    waitingLikeMessage(message);
  const hasVisibleAssistantContent = Boolean(
    agentFailure ||
      bodyText ||
      displayOutputText ||
      liveOutputText ||
      message.modelChoice ||
      message.loginAction ||
      fileReferences.length ||
      taskRunning ||
      needsResultSync,
  );
  const statusForHeader = taskStatusUnconfirmed || legacyMissingResult ? taskStateFailed : taskState;
  const deliveryStatus = agentDeliveryStatus(message, liveOutputText);
  const statusText = needsResultSync ? "待同步" : deliveryStatus || statusLabel(statusForHeader);
  const compactTitle = compactAgentMessageTitle(message, agent);
  const headerTitle = hasActualResult && /没有最终答案标记|没有最终内容|没有返回结果/.test(compactTitle)
    ? `${agent.shortName} 回复`
    : taskRunning && !agentFailure
      ? agent.shortName
    : taskStatusUnconfirmed
      ? "状态待确认"
      : legacyMissingResult
        ? "没有最终结果"
        : agentFailure
          ? agent.shortName
          : compactTitle;
  const timestamp = messageTimestamp(message);
  const canRefreshRemoteTask = Boolean(
    message.backend === "agent" &&
      String(message.remoteTaskId || "").trim() &&
      typeof onRefreshOutput === "function" &&
      (taskRunning || taskState === taskStateFailed || needsResultSync),
  );

  if (message.role === "user") {
    return (
      <article className={`user-prompt ${fileReferences.length ? "has-files" : ""}`}>
        <div className="user-message-card">
          <p>{bodyText}</p>
          {fileReferences.length ? (
            <FileReferenceList
              files={fileReferences}
              downloadingFilePath={downloadingFilePath}
              deletingFilePath={deletingFilePath}
              deletedFilePaths={deletedRemoteFilePaths}
              downloadState={fileDownload}
              onPreviewFile={onPreviewFile}
              onDownloadFile={onDownloadFile}
              onDeleteFile={onDeleteFile}
              iconStyle={iconStyle}
            />
          ) : null}
        </div>
        <div className="user-message-meta" aria-label="消息操作">
          {timestamp.label ? (
            <time className="user-message-time" dateTime={timestamp.dateTime} title="发送时间">
              {timestamp.label}
            </time>
          ) : null}
          <CopyButton text={copyText} label="复制" className="copy-message copy-user-message" iconStyle={iconStyle} />
          {typeof onEditUserMessage === "function" && bodyText ? (
            <button
              type="button"
              className="edit-user-message"
              onClick={() => onEditUserMessage(bodyText)}
              aria-label="编辑这条消息"
              title="编辑这条消息"
            >
              {iconStyle === "mac" ? (
                <LucidePencil size={16} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <PencilSimple size={18} weight="regular" aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  if (!hasVisibleAssistantContent) return null;

  return (
    <article className={`agent-response ${legacyMissingResult ? "failed" : taskState}`}>
      <header className="message-header">
        <AgentLogo agentId={agent.id} compact />
        <strong>{headerTitle}</strong>
        {timestamp.label ? (
          <time className="message-time" dateTime={timestamp.dateTime} title={taskRunning ? "发送时间" : "回复时间"}>
            {timestamp.label}
          </time>
        ) : null}
        <span className={`streaming ${statusForHeader}`}>{statusText}</span>
        {!taskStatusUnconfirmed && !legacyMissingResult ? <TaskTimer message={message} /> : null}
        <div className="message-header-actions">
          {canRefreshRemoteTask ? (
            <button
              type="button"
              className="refresh-message"
              onClick={() => onRefreshOutput(message)}
              disabled={operationBusy}
              aria-label="刷新状态"
              title="刷新状态"
            >
              {iconStyle === "mac" ? (
                <LucideRefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <ArrowClockwise size={15} weight="regular" aria-hidden="true" />
              )}
            </button>
          ) : null}
          <CopyButton
            text={copyText}
            label="复制回复"
            className="copy-message copy-assistant-message"
            iconStyle={iconStyle}
          />
        </div>
      </header>
      {agentFailure ? (
        <AgentFailureCard
          message={message}
          failure={agentFailure}
          operationBusy={operationBusy}
          onRetry={onRetryMessage}
          onShowDetails={onShowDetails}
          onOpenSettings={onOpenSettings}
        />
      ) : assistantBodyText || taskStatusUnconfirmed ? (
        <p className="assistant-copy">
          {taskStatusUnconfirmed
            ? "App 没有拿到这条任务的远端编号，暂时无法确认是否已经提交。请重新发送。"
            : assistantBodyText}
        </p>
      ) : null}
      {message.modelChoice ? (
        <div className="model-choice-actions" aria-label="选择 Codex 模型">
          <button type="button" onClick={() => onModelChoice(message, "new")} disabled={busy}>
            试用 GPT-5.5
          </button>
          <button type="button" onClick={() => onModelChoice(message, "existing")} disabled={busy}>
            继续当前模型
          </button>
        </div>
      ) : null}
      {message.loginAction ? (
        <div className="model-choice-actions" aria-label="Codex 登录">
          <button type="button" onClick={() => onCodexLogin(message)} disabled={busy}>
            生成设备码
          </button>
        </div>
      ) : null}
      {friendlyProgress ? (
        <FriendlyProgressCard
          progress={friendlyProgress}
          message={message}
          operationBusy={operationBusy}
          onRefreshOutput={onRefreshOutput}
        />
      ) : displayOutputText ? (
        <section className="assistant-answer">
          <RichMessage text={displayOutputText} />
        </section>
      ) : null}
      {taskRunning && liveOutputText && !friendlyProgress ? <AgentLiveOutput text={liveOutputText} /> : null}
      {fileReferences.length ? (
        <FileReferenceList
          files={fileReferences}
          downloadingFilePath={downloadingFilePath}
          deletingFilePath={deletingFilePath}
          deletedFilePaths={deletedRemoteFilePaths}
          downloadState={fileDownload}
          onPreviewFile={onPreviewFile}
          onDownloadFile={onDownloadFile}
          onDeleteFile={onDeleteFile}
          iconStyle={iconStyle}
        />
      ) : null}
    </article>
  );
}

export function FileReferenceList({
  files,
  downloadingFilePath,
  deletingFilePath,
  deletedFilePaths,
  downloadState,
  onPreviewFile,
  onDownloadFile,
  onDeleteFile,
  iconStyle = "default",
}) {
  const [confirmingDeletePath, setConfirmingDeletePath] = useState("");
  const deleteConfirmationTimerRef = useRef(null);
  const visibleDownloadState =
    downloadState?.message && files.some((file) => file.path === downloadState.path) ? downloadState : null;

  useEffect(
    () => () => {
      if (deleteConfirmationTimerRef.current) window.clearTimeout(deleteConfirmationTimerRef.current);
    },
    [],
  );

  function requestFileDelete(file) {
    const path = String(file?.path || "");
    if (!path) return;
    if (confirmingDeletePath !== path) {
      setConfirmingDeletePath(path);
      if (deleteConfirmationTimerRef.current) window.clearTimeout(deleteConfirmationTimerRef.current);
      deleteConfirmationTimerRef.current = window.setTimeout(() => setConfirmingDeletePath(""), 5000);
      return;
    }
    if (deleteConfirmationTimerRef.current) window.clearTimeout(deleteConfirmationTimerRef.current);
    deleteConfirmationTimerRef.current = null;
    setConfirmingDeletePath("");
    onDeleteFile?.(file);
  }

  return (
    <>
      <div className="file-reference-list" aria-label="可查看文件">
        {files.map((file) => {
          const downloading = downloadingFilePath === file.path;
          const deleting = deletingFilePath === file.path;
          const deleted = deletedFilePaths?.has?.(file.path);
          const confirmingDelete = confirmingDeletePath === file.path;
          return (
            <div key={file.path} className={`file-reference ${file.kind} ${deleted ? "deleted" : ""}`}>
              <div className="file-reference-main">
                <span className="file-reference-icon">
                  {iconStyle === "mac" ? (
                    <LucideFileText size={18} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <FileAttachmentIcon />
                  )}
                </span>
                <span className="file-reference-copy">
                  <strong>{file.name}</strong>
                  <small>
                    {deleted ? "已删除" : file.label}
                    {file.path ? ` · ${file.path}` : ""}
                  </small>
                </span>
              </div>
              <div className="file-reference-actions">
                <button type="button" onClick={() => onPreviewFile?.(file)} disabled={deleted || deleting} title="查看文件">
                  {iconStyle === "mac" ? (
                    <LucideEye size={16} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <Eye size={15} weight="regular" aria-hidden="true" />
                  )}
                  <span>查看</span>
                </button>
                <button type="button" onClick={() => onDownloadFile?.(file)} disabled={deleted || downloading || deleting} title="下载文件">
                  {iconStyle === "mac" ? (
                    <LucideDownload size={16} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <DownloadSimple size={15} weight="regular" aria-hidden="true" />
                  )}
                  <span>{downloading ? "下载中" : "下载"}</span>
                </button>
                <button
                  type="button"
                  className={`file-delete-button ${confirmingDelete ? "is-confirming" : ""}`}
                  onClick={() => requestFileDelete(file)}
                  disabled={deleted || deleting || downloading}
                  title={deleted ? "文件已删除" : confirmingDelete ? "再次点击确认删除" : "删除远程文件"}
                >
                  {iconStyle === "mac" ? (
                    <LucideTrash size={16} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <Trash size={15} weight="regular" aria-hidden="true" />
                  )}
                  <span>{deleted ? "已删除" : deleting ? "删除中" : confirmingDelete ? "确认删除" : "删除"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {visibleDownloadState ? (
        <p className={`file-download-status ${visibleDownloadState.state || ""}`}>{visibleDownloadState.message}</p>
      ) : null}
    </>
  );
}

export function RichMessage({ text }) {
  const blocks = useMemo(() => parseRichMessage(text), [text]);

  if (!blocks.length) return null;

  return (
    <div className="rich-message">
      {blocks.map((block, index) => {
        if (block.type === "hr") {
          return <hr key={`hr-${index}`} />;
        }

        if (block.type === "heading") {
          const HeadingTag = `h${block.level}`;
          return <HeadingTag key={`heading-${index}`}>{renderInlineMessage(block.text, `heading-${index}`)}</HeadingTag>;
        }

        if (block.type === "quote") {
          return <blockquote key={`quote-${index}`}>{renderInlineMessage(block.text, `quote-${index}`)}</blockquote>;
        }

        if (block.type === "code") {
          if (isMermaidBlock(block)) {
            return <MermaidDiagram key={`mermaid-${index}`} source={block.text} />;
          }

          return (
            <pre key={`code-${index}`}>
              <code>{block.text}</code>
            </pre>
          );
        }

        if (block.type === "table") {
          return <MarkdownTable key={`table-${index}`} table={block} blockIndex={index} />;
        }

        if (block.type === "ul" || block.type === "ol") {
          const ListTag = block.type;
          const listProps = block.type === "ol" && block.start ? { start: block.start } : {};
          return (
            <ListTag key={`list-${index}`} {...listProps}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>{renderInlineMessage(item, `item-${index}-${itemIndex}`)}</li>
              ))}
            </ListTag>
          );
        }

        return <p key={`paragraph-${index}`}>{renderInlineMessage(block.text, `paragraph-${index}`)}</p>;
      })}
    </div>
  );
}

function parseMarkdownListItem(line) {
  const unordered = String(line || "").match(/^\s*[-*•]\s+(.+)$/);
  if (unordered) {
    return { type: "ul", text: unordered[1].trim() };
  }

  const ordered = String(line || "").match(/^\s*(\d+)[.)]\s+(.+)$/);
  if (ordered) {
    return {
      type: "ol",
      start: Math.max(1, Number.parseInt(ordered[1], 10) || 1),
      text: ordered[2].trim(),
    };
  }

  return null;
}

export function parseRichMessage(value) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;
  let codeLanguage = "";

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push(list);
    list = null;
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    const fence = trimmed.match(/^```([\w-]*)?.*$/);
    if (fence) {
      if (code) {
        blocks.push({ type: "code", language: codeLanguage, text: code.join("\n") });
        code = null;
        codeLanguage = "";
      } else {
        flushParagraph();
        flushList();
        code = [];
        codeLanguage = (fence[1] || "").trim().toLowerCase();
      }
      continue;
    }

    if (code) {
      code.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      if (list) {
        let nextIndex = lineIndex + 1;
        while (nextIndex < lines.length && !String(lines[nextIndex] || "").trim()) {
          nextIndex += 1;
        }
        const nextListItem = parseMarkdownListItem(lines[nextIndex]);
        if (!nextListItem || nextListItem.type !== list.type) {
          flushList();
        }
      }
      continue;
    }

    if (mermaidDiagramStartPattern.test(trimmed)) {
      flushParagraph();
      flushList();
      const diagram = [line];
      let nextIndex = lineIndex + 1;
      while (nextIndex < lines.length && String(lines[nextIndex] || "").trim()) {
        diagram.push(lines[nextIndex]);
        nextIndex += 1;
      }
      blocks.push({ type: "code", language: "mermaid", text: diagram.join("\n") });
      lineIndex = nextIndex - 1;
      continue;
    }

    if (isMarkdownTableStart(lines, lineIndex)) {
      flushParagraph();
      flushList();
      const table = parseMarkdownTable(lines, lineIndex);
      blocks.push(table.block);
      lineIndex = table.nextIndex - 1;
      continue;
    }

    if (/^([-*_])\1\1+$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "hr" });
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: Math.min(4, heading[1].length), text: heading[2].trim() });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: quote[1].trim() });
      continue;
    }

    const listItem = parseMarkdownListItem(line);
    if (listItem) {
      const { type } = listItem;
      flushParagraph();
      if (!list || list.type !== type) flushList();
      if (!list) {
        list = {
          type,
          items: [],
          ...(type === "ol" ? { start: listItem.start } : {}),
        };
      }
      list.items.push(listItem.text);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  if (code) blocks.push({ type: "code", language: codeLanguage, text: code.join("\n") });
  flushParagraph();
  flushList();

  return blocks;
}

export function splitMarkdownTableRow(line) {
  let source = String(line || "").trim();
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|")) source = source.slice(0, -1);

  const cells = [];
  let current = "";
  let escaped = false;
  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function isMarkdownTableSeparator(line) {
  const cells = splitMarkdownTableRow(line);
  if (cells.length < 2) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

export function nextNonEmptyLineIndex(lines, startIndex) {
  let index = startIndex;
  while (index < lines.length && !String(lines[index] || "").trim()) index += 1;
  return index;
}

export function isMarkdownTableStart(lines, index) {
  const current = String(lines[index] || "");
  const separatorIndex = nextNonEmptyLineIndex(lines, index + 1);
  const separator = String(lines[separatorIndex] || "");
  if (!current.includes("|") || !separator.includes("|")) return false;
  return splitMarkdownTableRow(current).length >= 2 && isMarkdownTableSeparator(separator);
}

export function tableAlignments(separatorLine, count) {
  const cells = splitMarkdownTableRow(separatorLine);
  return Array.from({ length: count }, (_, index) => {
    const cell = String(cells[index] || "").replace(/\s+/g, "");
    if (cell.startsWith(":") && cell.endsWith(":")) return "center";
    if (cell.endsWith(":")) return "right";
    return "left";
  });
}

export function normalizeTableRow(cells, count) {
  const normalized = Array.from({ length: count }, (_, index) => cells[index] || "");
  return normalized;
}

export function parseMarkdownTable(lines, startIndex) {
  const headers = splitMarkdownTableRow(lines[startIndex]);
  const separatorIndex = nextNonEmptyLineIndex(lines, startIndex + 1);
  const align = tableAlignments(lines[separatorIndex], headers.length);
  const rows = [];
  let index = separatorIndex + 1;

  while (index < lines.length) {
    const line = String(lines[index] || "");
    if (!line.trim()) {
      const nextIndex = nextNonEmptyLineIndex(lines, index + 1);
      const nextLine = String(lines[nextIndex] || "");
      if (nextIndex < lines.length && nextLine.includes("|") && !isMarkdownTableSeparator(nextLine)) {
        index = nextIndex;
        continue;
      }
      break;
    }
    if (!line.includes("|") || isMarkdownTableSeparator(line)) break;
    rows.push(normalizeTableRow(splitMarkdownTableRow(line), headers.length));
    index += 1;
  }

  return {
    block: {
      type: "table",
      headers: normalizeTableRow(headers, headers.length),
      align,
      rows,
    },
    nextIndex: index,
  };
}

export function MarkdownTable({ table, blockIndex }) {
  return (
    <div className="rich-table-wrap">
      <table>
        <thead>
          <tr>
            {table.headers.map((header, columnIndex) => (
              <th key={`table-${blockIndex}-head-${columnIndex}`} style={{ textAlign: table.align[columnIndex] }}>
                {renderInlineMessage(header, `table-${blockIndex}-head-${columnIndex}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`table-${blockIndex}-row-${rowIndex}`}>
              {row.map((cell, columnIndex) => (
                <td key={`table-${blockIndex}-cell-${rowIndex}-${columnIndex}`} style={{ textAlign: table.align[columnIndex] }}>
                  {renderInlineMessage(cell, `table-${blockIndex}-cell-${rowIndex}-${columnIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const mermaidDiagramStartPattern =
  /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|c4Context)\b/i;

export let mermaidLoaderPromise;

export function isMermaidBlock(block) {
  const language = String(block.language || "").toLowerCase();
  const source = String(block.text || "").trim();
  return language === "mermaid" || mermaidDiagramStartPattern.test(source);
}

export function loadMermaidRenderer() {
  if (typeof window === "undefined") return Promise.reject(new Error("当前环境不能渲染图表。"));
  if (window.mermaid) return Promise.resolve(window.mermaid);
  if (mermaidLoaderPromise) return mermaidLoaderPromise;

  mermaidLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js";
    script.async = true;
    script.onload = () => {
      if (window.mermaid) resolve(window.mermaid);
      else reject(new Error("Mermaid 渲染器加载失败。"));
    };
    script.onerror = () => reject(new Error("Mermaid 渲染器加载失败。"));
    document.head.appendChild(script);
  });

  return mermaidLoaderPromise;
}

function mermaidThemeConfig(isDark) {
  const shared = {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif',
    flowchart: {
      htmlLabels: true,
      useMaxWidth: false,
    },
    sequence: {
      actorMargin: 58,
      boxMargin: 10,
      boxTextMargin: 8,
      messageMargin: 36,
      mirrorActors: true,
      noteMargin: 12,
      useMaxWidth: false,
    },
    gantt: {
      useMaxWidth: false,
    },
    journey: {
      useMaxWidth: false,
    },
    timeline: {
      useMaxWidth: false,
    },
  };

  if (!isDark) {
    return {
      ...shared,
      theme: "base",
      themeVariables: {
        background: "transparent",
        primaryColor: "#f8fafc",
        primaryTextColor: "#17202b",
        primaryBorderColor: "#bcc7d6",
        lineColor: "#4f86c6",
        textColor: "#17202b",
        secondaryColor: "#eef6ff",
        tertiaryColor: "#f4f4f5",
        actorBkg: "#f8fafc",
        actorBorder: "#4f86c6",
        actorTextColor: "#17202b",
        actorLineColor: "#75aee8",
        signalColor: "#4f86c6",
        signalTextColor: "#253041",
        labelBoxBkgColor: "#eef2f7",
        labelBoxBorderColor: "#c8d1de",
        labelTextColor: "#253041",
        loopTextColor: "#253041",
        noteBkgColor: "#fff8d9",
        noteBorderColor: "#e3c86b",
        noteTextColor: "#253041",
        activationBkgColor: "#eaf3ff",
        activationBorderColor: "#4f86c6",
        sequenceNumberColor: "#17202b",
      },
    };
  }

  return {
    ...shared,
    theme: "base",
    themeCSS: `
      text,
      tspan,
      .messageText,
      .loopText,
      .noteText,
      .labelText {
        fill: #eef3fb !important;
        color: #eef3fb !important;
        stroke: none !important;
      }
      .actor {
        fill: #171c25 !important;
        stroke: #72b7ff !important;
      }
      .actor-man line,
      .actor-line {
        stroke: #72b7ff !important;
      }
      .messageLine0,
      .messageLine1,
      .flowchart-link {
        stroke: #72b7ff !important;
      }
      .labelBox,
      .loopLine,
      .note {
        fill: #222936 !important;
        stroke: #536173 !important;
      }
      .sequenceNumber {
        fill: #eef3fb !important;
      }
    `,
    themeVariables: {
      background: "transparent",
      primaryColor: "#171c25",
      primaryTextColor: "#f4f7fb",
      primaryBorderColor: "#536173",
      lineColor: "#72b7ff",
      textColor: "#eef3fb",
      secondaryColor: "#1d2430",
      tertiaryColor: "#222936",
      mainBkg: "#11141b",
      actorBkg: "#171c25",
      actorBorder: "#72b7ff",
      actorTextColor: "#f4f7fb",
      actorLineColor: "#72b7ff",
      signalColor: "#72b7ff",
      signalTextColor: "#eef3fb",
      labelBoxBkgColor: "#222936",
      labelBoxBorderColor: "#536173",
      labelTextColor: "#eef3fb",
      loopTextColor: "#eef3fb",
      noteBkgColor: "#222936",
      noteBorderColor: "#536173",
      noteTextColor: "#eef3fb",
      activationBkgColor: "#293447",
      activationBorderColor: "#72b7ff",
      sequenceNumberColor: "#eef3fb",
      sectionBkgColor: "#171c25",
      altBackground: "#171c25",
      taskBkgColor: "#1d2430",
      taskTextColor: "#eef3fb",
      taskTextLightColor: "#cfd7e6",
      taskTextOutsideColor: "#eef3fb",
      taskTextClickableColor: "#ffffff",
      activeTaskBkgColor: "#293447",
      gridColor: "#343d4d",
    },
  };
}

function normalizeMermaidSvg(svg) {
  return String(svg || "")
    .replace(/<svg\b(?![^>]*\bclass=)/, '<svg class="rich-mermaid-svg"')
    .replace(/<svg\b([^>]*?)class="([^"]*)"/, '<svg$1class="$2 rich-mermaid-svg"')
    .replace(/\sstyle="max-width:\s*[^"]*"/i, "");
}

export function MermaidDiagram({ source }) {
  const [renderState, setRenderState] = useState({ status: "loading", svg: "", error: "" });

  useEffect(() => {
    let cancelled = false;
    const diagramId = `aiwb-mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const shell = document.querySelector(".app-shell, .native-app-shell");
    const isDark = shell?.dataset?.theme === "dark";

    setRenderState({ status: "loading", svg: "", error: "" });
    loadMermaidRenderer()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          ...mermaidThemeConfig(isDark),
        });
        const result = await mermaid.render(diagramId, source);
        if (!cancelled) setRenderState({ status: "done", svg: normalizeMermaidSvg(result.svg), error: "" });
      })
      .catch((error) => {
        if (!cancelled) setRenderState({ status: "error", svg: "", error: shortError(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [source]);

  if (renderState.status === "done" && renderState.svg) {
    return (
      <div className="rich-diagram" role="img" aria-label="图表">
        <div dangerouslySetInnerHTML={{ __html: renderState.svg }} />
      </div>
    );
  }

  if (renderState.status === "loading") {
    return (
      <div className="rich-diagram pending">
        <span>正在渲染图表...</span>
      </div>
    );
  }

  return (
    <div className="rich-diagram error">
      <strong>图表渲染失败</strong>
      <span>{renderState.error}</span>
      <pre>
        <code>{source}</code>
      </pre>
    </div>
  );
}

export function safeMessageHref(value) {
  const href = String(value || "")
    .trim()
    .replace(/[.,，。;；!?！？)\]}]+$/g, "");
  if (/^(https?:|mailto:)/i.test(href)) return href;
  return "";
}

export function renderInlineMessage(text, keyPrefix) {
  const source = String(text || "");
  const nodes = [];
  const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^) \n]+\)|https?:\/\/[^\s<>()\]]+)/g;
  let lastIndex = 0;
  let matchIndex = 0;
  let match;

  while ((match = tokenPattern.exec(source))) {
    if (match.index > lastIndex) {
      nodes.push(source.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={`${keyPrefix}-code-${matchIndex}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-strong-${matchIndex}`}>{token.slice(2, -2)}</strong>);
    } else if (/^https?:\/\//i.test(token)) {
      const href = safeMessageHref(token);
      const suffix = token.slice(href.length);
      nodes.push(
        href ? (
          <a key={`${keyPrefix}-url-${matchIndex}`} href={href} target="_blank" rel="noreferrer">
            {href}
          </a>
        ) : (
          token
        ),
      );
      if (suffix) nodes.push(suffix);
    } else {
      const link = token.match(/^\[([^\]\n]+)\]\(([^) \n]+)\)$/);
      const href = safeMessageHref(link?.[2]);
      nodes.push(
        href ? (
          <a key={`${keyPrefix}-link-${matchIndex}`} href={href} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        ) : (
          token
        ),
      );
    }

    lastIndex = match.index + token.length;
    matchIndex += 1;
  }

  if (lastIndex < source.length) nodes.push(source.slice(lastIndex));
  return nodes;
}
