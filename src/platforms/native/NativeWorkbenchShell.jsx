import { useState } from "react";
import { FileZip, GearSix, SidebarSimple } from "@phosphor-icons/react";
import { dataTransferHasFiles } from "../../core/workbenchCore.js";

export function NativeWorkbenchShell({
  components,
  nativeFormFactor = "phone",
  resolvedTheme,
  appearanceMode,
  platform,
  activeSessionName,
  activeConnectionMode,
  servers,
  activeServerId,
  profile,
  connection,
  diagnostics,
  discovery,
  mobileNavOpen,
  setMobileNavOpen,
  sidebarCollapsed,
  onToggleSidebar,
  busy,
  rawOpen,
  rawOutput,
  activeAgent,
  activeBusy,
  activeTaskRunning,
  activeRunningMessage,
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
  settingsDiscovery,
  settingsAgentTab,
  settingsSelectedSessions,
  editingServerId,
  draftProfile,
  filePreview,
  remoteDownloadOpen,
  onSelectServer,
  onConfigureServer,
  onAddServer,
  onDuplicateServer,
  onOpenGlobalSettings,
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
  agentManagementTargetId,
  onInstallAgent,
  onRefreshAgent,
  onOpenAgentSettings,
  onInstallWsl,
  onInstallGit,
  onGitDownload,
  onExportConfig,
  onExportLogs,
  onImportConfig,
  setDraftProfile,
  setSettingsAgentTab,
  setSettingsSelectedSessions,
  onCloseFilePreview,
}) {
  const {
    NavigationPanel,
    ConnectionSummary,
    DiscoveryPanel,
    MessageBubble,
    Composer,
    RawOutput,
    TaskNotice,
    SettingsPanel,
    FilePreviewPanel,
    RemoteDownloadDialog,
  } = components;
  const modeText = activeConnectionMode?.label || "直接 SSH";
  const editingServer = servers.find((server) => server.id === editingServerId) || servers.find((server) => server.id === activeServerId);
  const editingServerIndex = servers.findIndex((server) => server.id === editingServerId);
  const isIpad = nativeFormFactor === "ipad";
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [exportNotice, setExportNotice] = useState(null);

  function handleFileDrop(event) {
    event.preventDefault();
    setDraggingFiles(false);
    if (!showComposer || !isProfileReady) return;
    onAttachFiles?.(event.dataTransfer?.files);
  }

  function handleSessionTrigger() {
    if (isIpad) {
      onToggleSidebar?.();
      return;
    }
    setMobileNavOpen(true);
  }

  async function handleExportLogs() {
    if (!onExportLogs || exportingLogs) return;
    setExportingLogs(true);
    setExportNotice({ tone: "loading", message: "正在打包诊断日志..." });
    try {
      const result = await onExportLogs();
      setExportNotice({ tone: "done", message: result?.message || "诊断日志已导出。" });
    } catch (error) {
      setExportNotice({ tone: "error", message: error?.message || String(error) });
    } finally {
      setExportingLogs(false);
      window.setTimeout(() => setExportNotice(null), 3200);
    }
  }

  function renderNavigationPanel({ closeAfterAction = false } = {}) {
    const closeIfNeeded = () => {
      if (closeAfterAction) setMobileNavOpen(false);
    };

    return (
      <NavigationPanel
        servers={servers}
        activeServerId={activeServerId}
        profile={profile}
        connection={connection}
        diagnostics={diagnostics}
        discovery={discovery}
        onSelectServer={async (serverId) => {
          await onSelectServer?.(serverId);
          closeIfNeeded();
        }}
        onConfigureServer={(serverId) => {
          onConfigureServer?.(serverId);
          closeIfNeeded();
        }}
        onAddServer={() => {
          onAddServer?.();
          closeIfNeeded();
        }}
        onDuplicateServer={async () => {
          await onDuplicateServer?.();
          closeIfNeeded();
        }}
        onOpenSettings={() => {
          onOpenGlobalSettings?.();
          closeIfNeeded();
        }}
        onTestConnection={onTestConnection}
        onDisconnectServer={onDisconnectServer}
        onRefreshOutput={onRefreshOutput}
        collapsed={Boolean(sidebarCollapsed)}
        variant={isIpad ? "ipad" : "default"}
        onToggleCollapse={
          !closeAfterAction
            ? onToggleSidebar
            : sidebarCollapsed
              ? () => {
                  onToggleSidebar?.();
                  closeIfNeeded();
                }
              : undefined
        }
        busy={busy}
      />
    );
  }

  return (
    <main
      className={`app-shell native-app-shell ${mobileNavOpen ? "native-session-open" : ""} ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
      data-theme={resolvedTheme}
      data-appearance={appearanceMode}
      data-platform={platform}
      data-native-form-factor={nativeFormFactor}
    >
      <aside className="native-ipad-sidebar" aria-label="工作会话">
        {renderNavigationPanel()}
      </aside>

      <section
        className={`${conversationClassName} native-conversation ${draggingFiles ? "file-drop-active" : ""}`}
        onDragEnter={(event) => {
          if (!showComposer || !isProfileReady || !dataTransferHasFiles(event.dataTransfer)) return;
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
        onDrop={handleFileDrop}
      >
        {draggingFiles ? (
          <div className="file-drop-overlay" aria-hidden="true">
            <strong>松开以添加文件</strong>
            <span>文件会加入当前任务，发送时上传到工作目录</span>
          </div>
        ) : null}
        <header className="native-chat-nav">
          <button
            type="button"
            className={`native-nav-button native-session-trigger ${isIpad ? "native-ipad-sidebar-toggle" : ""}`}
            onClick={handleSessionTrigger}
            aria-label={isIpad ? (sidebarCollapsed ? "展开侧边栏" : "收起侧边栏") : "打开会话列表"}
          >
            {isIpad ? <SidebarSimple size={20} weight="bold" aria-hidden="true" /> : "会话"}
          </button>
          <button
            type="button"
            className="native-title-button"
            onClick={() => setMobileNavOpen(true)}
            aria-label={`当前会话：${activeSessionName}`}
          >
            <strong>{activeSessionName}</strong>
            <span>{modeText}</span>
          </button>
          <div className="native-nav-actions">
            <button
              type="button"
              className="native-nav-button native-log-button"
              onClick={handleExportLogs}
              disabled={!onExportLogs || exportingLogs}
              aria-label={exportingLogs ? "正在导出诊断日志" : "导出诊断日志"}
            >
              {isIpad ? <FileZip size={20} weight="bold" aria-hidden="true" /> : "日志"}
            </button>
            <button
              type="button"
              className="native-nav-button native-settings-button"
              onClick={onOpenGlobalSettings}
              aria-label="全局设置"
            >
              {isIpad ? <GearSix size={20} weight="bold" aria-hidden="true" /> : "设置"}
            </button>
          </div>
        </header>

        {exportNotice ? <div className={`native-export-notice ${exportNotice.tone || ""}`}>{exportNotice.message}</div> : null}

        <div className="native-chat-scroll conversation-scroll" ref={conversationScrollRef} onScroll={handleConversationScroll}>
          {showConnectionSummary ? (
            <ConnectionSummary
              profile={profile}
              connection={connection}
              diagnostics={diagnostics}
              discovery={discovery}
              profileReady={isProfileReady}
            />
          ) : null}
          {shouldShowDiscovery ? (
            <DiscoveryPanel
              discovery={discovery}
              profile={profile}
              servers={servers}
              busy={busy}
              onRescan={onScanDiscovery}
              onAddWorkdir={onAddWorkdir}
            />
          ) : null}
          {messages.map((message) => (
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
            />
          ))}
        </div>

        {showComposer ? (
          <div className="native-composer-dock">
            <Composer
              activeAgent={activeAgent}
              composer={composer}
              imageAttachments={imageAttachments}
              busy={activeBusy}
              operationBusy={busy}
              pendingAction={hasPendingAction}
              profileReady={isProfileReady}
              connectionMode={activeConnectionMode}
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
              runningTask={activeTaskRunning ? activeRunningMessage || { status: "running" } : null}
              setComposer={setComposer}
              onOpenSettings={onAddServer}
              onAttachFiles={onAttachFiles || onAttachImages}
              onPasteClipboard={onPasteClipboard}
              onRemoveImageAttachment={onRemoveImageAttachment}
              onOpenDownloadFile={onOpenRemoteDownload}
              onSend={onSend}
              onVoice={onVoice}
              onWake={onWake}
              onReleaseRunningTask={onReleaseRunningTask}
              onCancelRunningTask={onCancelRunningTask}
            />
          </div>
        ) : null}
      </section>

      {mobileNavOpen ? (
        <div className="native-session-sheet" role="dialog" aria-modal="true" aria-label="工作会话">
          <button
            className="native-sheet-backdrop"
            type="button"
            aria-label="关闭会话列表"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="native-sheet-panel">
            <header className="native-sheet-header">
              <strong>工作会话</strong>
              <button type="button" className="native-nav-button" onClick={() => setMobileNavOpen(false)}>
                完成
              </button>
            </header>
            <div className="native-sheet-body">{renderNavigationPanel({ closeAfterAction: true })}</div>
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

      {taskNotice ? <TaskNotice notice={taskNotice} onOpen={onOpenTaskNotice} onClose={onCloseTaskNotice} /> : null}

      {settingsOpen ? (
        <SettingsPanel
          servers={servers}
          draftProfile={draftProfile}
          editingServer={editingServer}
          editingServerIndex={editingServerIndex}
          busy={busy}
          mode={editingServerId === "global" ? "global" : editingServerId ? "edit" : "add"}
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
          agentManagementTargetId={agentManagementTargetId}
          onInstallAgent={onInstallAgent}
          onRefreshAgent={onRefreshAgent}
          onOpenAgentSettings={onOpenAgentSettings}
          onInstallWsl={onInstallWsl}
          onInstallGit={onInstallGit}
          onGitDownload={onGitDownload}
          onExportConfig={onExportConfig}
          onExportLogs={onExportLogs}
          onImportConfig={onImportConfig}
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
        onClose={onCloseRemoteDownload}
      />
    </main>
  );
}
