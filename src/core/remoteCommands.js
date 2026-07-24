import * as Foundation from "./foundation.js";
import * as Agent from "./agent.js";

const {
  SSHWorkbench,
  VoiceWorkbench,
  agentCommand,
  agents,
  appLog,
  appearanceModeOptions,
  appendBrowserDiagnosticLog,
  applyGlobalSettings,
  assetBase,
  assetPath,
  automaticTaskWakePhrases,
  bashCommand,
  browserDiagnosticLogStorageKey,
  buildHealthCommand,
  buildInstallWorkbenchAgentCommand,
  buildWindowsHealthCommand,
  buildWorkbenchAgentCancelCommand,
  buildWorkbenchAgentConversationListCommand,
  buildWorkbenchAgentConversationStatusCommand,
  buildWorkbenchAgentCreateCommand,
  buildWorkbenchAgentStatusCommand,
  buildWorkspaceMigrationPayload,
  builtInAliyunVoiceConfig,
  chineseNumber,
  clipPersistedText,
  commandDiagnosticPayload,
  commandName,
  compactInlineText,
  connectionForAppLaunch,
  connectionIsLive,
  createConversationId,
  createMessage,
  createServerId,
  createServerSession,
  currentResultPlaybackPhrases,
  defaultProfile,
  defaultWakeWordPhrases,
  desktopBridge,
  directoryPrefKey,
  directoryPrefsStorageKey,
  dirnameRemote,
  dirnameWindows,
  discoverySeedWorkdir,
  dormantConnectionForProfile,
  finalAnswerEnd,
  finalAnswerStart,
  formatAgentPrompt,
  formatDuration,
  globalSettingsFromProfile,
  healthFromWorkbenchAgentStatus,
  initialConnectionForProfile,
  isEventLike,
  isGlobalWakePhrase,
  isLegacyDefaultWorkdir,
  isNoisyDiagnosticKey,
  isSensitiveDiagnosticKey,
  isSpeechStopPhrase,
  isWindowsProfile,
  isWslProfile,
  joinWindowsPath,
  lastSpeakableMessageForServer,
  legacyDefaultWakeWordPhrases,
  legacyDefaultWorkdirs,
  loadBrowserDiagnosticLogs,
  loadDirectoryPrefs,
  loadLocalMessageHistory,
  loadManualWorkdirHistory,
  loadWorkspaceMirror,
  localMessageHistoryFromServers,
  localMessageHistoryStorageKey,
  mainAIRouteSchema,
  mainAIRouterInstructions,
  manualWorkdirHistoryStorageKey,
  manualWorkdirScope,
  markerLabels,
  maxPersistedMessagesPerServer,
  maxPersistedTextLength,
  mergeAgentConversationsIntoDiscovery,
  mergeDirectoryPrefs,
  mergeImportedServers,
  mergeLocalMessageHistory,
  mergeManualWorkdirHistory,
  messageCounter,
  messagesForStorage,
  migrationFileKind,
  migrationFileName,
  migrationFileVersion,
  normalizeAgentModel,
  normalizeAppearanceMode,
  normalizeDirectoryPrefs,
  normalizeManualWorkdirHistory,
  normalizePersistedMessage,
  normalizeProfile,
  normalizeResultAudioMode,
  normalizeServerPlatform,
  normalizeVoiceText,
  normalizeWorkspaceStore,
  parseHealth,
  parsePlaybackCommandIndex,
  parseSessionSelectionKey,
  parseSessionSwitchIndex,
  parseSmallChineseNumber,
  parseWorkbenchAgentConversations,
  parseWorkbenchAgentOutput,
  parseWorkspaceMigrationText,
  playbackCommandMatchFromPhrase,
  playbackPhrasesForServer,
  powershellCommand,
  powershellStdinCommand,
  profileConnectionKey,
  profileIssue,
  profileReady,
  psQuote,
  readableVoiceNameCandidate,
  readyConnectionForSession,
  recentManualWorkdirs,
  rememberManualWorkdir,
  remoteBashCommand,
  resultAudioModeOptions,
  sameWorkdir,
  sanitizeDiagnosticValue,
  sanitizeId,
  saveDirectoryPrefs,
  saveLocalMessageHistory,
  saveManualWorkdirHistory,
  saveWorkspaceMirror,
  serializeWakePhrases,
  serializeWorkspaceMigrationStore,
  serializeWorkspaceStore,
  serverCompletionSpeech,
  serverDisplayName,
  serverPlatformDefaults,
  serverPlatformLabel,
  serverPlatforms,
  serverSessionName,
  serverTaskRunning,
  serverTaskState,
  sessionName,
  sessionSelectionKey,
  shQuote,
  sleep,
  speakAssistantText,
  speechInterruptContextForServers,
  speechInterruptPhrases,
  speechTextFromMessage,
  stopAssistantSpeech,
  stripLegacyDefaultWorkdirFromPlaceholder,
  stripTextForSpeech,
  taskForStorage,
  taskTextFromValue,
  taskWakeMatchFromPhrase,
  taskWakeMatchFromText,
  taskWakePhrasesForServer,
  timestampFromAgentTime,
  toBase64Bytes,
  toBase64Utf16Le,
  toBase64Utf8,
  toggleListValue,
  ttsModelOptions,
  voiceToneOptions,
  waitUntil,
  wakeContextForServers,
  wakePhrasesForProfile,
  wakePhrasesFromText,
  workbenchAgentAvailableFromOutput,
  workbenchAgentScript,
  workbenchAgentVersionNumber,
  workdirDisplayName,
  workspaceDiagnosticSummary,
  workspaceMirrorStorageKey,
  workspaceStoreHasServers
} = { ...Foundation, ...Agent };

export function agentRuntimeProfile(profile) {
  return isWslProfile(profile) ? { ...profile, platform: "linux" } : profile;
}

function selectedAgentModel(profile, agent) {
  return normalizeAgentModel(agent?.id || profile?.agentId, profile?.aiModel);
}

export function createRemoteTaskId(conversationId, agentId) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return sanitizeId(`task-${unique}-${agentId}-${conversationId || "local"}`).replace(/-+/g, "-").slice(0, 48);
}

export function profileWithDetectedTools(profile, health) {
  const normalized = normalizeProfile(profile);
  const codexCommand = String(health?.codex || "").trim();
  const claudeCommand = String(health?.claude || "").trim();

  return {
    ...normalized,
    codexCommand: codexCommand || normalized.codexCommand,
    claudeCommand: claudeCommand || normalized.claudeCommand,
  };
}

export function buildDiscoveryCommand(profile) {
  if (isWindowsProfile(profile)) return buildWindowsDiscoveryCommand(profile);
  const seedWorkdir = discoverySeedWorkdir(profile);

  return remoteBashCommand(profile, `
set +e
export AIWB_CURRENT_WORKDIR=${shQuote(seedWorkdir)}
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

def clean_session_title(value, fallback=""):
    text = " ".join(str(value or "").split())
    if not text:
        text = " ".join(str(fallback or "").split())
    if not text:
        return ""
    text = text.strip(" -_#：:，,。.")
    if len(text) <= 28:
        return text
    return text[:28].rstrip() + "..."

def unwrap_aiwb_user_task(text):
    value = str(text or "").strip()
    if "用户任务是一个 JSON 字符串" not in value:
        return value
    marker = "用户任务是一个 JSON 字符串，请先解析它再执行："
    _, _, tail = value.partition(marker)
    tail = tail.strip()
    if not tail:
        return value
    try:
        decoded = json.loads(tail.split("。输出要求：", 1)[0].strip())
        if isinstance(decoded, str) and decoded.strip():
            return decoded.strip()
    except Exception:
        pass
    return value

def is_scaffold_user_text(text):
    value = str(text or "").lstrip()
    prefixes = (
        "# AGENTS.md",
        "<environment_context>",
        "<permissions instructions>",
        "<apps_instructions>",
        "<skills_instructions>",
        "<plugins_instructions>",
        "<collaboration_mode>",
        "<recommended_plugins>",
    )
    return any(value.startswith(prefix) for prefix in prefixes)

def content_to_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\\n".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        )
    return ""

def run(args, timeout=4):
    try:
        result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
        return (result.stdout or result.stderr or "").strip()
    except Exception:
        return ""

def read_text(path, limit=6000):
    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
        return text[:limit]
    except Exception:
        return ""

def parse_agent_time(value):
    text = str(value or "").strip()
    if not text:
        return 0
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S %z"):
        try:
            return int(time.mktime(time.strptime(text, fmt)))
        except Exception:
            pass
    return 0

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
        if not path and tool == "codex":
            for candidate in [
                Path("/Applications/ChatGPT.app/Contents/Resources/codex"),
                Path.home() / "Applications/ChatGPT.app/Contents/Resources/codex",
            ]:
                if candidate.is_file() and os.access(candidate, os.X_OK):
                    path = str(candidate)
                    break
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
    root = Path.home() / ".codex" / "sessions"
    files = [path for path in root.rglob("*.jsonl") if path.is_file()] if root.exists() else []
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    items = []
    for path in files[:limit]:
        cwd = ""
        model = ""
        title = ""
        first_user = ""
        last_user = ""
        last_assistant = ""
        def remember_user(text):
            nonlocal first_user, last_user
            if not text or is_scaffold_user_text(text):
                return
            user_text = unwrap_aiwb_user_task(text)
            if not user_text or user_text == "[object Object]" or is_scaffold_user_text(user_text):
                return
            if not first_user:
                first_user = short(user_text, 160)
            last_user = short(user_text)
        for obj in read_jsonl(path):
            payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else obj
            if obj.get("type") == "session_meta":
                cwd = payload.get("cwd") or cwd
                title = payload.get("title") or payload.get("summary") or title
            elif obj.get("type") == "turn_context":
                cwd = payload.get("cwd") or cwd
                model = payload.get("model") or model
                title = payload.get("title") or payload.get("summary") or title
            elif obj.get("type") == "response_item" and payload.get("type") == "message":
                role = payload.get("role")
                text = content_to_text(payload.get("content"))
                if role == "user":
                    remember_user(text)
                elif role == "assistant" and text:
                    last_assistant = short(text)
            elif obj.get("type") == "compacted" and isinstance(payload.get("replacement_history"), list):
                for message in payload.get("replacement_history") or []:
                    if not isinstance(message, dict) or message.get("role") != "user":
                        continue
                    remember_user(content_to_text(message.get("content")))
        items.append({
            "agent": "codex",
            "path": str(path),
            "sessionId": path.stem,
            "title": clean_session_title(title or first_user or last_user, Path(cwd).name if cwd else path.stem),
            "cwd": cwd,
            "model": model,
            "mtime": int(path.stat().st_mtime),
            "lastUser": last_user,
            "lastAssistant": last_assistant,
        })
    return items

def collect_claude_history(limit=80):
    root = Path.home() / ".claude" / "projects"
    files = [path for path in root.rglob("*.jsonl") if path.is_file()] if root.exists() else []
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    items = []
    for path in files[:limit]:
        cwd = ""
        title = ""
        first_user = ""
        last_user = ""
        last_assistant = ""
        for obj in read_jsonl(path):
            if obj.get("type") == "ai-title" and obj.get("aiTitle"):
                title = obj.get("aiTitle") or title
            cwd = obj.get("cwd") or cwd
            role = obj.get("role") or obj.get("type")
            content = obj.get("message", {}).get("content") if isinstance(obj.get("message"), dict) else obj.get("content")
            text = content_to_text(content) or str(content or "")
            if role == "user" and text:
                if not first_user:
                    first_user = short(text, 160)
                last_user = short(text)
            elif role == "assistant" and text:
                last_assistant = short(text)
        items.append({
            "agent": "claude",
            "path": str(path),
            "sessionId": path.stem,
            "title": clean_session_title(title or first_user or last_user, Path(cwd).name if cwd else path.stem),
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

def collect_agent_conversations(limit=80):
    root = Path.home() / ".ai-workbench" / "agent" / "conversations"
    if not root.exists():
        return []
    dirs = [path for path in root.iterdir() if path.is_dir()]
    dirs.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    items = []
    for path in dirs[:limit]:
        def field(name):
            return read_text(path / name, 1000).strip()
        agent = field("agent_id")
        updated_at = field("updated_at")
        items.append({
            "id": field("id") or path.name,
            "name": field("name"),
            "title": field("name"),
            "workdir": field("workdir"),
            "agentId": "claude" if agent == "claude" else "codex",
            "status": field("status") or "unknown",
            "taskId": field("task_id"),
            "createdAt": field("created_at"),
            "updatedAt": updated_at,
            "startedAt": field("started_at"),
            "finishedAt": field("finished_at"),
            "exitCode": field("exit_code"),
            "lastPrompt": read_text(path / "last_prompt.txt", 8000).strip(),
            "lastResult": read_text(path / "last_result.txt", 12000).strip(),
            "mtime": parse_agent_time(updated_at) or int(path.stat().st_mtime),
        })
    return [item for item in items if item.get("id") and item.get("workdir")]

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

def project_markers(path_value):
    markers = []
    if not path_value:
        return markers
    try:
        path = Path(path_value)
        if not path.exists() or not path.is_dir():
            return markers
        names = {child.name for child in path.iterdir()}
        for marker, label in PROJECT_MARKERS.items():
            if marker in names:
                markers.append(label)
    except Exception:
        return markers
    return markers

def collect_project_dirs(current_workdir, histories, active_sessions):
    history_by_cwd = defaultdict(lambda: {"codex": 0, "claude": 0, "latest": 0})
    for item in histories:
        cwd = item.get("cwd")
        if not cwd:
            continue
        bucket = history_by_cwd[cwd]
        bucket[item.get("agent", "")] += 1
        bucket["latest"] = max(bucket["latest"], int(item.get("mtime", 0)))

    dirs = {}
    for cwd, history in history_by_cwd.items():
        add_dir(
            dirs,
            cwd,
            markers=["history"] + project_markers(cwd),
            history=history,
            current=(cwd == current_workdir),
        )

    for session in active_sessions:
        cwd = session.get("cwd")
        if cwd:
            add_dir(dirs, cwd, markers=["active"] + project_markers(cwd), current=(cwd == current_workdir))

    if current_workdir and current_workdir not in dirs:
        markers = project_markers(current_workdir)
        if markers:
            add_dir(dirs, current_workdir, markers=markers, current=True)

    return sorted(dirs.values(), key=lambda item: (-item.get("score", 0), -item.get("latest", 0), item.get("path", "")))[:60]

current_workdir = os.environ.get("AIWB_CURRENT_WORKDIR", "")
histories = collect_codex_history() + collect_claude_history()
active_sessions = collect_active_sessions()
agent_conversations = collect_agent_conversations()
directories = collect_project_dirs(current_workdir, histories, active_sessions)
directory_by_path = {item.get("path"): item for item in directories}
for conversation in agent_conversations:
    workdir = conversation.get("workdir")
    if not workdir:
        continue
    item = directory_by_path.get(workdir)
    if not item:
        item = {
            "path": workdir,
            "name": Path(workdir).name or workdir,
            "markers": [],
            "history": {"codex": 0, "claude": 0},
            "latest": 0,
            "score": 0,
            "exists": Path(workdir).exists(),
        }
        directory_by_path[workdir] = item
        directories.append(item)
    item["markers"] = sorted(set(item.get("markers", [])) | {"agent"})
    item["history"][conversation.get("agentId", "codex")] = int(item.get("history", {}).get(conversation.get("agentId", "codex"), 0)) + 1
    item["latest"] = max(int(item.get("latest", 0)), int(conversation.get("mtime", 0)))
    item["score"] = int(item.get("score", 0)) + 40
directories = sorted(directories, key=lambda item: (-item.get("score", 0), -item.get("latest", 0), item.get("path", "")))[:80]
result = {
    "scannedAt": time.strftime("%Y-%m-%d %H:%M:%S %z"),
    "tools": collect_tools(),
    "activeSessions": active_sessions,
    "history": {
        "codex": sum(1 for item in histories if item.get("agent") == "codex"),
        "claude": sum(1 for item in histories if item.get("agent") == "claude"),
        "latest": max([item.get("mtime", 0) for item in histories] or [0]),
    },
    "recentSessions": sorted(histories, key=lambda item: item.get("mtime", 0), reverse=True)[:12],
    "conversations": agent_conversations,
    "directories": directories,
}
print("__AIWB_SCAN_JSON__" + json.dumps(result, ensure_ascii=False, separators=(",", ":")))
PY
`);
}

export function buildWindowsDiscoveryCommand(profile) {
  const codexProbe = commandName(profile.codexCommand) || "codex";
  const claudeProbe = commandName(profile.claudeCommand) || "claude";
  const seedWorkdir = discoverySeedWorkdir(profile);

  return powershellStdinCommand(`
function Resolve-AiwbCommand {
  param([string]$Name)
  $AIWB_NAMES = @()
  if ($Name -and $Name.EndsWith(".ps1")) {
    $AIWB_NAMES += [IO.Path]::ChangeExtension($Name, ".cmd")
  } elseif ($Name -and -not $Name.EndsWith(".cmd") -and -not $Name.EndsWith(".exe")) {
    $AIWB_NAMES += "$Name.cmd"
    $AIWB_NAMES += "$Name.ps1"
    $AIWB_NAMES += "$Name.exe"
  }
  $AIWB_NAMES += $Name
  foreach ($AIWB_NAME in $AIWB_NAMES) {
    if (-not $AIWB_NAME) { continue }
    $AIWB_CMD = Get-Command $AIWB_NAME -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($AIWB_CMD) { return $AIWB_CMD.Source }
    if (Test-Path -LiteralPath $AIWB_NAME -PathType Leaf) { return (Resolve-Path -LiteralPath $AIWB_NAME).Path }
  }
  $AIWB_CANDIDATES = @()
  if ($env:APPDATA) {
    $AIWB_CANDIDATES += (Join-Path $env:APPDATA "npm\\$Name.cmd")
    $AIWB_CANDIDATES += (Join-Path $env:APPDATA "npm\\$Name.ps1")
  }
  if ($env:LOCALAPPDATA) {
    $AIWB_CANDIDATES += (Join-Path $env:LOCALAPPDATA "npm\\$Name.cmd")
    $AIWB_CANDIDATES += (Join-Path $env:LOCALAPPDATA "npm\\$Name.ps1")
  }
  if ($env:ProgramFiles) { $AIWB_CANDIDATES += (Join-Path $env:ProgramFiles "nodejs\\$Name.cmd") }
  $AIWB_PROGRAM_FILES_X86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  if ($AIWB_PROGRAM_FILES_X86) { $AIWB_CANDIDATES += (Join-Path $AIWB_PROGRAM_FILES_X86 "nodejs\\$Name.cmd") }
  foreach ($AIWB_PATH in $AIWB_CANDIDATES) {
    if ($AIWB_PATH -and (Test-Path -LiteralPath $AIWB_PATH -PathType Leaf)) { return $AIWB_PATH }
  }
  try {
    $AIWB_WHERE = (& where.exe $Name 2>$null | Select-Object -First 1)
    if ($AIWB_WHERE -and (Test-Path -LiteralPath $AIWB_WHERE -PathType Leaf)) { return $AIWB_WHERE }
  } catch {}
  return ""
}

function Short-AiwbText {
  param([object]$Value, [int]$Limit = 120)
  $AIWB_TEXT = [string]$Value
  $AIWB_TEXT = (($AIWB_TEXT -replace "\\s+", " ").Trim())
  if ($AIWB_TEXT.Length -gt $Limit) { return $AIWB_TEXT.Substring(0, $Limit) + "..." }
  return $AIWB_TEXT
}

function Get-AiwbMessageText {
  param([object]$Content)
  if ($null -eq $Content) { return "" }
  if ($Content -is [string]) { return $Content }
  $AIWB_PARTS = @()
  foreach ($AIWB_PART in @($Content)) {
    if ($null -eq $AIWB_PART) { continue }
    if ($AIWB_PART -is [string]) {
      $AIWB_PARTS += $AIWB_PART
    } elseif ($null -ne $AIWB_PART.text) {
      $AIWB_PARTS += [string]$AIWB_PART.text
    }
  }
  return ($AIWB_PARTS -join [Environment]::NewLine)
}

function Read-AiwbJsonl {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return @() }
  $AIWB_ITEMS = @()
  foreach ($AIWB_LINE in Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue) {
    $AIWB_TRIMMED = [string]$AIWB_LINE
    $AIWB_TRIMMED = $AIWB_TRIMMED.Trim()
    if (-not $AIWB_TRIMMED) { continue }
    try { $AIWB_ITEMS += ($AIWB_TRIMMED | ConvertFrom-Json -ErrorAction Stop) } catch {}
  }
  return $AIWB_ITEMS
}

function Collect-AiwbCodexHistory {
  $AIWB_ROOT = Join-Path $HOME ".codex\\sessions"
  if (-not (Test-Path -LiteralPath $AIWB_ROOT)) { return @() }
  $AIWB_RESULT = @()
  $AIWB_FILES = Get-ChildItem -LiteralPath $AIWB_ROOT -Recurse -Filter "*.jsonl" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 200
  foreach ($AIWB_FILE in $AIWB_FILES) {
    $AIWB_CWD = ""
    $AIWB_MODEL = ""
    $AIWB_LAST_USER = ""
    $AIWB_LAST_ASSISTANT = ""
    foreach ($AIWB_OBJ in Read-AiwbJsonl $AIWB_FILE.FullName) {
      $AIWB_PAYLOAD = $AIWB_OBJ
      if ($null -ne $AIWB_OBJ.payload) { $AIWB_PAYLOAD = $AIWB_OBJ.payload }
      if ($AIWB_OBJ.type -eq "session_meta") {
        if ($AIWB_PAYLOAD.cwd) { $AIWB_CWD = [string]$AIWB_PAYLOAD.cwd }
      } elseif ($AIWB_OBJ.type -eq "turn_context") {
        if ($AIWB_PAYLOAD.cwd) { $AIWB_CWD = [string]$AIWB_PAYLOAD.cwd }
        if ($AIWB_PAYLOAD.model) { $AIWB_MODEL = [string]$AIWB_PAYLOAD.model }
      } elseif ($AIWB_OBJ.type -eq "response_item" -and $AIWB_PAYLOAD.type -eq "message") {
        $AIWB_TEXT = Get-AiwbMessageText $AIWB_PAYLOAD.content
        if ($AIWB_PAYLOAD.role -eq "user" -and $AIWB_TEXT -and -not $AIWB_TEXT.StartsWith("# AGENTS.md")) {
          $AIWB_LAST_USER = Short-AiwbText $AIWB_TEXT
        } elseif ($AIWB_PAYLOAD.role -eq "assistant" -and $AIWB_TEXT) {
          $AIWB_LAST_ASSISTANT = Short-AiwbText $AIWB_TEXT
        }
      }
    }
    $AIWB_RESULT += [pscustomobject]@{
      agent = "codex"
      path = $AIWB_FILE.FullName
      sessionId = [IO.Path]::GetFileNameWithoutExtension($AIWB_FILE.Name)
      cwd = $AIWB_CWD
      model = $AIWB_MODEL
      mtime = [int](([DateTimeOffset]$AIWB_FILE.LastWriteTime).ToUnixTimeSeconds())
      lastUser = $AIWB_LAST_USER
      lastAssistant = $AIWB_LAST_ASSISTANT
    }
  }
  return $AIWB_RESULT
}

function Collect-AiwbClaudeHistory {
  $AIWB_ROOT = Join-Path $HOME ".claude\\projects"
  if (-not (Test-Path -LiteralPath $AIWB_ROOT)) { return @() }
  $AIWB_RESULT = @()
  $AIWB_FILES = Get-ChildItem -LiteralPath $AIWB_ROOT -Recurse -Filter "*.jsonl" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 120
  foreach ($AIWB_FILE in $AIWB_FILES) {
    $AIWB_CWD = ""
    $AIWB_LAST_USER = ""
    $AIWB_LAST_ASSISTANT = ""
    foreach ($AIWB_OBJ in Read-AiwbJsonl $AIWB_FILE.FullName) {
      if ($AIWB_OBJ.cwd) { $AIWB_CWD = [string]$AIWB_OBJ.cwd }
      $AIWB_CONTENT = $AIWB_OBJ.content
      if ($null -ne $AIWB_OBJ.message -and $null -ne $AIWB_OBJ.message.content) { $AIWB_CONTENT = $AIWB_OBJ.message.content }
      $AIWB_TEXT = Get-AiwbMessageText $AIWB_CONTENT
      if ($AIWB_OBJ.role -eq "user" -and $AIWB_TEXT) {
        $AIWB_LAST_USER = Short-AiwbText $AIWB_TEXT
      } elseif ($AIWB_OBJ.role -eq "assistant" -and $AIWB_TEXT) {
        $AIWB_LAST_ASSISTANT = Short-AiwbText $AIWB_TEXT
      }
    }
    $AIWB_RESULT += [pscustomobject]@{
      agent = "claude"
      path = $AIWB_FILE.FullName
      sessionId = [IO.Path]::GetFileNameWithoutExtension($AIWB_FILE.Name)
      cwd = $AIWB_CWD
      model = ""
      mtime = [int](([DateTimeOffset]$AIWB_FILE.LastWriteTime).ToUnixTimeSeconds())
      lastUser = $AIWB_LAST_USER
      lastAssistant = $AIWB_LAST_ASSISTANT
    }
  }
  return $AIWB_RESULT
}

function Add-AiwbTool {
  param([string]$Id, [string[]]$Names)
  foreach ($AIWB_NAME in $Names) {
    $AIWB_PATH = Resolve-AiwbCommand $AIWB_NAME
    if ($AIWB_PATH) {
      $AIWB_VERSION = ""
      try { $AIWB_VERSION = (& $AIWB_PATH --version 2>&1 | Select-Object -First 1) } catch {}
      return [ordered]@{ id = $Id; name = $Id; path = $AIWB_PATH; version = [string]$AIWB_VERSION }
    }
  }
  return $null
}

function Add-AiwbDir {
  param(
    [hashtable]$Map,
    [string]$Path,
    [string[]]$Markers = @(),
    [hashtable]$History = $null,
    [bool]$Current = $false
  )
  if (-not $Path) { return }
  $AIWB_KEY = [string]$Path
  if (-not $Map.ContainsKey($AIWB_KEY)) {
    $AIWB_NAME = Split-Path -Leaf $AIWB_KEY
    if (-not $AIWB_NAME) { $AIWB_NAME = $AIWB_KEY }
    $Map[$AIWB_KEY] = [ordered]@{
      path = $AIWB_KEY
      name = $AIWB_NAME
      markers = @()
      history = @{ codex = 0; claude = 0 }
      latest = 0
      score = 0
      exists = [bool](Test-Path -LiteralPath $AIWB_KEY)
      current = $false
    }
  }
  $AIWB_ITEM = $Map[$AIWB_KEY]
  if ($Markers) { $AIWB_ITEM.markers = @($AIWB_ITEM.markers + $Markers | Sort-Object -Unique) }
  if ($History) {
    $AIWB_ITEM.history.codex = [int]$AIWB_ITEM.history.codex + [int]$History.codex
    $AIWB_ITEM.history.claude = [int]$AIWB_ITEM.history.claude + [int]$History.claude
    $AIWB_ITEM.latest = [Math]::Max([int]$AIWB_ITEM.latest, [int]$History.latest)
  }
  if ($Current) { $AIWB_ITEM.current = $true }
  $AIWB_ITEM.score = (
    ([int]$AIWB_ITEM.history.codex * 12) +
    ([int]$AIWB_ITEM.history.claude * 10) +
    (@($AIWB_ITEM.markers).Count * 8) +
    $(if ($AIWB_ITEM.current) { 12 } else { 0 }) +
    $(if ($AIWB_ITEM.exists) { 4 } else { 0 }) +
    [Math]::Min([Math]::Floor([int]$AIWB_ITEM.latest / 100000000), 20)
  )
}

function Get-AiwbPathMarkers {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Container)) { return @() }
  $AIWB_MARKERS = @()
  $AIWB_MARKER_DEFS = @(
    @{ name = ".git"; label = "Git" },
    @{ name = ".codex"; label = "Codex" },
    @{ name = ".claude"; label = "Claude" },
    @{ name = "package.json"; label = "Node" },
    @{ name = "pyproject.toml"; label = "Python" },
    @{ name = "requirements.txt"; label = "Python" },
    @{ name = "Cargo.toml"; label = "Rust" },
    @{ name = "go.mod"; label = "Go" },
    @{ name = "pom.xml"; label = "Java" }
  )
  foreach ($AIWB_MARKER in $AIWB_MARKER_DEFS) {
    if (Test-Path -LiteralPath (Join-Path $Path $AIWB_MARKER["name"])) { $AIWB_MARKERS += $AIWB_MARKER["label"] }
  }
  return @($AIWB_MARKERS | Sort-Object -Unique)
}

$AIWB_WORKDIR = ${psQuote(seedWorkdir)}
$AIWB_TOOLS = @()
foreach ($AIWB_TOOL_DEF in @(
  @{ id = "codex"; names = @(${psQuote(codexProbe)}, "codex", "codex.cmd", "codex.ps1") },
  @{ id = "claude"; names = @(${psQuote(claudeProbe)}, "claude", "claude.cmd", "claude.ps1") },
  @{ id = "gemini"; names = @("gemini", "gemini.cmd", "gemini.ps1") },
  @{ id = "aider"; names = @("aider", "aider.cmd") },
  @{ id = "ollama"; names = @("ollama", "ollama.exe") },
  @{ id = "opencode"; names = @("opencode", "opencode.cmd", "opencode.ps1") },
  @{ id = "goose"; names = @("goose", "goose.cmd", "goose.ps1") }
)) {
  $AIWB_TOOL = Add-AiwbTool $AIWB_TOOL_DEF.id $AIWB_TOOL_DEF.names
  if ($AIWB_TOOL) { $AIWB_TOOLS += $AIWB_TOOL }
}

$AIWB_HISTORIES = @()
$AIWB_HISTORIES += Collect-AiwbCodexHistory
$AIWB_HISTORIES += Collect-AiwbClaudeHistory

$AIWB_HISTORY_BY_CWD = @{}
foreach ($AIWB_HISTORY in $AIWB_HISTORIES) {
  $AIWB_CWD = [string]$AIWB_HISTORY.cwd
  if (-not $AIWB_CWD) { continue }
  if (-not $AIWB_HISTORY_BY_CWD.ContainsKey($AIWB_CWD)) {
    $AIWB_HISTORY_BY_CWD[$AIWB_CWD] = @{ codex = 0; claude = 0; latest = 0 }
  }
  $AIWB_BUCKET = $AIWB_HISTORY_BY_CWD[$AIWB_CWD]
  if ($AIWB_HISTORY.agent -eq "codex") { $AIWB_BUCKET.codex = [int]$AIWB_BUCKET.codex + 1 }
  if ($AIWB_HISTORY.agent -eq "claude") { $AIWB_BUCKET.claude = [int]$AIWB_BUCKET.claude + 1 }
  $AIWB_BUCKET.latest = [Math]::Max([int]$AIWB_BUCKET.latest, [int]$AIWB_HISTORY.mtime)
}

$AIWB_DIR_MAP = @{}
foreach ($AIWB_CWD in $AIWB_HISTORY_BY_CWD.Keys) {
  $AIWB_MARKERS = @("history") + @(Get-AiwbPathMarkers $AIWB_CWD)
  Add-AiwbDir $AIWB_DIR_MAP $AIWB_CWD $AIWB_MARKERS $AIWB_HISTORY_BY_CWD[$AIWB_CWD] ($AIWB_CWD -eq $AIWB_WORKDIR)
}

if ($AIWB_WORKDIR -and -not $AIWB_DIR_MAP.ContainsKey($AIWB_WORKDIR)) {
  $AIWB_MARKERS = @(Get-AiwbPathMarkers $AIWB_WORKDIR)
  if (@($AIWB_MARKERS).Count -gt 0) {
    Add-AiwbDir $AIWB_DIR_MAP $AIWB_WORKDIR $AIWB_MARKERS $null $true
  }
}

$AIWB_DIRS = @($AIWB_DIR_MAP.Values | Sort-Object @{ Expression = { -[int]$_.score } }, @{ Expression = { -[int]$_.latest } }, @{ Expression = { [string]$_.path } } | Select-Object -First 80)
$AIWB_LATEST = 0
foreach ($AIWB_HISTORY in $AIWB_HISTORIES) { $AIWB_LATEST = [Math]::Max($AIWB_LATEST, [int]$AIWB_HISTORY.mtime) }
$AIWB_RESULT = [ordered]@{
  scannedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
  tools = $AIWB_TOOLS
  activeSessions = @()
  history = @{
    codex = @($AIWB_HISTORIES | Where-Object { $_.agent -eq "codex" }).Count
    claude = @($AIWB_HISTORIES | Where-Object { $_.agent -eq "claude" }).Count
    latest = $AIWB_LATEST
  }
  recentSessions = @($AIWB_HISTORIES | Sort-Object @{ Expression = { -[int]$_.mtime } } | Select-Object -First 12)
  conversations = @()
  directories = $AIWB_DIRS
}
Write-Output ("__AIWB_SCAN_JSON__" + ($AIWB_RESULT | ConvertTo-Json -Compress -Depth 8))
`);
}

export function parseDiscovery(output) {
  const match = String(output || "").match(/^__AIWB_SCAN_JSON__(.+)$/m);
  if (!match) {
    return {
      state: "error",
      message: "没有读到扫描结果。",
      tools: [],
      directories: [],
      activeSessions: [],
      recentSessions: [],
      conversations: [],
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
      conversations: [],
      history: { codex: 0, claude: 0 },
    };
  }
}

export function normalizeDiscovery(value) {
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
          latest: Number(item.latest || 0),
        }))
        .filter((item) => {
          const historyCount = Number(item.history?.codex || 0) + Number(item.history?.claude || 0);
          const markers = Array.isArray(item.markers) ? item.markers : [];
          if (historyCount > 0 || markers.includes("history") || markers.includes("active")) return true;
          return Boolean(item.current && markers.length);
        })
    : [];

  return {
    state: "done",
    scannedAt: value?.scannedAt || new Date().toLocaleString(),
    tools: Array.isArray(value?.tools) ? value.tools : [],
    directories,
    activeSessions: Array.isArray(value?.activeSessions) ? value.activeSessions : [],
    recentSessions: Array.isArray(value?.recentSessions)
      ? value.recentSessions
          .map((item) => ({
            agent: item?.agent === "claude" ? "claude" : "codex",
            agentId: item?.agent === "claude" || item?.agentId === "claude" ? "claude" : "codex",
            path: String(item?.path || "").trim(),
            sessionId: String(item?.sessionId || item?.session_id || "").trim(),
            title: String(item?.title || item?.name || "").trim(),
            cwd: String(item?.cwd || item?.workdir || "").trim(),
            model: String(item?.model || "").trim(),
            mtime: Number(item?.mtime || 0),
            lastUser: clipPersistedText(item?.lastUser || item?.last_user || "", 2000),
            lastAssistant: clipPersistedText(item?.lastAssistant || item?.last_assistant || "", 2000),
          }))
          .filter((item) => item.cwd)
      : [],
    conversations: Array.isArray(value?.conversations)
      ? value.conversations
          .map((item) => ({
            id: String(item?.id || "").trim(),
            name: String(item?.name || "").trim(),
            title: String(item?.title || item?.name || "").trim(),
            workdir: String(item?.workdir || item?.cwd || "").trim(),
            agentId: item?.agentId === "claude" || item?.agent === "claude" ? "claude" : "codex",
            status: String(item?.status || "unknown").trim(),
            taskId: String(item?.taskId || item?.task_id || "").trim(),
            createdAt: String(item?.createdAt || item?.created_at || "").trim(),
            updatedAt: String(item?.updatedAt || item?.updated_at || "").trim(),
            startedAt: String(item?.startedAt || item?.started_at || "").trim(),
            finishedAt: String(item?.finishedAt || item?.finished_at || "").trim(),
            exitCode: String(item?.exitCode || item?.exit_code || "").trim(),
            lastPrompt: clipPersistedText(item?.lastPrompt || item?.last_prompt || "", 12_000),
            lastResult: clipPersistedText(item?.lastResult || item?.last_result || "", 30_000),
            mtime: Number(item?.mtime || 0) || timestampFromAgentTime(item?.updatedAt || item?.updated_at || item?.finishedAt || item?.finished_at),
          }))
          .filter((item) => item.id && item.workdir)
      : [],
    history: {
      codex: Number(value?.history?.codex || 0),
      claude: Number(value?.history?.claude || 0),
      latest: Number(value?.history?.latest || 0),
    },
  };
}

export function displayMarker(marker) {
  const value = String(marker || "").trim();
  if (!value || value.includes("\uFFFD")) return "";
  return markerLabels[value] || value;
}

export function displayMarkers(markers) {
  return (Array.isArray(markers) ? markers : []).map(displayMarker).filter(Boolean);
}

export function directoryUsageBadge(item, agentId) {
  const count = Number(item?.history?.[agentId] || 0);
  const latest = Number(item?.latest || 0);
  const recentCutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  if (count >= 3) return "常用";
  if (latest && latest >= recentCutoff) return "最近使用";
  return "";
}

export function buildCodexExecCommand(profile, agent, prompt) {
  if (isWindowsProfile(profile)) return buildWindowsCodexExecCommand(profile, agent, prompt);

  const encodedPrompt = toBase64Utf8(formatAgentPrompt(prompt));
  const command = agentCommand(profile, agent);
  const commandProbe = commandName(command);
  const commandFallback = commandProbe.split("/").filter(Boolean).at(-1) || "codex";
  const stateDir = `${String(profile.workdir || ".").replace(/\/+$/, "")}/.ai-workbench`;
  const sessionFile = `${stateDir}/${sanitizeId(sessionName(profile, agent.id))}.session`;
  const model = selectedAgentModel(profile, agent);

  return remoteBashCommand(profile, `
set -e
mkdir -p ${shQuote(profile.workdir)}
mkdir -p ${shQuote(stateDir)}
cd ${shQuote(profile.workdir)}

AIWB_PROMPT=$(printf '%s' ${shQuote(encodedPrompt)} | base64 -d)
AIWB_OUTPUT=$(mktemp /tmp/aiwb-codex-output.XXXXXX)
AIWB_LOG=$(mktemp /tmp/aiwb-codex-log.XXXXXX)
AIWB_SESSION=""
AIWB_COMMAND=${shQuote(command)}
AIWB_MODEL=${shQuote(model)}
if ! [ -x "$AIWB_COMMAND" ] && ! command -v "$AIWB_COMMAND" >/dev/null 2>&1; then
  AIWB_FALLBACK=$(command -v ${shQuote(commandFallback)} 2>/dev/null || true)
  if [ -n "$AIWB_FALLBACK" ]; then
    AIWB_COMMAND="$AIWB_FALLBACK"
  fi
fi
if ! [ -x "$AIWB_COMMAND" ] && ! command -v "$AIWB_COMMAND" >/dev/null 2>&1; then
  printf '没有找到 Codex 命令：%s\\n' "$AIWB_COMMAND"
  printf '请在会话设置里把 Codex 命令改成真实路径，或确认远端 PATH 中可以直接运行 codex。\\n'
  exit 127
fi
if [ -s ${shQuote(sessionFile)} ]; then
  AIWB_SESSION=$(cat ${shQuote(sessionFile)} 2>/dev/null | tr -d '[:space:]' || true)
fi

AIWB_MODEL_ARGS=()
if [ -n "$AIWB_MODEL" ]; then
  AIWB_MODEL_ARGS=(--model "$AIWB_MODEL")
fi

set +e
if printf '%s' "$AIWB_SESSION" | grep -Eq '^[0-9a-fA-F-]{36}$'; then
  "$AIWB_COMMAND" exec "\${AIWB_MODEL_ARGS[@]}" --skip-git-repo-check --sandbox danger-full-access --cd ${shQuote(profile.workdir)} --output-last-message "$AIWB_OUTPUT" resume "$AIWB_SESSION" "$AIWB_PROMPT" >"$AIWB_LOG" 2>&1
else
  "$AIWB_COMMAND" exec "\${AIWB_MODEL_ARGS[@]}" --skip-git-repo-check --sandbox danger-full-access --cd ${shQuote(profile.workdir)} --output-last-message "$AIWB_OUTPUT" "$AIWB_PROMPT" >"$AIWB_LOG" 2>&1
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

export function buildWindowsCodexExecCommand(profile, agent, prompt) {
  const encodedPrompt = toBase64Utf8(formatAgentPrompt(prompt));
  const command = agentCommand(profile, agent) || "codex";
  const stateDir = joinWindowsPath(profile.workdir, ".ai-workbench");
  const sessionFile = joinWindowsPath(stateDir, `${sanitizeId(sessionName(profile, agent.id))}.session`);
  const model = selectedAgentModel(profile, agent);

  return powershellStdinCommand(`
$AIWB_WORKDIR = ${psQuote(profile.workdir)}
$AIWB_STATE_DIR = ${psQuote(stateDir)}
$AIWB_SESSION_FILE = ${psQuote(sessionFile)}
New-Item -ItemType Directory -Force -Path $AIWB_WORKDIR | Out-Null
New-Item -ItemType Directory -Force -Path $AIWB_STATE_DIR | Out-Null
Set-Location -LiteralPath $AIWB_WORKDIR

$AIWB_PROMPT = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(${psQuote(encodedPrompt)}))
$AIWB_OUTPUT = Join-Path $env:TEMP ("aiwb-codex-output-" + [guid]::NewGuid().ToString() + ".txt")
$AIWB_LOG = Join-Path $env:TEMP ("aiwb-codex-log-" + [guid]::NewGuid().ToString() + ".log")
$AIWB_MODEL = ${psQuote(model)}
$AIWB_COMMAND = ${psQuote(command)}
if ($AIWB_COMMAND -and (-not (Test-Path -LiteralPath $AIWB_COMMAND -PathType Leaf))) {
  $AIWB_COMMAND_PROBE = Get-Command $AIWB_COMMAND -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($AIWB_COMMAND_PROBE) { $AIWB_COMMAND = $AIWB_COMMAND_PROBE.Source }
}
if ($AIWB_COMMAND -and $AIWB_COMMAND.EndsWith(".ps1")) {
  $AIWB_CMD_SIBLING = [IO.Path]::ChangeExtension($AIWB_COMMAND, ".cmd")
  if (Test-Path -LiteralPath $AIWB_CMD_SIBLING -PathType Leaf) { $AIWB_COMMAND = $AIWB_CMD_SIBLING }
}
if ($AIWB_COMMAND -and ([IO.Path]::GetExtension($AIWB_COMMAND) -match "^\.(ps1|cmd)$")) {
  $AIWB_NPM_DIR = Split-Path -Parent $AIWB_COMMAND
  $AIWB_CODEX_PACKAGE = Join-Path $AIWB_NPM_DIR "node_modules\@openai\codex"
  if (Test-Path -LiteralPath $AIWB_CODEX_PACKAGE -PathType Container) {
    $AIWB_NATIVE_COMMAND = Get-ChildItem -LiteralPath $AIWB_CODEX_PACKAGE -Recurse -Filter "codex.exe" -File -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
    if ($AIWB_NATIVE_COMMAND) { $AIWB_COMMAND = $AIWB_NATIVE_COMMAND }
  }
}
if (-not $AIWB_COMMAND -or (-not (Test-Path -LiteralPath $AIWB_COMMAND -PathType Leaf))) {
  throw "没有找到 Codex 命令：$AIWB_COMMAND"
}
$AIWB_SESSION = ""
if (Test-Path -LiteralPath $AIWB_SESSION_FILE) {
  $AIWB_SESSION = (Get-Content -LiteralPath $AIWB_SESSION_FILE -Raw -ErrorAction SilentlyContinue).Trim()
}

$AIWB_ARGS = @("exec")
if ($AIWB_MODEL) {
  $AIWB_ARGS += @("--model", $AIWB_MODEL)
}
$AIWB_ARGS += @("--skip-git-repo-check", "--sandbox", "danger-full-access", "--cd", $AIWB_WORKDIR, "--output-last-message", $AIWB_OUTPUT, "--color", "never")
if ($AIWB_SESSION -match "^[0-9a-fA-F-]{36}$") {
  $AIWB_ARGS += @("resume", $AIWB_SESSION, $AIWB_PROMPT)
} else {
  $AIWB_ARGS += @($AIWB_PROMPT)
}

$AIWB_PREVIOUS_ERROR_ACTION = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $AIWB_COMMAND @AIWB_ARGS *> $AIWB_LOG
$AIWB_STATUS = $LASTEXITCODE
$ErrorActionPreference = $AIWB_PREVIOUS_ERROR_ACTION
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

export function buildClaudePrintCommand(profile, agent, prompt) {
  if (isWindowsProfile(profile)) return buildWindowsUnsupportedAgentCommand(agent);

  const encodedPrompt = toBase64Utf8(formatAgentPrompt(prompt));
  const command = agentCommand(profile, agent);
  const commandProbe = commandName(command);
  const commandFallback = commandProbe.split("/").filter(Boolean).at(-1) || "claude";
  const stateDir = `${String(profile.workdir || ".").replace(/\/+$/, "")}/.ai-workbench`;
  const sessionFile = `${stateDir}/${sanitizeId(sessionName(profile, agent.id))}.claude-session`;
  const model = selectedAgentModel(profile, agent);

  return remoteBashCommand(profile, `
set -e
mkdir -p ${shQuote(profile.workdir)}
mkdir -p ${shQuote(stateDir)}
cd ${shQuote(profile.workdir)}

export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1
AIWB_PROMPT=$(printf '%s' ${shQuote(encodedPrompt)} | base64 -d)
AIWB_OUTPUT=$(mktemp /tmp/aiwb-claude-output.XXXXXX)
AIWB_LOG=$(mktemp /tmp/aiwb-claude-log.XXXXXX)
AIWB_SESSION=""
AIWB_COMMAND=${shQuote(command)}
AIWB_MODEL=${shQuote(model)}
if ! [ -x "$AIWB_COMMAND" ] && ! command -v "$AIWB_COMMAND" >/dev/null 2>&1; then
  AIWB_FALLBACK=$(command -v ${shQuote(commandFallback)} 2>/dev/null || true)
  if [ -n "$AIWB_FALLBACK" ]; then
    AIWB_COMMAND="$AIWB_FALLBACK"
  fi
fi
if ! [ -x "$AIWB_COMMAND" ] && ! command -v "$AIWB_COMMAND" >/dev/null 2>&1; then
  printf '没有找到 Claude 命令：%s\\n' "$AIWB_COMMAND"
  printf '请在会话设置里把 Claude 命令改成真实路径，或确认远端 PATH 中可以直接运行 claude。\\n'
  exit 127
fi
if [ -s ${shQuote(sessionFile)} ]; then
  AIWB_SESSION=$(cat ${shQuote(sessionFile)} 2>/dev/null | tr -d '[:space:]' || true)
fi

AIWB_ARGS=(-p "$AIWB_PROMPT" --output-format json --permission-mode acceptEdits)
if [ -n "$AIWB_MODEL" ]; then
  AIWB_ARGS+=(--model "$AIWB_MODEL")
fi
if [ -n "$AIWB_SESSION" ]; then
  AIWB_ARGS+=(--resume "$AIWB_SESSION")
fi

set +e
"$AIWB_COMMAND" "\${AIWB_ARGS[@]}" >"$AIWB_OUTPUT" 2>"$AIWB_LOG"
AIWB_STATUS=$?
set -e

if [ "$AIWB_STATUS" -ne 0 ]; then
  cat "$AIWB_LOG"
  cat "$AIWB_OUTPUT"
  rm -f "$AIWB_OUTPUT" "$AIWB_LOG"
  exit "$AIWB_STATUS"
fi

if command -v python3 >/dev/null 2>&1; then
  python3 - "$AIWB_OUTPUT" ${shQuote(sessionFile)} <<'PY'
import json
import sys

output_path, session_path = sys.argv[1], sys.argv[2]
raw = open(output_path, "r", encoding="utf-8", errors="replace").read().strip()
result = raw
session_id = ""

try:
    data = json.loads(raw)
    session_id = str(data.get("session_id") or data.get("sessionId") or "").strip()
    result = data.get("result") or data.get("response") or data.get("text") or data.get("message") or raw
    if isinstance(result, (dict, list)):
        result = json.dumps(result, ensure_ascii=False, indent=2)
except Exception:
    pass

print("__AIWB_RESPONSE_START__")
print(str(result or "").strip())
print("__AIWB_RESPONSE_END__")
if session_id:
    with open(session_path, "w", encoding="utf-8") as handle:
        handle.write(session_id + "\\n")
    print("__AIWB_SESSION__" + session_id)
PY
else
  printf '__AIWB_RESPONSE_START__\\n'
  cat "$AIWB_OUTPUT"
  printf '\\n__AIWB_RESPONSE_END__\\n'
fi

rm -f "$AIWB_OUTPUT" "$AIWB_LOG"
`);
}

export function claudeSetupAutomationSnippet(targetSession) {
  return `
for AIWB_CLAUDE_SETUP_TRY in 1 2 3 4 5 6 7 8 9 10; do
  AIWB_CLAUDE_SETUP_PANE=$(tmux capture-pane -t ${shQuote(targetSession)} -p 2>/dev/null || true)
  if printf '%s' "$AIWB_CLAUDE_SETUP_PANE" | grep -Fq 'Choose the text style that looks best with your terminal' &&
     printf '%s' "$AIWB_CLAUDE_SETUP_PANE" | grep -Fq 'To change this later, run /theme'; then
    tmux send-keys -t ${shQuote(targetSession)} C-m
    sleep 1.2
    continue
  fi
  if printf '%s' "$AIWB_CLAUDE_SETUP_PANE" | grep -Fq 'Select login method:' &&
     printf '%s' "$AIWB_CLAUDE_SETUP_PANE" | grep -Fq 'Claude account with subscription'; then
    tmux send-keys -t ${shQuote(targetSession)} C-m
    sleep 1.2
    continue
  fi
  if printf '%s' "$AIWB_CLAUDE_SETUP_PANE" | grep -Eiq 'Do you trust|trust the files' &&
     printf '%s' "$AIWB_CLAUDE_SETUP_PANE" | grep -Eiq 'Yes|Proceed|Continue'; then
    tmux send-keys -t ${shQuote(targetSession)} C-m
    sleep 1.2
    continue
  fi
  if printf '%s' "$AIWB_CLAUDE_SETUP_PANE" | grep -Eiq 'press (enter|return) to continue|continue.*press (enter|return)' &&
     printf '%s' "$AIWB_CLAUDE_SETUP_PANE" | grep -Fq 'Claude'; then
    tmux send-keys -t ${shQuote(targetSession)} C-m
    sleep 1.2
    continue
  fi
  break
done
`;
}

export function buildAgentSendCommand(profile, agent, prompt) {
  if (agent.id === "codex") return buildCodexExecCommand(profile, agent, prompt);
  if (agent.id === "claude") return buildClaudePrintCommand(profile, agent, prompt);
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

${agent.id === "claude" ? claudeSetupAutomationSnippet(targetSession) : ""}

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

export function buildAgentTaskCommand(profile, agent, prompt) {
  if (!isWindowsProfile(profile)) return buildAgentSendCommand(profile, agent, prompt);

  const kind = agent.id === "claude" ? "claude" : "codex";
  const command = agentCommand(profile, agent) || kind;
  const stateDir = joinWindowsPath(profile.workdir || ".", ".ai-workbench");
  const suffix = kind === "claude" ? ".claude-session" : ".session";
  const sessionFile = joinWindowsPath(stateDir, `${sanitizeId(sessionName(profile, agent.id))}${suffix}`);
  return {
    kind,
    command,
    workdir: String(profile.workdir || ".").trim(),
    model: selectedAgentModel(profile, agent),
    prompt: formatAgentPrompt(prompt),
    sessionFile,
  };
}

export function buildWindowsUnsupportedAgentCommand(agent) {
  return powershellCommand(`
Write-Output "${agent.shortName} 在 Windows PowerShell 模式暂时不能使用持续会话。"
Write-Output "如果要在 Windows 服务器上使用 ${agent.shortName}，请选择 Windows + WSL 模式，或把工具安装到 WSL/Linux 环境。"
exit 64
`);
}

export function buildCodexLoginDeviceCommand(profile, agent) {
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

export function buildModelChoiceCommand(profile, agent, choice) {
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

export function buildCaptureCommand(profile, agent) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("Windows PowerShell 模式使用一次性任务，没有可刷新的 tmux 会话。");
  if (agent.id === "claude") {
    return remoteBashCommand(profile, `
printf 'Claude 当前使用非交互模式：任务会直接等待最终结果返回，不需要刷新 tmux 输出。\\n'
`);
  }

  const targetSession = sessionName(profile, agent.id);
  return remoteBashCommand(profile, `
if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  ${agent.id === "claude" ? claudeSetupAutomationSnippet(targetSession) : ""}
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -260
else
  printf 'tmux session not running: %s\\n' ${shQuote(targetSession)}
fi
`);
}

export function buildInterruptCommand(profile, agent) {
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

export function buildKillCommand(profile, agent) {
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

export function buildWindowsNoTmuxCommand(message) {
  return powershellCommand(`
Write-Output ${psQuote(message)}
`);
}
