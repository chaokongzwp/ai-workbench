import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const VERSION = "24";
const HOME = os.homedir();
const ROOT = path.join(HOME, ".ai-workbench", "agent");
const TASKS = path.join(ROOT, "tasks");
const CONVERSATIONS = path.join(ROOT, "conversations");
const PID_FILE = path.join(ROOT, "daemon.pid");
const HEARTBEAT_FILE = path.join(ROOT, "daemon.heartbeat");
const LOG_FILE = path.join(ROOT, "daemon.log");
const MAX_CONCURRENCY = 4;

// Scheduled Tasks often start with a reduced PATH. Keep the Node directory and
// the per-user npm bin directory available to npm-generated .cmd shims.
const NODE_BIN_DIR = path.dirname(process.execPath);
const USER_NPM_BIN_DIR = process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : "";
const EXISTING_PATH = process.env.PATH || process.env.Path || "";
process.env.PATH = [NODE_BIN_DIR, USER_NPM_BIN_DIR, EXISTING_PATH].filter(Boolean).join(path.delimiter);
process.env.Path = process.env.PATH;

for (const directory of [ROOT, TASKS, CONVERSATIONS]) fs.mkdirSync(directory, { recursive: true });

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

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + ".tmp-" + process.pid;
  fs.writeFileSync(temporary, String(value ?? ""), "utf8");
  fs.renameSync(temporary, file);
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
  return isAlive(readTrim(PID_FILE));
}

function stopDaemon() {
  const pid = readTrim(PID_FILE);
  if (isAlive(pid)) {
    try { process.kill(Number(pid)); } catch {}
  }
  write(PID_FILE, "");
  write(HEARTBEAT_FILE, "");
}

function daemonStatus() {
  return daemonAlive() ? "running" : "stopped";
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
  write(path.join(target, "task_id"), id);
  write(path.join(target, "status"), taskStatus(id));
  write(path.join(target, "updated_at"), now());
  for (const name of ["name", "workdir", "agent_id", "model", "turn_id", "request_message_id", "response_message_id", "created_at", "queued_at", "started_at", "runner_started_at", "finished_at", "exit_code"]) {
    const source = path.join(taskDir(id), name);
    if (fs.existsSync(source)) write(path.join(target, name), read(source));
  }
  if (fs.existsSync(path.join(taskDir(id), "prompt.txt"))) write(path.join(target, "last_prompt.txt"), read(path.join(taskDir(id), "prompt.txt")));
  if (["done", "error", "cancelled"].includes(taskStatus(id))) {
    const output = read(path.join(taskDir(id), "output.log")) || read(path.join(taskDir(id), "bootstrap.log"));
    if (output) write(path.join(target, "last_result.txt"), output);
    const executionSummary = read(path.join(taskDir(id), "execution-summary.txt"));
    if (executionSummary) write(path.join(target, "last_execution_summary.txt"), executionSummary);
  }
}

function setStatus(id, status, exitCode = "") {
  const directory = taskDir(id);
  write(path.join(directory, "status"), status);
  write(path.join(directory, "exit_code"), exitCode);
  if (["done", "error", "cancelled"].includes(status)) write(path.join(directory, "finished_at"), now());
  updateConversation(id);
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

function buildExecutionSummary(id, workdir, exitCode) {
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
  const repositories = new Set([
    ...Object.keys(before.repositories || {}),
    ...Object.keys(after.repositories || {}),
  ]);
  for (const repository of repositories) {
    const beforeRepo = before.repositories?.[repository] || { head: "", dirty: {} };
    const afterRepo = after.repositories?.[repository] || { head: "", dirty: {} };
    const repositoryName = path.basename(repository);
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
  lines.push("- 说明：这是 Agent 根据任务开始与结束时的 Git 状态自动生成的执行痕迹。");
  write(path.join(directory, "execution-summary.txt"), lines.join("\n") + "\n");
}

function emitTask(id) {
  const directory = taskDir(id);
  const status = taskStatus(id);
  if (["queued", "running"].includes(status)) ensureDaemon();
  console.log("__AIWB_AGENT_STATUS__ready");
  console.log("__AIWB_AGENT_VERSION__" + VERSION);
  console.log("__AIWB_AGENT_HOME__" + ROOT);
  console.log("__AIWB_AGENT_SERVICE_STATUS__windows-task-scheduler");
  console.log("__AIWB_AGENT_DAEMON_STATUS__" + daemonStatus());
  console.log("__AIWB_AGENT_DAEMON_HEARTBEAT__" + readTrim(HEARTBEAT_FILE));
  console.log("__AIWB_AGENT_TASK_ID__" + id);
  console.log("__AIWB_AGENT_TASK_CONVERSATION_ID__" + readTrim(path.join(directory, "conversation_id")));
  console.log("__AIWB_AGENT_TASK_TURN_ID__" + readTrim(path.join(directory, "turn_id")));
  console.log("__AIWB_AGENT_TASK_REQUEST_MESSAGE_ID__" + readTrim(path.join(directory, "request_message_id")));
  console.log("__AIWB_AGENT_TASK_RESPONSE_MESSAGE_ID__" + readTrim(path.join(directory, "response_message_id")));
  console.log("__AIWB_AGENT_TASK_STATUS__" + status);
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
  console.log("__AIWB_AGENT_DAEMON_STATUS__" + daemonStatus());
  console.log("__AIWB_AGENT_DAEMON_HEARTBEAT__" + readTrim(HEARTBEAT_FILE));
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

async function runChild(executable, args, input = "") {
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
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, PATH: childPath, Path: childPath },
        });
      } catch (error) {
        resolve({ code: 1, stdout: "", stderr: String(error?.message || error) });
        return;
      }
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (error) => {
        const detail = error?.code === "ENOENT"
          ? "找不到可执行文件：" + executable + "。请确认 Codex/Claude 已安装，并在 Agent 设置中重新检测命令路径。"
          : String(error?.message || error);
        resolve({ code: 1, stdout, stderr: stderr + detail });
      });
      child.on("close", (code) => resolve({ code: Number(code ?? 1), stdout, stderr }));
      if (input) child.stdin.end(input, "utf8"); else child.stdin.end();
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
  if (spec.kind === "claude") {
    args.push("-p", String(spec.prompt || ""), "--output-format", "json", "--permission-mode", "acceptEdits");
    if (spec.model) args.push("--model", spec.model);
    if (/^[0-9a-fA-F-]{36}$/.test(session)) args.push("--resume", session);
  } else {
    args.push("exec", "--skip-git-repo-check", "--sandbox", "danger-full-access", "--cd", String(spec.workdir || process.cwd()), "--output-last-message", outputPath, "--color", "never");
    if (spec.model) args.push("--model", spec.model);
    if (/^[0-9a-fA-F-]{36}$/.test(session)) args.push("resume", session);
    args.push(String(spec.prompt || ""));
  }
  let result;
  const powershellFileIndex = tool.prefix.findIndex((value) => String(value).toLowerCase() === "-file");
  if (process.platform === "win32") {
    if (!tool.executable.toLowerCase().endsWith("powershell.exe")) {
      result = await runChild(tool.executable, args, "");
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
    result = await runChild("powershell.exe", ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", powershellScript], "");
    }
  } else {
    result = await runChild(tool.executable, [...tool.prefix, ...args], "");
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
    buildExecutionSummary(id, spec.workdir || process.cwd(), result.code);
    setStatus(id, result.code === 0 ? "done" : "error", String(result.code));
  } catch (error) {
    write(path.join(directory, "bootstrap.log"), String(error?.stack || error) + "\n");
    append(path.join(directory, "launcher.log"), "\nAgent Runner 异常：\n" + String(error?.stack || error) + "\n");
    if (spec) buildExecutionSummary(id, spec.workdir || process.cwd(), 1);
    setStatus(id, "error", "1");
  }
}

function launchTask(id) {
  const directory = taskDir(id);
  const attempts = Number(readTrim(path.join(directory, "attempts"), "0")) + 1;
  write(path.join(directory, "attempts"), attempts);
  write(path.join(directory, "started_at"), now());
  write(path.join(directory, "status"), "running");
  const child = spawn(process.execPath, [process.argv[1], "runner", id], { detached: true, stdio: "ignore", windowsHide: true });
  write(path.join(directory, "pid"), child.pid || "");
  child.unref();
  updateConversation(id);
  log("launched task=" + id + " pid=" + child.pid);
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
  for (const id of taskIds()) markStale(id);
  let running = taskIds().filter((id) => taskStatus(id) === "running" && isAlive(readTrim(path.join(taskDir(id), "pid")))).length;
  for (const id of taskIds()) {
    if (running >= MAX_CONCURRENCY) break;
    if (taskStatus(id) === "queued") {
      launchTask(id);
      running += 1;
    }
  }
}

function ensureDaemon() {
  if (daemonAlive()) return;
  const scheduled = spawnSync("schtasks.exe", ["/Run", "/TN", "AI Workbench Agent"], { encoding: "utf8", windowsHide: true });
  if (scheduled.status === 0) return;
  const child = spawn(process.execPath, [process.argv[1], "daemon"], { detached: true, stdio: "ignore", windowsHide: true });
  if (child.pid) write(PID_FILE, child.pid);
  child.unref();
}

async function daemon() {
  write(PID_FILE, process.pid);
  log("daemon started pid=" + process.pid + " version=" + VERSION);
  while (true) {
    write(HEARTBEAT_FILE, now());
    tick();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function installService() {
  const taskName = "AI Workbench Agent";
  spawnSync("schtasks.exe", ["/End", "/TN", taskName], { encoding: "utf8", windowsHide: true });
  stopDaemon();
  const command = '"' + process.execPath + '" "' + process.argv[1] + '" daemon';
  const result = spawnSync("schtasks.exe", ["/Create", "/TN", taskName, "/SC", "ONLOGON", "/TR", command, "/F"], { encoding: "utf8", windowsHide: true });
  if (result.status === 0) {
    spawnSync("schtasks.exe", ["/Run", "/TN", taskName], { encoding: "utf8", windowsHide: true });
  } else {
    ensureDaemon();
  }
  console.log("__AIWB_AGENT_STATUS__ready");
  console.log("__AIWB_AGENT_VERSION__" + VERSION);
  console.log("__AIWB_AGENT_SERVICE_STATUS__" + (result.status === 0 ? "installed" : "user-fallback"));
  if (result.status !== 0 && result.stderr) console.log(result.stderr.trim());
}

function uninstallService() {
  const taskName = "AI Workbench Agent";
  spawnSync("schtasks.exe", ["/End", "/TN", taskName], { encoding: "utf8", windowsHide: true });
  spawnSync("schtasks.exe", ["/Delete", "/TN", taskName, "/F"], { encoding: "utf8", windowsHide: true });
  stopDaemon();
  for (const id of taskIds()) {
    const pid = readTrim(path.join(taskDir(id), "pid"));
    if (pid && isAlive(pid)) spawnSync("taskkill.exe", ["/PID", pid, "/T", "/F"], { windowsHide: true });
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

function createTask(id) {
  const directory = taskDir(id);
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
  write(path.join(directory, "status"), "queued");
  write(path.join(directory, "exit_code"), "");
  ensureDaemon();
  emitTask(id);
}

function cancelTask(id) {
  const directory = taskDir(id);
  const pid = readTrim(path.join(directory, "pid"));
  if (pid && isAlive(pid)) spawnSync("taskkill.exe", ["/PID", pid, "/T", "/F"], { windowsHide: true });
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
  if (command === "runner") return runTask(args[0]);
  if (command === "--version" || command === "version") {
    console.log(VERSION);
    return;
  }
  if (command === "install-service") return installService();
  if (command === "uninstall-service") return uninstallService();
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
