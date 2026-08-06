const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiWorkbench", {
  platform: "mac",
  connectSession(payload) {
    return ipcRenderer.invoke("aiwb:session-connect", payload);
  },
  disconnectSession(payload) {
    return ipcRenderer.invoke("aiwb:session-disconnect", payload);
  },
  onConnectionState(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("aiwb:connection-state", listener);
    return () => ipcRenderer.removeListener("aiwb:connection-state", listener);
  },
  runCommand(payload) {
    return ipcRenderer.invoke("aiwb:run-command", payload);
  },
  agentRequest(payload) {
    return ipcRenderer.invoke("aiwb:agent-request", payload);
  },
  startAgentEventStream(payload) {
    return ipcRenderer.invoke("aiwb:agent-event-start", payload);
  },
  stopAgentEventStream(payload) {
    return ipcRenderer.invoke("aiwb:agent-event-stop", payload);
  },
  onAgentEvent(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("aiwb:agent-event", listener);
    return () => ipcRenderer.removeListener("aiwb:agent-event", listener);
  },
  agentUpload(payload) {
    return ipcRenderer.invoke("aiwb:agent-upload", payload);
  },
  cancelAgentUpload(payload) {
    return ipcRenderer.invoke("aiwb:agent-upload-cancel", payload);
  },
  onUploadProgress(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("aiwb:upload-progress", listener);
    return () => ipcRenderer.removeListener("aiwb:upload-progress", listener);
  },
  openTerminal(payload) {
    return ipcRenderer.invoke("aiwb:open-terminal", payload);
  },
  startEmbeddedTerminal(payload) {
    return ipcRenderer.invoke("aiwb:terminal-start", payload);
  },
  writeEmbeddedTerminal(payload) {
    return ipcRenderer.invoke("aiwb:terminal-write", payload);
  },
  resizeEmbeddedTerminal(payload) {
    return ipcRenderer.invoke("aiwb:terminal-resize", payload);
  },
  closeEmbeddedTerminal(payload) {
    return ipcRenderer.invoke("aiwb:terminal-close", payload);
  },
  onEmbeddedTerminalData(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("aiwb:terminal-data", listener);
    return () => ipcRenderer.removeListener("aiwb:terminal-data", listener);
  },
  onEmbeddedTerminalState(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("aiwb:terminal-state", listener);
    return () => ipcRenderer.removeListener("aiwb:terminal-state", listener);
  },
  openChatWindow(payload) {
    return ipcRenderer.invoke("aiwb:open-chat-window", payload);
  },
  saveFile(payload) {
    return ipcRenderer.invoke("aiwb:save-file", payload);
  },
  openExternalFile(payload) {
    return ipcRenderer.invoke("aiwb:open-external-file", payload);
  },
  pickEnvironmentFile() {
    return ipcRenderer.invoke("aiwb:pick-environment-file");
  },
  readClipboardAttachments() {
    return ipcRenderer.invoke("aiwb:read-clipboard-attachments");
  },
  getAppInfo() {
    return ipcRenderer.invoke("aiwb:get-app-info");
  },
  routeIntent(payload) {
    return ipcRenderer.invoke("aiwb:route-intent", payload);
  },
  startVoice(payload) {
    return ipcRenderer.invoke("aiwb:start-voice", payload);
  },
  stopVoice() {
    return ipcRenderer.invoke("aiwb:stop-voice");
  },
  startWakeWord(payload) {
    return ipcRenderer.invoke("aiwb:start-wake-word", payload);
  },
  stopWakeWord() {
    return ipcRenderer.invoke("aiwb:stop-wake-word");
  },
  onVoiceTranscript(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("aiwb:voice-transcript", listener);
    return () => ipcRenderer.removeListener("aiwb:voice-transcript", listener);
  },
  speakText(payload) {
    return ipcRenderer.invoke("aiwb:speak-text", payload);
  },
  stopSpeechOutput() {
    return ipcRenderer.invoke("aiwb:stop-speech-output");
  },
  saveProfile(payload) {
    return ipcRenderer.invoke("aiwb:save-profile", payload);
  },
  loadProfile() {
    return ipcRenderer.invoke("aiwb:load-profile");
  },
  onProfileUpdated(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("aiwb:profile-updated", listener);
    return () => ipcRenderer.removeListener("aiwb:profile-updated", listener);
  },
  clearProfile() {
    return ipcRenderer.invoke("aiwb:clear-profile");
  },
  appendLog(payload) {
    return ipcRenderer.invoke("aiwb:append-log", payload);
  },
  exportLogs(payload) {
    return ipcRenderer.invoke("aiwb:export-logs", payload);
  },
  clearLogs() {
    return ipcRenderer.invoke("aiwb:clear-logs");
  },
  clearAppCache() {
    return ipcRenderer.invoke("aiwb:clear-app-cache");
  },
});
