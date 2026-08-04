import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, ArrowLeft, DownloadSimple, Eye, File as FileIcon, FolderSimple } from "@phosphor-icons/react";
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

export function fileDataUrl(file) {
  if (!file?.base64) return "";
  return `data:${file.mime || previewMimeFromExtension(file.extension)};base64,${file.base64}`;
}

export function decodeBase64Utf8(base64) {
  if (!base64 || typeof window === "undefined" || !window.atob) return "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function parseCsvPreview(text, maxRows = 80, maxColumns = 14) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row.slice(0, maxColumns));
      row = [];
      cell = "";
      if (rows.length >= maxRows) break;
    } else {
      cell += char;
    }
  }

  if (rows.length < maxRows && (cell || row.length)) {
    row.push(cell);
    rows.push(row.slice(0, maxColumns));
  }

  return rows;
}

function ambiguousFileChoicesFromError(error, request = {}) {
  const text = String(error || "");
  if (!/找到多个同名文件/.test(text)) return [];
  const seen = new Set();
  const choices = [];
  const pattern = /(?:[A-Za-z]:[\\/][^\s"'<>]+|\/[^\s"'<>]+)/g;
  let match;

  while ((match = pattern.exec(text))) {
    const path = stripFileCandidate(match[0]);
    const extension = remoteFileExtension(path);
    const key = path.toLocaleLowerCase();
    if (!path || seen.has(key) || !previewFileExtensions.includes(extension)) continue;
    seen.add(key);
    const kind = previewKindFromExtension(extension);
    choices.push({
      path,
      name: remoteBasename(path) || request?.name || "文件",
      extension,
      kind,
      label: previewLabelFromKind(kind),
    });
    if (choices.length >= 8) break;
  }

  return choices;
}

export function FilePreviewPanel({ preview, downloadState, onPreviewFile, onDownloadFile, onDeleteFile, onClose }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [externalOpenState, setExternalOpenState] = useState({ state: "idle", message: "" });
  const deleteConfirmationTimerRef = useRef(null);
  const file = preview?.file;
  const dataUrl = useMemo(() => fileDataUrl(file), [file]);
  const textContent = useMemo(() => {
    if (!file || !["csv", "html", "text", "code"].includes(file.kind)) return "";
    return decodeBase64Utf8(file.base64);
  }, [file]);
  const csvRows = useMemo(() => (file?.kind === "csv" ? parseCsvPreview(textContent) : []), [file, textContent]);
  const title = file?.name || preview?.request?.name || "文件预览";
  const path = file?.path || preview?.request?.path || "";
  const kind = file?.kind || preview?.request?.kind || "file";
  const meta = [previewLabelFromKind(kind), formatFileSize(file?.size)].filter(Boolean).join(" · ");
  const downloading = downloadState?.state === "loading" && downloadState.path === path;
  const deleting = downloadState?.state === "loading" && downloadState?.action === "delete" && downloadState.path === path;
  const downloadMessage = downloadState?.path === path ? downloadState.message : "";
  const ambiguousChoices = useMemo(
    () => ambiguousFileChoicesFromError(preview?.error, preview?.request),
    [preview?.error, preview?.request],
  );

  useEffect(() => {
    setConfirmingDelete(false);
    setExternalOpenState({ state: "idle", message: "" });
    if (deleteConfirmationTimerRef.current) window.clearTimeout(deleteConfirmationTimerRef.current);
    deleteConfirmationTimerRef.current = null;
  }, [path]);

  useEffect(
    () => () => {
      if (deleteConfirmationTimerRef.current) window.clearTimeout(deleteConfirmationTimerRef.current);
    },
    [],
  );

  function requestFileDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (deleteConfirmationTimerRef.current) window.clearTimeout(deleteConfirmationTimerRef.current);
      deleteConfirmationTimerRef.current = window.setTimeout(() => setConfirmingDelete(false), 5000);
      return;
    }
    if (deleteConfirmationTimerRef.current) window.clearTimeout(deleteConfirmationTimerRef.current);
    deleteConfirmationTimerRef.current = null;
    setConfirmingDelete(false);
    onDeleteFile?.(file);
  }

  async function openInExternalApp() {
    if (!file?.base64) return;
    setExternalOpenState({ state: "loading", message: "正在交给系统打开…" });
    try {
      const bridge = desktopBridge();
      if (bridge?.openExternalFile) {
        await bridge.openExternalFile({
          name: file.name || remoteBasename(path) || "preview.html",
          mime: file.mime || previewMimeFromExtension(file.extension),
          base64: file.base64,
        });
      } else {
        const opened = window.open(dataUrl, "_blank");
        if (!opened) throw new Error("系统阻止了新窗口，请允许 App 打开外部页面。");
        opened.opener = null;
      }
      setExternalOpenState({ state: "done", message: "已交给系统打开。" });
    } catch (error) {
      setExternalOpenState({ state: "error", message: `打开失败：${shortError(error)}` });
    }
  }

  return (
    <div className="file-preview-layer" role="dialog" aria-modal="true">
      <button className="file-preview-backdrop" type="button" aria-label="关闭文件预览" onClick={onClose} />
      <section className="file-preview-panel">
        <header>
          <div>
            <strong>{title}</strong>
            <span>{path}</span>
          </div>
          <button type="button" className="settings-close-button" onClick={onClose} aria-label="关闭文件预览">
            ×
          </button>
        </header>

        {preview.state === "loading" ? (
          <div className="file-preview-state">
            <strong>正在读取文件</strong>
            <span>从远端工作目录拉取内容。</span>
          </div>
        ) : null}

        {preview.state === "error" ? (
          <div className="file-preview-state error">
            <strong>无法预览</strong>
            <span>{preview.error}</span>
            {ambiguousChoices.length ? (
              <div className="file-preview-choice-list" aria-label="选择完整文件路径">
                <small>找到多个同名文件，请选择要打开的完整路径：</small>
                {ambiguousChoices.map((choice) => (
                  <button key={choice.path} type="button" onClick={() => onPreviewFile?.(choice)}>
                    <strong>{choice.name}</strong>
                    <span>{choice.path}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {preview.state === "done" && file ? (
          <>
            <div className="file-preview-toolbar">
              <span>{meta}</span>
              <div>
                <button type="button" className="ghost-button" onClick={() => copyPlainText(path)} disabled={!path}>
                  复制路径
                </button>
                <button type="button" className="ghost-button" onClick={() => onDownloadFile?.(file, file)} disabled={downloading}>
                  {downloading ? "下载中" : "下载"}
                </button>
                <button
                  type="button"
                  className={`ghost-button file-preview-delete-button ${confirmingDelete ? "is-confirming" : ""}`}
                  onClick={requestFileDelete}
                  disabled={downloading || deleting}
                >
                  {deleting ? "删除中" : confirmingDelete ? "确认删除" : "删除"}
                </button>
                <button
                  type="button"
                  className="send-button"
                  onClick={openInExternalApp}
                  disabled={!file?.base64 || externalOpenState.state === "loading"}
                >
                  {externalOpenState.state === "loading" ? "打开中" : "浏览器打开"}
                </button>
              </div>
            </div>
            {downloadMessage ? <p className={`file-download-status ${downloadState?.state || ""}`}>{downloadMessage}</p> : null}
            {externalOpenState.message ? (
              <p className={`file-download-status ${externalOpenState.state}`}>{externalOpenState.message}</p>
            ) : null}
            <FilePreviewContent file={file} dataUrl={dataUrl} textContent={textContent} csvRows={csvRows} />
          </>
        ) : null}
      </section>
    </div>
  );
}

export function RemoteDownloadDialog({ open, profile, downloadState, onDownloadFile, onOpenRemoteDirectory, onClose }) {
  const [remotePath, setRemotePath] = useState("");
  const [submittedPath, setSubmittedPath] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;
    setRemotePath("");
    setSubmittedPath("");
    setLocalError("");
  }, [open]);

  if (!open) return null;

  const workdir = String(profile?.workdir || "").trim();
  const downloading = downloadState?.state === "loading" && (!submittedPath || downloadState.path === submittedPath);
  const visibleDownloadState =
    downloadState?.message && (!submittedPath || downloadState.path === submittedPath) ? downloadState : null;
  const limitText = formatFileSize(maxDownloadFileBytes);

  async function handleSubmit(event) {
    event?.preventDefault?.();
    const path = String(remotePath || "").trim();
    if (!path) {
      setLocalError("请输入要下载的远程文件路径。");
      return;
    }

    setSubmittedPath(path);
    setLocalError("");
    await onDownloadFile?.({
      path,
      name: remoteBasename(path),
      label: "远程文件",
      kind: previewKindFromExtension(remoteFileExtension(path)),
    });
  }

  return (
    <div className="remote-download-layer" role="dialog" aria-modal="true" aria-label="下载远程文件">
      <button className="file-preview-backdrop" type="button" aria-label="关闭下载窗口" onClick={onClose} />
      <form className="remote-download-panel" onSubmit={handleSubmit}>
        <header>
          <div>
            <strong>下载远程文件</strong>
            <span>从当前会话连接的机器保存到本地</span>
          </div>
          <button type="button" className="settings-close-button" onClick={onClose} aria-label="关闭下载窗口">
            ×
          </button>
        </header>

        <label className="remote-download-field">
          <span>文件路径</span>
          <input
            value={remotePath}
            onChange={(event) => {
              setRemotePath(event.target.value);
              if (localError) setLocalError("");
            }}
            autoFocus
            placeholder={workdir ? `${workdir}/output.zip` : "/opt/project/output.zip"}
          />
        </label>

        <p className="remote-download-help">
          输入服务器上的完整文件路径。当前单文件最大支持 {limitText}，目录请先让 AI 在远端打包成 zip/tar 后再下载。
        </p>

        {workdir ? <p className="remote-download-workdir">当前工作目录：{workdir}</p> : null}
        {localError ? <p className="file-download-status error">{localError}</p> : null}
        {visibleDownloadState ? <p className={`file-download-status ${downloadState?.state || ""}`}>{visibleDownloadState.message}</p> : null}

        <div className="remote-download-actions">
          <button
            type="button"
            className="ghost-button remote-download-browse-button"
            onClick={() => {
              onClose?.();
              onOpenRemoteDirectory?.();
            }}
          >
            浏览远程文件
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="send-button" disabled={downloading || !remotePath.trim()}>
            {downloading ? "下载中" : "下载"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function RemoteDirectoryDialog({
  open,
  profile,
  directory,
  onOpenDirectory,
  onPreviewFile,
  onDownloadFile,
  onClose,
}) {
  if (!open) return null;

  const rootPath = String(profile?.workdir || "").trim();
  const currentPath = String(directory?.path || rootPath).trim();
  const entries = Array.isArray(directory?.entries) ? directory.entries : [];
  const loading = directory?.state === "loading";
  const error = directory?.state === "error" ? String(directory.error || "读取文件夹失败。") : "";
  const isRoot = isWindowsProfile(profile)
    ? currentPath.toLocaleLowerCase() === rootPath.toLocaleLowerCase()
    : currentPath === rootPath;
  const parentPath = isWindowsProfile(profile) ? dirnameWindows(currentPath) : dirnameRemote(currentPath);
  const handlePreviewFile = (file) => {
    onClose?.();
    onPreviewFile?.(file);
  };

  return (
    <div className="remote-directory-layer" role="dialog" aria-modal="true" aria-label="远程文件">
      <button className="file-preview-backdrop" type="button" aria-label="关闭远程文件" onClick={onClose} />
      <section className="remote-directory-panel">
        <header>
          <div>
            <strong>远程文件</strong>
            <span>查看当前会话工作目录中的文件和文件夹</span>
          </div>
          <button type="button" className="settings-close-button" onClick={onClose} aria-label="关闭远程文件">
            ×
          </button>
        </header>

        <div className="remote-directory-toolbar">
          <button type="button" className="ghost-button" onClick={() => onOpenDirectory?.(parentPath)} disabled={isRoot || loading}>
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            <span>上一级</span>
          </button>
          <button type="button" className="ghost-button" onClick={() => onOpenDirectory?.(currentPath)} disabled={loading}>
            <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
            <span>刷新</span>
          </button>
        </div>
        <p className="remote-directory-path" title={currentPath}>{currentPath || "未设置工作目录"}</p>

        {loading ? (
          <div className="file-preview-state">
            <strong>正在读取文件夹</strong>
            <span>正在从远程机器获取目录列表。</span>
          </div>
        ) : null}
        {error ? (
          <div className="file-preview-state error">
            <strong>无法读取文件夹</strong>
            <span>{error}</span>
            <button type="button" className="ghost-button" onClick={() => onOpenDirectory?.(currentPath)}>
              重试
            </button>
          </div>
        ) : null}
        {!loading && !error ? (
          <div className="remote-directory-list">
            {entries.length ? (
              entries.map((entry) => {
                const isDirectory = entry.kind === "directory";
                const kind = previewKindFromExtension(remoteFileExtension(entry.name));
                const fileRef = {
                  path: entry.path,
                  name: entry.name,
                  kind,
                  label: previewLabelFromKind(kind),
                };
                return (
                  <article className={`remote-directory-entry ${isDirectory ? "directory" : "file"}`} key={entry.path}>
                    <button
                      type="button"
                      className="remote-directory-entry-main"
                      onClick={() => (isDirectory ? onOpenDirectory?.(entry.path) : handlePreviewFile(fileRef))}
                    >
                      {isDirectory ? <FolderSimple size={23} weight="fill" aria-hidden="true" /> : <FileIcon size={22} weight="regular" aria-hidden="true" />}
                      <span>
                        <strong>{entry.name}</strong>
                        <small>{isDirectory ? "文件夹" : fileRef.label}</small>
                      </span>
                    </button>
                    {!isDirectory ? (
                      <div className="remote-directory-entry-actions">
                        <button type="button" onClick={() => handlePreviewFile(fileRef)} aria-label={`查看 ${entry.name}`} title="查看">
                          <Eye size={17} weight="regular" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => onDownloadFile?.(fileRef)} aria-label={`下载 ${entry.name}`} title="下载">
                          <DownloadSimple size={17} weight="regular" aria-hidden="true" />
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="remote-directory-empty">这个文件夹是空的。</div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function FilePreviewContent({ file, dataUrl, textContent, csvRows }) {
  if (file.kind === "image") {
    return <img className="file-preview-image" src={dataUrl} alt={file.name || "图片预览"} />;
  }

  if (file.kind === "pdf") {
    return <iframe className="file-preview-frame" title={file.name || "PDF"} src={dataUrl} />;
  }

  if (file.kind === "html") {
    return <iframe className="file-preview-frame" title={file.name || "HTML"} sandbox="" srcDoc={textContent} />;
  }

  if (file.kind === "csv") {
    return (
      <div className="csv-preview">
        <table>
          <tbody>
            {csvRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`cell-${rowIndex}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (file.kind === "code") {
    return <CodeFilePreview text={textContent} />;
  }

  if (file.kind === "word" || file.kind === "excel") {
    return (
      <div className="file-preview-state">
        <strong>{previewLabelFromKind(file.kind)} 文件已读取</strong>
        <span>浏览器不能稳定直接渲染这种文件，可以先下载，或点“浏览器打开”交给系统尝试处理。</span>
      </div>
    );
  }

  if (file.kind === "binary") {
    return (
      <div className="file-preview-state">
        <strong>这个文件不能直接预览</strong>
        <span>文件已确认存在，可以下载后交给系统中的对应应用打开。</span>
      </div>
    );
  }

  return <pre className="text-file-preview">{textContent}</pre>;
}

export function CodeFilePreview({ text }) {
  const lines = String(text || "").split("\n");
  return (
    <div className="code-file-preview">
      <table>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`code-line-${index}`}>
              <td>{index + 1}</td>
              <td>
                <code>{line || " "}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
