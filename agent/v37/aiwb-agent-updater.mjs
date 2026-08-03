#!/usr/bin/env node
// Keeps the local Agent runtime aligned with the published manifest. It is an
// outbound-only control client: it never carries prompts or task output.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const home = process.env.AIWB_AGENT_HOME || join(process.env.HOME || process.env.USERPROFILE || ".", ".ai-workbench", "agent");
const configPath = process.env.AIWB_AGENT_UPDATER_CONFIG || join(home, "updater.json");
const intervalMs = Math.max(30_000, Number(process.env.AIWB_AGENT_UPDATE_INTERVAL_MS) || 5 * 60_000);

function text(value) {
  return String(value ?? "").trim();
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
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function atomicReplace(path, content) {
  const temporary = `${path}.download-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { mode: 0o700 });
  renameSync(temporary, path);
}

async function currentManifest(config) {
  const endpoint = text(config.controlEndpoint);
  if (endpoint) {
    const response = await fetch(endpoint.replace(/\/$/, "") + "/latest", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
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
}

async function tick() {
  try {
    await updateOnce();
  } catch (error) {
    writeStatus({ ok: false, error: text(error?.message) || "升级检查失败" });
  }
}

if (process.argv.includes("--once")) {
  await tick();
} else {
  await tick();
  // This is a daemon process. Keep the interval referenced so it continues
  // checking the control plane after the initial startup check completes.
  setInterval(tick, intervalMs);
}
