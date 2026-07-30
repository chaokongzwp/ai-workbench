import { lazy, Suspense, useState } from "react";
import { dataTransferHasFiles } from "../../core/workbenchCore.js";
import { useProgressiveMessages } from "../useProgressiveMessages.js";

const MacSshPanel = lazy(() =>
  import("./MacSshPanel.jsx").then((module) => ({ default: module.MacSshPanel })),
);

export function MacWorkbenchShell({
  components,
  shellClassName,
  resolvedTheme,
  appearanceMode,
  platform,
  desktopPreview,
  detachedChatMode,
  activeSessionName,
  activeConnectionMode,
  servers,
  activeServer,
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
  onOpenChatWindow,
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
    TopBar,
    NavigationPanel,
    ConnectionSummary,
    DiscoveryPanel,
    EmptyWorkspaceActions,
    MessageBubble,
    Composer,
    RawOutput,
    TaskNotice,
    SettingsPanel,
    FilePreviewPanel,
    RemoteDirectoryDialog,
    RemoteDownloadDialog,
  } = components;
  const editingServer = servers.find((server) => server.id === editingServerId) || activeServer;
  const editingServerIndex = servers.findIndex((server) => server.id === editingServerId);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const hasWorkSession = servers.length > 0;
  const {
    visibleMessages: renderedMessages,
    handleProgressiveScroll: handleMacConversationScroll,
  } = useProgressiveMessages({
    messages,
    sessionId: activeServerId,
    onScroll: handleConversationScroll,
  });
  const macSessionTitle = String(activeSessionName || "当前会话")
    .replace(/\s*[·•]\s*(codex|claude|gemini|aider|ollama)\s*$/i, "")
    .trim();
  const activeMachineName = String(diagnostics?.host || profile.host || "未识别服务器").trim();

  function handleFileDrop(event) {
    event.preventDefault();
    setDraggingFiles(false);
    if (!showComposer || !isProfileReady) return;
    onAttachFiles?.(event.dataTransfer?.files);
  }

  return (
    <main className={shellClassName} data-theme={resolvedTheme} data-appearance={appearanceMode} data-platform={platform}>
      <TopBar
        sessionName={macSessionTitle}
        sessionSubtitle={`${activeMachineName} · ${activeAgent.shortName}`}
        showSessionName
        connection={connection}
        busy={busy}
        onOpenNav={() => setMobileNavOpen(true)}
        onToggleTerminal={hasWorkSession ? () => setTerminalOpen((value) => !value) : undefined}
        terminalOpen={terminalOpen}
        onOpenSettings={detachedChatMode ? () => onConfigureServer?.(activeServerId) : onOpenGlobalSettings}
      />

      <div className="workspace">
        {!detachedChatMode ? (
        <aside className={`sidebar desktop-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <NavigationPanel
            servers={servers}
            activeServerId={activeServerId}
            profile={profile}
            connection={connection}
            diagnostics={diagnostics}
            discovery={discovery}
            variant="mac"
            collapsed={sidebarCollapsed}
            onToggleCollapse={onToggleSidebar}
            onSelectServer={onSelectServer}
            onOpenChatWindow={onOpenChatWindow}
            onConfigureServer={onConfigureServer}
            onAddServer={onAddServer}
            onDuplicateServer={onDuplicateServer}
            onTestConnection={onTestConnection}
            onDisconnectServer={onDisconnectServer}
            busy={busy}
          />
        </aside>
        ) : null}

        <section
          className={`${conversationClassName} ${draggingFiles ? "file-drop-active" : ""} ${
            terminalOpen ? "ssh-terminal-visible" : ""
          }`}
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
              <strong>松开以上传文件</strong>
              <span>文件会先加入输入框，发送时上传到当前工作目录</span>
            </div>
          ) : null}
          {taskNotice ? (
            <div className="conversation-task-notice">
              <TaskNotice notice={taskNotice} onOpen={onOpenTaskNotice} onClose={onCloseTaskNotice} />
            </div>
          ) : null}
          <div className="conversation-scroll" ref={conversationScrollRef} onScroll={handleMacConversationScroll}>
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
            {hasWorkSession ? renderedMessages.map((message) => (
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
                iconStyle="mac"
              />
            )) : null}
          </div>

          {showComposer && hasWorkSession ? (
            <Composer
              compact
              compactPlaceholder={
                activeTaskRunning
                  ? ""
                  : isProfileReady
                    ? `告诉 ${activeAgent.shortName} 你想做什么`
                    : "选择工作会话后即可开始"
              }
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
              onReleaseRunningTask={onReleaseRunningTask}
              onCancelRunningTask={onCancelRunningTask}
              iconStyle="mac"
            />
          ) : null}
          <Suspense fallback={null}>
            <MacSshPanel
              open={terminalOpen && hasWorkSession}
              profile={terminalProfile || profile}
              sessionKey={activeServerId}
              theme={resolvedTheme}
              onCollapse={() => setTerminalOpen(false)}
            />
          </Suspense>
        </section>
      </div>

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

      {mobileNavOpen ? (
        <div className="mobile-drawer" role="dialog" aria-modal="true">
          <button
            className="drawer-backdrop"
            type="button"
            aria-label="关闭导航"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="sidebar drawer-panel">
            <div className="drawer-header">
              <strong>AI Workbench</strong>
              <button type="button" className="text-button" onClick={() => setMobileNavOpen(false)}>
                完成
              </button>
            </div>
            <NavigationPanel
              servers={servers}
              activeServerId={activeServerId}
              profile={profile}
              connection={connection}
              diagnostics={diagnostics}
              discovery={discovery}
              onSelectServer={async (serverId) => {
                await onSelectServer?.(serverId);
                setMobileNavOpen(false);
              }}
              onConfigureServer={(serverId) => {
                onConfigureServer?.(serverId);
                setMobileNavOpen(false);
              }}
              onAddServer={() => {
                onAddServer?.();
                setMobileNavOpen(false);
              }}
              onDuplicateServer={async () => {
                await onDuplicateServer?.();
                setMobileNavOpen(false);
              }}
              onOpenSettings={() => {
                onOpenGlobalSettings?.();
                setMobileNavOpen(false);
              }}
              onTestConnection={onTestConnection}
              onDisconnectServer={onDisconnectServer}
              onRefreshOutput={onRefreshOutput}
              busy={busy}
            />
          </aside>
        </div>
      ) : null}

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
