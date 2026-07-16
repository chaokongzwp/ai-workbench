import { useEffect, useMemo, useRef, useState } from "react";
import { File as FileIcon, Paperclip, X } from "@phosphor-icons/react";
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
  DownloadIcon,
  FileAttachmentIcon,
  IconSvg,
  ImagePlusIcon,
  MicIcon,
  SectionHeader,
  StopIcon,
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
  setComposer,
  onOpenSettings,
  onAttachFiles,
  onAttachImages,
  onPasteClipboard,
  onRemoveImageAttachment,
  onOpenDownloadFile,
  onSend,
  onVoice,
  onWake,
  onReleaseRunningTask,
  onCancelRunningTask,
  compact = false,
}) {
  const fileInputRef = useRef(null);
  const disabled = busy || pendingAction || !ready;
  const hasPayload = Boolean(composer.trim() || imageAttachments.length);
  const stopMode = Boolean(runningTask);
  const stopDisabled = operationBusy || !ready;
  const sendDisabled = disabled || !hasPayload;
  const voiceActive = voiceState === "listening" || voiceState === "stopping";
  const downloadDisabled = !ready;
  const voiceDisabled = !voiceInputEnabled || !ready || (operationBusy && !voiceActive);
  const voiceLabel = voiceState === "listening" ? "停止" : voiceState === "stopping" ? "停止中" : "语音";
  const wakeActive =
    wakeState === "listening" ||
    wakeState === "detected" ||
    wakeState === "dictating" ||
    wakeState === "speaking" ||
    wakeState === "stopping";
  const wakeDisabled = !voiceInputEnabled || !ready || (operationBusy && !wakeActive);
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
  const wakePhraseLabel = (wakePhrases || defaultWakeWordPhrases).slice(0, 2).join(" / ");
  const runningTaskText = runningTask ? "当前任务正在同步等待最终结果。" : "";
  const composerStatusText =
    runningTaskText ||
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

  return (
    <footer className={`composer ${compact ? "compact" : ""} ${ready ? "ready" : "not-ready"}`}>
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
          value={composer}
          disabled={!ready}
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
            if (!disabled && hasPayload) onSend();
          }}
          placeholder={
            pendingAction
              ? "先完成上面的操作"
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
          {runningTask ? (
            <button
              type="button"
              className="composer-release-button"
              onClick={onReleaseRunningTask}
              disabled={operationBusy}
              title="确认任务卡住时释放输入框"
            >
              释放输入
            </button>
          ) : null}
          <div className="input-actions">
            {ready ? (
              <>
                <button
                  type="button"
                  className="download-button composer-icon-button"
                  onClick={onOpenDownloadFile}
                  disabled={downloadDisabled}
                  aria-label="下载远程文件"
                  title="下载远程文件"
                >
                  <DownloadIcon />
                </button>
                <button
                  type="button"
                  className="image-button composer-icon-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  aria-label="添加文件"
                  title="添加文件"
                >
                  <Paperclip size={18} weight="regular" aria-hidden="true" />
                </button>
                {voiceInputEnabled ? (
                  <>
                    <button
                      type="button"
                      className={`voice-button composer-icon-button ${voiceActive ? "listening" : ""}`}
                      onClick={onVoice}
                      disabled={voiceDisabled}
                      aria-label={voiceActive ? "停止语音输入" : "语音输入"}
                      title={voiceLabel}
                    >
                      <MicIcon />
                    </button>
                    <button
                      type="button"
                      className={`wake-button composer-icon-button ${wakeActive ? "listening" : ""}`}
                      onClick={onWake}
                      disabled={wakeDisabled}
                      aria-label={wakeActive ? "关闭唤醒词监听" : "开启唤醒词监听"}
                      title={wakeLabel}
                    >
                      <BoltIcon />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className={`send-button composer-icon-button send-icon-button ${stopMode ? "stop-icon-button" : ""}`}
                  onClick={() => {
                    if (stopMode) onCancelRunningTask?.();
                    else onSend();
                  }}
                  disabled={stopMode ? stopDisabled : sendDisabled}
                  aria-label={stopMode ? "停止当前任务" : busy ? "等待回复" : "发送"}
                  title={stopMode ? "停止当前任务" : busy ? "等待回复" : "发送"}
                >
                  {stopMode ? <StopIcon /> : <ArrowUpIcon />}
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
