const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiWorkbench", {
  platform: "mac",
  runCommand(payload) {
    return ipcRenderer.invoke("aiwb:run-command", payload);
  },
  saveProfile(payload) {
    return ipcRenderer.invoke("aiwb:save-profile", payload);
  },
  loadProfile() {
    return ipcRenderer.invoke("aiwb:load-profile");
  },
  clearProfile() {
    return ipcRenderer.invoke("aiwb:clear-profile");
  },
});
