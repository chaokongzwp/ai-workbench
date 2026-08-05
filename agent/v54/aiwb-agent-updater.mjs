#!/usr/bin/env node
// Keeps the local Agent runtime aligned with the published manifest. It is an
// outbound-only control client: it never carries prompts or task output.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const home = process.env.AIWB_AGENT_HOME || join(process.env.HOME || process.env.USERPROFILE || ".", ".ai-workbench", "agent");
const configPath = process.env.AIWB_AGENT_UPDATER_CONFIG || join(home, "updater.json");
const intervalMs = Math.max(30_000, Number(process.env.AIWB_AGENT_UPDATE_INTERVAL_MS) || 5 * 60_000);
const singleRun = process.argv.includes("--once");
const updaterPidPath = join(home, "updater.pid");
const updaterPidStartedAtPath = join(home, "updater.pid.started_at_ms");
const updateLockPath = join(home, "update.lock");
const taskTickLockPath = join(home, "tick.lock");
const updaterRuntimePath = fileURLToPath(import.meta.url);
const runtimeStatusPath = join(home, "updater-status.json");
const processStartToleranceMs = 2_500;
const lockAcquisitionGraceMs = 5_000;
const staleTaskTickLockMs = 30_000;

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
      writeFileSync(updaterPidStartedAtPath, `${processStartedAtMs(process.pid)}\n`, { mode: 0o600 });
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = Number(text(existsSync(updaterPidPath) ? readFileSync(updaterPidPath, "utf8") : ""));
      const recordedStartedAt = readPid(updaterPidStartedAtPath);
      const liveStartedAt = processStartedAtMs(owner);
      const sameOwner = owner > 1
        && owner !== process.pid
        && processAlive(owner)
        && (
          (recordedStartedAt > 0 && liveStartedAt > 0 && Math.abs(recordedStartedAt - liveStartedAt) <= processStartToleranceMs)
          || (!recordedStartedAt && processMatchesComponent(owner, "updater"))
        );
      if (sameOwner) return false;
      if (Date.now() - fileModifiedAtMs(updaterPidPath) < lockAcquisitionGraceMs) return false;
      try { unlinkSync(updaterPidPath); } catch {}
      try { unlinkSync(updaterPidStartedAtPath); } catch {}
    }
  }
  return false;
}

function releaseUpdaterPid() {
  try {
    if (text(readFileSync(updaterPidPath, "utf8")) === String(process.pid)) {
      unlinkSync(updaterPidPath);
      try { unlinkSync(updaterPidStartedAtPath); } catch {}
    }
  } catch {}
}

function acquireUpdateLock() {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      mkdirSync(updateLockPath, { mode: 0o700 });
      writeFileSync(join(updateLockPath, "owner.pid"), `${process.pid}\n`, { mode: 0o600 });
      writeFileSync(join(updateLockPath, "owner.started_at_ms"), `${processStartedAtMs(process.pid)}\n`, { mode: 0o600 });
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = readPid(join(updateLockPath, "owner.pid"));
      const recordedStartedAt = readPid(join(updateLockPath, "owner.started_at_ms"));
      const liveStartedAt = processStartedAtMs(owner);
      const sameOwner = owner > 1
        && owner !== process.pid
        && processAlive(owner)
        && (
          (recordedStartedAt > 0 && liveStartedAt > 0 && Math.abs(recordedStartedAt - liveStartedAt) <= processStartToleranceMs)
          || (!recordedStartedAt && processMatchesComponent(owner, "updater"))
        );
      if (sameOwner) return false;
      // mkdir() and owner.pid are two syscalls. Do not let a competing updater
      // tear down the directory during that tiny publication window.
      if (Date.now() - fileModifiedAtMs(updateLockPath) < lockAcquisitionGraceMs) return false;
      try { unlinkSync(join(updateLockPath, "owner.pid")); } catch {}
      try { unlinkSync(join(updateLockPath, "owner.started_at_ms")); } catch {}
      try { rmdirSync(updateLockPath); } catch {}
    }
  }
  return false;
}

function releaseUpdateLock() {
  try {
    if (readPid(join(updateLockPath, "owner.pid")) === process.pid) {
      unlinkSync(join(updateLockPath, "owner.pid"));
      try { unlinkSync(join(updateLockPath, "owner.started_at_ms")); } catch {}
      rmdirSync(updateLockPath);
    }
  } catch {}
}

function clearStaleTaskTickLock() {
  const modifiedAt = fileModifiedAtMs(taskTickLockPath);
  if (!modifiedAt || Date.now() - modifiedAt <= staleTaskTickLockMs) return false;
  const owner = readPid(join(taskTickLockPath, "owner.pid"));
  // The task daemon and create-now may legitimately hold the lock longer than
  // expected on a slow machine. Age alone never authorizes stealing it.
  if (processAlive(owner)) return false;
  try { unlinkSync(join(taskTickLockPath, "owner.pid")); } catch {}
  try { unlinkSync(join(taskTickLockPath, "started_at")); } catch {}
  try {
    rmdirSync(taskTickLockPath);
    return true;
  } catch {
    return false;
  }
}

async function acquireTaskTickLock() {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      mkdirSync(taskTickLockPath, { mode: 0o700 });
      writeFileSync(join(taskTickLockPath, "owner.pid"), `${process.pid}\n`, { mode: 0o600 });
      writeFileSync(join(taskTickLockPath, "started_at"), `${new Date().toISOString()}\n`, { mode: 0o600 });
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      clearStaleTaskTickLock();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  return false;
}

function releaseTaskTickLock() {
  try {
    if (readPid(join(taskTickLockPath, "owner.pid")) !== process.pid) return;
    try { unlinkSync(join(taskTickLockPath, "owner.pid")); } catch {}
    try { unlinkSync(join(taskTickLockPath, "started_at")); } catch {}
    rmdirSync(taskTickLockPath);
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
  const temporary = `${runtimeStatusPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    mkdirSync(home, { recursive: true, mode: 0o700 });
    writeFileSync(temporary, `${JSON.stringify({ ...status, checkedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, runtimeStatusPath);
  } catch {
    try { unlinkSync(temporary); } catch {}
  }
}

function readStatus() {
  try {
    const parsed = JSON.parse(readFileSync(runtimeStatusPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function fileSha256(path) {
  try {
    return sha256(readFileSync(path));
  } catch {
    return "";
  }
}

function fileModifiedAtMs(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function readPid(path) {
  try {
    return Number(text(readFileSync(path, "utf8")));
  } catch {
    return 0;
  }
}

function processStartedAtMs(pid) {
  if (!processAlive(pid)) return 0;
  try {
    if (process.platform === "win32") {
      const script = `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`;
      const result = spawnSync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
        { encoding: "utf8", windowsHide: true, timeout: 5_000 },
      );
      const startedAt = Date.parse(text(result.stdout));
      return result.status === 0 && Number.isFinite(startedAt) ? startedAt : 0;
    }
    const result = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
      timeout: 5_000,
    });
    const startedAt = Date.parse(text(result.stdout));
    return result.status === 0 && Number.isFinite(startedAt) ? startedAt : 0;
  } catch {
    return 0;
  }
}

function processCommandLine(pid) {
  if (!processAlive(pid)) return "";
  try {
    if (process.platform === "win32") {
      const script = `(Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\" -ErrorAction Stop).CommandLine`;
      const result = spawnSync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
        { encoding: "utf8", windowsHide: true, timeout: 5_000 },
      );
      return result.status === 0 ? text(result.stdout) : "";
    }
    const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
      timeout: 5_000,
    });
    return result.status === 0 ? text(result.stdout) : "";
  } catch {
    return "";
  }
}

function processParentPid(pid) {
  if (!processAlive(pid)) return 0;
  try {
    if (process.platform === "win32") {
      const script = `(Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\" -ErrorAction Stop).ParentProcessId`;
      const result = spawnSync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
        { encoding: "utf8", windowsHide: true, timeout: 5_000 },
      );
      return result.status === 0 ? Number(text(result.stdout)) : 0;
    }
    const result = spawnSync("ps", ["-p", String(pid), "-o", "ppid="], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
      timeout: 5_000,
    });
    return result.status === 0 ? Number(text(result.stdout)) : 0;
  } catch {
    return 0;
  }
}

function commandLineHasToken(commandLine, token) {
  const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s\"]+)${escaped}(?=$|[\\s\"]+)`, process.platform === "win32" ? "i" : "").test(commandLine);
}

function processMatchesTaskRunner(pid, directory, taskId) {
  const commandLine = processCommandLine(pid);
  if (!commandLine) return false;
  if (process.platform === "win32") {
    return commandLineHasToken(commandLine, join(home, "aiwb-agent.mjs"))
      && commandLineHasToken(commandLine, "runner")
      && commandLineHasToken(commandLine, taskId);
  }
  return commandLineHasToken(commandLine, join(directory, "run.sh"));
}

function processDescendsFrom(pid, ancestorPid) {
  if (!processAlive(pid) || !processAlive(ancestorPid)) return false;
  const seen = new Set();
  let current = Number(pid);
  for (let depth = 0; depth < 32 && current > 1 && !seen.has(current); depth += 1) {
    if (current === Number(ancestorPid)) return true;
    seen.add(current);
    current = processParentPid(current);
  }
  return false;
}

function processMatchesComponent(pid, component) {
  const commandLine = processCommandLine(pid);
  if (!commandLine) return false;
  const controlPath = join(home, process.platform === "win32" ? "aiwb-agent.mjs" : "aiwbctl");
  const httpPath = join(home, "aiwb-agent-http.mjs");
  const updaterPath = join(home, "aiwb-agent-updater.mjs");
  if (component === "service") return commandLineHasToken(commandLine, controlPath) && commandLineHasToken(commandLine, "service-run");
  if (component === "daemon") {
    return commandLineHasToken(commandLine, controlPath)
      && (commandLineHasToken(commandLine, "daemon") || commandLineHasToken(commandLine, "service-run"));
  }
  if (component === "http") return commandLineHasToken(commandLine, httpPath);
  if (component === "updater") return commandLineHasToken(commandLine, updaterPath);
  return false;
}

function stopRecordedComponent(component, pidFile, signal = "SIGTERM") {
  const pid = readPid(pidFile);
  if (pid < 2 || pid === process.pid || !processMatchesComponent(pid, component)) return false;
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

function normalizedVersion(value) {
  return text(value).replace(/^v/i, "");
}

const updaterRuntimeSha256 = fileSha256(updaterRuntimePath);

function writeRuntimeGeneration() {
  try {
    writeFileSync(join(home, "updater.runtime.sha256"), `${updaterRuntimeSha256}\n`, { mode: 0o600 });
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

function runtimeExpectation(manifest) {
  return {
    version: normalizedVersion(manifest?.version),
    artifacts: {
      control: {
        path: join(home, process.platform === "win32" ? "aiwb-agent.mjs" : "aiwbctl"),
        sha256: text(manifest?.sha256).toLowerCase(),
      },
      http: {
        path: join(home, "aiwb-agent-http.mjs"),
        sha256: text(manifest?.directRuntime?.sha256).toLowerCase(),
      },
      updater: {
        path: join(home, "aiwb-agent-updater.mjs"),
        sha256: text(manifest?.updaterRuntime?.sha256).toLowerCase(),
      },
    },
  };
}

function targetRuntimeStatus(expectation) {
  return {
    version: expectation.version,
    controlSha256: expectation.artifacts.control.sha256,
    httpSha256: expectation.artifacts.http.sha256,
    updaterSha256: expectation.artifacts.updater.sha256,
  };
}

function inspectRuntimeConsistency(expectation) {
  const reasons = [];
  const diskSha256 = {};
  const artifactModifiedAtMs = {};
  let generationModifiedAtMs = 0;

  for (const [name, artifact] of Object.entries(expectation.artifacts)) {
    if (!artifact.sha256) continue;
    const actualSha256 = fileSha256(artifact.path);
    const modifiedAtMs = fileModifiedAtMs(artifact.path);
    diskSha256[name] = actualSha256;
    artifactModifiedAtMs[name] = modifiedAtMs;
    generationModifiedAtMs = Math.max(generationModifiedAtMs, modifiedAtMs);
    if (actualSha256 !== artifact.sha256) reasons.push(`${name}_disk_sha256_mismatch`);
  }

  const processes = {
    service: {
      required: Boolean(expectation.version || expectation.artifacts.control.sha256),
      pid: readPid(join(home, "service.pid")),
    },
    daemon: {
      required: Boolean(expectation.version || expectation.artifacts.control.sha256),
      pid: readPid(join(home, "daemon.pid")),
    },
    http: {
      required: Boolean(expectation.artifacts.http.sha256),
      pid: readPid(join(home, "http.pid")),
    },
    updater: {
      required: Boolean(expectation.artifacts.updater.sha256),
      pid: readPid(updaterPidPath),
    },
  };
  const processState = {};
  for (const [name, component] of Object.entries(processes)) {
    if (!component.required) continue;
    const alive = processAlive(component.pid);
    const owned = alive && processMatchesComponent(component.pid, name);
    const startedAtMs = alive ? processStartedAtMs(component.pid) : 0;
    processState[name] = { pid: component.pid, alive, owned, startedAtMs };
    if (!alive) {
      reasons.push(`${name}_not_running`);
    } else if (!owned) {
      reasons.push(`${name}_pid_owner_mismatch`);
    } else if (!startedAtMs) {
      reasons.push(`${name}_start_time_unknown`);
    } else if (generationModifiedAtMs > 0 && startedAtMs + processStartToleranceMs < generationModifiedAtMs) {
      reasons.push(`${name}_runtime_generation_stale`);
    }
  }

  const runtimeSha256 = {
    http: text(existsSync(join(home, "http.runtime.sha256")) ? readFileSync(join(home, "http.runtime.sha256"), "utf8") : "").toLowerCase(),
    updater: text(existsSync(join(home, "updater.runtime.sha256")) ? readFileSync(join(home, "updater.runtime.sha256"), "utf8") : "").toLowerCase(),
  };
  if (expectation.artifacts.http.sha256 && runtimeSha256.http !== expectation.artifacts.http.sha256) {
    reasons.push("http_runtime_sha256_mismatch");
  }
  if (expectation.artifacts.updater.sha256 && runtimeSha256.updater !== expectation.artifacts.updater.sha256) {
    reasons.push("updater_runtime_sha256_mismatch");
  }
  const serviceRuntimeSha256 = text(existsSync(join(home, "service.runtime.sha256"))
    ? readFileSync(join(home, "service.runtime.sha256"), "utf8")
    : "").toLowerCase();
  if (expectation.artifacts.control.sha256 && serviceRuntimeSha256 !== expectation.artifacts.control.sha256) {
    reasons.push("service_runtime_sha256_mismatch");
  }

  let daemonVersion = "";
  let daemonLockOwnerPid = 0;
  let daemonControlSha256 = "";
  if (process.platform !== "win32" && expectation.version) {
    daemonVersion = normalizedVersion(existsSync(join(home, "daemon.lock", "version"))
      ? readFileSync(join(home, "daemon.lock", "version"), "utf8")
      : "");
    daemonLockOwnerPid = readPid(join(home, "daemon.lock", "owner.pid"));
    daemonControlSha256 = text(existsSync(join(home, "daemon.lock", "control.sha256"))
      ? readFileSync(join(home, "daemon.lock", "control.sha256"), "utf8")
      : "").toLowerCase();
    if (daemonVersion !== expectation.version) reasons.push("daemon_runtime_version_mismatch");
    if (processes.daemon.pid > 1 && daemonLockOwnerPid !== processes.daemon.pid) reasons.push("daemon_lock_owner_mismatch");
    if (expectation.artifacts.control.sha256 && daemonControlSha256 !== expectation.artifacts.control.sha256) {
      reasons.push("daemon_runtime_sha256_mismatch");
    }
  }

  return {
    consistent: reasons.length === 0,
    reasons: [...new Set(reasons)],
    observed: {
      generationModifiedAtMs,
      artifactModifiedAtMs,
      diskSha256,
      runtimeSha256,
      serviceRuntimeSha256,
      daemonVersion,
      daemonLockOwnerPid,
      daemonControlSha256,
      processes: processState,
    },
  };
}

function currentUpdaterMatches(expectation) {
  return Boolean(expectation.artifacts.updater.sha256)
    && updaterRuntimeSha256 === expectation.artifacts.updater.sha256
    && readPid(updaterPidPath) === process.pid;
}

async function waitForRuntimeConsistency(expectation, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let consistency = inspectRuntimeConsistency(expectation);
  while (!consistency.consistent && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    consistency = inspectRuntimeConsistency(expectation);
  }
  return consistency;
}

function activeTaskCount() {
  const tasksPath = join(home, "tasks");
  if (!existsSync(tasksPath)) return 0;
  let count = 0;
  for (const entry of readdirSync(tasksPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(tasksPath, entry.name);
    const status = text(existsSync(join(directory, "status")) ? readFileSync(join(directory, "status"), "utf8") : "").toLowerCase();
    const runnerPid = Number(text(existsSync(join(directory, "pid")) ? readFileSync(join(directory, "pid"), "utf8") : ""));
    const commandPid = Number(text(existsSync(join(directory, "command_pid")) ? readFileSync(join(directory, "command_pid"), "utf8") : ""));
    const runnerOwned = processMatchesTaskRunner(runnerPid, directory, entry.name);
    const commandOwned = runnerOwned && processDescendsFrom(commandPid, runnerPid);
    if (status === "running") {
      if (runnerOwned || commandOwned) count += 1;
      continue;
    }
    const metadataPending = !status && existsSync(join(directory, "command.b64"));
    if (!metadataPending && status !== "queued" && status !== "preparing" && status !== "busy") continue;
    if (runnerOwned || commandOwned) {
      count += 1;
      continue;
    }
    const timestampPath = ["queued_at", "created_at", "started_at"]
      .map((name) => join(directory, name))
      .find((path) => existsSync(path));
    const timestamp = timestampPath ? Date.parse(text(readFileSync(timestampPath, "utf8"))) : 0;
    const fallback = Math.max(
      fileModifiedAtMs(join(directory, "status")),
      fileModifiedAtMs(join(directory, "command.b64")),
    );
    const ageMs = Date.now() - (Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback);
    // Protect the creator's short metadata/preparing/queueing window, but
    // never let an abandoned status block runtime repair forever.
    if (ageMs > -5 * 60_000 && ageMs < 30_000) count += 1;
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

function spawnFailure(result) {
  return text(result?.error?.message || result?.signal || (result?.status === null ? "spawn_failed" : `exit_${result?.status}`));
}

function spawnDetached(command, args) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    } catch (error) {
      resolvePromise({ ok: false, error: text(error?.message) || "spawn_failed" });
      return;
    }
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolvePromise(result);
    };
    child.once("error", (error) => finish({ ok: false, error: text(error?.message) || "spawn_failed" }));
    child.once("spawn", () => {
      child.unref();
      finish({ ok: true, pid: child.pid });
    });
  });
}

async function schedulePosixInstallService(controlPath) {
  const helperSource = `const { spawnSync } = require("node:child_process");
const controlPath = process.argv[1];
setTimeout(() => {
  const result = spawnSync(controlPath, ["install-service"], { stdio: "ignore", timeout: 20000 });
  process.exit(Number.isInteger(result.status) ? result.status : 1);
}, 250);
`;
  const handoff = await spawnDetached(process.execPath, ["-e", helperSource, controlPath]);
  return {
    ...handoff,
    mode: "posix-install-handoff",
  };
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
  if (!manifestUrl) return { configured: false, updated: false, reason: "not_configured" };
  const manifest = JSON.parse((await download(manifestUrl)).toString("utf8"));
  const expectation = runtimeExpectation(manifest);
  const files = [
    { name: "control", url: manifest.scriptUrl, sha256: manifest.sha256, path: expectation.artifacts.control.path },
    { name: "http", url: manifest.directRuntime?.url, sha256: manifest.directRuntime?.sha256, path: expectation.artifacts.http.path },
    { name: "updater", url: manifest.updaterRuntime?.url, sha256: manifest.updaterRuntime?.sha256, path: expectation.artifacts.updater.path },
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
  return {
    configured: true,
    updated: false,
    version: text(manifest.version),
    expectation,
    staged,
    runtimeConsistency: inspectRuntimeConsistency(expectation),
  };
}

function commitStagedArtifacts(staged) {
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
  return replaced.length > 0;
}

async function restartInstalledRuntime() {
  const controlPath = join(home, process.platform === "win32" ? "aiwb-agent.mjs" : "aiwbctl");
  if (managedServiceConfigured()) {
    if (process.platform === "win32") {
      // The updater is a descendant of the scheduled Agent process. Calling
      // install-service here would taskkill /T that tree and kill the installer
      // itself. A short-lived Task Scheduler handoff runs outside that tree.
      if (existsSync(controlPath)) {
        const handoff = spawnSync(process.execPath, [controlPath, "schedule-install-service"], {
          windowsHide: true,
          timeout: 20_000,
        });
        return {
          ok: handoff.status === 0,
          mode: "windows-scheduled-handoff",
          status: handoff.status,
          signal: text(handoff.signal),
          error: handoff.status === 0 ? "" : spawnFailure(handoff),
        };
      }
      return { ok: false, mode: "windows-scheduled-handoff", error: "missing_control" };
    }
    // service-run supervises the daemon and direct runtime. Stopping those
    // children makes the managed service restart from the newly installed,
    // fully validated files. Updates are already deferred until tasks drain.
    // Stop only a process whose live command line proves that it belongs to
    // this exact Agent home. PID files can be stale and PIDs can be reused.
    const daemonStopped = stopRecordedComponent("daemon", join(home, "daemon.pid"));
    const serviceStopped = daemonStopped ? false : stopRecordedComponent("service", join(home, "service.pid"));
    stopRecordedComponent("http", join(home, "http.pid"));
    return { ok: daemonStopped || serviceStopped, mode: "managed-supervisor-signal" };
  }
  if (existsSync(controlPath)) {
    if (process.platform !== "win32" && readPid(updaterPidPath) === process.pid) {
      // install-service stops the recorded updater. Hand it to a detached,
      // delayed helper so this long-running updater can first release both
      // update.lock and tick.lock in its finally block.
      return schedulePosixInstallService(controlPath);
    }
    const installed = process.platform === "win32"
      ? spawnSync(process.execPath, [controlPath, "schedule-install-service"], { windowsHide: true, timeout: 20_000 })
      : spawnSync(controlPath, ["install-service"], { timeout: 20_000 });
    if (installed.status === 0) return { ok: true, mode: "install-service", status: 0 };
  }

  const directRuntime = join(home, "aiwb-agent-http.mjs");
  if (stopRecordedComponent("http", join(home, "http.pid"))) {
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!existsSync(directRuntime)) return { ok: false, mode: "direct-fallback", error: "missing_http_runtime" };
  const direct = await spawnDetached(process.execPath, [directRuntime]);
  if (!direct.ok) return { ok: false, mode: "direct-fallback", error: `http_spawn_failed: ${direct.error}` };

  const updaterPath = join(home, "aiwb-agent-updater.mjs");
  if (!existsSync(updaterPath)) return { ok: false, mode: "direct-fallback", error: "missing_updater_runtime", httpPid: direct.pid };
  const updater = await spawnDetached(process.execPath, [updaterPath]);
  if (!updater.ok) {
    return { ok: false, mode: "direct-fallback", error: `updater_spawn_failed: ${updater.error}`, httpPid: direct.pid };
  }
  return { ok: true, mode: "direct-fallback", httpPid: direct.pid, updaterPid: updater.pid };
}

let tickInFlight = false;

async function tick() {
  if (tickInFlight) return;
  tickInFlight = true;
  if (!acquireUpdateLock()) {
    tickInFlight = false;
    return;
  }
  const previousStatus = readStatus();
  const legacyRecoveryPending = previousStatus?.runtimeRecoveryPending === true || previousStatus?.restarting === true;
  let taskTickLockHeld = false;
  let exitAfterTick = false;
  let recoveryPending = legacyRecoveryPending;
  let pendingTargetRuntime = previousStatus?.targetRuntime;
  try {
    const result = await updateOnce();
    if (!result?.configured) {
      writeStatus({
        ok: true,
        updated: false,
        reason: result?.reason || "not_configured",
        runtimeRecoveryPending: legacyRecoveryPending,
        restarting: previousStatus?.restarting === true,
        targetRuntime: previousStatus?.targetRuntime,
      });
      return;
    }

    const targetRuntime = targetRuntimeStatus(result.expectation);
    pendingTargetRuntime = targetRuntime;
    const staged = Array.isArray(result.staged) ? result.staged : [];
    let runtimeConsistency = result.runtimeConsistency;
    recoveryPending = legacyRecoveryPending || staged.length > 0 || !runtimeConsistency.consistent;

    // A freshly restarted, matching updater may observe its siblings before
    // their PID/marker files settle. Wait outside the task lock; if repair is
    // still required, all destructive work is serialized below.
    if (!staged.length && !runtimeConsistency.consistent && !singleRun && currentUpdaterMatches(result.expectation)) {
      runtimeConsistency = await waitForRuntimeConsistency(result.expectation);
      recoveryPending = legacyRecoveryPending || !runtimeConsistency.consistent;
    }

    if (!staged.length && runtimeConsistency.consistent) {
      writeStatus({
        ok: true,
        updated: false,
        recoveredLegacyRestart: legacyRecoveryPending,
        runtimeRecoveryPending: false,
        restarting: false,
        runtimeVerified: true,
        restartAcknowledged: legacyRecoveryPending,
        version: result.version,
        targetRuntime,
        runtimeConsistency,
      });
      return;
    }

    if (!(await acquireTaskTickLock())) {
      writeStatus({
        ok: true,
        updated: false,
        deferred: true,
        reason: "task_lock_busy",
        runtimeRecoveryPending: recoveryPending,
        restarting: false,
        version: result.version,
        targetRuntime,
        runtimeConsistency,
      });
      return;
    }
    taskTickLockHeld = true;

    // create-now and the daemon use this same lock. Recheck only after owning
    // it, including the short window where command.b64 exists but status does
    // not yet.
    const activeTasks = activeTaskCount();
    if (activeTasks > 0) {
      writeStatus({
        ok: true,
        updated: false,
        deferred: true,
        reason: "active_tasks",
        runtimeRecoveryPending: true,
        restarting: false,
        activeTaskCount: activeTasks,
        version: result.version,
        targetRuntime,
        runtimeConsistency,
      });
      return;
    }

    const updated = commitStagedArtifacts(staged);
    runtimeConsistency = inspectRuntimeConsistency(result.expectation);
    recoveryPending = legacyRecoveryPending || !runtimeConsistency.consistent;

    if (runtimeConsistency.consistent) {
      writeStatus({
        ok: true,
        updated,
        recoveredLegacyRestart: legacyRecoveryPending,
        runtimeRecoveryPending: false,
        restarting: false,
        runtimeVerified: true,
        restartAcknowledged: legacyRecoveryPending,
        version: result.version,
        targetRuntime,
        runtimeConsistency,
      });
      return;
    }

    // Keep the durable recovery intent set before touching any process. The
    // newly started updater is the only generation allowed to acknowledge it.
    const restartAttemptId = `${process.pid}-${Date.now()}`;
    const restartingStatus = {
      ok: true,
      updated,
      recoveredLegacyRestart: legacyRecoveryPending,
      runtimeRecoveryPending: true,
      restarting: true,
      restartTriggered: true,
      restartAttemptId,
      version: result.version,
      targetRuntime,
      runtimeConsistency,
    };
    writeStatus(restartingStatus);
    const restart = await restartInstalledRuntime();
    if (!restart?.ok) {
      if (readStatus()?.restartAttemptId === restartAttemptId) {
        writeStatus({
          ...restartingStatus,
          ok: false,
          error: `runtime restart handoff failed: ${text(restart?.error || restart?.mode || "unknown")}`,
          runtimeRecoveryPending: true,
          restarting: false,
          restartTriggered: false,
          restartHandoff: restart,
        });
      }
      return;
    }
    if (readStatus()?.restartAttemptId === restartAttemptId) {
      writeStatus({ ...restartingStatus, restartHandoff: restart });
    }
    exitAfterTick = !singleRun;
  } catch (error) {
    writeStatus({
      ok: false,
      error: text(error?.message) || "升级检查失败",
      runtimeRecoveryPending: recoveryPending,
      restarting: previousStatus?.restarting === true,
      targetRuntime: pendingTargetRuntime,
    });
  } finally {
    if (taskTickLockHeld) releaseTaskTickLock();
    releaseUpdateLock();
    tickInFlight = false;
    if (exitAfterTick) setImmediate(() => process.exit(0));
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
