import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

const VERSION = "75";
const HOME = os.homedir();
const ROOT = path.join(HOME, ".ai-workbench", "agent");
const TASKS = path.join(ROOT, "tasks");
const CONVERSATIONS = path.join(ROOT, "conversations");
const CONTROL_FILE = path.join(ROOT, "aiwb-agent.mjs");
const SERVICE_PID_FILE = path.join(ROOT, "service.pid");
const PID_FILE = path.join(ROOT, "daemon.pid");
const HTTP_PID_FILE = path.join(ROOT, "http.pid");
const UPDATER_PID_FILE = path.join(ROOT, "updater.pid");
const SERVICE_RUNTIME_SHA_FILE = path.join(ROOT, "service.runtime.sha256");
const SERVICE_LOCK = path.join(ROOT, "service.lock");
const RUNTIME_GENERATION_FILE = path.join(ROOT, "runtime.generation");
const RUNTIME_UPDATE_FENCE_FILE = path.join(ROOT, "runtime-update.fence");
const HEARTBEAT_FILE = path.join(ROOT, "daemon.heartbeat");
const LOG_FILE = path.join(ROOT, "daemon.log");
const TICK_LOCK = path.join(ROOT, "tick.lock");
const TICK_LOCK_STALE_MILLISECONDS = 30000;
const SERVICE_LOCK_PUBLICATION_GRACE_MILLISECONDS = 5000;
const INSTALL_DRAIN_QUIET_MILLISECONDS = 300;
const CODEX_FINAL_OUTPUT_POLL_MILLISECONDS = 1000;
const CODEX_FINAL_OUTPUT_EXIT_GRACE_MILLISECONDS = 15000;
const CODEX_FINAL_OUTPUT_KILL_WAIT_MILLISECONDS = 5000;
const INSTALL_HANDOFF_FENCE_WAIT_MILLISECONDS = Math.min(
  120000,
  Math.max(250, Number(process.env.AIWB_AGENT_HANDOFF_FENCE_WAIT_MS) || 30000),
);
const UPDATE_HANDOFF_TASK = "AI Workbench Agent Update Handoff";
const MAX_CONCURRENCY = 4;
const notifyingTasks = new Set();

// Scheduled Tasks often start with a reduced PATH. Keep the Node directory and
// the per-user npm bin directory available to npm-generated .cmd shims.
const NODE_BIN_DIR = path.dirname(process.execPath);
const USER_NPM_BIN_DIR = process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : "";
const EXISTING_PATH = process.env.PATH || process.env.Path || "";
process.env.PATH = [NODE_BIN_DIR, USER_NPM_BIN_DIR, EXISTING_PATH].filter(Boolean).join(path.delimiter);
process.env.Path = process.env.PATH;

for (const directory of [ROOT, TASKS, CONVERSATIONS]) fs.mkdirSync(directory, { recursive: true });

// Cache the generation observed when this Node process starts. Installed files
// can be replaced while an old daemon waits for tick.lock; that old process
// must never launch a task after a newer generation commits.
const PROCESS_CONTROL_SHA256 = fileSha256(CONTROL_FILE).toLowerCase();
const PROCESS_GENERATION_RECORD = readTrim(RUNTIME_GENERATION_FILE);

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function safeId(value) {
  return String(value || "session").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
}

function taskDir(id) {
  return path.join(TASKS, safeId(id));
}

function conversationDir(id) {
  return path.join(CONVERSATIONS, safeId(id));
}

function read(file, fallback = "") {
  try { return fs.readFileSync(file, "utf8"); } catch { return fallback; }
}

function readTrim(file, fallback = "") {
  return read(file, fallback).trim();
}

function installedVersion() {
  const match = read(process.argv[1]).match(/const VERSION = ["']([^"']+)["']/);
  return match?.[1] || VERSION;
}

const ATOMIC_WRITE_RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const ATOMIC_WRITE_RETRY_DELAYS_MILLISECONDS = [10, 20, 40, 80, 160, 250, 250];

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function replaceFileAtomic(temporary, file) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(temporary, file);
      return;
    } catch (error) {
      const retryable = ATOMIC_WRITE_RETRY_CODES.has(String(error?.code || "").toUpperCase());
      if (!retryable || attempt >= ATOMIC_WRITE_RETRY_DELAYS_MILLISECONDS.length) {
        throw error;
      }
      sleepSync(ATOMIC_WRITE_RETRY_DELAYS_MILLISECONDS[attempt]);
    }
  }
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + ".tmp-" + process.pid;
  try {
    fs.writeFileSync(temporary, String(value ?? ""), "utf8");
    replaceFileAtomic(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function append(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, String(value ?? ""), "utf8");
}

function taskStatus(id) {
  return readTrim(path.join(taskDir(id), "status"), "unknown");
}

function taskIds() {
  try {
    return fs.readdirSync(TASKS).filter((id) => {
      try { return fs.statSync(taskDir(id)).isDirectory(); } catch { return false; }
    });
  } catch { return []; }
}

function conversationIds() {
  try {
    return fs.readdirSync(CONVERSATIONS).filter((id) => {
      try { return fs.statSync(conversationDir(id)).isDirectory(); } catch { return false; }
    });
  } catch { return []; }
}

function isAlive(pid) {
  const value = Number(pid);
  if (!Number.isFinite(value) || value <= 0) return false;
  try { process.kill(value, 0); return true; } catch { return false; }
}

function daemonAlive() {
  return processMatchesComponent(readTrim(PID_FILE), "daemon");
}

function normalizeProcessPath(value) {
  const raw = String(value || "").trim().replace(/^"(.*)"$/, "$1");
  if (!raw) return "";
  try { return path.resolve(raw).replace(/\//g, "\\").toLowerCase(); } catch { return raw.replace(/\//g, "\\").toLowerCase(); }
}

function commandLineHasToken(commandLine, token, normalizePath = false) {
  let source = String(commandLine || "").trim();
  let expected = String(token || "").trim();
  if (!source || !expected) return false;
  if (normalizePath) {
    source = source.replace(/\//g, "\\");
    expected = expected.replace(/\//g, "\\");
  }
  const escaped = expected.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  return new RegExp('(?:^|[\\s"])' + escaped + '(?=$|[\\s"])', "i").test(source);
}

function parseProcessDescriptorItems(stdout) {
  const value = String(stdout || "").trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
      pid: Number(item?.ProcessId),
      executablePath: String(item?.ExecutablePath || "").trim(),
      commandLine: String(item?.CommandLine || "").trim(),
    })).filter((item) => Number.isFinite(item.pid) && item.pid > 0);
  } catch {
    return [];
  }
}

function processDescriptors(pids) {
  const values = [...new Set(pids.map(Number).filter((value) => Number.isFinite(value) && value > 0 && isAlive(value)))];
  const descriptors = new Map(values.map((value) => [String(value), null]));
  if (!values.length) return descriptors;
  const filter = values.map((value) => "ProcessId = " + value).join(" OR ");
  const script = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); '
    + '$items = Get-CimInstance Win32_Process -Filter "' + filter + '" -ErrorAction Stop; '
    + "ConvertTo-Json -InputObject @($items | ForEach-Object { [pscustomobject]@{ ProcessId = $_.ProcessId; ExecutablePath = $_.ExecutablePath; CommandLine = $_.CommandLine } }) -Compress";
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true, timeout: 5000 },
  );
  if (result.status !== 0 || !String(result.stdout || "").trim()) return descriptors;
  try {
    for (const item of parseProcessDescriptorItems(result.stdout)) {
      const key = String(item.pid);
      if (!descriptors.has(key)) continue;
      descriptors.set(key, {
        executablePath: item.executablePath,
        commandLine: item.commandLine,
      });
    }
  } catch {}
  return descriptors;
}

function processDescriptor(pid) {
  return processDescriptors([pid]).get(String(Number(pid))) || null;
}

function descriptorMatchesComponent(descriptor, component) {
  if (!descriptor || normalizeProcessPath(descriptor.executablePath) !== normalizeProcessPath(process.execPath)) return false;
  const commandLine = descriptor.commandLine;
  const httpPath = path.join(ROOT, "aiwb-agent-http.mjs");
  const updaterPath = path.join(ROOT, "aiwb-agent-updater.mjs");
  if (component === "service") {
    return commandLineHasToken(commandLine, CONTROL_FILE, true) && commandLineHasToken(commandLine, "service-run");
  }
  if (component === "daemon") {
    return commandLineHasToken(commandLine, CONTROL_FILE, true)
      && (commandLineHasToken(commandLine, "daemon") || commandLineHasToken(commandLine, "service-run"));
  }
  if (component === "http") return commandLineHasToken(commandLine, httpPath, true);
  if (component === "updater") return commandLineHasToken(commandLine, updaterPath, true);
  return false;
}

function processMatchesComponent(pid, component, descriptorCache = null) {
  const key = String(Number(pid));
  let descriptor;
  if (descriptorCache?.has(key)) descriptor = descriptorCache.get(key);
  else {
    descriptor = processDescriptor(pid);
    descriptorCache?.set(key, descriptor);
  }
  return descriptorMatchesComponent(descriptor, component);
}

function matchingComponentProcessIds(component) {
  const script = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); '
    + '$items = Get-CimInstance Win32_Process -ErrorAction Stop; '
    + "ConvertTo-Json -InputObject @($items | ForEach-Object { [pscustomobject]@{ ProcessId = $_.ProcessId; ExecutablePath = $_.ExecutablePath; CommandLine = $_.CommandLine } }) -Compress";
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.status !== 0) return { ok: false, pids: [] };
  return {
    ok: true,
    pids: parseProcessDescriptorItems(result.stdout)
      .filter((item) => descriptorMatchesComponent(item, component))
      .map((item) => item.pid),
  };
}

function serviceLockAgeMilliseconds() {
  const startedAt = Date.parse(readTrim(path.join(SERVICE_LOCK, "started_at")));
  if (Number.isFinite(startedAt)) return Math.max(0, Date.now() - startedAt);
  try { return Math.max(0, Date.now() - fs.statSync(SERVICE_LOCK).mtimeMs); } catch { return Number.POSITIVE_INFINITY; }
}

function serviceLockOwned(token) {
  return Boolean(token)
    && readTrim(path.join(SERVICE_LOCK, "owner.pid")) === String(process.pid)
    && readTrim(path.join(SERVICE_LOCK, "owner.token")) === token;
}

function releaseServiceLock(token) {
  if (!serviceLockOwned(token)) return false;
  for (const name of ["owner.pid", "owner.token", "started_at", "version", "control.sha256"]) {
    try { fs.unlinkSync(path.join(SERVICE_LOCK, name)); } catch {}
  }
  try { fs.rmdirSync(SERVICE_LOCK); return true; } catch { return false; }
}

function clearStaleServiceLock() {
  if (!fs.existsSync(SERVICE_LOCK)) return false;
  const ownerPidText = readTrim(path.join(SERVICE_LOCK, "owner.pid"));
  const ownerToken = readTrim(path.join(SERVICE_LOCK, "owner.token"));
  const ownerPid = Number(ownerPidText);
  if (ownerPid > 1 && isAlive(ownerPid)) {
    const descriptor = processDescriptor(ownerPid);
    // A missing or partial descriptor is ambiguous (for example while CIM is
    // temporarily unavailable). Fail closed instead of creating a second tree.
    if (!descriptor || !descriptor.executablePath || !descriptor.commandLine) return false;
    if (descriptorMatchesComponent(descriptor, "service")) return false;
  } else if ((!ownerPidText || !ownerToken) && serviceLockAgeMilliseconds() < SERVICE_LOCK_PUBLICATION_GRACE_MILLISECONDS) {
    // mkdir and owner publication are separate syscalls. Preserve that window.
    return false;
  }
  if (readTrim(path.join(SERVICE_LOCK, "owner.pid")) !== ownerPidText) return false;
  if (readTrim(path.join(SERVICE_LOCK, "owner.token")) !== ownerToken) return false;
  const quarantine = SERVICE_LOCK + ".stale-" + process.pid + "-" + crypto.randomBytes(6).toString("hex");
  try {
    fs.renameSync(SERVICE_LOCK, quarantine);
  } catch {
    return false;
  }
  try { fs.rmSync(quarantine, { recursive: true, force: true }); } catch {}
  return true;
}

function acquireServiceLock() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = process.pid + "-" + Date.now() + "-" + crypto.randomBytes(8).toString("hex");
    let created = false;
    try {
      fs.mkdirSync(SERVICE_LOCK);
      created = true;
      fs.writeFileSync(path.join(SERVICE_LOCK, "owner.token"), token, { encoding: "utf8", flag: "wx" });
      fs.writeFileSync(path.join(SERVICE_LOCK, "owner.pid"), String(process.pid), { encoding: "utf8", flag: "wx" });
      fs.writeFileSync(path.join(SERVICE_LOCK, "started_at"), now(), { encoding: "utf8", flag: "wx" });
      fs.writeFileSync(path.join(SERVICE_LOCK, "version"), String(VERSION), { encoding: "utf8", flag: "wx" });
      fs.writeFileSync(path.join(SERVICE_LOCK, "control.sha256"), PROCESS_CONTROL_SHA256, { encoding: "utf8", flag: "wx" });
      return token;
    } catch (error) {
      if (created) {
        try { fs.rmSync(SERVICE_LOCK, { recursive: true, force: true }); } catch {}
        return "";
      }
      if (error?.code !== "EEXIST" || !clearStaleServiceLock()) return "";
    }
  }
  return "";
}

function processMatchesTaskRunner(pid, id) {
  const descriptor = processDescriptor(pid);
  return Boolean(descriptor)
    && normalizeProcessPath(descriptor.executablePath) === normalizeProcessPath(process.execPath)
    && commandLineHasToken(descriptor.commandLine, CONTROL_FILE, true)
    && commandLineHasToken(descriptor?.commandLine, "runner")
    && commandLineHasToken(descriptor?.commandLine, safeId(id));
}

function stopTaskRunner(id) {
  const file = path.join(taskDir(id), "pid");
  const pid = readTrim(file);
  if (!processMatchesTaskRunner(pid, id)) return false;
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
  return true;
}

function stopPidFile(file, component) {
  const pid = readTrim(file);
  if (!processMatchesComponent(pid, component)) {
    if (pid && readTrim(file) === String(pid)) write(file, "");
    return false;
  }
  const result = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
  if (result.status !== 0) {
    // Re-check after taskkill: a failed kill and immediate PID reuse must not
    // turn the fallback into a signal for an unrelated process.
    if (processMatchesComponent(pid, component)) {
      try { process.kill(Number(pid)); } catch {}
    }
  }
  if (readTrim(file) === String(pid)) write(file, "");
  return true;
}

function stopMatchingComponentProcesses(component, pidFiles = []) {
  const stopped = new Set();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const discovered = matchingComponentProcessIds(component);
    if (!discovered.ok) return { ok: false, pids: [...stopped], reason: "enumeration_failed" };
    const candidates = new Set(discovered.pids.map(Number));
    for (const file of pidFiles) {
      const pid = Number(readTrim(file));
      if (pid > 1) candidates.add(pid);
    }
    let matched = 0;
    for (const pid of candidates) {
      if (pid === process.pid || !processMatchesComponent(pid, component)) continue;
      matched += 1;
      const result = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
      if (result.status !== 0 && processMatchesComponent(pid, component)) {
        try { process.kill(pid); } catch {}
      }
      stopped.add(pid);
    }
    if (!matched) break;
    sleepSync(50);
  }
  const remaining = matchingComponentProcessIds(component);
  if (!remaining.ok) return { ok: false, pids: [...stopped], reason: "verification_failed" };
  const liveRemaining = remaining.pids.filter((pid) => pid !== process.pid);
  if (liveRemaining.length) {
    return { ok: false, pids: [...stopped], remaining: liveRemaining, reason: "owned_processes_remain" };
  }
  for (const file of pidFiles) {
    const pid = readTrim(file);
    if (pid && (!isAlive(pid) || stopped.has(Number(pid))) && readTrim(file) === pid) write(file, "");
  }
  return { ok: true, pids: [...stopped] };
}

function stopDaemon() {
  // PID files record only one writer, so v69 can leave an earlier service tree
  // invisible. Enumerate by exact executable + CONTROL_FILE + service-run and
  // terminate every owned tree while the installer holds tick.lock and its
  // runtime fence. Revalidation immediately before taskkill prevents PID reuse
  // from authorizing an unrelated process kill.
  const serviceResult = stopMatchingComponentProcesses("service", [SERVICE_PID_FILE]);
  if (!serviceResult.ok) {
    log("service tree cleanup failed reason=" + serviceResult.reason + " remaining=" + (serviceResult.remaining || []).join(","));
    return false;
  }
  if (serviceResult.pids.length) log("stopped service trees pids=" + serviceResult.pids.join(","));
  const daemonResult = stopMatchingComponentProcesses("daemon", [PID_FILE]);
  const httpResult = stopMatchingComponentProcesses("http", [HTTP_PID_FILE]);
  const updaterResult = stopMatchingComponentProcesses("updater", [UPDATER_PID_FILE]);
  if (!daemonResult.ok || !httpResult.ok || !updaterResult.ok) {
    log("component cleanup verification failed daemon=" + daemonResult.ok + " http=" + httpResult.ok + " updater=" + updaterResult.ok);
    return false;
  }
  for (let attempt = 0; attempt < 20 && fs.existsSync(SERVICE_LOCK); attempt += 1) {
    if (clearStaleServiceLock()) break;
    sleepSync(50);
  }
  if (fs.existsSync(SERVICE_LOCK)) {
    log("service lock cleanup failed");
    return false;
  }
  write(HEARTBEAT_FILE, "");
  return true;
}

function tickLockAgeMilliseconds() {
  const startedAt = Date.parse(readTrim(path.join(TICK_LOCK, "started_at")));
  if (Number.isFinite(startedAt)) return Math.max(0, Date.now() - startedAt);
  try { return Math.max(0, Date.now() - fs.statSync(TICK_LOCK).mtimeMs); } catch { return Number.POSITIVE_INFINITY; }
}

function clearStaleTickLock() {
  if (!fs.existsSync(TICK_LOCK)) return false;
  const ownerPid = Number(readTrim(path.join(TICK_LOCK, "owner.pid")));
  if (ownerPid > 1) {
    // A published dead owner is safe to recover immediately. A live owner is
    // authoritative forever; elapsed time is never permission to steal it.
    if (isAlive(ownerPid)) return false;
  } else if (tickLockAgeMilliseconds() < TICK_LOCK_STALE_MILLISECONDS) {
    // Preserve the short mkdir -> owner.pid publication window.
    return false;
  }
  const quarantine = TICK_LOCK + ".stale-" + process.pid + "-" + crypto.randomBytes(6).toString("hex");
  try {
    fs.renameSync(TICK_LOCK, quarantine);
  } catch {
    return false;
  }
  try { fs.rmSync(quarantine, { recursive: true, force: true }); } catch {}
  return true;
}

function acquireTickLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = process.pid + "-" + Date.now() + "-" + crypto.randomBytes(8).toString("hex");
    try {
      fs.mkdirSync(TICK_LOCK);
      fs.writeFileSync(path.join(TICK_LOCK, "owner.pid"), String(process.pid), { encoding: "utf8", flag: "wx" });
      fs.writeFileSync(path.join(TICK_LOCK, "owner.token"), token, { encoding: "utf8", flag: "wx" });
      fs.writeFileSync(path.join(TICK_LOCK, "started_at"), now(), { encoding: "utf8", flag: "wx" });
      return token;
    } catch (error) {
      if (readTrim(path.join(TICK_LOCK, "owner.token")) === token) releaseTickLock(token);
      else if (error?.code !== "EEXIST") {
        try { fs.rmdirSync(TICK_LOCK); } catch {}
      }
      if (!clearStaleTickLock()) return "";
    }
  }
  return "";
}

function waitForTickLock(timeoutMilliseconds = 5000) {
  const deadline = Date.now() + Math.max(100, Number(timeoutMilliseconds) || 5000);
  while (Date.now() < deadline) {
    const token = acquireTickLock();
    if (token) return token;
    sleepSync(20);
  }
  return "";
}

function tickLockOwned(token) {
  return Boolean(token)
    && readTrim(path.join(TICK_LOCK, "owner.pid")) === String(process.pid)
    && readTrim(path.join(TICK_LOCK, "owner.token")) === token;
}

function releaseTickLock(token) {
  if (!tickLockOwned(token)) return false;
  for (const name of ["owner.pid", "owner.token", "started_at"]) {
    try { fs.unlinkSync(path.join(TICK_LOCK, name)); } catch {}
  }
  try { fs.rmdirSync(TICK_LOCK); return true; } catch { return false; }
}

function componentPidFileReady(file, component, descriptorCache = null) {
  return processMatchesComponent(readTrim(file), component, descriptorCache);
}

function fileSha256(file) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); } catch { return ""; }
}

function runtimeGenerationReady(runtimeName, markerName) {
  const runtimeSha = fileSha256(path.join(ROOT, runtimeName));
  return Boolean(runtimeSha) && readTrim(path.join(ROOT, markerName)).toLowerCase() === runtimeSha;
}

function parseGenerationRecord(content) {
  const result = {};
  for (const line of String(content || "").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return result;
}

function runtimeUpdateInProgress() {
  return fs.existsSync(RUNTIME_UPDATE_FENCE_FILE);
}

function globalActiveTaskIds() {
  return taskIds().filter((id) => {
    const status = taskStatus(id).toLowerCase();
    if (["queued", "preparing", "busy"].includes(status)) return true;
    if (status !== "running") return false;
    // A crashed runner can leave the running state behind. Only a live process whose
    // executable, control path, runner command, and task id all match may keep
    // the supervisor handoff deferred; stale or reused PIDs cannot block
    // automatic recovery forever.
    return processMatchesTaskRunner(readTrim(path.join(taskDir(id), "pid")), id);
  });
}

function emitInstallDeferred(reason, activeTaskIds = []) {
  const activeCount = activeTaskIds.length;
  console.log("__AIWB_AGENT_STATUS__deferred");
  console.log("__AIWB_AGENT_VERSION__" + VERSION);
  console.log("__AIWB_AGENT_INSTALL_RESULT__deferred");
  console.log("__AIWB_AGENT_INSTALL_DEFER_REASON__" + reason);
  console.log("__AIWB_AGENT_ACTIVE_TASKS__" + activeCount);
  if (activeCount) {
    console.log("__AIWB_AGENT_ERROR__Agent 正在执行任务，Windows 服务升级已安全延后；任务结束后 updater 会自动重试。");
  } else if (reason === "task_lock_busy") {
    console.log("__AIWB_AGENT_ERROR__Agent 任务启动锁正忙，Windows 服务升级已安全延后；updater 会自动重试。");
  } else {
    console.log("__AIWB_AGENT_ERROR__另一个 Agent 升级事务仍在进行，Windows 服务升级已安全延后。");
  }
  log("service install deferred reason=" + reason + " active_tasks=" + activeTaskIds.join(","));
  process.exitCode = reason === "active_tasks" ? 20 : reason === "task_lock_busy" ? 21 : 22;
  return false;
}

function installLockInheritedFrom(parentLockOwnerPid) {
  const ownerPid = Number(parentLockOwnerPid);
  return ownerPid > 1
    && isAlive(ownerPid)
    && readTrim(path.join(TICK_LOCK, "owner.pid")) === String(ownerPid)
    && Boolean(readTrim(path.join(TICK_LOCK, "owner.token")));
}

function committedGenerationMatchesDrainFence(fence) {
  const committed = parseGenerationRecord(readTrim(RUNTIME_GENERATION_FILE));
  const controlSha = fileSha256(CONTROL_FILE).toLowerCase();
  const httpSha = fileSha256(path.join(ROOT, "aiwb-agent-http.mjs")).toLowerCase();
  const updaterSha = fileSha256(path.join(ROOT, "aiwb-agent-updater.mjs")).toLowerCase();
  const currentVersion = String(VERSION).replace(/^v/i, "");
  return fence.format === "1"
    && fence.state === "draining"
    && Boolean(fence.epoch)
    && Boolean(fence.target_version)
    && Boolean(fence.target_control_sha256)
    && committed.format === "1"
    && committed.state === "committed"
    && committed.epoch === fence.epoch
    && committed.version === fence.target_version
    && committed.control_sha256 === fence.target_control_sha256
    && committed.version === currentVersion
    && committed.control_sha256 === controlSha
    && Boolean(committed.http_sha256)
    && committed.http_sha256 === httpSha
    && Boolean(committed.updater_sha256)
    && committed.updater_sha256 === updaterSha;
}

function waitForUpdaterDrainFenceRelease(timeoutMilliseconds = INSTALL_HANDOFF_FENCE_WAIT_MILLISECONDS) {
  const deadline = Date.now() + Math.max(250, Number(timeoutMilliseconds) || INSTALL_HANDOFF_FENCE_WAIT_MILLISECONDS);
  while (fs.existsSync(RUNTIME_UPDATE_FENCE_FILE)) {
    const fence = parseGenerationRecord(readTrim(RUNTIME_UPDATE_FENCE_FILE));
    if (fence.state !== "draining") return false;
    const ownerPid = Number(fence.owner_pid);
    // A dead owner is adjudicated only after tick.lock is acquired. Until
    // then, do not unlink anything because another updater may be publishing.
    if (!(ownerPid > 1) || !isAlive(ownerPid)) return true;
    if (Date.now() >= deadline) return false;
    sleepSync(50);
  }
  return true;
}

function resolveUpdaterDrainFenceUnderLock() {
  if (!fs.existsSync(RUNTIME_UPDATE_FENCE_FILE)) return true;
  const content = read(RUNTIME_UPDATE_FENCE_FILE);
  const fence = parseGenerationRecord(content);
  const ownerPid = Number(fence.owner_pid);
  // Never clear an active owner, an invalid owner record, a non-draining
  // fence, or a generation that does not exactly match all committed files.
  if (fence.state !== "draining" || !(ownerPid > 1) || isAlive(ownerPid)) return false;
  if (!committedGenerationMatchesDrainFence(fence)) return false;
  if (read(RUNTIME_UPDATE_FENCE_FILE) !== content) return false;
  try {
    fs.unlinkSync(RUNTIME_UPDATE_FENCE_FILE);
    console.log("__AIWB_AGENT_INSTALL_FENCE_RECOVERED__1");
    log("recovered abandoned committed updater fence epoch=" + fence.epoch + " owner_pid=" + ownerPid);
    return true;
  } catch {
    return false;
  }
}

function acquireServiceInstallFence() {
  const epoch = crypto.randomUUID();
  const record = [
    "format=1",
    "state=service-install",
    "epoch=" + epoch,
    "owner_pid=" + process.pid,
    "target_version=" + String(VERSION).replace(/^v/i, ""),
    "target_control_sha256=" + fileSha256(CONTROL_FILE).toLowerCase(),
    "",
  ].join("\n");
  try {
    fs.writeFileSync(RUNTIME_UPDATE_FENCE_FILE, record, { encoding: "utf8", flag: "wx" });
    return epoch;
  } catch {
    return "";
  }
}

function releaseServiceInstallFence(epoch) {
  if (!epoch) return false;
  const record = parseGenerationRecord(readTrim(RUNTIME_UPDATE_FENCE_FILE));
  if (record.epoch !== epoch || Number(record.owner_pid) !== process.pid) return false;
  try { fs.unlinkSync(RUNTIME_UPDATE_FENCE_FILE); return true; } catch { return false; }
}

function beginServiceInstall(parentLockOwnerPid = "", fenceWaitMilliseconds = INSTALL_HANDOFF_FENCE_WAIT_MILLISECONDS) {
  if (!waitForUpdaterDrainFenceRelease(fenceWaitMilliseconds)) {
    emitInstallDeferred("runtime_update_fence_busy");
    return null;
  }
  const inheritedLock = installLockInheritedFrom(parentLockOwnerPid);
  const tickLockToken = inheritedLock ? "" : waitForTickLock(fenceWaitMilliseconds);
  if (!inheritedLock && !tickLockToken) {
    emitInstallDeferred("task_lock_busy");
    return null;
  }
  if (!resolveUpdaterDrainFenceUnderLock()) {
    if (tickLockToken) releaseTickLock(tickLockToken);
    emitInstallDeferred("runtime_update_fence_busy");
    return null;
  }
  const fenceEpoch = acquireServiceInstallFence();
  if (!fenceEpoch) {
    if (tickLockToken) releaseTickLock(tickLockToken);
    emitInstallDeferred("runtime_update_fence_busy");
    return null;
  }
  // A creator that passed its first fence check immediately before this
  // transaction writes preparing before it waits on tick.lock. Give that
  // metadata a bounded window to become visible, then perform the final scan
  // while the shared machine-wide lock and fence are both still held.
  sleepSync(INSTALL_DRAIN_QUIET_MILLISECONDS);
  const activeTaskIds = globalActiveTaskIds();
  if (activeTaskIds.length) {
    releaseServiceInstallFence(fenceEpoch);
    if (tickLockToken) releaseTickLock(tickLockToken);
    emitInstallDeferred("active_tasks", activeTaskIds);
    return null;
  }
  return { fenceEpoch, tickLockToken };
}

function endServiceInstall(transaction) {
  if (!transaction) return;
  releaseServiceInstallFence(transaction.fenceEpoch);
  if (transaction.tickLockToken) releaseTickLock(transaction.tickLockToken);
}

function committedGenerationMatchesCurrent(content = readTrim(RUNTIME_GENERATION_FILE)) {
  if (runtimeUpdateInProgress()) return false;
  const record = parseGenerationRecord(content);
  const controlSha = fileSha256(CONTROL_FILE).toLowerCase();
  const httpSha = fileSha256(path.join(ROOT, "aiwb-agent-http.mjs")).toLowerCase();
  const updaterSha = fileSha256(path.join(ROOT, "aiwb-agent-updater.mjs")).toLowerCase();
  return record.format === "1"
    && record.state === "committed"
    && Boolean(record.epoch)
    && record.version === String(VERSION).replace(/^v/i, "")
    && Boolean(controlSha)
    && Boolean(httpSha)
    && Boolean(updaterSha)
    && record.control_sha256 === controlSha
    && record.http_sha256 === httpSha
    && record.updater_sha256 === updaterSha;
}

function processGenerationIsCurrent() {
  return Boolean(PROCESS_CONTROL_SHA256)
    && Boolean(PROCESS_GENERATION_RECORD)
    && !runtimeUpdateInProgress()
    && fileSha256(CONTROL_FILE).toLowerCase() === PROCESS_CONTROL_SHA256
    && readTrim(RUNTIME_GENERATION_FILE) === PROCESS_GENERATION_RECORD
    && committedGenerationMatchesCurrent(PROCESS_GENERATION_RECORD);
}

function printGenerationChanged() {
  console.log("__AIWB_AGENT_STATUS__error");
  console.log("__AIWB_AGENT_ERROR_CODE__generation_changed");
  console.log("__AIWB_AGENT_RETRYABLE__1");
  console.log("__AIWB_AGENT_ERROR__Agent 正在升级或已切换到新版本，本次旧版本任务未启动；请重试。");
}

function rejectTaskForGenerationChange(id, reason) {
  const directory = taskDir(id);
  append(path.join(directory, "bootstrap.log"), [
    "AI Workbench Agent: task was not started because the runtime generation changed.",
    "reason: " + reason,
    "checked_at: " + now(),
    "",
  ].join("\n"));
  write(path.join(directory, "retryable_error_code"), "generation_changed");
  setStatus(id, "error", "76");
}

function heartbeatReady(maximumAgeMilliseconds = 15000) {
  const timestamp = Date.parse(readTrim(HEARTBEAT_FILE));
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= -5000 && age <= maximumAgeMilliseconds;
}

function runtimeSnapshot() {
  const servicePid = readTrim(SERVICE_PID_FILE);
  const daemonPid = readTrim(PID_FILE);
  const httpPid = readTrim(HTTP_PID_FILE);
  const updaterPid = readTrim(UPDATER_PID_FILE);
  const descriptorCache = processDescriptors([servicePid, daemonPid, httpPid, updaterPid]);
  const serviceReady = componentPidFileReady(SERVICE_PID_FILE, "service", descriptorCache);
  const daemonReady = componentPidFileReady(PID_FILE, "daemon", descriptorCache);
  return {
    servicePid,
    daemonPid,
    serviceReady,
    daemonReady,
    httpReady: componentPidFileReady(HTTP_PID_FILE, "http", descriptorCache),
    updaterReady: componentPidFileReady(UPDATER_PID_FILE, "updater", descriptorCache),
  };
}

function runtimeReady(snapshot = runtimeSnapshot()) {
  const controlSha = fileSha256(CONTROL_FILE).toLowerCase();
  return committedGenerationMatchesCurrent()
    && Boolean(controlSha)
    && snapshot.serviceReady
    && snapshot.daemonReady
    && snapshot.servicePid === snapshot.daemonPid
    && readTrim(SERVICE_RUNTIME_SHA_FILE).toLowerCase() === controlSha
    && heartbeatReady()
    && snapshot.httpReady
    && runtimeGenerationReady("aiwb-agent-http.mjs", "http.runtime.sha256")
    && snapshot.updaterReady
    && runtimeGenerationReady("aiwb-agent-updater.mjs", "updater.runtime.sha256");
}

function waitForRuntimeReady(timeoutMilliseconds = 15000) {
  const deadline = Date.now() + Math.max(1000, Number(timeoutMilliseconds) || 15000);
  while (Date.now() < deadline) {
    if (runtimeReady()) return true;
    sleepSync(200);
  }
  return runtimeReady();
}

function emitRuntimeStatuses() {
  const snapshot = runtimeSnapshot();
  console.log("__AIWB_AGENT_SERVICE_PROCESS_STATUS__" + (snapshot.serviceReady ? "running" : "stopped"));
  console.log("__AIWB_AGENT_DAEMON_STATUS__" + (snapshot.daemonReady ? "running" : "stopped"));
  console.log("__AIWB_AGENT_DAEMON_HEARTBEAT__" + readTrim(HEARTBEAT_FILE));
  console.log("__AIWB_AGENT_HTTP_STATUS__" + (snapshot.httpReady ? "running" : "stopped"));
  console.log("__AIWB_AGENT_UPDATER_STATUS__" + (snapshot.updaterReady ? "running" : "stopped"));
  console.log("__AIWB_AGENT_GENERATION_READY__" + (runtimeReady(snapshot) ? "1" : "0"));
}

function log(message) {
  append(LOG_FILE, "[" + now() + "] " + message + "\n");
}

function ageSeconds(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return 999999;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
}

function updateConversation(id) {
  const taskId = readTrim(path.join(taskDir(id), "conversation_id"));
  if (!taskId) return;
  const target = conversationDir(taskId);
  fs.mkdirSync(target, { recursive: true });
  write(path.join(target, "id"), taskId);
  write(path.join(target, "status"), taskStatus(id));
  write(path.join(target, "updated_at"), now());
  for (const name of ["name", "workdir", "agent_id", "model", "turn_id", "request_message_id", "response_message_id", "created_at", "queued_at", "started_at", "runner_started_at", "finished_at", "exit_code"]) {
    const source = path.join(taskDir(id), name);
    if (fs.existsSync(source)) write(path.join(target, name), read(source));
  }
  if (fs.existsSync(path.join(taskDir(id), "prompt.txt"))) write(path.join(target, "last_prompt.txt"), read(path.join(taskDir(id), "prompt.txt")));
  if (["done", "error", "cancelled"].includes(taskStatus(id))) {
    const output = read(path.join(taskDir(id), "output.log")) || read(path.join(taskDir(id), "bootstrap.log"));
    write(path.join(target, "last_result.txt"), output);
    const executionSummary = read(path.join(taskDir(id), "execution-summary.txt"));
    write(path.join(target, "last_execution_summary.txt"), executionSummary);
  }
  // Publish the pointer last so readers never combine a new task ID with the
  // previous task's result snapshot.
  write(path.join(target, "task_id"), id);
}

function pruneConversationTasks(currentId) {
  const conversationId = readTrim(path.join(taskDir(currentId), "conversation_id"));
  if (!conversationId) return;
  let removedCount = 0;
  for (const id of taskIds()) {
    if (id === currentId || readTrim(path.join(taskDir(id), "conversation_id")) !== conversationId) continue;
    if (!["done", "error", "cancelled", "rejected", "busy"].includes(taskStatus(id))) continue;
    fs.rmSync(taskDir(id), { recursive: true, force: true });
    removedCount += 1;
  }
  if (removedCount > 0) log("pruned conversation tasks conversation=" + conversationId + " current=" + currentId + " removed=" + removedCount);
}

async function notifyTerminal(id) {
  if (notifyingTasks.has(id)) return;
  const status = taskStatus(id);
  if (!["done", "error", "cancelled"].includes(status)) return;
  const directory = taskDir(id);
  const notifyUrl = readTrim(path.join(directory, "push_notify_url"));
  const notifyToken = readTrim(path.join(directory, "push_notify_token"));
  if (!notifyUrl || !notifyToken || readTrim(path.join(directory, "push_notified_at"))) return;
  const nextAttemptAt = Number(readTrim(path.join(directory, "push_notify_next_at"), "0"));
  if (nextAttemptAt > Date.now()) return;

  notifyingTasks.add(id);
  const attempts = Number(readTrim(path.join(directory, "push_notify_attempts"), "0")) + 1;
  write(path.join(directory, "push_notify_attempts"), attempts);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(notifyUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + notifyToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    write(path.join(directory, "push_notify_response.log"), responseText);
    if (!response.ok) throw new Error("HTTP " + response.status);
    write(path.join(directory, "push_notified_at"), now());
    log("push delivered task=" + id + " status=" + status);
  } catch (error) {
    write(path.join(directory, "push_notify_next_at"), Date.now() + 30_000 + attempts * 15_000);
    append(path.join(directory, "push_notify_response.log"), "\n" + String(error?.message || error));
    log("push retry scheduled task=" + id + " status=" + status);
  } finally {
    clearTimeout(timeout);
    notifyingTasks.delete(id);
  }
}

function scheduleTerminalNotification(id) {
  void notifyTerminal(id);
}

function setStatus(id, status, exitCode = "") {
  const directory = taskDir(id);
  write(path.join(directory, "status"), status);
  write(path.join(directory, "exit_code"), exitCode);
  if (["done", "error", "cancelled"].includes(status)) write(path.join(directory, "finished_at"), now());
  updateConversation(id);
  if (["done", "error", "cancelled"].includes(status)) {
    scheduleTerminalNotification(id);
    pruneConversationTasks(id);
  }
}

function activeTaskForConversation(conversationId, exclude = "") {
  if (!conversationId) return "";
  for (const id of taskIds()) {
    if (id === exclude || readTrim(path.join(taskDir(id), "conversation_id")) !== conversationId) continue;
    const status = taskStatus(id);
    if (["queued", "preparing", "running"].includes(status)) return id;
  }
  return "";
}

function fingerprint(id) {
  const directory = taskDir(id);
  const content = [
    taskStatus(id),
    read(path.join(directory, "output.log")),
    read(path.join(directory, "bootstrap.log")),
    read(path.join(directory, "execution-summary.txt")),
  ].join("\n");
  return crypto.createHash("sha1").update(content).digest("hex").slice(0, 20);
}

function taskOutput(id) {
  const directory = taskDir(id);
  return read(path.join(directory, "output.log")) || read(path.join(directory, "bootstrap.log")) || read(path.join(directory, "launcher.log"));
}

function gitRun(repository, args) {
  try {
    const result = spawnSync("git", ["-C", repository, ...args], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      ok: result.status === 0,
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
    };
  } catch (error) {
    return { ok: false, stdout: "", stderr: String(error?.message || error) };
  }
}

function discoverGitRepositories(workdir, maxDepth = 5) {
  const root = path.resolve(String(workdir || ""));
  if (!root || !fs.existsSync(root)) return [];

  const rootProbe = gitRun(root, ["rev-parse", "--show-toplevel"]);
  if (rootProbe.ok && rootProbe.stdout.trim()) return [path.resolve(rootProbe.stdout.trim())];

  const repositories = [];
  const pending = [{ directory: root, depth: 0 }];
  while (pending.length) {
    const current = pending.pop();
    if (!current || current.depth > maxDepth) continue;
    let entries = [];
    try { entries = fs.readdirSync(current.directory, { withFileTypes: true }); } catch { continue; }
    if (entries.some((entry) => entry.name === ".git")) {
      repositories.push(current.directory);
      continue;
    }
    if (current.depth === maxDepth) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || [".git", "node_modules", ".next", "dist", "build"].includes(entry.name)) continue;
      pending.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
    }
  }
  return [...new Set(repositories)].sort();
}

function captureGitSnapshot(id, workdir, filename) {
  const snapshot = { workdir: String(workdir || ""), repositories: {} };
  for (const repository of discoverGitRepositories(workdir)) {
    const head = gitRun(repository, ["rev-parse", "HEAD"]).stdout.trim();
    const tracked = gitRun(repository, ["diff", "--name-only", "-z", "HEAD", "--"]).stdout;
    const untracked = gitRun(repository, ["ls-files", "--others", "--exclude-standard", "-z"]).stdout;
    const files = [...new Set((tracked + untracked).split("\0").map((value) => value.trim()).filter(Boolean))].sort();
    const dirty = {};
    for (const relativePath of files) {
      const absolutePath = path.join(repository, relativePath);
      if (!fs.existsSync(absolutePath)) {
        dirty[relativePath] = "deleted";
        continue;
      }
      try {
        const stat = fs.statSync(absolutePath);
        if (!stat.isFile()) {
          dirty[relativePath] = "non-file";
          continue;
        }
        dirty[relativePath] = crypto.createHash("sha1").update(fs.readFileSync(absolutePath)).digest("hex");
      } catch {
        dirty[relativePath] = "unreadable";
      }
    }
    snapshot.repositories[repository] = { head, dirty };
  }
  write(path.join(taskDir(id), filename), JSON.stringify(snapshot));
  return snapshot;
}

function buildExecutionSummary(id, workdir, exitCode, prompt = "") {
  const directory = taskDir(id);
  let before = { repositories: {} };
  try { before = JSON.parse(read(path.join(directory, "git-before.json"), "{\"repositories\":{}}")); } catch {}
  const after = captureGitSnapshot(id, workdir, "git-after.json");
  const lines = [
    "### Agent 执行回执",
    Number(exitCode) === 0
      ? "- 进程状态：正常结束（退出码 " + exitCode + "）"
      : "- 进程状态：执行失败（退出码 " + exitCode + "）",
  ];
  let commitCount = 0;
  let changedCount = 0;
  let addedRepositoryCount = 0;
  const repositories = new Set([
    ...Object.keys(before.repositories || {}),
    ...Object.keys(after.repositories || {}),
  ]);
  for (const repository of repositories) {
    const beforeRepo = before.repositories?.[repository] || { head: "", dirty: {} };
    const afterRepo = after.repositories?.[repository] || { head: "", dirty: {} };
    const repositoryName = path.basename(repository);
    if (!beforeRepo.head && afterRepo.head) {
      lines.push("- 新增 Git 仓库：" + repository);
      addedRepositoryCount += 1;
    }
    if (beforeRepo.head && afterRepo.head && beforeRepo.head !== afterRepo.head) {
      lines.push("- 新提交（" + repositoryName + "）：");
      const log = gitRun(repository, ["log", "--format=  - %h %s", beforeRepo.head + ".." + afterRepo.head, "-n", "12"]).stdout.trimEnd();
      if (log) lines.push(log);
      commitCount += 1;
    }
    const files = new Set([
      ...Object.keys(beforeRepo.dirty || {}),
      ...Object.keys(afterRepo.dirty || {}),
    ]);
    for (const relativePath of [...files].sort()) {
      if ((beforeRepo.dirty || {})[relativePath] === (afterRepo.dirty || {})[relativePath]) continue;
      if (changedCount === 0) lines.push("- 工作区文件变化：");
      const afterValue = (afterRepo.dirty || {})[relativePath];
      const suffix = !afterValue
        ? "（已恢复为干净状态或已提交）"
        : afterValue === "deleted"
          ? "（已删除）"
          : "";
      lines.push("  - " + repositoryName + "/" + relativePath + suffix);
      changedCount += 1;
      if (changedCount >= 80) break;
    }
    if (changedCount >= 80) break;
  }
  if (!commitCount && !changedCount) {
    lines.push("- Git 变化：本任务期间未检测到新增提交或工作区文件变化。");
  }
  const gitCheckoutRequested =
    /\bgit\s+clone\b|\bclone\b|克隆|下载.{0,12}(?:代码|仓库|项目)|拉取.{0,12}(?:代码|仓库|项目)|(?:代码|仓库|项目).{0,12}(?:下载|拉取)/i.test(
      String(prompt || ""),
    );
  const repositoryCount = Object.keys(after.repositories || {}).length;
  const verificationFailed = gitCheckoutRequested && repositoryCount === 0;
  if (gitCheckoutRequested) {
    lines.push(
      verificationFailed
        ? "- 落盘验证：失败。任务结束后工作目录内没有检测到 Git 仓库。"
        : "- 落盘验证：通过。任务结束后检测到 " + repositoryCount + " 个 Git 仓库。",
    );
  }
  lines.push("- 说明：这是 Agent 根据任务开始与结束时的 Git 状态自动生成的执行痕迹。");
  write(path.join(directory, "execution-summary.txt"), lines.join("\n") + "\n");
  return {
    verificationFailed,
    repositoryCount,
    addedRepositoryCount,
  };
}

function emitTask(id) {
  const directory = taskDir(id);
  const status = taskStatus(id);
  if (["queued", "running"].includes(status)) ensureDaemon();
  console.log("__AIWB_AGENT_STATUS__ready");
  console.log("__AIWB_AGENT_VERSION__" + VERSION);
  console.log("__AIWB_AGENT_HOME__" + ROOT);
  console.log("__AIWB_AGENT_SERVICE_STATUS__windows-task-scheduler");
  emitRuntimeStatuses();
  console.log("__AIWB_AGENT_TASK_ID__" + id);
  console.log("__AIWB_AGENT_TASK_CONVERSATION_ID__" + readTrim(path.join(directory, "conversation_id")));
  console.log("__AIWB_AGENT_TASK_TURN_ID__" + readTrim(path.join(directory, "turn_id")));
  console.log("__AIWB_AGENT_TASK_REQUEST_MESSAGE_ID__" + readTrim(path.join(directory, "request_message_id")));
  console.log("__AIWB_AGENT_TASK_RESPONSE_MESSAGE_ID__" + readTrim(path.join(directory, "response_message_id")));
  console.log("__AIWB_AGENT_TASK_STATUS__" + status);
  const retryableErrorCode = readTrim(path.join(directory, "retryable_error_code"));
  if (retryableErrorCode) {
    console.log("__AIWB_AGENT_ERROR_CODE__" + retryableErrorCode);
    console.log("__AIWB_AGENT_RETRYABLE__1");
  }
  console.log("__AIWB_AGENT_TASK_EXIT_CODE__" + readTrim(path.join(directory, "exit_code")));
  console.log("__AIWB_AGENT_TASK_PID__" + readTrim(path.join(directory, "pid")));
  console.log("__AIWB_AGENT_TASK_ATTEMPTS__" + readTrim(path.join(directory, "attempts")));
  console.log("__AIWB_AGENT_TASK_STARTED_AT__" + readTrim(path.join(directory, "started_at")));
  console.log("__AIWB_AGENT_TASK_RUNNER_STARTED_AT__" + readTrim(path.join(directory, "runner_started_at")));
  console.log("__AIWB_AGENT_TASK_FINISHED_AT__" + readTrim(path.join(directory, "finished_at")));
  console.log("__AIWB_AGENT_EVENT_FINGERPRINT__" + fingerprint(id));
  console.log("__AIWB_AGENT_TASK_OUTPUT_START__");
  process.stdout.write(taskOutput(id));
  if (taskOutput(id) && !taskOutput(id).endsWith("\n")) process.stdout.write("\n");
  console.log("__AIWB_AGENT_TASK_OUTPUT_END__");
  const executionSummary = read(path.join(directory, "execution-summary.txt")).trim();
  if (executionSummary) {
    console.log("__AIWB_AGENT_TASK_EXECUTION_SUMMARY_START__");
    process.stdout.write(executionSummary + "\n");
    console.log("__AIWB_AGENT_TASK_EXECUTION_SUMMARY_END__");
  }
}

function emitHealth() {
  const total = os.totalmem();
  const used = total - os.freemem();
  const codexTool = resolveCommand("codex", "codex");
  const claudeTool = resolveCommand("claude", "claude");
  console.log("__AIWB_AGENT_STATUS__ready");
  console.log("__AIWB_AGENT_VERSION__" + VERSION);
  console.log("__AIWB_AGENT_HOME__" + ROOT);
  console.log("__AIWB_AGENT_SERVICE_STATUS__windows-task-scheduler");
  emitRuntimeStatuses();
  console.log("__AIWB_AGENT_TASKS_QUEUED__" + taskIds().filter((id) => taskStatus(id) === "queued").length);
  console.log("__AIWB_AGENT_TASKS_RUNNING__" + taskIds().filter((id) => taskStatus(id) === "running").length);
  console.log("__AIWB_AGENT_TASKS_DONE__" + taskIds().filter((id) => taskStatus(id) === "done").length);
  console.log("__AIWB_AGENT_TASKS_ERROR__" + taskIds().filter((id) => taskStatus(id) === "error").length);
  console.log("__AIWB_AGENT_TASKS_CANCELLED__" + taskIds().filter((id) => taskStatus(id) === "cancelled").length);
  console.log("__AIWB_AGENT_HOST_MEM_PERCENT__" + (total ? (used * 100 / total).toFixed(1) : ""));
  console.log("__AIWB_AGENT_HOST_MEM_USED_MB__" + Math.round(used / 1024 / 1024));
  console.log("__AIWB_AGENT_HOST_MEM_TOTAL_MB__" + Math.round(total / 1024 / 1024));
  console.log("__AIWB_AGENT_HOST_PROCESS_COUNT__");
  console.log("__AIWB_AGENT_CODEX_AVAILABLE__" + (codexTool?.missing ? "0" : "1"));
  console.log("__AIWB_AGENT_CODEX_PATH__" + (codexTool?.requested || ""));
  console.log("__AIWB_AGENT_CODEX_EXECUTABLE__" + (codexTool?.executable || ""));
  console.log("__AIWB_AGENT_CLAUDE_AVAILABLE__" + (claudeTool?.missing ? "0" : "1"));
  console.log("__AIWB_AGENT_CLAUDE_PATH__" + (claudeTool?.requested || ""));
  console.log("__AIWB_AGENT_CLAUDE_EXECUTABLE__" + (claudeTool?.executable || ""));
}

function quoteCmd(value) {
  const text = String(value ?? "");
  if (!/[\\s"&|<>^]/.test(text)) return text;
  return '"' + text.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1") + '"';
}

function quotePowerShell(value) {
  return "'" + String(value ?? "").replace(/'/g, "''") + "'";
}

function findNativeBinary(root, filename) {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return target;
      if (entry.isDirectory() && entry.name !== ".git") pending.push(target);
    }
  }
  return "";
}

function findLatestNativeBinary(root, filename) {
  const found = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
        let mtimeMs = 0;
        try { mtimeMs = fs.statSync(target).mtimeMs; } catch {}
        found.push({ target, mtimeMs });
      } else if (entry.isDirectory() && entry.name !== ".git") {
        pending.push(target);
      }
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs || b.target.localeCompare(a.target));
  return found[0]?.target || "";
}

function resolveCommand(configured, fallback) {
  let command = String(configured || fallback || "").trim();
  if (!command) return null;
  const commandLeaf = path.basename(command).replace(/\.(ps1|cmd|exe)$/i, "");
  const commandSuffixes = [".cmd", ".ps1", ".exe", ""];
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "";
  const commandRoots = [
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : "",
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming", "npm") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "npm") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "nodejs") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps") : "",
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, ".npm-global", "bin") : "",
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, ".local", "bin") : "",
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "scoop", "shims") : "",
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "bin") : "",
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "nodejs") : "",
    programFilesX86 ? path.join(programFilesX86, "nodejs") : "",
    ...String(process.env.PATH || "").split(path.delimiter),
  ].filter(Boolean);
  const isKnownCliName = commandLeaf.toLowerCase() === "codex" || commandLeaf.toLowerCase() === "claude";
  if (commandLeaf.toLowerCase() === "codex") {
    const desktopCodex = findLatestNativeBinary(
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin") : "",
      "codex.exe",
    );
    if (desktopCodex) return { executable: desktopCodex, prefix: [] };
  }
  if ((!path.isAbsolute(command) && !command.includes("\\") && !command.includes("/")) || isKnownCliName) {
    for (const root of commandRoots) {
      let resolvedInRoot = false;
      for (const suffix of commandSuffixes) {
        const candidate = path.join(root, commandLeaf + suffix);
        if (fs.existsSync(candidate)) {
          command = candidate;
          resolvedInRoot = true;
          break;
        }
      }
      if (resolvedInRoot) break;
    }
    if (!fs.existsSync(command)) {
      try {
        const lookup = spawnSync("where.exe", [commandLeaf], { encoding: "utf8", windowsHide: true });
        const resolved = String(lookup.stdout || "")
          .split(/\r?\n/)
          .map((value) => value.trim())
          .find((value) => value && fs.existsSync(value));
        if (resolved) command = resolved;
      } catch {}
    }
    const versionRoots = [
      process.env.APPDATA ? path.join(process.env.APPDATA, "Claude", "claude-code") : "",
    ].filter(Boolean);
    for (const root of versionRoots) {
      let versions = [];
      try { versions = fs.readdirSync(root, { withFileTypes: true }); } catch {}
      for (const version of versions) {
        if (!version.isDirectory()) continue;
        const candidate = path.join(root, version.name, commandLeaf + ".exe");
        if (fs.existsSync(candidate)) {
          command = candidate;
          break;
        }
      }
      if (fs.existsSync(command)) break;
    }
  }
  if (fs.existsSync(command)) {
    const directory = path.dirname(command);
    const nativeCandidates = [
      path.join(directory, "node_modules", "@openai", "codex", "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe"),
      path.join(directory, "node_modules", "@openai", "codex", "node_modules", "@openai", "codex-win32-arm64", "vendor", "aarch64-pc-windows-msvc", "bin", "codex.exe"),
    ];
    const native = nativeCandidates.find((candidate) => fs.existsSync(candidate)) ||
      findNativeBinary(path.join(directory, "node_modules", "@openai", "codex"), "codex.exe");
    if (native) return { executable: native, prefix: [], requested: command, missing: false };
    if (command.toLowerCase().endsWith(".ps1")) return { executable: "powershell.exe", prefix: ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", command], requested: command, missing: false };
    if (command.toLowerCase().endsWith(".cmd")) return { executable: "cmd.exe", prefix: ["/d", "/s", "/c", quoteCmd(command)], requested: command, missing: false };
    return { executable: command, prefix: [], requested: command, missing: false };
  }
  return { executable: command, prefix: [], requested: command, missing: true };
}

function commandSpecFromTask(id) {
  const encoded = readTrim(path.join(taskDir(id), "command.b64"));
  if (!encoded) throw new Error("缺少 Agent 任务命令。");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  try { return JSON.parse(decoded); } catch { return { kind: "powershell", script: decoded }; }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function completionFileSnapshot(file) {
  if (!file) return null;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size <= 0) return null;
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

function sameCompletionFileSnapshot(left, right) {
  return Boolean(left && right && left.size === right.size && left.mtimeMs === right.mtimeMs);
}

async function runChild(executable, args, input = "", envOverrides = {}, options = {}) {
  let last = { code: 1, stdout: "", stderr: "" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    last = await new Promise((resolve) => {
      let child;
      try {
        const executableDirectory = path.dirname(executable);
        const childPath = [NODE_BIN_DIR, USER_NPM_BIN_DIR, executableDirectory, process.env.PATH || process.env.Path || ""]
          .filter(Boolean)
          .join(path.delimiter);
        child = spawn(executable, args, {
          windowsHide: true,
          stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
          env: { ...process.env, ...envOverrides, PATH: childPath, Path: childPath },
        });
      } catch (error) {
        resolve({ code: 1, stdout: "", stderr: String(error?.message || error) });
        return;
      }
      let stdout = "";
      let stderr = "";
      let decodersFlushed = false;
      let settled = false;
      let completionTimer = null;
      let completionKillTimer = null;
      let completionSnapshot = null;
      let completionStableSince = 0;
      let completionRecoveryStarted = false;
      const stdoutDecoder = new StringDecoder("utf8");
      const stderrDecoder = new StringDecoder("utf8");
      const flushDecoders = () => {
        if (decodersFlushed) return;
        decodersFlushed = true;
        stdout += stdoutDecoder.end();
        stderr += stderrDecoder.end();
      };
      const finish = (code, extra = {}) => {
        if (settled) return;
        settled = true;
        if (completionTimer) clearInterval(completionTimer);
        if (completionKillTimer) clearTimeout(completionKillTimer);
        flushDecoders();
        resolve({ code, stdout, stderr, ...extra });
      };
      child.stdout.on("data", (chunk) => { stdout += stdoutDecoder.write(chunk); });
      child.stderr.on("data", (chunk) => { stderr += stderrDecoder.write(chunk); });
      child.on("error", (error) => {
        const detail = error?.code === "ENOENT"
          ? "找不到可执行文件：" + executable + "。请确认 Codex/Claude 已安装，并在 Agent 设置中重新检测命令路径。"
          : String(error?.message || error);
        stderr += detail;
        finish(completionRecoveryStarted ? 0 : 1, { completionRecovered: completionRecoveryStarted });
      });
      child.on("close", (code) => {
        finish(completionRecoveryStarted ? 0 : Number(code ?? 1), {
          completionRecovered: completionRecoveryStarted,
        });
      });
      const completionFile = String(options?.completionFile || "");
      if (completionFile) {
        const completionGraceMs = Math.max(
          CODEX_FINAL_OUTPUT_POLL_MILLISECONDS,
          Number(options?.completionGraceMs) || CODEX_FINAL_OUTPUT_EXIT_GRACE_MILLISECONDS,
        );
        completionTimer = setInterval(() => {
          if (settled || completionRecoveryStarted) return;
          const nextSnapshot = completionFileSnapshot(completionFile);
          if (!nextSnapshot) {
            completionSnapshot = null;
            completionStableSince = 0;
            return;
          }
          if (!sameCompletionFileSnapshot(completionSnapshot, nextSnapshot)) {
            completionSnapshot = nextSnapshot;
            completionStableSince = Date.now();
            return;
          }
          if (Date.now() - completionStableSince < completionGraceMs) return;
          completionRecoveryStarted = true;
          if (child.exitCode === null) {
            const killed = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
              windowsHide: true,
              encoding: "utf8",
            });
            if (killed.status !== 0) {
              stderr += "\nAgent 已取得最终结果，但无法回收残留 Codex 进程。\n";
              try { child.kill(); } catch {}
            }
          }
          completionKillTimer = setTimeout(() => {
            if (child.exitCode === null) {
              finish(1, { completionRecoveryFailed: true });
              return;
            }
            child.stdout?.destroy();
            child.stderr?.destroy();
            finish(0, { completionRecovered: true });
          }, CODEX_FINAL_OUTPUT_KILL_WAIT_MILLISECONDS);
        }, CODEX_FINAL_OUTPUT_POLL_MILLISECONDS);
      }
      if (input && child.stdin) child.stdin.end(input, "utf8");
    });
    if (!/\\bEBUSY\\b|resource busy/i.test(last.stderr) || attempt === 2) return last;
    await sleep(500 * (attempt + 1));
  }
  return last;
}

function extractSessionId(text) {
  return String(text || "").match(/session id:\\s*([0-9a-fA-F-]{36})/)?.[1] || "";
}

async function runCliSpec(id, spec) {
  const directory = taskDir(id);
  const outputPath = path.join(directory, "final-output.txt");
  try { fs.rmSync(outputPath, { force: true }); } catch {}
  const tool = resolveCommand(spec.command, spec.kind === "claude" ? "claude" : "codex");
  if (!tool) throw new Error("没有找到 " + spec.kind + " 命令。");
  write(path.join(directory, "launcher.log"), [
    "AI Workbench Windows Agent 执行诊断",
    "版本：" + VERSION,
    "工具：" + spec.kind,
    "配置命令：" + String(spec.command || ""),
    "解析命令：" + String(tool.requested || ""),
    "实际执行文件：" + String(tool.executable || ""),
    "Node：" + String(process.execPath || ""),
    "工作目录：" + String(spec.workdir || ""),
    "PATH 已补充 Node 与用户 npm 目录",
  ].join("\n") + "\n");
  if (tool.missing) {
    const requested = String(spec.command || (spec.kind === "claude" ? "claude" : "codex"));
    const message = [
      "Windows Agent 已启动，但没有找到 " + requested + " 命令。",
      "当前是 Windows PowerShell 模式；如果工具只安装在 WSL，请把服务器类型改为 Windows + WSL。",
      "如果要使用原生 Windows 模式，请先在 PowerShell 执行：where.exe " + requested,
    ].join("\n");
    return { code: 127, output: message, diagnostics: message, sessionId: "" };
  }
  const args = tool.prefix.slice();
  const session = readTrim(spec.sessionFile || "");
  const cliEnv = spec.kind === "claude"
    ? { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1" }
    : {};
  const fullAccess = String(spec.executionPermissionMode || "").toLowerCase() === "full-access";
  if (spec.kind === "claude") {
    args.push("-p", String(spec.prompt || ""), "--output-format", "json", "--permission-mode", fullAccess ? "bypassPermissions" : "acceptEdits");
    if (spec.model) args.push("--model", spec.model);
    if (/^[0-9a-fA-F-]{36}$/.test(session)) args.push("--resume", session);
  } else {
    args.push("exec", "--skip-git-repo-check");
    if (fullAccess) {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    } else {
      args.push("--sandbox", "danger-full-access");
    }
    args.push("--cd", String(spec.workdir || process.cwd()), "--output-last-message", outputPath, "--color", "never");
    if (spec.model) args.push("--model", spec.model);
    if (/^[0-9a-fA-F-]{36}$/.test(session)) args.push("resume", session);
    args.push(String(spec.prompt || ""));
  }
  let result;
  const powershellFileIndex = tool.prefix.findIndex((value) => String(value).toLowerCase() === "-file");
  if (process.platform === "win32") {
    if (!tool.executable.toLowerCase().endsWith("powershell.exe")) {
      result = await runChild(tool.executable, args, "", cliEnv, spec.kind === "codex" ? { completionFile: outputPath } : {});
    } else {
    const cliArgs = tool.executable.toLowerCase().endsWith("powershell.exe") && powershellFileIndex >= 0
      ? args.slice(powershellFileIndex + 2)
      : args;
    const argsFile = path.join(directory, "cli-args.json");
    write(argsFile, Buffer.from(JSON.stringify(cliArgs), "utf8").toString("base64"));
    const executable = tool.executable.toLowerCase().endsWith("powershell.exe") && powershellFileIndex >= 0
      ? tool.prefix[powershellFileIndex + 1]
      : tool.executable;
    const powershellScript = [
      "$AIWB_JSON = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((Get-Content -LiteralPath " + quotePowerShell(argsFile) + " -Raw)))",
      "$AIWB_DECODED = ConvertFrom-Json $AIWB_JSON",
      "$AIWB_ARGS = @()",
      "foreach ($AIWB_ITEM in @($AIWB_DECODED)) { $AIWB_ARGS += [string]$AIWB_ITEM }",
      "& " + quotePowerShell(executable) + " @AIWB_ARGS",
      "exit $LASTEXITCODE",
    ].join("; ");
    result = await runChild(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", powershellScript],
      "",
      cliEnv,
      spec.kind === "codex" ? { completionFile: outputPath } : {},
    );
    }
  } else {
    result = await runChild(
      tool.executable,
      [...tool.prefix, ...args],
      "",
      cliEnv,
      spec.kind === "codex" ? { completionFile: outputPath } : {},
    );
  }
  if (result.completionRecovered) {
    append(path.join(directory, "launcher.log"), "\nAgent 已读取稳定的 Codex 最终结果，并回收未正常退出的残留进程。\n");
  }
  let output = "";
  if (spec.kind === "codex" && fs.existsSync(outputPath)) output = read(outputPath).trim();
  if (spec.kind === "claude") {
    const raw = (result.stdout || result.stderr || "").trim();
    try {
      const parsed = JSON.parse(raw);
      output = String(parsed.result || parsed.response || parsed.text || parsed.message || raw);
    } catch { output = raw; }
  }
  if (!output) output = (result.stdout || result.stderr || "").trim();
  const sessionId = extractSessionId(result.stdout + "\n" + result.stderr);
  if (sessionId && spec.sessionFile) write(spec.sessionFile, sessionId + "\n");
  if (!output && result.code === 0) output = "已完成，但命令没有返回文本结果。";
  return { code: result.code, output, diagnostics: (result.stderr || "").trim(), sessionId };
}

async function runTask(id) {
  const directory = taskDir(id);
  write(path.join(directory, "runner_started_at"), now());
  write(path.join(directory, "status"), "running");
  let spec = null;
  try {
    spec = commandSpecFromTask(id);
    captureGitSnapshot(id, spec.workdir || process.cwd(), "git-before.json");
    let result;
    if (spec.kind === "codex" || spec.kind === "claude") {
      result = await runCliSpec(id, spec);
    } else {
      const child = await runChild("powershell.exe", ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", String(spec.script || "")]);
      result = {
        code: child.code,
        output: child.stdout || child.stderr || "",
        diagnostics: child.stderr || "",
      };
    }
    const body = result.output || result.diagnostics || "";
    const response = result.code === 0
      ? "__AIWB_RESPONSE_START__\n" + body + "\n__AIWB_RESPONSE_END__\n"
      : (body || "Windows Agent 任务执行失败。");
    write(path.join(directory, "output.log"), response);
    if (result.diagnostics) append(path.join(directory, "launcher.log"), "\n命令输出：\n" + result.diagnostics + "\n");
    const verification = buildExecutionSummary(
      id,
      spec.workdir || process.cwd(),
      result.code,
      spec.prompt || read(path.join(directory, "prompt.txt")),
    );
    if (result.code === 0 && verification.verificationFailed) {
      const verificationMessage = [
        "代码没有下载成功。",
        "",
        "远端命令虽然正常结束，但 Agent 检查了工作目录 " + String(spec.workdir || process.cwd()) + "，没有发现任何 Git 仓库。",
        "App 不再把这类情况显示为成功。请检查仓库地址、网络、权限和实际下载路径后重试。",
      ].join("\n");
      write(
        path.join(directory, "output.log"),
        "__AIWB_RESPONSE_START__\n" + verificationMessage + "\n__AIWB_RESPONSE_END__\n",
      );
      setStatus(id, "error", "65");
    } else {
      setStatus(id, result.code === 0 ? "done" : "error", String(result.code));
    }
  } catch (error) {
    write(path.join(directory, "bootstrap.log"), String(error?.stack || error) + "\n");
    append(path.join(directory, "launcher.log"), "\nAgent Runner 异常：\n" + String(error?.stack || error) + "\n");
    if (spec) {
      buildExecutionSummary(
        id,
        spec.workdir || process.cwd(),
        1,
        spec.prompt || read(path.join(directory, "prompt.txt")),
      );
    }
    setStatus(id, "error", "1");
  }
}

function launchTask(id, tickLockToken) {
  if (!tickLockOwned(tickLockToken)) {
    log("refused task launch without tick lock task=" + id);
    return false;
  }
  if (!processGenerationIsCurrent()) {
    rejectTaskForGenerationChange(id, "generation_changed_after_tick_lock");
    log("rejected stale-generation task launch task=" + id);
    return false;
  }
  const directory = taskDir(id);
  const attempts = Number(readTrim(path.join(directory, "attempts"), "0")) + 1;
  write(path.join(directory, "attempts"), attempts);
  write(path.join(directory, "started_at"), now());
  write(path.join(directory, "status"), "running");
  const child = spawn(process.execPath, [CONTROL_FILE, "runner", id], { detached: true, stdio: "ignore", windowsHide: true });
  write(path.join(directory, "pid"), child.pid || "");
  child.unref();
  updateConversation(id);
  log("launched task=" + id + " pid=" + child.pid);
  return Boolean(child.pid);
}

function markStale(id) {
  if (taskStatus(id) !== "running") return;
  const directory = taskDir(id);
  const pid = readTrim(path.join(directory, "pid"));
  if (isAlive(pid) || ageSeconds(readTrim(path.join(directory, "started_at"))) < 8) return;
  append(path.join(directory, "bootstrap.log"), "AI Workbench Agent: runner process is not alive.\nrunner pid: " + (pid || "missing") + "\nchecked_at: " + now() + "\n");
  setStatus(id, "error", "124");
}

function tick() {
  const tickLockToken = acquireTickLock();
  if (!tickLockToken) return;
  try {
    for (const id of taskIds()) {
      markStale(id);
    }
    let running = taskIds().filter((id) => taskStatus(id) === "running" && isAlive(readTrim(path.join(taskDir(id), "pid")))).length;
    for (const id of taskIds()) {
      if (running >= MAX_CONCURRENCY) break;
      if (taskStatus(id) === "queued" && launchTask(id, tickLockToken)) running += 1;
    }
  } finally {
    releaseTickLock(tickLockToken);
  }
}

function ensureDaemon() {
  if (daemonAlive() || runtimeUpdateInProgress()) return;
  const scheduled = spawnSync("schtasks.exe", ["/Run", "/TN", "AI Workbench Agent"], { encoding: "utf8", windowsHide: true });
  if (scheduled.status === 0) return;
  const child = spawn(process.execPath, [process.argv[1], "service-run"], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

async function daemon() {
  write(PID_FILE, process.pid);
  log("daemon started pid=" + process.pid + " version=" + VERSION);
  let supersededDrainLogged = false;
  let supersededWaitLogged = false;
  while (true) {
    if (installedVersion() !== VERSION) {
      // Keep the old Task Scheduler process tree alive until every task from
      // every conversation on this host has drained. Exiting serviceRun can
      // otherwise tear down descendants on Windows, including the updater that
      // must retry a failed handoff. Never self-exit or start a replacement:
      // installService is the sole owner of old-tree termination and restart.
      const activeTaskIds = globalActiveTaskIds();
      if (activeTaskIds.length && !supersededDrainLogged) {
        log("daemon upgrade handoff deferred active_tasks=" + activeTaskIds.join(","));
        supersededDrainLogged = true;
      }
      if (!activeTaskIds.length && !supersededWaitLogged) {
        log("daemon version superseded; waiting for installer handoff pid=" + process.pid + " version=" + VERSION);
        supersededWaitLogged = true;
      }
      write(HEARTBEAT_FILE, now());
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    write(HEARTBEAT_FILE, now());
    tick();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function serviceRun() {
  const serviceLockToken = acquireServiceLock();
  if (!serviceLockToken) {
    log("service duplicate rejected pid=" + process.pid + " version=" + VERSION);
    return false;
  }
  const managed = new Map();
  const startManaged = (name, scriptPath) => {
    if (!fs.existsSync(scriptPath) || managed.get(name)) return;
    const child = spawn(process.execPath, [scriptPath], { stdio: "ignore", windowsHide: true });
    managed.set(name, child);
    const release = () => {
      if (managed.get(name) === child) managed.delete(name);
    };
    child.once("close", release);
    child.once("error", release);
  };
  const directRuntime = path.join(ROOT, "aiwb-agent-http.mjs");
  const updaterRuntime = path.join(ROOT, "aiwb-agent-updater.mjs");
  let timer = null;
  try {
    write(SERVICE_PID_FILE, process.pid);
    write(SERVICE_RUNTIME_SHA_FILE, PROCESS_CONTROL_SHA256);
    startManaged("http", directRuntime);
    startManaged("updater", updaterRuntime);
    timer = setInterval(() => {
      startManaged("http", directRuntime);
      startManaged("updater", updaterRuntime);
    }, 2000);
    await daemon();
  } finally {
    if (timer) clearInterval(timer);
    for (const child of managed.values()) child.kill();
    if (readTrim(PID_FILE) === String(process.pid)) write(PID_FILE, "");
    if (readTrim(SERVICE_PID_FILE) === String(process.pid)) {
      write(SERVICE_PID_FILE, "");
      write(SERVICE_RUNTIME_SHA_FILE, "");
    }
    releaseServiceLock(serviceLockToken);
  }
  return true;
}

function scheduleInstallService() {
  const activeTaskIds = globalActiveTaskIds();
  if (activeTaskIds.length) return emitInstallDeferred("active_tasks", activeTaskIds);
  spawnSync("schtasks.exe", ["/Delete", "/TN", UPDATE_HANDOFF_TASK, "/F"], { windowsHide: true, stdio: "ignore" });
  const actionArguments = '"' + CONTROL_FILE + '" install-service-handoff';
  const schedulerScript = [
    "$ErrorActionPreference = 'Stop'",
    "$AIWB_IDENTITY = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
    "$AIWB_PRINCIPAL = New-ScheduledTaskPrincipal -UserId $AIWB_IDENTITY -LogonType Interactive -RunLevel Limited",
    "$AIWB_TRIGGER = New-ScheduledTaskTrigger -AtLogOn -User $AIWB_IDENTITY",
    "$AIWB_ACTION = New-ScheduledTaskAction -Execute " + quotePowerShell(process.execPath) + " -Argument " + quotePowerShell(actionArguments),
    "Register-ScheduledTask -TaskName " + quotePowerShell(UPDATE_HANDOFF_TASK) + " -Action $AIWB_ACTION -Trigger $AIWB_TRIGGER -Principal $AIWB_PRINCIPAL -Force | Out-Null",
    "Start-ScheduledTask -TaskName " + quotePowerShell(UPDATE_HANDOFF_TASK),
  ].join("; ");
  const encodedSchedulerScript = Buffer.from(schedulerScript, "utf16le").toString("base64");
  const scheduled = spawnSync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedSchedulerScript,
  ], { encoding: "utf8", windowsHide: true, timeout: 20_000 });
  const accepted = scheduled.status === 0;
  if (!accepted) {
    spawnSync("schtasks.exe", ["/Delete", "/TN", UPDATE_HANDOFF_TASK, "/F"], { windowsHide: true, stdio: "ignore" });
  }
  console.log("__AIWB_AGENT_STATUS__" + (accepted ? "handoff-scheduled" : "error"));
  console.log("__AIWB_AGENT_VERSION__" + VERSION);
  if (!accepted) {
    console.log("__AIWB_AGENT_ERROR__Windows Agent 升级交接任务启动失败。");
    const detail = String(scheduled.stderr || scheduled.stdout || scheduled.error?.message || "").trim();
    if (detail) console.log(detail);
    process.exitCode = 3;
  }
  return accepted;
}

function installServiceHandoff() {
  let ready = false;
  try {
    ready = installService();
  } finally {
    spawnSync("schtasks.exe", ["/Delete", "/TN", UPDATE_HANDOFF_TASK, "/F"], { windowsHide: true, stdio: "ignore" });
  }
  if (!ready && !process.exitCode) process.exitCode = 3;
  return ready;
}

function registerAndStartServiceTask(taskName) {
  const actionArguments = '"' + CONTROL_FILE + '" service-run';
  const schedulerScript = [
    "$ErrorActionPreference = 'Stop'",
    "$AIWB_IDENTITY = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
    "$AIWB_PRINCIPAL = New-ScheduledTaskPrincipal -UserId $AIWB_IDENTITY -LogonType Interactive -RunLevel Limited",
    "$AIWB_TRIGGER = New-ScheduledTaskTrigger -AtLogOn -User $AIWB_IDENTITY",
    "$AIWB_ACTION = New-ScheduledTaskAction -Execute " + quotePowerShell(process.execPath) + " -Argument " + quotePowerShell(actionArguments),
    "$AIWB_SETTINGS = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)",
    "Register-ScheduledTask -TaskName " + quotePowerShell(taskName) + " -Action $AIWB_ACTION -Trigger $AIWB_TRIGGER -Principal $AIWB_PRINCIPAL -Settings $AIWB_SETTINGS -Force | Out-Null",
    "Start-ScheduledTask -TaskName " + quotePowerShell(taskName),
  ].join("; ");
  const encodedSchedulerScript = Buffer.from(schedulerScript, "utf16le").toString("base64");
  return spawnSync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedSchedulerScript,
  ], { encoding: "utf8", windowsHide: true, timeout: 20_000 });
}

function spawnServiceFallback() {
  try {
    const child = spawn(process.execPath, [CONTROL_FILE, "service-run"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    if (child.pid) log("started detached service fallback pid=" + child.pid);
    return Boolean(child.pid);
  } catch (error) {
    log("detached service fallback failed error=" + String(error?.message || error));
    return false;
  }
}

function installService(parentLockOwnerPid = "") {
  const transaction = beginServiceInstall(parentLockOwnerPid);
  if (!transaction) return false;
  const taskName = "AI Workbench Agent";
  let result = { status: 1, stderr: "service install did not run" };
  let cleanupReady = false;
  let fallbackStarted = false;
  try {
    // This is the only service-tree termination path. It runs while the
    // machine-wide task lock and runtime fence are held, after the final
    // global task scan, so work from any conversation on this host is safe.
    spawnSync("schtasks.exe", ["/End", "/TN", taskName], { encoding: "utf8", windowsHide: true });
    cleanupReady = stopDaemon();
    if (cleanupReady) {
      // ScheduledTasks keeps the executable and its arguments as separate
      // fields, so paths containing spaces cannot be re-tokenized by /TR.
      result = registerAndStartServiceTask(taskName);
      if (result.status !== 0) fallbackStarted = spawnServiceFallback();
    } else {
      result = { status: 4, stderr: "owned service tree cleanup could not be verified" };
    }
  } finally {
    // No process tree is terminated after this boundary. Release admission
    // only once the replacement supervisor has been started or requested.
    endServiceInstall(transaction);
  }
  let ready = cleanupReady && waitForRuntimeReady();
  if (!ready && cleanupReady && !fallbackStarted) {
    // A scheduler command can be accepted without producing a live task
    // instance. The service lock makes this direct recovery race-safe.
    fallbackStarted = spawnServiceFallback();
    if (fallbackStarted) ready = waitForRuntimeReady();
  }
  console.log("__AIWB_AGENT_STATUS__" + (ready ? "ready" : "error"));
  console.log("__AIWB_AGENT_VERSION__" + VERSION);
  console.log("__AIWB_AGENT_SERVICE_STATUS__" + (!cleanupReady ? "cleanup-failed" : result.status === 0 ? "installed" : "user-fallback"));
  emitRuntimeStatuses();
  if (!ready) {
    console.log("__AIWB_AGENT_ERROR__Windows Agent supervisor 启动失败，daemon、HTTPS 或自动升级组件未全部就绪。");
    process.exitCode = 3;
  }
  if (result.status !== 0 && result.stderr) console.log(String(result.stderr).trim());
  return ready;
}

function uninstallService() {
  const taskName = "AI Workbench Agent";
  spawnSync("schtasks.exe", ["/End", "/TN", taskName], { encoding: "utf8", windowsHide: true });
  spawnSync("schtasks.exe", ["/Delete", "/TN", taskName, "/F"], { encoding: "utf8", windowsHide: true });
  stopDaemon();
  for (const id of taskIds()) {
    stopTaskRunner(id);
  }
  const cleanup = "Start-Sleep -Milliseconds 500; Remove-Item -LiteralPath " + quotePowerShell(ROOT) + " -Recurse -Force -ErrorAction SilentlyContinue";
  try {
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-WindowStyle", "Hidden", "-Command", cleanup], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {}
  console.log("__AIWB_AGENT_STATUS__removed");
  console.log("__AIWB_AGENT_SERVICE_STATUS__removed");
}

function clearCache() {
  const active = taskIds().filter((id) => ["queued", "preparing", "running", "busy"].includes(taskStatus(id)));
  if (active.length) {
    console.log("__AIWB_AGENT_STATUS__error");
    console.log("__AIWB_AGENT_ERROR__还有任务正在运行，不能清理 Agent 缓存。");
    process.exitCode = 3;
    return;
  }
  const taskCount = taskIds().length;
  const conversationCount = conversationIds().length;
  for (const id of taskIds()) fs.rmSync(taskDir(id), { recursive: true, force: true });
  for (const id of conversationIds()) fs.rmSync(conversationDir(id), { recursive: true, force: true });
  write(LOG_FILE, "");
  console.log("__AIWB_AGENT_STATUS__ready");
  console.log("__AIWB_AGENT_CACHE_CLEARED__1");
  console.log("__AIWB_AGENT_CACHE_TASKS__" + taskCount);
  console.log("__AIWB_AGENT_CACHE_CONVERSATIONS__" + conversationCount);
}

function createTask(id) {
  const directory = taskDir(id);
  if (runtimeUpdateInProgress()) {
    rejectTaskForGenerationChange(id, "runtime_update_in_progress");
    printGenerationChanged();
    process.exitCode = 44;
    return;
  }
  const conversationId = readTrim(path.join(directory, "conversation_id"));
  const blocker = activeTaskForConversation(conversationId, id);
  if (blocker) {
    console.log("__AIWB_AGENT_STATUS__ready");
    console.log("__AIWB_AGENT_VERSION__" + VERSION);
    console.log("__AIWB_AGENT_TASK_ID__" + blocker);
    console.log("__AIWB_AGENT_TASK_CONVERSATION_ID__" + conversationId);
    console.log("__AIWB_AGENT_TASK_TURN_ID__" + readTrim(path.join(taskDir(blocker), "turn_id")));
    console.log("__AIWB_AGENT_TASK_REQUEST_MESSAGE_ID__" + readTrim(path.join(taskDir(blocker), "request_message_id")));
    console.log("__AIWB_AGENT_TASK_RESPONSE_MESSAGE_ID__" + readTrim(path.join(taskDir(blocker), "response_message_id")));
    console.log("__AIWB_AGENT_TASK_STATUS__busy");
    console.log("__AIWB_AGENT_BLOCKED_BY_TASK_ID__" + blocker);
    console.log("__AIWB_AGENT_BLOCKED_BY_CONVERSATION_ID__" + conversationId);
    console.log("__AIWB_AGENT_TASK_OUTPUT_START__");
    console.log("这个会话已有任务正在执行，请等待当前任务完成或取消后再发送。");
    console.log("__AIWB_AGENT_TASK_OUTPUT_END__");
    return;
  }
  write(path.join(directory, "queued_at"), now());
  write(path.join(directory, "created_at"), readTrim(path.join(directory, "created_at"), now()));
  write(path.join(directory, "creator.pid"), process.pid);
  write(path.join(directory, "creator.version"), VERSION);
  write(path.join(directory, "creator.control.sha256"), PROCESS_CONTROL_SHA256);
  write(path.join(directory, "creator.generation"), PROCESS_GENERATION_RECORD);
  write(path.join(directory, "status"), "preparing");
  write(path.join(directory, "exit_code"), "");
  const tickLockToken = waitForTickLock();
  if (!tickLockToken) {
    rejectTaskForGenerationChange(id, "task_lock_generation_check_timeout");
    printGenerationChanged();
    process.exitCode = 44;
    return;
  }
  try {
    if (!processGenerationIsCurrent()) {
      rejectTaskForGenerationChange(id, "generation_changed_after_tick_lock");
      printGenerationChanged();
      process.exitCode = 44;
      return;
    }
    write(path.join(directory, "status"), "queued");
  } finally {
    releaseTickLock(tickLockToken);
  }
  ensureDaemon();
  emitTask(id);
}

function cancelTask(id) {
  const directory = taskDir(id);
  stopTaskRunner(id);
  append(path.join(directory, "bootstrap.log"), "AI Workbench Agent: task cancelled by user.\n");
  setStatus(id, "cancelled", "130");
  emitTask(id);
}

function emitConversation(id, historyLimit = 0, before = "") {
  const directory = conversationDir(id);
  if (!fs.existsSync(directory)) return;
  const taskId = readTrim(path.join(directory, "task_id"));
  if (taskId) updateConversation(taskId);
  console.log("__AIWB_AGENT_CONVERSATION_START__");
  console.log("__AIWB_AGENT_CONVERSATION_ID__" + readTrim(path.join(directory, "id"), id));
  console.log("__AIWB_AGENT_CONVERSATION_NAME__" + readTrim(path.join(directory, "name")));
  console.log("__AIWB_AGENT_CONVERSATION_WORKDIR__" + readTrim(path.join(directory, "workdir")));
  console.log("__AIWB_AGENT_CONVERSATION_AGENT_ID__" + readTrim(path.join(directory, "agent_id")));
  console.log("__AIWB_AGENT_CONVERSATION_STATUS__" + readTrim(path.join(directory, "status"), "unknown"));
  console.log("__AIWB_AGENT_CONVERSATION_TASK_ID__" + taskId);
  console.log("__AIWB_AGENT_CONVERSATION_CREATED_AT__" + readTrim(path.join(directory, "created_at")));
  console.log("__AIWB_AGENT_CONVERSATION_UPDATED_AT__" + readTrim(path.join(directory, "updated_at")));
  console.log("__AIWB_AGENT_CONVERSATION_LAST_PROMPT_START__");
  process.stdout.write(read(path.join(directory, "last_prompt.txt")));
  console.log("\n__AIWB_AGENT_CONVERSATION_LAST_PROMPT_END__");
  console.log("__AIWB_AGENT_CONVERSATION_LAST_RESULT_START__");
  process.stdout.write(read(path.join(directory, "last_result.txt")));
  console.log("\n__AIWB_AGENT_CONVERSATION_LAST_RESULT_END__");
  if (historyLimit > 0) {
    const items = taskIds().filter((task) => readTrim(path.join(taskDir(task), "conversation_id")) === id).sort((a, b) => readTrim(path.join(taskDir(b), "created_at")) .localeCompare(readTrim(path.join(taskDir(a), "created_at"))));
    console.log("__AIWB_AGENT_CONVERSATION_HISTORY_START__");
    let count = 0;
    let nextBefore = "";
    for (const item of items) {
      if (count >= historyLimit) break;
      const directory2 = taskDir(item);
      const sortKey = String(Date.parse(readTrim(path.join(directory2, "created_at"))) || 0);
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_ITEM_START__");
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_TASK_ID__" + item);
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_SORT_KEY__" + sortKey + ":" + item);
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_STATUS__" + taskStatus(item));
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_TURN_ID__" + readTrim(path.join(directory2, "turn_id")));
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_REQUEST_MESSAGE_ID__" + readTrim(path.join(directory2, "request_message_id")));
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_RESPONSE_MESSAGE_ID__" + readTrim(path.join(directory2, "response_message_id")));
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_AGENT_ID__" + readTrim(path.join(directory2, "agent_id")));
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_PROMPT_START__");
      process.stdout.write(read(path.join(directory2, "prompt.txt")));
      console.log("\n__AIWB_AGENT_CONVERSATION_HISTORY_PROMPT_END__");
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_RESULT_START__");
      process.stdout.write(taskOutput(item));
      console.log("\n__AIWB_AGENT_CONVERSATION_HISTORY_RESULT_END__");
      console.log("__AIWB_AGENT_CONVERSATION_HISTORY_ITEM_END__");
      nextBefore = sortKey + ":" + item;
      count += 1;
    }
    console.log("__AIWB_AGENT_CONVERSATION_HISTORY_NEXT_BEFORE__" + nextBefore);
    console.log("__AIWB_AGENT_CONVERSATION_HISTORY_HAS_MORE__" + (items.length > count ? "1" : "0"));
    console.log("__AIWB_AGENT_CONVERSATION_HISTORY_END__");
  }
  console.log("__AIWB_AGENT_CONVERSATION_END__");
}

async function waitTask(id, fingerprintValue, timeoutSeconds) {
  const deadline = Date.now() + Math.max(5, Number(timeoutSeconds || 55)) * 1000;
  while (Date.now() < deadline) {
    const current = fingerprint(id);
    if (["done", "error", "cancelled"].includes(taskStatus(id)) || (fingerprintValue && current !== fingerprintValue)) {
      emitTask(id);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  emitTask(id);
}

function taskList() {
  emitHealth();
  console.log("__AIWB_AGENT_TASK_LIST_START__");
  const list = taskIds().sort((a, b) => readTrim(path.join(taskDir(b), "created_at")) .localeCompare(readTrim(path.join(taskDir(a), "created_at")))).slice(0, 20);
  for (const id of list) {
    const directory = taskDir(id);
    console.log("__AIWB_AGENT_TASK_ITEM_START__");
    console.log("__AIWB_AGENT_TASK_ITEM_ID__" + id);
    console.log("__AIWB_AGENT_TASK_ITEM_STATUS__" + taskStatus(id));
    console.log("__AIWB_AGENT_TASK_ITEM_AGENT_ID__" + readTrim(path.join(directory, "agent_id")));
    console.log("__AIWB_AGENT_TASK_ITEM_MODEL__" + readTrim(path.join(directory, "model")));
    console.log("__AIWB_AGENT_TASK_ITEM_CONVERSATION_ID__" + readTrim(path.join(directory, "conversation_id")));
    console.log("__AIWB_AGENT_TASK_ITEM_NAME__" + readTrim(path.join(directory, "name")));
    console.log("__AIWB_AGENT_TASK_ITEM_WORKDIR__" + readTrim(path.join(directory, "workdir")));
    console.log("__AIWB_AGENT_TASK_ITEM_PID__" + readTrim(path.join(directory, "pid")));
    console.log("__AIWB_AGENT_TASK_ITEM_PID_ALIVE__" + (isAlive(readTrim(path.join(directory, "pid"))) ? "1" : "0"));
    console.log("__AIWB_AGENT_TASK_ITEM_ATTEMPTS__" + readTrim(path.join(directory, "attempts")));
    console.log("__AIWB_AGENT_TASK_ITEM_CREATED_AT__" + readTrim(path.join(directory, "created_at")));
    console.log("__AIWB_AGENT_TASK_ITEM_STARTED_AT__" + readTrim(path.join(directory, "started_at")));
    console.log("__AIWB_AGENT_TASK_ITEM_FINISHED_AT__" + readTrim(path.join(directory, "finished_at")));
    console.log("__AIWB_AGENT_TASK_ITEM_PROMPT_START__");
    process.stdout.write(read(path.join(directory, "prompt.txt")).slice(0, 180).replace(/[\r\n]+/g, " "));
    console.log("\n__AIWB_AGENT_TASK_ITEM_PROMPT_END__");
    console.log("__AIWB_AGENT_TASK_ITEM_END__");
  }
  console.log("__AIWB_AGENT_TASK_LIST_END__");
}

async function main() {
  const command = String(process.argv[2] || "status").toLowerCase();
  const args = process.argv.slice(3);
  if (command === "daemon") return daemon();
  if (command === "service-run") return serviceRun();
  if (command === "runner") return runTask(args[0]);
  if (command === "--version" || command === "version") {
    console.log(VERSION);
    return;
  }
  if (command === "install-service") return installService(args[0]);
  if (command === "schedule-install-service") return scheduleInstallService();
  if (command === "install-service-handoff") return installServiceHandoff();
  if (command === "uninstall-service") return uninstallService();
  if (command === "clear-cache") return clearCache();
  if (command === "status") return args[0] ? emitTask(args[0]) : (ensureDaemon(), emitHealth());
  if (command === "create") return createTask(args[0]);
  if (command === "cancel") return cancelTask(args[0]);
  if (command === "wait-task") return waitTask(args[0], args[1], args[2]);
  if (command === "task-list") return taskList();
  if (command === "conversations") {
    console.log("__AIWB_AGENT_STATUS__ready");
    console.log("__AIWB_AGENT_VERSION__" + VERSION);
    for (const id of conversationIds()) emitConversation(id, 0, "");
    return;
  }
  if (command === "conversation-status") return emitConversation(args[0], Number(args[1] || 5), args[2] || "");
  console.log("__AIWB_AGENT_STATUS__error");
  console.log("__AIWB_AGENT_ERROR__unknown command");
  process.exitCode = 2;
}

await main();
