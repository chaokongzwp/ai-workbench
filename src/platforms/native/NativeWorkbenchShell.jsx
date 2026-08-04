import { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { DotsThree, SidebarSimple, TerminalWindow } from "@phosphor-icons/react";
import { connectionStatusPresentation, dataTransferHasFiles } from "../../core/workbenchCore.js";
import { useProgressiveMessages } from "../useProgressiveMessages.js";
import { NativeSshTerminal } from "./NativeSshTerminal.jsx";

export function NativeWorkbenchShell({
  components,
  nativeFormFactor = "phone",
  embeddedTerminalEnabled = false,
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
  sidebarCollapsed,
  onToggleSidebar,
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
  onReorderServer,
  onConfigureServer,
  onAddServer,
  onDuplicateServer,
  onOpenGlobalSettings,
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
  onOpenVoiceSettings,
  onReleaseRunningTask,
  onCancelRunningTask,
  onToggleRaw,
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
  onGitSshKey,
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
    NavigationPanel,
    ConnectionSummary,
    DiscoveryPanel,
    EmptyWorkspaceActions,
    MessageBubble,
    Composer,
    RawOutput,
    SettingsPanel,
    FilePreviewPanel,
    RemoteDirectoryDialog,
    RemoteDownloadDialog,
  } = components;
  const sessionConnectionStatus = connectionStatusPresentation(connection);
  const editingServer = servers.find((server) => server.id === editingServerId) || servers.find((server) => server.id === activeServerId);
  const editingServerIndex = servers.findIndex((server) => server.id === editingServerId);
  const isIpad = nativeFormFactor === "ipad";
  const terminalEnabled = isIpad || embeddedTerminalEnabled;
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInitialCommand, setTerminalInitialCommand] = useState("");
  const hasWorkSession = servers.length > 0;
  const {
    visibleMessages,
    handleProgressiveScroll,
  } = useProgressiveMessages({
    messages,
    sessionId: activeServerId,
    onScroll: handleConversationScroll,
  });

  useEffect(() => {
    if (platform !== "android") return undefined;

    let listenerHandle;
    let disposed = false;
    void CapacitorApp.addListener("backButton", () => {
      if (settingsOpen) {
        onCloseSettings?.();
        return;
      }
      if (terminalOpen) {
        setTerminalOpen(false);
        return;
      }
      if (mobileNavOpen) {
        setMobileNavOpen?.(false);
        return;
      }
      void CapacitorApp.minimizeApp();
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
        return;
      }
      listenerHandle = handle;
    });

    return () => {
      disposed = true;
      void listenerHandle?.remove();
    };
  }, [mobileNavOpen, onCloseSettings, platform, setMobileNavOpen, settingsOpen, terminalOpen]);

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
        onReorderServer={onReorderServer}
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
            className={`native-nav-button native-session-trigger ${
              isIpad ? "native-ipad-sidebar-toggle utility-icon-button" : ""
            }`}
            onClick={handleSessionTrigger}
            aria-label={isIpad ? (sidebarCollapsed ? "展开侧边栏" : "收起侧边栏") : "打开会话列表"}
          >
            {isIpad ? <SidebarSimple size={16} weight="bold" aria-hidden="true" /> : "会话"}
          </button>
          <button
            type="button"
            className="native-title-button"
            onClick={isIpad ? undefined : () => setMobileNavOpen(true)}
            aria-label={`当前会话：${activeSessionName}`}
            aria-disabled={isIpad ? "true" : undefined}
            tabIndex={isIpad ? -1 : undefined}
          >
            <strong>{activeSessionName}</strong>
            <span className={`native-title-status ${sessionConnectionStatus.tone}`}>
              {sessionConnectionStatus.label}
            </span>
          </button>
          <div className="native-nav-actions">
            {terminalEnabled && hasWorkSession ? (
              <button
                type="button"
                className="native-nav-button native-terminal-button utility-icon-button"
                onClick={() => setTerminalOpen(true)}
                aria-label="打开当前会话 SSH 终端"
                title="SSH 终端"
              >
                <TerminalWindow size={17} weight="bold" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              className={`native-nav-button native-settings-button ${
                isIpad ? "native-more-button utility-icon-button" : ""
              }`}
              onClick={onOpenGlobalSettings}
              aria-label="全局设置"
            >
              {isIpad ? <DotsThree size={18} weight="bold" aria-hidden="true" /> : "设置"}
            </button>
          </div>
        </header>

        <NativeSshTerminal
          open={terminalOpen && terminalEnabled && hasWorkSession}
          profile={terminalProfile || profile}
          sessionKey={activeServerId}
          theme={resolvedTheme}
          formFactor={nativeFormFactor}
          initialCommand={terminalInitialCommand}
          onClose={() => setTerminalOpen(false)}
        />

        <div className="native-chat-scroll conversation-scroll" ref={conversationScrollRef} onScroll={handleProgressiveScroll}>
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
          <div className="native-composer-dock">
            <Composer
              compact={isIpad}
              utilityControls={isIpad}
              compactPlaceholder={
                isProfileReady ? `告诉 ${activeAgent.shortName} 你想做什么` : "选择工作会话后即可开始"
              }
              showSetupAction={!isIpad}
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
              runningTask={activeTaskRunning ? activeRunningMessage || { role: "assistant", taskState: "running" } : null}
              sendConnecting={sendConnecting}
              setComposer={setComposer}
              onOpenSettings={onAddServer}
              onAttachFiles={onAttachFiles || onAttachImages}
              onPasteClipboard={onPasteClipboard}
              onRemoveImageAttachment={onRemoveImageAttachment}
              onOpenDownloadFile={onOpenRemoteDownload}
              onOpenRemoteDirectory={onOpenRemoteDirectory}
              onSend={onSend}
              onVoice={onVoice}
              onWake={onWake}
              onOpenVoiceSettings={onOpenVoiceSettings}
              showVoiceControlsWhenDisabled={platform === "android"}
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
      />

      {settingsOpen ? (
        <SettingsPanel
          servers={servers}
          platform={platform}
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
          onLoginRemoteAgent={
            onLoginRemoteAgent ||
            ((agentId) => {
              onCloseSettings?.();
              setTerminalInitialCommand(agentId === "claude" ? "claude" : "codex login --device-auth");
              setTerminalOpen(true);
              return Promise.resolve("已打开交互式 SSH 终端，请按提示完成登录。");
            })
          }
          agentManagementTargetId={agentManagementTargetId}
          onInstallAgent={onInstallAgent}
          onInstallCli={onInstallCli}
          onUninstallAgent={onUninstallAgent}
          onRefreshAgent={onRefreshAgent}
          onOpenAgentSettings={onOpenAgentSettings}
          onInstallWsl={onInstallWsl}
          onInstallGit={onInstallGit}
          onGitDownload={onGitDownload}
          onGitSshKey={onGitSshKey}
          onExportConfig={onExportConfig}
          onExportLogs={onExportLogs}
          onClearCache={onClearCache}
          onImportConfig={onImportConfig}
          onCloudPullConfig={onCloudPullConfig}
          onCloudPushConfig={onCloudPushConfig}
          onCloudClearConfig={onCloudClearConfig}
          onShareSession={onShareSession}
          onTest={onScanSettings}
          allowCloseWhileBusy={platform === "android"}
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
