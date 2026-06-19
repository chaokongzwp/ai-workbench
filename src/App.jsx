import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

function desktopBridge() {
  return typeof window !== "undefined" ? window.aiWorkbench : undefined;
}

const SSHWorkbench = registerPlugin("SSHWorkbench", {
  web: () => ({
    async runCommand(payload) {
      const bridge = desktopBridge();
      if (bridge?.runCommand) return bridge.runCommand(payload);
      throw new Error("浏览器预览不能直接发起 SSH，请在 iPhone 或 iPad App 中测试。");
    },
    async saveProfile({ profile }) {
      const bridge = desktopBridge();
      if (bridge?.saveProfile) return bridge.saveProfile({ profile });
      localStorage.setItem("ai-workbench-profile", JSON.stringify(profile ?? {}));
      return { ok: true };
    },
    async loadProfile() {
      const bridge = desktopBridge();
      if (bridge?.loadProfile) return bridge.loadProfile();
      const raw = localStorage.getItem("ai-workbench-profile");
      return { profile: raw ? JSON.parse(raw) : {} };
    },
    async clearProfile() {
      const bridge = desktopBridge();
      if (bridge?.clearProfile) return bridge.clearProfile();
      localStorage.removeItem("ai-workbench-profile");
      return { ok: true };
    },
  }),
});

const VoiceWorkbench = registerPlugin("VoiceWorkbench", {
  web: () => {
    let recognition = null;

    return {
      async start({ locale = "zh-CN" } = {}) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          throw new Error("当前环境不支持语音识别，请在 iPhone 或 iPad App 中使用。");
        }

        if (recognition) recognition.stop();

        return new Promise((resolve, reject) => {
          let settled = false;
          let transcript = "";
          recognition = new SpeechRecognition();
          recognition.lang = locale;
          recognition.interimResults = true;
          recognition.continuous = false;

          recognition.onresult = (event) => {
            let text = "";
            for (let index = 0; index < event.results.length; index += 1) {
              text += event.results[index][0]?.transcript || "";
            }
            transcript = text.trim();
          };

          recognition.onerror = (event) => {
            if (settled) return;
            settled = true;
            recognition = null;
            const message = event?.error === "not-allowed" ? "没有麦克风权限。" : "语音识别失败。";
            reject(new Error(message));
          };

          recognition.onend = () => {
            recognition = null;
            if (settled) return;
            settled = true;
            resolve({ ok: true, text: transcript });
          };

          recognition.start();
        });
      },
      async stop() {
        if (recognition) recognition.stop();
        return { ok: true };
      },
    };
  },
});

const serverPlatformDefaults = {
  linux: {
    workdir: "/opt/limpet-workspace",
    codexCommand: "/usr/local/bin/codex",
    claudeCommand: "/usr/local/bin/claude",
  },
  wsl: {
    workdir: "/home/ai-workbench",
    codexCommand: "codex",
    claudeCommand: "claude",
  },
  windows: {
    workdir: "C:\\AIWorkbench",
    codexCommand: "codex",
    claudeCommand: "claude",
  },
};

const serverPlatforms = [
  { id: "linux", label: "Linux / ECS" },
  { id: "wsl", label: "Windows + WSL" },
  { id: "windows", label: "Windows PowerShell" },
];

const defaultProfile = {
  platform: "linux",
  host: "47.236.117.100",
  port: 22,
  username: "root",
  password: "",
  workdir: serverPlatformDefaults.linux.workdir,
  tmuxSession: "ai-dev",
  codexCommand: serverPlatformDefaults.linux.codexCommand,
  claudeCommand: serverPlatformDefaults.linux.claudeCommand,
  connectTimeoutSeconds: 15,
};

const agents = [
  {
    id: "codex",
    name: "Codex CLI",
    shortName: "Codex",
    accent: "primary",
    commandKey: "codexCommand",
  },
  {
    id: "claude",
    name: "Claude Code",
    shortName: "Claude",
    accent: "neutral",
    commandKey: "claudeCommand",
  },
];

const assetBase = import.meta.env.BASE_URL || "./";
const finalAnswerStart = "AIWB_FINAL_START";
const finalAnswerEnd = "AIWB_FINAL_END";

function assetPath(path) {
  return `${assetBase}${path.replace(/^\/+/, "")}`;
}

function formatAgentPrompt(prompt) {
  const userTask = JSON.stringify(String(prompt || "").trim());
  return `请完成这个用户任务。用户任务是一个 JSON 字符串，请先解析它再执行：${userTask}。输出要求：只输出最终给用户看的答案，不要复述本段规则，不要输出过程、菜单、命令行日志或工具调用记录；最终答案必须放在 ${finalAnswerStart} 和 ${finalAnswerEnd} 之间。`;
}

let messageCounter = 0;

function createMessage(partial) {
  messageCounter += 1;
  return {
    id: `msg-${Date.now()}-${messageCounter}`,
    status: "done",
    output: "",
    createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    ...partial,
  };
}

function normalizeProfile(profile) {
  const platform = normalizeServerPlatform(profile?.platform);
  const platformDefaults = serverPlatformDefaults[platform] || serverPlatformDefaults.linux;
  return {
    ...defaultProfile,
    ...platformDefaults,
    ...(profile ?? {}),
    platform,
    port: Number(profile?.port ?? defaultProfile.port) || defaultProfile.port,
    connectTimeoutSeconds:
      Number(profile?.connectTimeoutSeconds ?? defaultProfile.connectTimeoutSeconds) ||
      defaultProfile.connectTimeoutSeconds,
  };
}

function createServerId() {
  return `server-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function initialConnectionForProfile(profile) {
  return profileReady(profile)
    ? { state: "idle", label: "未测试", detail: `${profile.username}@${profile.host}` }
    : { state: "idle", label: "待配置", detail: profileIssue(profile) };
}

function serverDisplayName(server, index = 0) {
  const profile = server?.profile || {};
  return (
    String(server?.name || profile.name || "").trim() ||
    (index === 0 ? "默认服务器" : `服务器 ${index + 1}`)
  );
}

function serverSessionName(server, index = 0) {
  const profile = server?.profile || {};
  const explicit = String(server?.name || profile.name || "").trim();
  if (explicit && explicit !== "默认服务器" && !/^服务器 \d+$/.test(explicit)) return explicit;
  const workdirName = workdirDisplayName(profile.workdir);
  return workdirName || explicit || (index === 0 ? "默认服务器" : `服务器 ${index + 1}`);
}

function createServerSession(partial = {}, index = 0) {
  const profile = normalizeProfile(partial.profile || partial);
  const server = {
    id: partial.id || createServerId(),
    name: String(partial.name || profile.name || "").trim(),
    profile,
    connection: partial.connection || initialConnectionForProfile(profile),
    diagnostics: partial.diagnostics || {},
    discovery: partial.discovery || null,
    rawOutput: partial.rawOutput || "原始输出会在测试连接或发送任务后显示。",
    messages: Array.isArray(partial.messages) ? partial.messages : [],
  };
  return {
    ...server,
    name: server.name || serverDisplayName(server, index),
  };
}

function normalizeWorkspaceStore(value) {
  if (value?.version === 2 && Array.isArray(value.servers)) {
    const servers = value.servers.length
      ? value.servers.map((server, index) => createServerSession(server, index))
      : [createServerSession({ profile: defaultProfile, name: "默认服务器" })];
    const activeServerId = servers.some((server) => server.id === value.activeServerId)
      ? value.activeServerId
      : servers[0].id;
    return { activeServerId, servers };
  }

  const migrated = createServerSession({
    id: "default-server",
    name: "默认服务器",
    profile: value && Object.keys(value).length ? value : defaultProfile,
  });
  return { activeServerId: migrated.id, servers: [migrated] };
}

function serializeWorkspaceStore(servers, activeServerId) {
  return {
    version: 2,
    activeServerId,
    servers: servers.map((server, index) => ({
      id: server.id,
      name: serverDisplayName(server, index),
      profile: {
        ...server.profile,
        name: serverDisplayName(server, index),
      },
    })),
  };
}

function profileIssue(profile) {
  if (!String(profile?.host || "").trim()) return "请填写服务器 IP 或域名";
  if (!String(profile?.username || "").trim()) return "请填写登录用户名";
  if (!String(profile?.password || "").trim()) return "请先填写登录密码";
  return "";
}

function profileReady(profile) {
  return !profileIssue(profile);
}

function shQuote(value) {
  return `'${String(value ?? "").replace(/'/g, "'\\''")}'`;
}

function bashCommand(script) {
  return `bash -lc ${shQuote(script)}`;
}

function commandName(command) {
  return String(command || "").trim().split(/\s+/)[0] || "";
}

function sanitizeId(value) {
  return String(value || "session").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
}

function toBase64Utf8(text) {
  return toBase64Bytes(new TextEncoder().encode(text));
}

function toBase64Utf16Le(text) {
  const source = String(text || "");
  const bytes = new Uint8Array(source.length * 2);
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    bytes[index * 2] = code & 0xff;
    bytes[index * 2 + 1] = code >> 8;
  }
  return toBase64Bytes(bytes);
}

function toBase64Bytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function sessionName(profile, agentId) {
  const base = String(profile.tmuxSession || "ai-dev").trim() || "ai-dev";
  return `${base}-${agentId}`;
}

function agentCommand(profile, agent) {
  return profile[agent.commandKey] || defaultProfile[agent.commandKey];
}

function normalizeServerPlatform(value) {
  if (value === "windows" || value === "wsl") return value;
  return "linux";
}

function serverPlatformLabel(profile) {
  const platform = normalizeServerPlatform(profile?.platform);
  return serverPlatforms.find((item) => item.id === platform)?.label || serverPlatforms[0].label;
}

function workdirDisplayName(path) {
  const normalized = String(path || "").replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) || normalized || "工作目录";
}

function isWindowsProfile(profile) {
  return normalizeServerPlatform(profile?.platform) === "windows";
}

function isWslProfile(profile) {
  return normalizeServerPlatform(profile?.platform) === "wsl";
}

function dirnameRemote(path) {
  const normalized = String(path || "").replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return ".";
  return normalized.slice(0, index);
}

function dirnameWindows(path) {
  const normalized = String(path || "").replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  if (index <= 2) return normalized || ".";
  return normalized.slice(0, index);
}

function joinWindowsPath(...parts) {
  return parts
    .map((part, index) => {
      const value = String(part || "");
      if (index === 0) return value.replace(/[\\/]+$/, "");
      return value.replace(/^[\\/]+|[\\/]+$/g, "");
    })
    .filter(Boolean)
    .join("\\");
}

function psQuote(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function powershellCommand(script) {
  const encoded = toBase64Utf16Le(`$ErrorActionPreference = 'Stop'\n${script}`);
  return `powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
}

function remoteBashCommand(profile, script) {
  if (!isWslProfile(profile)) return bashCommand(script);
  const encoded = toBase64Utf8(script);
  return powershellCommand(`
$AIWB_SCRIPT = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(${psQuote(encoded)}))
& wsl.exe bash -lc $AIWB_SCRIPT
exit $LASTEXITCODE
`);
}

function buildHealthCommand(profile) {
  if (isWindowsProfile(profile)) return buildWindowsHealthCommand(profile);

  const codexProbe = commandName(profile.codexCommand);
  const claudeProbe = commandName(profile.claudeCommand);

  return remoteBashCommand(profile, `
set -e
mkdir -p ${shQuote(profile.workdir)}
cd ${shQuote(profile.workdir)}
printf '__AIWB_HOST__%s\\n' "$(hostname)"
printf '__AIWB_USER__%s\\n' "$(whoami)"
printf '__AIWB_PWD__%s\\n' "$(pwd)"
printf '__AIWB_TMUX__%s\\n' "$(command -v tmux || true)"
printf '__AIWB_CODEX__%s\\n' "$(command -v ${codexProbe ? shQuote(codexProbe) : "codex"} || true)"
printf '__AIWB_CLAUDE__%s\\n' "$(command -v ${claudeProbe ? shQuote(claudeProbe) : "claude"} || true)"
printf '__AIWB_TMUX_VERSION__'
(tmux -V 2>&1 || true) | head -n 1
printf '__AIWB_CODEX_VERSION__'
(${profile.codexCommand} --version 2>&1 || true) | head -n 1
printf '__AIWB_CLAUDE_VERSION__'
(${profile.claudeCommand} --version 2>&1 || true) | head -n 1
`);
}

function buildWindowsHealthCommand(profile) {
  const codexProbe = commandName(profile.codexCommand) || "codex";
  const claudeProbe = commandName(profile.claudeCommand) || "claude";

  return powershellCommand(`
$AIWB_WORKDIR = ${psQuote(profile.workdir)}
New-Item -ItemType Directory -Force -Path $AIWB_WORKDIR | Out-Null
Set-Location -LiteralPath $AIWB_WORKDIR
$AIWB_CODEX = (Get-Command ${psQuote(codexProbe)} -ErrorAction SilentlyContinue | Select-Object -First 1).Source
$AIWB_CLAUDE = (Get-Command ${psQuote(claudeProbe)} -ErrorAction SilentlyContinue | Select-Object -First 1).Source
$AIWB_CODEX_VERSION = ""
$AIWB_CLAUDE_VERSION = ""
try { $AIWB_CODEX_VERSION = (& ${psQuote(profile.codexCommand)} --version 2>&1 | Select-Object -First 1) } catch {}
try { $AIWB_CLAUDE_VERSION = (& ${psQuote(profile.claudeCommand)} --version 2>&1 | Select-Object -First 1) } catch {}
Write-Output ("__AIWB_HOST__" + [System.Net.Dns]::GetHostName())
Write-Output ("__AIWB_USER__" + [System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
Write-Output ("__AIWB_PWD__" + (Get-Location).Path)
Write-Output "__AIWB_TMUX__Windows PowerShell 模式不使用 tmux"
Write-Output ("__AIWB_CODEX__" + $AIWB_CODEX)
Write-Output ("__AIWB_CLAUDE__" + $AIWB_CLAUDE)
Write-Output "__AIWB_TMUX_VERSION__Windows PowerShell 模式不使用 tmux"
Write-Output ("__AIWB_CODEX_VERSION__" + $AIWB_CODEX_VERSION)
Write-Output ("__AIWB_CLAUDE_VERSION__" + $AIWB_CLAUDE_VERSION)
`);
}

function parseHealth(output) {
  const result = {};
  for (const line of String(output || "").split("\n")) {
    const match = line.match(/^__AIWB_([^_]+(?:_[^_]+)*)__([\s\S]*)$/);
    if (match) {
      result[match[1].toLowerCase()] = match[2].trim();
    }
  }
  return result;
}

function buildDiscoveryCommand(profile) {
  if (isWindowsProfile(profile)) return buildWindowsDiscoveryCommand(profile);

  return remoteBashCommand(profile, `
set +e
export AIWB_CURRENT_WORKDIR=${shQuote(profile.workdir)}
python3 - <<'PY'
import json
import os
import shutil
import subprocess
import time
from collections import defaultdict
from pathlib import Path

SKIP_DIRS = {
    ".cache", ".cargo", ".git", ".local", ".npm", ".pnpm-store", ".yarn",
    "build", "dist", "node_modules", "target", "__pycache__",
}
PROJECT_MARKERS = {
    ".git": "Git",
    ".codex": "Codex",
    ".claude": "Claude",
    "package.json": "Node",
    "pyproject.toml": "Python",
    "requirements.txt": "Python",
    "Cargo.toml": "Rust",
    "go.mod": "Go",
    "pom.xml": "Java",
}

def short(value, limit=120):
    text = " ".join(str(value or "").split())
    return text[:limit] + ("..." if len(text) > limit else "")

def run(args, timeout=4):
    try:
        result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
        return (result.stdout or result.stderr or "").strip()
    except Exception:
        return ""

def tool_version(tool, path):
    if tool == "tmux":
        return short(run([path, "-V"]))
    if tool == "screen":
        return short(run([path, "--version"]))
    return short(run([path, "--version"]))

def collect_tools():
    tools = []
    for tool in ["codex", "claude", "gemini", "aider", "ollama", "opencode", "goose", "tmux", "screen"]:
        path = shutil.which(tool)
        if path:
            tools.append({"id": tool, "name": tool, "path": path, "version": tool_version(tool, path)})
    return tools

def read_jsonl(path):
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except Exception:
                    continue
    except Exception:
        return

def collect_codex_history(limit=160):
    root = Path("/root/.codex/sessions")
    files = [path for path in root.rglob("*.jsonl") if path.is_file()] if root.exists() else []
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    items = []
    for path in files[:limit]:
        cwd = ""
        model = ""
        last_user = ""
        last_assistant = ""
        for obj in read_jsonl(path):
            payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else obj
            if obj.get("type") == "session_meta":
                cwd = payload.get("cwd") or cwd
            elif obj.get("type") == "turn_context":
                cwd = payload.get("cwd") or cwd
                model = payload.get("model") or model
            elif obj.get("type") == "response_item" and payload.get("type") == "message":
                role = payload.get("role")
                content = payload.get("content")
                text = ""
                if isinstance(content, str):
                    text = content
                elif isinstance(content, list):
                    text = "\\n".join(
                        part.get("text", "")
                        for part in content
                        if isinstance(part, dict) and isinstance(part.get("text"), str)
                    )
                if role == "user" and text and not text.startswith("# AGENTS.md"):
                    last_user = short(text)
                elif role == "assistant" and text:
                    last_assistant = short(text)
        items.append({
            "agent": "codex",
            "path": str(path),
            "sessionId": path.stem,
            "cwd": cwd,
            "model": model,
            "mtime": int(path.stat().st_mtime),
            "lastUser": last_user,
            "lastAssistant": last_assistant,
        })
    return items

def collect_claude_history(limit=80):
    root = Path("/root/.claude/projects")
    files = [path for path in root.rglob("*.jsonl") if path.is_file()] if root.exists() else []
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    items = []
    for path in files[:limit]:
        cwd = ""
        last_user = ""
        last_assistant = ""
        for obj in read_jsonl(path):
            cwd = obj.get("cwd") or cwd
            role = obj.get("role")
            content = obj.get("message", {}).get("content") if isinstance(obj.get("message"), dict) else obj.get("content")
            if isinstance(content, list):
                text = "\\n".join(
                    part.get("text", "")
                    for part in content
                    if isinstance(part, dict) and isinstance(part.get("text"), str)
                )
            else:
                text = str(content or "")
            if role == "user" and text:
                last_user = short(text)
            elif role == "assistant" and text:
                last_assistant = short(text)
        items.append({
            "agent": "claude",
            "path": str(path),
            "sessionId": path.stem,
            "cwd": cwd,
            "model": "",
            "mtime": int(path.stat().st_mtime),
            "lastUser": last_user,
            "lastAssistant": last_assistant,
        })
    return items

def collect_active_sessions():
    sessions = []
    tmux = shutil.which("tmux")
    if tmux:
        output = run([tmux, "list-panes", "-a", "-F", "session=#{session_name}|window=#{window_index}:#{window_name}|pane=#{pane_index}|pid=#{pane_pid}|cmd=#{pane_current_command}|path=#{pane_current_path}"])
        for line in output.splitlines():
            data = {}
            for part in line.split("|"):
                key, _, value = part.partition("=")
                data[key] = value
            if data.get("session") or data.get("path") or data.get("cmd"):
                cmd = data.get("cmd", "")
                agent = "codex" if "codex" in cmd.lower() else "claude" if "claude" in cmd.lower() else "shell"
                sessions.append({
                    "type": "tmux",
                    "agent": agent,
                    "name": data.get("session", ""),
                    "cwd": data.get("path", ""),
                    "command": cmd,
                })
    return sessions

def add_dir(dirs, path, markers=None, history=None, current=False):
    if not path:
        return
    value = str(path)
    item = dirs.setdefault(value, {
        "path": value,
        "name": Path(value).name or value,
        "markers": [],
        "history": {"codex": 0, "claude": 0},
        "latest": 0,
        "score": 0,
        "exists": Path(value).exists(),
    })
    if markers:
        item["markers"] = sorted(set(item["markers"]) | set(markers))
    if history:
        for key in ("codex", "claude"):
            item["history"][key] = item["history"].get(key, 0) + int(history.get(key, 0))
        item["latest"] = max(item.get("latest", 0), int(history.get("latest", 0)))
    if current:
        item["current"] = True
    item["score"] = (
        item["history"].get("codex", 0) * 12
        + item["history"].get("claude", 0) * 10
        + len(item["markers"]) * 8
        + (12 if item.get("current") else 0)
        + (4 if item.get("exists") else 0)
        + min(item.get("latest", 0) // 100000000, 20)
    )

def collect_project_dirs(current_workdir, histories):
    history_by_cwd = defaultdict(lambda: {"codex": 0, "claude": 0, "latest": 0})
    for item in histories:
        cwd = item.get("cwd")
        if not cwd:
            continue
        bucket = history_by_cwd[cwd]
        bucket[item.get("agent", "")] += 1
        bucket["latest"] = max(bucket["latest"], int(item.get("mtime", 0)))

    roots = []
    for candidate in [
        current_workdir,
        str(Path(current_workdir).parent) if current_workdir else "",
        "/opt/limpet-workspace",
        "/workspace",
        "/root",
        "/home",
    ]:
        if candidate and candidate not in roots and Path(candidate).exists():
            roots.append(candidate)

    dirs = {}
    for cwd, history in history_by_cwd.items():
        add_dir(dirs, cwd, markers=["历史会话"], history=history, current=(cwd == current_workdir))

    for root_value in roots:
        root = Path(root_value)
        base_depth = len(root.parts)
        for current, child_dirs, files in os.walk(root):
            path = Path(current)
            depth = len(path.parts) - base_depth
            markers = []
            file_set = set(files)
            dir_set = set(child_dirs)
            for marker, label in PROJECT_MARKERS.items():
                if marker in file_set or marker in dir_set:
                    markers.append(label)
            if markers or str(path) == current_workdir:
                add_dir(dirs, str(path), markers=markers, history=history_by_cwd.get(str(path)), current=(str(path) == current_workdir))
            if depth >= 2:
                child_dirs[:] = []
            else:
                child_dirs[:] = [name for name in child_dirs if name not in SKIP_DIRS and not name.startswith(".Trash")]

    return sorted(dirs.values(), key=lambda item: (-item.get("score", 0), -item.get("latest", 0), item.get("path", "")))[:60]

current_workdir = os.environ.get("AIWB_CURRENT_WORKDIR", "")
histories = collect_codex_history() + collect_claude_history()
result = {
    "scannedAt": time.strftime("%Y-%m-%d %H:%M:%S %z"),
    "tools": collect_tools(),
    "activeSessions": collect_active_sessions(),
    "history": {
        "codex": sum(1 for item in histories if item.get("agent") == "codex"),
        "claude": sum(1 for item in histories if item.get("agent") == "claude"),
        "latest": max([item.get("mtime", 0) for item in histories] or [0]),
    },
    "recentSessions": sorted(histories, key=lambda item: item.get("mtime", 0), reverse=True)[:12],
    "directories": collect_project_dirs(current_workdir, histories),
}
print("__AIWB_SCAN_JSON__" + json.dumps(result, ensure_ascii=False, separators=(",", ":")))
PY
`);
}

function buildWindowsDiscoveryCommand(profile) {
  const codexProbe = commandName(profile.codexCommand) || "codex";
  const claudeProbe = commandName(profile.claudeCommand) || "claude";

  return powershellCommand(`
$AIWB_WORKDIR = ${psQuote(profile.workdir)}
$AIWB_TOOLS = @()
foreach ($AIWB_TOOL in @(${psQuote(codexProbe)}, ${psQuote(claudeProbe)}, "gemini", "aider", "ollama", "opencode", "goose")) {
  $AIWB_CMD = Get-Command $AIWB_TOOL -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($AIWB_CMD) {
    $AIWB_VERSION = ""
    try { $AIWB_VERSION = (& $AIWB_CMD.Source --version 2>&1 | Select-Object -First 1) } catch {}
    $AIWB_TOOLS += [ordered]@{ id = $AIWB_TOOL; name = $AIWB_TOOL; path = $AIWB_CMD.Source; version = [string]$AIWB_VERSION }
  }
}
$AIWB_DIRS = @()
$AIWB_SEEN = @{}
foreach ($AIWB_BASE in @($AIWB_WORKDIR, $HOME, "C:\\AIWorkbench", "C:\\workspace")) {
  if (-not $AIWB_BASE -or -not (Test-Path -LiteralPath $AIWB_BASE)) { continue }
  foreach ($AIWB_PATH in @((Get-Item -LiteralPath $AIWB_BASE)) + @(Get-ChildItem -LiteralPath $AIWB_BASE -Directory -ErrorAction SilentlyContinue | Select-Object -First 40)) {
    if ($AIWB_SEEN[$AIWB_PATH.FullName]) { continue }
    $AIWB_SEEN[$AIWB_PATH.FullName] = $true
    $AIWB_MARKERS = @()
    foreach ($AIWB_MARKER in @(".git", ".codex", ".claude", "package.json", "pyproject.toml", "go.mod", "Cargo.toml")) {
      if (Test-Path -LiteralPath (Join-Path $AIWB_PATH.FullName $AIWB_MARKER)) { $AIWB_MARKERS += $AIWB_MARKER }
    }
    $AIWB_DIRS += [ordered]@{
      path = $AIWB_PATH.FullName
      name = $AIWB_PATH.Name
      markers = $AIWB_MARKERS
      history = @{ codex = 0; claude = 0 }
      latest = 0
      score = $(if ($AIWB_PATH.FullName -eq $AIWB_WORKDIR) { 20 } else { $AIWB_MARKERS.Count * 8 })
      exists = $true
      current = $AIWB_PATH.FullName -eq $AIWB_WORKDIR
    }
  }
}
$AIWB_RESULT = [ordered]@{
  scannedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
  tools = $AIWB_TOOLS
  activeSessions = @()
  history = @{ codex = 0; claude = 0; latest = 0 }
  recentSessions = @()
  directories = $AIWB_DIRS
}
Write-Output ("__AIWB_SCAN_JSON__" + ($AIWB_RESULT | ConvertTo-Json -Compress -Depth 8))
`);
}

function parseDiscovery(output) {
  const match = String(output || "").match(/^__AIWB_SCAN_JSON__(.+)$/m);
  if (!match) {
    return {
      state: "error",
      message: "没有读到扫描结果。",
      tools: [],
      directories: [],
      activeSessions: [],
      recentSessions: [],
      history: { codex: 0, claude: 0 },
    };
  }

  try {
    return normalizeDiscovery(JSON.parse(match[1]));
  } catch (error) {
    return {
      state: "error",
      message: shortError(error),
      tools: [],
      directories: [],
      activeSessions: [],
      recentSessions: [],
      history: { codex: 0, claude: 0 },
    };
  }
}

function normalizeDiscovery(value) {
  const directories = Array.isArray(value?.directories)
    ? value.directories
        .filter((item) => String(item?.path || "").trim())
        .map((item) => ({
          path: String(item.path).trim(),
          name: String(item.name || workdirDisplayName(item.path)).trim(),
          markers: Array.isArray(item.markers) ? item.markers.filter(Boolean).slice(0, 6) : [],
          history: {
            codex: Number(item.history?.codex || 0),
            claude: Number(item.history?.claude || 0),
          },
          current: Boolean(item.current),
          exists: item.exists !== false,
          score: Number(item.score || 0),
        }))
    : [];

  return {
    state: "done",
    scannedAt: value?.scannedAt || new Date().toLocaleString(),
    tools: Array.isArray(value?.tools) ? value.tools : [],
    directories,
    activeSessions: Array.isArray(value?.activeSessions) ? value.activeSessions : [],
    recentSessions: Array.isArray(value?.recentSessions) ? value.recentSessions : [],
    history: {
      codex: Number(value?.history?.codex || 0),
      claude: Number(value?.history?.claude || 0),
      latest: Number(value?.history?.latest || 0),
    },
  };
}

function buildCodexExecCommand(profile, agent, prompt) {
  if (isWindowsProfile(profile)) return buildWindowsCodexExecCommand(profile, agent, prompt);

  const encodedPrompt = toBase64Utf8(formatAgentPrompt(prompt));
  const command = agentCommand(profile, agent);
  const stateDir = `${String(profile.workdir || ".").replace(/\/+$/, "")}/.ai-workbench`;
  const sessionFile = `${stateDir}/${sanitizeId(sessionName(profile, agent.id))}.session`;

  return remoteBashCommand(profile, `
set -e
mkdir -p ${shQuote(profile.workdir)}
mkdir -p ${shQuote(stateDir)}
cd ${shQuote(profile.workdir)}

AIWB_PROMPT=$(printf '%s' ${shQuote(encodedPrompt)} | base64 -d)
AIWB_OUTPUT=$(mktemp /tmp/aiwb-codex-output.XXXXXX)
AIWB_LOG=$(mktemp /tmp/aiwb-codex-log.XXXXXX)
AIWB_SESSION=""
if [ -s ${shQuote(sessionFile)} ]; then
  AIWB_SESSION=$(cat ${shQuote(sessionFile)} 2>/dev/null | tr -d '[:space:]' || true)
fi

set +e
if printf '%s' "$AIWB_SESSION" | grep -Eq '^[0-9a-fA-F-]{36}$'; then
  ${shQuote(command)} exec --skip-git-repo-check --sandbox workspace-write --cd ${shQuote(profile.workdir)} --output-last-message "$AIWB_OUTPUT" resume "$AIWB_SESSION" "$AIWB_PROMPT" >"$AIWB_LOG" 2>&1
else
  ${shQuote(command)} exec --skip-git-repo-check --sandbox workspace-write --cd ${shQuote(profile.workdir)} --output-last-message "$AIWB_OUTPUT" "$AIWB_PROMPT" >"$AIWB_LOG" 2>&1
fi
AIWB_STATUS=$?
set -e

if [ "$AIWB_STATUS" -ne 0 ]; then
  cat "$AIWB_LOG"
  rm -f "$AIWB_OUTPUT" "$AIWB_LOG"
  exit "$AIWB_STATUS"
fi

printf '__AIWB_RESPONSE_START__\\n'
cat "$AIWB_OUTPUT"
printf '\\n__AIWB_RESPONSE_END__\\n'

AIWB_NEXT_SESSION=$(grep -Eo 'session id: [0-9a-fA-F-]{36}' "$AIWB_LOG" | tail -n 1 | awk '{print $3}' || true)
if [ -z "$AIWB_NEXT_SESSION" ]; then
  AIWB_LATEST=$(find "$HOME/.codex/sessions" -type f -name '*.jsonl' -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2-)
  AIWB_NEXT_SESSION=$(basename "$AIWB_LATEST" 2>/dev/null | grep -Eo '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' | tail -n 1 || true)
fi
if printf '%s' "$AIWB_NEXT_SESSION" | grep -Eq '^[0-9a-fA-F-]{36}$'; then
  printf '%s\\n' "$AIWB_NEXT_SESSION" > ${shQuote(sessionFile)}
  printf '\\n__AIWB_SESSION__%s\\n' "$AIWB_NEXT_SESSION"
fi

rm -f "$AIWB_OUTPUT" "$AIWB_LOG"
`);
}

function buildWindowsCodexExecCommand(profile, agent, prompt) {
  const encodedPrompt = toBase64Utf8(formatAgentPrompt(prompt));
  const command = agentCommand(profile, agent);
  const stateDir = joinWindowsPath(profile.workdir, ".ai-workbench");
  const sessionFile = joinWindowsPath(stateDir, `${sanitizeId(sessionName(profile, agent.id))}.session`);

  return powershellCommand(`
$AIWB_WORKDIR = ${psQuote(profile.workdir)}
$AIWB_STATE_DIR = ${psQuote(stateDir)}
$AIWB_SESSION_FILE = ${psQuote(sessionFile)}
New-Item -ItemType Directory -Force -Path $AIWB_WORKDIR | Out-Null
New-Item -ItemType Directory -Force -Path $AIWB_STATE_DIR | Out-Null
Set-Location -LiteralPath $AIWB_WORKDIR

$AIWB_PROMPT = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(${psQuote(encodedPrompt)}))
$AIWB_OUTPUT = Join-Path $env:TEMP ("aiwb-codex-output-" + [guid]::NewGuid().ToString() + ".txt")
$AIWB_LOG = Join-Path $env:TEMP ("aiwb-codex-log-" + [guid]::NewGuid().ToString() + ".log")
$AIWB_SESSION = ""
if (Test-Path -LiteralPath $AIWB_SESSION_FILE) {
  $AIWB_SESSION = (Get-Content -LiteralPath $AIWB_SESSION_FILE -Raw -ErrorAction SilentlyContinue).Trim()
}

$AIWB_ARGS = @("exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--cd", $AIWB_WORKDIR, "--output-last-message", $AIWB_OUTPUT)
if ($AIWB_SESSION -match "^[0-9a-fA-F-]{36}$") {
  $AIWB_ARGS += @("resume", $AIWB_SESSION, $AIWB_PROMPT)
} else {
  $AIWB_ARGS += @($AIWB_PROMPT)
}

& ${psQuote(command)} @AIWB_ARGS *> $AIWB_LOG
$AIWB_STATUS = $LASTEXITCODE
if ($null -eq $AIWB_STATUS) { $AIWB_STATUS = 0 }
if ($AIWB_STATUS -ne 0) {
  if (Test-Path -LiteralPath $AIWB_LOG) { Get-Content -LiteralPath $AIWB_LOG -Raw }
  Remove-Item -LiteralPath $AIWB_OUTPUT, $AIWB_LOG -Force -ErrorAction SilentlyContinue
  exit $AIWB_STATUS
}

Write-Output "__AIWB_RESPONSE_START__"
if (Test-Path -LiteralPath $AIWB_OUTPUT) {
  Get-Content -LiteralPath $AIWB_OUTPUT -Raw
}
Write-Output "__AIWB_RESPONSE_END__"

$AIWB_NEXT_SESSION = ""
if (Test-Path -LiteralPath $AIWB_LOG) {
  $AIWB_LOG_TEXT = Get-Content -LiteralPath $AIWB_LOG -Raw
  $AIWB_MATCHES = [regex]::Matches($AIWB_LOG_TEXT, "session id: ([0-9a-fA-F-]{36})")
  if ($AIWB_MATCHES.Count -gt 0) {
    $AIWB_NEXT_SESSION = $AIWB_MATCHES[$AIWB_MATCHES.Count - 1].Groups[1].Value
  }
}
if (-not $AIWB_NEXT_SESSION) {
  $AIWB_SESSIONS_DIR = Join-Path $HOME ".codex\\sessions"
  if (Test-Path -LiteralPath $AIWB_SESSIONS_DIR) {
    $AIWB_LATEST = Get-ChildItem -LiteralPath $AIWB_SESSIONS_DIR -Recurse -Filter "*.jsonl" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($AIWB_LATEST -and $AIWB_LATEST.Name -match "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") {
      $AIWB_NEXT_SESSION = $Matches[0]
    }
  }
}
if ($AIWB_NEXT_SESSION -match "^[0-9a-fA-F-]{36}$") {
  Set-Content -LiteralPath $AIWB_SESSION_FILE -Value $AIWB_NEXT_SESSION
  Write-Output ("__AIWB_SESSION__" + $AIWB_NEXT_SESSION)
}

Remove-Item -LiteralPath $AIWB_OUTPUT, $AIWB_LOG -Force -ErrorAction SilentlyContinue
`);
}

function buildAgentSendCommand(profile, agent, prompt) {
  if (agent.id === "codex") return buildCodexExecCommand(profile, agent, prompt);
  if (isWindowsProfile(profile)) return buildWindowsUnsupportedAgentCommand(agent);

  const targetSession = sessionName(profile, agent.id);
  const encodedPrompt = toBase64Utf8(formatAgentPrompt(prompt));
  const command = agentCommand(profile, agent);
  const starterPath = `${String(profile.workdir || ".").replace(/\/+$/, "")}/.ai-workbench/start-${targetSession}.sh`;
  const starterScript = `#!/usr/bin/env bash
cd ${shQuote(profile.workdir)}
printf 'AI Workbench: 正在启动 ${agent.shortName}...\\n'
${command}
code=$?
printf '\\nAI Workbench: ${agent.shortName} 已退出，退出码 %s。\\n' "$code"
printf '请在服务器上单独运行 ${commandName(command) || agent.shortName} 查看启动原因。\\n'
exec bash -l
`;

  return remoteBashCommand(profile, `
set -e
mkdir -p ${shQuote(profile.workdir)}
mkdir -p ${shQuote(dirnameRemote(starterPath))}
cat > ${shQuote(starterPath)} <<'AIWB_STARTER'
${starterScript}
AIWB_STARTER
chmod 700 ${shQuote(starterPath)}

if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  CURRENT_COMMAND=$(tmux display-message -p -t ${shQuote(targetSession)} '#{pane_current_command}' 2>/dev/null || true)
  AIWB_EXISTING=$(tmux capture-pane -t ${shQuote(targetSession)} -p -S -80 2>/dev/null || true)
  if printf '%s' "$CURRENT_COMMAND" | grep -Eiq '^(bash|zsh|sh|fish)$' &&
     ! printf '%s' "$AIWB_EXISTING" | grep -Fq 'OpenAI Codex'; then
    tmux kill-session -t ${shQuote(targetSession)}
  fi
fi

if ! tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux new-session -d -s ${shQuote(targetSession)} -c ${shQuote(profile.workdir)} ${shQuote(starterPath)}
  sleep 1
fi

CURRENT_COMMAND=$(tmux display-message -p -t ${shQuote(targetSession)} '#{pane_current_command}' 2>/dev/null || true)
AIWB_PANE=$(tmux capture-pane -t ${shQuote(targetSession)} -p -S -120 2>/dev/null || true)
if printf '%s' "$CURRENT_COMMAND" | grep -Eiq '^(bash|zsh|sh|fish)$' &&
   ! printf '%s' "$AIWB_PANE" | grep -Fq 'OpenAI Codex'; then
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -220
  exit 46
fi

${agent.id === "codex" ? `
AIWB_READY=0
for AIWB_READY_TRY in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  AIWB_PANE=$(tmux capture-pane -t ${shQuote(targetSession)} -p -S -120 2>/dev/null || true)
  if printf '%s' "$AIWB_PANE" | grep -Fq 'Sign in with ChatGPT' &&
     printf '%s' "$AIWB_PANE" | grep -Fq 'Sign in with Device Code'; then
    tmux capture-pane -t ${shQuote(targetSession)} -p -S -220
    exit 48
  fi
  if printf '%s' "$AIWB_PANE" | grep -Fq 'Introducing GPT-5.5' &&
     printf '%s' "$AIWB_PANE" | grep -Fq 'Use existing model'; then
    tmux capture-pane -t ${shQuote(targetSession)} -p -S -220
    exit 47
  fi
  if printf '%s' "$AIWB_PANE" | grep -Fq 'OpenAI Codex'; then
    AIWB_READY=1
    break
  fi
  sleep 0.5
done

if [ "$AIWB_READY" != "1" ]; then
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -220
  exit 49
fi
` : ""}

AIWB_PANE=$(tmux capture-pane -t ${shQuote(targetSession)} -p -S -120 2>/dev/null || true)
if printf '%s' "$AIWB_PANE" | grep -Fq 'Sign in with ChatGPT' &&
   printf '%s' "$AIWB_PANE" | grep -Fq 'Sign in with Device Code'; then
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -220
  exit 48
fi

AIWB_PANE=$(tmux capture-pane -t ${shQuote(targetSession)} -p -S -120 2>/dev/null || true)
if printf '%s' "$AIWB_PANE" | grep -Fq 'Introducing GPT-5.5' &&
   printf '%s' "$AIWB_PANE" | grep -Fq 'Use existing model'; then
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -220
  exit 47
fi

AIWB_PROMPT=$(printf '%s' ${shQuote(encodedPrompt)} | base64 -d)
tmux set-buffer -b aiwb-prompt "$AIWB_PROMPT"
tmux paste-buffer -t ${shQuote(targetSession)} -b aiwb-prompt
sleep 0.6
tmux send-keys -t ${shQuote(targetSession)} C-m
sleep 1.4
tmux capture-pane -t ${shQuote(targetSession)} -p -S -260
`);
}

function buildWindowsUnsupportedAgentCommand(agent) {
  return powershellCommand(`
Write-Output "${agent.shortName} 在 Windows PowerShell 模式暂时不能使用持续会话。"
Write-Output "如果要在 Windows 服务器上使用 ${agent.shortName}，请选择 Windows + WSL 模式，或把工具安装到 WSL/Linux 环境。"
exit 64
`);
}

function buildCodexLoginDeviceCommand(profile, agent) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("Windows PowerShell 模式没有可操作的 Codex TUI。请先在 Windows 服务器上运行 codex login 完成登录，然后回到 AI Workbench 继续发送任务。");

  const targetSession = sessionName(profile, agent.id);

  return remoteBashCommand(profile, `
if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux send-keys -t ${shQuote(targetSession)} 2 C-m
  sleep 5
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -180
else
  printf 'tmux session not running: %s\\n' ${shQuote(targetSession)}
fi
`);
}

function buildModelChoiceCommand(profile, agent, choice) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("Windows PowerShell 模式使用 codex exec，不需要操作 Codex TUI 模型选择。请重新发送任务。");

  const targetSession = sessionName(profile, agent.id);
  const key = choice === "new" ? "1" : "2";

  return remoteBashCommand(profile, `
if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux send-keys -t ${shQuote(targetSession)} ${shQuote(key)} C-m
  sleep 1.2
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -180
else
  printf 'tmux session not running: %s\\n' ${shQuote(targetSession)}
fi
`);
}

function buildCaptureCommand(profile, agent) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("Windows PowerShell 模式使用一次性任务，没有可刷新的 tmux 会话。");

  const targetSession = sessionName(profile, agent.id);
  return remoteBashCommand(profile, `
if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -260
else
  printf 'tmux session not running: %s\\n' ${shQuote(targetSession)}
fi
`);
}

function buildInterruptCommand(profile, agent) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("Windows PowerShell 模式当前任务由 codex exec 一次性执行，暂不支持 tmux 中断。");

  const targetSession = sessionName(profile, agent.id);
  return remoteBashCommand(profile, `
if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux send-keys -t ${shQuote(targetSession)} C-c
  sleep 0.4
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -160
else
  printf 'tmux session not running: %s\\n' ${shQuote(targetSession)}
fi
`);
}

function buildKillCommand(profile, agent) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("Windows PowerShell 模式没有需要关闭的 tmux 会话。");

  const targetSession = sessionName(profile, agent.id);
  return remoteBashCommand(profile, `
if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux kill-session -t ${shQuote(targetSession)}
  printf 'killed tmux session: %s\\n' ${shQuote(targetSession)}
else
  printf 'tmux session not running: %s\\n' ${shQuote(targetSession)}
fi
`);
}

function buildWindowsNoTmuxCommand(message) {
  return powershellCommand(`
Write-Output ${psQuote(message)}
`);
}

function shortError(error) {
  return error?.message || String(error || "未知错误");
}

function isCodexLoginPrompt(output) {
  const text = String(output || "");
  return /Sign in with ChatGPT/i.test(text) && /Sign in with Device Code/i.test(text);
}

function isCodexModelChoicePrompt(output) {
  const text = String(output || "");
  return /Introducing GPT-5\.5/i.test(text) && /Try new model/i.test(text) && /Use existing model/i.test(text);
}

function extractCodexLoginInstructions(output) {
  const text = stripTerminalControl(output);
  const url = text.match(/https:\/\/auth\.openai\.com\/codex\/device/i)?.[0] || "";
  const code = text.match(/\b[A-Z0-9]{4}-[A-Z0-9]{5}\b/)?.[0] || "";

  if (!url && !code) return trimVisibleText(text);

  return trimVisibleText(
    [
      url ? `登录链接：${url}` : "",
      code ? `验证码：${code}` : "",
      "完成浏览器登录后，回到 AI Workbench 重新发送任务。",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function detectAgentIssue(output, agent) {
  const text = String(output || "");
  if (/401 Unauthorized/i.test(text)) {
    return `${agent.shortName} 登录已过期。请先生成设备码完成登录，然后重新发送任务。`;
  }
  if (/tmux session not running/i.test(text)) {
    return `${agent.shortName} 会话没有保持运行，这次任务没有完成。请先点“检查服务器”，再重新发送。`;
  }
  if (/Windows PowerShell 模式暂时不能使用持续会话/i.test(text)) {
    return `${agent.shortName} 在 Windows PowerShell 模式暂时不能使用持续会话。请改选 Windows + WSL，或把 ${agent.shortName} 安装到 WSL/Linux 环境。`;
  }
  if (text.includes(`AI Workbench: ${agent.shortName} 已退出`)) {
    return `${agent.shortName} 没有启动成功。原始原因已放在“详情”里，通常是服务器上的命令路径、登录状态或工具配置需要处理。`;
  }
  return "";
}

function stripTerminalControl(text) {
  return String(text || "")
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "");
}

function trimVisibleText(text) {
  return String(text || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMarkedFinalOutput(text) {
  const pattern = new RegExp(`${finalAnswerStart}\\s*([\\s\\S]*?)\\s*${finalAnswerEnd}`, "gi");
  let match;
  let answer = "";

  while ((match = pattern.exec(text))) {
    const candidate = trimVisibleText(match[1]);
    if (candidate && candidate !== "和" && !candidate.includes("这里写最终回答")) answer = candidate;
  }

  if (answer) return answer;

  const lastStart = text.lastIndexOf(finalAnswerStart);
  if (lastStart < 0) return "";

  const openAnswer = trimVisibleText(text.slice(lastStart + finalAnswerStart.length).replace(finalAnswerEnd, ""));
  return openAnswer && !openAnswer.includes("这里写最终回答") ? openAnswer : "";
}

function extractWorkbenchResponse(text) {
  const match = String(text || "").match(/__AIWB_RESPONSE_START__\n([\s\S]*?)\n__AIWB_RESPONSE_END__/);
  return match ? trimVisibleText(match[1]) : "";
}

function looksLikeTerminalNoise(line, prompt = "") {
  const text = String(line || "").trim();
  const userPrompt = String(prompt || "").trim();

  if (!text) return false;
  if (userPrompt && text === userPrompt) return true;
  if (text === finalAnswerStart || text === finalAnswerEnd || text === "这里写最终回答") return true;
  if (text.includes(finalAnswerStart) || text.includes(finalAnswerEnd)) return true;
  if (/^明白[。，.].*(最终|标记|AIWB_FINAL)/.test(text)) return true;
  if (/^(请只在任务完成后|标记中不要放命令行日志)/.test(text)) return true;
  if (/^[╭╮╰╯│┃─━┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬\s]+$/.test(text)) return true;
  if (/^(›|▌|>_|\$|#)\s*/.test(text)) return true;
  if (/^(Introducing GPT-5\.5|Learn more:|Choose how|Use ↑|1\. Try new model|2\. Use existing model)/i.test(text)) {
    return true;
  }
  if (/^(Codex could not find bubblewrap|package manager\.|https:\/\/developers\.openai\.com\/codex\/concepts\/sandboxing|will use the bundled bubblewrap)/i.test(text)) {
    return true;
  }
  if (/(OpenAI Codex|model:\s+gpt-|directory:\s+\/|\/model to change)/i.test(text)) return true;
  if (/^(Tip:|Use \/fast|› Use \/skills|gpt-[\w.-]+\s+.*·\s+)/i.test(text)) return true;
  if (/^•\s+Booting MCP server/i.test(text)) return true;
  if (/^(AI Workbench:|tmux session not running|Missing required field:)/i.test(text)) return true;
  if (/^(thinking|working|running|reading|edited|applied|searched|opened|ran|tool|shell)\b/i.test(text)) return true;
  if (/^(ctrl|shift|enter|esc|press enter)\b/i.test(text)) return true;
  if (/^[\w.-]+@[\w.-]+:[~/\w.-]*[$#]/.test(text)) return true;
  if (/^\d+% context left/i.test(text)) return true;

  return false;
}

function fallbackFinalOutput(text, prompt = "") {
  const lines = stripTerminalControl(text)
    .replace(/^AI Workbench: 正在启动 .*\n?/gm, "")
    .replace(/Introducing GPT-5\.5[\s\S]*?press enter to confirm\s*/gi, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));

  const filtered = [];
  for (const line of lines) {
    if (looksLikeTerminalNoise(line, prompt)) continue;
    filtered.push(line);
  }

  let startIndex = 0;
  const userPrompt = String(prompt || "").trim();
  if (userPrompt) {
    for (let index = filtered.length - 1; index >= 0; index -= 1) {
      if (filtered[index].includes(userPrompt)) {
        startIndex = index + 1;
        break;
      }
    }
  }

  return trimVisibleText(filtered.slice(startIndex).slice(-80).join("\n"));
}

function extractAgentFinalOutput(output, prompt = "") {
  const normalized = stripTerminalControl(output);
  const workbenchResponse = extractWorkbenchResponse(normalized);
  const answerSource = workbenchResponse || normalized;
  const marked = extractMarkedFinalOutput(answerSource);
  if (marked) return { text: marked, final: true };
  if (workbenchResponse) return { text: workbenchResponse, final: true };

  return {
    text: fallbackFinalOutput(answerSource, prompt),
    final: false,
  };
}

function cleanAgentOutput(output, prompt = "") {
  return extractAgentFinalOutput(output, prompt).text;
}

export function App() {
  const defaultServer = useMemo(() => createServerSession({ id: "default-server", name: "默认服务器", profile: defaultProfile }), []);
  const [servers, setServers] = useState([defaultServer]);
  const [activeServerId, setActiveServerId] = useState(defaultServer.id);
  const [draftProfile, setDraftProfile] = useState(defaultProfile);
  const [editingServerId, setEditingServerId] = useState(defaultServer.id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState("codex");
  const [composer, setComposer] = useState("");
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceError, setVoiceError] = useState("");
  const [busy, setBusy] = useState(false);

  const activeAgent = useMemo(
    () => agents.find((item) => item.id === activeAgentId) ?? agents[0],
    [activeAgentId],
  );
  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || servers[0] || defaultServer,
    [activeServerId, defaultServer, servers],
  );
  const profile = activeServer.profile;
  const connection = activeServer.connection;
  const diagnostics = activeServer.diagnostics;
  const discovery = activeServer.discovery;
  const rawOutput = activeServer.rawOutput;
  const messages = activeServer.messages;
  const isProfileReady = useMemo(() => profileReady(profile), [profile]);
  const hasPendingAction = messages.some((message) => message.status === "choice" || message.status === "login");
  const profileRef = useRef(profile);
  const activeServerIdRef = useRef(activeServerId);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    activeServerIdRef.current = activeServerId;
  }, [activeServerId]);

  function updateServer(serverId, updater) {
    setServers((items) =>
      items.map((server) => {
        if (server.id !== serverId) return server;
        const patch = typeof updater === "function" ? updater(server) : updater;
        return { ...server, ...patch };
      }),
    );
  }

  function updateActiveServer(updater) {
    updateServer(activeServerIdRef.current, updater);
  }

  function setConnection(nextConnection) {
    updateActiveServer({ connection: nextConnection });
  }

  function setDiagnostics(nextDiagnostics) {
    updateActiveServer({ diagnostics: nextDiagnostics });
  }

  function setDiscovery(nextDiscovery) {
    updateActiveServer({ discovery: nextDiscovery });
  }

  function setRawOutput(nextRawOutput) {
    updateActiveServer({ rawOutput: nextRawOutput });
  }

  function setMessages(updater) {
    updateActiveServer((server) => ({
      messages: typeof updater === "function" ? updater(server.messages || []) : updater,
    }));
  }

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const result = await SSHWorkbench.loadProfile();
        if (cancelled) return;

        const loaded = normalizeWorkspaceStore(result?.profile);
        const active = loaded.servers.find((server) => server.id === loaded.activeServerId) || loaded.servers[0];
        setServers(loaded.servers);
        setActiveServerId(active.id);
        activeServerIdRef.current = active.id;
        setEditingServerId(active.id);
        setDraftProfile(active.profile);
      } catch {
        if (cancelled) return;
        const fallback = createServerSession({ id: "default-server", name: "默认服务器", profile: defaultProfile });
        setServers([fallback]);
        setActiveServerId(fallback.id);
        activeServerIdRef.current = fallback.id;
        setEditingServerId(fallback.id);
        setDraftProfile(defaultProfile);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const runRemoteCommand = useCallback(async (command, maxResponseSize = 1_048_576) => {
    const current = normalizeProfile(profileRef.current);
    const missing = profileIssue(current);
    if (missing) {
      throw new Error(missing);
    }

    const result = await SSHWorkbench.runCommand({
      host: current.host,
      port: current.port,
      username: current.username,
      password: current.password,
      connectTimeoutSeconds: current.connectTimeoutSeconds,
      command,
      maxResponseSize,
    });

    return result?.stdout ?? "";
  }, []);

  const saveWorkspace = useCallback(async (nextServers, nextActiveServerId) => {
    await SSHWorkbench.saveProfile({
      profile: serializeWorkspaceStore(nextServers, nextActiveServerId),
    });
  }, []);

  const saveCurrentProfile = useCallback(async (nextProfile = draftProfile) => {
    const normalized = normalizeProfile(nextProfile);
    const name = String(normalized.name || "").trim();
    const existing = servers.find((server) => server.id === editingServerId);
    const nextServerId = existing ? existing.id : createServerId();
    const nextServer = createServerSession(
      {
        ...(existing || {}),
        id: nextServerId,
        name: name || existing?.name || "",
        profile: {
          ...normalized,
          name: name || existing?.name || "",
        },
        connection: initialConnectionForProfile(normalized),
        diagnostics: existing?.diagnostics || {},
        discovery: existing?.discovery || null,
        rawOutput: existing?.rawOutput || "原始输出会在测试连接或发送任务后显示。",
        messages: existing?.messages || [],
      },
      servers.length,
    );
    const nextServers = existing
      ? servers.map((server) => (server.id === existing.id ? nextServer : server))
      : [...servers, nextServer];

    setServers(nextServers);
    setActiveServerId(nextServer.id);
    activeServerIdRef.current = nextServer.id;
    setEditingServerId(nextServer.id);
    setDraftProfile(normalized);
    profileRef.current = normalized;
    await saveWorkspace(nextServers, nextServer.id);
    return normalized;
  }, [draftProfile, editingServerId, saveWorkspace, servers]);

  function showProfileIssue(nextProfile, openSettings = true) {
    const issue = profileIssue(nextProfile);
    if (!issue) return false;

    setConnection({ state: "error", label: "待配置", detail: issue });
    setRawOpen(false);
    setRawOutput(issue);
    if (openSettings) setSettingsOpen(true);
    return true;
  }

  async function selectServer(serverId) {
    if (busy || serverId === activeServerIdRef.current) return;
    const nextServer = servers.find((server) => server.id === serverId);
    if (!nextServer) return;

    setActiveServerId(serverId);
    activeServerIdRef.current = serverId;
    profileRef.current = nextServer.profile;
    setEditingServerId(serverId);
    setDraftProfile(nextServer.profile);
    setRawOpen(false);
    await saveWorkspace(servers, serverId);
  }

  function openServerSettings(serverId = activeServerIdRef.current) {
    const target = servers.find((server) => server.id === serverId) || activeServer;
    setEditingServerId(target.id);
    setDraftProfile(target.profile);
    setSettingsOpen(true);
  }

  function openNewServerSettings() {
    const nextProfile = {
      ...defaultProfile,
      host: "",
      username: "",
      password: "",
      name: `服务器 ${servers.length + 1}`,
    };
    setEditingServerId("");
    setDraftProfile(nextProfile);
    setSettingsOpen(true);
  }

  async function duplicateServer(serverId = activeServerIdRef.current) {
    if (busy) return;
    const sourceIndex = servers.findIndex((server) => server.id === serverId);
    const source = sourceIndex >= 0 ? servers[sourceIndex] : activeServer;
    if (!source) return;

    const sourceName = serverDisplayName(source, sourceIndex >= 0 ? sourceIndex : 0);
    const duplicateName = `${sourceName} 副本`;
    const duplicateProfile = normalizeProfile({
      ...source.profile,
      name: duplicateName,
    });
    const duplicate = createServerSession(
      {
        name: duplicateName,
        profile: duplicateProfile,
      },
      servers.length,
    );
    const nextServers = [...servers, duplicate];

    setServers(nextServers);
    setActiveServerId(duplicate.id);
    activeServerIdRef.current = duplicate.id;
    setEditingServerId(duplicate.id);
    setDraftProfile(duplicate.profile);
    profileRef.current = duplicate.profile;
    setRawOpen(false);
    setSettingsOpen(true);
    await saveWorkspace(nextServers, duplicate.id);
  }

  async function addDiscoveredWorkdir(path) {
    const workdir = String(path || "").trim();
    if (!workdir || busy) return;

    const source = servers.find((server) => server.id === activeServerIdRef.current) || activeServer;
    const existing = servers.find((server) => {
      const nextProfile = normalizeProfile(server.profile);
      const sourceProfile = normalizeProfile(source.profile);
      return (
        nextProfile.host === sourceProfile.host &&
        nextProfile.port === sourceProfile.port &&
        nextProfile.username === sourceProfile.username &&
        normalizeServerPlatform(nextProfile.platform) === normalizeServerPlatform(sourceProfile.platform) &&
        String(nextProfile.workdir || "") === workdir
      );
    });

    if (existing) {
      await selectServer(existing.id);
      return;
    }

    const name = workdirDisplayName(workdir);
    const profileForWorkdir = normalizeProfile({
      ...source.profile,
      name,
      workdir,
    });
    const nextServer = createServerSession(
      {
        name,
        profile: profileForWorkdir,
        connection: source.connection,
        diagnostics: {
          ...(source.diagnostics || {}),
          pwd: workdir,
        },
        discovery: source.discovery,
      },
      servers.length,
    );
    const nextServers = [...servers, nextServer];

    setServers(nextServers);
    setActiveServerId(nextServer.id);
    activeServerIdRef.current = nextServer.id;
    setEditingServerId(nextServer.id);
    setDraftProfile(nextServer.profile);
    profileRef.current = nextServer.profile;
    setRawOpen(false);
    await saveWorkspace(nextServers, nextServer.id);
  }

  async function testConnection() {
    const nextProfile = await saveCurrentProfile();
    if (showProfileIssue(nextProfile)) return;

    setBusy(true);
    setRawOpen(false);
    setConnection({ state: "testing", label: "测试中", detail: `${nextProfile.username}@${nextProfile.host}` });
    setDiscovery({ state: "scanning", directories: [], tools: [], activeSessions: [], recentSessions: [], history: {} });

    try {
      const stdout = await runRemoteCommand(buildHealthCommand(nextProfile), 512_000);
      const parsed = parseHealth(stdout);
      setDiagnostics(parsed);
      setConnection({
        state: "testing",
        label: "扫描中",
        detail: parsed.pwd || nextProfile.workdir,
      });

      let scanOutput = "";
      let scan = null;
      try {
        scanOutput = await runRemoteCommand(buildDiscoveryCommand(nextProfile), 1_048_576);
        scan = parseDiscovery(scanOutput);
      } catch (scanError) {
        scan = {
          state: "error",
          message: shortError(scanError),
          directories: [],
          tools: [],
          activeSessions: [],
          recentSessions: [],
          history: { codex: 0, claude: 0 },
        };
      }

      setDiscovery(scan);
      setRawOutput([stdout.trim(), scanOutput.trim()].filter(Boolean).join("\n\n") || "连接成功。");
      setConnection({
        state: "connected",
        label: "已连接",
        detail: `${parsed.user || nextProfile.username}@${parsed.host || nextProfile.host}`,
      });
    } catch (error) {
      const message = shortError(error);
      setRawOpen(true);
      setRawOutput(message);
      setConnection({ state: "error", label: "连接失败", detail: message });
    } finally {
      setBusy(false);
    }
  }

  async function runAgentPrompt({ currentProfile, agent, text, assistantMessageId }) {
    const applyAgentOutput = (output, final = false) => {
      const raw = String(output || "").trim();
      setRawOutput(raw);

      if (isCodexLoginPrompt(raw)) {
        setRawOpen(false);
        updateAssistantMessage(assistantMessageId, {
          title: `${agent.shortName} 需要登录`,
          body: "远端 Codex 登录已过期。生成设备码后，在浏览器完成一次登录即可继续使用。",
          output: "",
          status: "login",
          loginAction: { prompt: text, agentId: agent.id },
          modelChoice: undefined,
        });
        setConnection({ state: "idle", label: "需要登录", detail: agent.shortName });
        return false;
      }

      if (agent.id === "codex" && /401 Unauthorized|Missing bearer|authentication/i.test(raw)) {
        setRawOpen(false);
        updateAssistantMessage(assistantMessageId, {
          title: `${agent.shortName} 需要登录`,
          body: "远端 Codex 登录已过期。生成设备码后，在浏览器完成一次登录即可继续使用。",
          output: "",
          status: "login",
          loginAction: { prompt: text, agentId: agent.id },
          modelChoice: undefined,
        });
        setConnection({ state: "idle", label: "需要登录", detail: agent.shortName });
        return false;
      }

      if (isCodexModelChoicePrompt(raw)) {
        setRawOpen(false);
        updateAssistantMessage(assistantMessageId, {
          title: `${agent.shortName} 需要选择模型`,
          body: "Codex CLI 检测到 GPT-5.5 可用。选择后会继续发送刚才的任务。",
          output: "",
          status: "choice",
          loginAction: undefined,
          modelChoice: { prompt: text, agentId: agent.id },
        });
        setConnection({ state: "idle", label: "等待选择", detail: agent.shortName });
        return false;
      }

      const issue = detectAgentIssue(raw, agent);
      if (issue) {
        setRawOpen(true);
        updateAssistantMessage(assistantMessageId, {
          title: `${agent.shortName} 没有启动成功`,
          body: issue,
          output: "",
          status: "error",
          loginAction: undefined,
          modelChoice: undefined,
        });
        setConnection({ state: "error", label: "启动失败", detail: agent.shortName });
        return false;
      }

      const extracted = extractAgentFinalOutput(raw, text);
      const visibleOutput = extracted.final || final ? extracted.text : "";
      const done = extracted.final || (final && Boolean(visibleOutput));
      updateAssistantMessage(assistantMessageId, {
        title: done ? `${agent.shortName} 回复` : `等待 ${agent.shortName} 回复`,
        body: visibleOutput
          ? ""
          : final
            ? `还没有拿到最终回复，稍后点“刷新状态”。`
            : `正在等待 ${agent.shortName} 回复。`,
        output: visibleOutput,
        status: done ? "done" : "running",
        loginAction: undefined,
        modelChoice: undefined,
      });
      return true;
    };

    const firstOutput = await runRemoteCommand(buildAgentSendCommand(currentProfile, agent, text), 2_097_152);
    if (!applyAgentOutput(firstOutput, agent.id === "codex")) return false;

    if (agent.id === "codex") {
      setConnection({
        state: "connected",
        label: "会话已完成",
        detail: sessionName(currentProfile, agent.id),
      });
      return true;
    }

    for (let index = 0; index < 5; index += 1) {
      await sleep(1800);
      const output = await runRemoteCommand(buildCaptureCommand(currentProfile, agent), 2_097_152);
      if (!applyAgentOutput(output, index === 4)) return false;
    }

    setConnection({
      state: "connected",
      label: "会话运行中",
      detail: sessionName(currentProfile, agent.id),
    });
    return true;
  }

  async function sendTask() {
    const text = composer.trim();
    if (!text || busy || hasPendingAction) return;

    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    const agent = activeAgent;
    const assistantMessageId = `agent-${Date.now()}`;
    setComposer("");
    setRawOpen(false);
    setBusy(true);
    setMessages((items) => [
      ...items,
      createMessage({ role: "user", body: text }),
      createMessage({
        id: assistantMessageId,
        role: "assistant",
        agentId: agent.id,
        title: `已发送到 ${agent.shortName}`,
        body: `正在等待 ${agent.shortName} 回复。`,
        status: "running",
      }),
    ]);

    try {
      await runAgentPrompt({ currentProfile, agent, text, assistantMessageId });
    } catch (error) {
      const message = shortError(error);
      setRawOpen(true);
      setRawOutput(message);
      updateAssistantMessage(assistantMessageId, {
        title: "远端执行失败",
        body: message,
        status: "error",
        loginAction: undefined,
        modelChoice: undefined,
      });
      setConnection({ state: "error", label: "执行失败", detail: message });
    } finally {
      setBusy(false);
    }
  }

  async function toggleVoiceInput() {
    if (voiceState === "listening") {
      setVoiceState("stopping");
      try {
        await VoiceWorkbench.stop();
      } catch {
        setVoiceState("idle");
      }
      return;
    }

    if (voiceState !== "idle" || busy || hasPendingAction || !isProfileReady) return;

    setVoiceError("");
    setVoiceState("listening");
    try {
      const result = await VoiceWorkbench.start({ locale: "zh-CN" });
      const text = String(result?.text || "").trim();
      if (text) {
        setComposer((current) => {
          const existing = current.trim();
          return existing ? `${existing}\n${text}` : text;
        });
      } else {
        setVoiceError("没有识别到内容。");
      }
    } catch (error) {
      setVoiceError(shortError(error));
    } finally {
      setVoiceState("idle");
    }
  }

  async function chooseCodexModel(message, choice) {
    if (busy || !message?.modelChoice) return;

    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    const agent = agents.find((item) => item.id === message.modelChoice.agentId) ?? activeAgent;
    const text = message.modelChoice.prompt;
    const choiceText = choice === "new" ? "试用 GPT-5.5" : "继续使用当前模型";

    setBusy(true);
    setRawOpen(false);
    updateAssistantMessage(message.id, {
      title: `已选择：${choiceText}`,
      body: "正在应用选择，并继续发送刚才的任务。",
      status: "running",
      modelChoice: undefined,
    });

    try {
      const choiceOutput = await runRemoteCommand(buildModelChoiceCommand(currentProfile, agent, choice), 1_048_576);
      setRawOutput(String(choiceOutput || "").trim());
      await runAgentPrompt({ currentProfile, agent, text, assistantMessageId: message.id });
    } catch (error) {
      const detail = shortError(error);
      setRawOpen(true);
      setRawOutput(detail);
      updateAssistantMessage(message.id, {
        title: "模型选择失败",
        body: detail,
        status: "error",
        modelChoice: undefined,
      });
      setConnection({ state: "error", label: "选择失败", detail });
    } finally {
      setBusy(false);
    }
  }

  async function startCodexDeviceLogin(message) {
    if (busy || !message?.loginAction) return;

    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    const agent = agents.find((item) => item.id === message.loginAction.agentId) ?? activeAgent;

    setBusy(true);
    setRawOpen(false);
    updateAssistantMessage(message.id, {
      title: "正在生成登录码",
      body: "请稍等，正在向远端 Codex 请求设备登录码。",
      status: "running",
      loginAction: undefined,
      modelChoice: undefined,
    });

    try {
      const output = await runRemoteCommand(buildCodexLoginDeviceCommand(currentProfile, agent), 1_048_576);
      setRawOutput(String(output || "").trim());
      updateAssistantMessage(message.id, {
        title: "完成 Codex 登录",
        body: "在浏览器打开链接并输入验证码。",
        output: extractCodexLoginInstructions(output),
        status: "done",
        loginAction: undefined,
        modelChoice: undefined,
      });
      setConnection({ state: "idle", label: "等待登录", detail: agent.shortName });
    } catch (error) {
      const detail = shortError(error);
      setRawOpen(true);
      setRawOutput(detail);
      updateAssistantMessage(message.id, {
        title: "生成登录码失败",
        body: detail,
        status: "error",
        loginAction: undefined,
        modelChoice: undefined,
      });
      setConnection({ state: "error", label: "登录失败", detail });
    } finally {
      setBusy(false);
    }
  }

  function updateAssistantMessage(id, patch) {
    setMessages((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function refreshOutput() {
    if (busy) return;
    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommand(buildCaptureCommand(currentProfile, activeAgent), 2_097_152);
      setRawOutput(output.trim());
      setMessages((items) => [
        ...items,
        createMessage({
          role: "assistant",
          agentId: activeAgent.id,
          title: `${activeAgent.shortName} 输出已刷新`,
          body: `已读取 ${activeAgent.shortName} 当前输出。`,
          output: cleanAgentOutput(output),
        }),
      ]);
    } catch (error) {
      setRawOutput(shortError(error));
    } finally {
      setBusy(false);
    }
  }

  async function interruptAgent() {
    if (busy) return;
    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommand(buildInterruptCommand(currentProfile, activeAgent), 1_048_576);
      setRawOutput(output.trim());
      setConnection({
        state: "connected",
        label: "已发送中断",
        detail: sessionName(currentProfile, activeAgent.id),
      });
    } catch (error) {
      setRawOutput(shortError(error));
    } finally {
      setBusy(false);
    }
  }

  async function killAgentSession() {
    if (busy) return;
    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommand(buildKillCommand(currentProfile, activeAgent), 512_000);
      setRawOutput(output.trim());
      setConnection({
        state: "idle",
        label: "会话已关闭",
        detail: sessionName(currentProfile, activeAgent.id),
      });
    } catch (error) {
      setRawOutput(shortError(error));
    } finally {
      setBusy(false);
    }
  }

  async function clearProfile() {
    const currentId = editingServerId || activeServerIdRef.current;
    const remaining = servers.filter((server) => server.id !== currentId);

    if (remaining.length) {
      const nextActive = remaining[0];
      setServers(remaining);
      setActiveServerId(nextActive.id);
      activeServerIdRef.current = nextActive.id;
      setEditingServerId(nextActive.id);
      setDraftProfile(nextActive.profile);
      profileRef.current = nextActive.profile;
      setSettingsOpen(false);
      setRawOpen(false);
      await saveWorkspace(remaining, nextActive.id);
      return;
    }

    const resetServer = createServerSession({ id: "default-server", name: "默认服务器", profile: defaultProfile });
    setServers([resetServer]);
    setActiveServerId(resetServer.id);
    activeServerIdRef.current = resetServer.id;
    setEditingServerId(resetServer.id);
    setDraftProfile(defaultProfile);
    profileRef.current = defaultProfile;
    setRawOpen(false);
    await saveWorkspace([resetServer], resetServer.id);
  }

  const bridge = desktopBridge();
  const platform = Capacitor.getPlatform();
  const desktopPreview =
    !bridge &&
    platform === "web" &&
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 1024px) and (hover: hover)").matches;

  const shellClassName = `app-shell ${bridge?.platform === "mac" || desktopPreview ? "mac-shell" : ""} ${
    sidebarCollapsed ? "sidebar-collapsed" : ""
  }`;
  const activeServerIndex = servers.findIndex((server) => server.id === activeServerId);
  const activeSessionName = serverSessionName(activeServer, activeServerIndex >= 0 ? activeServerIndex : 0);
  const shouldShowDiscovery =
    Boolean(discovery) && (messages.length === 0 || discovery?.state === "scanning" || discovery?.state === "error");

  return (
    <main className={shellClassName}>
      <TopBar
        sessionName={activeSessionName}
        showSessionName={sidebarCollapsed || platform === "ios" || !desktopPreview}
        onOpenNav={() => setMobileNavOpen(true)}
        onOpenSettings={() => openServerSettings()}
      />

      <div className="workspace">
        <aside className={`sidebar desktop-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <NavigationPanel
            servers={servers}
            activeServerId={activeServerId}
            profile={profile}
            connection={connection}
            diagnostics={diagnostics}
            discovery={discovery}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
            onSelectServer={selectServer}
            onAddServer={openNewServerSettings}
            onDuplicateServer={() => duplicateServer()}
            onOpenSettings={() => openServerSettings()}
            onTestConnection={testConnection}
            onRefreshOutput={refreshOutput}
            busy={busy}
          />
        </aside>

        <section className="conversation">
          <div className="conversation-scroll">
            {messages.length === 0 ? (
              <ConnectionSummary
                profile={profile}
                connection={connection}
                diagnostics={diagnostics}
                discovery={discovery}
                profileReady={isProfileReady}
                busy={busy}
                onOpenSettings={() => openServerSettings()}
                onTestConnection={testConnection}
              />
            ) : null}
            {shouldShowDiscovery ? (
              <DiscoveryPanel
                discovery={discovery}
                profile={profile}
                servers={servers}
                busy={busy}
                onRescan={testConnection}
                onAddWorkdir={addDiscoveredWorkdir}
              />
            ) : null}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                activeAgent={activeAgent}
                busy={busy}
                onModelChoice={chooseCodexModel}
                onCodexLogin={startCodexDeviceLogin}
              />
            ))}
          </div>

          <Composer
            activeAgent={activeAgent}
            activeAgentId={activeAgentId}
            composer={composer}
            busy={busy}
            pendingAction={hasPendingAction}
            profileReady={isProfileReady}
            voiceState={voiceState}
            voiceError={voiceError}
            setActiveAgentId={setActiveAgentId}
            setComposer={setComposer}
            onOpenSettings={() => openServerSettings()}
            onSend={sendTask}
            onVoice={toggleVoiceInput}
          />
        </section>
      </div>

      <RawOutput
        open={rawOpen}
        agent={activeAgent}
        profile={profile}
        connection={connection}
        rawOutput={rawOutput}
        busy={busy}
        onToggle={() => setRawOpen((value) => !value)}
        onRefresh={refreshOutput}
        onInterrupt={interruptAgent}
        onKill={killAgentSession}
      />

      {mobileNavOpen ? (
        <div className="mobile-drawer" role="dialog" aria-modal="true">
          <button
            className="drawer-backdrop"
            type="button"
            aria-label="关闭导航"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="sidebar drawer-panel">
            <div className="drawer-header">
              <strong>AI Workbench</strong>
              <button type="button" className="text-button" onClick={() => setMobileNavOpen(false)}>
                完成
              </button>
            </div>
            <NavigationPanel
              servers={servers}
              activeServerId={activeServerId}
              profile={profile}
              connection={connection}
              diagnostics={diagnostics}
              discovery={discovery}
              onSelectServer={async (serverId) => {
                await selectServer(serverId);
                setMobileNavOpen(false);
              }}
              onAddServer={() => {
                openNewServerSettings();
                setMobileNavOpen(false);
              }}
              onDuplicateServer={async () => {
                await duplicateServer();
                setMobileNavOpen(false);
              }}
              onOpenSettings={() => {
                openServerSettings();
                setMobileNavOpen(false);
              }}
              onTestConnection={testConnection}
              onRefreshOutput={refreshOutput}
              busy={busy}
            />
          </aside>
        </div>
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          draftProfile={draftProfile}
          busy={busy}
          canDelete={servers.length > 1}
          setDraftProfile={setDraftProfile}
          onClose={() => setSettingsOpen(false)}
          onDuplicate={() => duplicateServer(editingServerId || activeServerId)}
          onSave={async () => {
            const saved = await saveCurrentProfile();
            setConnection(
              profileReady(saved)
                ? { state: "idle", label: "未测试", detail: `${saved.username}@${saved.host}` }
                : { state: "idle", label: "待配置", detail: profileIssue(saved) },
            );
            setSettingsOpen(false);
          }}
          onTest={testConnection}
          onClear={clearProfile}
        />
      ) : null}
    </main>
  );
}

function TopBar({ sessionName: currentSessionName, showSessionName, onOpenNav, onOpenSettings }) {
  return (
    <header className="topbar">
      <button className="nav-trigger" type="button" aria-label="打开菜单" onClick={onOpenNav}>
        <span>≡</span>
      </button>
      <div className={`topbar-session ${showSessionName ? "visible" : ""}`} aria-hidden={!showSessionName}>
        <strong>{currentSessionName}</strong>
      </div>
      <div className="topbar-actions">
        <button type="button" className="topbar-logo-button" aria-label="服务器设置" title="服务器设置" onClick={onOpenSettings}>
          <WorkbenchLogo />
        </button>
      </div>
    </header>
  );
}

function NavigationPanel({
  servers = [],
  activeServerId,
  profile,
  connection,
  diagnostics,
  discovery,
  collapsed = false,
  onToggleCollapse,
  onSelectServer,
  onAddServer,
  onDuplicateServer,
  onOpenSettings,
  onTestConnection,
  onRefreshOutput,
  busy,
}) {
  const connected = connection.state === "connected" || Boolean(diagnostics.host);
  const connectLabel =
    connection.state === "testing" ? "连接中" : connected ? "已连接" : connection.state === "error" ? "重试" : "连接";

  function selectServerFromCard(event, serverId) {
    if (event.key && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectServer?.(serverId);
  }

  return (
    <>
      <div className="sidebar-toolbar">
        <SectionHeader title="服务器" />
        {onAddServer ? (
          <button
            className="sidebar-add"
            type="button"
            aria-label="添加服务器"
            title="添加服务器"
            onClick={onAddServer}
            disabled={busy}
          >
            +
          </button>
        ) : null}
        {onDuplicateServer ? (
          <button
            className="sidebar-duplicate"
            type="button"
            aria-label="复制当前服务器"
            title="复制当前服务器"
            onClick={onDuplicateServer}
            disabled={busy}
          >
            复制
          </button>
        ) : null}
        {onToggleCollapse ? (
          <button
            className="sidebar-collapse"
            type="button"
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            onClick={onToggleCollapse}
          >
            {collapsed ? "›" : "‹"}
          </button>
        ) : null}
      </div>
      <div className="server-list">
        {servers.map((server, index) => {
          const isActive = server.id === activeServerId;
          const serverConnection = isActive ? connection : server.connection;
          const serverDiagnostics = isActive ? diagnostics : server.diagnostics || {};
          const serverDiscovery = isActive ? discovery : server.discovery;
          const serverConnected = serverConnection?.state === "connected" || Boolean(serverDiagnostics.host);
          const serverConnectLabel = isActive
            ? connectLabel
            : serverConnection?.state === "error"
              ? "错误"
              : serverConnected
                ? "已连"
                : "打开";
          const serverStatus = serverConnection?.state || "idle";
          const workdirName = workdirDisplayName(server.profile?.workdir);
          const scanCount = serverDiscovery?.state === "done" ? serverDiscovery.directories?.length || 0 : 0;

          return (
            <div
              className={`nav-card server-card ${isActive ? "active" : ""}`}
              role="button"
              tabIndex={0}
              key={server.id}
              aria-label={`${serverSessionName(server, index)}，${server.profile.host || "未添加"}，${serverPlatformLabel(server.profile)}`}
              onClick={() => onSelectServer?.(server.id)}
              onKeyDown={(event) => selectServerFromCard(event, server.id)}
            >
              <span className="nav-title">
                <StatusDot status={serverConnected ? "connected" : serverStatus} />
                <strong>{serverSessionName(server, index)}</strong>
              </span>
              <span className="nav-subtitle">
                {server.profile.host || "未添加"} · {workdirName}
              </span>
              {scanCount ? <span className="nav-meta">{scanCount} 个目录</span> : null}
              <button
                className={`connect-badge ${serverStatus}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isActive) {
                    onSelectServer?.(server.id);
                    return;
                  }
                  onTestConnection();
                }}
                disabled={busy || (isActive && connection.state === "testing")}
              >
                {serverConnectLabel}
              </button>
            </div>
          );
        })}
      </div>

      <div className="sidebar-meta" aria-label="当前工作区">
        <div>
          <span>工作区</span>
          <strong>{diagnostics.pwd || profile.workdir}</strong>
        </div>
        {discovery?.state === "done" ? (
          <div>
            <span>发现</span>
            <strong>{discovery.directories?.length || 0} 个目录</strong>
          </div>
        ) : null}
      </div>

      <div className="sidebar-actions">
        <button className="sidebar-action" type="button" onClick={onRefreshOutput} disabled={busy}>
          刷新
        </button>
        <button className="sidebar-action" type="button" onClick={onOpenSettings}>
          设置
        </button>
      </div>
    </>
  );
}

function ConnectionSummary({
  profile,
  connection,
  diagnostics,
  discovery,
  profileReady: ready,
  busy,
  onOpenSettings,
  onTestConnection,
}) {
  const connected = connection.state === "connected" || Boolean(diagnostics.host);
  const scanning = discovery?.state === "scanning";
  const scanDone = discovery?.state === "done";
  const scanError = discovery?.state === "error";
  const directoryCount = discovery?.directories?.length || 0;
  const historyCount = (discovery?.history?.codex || 0) + (discovery?.history?.claude || 0);
  const title = !ready
    ? "先添加一台机器"
    : scanning
      ? "正在扫描 AI 工作区"
      : scanDone
        ? "选择一个工作目录"
        : connected
          ? "机器已连接"
          : "连接后自动扫描";
  const body = !ready
    ? "只需要填写地址、账号和密码，其它细节都放在设置里。"
    : scanning
      ? "正在读取远端已有的 Codex、Claude 会话和项目目录。"
      : scanDone
        ? `找到 ${directoryCount} 个工作目录和 ${historyCount} 条 AI 历史，选择一个就可以开始对话。`
        : scanError
          ? `机器已连上，但扫描没有完成：${discovery.message || "请重新扫描。"}`
          : `当前工作目录是 ${workdirDisplayName(diagnostics.pwd || profile.workdir)}。`;
  const primaryLabel = !ready ? "添加机器" : scanning ? "扫描中" : scanDone ? "重新扫描" : "连接并扫描";
  const steps = [
    {
      label: "连接机器",
      state: connected || scanning || scanDone ? "done" : ready ? "current" : "todo",
    },
    {
      label: "扫描会话",
      state: scanDone ? "done" : scanning ? "current" : scanError ? "error" : connected ? "current" : "todo",
    },
    {
      label: "选择目录",
      state: scanDone ? "current" : "todo",
    },
  ];

  return (
    <section className={`summary-strip codex-intro setup-flow ${ready ? "" : "setup-required"}`}>
      <div className="summary-main">
        <div className="intro-mark">
          <WorkbenchLogo />
        </div>
        <h1>{title}</h1>
        <p>{body}</p>
        <div className="setup-steps" aria-label="设置流程">
          {steps.map((step, index) => (
            <div className={`setup-step ${step.state}`} key={step.label}>
              <span>{step.state === "done" ? "✓" : index + 1}</span>
              <strong>{step.label}</strong>
            </div>
          ))}
        </div>
        <div className="summary-actions">
          <button
            type="button"
            className="send-button"
            onClick={ready ? onTestConnection : onOpenSettings}
            disabled={busy || scanning}
          >
            {primaryLabel}
          </button>
          <button type="button" className="ghost-button" onClick={onOpenSettings}>
            设置
          </button>
        </div>
      </div>
      <div className="summary-metrics">
        <SummaryMetric label="服务器" value={profile.host} />
        <SummaryMetric label="状态" value={connection.detail} />
        <SummaryMetric label="目录" value={workdirDisplayName(diagnostics.pwd || profile.workdir)} />
      </div>
    </section>
  );
}

function DiscoveryPanel({ discovery, profile, servers = [], busy, onRescan, onAddWorkdir }) {
  if (!discovery || discovery.state === "idle") return null;

  const currentWorkdir = String(profile.workdir || "");
  const knownWorkdirs = new Set(
    servers
      .filter((server) => server.profile?.host === profile.host && server.profile?.username === profile.username)
      .map((server) => String(server.profile?.workdir || "")),
  );
  const directories = Array.isArray(discovery.directories) ? discovery.directories.slice(0, 12) : [];
  const tools = Array.isArray(discovery.tools)
    ? discovery.tools.filter((tool) => ["codex", "claude", "gemini", "aider", "ollama"].includes(tool.id))
    : [];
  const activeCount = discovery.activeSessions?.length || 0;
  const historyCount = (discovery.history?.codex || 0) + (discovery.history?.claude || 0);
  const toolNames = tools.map((tool) => tool.name || tool.id).slice(0, 4).join("、");

  return (
    <section className={`discovery-panel ${discovery.state}`}>
      <header>
        <div>
          <strong>{discovery.state === "scanning" ? "正在扫描" : "选择工作目录"}</strong>
          <span>
            {discovery.state === "scanning"
              ? "正在读取已有 AI 会话和项目目录"
              : `${directories.length} 个目录 · ${historyCount} 条历史${activeCount ? ` · ${activeCount} 个运行会话` : ""}${
                  toolNames ? ` · ${toolNames}` : ""
                }`}
          </span>
        </div>
        <button type="button" className="ghost-button" onClick={onRescan} disabled={busy}>
          刷新
        </button>
      </header>

      {discovery.state === "error" ? <p className="discovery-error">{discovery.message || "扫描失败。"}</p> : null}

      {discovery.state === "scanning" ? (
        <div className="scan-skeleton">
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {discovery.state === "done" && directories.length ? (
        <div className="workdir-list">
          {directories.map((item) => {
            const selected = item.path === currentWorkdir;
            const known = knownWorkdirs.has(item.path);
            const codexCount = item.history?.codex || 0;
            const claudeCount = item.history?.claude || 0;
            const meta = [
              ...(item.markers || []),
              codexCount ? `Codex ${codexCount}` : "",
              claudeCount ? `Claude ${claudeCount}` : "",
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <article className={`workdir-card ${selected ? "selected" : ""}`} key={item.path}>
                <div>
                  <strong>{item.name || workdirDisplayName(item.path)}</strong>
                  <span className="mono">{item.path}</span>
                  <small>{meta || "普通目录"}</small>
                </div>
                <button
                  type="button"
                  className={selected || known ? "ghost-button" : "send-button"}
                  onClick={() => onAddWorkdir(item.path)}
                  disabled={busy || selected}
                >
                  {selected ? "当前" : known ? "打开" : "使用"}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
      {discovery.state === "done" && !directories.length ? (
        <p className="discovery-empty">没有自动找到工作目录，可以在设置里手动填写路径。</p>
      ) : null}
    </section>
  );
}

function SummaryMetric({ label, value, mono = false }) {
  return (
    <div className="summary-metric">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
    </div>
  );
}

function MessageBubble({ message, activeAgent, busy, onModelChoice, onCodexLogin }) {
  const copyText = message.output || message.body || "";

  function copyMessage() {
    if (!copyText || !navigator.clipboard) return;
    navigator.clipboard.writeText(copyText);
  }

  if (message.role === "user") {
    return (
      <article className="user-prompt">
        <p>{message.body}</p>
        <button type="button" className="copy-message" onClick={copyMessage}>
          复制
        </button>
      </article>
    );
  }

  const agent = agents.find((item) => item.id === message.agentId) ?? activeAgent;

  return (
    <article className={`agent-response ${message.status}`}>
      <header className="message-header">
        <AgentLogo agentId={agent.id} compact />
        <strong>{message.title || agent.name}</strong>
        <time>{message.createdAt}</time>
        <span className={`streaming ${message.status}`}>{statusLabel(message.status)}</span>
        <button type="button" className="copy-message" onClick={copyMessage}>
          复制
        </button>
      </header>
      {message.body ? <p className="assistant-copy">{message.body}</p> : null}
      {message.modelChoice ? (
        <div className="model-choice-actions" aria-label="选择 Codex 模型">
          <button type="button" onClick={() => onModelChoice(message, "new")} disabled={busy}>
            试用 GPT-5.5
          </button>
          <button type="button" onClick={() => onModelChoice(message, "existing")} disabled={busy}>
            继续当前模型
          </button>
        </div>
      ) : null}
      {message.loginAction ? (
        <div className="model-choice-actions" aria-label="Codex 登录">
          <button type="button" onClick={() => onCodexLogin(message)} disabled={busy}>
            生成设备码
          </button>
        </div>
      ) : null}
      {message.output ? (
        <section className="assistant-answer">
          <RichMessage text={message.output} />
        </section>
      ) : null}
    </article>
  );
}

function RichMessage({ text }) {
  const blocks = useMemo(() => parseRichMessage(text), [text]);

  if (!blocks.length) return null;

  return (
    <div className="rich-message">
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return (
            <pre key={`code-${index}`}>
              <code>{block.text}</code>
            </pre>
          );
        }

        if (block.type === "ul" || block.type === "ol") {
          const ListTag = block.type;
          return (
            <ListTag key={`list-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>{renderInlineMessage(item, `item-${index}-${itemIndex}`)}</li>
              ))}
            </ListTag>
          );
        }

        return <p key={`paragraph-${index}`}>{renderInlineMessage(block.text, `paragraph-${index}`)}</p>;
      })}
    </div>
  );
}

function parseRichMessage(value) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push(list);
    list = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (code) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const unordered = line.match(/^\s*[-*•]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const listMatch = unordered || ordered;

    if (listMatch) {
      const type = unordered ? "ul" : "ol";
      flushParagraph();
      if (!list || list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push(listMatch[1].trim());
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  if (code) blocks.push({ type: "code", text: code.join("\n") });
  flushParagraph();
  flushList();

  return blocks;
}

function renderInlineMessage(text, keyPrefix) {
  const source = String(text || "");
  const nodes = [];
  const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let lastIndex = 0;
  let matchIndex = 0;
  let match;

  while ((match = tokenPattern.exec(source))) {
    if (match.index > lastIndex) {
      nodes.push(source.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={`${keyPrefix}-code-${matchIndex}`}>{token.slice(1, -1)}</code>);
    } else {
      nodes.push(<strong key={`${keyPrefix}-strong-${matchIndex}`}>{token.slice(2, -2)}</strong>);
    }

    lastIndex = match.index + token.length;
    matchIndex += 1;
  }

  if (lastIndex < source.length) nodes.push(source.slice(lastIndex));
  return nodes;
}

function statusLabel(status) {
  if (status === "login") return "待登录";
  if (status === "choice") return "待选择";
  if (status === "running") return "运行中";
  if (status === "error") return "失败";
  if (status === "idle") return "待命";
  return "完成";
}

function Composer({
  activeAgent,
  activeAgentId,
  composer,
  busy,
  pendingAction,
  profileReady: ready,
  voiceState,
  voiceError,
  setActiveAgentId,
  setComposer,
  onOpenSettings,
  onSend,
  onVoice,
}) {
  const disabled = busy || pendingAction || !ready;
  const voiceActive = voiceState === "listening" || voiceState === "stopping";
  const voiceDisabled = !ready || pendingAction || (busy && !voiceActive);
  const voiceLabel = voiceState === "listening" ? "停止" : voiceState === "stopping" ? "停止中" : "语音";

  return (
    <footer className="composer">
      <div className="composer-tools">
        <label className="select-shell">
          <AgentLogo agentId={activeAgent.id} compact />
          <select value={activeAgentId} onChange={(event) => setActiveAgentId(event.target.value)} disabled={!ready || pendingAction || busy}>
            {agents.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="input-row">
        <textarea
          value={composer}
          disabled={!ready}
          onChange={(event) => setComposer(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onSend();
          }}
          placeholder={
            pendingAction
              ? "先完成上面的操作"
              : voiceState === "listening"
                ? "正在听..."
                : ready
                ? `告诉 ${activeAgent.shortName} 你想做什么`
                : "先添加服务器后再发送任务"
          }
          rows={2}
        />
        <div className="input-actions">
          {ready ? (
            <>
              <button
                type="button"
                className={`voice-button ${voiceActive ? "listening" : ""}`}
                onClick={onVoice}
                disabled={voiceDisabled}
                aria-label={voiceActive ? "停止语音输入" : "语音输入"}
              >
                {voiceLabel}
              </button>
              <button type="button" className="send-button" onClick={onSend} disabled={disabled || !composer.trim()}>
                {busy ? "等待" : "发送"}
              </button>
            </>
          ) : (
            <button type="button" className="send-button" onClick={onOpenSettings}>
              添加服务器
            </button>
          )}
        </div>
      </div>
      {voiceError ? <p className="voice-hint error">{voiceError}</p> : null}
    </footer>
  );
}

function RawOutput({
  open,
  agent,
  profile,
  connection,
  rawOutput,
  busy,
  onToggle,
  onRefresh,
  onInterrupt,
  onKill,
}) {
  return (
    <section className={`raw-output ${open ? "open" : "collapsed"}`}>
      <header>
        <button type="button" onClick={onToggle} className="raw-title">
          <span>{open ? "⌄" : "›"}</span>
          <strong>详情</strong>
          <StatusDot status={connection.state} />
          <span>{connection.label}</span>
        </button>
        {open ? (
          <div className="raw-meta">
            <span>{agent.shortName}</span>
            <span>{sessionName(profile, agent.id)}</span>
            <button type="button" onClick={onRefresh} disabled={busy}>
              刷新
            </button>
            <button type="button" onClick={onInterrupt} disabled={busy}>
              中断
            </button>
            <button type="button" onClick={onKill} disabled={busy}>
              关闭会话
            </button>
          </div>
        ) : (
          <button type="button" className="raw-expand" onClick={onToggle}>
            查看
          </button>
        )}
      </header>
      {open ? <pre>{rawOutput || "暂无输出。"}</pre> : null}
    </section>
  );
}

function SettingsPanel({ draftProfile, busy, canDelete, setDraftProfile, onClose, onDuplicate, onSave, onTest, onClear }) {
  function updateField(field, value) {
    if (field === "platform") {
      const nextPlatform = normalizeServerPlatform(value);
      setDraftProfile((current) => {
        const currentPlatform = normalizeServerPlatform(current.platform);
        const currentDefaults = serverPlatformDefaults[currentPlatform] || serverPlatformDefaults.linux;
        const nextDefaults = serverPlatformDefaults[nextPlatform] || serverPlatformDefaults.linux;
        return {
          ...current,
          platform: nextPlatform,
          workdir:
            !current.workdir || current.workdir === currentDefaults.workdir
              ? nextDefaults.workdir
              : current.workdir,
          codexCommand:
            !current.codexCommand || current.codexCommand === currentDefaults.codexCommand
              ? nextDefaults.codexCommand
              : current.codexCommand,
          claudeCommand:
            !current.claudeCommand || current.claudeCommand === currentDefaults.claudeCommand
              ? nextDefaults.claudeCommand
              : current.claudeCommand,
        };
      });
      return;
    }
    setDraftProfile((current) => ({ ...current, [field]: value }));
  }

  const missingPassword = !String(draftProfile.password || "").trim();

  return (
    <div className="settings-layer" role="dialog" aria-modal="true">
      <button className="settings-backdrop" type="button" aria-label="关闭设置" onClick={onClose} />
      <section className="settings-panel">
        <header>
          <div>
            <strong>服务器</strong>
            <span>登录信息只保存在本机 Keychain</span>
          </div>
          <button type="button" className="text-button" onClick={onClose}>
            完成
          </button>
        </header>

        {missingPassword ? (
          <p className="settings-note">第一次使用填写登录密码即可，测试通过后就能开始对话。</p>
        ) : null}

        <div className="settings-grid">
          <ConfigField label="名称" value={draftProfile.name} onChange={(value) => updateField("name", value)} />
          <ConfigSelect
            label="服务器类型"
            value={normalizeServerPlatform(draftProfile.platform)}
            options={serverPlatforms}
            onChange={(value) => updateField("platform", value)}
          />
          <ConfigField label="服务器地址" value={draftProfile.host} onChange={(value) => updateField("host", value)} />
          <ConfigField
            label="端口"
            value={draftProfile.port}
            inputMode="numeric"
            onChange={(value) => updateField("port", value)}
          />
          <ConfigField
            label="用户名"
            value={draftProfile.username}
            autoComplete="username"
            onChange={(value) => updateField("username", value)}
          />
          <ConfigField
            label="登录密码"
            type="password"
            value={draftProfile.password}
            autoComplete="current-password"
            required
            onChange={(value) => updateField("password", value)}
          />
          <ConfigField
            label="工作路径"
            value={draftProfile.workdir}
            onChange={(value) => updateField("workdir", value)}
          />
        </div>

        <details className="advanced-settings">
          <summary>高级设置</summary>
          <div className="settings-grid">
            <ConfigField
              label="会话前缀"
              value={draftProfile.tmuxSession}
              onChange={(value) => updateField("tmuxSession", value)}
            />
            <ConfigField
              label="Codex 命令"
              value={draftProfile.codexCommand}
              onChange={(value) => updateField("codexCommand", value)}
            />
            <ConfigField
              label="Claude 命令"
              value={draftProfile.claudeCommand}
              onChange={(value) => updateField("claudeCommand", value)}
            />
          </div>
        </details>

        <div className="settings-actions">
          <button type="button" className="danger-button" onClick={onClear} disabled={busy}>
            {canDelete ? "删除" : "清空"}
          </button>
          <button type="button" className="ghost-button" onClick={onDuplicate} disabled={busy}>
            复制
          </button>
          <button type="button" className="ghost-button" onClick={onSave} disabled={busy}>
            保存
          </button>
          <button type="button" className="send-button" onClick={onTest} disabled={busy}>
            连接
          </button>
        </div>
      </section>
    </div>
  );
}

function ConfigField({ label, value, onChange, type = "text", inputMode, autoComplete, required = false }) {
  return (
    <label className={`config-field ${required ? "required" : ""}`}>
      <span>{label}</span>
      <input
        value={value ?? ""}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ConfigSelect({ label, value, options, onChange }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DiagnosticRow({ label, value }) {
  return (
    <div className="diagnostic-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div className="section-header">
      <span>{title}</span>
    </div>
  );
}

function AgentLogo({ agentId, compact = false }) {
  const normalized = agentId === "claude" ? "claude" : "codex";
  const label = normalized === "claude" ? "Claude" : "Codex";
  return (
    <span className={`agent-logo ${normalized} ${compact ? "compact" : ""}`} aria-label={label}>
      <img src={assetPath(`icons/${normalized}.svg`)} alt="" />
    </span>
  );
}

function WorkbenchLogo() {
  return (
    <span className="workbench-logo" aria-label="AI Workbench">
      <img src={assetPath("icons/workbench.png")} alt="" />
    </span>
  );
}

function StatusDot({ status = "connected" }) {
  const normalized = status === "testing" || status === "running" ? "testing" : status;
  return <span className={`status-dot ${normalized}`} />;
}
