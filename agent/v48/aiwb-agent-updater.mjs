#!/usr/bin/env node
// Keeps the local Agent runtime aligned with the published manifest. It is an
// outbound-only control client: it never carries prompts or task output.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const home = process.env.AIWB_AGENT_HOME || join(process.env.HOME || process.env.USERPROFILE || ".", ".ai-workbench", "agent");
const configPath = process.env.AIWB_AGENT_UPDATER_CONFIG || join(home, "updater.json");
const intervalMs = Math.max(30_000, Number(process.env.AIWB_AGENT_UPDATE_INTERVAL_MS) || 5 * 60_000);
const singleRun = process.argv.includes("--once");
const updaterPidPath = join(home, "updater.pid");

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

function managedServiceConfigured() {
  try {
    if (process.platform === "darwin") {
      return readFileSync(join(process.env.HOME || home, "Library", "LaunchAgents", "com.beexofficial.ai-workbench-agent.plist"), "utf8").includes("service-run");
    }
    if (process.platform === "win32") {
      const result = spawnSync("schtasks.exe", ["/Query", "/TN", "AI Workbench Agent", "/XML"], { encoding: "utf8", windowsHide: true });
      return result.status === 0 && text(result.stdout).includes("service-run");
    }
    return readFileSync("/etc/systemd/system/ai-workbench-agent.service", "utf8").includes("service-run");
  } catch {
    return false;
  }
}

async function currentManifest(config) {
  const endpoint = text(config.controlEndpoint);
  if (endpoint) {
    const response = await requestUrl(endpoint.replace(/\/$/, "") + "/latest", { timeoutMs: 15_000 });
    if (response.ok) {
      const body = await response.json();
      if (body?.manifestUrl) {
        if (process.platform === "win32" && text(body.windowsManifestUrl)) return { ...body, manifestUrl: body.windowsManifestUrl };
        return body;
      }
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
  let updated = false;
  for (const item of files) {
    const content = await download(item.url);
    if (text(item.sha256) && sha256(content) !== text(item.sha256).toLowerCase()) throw new Error(`校验失败：${item.path}`);
    const current = existsSync(item.path) ? readFileSync(item.path) : null;
    if (!current || sha256(current) !== sha256(content)) {
      atomicReplace(item.path, content);
      updated = true;
    }
  }
  writeStatus({ ok: true, updated, version: manifest.version || "" });
  return { updated, version: text(manifest.version) };
}

async function restartInstalledRuntime() {
  if (managedServiceConfigured()) return;
  const controlPath = join(home, process.platform === "win32" ? "aiwb-agent.mjs" : "aiwbctl");
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
    const result = await updateOnce();
    if (!singleRun && result?.updated) {
      writeStatus({ ok: true, updated: true, version: result.version, restarting: true });
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
    await tick();
    // This is a daemon process. Keep the interval referenced so it continues
    // checking the control plane after the initial startup check completes.
    setInterval(tick, intervalMs);
  }
}
