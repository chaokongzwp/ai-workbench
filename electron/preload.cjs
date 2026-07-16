const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiWorkbench", {
  platform: "mac",
  runCommand(payload) {
    return ipcRenderer.invoke("aiwb:run-command", payload);
  },
  openTerminal(payload) {
    return ipcRenderer.invoke("aiwb:open-terminal", payload);
  },
  openChatWindow(payload) {
    return ipcRenderer.invoke("aiwb:open-chat-window", payload);
  },
  saveFile(payload) {
    return ipcRenderer.invoke("aiwb:save-file", payload);
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
});
