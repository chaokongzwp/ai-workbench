import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const preloadPath = join(__dirname, "preload.cjs");
const rendererUrl = process.env.ELECTRON_RENDERER_URL || "";
const isDev = Boolean(rendererUrl);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 390,
    minHeight: 720,
    title: "AI Workbench",
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(projectRoot, "dist", "index.html"));
  }

  if (isDev || process.env.AIWB_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

function profileFilePath() {
  return join(app.getPath("userData"), "connection-profile.json");
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
  const command = String(input.command || "").trim();

  if (!host) throw new Error("Missing required field: host");
  if (!username) throw new Error("Missing required field: username");
  if (!password) throw new Error("Missing required field: password");
  if (!command) throw new Error("Missing required field: command");

  return {
    host,
    username,
    password,
    command,
    port: Math.max(1, Number(input.port || 22) || 22),
    connectTimeoutSeconds: Math.max(3, Math.min(Number(input.connectTimeoutSeconds || 15) || 15, 60)),
    maxResponseSize: Math.max(1024, Math.min(Number(input.maxResponseSize || 1_048_576) || 1_048_576, 8_388_608)),
  };
}

function runSshCommand(payload) {
  const config = normalizeConnection(payload);

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
      finish(() => reject(new Error("SSH command timed out")));
    }, config.connectTimeoutSeconds * 1000 + 120000);

    client
      .on("ready", () => {
        client.exec(config.command, { pty: true }, (error, stream) => {
          if (error) {
            finish(() => reject(error));
            return;
          }

          stream
            .on("close", () => {
              finish(() => resolvePromise({ ok: true, stdout: output }));
            })
            .on("data", append);

          stream.stderr.on("data", append);
        });
      })
      .on("error", (error) => {
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

ipcMain.handle("aiwb:run-command", async (_event, payload) => {
  return runSshCommand(payload);
});

ipcMain.handle("aiwb:save-profile", async (_event, payload = {}) => {
  const rawProfile = payload.profile && typeof payload.profile === "object" ? payload.profile : {};
  const { passwordEncrypted, payloadEncrypted, insecurePasswordStorage, ...rest } = rawProfile;
  const profile = encryptProfilePayload(rest);
  const filePath = profileFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(profile, null, 2), { mode: 0o600 });
  return { ok: true };
});

ipcMain.handle("aiwb:load-profile", async () => {
  const filePath = profileFilePath();
  if (!existsSync(filePath)) return { profile: {} };
  const profile = JSON.parse(await readFile(filePath, "utf8"));
  return { profile: decryptProfile(profile) };
});

ipcMain.handle("aiwb:clear-profile", async () => {
  await rm(profileFilePath(), { force: true });
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
