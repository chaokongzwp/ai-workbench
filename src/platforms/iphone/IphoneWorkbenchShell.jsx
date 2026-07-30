import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowClockwise,
  Circle,
  DotsThree,
  DownloadSimple,
  Ear,
  File as FileIcon,
  FileZip,
  FolderOpen,
  GearSix,
  List,
  MagnifyingGlass,
  Microphone,
  Paperclip,
  Plus,
  Stop,
  TerminalWindow,
  X,
} from "@phosphor-icons/react";
import { AgentLogo, StatusDot } from "../../features/primitives.jsx";
import { NativeSshTerminal } from "../native/NativeSshTerminal.jsx";
import { useProgressiveMessages } from "../useProgressiveMessages.js";
import {
  agentById,
  composerLockPresentation,
  connectionIsLive,
  connectionModeForServer,
  connectionStatusPresentation,
  conversationIdSuffix,
  dataTransferHasFiles,
  defaultWakeWordPhrases,
  filesFromClipboardEvent,
  normalizeProfile,
  serverSessionName,
  serverTaskRunning,
  shortError,
  workdirDisplayName,
} from "../../core/workbenchCore.js";

function numericCssPixel(value) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function useAutoGrowingTextarea(value, fallbackMaxHeight = 136) {
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

function applyIphoneKeyboardViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const layoutHeight = Math.round(window.innerHeight || viewport?.height || 0);
  const visualHeight = Math.round(viewport?.height || layoutHeight);
  const width = Math.round(window.innerWidth || viewport?.width || 0);
  const keyboardFocused = root.classList.contains("aiwb-keyboard-focus");
  const height = keyboardFocused ? Math.min(layoutHeight, visualHeight) : layoutHeight;

  if (height > 0) root.style.setProperty("--app-viewport-height", `${height}px`);
  if (width > 0) root.style.setProperty("--app-viewport-width", `${width}px`);
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
}

function useIphoneKeyboardFocusGuard(textareaRef) {
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const keepComposerVisible = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || document.activeElement !== textarea) return;
    applyIphoneKeyboardViewport();

    const composerWrap = textarea.closest(".iphone-composer-wrap");
    const chatScroll = textarea.closest(".iphone-chat")?.querySelector(".iphone-chat-scroll");
    const viewport = window.visualViewport;
    const viewportBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight || 0);

    if (chatScroll) {
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }

    if (composerWrap) {
      const rect = composerWrap.getBoundingClientRect();
      const overlap = rect.bottom - viewportBottom + 8;
      if (overlap > 0 && chatScroll) chatScroll.scrollTop += overlap;
      composerWrap.scrollIntoView({ block: "end", inline: "nearest", behavior: "auto" });
    }

    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  }, [textareaRef]);

  const scheduleFocusRepair = useCallback(() => {
    clearTimers();
    keepComposerVisible();
    timersRef.current = [60, 140, 260, 420, 620].map((delay) =>
      window.setTimeout(keepComposerVisible, delay),
    );
  }, [clearTimers, keepComposerVisible]);

  useEffect(() => {
    const handleViewportChange = () => {
      if (document.activeElement === textareaRef.current) scheduleFocusRepair();
    };
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    return () => {
      clearTimers();
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
    };
  }, [clearTimers, scheduleFocusRepair, textareaRef]);

  return scheduleFocusRepair;
}

function IphoneComposer({
  activeAgent,
  composer,
  imageAttachments = [],
  busy,
  operationBusy = false,
  pendingAction,
  profileReady,
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
  onOpenVoiceSettings,
  onAttachFiles,
  onAttachImages,
  onPasteClipboard,
  onRemoveImageAttachment,
  onOpenDownloadFile,
  onOpenRemoteDirectory,
  onSend,
  onVoice,
  onWake,
  onCancelRunningTask,
}) {
  const fileInputRef = useRef(null);
  const textareaRef = useAutoGrowingTextarea(composer);
  const repairKeyboardFocus = useIphoneKeyboardFocusGuard(textareaRef);
  const taskLocked = Boolean(runningTask);
  const inputLock = composerLockPresentation({
    busy,
    pendingAction,
    profileReady,
    runningTask,
  });
  const disabled = inputLock.locked;
  const hasPayload = Boolean(composer.trim() || imageAttachments.length);
  const stopMode = taskLocked;
  const stopDisabled = !profileReady;
  const sendDisabled = sendConnecting || inputLock.sendBlocked || !hasPayload;
  const voiceActive = voiceState === "listening" || voiceState === "stopping";
  const wakeActive =
    wakeState === "listening" ||
    wakeState === "detected" ||
    wakeState === "dictating" ||
    wakeState === "speaking" ||
    wakeState === "stopping";
  const wakePhraseLabel = (wakePhrases || defaultWakeWordPhrases).slice(0, 2).join(" / ");
  const voiceDisabled = !profileReady || taskLocked || (operationBusy && !voiceActive);
  const wakeDisabled = !profileReady || taskLocked || (operationBusy && !wakeActive);
  const wakeButtonLabel = wakeState === "stopping" ? "关闭中" : wakeActive ? "监听中" : "唤醒";
  const statusText = !inputLock.locked && inputLock.sendBlocked
    ? inputLock.text
    : !voiceInputEnabled
      ? ""
      : wakeState === "listening"
        ? `等待唤醒词：${wakePhraseLabel}`
        : wakeState === "detected" || wakeState === "dictating"
          ? "正在整理语音"
	            : wakeState === "speaking"
	              ? "正在播放回复"
	              : voiceActive
	                ? "正在听..."
	                : "";

  useEffect(() => {
    return () => {
      if (typeof document === "undefined") return;
      document.documentElement.classList.remove("aiwb-keyboard-focus");
      document.body?.classList.remove("aiwb-keyboard-focus");
    };
  }, []);

  function setKeyboardFocus(focused) {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("aiwb-keyboard-focus", focused);
    document.body?.classList.toggle("aiwb-keyboard-focus", focused);
    applyIphoneKeyboardViewport();
  }

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
    <footer className="iphone-composer-wrap">
      <section className="iphone-composer" aria-label="发送任务">
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

        {imageAttachments.length ? (
          <div className="iphone-attachments" aria-label="待上传文件">
            {imageAttachments.map((item) => (
              <figure className="iphone-attachment" key={item.id}>
                {item.isImage && item.previewUrl ? (
                  <img src={item.previewUrl} alt="" />
                ) : (
                  <span className="iphone-attachment-file" aria-hidden="true">
                    <FileIcon size={22} weight="regular" />
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
          onFocus={() => {
            setKeyboardFocus(true);
            repairKeyboardFocus();
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setKeyboardFocus(false);
              applyIphoneKeyboardViewport();
            }, 120);
          }}
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
            if (!sendDisabled) onSend?.();
          }}
          placeholder={
            inputLock.locked
              ? inputLock.text
              : voiceState === "listening"
                ? "正在听..."
                : profileReady
                  ? `告诉 ${activeAgent.shortName} 你想做什么`
                  : "先添加一个工作会话"
          }
          rows={1}
        />

        <div className="iphone-composer-bottom">
          <div className="iphone-composer-leading">
            {statusText ? <p className="iphone-composer-status">{statusText}</p> : null}
            <div className="iphone-composer-actions">
              {profileReady ? (
                <>
                  <button
                    type="button"
                    className={`iphone-icon-button iphone-wake-button ${wakeActive ? "active" : ""} ${
                      !voiceInputEnabled ? "muted" : ""
                    }`}
                    onClick={handleWakeClick}
                    disabled={wakeDisabled}
                    aria-label={
                      !voiceInputEnabled ? "打开语音与播放设置" : wakeActive ? "关闭唤醒词监听" : "开启唤醒词监听"
                    }
                  >
                    <span className="wake-button-content">
                      <Ear className="wake-ear-icon" size={17} weight="regular" aria-hidden="true" />
                      {wakeActive ? <Circle className="wake-status-dot" weight="fill" aria-hidden="true" /> : null}
                      <span className="wake-button-label">{wakeButtonLabel}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="iphone-icon-button download-button"
                    onClick={onOpenDownloadFile}
                    aria-label="下载远程文件"
                  >
                    <DownloadSimple size={17} weight="regular" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="iphone-icon-button remote-directory-button"
                    onClick={onOpenRemoteDirectory}
                    aria-label="查看远程文件夹"
                    title="查看远程文件夹"
                  >
                    <FolderOpen size={17} weight="regular" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="iphone-icon-button attachment-button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                    aria-label="添加文件"
                    title="添加文件"
                  >
                    <Paperclip size={17} weight="regular" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`iphone-icon-button ${voiceActive ? "active danger" : ""} ${!voiceInputEnabled ? "muted" : ""}`}
                    onClick={handleVoiceClick}
                    disabled={voiceDisabled}
                    aria-label={
                      !voiceInputEnabled ? "语音未开启，打开语音设置" : voiceActive ? "停止语音输入" : "语音输入"
                    }
                  >
                    <Microphone size={17} weight="regular" aria-hidden="true" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {profileReady ? (
            <div className="iphone-composer-actions iphone-composer-primary-action">
              <button
                type="button"
                className={`iphone-send-button ${stopMode ? "stop" : sendConnecting ? "is-sending" : ""}`}
                onClick={() => {
                  if (stopMode) onCancelRunningTask?.();
                  else onSend?.();
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
                  <Stop size={17} weight="fill" aria-hidden="true" />
                ) : sendConnecting ? (
                  <span className="send-progress-spinner" aria-hidden="true" />
                ) : (
                  <ArrowUp size={17} weight="bold" aria-hidden="true" />
                )}
              </button>
            </div>
          ) : null}
        </div>

        {voiceInputEnabled && voiceActive ? (
          <div className="voice-level" aria-hidden="true">
            <span style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, voiceLevel))})` }} />
          </div>
        ) : null}
        {voiceInputEnabled && wakeError ? <p className="iphone-voice-error">{wakeError}</p> : null}
        {voiceInputEnabled && voiceError ? <p className="iphone-voice-error">{voiceError}</p> : null}
      </section>
    </footer>
  );
}

export function IphoneWorkbenchShell({
  components,
  resolvedTheme,
  appearanceMode,
  platform,
  activeSessionName,
  activeConnectionMode,
  servers,
  activeServerId,
  profile,
  terminalProfile,
  connection,
  diagnostics,
  discovery,
  mobileNavOpen,
  setMobileNavOpen,
  busy,
  rawOpen,
  rawOutput,
  activeAgent,
  activeBusy,
  activeTaskRunning,
  activeRunningMessage,
  sendConnecting,
  hasPendingAction,
  isProfileReady,
  mainAIReady,
  composer,
  imageAttachments,
  voiceState,
  voiceError,
  voiceLevel,
  wakeState,
  wakeError,
  wakePhrases,
  messages,
  conversationClassName,
  conversationScrollRef,
  handleConversationScroll,
  showConnectionSummary,
  shouldShowDiscovery,
  showComposer,
  downloadingFilePath,
  deletingFilePath,
  deletedRemoteFilePaths,
  fileDownload,
  taskNotice,
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
  onSelectServer,
  onConfigureServer,
  onAddServer,
  onDuplicateServer,
  onOpenGlobalSettings,
  onOpenVoiceSettings,
  onOpenCloudSync,
  onTestConnection,
  onDisconnectServer,
  onRefreshOutput,
  onScanDiscovery,
  onAddWorkdir,
  onModelChoice,
  onCodexLogin,
  onPreviewFile,
  onDownloadFile,
  onDeleteFile,
  onOpenRemoteDownload,
  onCloseRemoteDownload,
  onOpenRemoteDirectory,
  onNavigateRemoteDirectory,
  onCloseRemoteDirectory,
  onInterruptAgent,
  onMarkStuck,
  onRetryMessage,
  onShowDetails,
  onOpenSettingsFromMessage,
  setComposer,
  onAttachFiles,
  onAttachImages,
  onPasteClipboard,
  onRemoveImageAttachment,
  onSend,
  onVoice,
  onWake,
  onReleaseRunningTask,
  onCancelRunningTask,
  onToggleRaw,
  onKillAgentSession,
  onOpenTaskNotice,
  onCloseTaskNotice,
  onCloseSettings,
  onScanSettings,
  onAddSelectedSessions,
  onSaveSettings,
  onDeleteProfile,
  onDuplicateEditingServer,
  onOpenTerminal,
  onLoginRemoteAgent,
  agentManagementTargetId,
  onInstallAgent,
  onInstallCli,
  onUninstallAgent,
  onRefreshAgent,
  onOpenAgentSettings,
  onInstallWsl,
  onInstallGit,
  onGitDownload,
  onExportConfig,
  onExportLogs,
  onClearCache,
  onImportConfig,
  onCloudPullConfig,
  onCloudPushConfig,
  onCloudClearConfig,
  onShareSession,
  setDraftProfile,
  setSettingsAgentTab,
  setSettingsSelectedSessions,
  onCloseFilePreview,
}) {
  const {
    ConnectionSummary,
    DiscoveryPanel,
    EmptyWorkspaceActions,
    MessageBubble,
    RawOutput,
    TaskNotice,
    SettingsPanel,
    FilePreviewPanel,
    RemoteDirectoryDialog,
    RemoteDownloadDialog,
  } = components;
  const sessionConnectionStatus = connectionStatusPresentation(connection);
  const hasWorkSession = servers.length > 0 && isProfileReady;
  const editingServer = servers.find((server) => server.id === editingServerId) || servers.find((server) => server.id === activeServerId);
  const editingServerIndex = servers.findIndex((server) => server.id === editingServerId);
  const [sessionQuery, setSessionQuery] = useState("");
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [exportNotice, setExportNotice] = useState(null);
  const {
    visibleMessages,
    handleProgressiveScroll,
  } = useProgressiveMessages({
    messages,
    sessionId: activeServerId,
    onScroll: handleConversationScroll,
  });
  const visibleSessions = useMemo(() => {
    const query = sessionQuery.trim().toLocaleLowerCase();
    return servers
      .map((server, index) => ({ server, index }))
      .filter(({ server, index }) => {
        if (!query) return true;
        const serverProfile = normalizeProfile(server.profile);
        const agent = agentById(serverProfile.agentId);
        return [
          serverSessionName(server, index),
          agent.shortName,
          serverProfile.host,
          serverProfile.workdir,
          server.conversationId,
          conversationIdSuffix(server.conversationId),
          String(index + 1),
        ].some((value) => String(value || "").toLocaleLowerCase().includes(query));
      });
  }, [servers, sessionQuery]);

  const closeSessionSheet = () => setMobileNavOpen(false);
  const closeMoreMenu = () => setMoreMenuOpen(false);
  const selectSession = (server) => {
    const serverConnection = server.id === activeServerId ? connection : server.connection;
    closeSessionSheet();
    setSessionQuery("");

    void (async () => {
      await onSelectServer?.(server.id);
      if (!connectionIsLive(serverConnection) && !serverTaskRunning(server)) {
        await onTestConnection?.(server.id);
      }
    })().catch((error) => {
      console.warn("[aiwb:iphone:session-select]", shortError(error));
    });
  };

  async function handleExportLogsFromMenu() {
    if (!onExportLogs || exportingLogs) return;
    closeMoreMenu();
    setExportingLogs(true);
    setExportNotice({ tone: "loading", message: "正在打包诊断日志..." });
    try {
      const result = await onExportLogs();
      setExportNotice({ tone: "done", message: result?.message || "诊断日志已导出。" });
    } catch (error) {
      setExportNotice({ tone: "error", message: shortError(error) });
    } finally {
      setExportingLogs(false);
      window.setTimeout(() => setExportNotice(null), 3200);
    }
  }

  return (
    <main
      className={`iphone-shell ${conversationClassName || ""} ${mobileNavOpen ? "session-open" : ""}`}
      data-theme={resolvedTheme}
      data-appearance={appearanceMode}
      data-platform={platform}
    >
      <header className="iphone-topbar">
        <button
          type="button"
          className="iphone-top-button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="打开工作会话"
          title="工作会话"
        >
          <List size={20} weight="bold" aria-hidden="true" />
        </button>
        <button type="button" className="iphone-title-button" onClick={() => setMobileNavOpen(true)}>
          <span>{activeSessionName}</span>
          <small className={sessionConnectionStatus.tone}>
            {sessionConnectionStatus.label}
          </small>
        </button>
        <button
          type="button"
          className="iphone-top-button"
          onClick={() => setMoreMenuOpen((open) => !open)}
          aria-label="更多操作"
          aria-expanded={moreMenuOpen}
          title="更多操作"
        >
          <DotsThree size={21} weight="bold" aria-hidden="true" />
        </button>
      </header>

      {moreMenuOpen ? (
        <div className="iphone-more-layer" role="presentation">
          <button className="iphone-more-backdrop" type="button" aria-label="关闭更多操作" onClick={closeMoreMenu} />
          <div className="iphone-more-menu" role="menu" aria-label="更多操作">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMoreMenu();
                setTerminalOpen(true);
              }}
              disabled={!hasWorkSession}
            >
              <TerminalWindow size={18} weight="bold" aria-hidden="true" />
              <span>SSH 终端</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMoreMenu();
                onRefreshOutput?.();
              }}
              disabled={!onRefreshOutput || busy}
            >
              <ArrowClockwise size={18} weight="bold" aria-hidden="true" />
              <span>同步状态</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMoreMenu();
                onOpenGlobalSettings?.();
              }}
            >
              <GearSix size={18} weight="bold" aria-hidden="true" />
              <span>全局设置</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleExportLogsFromMenu}
              disabled={!onExportLogs || exportingLogs}
            >
              <FileZip size={18} weight="bold" aria-hidden="true" />
              <span>{exportingLogs ? "正在导出" : "导出日志"}</span>
            </button>
          </div>
        </div>
      ) : null}

      {exportNotice ? <div className={`iphone-export-notice ${exportNotice.tone || ""}`}>{exportNotice.message}</div> : null}

      <NativeSshTerminal
        open={terminalOpen && hasWorkSession}
        profile={terminalProfile || profile}
        sessionKey={activeServerId}
        theme={resolvedTheme}
        formFactor="iphone"
        onClose={() => setTerminalOpen(false)}
      />

      <section
        className={`iphone-chat ${draggingFiles ? "file-drop-active" : ""}`}
        aria-label="当前对话"
        onDragEnter={(event) => {
          if (!showComposer || !hasWorkSession || !dataTransferHasFiles(event.dataTransfer)) return;
          event.preventDefault();
          setDraggingFiles(true);
        }}
        onDragOver={(event) => {
          if (!dataTransferHasFiles(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDraggingFiles(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDraggingFiles(false);
          if (!showComposer || !hasWorkSession) return;
          onAttachFiles?.(event.dataTransfer?.files);
        }}
      >
        {draggingFiles ? (
          <div className="file-drop-overlay" aria-hidden="true">
            <strong>松开以添加文件</strong>
            <span>文件会加入当前任务，发送时上传到工作目录</span>
          </div>
        ) : null}
        {taskNotice ? (
          <div className="conversation-task-notice">
            <TaskNotice notice={taskNotice} onOpen={onOpenTaskNotice} onClose={onCloseTaskNotice} />
          </div>
        ) : null}
        <div className="iphone-chat-scroll conversation-scroll" ref={conversationScrollRef} onScroll={handleProgressiveScroll}>
          {!hasWorkSession ? (
            <EmptyWorkspaceActions busy={busy} onAddServer={onAddServer} onSyncCloud={onOpenCloudSync} />
          ) : null}
          {hasWorkSession && showConnectionSummary ? (
            <ConnectionSummary
              profile={profile}
              connection={connection}
              diagnostics={diagnostics}
              discovery={discovery}
              profileReady={isProfileReady}
            />
          ) : null}
          {hasWorkSession && shouldShowDiscovery ? (
            <DiscoveryPanel
              discovery={discovery}
              profile={profile}
              servers={servers}
              busy={busy}
              onRescan={onScanDiscovery}
              onAddWorkdir={onAddWorkdir}
            />
          ) : null}
          {hasWorkSession ? visibleMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              activeAgent={activeAgent}
              profile={profile}
              busy={busy}
              operationBusy={busy}
              onModelChoice={onModelChoice}
              onCodexLogin={onCodexLogin}
              onPreviewFile={onPreviewFile}
              onDownloadFile={onDownloadFile}
              onDeleteFile={onDeleteFile}
              downloadingFilePath={downloadingFilePath}
              deletingFilePath={deletingFilePath}
              deletedRemoteFilePaths={deletedRemoteFilePaths}
              fileDownload={fileDownload}
              onRefreshOutput={onRefreshOutput}
              onInterruptAgent={onInterruptAgent}
              onMarkStuck={onMarkStuck}
              onRetryMessage={onRetryMessage}
              onShowDetails={onShowDetails}
              onOpenSettings={onOpenSettingsFromMessage}
              onEditUserMessage={(text) => setComposer(text)}
            />
          )) : null}
        </div>

        {showComposer && hasWorkSession ? (
          <IphoneComposer
            activeAgent={activeAgent}
            composer={composer}
            imageAttachments={imageAttachments}
            busy={activeBusy}
            operationBusy={busy}
            pendingAction={hasPendingAction}
            profileReady={isProfileReady}
            mainAIRouterReady={mainAIReady}
            mainAIEnabled={profile.mainAIEnabled}
            mainAIModel={profile.mainAIModel}
            voiceInputEnabled={profile.voiceInputEnabled === true}
            voiceState={voiceState}
            voiceError={voiceError}
            voiceLevel={voiceLevel}
            wakeState={wakeState}
            wakeError={wakeError}
            wakePhrases={wakePhrases}
            runningTask={activeTaskRunning ? activeRunningMessage || { role: "assistant", taskState: "running" } : null}
            sendConnecting={sendConnecting}
            setComposer={setComposer}
	            onOpenSettings={onAddServer}
	            onOpenVoiceSettings={onOpenVoiceSettings}
            onAttachFiles={onAttachFiles || onAttachImages}
            onPasteClipboard={onPasteClipboard}
            onRemoveImageAttachment={onRemoveImageAttachment}
            onOpenDownloadFile={onOpenRemoteDownload}
            onOpenRemoteDirectory={onOpenRemoteDirectory}
            onSend={onSend}
            onVoice={onVoice}
            onWake={onWake}
            onReleaseRunningTask={onReleaseRunningTask}
            onCancelRunningTask={onCancelRunningTask}
          />
        ) : null}
      </section>

      {mobileNavOpen ? (
        <div className="iphone-session-sheet" role="dialog" aria-modal="true" aria-label="工作会话">
          <button className="iphone-sheet-backdrop" type="button" aria-label="关闭会话列表" onClick={closeSessionSheet} />
          <aside className="iphone-session-panel">
            <header>
              <div>
                <strong>工作会话</strong>
                <span>选择一个任务继续</span>
              </div>
              <div className="iphone-session-header-actions">
                <button
                  type="button"
                  className="iphone-session-add"
                  onClick={() => {
                    onAddServer?.();
                    closeSessionSheet();
                  }}
                  aria-label="添加工作会话"
                >
                  <Plus size={20} weight="bold" aria-hidden="true" />
                </button>
                <button type="button" className="iphone-session-close" onClick={closeSessionSheet} aria-label="关闭会话列表">
                  <X size={20} weight="bold" aria-hidden="true" />
                </button>
              </div>
            </header>
            <label className="iphone-session-search">
              <MagnifyingGlass size={17} aria-hidden="true" />
              <input
                type="search"
                value={sessionQuery}
                onChange={(event) => setSessionQuery(event.target.value)}
                placeholder="搜索会话或说第几个"
                aria-label="搜索工作会话"
              />
            </label>
            <div className="iphone-session-body">
              <div className="iphone-session-list" role="list" aria-label="工作会话列表">
                {visibleSessions.map(({ server, index }) => {
                  const isActive = server.id === activeServerId;
                  const serverConnection = isActive ? connection : server.connection;
                  const taskRunning = serverTaskRunning(server);
                  const connected = connectionIsLive(serverConnection);
                  const normalizedProfile = normalizeProfile(server.profile);
                  const agent = agentById(normalizedProfile.agentId);
                  const connectionMode = connectionModeForServer(server, serverConnection);
                  const stateLabel = taskRunning ? "执行中" : connected ? "已连接" : server.unreadResult ? "已完成" : "未连接";
                  const stateTone = taskRunning ? "running" : connected ? "connected" : server.unreadResult ? "done" : "idle";
                  const contextLabel = workdirDisplayName(normalizedProfile.workdir) || connectionMode.shortLabel;
                  const sessionName = serverSessionName(server, index);
                  const sessionIdTail = conversationIdSuffix(server.conversationId);

	                  return (
	                    <div
	                      key={server.id}
	                      role="listitem"
	                      className={`iphone-session-row ${isActive ? "active" : ""}`}
	                    >
	                      <button
	                        type="button"
	                        className="iphone-session-select"
	                        onClick={() => selectSession(server)}
	                        aria-label={`打开 ${sessionName}${sessionIdTail ? `，会话编号末四位 ${sessionIdTail}` : ""}`}
	                      >
	                        <span className="iphone-session-index">{index + 1}</span>
	                        <AgentLogo agentId={agent.id} compact />
	                        <span className="iphone-session-copy">
	                          <strong>{sessionName}</strong>
	                          <small>
                              {agent.shortName} · {contextLabel}
                              {sessionIdTail ? ` · #${sessionIdTail}` : ""}
                            </small>
	                        </span>
	                        <span className={`iphone-session-state ${stateTone}`}>
	                          <StatusDot status={taskRunning ? "testing" : connected || server.unreadResult ? "connected" : "idle"} />
	                          {stateLabel}
	                        </span>
	                      </button>
	                      <button
	                        type="button"
	                        className="iphone-session-edit"
	                        onClick={() => {
	                          onConfigureServer?.(server.id);
	                          closeSessionSheet();
	                        }}
	                        disabled={busy}
	                        aria-label={`设置 ${sessionName}`}
	                        title="设置"
	                      >
	                        <GearSix size={18} weight="bold" aria-hidden="true" />
	                      </button>
	                    </div>
	                  );
	                })}
                {!visibleSessions.length ? <p className="iphone-session-empty">没有找到对应会话</p> : null}
              </div>
	              <p className="iphone-session-footnote">当前任务会同步等待最终结果</p>
            </div>
          </aside>
        </div>
      ) : null}

      <RawOutput
        open={rawOpen}
        agent={activeAgent}
        profile={profile}
        connection={connection}
        connectionMode={activeConnectionMode}
        rawOutput={rawOutput}
        busy={busy}
        onToggle={onToggleRaw}
        onRefresh={onRefreshOutput}
        onInterrupt={onInterruptAgent}
        onKill={onKillAgentSession}
      />

      {settingsOpen ? (
        <SettingsPanel
          servers={servers}
          draftProfile={draftProfile}
          editingServer={editingServer}
          editingServerIndex={editingServerIndex}
          busy={busy}
          mode={editingServerId === "global" ? "global" : editingServerId ? "edit" : "add"}
          initialPage={settingsInitialPage}
          settingsDiscovery={settingsDiscovery}
          settingsAgentTab={settingsAgentTab}
          settingsSelectedSessions={settingsSelectedSessions}
          setDraftProfile={setDraftProfile}
          setSettingsAgentTab={setSettingsAgentTab}
          setSettingsSelectedSessions={setSettingsSelectedSessions}
          onClose={onCloseSettings}
          onScan={onScanSettings}
          onAddSelected={onAddSelectedSessions}
          onSave={onSaveSettings}
          onDelete={onDeleteProfile}
          onDuplicate={onDuplicateEditingServer}
          onOpenTerminal={onOpenTerminal}
          onLoginRemoteAgent={onLoginRemoteAgent}
          agentManagementTargetId={agentManagementTargetId}
          onInstallAgent={onInstallAgent}
          onInstallCli={onInstallCli}
          onUninstallAgent={onUninstallAgent}
          onRefreshAgent={onRefreshAgent}
          onOpenAgentSettings={onOpenAgentSettings}
          onInstallWsl={onInstallWsl}
          onInstallGit={onInstallGit}
          onGitDownload={onGitDownload}
          onExportConfig={onExportConfig}
          onExportLogs={onExportLogs}
          onClearCache={onClearCache}
          onImportConfig={onImportConfig}
          onCloudPullConfig={onCloudPullConfig}
          onCloudPushConfig={onCloudPushConfig}
          onCloudClearConfig={onCloudClearConfig}
          onShareSession={onShareSession}
          onTest={onScanSettings}
        />
      ) : null}

      {filePreview ? (
        <FilePreviewPanel
          preview={filePreview}
          downloadState={fileDownload}
          onPreviewFile={onPreviewFile}
          onDownloadFile={onDownloadFile}
          onDeleteFile={onDeleteFile}
          onClose={onCloseFilePreview}
        />
      ) : null}

      <RemoteDownloadDialog
        open={remoteDownloadOpen}
        profile={profile}
        downloadState={fileDownload}
        onDownloadFile={onDownloadFile}
        onOpenRemoteDirectory={onOpenRemoteDirectory}
        onClose={onCloseRemoteDownload}
      />
      <RemoteDirectoryDialog
        open={remoteDirectoryOpen}
        profile={profile}
        directory={remoteDirectory}
        onOpenDirectory={onNavigateRemoteDirectory}
        onPreviewFile={onPreviewFile}
        onDownloadFile={onDownloadFile}
        onClose={onCloseRemoteDirectory}
      />
    </main>
  );
}
