import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Circle,
  DownloadSimple,
  Ear,
  File as FileIcon,
  FolderOpen,
  Microphone,
  Paperclip,
  Stop,
  X,
} from "@phosphor-icons/react";
import {
  ArrowUp as LucideArrowUp,
  Circle as LucideCircle,
  Download as LucideDownload,
  Ear as LucideEar,
  Folder as LucideFolder,
  Mic as LucideMic,
  Paperclip as LucidePaperclip,
  Square as LucideSquare,
} from "lucide-react";
import * as Core from "../core/workbenchCore.js";
import * as Primitives from "./primitives.jsx";

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
  composerLockPresentation,
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
  filesFromClipboardEvent,
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
  ConnectionModeBadge,
  DiagnosticRow,
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

function numericCssPixel(value) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function useAutoGrowingTextarea(value, fallbackMaxHeight = 180) {
  const ref = useRef(null);
  const resize = useCallback(() => {
    const textarea = ref.current;
    if (!textarea) return;
    const style = window.getComputedStyle(textarea);
    const minHeight = numericCssPixel(style.minHeight);
    const maxHeight = numericCssPixel(style.maxHeight) || fallbackMaxHeight;
    textarea.style.height = "auto";
    const nextHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight + 1 ? "auto" : "hidden";
  }, [fallbackMaxHeight]);

  useLayoutEffect(() => {
    resize();
  }, [resize, value]);

  useEffect(() => {
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [resize]);

  return ref;
}

export function Composer({
  activeAgent,
  composer,
  imageAttachments = [],
  busy,
  operationBusy = false,
  pendingAction,
  profileReady: ready,
  connectionMode,
  mainAIRouterReady: routerReady,
  mainAIEnabled,
  mainAIModel,
  voiceInputEnabled = false,
  voiceState,
  voiceError,
  voiceLevel = 0,
  wakeState,
  wakeError,
  wakePhrases,
  runningTask,
  sendConnecting = false,
  setComposer,
  onOpenSettings,
  onAttachFiles,
  onAttachImages,
  onPasteClipboard,
  onRemoveImageAttachment,
  onOpenDownloadFile,
  onOpenRemoteDirectory,
  onSend,
  onVoice,
  onWake,
  onOpenVoiceSettings,
  onCancelRunningTask,
  compact = false,
  compactPlaceholder = "",
  showSetupAction = true,
  showVoiceControlsWhenDisabled = false,
  utilityControls = false,
  iconStyle = "default",
}) {
  const fileInputRef = useRef(null);
  const textareaRef = useAutoGrowingTextarea(composer, compact ? 120 : 180);
  const taskLocked = Boolean(runningTask);
  const inputLock = composerLockPresentation({
    busy,
    pendingAction,
    profileReady: ready,
    runningTask,
  });
  const disabled = inputLock.locked;
  const hasPayload = Boolean(composer.trim() || imageAttachments.length);
  const stopMode = taskLocked;
  const stopDisabled = !ready;
  const sendDisabled = sendConnecting || inputLock.sendBlocked || !hasPayload;
  const showVoiceControls = voiceInputEnabled || showVoiceControlsWhenDisabled;
  const voiceActive = voiceState === "listening" || voiceState === "stopping";
  const downloadDisabled = !ready;
  const voiceDisabled = !ready || taskLocked || (operationBusy && !voiceActive);
  const voiceLabel = voiceState === "listening" ? "停止" : voiceState === "stopping" ? "停止中" : "语音";
  const wakeActive =
    wakeState === "listening" ||
    wakeState === "detected" ||
    wakeState === "dictating" ||
    wakeState === "speaking" ||
    wakeState === "stopping";
  const wakeDisabled = !ready || taskLocked || (operationBusy && !wakeActive);
  const wakeLabel =
    wakeState === "stopping"
      ? "关闭中"
      : wakeState === "detected"
        ? "已唤醒"
        : wakeState === "speaking"
          ? "播放中"
        : wakeState === "dictating"
          ? "听写中"
          : wakeState === "listening"
            ? "唤醒中"
            : "唤醒";
  const wakeButtonLabel = wakeState === "stopping" ? "关闭中" : wakeActive ? "监听中" : "唤醒";
  const wakePhraseLabel = (wakePhrases || defaultWakeWordPhrases).slice(0, 2).join(" / ");
  const macIcons = iconStyle === "mac";
  const toolIconSize = 18;
  const toolIconWeight = macIcons ? "bold" : "regular";
  const composerStatusText =
    (!inputLock.locked && inputLock.sendBlocked ? inputLock.text : "") ||
    (!voiceInputEnabled
      ? ""
      : wakeState === "listening"
      ? `正在等待唤醒词：${wakePhraseLabel}`
      : wakeState === "detected" || wakeState === "dictating"
        ? "已唤醒，正在整理语音"
        : wakeState === "speaking"
          ? "正在播放回复"
          : voiceActive
            ? "正在听..."
            : "");

  function handleVoiceClick() {
    if (!voiceInputEnabled) {
      onOpenVoiceSettings?.();
      return;
    }
    onVoice?.();
  }

  function handleWakeClick() {
    if (!voiceInputEnabled) {
      onOpenVoiceSettings?.();
      return;
    }
    onWake?.();
  }

  return (
    <footer
      className={`composer ${utilityControls ? "workbench-composer-surface" : ""} ${compact ? "compact" : ""} ${
        ready ? "ready" : "not-ready"
      }`}
    >
      <input
        ref={fileInputRef}
        className="composer-file-input"
        type="file"
        multiple
        onChange={(event) => {
          (onAttachFiles || onAttachImages)?.(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <div className="composer-topline" aria-hidden="true">
        <span className="composer-label">输入任务</span>
        <span className="composer-hint">Enter 发送 · Shift + Enter 换行</span>
      </div>
      <div className="composer-editor">
        <div className="input-row">
        {imageAttachments.length ? (
          <div className="composer-attachments" aria-label="待上传文件">
            {imageAttachments.map((item) => (
              <figure className="composer-attachment" key={item.id}>
                {item.isImage && item.previewUrl ? (
                  <img src={item.previewUrl} alt="" />
                ) : (
                  <span className="composer-attachment-file" aria-hidden="true">
                    <FileIcon size={24} weight="regular" />
                  </span>
                )}
                <figcaption>{item.name}</figcaption>
                <button type="button" onClick={() => onRemoveImageAttachment?.(item.id)} aria-label={`移除 ${item.name}`}>
                  <X size={12} weight="bold" aria-hidden="true" />
                </button>
              </figure>
            ))}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={composer}
          disabled={disabled}
          title={inputLock.text || undefined}
          onChange={(event) => setComposer(event.target.value)}
          onPaste={(event) => {
            const files = filesFromClipboardEvent(event);
            if (files.length) {
              event.preventDefault();
              (onAttachFiles || onAttachImages)?.(files);
              return;
            }
            const types = Array.from(event.clipboardData?.types || []);
            const plainText = event.clipboardData?.getData("text/plain") || "";
            if (onPasteClipboard && (types.includes("Files") || types.includes("text/uri-list") || !plainText)) {
              event.preventDefault();
              void onPasteClipboard();
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent?.isComposing) return;

            if (event.shiftKey) return;

            event.preventDefault();
            if (!sendDisabled) onSend();
          }}
          placeholder={
            inputLock.locked
              ? inputLock.text
              : compact
              ? compactPlaceholder
              : voiceState === "listening"
                  ? "正在听..."
                  : ready
                  ? `告诉 ${activeAgent.shortName} 你想做什么`
                  : "先添加服务器后再发送任务"
          }
          rows={compact ? 1 : 2}
        />
        <div className="composer-bottom-row">
          <p className="voice-hint inline">{composerStatusText}</p>
          <div className="input-actions">
            {ready || !showSetupAction ? (
              <>
                {showVoiceControls ? (
                  <button
                    type="button"
                    className={`wake-button composer-icon-button ${utilityControls ? "utility-icon-button" : ""} ${
                      wakeActive ? "listening" : ""
                    } ${!voiceInputEnabled ? "muted" : ""}`}
                    onClick={handleWakeClick}
                    disabled={wakeDisabled}
                    aria-label={
                      !voiceInputEnabled ? "打开语音与播放设置" : wakeActive ? "关闭唤醒词监听" : "开启唤醒词监听"
                    }
                    title={!voiceInputEnabled ? "开启语音能力" : wakeLabel}
                  >
                    {macIcons ? (
                      <LucideEar
                        className="wake-ear-icon"
                        size={toolIconSize}
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    ) : (
                      <Ear
                        className="wake-ear-icon"
                        size={toolIconSize}
                        weight={toolIconWeight}
                        aria-hidden="true"
                      />
                    )}
                    {wakeActive ? (
                      macIcons ? (
                        <LucideCircle className="wake-status-dot" fill="currentColor" aria-hidden="true" />
                      ) : (
                        <Circle className="wake-status-dot" weight="fill" aria-hidden="true" />
                      )
                    ) : null}
                    <span className="wake-button-label">{wakeButtonLabel}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`download-button composer-icon-button ${utilityControls ? "utility-icon-button" : ""}`}
                  onClick={onOpenDownloadFile}
                  disabled={downloadDisabled}
                  aria-label="下载远程文件"
                  title="下载远程文件"
                >
                  {macIcons ? (
                    <LucideDownload size={toolIconSize} strokeWidth={1.9} aria-hidden="true" />
                  ) : (
                    <DownloadSimple size={toolIconSize} weight={toolIconWeight} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className={`directory-button composer-icon-button ${utilityControls ? "utility-icon-button" : ""}`}
                  onClick={onOpenRemoteDirectory}
                  disabled={downloadDisabled}
                  aria-label="查看远程文件夹"
                  title="查看远程文件夹"
                >
                  {macIcons ? (
                    <LucideFolder size={toolIconSize} strokeWidth={1.9} aria-hidden="true" />
                  ) : (
                    <FolderOpen size={toolIconSize} weight="regular" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className={`image-button composer-icon-button ${utilityControls ? "utility-icon-button" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  aria-label="添加文件"
                  title="添加文件"
                >
                  {macIcons ? (
                    <LucidePaperclip size={toolIconSize} strokeWidth={1.9} aria-hidden="true" />
                  ) : (
                    <Paperclip size={toolIconSize} weight={toolIconWeight} aria-hidden="true" />
                  )}
                </button>
                {showVoiceControls ? (
                  <button
                    type="button"
                    className={`voice-button composer-icon-button ${utilityControls ? "utility-icon-button" : ""} ${
                      voiceActive ? "listening" : ""
                    } ${!voiceInputEnabled ? "muted" : ""}`}
                    onClick={handleVoiceClick}
                    disabled={voiceDisabled}
                    aria-label={
                      !voiceInputEnabled ? "语音未开启，打开语音设置" : voiceActive ? "停止语音输入" : "语音输入"
                    }
                    title={!voiceInputEnabled ? "开启语音能力" : voiceLabel}
                  >
                    {macIcons ? (
                      <LucideMic size={toolIconSize} strokeWidth={1.9} aria-hidden="true" />
                    ) : (
                      <Microphone size={toolIconSize} weight={toolIconWeight} aria-hidden="true" />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`send-button composer-icon-button send-icon-button ${
                    stopMode ? "stop-icon-button" : sendConnecting ? "is-sending" : ""
                  }`}
                  onClick={() => {
                    if (stopMode) onCancelRunningTask?.();
                    else onSend();
                  }}
                  disabled={stopMode ? stopDisabled : sendDisabled}
                  aria-label={
                    stopMode ? "停止当前任务" : sendConnecting ? "正在发送" : inputLock.sendBlocked ? inputLock.text : "发送"
                  }
                  title={
                    stopMode ? "停止当前任务" : sendConnecting ? "正在发送" : inputLock.sendBlocked ? inputLock.text : "发送"
                  }
                >
                  {stopMode ? (
                    macIcons ? (
                      <LucideSquare size={13} strokeWidth={2.4} aria-hidden="true" />
                    ) : (
                      <Stop size={18} weight="fill" aria-hidden="true" />
                    )
                  ) : sendConnecting ? (
                    <span className="send-progress-spinner" aria-hidden="true" />
                  ) : macIcons ? (
                    <LucideArrowUp size={toolIconSize} strokeWidth={2.1} aria-hidden="true" />
                  ) : (
                    <ArrowUp size={toolIconSize} weight="bold" aria-hidden="true" />
                  )}
                </button>
              </>
            ) : (
              <button type="button" className="send-button composer-add-button" onClick={onOpenSettings}>
                添加服务器
              </button>
            )}
          </div>
        </div>
        </div>
        </div>
      {voiceInputEnabled && voiceActive ? (
        <div className="voice-level" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, voiceLevel))})` }} />
        </div>
      ) : null}
      {voiceInputEnabled && wakeError ? <p className="voice-hint error">{wakeError}</p> : null}
      {voiceInputEnabled && voiceError ? <p className="voice-hint error">{voiceError}</p> : null}
    </footer>
  );
}
