import * as Foundation from "./foundation.js";

export const latestWorkbenchAgentVersion = "36";
export const workbenchAgentGithubRepo = "chaokongzwp/ai-workbench";
export const workbenchAgentGithubBranch = "main";
export const workbenchAgentGithubRawBaseUrl = `https://raw.githubusercontent.com/${workbenchAgentGithubRepo}/${workbenchAgentGithubBranch}`;
export const workbenchAgentGithubManifestUrl = `${workbenchAgentGithubRawBaseUrl}/agent/latest.json`;
export const workbenchWindowsAgentManifestUrl = `${workbenchAgentGithubRawBaseUrl}/agent/v${latestWorkbenchAgentVersion}/windows-manifest.json`;
export const workbenchAgentOssBucket = "limpet-ai-workbench-47t37ccfz2";
export const workbenchAgentOssEndpoint = "oss-ap-southeast-1.aliyuncs.com";
export const workbenchAgentOssBaseUrl = `https://${workbenchAgentOssBucket}.${workbenchAgentOssEndpoint}`;
export const workbenchAgentManifestUrl = `${workbenchAgentGithubRawBaseUrl}/agent/v${latestWorkbenchAgentVersion}/manifest.json`;
export const workbenchAgentControlEndpoint = "https://inner-api.limpet-inc.cn/aiwb-config-sync/v1/agent-control";

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
  wslDistroFromProfile,
  wslPowerShellHelpers,
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
AIWB_DAEMON_LOCK="$AIWB_HOME/daemon.lock"
AIWB_TICK_LOCK="$AIWB_HOME/tick.lock"
AIWB_LAUNCH_AGENT_LABEL="com.beexofficial.ai-workbench-agent"
AIWB_LAUNCH_AGENT_DIR="$AIWB_USER_HOME/Library/LaunchAgents"
AIWB_LAUNCH_AGENT_PLIST="$AIWB_LAUNCH_AGENT_DIR/$AIWB_LAUNCH_AGENT_LABEL.plist"
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

aiwb_notify_terminal() {
  local task_dir="$1"
  local status
  local notify_url
  local notify_token
  local now_epoch
  local next_epoch
  local attempts
  local http_code
  local lock_dir

  status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
  case "$status" in
    done|error|cancelled) ;;
    *) return 0 ;;
  esac
  [ -s "$task_dir/push_notify_url" ] || return 0
  [ -s "$task_dir/push_notify_token" ] || return 0
  [ ! -s "$task_dir/push_notified_at" ] || return 0
  command -v curl >/dev/null 2>&1 || return 0

  now_epoch="$(date -u +%s)"
  next_epoch="$(cat "$task_dir/push_notify_next_at" 2>/dev/null || printf 0)"
  if [ "$next_epoch" -gt "$now_epoch" ] 2>/dev/null; then
    return 0
  fi
  lock_dir="$task_dir/push_notify.lock"
  mkdir "$lock_dir" 2>/dev/null || return 0
  trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT INT TERM

  notify_url="$(cat "$task_dir/push_notify_url" 2>/dev/null || printf "")"
  notify_token="$(cat "$task_dir/push_notify_token" 2>/dev/null || printf "")"
  attempts="$(cat "$task_dir/push_notify_attempts" 2>/dev/null || printf 0)"
  attempts="$((attempts + 1))"
  aiwb_write_file "$task_dir/push_notify_attempts" "$attempts"
  http_code="$(
    printf '{"status":"%s"}' "$status" |
      curl --silent --show-error --max-time 12 \
        --output "$task_dir/push_notify_response.log" \
        --write-out '%{http_code}' \
        --request POST \
        --header "Authorization: Bearer $notify_token" \
        --header 'Content-Type: application/json' \
        --data-binary @- \
        "$notify_url" 2>>"$task_dir/push_notify_response.log" ||
      printf 000
  )"
  if [ "$http_code" = "200" ]; then
    aiwb_write_file "$task_dir/push_notified_at" "$(aiwb_now)"
    aiwb_append_log "push delivered task=$(basename "$task_dir") status=$status"
  else
    aiwb_write_file "$task_dir/push_notify_next_at" "$((now_epoch + 30 + attempts * 15))"
    aiwb_append_log "push retry scheduled task=$(basename "$task_dir") status=$status http=$http_code"
  fi
  rmdir "$lock_dir" 2>/dev/null || true
  trap - EXIT INT TERM
}

aiwb_schedule_terminal_notification() {
  aiwb_notify_terminal "$1" >/dev/null 2>&1 &
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

  for name in name workdir agent_id turn_id request_message_id response_message_id created_at started_at runner_started_at finished_at exit_code; do
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
    if [ -s "$task_dir/execution-summary.txt" ]; then
      cp "$task_dir/execution-summary.txt" "$conversation_dir/last_execution_summary.txt" 2>/dev/null || true
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
  if [ "$status" = "done" ] || [ "$status" = "error" ] || [ "$status" = "cancelled" ]; then
    aiwb_schedule_terminal_notification "$task_dir"
  fi
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

aiwb_daemon_lock_owner_alive() {
  local pid
  pid="$(cat "$AIWB_DAEMON_LOCK/owner.pid" 2>/dev/null || printf "")"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

aiwb_release_daemon_lock() {
  local owner
  owner="$(cat "$AIWB_DAEMON_LOCK/owner.pid" 2>/dev/null || printf "")"
  if [ "$owner" = "$$" ]; then
    rm -f "$AIWB_DAEMON_LOCK/owner.pid" "$AIWB_DAEMON_LOCK/version" 2>/dev/null || true
    rmdir "$AIWB_DAEMON_LOCK" 2>/dev/null || true
  fi
  if [ "$(cat "$AIWB_DAEMON_PID" 2>/dev/null || printf "")" = "$$" ]; then
    rm -f "$AIWB_DAEMON_PID" 2>/dev/null || true
  fi
}

aiwb_acquire_daemon_lock() {
  if mkdir "$AIWB_DAEMON_LOCK" 2>/dev/null; then
    aiwb_write_file "$AIWB_DAEMON_LOCK/owner.pid" "$$"
    aiwb_write_file "$AIWB_DAEMON_LOCK/version" "$AIWB_VERSION"
    return 0
  fi

  if aiwb_daemon_lock_owner_alive; then
    return 1
  fi

  rm -f "$AIWB_DAEMON_LOCK/owner.pid" "$AIWB_DAEMON_LOCK/version" 2>/dev/null || true
  rmdir "$AIWB_DAEMON_LOCK" 2>/dev/null || true
  if mkdir "$AIWB_DAEMON_LOCK" 2>/dev/null; then
    aiwb_write_file "$AIWB_DAEMON_LOCK/owner.pid" "$$"
    aiwb_write_file "$AIWB_DAEMON_LOCK/version" "$AIWB_VERSION"
    return 0
  fi
  return 1
}

aiwb_installed_version() {
  if [ -x "$AIWB_HOME/aiwbctl" ]; then
    "$AIWB_HOME/aiwbctl" --version 2>/dev/null | head -n 1
  else
    printf "%s\\n" "$AIWB_VERSION"
  fi
}

aiwb_stop_daemons() {
  local pid
  local candidates

  candidates="$(pgrep -f "$AIWB_HOME/aiwbctl daemon" 2>/dev/null || printf "")"
  for pid in $candidates; do
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "$PPID" ] && continue
    kill "$pid" >/dev/null 2>&1 || true
  done

  sleep 0.2
  for pid in $candidates; do
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "$PPID" ] && continue
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  done

  rm -f "$AIWB_DAEMON_PID" "$AIWB_DAEMON_HEARTBEAT" 2>/dev/null || true
  rm -f "$AIWB_DAEMON_LOCK/owner.pid" "$AIWB_DAEMON_LOCK/version" 2>/dev/null || true
  rmdir "$AIWB_DAEMON_LOCK" 2>/dev/null || true
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

aiwb_git_repositories() {
  local workdir="$1"
  local root_repo
  [ -d "$workdir" ] || return 0
  command -v git >/dev/null 2>&1 || return 0

  root_repo="$(git -C "$workdir" rev-parse --show-toplevel 2>/dev/null || printf "")"
  if [ -n "$root_repo" ]; then
    printf "%s\\n" "$root_repo"
    return 0
  fi

  find "$workdir" -mindepth 1 -maxdepth 5 -type d -name .git -prune -print0 2>/dev/null |
    while IFS= read -r -d '' git_dir; do
      dirname "$git_dir"
    done |
    sort -u
}

aiwb_capture_git_snapshot() {
  local target="$1"
  local workdir
  local repo
  local head
  local file
  local hash
  local files_path

  : > "$target"
  workdir="$(cat "$AIWB_TASK_DIR/workdir" 2>/dev/null || printf "")"
  [ -n "$workdir" ] || return 0
  files_path="$AIWB_TASK_DIR/git-files-\$\$.bin"

  while IFS= read -r repo; do
    [ -n "$repo" ] || continue
    head="$(git -C "$repo" rev-parse HEAD 2>/dev/null || printf "")"
    printf "HEAD\\t%s\\t%s\\n" "$repo" "$head" >> "$target"
    {
      git -C "$repo" diff --name-only -z HEAD -- 2>/dev/null || true
      git -C "$repo" ls-files --others --exclude-standard -z 2>/dev/null || true
    } | sort -zu > "$files_path"

    while IFS= read -r -d '' file; do
      [ -n "$file" ] || continue
      if [ -f "$repo/$file" ] || [ -L "$repo/$file" ]; then
        hash="$(git -C "$repo" hash-object -- "$file" 2>/dev/null || printf unreadable)"
      elif [ -e "$repo/$file" ]; then
        hash="non-file"
      else
        hash="deleted"
      fi
      printf "FILE\\t%s\\t%s\\t%s\\n" "$repo" "$file" "$hash" >> "$target"
    done < "$files_path"
  done < <(aiwb_git_repositories "$workdir")

  rm -f "$files_path"
}

aiwb_snapshot_value() {
  local snapshot="$1"
  local kind="$2"
  local repo="$3"
  local file="\${4:-}"
  awk -F "$(printf '\\t')" -v kind="$kind" -v repo="$repo" -v file="$file" '
    $1 == kind && $2 == repo && (kind != "FILE" || $3 == file) {
      print (kind == "FILE" ? $4 : $3)
      exit
    }
  ' "$snapshot" 2>/dev/null
}

aiwb_build_execution_summary() {
  local exit_code="$1"
  local before="$AIWB_TASK_DIR/git-before.tsv"
  local after="$AIWB_TASK_DIR/git-after.tsv"
  local summary="$AIWB_TASK_DIR/execution-summary.txt"
  local keys="$AIWB_TASK_DIR/git-summary-keys.tsv"
  local repo
  local file
  local before_value
  local after_value
  local before_head
  local after_head
  local repo_name
  local changed_count=0
  local commit_count=0
  local added_repository_count=0
  local repository_count=0
  local prompt
  local git_checkout_requested=0

  aiwb_capture_git_snapshot "$after"
  {
    printf "### Agent 执行回执\\n"
    if [ "$exit_code" -eq 0 ] 2>/dev/null; then
      printf -- "- 进程状态：正常结束（退出码 %s）\\n" "$exit_code"
    else
      printf -- "- 进程状态：执行失败（退出码 %s）\\n" "$exit_code"
    fi
  } > "$summary"

  {
    awk -F "$(printf '\\t')" '$1 == "HEAD" { print $2 }' "$before" "$after" 2>/dev/null
  } | sort -u > "$keys"
  while IFS= read -r repo; do
    [ -n "$repo" ] || continue
    before_head="$(aiwb_snapshot_value "$before" HEAD "$repo")"
    after_head="$(aiwb_snapshot_value "$after" HEAD "$repo")"
    if [ -z "$before_head" ] && [ -n "$after_head" ]; then
      printf -- "- 新增 Git 仓库：%s\\n" "$repo" >> "$summary"
      added_repository_count="$((added_repository_count + 1))"
    fi
    if [ -n "$before_head" ] && [ -n "$after_head" ] && [ "$before_head" != "$after_head" ]; then
      repo_name="$(basename "$repo")"
      printf -- "- 新提交（%s）：\\n" "$repo_name" >> "$summary"
      git -C "$repo" log --format='  - %h %s' "$before_head..$after_head" -n 12 2>/dev/null >> "$summary" || true
      commit_count="$((commit_count + 1))"
    fi
  done < "$keys"

  {
    awk -F "$(printf '\\t')" '$1 == "FILE" { print $2 "\\t" $3 }' "$before" "$after" 2>/dev/null
  } | sort -u > "$keys"
  while IFS=$'\\t' read -r repo file; do
    [ -n "$repo" ] && [ -n "$file" ] || continue
    before_value="$(aiwb_snapshot_value "$before" FILE "$repo" "$file")"
    after_value="$(aiwb_snapshot_value "$after" FILE "$repo" "$file")"
    [ "$before_value" = "$after_value" ] && continue
    if [ "$changed_count" -eq 0 ]; then
      printf -- "- 工作区文件变化：\\n" >> "$summary"
    fi
    repo_name="$(basename "$repo")"
    if [ -z "$after_value" ]; then
      printf "  - %s/%s（已恢复为干净状态或已提交）\\n" "$repo_name" "$file" >> "$summary"
    elif [ "$after_value" = "deleted" ]; then
      printf "  - %s/%s（已删除）\\n" "$repo_name" "$file" >> "$summary"
    else
      printf "  - %s/%s\\n" "$repo_name" "$file" >> "$summary"
    fi
    changed_count="$((changed_count + 1))"
    [ "$changed_count" -ge 80 ] && break
  done < "$keys"

  if [ "$changed_count" -eq 0 ] && [ "$commit_count" -eq 0 ]; then
    printf -- "- Git 变化：本任务期间未检测到新增提交或工作区文件变化。\\n" >> "$summary"
  fi
  repository_count="$(awk -F "$(printf '\\t')" '$1 == "HEAD" { count += 1 } END { print count + 0 }' "$after" 2>/dev/null)"
  prompt="$(cat "$AIWB_TASK_DIR/prompt.txt" 2>/dev/null || printf "")"
  if printf "%s" "$prompt" | grep -Eiq 'git[[:space:]]+clone|(^|[^[:alpha:]])clone([^[:alpha:]]|$)|克隆|下载.{0,12}(代码|仓库|项目)|拉取.{0,12}(代码|仓库|项目)|(代码|仓库|项目).{0,12}(下载|拉取)'; then
    git_checkout_requested=1
    if [ "$repository_count" -eq 0 ]; then
      printf -- "- 落盘验证：失败。任务结束后工作目录内没有检测到 Git 仓库。\\n" >> "$summary"
    else
      printf -- "- 落盘验证：通过。任务结束后检测到 %s 个 Git 仓库。\\n" "$repository_count" >> "$summary"
    fi
  fi
  printf -- "- 说明：这是 Agent 根据任务开始与结束时的 Git 状态自动生成的执行痕迹。\\n" >> "$summary"
  rm -f "$keys"
  if [ "$git_checkout_requested" -eq 1 ] && [ "$repository_count" -eq 0 ]; then
    return 65
  fi
  return 0
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
    if [ -s "$AIWB_TASK_DIR/execution-summary.txt" ]; then
      cp "$AIWB_TASK_DIR/execution-summary.txt" "$conversation_dir/last_execution_summary.txt" 2>/dev/null || true
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
aiwb_capture_git_snapshot "$AIWB_TASK_DIR/git-before.tsv"
AIWB_DECODED_COMMAND="$(base64 -d < "$AIWB_TASK_DIR/command.b64" 2>"$AIWB_TASK_DIR/bootstrap.log")"
AIWB_DECODE_STATUS=$?
if [ "$AIWB_DECODE_STATUS" -ne 0 ] || [ -z "$AIWB_DECODED_COMMAND" ]; then
  printf "AI Workbench Agent: command payload decode failed.\\n" >> "$AIWB_TASK_DIR/bootstrap.log"
  aiwb_build_execution_summary "$AIWB_DECODE_STATUS"
  aiwb_set_status "error" "$AIWB_DECODE_STATUS"
  exit 0
fi

# Codex bundled with ChatGPT is executable but is not exposed on the PATH used
# by remote SSH commands. Keep older saved profiles working on macOS hosts.
if [ ! -x "/usr/local/bin/codex" ] && [ -x "/Applications/ChatGPT.app/Contents/Resources/codex" ]; then
  AIWB_DECODED_COMMAND="$(printf "%s" "$AIWB_DECODED_COMMAND" | sed "s#/usr/local/bin/codex#/Applications/ChatGPT.app/Contents/Resources/codex#g")"
fi

AIWB_TASK_AGENT_ID="$(cat "$AIWB_TASK_DIR/agent_id" 2>/dev/null || printf "")"
if [ "$AIWB_TASK_AGENT_ID" = "claude" ]; then
  export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1
fi

eval "$AIWB_DECODED_COMMAND" > "$AIWB_TASK_DIR/output.log" 2>&1
AIWB_EXIT_CODE=$?
aiwb_build_execution_summary "$AIWB_EXIT_CODE"
AIWB_GIT_VERIFICATION_CODE=$?
if [ "$AIWB_EXIT_CODE" -eq 0 ] && [ "$AIWB_GIT_VERIFICATION_CODE" -eq 65 ]; then
  cat > "$AIWB_TASK_DIR/output.log" <<'AIWB_GIT_VERIFICATION_FAILED'
AIWB_FINAL_START
代码没有下载成功。

远端命令虽然正常结束，但 Agent 检查了当前工作目录，没有发现任何 Git 仓库。
App 不再把这类情况显示为成功。请检查仓库地址、网络、权限和实际下载路径后重试。
AIWB_FINAL_END
AIWB_GIT_VERIFICATION_FAILED
  AIWB_EXIT_CODE=65
fi
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

  nohup bash "$task_dir/run.sh" "$task_dir" </dev/null >"$task_dir/launcher.log" 2>&1 &
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
  printf "__AIWB_AGENT_TASK_TURN_ID__%s\\n" "$(cat "$AIWB_TASKS/$task_id/turn_id" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_REQUEST_MESSAGE_ID__%s\\n" "$(cat "$AIWB_TASKS/$task_id/request_message_id" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_RESPONSE_MESSAGE_ID__%s\\n" "$(cat "$AIWB_TASKS/$task_id/response_message_id" 2>/dev/null || printf "")"
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
      done|error|cancelled)
        aiwb_schedule_terminal_notification "$task_dir"
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
  if ! aiwb_acquire_daemon_lock; then
    aiwb_append_log "daemon duplicate rejected pid=$$ version=$AIWB_VERSION"
    return 0
  fi
  aiwb_write_file "$AIWB_DAEMON_PID" "$$"
  aiwb_append_log "daemon started pid=$$ version=$AIWB_VERSION"
  trap 'aiwb_append_log "daemon stopped pid=$$ version=$AIWB_VERSION"; aiwb_release_daemon_lock; exit 0' INT TERM EXIT
  while true; do
    if [ "$(aiwb_installed_version)" != "$AIWB_VERSION" ]; then
      aiwb_append_log "daemon version superseded pid=$$ version=$AIWB_VERSION"
      return 0
    fi
    aiwb_write_file "$AIWB_DAEMON_HEARTBEAT" "$(aiwb_now)"
    aiwb_tick_tasks
    sleep 1
  done
}

aiwb_start_daemon() {
  if aiwb_daemon_alive; then
    return 0
  fi
  nohup "$0" daemon </dev/null >> "$AIWB_DAEMON_LOG" 2>&1 &
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
  if [ "$(uname -s 2>/dev/null || printf "")" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
    if launchctl print "gui/$(id -u)/$AIWB_LAUNCH_AGENT_LABEL" >/dev/null 2>&1; then
      printf "active\\n"
    else
      printf "inactive\\n"
    fi
    return 0
  fi
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
  printf "__AIWB_AGENT_TASK_TURN_ID__%s\\n" "$(cat "$task_dir/turn_id" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_REQUEST_MESSAGE_ID__%s\\n" "$(cat "$task_dir/request_message_id" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_TASK_RESPONSE_MESSAGE_ID__%s\\n" "$(cat "$task_dir/response_message_id" 2>/dev/null || printf "")"
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
  if [ -s "$task_dir/execution-summary.txt" ]; then
    printf "__AIWB_AGENT_TASK_EXECUTION_SUMMARY_START__\\n"
    cat "$task_dir/execution-summary.txt"
    printf "\\n__AIWB_AGENT_TASK_EXECUTION_SUMMARY_END__\\n"
  fi
}

aiwb_task_fingerprint() {
  local task_dir="$1"
  local status
  local output_size
  local output_mtime
  local bootstrap_size
  local bootstrap_mtime
  local launcher_size
  local launcher_mtime
  local summary_size
  local summary_mtime
  local finished_at
  local runner_started_at
  local pid

  if [ ! -d "$task_dir" ]; then
    printf "missing:0:0:0:0:0:0:::\\n"
    return 0
  fi

  status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
  output_size="$([ -f "$task_dir/output.log" ] && wc -c < "$task_dir/output.log" | tr -d '[:space:]' || printf 0)"
  output_mtime="$(aiwb_path_mtime_epoch "$task_dir/output.log")"
  bootstrap_size="$([ -f "$task_dir/bootstrap.log" ] && wc -c < "$task_dir/bootstrap.log" | tr -d '[:space:]' || printf 0)"
  bootstrap_mtime="$(aiwb_path_mtime_epoch "$task_dir/bootstrap.log")"
  launcher_size="$([ -f "$task_dir/launcher.log" ] && wc -c < "$task_dir/launcher.log" | tr -d '[:space:]' || printf 0)"
  launcher_mtime="$(aiwb_path_mtime_epoch "$task_dir/launcher.log")"
  summary_size="$([ -f "$task_dir/execution-summary.txt" ] && wc -c < "$task_dir/execution-summary.txt" | tr -d '[:space:]' || printf 0)"
  summary_mtime="$(aiwb_path_mtime_epoch "$task_dir/execution-summary.txt")"
  finished_at="$(cat "$task_dir/finished_at" 2>/dev/null || printf "")"
  runner_started_at="$(cat "$task_dir/runner_started_at" 2>/dev/null || printf "")"
  pid="$(cat "$task_dir/pid" 2>/dev/null || printf "")"

  printf "%s:%s:%s:%s:%s:%s:%s:%s:%s:%s:%s:%s\\n" \\
    "$status" \\
    "$output_size" \\
    "$output_mtime" \\
    "$bootstrap_size" \\
    "$bootstrap_mtime" \\
    "$launcher_size" \\
    "$launcher_mtime" \\
    "$summary_size" \\
    "$summary_mtime" \\
    "$finished_at" \\
    "$runner_started_at" \\
    "$pid"
}

aiwb_wait_task() {
  local task_id="$1"
  local previous_fingerprint="\${2:-}"
  local timeout_seconds="\${3:-55}"
  local task_dir
  local started_epoch
  local now_epoch
  local fingerprint
  local status

  case "$timeout_seconds" in
    ''|*[!0-9]*) timeout_seconds="55" ;;
  esac
  if [ "$timeout_seconds" -lt 5 ] 2>/dev/null; then
    timeout_seconds="5"
  fi
  if [ "$timeout_seconds" -gt 110 ] 2>/dev/null; then
    timeout_seconds="110"
  fi

  task_dir="$(aiwb_task_dir "$task_id")"
  if [ ! -d "$task_dir" ]; then
    printf "__AIWB_AGENT_EVENT_FINGERPRINT__missing:0:0:0:0:0:0:::\\n"
    aiwb_print_task "$task_id"
    return 0
  fi

  aiwb_start_daemon >/dev/null 2>&1 || true
  started_epoch="$(date -u +%s)"

  while true; do
    aiwb_mark_queued_stale_if_needed "$task_dir"
    aiwb_mark_stale_if_needed "$task_dir"

    fingerprint="$(aiwb_task_fingerprint "$task_dir")"
    status="$(cat "$task_dir/status" 2>/dev/null || printf unknown)"
    if [ -z "$previous_fingerprint" ] || [ "$fingerprint" != "$previous_fingerprint" ]; then
      printf "__AIWB_AGENT_EVENT_FINGERPRINT__%s\\n" "$fingerprint"
      aiwb_print_task "$task_id"
      return 0
    fi

    case "$status" in
      done|error|cancelled|missing)
        printf "__AIWB_AGENT_EVENT_FINGERPRINT__%s\\n" "$fingerprint"
        aiwb_print_task "$task_id"
        return 0
        ;;
    esac

    now_epoch="$(date -u +%s)"
    if [ "$((now_epoch - started_epoch))" -ge "$timeout_seconds" ] 2>/dev/null; then
      printf "__AIWB_AGENT_EVENT_FINGERPRINT__%s\\n" "$fingerprint"
      aiwb_print_task "$task_id"
      return 0
    fi

    sleep 1
  done
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
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_TURN_ID__%s\\n" "$(cat "$task_dir/turn_id" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_REQUEST_MESSAGE_ID__%s\\n" "$(cat "$task_dir/request_message_id" 2>/dev/null || printf "")"
  printf "__AIWB_AGENT_CONVERSATION_HISTORY_RESPONSE_MESSAGE_ID__%s\\n" "$(cat "$task_dir/response_message_id" 2>/dev/null || printf "")"
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
  aiwb_rebuild_conversations_from_tasks
  printf "__AIWB_AGENT_STATUS__ready\\n"
  printf "__AIWB_AGENT_VERSION__%s\\n" "$AIWB_VERSION"
  for conversation_dir in "$AIWB_CONVERSATIONS"/*; do
    [ -d "$conversation_dir" ] || continue
    aiwb_print_conversation_block "$conversation_dir" "0" ""
  done
}

aiwb_rebuild_conversations_from_tasks() {
  local task_dir
  for task_dir in "$AIWB_TASKS"/*; do
    [ -d "$task_dir" ] || continue
    [ -f "$task_dir/conversation_id" ] || continue
    aiwb_mark_queued_stale_if_needed "$task_dir"
    aiwb_mark_stale_if_needed "$task_dir"
    aiwb_update_conversation_from_task "$task_dir"
  done
}

aiwb_print_conversation_status() {
  local conversation_id="$1"
  local history_limit="\${2:-5}"
  local history_before="\${3:-}"
  local conversation_dir
  aiwb_rebuild_conversations_from_tasks
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
  if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
    systemctl stop ai-workbench-agent.service >/dev/null 2>&1 || true
  fi
  aiwb_stop_daemons
  if [ "$(uname -s 2>/dev/null || printf "")" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
    mkdir -p "$AIWB_LAUNCH_AGENT_DIR"
    cat > "$AIWB_LAUNCH_AGENT_PLIST" <<AIWB_LAUNCH_AGENT
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$AIWB_LAUNCH_AGENT_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$AIWB_HOME/aiwbctl</string>
    <string>daemon</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$AIWB_USER_HOME</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>$AIWB_HOME</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>2</integer>
  <key>StandardOutPath</key>
  <string>$AIWB_DAEMON_LOG</string>
  <key>StandardErrorPath</key>
  <string>$AIWB_DAEMON_LOG</string>
</dict>
</plist>
AIWB_LAUNCH_AGENT
    chmod 600 "$AIWB_LAUNCH_AGENT_PLIST"
    launchctl bootout "gui/$(id -u)/$AIWB_LAUNCH_AGENT_LABEL" >/dev/null 2>&1 || true
    if launchctl bootstrap "gui/$(id -u)" "$AIWB_LAUNCH_AGENT_PLIST" >/dev/null 2>&1; then
      launchctl kickstart -k "gui/$(id -u)/$AIWB_LAUNCH_AGENT_LABEL" >/dev/null 2>&1 || true
      printf "__AIWB_AGENT_SERVICE__launchd\\n"
      return 0
    fi
    printf "__AIWB_AGENT_SERVICE__launchd-fallback\\n"
    aiwb_start_daemon >/dev/null 2>&1 || true
    return 0
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    printf "__AIWB_AGENT_SERVICE__unsupported\\n"
    aiwb_start_daemon >/dev/null 2>&1 || true
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

aiwb_uninstall_service() {
  local task_dir
  local task_pid
  local daemon_pid

  if command -v systemctl >/dev/null 2>&1; then
    if [ "$(id -u)" = "0" ]; then
      systemctl disable --now ai-workbench-agent.service >/dev/null 2>&1 || true
      rm -f /etc/systemd/system/ai-workbench-agent.service
      systemctl daemon-reload >/dev/null 2>&1 || true
    else
      systemctl --user disable --now ai-workbench-agent.service >/dev/null 2>&1 || true
    fi
  fi
  if [ "$(uname -s 2>/dev/null || printf "")" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)/$AIWB_LAUNCH_AGENT_LABEL" >/dev/null 2>&1 || true
    rm -f "$AIWB_LAUNCH_AGENT_PLIST"
  fi

  daemon_pid="$(cat "$AIWB_DAEMON_PID" 2>/dev/null || printf "")"
  if [ -n "$daemon_pid" ]; then
    kill "$daemon_pid" >/dev/null 2>&1 || true
  fi
  for task_dir in "$AIWB_TASKS"/*; do
    [ -d "$task_dir" ] || continue
    task_pid="$(cat "$task_dir/pid" 2>/dev/null || printf "")"
    if [ -n "$task_pid" ]; then
      kill "$task_pid" >/dev/null 2>&1 || true
    fi
  done

  rm -rf "$AIWB_HOME"
  printf "__AIWB_AGENT_STATUS__removed\\n"
  printf "__AIWB_AGENT_SERVICE_STATUS__removed\\n"
}

AIWB_CMD="status"
if [ "$#" -gt 0 ]; then
  AIWB_CMD="$1"
fi

case "$AIWB_CMD" in
  --version|version)
    printf "%s\\n" "$AIWB_VERSION"
    ;;
  status)
    if [ "$#" -gt 1 ]; then
      aiwb_print_task "$2"
    else
      aiwb_print_health
    fi
    ;;
  wait|wait-task)
    AIWB_TASK_ID=""
    AIWB_EVENT_FINGERPRINT=""
    AIWB_WAIT_TIMEOUT="55"
    if [ "$#" -gt 1 ]; then
      AIWB_TASK_ID="$2"
    fi
    if [ "$#" -gt 2 ]; then
      AIWB_EVENT_FINGERPRINT="$3"
    fi
    if [ "$#" -gt 3 ]; then
      AIWB_WAIT_TIMEOUT="$4"
    fi
    if [ -z "$AIWB_TASK_ID" ]; then
      printf "__AIWB_AGENT_STATUS__error\\n"
      printf "__AIWB_AGENT_ERROR__missing task id\\n"
      exit 2
    fi
    aiwb_wait_task "$AIWB_TASK_ID" "$AIWB_EVENT_FINGERPRINT" "$AIWB_WAIT_TIMEOUT"
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
  uninstall-service)
    aiwb_uninstall_service
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
    printf "__AIWB_AGENT_TASK_TURN_ID__%s\\n" "$(cat "$AIWB_TASK_DIR/turn_id" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_REQUEST_MESSAGE_ID__%s\\n" "$(cat "$AIWB_TASK_DIR/request_message_id" 2>/dev/null || printf "")"
    printf "__AIWB_AGENT_TASK_RESPONSE_MESSAGE_ID__%s\\n" "$(cat "$AIWB_TASK_DIR/response_message_id" 2>/dev/null || printf "")"
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

export function buildWindowsAgentControlCommand(profile, args = [], setupScript = "") {
  const commandArgs = Array.isArray(args) ? args : [];
  const argsLiteral = commandArgs.map((value) => psQuote(value)).join(", ");
  const taskId = commandArgs[0] === "create" ? String(commandArgs[1] || "") : "";
  const taskSetup = taskId
    ? `$AIWB_TASK_DIR = Join-Path (Join-Path $AIWB_HOME "tasks") ${psQuote(taskId)}\nNew-Item -ItemType Directory -Force -Path $AIWB_TASK_DIR | Out-Null`
    : `$AIWB_TASK_DIR = Join-Path $AIWB_HOME "tasks"`;
  const script = `
$AIWB_HOME = Join-Path $env:USERPROFILE ".ai-workbench\\agent"
$AIWB_SCRIPT = Join-Path $AIWB_HOME "aiwb-agent.mjs"
$AIWB_NODE_COMMAND = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $AIWB_NODE_COMMAND -or -not (Test-Path -LiteralPath $AIWB_SCRIPT -PathType Leaf)) {
  Write-Output "__AIWB_AGENT_STATUS__missing"
  Write-Output "__AIWB_AGENT_ERROR__Windows Agent 未安装。请先在全局设置中安装 Agent。"
  exit 0
}
${taskSetup}
${setupScript}
$AIWB_ARGS = @(${argsLiteral})
& $AIWB_NODE_COMMAND.Source $AIWB_SCRIPT @AIWB_ARGS
exit $LASTEXITCODE
`;
  return setupScript.length > 800 ? powershellStdinCommand(script) : powershellCommand(script);
}

export function buildInstallWorkbenchAgentCommand(profile) {
  if (isWindowsProfile(profile)) {
    return powershellStdinCommand(`
$AIWB_HOME = Join-Path $env:USERPROFILE ".ai-workbench\\agent"
$AIWB_SCRIPT = Join-Path $AIWB_HOME "aiwb-agent.mjs"
$AIWB_MANIFEST_URL = ${psQuote(workbenchWindowsAgentManifestUrl)}
$AIWB_REQUIRED_VERSION = ${psQuote(latestWorkbenchAgentVersion)}
$AIWB_NODE_COMMAND = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $AIWB_NODE_COMMAND) {
  Write-Output "__AIWB_AGENT_STATUS__missing"
  Write-Output "__AIWB_AGENT_ERROR__Windows Agent 需要 Node.js。当前机器没有找到 node.exe。"
  exit 0
}

New-Item -ItemType Directory -Force -Path $AIWB_HOME | Out-Null
$AIWB_MANIFEST_TMP = Join-Path $AIWB_HOME ("latest.json." + $PID + ".tmp")
$AIWB_SCRIPT_TMP = Join-Path $AIWB_HOME ("aiwb-agent.mjs." + $PID + ".tmp")

function Invoke-AiwbCloudDownload([string]$Url, [string]$Target) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Target -TimeoutSec 45
    return $true
  } catch {
    try {
      & curl.exe -fL --connect-timeout 8 --max-time 45 $Url -o $Target 2>$null
      return ($LASTEXITCODE -eq 0)
    } catch {
      return $false
    }
  }
}

function Convert-AiwbVersionNumber([object]$Value) {
  $match = [regex]::Match([string]$Value, '^\\s*(\\d+)')
  if (-not $match.Success) { return 0 }
  return [int]$match.Groups[1].Value
}

if (-not (Invoke-AiwbCloudDownload $AIWB_MANIFEST_URL $AIWB_MANIFEST_TMP)) {
  Write-Output "__AIWB_AGENT_STATUS__error"
  Write-Output "__AIWB_AGENT_ERROR__无法读取云端 Windows Agent 清单。请检查服务器网络，或稍后重试。"
  Remove-Item -LiteralPath $AIWB_MANIFEST_TMP -Force -ErrorAction SilentlyContinue
  exit 3
}

try {
  $AIWB_MANIFEST = Get-Content -LiteralPath $AIWB_MANIFEST_TMP -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  Write-Output "__AIWB_AGENT_STATUS__error"
  Write-Output "__AIWB_AGENT_ERROR__云端 Windows Agent 清单格式无效。"
  Remove-Item -LiteralPath $AIWB_MANIFEST_TMP -Force -ErrorAction SilentlyContinue
  exit 4
}

$AIWB_REMOTE_VERSION = [string]$AIWB_MANIFEST.version
$AIWB_REMOTE_VERSION_NUM = Convert-AiwbVersionNumber $AIWB_REMOTE_VERSION
$AIWB_REQUIRED_VERSION_NUM = Convert-AiwbVersionNumber $AIWB_REQUIRED_VERSION
if ($AIWB_REMOTE_VERSION_NUM -lt $AIWB_REQUIRED_VERSION_NUM) {
  Write-Output "__AIWB_AGENT_STATUS__error"
  Write-Output ("__AIWB_AGENT_ERROR__云端 Windows Agent 版本过旧（当前 v{0}，需要 v{1}）。请先发布最新 Agent。" -f $AIWB_REMOTE_VERSION, $AIWB_REQUIRED_VERSION)
  Remove-Item -LiteralPath $AIWB_MANIFEST_TMP -Force -ErrorAction SilentlyContinue
  exit 5
}

$AIWB_INSTALLED_VERSION_NUM = 0
if (Test-Path -LiteralPath $AIWB_SCRIPT -PathType Leaf) {
  try {
    $AIWB_INSTALLED_VERSION = (& $AIWB_NODE_COMMAND.Source $AIWB_SCRIPT --version 2>$null | Select-Object -First 1)
    $AIWB_INSTALLED_VERSION_NUM = Convert-AiwbVersionNumber $AIWB_INSTALLED_VERSION
  } catch {}
}

if ($AIWB_INSTALLED_VERSION_NUM -ge $AIWB_REMOTE_VERSION_NUM -and (Test-Path -LiteralPath $AIWB_SCRIPT -PathType Leaf)) {
  Remove-Item -LiteralPath $AIWB_MANIFEST_TMP -Force -ErrorAction SilentlyContinue
  Write-Output "__AIWB_AGENT_INSTALL_SOURCE__cloud"
  Write-Output "__AIWB_AGENT_INSTALL_RESULT__unchanged"
  & $AIWB_NODE_COMMAND.Source $AIWB_SCRIPT status
  exit $LASTEXITCODE
}

$AIWB_SCRIPT_URL = [string]$AIWB_MANIFEST.scriptUrl
$AIWB_EXPECTED_SHA = ([string]$AIWB_MANIFEST.sha256).ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($AIWB_SCRIPT_URL) -or -not (Invoke-AiwbCloudDownload $AIWB_SCRIPT_URL $AIWB_SCRIPT_TMP)) {
  Write-Output "__AIWB_AGENT_STATUS__error"
  Write-Output "__AIWB_AGENT_ERROR__云端 Windows Agent 脚本下载失败，未修改服务器上的现有 Agent。"
  Remove-Item -LiteralPath $AIWB_MANIFEST_TMP, $AIWB_SCRIPT_TMP -Force -ErrorAction SilentlyContinue
  exit 6
}

$AIWB_ACTUAL_SHA = ([string](Get-FileHash -LiteralPath $AIWB_SCRIPT_TMP -Algorithm SHA256).Hash).ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($AIWB_EXPECTED_SHA) -or $AIWB_ACTUAL_SHA -ne $AIWB_EXPECTED_SHA) {
  Write-Output "__AIWB_AGENT_STATUS__error"
  Write-Output "__AIWB_AGENT_ERROR__云端 Windows Agent 校验失败，未替换服务器上的现有 Agent。"
  Remove-Item -LiteralPath $AIWB_MANIFEST_TMP, $AIWB_SCRIPT_TMP -Force -ErrorAction SilentlyContinue
  exit 7
}

Move-Item -LiteralPath $AIWB_SCRIPT_TMP -Destination $AIWB_SCRIPT -Force
$AIWB_DIRECT_RUNTIME = $AIWB_MANIFEST.directRuntime
$AIWB_UPDATER_RUNTIME = $AIWB_MANIFEST.updaterRuntime
function Install-AiwbRuntime([object]$Runtime, [string]$Target) {
  if (-not $Runtime -or [string]::IsNullOrWhiteSpace([string]$Runtime.url)) { return }
  $temporary = $Target + ".download-" + $PID
  if (-not (Invoke-AiwbCloudDownload ([string]$Runtime.url) $temporary)) { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue; return }
  $expected = ([string]$Runtime.sha256).ToLowerInvariant()
  $actual = ([string](Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash).ToLowerInvariant()
  if ($expected -and $actual -ne $expected) { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue; return }
  Move-Item -LiteralPath $temporary -Destination $Target -Force
}
Install-AiwbRuntime $AIWB_DIRECT_RUNTIME (Join-Path $AIWB_HOME "aiwb-agent-http.mjs")
Install-AiwbRuntime $AIWB_UPDATER_RUNTIME (Join-Path $AIWB_HOME "aiwb-agent-updater.mjs")
if (Test-Path -LiteralPath (Join-Path $AIWB_HOME "aiwb-agent-http.mjs") -PathType Leaf) {
  $direct = Join-Path $AIWB_HOME "aiwb-agent-http.mjs"
  $directConfig = Join-Path $AIWB_HOME "http.json"
  if (-not (Test-Path -LiteralPath $directConfig -PathType Leaf)) { '{"listenHost":"0.0.0.0","port":8787,"tls":false}' | Set-Content -LiteralPath $directConfig -Encoding UTF8 }
  $directRunning = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$direct*" } | Select-Object -First 1
  if ($directRunning) { Stop-Process -Id $directRunning.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Process -FilePath $AIWB_NODE_COMMAND.Source -ArgumentList @($direct) -WindowStyle Hidden
}
if (Test-Path -LiteralPath (Join-Path $AIWB_HOME "aiwb-agent-updater.mjs") -PathType Leaf) {
  @{ manifestUrl = $AIWB_MANIFEST_URL; controlEndpoint = ${psQuote(workbenchAgentControlEndpoint)} } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $AIWB_HOME "updater.json") -Encoding UTF8
  $updater = Join-Path $AIWB_HOME "aiwb-agent-updater.mjs"
  $running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$updater*" } | Select-Object -First 1
  if (-not $running) { Start-Process -FilePath $AIWB_NODE_COMMAND.Source -ArgumentList @($updater) -WindowStyle Hidden }
}
$AIWB_CTL = Join-Path $AIWB_HOME "aiwbctl.cmd"
$AIWB_CTL_CONTENT = '@echo off' + [Environment]::NewLine + 'node ' + [char]34 + '%~dp0aiwb-agent.mjs' + [char]34 + ' %*' + [Environment]::NewLine
[System.IO.File]::WriteAllText($AIWB_CTL, $AIWB_CTL_CONTENT, [System.Text.UTF8Encoding]::new($false))
Remove-Item -LiteralPath $AIWB_MANIFEST_TMP -Force -ErrorAction SilentlyContinue
Write-Output "__AIWB_AGENT_INSTALL_SOURCE__cloud"
Write-Output "__AIWB_AGENT_INSTALL_RESULT__updated"
& $AIWB_NODE_COMMAND.Source $AIWB_SCRIPT install-service
`);
  }
  return remoteBashCommand(profile, `
set -e
AIWB_AGENT_HOME="$HOME/.ai-workbench/agent"
AIWB_AGENT_MANIFEST_URL=${shQuote(workbenchAgentManifestUrl)}
AIWB_AGENT_REQUIRED_VERSION="${latestWorkbenchAgentVersion}"
AIWB_AGENT_INSTALL_SOURCE="cloud"
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
    value = json.load(handle)
for part in key.split("."):
    if not isinstance(value, dict):
        value = ""
        break
    value = value.get(part, "")
if value is None:
    value = ""
print(str(value))
PY
}

if ! aiwb_download_url "$AIWB_AGENT_MANIFEST_URL" "$AIWB_AGENT_MANIFEST_TMP"; then
  printf '__AIWB_AGENT_STATUS__error\\n'
  printf '__AIWB_AGENT_ERROR__无法读取云端 Agent 清单。请检查服务器网络，或稍后重试。\\n'
  rm -f "$AIWB_AGENT_MANIFEST_TMP" "$AIWB_AGENT_DOWNLOAD_TMP"
  exit 3
fi

AIWB_AGENT_REMOTE_VERSION="$(aiwb_json_value "$AIWB_AGENT_MANIFEST_TMP" version 2>/dev/null || true)"
AIWB_AGENT_REMOTE_VERSION_NUM="$(printf '%s' "$AIWB_AGENT_REMOTE_VERSION" | sed 's/[^0-9].*$//' || true)"
AIWB_AGENT_REQUIRED_VERSION_NUM="$(printf '%s' "$AIWB_AGENT_REQUIRED_VERSION" | sed 's/[^0-9].*$//' || true)"
AIWB_AGENT_SCRIPT_URL="$(aiwb_json_value "$AIWB_AGENT_MANIFEST_TMP" scriptUrl 2>/dev/null || true)"
AIWB_AGENT_EXPECTED_SHA="$(aiwb_json_value "$AIWB_AGENT_MANIFEST_TMP" sha256 2>/dev/null || true)"

if [ -z "$AIWB_AGENT_REMOTE_VERSION_NUM" ] || [ -z "$AIWB_AGENT_REQUIRED_VERSION_NUM" ] ||
   [ "$AIWB_AGENT_REMOTE_VERSION_NUM" -lt "$AIWB_AGENT_REQUIRED_VERSION_NUM" ] 2>/dev/null; then
  printf '__AIWB_AGENT_STATUS__error\\n'
  printf '__AIWB_AGENT_ERROR__云端 Agent 版本过旧（当前 v%s，需要 v%s）。请先发布最新 Agent。\\n' "\${AIWB_AGENT_REMOTE_VERSION:-未知}" "$AIWB_AGENT_REQUIRED_VERSION"
  rm -f "$AIWB_AGENT_MANIFEST_TMP" "$AIWB_AGENT_DOWNLOAD_TMP"
  exit 4
fi

AIWB_AGENT_INSTALLED_VERSION=""
AIWB_AGENT_INSTALLED_VERSION_NUM="0"
if [ -x "$AIWB_AGENT_HOME/aiwbctl" ]; then
  AIWB_AGENT_INSTALLED_VERSION="$($AIWB_AGENT_HOME/aiwbctl --version 2>/dev/null | head -n 1 || true)"
  AIWB_AGENT_INSTALLED_VERSION_NUM="$(printf '%s' "$AIWB_AGENT_INSTALLED_VERSION" | sed 's/[^0-9].*$//' || true)"
  [ -n "$AIWB_AGENT_INSTALLED_VERSION_NUM" ] || AIWB_AGENT_INSTALLED_VERSION_NUM="0"
fi

if [ -x "$AIWB_AGENT_HOME/aiwbctl" ] &&
   [ "$AIWB_AGENT_INSTALLED_VERSION_NUM" -ge "$AIWB_AGENT_REMOTE_VERSION_NUM" ] 2>/dev/null; then
  rm -f "$AIWB_AGENT_MANIFEST_TMP" "$AIWB_AGENT_DOWNLOAD_TMP"
  printf "__AIWB_AGENT_INSTALL_SOURCE__cloud\\n"
  printf "__AIWB_AGENT_INSTALL_RESULT__unchanged\\n"
  "$AIWB_AGENT_HOME/aiwbctl" status
  exit $?
fi

if [ -z "$AIWB_AGENT_SCRIPT_URL" ] || ! aiwb_download_url "$AIWB_AGENT_SCRIPT_URL" "$AIWB_AGENT_DOWNLOAD_TMP"; then
  printf '__AIWB_AGENT_STATUS__error\\n'
  printf '__AIWB_AGENT_ERROR__云端 Agent 脚本下载失败，未修改服务器上的现有 Agent。\\n'
  rm -f "$AIWB_AGENT_MANIFEST_TMP" "$AIWB_AGENT_DOWNLOAD_TMP"
  exit 5
fi

AIWB_AGENT_SHA_OK="1"
if [ -n "$AIWB_AGENT_EXPECTED_SHA" ] && command -v sha256sum >/dev/null 2>&1; then
  AIWB_AGENT_ACTUAL_SHA="$(sha256sum "$AIWB_AGENT_DOWNLOAD_TMP" | awk '{print $1}')"
  [ "$AIWB_AGENT_ACTUAL_SHA" = "$AIWB_AGENT_EXPECTED_SHA" ] || AIWB_AGENT_SHA_OK=""
elif [ -n "$AIWB_AGENT_EXPECTED_SHA" ] && command -v shasum >/dev/null 2>&1; then
  AIWB_AGENT_ACTUAL_SHA="$(shasum -a 256 "$AIWB_AGENT_DOWNLOAD_TMP" | awk '{print $1}')"
  [ "$AIWB_AGENT_ACTUAL_SHA" = "$AIWB_AGENT_EXPECTED_SHA" ] || AIWB_AGENT_SHA_OK=""
fi
if [ -z "$AIWB_AGENT_SHA_OK" ]; then
  printf '__AIWB_AGENT_STATUS__error\\n'
  printf '__AIWB_AGENT_ERROR__云端 Agent 校验失败，未替换服务器上的现有 Agent。\\n'
  rm -f "$AIWB_AGENT_MANIFEST_TMP" "$AIWB_AGENT_DOWNLOAD_TMP"
  exit 6
fi

cp "$AIWB_AGENT_DOWNLOAD_TMP" "$AIWB_AGENT_HOME/aiwbctl"
chmod 700 "$AIWB_AGENT_HOME/aiwbctl"
AIWB_AGENT_INSTALL_SOURCE="cloud"

AIWB_DIRECT_URL="$(aiwb_json_value "$AIWB_AGENT_MANIFEST_TMP" directRuntime.url 2>/dev/null || true)"
AIWB_DIRECT_SHA="$(aiwb_json_value "$AIWB_AGENT_MANIFEST_TMP" directRuntime.sha256 2>/dev/null || true)"
AIWB_UPDATER_URL="$(aiwb_json_value "$AIWB_AGENT_MANIFEST_TMP" updaterRuntime.url 2>/dev/null || true)"
AIWB_UPDATER_SHA="$(aiwb_json_value "$AIWB_AGENT_MANIFEST_TMP" updaterRuntime.sha256 2>/dev/null || true)"
aiwb_install_runtime() {
  AIWB_RUNTIME_URL="$1"
  AIWB_RUNTIME_SHA="$2"
  AIWB_RUNTIME_TARGET="$3"
  [ -n "$AIWB_RUNTIME_URL" ] || return 0
  AIWB_RUNTIME_TMP="$AIWB_RUNTIME_TARGET.download.$$"
  if ! aiwb_download_url "$AIWB_RUNTIME_URL" "$AIWB_RUNTIME_TMP"; then
    rm -f "$AIWB_RUNTIME_TMP"
    return 1
  fi
  if [ -n "$AIWB_RUNTIME_SHA" ] && command -v sha256sum >/dev/null 2>&1; then
    [ "$(sha256sum "$AIWB_RUNTIME_TMP" | awk '{print $1}')" = "$AIWB_RUNTIME_SHA" ] || { rm -f "$AIWB_RUNTIME_TMP"; return 1; }
  fi
  mv "$AIWB_RUNTIME_TMP" "$AIWB_RUNTIME_TARGET"
  chmod 700 "$AIWB_RUNTIME_TARGET"
}
aiwb_install_runtime "$AIWB_DIRECT_URL" "$AIWB_DIRECT_SHA" "$AIWB_AGENT_HOME/aiwb-agent-http.mjs" || true
aiwb_install_runtime "$AIWB_UPDATER_URL" "$AIWB_UPDATER_SHA" "$AIWB_AGENT_HOME/aiwb-agent-updater.mjs" || true
if command -v node >/dev/null 2>&1 && [ -x "$AIWB_AGENT_HOME/aiwb-agent-http.mjs" ]; then
  if [ ! -s "$AIWB_AGENT_HOME/http.json" ]; then
    printf '%s\n' '{"listenHost":"0.0.0.0","port":8787,"tls":false}' > "$AIWB_AGENT_HOME/http.json"
    chmod 600 "$AIWB_AGENT_HOME/http.json"
  fi
  pkill -f "$AIWB_AGENT_HOME/aiwb-agent-http.mjs" >/dev/null 2>&1 || true
  nohup node "$AIWB_AGENT_HOME/aiwb-agent-http.mjs" >> "$AIWB_AGENT_HOME/http.log" 2>&1 &
fi
if command -v node >/dev/null 2>&1 && [ -x "$AIWB_AGENT_HOME/aiwb-agent-updater.mjs" ]; then
  cat > "$AIWB_AGENT_HOME/updater.json" <<AIWB_UPDATER_CONFIG
{"manifestUrl":"$AIWB_AGENT_MANIFEST_URL","controlEndpoint":"${workbenchAgentControlEndpoint}"}
AIWB_UPDATER_CONFIG
  if ! pgrep -f "$AIWB_AGENT_HOME/aiwb-agent-updater.mjs" >/dev/null 2>&1; then
    nohup node "$AIWB_AGENT_HOME/aiwb-agent-updater.mjs" >> "$AIWB_AGENT_HOME/updater.log" 2>&1 &
  fi
fi

rm -f "$AIWB_AGENT_MANIFEST_TMP" "$AIWB_AGENT_DOWNLOAD_TMP"
printf "__AIWB_AGENT_INSTALL_SOURCE__%s\\n" "$AIWB_AGENT_INSTALL_SOURCE"
  "$AIWB_AGENT_HOME/aiwbctl" install-service 2>/dev/null || "$AIWB_AGENT_HOME/aiwbctl" status
`);
}

export function buildInstallCliCommand(profile, cliId = "codex") {
  const normalizedCliId = String(cliId || "codex").toLowerCase() === "claude" ? "claude" : "codex";
  const packageName = normalizedCliId === "claude" ? "@anthropic-ai/claude-code@latest" : "@openai/codex@latest";
  const commandName = normalizedCliId;

  if (isWindowsProfile(profile)) {
    return powershellStdinCommand(`
$AIWB_CLI_ID = ${psQuote(normalizedCliId)}
$AIWB_PACKAGE = ${psQuote(packageName)}
$AIWB_COMMAND = ${psQuote(commandName)}

function Resolve-AiwbCli {
  $AIWB_COMMAND_INFO = Get-Command $AIWB_COMMAND -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($AIWB_COMMAND_INFO) { return [string]$AIWB_COMMAND_INFO.Source }
  try {
    $AIWB_WHERE = (& where.exe $AIWB_COMMAND 2>$null | Select-Object -First 1)
    if ($AIWB_WHERE) { return [string]$AIWB_WHERE }
  } catch {}
  $AIWB_CANDIDATES = @(
    (Join-Path $env:APPDATA "npm\\$AIWB_COMMAND.cmd"),
    (Join-Path $env:APPDATA "npm\\$AIWB_COMMAND"),
    (Join-Path $env:LOCALAPPDATA "npm\\$AIWB_COMMAND.cmd")
  )
  foreach ($AIWB_CANDIDATE in $AIWB_CANDIDATES) {
    if ($AIWB_CANDIDATE -and (Test-Path -LiteralPath $AIWB_CANDIDATE -PathType Leaf)) { return $AIWB_CANDIDATE }
  }
  return ""
}

function Test-AiwbCli {
  param([string]$Path)
  if (-not $Path) { return $false }
  try {
    $AIWB_VERSION = (& $Path --version 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { return $false }
    if ($AIWB_VERSION -match "(?i)ENOSPC|no space left on device|not enough space") { return $false }
    return $true
  } catch {
    return $false
  }
}

$AIWB_EXISTING = Resolve-AiwbCli
if ($AIWB_EXISTING -and (Test-AiwbCli $AIWB_EXISTING)) {
  Write-Output ("__AIWB_AGENT_CLI_ID__" + $AIWB_CLI_ID)
  Write-Output "__AIWB_AGENT_CLI_STATUS__ready"
  Write-Output ("__AIWB_AGENT_CLI_PATH__" + $AIWB_EXISTING)
  exit 0
}

Write-Output ("__AIWB_AGENT_CLI_ID__" + $AIWB_CLI_ID)
Write-Output "__AIWB_AGENT_CLI_STATUS__installing"
$AIWB_NPM = Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $AIWB_NPM) {
  Write-Output "__AIWB_AGENT_CLI_STATUS__failed"
  Write-Output "__AIWB_AGENT_CLI_ERROR__Windows 未找到 npm.cmd，请先安装 Node.js。"
  exit 2
}

try {
  $AIWB_NPM_OUTPUT = (& $AIWB_NPM.Source install --global $AIWB_PACKAGE --no-fund --no-audit 2>&1 | Out-String)
  $AIWB_EXIT_CODE = $LASTEXITCODE
} catch {
  $AIWB_EXIT_CODE = 1
  $AIWB_NPM_OUTPUT = $_.Exception.Message
}
if ($AIWB_NPM_OUTPUT) { Write-Output $AIWB_NPM_OUTPUT.TrimEnd() }
if ($AIWB_NPM_OUTPUT -match "(?i)ENOSPC|no space left on device|not enough space") {
  Write-Output "__AIWB_AGENT_CLI_STATUS__failed"
  Write-Output ("__AIWB_AGENT_CLI_ERROR__远端磁盘空间不足，" + $AIWB_CLI_ID + " 没有完成安装。请先清理 Windows 磁盘空间后再重试。")
  exit 5
}
if ($AIWB_EXIT_CODE -ne 0) {
  Write-Output "__AIWB_AGENT_CLI_STATUS__failed"
  Write-Output ("__AIWB_AGENT_CLI_ERROR__npm 安装失败，退出码 " + $AIWB_EXIT_CODE)
  exit $AIWB_EXIT_CODE
}

$AIWB_INSTALLED = Resolve-AiwbCli
if (-not $AIWB_INSTALLED) {
  Write-Output "__AIWB_AGENT_CLI_STATUS__failed"
  Write-Output ("__AIWB_AGENT_CLI_ERROR__安装完成，但当前 SSH 会话仍未找到 " + $AIWB_CLI_ID + " 命令。请重新连接后再检测。")
  exit 3
}
if (-not (Test-AiwbCli $AIWB_INSTALLED)) {
  Write-Output "__AIWB_AGENT_CLI_STATUS__failed"
  Write-Output ("__AIWB_AGENT_CLI_ERROR__已找到 " + $AIWB_CLI_ID + " 文件，但命令无法正常执行。请清理磁盘空间后重新安装。")
  exit 4
}
Write-Output "__AIWB_AGENT_CLI_STATUS__ready"
Write-Output ("__AIWB_AGENT_CLI_PATH__" + $AIWB_INSTALLED)
`);
  }

  return remoteBashCommand(profile, `
AIWB_CLI_ID=${shQuote(normalizedCliId)}
AIWB_PACKAGE=${shQuote(packageName)}
AIWB_COMMAND=${shQuote(commandName)}
AIWB_EXISTING="$(command -v "$AIWB_COMMAND" 2>/dev/null || true)"
printf '__AIWB_AGENT_CLI_ID__%s\\n' "$AIWB_CLI_ID"
if [ -n "$AIWB_EXISTING" ]; then
  set +e
  AIWB_EXISTING_VERSION="$($AIWB_EXISTING --version 2>&1)"
  AIWB_EXISTING_EXIT=$?
  set -e
fi
if [ -n "$AIWB_EXISTING" ] && [ "$AIWB_EXISTING_EXIT" -eq 0 ] && ! printf '%s' "$AIWB_EXISTING_VERSION" | grep -Eiq 'ENOSPC|no space left on device|not enough space'; then
  printf '__AIWB_AGENT_CLI_STATUS__ready\\n'
  printf '__AIWB_AGENT_CLI_PATH__%s\\n' "$AIWB_EXISTING"
  exit 0
fi

printf '__AIWB_AGENT_CLI_STATUS__installing\\n'
if ! command -v npm >/dev/null 2>&1; then
  printf '__AIWB_AGENT_CLI_STATUS__failed\\n'
  printf '__AIWB_AGENT_CLI_ERROR__未找到 npm，请先安装 Node.js。\\n'
  exit 2
fi
set +e
AIWB_NPM_OUTPUT="$(npm install --global "$AIWB_PACKAGE" --no-fund --no-audit 2>&1)"
AIWB_NPM_EXIT=$?
set -e
printf '%s\\n' "$AIWB_NPM_OUTPUT"
if printf '%s' "$AIWB_NPM_OUTPUT" | grep -Eiq 'ENOSPC|no space left on device|not enough space'; then
  printf '__AIWB_AGENT_CLI_STATUS__failed\\n'
  printf '__AIWB_AGENT_CLI_ERROR__远端磁盘空间不足，%s 没有完成安装；请先清理磁盘空间后再重试。\\n' "$AIWB_CLI_ID"
  exit 5
fi
if [ "$AIWB_NPM_EXIT" -ne 0 ]; then
  printf '__AIWB_AGENT_CLI_STATUS__failed\\n'
  printf '__AIWB_AGENT_CLI_ERROR__npm 安装 %s 失败。\\n' "$AIWB_CLI_ID"
  exit 3
fi

AIWB_INSTALLED="$(command -v "$AIWB_COMMAND" 2>/dev/null || true)"
if [ -z "$AIWB_INSTALLED" ]; then
  printf '__AIWB_AGENT_CLI_STATUS__failed\\n'
  printf '__AIWB_AGENT_CLI_ERROR__安装完成，但当前环境仍未找到 %s 命令；请重新连接后再检测。\\n' "$AIWB_CLI_ID"
  exit 4
fi
set +e
AIWB_VERSION_OUTPUT="$($AIWB_INSTALLED --version 2>&1)"
AIWB_VERSION_EXIT=$?
set -e
if [ "$AIWB_VERSION_EXIT" -ne 0 ] || printf '%s' "$AIWB_VERSION_OUTPUT" | grep -Eiq 'ENOSPC|no space left on device|not enough space'; then
  printf '__AIWB_AGENT_CLI_STATUS__failed\\n'
  printf '__AIWB_AGENT_CLI_ERROR__已找到 %s 文件，但命令无法正常执行；请清理磁盘空间后重新安装。\\n' "$AIWB_CLI_ID"
  exit 4
fi
printf '__AIWB_AGENT_CLI_STATUS__ready\\n'
printf '__AIWB_AGENT_CLI_PATH__%s\\n' "$AIWB_INSTALLED"
`);
}

export function buildUninstallWorkbenchAgentCommand(profile) {
  if (isWindowsProfile(profile)) return buildWindowsAgentControlCommand(profile, ["uninstall-service"]);
  return remoteBashCommand(profile, `
AIWB_AGENT_CTL="$HOME/.ai-workbench/agent/aiwbctl"
if [ ! -x "$AIWB_AGENT_CTL" ]; then
  printf '__AIWB_AGENT_STATUS__missing\\n'
  exit 0
fi
"$AIWB_AGENT_CTL" uninstall-service
`);
}

export function buildWorkbenchAgentStatusCommand(profile, taskId = "") {
  if (isWindowsProfile(profile)) return buildWindowsAgentControlCommand(profile, taskId ? ["status", taskId] : ["status"]);
  return remoteBashCommand(profile, `
AIWB_AGENT_CTL="$HOME/.ai-workbench/agent/aiwbctl"
if [ ! -x "$AIWB_AGENT_CTL" ]; then
  printf '__AIWB_AGENT_STATUS__missing\\n'
  exit 0
fi
"$AIWB_AGENT_CTL" status ${taskId ? shQuote(taskId) : ""}
`);
}

export function buildWorkbenchAgentDirectConfigCommand(profile) {
  if (isWindowsProfile(profile)) {
    return powershellCommand(`
$AIWB_CONFIG = Join-Path $env:USERPROFILE ".ai-workbench\\agent\\http.json"
if (-not (Test-Path -LiteralPath $AIWB_CONFIG -PathType Leaf)) {
  Write-Output "__AIWB_AGENT_DIRECT_STATUS__missing"
  exit 0
}
$AIWB_BYTES = [System.IO.File]::ReadAllBytes($AIWB_CONFIG)
Write-Output "__AIWB_AGENT_DIRECT_STATUS__ready"
Write-Output ("__AIWB_AGENT_DIRECT_CONFIG_B64__" + [Convert]::ToBase64String($AIWB_BYTES))
`);
  }
  return remoteBashCommand(profile, `
AIWB_CONFIG="$HOME/.ai-workbench/agent/http.json"
if [ ! -s "$AIWB_CONFIG" ]; then
  printf '__AIWB_AGENT_DIRECT_STATUS__missing\\n'
  exit 0
fi
printf '__AIWB_AGENT_DIRECT_STATUS__ready\\n'
printf '__AIWB_AGENT_DIRECT_CONFIG_B64__'
base64 "$AIWB_CONFIG" 2>/dev/null | tr -d '\\n' || true
printf '\\n'
`);
}

export function buildWorkbenchAgentWaitTaskCommand(profile, taskId, fingerprint = "", options = {}) {
  const rawTimeout = Number(options?.timeoutSeconds ?? 55);
  const timeoutSeconds = Number.isFinite(rawTimeout) ? Math.max(5, Math.min(110, Math.floor(rawTimeout))) : 55;
  if (isWindowsProfile(profile)) {
    return buildWindowsAgentControlCommand(profile, ["wait-task", taskId, String(fingerprint || ""), String(timeoutSeconds)]);
  }
  return remoteBashCommand(profile, `
AIWB_AGENT_CTL="$HOME/.ai-workbench/agent/aiwbctl"
if [ ! -x "$AIWB_AGENT_CTL" ]; then
  printf '__AIWB_AGENT_STATUS__missing\\n'
  exit 0
fi
"$AIWB_AGENT_CTL" wait-task ${shQuote(taskId)} ${shQuote(String(fingerprint || ""))} ${shQuote(String(timeoutSeconds))}
`);
}

export function buildWorkbenchAgentTaskListCommand(profile) {
  if (isWindowsProfile(profile)) return buildWindowsAgentControlCommand(profile, ["task-list"]);
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
  if (isWindowsProfile(profile)) {
    const conversationId = String(metadata.conversationId || "").trim();
    const conversationName = String(metadata.name || "").trim();
    const agentId = String(metadata.agentId || profile.agentId || "").trim();
    const model = normalizeAgentModel(agentId, metadata.model || profile.aiModel);
    const promptText = String(metadata.promptText || "").trim();
    const workdir = String(metadata.workdir || profile.workdir || "").trim();
    const turnId = String(metadata.turnId || "").trim();
    const requestMessageId = String(metadata.requestMessageId || "").trim();
    const responseMessageId = String(metadata.responseMessageId || "").trim();
    const pushNotifyUrl = String(metadata.pushNotifyUrl || "").trim();
    const pushNotifyToken = String(metadata.pushNotifyToken || "").trim();
    const taskPayload = [
      ["conversation_id", conversationId],
      ["name", conversationName],
      ["workdir", workdir],
      ["agent_id", agentId],
      ["model", model],
      ["turn_id", turnId],
      ["request_message_id", requestMessageId],
      ["response_message_id", responseMessageId],
      ["push_notify_url", pushNotifyUrl],
      ["push_notify_token", pushNotifyToken],
      ["prompt.txt", promptText],
      ["command.b64", typeof command === "string" ? toBase64Utf8(JSON.stringify({ kind: "powershell", script: command })) : toBase64Utf8(JSON.stringify(command || {}))],
    ];
    const taskWrites = taskPayload
      .map(([name, value]) => {
        const encoded = toBase64Utf8(String(value || ""));
        return `[System.IO.File]::WriteAllBytes((Join-Path $AIWB_TASK_DIR ${psQuote(name)}), [System.Convert]::FromBase64String(${psQuote(encoded)}))`;
      })
      .join("\n");
    return buildWindowsAgentControlCommand(profile, ["create", taskId], `${taskWrites}\n`);
  }
  const encodedCommand = toBase64Utf8(command);
  const conversationId = String(metadata.conversationId || "").trim();
  const conversationName = String(metadata.name || "").trim();
  const agentId = String(metadata.agentId || profile.agentId || "").trim();
  const model = normalizeAgentModel(agentId, metadata.model || profile.aiModel);
  const promptText = String(metadata.promptText || "").trim();
  const workdir = String(metadata.workdir || profile.workdir || "").trim();
  const turnId = String(metadata.turnId || "").trim();
  const requestMessageId = String(metadata.requestMessageId || "").trim();
  const responseMessageId = String(metadata.responseMessageId || "").trim();
  const pushNotifyUrl = String(metadata.pushNotifyUrl || "").trim();
  const pushNotifyToken = String(metadata.pushNotifyToken || "").trim();
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
cat > "$AIWB_TASK_DIR/turn_id" <<'AIWB_TURN_ID'
${turnId}
AIWB_TURN_ID
cat > "$AIWB_TASK_DIR/request_message_id" <<'AIWB_REQUEST_MESSAGE_ID'
${requestMessageId}
AIWB_REQUEST_MESSAGE_ID
cat > "$AIWB_TASK_DIR/response_message_id" <<'AIWB_RESPONSE_MESSAGE_ID'
${responseMessageId}
AIWB_RESPONSE_MESSAGE_ID
cat > "$AIWB_TASK_DIR/push_notify_url" <<'AIWB_PUSH_NOTIFY_URL'
${pushNotifyUrl}
AIWB_PUSH_NOTIFY_URL
cat > "$AIWB_TASK_DIR/push_notify_token" <<'AIWB_PUSH_NOTIFY_TOKEN'
${pushNotifyToken}
AIWB_PUSH_NOTIFY_TOKEN
cat > "$AIWB_TASK_DIR/prompt.txt" <<'AIWB_CONVERSATION_PROMPT'
${promptText}
AIWB_CONVERSATION_PROMPT
"$AIWB_AGENT_CTL" create "$AIWB_TASK_ID"
`);
}

export function buildWorkbenchAgentConversationListCommand(profile) {
  if (isWindowsProfile(profile)) return buildWindowsAgentControlCommand(profile, ["conversations"]);
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
  const rawLimit = Number(options?.limit ?? 1);
  const historyLimit = Number.isFinite(rawLimit) ? Math.max(0, Math.min(1, Math.floor(rawLimit))) : 1;
  const historyBefore = String(options?.before || "").trim();
  if (isWindowsProfile(profile)) {
    return buildWindowsAgentControlCommand(profile, ["conversation-status", conversationId, String(historyLimit), historyBefore]);
  }
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
  if (isWindowsProfile(profile)) return buildWindowsAgentControlCommand(profile, ["cancel", taskId]);
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
      "/Applications/ChatGPT.app/Contents/Resources/$AIWB_CANDIDATE_NAME" \\
      "$HOME/Applications/ChatGPT.app/Contents/Resources/$AIWB_CANDIDATE_NAME" \\
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
  const preferredWslDistro = wslDistroFromProfile(profile);
  const wslProbeScript = toBase64Utf8("printf AIWB_WSL_READY");

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
$AIWB_WSL_PREFERRED_DISTRO = ${psQuote(preferredWslDistro)}
${wslPowerShellHelpers()}
try {
  $AIWB_WSL = Get-Command "wsl.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($AIWB_WSL) {
    $AIWB_WSL_STATUS = "installed_no_distro"
    try {
      $AIWB_WSL_VERSION_RESULT = Invoke-AiwbWslText "--version"
      $AIWB_WSL_VERSION = [string](
        $AIWB_WSL_VERSION_RESULT.Output -split "[\\r\\n]+" |
          Where-Object { $_ } |
          Select-Object -First 1
      )
    } catch {}
    try { $AIWB_WSL_DISTROS = @(Get-AiwbUsableWslDistros) } catch {}
    if ($AIWB_WSL_DISTROS.Count -gt 0) {
      if ($AIWB_WSL_PREFERRED_DISTRO -and ($AIWB_WSL_DISTROS -contains $AIWB_WSL_PREFERRED_DISTRO)) {
        $AIWB_WSL_DEFAULT_DISTRO = $AIWB_WSL_PREFERRED_DISTRO
      } else {
        $AIWB_WSL_DEFAULT_DISTRO = [string]$AIWB_WSL_DISTROS[0]
      }
      try {
        $AIWB_WSL_PROBE = Invoke-AiwbWslBash -Distro $AIWB_WSL_DEFAULT_DISTRO -ScriptBase64 ${psQuote(wslProbeScript)}
        if ($AIWB_WSL_PROBE.ExitCode -eq 0 -and $AIWB_WSL_PROBE.Output -match "AIWB_WSL_READY") { $AIWB_WSL_STATUS = "ready" }
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
$AIWB_AGENT_HOME = Join-Path $env:USERPROFILE ".ai-workbench\\agent"
$AIWB_AGENT_SCRIPT = Join-Path $AIWB_AGENT_HOME "aiwb-agent.mjs"
$AIWB_AGENT_NODE = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $AIWB_AGENT_NODE -or -not (Test-Path -LiteralPath $AIWB_AGENT_SCRIPT -PathType Leaf)) {
  Write-Output "__AIWB_AGENT__missing"
} else {
  try {
    $AIWB_AGENT_OUTPUT = @(& $AIWB_AGENT_NODE.Source $AIWB_AGENT_SCRIPT status 2>&1)
    $AIWB_AGENT_EXIT_CODE = $LASTEXITCODE
    $AIWB_AGENT_TEXT = $AIWB_AGENT_OUTPUT -join ([Environment]::NewLine)
    $AIWB_AGENT_OUTPUT | ForEach-Object { Write-Output ([string]$_) }
    if ($AIWB_AGENT_EXIT_CODE -eq 0 -and $AIWB_AGENT_TEXT -match "__AIWB_AGENT_STATUS__ready") {
      Write-Output "__AIWB_AGENT__available"
    } else {
      Write-Output "__AIWB_AGENT__missing"
    }
  } catch {
    Write-Output "__AIWB_AGENT__missing"
    Write-Output ("__AIWB_AGENT_ERROR__" + $_.Exception.Message)
  }
}
exit 0
`);
}

export function buildInstallWslCommand(profile) {
  if (!isWindowsProfile(profile)) {
    return remoteBashCommand(profile, `printf '__AIWB_WSL_INSTALL_STATUS__ready\\n'`);
  }

  const preferredWslDistro = wslDistroFromProfile(profile);
  const wslProbeScript = toBase64Utf8("printf AIWB_WSL_READY");
  return powershellStdinCommand(`
$AIWB_PRINCIPAL = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$AIWB_IS_ADMIN = $AIWB_PRINCIPAL.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Output ("__AIWB_WSL_ADMIN__" + $AIWB_IS_ADMIN.ToString().ToLowerInvariant())
if (-not $AIWB_IS_ADMIN) {
  Write-Output "__AIWB_WSL_INSTALL_STATUS__permission_required"
  Write-Output "__AIWB_WSL_INSTALL_ERROR__当前 SSH 账户没有管理员权限，无法启用 WSL。"
  exit 5
}

${wslPowerShellHelpers()}

$AIWB_DISTROS = @(Get-AiwbUsableWslDistros)
if ($AIWB_DISTROS.Count -gt 0) {
  $AIWB_PREFERRED_DISTRO = ${psQuote(preferredWslDistro)}
  if ($AIWB_PREFERRED_DISTRO -and ($AIWB_DISTROS -contains $AIWB_PREFERRED_DISTRO)) {
    $AIWB_DISTRO = $AIWB_PREFERRED_DISTRO
  } else {
    $AIWB_DISTRO = [string]$AIWB_DISTROS[0]
  }
  try {
    $AIWB_PROBE = Invoke-AiwbWslBash -Distro $AIWB_DISTRO -ScriptBase64 ${psQuote(wslProbeScript)}
    if ($AIWB_PROBE.ExitCode -eq 0 -and $AIWB_PROBE.Output -match "AIWB_WSL_READY") {
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

$AIWB_DISTROS = @(Get-AiwbUsableWslDistros)
if ($AIWB_DISTROS.Count -gt 0) {
  $AIWB_DISTRO = if ($AIWB_DISTROS -contains "Ubuntu") { "Ubuntu" } else { [string]$AIWB_DISTROS[0] }
  try {
    $AIWB_PROBE = Invoke-AiwbWslBash -Distro $AIWB_DISTRO -ScriptBase64 ${psQuote(wslProbeScript)}
    if ($AIWB_PROBE.ExitCode -eq 0 -and $AIWB_PROBE.Output -match "AIWB_WSL_READY") {
      Write-Output "__AIWB_WSL_INSTALL_STATUS__ready"
      Write-Output ("__AIWB_WSL_DEFAULT_DISTRO__" + $AIWB_DISTRO)
      exit 0
    }
  } catch {}
}

Write-Output "__AIWB_WSL_INSTALL_STATUS__restart_required"
Write-Output "__AIWB_WSL_DEFAULT_DISTRO__Ubuntu"
exit 0
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
function Assert-AiwbGitSucceeded([string]$Action, [int]$ExitCode) {
  if ($ExitCode -ne 0) {
    $AIWB_EXIT_CODE = $ExitCode
    if (-not $AIWB_EXIT_CODE) { $AIWB_EXIT_CODE = 4 }
    Write-Output ("__AIWB_GIT_OPERATION_ERROR__" + $Action + "失败，Git 退出码：" + $AIWB_EXIT_CODE)
    exit $AIWB_EXIT_CODE
  }
}

$AIWB_PARENT = Split-Path -Parent $AIWB_TARGET
if ($AIWB_PARENT -and -not (Test-Path -LiteralPath $AIWB_PARENT)) {
  New-Item -ItemType Directory -Force -Path $AIWB_PARENT | Out-Null
}

$AIWB_TARGET_IS_REPO = Test-Path -LiteralPath (Join-Path $AIWB_TARGET ".git") -PathType Container
if ((Test-Path -LiteralPath $AIWB_TARGET) -and -not $AIWB_TARGET_IS_REPO) {
  $AIWB_TARGET_CHILDREN = @(Get-ChildItem -LiteralPath $AIWB_TARGET -Force -ErrorAction SilentlyContinue)
  if ($AIWB_TARGET_CHILDREN.Count -gt 0) {
    $AIWB_REPO_LEAF = (($AIWB_REPO -replace '\\\\', '/').TrimEnd('/') -split '/')[-1]
    $AIWB_REPO_NAME = [System.IO.Path]::GetFileNameWithoutExtension($AIWB_REPO_LEAF)
    if (-not $AIWB_REPO_NAME) {
      Write-Output "__AIWB_GIT_OPERATION_ERROR__无法从仓库地址识别目录名称，请填写一个新的完整保存目录。"
      exit 3
    }
    $AIWB_TARGET = Join-Path $AIWB_TARGET $AIWB_REPO_NAME
  }
}

if (Test-Path -LiteralPath (Join-Path $AIWB_TARGET ".git") -PathType Container) {
  Set-Location -LiteralPath $AIWB_TARGET
  git fetch --all --prune
  $AIWB_GIT_EXIT_CODE = $LASTEXITCODE
  Assert-AiwbGitSucceeded "获取远端仓库" $AIWB_GIT_EXIT_CODE
  if ($AIWB_BRANCH) {
    git checkout $AIWB_BRANCH
    $AIWB_GIT_EXIT_CODE = $LASTEXITCODE
    Assert-AiwbGitSucceeded "切换分支" $AIWB_GIT_EXIT_CODE
  }
  git pull --ff-only
  $AIWB_GIT_EXIT_CODE = $LASTEXITCODE
  Assert-AiwbGitSucceeded "更新仓库" $AIWB_GIT_EXIT_CODE
  Write-Output "__AIWB_GIT_OPERATION_STATUS__updated"
} elseif (Test-Path -LiteralPath $AIWB_TARGET) {
  $AIWB_CHILDREN = @(Get-ChildItem -LiteralPath $AIWB_TARGET -Force -ErrorAction SilentlyContinue)
  if ($AIWB_CHILDREN.Count -gt 0) {
    Write-Output ("__AIWB_GIT_OPERATION_ERROR__保存位置已存在同名目录且里面有文件：" + $AIWB_TARGET + "。请选择其他目录，或先处理这个同名目录。")
    exit 3
  }
  if ($AIWB_BRANCH) {
    git clone --branch $AIWB_BRANCH $AIWB_REPO $AIWB_TARGET
  } else {
    git clone $AIWB_REPO $AIWB_TARGET
  }
  $AIWB_GIT_EXIT_CODE = $LASTEXITCODE
  Assert-AiwbGitSucceeded "下载仓库" $AIWB_GIT_EXIT_CODE
  Write-Output "__AIWB_GIT_OPERATION_STATUS__cloned"
} else {
  if ($AIWB_BRANCH) {
    git clone --branch $AIWB_BRANCH $AIWB_REPO $AIWB_TARGET
  } else {
    git clone $AIWB_REPO $AIWB_TARGET
  }
  $AIWB_GIT_EXIT_CODE = $LASTEXITCODE
  Assert-AiwbGitSucceeded "下载仓库" $AIWB_GIT_EXIT_CODE
  Write-Output "__AIWB_GIT_OPERATION_STATUS__cloned"
}
if (-not (Test-Path -LiteralPath (Join-Path $AIWB_TARGET ".git") -PathType Container)) {
  Write-Output ("__AIWB_GIT_OPERATION_ERROR__Git 命令已经结束，但保存目录中没有找到仓库：" + $AIWB_TARGET)
  exit 5
}
Write-Output "__AIWB_GIT_OPERATION_VERIFIED__1"
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

if [ -e "$AIWB_TARGET" ] && [ ! -d "$AIWB_TARGET/.git" ] && [ "$(find "$AIWB_TARGET" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)" ]; then
  AIWB_REPO_LEAF=$(basename "\${AIWB_REPO%/}")
  AIWB_REPO_NAME=\${AIWB_REPO_LEAF%.git}
  if [ -z "$AIWB_REPO_NAME" ]; then
    printf '__AIWB_GIT_OPERATION_ERROR__无法从仓库地址识别目录名称，请填写一个新的完整保存目录。\\n'
    exit 3
  fi
  AIWB_TARGET="$AIWB_TARGET/$AIWB_REPO_NAME"
fi

if [ -d "$AIWB_TARGET/.git" ]; then
  cd "$AIWB_TARGET"
  git fetch --all --prune
  if [ -n "$AIWB_BRANCH" ]; then
    git checkout "$AIWB_BRANCH"
  fi
  git pull --ff-only
  printf '__AIWB_GIT_OPERATION_STATUS__updated\\n'
elif [ -e "$AIWB_TARGET" ] && [ "$(find "$AIWB_TARGET" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)" ]; then
  printf '__AIWB_GIT_OPERATION_ERROR__保存位置已存在同名目录且里面有文件：%s。请选择其他目录，或先处理这个同名目录。\\n' "$AIWB_TARGET"
  exit 3
else
  if [ -n "$AIWB_BRANCH" ]; then
    git clone --branch "$AIWB_BRANCH" "$AIWB_REPO" "$AIWB_TARGET"
  else
    git clone "$AIWB_REPO" "$AIWB_TARGET"
  fi
  printf '__AIWB_GIT_OPERATION_STATUS__cloned\\n'
fi
if [ ! -d "$AIWB_TARGET/.git" ]; then
  printf '__AIWB_GIT_OPERATION_ERROR__Git 命令已经结束，但保存目录中没有找到仓库：%s\\n' "$AIWB_TARGET"
  exit 5
fi
printf '__AIWB_GIT_OPERATION_VERIFIED__1\\n'
printf '__AIWB_GIT_OPERATION_TARGET__%s\\n' "$AIWB_TARGET"
printf '__AIWB_GIT_OPERATION_REPO__%s\\n' "$AIWB_REPO"
`);
}

export function buildGitSshKeyCommand(profile, options = {}) {
  const generate = options.generate === true;

  if (isWindowsProfile(profile)) {
    return powershellStdinCommand(`
$AIWB_GENERATE = ${generate ? "$true" : "$false"}
$AIWB_USER_HOME = [Environment]::GetFolderPath("UserProfile")
if (-not $AIWB_USER_HOME) { $AIWB_USER_HOME = $HOME }
$AIWB_SSH_DIR = Join-Path $AIWB_USER_HOME ".ssh"
$AIWB_KEY_PATH = Join-Path $AIWB_SSH_DIR "id_ed25519"
$AIWB_PUBLIC_KEY_PATH = $AIWB_KEY_PATH + ".pub"
$AIWB_EXISTING_PUBLIC_KEYS = @(
  (Join-Path $AIWB_SSH_DIR "id_ed25519.pub"),
  (Join-Path $AIWB_SSH_DIR "id_rsa.pub"),
  (Join-Path $AIWB_SSH_DIR "id_ecdsa.pub")
)
$AIWB_PUBLIC_KEY_PATH = $AIWB_EXISTING_PUBLIC_KEYS |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1

if (-not $AIWB_PUBLIC_KEY_PATH -and $AIWB_GENERATE) {
  $AIWB_SSH_KEYGEN = Get-Command ssh-keygen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $AIWB_SSH_KEYGEN) {
    Write-Output "__AIWB_GIT_SSH_KEY_ERROR__远端没有找到 ssh-keygen，无法生成 SSH Key。"
    exit 2
  }
  New-Item -ItemType Directory -Force -Path $AIWB_SSH_DIR | Out-Null
  $AIWB_COMMENT = "ai-workbench@" + $env:COMPUTERNAME
  & $AIWB_SSH_KEYGEN.Source -t ed25519 -C $AIWB_COMMENT -N '""' -f $AIWB_KEY_PATH
  $AIWB_KEYGEN_EXIT_CODE = $LASTEXITCODE
  if ($AIWB_KEYGEN_EXIT_CODE -ne 0) {
    Write-Output ("__AIWB_GIT_SSH_KEY_ERROR__生成 SSH Key 失败，ssh-keygen 退出码：" + $AIWB_KEYGEN_EXIT_CODE)
    exit $AIWB_KEYGEN_EXIT_CODE
  }
  $AIWB_PUBLIC_KEY_PATH = $AIWB_KEY_PATH + ".pub"
}

if (-not $AIWB_PUBLIC_KEY_PATH) {
  Write-Output "__AIWB_GIT_SSH_KEY_STATUS__missing"
  exit 0
}

$AIWB_PUBLIC_KEY = (Get-Content -LiteralPath $AIWB_PUBLIC_KEY_PATH -Raw -ErrorAction SilentlyContinue).Trim()
if (-not $AIWB_PUBLIC_KEY) {
  Write-Output "__AIWB_GIT_SSH_KEY_ERROR__找到了公钥文件，但内容为空。"
  exit 3
}
$AIWB_FINGERPRINT = ""
$AIWB_SSH_KEYGEN = Get-Command ssh-keygen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($AIWB_SSH_KEYGEN) {
  $AIWB_FINGERPRINT = (& $AIWB_SSH_KEYGEN.Source -lf $AIWB_PUBLIC_KEY_PATH 2>$null | Out-String).Trim()
}
Write-Output "__AIWB_GIT_SSH_KEY_STATUS__ready"
Write-Output ("__AIWB_GIT_SSH_KEY_PUBLIC_KEY__" + $AIWB_PUBLIC_KEY)
Write-Output ("__AIWB_GIT_SSH_KEY_PATH__" + $AIWB_PUBLIC_KEY_PATH)
Write-Output ("__AIWB_GIT_SSH_KEY_FINGERPRINT__" + $AIWB_FINGERPRINT)
`);
  }

  return remoteBashCommand(profile, `
AIWB_GENERATE=${generate ? "1" : "0"}
AIWB_SSH_DIR="\${HOME}/.ssh"
AIWB_KEY_PATH="\${AIWB_SSH_DIR}/id_ed25519"
AIWB_PUBLIC_KEY_PATH=""
for AIWB_CANDIDATE in "\${AIWB_SSH_DIR}/id_ed25519.pub" "\${AIWB_SSH_DIR}/id_rsa.pub" "\${AIWB_SSH_DIR}/id_ecdsa.pub"; do
  if [ -f "$AIWB_CANDIDATE" ]; then
    AIWB_PUBLIC_KEY_PATH="$AIWB_CANDIDATE"
    break
  fi
done

if [ -z "$AIWB_PUBLIC_KEY_PATH" ] && [ "$AIWB_GENERATE" = "1" ]; then
  if ! command -v ssh-keygen >/dev/null 2>&1; then
    printf '__AIWB_GIT_SSH_KEY_ERROR__远端没有找到 ssh-keygen，无法生成 SSH Key。\\n'
    exit 2
  fi
  mkdir -p "$AIWB_SSH_DIR"
  chmod 700 "$AIWB_SSH_DIR" 2>/dev/null || true
  ssh-keygen -t ed25519 -C "ai-workbench@$(hostname)" -N "" -f "$AIWB_KEY_PATH"
  AIWB_KEYGEN_EXIT_CODE=$?
  if [ "$AIWB_KEYGEN_EXIT_CODE" -ne 0 ]; then
    printf '__AIWB_GIT_SSH_KEY_ERROR__生成 SSH Key 失败，ssh-keygen 退出码：%s\\n' "$AIWB_KEYGEN_EXIT_CODE"
    exit "$AIWB_KEYGEN_EXIT_CODE"
  fi
  AIWB_PUBLIC_KEY_PATH="$AIWB_KEY_PATH.pub"
fi

if [ -z "$AIWB_PUBLIC_KEY_PATH" ]; then
  printf '__AIWB_GIT_SSH_KEY_STATUS__missing\\n'
  exit 0
fi

AIWB_PUBLIC_KEY=$(tr -d '\\r\\n' < "$AIWB_PUBLIC_KEY_PATH")
if [ -z "$AIWB_PUBLIC_KEY" ]; then
  printf '__AIWB_GIT_SSH_KEY_ERROR__找到了公钥文件，但内容为空。\\n'
  exit 3
fi
AIWB_FINGERPRINT=""
if command -v ssh-keygen >/dev/null 2>&1; then
  AIWB_FINGERPRINT=$(ssh-keygen -lf "$AIWB_PUBLIC_KEY_PATH" 2>/dev/null || true)
fi
printf '__AIWB_GIT_SSH_KEY_STATUS__ready\\n'
printf '__AIWB_GIT_SSH_KEY_PUBLIC_KEY__%s\\n' "$AIWB_PUBLIC_KEY"
printf '__AIWB_GIT_SSH_KEY_PATH__%s\\n' "$AIWB_PUBLIC_KEY_PATH"
printf '__AIWB_GIT_SSH_KEY_FINGERPRINT__%s\\n' "$AIWB_FINGERPRINT"
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
  const executionSummary =
    text.match(
      /__AIWB_AGENT_TASK_EXECUTION_SUMMARY_START__\r?\n([\s\S]*?)\r?\n__AIWB_AGENT_TASK_EXECUTION_SUMMARY_END__/,
    )?.[1] || "";
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
    codexAvailable: marker("CODEX_AVAILABLE"),
    codexPath: marker("CODEX_PATH"),
    codexExecutable: marker("CODEX_EXECUTABLE"),
    claudeAvailable: marker("CLAUDE_AVAILABLE"),
    claudePath: marker("CLAUDE_PATH"),
    claudeExecutable: marker("CLAUDE_EXECUTABLE"),
    codexCliStatus: marker("CODEX_CLI_STATUS"),
    codexCliPath: marker("CODEX_CLI_PATH"),
    codexCliError: marker("CODEX_CLI_ERROR"),
    cliId: marker("CLI_ID"),
    cliStatus: marker("CLI_STATUS"),
    cliPath: marker("CLI_PATH"),
    cliError: marker("CLI_ERROR"),
    taskId: marker("TASK_ID"),
    conversationId: marker("TASK_CONVERSATION_ID"),
    turnId: marker("TASK_TURN_ID"),
    requestMessageId: marker("TASK_REQUEST_MESSAGE_ID"),
    responseMessageId: marker("TASK_RESPONSE_MESSAGE_ID"),
    taskStatus: marker("TASK_STATUS"),
    exitCode: marker("TASK_EXIT_CODE"),
    pid: marker("TASK_PID"),
    attempts: marker("TASK_ATTEMPTS"),
    startedAt: marker("TASK_STARTED_AT"),
    runnerStartedAt: marker("TASK_RUNNER_STARTED_AT"),
    finishedAt: marker("TASK_FINISHED_AT"),
    eventFingerprint: marker("EVENT_FINGERPRINT"),
    error: marker("ERROR"),
    blockedByTaskId: marker("BLOCKED_BY_TASK_ID"),
    blockedByConversationId: marker("BLOCKED_BY_CONVERSATION_ID"),
    output: taskOutput.trim(),
    executionSummary: executionSummary.trim(),
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

export function latestWorkbenchAgentConversationTask(conversation, fallbackAgentId = "codex") {
  if (!conversation?.id) return null;
  const taskId = String(conversation.taskId || "").trim();
  const history = Array.isArray(conversation.history) ? conversation.history : [];
  const latestHistoryTask =
    history.find((entry) => taskId && String(entry?.taskId || "").trim() === taskId) ||
    history.find((entry) => entry?.taskId) ||
    null;
  if (latestHistoryTask) return latestHistoryTask;
  if (!taskId) return null;
  return {
    taskId,
    status: conversation.status,
    agentId: conversation.agentId || fallbackAgentId,
    startedAt: conversation.startedAt,
    finishedAt: conversation.finishedAt,
    exitCode: conversation.exitCode,
    lastPrompt: conversation.lastPrompt,
    lastResult: conversation.lastResult,
    mtime: conversation.mtime,
  };
}

export function parseWorkbenchAgentConversations(output) {
  // Native SSH clients commonly return CRLF even when the remote host is
  // Linux. Normalize once so the block protocol behaves identically on Mac,
  // iOS, Android and the shell-based development transport.
  const text = String(output || "").replace(/\r\n?/g, "\n");
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
            turnId: itemMarker("TURN_ID"),
            requestMessageId: itemMarker("REQUEST_MESSAGE_ID"),
            responseMessageId: itemMarker("RESPONSE_MESSAGE_ID"),
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
    agent_codex_available: parsed.codexAvailable || "",
    agent_codex_path: parsed.codexPath || "",
    agent_codex_executable: parsed.codexExecutable || "",
    agent_claude_available: parsed.claudeAvailable || "",
    agent_claude_path: parsed.claudePath || "",
    agent_claude_executable: parsed.claudeExecutable || "",
    agent_codex_cli_status: parsed.codexCliStatus || "",
    agent_codex_cli_path: parsed.codexCliPath || "",
    agent_codex_cli_error: parsed.codexCliError || "",
  };
  if (parsed.cliId === "codex") {
    health.agent_codex_available = parsed.cliStatus === "ready" ? "1" : parsed.cliStatus === "failed" ? "0" : health.agent_codex_available;
    health.agent_codex_path = parsed.cliPath || health.agent_codex_path || "";
    health.agent_codex_cli_status = parsed.cliStatus || health.agent_codex_cli_status || "";
    health.agent_codex_cli_error = parsed.cliError || health.agent_codex_cli_error || "";
  }
  if (parsed.cliId === "claude") {
    health.agent_claude_available = parsed.cliStatus === "ready" ? "1" : parsed.cliStatus === "failed" ? "0" : health.agent_claude_available;
    health.agent_claude_path = parsed.cliPath || health.agent_claude_path || "";
    health.agent_claude_cli_status = parsed.cliStatus || "";
    health.agent_claude_cli_error = parsed.cliError || "";
  }
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
