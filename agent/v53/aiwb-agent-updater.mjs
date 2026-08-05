#!/usr/bin/env node
// Keeps the local Agent runtime aligned with the published manifest. It is an
// outbound-only control client: it never carries prompts or task output.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const home = process.env.AIWB_AGENT_HOME || join(process.env.HOME || process.env.USERPROFILE || ".", ".ai-workbench", "agent");
const configPath = process.env.AIWB_AGENT_UPDATER_CONFIG || join(home, "updater.json");
const intervalMs = Math.max(30_000, Number(process.env.AIWB_AGENT_UPDATE_INTERVAL_MS) || 5 * 60_000);
const singleRun = process.argv.includes("--once");
const updaterPidPath = join(home, "updater.pid");
const updaterRuntimePath = fileURLToPath(import.meta.url);

function text(value) {
  return String(value ?? "").trim();
}

function requestUrl(url, { method = "GET", headers = {}, body = null, timeoutMs = 45_000 } = {}, redirects = 3) {
  return new Promise((resolvePromise, reject) => {
    const endpoint = new URL(url);
    const transport = endpoint.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport(endpoint, { method, headers }, (response) => {
      const location = response.headers.location;
      if (location && redirects > 0 && [301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
        response.resume();
        return requestUrl(new URL(location, endpoint).toString(), { method, headers, body, timeoutMs }, redirects - 1).then(resolvePromise, reject);
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const data = Buffer.concat(chunks);
        resolvePromise({
          ok: (response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300,
          status: response.statusCode || 0,
          arrayBuffer: async () => data,
          json: async () => JSON.parse(data.toString("utf8")),
        });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("请求超时")));
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireUpdaterPid() {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(updaterPidPath, "wx", 0o600);
      writeFileSync(descriptor, String(process.pid));
      closeSync(descriptor);
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = Number(text(existsSync(updaterPidPath) ? readFileSync(updaterPidPath, "utf8") : ""));
      if (owner !== process.pid && processAlive(owner)) return false;
      try { unlinkSync(updaterPidPath); } catch {}
    }
  }
  return false;
}

function releaseUpdaterPid() {
  try {
    if (text(readFileSync(updaterPidPath, "utf8")) === String(process.pid)) unlinkSync(updaterPidPath);
  } catch {}
}

function readConfig() {
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStatus(status) {
  try {
    mkdirSync(home, { recursive: true, mode: 0o700 });
    writeFileSync(join(home, "updater-status.json"), `${JSON.stringify({ ...status, checkedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  } catch {}
}

function readStatus() {
  try {
    const parsed = JSON.parse(readFileSync(join(home, "updater-status.json"), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRuntimeGeneration() {
  try {
    writeFileSync(join(home, "updater.runtime.sha256"), `${sha256(readFileSync(updaterRuntimePath))}\n`, { mode: 0o600 });
  } catch {}
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function download(url) {
  const response = await requestUrl(url);
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function atomicReplace(path, content) {
  const temporary = `${path}.download-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { mode: 0o700 });
  renameSync(temporary, path);
}

function activeTaskCount() {
  const tasksPath = join(home, "tasks");
  if (!existsSync(tasksPath)) return 0;
  let count = 0;
  for (const entry of readdirSync(tasksPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(tasksPath, entry.name);
    const status = text(existsSync(join(directory, "status")) ? readFileSync(join(directory, "status"), "utf8") : "").toLowerCase();
    if (status === "queued" || status === "preparing") {
      count += 1;
      continue;
    }
    if (status !== "running") continue;
    const runnerPid = Number(text(existsSync(join(directory, "pid")) ? readFileSync(join(directory, "pid"), "utf8") : ""));
    const commandPid = Number(text(existsSync(join(directory, "command_pid")) ? readFileSync(join(directory, "command_pid"), "utf8") : ""));
    if (processAlive(runnerPid) || processAlive(commandPid)) count += 1;
  }
  return count;
}

function managedServiceConfigured() {
  try {
    if (process.platform === "darwin") {
      const plist = join(process.env.HOME || home, "Library", "LaunchAgents", "com.beexofficial.ai-workbench-agent.plist");
      if (!readFileSync(plist, "utf8").includes("service-run")) return false;
      const uid = typeof process.getuid === "function" ? process.getuid() : -1;
      return uid >= 0
        && spawnSync("launchctl", ["print", `gui/${uid}/com.beexofficial.ai-workbench-agent`], { stdio: "ignore" }).status === 0;
    }
    if (process.platform === "win32") {
      const result = spawnSync("schtasks.exe", ["/Query", "/TN", "AI Workbench Agent", "/XML"], { encoding: "utf8", windowsHide: true });
      return result.status === 0 && text(result.stdout).includes("service-run");
    }
    if (!readFileSync("/etc/systemd/system/ai-workbench-agent.service", "utf8").includes("service-run")) return false;
    return spawnSync("systemctl", ["is-active", "--quiet", "ai-workbench-agent.service"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

function agentPlatform() {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return "linux";
}

function manifestUrlForPlatform(body, fallback = "") {
  const platform = agentPlatform();
  return text(body?.platforms?.[platform]?.manifestUrl)
    || text(body?.[`${platform}ManifestUrl`])
    // v52 and older control centers exposed only manifestUrl. Keep that as a
    // migration fallback; v53+ always selects the explicit platform first.
    || text(body?.manifestUrl)
    || text(fallback);
}

async function currentManifest(config) {
  const endpoint = text(config.controlEndpoint);
  if (endpoint) {
    const response = await requestUrl(endpoint.replace(/\/$/, "") + "/latest", { timeoutMs: 15_000 });
    if (response.ok) {
      const body = await response.json();
      const manifestUrl = manifestUrlForPlatform(body, config.manifestUrl);
      if (manifestUrl) return { ...body, manifestUrl };
    }
  }
  return { manifestUrl: text(config.manifestUrl) };
}

async function updateOnce() {
  const config = readConfig();
  const published = await currentManifest(config);
  const manifestUrl = text(published.manifestUrl);
  if (!manifestUrl) return writeStatus({ ok: true, updated: false, reason: "not_configured" });
  const manifest = JSON.parse((await download(manifestUrl)).toString("utf8"));
  const files = [
    { url: manifest.scriptUrl, sha256: manifest.sha256, path: join(home, process.platform === "win32" ? "aiwb-agent.mjs" : "aiwbctl") },
    { url: manifest.directRuntime?.url, sha256: manifest.directRuntime?.sha256, path: join(home, "aiwb-agent-http.mjs") },
    { url: manifest.updaterRuntime?.url, sha256: manifest.updaterRuntime?.sha256, path: join(home, "aiwb-agent-updater.mjs") },
  ].filter((item) => text(item.url));
  const staged = [];
  for (const item of files) {
    const content = await download(item.url);
    if (text(item.sha256) && sha256(content) !== text(item.sha256).toLowerCase()) throw new Error(`校验失败：${item.path}`);
    const current = existsSync(item.path) ? readFileSync(item.path) : null;
    if (!current || sha256(current) !== sha256(content)) {
      staged.push({ ...item, content, current });
    }
  }
  if (!staged.length) {
    writeStatus({ ok: true, updated: false, version: manifest.version || "" });
    return { updated: false, version: text(manifest.version) };
  }
  const activeTasks = activeTaskCount();
  if (activeTasks > 0) {
    writeStatus({
      ok: true,
      updated: false,
      deferred: true,
      reason: "active_tasks",
      pendingVersion: manifest.version || "",
      activeTaskCount: activeTasks,
    });
    return { updated: false, deferred: true, version: text(manifest.version) };
  }
  const replaced = [];
  try {
    for (const item of staged) {
      atomicReplace(item.path, item.content);
      replaced.push(item);
    }
  } catch (error) {
    for (const item of replaced.reverse()) {
      try {
        if (item.current) atomicReplace(item.path, item.current);
        else if (existsSync(item.path)) unlinkSync(item.path);
      } catch {}
    }
    throw error;
  }
  const updated = true;
  writeStatus({ ok: true, updated, version: manifest.version || "" });
  return { updated, version: text(manifest.version) };
}

async function restartInstalledRuntime() {
  const controlPath = join(home, process.platform === "win32" ? "aiwb-agent.mjs" : "aiwbctl");
  if (managedServiceConfigured()) {
    if (process.platform === "win32") {
      if (existsSync(controlPath)) spawnSync(process.execPath, [controlPath, "install-service"], { windowsHide: true, timeout: 30_000 });
      return;
    }
    // service-run supervises the daemon and direct runtime. Stopping those
    // children makes the managed service restart from the newly installed,
    // fully validated files. Updates are already deferred until tasks drain.
    for (const pidFile of ["http.pid", "daemon.pid"]) {
      const pid = Number(text(existsSync(join(home, pidFile)) ? readFileSync(join(home, pidFile), "utf8") : ""));
      if (Number.isInteger(pid) && pid > 1 && pid !== process.pid) {
        try { process.kill(pid, "SIGTERM"); } catch {}
      }
    }
    return;
  }
  if (existsSync(controlPath)) {
    if (process.platform === "win32") {
      spawnSync(process.execPath, [controlPath, "install-service"], { windowsHide: true, timeout: 30_000 });
    } else {
      spawnSync(controlPath, ["install-service"], { timeout: 30_000 });
    }
  }

  const directRuntime = join(home, "aiwb-agent-http.mjs");
  const directPid = Number(text(existsSync(join(home, "http.pid")) ? readFileSync(join(home, "http.pid"), "utf8") : ""));
  if (Number.isInteger(directPid) && directPid > 1 && directPid !== process.pid) {
    try { process.kill(directPid, "SIGTERM"); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (existsSync(directRuntime)) {
    const direct = spawn(process.execPath, [directRuntime], { detached: true, stdio: "ignore", windowsHide: true });
    direct.unref();
  }

  const updaterPath = join(home, "aiwb-agent-updater.mjs");
  if (existsSync(updaterPath)) {
    const updater = spawn(process.execPath, [updaterPath], { detached: true, stdio: "ignore", windowsHide: true });
    updater.unref();
  }
}

async function tick() {
  try {
    const previousStatus = readStatus();
    const runtimeRecoveryPending = previousStatus?.runtimeRecoveryPending === true || previousStatus?.restarting === true;
    const result = await updateOnce();
    const activeTasks = activeTaskCount();
    if (runtimeRecoveryPending && (singleRun || result?.deferred || activeTasks > 0)) {
      writeStatus({
        ok: true,
        updated: Boolean(result?.updated),
        deferred: true,
        reason: activeTasks > 0 ? "active_tasks" : "supervisor_restart_pending",
        runtimeRecoveryPending: true,
        activeTaskCount: activeTasks,
        version: result?.version || "",
      });
      return;
    }
    if (!singleRun && (result?.updated || runtimeRecoveryPending)) {
      writeStatus({
        ok: true,
        updated: Boolean(result?.updated),
        recoveredLegacyRestart: runtimeRecoveryPending,
        runtimeRecoveryPending: false,
        version: result?.version || "",
        restarting: false,
        restartTriggered: true,
      });
      await restartInstalledRuntime();
      process.exit(0);
    }
  } catch (error) {
    writeStatus({ ok: false, error: text(error?.message) || "升级检查失败" });
  }
}

if (singleRun) {
  await tick();
} else {
  if (acquireUpdaterPid()) {
    process.once("exit", releaseUpdaterPid);
    writeRuntimeGeneration();
    await tick();
    // This is a daemon process. Keep the interval referenced so it continues
    // checking the control plane after the initial startup check completes.
    setInterval(tick, intervalMs);
  }
}
