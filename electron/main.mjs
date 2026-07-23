import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } from "electron";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { appendFile, chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const preloadPath = join(__dirname, "preload.cjs");
const rendererUrl = process.env.ELECTRON_RENDERER_URL || "";
const isDev = Boolean(rendererUrl);

let mainWindow;
const chatWindows = new Map();
let speechHelperBuildPromise;
let activeSpeechRun;
let activeWakeRun;
let activeSpeechOutputRun;
let profileSaveChain = Promise.resolve();

function isBrokenPipeError(error) {
  return error?.code === "EPIPE" || String(error?.message || error || "").includes("EPIPE");
}

function installSafeConsole() {
  for (const stream of [process.stdout, process.stderr]) {
    stream?.on?.("error", (error) => {
      if (isBrokenPipeError(error)) return;
    });
  }

  for (const method of ["log", "info", "warn", "error", "debug"]) {
    const original = console[method]?.bind(console);
    if (!original) continue;
    console[method] = (...args) => {
      try {
        original(...args);
      } catch (error) {
        if (isBrokenPipeError(error)) return;
      }
    };
  }
}

installSafeConsole();

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function loadRenderer(window, query = {}) {
  if (rendererUrl) {
    const url = new URL(rendererUrl);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    window.loadURL(url.toString());
    return;
  }
  window.loadFile(join(projectRoot, "dist", "index.html"), { query });
}

function createWindow({ chatServerId = "", title = "" } = {}) {
  const detachedChat = Boolean(chatServerId);
  appendPersistentLogSync("info", "app.window.create", {
    detachedChat,
    chatServerId,
    title,
    windowCount: BrowserWindow.getAllWindows().length,
  });
  const window = new BrowserWindow({
    width: detachedChat ? 900 : 1180,
    height: detachedChat ? 760 : 820,
    minWidth: detachedChat ? 720 : 1040,
    minHeight: detachedChat ? 560 : 720,
    title: detachedChat && title ? title : "AI Workbench",
    backgroundColor: "#f2f2f7",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (detachedChat) chatWindows.set(chatServerId, window);
  else mainWindow = window;

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(["media", "microphone"].includes(permission));
  });

  const shouldLogRendererConsole =
    isDev || process.env.AIWB_ELECTRON_MODE === "preview" || process.env.AIWB_LOG_RENDERER === "1";
  if (shouldLogRendererConsole) {
    window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
      if (level >= 2) {
        appendPersistentLogSync("warn", "app.renderer.console", {
          detachedChat,
          chatServerId,
          level,
          message,
          line,
          sourceId,
        });
      }
    });
  }
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[renderer gone]", details);
    appendPersistentLogSync("error", "app.renderer.gone", {
      detachedChat,
      chatServerId,
      reason: details?.reason || "",
      exitCode: details?.exitCode ?? "",
    });
  });
  window.webContents.on("unresponsive", () => {
    appendPersistentLogSync("warn", "app.window.unresponsive", { detachedChat, chatServerId });
  });
  window.webContents.on("responsive", () => {
    appendPersistentLogSync("info", "app.window.responsive", { detachedChat, chatServerId });
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    appendPersistentLogSync("error", "app.window.load_failed", {
      detachedChat,
      chatServerId,
      errorCode,
      errorDescription,
      validatedURL,
    });
  });

  loadRenderer(window, detachedChat ? { window: "chat", serverId: chatServerId } : {});

  window.on("close", () => {
    appendPersistentLogSync("info", "app.window.close", {
      detachedChat,
      chatServerId,
      windowCount: BrowserWindow.getAllWindows().length,
    });
  });
  window.on("closed", () => {
    appendPersistentLogSync("info", "app.window.closed", {
      detachedChat,
      chatServerId,
      windowCount: BrowserWindow.getAllWindows().length,
    });
    if (detachedChat) chatWindows.delete(chatServerId);
    else if (mainWindow === window) mainWindow = undefined;
  });

  if (isDev || process.env.AIWB_OPEN_DEVTOOLS === "1") {
    window.webContents.openDevTools({ mode: "detach" });
  }

  return window;
}

function openChatWindow({ serverId, title } = {}) {
  const normalizedServerId = String(serverId || "").trim();
  if (!normalizedServerId) throw new Error("Missing required field: serverId");
  const existing = chatWindows.get(normalizedServerId);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return { ok: true, reused: true };
  }
  createWindow({ chatServerId: normalizedServerId, title: String(title || "").trim() });
  return { ok: true, reused: false };
}

function profileFilePath() {
  return join(app.getPath("userData"), "connection-profile.json");
}

function mergeWorkspaceMessages(currentMessages = [], incomingMessages = []) {
  const byId = new Map();
  for (const message of [...currentMessages, ...incomingMessages]) {
    const id = String(message?.id || "").trim();
    if (!id) continue;
    byId.set(id, { ...(byId.get(id) || {}), ...message });
  }
  return [...byId.values()]
    .sort((left, right) => Number(left.createdAtMs || 0) - Number(right.createdAtMs || 0))
    .slice(-120);
}

function mergeWorkspaceProfile(currentProfile = {}, incomingProfile = {}) {
  if (!Array.isArray(incomingProfile.servers)) return incomingProfile;
  const currentServers = new Map(
    (Array.isArray(currentProfile.servers) ? currentProfile.servers : []).map((server) => [server.id, server]),
  );
  return {
    ...currentProfile,
    ...incomingProfile,
    servers: incomingProfile.servers.map((server) => {
      const current = currentServers.get(server.id);
      if (!current) return server;
      return {
        ...current,
        ...server,
        messages: mergeWorkspaceMessages(current.messages, server.messages),
      };
    }),
  };
}

function broadcastProfileUpdated(profile, senderWebContentsId, metadata = {}) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    if (window.webContents.id === senderWebContentsId) continue;
    window.webContents.send("aiwb:profile-updated", { profile, ...metadata });
  }
}

function diagnosticLogDir() {
  return join(app.getPath("userData"), "diagnostics");
}

function diagnosticLogPath(date = new Date()) {
  return join(diagnosticLogDir(), `ai-workbench-${date.toISOString().slice(0, 10)}.jsonl`);
}

function readPlistString(text, key) {
  const pattern = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`, "m");
  return pattern.exec(String(text || ""))?.[1]?.trim() || "";
}

async function getAppRuntimeInfo() {
  const fallbackVersion = app.getVersion();
  let bundleShortVersion = "";
  let bundleVersion = "";
  let bundleIdentifier = "";

  try {
    const infoPath = join(process.resourcesPath || "", "..", "Info.plist");
    if (infoPath && existsSync(infoPath)) {
      const infoText = await readFile(infoPath, "utf8");
      bundleShortVersion = readPlistString(infoText, "CFBundleShortVersionString");
      bundleVersion = readPlistString(infoText, "CFBundleVersion");
      bundleIdentifier = readPlistString(infoText, "CFBundleIdentifier");
    }
  } catch (error) {
    await appendPersistentLog("warn", "app.info.read-failed", { message: error?.message || String(error) });
  }

  const version = bundleShortVersion || fallbackVersion || "0.0.0";
  const build = bundleVersion || "";
  return {
    name: app.getName() || "AI Workbench",
    version,
    build,
    displayVersion: build && build !== version ? `${version} (${build})` : version,
    bundleIdentifier,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    packaged: app.isPackaged,
    mas: Boolean(process.mas),
    appPath: app.getAppPath(),
    userDataPath: app.getPath("userData"),
  };
}

function isSensitiveDiagnosticKey(key) {
  return /password|token|secret|accesskey|api[-_]?key|authorization|credential|base64/i.test(String(key || ""));
}

function isNoisyDiagnosticKey(key) {
  return /stdout|stderr|requestBody|body|messages|output|rawOutput|transcript/i.test(String(key || ""));
}

function sanitizeDiagnosticValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[depth-limit]";
  if (typeof value === "string") return value.length > 600 ? `${value.slice(0, 600)}...[truncated:${value.length}]` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeDiagnosticValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, item]) => {
      if (isSensitiveDiagnosticKey(key)) acc[key] = "[redacted]";
      else if (isNoisyDiagnosticKey(key)) acc[key] = `[omitted:${String(item ?? "").length}]`;
      else acc[key] = sanitizeDiagnosticValue(item, depth + 1);
      return acc;
    }, {});
  }
  return String(value);
}

async function appendPersistentLog(level, event, fields = {}) {
  try {
    await mkdir(diagnosticLogDir(), { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      level: String(level || "info"),
      event: String(event || "app.event"),
      fields: sanitizeDiagnosticValue(fields),
    };
    await appendFile(diagnosticLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.warn("[aiwb:diagnostics:write-failed]", error?.message || error);
  }
}

function appendPersistentLogSync(level, event, fields = {}) {
  try {
    mkdirSync(diagnosticLogDir(), { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      level: String(level || "info"),
      event: String(event || "app.event"),
      fields: sanitizeDiagnosticValue(fields),
    };
    appendFileSync(diagnosticLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.warn("[aiwb:diagnostics:write-failed]", error?.message || error);
  }
}

function zipDosDateFields(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

let crc32Table;
function crc32(buffer) {
  if (!crc32Table) {
    crc32Table = Array.from({ length: 256 }, (_item, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data || ""), "utf8");
    const name = String(entry.name || "file").replace(/^\/+/, "").replace(/\\/g, "/");
    const nameBuffer = Buffer.from(name, "utf8");
    const checksum = crc32(data);
    const { time, date } = zipDosDateFields(entry.date || new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function exportLogs(payload = {}) {
  const appInfo = await getAppRuntimeInfo();
  await appendPersistentLog("info", "diagnostics.export.requested", {
    app: appInfo,
    context: payload.context || payload.workspace || {},
  });

  const entries = [
    {
      name: "diagnostics.json",
      data: JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          appVersion: appInfo.version,
          appBuild: appInfo.build,
          app: appInfo,
          platform: process.platform,
          arch: process.arch,
          electron: process.versions.electron,
          node: process.versions.node,
          context: sanitizeDiagnosticValue(payload.context || payload.workspace || {}),
        },
        null,
        2,
      ),
    },
  ];

  const dir = diagnosticLogDir();
  if (existsSync(dir)) {
    const names = (await readdir(dir)).filter((name) => name.endsWith(".jsonl")).sort();
    for (const name of names.slice(-14)) {
      entries.push({ name: `logs/${name}`, data: await readFile(join(dir, name)) });
    }
  }

  const zip = makeZip(entries);
  const defaultPath = `AI-Workbench-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "保存诊断日志",
    defaultPath,
    buttonLabel: "保存",
  });
  if (canceled || !filePath) return { ok: true, canceled: true };
  await writeFile(filePath, zip);
  await appendPersistentLog("info", "diagnostics.export.saved", { path: filePath, size: zip.length });
  return { ok: true, path: filePath, name: defaultPath };
}

function encryptProfilePayload(profile) {
  const value = profile && typeof profile === "object" ? profile : {};
  if (!safeStorage.isEncryptionAvailable()) return { ...value, insecurePasswordStorage: true };
  return {
    payloadEncrypted: safeStorage.encryptString(JSON.stringify(value)).toString("base64"),
  };
}

function decryptProfile(profile) {
  if (!profile || typeof profile !== "object") return {};
  if (profile.payloadEncrypted) {
    try {
      return JSON.parse(safeStorage.decryptString(Buffer.from(profile.payloadEncrypted, "base64")));
    } catch {
      return {};
    }
  }
  if (!profile.passwordEncrypted) return profile;
  try {
    return {
      ...profile,
      password: safeStorage.decryptString(Buffer.from(profile.passwordEncrypted, "base64")),
      passwordEncrypted: undefined,
    };
  } catch {
    return { ...profile, password: "" };
  }
}

function normalizeConnection(input = {}) {
  const host = String(input.host || "").trim();
  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  const commandPayload =
    input.command && typeof input.command === "object"
      ? input.command
      : { command: input.command };
  const command = String(commandPayload.command || "").trim();
  const stdin = String(commandPayload.stdin || input.stdin || "");
  const uploadScript = Boolean(commandPayload.uploadScript || input.uploadScript);

  if (!host) throw new Error("Missing required field: host");
  if (!username) throw new Error("Missing required field: username");
  if (!password) throw new Error("Missing required field: password");
  if (!command) throw new Error("Missing required field: command");

  return {
    host,
    username,
    password,
    command,
    stdin,
    uploadScript,
    port: Math.max(1, Number(input.port || 22) || 22),
    connectTimeoutSeconds: Math.max(3, Math.min(Number(input.connectTimeoutSeconds || 15) || 15, 60)),
    commandTimeoutSeconds: Math.max(5, Math.min(Number(input.commandTimeoutSeconds || 180) || 180, 7200)),
    maxResponseSize: Math.max(1024, Math.min(Number(input.maxResponseSize || 1_048_576) || 1_048_576, 83_886_080)),
  };
}

function safeDownloadFileName(value) {
  const name = String(value || "download")
    .trim()
    .replace(/[\\/:\0]/g, "-")
    .replace(/^\.+$/g, "download")
    .slice(0, 180);
  return name || "download";
}

function powershellLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function shellLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "'\\''")}'`;
}

function appleScriptString(value) {
  return `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function sftpWindowsPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function normalizeTerminalRequest(input = {}) {
  const host = String(input.host || "").trim();
  const username = String(input.username || "").trim();
  const port = Math.max(1, Number(input.port || 22) || 22);
  const platform = ["windows", "wsl"].includes(input.platform) ? input.platform : "linux";
  const wslDistro = String(input.wslDistro || "").trim();
  const workdir = String(input.workdir || "").trim();
  const tmuxSession = String(input.tmuxSession || "").trim();
  const action = String(input.action || "").trim();
  const agentId = input.agentId === "claude" ? "claude" : "codex";
  const agentCommand = String(input.agentCommand || (agentId === "claude" ? "claude" : "codex")).trim();

  if (!host) throw new Error("请先填写服务器 IP 或域名");
  if (!username) throw new Error("请先填写登录用户名");

  return { host, username, port, platform, wslDistro, workdir, tmuxSession, action, agentId, agentCommand };
}

function terminalLoginCommand(config) {
  const command = config.agentCommand || (config.agentId === "claude" ? "claude" : "codex");
  return config.agentId === "claude" ? command : `${command} login`;
}

function terminalAgentLabel(agentId) {
  return agentId === "claude" ? "Claude" : "Codex";
}

function buildLinuxTerminalRemoteCommand(config) {
  const steps = [];
  if (config.workdir) steps.push(`cd ${shellLiteral(config.workdir)} 2>/dev/null || true`);
  if (config.action === "agent-login") {
    const label = terminalAgentLabel(config.agentId);
    steps.push(`echo ${shellLiteral(`AI Workbench: 正在打开 ${label} 登录流程。登录完成后可以关闭这个窗口。`)}`);
    steps.push(terminalLoginCommand(config));
    steps.push(`echo ${shellLiteral(`AI Workbench: ${label} 登录命令已结束。可以关闭窗口，或继续在这里操作。`)}`);
    steps.push(`exec "\${SHELL:-/bin/bash}" -l`);
    return steps.join("; ");
  }
  if (config.tmuxSession) {
    steps.push(
      `if command -v tmux >/dev/null 2>&1 && tmux has-session -t ${shellLiteral(config.tmuxSession)} 2>/dev/null; then exec tmux attach -t ${shellLiteral(config.tmuxSession)}; fi`,
    );
  }
  steps.push(`exec "\${SHELL:-/bin/bash}" -l`);
  return steps.join("; ");
}

function buildWslTerminalDistroSetup(config) {
  return `
$AIWB_DISTRO = ${powershellLiteral(config.wslDistro)}
if (-not $AIWB_DISTRO) {
  $AIWB_PROCESS = New-Object System.Diagnostics.Process
  $AIWB_PROCESS.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
  $AIWB_PROCESS.StartInfo.FileName = "wsl.exe"
  $AIWB_PROCESS.StartInfo.Arguments = "--list --quiet"
  $AIWB_PROCESS.StartInfo.UseShellExecute = $false
  $AIWB_PROCESS.StartInfo.CreateNoWindow = $true
  $AIWB_PROCESS.StartInfo.RedirectStandardOutput = $true
  $AIWB_PROCESS.StartInfo.StandardOutputEncoding = [System.Text.Encoding]::Unicode
  [void]$AIWB_PROCESS.Start()
  $AIWB_OUTPUT = $AIWB_PROCESS.StandardOutput.ReadToEnd()
  $AIWB_PROCESS.WaitForExit()
  $AIWB_DISTRO = [string](@(
    $AIWB_OUTPUT -split "[\\r\\n]+" |
      ForEach-Object { ([string]$_).Trim() } |
      Where-Object {
        $_ -and $_ -notmatch '^(docker-desktop(?:-data)?|rancher-desktop(?:-data)?|podman-machine(?:-.+)?)$'
      }
  ) | Select-Object -First 1)
}
if (-not $AIWB_DISTRO) { throw "没有找到可用的 WSL Linux 发行版。" }
`;
}

function buildTerminalRemoteCommand(config) {
  if (config.platform === "windows") {
    if (config.action === "agent-login") {
      const label = terminalAgentLabel(config.agentId);
      const command = terminalLoginCommand(config);
      const script = `
if (${powershellLiteral(config.workdir)}) {
  Set-Location -LiteralPath ${powershellLiteral(config.workdir)}
}
Write-Host ${powershellLiteral(`AI Workbench: 正在打开 ${label} 登录流程。登录完成后可以关闭这个窗口。`)}
Invoke-Expression ${powershellLiteral(command)}
Write-Host ${powershellLiteral(`AI Workbench: ${label} 登录命令已结束。可以关闭窗口，或继续在这里操作。`)}
`;
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      return `powershell -NoLogo -NoExit -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
    }
    if (!config.workdir) return "powershell -NoLogo -NoExit";
    return `powershell -NoLogo -NoExit -Command "Set-Location -LiteralPath ${powershellLiteral(config.workdir)}"`;
  }
  if (config.platform === "wsl") {
    const linuxCommand = buildLinuxTerminalRemoteCommand({ ...config, platform: "linux" });
    const script = `
${buildWslTerminalDistroSetup(config)}
& wsl.exe -d $AIWB_DISTRO -u root -- bash -lc ${powershellLiteral(linuxCommand)}
`;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    return `powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
  }
  return buildLinuxTerminalRemoteCommand(config);
}

async function openSshTerminal(payload = {}) {
  if (process.platform !== "darwin") {
    throw new Error("打开 SSH 终端目前只支持 Mac App。");
  }

  const config = normalizeTerminalRequest(payload);
  const target = `${config.username}@${config.host}`;
  const remoteCommand = buildTerminalRemoteCommand(config);
  const sshCommand = [
    "ssh",
    "-t",
    "-p",
    String(config.port),
    shellLiteral(target),
    shellLiteral(remoteCommand),
  ].join(" ");
  const script = `
tell application "Terminal"
  activate
  do script ${appleScriptString(sshCommand)}
end tell
`;

  await runProcess("/usr/bin/osascript", ["-e", script]);
  return { ok: true };
}

function normalizeMainAIRequest(input = {}) {
  const apiKey = String(input.apiKey || "").trim();
  const requestBody = input.requestBody && typeof input.requestBody === "object" ? input.requestBody : null;
  const timeoutSeconds = Math.max(5, Math.min(Number(input.timeoutSeconds || 20) || 20, 60));

  if (!apiKey) throw new Error("Missing required field: OpenAI API key");
  if (!requestBody) throw new Error("Missing required field: requestBody");

  return { apiKey, requestBody, timeoutSeconds };
}

function speechHelperInfoPlist(executableName = "SpeechHelper") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.beexofficial.beex.test.mac.speech-helper</string>
  <key>CFBundleExecutable</key>
  <string>${executableName}</string>
  <key>CFBundleName</key>
  <string>AI Workbench Speech Helper</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>AI Workbench 使用麦克风把语音转成任务文本。</string>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>AI Workbench 使用语音识别把你的语音转成文字。</string>
</dict>
</plist>
`;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}

function macToolchainEnv(extra = {}) {
  const {
    SDKROOT,
    IPHONEOS_DEPLOYMENT_TARGET,
    TVOS_DEPLOYMENT_TARGET,
    WATCHOS_DEPLOYMENT_TARGET,
    MACOSX_DEPLOYMENT_TARGET,
    ...baseEnv
  } = process.env;

  return {
    ...baseEnv,
    DEVELOPER_DIR: baseEnv.DEVELOPER_DIR || "/Applications/Xcode.app/Contents/Developer",
    MACOSX_DEPLOYMENT_TARGET: "13.0",
    ...extra,
  };
}

async function ensureSpeechHelper() {
  if (process.platform !== "darwin") {
    throw new Error("语音输入目前只支持 macOS、iPhone 和 iPad。");
  }
  if (speechHelperBuildPromise) return speechHelperBuildPromise;

  speechHelperBuildPromise = (async () => {
    const sourcePath = join(__dirname, "native", "SpeechHelper.swift");
    const source = await readFile(sourcePath, "utf8");
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 12);
    const helperDir = join(app.getPath("userData"), "helpers", "speech-helper");
    const helperAppDir = join(helperDir, `SpeechHelper-${hash}.app`);
    const contentsDir = join(helperAppDir, "Contents");
    const macosDir = join(contentsDir, "MacOS");
    const sourceCopyPath = join(helperDir, `SpeechHelper-${hash}.swift`);
    const plistPath = join(contentsDir, "Info.plist");
    const binaryPath = join(macosDir, "SpeechHelper");

    await mkdir(macosDir, { recursive: true });
    if (existsSync(binaryPath)) return { appPath: helperAppDir, binaryPath };

    await writeFile(sourceCopyPath, source);
    await writeFile(plistPath, speechHelperInfoPlist("SpeechHelper"));

    const buildEnv = macToolchainEnv();
    const sdkLookup = await runProcess("/usr/bin/xcrun", ["--sdk", "macosx", "--show-sdk-path"], { env: buildEnv });
    const sdkPath = sdkLookup.stdout.trim();
    if (!sdkPath) {
      throw new Error(`找不到 macOS SDK：${(sdkLookup.stderr || sdkLookup.stdout).slice(0, 800)}`);
    }

    const swiftcLookup = await runProcess("/usr/bin/xcrun", ["--sdk", "macosx", "-find", "swiftc"], { env: buildEnv });
    const swiftc = swiftcLookup.stdout.trim() || "/usr/bin/swiftc";
    const targetArch = process.arch === "arm64" ? "arm64" : "x86_64";
    const compile = await runProcess(swiftc, [
      sourceCopyPath,
      "-O",
      "-sdk",
      sdkPath,
      "-target",
      `${targetArch}-apple-macosx13.0`,
      "-framework",
      "Speech",
      "-framework",
      "AVFoundation",
      "-framework",
      "Foundation",
      "-Xlinker",
      "-sectcreate",
      "-Xlinker",
      "__TEXT",
      "-Xlinker",
      "__info_plist",
      "-Xlinker",
      plistPath,
      "-o",
      binaryPath,
    ], { env: macToolchainEnv({ SDKROOT: sdkPath }) });

    if (compile.code !== 0) {
      throw new Error(`Mac 语音组件编译失败：${(compile.stderr || compile.stdout).slice(0, 1200)}`);
    }
    await chmod(binaryPath, 0o755);
    return { appPath: helperAppDir, binaryPath };
  })();

  return speechHelperBuildPromise;
}

function parseSpeechHelperOutput(stdout, stderr, fallbackPayload = null) {
  const jsonLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => {
      if (!line.startsWith("{") || !line.endsWith("}")) return false;
      try {
        const payload = JSON.parse(line);
        return payload?.event !== "partial";
      } catch {
        return false;
      }
    });

  if (!jsonLine) {
    if (fallbackPayload) return fallbackPayload;
    if (!(stderr || "").trim()) return { ok: true, text: "", detected: false };
    throw new Error((stderr || stdout || "语音识别没有返回结果。").trim().slice(0, 1000));
  }

  const payload = JSON.parse(jsonLine);
  if (payload?.ok === false) {
    throw new Error(String(payload.error || "语音识别失败。"));
  }
  return payload;
}

async function runSpeechHelper(args, slot, timeoutMs) {
  const helper = await ensureSpeechHelper();
  const eventFile = join(app.getPath("temp"), `ai-workbench-speech-${Date.now()}-${randomUUID()}.jsonl`);
  await writeFile(eventFile, "");

  return new Promise((resolvePromise, reject) => {
    const child = spawn("/usr/bin/open", ["-n", "-W", helper.appPath, "--args", ...args, "--event-file", eventFile], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const run = { child, stopRequested: false, eventFile };
    if (slot === "wake") activeWakeRun = run;
    else activeSpeechRun = run;

    let stdout = "";
    let stderr = "";
    let eventOutput = "";
    let eventLineBuffer = "";
    let stdoutLineBuffer = "";
    let lastPartialText = "";
    const timer = setTimeout(() => {
      run.stopRequested = true;
      stopSpeechProcess(run);
    }, timeoutMs);

    const processStdoutLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return;
      try {
        const payload = JSON.parse(trimmed);
        if (payload?.event === "partial" && slot === "speech") {
          lastPartialText = String(payload.text || "");
          sendToRenderer("aiwb:voice-transcript", {
            text: lastPartialText,
          });
        }
      } catch {
        // Non-final helper output should not fail the recognition request.
      }
    };

    const consumeEventText = (text) => {
      eventOutput += text;
      eventLineBuffer += text;
      const lines = eventLineBuffer.split(/\r?\n/);
      eventLineBuffer = lines.pop() ?? "";
      lines.forEach(processStdoutLine);
    };

    let eventFileOffset = 0;
    const readEventFile = async () => {
      try {
        const text = await readFile(eventFile, "utf8");
        if (text.length <= eventFileOffset) return;
        const nextText = text.slice(eventFileOffset);
        eventFileOffset = text.length;
        consumeEventText(nextText);
      } catch {
        // The helper may not have created the file yet.
      }
    };
    const eventPoller = setInterval(() => {
      readEventFile();
    }, 100);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      stdoutLineBuffer += text;
      const lines = stdoutLineBuffer.split(/\r?\n/);
      stdoutLineBuffer = lines.pop() ?? "";
      lines.forEach(processStdoutLine);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      clearInterval(eventPoller);
      if (slot === "wake" && activeWakeRun === run) activeWakeRun = undefined;
      if (slot !== "wake" && activeSpeechRun === run) activeSpeechRun = undefined;
      reject(error);
    });
    child.on("close", async () => {
      clearTimeout(timer);
      clearInterval(eventPoller);
      await readEventFile();
      if (slot === "wake" && activeWakeRun === run) activeWakeRun = undefined;
      if (slot !== "wake" && activeSpeechRun === run) activeSpeechRun = undefined;

      if (run.stopRequested) {
        rm(eventFile, { force: true }).catch(() => {});
        resolvePromise({ ok: true, stopped: true, text: "", detected: false });
        return;
      }

      try {
        resolvePromise(
          parseSpeechHelperOutput(
            eventOutput || stdout,
            stderr,
            slot === "speech" ? { ok: true, text: lastPartialText } : null,
          ),
        );
      } catch (error) {
        reject(error);
      } finally {
        rm(eventFile, { force: true }).catch(() => {});
      }
    });
  });
}

function stopSpeechProcess(run) {
  if (!run?.child) return;
  run.stopCloud?.();
  if (run.eventFile) {
    spawn("/usr/bin/pkill", ["-f", run.eventFile], { stdio: "ignore" });
  }
  run.child.kill("SIGTERM");
}

function stopSpeechRun(run) {
  if (!run?.child) return { ok: true };
  run.stopRequested = true;
  stopSpeechProcess(run);
  return { ok: true };
}

function stopSpeechOutput() {
  if (!activeSpeechOutputRun?.child) return { ok: true };
  activeSpeechOutputRun.stopRequested = true;
  activeSpeechOutputRun.stopCloud?.();
  if (activeSpeechOutputRun.child.stdin && !activeSpeechOutputRun.child.stdin.destroyed) {
    activeSpeechOutputRun.child.stdin.end();
  }
  activeSpeechOutputRun.child.kill("SIGTERM");
  activeSpeechOutputRun = undefined;
  return { ok: true };
}

function pisenAppRoot() {
  return process.env.PISEN_APP_ROOT || "/Users/zwp/pisenCode/app";
}

const builtInDashScopeConfig = {
  apiKey: "",
  workspaceId: "llm-0hn2qaqnqgcdfnbg",
};

async function loadPisenDashScopeConfig(input = {}) {
  const payloadApiKey = String(input.apiKey || input.aliyunApiKey || "").trim();
  const payloadWorkspaceId = String(input.workspaceId || input.aliyunWorkspaceId || "").trim();
  if (payloadApiKey) return { apiKey: payloadApiKey, workspaceId: payloadWorkspaceId };

  const apiKey =
    String(process.env.PISEN_DASHSCOPE_API_KEY || "").trim() ||
    builtInDashScopeConfig.apiKey ||
    "";
  const workspaceId =
    String(process.env.PISEN_DASHSCOPE_WORKSPACE_ID || "").trim() ||
    builtInDashScopeConfig.workspaceId ||
    "";

  if (!apiKey) {
    throw new Error("没有找到可用的阿里云 DashScope API Key。");
  }

  return { apiKey, workspaceId };
}

function createWebSocketFrame(payload, opcode = 2) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | body.length]);
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }

  const mask = randomBytes(4);
  const maskedBody = Buffer.alloc(body.length);
  for (let index = 0; index < body.length; index += 1) {
    maskedBody[index] = body[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, mask, maskedBody]);
}

class WebSocketFrameParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames = [];

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < offset + 2) break;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) break;
        const bigLength = this.buffer.readBigUInt64BE(offset);
        if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("TTS WebSocket frame is too large.");
        }
        length = Number(bigLength);
        offset += 8;
      }

      let mask;
      if (masked) {
        if (this.buffer.length < offset + 4) break;
        mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + length) break;

      let payload = this.buffer.subarray(offset, offset + length);
      if (masked && mask) {
        const unmasked = Buffer.alloc(payload.length);
        for (let index = 0; index < payload.length; index += 1) {
          unmasked[index] = payload[index] ^ mask[index % 4];
        }
        payload = unmasked;
      }

      this.buffer = this.buffer.subarray(offset + length);
      frames.push({ opcode, payload });
    }

    return frames;
  }
}

async function startPisenPcmHelper({ timeoutSeconds, silenceSeconds }) {
  const helper = await ensureSpeechHelper();
  const eventFile = join(app.getPath("temp"), `ai-workbench-pisen-asr-${Date.now()}-${randomUUID()}.jsonl`);
  await writeFile(eventFile, "");
  const child = spawn(
    "/usr/bin/open",
    [
      "-n",
      "-W",
      helper.appPath,
      "--args",
      "pcm",
      "--timeout",
      String(timeoutSeconds),
      "--silence",
      String(silenceSeconds),
      "--event-file",
      eventFile,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  return { child, eventFile };
}

function dashScopeAsrRunTask({ taskId, sampleRate }) {
  return {
    header: {
      action: "run-task",
      task_id: taskId,
      streaming: "duplex",
    },
    payload: {
      task_group: "audio",
      task: "asr",
      function: "recognition",
      model: "paraformer-realtime-v2",
      parameters: {
        format: "pcm",
        sample_rate: sampleRate,
        disfluency_removal_enabled: false,
        language_hints: ["zh"],
        semantic_punctuation_enabled: false,
        max_sentence_silence: 3000,
        punctuation_prediction_enabled: true,
        inverse_text_normalization_enabled: true,
      },
      input: {},
    },
  };
}

function dashScopeAsrFinishTask(taskId) {
  return {
    header: {
      action: "finish-task",
      task_id: taskId,
      streaming: "duplex",
    },
    payload: {
      input: {},
    },
  };
}

function joinTranscriptSegments(segments, interim = "") {
  return [...segments, interim]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function sentenceTextFromAsr(sentence) {
  const text = String(sentence?.text || "").trim();
  if (text) return text;

  if (Array.isArray(sentence?.words)) {
    return sentence.words
      .map((word) => `${String(word?.text || "")}${String(word?.punctuation || "")}`)
      .join("")
      .trim();
  }

  return "";
}

function sendJsonWebSocketFrame(socket, payload) {
  socket.write(createWebSocketFrame(Buffer.from(JSON.stringify(payload), "utf8"), 1));
}

async function startPisenAsr(payload = {}) {
  if (process.platform !== "darwin") {
    throw new Error("pisenCode ASR 当前仅支持在 Mac 调试进程中调用。iPhone/iPad 会走原生阿里云语音插件。");
  }

  const config = await loadPisenDashScopeConfig(payload);
  const timeoutSeconds = Math.max(5, Math.min(Number(payload.timeoutSeconds || 30) || 30, 120));
  const silenceSeconds = Math.max(0.8, Math.min(Number(payload.silenceSeconds || 3) || 3, 10));
  const helperRun = await startPisenPcmHelper({ timeoutSeconds, silenceSeconds });

  return new Promise((resolvePromise, reject) => {
    const host = "dashscope.aliyuncs.com";
    const path = "/api-ws/v1/inference";
    const taskId = randomUUID();
    const socket = tlsConnect({ host, port: 443, servername: host });
    const frameParser = new WebSocketFrameParser();
    const run = {
      child: helperRun.child,
      eventFile: helperRun.eventFile,
      socket,
      stopRequested: false,
      stopCloud() {
        socket.destroy();
      },
    };
    activeSpeechRun = run;

    let stdout = "";
    let stderr = "";
    let eventFileOffset = 0;
    let handshakeBuffer = Buffer.alloc(0);
    let upgraded = false;
    let taskStarted = false;
    let finishSent = false;
    let helperDone = false;
    let sampleRate = 16000;
    let bestText = "";
    let interimText = "";
    let settled = false;
    const audioQueue = [];
    const finalSegments = [];
    const finalSegmentKeys = new Set();

    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(eventPoller);
      if (activeSpeechRun === run) activeSpeechRun = undefined;
      rm(helperRun.eventFile, { force: true }).catch(() => {});
    };

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      stopSpeechProcess(run);
      fn();
    };

    const rejectWith = (error) => {
      const nextError = error instanceof Error ? error : new Error(String(error));
      nextError.audioBytes = audioBytes;
      finish(() => reject(nextError));
    };

    const flushAudioQueue = () => {
      if (!taskStarted || !upgraded) return;
      while (audioQueue.length) {
        socket.write(createWebSocketFrame(audioQueue.shift(), 2));
      }
      if (helperDone) sendFinishTask();
    };

    const sendFinishTask = () => {
      if (!taskStarted || finishSent || !upgraded) return;
      finishSent = true;
      sendJsonWebSocketFrame(socket, dashScopeAsrFinishTask(taskId));
    };

    const timer = setTimeout(() => {
      if (taskStarted) {
        sendFinishTask();
        return;
      }
      rejectWith(new Error("pisenCode ASR 请求超时。"));
    }, (timeoutSeconds + 12) * 1000);

    const handleAsrEvent = (event) => {
      const name = event?.header?.event;
      if (name === "task-started") {
        taskStarted = true;
        flushAudioQueue();
        return;
      }

      if (name === "result-generated") {
        const sentence = event?.payload?.output?.sentence;
        const nextText = sentenceTextFromAsr(sentence);
        if (!sentence?.heartbeat && nextText) {
          if (sentence.sentence_end) {
            interimText = "";
            const hasTiming = sentence.begin_time !== undefined || sentence.end_time !== undefined;
            const segmentKey = hasTiming ? `${sentence.begin_time ?? ""}:${sentence.end_time ?? ""}:${nextText}` : "";
            if (!segmentKey || !finalSegmentKeys.has(segmentKey)) {
              if (segmentKey) finalSegmentKeys.add(segmentKey);
              finalSegments.push(nextText);
            }
          } else {
            interimText = nextText;
          }

          bestText = joinTranscriptSegments(finalSegments, interimText);
          sendToRenderer("aiwb:voice-transcript", {
            text: bestText,
            isFinal: Boolean(sentence.sentence_end),
            provider: "pisen-dashscope-asr",
          });
        }
        return;
      }

      if (name === "task-finished") {
        finish(() => resolvePromise({ ok: true, text: bestText, provider: "pisen-dashscope-asr" }));
        return;
      }

      if (name === "task-failed") {
        rejectWith(new Error(event?.header?.error_message || event?.header?.error_code || "pisenCode ASR 任务失败。"));
      }
    };

    const processHelperLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return;
      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        return;
      }

      if (event.ok === false) {
        rejectWith(new Error(String(event.error || "pisenCode ASR 录音失败。")));
        return;
      }

      if (event.event === "audio-start") {
        sampleRate = Math.max(8000, Number(event.sampleRate || 16000) || 16000);
        sendToRenderer("aiwb:voice-transcript", {
          event: "recording-start",
          level: 0,
          sampleRate,
          inputSampleRate: Number(event.inputSampleRate || 0) || undefined,
          provider: "pisen-dashscope-asr",
        });
        return;
      }

      if (event.event === "level") {
        sendToRenderer("aiwb:voice-transcript", {
          event: "level",
          level: Math.max(0, Math.min(Number(event.level || 0) || 0, 1)),
          rms: Number(event.rms || 0) || 0,
          peak: Number(event.peak || 0) || 0,
          voice: Boolean(event.voice),
          provider: "pisen-dashscope-asr",
        });
        return;
      }

      if (event.event === "audio") {
        const audio = Buffer.from(String(event.data || ""), "base64");
        if (!audio.length) return;
        if (taskStarted && upgraded) {
          socket.write(createWebSocketFrame(audio, 2));
        } else {
          audioQueue.push(audio);
        }
        return;
      }

      if (event.event === "audio-end") {
        helperDone = true;
        sendFinishTask();
      }
    };

    const readHelperEvents = async () => {
      try {
        const text = await readFile(helperRun.eventFile, "utf8");
        if (text.length <= eventFileOffset) return;
        const nextText = text.slice(eventFileOffset);
        eventFileOffset = text.length;
        nextText.split(/\r?\n/).forEach(processHelperLine);
      } catch {
        // The helper may not have written anything yet.
      }
    };

    const eventPoller = setInterval(() => {
      readHelperEvents();
    }, 80);

    socket.on("secureConnect", () => {
      const key = randomBytes(16).toString("base64");
      const headers = [
        `GET ${path} HTTP/1.1`,
        `Host: ${host}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        `Authorization: Bearer ${config.apiKey}`,
        "user-agent: AI Workbench",
      ];
      if (config.workspaceId) {
        headers.push(`X-DashScope-WorkSpace: ${config.workspaceId}`);
      }
      headers.push("", "");
      socket.write(headers.join("\r\n"));
    });

    socket.on("data", (chunk) => {
      try {
        if (!upgraded) {
          handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
          const headerEnd = handshakeBuffer.indexOf("\r\n\r\n");
          if (headerEnd === -1) return;

          const headerText = handshakeBuffer.subarray(0, headerEnd).toString("utf8");
          if (!/^HTTP\/1\.1 101/i.test(headerText)) {
            rejectWith(new Error(`pisenCode ASR WebSocket 握手失败：${headerText.split(/\r?\n/)[0] || "unknown"}`));
            return;
          }

          upgraded = true;
          sendJsonWebSocketFrame(socket, dashScopeAsrRunTask({ taskId, sampleRate }));
          const rest = handshakeBuffer.subarray(headerEnd + 4);
          if (rest.length) {
            frameParser.push(rest).forEach((frame) => {
              if (frame.opcode === 1 || frame.opcode === 2) {
                handleAsrEvent(JSON.parse(frame.payload.toString("utf8")));
              }
            });
          }
          return;
        }

        frameParser.push(chunk).forEach((frame) => {
          if (frame.opcode === 8) {
            if (!settled) rejectWith(new Error("pisenCode ASR 连接被关闭。"));
            return;
          }
          if (frame.opcode === 9) {
            socket.write(createWebSocketFrame(frame.payload, 10));
            return;
          }
          if (frame.opcode === 1 || frame.opcode === 2) {
            handleAsrEvent(JSON.parse(frame.payload.toString("utf8")));
          }
        });
      } catch (error) {
        rejectWith(error);
      }
    });

    socket.on("error", rejectWith);
    socket.on("close", () => {
      if (!settled && !run.stopRequested) {
        rejectWith(new Error("pisenCode ASR 连接提前关闭。"));
      }
    });

    helperRun.child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    helperRun.child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    helperRun.child.on("error", rejectWith);
    helperRun.child.on("close", async () => {
      await readHelperEvents();
      helperDone = true;
      if (run.stopRequested) {
        finish(() => resolvePromise({ ok: true, stopped: true, text: "", provider: "pisen-dashscope-asr" }));
        return;
      }
      if (!taskStarted && !bestText && !audioQueue.length) {
        finish(() => resolvePromise({ ok: true, text: "", provider: "pisen-dashscope-asr" }));
        return;
      }
      sendFinishTask();
      if (stderr && !settled) {
        // Keep stderr only as diagnostic; cloud finalization may still complete.
      }
    });
  });
}

async function downloadAudioFromUrl(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`阿里云 TTS 音频下载失败 (${response.status})：${body.slice(0, 300)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function ffplayPath() {
  const explicit = String(process.env.FFPLAY_PATH || "").trim();
  if (explicit && existsSync(explicit)) return explicit;

  const candidates = ["/opt/homebrew/bin/ffplay", "/usr/local/bin/ffplay", "/usr/bin/ffplay"];
  return candidates.find((candidate) => existsSync(candidate)) || "ffplay";
}

function dashScopeTtsRunTask({ taskId, model, voiceName }) {
  return {
    header: {
      action: "run-task",
      task_id: taskId,
      streaming: "duplex",
    },
    payload: {
      task_group: "audio",
      task: "tts",
      function: "SpeechSynthesizer",
      model,
      parameters: {
        text_type: "PlainText",
        voice: voiceName,
        format: "mp3",
        sample_rate: 24000,
        volume: 50,
        rate: 1.0,
        pitch: 1.0,
        enable_ssml: false,
      },
      input: {},
    },
  };
}

function dashScopeTtsContinueTask(taskId, text) {
  return {
    header: {
      action: "continue-task",
      task_id: taskId,
      streaming: "duplex",
    },
    payload: {
      input: { text },
    },
  };
}

function dashScopeTtsFinishTask(taskId) {
  return {
    header: {
      action: "finish-task",
      task_id: taskId,
      streaming: "duplex",
    },
    payload: {
      input: {},
    },
  };
}

function splitTtsStreamText(text, maxLength = 480) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value ? [value] : [];

  const chunks = [];
  let rest = value;
  while (rest.length > 0) {
    if (rest.length <= maxLength) {
      chunks.push(rest);
      break;
    }

    const windowText = rest.slice(0, maxLength);
    const splitAt = Math.max(
      windowText.lastIndexOf("。"),
      windowText.lastIndexOf("！"),
      windowText.lastIndexOf("？"),
      windowText.lastIndexOf("；"),
      windowText.lastIndexOf("\n"),
    );
    const index = splitAt >= Math.floor(maxLength * 0.35) ? splitAt + 1 : maxLength;
    chunks.push(rest.slice(0, index).trim());
    rest = rest.slice(index).trim();
  }
  return chunks.filter(Boolean);
}

function playAliyunStreamingTts({ text, config, voiceName, model, timeoutMs = 60000 }) {
  const taskId = randomUUID();
  const host = String(process.env.PISEN_TTS_WS_HOST || "dashscope.aliyuncs.com").trim();
  const path = "/api-ws/v1/inference";
  const chunks = splitTtsStreamText(text);

  return new Promise((resolvePromise, reject) => {
    const player = spawn(ffplayPath(), ["-nodisp", "-autoexit", "-loglevel", "error", "-i", "pipe:0"], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    const socket = tlsConnect({ host, port: 443, servername: host });
    const frameParser = new WebSocketFrameParser();
    const run = {
      child: player,
      socket,
      stopRequested: false,
      stopCloud() {
        socket.destroy();
      },
    };
    activeSpeechOutputRun = run;

    let handshakeBuffer = Buffer.alloc(0);
    let upgraded = false;
    let taskFinished = false;
    let playerClosed = false;
    let playerExitCode = null;
    let playerStderr = "";
    let settled = false;
    let audioBytes = 0;

    const cleanup = () => {
      clearTimeout(timer);
      if (activeSpeechOutputRun === run) activeSpeechOutputRun = undefined;
      socket.destroy();
      if (!player.stdin.destroyed) {
        player.stdin.end();
      }
    };

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const rejectWith = (error) => {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
    };

    const maybeResolve = () => {
      if (!taskFinished || !playerClosed) return;
      if (run.stopRequested || playerExitCode === 0 || audioBytes > 0) {
        finish(() => resolvePromise({ ok: true, provider: "pisen-aliyun-streaming-tts", bytes: audioBytes }));
        return;
      }
      rejectWith(new Error((playerStderr || "阿里云流式 TTS 播放失败。").trim()));
    };

    const timer = setTimeout(() => {
      rejectWith(new Error("阿里云流式 TTS 请求超时。"));
    }, timeoutMs);

    const sendAllText = () => {
      for (const chunk of chunks) {
        sendJsonWebSocketFrame(socket, dashScopeTtsContinueTask(taskId, chunk));
      }
      sendJsonWebSocketFrame(socket, dashScopeTtsFinishTask(taskId));
    };

    const handleJsonEvent = (event) => {
      const name = event?.header?.event;
      if (name === "task-started") {
        sendAllText();
        return;
      }
      if (name === "task-finished") {
        taskFinished = true;
        if (!player.stdin.destroyed) player.stdin.end();
        maybeResolve();
        return;
      }
      if (name === "task-failed") {
        rejectWith(new Error(event?.header?.error_message || event?.header?.error_code || "阿里云流式 TTS 失败。"));
      }
    };

    const handleFrame = ({ opcode, payload }) => {
      if (opcode === 8) {
        if (!settled && !taskFinished) rejectWith(new Error("阿里云流式 TTS 连接被关闭。"));
        return;
      }
      if (opcode === 9) {
        socket.write(createWebSocketFrame(payload, 10));
        return;
      }
      if (opcode === 1) {
        handleJsonEvent(JSON.parse(payload.toString("utf8")));
        return;
      }
      if (opcode === 2 && payload.length) {
        audioBytes += payload.length;
        if (!player.stdin.destroyed) player.stdin.write(payload);
      }
    };

    player.stderr.on("data", (chunk) => {
      playerStderr += chunk.toString("utf8");
    });
    player.on("error", rejectWith);
    player.on("close", (code) => {
      playerClosed = true;
      playerExitCode = code;
      maybeResolve();
    });

    socket.on("secureConnect", () => {
      const key = randomBytes(16).toString("base64");
      const headers = [
        `GET ${path} HTTP/1.1`,
        `Host: ${host}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        `Authorization: Bearer ${config.apiKey}`,
        "user-agent: AI Workbench",
      ];
      if (config.workspaceId) {
        headers.push(`X-DashScope-WorkSpace: ${config.workspaceId}`);
      }
      headers.push("", "");
      socket.write(headers.join("\r\n"));
    });

    socket.on("data", (chunk) => {
      try {
        if (!upgraded) {
          handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
          const headerEnd = handshakeBuffer.indexOf("\r\n\r\n");
          if (headerEnd === -1) return;

          const headerText = handshakeBuffer.subarray(0, headerEnd).toString("utf8");
          if (!/^HTTP\/1\.1 101/i.test(headerText)) {
            rejectWith(new Error(`阿里云流式 TTS WebSocket 握手失败：${headerText.split(/\r?\n/)[0] || "unknown"}`));
            return;
          }

          upgraded = true;
          sendJsonWebSocketFrame(socket, dashScopeTtsRunTask({ taskId, model, voiceName }));
          const rest = handshakeBuffer.subarray(headerEnd + 4);
          if (rest.length) frameParser.push(rest).forEach(handleFrame);
          return;
        }

        frameParser.push(chunk).forEach(handleFrame);
      } catch (error) {
        rejectWith(error);
      }
    });

    socket.on("error", rejectWith);
    socket.on("close", () => {
      if (!settled && !taskFinished) {
        rejectWith(new Error("阿里云流式 TTS 连接提前关闭。"));
      }
    });
  });
}

async function pisenAliyunTtsRequest({ text, voiceName, model, timeoutMs = 45000, config: providedConfig }) {
  const config = providedConfig || (await loadPisenDashScopeConfig());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const requestBody = {
    model: String(model || process.env.PISEN_TTS_MODEL || "cosyvoice-v3-flash").trim(),
    input: {
      text,
      voice: String(voiceName || process.env.PISEN_TTS_VOICE || "longanhuan").trim(),
      format: "wav",
      sample_rate: 24000,
    },
  };

  try {
    const headers = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    };
    if (config.workspaceId) {
      headers["X-DashScope-WorkSpace"] = config.workspaceId;
    }

    const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer", {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`阿里云 TTS 请求失败 (${response.status})：${body.slice(0, 500)}`);
    }

    if (contentType.includes("audio/")) {
      return Buffer.from(await response.arrayBuffer());
    }

    const body = await response.json();
    const audio = body?.output?.audio || {};
    if (audio.data) {
      const raw = String(audio.data);
      const base64 = raw.includes(",") ? raw.split(",").pop() : raw;
      return Buffer.from(base64, "base64");
    }
    if (audio.url) {
      return await downloadAudioFromUrl(String(audio.url), controller.signal);
    }

    throw new Error(`阿里云 TTS 没有返回可播放音频：${JSON.stringify(body).slice(0, 500)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function playAudioFile(filePath, provider = "pisen-aliyun-tts") {
  stopSpeechOutput();

  return new Promise((resolvePromise, reject) => {
    const child = spawn("/usr/bin/afplay", [filePath], { stdio: ["ignore", "ignore", "pipe"] });
    const run = { child, stopRequested: false };
    activeSpeechOutputRun = run;
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (activeSpeechOutputRun === run) activeSpeechOutputRun = undefined;
      rm(filePath, { force: true }).catch(() => {});
      if (run.stopRequested || code === 0) {
        resolvePromise({ ok: true, provider });
        return;
      }
      reject(new Error((stderr || "pisenCode TTS 播放失败。").trim()));
    });
  });
}

async function speakText(payload = {}) {
  if (process.platform !== "darwin") {
    throw new Error("语音播放目前只支持 macOS 原生播放。");
  }

  const text = String(payload.text || "").trim().slice(0, 3000);
  if (!text) return { ok: true };

  const voiceName = String(payload.voiceName || payload.voiceType || process.env.PISEN_TTS_VOICE || "longanhuan").trim();
  const model = String(payload.model || process.env.PISEN_TTS_MODEL || "cosyvoice-v3-flash").trim();
  if (process.env.PISEN_TTS_STREAMING !== "0") {
    const config = await loadPisenDashScopeConfig(payload);
    try {
      return await playAliyunStreamingTts({
        text,
        config,
        voiceName,
        model,
      });
    } catch (error) {
      if (Number(error?.audioBytes || 0) > 0) throw error;
      if (process.env.PISEN_TTS_STREAMING_REQUIRED === "1") throw error;
    }
  }

  const wav = await pisenAliyunTtsRequest({
    text,
    voiceName,
    model,
    config: await loadPisenDashScopeConfig(payload),
  });
  const filePath = join(app.getPath("temp"), `ai-workbench-aliyun-tts-${Date.now()}-${randomUUID()}.wav`);
  await writeFile(filePath, wav);
  return playAudioFile(filePath, "pisen-aliyun-tts");
}

async function startVoice(payload = {}) {
  const timeoutSeconds = Math.max(5, Math.min(Number(payload.timeoutSeconds || 30) || 30, 120));
  const silenceSeconds = Math.max(0.8, Math.min(Number(payload.silenceSeconds || 3) || 3, 10));
  return startPisenAsr({ timeoutSeconds, silenceSeconds });
}

async function startWakeWord(payload = {}) {
  const locale = String(payload.locale || "zh-CN");
  const timeoutSeconds = Math.max(5, Math.min(Number(payload.timeoutSeconds || 50) || 50, 90));
  const phrases = Array.isArray(payload.phrases) && payload.phrases.length ? payload.phrases : ["未来"];
  const phraseArg = phrases.map((phrase) => String(phrase || "").trim()).filter(Boolean).join("|");
  return runSpeechHelper(
    ["wake", "--locale", locale, "--timeout", String(timeoutSeconds), "--phrases", phraseArg],
    "wake",
    (timeoutSeconds + 6) * 1000,
  );
}

function runUploadedPowerShellScript(client, config, append, finish, getOutput, resolvePromise, reject) {
  const tempCommand = 'powershell -NoLogo -NoProfile -Command "[System.IO.Path]::GetTempPath()"';
  let tempOutput = "";

  client.exec(tempCommand, {}, (tempError, tempStream) => {
    if (tempError) {
      finish(() => reject(tempError));
      return;
    }

    tempStream
      .on("close", () => {
        const tempLine =
          tempOutput
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => /^[A-Za-z]:[\\/]/.test(line)) || "C:\\Windows\\Temp\\";
        const tempDir = tempLine.replace(/[\\/]+$/, "");
        const remotePath = `${tempDir}\\aiwb-${Date.now()}-${randomUUID()}.ps1`;
        const remoteSftpPath = sftpWindowsPath(remotePath);
        const scriptBody = config.stdin.endsWith("\n") ? config.stdin : `${config.stdin}\n`;
        const scriptBuffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(scriptBody, "utf8")]);
        console.info("[aiwb:ssh:upload-script]", {
          requestId: config.requestId,
          tempDir,
          scriptBytes: scriptBuffer.length,
        });

        client.sftp((sftpError, sftp) => {
          if (sftpError) {
            finish(() => reject(sftpError));
            return;
          }

          const writeStream = sftp.createWriteStream(remoteSftpPath, { encoding: "binary" });
          writeStream
            .on("error", (writeError) => {
              sftp.end();
              finish(() => reject(writeError));
            })
            .on("close", () => {
              sftp.end();
              console.info("[aiwb:ssh:upload-complete]", {
                requestId: config.requestId,
                remotePath,
              });
              const quotedPath = powershellLiteral(remotePath);
              const runWrapper = `& ${quotedPath}; $AIWB_EXIT=$LASTEXITCODE; Remove-Item -LiteralPath ${quotedPath} -Force -ErrorAction SilentlyContinue; if ($null -ne $AIWB_EXIT) { exit $AIWB_EXIT }`;
              const encodedWrapper = Buffer.from(runWrapper, "utf16le").toString("base64");
              const runCommand = `powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedWrapper}`;

              client.exec(runCommand, {}, (runError, runStream) => {
                if (runError) {
                  finish(() => reject(runError));
                  return;
                }

                runStream
                  .on("close", () => {
                    console.info("[aiwb:ssh:uploaded-close]", {
                      requestId: config.requestId,
                      outputLength: getOutput().length,
                    });
                    finish(() => resolvePromise({ ok: true, stdout: getOutput() }));
                  })
                  .on("data", append);

                runStream.stderr.on("data", append);
              });
            });

          writeStream.end(scriptBuffer);
        });
      })
      .on("data", (chunk) => {
        tempOutput += chunk.toString("utf8");
      });

    tempStream.stderr.on("data", (chunk) => {
      tempOutput += chunk.toString("utf8");
    });
  });
}

function runSshCommand(payload) {
  const config = normalizeConnection(payload);
  const requestId = randomUUID().slice(0, 8);
  config.requestId = requestId;
  const commandKind = config.uploadScript ? "uploaded-powershell" : config.stdin ? "stdin" : "exec";

  console.info("[aiwb:ssh:start]", {
    requestId,
    host: config.host,
    port: config.port,
    username: config.username,
    passwordLength: config.password.length,
    commandKind,
    stdinLength: config.stdin.length,
    connectTimeoutSeconds: config.connectTimeoutSeconds,
    commandTimeoutSeconds: config.commandTimeoutSeconds,
  });
  void appendPersistentLog("info", "ssh.native.start", {
    requestId,
    host: config.host,
    port: config.port,
    username: config.username,
    passwordLength: config.password.length,
    commandKind,
    stdinLength: config.stdin.length,
    connectTimeoutSeconds: config.connectTimeoutSeconds,
    commandTimeoutSeconds: config.commandTimeoutSeconds,
  });

  return new Promise((resolvePromise, reject) => {
    const client = new Client();
    let output = "";
    let settled = false;

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end();
      fn();
    };

    const append = (chunk) => {
      output += chunk.toString("utf8");
      if (output.length > config.maxResponseSize) {
        output = output.slice(output.length - config.maxResponseSize);
      }
    };

    const timer = setTimeout(() => {
      void appendPersistentLog("error", "ssh.native.timeout", {
        requestId,
        host: config.host,
        port: config.port,
        commandKind,
        commandTimeoutSeconds: config.commandTimeoutSeconds,
      });
      finish(() => reject(new Error("SSH command timed out")));
    }, (config.connectTimeoutSeconds + config.commandTimeoutSeconds) * 1000);

    client
      .on("ready", () => {
        console.info("[aiwb:ssh:ready]", {
          requestId,
          host: config.host,
          username: config.username,
          commandKind,
        });
        void appendPersistentLog("info", "ssh.native.ready", {
          requestId,
          host: config.host,
          username: config.username,
          commandKind,
        });

        if (config.uploadScript && config.stdin) {
          runUploadedPowerShellScript(client, config, append, finish, () => output, resolvePromise, reject);
          return;
        }

        client.exec(config.command, config.stdin ? {} : { pty: true }, (error, stream) => {
          if (error) {
            finish(() => reject(error));
            return;
          }

          stream
            .on("close", () => {
              console.info("[aiwb:ssh:close]", {
                requestId,
                outputLength: output.length,
              });
              void appendPersistentLog("info", "ssh.native.close", {
                requestId,
                outputLength: output.length,
              });
              finish(() => resolvePromise({ ok: true, stdout: output }));
            })
            .on("data", append);

          stream.stderr.on("data", append);

          if (config.stdin) {
            stream.end(config.stdin.endsWith("\n") ? config.stdin : `${config.stdin}\n`);
          }
        });
      })
      .on("error", (error) => {
        // A successful SFTP/SSH response closes the client before the remote
        // socket finishes its final teardown. Ignore late EPIPE/ECONNRESET
        // events after the promise has already been settled.
        if (settled) return;
        console.error("[aiwb:ssh:error]", {
          requestId,
          host: config.host,
          port: config.port,
          username: config.username,
          passwordLength: config.password.length,
          code: error?.code,
          level: error?.level,
          message: error?.message,
        });
        void appendPersistentLog("error", "ssh.native.error", {
          requestId,
          host: config.host,
          port: config.port,
          username: config.username,
          passwordLength: config.password.length,
          code: error?.code,
          level: error?.level,
          message: error?.message,
        });
        finish(() => reject(error));
      })
      .connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        readyTimeout: config.connectTimeoutSeconds * 1000,
        keepaliveInterval: 10000,
      });
  });
}

async function routeIntent(payload = {}) {
  const config = normalizeMainAIRequest(payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutSeconds * 1000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config.requestBody),
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 500)}`);
    }
    return { ok: true, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function saveFile(payload = {}) {
  const name = safeDownloadFileName(payload.name);
  const rawBase64 = String(payload.base64 || "");
  const base64 = rawBase64.includes(",") ? rawBase64.split(",").pop() : rawBase64;
  if (!base64) throw new Error("Missing required field: base64");

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "保存文件",
    defaultPath: name,
    buttonLabel: "保存",
  });
  if (canceled || !filePath) return { ok: true, canceled: true };

  await writeFile(filePath, Buffer.from(base64, "base64"));
  return { ok: true, path: filePath };
}

const maxClipboardAttachmentBytes = 20 * 1024 * 1024;

function clipboardMimeForPath(filePath) {
  const extension = extname(filePath).slice(1).toLowerCase();
  const known = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
    json: "application/json",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return known[extension] || "application/octet-stream";
}

function decodeClipboardFileUrl(value) {
  const text = String(value || "").replace(/\0/g, "").trim();
  if (!text) return "";
  try {
    return text.startsWith("file:") ? fileURLToPath(text) : decodeURIComponent(text);
  } catch {
    return "";
  }
}

function clipboardFilePaths() {
  const formats = new Set(clipboard.availableFormats());
  const paths = [];
  const addLines = (value) => {
    String(value || "")
      .replace(/\0/g, "")
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        const decoded = decodeClipboardFileUrl(line);
        if (decoded) paths.push(decoded);
      });
  };

  for (const format of ["public.file-url", "text/uri-list"]) {
    if (!formats.has(format)) continue;
    addLines(clipboard.readBuffer(format).toString("utf8"));
  }

  if (formats.has("FileNameW")) {
    clipboard
      .readBuffer("FileNameW")
      .toString("utf16le")
      .split("\0")
      .forEach(addLines);
  }

  if (formats.has("NSFilenamesPboardType")) {
    const plist = clipboard.readBuffer("NSFilenamesPboardType").toString("utf8");
    for (const match of plist.matchAll(/<string>([\s\S]*?)<\/string>/g)) {
      addLines(
        match[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">"),
      );
    }
  }

  return [...new Set(paths)];
}

async function readClipboardAttachments() {
  const attachments = [];
  for (const filePath of clipboardFilePaths().slice(0, 10)) {
    try {
      const info = await stat(filePath);
      if (!info.isFile() || info.size > maxClipboardAttachmentBytes) continue;
      const mime = clipboardMimeForPath(filePath);
      attachments.push({
        name: basename(filePath),
        mime,
        size: info.size,
        base64: (await readFile(filePath)).toString("base64"),
        isImage: mime.startsWith("image/"),
      });
    } catch {
      // Ignore clipboard entries that disappeared before paste completed.
    }
  }

  if (!attachments.length) {
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const data = image.toPNG();
      if (data.length <= maxClipboardAttachmentBytes) {
        attachments.push({
          name: `粘贴的图片-${Date.now()}.png`,
          mime: "image/png",
          size: data.length,
          base64: data.toString("base64"),
          isImage: true,
        });
      }
    }
  }

  return { ok: true, attachments };
}

ipcMain.handle("aiwb:run-command", async (_event, payload) => {
  return runSshCommand(payload);
});

ipcMain.handle("aiwb:open-terminal", async (_event, payload) => {
  return openSshTerminal(payload);
});

ipcMain.handle("aiwb:save-file", async (_event, payload) => {
  return saveFile(payload);
});

ipcMain.handle("aiwb:read-clipboard-attachments", async () => {
  return readClipboardAttachments();
});

ipcMain.handle("aiwb:get-app-info", async () => {
  return getAppRuntimeInfo();
});

ipcMain.handle("aiwb:route-intent", async (_event, payload) => {
  return routeIntent(payload);
});

ipcMain.handle("aiwb:start-voice", async (_event, payload) => {
  return startVoice(payload);
});

ipcMain.handle("aiwb:stop-voice", async () => {
  return stopSpeechRun(activeSpeechRun);
});

ipcMain.handle("aiwb:start-wake-word", async (_event, payload) => {
  return startWakeWord(payload);
});

ipcMain.handle("aiwb:stop-wake-word", async () => {
  return stopSpeechRun(activeWakeRun);
});

ipcMain.handle("aiwb:speak-text", async (_event, payload) => {
  return speakText(payload);
});

ipcMain.handle("aiwb:stop-speech-output", async () => {
  return stopSpeechOutput();
});

ipcMain.handle("aiwb:save-profile", async (event, payload = {}) => {
  const incomingProfile = payload.profile && typeof payload.profile === "object" ? payload.profile : {};
  const replaceMessages = payload.replaceMessages === true;
  const senderId = event.sender.id;
  const saveOperation = profileSaveChain.then(async () => {
    const filePath = profileFilePath();
    let currentProfile = {};
    if (existsSync(filePath)) {
      try {
        currentProfile = decryptProfile(JSON.parse(await readFile(filePath, "utf8")));
      } catch (error) {
        await appendPersistentLog("error", "profile.native.save.read_failed", {
          path: filePath,
          error: String(error?.message || error || "配置读取失败"),
        });
        throw new Error("本地会话配置暂时无法读取，已停止覆盖写入以保护现有记录。");
      }
    }
    const rawProfile = replaceMessages ? incomingProfile : mergeWorkspaceProfile(currentProfile, incomingProfile);
    const { passwordEncrypted, payloadEncrypted, insecurePasswordStorage, ...rest } = rawProfile;
    const profile = encryptProfilePayload(rest);
    await appendPersistentLog("info", "profile.native.save.start", {
      serverCount: Array.isArray(rawProfile.servers) ? rawProfile.servers.length : 0,
      activeServerId: rawProfile.activeServerId,
    });
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(profile, null, 2), { mode: 0o600 });
      await rename(temporaryPath, filePath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => {});
    }
    await appendPersistentLog("info", "profile.native.save.success", {
      serverCount: Array.isArray(rawProfile.servers) ? rawProfile.servers.length : 0,
      path: filePath,
    });
    broadcastProfileUpdated(rawProfile, senderId, { replaceMessages });
    return { ok: true, profile: rawProfile };
  });
  profileSaveChain = saveOperation.catch(() => {});
  return saveOperation;
});

ipcMain.handle("aiwb:load-profile", async () => {
  const filePath = profileFilePath();
  if (!existsSync(filePath)) {
    await appendPersistentLog("warn", "profile.native.load.missing", { path: filePath });
    return { profile: {} };
  }
  const profile = JSON.parse(await readFile(filePath, "utf8"));
  const decrypted = decryptProfile(profile);
  await appendPersistentLog("info", "profile.native.load.success", {
    serverCount: Array.isArray(decrypted.servers) ? decrypted.servers.length : 0,
    path: filePath,
  });
  return { profile: decrypted };
});

ipcMain.handle("aiwb:clear-profile", async (event) => {
  await rm(profileFilePath(), { force: true });
  await appendPersistentLog("warn", "profile.native.clear", { path: profileFilePath() });
  broadcastProfileUpdated({}, event.sender.id);
  return { ok: true };
});

ipcMain.handle("aiwb:append-log", async (_event, payload = {}) => {
  await appendPersistentLog(payload.level || "info", payload.event || "renderer.event", payload.fields || {});
  return { ok: true };
});

ipcMain.handle("aiwb:export-logs", async (_event, payload = {}) => {
  return exportLogs(payload);
});

ipcMain.handle("aiwb:clear-logs", async () => {
  const dir = diagnosticLogDir();
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return { ok: true };
});

ipcMain.handle("aiwb:open-chat-window", async (_event, payload = {}) => {
  return openChatWindow(payload);
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  appendPersistentLogSync("warn", "app.single_instance.lock_failed", {
    pid: process.pid,
    argv: process.argv,
  });
  app.quit();
} else {
  app.on("second-instance", () => {
    appendPersistentLogSync("info", "app.single_instance.second_instance", {
      windowCount: BrowserWindow.getAllWindows().length,
    });
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    appendPersistentLogSync("info", "app.ready", {
      pid: process.pid,
      platform: process.platform,
      mode: process.env.AIWB_ELECTRON_MODE || "",
      isDev,
    });
    createWindow();

    app.on("activate", () => {
      appendPersistentLogSync("info", "app.activate", {
        windowCount: BrowserWindow.getAllWindows().length,
      });
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  appendPersistentLogSync("info", "app.window_all_closed", {
    platform: process.platform,
    willQuit: process.platform !== "darwin",
  });
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  appendPersistentLogSync("info", "app.before_quit", {
    windowCount: BrowserWindow.getAllWindows().length,
  });
});

app.on("will-quit", () => {
  appendPersistentLogSync("info", "app.will_quit", {
    windowCount: BrowserWindow.getAllWindows().length,
  });
});

app.on("quit", (_event, exitCode) => {
  appendPersistentLogSync("info", "app.quit", {
    exitCode,
  });
});

process.on("uncaughtException", (error) => {
  appendPersistentLogSync("error", "app.uncaught_exception", {
    message: error?.message || String(error),
    stack: error?.stack || "",
  });
  console.error("[aiwb:uncaughtException]", error);
});

process.on("unhandledRejection", (reason) => {
  appendPersistentLogSync("error", "app.unhandled_rejection", {
    message: reason?.message || String(reason),
    stack: reason?.stack || "",
  });
  console.error("[aiwb:unhandledRejection]", reason);
});

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, () => {
    appendPersistentLogSync("warn", "app.signal", {
      signal,
      pid: process.pid,
      ppid: process.ppid,
      windowCount: BrowserWindow.getAllWindows().length,
    });
    process.exit(signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 129);
  });
}
