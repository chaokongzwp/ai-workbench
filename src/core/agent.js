import * as Foundation from "./foundation.js";

export const latestWorkbenchAgentVersion = "12";
export const workbenchAgentGithubRepo = "chaokongzwp/ai-workbench";
export const workbenchAgentGithubBranch = "main";
export const workbenchAgentGithubRawBaseUrl = `https://raw.githubusercontent.com/${workbenchAgentGithubRepo}/${workbenchAgentGithubBranch}`;
export const workbenchAgentGithubManifestUrl = `${workbenchAgentGithubRawBaseUrl}/agent/latest.json`;
export const workbenchAgentOssBucket = "limpet-ai-workbench-47t37ccfz2";
export const workbenchAgentOssEndpoint = "oss-ap-southeast-1.aliyuncs.com";
export const workbenchAgentOssBaseUrl = `https://${workbenchAgentOssBucket}.${workbenchAgentOssEndpoint}`;
export const workbenchAgentManifestUrl = workbenchAgentGithubManifestUrl;

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
  parsePlaybackCommandIndex,
  parseSessionSelectionKey,
  parseSessionSwitchIndex,
  parseSmallChineseNumber,
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
  workdirDisplayName,
  workspaceDiagnosticSummary,
  workspaceMirrorStorageKey,
  workspaceStoreHasServers
} = { ...Foundation };

export function workbenchAgentScript() {
  return `#!/usr/bin/env bash
AIWB_USER_HOME="$(cd ~ 2>/dev/null && pwd || pwd)"
set -u

AIWB_HOME="$AIWB_USER_HOME/.ai-workbench/agent"
AIWB_TASKS="$AIWB_HOME/tasks"
AIWB_CONVERSATIONS="$AIWB_HOME/conversations"
AIWB_CONVERSATION_LOCKS="$AIWB_HOME/conversation-locks"
AIWB_VERSION="${latestWorkbenchAgentVersion}"
AIWB_DAEMON_PID="$AIWB_HOME/daemon.pid"
AIWB_DAEMON_LOG="$AIWB_HOME/daemon.log"
AIWB_DAEMON_HEARTBEAT="$AIWB_HOME/daemon.heartbeat"
AIWB_TICK_LOCK="$AIWB_HOME/tick.lock"
AIWB_MAX_CONCURRENCY="4"
mkdir -p "$AIWB_TASKS" "$AIWB_CONVERSATIONS" "$AIWB_CONVERSATION_LOCKS"

aiwb_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

aiwb_task_dir() {
  printf "%s/%s\\n" "$AIWB_TASKS" "$1"
}

aiwb_safe_id() {
  printf "%s\\n" "$1" | sed 's/[^A-Za-z0-9_.-]/-/g' | sed 's/--*/-/g' | cut -c 1-120
}

aiwb_conversation_dir() {
  local conversation_id
  conversation_id="$(aiwb_safe_id "$1")"
  printf "%s/%s\\n" "$AIWB_CONVERSATIONS" "$conversation_id"
}

aiwb_write_file() {
  local path="$1"
  shift
  printf "%s\\n" "$*" > "$path"
}

aiwb_append_log() {
  printf "[%s] %s\\n" "$(aiwb_now)" "$*" >> "$AIWB_DAEMON_LOG"
}

aiwb_update_conversation_from_task() {
  local task_dir="$1"
  local conversation_id
  local conversation_dir
  local status

  conversation_id="$(cat "$task_dir/conversation_id" 2>/dev/null || printf "")"
  [ -n "$conversation_id" ] || return 0

  conversation_dir="$(aiwb_conversation_dir "$conversation_id")"
  mkdir -p "$conversation_dir"
  aiwb_write_file "$conversation_dir/id" "$conversation_id"
  aiwb_write_file "$conversation_dir/task_id" "$(basename "$task_dir")"
  aiwb_write_file "$conversation_dir/status" "$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
  aiwb_write_file "$conversation_dir/updated_at" "$(aiwb_now)"

  for name in name workdir agent_id created_at started_at runner_started_at finished_at exit_code; do
    if [ -f "$task_dir/$name" ]; then
      cp "$task_dir/$name" "$conversation_dir/$name" 2>/dev/null || true
    fi
  done
  if [ -f "$task_dir/prompt.txt" ]; then
    cp "$task_dir/prompt.txt" "$conversation_dir/last_prompt.txt" 2>/dev/null || true
  fi

  status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
  if [ "$status" = "done" ] || [ "$status" = "error" ] || [ "$status" = "cancelled" ]; then
    if [ -s "$task_dir/output.log" ]; then
      cp "$task_dir/output.log" "$conversation_dir/last_result.txt" 2>/dev/null || true
    elif [ -s "$task_dir/bootstrap.log" ]; then
      cp "$task_dir/bootstrap.log" "$conversation_dir/last_result.txt" 2>/dev/null || true
    fi
  fi
}

aiwb_set_status() {
  local task_dir="$1"
  local status="$2"
  local exit_code="$3"
  aiwb_write_file "$task_dir/status" "$status"
  aiwb_write_file "$task_dir/exit_code" "$exit_code"
  if [ "$status" = "done" ] || [ "$status" = "error" ] || [ "$status" = "cancelled" ]; then
    aiwb_write_file "$task_dir/finished_at" "$(aiwb_now)"
  fi
  aiwb_update_conversation_from_task "$task_dir"
}

aiwb_task_age_seconds() {
  local started_at="$1"
  local start_epoch
  local now_epoch
  start_epoch="$(date -u -d "$started_at" +%s 2>/dev/null || printf 0)"
  now_epoch="$(date -u +%s)"
  if [ "$start_epoch" -gt 0 ] 2>/dev/null; then
    printf "%s\\n" "$((now_epoch - start_epoch))"
  else
    printf "999999\\n"
  fi
}

aiwb_path_mtime_epoch() {
  local path="$1"
  stat -c %Y "$path" 2>/dev/null || date -u -r "$path" +%s 2>/dev/null || printf 0
}

aiwb_clear_stale_tick_lock() {
  local lock_epoch
  local now_epoch
  local age
  [ -d "$AIWB_TICK_LOCK" ] || return 0

  lock_epoch="$(aiwb_path_mtime_epoch "$AIWB_TICK_LOCK")"
  now_epoch="$(date -u +%s)"
  age="$((now_epoch - lock_epoch))"
  if [ "$lock_epoch" -gt 0 ] 2>/dev/null && [ "$age" -gt 30 ] 2>/dev/null; then
    rm -f "$AIWB_TICK_LOCK/owner.pid" "$AIWB_TICK_LOCK/started_at" 2>/dev/null || true
    if rmdir "$AIWB_TICK_LOCK" 2>/dev/null; then
      aiwb_append_log "cleared stale tick lock age=\${age}s"
    fi
  fi
}

aiwb_daemon_alive() {
  local pid
  pid="$(cat "$AIWB_DAEMON_PID" 2>/dev/null || printf "")"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

aiwb_task_pid_alive() {
  local task_dir="$1"
  local pid
  pid="$(cat "$task_dir/pid" 2>/dev/null || printf "")"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

aiwb_task_attempts() {
  local task_dir="$1"
  cat "$task_dir/attempts" 2>/dev/null || printf 0
}

aiwb_next_attempt() {
  local task_dir="$1"
  local attempts
  attempts="$(aiwb_task_attempts "$task_dir")"
  attempts="$((attempts + 1))"
  aiwb_write_file "$task_dir/attempts" "$attempts"
  printf "%s\\n" "$attempts"
}

aiwb_mark_stale_if_needed() {
  local task_dir="$1"
  local status
  local started_at
  local age
  local pid

  status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
  [ "$status" = "running" ] || return 0

  started_at="$(cat "$task_dir/started_at" 2>/dev/null || printf "")"
  age="$(aiwb_task_age_seconds "$started_at")"
  [ "$age" -ge 8 ] 2>/dev/null || return 0

  if aiwb_task_pid_alive "$task_dir"; then
    return 0
  fi

  pid="$(cat "$task_dir/pid" 2>/dev/null || printf "")"
  {
    printf "AI Workbench Agent: task was marked running, but the runner process is not alive.\\n"
    if [ -n "$pid" ]; then
      printf "runner pid: %s\\n" "$pid"
    else
      printf "runner pid: missing\\n"
    fi
    if [ -s "$task_dir/launcher.log" ]; then
      printf "launcher log:\\n"
      cat "$task_dir/launcher.log"
      printf "\\n"
    fi
    printf "checked_at: %s\\n" "$(aiwb_now)"
  } >> "$task_dir/bootstrap.log"
  aiwb_set_status "$task_dir" "error" "124"
}

aiwb_mark_queued_stale_if_needed() {
  local task_dir="$1"
  local status
  local queued_at
  local age

  status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
  [ "$status" = "queued" ] || return 0

  queued_at="$(cat "$task_dir/queued_at" 2>/dev/null || cat "$task_dir/created_at" 2>/dev/null || printf "")"
  age="$(aiwb_task_age_seconds "$queued_at")"
  [ "$age" -ge 8 ] 2>/dev/null || return 0

  if aiwb_daemon_alive; then
    return 0
  fi

  {
    printf "AI Workbench Agent: daemon is not running; queued task cannot start.\\n"
    printf "checked_at: %s\\n" "$(aiwb_now)"
  } >> "$task_dir/bootstrap.log"
  aiwb_set_status "$task_dir" "error" "125"
}

aiwb_write_runner_script() {
  local task_dir="$1"
  cat > "$task_dir/run.sh" <<'AIWB_AGENT_RUNNER'
#!/usr/bin/env bash
set +e
AIWB_TASK_DIR="$1"

aiwb_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

aiwb_write_file() {
  local path="$1"
  shift
  printf "%s\\n" "$*" > "$path"
}

aiwb_safe_id() {
  printf "%s\\n" "$1" | sed 's/[^A-Za-z0-9_.-]/-/g' | sed 's/--*/-/g' | cut -c 1-120
}

aiwb_update_conversation_from_task() {
  local conversation_id
  local conversation_dir
  local status
  local aiwb_home
  local aiwb_conversations

  conversation_id="$(cat "$AIWB_TASK_DIR/conversation_id" 2>/dev/null || printf "")"
  [ -n "$conversation_id" ] || return 0

  aiwb_home="$(cd "$AIWB_TASK_DIR/../.." 2>/dev/null && pwd || printf "")"
  [ -n "$aiwb_home" ] || return 0
  aiwb_conversations="$aiwb_home/conversations"
  mkdir -p "$aiwb_conversations"
  conversation_dir="$aiwb_conversations/$(aiwb_safe_id "$conversation_id")"
  mkdir -p "$conversation_dir"

  aiwb_write_file "$conversation_dir/id" "$conversation_id"
  aiwb_write_file "$conversation_dir/task_id" "$(basename "$AIWB_TASK_DIR")"
  aiwb_write_file "$conversation_dir/status" "$(cat "$AIWB_TASK_DIR/status" 2>/dev/null || printf unknown)"
  aiwb_write_file "$conversation_dir/updated_at" "$(aiwb_now)"

  for name in name workdir agent_id created_at started_at runner_started_at finished_at exit_code; do
    if [ -f "$AIWB_TASK_DIR/$name" ]; then
      cp "$AIWB_TASK_DIR/$name" "$conversation_dir/$name" 2>/dev/null || true
    fi
  done
  if [ -f "$AIWB_TASK_DIR/prompt.txt" ]; then
    cp "$AIWB_TASK_DIR/prompt.txt" "$conversation_dir/last_prompt.txt" 2>/dev/null || true
  fi

  status="$(cat "$AIWB_TASK_DIR/status" 2>/dev/null || printf unknown)"
  if [ "$status" = "done" ] || [ "$status" = "error" ] || [ "$status" = "cancelled" ]; then
    if [ -s "$AIWB_TASK_DIR/output.log" ]; then
      cp "$AIWB_TASK_DIR/output.log" "$conversation_dir/last_result.txt" 2>/dev/null || true
    elif [ -s "$AIWB_TASK_DIR/bootstrap.log" ]; then
      cp "$AIWB_TASK_DIR/bootstrap.log" "$conversation_dir/last_result.txt" 2>/dev/null || true
    fi
  fi
}

aiwb_set_status() {
  local status="$1"
  local exit_code="$2"
  aiwb_write_file "$AIWB_TASK_DIR/status" "$status"
  aiwb_write_file "$AIWB_TASK_DIR/exit_code" "$exit_code"
  if [ "$status" = "done" ] || [ "$status" = "error" ] || [ "$status" = "cancelled" ]; then
    aiwb_write_file "$AIWB_TASK_DIR/finished_at" "$(aiwb_now)"
  fi
  aiwb_update_conversation_from_task
}

aiwb_write_file "$AIWB_TASK_DIR/runner_started_at" "$(aiwb_now)"
: > "$AIWB_TASK_DIR/output.log"
AIWB_DECODED_COMMAND="$(base64 -d < "$AIWB_TASK_DIR/command.b64" 2>"$AIWB_TASK_DIR/bootstrap.log")"
AIWB_DECODE_STATUS=$?
if [ "$AIWB_DECODE_STATUS" -ne 0 ] || [ -z "$AIWB_DECODED_COMMAND" ]; then
  printf "AI Workbench Agent: command payload decode failed.\\n" >> "$AIWB_TASK_DIR/bootstrap.log"
  aiwb_set_status "error" "$AIWB_DECODE_STATUS"
  exit 0
fi

eval "$AIWB_DECODED_COMMAND" > "$AIWB_TASK_DIR/output.log" 2>&1
AIWB_EXIT_CODE=$?
if [ "$AIWB_EXIT_CODE" -eq 0 ]; then
  aiwb_set_status "done" "$AIWB_EXIT_CODE"
else
  aiwb_set_status "error" "$AIWB_EXIT_CODE"
fi
AIWB_AGENT_RUNNER
  chmod 700 "$task_dir/run.sh"
}

aiwb_launch_task() {
  local task_dir="$1"
  local task_id
  local attempt

  task_id="$(basename -- "$task_dir")"
  if [ ! -s "$task_dir/command.b64" ]; then
    printf "AI Workbench Agent: missing command payload.\\n" >> "$task_dir/bootstrap.log"
    aiwb_set_status "$task_dir" "error" "2"
    return 0
  fi

  attempt="$(aiwb_next_attempt "$task_dir")"
  aiwb_write_runner_script "$task_dir"
  aiwb_write_file "$task_dir/started_at" "$(aiwb_now)"
  aiwb_set_status "$task_dir" "running" ""
  aiwb_write_file "$task_dir/runner_started_at" ""
  : > "$task_dir/launcher.log"

  nohup bash "$task_dir/run.sh" "$task_dir" >"$task_dir/launcher.log" 2>&1 &
  aiwb_write_file "$task_dir/pid" "$!"
  aiwb_append_log "launched task=$task_id attempt=$attempt pid=$(cat "$task_dir/pid" 2>/dev/null || printf "")"
}

aiwb_running_count() {
  local count
  count=0
  for task_dir in "$AIWB_TASKS"/*; do
    [ -d "$task_dir" ] || continue
    if [ "$(cat "$task_dir/status" 2>/dev/null || printf unknown)" = "running" ] && aiwb_task_pid_alive "$task_dir"; then
      count="$((count + 1))"
    fi
  done
  printf "%s\\n" "$count"
}

aiwb_conversation_active_task() {
  local conversation_id="$1"
  local exclude_task_id=""
  local task_dir
  local task_id
  local task_conversation_id
  local status

  if [ "$#" -gt 1 ]; then
    exclude_task_id="$2"
  fi
  [ -n "$conversation_id" ] || return 1

  for task_dir in "$AIWB_TASKS"/*; do
    [ -d "$task_dir" ] || continue
    task_id="$(basename -- "$task_dir")"
    [ "$task_id" = "$exclude_task_id" ] && continue
    task_conversation_id="$(cat "$task_dir/conversation_id" 2>/dev/null || printf "")"
    [ "$task_conversation_id" = "$conversation_id" ] || continue
    aiwb_mark_queued_stale_if_needed "$task_dir"
    aiwb_mark_stale_if_needed "$task_dir"
    status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
    case "$status" in
      queued|running|preparing)
        printf "%s\\n" "$task_id"
        return 0
        ;;
    esac
  done

  return 1
}

aiwb_print_conversation_busy() {
  local task_id="$1"
  local conversation_id="$2"
  printf "__AIWB_AGENT_STATUS__ready\\n"
  printf "__AIWB_AGENT_VERSION__%s\\n" "$AIWB_VERSION"
  printf "__AIWB_AGENT_DAEMON_STATUS__%s\\n" "$(aiwb_daemon_status)"
  printf "__AIWB_AGENT_TASK_ID__%s\\n" "$task_id"
  printf "__AIWB_AGENT_TASK_CONVERSATION_ID__%s\\n" "$conversation_id"
  printf "__AIWB_AGENT_TASK_STATUS__busy\\n"
  printf "__AIWB_AGENT_BLOCKED_BY_TASK_ID__%s\\n" "$task_id"
  printf "__AIWB_AGENT_BLOCKED_BY_CONVERSATION_ID__%s\\n" "$conversation_id"
  printf "__AIWB_AGENT_TASK_OUTPUT_START__\\n"
  printf "AI Workbench Agent: this conversation already has a queued or running task.\\n"
  if [ -n "$task_id" ]; then
    printf "blocking task id: %s\\n" "$task_id"
  fi
  printf "conversation id: %s\\n" "$conversation_id"
  printf "new task was rejected to avoid concurrent writes in the same AI session.\\n"
  printf "__AIWB_AGENT_TASK_OUTPUT_END__\\n"
}

aiwb_tick_tasks_unlocked() {
  local task_dir
  local status
  local count
  count="$(aiwb_running_count)"

  for task_dir in "$AIWB_TASKS"/*; do
    [ -d "$task_dir" ] || continue
    status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
    case "$status" in
      queued)
        if [ "$count" -lt "$AIWB_MAX_CONCURRENCY" ] 2>/dev/null; then
          aiwb_launch_task "$task_dir"
          count="$((count + 1))"
        fi
        ;;
      running)
        aiwb_mark_stale_if_needed "$task_dir"
        ;;
    esac
  done
}

aiwb_tick_tasks() {
  if ! mkdir "$AIWB_TICK_LOCK" 2>/dev/null; then
    aiwb_clear_stale_tick_lock
    if ! mkdir "$AIWB_TICK_LOCK" 2>/dev/null; then
      return 0
    fi
  fi

  aiwb_write_file "$AIWB_TICK_LOCK/owner.pid" "$$"
  aiwb_write_file "$AIWB_TICK_LOCK/started_at" "$(aiwb_now)"

  aiwb_tick_tasks_unlocked
  local rc="$?"
  rm -f "$AIWB_TICK_LOCK/owner.pid" "$AIWB_TICK_LOCK/started_at" 2>/dev/null || true
  rmdir "$AIWB_TICK_LOCK" 2>/dev/null || true
  return "$rc"
}

aiwb_daemon_loop() {
  aiwb_write_file "$AIWB_DAEMON_PID" "$$"
  aiwb_append_log "daemon started pid=$$ version=$AIWB_VERSION"
  trap 'aiwb_append_log "daemon stopped"; rm -f "$AIWB_DAEMON_PID"; exit 0' INT TERM EXIT
  while true; do
    aiwb_write_file "$AIWB_DAEMON_HEARTBEAT" "$(aiwb_now)"
    aiwb_tick_tasks
    sleep 1
  done
}

aiwb_start_daemon() {
  if aiwb_daemon_alive; then
    return 0
  fi
  nohup "$0" daemon >> "$AIWB_DAEMON_LOG" 2>&1 &
  sleep 0.25
  if aiwb_daemon_alive; then
    return 0
  fi
  printf "AI Workbench Agent: daemon did not start.\\n" >> "$AIWB_DAEMON_LOG"
  return 1
}

aiwb_daemon_status() {
  if aiwb_daemon_alive; then
    printf "running\\n"
  else
    printf "stopped\\n"
  fi
}

aiwb_service_status() {
  local state
  if ! command -v systemctl >/dev/null 2>&1; then
    printf "unsupported\\n"
    return 0
  fi

  state="$(systemctl is-active ai-workbench-agent.service 2>/dev/null || true)"
  if [ -z "$state" ]; then
    state="inactive"
  fi
  printf "%s\\n" "$state"
}

aiwb_task_count() {
  local target="$1"
  local count="0"
  local task_dir
  for task_dir in "$AIWB_TASKS"/*; do
    [ -d "$task_dir" ] || continue
    if [ "$(cat "$task_dir/status" 2>/dev/null || printf unknown)" = "$target" ]; then
      count="$((count + 1))"
    fi
  done
  printf "%s\\n" "$count"
}

aiwb_host_metrics() {
  local cpu_percent=""
  local mem_total_kb=""
  local mem_available_kb=""
  local mem_used_kb=""
  local mem_percent=""
  local disk_line=""
  local disk_total_kb=""
  local disk_used_kb=""
  local disk_percent=""
  local uptime_seconds=""
  local process_count=""
  local load_avg=""

  if [ -r /proc/stat ]; then
    local cpu_a cpu_b user nice system idle iowait irq softirq steal guest guest_nice
    local total_a idle_a total_b idle_b total_delta idle_delta
    read -r _ user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat || true
    total_a="$((user + nice + system + idle + iowait + irq + softirq + steal))"
    idle_a="$((idle + iowait))"
    sleep 0.12
    read -r _ user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat || true
    total_b="$((user + nice + system + idle + iowait + irq + softirq + steal))"
    idle_b="$((idle + iowait))"
    total_delta="$((total_b - total_a))"
    idle_delta="$((idle_b - idle_a))"
    if [ "$total_delta" -gt 0 ] 2>/dev/null; then
      cpu_percent="$(awk -v total="$total_delta" -v idle="$idle_delta" 'BEGIN { printf "%.1f", (total - idle) * 100 / total }')"
    fi
  fi

  if [ -r /proc/meminfo ]; then
    mem_total_kb="$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)"
    mem_available_kb="$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)"
    if [ -n "$mem_total_kb" ] && [ -n "$mem_available_kb" ] && [ "$mem_total_kb" -gt 0 ] 2>/dev/null; then
      mem_used_kb="$((mem_total_kb - mem_available_kb))"
      mem_percent="$(awk -v used="$mem_used_kb" -v total="$mem_total_kb" 'BEGIN { printf "%.1f", used * 100 / total }')"
    fi
  fi

  disk_line="$(df -Pk "$AIWB_USER_HOME" 2>/dev/null | awk 'NR==2 { print $2 " " $3 " " $5 }')"
  if [ -n "$disk_line" ]; then
    disk_total_kb="$(printf "%s\\n" "$disk_line" | awk '{ print $1 }')"
    disk_used_kb="$(printf "%s\\n" "$disk_line" | awk '{ print $2 }')"
    disk_percent="$(printf "%s\\n" "$disk_line" | awk '{ gsub(/%/, "", $3); print $3 }')"
  fi

  if [ -r /proc/loadavg ]; then
    load_avg="$(awk '{ print $1 "," $2 "," $3 }' /proc/loadavg)"
  else
    load_avg="$(uptime 2>/dev/null | sed 's/.*load averages*: *//' | tr -d ' ' | tr ' ' ',' || true)"
  fi

  if [ -r /proc/uptime ]; then
    uptime_seconds="$(awk '{ printf "%d", $1 }' /proc/uptime)"
  fi
  process_count="$(ps -e 2>/dev/null | wc -l | tr -d '[:space:]' || true)"

  printf "__AIWB_AGENT_HOST_CPU_PERCENT__%s\\n" "$cpu_percent"
  printf "__AIWB_AGENT_HOST_MEM_PERCENT__%s\\n" "$mem_percent"
  printf "__AIWB_AGENT_HOST_MEM_USED_MB__%s\\n" "$(awk -v kb="$mem_used_kb" 'BEGIN { if (kb != "") printf "%.0f", kb / 1024 }')"
  printf "__AIWB_AGENT_HOST_MEM_TOTAL_MB__%s\\n" "$(awk -v kb="$mem_total_kb" 'BEGIN { if (kb != "") printf "%.0f", kb / 1024 }')"
  printf "__AIWB_AGENT_HOST_DISK_PERCENT__%s\\n" "$disk_percent"
  printf "__AIWB_AGENT_HOST_DISK_USED_GB__%s\\n" "$(awk -v kb="$disk_used_kb" 'BEGIN { if (kb != "") printf "%.1f", kb / 1024 / 1024 }')"
  printf "__AIWB_AGENT_HOST_DISK_TOTAL_GB__%s\\n" "$(awk -v kb="$disk_total_kb" 'BEGIN { if (kb != "") printf "%.1f", kb / 1024 / 1024 }')"
  printf "__AIWB_AGENT_HOST_LOAD_AVG__%s\\n" "$load_avg"
  printf "__AIWB_AGENT_HOST_UPTIME_SECONDS__%s\\n" "$uptime_seconds"
  printf "__AIWB_AGENT_HOST_PROCESS_COUNT__%s\\n" "$process_count"
}

aiwb_print_health() {
  aiwb_start_daemon >/dev/null 2>&1 || true
  printf "__AIWB_AGENT_STATUS__ready\\n"
  printf "__AIWB_AGENT_VERSION__%s\\n" "$AIWB_VERSION"
  printf "__AIWB_AGENT_HOME__%s\\n" "$AIWB_HOME"
  printf "__AIWB_AGENT_SERVICE_STATUS__%s\\n" "$(aiwb_service_status)"
  printf "__AIWB_AGENT_DAEMON_STATUS__%s\\n" "$(aiwb_daemon_status)"
  printf "__AIWB_AGENT_DAEMON_HEARTBEAT__%s\\n" "$(cat "$AIWB_DAEMON_HEARTBEAT" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASKS_QUEUED__%s\\n" "$(aiwb_task_count queued)"
  printf "__AIWB_AGENT_TASKS_RUNNING__%s\\n" "$(aiwb_task_count running)"
  printf "__AIWB_AGENT_TASKS_DONE__%s\\n" "$(aiwb_task_count done)"
  printf "__AIWB_AGENT_TASKS_ERROR__%s\\n" "$(aiwb_task_count error)"
  printf "__AIWB_AGENT_TASKS_CANCELLED__%s\\n" "$(aiwb_task_count cancelled)"
  aiwb_host_metrics
}

aiwb_cancel_task() {
  local task_id="$1"
  local task_dir
  local status
  local pid

  task_dir="$(aiwb_task_dir "$task_id")"
  if [ ! -d "$task_dir" ]; then
    printf "__AIWB_AGENT_STATUS__ready\\n"
    printf "__AIWB_AGENT_VERSION__%s\\n" "$AIWB_VERSION"
    printf "__AIWB_AGENT_TASK_ID__%s\\n" "$task_id"
    printf "__AIWB_AGENT_TASK_STATUS__missing\\n"
    return 0
  fi

  status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
  case "$status" in
    done|error|cancelled)
      aiwb_print_task "$task_id"
      return 0
      ;;
  esac

  pid="$(cat "$task_dir/pid" 2>/dev/null || printf "")"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 0.4
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  {
    printf "AI Workbench Agent: task cancelled by user.\\n"
    if [ -n "$pid" ]; then
      printf "runner pid: %s\\n" "$pid"
    fi
    printf "cancelled_at: %s\\n" "$(aiwb_now)"
  } >> "$task_dir/bootstrap.log"
  aiwb_set_status "$task_dir" "cancelled" "130"
  aiwb_print_task "$task_id"
}

aiwb_print_task() {
  local task_id="$1"
  local task_dir
  task_dir="$(aiwb_task_dir "$task_id")"
  if [ ! -d "$task_dir" ]; then
    printf "__AIWB_AGENT_TASK_ID__%s\\n" "$task_id"
    printf "__AIWB_AGENT_TASK_STATUS__missing\\n"
    return 0
  fi

  status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
  if [ "$status" = "queued" ] || [ "$status" = "running" ]; then
    aiwb_start_daemon >/dev/null 2>&1 || true
  fi
  aiwb_mark_queued_stale_if_needed "$task_dir"
  aiwb_mark_stale_if_needed "$task_dir"

  printf "__AIWB_AGENT_STATUS__ready\\n"
  printf "__AIWB_AGENT_VERSION__%s\\n" "$AIWB_VERSION"
  printf "__AIWB_AGENT_DAEMON_STATUS__%s\\n" "$(aiwb_daemon_status)"
  printf "__AIWB_AGENT_DAEMON_HEARTBEAT__%s\\n" "$(cat "$AIWB_DAEMON_HEARTBEAT" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_ID__%s\\n" "$task_id"
  printf "__AIWB_AGENT_TASK_CONVERSATION_ID__%s\\n" "$(cat "$task_dir/conversation_id" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_STATUS__%s\\n" "$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
  printf "__AIWB_AGENT_TASK_EXIT_CODE__%s\\n" "$(cat "$task_dir/exit_code" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_PID__%s\\n" "$(cat "$task_dir/pid" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_ATTEMPTS__%s\\n" "$(cat "$task_dir/attempts" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_STARTED_AT__%s\\n" "$(cat "$task_dir/started_at" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_RUNNER_STARTED_AT__%s\\n" "$(cat "$task_dir/runner_started_at" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_FINISHED_AT__%s\\n" "$(cat "$task_dir/finished_at" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_OUTPUT_START__\\n"
  local current_status
  current_status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
  if [ -f "$task_dir/output.log" ]; then
    cat "$task_dir/output.log"
  fi
  if [ -f "$task_dir/bootstrap.log" ] && { [ ! -s "$task_dir/output.log" ] || [ "$current_status" != "done" ]; }; then
    cat "$task_dir/bootstrap.log"
  fi
  if [ -s "$task_dir/launcher.log" ] && { [ ! -s "$task_dir/output.log" ] || [ "$current_status" != "done" ]; }; then
    printf "\\nAI Workbench Agent launcher log:\\n"
    cat "$task_dir/launcher.log"
  fi
  printf "\\n__AIWB_AGENT_TASK_OUTPUT_END__\\n"
}

aiwb_refresh_conversation_from_task_id() {
  local task_id="$1"
  local task_dir
  [ -n "$task_id" ] || return 0
  task_dir="$(aiwb_task_dir "$task_id")"
  [ -d "$task_dir" ] || return 0
  aiwb_mark_queued_stale_if_needed "$task_dir"
  aiwb_mark_stale_if_needed "$task_dir"
  aiwb_update_conversation_from_task "$task_dir"
}

aiwb_print_conversation_block() {
  local conversation_dir="$1"
  local history_limit="\${2:-0}"
  local history_before="\${3:-}"
  local task_id
  [ -d "$conversation_dir" ] || return 0
  task_id="$(cat "$conversation_dir/task_id" 2>/dev/null || printf "")"
  if [ -n "$task_id" ]; then
    aiwb_refresh_conversation_from_task_id "$task_id"
  fi

  printf "__AIWB_AGENT_CONVERSATION_START__\\n"
  printf "__AIWB_AGENT_CONVERSATION_ID__%s\\n" "$(cat "$conversation_dir/id" 2>/dev/null || basename "$conversation_dir")"
  printf "__AIWB_AGENT_CONVERSATION_NAME__%s\\n" "$(cat "$conversation_dir/name" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_WORKDIR__%s\\n" "$(cat "$conversation_dir/workdir" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_AGENT_ID__%s\\n" "$(cat "$conversation_dir/agent_id" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_STATUS__%s\\n" "$(cat "$conversation_dir/status" 2>/dev/null || printf unknown)"
  printf "__AIWB_AGENT_CONVERSATION_TASK_ID__%s\\n" "$(cat "$conversation_dir/task_id" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_CREATED_AT__%s\\n" "$(cat "$conversation_dir/created_at" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_UPDATED_AT__%s\\n" "$(cat "$conversation_dir/updated_at" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_STARTED_AT__%s\\n" "$(cat "$conversation_dir/started_at" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_FINISHED_AT__%s\\n" "$(cat "$conversation_dir/finished_at" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_EXIT_CODE__%s\\n" "$(cat "$conversation_dir/exit_code" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_LAST_PROMPT_START__\\n"
  cat "$conversation_dir/last_prompt.txt" 2>/dev/null || true
  printf "\\n__AIWB_AGENT_CONVERSATION_LAST_PROMPT_END__\\n"
  printf "__AIWB_AGENT_CONVERSATION_LAST_RESULT_START__\\n"
  cat "$conversation_dir/last_result.txt" 2>/dev/null || true
  printf "\\n__AIWB_AGENT_CONVERSATION_LAST_RESULT_END__\\n"
  aiwb_print_conversation_history "$conversation_dir" "$history_limit" "$history_before"
  printf "__AIWB_AGENT_CONVERSATION_END__\\n"
}

aiwb_task_sort_key() {
  local task_dir="$1"
  local value
  local name
  for name in finished_at runner_started_at started_at queued_at created_at; do
    value="$(cat "$task_dir/$name" 2>/dev/null || printf "")"
    if [ -n "$value" ]; then
      date -u -d "$value" +%s 2>/dev/null && return 0
    fi
  done
  stat -c %Y "$task_dir" 2>/dev/null || printf "0\\n"
}

aiwb_print_conversation_history_item() {
  local task_dir="$1"
  local sort_key="$2"
  local task_id
  local status
  task_id="$(basename -- "$task_dir")"
  status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"

  printf "__AIWB_AGENT_CONVERSATION_HISTORY_ITEM_START__\\n"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_TASK_ID__%s\\n" "$task_id"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_SORT_KEY__%s:%s\\n" "$sort_key" "$task_id"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_STATUS__%s\\n" "$status"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_AGENT_ID__%s\\n" "$(cat "$task_dir/agent_id" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_STARTED_AT__%s\\n" "$(cat "$task_dir/started_at" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_FINISHED_AT__%s\\n" "$(cat "$task_dir/finished_at" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_EXIT_CODE__%s\\n" "$(cat "$task_dir/exit_code" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_PROMPT_START__\\n"
  cat "$task_dir/prompt.txt" 2>/dev/null || true
  printf "\\n__AIWB_AGENT_CONVERSATION_HISTORY_PROMPT_END__\\n"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_RESULT_START__\\n"
  if [ -f "$task_dir/output.log" ]; then
    cat "$task_dir/output.log"
  fi
  if [ -f "$task_dir/bootstrap.log" ] && { [ ! -s "$task_dir/output.log" ] || [ "$status" != "done" ]; }; then
    cat "$task_dir/bootstrap.log"
  fi
  if [ -s "$task_dir/launcher.log" ] && { [ ! -s "$task_dir/output.log" ] || [ "$status" != "done" ]; }; then
    printf "\\nAI Workbench Agent launcher log:\\n"
    cat "$task_dir/launcher.log"
  fi
  printf "\\n__AIWB_AGENT_CONVERSATION_HISTORY_RESULT_END__\\n"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_ITEM_END__\\n"
}

aiwb_print_conversation_history() {
  local conversation_dir="$1"
  local limit="\${2:-0}"
  local before="\${3:-}"
  local conversation_id
  local tmp_file
  local task_dir
  local task_conversation_id
  local sort_key

  if [ "$limit" -le 0 ] 2>/dev/null; then
    return 0
  fi

  conversation_id="$(cat "$conversation_dir/id" 2>/dev/null || printf "")"
  [ -n "$conversation_id" ] || return 0

  tmp_file="$AIWB_HOME/history.$$"
  : > "$tmp_file"
  for task_dir in "$AIWB_TASKS"/*; do
    [ -d "$task_dir" ] || continue
    task_conversation_id="$(cat "$task_dir/conversation_id" 2>/dev/null || printf "")"
    [ "$task_conversation_id" = "$conversation_id" ] || continue
    aiwb_mark_queued_stale_if_needed "$task_dir"
    aiwb_mark_stale_if_needed "$task_dir"
    aiwb_update_conversation_from_task "$task_dir"
    sort_key="$(aiwb_task_sort_key "$task_dir")"
    printf "%s|%s|%s\\n" "$sort_key" "$(basename -- "$task_dir")" "$task_dir" >> "$tmp_file"
  done

  printf "__AIWB_AGENT_CONVERSATION_HISTORY_START__\\n"
  sort -t '|' -k1,1nr -k2,2r "$tmp_file" 2>/dev/null | {
    local count="0"
    local has_more="0"
    local next_before=""
    local before_key=""
    local before_id=""
    local task_id=""
    if [ -n "$before" ]; then
      before_key="\${before%%:*}"
      before_id="\${before#*:}"
    fi
    while IFS='|' read -r sort_key task_id task_dir; do
      [ -n "$task_dir" ] || continue
      if [ -n "$before_key" ]; then
        if [ "$sort_key" -gt "$before_key" ] 2>/dev/null; then
          continue
        fi
        if [ "$sort_key" -eq "$before_key" ] 2>/dev/null && { [ "$task_id" = "$before_id" ] || [[ "$task_id" > "$before_id" ]]; }; then
          continue
        fi
      fi
      if [ "$count" -ge "$limit" ] 2>/dev/null; then
        has_more="1"
        break
      fi
      aiwb_print_conversation_history_item "$task_dir" "$sort_key"
      next_before="$sort_key:$task_id"
      count="$((count + 1))"
    done
    printf "__AIWB_AGENT_CONVERSATION_HISTORY_NEXT_BEFORE__%s\\n" "$next_before"
    printf "__AIWB_AGENT_CONVERSATION_HISTORY_HAS_MORE__%s\\n" "$has_more"
  }
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_END__\\n"
  rm -f "$tmp_file" 2>/dev/null || true
}

aiwb_list_conversations() {
  local conversation_dir
  printf "__AIWB_AGENT_STATUS__ready\\n"
  printf "__AIWB_AGENT_VERSION__%s\\n" "$AIWB_VERSION"
  for conversation_dir in "$AIWB_CONVERSATIONS"/*; do
    [ -d "$conversation_dir" ] || continue
    aiwb_print_conversation_block "$conversation_dir" "0" ""
  done
}

aiwb_print_conversation_status() {
  local conversation_id="$1"
  local history_limit="\${2:-5}"
  local history_before="\${3:-}"
  local conversation_dir
  conversation_dir="$(aiwb_conversation_dir "$conversation_id")"
  printf "__AIWB_AGENT_STATUS__ready\\n"
  printf "__AIWB_AGENT_VERSION__%s\\n" "$AIWB_VERSION"
  if [ ! -d "$conversation_dir" ]; then
    printf "__AIWB_AGENT_CONVERSATION_ID__%s\\n" "$conversation_id"
    printf "__AIWB_AGENT_CONVERSATION_STATUS__missing\\n"
    return 0
  fi
  aiwb_print_conversation_block "$conversation_dir" "$history_limit" "$history_before"
}

aiwb_install_service() {
  if ! command -v systemctl >/dev/null 2>&1; then
    printf "__AIWB_AGENT_SERVICE__unsupported\\n"
    return 0
  fi

  if [ "$(id -u)" = "0" ]; then
    cat > /etc/systemd/system/ai-workbench-agent.service <<AIWB_SYSTEMD_UNIT
[Unit]
Description=AI Workbench Agent
After=network.target

[Service]
Type=simple
Environment=HOME=$AIWB_USER_HOME
ExecStart=$AIWB_HOME/aiwbctl daemon
Restart=always
RestartSec=2
KillMode=process
WorkingDirectory=$AIWB_HOME

[Install]
WantedBy=multi-user.target
AIWB_SYSTEMD_UNIT
    systemctl daemon-reload >/dev/null 2>&1 || true
    systemctl enable ai-workbench-agent.service >/dev/null 2>&1 || true
    systemctl restart ai-workbench-agent.service >/dev/null 2>&1 || aiwb_start_daemon >/dev/null 2>&1 || true
    printf "__AIWB_AGENT_SERVICE__system\\n"
    return 0
  fi

  aiwb_start_daemon >/dev/null 2>&1 || true
  printf "__AIWB_AGENT_SERVICE__user-fallback\\n"
}

AIWB_CMD="status"
if [ "$#" -gt 0 ]; then
  AIWB_CMD="$1"
fi

case "$AIWB_CMD" in
  status)
    if [ "$#" -gt 1 ]; then
      aiwb_print_task "$2"
    else
      aiwb_print_health
    fi
    ;;
  health)
    aiwb_print_health
    ;;
  daemon)
    aiwb_daemon_loop
    ;;
  install-service)
    aiwb_install_service
    "$AIWB_HOME/aiwbctl" status
    ;;
  create)
    AIWB_TASK_ID=""
    if [ "$#" -gt 1 ]; then
      AIWB_TASK_ID="$2"
    fi
    if [ -z "$AIWB_TASK_ID" ]; then
      printf "__AIWB_AGENT_STATUS__error\\n"
      printf "__AIWB_AGENT_ERROR__missing task id\\n"
      exit 2
    fi
    AIWB_TASK_DIR="$(aiwb_task_dir "$AIWB_TASK_ID")"
    mkdir -p "$AIWB_TASK_DIR"
    if [ ! -s "$AIWB_TASK_DIR/command.b64" ]; then
      printf "__AIWB_AGENT_STATUS__error\\n"
      printf "__AIWB_AGENT_ERROR__missing command payload\\n"
      exit 2
    fi
    AIWB_CONVERSATION_ID="$(cat "$AIWB_TASK_DIR/conversation_id" 2>/dev/null || printf "")"
    if [ -n "$AIWB_CONVERSATION_ID" ]; then
      AIWB_CONVERSATION_LOCK="$AIWB_CONVERSATION_LOCKS/$(aiwb_safe_id "$AIWB_CONVERSATION_ID").lock"
      AIWB_LOCK_ACQUIRED="0"
      if mkdir "$AIWB_CONVERSATION_LOCK" 2>/dev/null; then
        AIWB_LOCK_ACQUIRED="1"
      else
        AIWB_LOCK_EPOCH="$(aiwb_path_mtime_epoch "$AIWB_CONVERSATION_LOCK")"
        AIWB_NOW_EPOCH="$(date -u +%s)"
        AIWB_LOCK_AGE="$((AIWB_NOW_EPOCH - AIWB_LOCK_EPOCH))"
        if [ "$AIWB_LOCK_EPOCH" -gt 0 ] 2>/dev/null && [ "$AIWB_LOCK_AGE" -gt 30 ] 2>/dev/null; then
          rm -rf "$AIWB_CONVERSATION_LOCK" 2>/dev/null || true
        fi
        if mkdir "$AIWB_CONVERSATION_LOCK" 2>/dev/null; then
          AIWB_LOCK_ACQUIRED="1"
        fi
      fi
      if [ "$AIWB_LOCK_ACQUIRED" != "1" ]; then
        AIWB_BUSY_TASK_ID="$(aiwb_conversation_active_task "$AIWB_CONVERSATION_ID" "$AIWB_TASK_ID" || printf "")"
        if [ -z "$AIWB_BUSY_TASK_ID" ]; then
          AIWB_BUSY_TASK_ID="$(cat "$(aiwb_conversation_dir "$AIWB_CONVERSATION_ID")/task_id" 2>/dev/null || printf "")"
        fi
        aiwb_print_conversation_busy "$AIWB_BUSY_TASK_ID" "$AIWB_CONVERSATION_ID"
        exit 0
      fi
      trap 'rm -rf "$AIWB_CONVERSATION_LOCK" 2>/dev/null || true' EXIT
      AIWB_BUSY_TASK_ID="$(aiwb_conversation_active_task "$AIWB_CONVERSATION_ID" "$AIWB_TASK_ID" || printf "")"
      if [ -n "$AIWB_BUSY_TASK_ID" ]; then
        aiwb_print_conversation_busy "$AIWB_BUSY_TASK_ID" "$AIWB_CONVERSATION_ID"
        exit 0
      fi
    fi
    aiwb_write_file "$AIWB_TASK_DIR/id" "$AIWB_TASK_ID"
    aiwb_write_file "$AIWB_TASK_DIR/created_at" "$(aiwb_now)"
    aiwb_write_file "$AIWB_TASK_DIR/queued_at" "$(aiwb_now)"
    aiwb_write_file "$AIWB_TASK_DIR/attempts" "0"
    aiwb_write_file "$AIWB_TASK_DIR/pid" ""
    aiwb_write_file "$AIWB_TASK_DIR/runner_started_at" ""
    aiwb_write_file "$AIWB_TASK_DIR/finished_at" ""
    aiwb_set_status "$AIWB_TASK_DIR" "queued" ""
    aiwb_start_daemon >/dev/null 2>&1 || true

    printf "__AIWB_AGENT_STATUS__ready\\n"
    printf "__AIWB_AGENT_VERSION__%s\\n" "$AIWB_VERSION"
    printf "__AIWB_AGENT_DAEMON_STATUS__%s\\n" "$(aiwb_daemon_status)"
    printf "__AIWB_AGENT_TASK_ID__%s\\n" "$AIWB_TASK_ID"
    printf "__AIWB_AGENT_TASK_CONVERSATION_ID__%s\\n" "$(cat "$AIWB_TASK_DIR/conversation_id" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_STATUS__%s\\n" "$(cat "$AIWB_TASK_DIR/status" 2>/dev/null || printf queued)"
    ;;
  conversations|conversation-list)
    aiwb_list_conversations
    ;;
  conversation-status)
    AIWB_CONVERSATION_ID=""
    AIWB_HISTORY_LIMIT="5"
    AIWB_HISTORY_BEFORE=""
    if [ "$#" -gt 1 ]; then
      AIWB_CONVERSATION_ID="$2"
    fi
    if [ "$#" -gt 2 ]; then
      AIWB_HISTORY_LIMIT="$3"
    fi
    if [ "$#" -gt 3 ]; then
      AIWB_HISTORY_BEFORE="$4"
    fi
    if [ -z "$AIWB_CONVERSATION_ID" ]; then
      printf "__AIWB_AGENT_STATUS__error\\n"
      printf "__AIWB_AGENT_ERROR__missing conversation id\\n"
      exit 2
    fi
    aiwb_print_conversation_status "$AIWB_CONVERSATION_ID" "$AIWB_HISTORY_LIMIT" "$AIWB_HISTORY_BEFORE"
    ;;
  cancel)
    AIWB_TASK_ID=""
    if [ "$#" -gt 1 ]; then
      AIWB_TASK_ID="$2"
    fi
    if [ -z "$AIWB_TASK_ID" ]; then
      printf "__AIWB_AGENT_STATUS__error\\n"
      printf "__AIWB_AGENT_ERROR__missing task id\\n"
      exit 2
    fi
    aiwb_cancel_task "$AIWB_TASK_ID"
    ;;
  *)
    printf "__AIWB_AGENT_STATUS__error\\n"
    printf "__AIWB_AGENT_ERROR__unknown command\\n"
    exit 2
    ;;
esac
`;
}

export function buildInstallWorkbenchAgentCommand(profile) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("Windows PowerShell 模式暂不支持 AI Workbench Agent。");
  const script = workbenchAgentScript();
  return remoteBashCommand(profile, `
set -e
AIWB_AGENT_HOME="$HOME/.ai-workbench/agent"
AIWB_AGENT_MANIFEST_URL=${shQuote(workbenchAgentManifestUrl)}
AIWB_AGENT_INSTALL_SOURCE="embedded"
AIWB_AGENT_MANIFEST_TMP="$AIWB_AGENT_HOME/latest.json.$$"
AIWB_AGENT_DOWNLOAD_TMP="$AIWB_AGENT_HOME/aiwbctl.download.$$"
mkdir -p "$AIWB_AGENT_HOME/tasks"

aiwb_download_url() {
  AIWB_DOWNLOAD_URL="$1"
  AIWB_DOWNLOAD_TARGET="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 8 --max-time 45 "$AIWB_DOWNLOAD_URL" -o "$AIWB_DOWNLOAD_TARGET"
    return $?
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q -T 45 -O "$AIWB_DOWNLOAD_TARGET" "$AIWB_DOWNLOAD_URL"
    return $?
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$AIWB_DOWNLOAD_URL" "$AIWB_DOWNLOAD_TARGET" <<'PY'
import sys
import urllib.request

url, target = sys.argv[1], sys.argv[2]
with urllib.request.urlopen(url, timeout=45) as response:
    data = response.read()
with open(target, "wb") as handle:
    handle.write(data)
PY
    return $?
  fi
  return 1
}

aiwb_json_value() {
  if ! command -v python3 >/dev/null 2>&1; then
    return 1
  fi
  python3 - "$1" "$2" <<'PY'
import json
import sys

path, key = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as handle:
    value = json.load(handle).get(key, "")
if value is None:
    value = ""
print(str(value))
PY
}

if aiwb_download_url "$AIWB_AGENT_MANIFEST_URL" "$AIWB_AGENT_MANIFEST_TMP"; then
  AIWB_AGENT_SCRIPT_URL="$(aiwb_json_value "$AIWB_AGENT_MANIFEST_TMP" scriptUrl 2>/dev/null || true)"
  AIWB_AGENT_EXPECTED_SHA="$(aiwb_json_value "$AIWB_AGENT_MANIFEST_TMP" sha256 2>/dev/null || true)"
  if [ -n "$AIWB_AGENT_SCRIPT_URL" ] && aiwb_download_url "$AIWB_AGENT_SCRIPT_URL" "$AIWB_AGENT_DOWNLOAD_TMP"; then
    AIWB_AGENT_SHA_OK="1"
    if [ -n "$AIWB_AGENT_EXPECTED_SHA" ] && command -v sha256sum >/dev/null 2>&1; then
      AIWB_AGENT_ACTUAL_SHA="$(sha256sum "$AIWB_AGENT_DOWNLOAD_TMP" | awk '{print $1}')"
      [ "$AIWB_AGENT_ACTUAL_SHA" = "$AIWB_AGENT_EXPECTED_SHA" ] || AIWB_AGENT_SHA_OK=""
    elif [ -n "$AIWB_AGENT_EXPECTED_SHA" ] && command -v shasum >/dev/null 2>&1; then
      AIWB_AGENT_ACTUAL_SHA="$(shasum -a 256 "$AIWB_AGENT_DOWNLOAD_TMP" | awk '{print $1}')"
      [ "$AIWB_AGENT_ACTUAL_SHA" = "$AIWB_AGENT_EXPECTED_SHA" ] || AIWB_AGENT_SHA_OK=""
    fi
    if [ -n "$AIWB_AGENT_SHA_OK" ]; then
      cp "$AIWB_AGENT_DOWNLOAD_TMP" "$AIWB_AGENT_HOME/aiwbctl"
      case "$AIWB_AGENT_SCRIPT_URL" in
        *raw.githubusercontent.com*|*github.com*) AIWB_AGENT_INSTALL_SOURCE="github" ;;
        *aliyuncs.com*) AIWB_AGENT_INSTALL_SOURCE="oss" ;;
        *) AIWB_AGENT_INSTALL_SOURCE="remote" ;;
      esac
    fi
  fi
fi

if [ "$AIWB_AGENT_INSTALL_SOURCE" = "embedded" ]; then
  cat > "$AIWB_AGENT_HOME/aiwbctl" <<'AIWB_AGENT_SCRIPT'
${script}
AIWB_AGENT_SCRIPT
fi

rm -f "$AIWB_AGENT_MANIFEST_TMP" "$AIWB_AGENT_DOWNLOAD_TMP"
chmod 700 "$AIWB_AGENT_HOME/aiwbctl"
printf "__AIWB_AGENT_INSTALL_SOURCE__%s\\n" "$AIWB_AGENT_INSTALL_SOURCE"
"$AIWB_AGENT_HOME/aiwbctl" install-service 2>/dev/null || "$AIWB_AGENT_HOME/aiwbctl" status
`);
}

export function buildWorkbenchAgentStatusCommand(profile, taskId = "") {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("__AIWB_AGENT_STATUS__unsupported");
  return remoteBashCommand(profile, `
AIWB_AGENT_CTL="$HOME/.ai-workbench/agent/aiwbctl"
if [ ! -x "$AIWB_AGENT_CTL" ]; then
  printf '__AIWB_AGENT_STATUS__missing\\n'
  exit 0
fi
"$AIWB_AGENT_CTL" status ${taskId ? shQuote(taskId) : ""}
`);
}

export function buildWorkbenchAgentTaskListCommand(profile) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("__AIWB_AGENT_STATUS__unsupported");
  return remoteBashCommand(profile, `
AIWB_AGENT_CTL="$HOME/.ai-workbench/agent/aiwbctl"
if [ ! -x "$AIWB_AGENT_CTL" ]; then
  printf '__AIWB_AGENT_STATUS__missing\\n'
  exit 0
fi
"$AIWB_AGENT_CTL" status
AIWB_TASK_HOME="$HOME/.ai-workbench/agent/tasks"
printf "__AIWB_AGENT_TASK_LIST_START__\\n"
if [ -d "$AIWB_TASK_HOME" ]; then
  {
    for AIWB_TASK_DIR in "$AIWB_TASK_HOME"/*; do
      [ -d "$AIWB_TASK_DIR" ] || continue
      AIWB_TASK_ID="$(basename "$AIWB_TASK_DIR")"
      AIWB_TASK_STATUS="$(cat "$AIWB_TASK_DIR/status" 2>/dev/null || printf unknown)"
      AIWB_TASK_MTIME="$(stat -c %Y "$AIWB_TASK_DIR" 2>/dev/null || date +%s)"
      case "$AIWB_TASK_STATUS" in
        queued|preparing|running|busy) AIWB_TASK_PRIORITY="0" ;;
        error|cancelled) AIWB_TASK_PRIORITY="1" ;;
        *) AIWB_TASK_PRIORITY="2" ;;
      esac
      printf "%s %s %s\\n" "$AIWB_TASK_PRIORITY" "$AIWB_TASK_MTIME" "$AIWB_TASK_ID"
    done
  } | sort -k1,1n -k2,2nr | head -n 20 | while read -r _ _ AIWB_TASK_ID; do
    AIWB_TASK_DIR="$AIWB_TASK_HOME/$AIWB_TASK_ID"
    [ -d "$AIWB_TASK_DIR" ] || continue
    AIWB_TASK_STATUS="$(cat "$AIWB_TASK_DIR/status" 2>/dev/null || printf unknown)"
    AIWB_TASK_PID="$(cat "$AIWB_TASK_DIR/pid" 2>/dev/null || printf "")"
    AIWB_TASK_PID_ALIVE=""
    if [ -n "$AIWB_TASK_PID" ]; then
      if kill -0 "$AIWB_TASK_PID" 2>/dev/null; then
        AIWB_TASK_PID_ALIVE="1"
      else
        AIWB_TASK_PID_ALIVE="0"
      fi
    fi
    printf "__AIWB_AGENT_TASK_ITEM_START__\\n"
    printf "__AIWB_AGENT_TASK_ITEM_ID__%s\\n" "$AIWB_TASK_ID"
    printf "__AIWB_AGENT_TASK_ITEM_STATUS__%s\\n" "$AIWB_TASK_STATUS"
    printf "__AIWB_AGENT_TASK_ITEM_AGENT_ID__%s\\n" "$(cat "$AIWB_TASK_DIR/agent_id" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_MODEL__%s\\n" "$(cat "$AIWB_TASK_DIR/model" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_CONVERSATION_ID__%s\\n" "$(cat "$AIWB_TASK_DIR/conversation_id" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_NAME__%s\\n" "$(cat "$AIWB_TASK_DIR/name" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_WORKDIR__%s\\n" "$(cat "$AIWB_TASK_DIR/workdir" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_PID__%s\\n" "$AIWB_TASK_PID"
    printf "__AIWB_AGENT_TASK_ITEM_PID_ALIVE__%s\\n" "$AIWB_TASK_PID_ALIVE"
    printf "__AIWB_AGENT_TASK_ITEM_ATTEMPTS__%s\\n" "$(cat "$AIWB_TASK_DIR/attempts" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_EXIT_CODE__%s\\n" "$(cat "$AIWB_TASK_DIR/exit_code" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_CREATED_AT__%s\\n" "$(cat "$AIWB_TASK_DIR/created_at" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_STARTED_AT__%s\\n" "$(cat "$AIWB_TASK_DIR/started_at" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_RUNNER_STARTED_AT__%s\\n" "$(cat "$AIWB_TASK_DIR/runner_started_at" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_FINISHED_AT__%s\\n" "$(cat "$AIWB_TASK_DIR/finished_at" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_ITEM_PROMPT_START__\\n"
    if [ -s "$AIWB_TASK_DIR/prompt.txt" ]; then
      head -c 180 "$AIWB_TASK_DIR/prompt.txt" | tr '\\r\\n' '  '
    fi
    printf "\\n__AIWB_AGENT_TASK_ITEM_PROMPT_END__\\n"
    printf "__AIWB_AGENT_TASK_ITEM_END__\\n"
  done
fi
printf "__AIWB_AGENT_TASK_LIST_END__\\n"
`);
}

export function buildWorkbenchAgentCreateCommand(profile, taskId, command, metadata = {}) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("__AIWB_AGENT_STATUS__unsupported");
  const encodedCommand = toBase64Utf8(command);
  const conversationId = String(metadata.conversationId || "").trim();
  const conversationName = String(metadata.name || "").trim();
  const agentId = String(metadata.agentId || profile.agentId || "").trim();
  const model = normalizeAgentModel(agentId, metadata.model || profile.aiModel);
  const promptText = String(metadata.promptText || "").trim();
  const workdir = String(metadata.workdir || profile.workdir || "").trim();
  return remoteBashCommand(profile, `
set -e
AIWB_AGENT_CTL="$HOME/.ai-workbench/agent/aiwbctl"
if [ ! -x "$AIWB_AGENT_CTL" ]; then
  printf '__AIWB_AGENT_STATUS__missing\\n'
  exit 0
fi
AIWB_TASK_ID=${shQuote(taskId)}
AIWB_TASK_DIR="$HOME/.ai-workbench/agent/tasks/$AIWB_TASK_ID"
mkdir -p "$AIWB_TASK_DIR"
cat > "$AIWB_TASK_DIR/command.b64" <<'AIWB_COMMAND_PAYLOAD'
${encodedCommand}
AIWB_COMMAND_PAYLOAD
cat > "$AIWB_TASK_DIR/conversation_id" <<'AIWB_CONVERSATION_ID'
${conversationId}
AIWB_CONVERSATION_ID
cat > "$AIWB_TASK_DIR/name" <<'AIWB_CONVERSATION_NAME'
${conversationName}
AIWB_CONVERSATION_NAME
cat > "$AIWB_TASK_DIR/workdir" <<'AIWB_CONVERSATION_WORKDIR'
${workdir}
AIWB_CONVERSATION_WORKDIR
cat > "$AIWB_TASK_DIR/agent_id" <<'AIWB_CONVERSATION_AGENT'
${agentId}
AIWB_CONVERSATION_AGENT
cat > "$AIWB_TASK_DIR/model" <<'AIWB_CONVERSATION_MODEL'
${model}
AIWB_CONVERSATION_MODEL
cat > "$AIWB_TASK_DIR/prompt.txt" <<'AIWB_CONVERSATION_PROMPT'
${promptText}
AIWB_CONVERSATION_PROMPT
"$AIWB_AGENT_CTL" create "$AIWB_TASK_ID"
`);
}

export function buildWorkbenchAgentConversationListCommand(profile) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("__AIWB_AGENT_STATUS__unsupported");
  return remoteBashCommand(profile, `
AIWB_AGENT_CTL="$HOME/.ai-workbench/agent/aiwbctl"
if [ ! -x "$AIWB_AGENT_CTL" ]; then
  printf '__AIWB_AGENT_STATUS__missing\\n'
  exit 0
fi
"$AIWB_AGENT_CTL" conversations
`);
}

export function buildWorkbenchAgentConversationStatusCommand(profile, conversationId, options = {}) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("__AIWB_AGENT_STATUS__unsupported");
  const rawLimit = Number(options?.limit ?? 5);
  const historyLimit = Number.isFinite(rawLimit) ? Math.max(0, Math.min(20, Math.floor(rawLimit))) : 5;
  const historyBefore = String(options?.before || "").trim();
  return remoteBashCommand(profile, `
AIWB_AGENT_CTL="$HOME/.ai-workbench/agent/aiwbctl"
if [ ! -x "$AIWB_AGENT_CTL" ]; then
  printf '__AIWB_AGENT_STATUS__missing\\n'
  exit 0
fi
"$AIWB_AGENT_CTL" conversation-status ${shQuote(conversationId)} ${shQuote(String(historyLimit))} ${shQuote(historyBefore)}
`);
}

export function buildWorkbenchAgentCancelCommand(profile, taskId) {
  if (isWindowsProfile(profile)) return buildWindowsNoTmuxCommand("__AIWB_AGENT_STATUS__unsupported");
  return remoteBashCommand(profile, `
AIWB_AGENT_CTL="$HOME/.ai-workbench/agent/aiwbctl"
if [ ! -x "$AIWB_AGENT_CTL" ]; then
  printf '__AIWB_AGENT_STATUS__missing\\n'
  exit 0
fi
"$AIWB_AGENT_CTL" cancel ${shQuote(taskId)}
`);
}

export function buildHealthCommand(profile) {
  if (isWindowsProfile(profile)) return buildWindowsHealthCommand(profile);

  const codexProbe = commandName(profile.codexCommand) || "codex";
  const claudeProbe = commandName(profile.claudeCommand) || "claude";
  const workdir = String(profile.workdir || "").trim();
  const workdirSetup = workdir
    ? `mkdir -p ${shQuote(workdir)}
cd ${shQuote(workdir)}`
    : "";

  return remoteBashCommand(profile, `
set -e
${workdirSetup}
resolve_aiwb_command() {
  AIWB_NAME="$1"
  AIWB_CONFIGURED="$2"
  AIWB_BASE="$AIWB_NAME"

  if [ -n "$AIWB_CONFIGURED" ]; then
    case "$AIWB_CONFIGURED" in
      */*)
        if [ -x "$AIWB_CONFIGURED" ]; then
          printf '%s\\n' "$AIWB_CONFIGURED"
          return 0
        fi
        AIWB_BASE=$(basename "$AIWB_CONFIGURED")
        ;;
      *)
        AIWB_FOUND=$(command -v "$AIWB_CONFIGURED" 2>/dev/null || true)
        if [ -n "$AIWB_FOUND" ]; then
          printf '%s\\n' "$AIWB_FOUND"
          return 0
        fi
        AIWB_BASE="$AIWB_CONFIGURED"
        ;;
    esac
  fi

  for AIWB_CANDIDATE_NAME in "$AIWB_BASE" "$AIWB_NAME"; do
    [ -n "$AIWB_CANDIDATE_NAME" ] || continue

    AIWB_FOUND=$(command -v "$AIWB_CANDIDATE_NAME" 2>/dev/null || true)
    if [ -n "$AIWB_FOUND" ]; then
      printf '%s\\n' "$AIWB_FOUND"
      return 0
    fi

    for AIWB_PATH in \\
      "/usr/local/bin/$AIWB_CANDIDATE_NAME" \\
      "/usr/bin/$AIWB_CANDIDATE_NAME" \\
      "/bin/$AIWB_CANDIDATE_NAME" \\
      "/opt/homebrew/bin/$AIWB_CANDIDATE_NAME" \\
      "$HOME/.local/bin/$AIWB_CANDIDATE_NAME" \\
      "$HOME/.npm-global/bin/$AIWB_CANDIDATE_NAME" \\
      "$HOME/.yarn/bin/$AIWB_CANDIDATE_NAME" \\
      "$HOME/.bun/bin/$AIWB_CANDIDATE_NAME" \\
      "$HOME/.deno/bin/$AIWB_CANDIDATE_NAME" \\
      "$HOME/.volta/bin/$AIWB_CANDIDATE_NAME" \\
      "$HOME/.asdf/shims/$AIWB_CANDIDATE_NAME" \\
      "$HOME"/.nvm/versions/node/*/bin/"$AIWB_CANDIDATE_NAME"; do
      if [ -x "$AIWB_PATH" ]; then
        printf '%s\\n' "$AIWB_PATH"
        return 0
      fi
    done

    AIWB_FOUND=$(find "$HOME/.nvm" "$HOME/.local" "$HOME/.npm-global" "$HOME/.volta" "$HOME/.asdf" -type f -name "$AIWB_CANDIDATE_NAME" -perm -111 2>/dev/null | head -n 1 || true)
    if [ -n "$AIWB_FOUND" ]; then
      printf '%s\\n' "$AIWB_FOUND"
      return 0
    fi
  done

  printf '\\n'
}
AIWB_CODEX=$(resolve_aiwb_command codex ${shQuote(codexProbe)})
AIWB_CLAUDE=$(resolve_aiwb_command claude ${shQuote(claudeProbe)})
AIWB_CODEX_RUN="$AIWB_CODEX"
[ -n "$AIWB_CODEX_RUN" ] || AIWB_CODEX_RUN=${shQuote(codexProbe)}
AIWB_CLAUDE_RUN="$AIWB_CLAUDE"
[ -n "$AIWB_CLAUDE_RUN" ] || AIWB_CLAUDE_RUN=${shQuote(claudeProbe)}
printf '__AIWB_HOST__%s\\n' "$(hostname)"
printf '__AIWB_USER__%s\\n' "$(whoami)"
printf '__AIWB_PWD__%s\\n' "$(pwd)"
printf '__AIWB_TMUX__%s\\n' "$(command -v tmux || true)"
printf '__AIWB_GIT__%s\\n' "$(command -v git || true)"
printf '__AIWB_CODEX__%s\\n' "$AIWB_CODEX"
printf '__AIWB_CLAUDE__%s\\n' "$AIWB_CLAUDE"
printf '__AIWB_TMUX_VERSION__'
(tmux -V 2>&1 || true) | head -n 1
printf '__AIWB_GIT_VERSION__'
(git --version 2>&1 || true) | head -n 1
printf '__AIWB_CODEX_VERSION__'
("$AIWB_CODEX_RUN" --version 2>&1 || true) | head -n 1
printf '__AIWB_CLAUDE_VERSION__'
("$AIWB_CLAUDE_RUN" --version 2>&1 || true) | head -n 1
AIWB_CPU_PERCENT=""
if [ -r /proc/stat ]; then
  read -r _ AIWB_U AIWB_N AIWB_S AIWB_I AIWB_IO AIWB_IRQ AIWB_SOFT AIWB_STEAL AIWB_G AIWB_GN < /proc/stat || true
  AIWB_TOTAL_A=$((AIWB_U + AIWB_N + AIWB_S + AIWB_I + AIWB_IO + AIWB_IRQ + AIWB_SOFT + AIWB_STEAL))
  AIWB_IDLE_A=$((AIWB_I + AIWB_IO))
  sleep 0.12
  read -r _ AIWB_U AIWB_N AIWB_S AIWB_I AIWB_IO AIWB_IRQ AIWB_SOFT AIWB_STEAL AIWB_G AIWB_GN < /proc/stat || true
  AIWB_TOTAL_B=$((AIWB_U + AIWB_N + AIWB_S + AIWB_I + AIWB_IO + AIWB_IRQ + AIWB_SOFT + AIWB_STEAL))
  AIWB_IDLE_B=$((AIWB_I + AIWB_IO))
  AIWB_TOTAL_DELTA=$((AIWB_TOTAL_B - AIWB_TOTAL_A))
  AIWB_IDLE_DELTA=$((AIWB_IDLE_B - AIWB_IDLE_A))
  if [ "$AIWB_TOTAL_DELTA" -gt 0 ] 2>/dev/null; then
    AIWB_CPU_PERCENT=$(awk -v total="$AIWB_TOTAL_DELTA" -v idle="$AIWB_IDLE_DELTA" 'BEGIN { printf "%.1f", (total - idle) * 100 / total }')
  fi
fi
AIWB_MEM_TOTAL_KB=""
AIWB_MEM_USED_KB=""
AIWB_MEM_PERCENT=""
if [ -r /proc/meminfo ]; then
  AIWB_MEM_TOTAL_KB=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
  AIWB_MEM_AVAILABLE_KB=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
  if [ -n "$AIWB_MEM_TOTAL_KB" ] && [ -n "$AIWB_MEM_AVAILABLE_KB" ] && [ "$AIWB_MEM_TOTAL_KB" -gt 0 ] 2>/dev/null; then
    AIWB_MEM_USED_KB=$((AIWB_MEM_TOTAL_KB - AIWB_MEM_AVAILABLE_KB))
    AIWB_MEM_PERCENT=$(awk -v used="$AIWB_MEM_USED_KB" -v total="$AIWB_MEM_TOTAL_KB" 'BEGIN { printf "%.1f", used * 100 / total }')
  fi
fi
AIWB_DISK_LINE=$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2 { print $2 " " $3 " " $5 }')
AIWB_DISK_TOTAL_KB=$(printf '%s\\n' "$AIWB_DISK_LINE" | awk '{ print $1 }')
AIWB_DISK_USED_KB=$(printf '%s\\n' "$AIWB_DISK_LINE" | awk '{ print $2 }')
AIWB_DISK_PERCENT=$(printf '%s\\n' "$AIWB_DISK_LINE" | awk '{ gsub(/%/, "", $3); print $3 }')
printf '__AIWB_HOST_CPU_PERCENT__%s\\n' "$AIWB_CPU_PERCENT"
printf '__AIWB_HOST_MEM_PERCENT__%s\\n' "$AIWB_MEM_PERCENT"
printf '__AIWB_HOST_MEM_USED_MB__%s\\n' "$(awk -v kb="$AIWB_MEM_USED_KB" 'BEGIN { if (kb != "") printf "%.0f", kb / 1024 }')"
printf '__AIWB_HOST_MEM_TOTAL_MB__%s\\n' "$(awk -v kb="$AIWB_MEM_TOTAL_KB" 'BEGIN { if (kb != "") printf "%.0f", kb / 1024 }')"
printf '__AIWB_HOST_DISK_PERCENT__%s\\n' "$AIWB_DISK_PERCENT"
printf '__AIWB_HOST_DISK_USED_GB__%s\\n' "$(awk -v kb="$AIWB_DISK_USED_KB" 'BEGIN { if (kb != "") printf "%.1f", kb / 1024 / 1024 }')"
printf '__AIWB_HOST_DISK_TOTAL_GB__%s\\n' "$(awk -v kb="$AIWB_DISK_TOTAL_KB" 'BEGIN { if (kb != "") printf "%.1f", kb / 1024 / 1024 }')"
printf '__AIWB_HOST_LOAD_AVG__%s\\n' "$(awk '{ print $1 "," $2 "," $3 }' /proc/loadavg 2>/dev/null || true)"
printf '__AIWB_HOST_UPTIME_SECONDS__%s\\n' "$(awk '{ printf "%d", $1 }' /proc/uptime 2>/dev/null || true)"
printf '__AIWB_HOST_PROCESS_COUNT__%s\\n' "$(ps -e 2>/dev/null | wc -l | tr -d '[:space:]' || true)"
if [ -x "$HOME/.ai-workbench/agent/aiwbctl" ]; then
  printf '__AIWB_AGENT__available\\n'
  "$HOME/.ai-workbench/agent/aiwbctl" status 2>/dev/null | grep '^__AIWB_AGENT_\\(VERSION\\|SERVICE_STATUS\\|DAEMON_STATUS\\|DAEMON_HEARTBEAT\\|TASKS_\\|HOST_\\)' || true
else
  printf '__AIWB_AGENT__missing\\n'
fi
`);
}

export function buildWindowsHealthCommand(profile) {
  const codexProbe = commandName(profile.codexCommand) || "codex";
  const claudeProbe = commandName(profile.claudeCommand) || "claude";
  const workdir = String(profile.workdir || "").trim();

  return powershellStdinCommand(`
function Resolve-AiwbCommand {
  param([string]$Name)
  $AIWB_NAMES = @($Name)
  if ($Name -and -not $Name.EndsWith(".cmd")) { $AIWB_NAMES += "$Name.cmd" }
  if ($Name -and -not $Name.EndsWith(".ps1")) { $AIWB_NAMES += "$Name.ps1" }
  if ($Name -and -not $Name.EndsWith(".exe")) { $AIWB_NAMES += "$Name.exe" }
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
$AIWB_WORKDIR = ${psQuote(workdir)}
if ($AIWB_WORKDIR) {
  New-Item -ItemType Directory -Force -Path $AIWB_WORKDIR | Out-Null
  Set-Location -LiteralPath $AIWB_WORKDIR
}
$AIWB_CODEX = Resolve-AiwbCommand ${psQuote(codexProbe)}
$AIWB_CLAUDE = Resolve-AiwbCommand ${psQuote(claudeProbe)}
$AIWB_CODEX_VERSION = ""
$AIWB_CLAUDE_VERSION = ""
try { if ($AIWB_CODEX) { $AIWB_CODEX_VERSION = (& $AIWB_CODEX --version 2>&1 | Select-Object -First 1) } } catch {}
try { if ($AIWB_CLAUDE) { $AIWB_CLAUDE_VERSION = (& $AIWB_CLAUDE --version 2>&1 | Select-Object -First 1) } } catch {}
Write-Output ("__AIWB_HOST__" + [System.Net.Dns]::GetHostName())
Write-Output ("__AIWB_USER__" + [System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
Write-Output ("__AIWB_PWD__" + (Get-Location).Path)
Write-Output "__AIWB_TMUX__Windows PowerShell 模式不使用 tmux"
$AIWB_GIT = Resolve-AiwbCommand "git"
Write-Output ("__AIWB_CODEX__" + $AIWB_CODEX)
Write-Output ("__AIWB_CLAUDE__" + $AIWB_CLAUDE)
Write-Output ("__AIWB_GIT__" + $AIWB_GIT)
Write-Output "__AIWB_TMUX_VERSION__Windows PowerShell 模式不使用 tmux"
$AIWB_GIT_VERSION = ""
try { if ($AIWB_GIT) { $AIWB_GIT_VERSION = (& $AIWB_GIT --version 2>&1 | Select-Object -First 1) } } catch {}
Write-Output ("__AIWB_CODEX_VERSION__" + $AIWB_CODEX_VERSION)
Write-Output ("__AIWB_CLAUDE_VERSION__" + $AIWB_CLAUDE_VERSION)
Write-Output ("__AIWB_GIT_VERSION__" + $AIWB_GIT_VERSION)
$AIWB_CPU_PERCENT = ""
$AIWB_MEM_PERCENT = ""
$AIWB_MEM_USED_MB = ""
$AIWB_MEM_TOTAL_MB = ""
$AIWB_DISK_PERCENT = ""
$AIWB_DISK_USED_GB = ""
$AIWB_DISK_TOTAL_GB = ""
$AIWB_UPTIME_SECONDS = ""
$AIWB_PROCESS_COUNT = ""
try {
  $AIWB_CPU = Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average
  if ($null -ne $AIWB_CPU.Average) { $AIWB_CPU_PERCENT = [Math]::Round([double]$AIWB_CPU.Average, 1) }
} catch {}
try {
  $AIWB_OS = Get-CimInstance Win32_OperatingSystem
  $AIWB_MEM_TOTAL_MB = [Math]::Round([double]$AIWB_OS.TotalVisibleMemorySize / 1024, 0)
  $AIWB_MEM_FREE_MB = [Math]::Round([double]$AIWB_OS.FreePhysicalMemory / 1024, 0)
  $AIWB_MEM_USED_MB = [Math]::Max(0, $AIWB_MEM_TOTAL_MB - $AIWB_MEM_FREE_MB)
  if ($AIWB_MEM_TOTAL_MB -gt 0) { $AIWB_MEM_PERCENT = [Math]::Round(($AIWB_MEM_USED_MB * 100.0 / $AIWB_MEM_TOTAL_MB), 1) }
  if ($AIWB_OS.LastBootUpTime) {
    $AIWB_UPTIME_SECONDS = [Math]::Round(((Get-Date) - $AIWB_OS.LastBootUpTime).TotalSeconds, 0)
  }
} catch {}
try {
  $AIWB_DRIVE_NAME = (Get-Location).Path.Substring(0, 1)
  $AIWB_DRIVE = Get-PSDrive -Name $AIWB_DRIVE_NAME -ErrorAction SilentlyContinue
  if ($AIWB_DRIVE) {
    $AIWB_DISK_USED = [double]$AIWB_DRIVE.Used
    $AIWB_DISK_FREE = [double]$AIWB_DRIVE.Free
    $AIWB_DISK_TOTAL = $AIWB_DISK_USED + $AIWB_DISK_FREE
    if ($AIWB_DISK_TOTAL -gt 0) {
      $AIWB_DISK_PERCENT = [Math]::Round(($AIWB_DISK_USED * 100.0 / $AIWB_DISK_TOTAL), 1)
      $AIWB_DISK_USED_GB = [Math]::Round($AIWB_DISK_USED / 1GB, 1)
      $AIWB_DISK_TOTAL_GB = [Math]::Round($AIWB_DISK_TOTAL / 1GB, 1)
    }
  }
} catch {}
try { $AIWB_PROCESS_COUNT = (Get-Process | Measure-Object).Count } catch {}
Write-Output ("__AIWB_HOST_CPU_PERCENT__" + $AIWB_CPU_PERCENT)
Write-Output ("__AIWB_HOST_MEM_PERCENT__" + $AIWB_MEM_PERCENT)
Write-Output ("__AIWB_HOST_MEM_USED_MB__" + $AIWB_MEM_USED_MB)
Write-Output ("__AIWB_HOST_MEM_TOTAL_MB__" + $AIWB_MEM_TOTAL_MB)
Write-Output ("__AIWB_HOST_DISK_PERCENT__" + $AIWB_DISK_PERCENT)
Write-Output ("__AIWB_HOST_DISK_USED_GB__" + $AIWB_DISK_USED_GB)
Write-Output ("__AIWB_HOST_DISK_TOTAL_GB__" + $AIWB_DISK_TOTAL_GB)
Write-Output "__AIWB_HOST_LOAD_AVG__"
Write-Output ("__AIWB_HOST_UPTIME_SECONDS__" + $AIWB_UPTIME_SECONDS)
Write-Output ("__AIWB_HOST_PROCESS_COUNT__" + $AIWB_PROCESS_COUNT)
$AIWB_WSL_STATUS = "missing"
$AIWB_WSL_DISTROS = @()
$AIWB_WSL_DEFAULT_DISTRO = ""
$AIWB_WSL_VERSION = ""
try {
  $AIWB_WSL = Get-Command "wsl.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($AIWB_WSL) {
    $AIWB_WSL_STATUS = "installed_no_distro"
    try {
      $AIWB_WSL_VERSION = [string](& wsl.exe --version 2>$null | Select-Object -First 1)
    } catch {}
    try {
      $AIWB_WSL_DISTROS = @(
        & wsl.exe --list --quiet 2>$null |
          ForEach-Object { ([string]$_).Replace([char]0, "").Trim() } |
          Where-Object { $_ }
      )
    } catch {}
    if ($AIWB_WSL_DISTROS.Count -gt 0) {
      $AIWB_WSL_DEFAULT_DISTRO = [string]$AIWB_WSL_DISTROS[0]
      try {
        $AIWB_WSL_PROBE = [string](& wsl.exe -d $AIWB_WSL_DEFAULT_DISTRO -u root -- sh -lc "printf AIWB_WSL_READY" 2>$null)
        if ($AIWB_WSL_PROBE -match "AIWB_WSL_READY") { $AIWB_WSL_STATUS = "ready" }
        else { $AIWB_WSL_STATUS = "initialization_required" }
      } catch {
        $AIWB_WSL_STATUS = "initialization_required"
      }
    }
  }
} catch {
  $AIWB_WSL_STATUS = "error"
}
Write-Output ("__AIWB_WSL_STATUS__" + $AIWB_WSL_STATUS)
Write-Output ("__AIWB_WSL_DISTROS__" + ($AIWB_WSL_DISTROS -join ","))
Write-Output ("__AIWB_WSL_DEFAULT_DISTRO__" + $AIWB_WSL_DEFAULT_DISTRO)
Write-Output ("__AIWB_WSL_VERSION__" + $AIWB_WSL_VERSION)
Write-Output "__AIWB_AGENT__unsupported"
`);
}

export function buildInstallWslCommand(profile) {
  if (!isWindowsProfile(profile)) {
    return remoteBashCommand(profile, `printf '__AIWB_WSL_INSTALL_STATUS__ready\\n'`);
  }

  return powershellStdinCommand(`
$AIWB_PRINCIPAL = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$AIWB_IS_ADMIN = $AIWB_PRINCIPAL.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Output ("__AIWB_WSL_ADMIN__" + $AIWB_IS_ADMIN.ToString().ToLowerInvariant())
if (-not $AIWB_IS_ADMIN) {
  Write-Output "__AIWB_WSL_INSTALL_STATUS__permission_required"
  Write-Output "__AIWB_WSL_INSTALL_ERROR__当前 SSH 账户没有管理员权限，无法启用 WSL。"
  exit 5
}

function Get-AiwbWslDistros {
  try {
    return @(
      & wsl.exe --list --quiet 2>$null |
        ForEach-Object { ([string]$_).Replace([char]0, "").Trim() } |
        Where-Object { $_ }
    )
  } catch { return @() }
}

$AIWB_DISTROS = @(Get-AiwbWslDistros)
if ($AIWB_DISTROS.Count -gt 0) {
  $AIWB_DISTRO = [string]$AIWB_DISTROS[0]
  try {
    $AIWB_PROBE = [string](& wsl.exe -d $AIWB_DISTRO -u root -- sh -lc "printf AIWB_WSL_READY" 2>$null)
    if ($AIWB_PROBE -match "AIWB_WSL_READY") {
      Write-Output "__AIWB_WSL_INSTALL_STATUS__ready"
      Write-Output ("__AIWB_WSL_DEFAULT_DISTRO__" + $AIWB_DISTRO)
      exit 0
    }
  } catch {}
}

Write-Output "__AIWB_WSL_INSTALL_STATUS__installing"
if (-not (Get-Command "wsl.exe" -ErrorAction SilentlyContinue)) {
  & dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
  $AIWB_SUBSYSTEM_EXIT = $LASTEXITCODE
  & dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
  $AIWB_VM_EXIT = $LASTEXITCODE
  if ($AIWB_SUBSYSTEM_EXIT -ne 0 -or $AIWB_VM_EXIT -ne 0) {
    Write-Output "__AIWB_WSL_INSTALL_STATUS__failed"
    Write-Output "__AIWB_WSL_INSTALL_ERROR__Windows 无法启用 WSL 系统组件，请检查系统版本和虚拟化设置。"
    exit 6
  }
  Write-Output "__AIWB_WSL_INSTALL_STATUS__restart_required"
  Write-Output "__AIWB_WSL_DEFAULT_DISTRO__Ubuntu"
  exit 0
}
& wsl.exe --install -d Ubuntu --no-launch
$AIWB_INSTALL_EXIT = $LASTEXITCODE
Write-Output ("__AIWB_WSL_INSTALL_EXIT_CODE__" + $AIWB_INSTALL_EXIT)
if ($AIWB_INSTALL_EXIT -ne 0 -and $AIWB_INSTALL_EXIT -ne 3010) {
  Write-Output "__AIWB_WSL_INSTALL_STATUS__failed"
  Write-Output "__AIWB_WSL_INSTALL_ERROR__WSL 安装命令执行失败。请确认系统为 Windows 10 2004+、Windows 11 或 Windows Server 2022+。"
  exit $AIWB_INSTALL_EXIT
}

$AIWB_DISTROS = @(Get-AiwbWslDistros)
if ($AIWB_DISTROS.Count -gt 0) {
  $AIWB_DISTRO = [string]$AIWB_DISTROS[0]
  try {
    $AIWB_PROBE = [string](& wsl.exe -d $AIWB_DISTRO -u root -- sh -lc "printf AIWB_WSL_READY" 2>$null)
    if ($AIWB_PROBE -match "AIWB_WSL_READY") {
      Write-Output "__AIWB_WSL_INSTALL_STATUS__ready"
      Write-Output ("__AIWB_WSL_DEFAULT_DISTRO__" + $AIWB_DISTRO)
      exit 0
    }
  } catch {}
}

Write-Output "__AIWB_WSL_INSTALL_STATUS__restart_required"
Write-Output "__AIWB_WSL_DEFAULT_DISTRO__Ubuntu"
`);
}

export function buildRestartWindowsCommand(profile) {
  if (!isWindowsProfile(profile)) return remoteBashCommand(profile, `printf '__AIWB_RESTART_STATUS__unsupported\\n'`);
  return powershellStdinCommand(`
Write-Output "__AIWB_RESTART_STATUS__scheduled"
Start-Process -FilePath "$env:SystemRoot\\System32\\shutdown.exe" -ArgumentList '/r /t 5 /c "AI Workbench 正在完成 WSL 安装" /f' -WindowStyle Hidden
`);
}

export function buildInstallGitCommand(profile) {
  if (isWindowsProfile(profile)) {
    return powershellStdinCommand(`
function Resolve-AiwbCommand {
  param([string]$Name)
  $AIWB_CMD = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($AIWB_CMD) { return $AIWB_CMD.Source }
  try {
    $AIWB_WHERE = (& where.exe $Name 2>$null | Select-Object -First 1)
    if ($AIWB_WHERE) { return $AIWB_WHERE }
  } catch {}
  $AIWB_COMMON = @(
    "$env:ProgramFiles\\Git\\cmd\\git.exe",
    "$env:ProgramFiles\\Git\\bin\\git.exe"
  )
  $AIWB_PROGRAM_FILES_X86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  if ($AIWB_PROGRAM_FILES_X86) {
    $AIWB_COMMON += (Join-Path $AIWB_PROGRAM_FILES_X86 "Git\\cmd\\git.exe")
    $AIWB_COMMON += (Join-Path $AIWB_PROGRAM_FILES_X86 "Git\\bin\\git.exe")
  }
  foreach ($AIWB_PATH in $AIWB_COMMON) {
    if ($AIWB_PATH -and (Test-Path -LiteralPath $AIWB_PATH -PathType Leaf)) { return $AIWB_PATH }
  }
  return ""
}

function Print-AiwbGitHealth {
  $AIWB_GIT = Resolve-AiwbCommand "git"
  $AIWB_VERSION = ""
  try { if ($AIWB_GIT) { $AIWB_VERSION = (& $AIWB_GIT --version 2>&1 | Select-Object -First 1) } } catch {}
  Write-Output ("__AIWB_GIT__" + $AIWB_GIT)
  Write-Output ("__AIWB_GIT_VERSION__" + $AIWB_VERSION)
}

$AIWB_EXISTING = Resolve-AiwbCommand "git"
if ($AIWB_EXISTING) {
  Write-Output "__AIWB_INSTALL_STATUS__already_installed"
  Print-AiwbGitHealth
  exit 0
}

Write-Output "__AIWB_INSTALL_STATUS__installing"
if (Get-Command winget -ErrorAction SilentlyContinue) {
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
} elseif (Get-Command choco -ErrorAction SilentlyContinue) {
  choco install git -y
} elseif (Get-Command scoop -ErrorAction SilentlyContinue) {
  scoop install git
} else {
  Write-Output "__AIWB_INSTALL_ERROR__Windows 未找到 winget / choco / scoop，无法自动安装 Git。"
  Print-AiwbGitHealth
  exit 2
}

Print-AiwbGitHealth
if (-not (Resolve-AiwbCommand "git")) {
  Write-Output "__AIWB_INSTALL_ERROR__Git 安装命令已执行，但当前 SSH 会话还没有识别到 git。请重新连接或检查 PATH。"
  exit 3
}
Write-Output "__AIWB_INSTALL_STATUS__done"
`);
  }

  return remoteBashCommand(profile, `
set -e

aiwb_print_git_health() {
  printf '__AIWB_GIT__%s\\n' "$(command -v git || true)"
  printf '__AIWB_GIT_VERSION__'
  (git --version 2>&1 || true) | head -n 1
}

if command -v git >/dev/null 2>&1; then
  printf '__AIWB_INSTALL_STATUS__already_installed\\n'
  aiwb_print_git_health
  exit 0
fi

aiwb_root() {
  if [ "$(id -u)" = "0" ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    printf '__AIWB_INSTALL_ERROR__当前用户不是 root，且服务器没有可用 sudo，无法自动安装 Git。\\n'
    exit 2
  fi
}

printf '__AIWB_INSTALL_STATUS__installing\\n'
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  aiwb_root apt-get update -y
  aiwb_root apt-get install -y git ca-certificates
elif command -v dnf >/dev/null 2>&1; then
  aiwb_root dnf install -y git ca-certificates
elif command -v yum >/dev/null 2>&1; then
  aiwb_root yum install -y git ca-certificates
elif command -v apk >/dev/null 2>&1; then
  aiwb_root apk add --no-cache git ca-certificates
elif command -v zypper >/dev/null 2>&1; then
  aiwb_root zypper --non-interactive install git ca-certificates
elif command -v pacman >/dev/null 2>&1; then
  aiwb_root pacman -Sy --noconfirm git ca-certificates
else
  printf '__AIWB_INSTALL_ERROR__未识别到 apt/yum/dnf/apk/zypper/pacman，无法自动安装 Git。\\n'
  aiwb_print_git_health
  exit 2
fi

aiwb_print_git_health
if ! command -v git >/dev/null 2>&1; then
  printf '__AIWB_INSTALL_ERROR__Git 安装命令已执行，但当前环境仍未找到 git。\\n'
  exit 3
fi
printf '__AIWB_INSTALL_STATUS__done\\n'
`);
}

export function buildGitDownloadCommand(profile, options = {}) {
  const repoUrl = String(options.repoUrl || "").trim();
  const targetDir = String(options.targetDir || profile.workdir || "").trim();
  const branch = String(options.branch || "").trim();

  if (isWindowsProfile(profile)) {
    return powershellStdinCommand(`
$AIWB_REPO = ${psQuote(repoUrl)}
$AIWB_TARGET = ${psQuote(targetDir)}
$AIWB_BRANCH = ${psQuote(branch)}
if (-not $AIWB_REPO) {
  Write-Output "__AIWB_GIT_OPERATION_ERROR__请先填写 Git 仓库地址。"
  exit 2
}
if (-not $AIWB_TARGET) {
  Write-Output "__AIWB_GIT_OPERATION_ERROR__请先填写保存目录。"
  exit 2
}
$AIWB_GIT = Get-Command git -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $AIWB_GIT) {
  Write-Output "__AIWB_GIT_OPERATION_ERROR__远端没有找到 git，请先安装 Git。"
  exit 2
}

$AIWB_PARENT = Split-Path -Parent $AIWB_TARGET
if ($AIWB_PARENT) { New-Item -ItemType Directory -Force -Path $AIWB_PARENT | Out-Null }

if (Test-Path -LiteralPath (Join-Path $AIWB_TARGET ".git") -PathType Container) {
  Set-Location -LiteralPath $AIWB_TARGET
  git fetch --all --prune
  if ($AIWB_BRANCH) {
    git checkout $AIWB_BRANCH
  }
  git pull --ff-only
  Write-Output "__AIWB_GIT_OPERATION_STATUS__updated"
} elseif (Test-Path -LiteralPath $AIWB_TARGET) {
  $AIWB_CHILDREN = @(Get-ChildItem -LiteralPath $AIWB_TARGET -Force -ErrorAction SilentlyContinue)
  if ($AIWB_CHILDREN.Count -gt 0) {
    Write-Output "__AIWB_GIT_OPERATION_ERROR__目标目录已存在但不是 Git 仓库，请换一个空目录。"
    exit 3
  }
  if ($AIWB_BRANCH) {
    git clone --branch $AIWB_BRANCH $AIWB_REPO $AIWB_TARGET
  } else {
    git clone $AIWB_REPO $AIWB_TARGET
  }
  Write-Output "__AIWB_GIT_OPERATION_STATUS__cloned"
} else {
  if ($AIWB_BRANCH) {
    git clone --branch $AIWB_BRANCH $AIWB_REPO $AIWB_TARGET
  } else {
    git clone $AIWB_REPO $AIWB_TARGET
  }
  Write-Output "__AIWB_GIT_OPERATION_STATUS__cloned"
}
Write-Output ("__AIWB_GIT_OPERATION_TARGET__" + $AIWB_TARGET)
Write-Output ("__AIWB_GIT_OPERATION_REPO__" + $AIWB_REPO)
`);
  }

  return remoteBashCommand(profile, `
set -e
AIWB_REPO=${shQuote(repoUrl)}
AIWB_TARGET=${shQuote(targetDir)}
AIWB_BRANCH=${shQuote(branch)}

if [ -z "$AIWB_REPO" ]; then
  printf '__AIWB_GIT_OPERATION_ERROR__请先填写 Git 仓库地址。\\n'
  exit 2
fi
if [ -z "$AIWB_TARGET" ]; then
  printf '__AIWB_GIT_OPERATION_ERROR__请先填写保存目录。\\n'
  exit 2
fi
if ! command -v git >/dev/null 2>&1; then
  printf '__AIWB_GIT_OPERATION_ERROR__远端没有找到 git，请先安装 Git。\\n'
  exit 2
fi

AIWB_PARENT=$(dirname "$AIWB_TARGET")
[ -n "$AIWB_PARENT" ] && mkdir -p "$AIWB_PARENT"

if [ -d "$AIWB_TARGET/.git" ]; then
  cd "$AIWB_TARGET"
  git fetch --all --prune
  if [ -n "$AIWB_BRANCH" ]; then
    git checkout "$AIWB_BRANCH"
  fi
  git pull --ff-only
  printf '__AIWB_GIT_OPERATION_STATUS__updated\\n'
elif [ -e "$AIWB_TARGET" ] && [ "$(find "$AIWB_TARGET" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)" ]; then
  printf '__AIWB_GIT_OPERATION_ERROR__目标目录已存在但不是 Git 仓库，请换一个空目录。\\n'
  exit 3
else
  if [ -n "$AIWB_BRANCH" ]; then
    git clone --branch "$AIWB_BRANCH" "$AIWB_REPO" "$AIWB_TARGET"
  else
    git clone "$AIWB_REPO" "$AIWB_TARGET"
  fi
  printf '__AIWB_GIT_OPERATION_STATUS__cloned\\n'
fi
printf '__AIWB_GIT_OPERATION_TARGET__%s\\n' "$AIWB_TARGET"
printf '__AIWB_GIT_OPERATION_REPO__%s\\n' "$AIWB_REPO"
`);
}

export function parseHealth(output) {
  const result = {};
  for (const line of String(output || "").split("\n")) {
    const match = line.match(/^__AIWB_([^_]+(?:_[^_]+)*)__([\s\S]*)$/);
    if (match) {
      result[match[1].toLowerCase()] = match[2].trim();
    }
  }
  return result;
}

export function parseWorkbenchAgentOutput(output) {
  const text = String(output || "");
  const marker = (name) =>
    text.match(new RegExp(`^__AIWB_AGENT_${name}__([\\s\\S]*?)$`, "m"))?.[1]?.trim() || "";
  const taskOutput =
    text.match(/__AIWB_AGENT_TASK_OUTPUT_START__\r?\n([\s\S]*?)\r?\n__AIWB_AGENT_TASK_OUTPUT_END__/)?.[1] || "";
  return {
    status: marker("STATUS"),
    version: marker("VERSION"),
    home: marker("HOME"),
    serviceStatus: marker("SERVICE_STATUS"),
    daemonStatus: marker("DAEMON_STATUS"),
    daemonHeartbeat: marker("DAEMON_HEARTBEAT"),
    queuedTasks: marker("TASKS_QUEUED"),
    runningTasks: marker("TASKS_RUNNING"),
    doneTasks: marker("TASKS_DONE"),
    errorTasks: marker("TASKS_ERROR"),
    cancelledTasks: marker("TASKS_CANCELLED"),
    hostCpuPercent: marker("HOST_CPU_PERCENT"),
    hostMemPercent: marker("HOST_MEM_PERCENT"),
    hostMemUsedMb: marker("HOST_MEM_USED_MB"),
    hostMemTotalMb: marker("HOST_MEM_TOTAL_MB"),
    hostDiskPercent: marker("HOST_DISK_PERCENT"),
    hostDiskUsedGb: marker("HOST_DISK_USED_GB"),
    hostDiskTotalGb: marker("HOST_DISK_TOTAL_GB"),
    hostLoadAvg: marker("HOST_LOAD_AVG"),
    hostUptimeSeconds: marker("HOST_UPTIME_SECONDS"),
    hostProcessCount: marker("HOST_PROCESS_COUNT"),
    taskId: marker("TASK_ID"),
    conversationId: marker("TASK_CONVERSATION_ID"),
    taskStatus: marker("TASK_STATUS"),
    exitCode: marker("TASK_EXIT_CODE"),
    pid: marker("TASK_PID"),
    attempts: marker("TASK_ATTEMPTS"),
    startedAt: marker("TASK_STARTED_AT"),
    runnerStartedAt: marker("TASK_RUNNER_STARTED_AT"),
    finishedAt: marker("TASK_FINISHED_AT"),
    error: marker("ERROR"),
    blockedByTaskId: marker("BLOCKED_BY_TASK_ID"),
    blockedByConversationId: marker("BLOCKED_BY_CONVERSATION_ID"),
    output: taskOutput.trim(),
    raw: text,
  };
}

export function parseWorkbenchAgentTaskList(output) {
  const text = String(output || "");
  const blocks = text.match(/__AIWB_AGENT_TASK_ITEM_START__[\s\S]*?__AIWB_AGENT_TASK_ITEM_END__/g) || [];
  return blocks.map((block) => {
    const marker = (name) =>
      block.match(new RegExp(`^__AIWB_AGENT_TASK_ITEM_${name}__([\\s\\S]*?)$`, "m"))?.[1]?.trim() || "";
    const prompt =
      block.match(/__AIWB_AGENT_TASK_ITEM_PROMPT_START__\r?\n([\s\S]*?)\r?\n__AIWB_AGENT_TASK_ITEM_PROMPT_END__/)?.[1]?.trim() ||
      "";
    const status = marker("STATUS") || "unknown";
    const pid = marker("PID");
    return {
      id: marker("ID"),
      status,
      agentId: marker("AGENT_ID") || "",
      model: marker("MODEL"),
      conversationId: marker("CONVERSATION_ID"),
      name: marker("NAME"),
      workdir: marker("WORKDIR"),
      pid,
      pidAlive: marker("PID_ALIVE"),
      attempts: marker("ATTEMPTS"),
      exitCode: marker("EXIT_CODE"),
      createdAt: marker("CREATED_AT"),
      startedAt: marker("STARTED_AT"),
      runnerStartedAt: marker("RUNNER_STARTED_AT"),
      finishedAt: marker("FINISHED_AT"),
      prompt,
      active: ["queued", "preparing", "running", "busy"].includes(status),
    };
  }).filter((item) => item.id);
}

export function timestampFromAgentTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

export function parseWorkbenchAgentConversations(output) {
  const text = String(output || "");
  const blocks = text.match(/__AIWB_AGENT_CONVERSATION_START__[\s\S]*?__AIWB_AGENT_CONVERSATION_END__/g) || [];
  return blocks
    .map((block) => {
      const marker = (name) =>
        block.match(new RegExp(`^__AIWB_AGENT_CONVERSATION_${name}__([\\s\\S]*?)$`, "m"))?.[1]?.trim() || "";
      const historyBlock =
        block.match(/__AIWB_AGENT_CONVERSATION_HISTORY_START__\n([\s\S]*?)\n__AIWB_AGENT_CONVERSATION_HISTORY_END__/)?.[1] || "";
      const historyMarker = (name) =>
        historyBlock.match(new RegExp(`^__AIWB_AGENT_CONVERSATION_HISTORY_${name}__([\\s\\S]*?)$`, "m"))?.[1]?.trim() || "";
      const historyItems = historyBlock.match(/__AIWB_AGENT_CONVERSATION_HISTORY_ITEM_START__[\s\S]*?__AIWB_AGENT_CONVERSATION_HISTORY_ITEM_END__/g) || [];
      const history = historyItems
        .map((itemBlock) => {
          const itemMarker = (name) =>
            itemBlock.match(new RegExp(`^__AIWB_AGENT_CONVERSATION_HISTORY_${name}__([\\s\\S]*?)$`, "m"))?.[1]?.trim() || "";
          const prompt =
            itemBlock.match(/__AIWB_AGENT_CONVERSATION_HISTORY_PROMPT_START__\n([\s\S]*?)\n__AIWB_AGENT_CONVERSATION_HISTORY_PROMPT_END__/)?.[1]?.trim() ||
            "";
          const result =
            itemBlock.match(/__AIWB_AGENT_CONVERSATION_HISTORY_RESULT_START__\n([\s\S]*?)\n__AIWB_AGENT_CONVERSATION_HISTORY_RESULT_END__/)?.[1]?.trim() ||
            "";
          const sortKey = itemMarker("SORT_KEY");
          const sortEpoch = Number(String(sortKey).split(":")[0] || 0) || 0;
          return {
            taskId: itemMarker("TASK_ID"),
            sortKey,
            status: itemMarker("STATUS") || "unknown",
            agentId: itemMarker("AGENT_ID") === "claude" ? "claude" : "codex",
            startedAt: itemMarker("STARTED_AT"),
            finishedAt: itemMarker("FINISHED_AT"),
            exitCode: itemMarker("EXIT_CODE"),
            lastPrompt: prompt,
            lastResult: result,
            mtime: sortEpoch || timestampFromAgentTime(itemMarker("FINISHED_AT") || itemMarker("STARTED_AT")),
          };
        })
        .filter((item) => item.taskId);
      const lastPrompt =
        block.match(/__AIWB_AGENT_CONVERSATION_LAST_PROMPT_START__\n([\s\S]*?)\n__AIWB_AGENT_CONVERSATION_LAST_PROMPT_END__/)?.[1]?.trim() ||
        "";
      const lastResult =
        block.match(/__AIWB_AGENT_CONVERSATION_LAST_RESULT_START__\n([\s\S]*?)\n__AIWB_AGENT_CONVERSATION_LAST_RESULT_END__/)?.[1]?.trim() ||
        "";
      return {
        id: marker("ID"),
        name: marker("NAME"),
        workdir: marker("WORKDIR"),
        agentId: marker("AGENT_ID") === "claude" ? "claude" : "codex",
        status: marker("STATUS") || "unknown",
        taskId: marker("TASK_ID"),
        createdAt: marker("CREATED_AT"),
        updatedAt: marker("UPDATED_AT"),
        startedAt: marker("STARTED_AT"),
        finishedAt: marker("FINISHED_AT"),
        exitCode: marker("EXIT_CODE"),
        lastPrompt,
        lastResult,
        history,
        historyCursor: historyMarker("NEXT_BEFORE"),
        historyHasMore: historyBlock ? historyMarker("HAS_MORE") === "1" : false,
        mtime: timestampFromAgentTime(marker("UPDATED_AT") || marker("FINISHED_AT") || marker("STARTED_AT")),
      };
    })
    .filter((item) => item.id && item.workdir);
}

export function healthFromWorkbenchAgentStatus(parsed = {}) {
  const health = {
    agent: parsed.status === "ready" || parsed.version ? "available" : "",
    agent_version: parsed.version || "",
    agent_service_status: parsed.serviceStatus || "",
    agent_daemon_status: parsed.daemonStatus || "",
    agent_daemon_heartbeat: parsed.daemonHeartbeat || "",
    agent_tasks_queued: parsed.queuedTasks || "",
    agent_tasks_running: parsed.runningTasks || "",
    agent_tasks_done: parsed.doneTasks || "",
    agent_tasks_error: parsed.errorTasks || "",
    agent_tasks_cancelled: parsed.cancelledTasks || "",
    agent_task_list: parseWorkbenchAgentTaskList(parsed.raw || ""),
    agent_host_cpu_percent: parsed.hostCpuPercent || "",
    agent_host_mem_percent: parsed.hostMemPercent || "",
    agent_host_mem_used_mb: parsed.hostMemUsedMb || "",
    agent_host_mem_total_mb: parsed.hostMemTotalMb || "",
    agent_host_disk_percent: parsed.hostDiskPercent || "",
    agent_host_disk_used_gb: parsed.hostDiskUsedGb || "",
    agent_host_disk_total_gb: parsed.hostDiskTotalGb || "",
    agent_host_load_avg: parsed.hostLoadAvg || "",
    agent_host_uptime_seconds: parsed.hostUptimeSeconds || "",
    agent_host_process_count: parsed.hostProcessCount || "",
  };
  return Object.fromEntries(
    Object.entries(health).filter(([, value]) => value !== "" && value !== undefined && value !== null),
  );
}

export function workbenchAgentAvailableFromOutput(output) {
  return parseWorkbenchAgentOutput(output).status === "ready";
}

export function workbenchAgentVersionNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

export function mergeAgentConversationsIntoDiscovery(scan, conversations = []) {
  const normalized = normalizeDiscovery({
    ...(scan || {}),
    conversations: conversations.length ? conversations : scan?.conversations || [],
    directories: scan?.directories || [],
    tools: scan?.tools || [],
    activeSessions: scan?.activeSessions || [],
    recentSessions: scan?.recentSessions || [],
    history: scan?.history || {},
  });
  if (!conversations.length) return normalized;

  const directoryByPath = new Map(normalized.directories.map((item) => [item.path, item]));
  conversations.forEach((conversation) => {
    const path = String(conversation.workdir || "").trim();
    if (!path) return;
    const existing = directoryByPath.get(path);
    if (existing) {
      existing.markers = Array.from(new Set([...(existing.markers || []), "agent"]));
      existing.history = {
        ...(existing.history || {}),
        [conversation.agentId]: Number(existing.history?.[conversation.agentId] || 0) + 1,
      };
      existing.latest = Math.max(Number(existing.latest || 0), Number(conversation.mtime || 0));
      existing.score = Number(existing.score || 0) + 40;
    } else {
      directoryByPath.set(path, {
        path,
        name: workdirDisplayName(path),
        markers: ["agent"],
        history: { codex: conversation.agentId === "codex" ? 1 : 0, claude: conversation.agentId === "claude" ? 1 : 0 },
        current: false,
        exists: true,
        score: 40,
        latest: Number(conversation.mtime || 0),
      });
    }
  });
  return {
    ...normalized,
    conversations,
    directories: Array.from(directoryByPath.values()).sort(
      (a, b) =>
        Number(b.score || 0) - Number(a.score || 0) ||
        Number(b.latest || 0) - Number(a.latest || 0) ||
        String(a.path).localeCompare(String(b.path)),
    ),
  };
}
